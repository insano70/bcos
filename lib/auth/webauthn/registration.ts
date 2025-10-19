/**
 * WebAuthn Registration Flow
 * Handles complete passkey registration process
 *
 * Flow:
 * 1. beginRegistration() - Generate registration challenge
 * 2. [Client performs WebAuthn ceremony]
 * 3. completeRegistration() - Verify and store credential
 * 4. getMFAStatus() - Check MFA enablement
 */

import type {
  AuthenticatorTransportFuture,
  PublicKeyCredentialCreationOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import {
  generateRegistrationOptions,
  type VerifiedRegistrationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { and, eq } from 'drizzle-orm';
import { AuditLogger } from '@/lib/api/services/audit';
import { account_security, db, webauthn_credentials } from '@/lib/db';
import { log } from '@/lib/logger';
import type { MFAStatus } from '@/lib/types/webauthn';
import { createChallenge, validateChallenge, markChallengeUsed } from './challenge-manager';
import { RP_NAME, RP_ID, ORIGIN, AUTHENTICATOR_SELECTION, ATTESTATION_TYPE } from './constants';
import { enforceCredentialLimit, ensureUniqueCredential } from './security-validator';
import { validateRPID, validateCredentialName } from './validation';

/**
 * Begin passkey registration
 * Generates WebAuthn registration challenge and stores it
 *
 * @param userId - User ID requesting registration
 * @param userEmail - User's email address
 * @param userName - User's display name
 * @param ipAddress - Client IP address
 * @param userAgent - Client user agent
 * @returns Registration options and challenge ID
 */
export async function beginRegistration(
  userId: string,
  userEmail: string,
  userName: string,
  ipAddress: string,
  userAgent: string | null
): Promise<{ options: PublicKeyCredentialCreationOptionsJSON; challenge_id: string }> {
  // Check credential limit using security validator
  await enforceCredentialLimit(userId);

  // Get existing credentials for exclusion (prevent duplicate registration)
  const existingCredentials = await db
    .select()
    .from(webauthn_credentials)
    .where(and(
      eq(webauthn_credentials.user_id, userId),
      eq(webauthn_credentials.is_active, true)
    ));

  const excludeCredentials = existingCredentials.map((cred) => ({
    id: cred.credential_id,
    type: 'public-key' as const,
    transports: cred.transports
      ? (JSON.parse(cred.transports) as AuthenticatorTransportFuture[])
      : [],
  }));

  // Generate registration options
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: new TextEncoder().encode(userId), // Convert string to Uint8Array
    userName: userEmail,
    userDisplayName: userName,
    attestationType: ATTESTATION_TYPE,
    excludeCredentials,
    authenticatorSelection: AUTHENTICATOR_SELECTION,
  });

  // Store challenge in database using challenge manager
  const challengeId = await createChallenge(
    userId,
    'registration',
    options.challenge,
    ipAddress,
    userAgent
  );

  log.info('webauthn registration challenge generated', {
    operation: 'begin_registration',
    userId,
    challengeId: challengeId.substring(0, 8),
    component: 'auth',
  });

  return {
    options,
    challenge_id: challengeId,
  };
}

/**
 * Complete passkey registration
 * Verifies registration response and stores credential
 *
 * Security: Uses database transaction to ensure atomicity
 * - Credential insertion
 * - MFA enablement
 * All or nothing - no partial registration
 *
 * @param userId - User ID completing registration
 * @param challengeId - Challenge ID from beginRegistration
 * @param registrationResponse - Registration response from authenticator
 * @param credentialName - User-friendly name for credential
 * @param ipAddress - Client IP address
 * @param userAgent - Client user agent
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
  // SECURITY: Validate RP_ID against origin to prevent subdomain attacks
  validateRPID(RP_ID, ORIGIN);

  // Validate credential name
  validateCredentialName(credentialName);

  // Retrieve and validate challenge using challenge manager
  const challenge = await validateChallenge(challengeId, userId, 'registration');

  // Mark challenge as used immediately after validation to prevent reuse
  // This must happen BEFORE any verification attempts to prevent retry attacks
  await markChallengeUsed(challengeId);

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
    log.error('webauthn registration verification failed', error, {
      operation: 'complete_registration',
      userId,
      challengeId: challengeId.substring(0, 8),
      component: 'auth',
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

    throw new Error('Passkey verification failed');
  }

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error('Passkey verification failed');
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  const { id: credentialId, publicKey, counter } = credential;

  // credential ID is already a base64url string
  const credentialIdStr = credentialId;

  // Check for duplicate credential ID using security validator
  await ensureUniqueCredential(credentialIdStr);

  // Store credential in database with transaction boundary
  // CRITICAL: All DB operations must succeed or all must fail
  const publicKeyStr = Buffer.from(publicKey).toString('base64url');
  const transportsJson = credential.transports ? JSON.stringify(credential.transports) : null;

  try {
    // Execute all database operations in a transaction
    await db.transaction(async (tx) => {
      // Insert credential
      await tx.insert(webauthn_credentials).values({
        credential_id: credentialIdStr,
        user_id: userId,
        public_key: publicKeyStr,
        counter,
        credential_device_type: credentialDeviceType,
        transports: transportsJson,
        aaguid: null,
        credential_name: credentialName,
        backed_up: credentialBackedUp,
        registration_ip: ipAddress,
        registration_user_agent: userAgent,
      });

      // Enable MFA in account_security (challenge already marked as used above)
      const { ensureSecurityRecord } = await import('../security');
      await ensureSecurityRecord(userId);

      await tx
        .update(account_security)
        .set({
          mfa_enabled: true,
          mfa_method: 'webauthn',
          mfa_enforced_at: new Date(),
        })
        .where(eq(account_security.user_id, userId));
    });

    // Audit log (outside transaction - non-critical operation)
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

    log.info('webauthn credential registered successfully', {
      operation: 'complete_registration',
      userId,
      credentialId: credentialIdStr.substring(0, 16),
      credentialName,
      deviceType: credentialDeviceType,
      component: 'auth',
    });

    return {
      credential_id: credentialIdStr,
      credential_name: credentialName,
    };
  } catch (error) {
    log.error('webauthn registration transaction failed', error, {
      operation: 'complete_registration',
      userId,
      credentialName,
      component: 'auth',
    });
    throw new Error('Failed to complete passkey registration');
  }
}

/**
 * Get MFA status for a user
 * Returns MFA enablement status and credential count
 *
 * @param userId - User ID to check
 * @returns MFA status
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
    .where(and(
      eq(webauthn_credentials.user_id, userId),
      eq(webauthn_credentials.is_active, true)
    ));

  return {
    enabled: security?.mfa_enabled || false,
    method: security?.mfa_method as 'webauthn' | null,
    credential_count: credentials.length,
    enforced_at: security?.mfa_enforced_at || null,
  };
}
