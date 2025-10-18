/**
 * MFA Service - Multi-Factor Authentication Helper
 *
 * Provides centralized MFA operations for authentication flows.
 * Wraps lib/auth/webauthn.ts and lib/auth/mfa-skip-tracker.ts with unified interface.
 *
 * SECURITY FEATURES:
 * - Passkey registration and verification (WebAuthn/FIDO2)
 * - MFA skip tracking with fail-closed enforcement
 * - Challenge-based authentication with replay prevention
 * - Credential management with security audit trail
 *
 * REPLACES DIRECT CALLS IN:
 * - Multiple routes that call webauthn functions directly
 * - Routes that check MFA skip status inline
 *
 * USAGE:
 * ```typescript
 * import { getMFAStatusWithSkips, beginPasskeyRegistration, completePasskeyRegistration } from '@/lib/services/auth/mfa-service';
 *
 * // Get complete MFA status (enabled + skip status)
 * const status = await getMFAStatusWithSkips(userId);
 *
 * // Begin passkey registration
 * const { options, challengeId } = await beginPasskeyRegistration(userId, email, name, ipAddress, userAgent);
 *
 * // Complete passkey registration
 * const result = await completePasskeyRegistration(userId, challengeId, credential, name, ipAddress, userAgent);
 * ```
 */

import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import type { MFAStatus, VerifyAssertionParams } from '@/lib/types/webauthn';
import { log, SLOW_THRESHOLDS } from '@/lib/logger';

// Import from existing auth modules
import * as webauthn from '@/lib/auth/webauthn';
import * as mfaSkipTracker from '@/lib/auth/mfa-skip-tracker';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Complete MFA status including skip tracking
 */
export interface CompleteMFAStatus extends MFAStatus {
  skipStatus: {
    skips_remaining: number;
    skip_count: number;
    first_skipped_at: Date | null;
    last_skipped_at: Date | null;
  };
  isEnforced: boolean; // true if no skips remaining
}

/**
 * Passkey registration options
 */
export interface PasskeyRegistrationOptions {
  userId: string;
  userEmail: string;
  userName: string;
  ipAddress: string;
  userAgent: string | null;
}

/**
 * Passkey verification options
 */
export interface PasskeyVerificationOptions {
  userId: string;
  ipAddress: string;
  userAgent: string | null;
}

/**
 * Passkey registration result
 */
export interface PasskeyRegistrationResult {
  success: boolean;
  credentialId: string;
  credentialName: string;
  mfaEnabled: boolean;
}

/**
 * Passkey verification result
 */
export interface PasskeyVerificationResult {
  success: boolean;
  credentialId?: string;
  error?: string;
}

/**
 * MFA skip result
 */
export interface MFASkipResult {
  success: boolean;
  skipsRemaining: number;
  skipCount: number;
  isEnforced: boolean; // true if this was the final skip
}

// ============================================================================
// MFA Status Functions
// ============================================================================

/**
 * Get complete MFA status including skip tracking
 *
 * COMBINES:
 * - webauthn.getMFAStatus() - MFA enabled status and credential count
 * - mfaSkipTracker.getMFASkipStatus() - Skip tracking data
 * - mfaSkipTracker.isMFAEnforced() - Enforcement status
 *
 * @param userId - User UUID
 * @returns Complete MFA status with skip information
 */
export async function getMFAStatusWithSkips(userId: string): Promise<CompleteMFAStatus> {
  const startTime = Date.now();

  log.debug('retrieving complete mfa status', {
    operation: 'get_mfa_status_with_skips',
    userId,
    component: 'auth',
  });

  // Get MFA status and skip status in parallel
  const [mfaStatus, skipStatus, isEnforced] = await Promise.all([
    webauthn.getMFAStatus(userId),
    mfaSkipTracker.getMFASkipStatus(userId),
    mfaSkipTracker.isMFAEnforced(userId),
  ]);

  const duration = Date.now() - startTime;

  log.debug('complete mfa status retrieved', {
    operation: 'get_mfa_status_with_skips',
    userId,
    mfaEnabled: mfaStatus.enabled,
    credentialCount: mfaStatus.credential_count,
    skipsRemaining: skipStatus.skips_remaining,
    isEnforced,
    duration,
    component: 'auth',
  });

  return {
    ...mfaStatus,
    skipStatus,
    isEnforced,
  };
}

