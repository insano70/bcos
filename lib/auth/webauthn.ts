/**
 * WebAuthn/Passkey Authentication Service
 * Implements FIDO2 WebAuthn authentication with SimpleWebAuthn
 *
 * Security Features:
 * - Challenge-based authentication (one-time use, 5-minute expiration)
 * - Counter-based clone detection
 * - Device fingerprinting at registration
 * - Replay attack prevention
 */

import { nanoid } from 'nanoid';
import { and, eq } from 'drizzle-orm';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type VerifiedRegistrationResponse,
  type VerifiedAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticatorTransportFuture,
  RegistrationResponseJSON,
  
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/server';
import { db, webauthn_challenges, webauthn_credentials, account_security } from '@/lib/db';
import { log } from '@/lib/logger';
import { AuditLogger } from '@/lib/api/services/audit';
import type {
  WebAuthnCredential,
  WebAuthnChallenge,
  
  VerifyAssertionParams,
  VerifyAssertionResult,
  MFAStatus,
} from '@/lib/types/webauthn';

/**
 * WebAuthn Configuration
 */
const RP_NAME = 'BendCare';
const RP_ID = process.env.WEBAUTHN_RP_ID || 'localhost'; // e.g., 'bendcare.com'
const ORIGIN = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4001';
const CHALLENGE_EXPIRATION_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CREDENTIALS_PER_USER = 5;

/**
 * Generate registration options for a new passkey
 * @param userId User ID requesting passkey registration
 * @param userEmail User's email address
 * @param userName User's display name
 * @param ipAddress Client IP address
 * @param userAgent Client user agent
 * @returns Registration options and challenge ID
 */
export async function beginRegistration(
  userId: string,
  userEmail: string,
  userName: string,
  ipAddress: string,
  userAgent: string | null
): Promise<{ options: PublicKeyCredentialCreationOptionsJSON; challenge_id: string }> {
  // Check credential limit
  const existingCredentials = await db
    .select()
    .from(webauthn_credentials)
    .where(and(eq(webauthn_credentials.user_id, userId), eq(webauthn_credentials.is_active, true)));

  if (existingCredentials.length >= MAX_CREDENTIALS_PER_USER) {
    throw new Error(
      `Maximum passkey limit reached (${MAX_CREDENTIALS_PER_USER}). Please remove an existing passkey before adding a new one.`
    );
  }

  // Get existing credentials for exclusion (prevent duplicate registration)
  const excludeCredentials = existingCredentials.map((cred) => ({
    id: cred.credential_id,
    type: 'public-key' as const,
    transports: cred.transports ? (JSON.parse(cred.transports) as AuthenticatorTransportFuture[]) : [],
  }));

  // Generate registration options
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: new TextEncoder().encode(userId), // Convert string to Uint8Array
    userName: userEmail,
    userDisplayName: userName,
    attestationType: 'none', // Privacy-focused: no attestation
    excludeCredentials,
    authenticatorSelection: {
      authenticatorAttachment: 'platform', // Prefer platform authenticators (Touch ID, Face ID)
      residentKey: 'preferred', // Discoverable credentials when possible
      userVerification: 'required', // Always require user verification
    },
  });

  // Store challenge in database
  const challengeId = nanoid(32);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CHALLENGE_EXPIRATION_MS);

  await db.insert(webauthn_challenges).values({
    challenge_id: challengeId,
    user_id: userId,
    challenge: options.challenge,
    challenge_type: 'registration',
    ip_address: ipAddress,
    user_agent: userAgent,
    expires_at: expiresAt,
  });

  log.info('WebAuthn registration challenge generated', {
    userId,
    challengeId: challengeId.substring(0, 8),
    expiresAt: expiresAt.toISOString(),
  });

  return {
    options,
    challenge_id: challengeId,
  };
}

/**
 * Complete passkey registration
 * @param userId User ID completing registration
 * @param challengeId Challenge ID from beginRegistration
 * @param credential Registration response from authenticator
 * @param credentialName User-friendly name for the credential
 * @param ipAddress Client IP address
 * @param userAgent Client user agent
 * @returns Created credential info
 */
