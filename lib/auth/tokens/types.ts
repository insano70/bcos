/**
 * Token Types and Constants
 *
 * Shared types and constants for token management system.
 * This module serves as single source of truth for all token-related types.
 *
 * USAGE:
 * ```typescript
 * import type { TokenPair, DeviceInfo } from '@/lib/auth/tokens/types';
 * import { ACCESS_TOKEN_DURATION } from '@/lib/auth/tokens/types';
 * ```
 *
 * @module lib/auth/tokens/types
 */

/**
 * Token pair returned on authentication
 */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** Access token expiration time */
  expiresAt: Date;
  /** Refresh token expiration time (for session expiry tracking) */
  refreshTokenExpiresAt: Date;
  sessionId: string;
}

/**
 * Device information for security tracking
 */
export interface DeviceInfo {
  ipAddress: string;
  userAgent: string;
  fingerprint: string;
  deviceName: string;
}

/**
 * Refresh token data structure
 */
export interface RefreshTokenData {
  tokenId: string;
  userId: string;
  deviceFingerprint: string;
  rememberMe: boolean;
  expiresAt: Date;
}

/**
 * Token duration constants
 */
export const ACCESS_TOKEN_DURATION = 15 * 60 * 1000; // 15 minutes
export const REFRESH_TOKEN_STANDARD = 7 * 24 * 60 * 60 * 1000; // 7 days
export const REFRESH_TOKEN_REMEMBER_ME = 30 * 24 * 60 * 60 * 1000; // 30 days
