/**
 * Internal WebAuthn Module Types
 * Types used internally within the webauthn module
 * External types are in lib/types/webauthn.ts
 */

/**
 * Challenge validation result
 */
export interface ChallengeValidationResult {
  challenge: string;
  userId: string;
  challengeType: 'registration' | 'authentication';
  createdAt: Date;
  expiresAt: Date;
}

/**
 * Counter validation result
 */
export interface CounterValidationResult {
  valid: boolean;
  reason?: string;
  action?: 'disable_credential';
  oldCounter: number;
  newCounter: number;
}