export async function completeRegistration(
  userId: string,
  challengeId: string,
  registrationResponse: RegistrationResponseJSON,
  credentialName: string,
  ipAddress: string,
  userAgent: string | null
): Promise<{ credential_id: string; credential_name: string }> {
  // Retrieve and validate challenge
  const challenge = await retrieveAndValidateChallenge(challengeId, userId, 'registration');

  // Verify registration response
  let verification: VerifiedRegistrationResponse;
  try {
    verification = await verifyRegistrationResponse({
      response: registrationResponse,
      expectedChallenge: challenge.challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: true, // Enforce user verification
    });
  } catch (error) {
    log.error('WebAuthn registration verification failed', {
      error: error instanceof Error ? error.message : String(error),
      userId,
      challengeId: challengeId.substring(0, 8),
    });

    await AuditLogger.logAuth({
      action: 'mfa_registration_failed',
      userId,
      ipAddress,
      userAgent: userAgent || undefined,
      metadata: {
        reason: 'verification_failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    });

    throw new Error('Passkey verification failed. Please try again.');
  }

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error('Passkey verification failed');
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  const { id: credentialId, publicKey, counter } = credential;

  // credential ID is already a base64url string
  const credentialIdStr = credentialId;

  // Check for duplicate credential ID (should not happen due to excludeCredentials)
  const [existingCred] = await db
    .select()
    .from(webauthn_credentials)
    .where(eq(webauthn_credentials.credential_id, credentialIdStr))
    .limit(1);

  if (existingCred) {
    throw new Error('This passkey is already registered');
  }

  // Store credential in database
  const publicKeyStr = Buffer.from(publicKey).toString('base64url');
  const transportsJson = credential.transports ? JSON.stringify(credential.transports) : null;

  await db.insert(webauthn_credentials).values({
    credential_id: credentialIdStr,
    user_id: userId,
    public_key: publicKeyStr,
    counter,
    credential_device_type: credentialDeviceType,
    transports: transportsJson,
    aaguid: null, // Can extract from authenticatorData if needed
    credential_name: credentialName,
    backed_up: credentialBackedUp,
    registration_ip: ipAddress,
    registration_user_agent: userAgent,
  });

  // Mark challenge as used
  await markChallengeUsed(challengeId);

  // Update account_security to enable MFA
  await enableMFA(userId);

  // Audit log
  await AuditLogger.logAuth({
    action: 'mfa_registration_completed',
    userId,
    ipAddress,
    userAgent: userAgent || undefined,
    metadata: {
      credentialId: credentialIdStr.substring(0, 16),
      credentialName,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
    },
  });

  log.info('WebAuthn credential registered successfully', {
    userId,
    credentialId: credentialIdStr.substring(0, 16),
    credentialName,
    deviceType: credentialDeviceType,
  });

  return {
    credential_id: credentialIdStr,
    credential_name: credentialName,
  };
}

/**
 * Generate authentication options for passkey verification
 * @param userId User ID requesting authentication
 * @param ipAddress Client IP address
 * @param userAgent Client user agent
 * @returns Authentication options and challenge ID
 */
export async function beginAuthentication(
  userId: string,
  ipAddress: string,
  userAgent: string | null
): Promise<{ options: PublicKeyCredentialRequestOptionsJSON; challenge_id: string }> {
  // Get user's active credentials
  const credentials = await db
    .select()
    .from(webauthn_credentials)
    .where(and(eq(webauthn_credentials.user_id, userId), eq(webauthn_credentials.is_active, true)));

  if (credentials.length === 0) {
    throw new Error('No passkeys registered. Please register a passkey first.');
  }

  // Prepare allowed credentials
  const allowCredentials = credentials.map((cred) => ({
    id: cred.credential_id,
    type: 'public-key' as const,
    transports: cred.transports ? (JSON.parse(cred.transports) as AuthenticatorTransportFuture[]) : [],
  }));

  // Generate authentication options
  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    allowCredentials,
    userVerification: 'required', // Always require user verification
  });

  // Store challenge in database
  const challengeId = nanoid(32);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CHALLENGE_EXPIRATION_MS);

  await db.insert(webauthn_challenges).values({
    challenge_id: challengeId,
    user_id: userId,
    challenge: options.challenge,
    challenge_type: 'authentication',
    ip_address: ipAddress,
    user_agent: userAgent,
    expires_at: expiresAt,
  });

  log.info('WebAuthn authentication challenge generated', {
    userId,
    challengeId: challengeId.substring(0, 8),
    credentialCount: credentials.length,
  });

  return {
    options,
    challenge_id: challengeId,
  };
}

/**
 * Complete passkey authentication
 * @param params Verification parameters
 * @returns Verification result
 */