/**
 * Get basic MFA status (enabled + credential count)
 *
 * WRAPPER for webauthn.getMFAStatus()
 *
 * @param userId - User UUID
 * @returns Basic MFA status
 */
export async function getMFAStatus(userId: string): Promise<MFAStatus> {
  return webauthn.getMFAStatus(userId);
}

// ============================================================================
// Passkey Registration Functions
// ============================================================================

/**
 * Begin passkey registration flow
 *
 * WRAPPER for webauthn.beginRegistration()
 * Generates WebAuthn registration challenge
 *
 * @param options - Registration options
 * @returns Registration challenge and challenge ID
 */
export async function beginPasskeyRegistration(
  options: PasskeyRegistrationOptions
): Promise<{ options: PublicKeyCredentialCreationOptionsJSON; challenge_id: string }> {
  const startTime = Date.now();
  const { userId, userEmail, userName, ipAddress, userAgent } = options;

  log.debug('beginning passkey registration', {
    operation: 'begin_passkey_registration',
    userId,
    component: 'auth',
  });

  const result = await webauthn.beginRegistration(
    userId,
    userEmail,
    userName,
    ipAddress,
    userAgent
  );

  const duration = Date.now() - startTime;

  log.info('passkey registration challenge generated', {
    operation: 'begin_passkey_registration',
    userId,
    challengeId: result.challenge_id.substring(0, 8),
    duration,
    slow: duration > SLOW_THRESHOLDS.AUTH_OPERATION,
    component: 'auth',
  });

  return result;
}

/**
 * Complete passkey registration flow
 *
 * WRAPPER for webauthn.completeRegistration()
 * Verifies registration response and stores credential
 *
 * @param userId - User UUID
 * @param challengeId - Challenge ID from beginPasskeyRegistration
 * @param credential - Registration response from authenticator
 * @param credentialName - User-friendly name for credential
 * @param ipAddress - Client IP address
 * @param userAgent - Client user agent
 * @returns Registration result
 */
export async function completePasskeyRegistration(
  userId: string,
  challengeId: string,
  credential: RegistrationResponseJSON,
  credentialName: string,
  ipAddress: string,
  userAgent: string | null
): Promise<PasskeyRegistrationResult> {
  const startTime = Date.now();

  log.debug('completing passkey registration', {
    operation: 'complete_passkey_registration',
    userId,
    challengeId: challengeId.substring(0, 8),
    credentialName,
    component: 'auth',
  });

  const result = await webauthn.completeRegistration(
    userId,
    challengeId,
    credential,
    credentialName,
    ipAddress,
    userAgent
  );

  // Check if MFA is now enabled
  const mfaStatus = await webauthn.getMFAStatus(userId);

  const duration = Date.now() - startTime;

  log.info('passkey registration completed successfully', {
    operation: 'complete_passkey_registration',
    userId,
    credentialId: result.credential_id.substring(0, 16),
    credentialName: result.credential_name,
    mfaEnabled: mfaStatus.enabled,
    credentialCount: mfaStatus.credential_count,
    duration,
    slow: duration > SLOW_THRESHOLDS.AUTH_OPERATION,
    component: 'auth',
  });

  return {
    success: true,
    credentialId: result.credential_id,
    credentialName: result.credential_name,
    mfaEnabled: mfaStatus.enabled,
  };
}

// ============================================================================
// Passkey Verification Functions
// ============================================================================

/**
 * Begin passkey authentication flow
 *
 * WRAPPER for webauthn.beginAuthentication()
 * Generates WebAuthn authentication challenge
 *
 * @param options - Verification options
 * @returns Authentication challenge and challenge ID
 */
export async function beginPasskeyVerification(
  options: PasskeyVerificationOptions
): Promise<{ options: PublicKeyCredentialRequestOptionsJSON; challenge_id: string }> {
  const startTime = Date.now();
  const { userId, ipAddress, userAgent } = options;

  log.debug('beginning passkey verification', {
    operation: 'begin_passkey_verification',
    userId,
    component: 'auth',
  });

  const result = await webauthn.beginAuthentication(userId, ipAddress, userAgent);

  const duration = Date.now() - startTime;

  log.info('passkey verification challenge generated', {
    operation: 'begin_passkey_verification',
    userId,
    challengeId: result.challenge_id.substring(0, 8),
    duration,
    slow: duration > SLOW_THRESHOLDS.AUTH_OPERATION,
    component: 'auth',
  });

  return result;
}

