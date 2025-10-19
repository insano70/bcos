/**
 * Internal WebAuthn Module Types
 * Types used internally within the webauthn module
 * External types are in lib/types/webauthn.ts
 */

/**
 * Challenge validation result
 * Returned after successfully validating a WebAuthn challenge
 *
 * @property challenge - Base64URL encoded challenge value
 * @property userId - User ID associated with the challenge
 * @property challengeType - Type of operation ('registration' or 'authentication')
 * @property createdAt - Timestamp when challenge was created
 * @property expiresAt - Timestamp when challenge expires (2 minutes from creation)
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
 * Used for clone detection by comparing signature counters
 *
 * SECURITY: Counter regression indicates a cloned authenticator
 *
 * @property valid - true if counter validation passed, false if regression detected
 * @property reason - Reason for validation failure (e.g., 'counter_regression_detected')
 * @property action - Recommended action ('disable_credential' for cloned authenticators)
 * @property oldCounter - Previously stored counter value
 * @property newCounter - New counter value from authenticator response
 */
export interface CounterValidationResult {
  valid: boolean;
  reason?: string;
  action?: 'disable_credential';
  oldCounter: number;
  newCounter: number;
}