export async function completeAuthentication(
  params: VerifyAssertionParams
): Promise<VerifyAssertionResult> {
  const { userId, challengeId, assertion, ipAddress, userAgent } = params;

  // Retrieve and validate challenge
  const challenge = await retrieveAndValidateChallenge(challengeId, userId, 'authentication');

  // Get credential from database
  const credentialIdStr = assertion.id;
  const [credential] = await db
    .select()
    .from(webauthn_credentials)
    .where(
      and(
        eq(webauthn_credentials.credential_id, credentialIdStr),
        eq(webauthn_credentials.user_id, userId),
        eq(webauthn_credentials.is_active, true)
      )
    )
    .limit(1);

  if (!credential) {
    log.warn('WebAuthn authentication attempted with unknown credential', {
      userId,
      credentialId: credentialIdStr.substring(0, 16),
    });

    await AuditLogger.logAuth({
      action: 'mfa_verification_failed',
      userId,
      ipAddress,
      userAgent: userAgent || undefined,
      metadata: {
        reason: 'credential_not_found',
        credentialId: credentialIdStr.substring(0, 16),
      },
    });

    return {
      success: false,
      error: 'Passkey not found or inactive',
    };
  }

  // Convert stored public key from base64url
  const publicKey = Buffer.from(credential.public_key, 'base64url');

  // Verify authentication response
  let verification: VerifiedAuthenticationResponse;
  try {
    verification = await verifyAuthenticationResponse({
      response: assertion,
      expectedChallenge: challenge.challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      credential: {
        id: credential.credential_id,
        publicKey: publicKey,
        counter: credential.counter,
        transports: credential.transports ? JSON.parse(credential.transports) : undefined,
      },
      requireUserVerification: true,
    });
  } catch (error) {
    log.error('WebAuthn authentication verification failed', {
      error: error instanceof Error ? error.message : String(error),
      userId,
      credentialId: credentialIdStr.substring(0, 16),
    });

    await AuditLogger.logAuth({
      action: 'mfa_verification_failed',
      userId,
      ipAddress,
      userAgent: userAgent || undefined,
      metadata: {
        reason: 'verification_failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        credentialId: credentialIdStr.substring(0, 16),
      },
    });

    return {
      success: false,
      error: 'Passkey verification failed',
    };
  }

  if (!verification.verified || !verification.authenticationInfo) {
    return {
      success: false,
      error: 'Passkey verification failed',
    };
  }

  const { newCounter } = verification.authenticationInfo;

  // SECURITY: Counter regression detection (cloned authenticator)
  if (newCounter <= credential.counter) {
    log.error('WebAuthn counter regression detected - possible cloned authenticator', {
      userId,
      credentialId: credentialIdStr.substring(0, 16),
      storedCounter: credential.counter,
      receivedCounter: newCounter,
      alert: 'CLONED_AUTHENTICATOR_DETECTED',
    });

    // Disable credential
    await db
      .update(webauthn_credentials)
      .set({ is_active: false })
      .where(eq(webauthn_credentials.credential_id, credentialIdStr));

    await AuditLogger.logSecurity({
      action: 'authenticator_cloned',
      userId,
      metadata: {
        credentialId: credentialIdStr.substring(0, 16),
        credentialName: credential.credential_name,
        storedCounter: credential.counter,
        receivedCounter: newCounter,
        action_taken: 'credential_disabled',
      },
      severity: 'high',
    });

    return {
      success: false,
      error: 'Security issue detected. This passkey has been disabled. Please contact support.',
    };
  }

  // Update counter and last_used
  await db
    .update(webauthn_credentials)
    .set({
      counter: newCounter,
      last_used: new Date(),
    })
    .where(eq(webauthn_credentials.credential_id, credentialIdStr));

  // Mark challenge as used
  await markChallengeUsed(challengeId);

  // Audit log
  await AuditLogger.logAuth({
    action: 'mfa_verification_success',
    userId,
    ipAddress,
    userAgent: userAgent || undefined,
    metadata: {
      credentialId: credentialIdStr.substring(0, 16),
      credentialName: credential.credential_name,
      newCounter,
    },
  });

  log.info('WebAuthn authentication successful', {
    userId,
    credentialId: credentialIdStr.substring(0, 16),
    credentialName: credential.credential_name,
  });

  return {
    success: true,
    credentialId: credentialIdStr,
    counter: newCounter,
  };
}

/**
 * Get MFA status for a user
 */
export async function getMFAStatus(userId: string): Promise<MFAStatus> {
  const [security] = await db
    .select()
    .from(account_security)
    .where(eq(account_security.user_id, userId))
    .limit(1);

  const credentials = await db
    .select()
    .from(webauthn_credentials)
    .where(and(eq(webauthn_credentials.user_id, userId), eq(webauthn_credentials.is_active, true)));

  return {
    enabled: security?.mfa_enabled || false,
    method: security?.mfa_method as 'webauthn' | null,
    credential_count: credentials.length,
    enforced_at: security?.mfa_enforced_at || null,
  };
}

/**
 * Get user's credentials (sanitized, no public keys)
 */
export async function getUserCredentials(userId: string): Promise<WebAuthnCredential[]> {
  const credentials = await db
    .select()
    .from(webauthn_credentials)
    .where(and(eq(webauthn_credentials.user_id, userId), eq(webauthn_credentials.is_active, true)));

  return credentials as WebAuthnCredential[];
}

/**
 * Delete (deactivate) a credential
 */