/**
 * Complete passkey authentication flow
 *
 * WRAPPER for webauthn.completeAuthentication()
 * Verifies authentication response
 *
 * @param params - Verification parameters
 * @returns Verification result
 */
export async function completePasskeyVerification(
  params: VerifyAssertionParams
): Promise<PasskeyVerificationResult> {
  const startTime = Date.now();

  log.debug('completing passkey verification', {
    operation: 'complete_passkey_verification',
    userId: params.userId,
    challengeId: params.challengeId.substring(0, 8),
    component: 'auth',
  });

  const result = await webauthn.completeAuthentication(params);

  const duration = Date.now() - startTime;

  if (result.success) {
    log.info('passkey verification successful', {
      operation: 'complete_passkey_verification',
      userId: params.userId,
      credentialId: result.credentialId?.substring(0, 16),
      duration,
      slow: duration > SLOW_THRESHOLDS.AUTH_OPERATION,
      component: 'auth',
    });
  } else {
    log.warn('passkey verification failed', {
      operation: 'complete_passkey_verification',
      userId: params.userId,
      error: result.error,
      duration,
      component: 'auth',
    });
  }

  return {
    success: result.success,
    ...(result.credentialId ? { credentialId: result.credentialId } : {}),
    ...(result.error ? { error: result.error } : {}),
  };
}

// ============================================================================
// MFA Skip Tracking Functions
// ============================================================================

/**
 * Record MFA setup skip
 *
 * WRAPPER for mfaSkipTracker.recordMFASkip()
 * Decrements skip counter and updates audit trail
 *
 * @param userId - User UUID
 * @param ipAddress - Client IP address
 * @param userAgent - Client user agent
 * @returns Skip result with remaining count
 * @throws Error if no skips remaining
 */
export async function recordMFASkip(
  userId: string,
  ipAddress: string,
  userAgent: string | null
): Promise<MFASkipResult> {
  const startTime = Date.now();

  log.debug('recording mfa skip', {
    operation: 'record_mfa_skip',
    userId,
    component: 'auth',
  });

  const result = await mfaSkipTracker.recordMFASkip(userId, ipAddress, userAgent);

  // Get updated skip status
  const skipStatus = await mfaSkipTracker.getMFASkipStatus(userId);

  const duration = Date.now() - startTime;

  log.info('mfa skip recorded', {
    operation: 'record_mfa_skip',
    userId,
    skipsRemaining: result.skips_remaining,
    skipCount: skipStatus.skip_count,
    isEnforced: result.skips_remaining === 0,
    duration,
    component: 'auth',
  });

  return {
    success: result.success,
    skipsRemaining: result.skips_remaining,
    skipCount: skipStatus.skip_count,
    isEnforced: result.skips_remaining === 0,
  };
}

/**
 * Check if MFA is enforced (no skips remaining)
 *
 * WRAPPER for mfaSkipTracker.isMFAEnforced()
 *
 * @param userId - User UUID
 * @returns true if MFA is enforced, false if skips remain
 */
export async function isMFAEnforced(userId: string): Promise<boolean> {
  return mfaSkipTracker.isMFAEnforced(userId);
}

/**
 * Get MFA skip status
 *
 * WRAPPER for mfaSkipTracker.getMFASkipStatus()
 *
 * @param userId - User UUID
 * @returns Skip status with remaining count and timestamps
 */
export async function getMFASkipStatus(
  userId: string
): Promise<mfaSkipTracker.MFASkipStatus> {
  return mfaSkipTracker.getMFASkipStatus(userId);
}

// ============================================================================
// Credential Management Functions
// ============================================================================

/**
 * Get user's passkey credentials
 *
 * WRAPPER for webauthn.getUserCredentials()
 *
 * @param userId - User UUID
 * @returns Array of user credentials (sanitized, no public keys)
 */
