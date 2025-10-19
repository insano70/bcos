/**
 * WebAuthn Security Validator
 * Validates security constraints and detects security threats
 *
 * Security Features:
 * - Counter regression detection (cloned authenticator detection)
 * - Credential limit enforcement
 * - Duplicate credential prevention
 */

import { and, eq } from 'drizzle-orm';
import { db, webauthn_credentials } from '@/lib/db';
import { log } from '@/lib/logger';
import type { CounterValidationResult } from './types';
import { MAX_CREDENTIALS_PER_USER } from './constants';

/**
 * Validate credential counter for clone detection
 *
 * SECURITY CRITICAL: Counter regression indicates a cloned authenticator
 * - If newCounter < storedCounter: CLONED (disable credential)
 * - If newCounter >= storedCounter: OK (normal use)
 * - Counter can stay the same (some authenticators don't increment on every use)
 *
 * @param storedCounter - Counter value stored in database
 * @param receivedCounter - Counter value from authenticator
 * @returns Validation result with action recommendation
 */
export function validateCounter(
  storedCounter: number,
  receivedCounter: number
): CounterValidationResult {
  // SECURITY: Counter regression = cloned authenticator
  // Must DECREASE to trigger (not just stay same)
  if (receivedCounter < storedCounter) {
    log.security('counter_regression_detected', 'critical', {
      storedCounter,
      receivedCounter,
      action: 'credential_should_be_disabled',
      threat: 'cloned_authenticator',
    });

    return {
      valid: false,
      reason: 'counter_regression_detected',
      action: 'disable_credential',
      oldCounter: storedCounter,
      newCounter: receivedCounter,
    };
  }

  // Valid: counter increased or stayed same
  return {
    valid: true,
    oldCounter: storedCounter,
    newCounter: receivedCounter,
  };
}

/**
 * Check if user has reached credential limit
 * Prevents users from registering too many credentials
 *
 * @param userId - User ID to check
 * @returns Number of active credentials
 * @throws Error if limit reached
 */
export async function enforceCredentialLimit(userId: string): Promise<number> {
  const activeCredentials = await db
    .select()
    .from(webauthn_credentials)
    .where(and(
      eq(webauthn_credentials.user_id, userId),
      eq(webauthn_credentials.is_active, true)
    ));

  const count = activeCredentials.length;

  if (count >= MAX_CREDENTIALS_PER_USER) {
    log.warn('credential limit reached', {
      operation: 'enforce_credential_limit',
      userId,
      currentCount: count,
      maxAllowed: MAX_CREDENTIALS_PER_USER,
      component: 'auth',
    });

    throw new Error(
      `Maximum passkey limit reached (${MAX_CREDENTIALS_PER_USER}). Please remove an existing passkey before adding a new one.`
    );
  }

  log.debug('credential limit check passed', {
    operation: 'enforce_credential_limit',
    userId,
    currentCount: count,
    maxAllowed: MAX_CREDENTIALS_PER_USER,
    component: 'auth',
  });

  return count;
}

/**
 * Ensure credential ID is unique (not already registered)
 * Should not happen due to excludeCredentials in registration options,
 * but this provides defense in depth
 *
 * @param credentialId - Credential ID to check
 * @throws Error if credential already exists
 */
export async function ensureUniqueCredential(credentialId: string): Promise<void> {
  const [existingCred] = await db
    .select()
    .from(webauthn_credentials)
    .where(eq(webauthn_credentials.credential_id, credentialId))
    .limit(1);

  if (existingCred) {
    log.warn('duplicate credential detected', {
      operation: 'ensure_unique_credential',
      credentialId: credentialId.substring(0, 16),
      existingUserId: existingCred.user_id,
      component: 'auth',
    });

    throw new Error('This passkey is already registered');
  }
}

/**
 * Get active credential count for user
 * Helper function for credential management
 *
 * @param userId - User ID to check
 * @returns Number of active credentials
 */
export async function getActiveCredentialCount(userId: string): Promise<number> {
  const credentials = await db
    .select()
    .from(webauthn_credentials)
    .where(and(
      eq(webauthn_credentials.user_id, userId),
      eq(webauthn_credentials.is_active, true)
    ));

  return credentials.length;
}

/**
 * Check if credential exists
 * Helper function for credential validation
 *
 * @param credentialId - Credential ID to check
 * @returns true if credential exists, false otherwise
 */
export async function credentialExists(credentialId: string): Promise<boolean> {
  const [credential] = await db
    .select()
    .from(webauthn_credentials)
    .where(eq(webauthn_credentials.credential_id, credentialId))
    .limit(1);

  return !!credential;
}