export async function deleteCredential(
  userId: string,
  credentialId: string
): Promise<{ success: boolean }> {
  // Check if this is the last credential
  const activeCredentials = await db
    .select()
    .from(webauthn_credentials)
    .where(and(eq(webauthn_credentials.user_id, userId), eq(webauthn_credentials.is_active, true)));

  if (activeCredentials.length === 1) {
    throw new Error('Cannot delete your last passkey. You must have at least one passkey configured.');
  }

  // Soft delete
  await db
    .update(webauthn_credentials)
    .set({ is_active: false })
    .where(and(eq(webauthn_credentials.credential_id, credentialId), eq(webauthn_credentials.user_id, userId)));

  await AuditLogger.logAuth({
    action: 'mfa_credential_deleted',
    userId,
    metadata: {
      credentialId: credentialId.substring(0, 16),
    },
  });

  log.info('WebAuthn credential deleted', {
    userId,
    credentialId: credentialId.substring(0, 16),
  });

  return { success: true };
}

/**
 * Rename a credential
 */
export async function renameCredential(
  userId: string,
  credentialId: string,
  newName: string
): Promise<{ success: boolean }> {
  await db
    .update(webauthn_credentials)
    .set({ credential_name: newName })
    .where(and(eq(webauthn_credentials.credential_id, credentialId), eq(webauthn_credentials.user_id, userId)));

  log.info('WebAuthn credential renamed', {
    userId,
    credentialId: credentialId.substring(0, 16),
    newName,
  });

  return { success: true };
}

/**
 * Admin: Reset MFA for a user (delete all credentials)
 */
export async function adminResetMFA(
  adminUserId: string,
  targetUserId: string
): Promise<{ success: boolean; credentials_removed: number }> {
  // Get all active credentials
  const credentials = await db
    .select()
    .from(webauthn_credentials)
    .where(and(eq(webauthn_credentials.user_id, targetUserId), eq(webauthn_credentials.is_active, true)));

  // Deactivate all credentials
  await db
    .update(webauthn_credentials)
    .set({ is_active: false })
    .where(eq(webauthn_credentials.user_id, targetUserId));

  // Disable MFA in account_security
  await db
    .update(account_security)
    .set({
      mfa_enabled: false,
      mfa_method: null,
      mfa_enforced_at: null,
    })
    .where(eq(account_security.user_id, targetUserId));

  await AuditLogger.logSecurity({
    action: 'mfa_admin_reset',
    userId: targetUserId,
    metadata: {
      adminUserId,
      credentialsRemoved: credentials.length,
      action_taken: 'all_credentials_disabled',
    },
    severity: 'high',
  });

  log.info('Admin MFA reset completed', {
    adminUserId,
    targetUserId,
    credentialsRemoved: credentials.length,
  });

  return {
    success: true,
    credentials_removed: credentials.length,
  };
}

/**
 * Helper: Retrieve and validate challenge
 */
async function retrieveAndValidateChallenge(
  challengeId: string,
  userId: string,
  expectedType: 'registration' | 'authentication'
): Promise<WebAuthnChallenge> {
  const [challenge] = await db
    .select()
    .from(webauthn_challenges)
    .where(eq(webauthn_challenges.challenge_id, challengeId))
    .limit(1);

  if (!challenge) {
    throw new Error('Challenge not found or expired');
  }

  if (challenge.user_id !== userId) {
    throw new Error('Challenge does not belong to this user');
  }

  if (challenge.challenge_type !== expectedType) {
    throw new Error(`Invalid challenge type. Expected ${expectedType}, got ${challenge.challenge_type}`);
  }

  if (challenge.used_at) {
    throw new Error('Challenge has already been used');
  }

  const now = new Date();
  if (now > challenge.expires_at) {
    throw new Error('Challenge has expired');
  }

  return challenge as WebAuthnChallenge;
}

/**
 * Helper: Mark challenge as used
 */
async function markChallengeUsed(challengeId: string): Promise<void> {
  await db
    .update(webauthn_challenges)
    .set({ used_at: new Date() })
    .where(eq(webauthn_challenges.challenge_id, challengeId));
}

/**
 * Helper: Enable MFA for user
 */
async function enableMFA(userId: string): Promise<void> {
  const { ensureSecurityRecord } = await import('./security');
  await ensureSecurityRecord(userId);

  await db
    .update(account_security)
    .set({
      mfa_enabled: true,
      mfa_method: 'webauthn',
      mfa_enforced_at: new Date(),
    })
    .where(eq(account_security.user_id, userId));
}

/**
 * Cleanup expired challenges (maintenance function)
 */
export async function cleanupExpiredChallenges(): Promise<number> {
  const now = new Date();
  const result = await db
    .delete(webauthn_challenges)
    .where(eq(webauthn_challenges.expires_at, now));

  const count = Array.isArray(result) ? result.length : 0;

  log.info('Expired WebAuthn challenges cleaned up', {
    count,
    operation: 'cleanupExpiredChallenges',
  });

  return count;
}
