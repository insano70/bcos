/**
 * WebAuthn Configuration Constants
 * Centralized configuration for WebAuthn/Passkey authentication
 */

/**
 * Get required environment variable with validation
 * In production, throws if environment variable is missing
 * In development, uses fallback value if provided
 */
function getRequiredEnvVar(key: string, fallback?: string): string {
  const value = process.env[key];

  if (!value) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`${key} environment variable is required in production`);
    }
    if (!fallback) {
      throw new Error(`${key} environment variable is required`);
    }
    return fallback;
  }

  return value;
}

/**
 * Relying Party Configuration
 */
export const RP_NAME = 'BendCare';
export const RP_ID = getRequiredEnvVar(
  'WEBAUTHN_RP_ID',
  process.env.NODE_ENV === 'development' ? 'localhost' : undefined
);
export const ORIGIN = getRequiredEnvVar(
  'NEXT_PUBLIC_APP_URL',
  process.env.NODE_ENV === 'development' ? 'http://localhost:4001' : undefined
);

/**
 * Security and Operational Limits
 */
export const CHALLENGE_EXPIRATION_MS = 5 * 60 * 1000; // 5 minutes
export const MAX_CREDENTIALS_PER_USER = 5;

/**
 * Authenticator Selection Preferences
 * - Platform authenticators preferred (Touch ID, Face ID, Windows Hello)
 * - Discoverable credentials (resident keys) when possible
 * - User verification always required
 */
export const AUTHENTICATOR_SELECTION = {
  authenticatorAttachment: 'platform' as const,
  residentKey: 'preferred' as const,
  userVerification: 'required' as const,
};

/**
 * Attestation Type
 * - 'none': Privacy-focused, no attestation required
 */
export const ATTESTATION_TYPE = 'none' as const;
