/**
 * Token Management - Public API
 *
 * Barrel export for token management system.
 * This is the public API surface for all token operations.
 *
 * ARCHITECTURE:
 * - Clean separation of concerns (8 focused modules)
 * - Internal helpers hidden in internal/ directory
 * - Type-safe exports with comprehensive documentation
 *
 * USAGE:
 * ```typescript
 * // Import from public API
 * import {
 *   createTokenPair,
 *   refreshTokenPair,
 *   validateAccessToken,
 *   revokeRefreshToken,
 *   revokeAllUserTokens,
 *   generateDeviceFingerprint,
 *   generateDeviceName,
 *   cleanupExpiredTokens,
 *   type TokenPair,
 *   type DeviceInfo,
 * } from '@/lib/auth/tokens';
 * ```
 *
 * MIGRATION FROM token-manager.ts:
 * - All exports maintain backward compatibility
 * - Function signatures unchanged
 * - Types and constants preserved
 *
 * @module lib/auth/tokens
 */

// ============================================================================
// Token Operations
// ============================================================================

/**
 * Create initial token pair on authentication
 * @see {@link ./creation.ts}
 */
export { createTokenPair } from './creation';

/**
 * Refresh token pair with rotation
 * @see {@link ./refresh.ts}
 */
export { refreshTokenPair } from './refresh';

/**
 * Validate access token
 * @see {@link ./validation.ts}
 */
export { validateAccessToken } from './validation';

/**
 * Revoke single refresh token (logout)
 * Revoke all user tokens (security event)
 * @see {@link ./revocation.ts}
 */
export { revokeRefreshToken, revokeAllUserTokens } from './revocation';

/**
 * Device fingerprinting and identification
 * @see {@link ./device.ts}
 */
export { generateDeviceFingerprint, generateDeviceName } from './device';

/**
 * Maintenance: cleanup expired tokens
 * @see {@link ./cleanup.ts}
 */
export { cleanupExpiredTokens } from './cleanup';

// ============================================================================
// Types and Constants
// ============================================================================

/**
 * Token types
 * @see {@link ./types.ts}
 */
export type { TokenPair, DeviceInfo, RefreshTokenData } from './types';

/**
 * Token duration constants
 * @see {@link ./types.ts}
 */
export {
  ACCESS_TOKEN_DURATION,
  REFRESH_TOKEN_STANDARD,
  REFRESH_TOKEN_REMEMBER_ME,
} from './types';
