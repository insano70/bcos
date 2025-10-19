/**
 * WebAuthn/Passkey Authentication Service
 * Main entry point - re-exports from modular components
 *
 * This file maintains backward compatibility by re-exporting functions
 * from the refactored webauthn module structure.
 *
 * Module Structure:
 * - challenge-manager.ts: Challenge lifecycle
 * - security-validator.ts: Security checks
 * - credential-manager.ts: Credential CRUD
 * - registration.ts: Registration flow
 * - authentication.ts: Authentication flow
 */

import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import type {
  MFAStatus,
  VerifyAssertionParams,
  VerifyAssertionResult,
  WebAuthnCredential,
} from '@/lib/types/webauthn';

// Import from registration module
import {
  beginRegistration as beginRegistrationFromModule,
  completeRegistration as completeRegistrationFromModule,
  getMFAStatus as getMFAStatusFromModule,
} from './webauthn/registration';

// Import from authentication module
import {
  beginAuthentication as beginAuthenticationFromModule,
  completeAuthentication as completeAuthenticationFromModule,
} from './webauthn/authentication';

// Import from credential manager
import {
  getUserCredentials as getUserCredentialsFromManager,
  deleteCredential as deleteCredentialFromManager,
  renameCredential as renameCredentialFromManager,
  adminResetMFA as adminResetMFAFromManager,
} from './webauthn/credential-manager';

// Import from challenge manager
import { cleanupExpiredChallenges as cleanupChallengesFromManager } from './webauthn/challenge-manager';

// ============================================================================
// REGISTRATION FLOW
// ============================================================================

/**
 * Generate registration options for a new passkey
 * Re-exported from registration module
 */
export async function beginRegistration(
  userId: string,
  userEmail: string,
  userName: string,
  ipAddress: string,
  userAgent: string | null
): Promise<{ options: PublicKeyCredentialCreationOptionsJSON; challenge_id: string }> {
  return beginRegistrationFromModule(userId, userEmail, userName, ipAddress, userAgent);
}

/**
 * Complete passkey registration
 * Re-exported from registration module
 */
export async function completeRegistration(
  userId: string,
  challengeId: string,
  registrationResponse: RegistrationResponseJSON,
  credentialName: string,
  ipAddress: string,
  userAgent: string | null
): Promise<{ credential_id: string; credential_name: string }> {
  return completeRegistrationFromModule(
    userId,
    challengeId,
    registrationResponse,
    credentialName,
    ipAddress,
    userAgent
  );
}

/**
 * Get MFA status for a user
 * Re-exported from registration module
 */
export async function getMFAStatus(userId: string): Promise<MFAStatus> {
  return getMFAStatusFromModule(userId);
}

// ============================================================================
// AUTHENTICATION FLOW
// ============================================================================

/**
 * Generate authentication options for passkey verification
 * Re-exported from authentication module
 */
export async function beginAuthentication(
  userId: string,
  ipAddress: string,
  userAgent: string | null
): Promise<{ options: PublicKeyCredentialRequestOptionsJSON; challenge_id: string }> {
  return beginAuthenticationFromModule(userId, ipAddress, userAgent);
}

/**
 * Complete passkey authentication
 * Re-exported from authentication module
 */
export async function completeAuthentication(
  params: VerifyAssertionParams
): Promise<VerifyAssertionResult> {
  return completeAuthenticationFromModule(params);
}

// ============================================================================
// CREDENTIAL MANAGEMENT
// ============================================================================

/**
 * Get user's credentials (sanitized, no public keys)
 * Re-exported from credential-manager
 */
export async function getUserCredentials(userId: string): Promise<WebAuthnCredential[]> {
  return getUserCredentialsFromManager(userId);
}

/**
 * Delete (deactivate) a credential
 * Re-exported from credential-manager
 */
export async function deleteCredential(
  userId: string,
  credentialId: string
): Promise<{ success: boolean }> {
  return deleteCredentialFromManager(userId, credentialId);
}

/**
 * Rename a credential
 * Re-exported from credential-manager
 */
export async function renameCredential(
  userId: string,
  credentialId: string,
  newName: string
): Promise<{ success: boolean }> {
  return renameCredentialFromManager(userId, credentialId, newName);
}

/**
 * Admin: Reset MFA for a user (delete all credentials)
 * Re-exported from credential-manager
 */
export async function adminResetMFA(
  adminUserId: string,
  targetUserId: string
): Promise<{ success: boolean; credentials_removed: number }> {
  return adminResetMFAFromManager(adminUserId, targetUserId);
}

// ============================================================================
// MAINTENANCE
// ============================================================================

/**
 * Cleanup expired challenges (maintenance function)
 * Re-exported from challenge-manager
 */
export async function cleanupExpiredChallenges(): Promise<number> {
  return cleanupChallengesFromManager();
}
