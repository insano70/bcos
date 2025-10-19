/**
 * WebAuthn Authentication Flow
 * Handles complete passkey authentication/verification process
 *
 * Flow:
 * 1. beginAuthentication() - Generate authentication challenge
 * 2. [Client performs WebAuthn ceremony]
 * 3. completeAuthentication() - Verify assertion and update counter
 *
 * Security Features:
 * - Counter-based clone detection
 * - Challenge replay prevention
 * - Credential validation
 */

import type {
  AuthenticatorTransportFuture,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/server';
import {
  generateAuthenticationOptions,
  type VerifiedAuthenticationResponse,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { and, eq } from 'drizzle-orm';
import { AuditLogger } from '@/lib/api/services/audit';
import { db, webauthn_credentials } from '@/lib/db';
import { log } from '@/lib/logger';
import type { VerifyAssertionParams, VerifyAssertionResult } from '@/lib/types/webauthn';
import { createChallenge, validateChallenge, markChallengeUsed } from './challenge-manager';
import { RP_ID, ORIGIN } from './constants';
import { validateCounter } from './security-validator';

/**
 * Begin passkey authentication
 * Generates WebAuthn authentication challenge
 *
 * @param userId - User ID requesting authentication
 * @param ipAddress - Client IP address
 * @param userAgent - Client user agent
 * @returns Authentication options and challenge ID
 * @throws Error if user has no registered passkeys
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
    .where(and(
      eq(webauthn_credentials.user_id, userId),
      eq(webauthn_credentials.is_active, true)
    ));

  if (credentials.length === 0) {
    log.warn('authentication attempted with no registered credentials', {
      operation: 'begin_authentication',
      userId,
      component: 'auth',
    });
    throw new Error('No passkeys registered. Please register a passkey first.');
  }

  // Prepare allowed credentials
  const allowCredentials = credentials.map((cred) => ({
    id: cred.credential_id,
    type: 'public-key' as const,
    transports: cred.transports
      ? (JSON.parse(cred.transports) as AuthenticatorTransportFuture[])
      : [],
  }));

  // Generate authentication options
  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    allowCredentials,
    userVerification: 'required', // Always require user verification
  });

  // Store challenge in database using challenge manager
  const challengeId = await createChallenge(
    userId,
    'authentication',
    options.challenge,
    ipAddress,
    userAgent
  );

  log.info('webauthn authentication challenge generated', {
    operation: 'begin_authentication',
    userId,
    challengeId: challengeId.substring(0, 8),
    credentialCount: credentials.length,
    component: 'auth',
  });

  return {
    options,
    challenge_id: challengeId,
  };
}

/**
 * Complete passkey authentication
 * Verifies authentication assertion and updates credential counter
 *
 * Security: Implements counter-based clone detection
 * - Counter regression = cloned authenticator (disabled)
 * - Counter increment = normal use
 *
 * @param params - Verification parameters
 * @returns Verification result (success/failure with reason)
 */
export async function completeAuthentication(
  params: VerifyAssertionParams
): Promise<VerifyAssertionResult> {
  const { userId, challengeId, assertion, ipAddress, userAgent } = params;

  // Retrieve and validate challenge using challenge manager
  const challenge = await validateChallenge(challengeId, userId, 'authentication');

  // Mark challenge as used immediately after validation to prevent reuse
  // This must happen BEFORE any verification attempts to prevent retry attacks
  await markChallengeUsed(challengeId);

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
    log.warn('authentication attempted with unknown credential', {
      operation: 'complete_authentication',
      userId,
      credentialId: credentialIdStr.substring(0, 16),
      component: 'auth',
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
    log.error('webauthn authentication verification failed', error, {
      operation: 'complete_authentication',
      userId,
      credentialId: credentialIdStr.substring(0, 16),
      component: 'auth',
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

  // SECURITY: Counter regression detection using security validator
  const counterValidation = validateCounter(credential.counter, newCounter);

  if (!counterValidation.valid) {
    log.error('webauthn counter regression detected - possible cloned authenticator', {
      operation: 'complete_authentication',
      userId,
      credentialId: credentialIdStr.substring(0, 16),
      storedCounter: counterValidation.oldCounter,
      receivedCounter: counterValidation.newCounter,
      reason: counterValidation.reason,
      alert: 'CLONED_AUTHENTICATOR_DETECTED',
      component: 'auth',
    });

    // Disable credential as recommended by validator
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
        storedCounter: counterValidation.oldCounter,
        receivedCounter: counterValidation.newCounter,
        action_taken: 'credential_disabled',
        reason: counterValidation.reason,
      },
      severity: 'high',
    });

    return {
      success: false,
      error: 'Security issue detected. This passkey has been disabled. Please contact support.',
    };
  }

  // Update counter (challenge already marked as used above)
  try {
    await db
      .update(webauthn_credentials)
      .set({
        counter: newCounter,
        last_used: new Date(),
      })
      .where(eq(webauthn_credentials.credential_id, credentialIdStr));

    // Audit log (outside transaction - non-critical)
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

    log.info('webauthn authentication successful', {
      operation: 'complete_authentication',
      userId,
      credentialId: credentialIdStr.substring(0, 16),
      credentialName: credential.credential_name,
      component: 'auth',
    });

    return {
      success: true,
      credentialId: credentialIdStr,
      counter: newCounter,
    };
  } catch (error) {
    log.error('webauthn verification transaction failed', error, {
      operation: 'complete_authentication',
      userId,
      credentialId: credentialIdStr.substring(0, 16),
      component: 'auth',
    });
    return {
      success: false,
      error: 'Failed to complete passkey verification. Please try again.',
    };
  }
}