export async function getUserPasskeys(userId: string) {
  const startTime = Date.now();

  const credentials = await webauthn.getUserCredentials(userId);

  const duration = Date.now() - startTime;

  log.debug('user passkeys retrieved', {
    operation: 'get_user_passkeys',
    userId,
    credentialCount: credentials.length,
    duration,
    component: 'auth',
  });

  return credentials;
}

/**
 * Delete (deactivate) a passkey credential
 *
 * WRAPPER for webauthn.deleteCredential()
 *
 * @param userId - User UUID
 * @param credentialId - Credential ID to delete
 * @returns Success status
 * @throws Error if this is the last credential
 */
export async function deletePasskey(
  userId: string,
  credentialId: string
): Promise<{ success: boolean }> {
  const startTime = Date.now();

  log.debug('deleting passkey', {
    operation: 'delete_passkey',
    userId,
    credentialId: credentialId.substring(0, 16),
    component: 'auth',
  });

  const result = await webauthn.deleteCredential(userId, credentialId);

  const duration = Date.now() - startTime;

  log.info('passkey deleted successfully', {
    operation: 'delete_passkey',
    userId,
    credentialId: credentialId.substring(0, 16),
    duration,
    component: 'auth',
  });

  return result;
}

/**
 * Rename a passkey credential
 *
 * WRAPPER for webauthn.renameCredential()
 *
 * @param userId - User UUID
 * @param credentialId - Credential ID to rename
 * @param newName - New credential name
 * @returns Success status
 */
export async function renamePasskey(
  userId: string,
  credentialId: string,
  newName: string
): Promise<{ success: boolean }> {
  const startTime = Date.now();

  log.debug('renaming passkey', {
    operation: 'rename_passkey',
    userId,
    credentialId: credentialId.substring(0, 16),
    newName,
    component: 'auth',
  });

  const result = await webauthn.renameCredential(userId, credentialId, newName);

  const duration = Date.now() - startTime;

  log.info('passkey renamed successfully', {
    operation: 'rename_passkey',
    userId,
    credentialId: credentialId.substring(0, 16),
    newName,
    duration,
    component: 'auth',
  });

  return result;
}

// ============================================================================
// Admin Functions
// ============================================================================

/**
 * Admin: Reset MFA for a user (delete all credentials)
 *
 * WRAPPER for webauthn.adminResetMFA()
 *
 * @param adminUserId - Admin user ID performing the reset
 * @param targetUserId - Target user ID to reset
 * @returns Success status and credentials removed count
 */
export async function adminResetUserMFA(
  adminUserId: string,
  targetUserId: string
): Promise<{ success: boolean; credentials_removed: number }> {
  const startTime = Date.now();

  log.security('admin_mfa_reset_initiated', 'high', {
    adminUserId,
    targetUserId,
    action: 'reset_all_mfa_credentials',
  });

  const result = await webauthn.adminResetMFA(adminUserId, targetUserId);

  const duration = Date.now() - startTime;

  log.info('admin mfa reset completed', {
    operation: 'admin_reset_user_mfa',
    adminUserId,
    targetUserId,
    credentialsRemoved: result.credentials_removed,
    duration,
    component: 'auth',
  });

  return result;
}

/**
 * Admin: Reset MFA skip counter
 *
 * WRAPPER for mfaSkipTracker.adminResetSkipCounter()
 *
 * @param adminUserId - Admin user ID performing the reset
 * @param targetUserId - Target user ID to reset
 * @param newSkipsRemaining - Number of skips to grant (default: 5)
 * @returns Success status
 */
export async function adminResetSkipCounter(
  adminUserId: string,
  targetUserId: string,
  newSkipsRemaining: number = 5
): Promise<{ success: boolean }> {
  const startTime = Date.now();

  log.security('admin_skip_counter_reset_initiated', 'medium', {
    adminUserId,
    targetUserId,
    newSkipsRemaining,
    action: 'reset_mfa_skip_counter',
  });

  const result = await mfaSkipTracker.adminResetSkipCounter(
    adminUserId,
    targetUserId,
    newSkipsRemaining
  );

  const duration = Date.now() - startTime;

  log.info('admin skip counter reset completed', {
    operation: 'admin_reset_skip_counter',
    adminUserId,
    targetUserId,
    newSkipsRemaining,
    duration,
    component: 'auth',
  });

  return result;
}
