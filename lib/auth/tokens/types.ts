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
 * Organization access claim - compact representation for JWT
 *
 * Instead of embedding all organization IDs (which could be hundreds),
 * we embed a compact claim that the server interprets:
 * - 'all': Super admin has access to all organizations
 * - 'hierarchy': User has access via org hierarchy (server expands root_ids)
 * - 'direct': Explicit list of org IDs (fallback for many direct memberships)
 */
export type OrgAccessClaim =
  | { type: 'all' }
  | { type: 'hierarchy'; root_ids: string[] }
  | { type: 'direct'; org_ids: string[] };

/**
 * Enhanced access token payload with RBAC claims
 *
 * This payload embeds essential RBAC information directly in the JWT,
 * enabling the server to build UserContext from cache without database queries.
 *
 * PERFORMANCE: Adding ~50-100ms to login saves 70-170ms on EVERY subsequent request.
 *
 * SECURITY: Claims are validated against cached role permissions with version checking.
 * If role permissions change, the version mismatch triggers a database refresh.
 */
export interface EnhancedAccessTokenPayload {
  // Standard JWT claims
  sub: string;
  jti: string;
  session_id: string;
  iat: number;
  exp: number;

  // User identification (immutable during session)
  email: string;
  first_name: string;
  last_name: string;
  email_verified: boolean;

  // RBAC claims (checked every request)
  is_super_admin: boolean;
  role_ids: string[];
  roles_version: Record<string, number>; // role_id -> cache version for invalidation detection

  // Organization access
  primary_org_id: string | null;
  org_admin_for: string[];
  org_access: OrgAccessClaim;

  // Analytics filtering (optional - can be number, null, or undefined)
  provider_uid?: number | null | undefined;
}

/**
 * RBAC data needed to build enhanced token payload
 *
 * Fetched during login/refresh to populate EnhancedAccessTokenPayload.
 */
export interface TokenRBACData {
  is_super_admin: boolean;
  roles: Array<{ role_id: string; name: string; version: number }>;
  primary_organization_id: string | null;
  organization_admin_for: string[];
  direct_organization_ids: string[];
  provider_uid?: number | null | undefined;
  email_verified: boolean;
}

/**
 * Token duration constants
 */
export const ACCESS_TOKEN_DURATION = 15 * 60 * 1000; // 15 minutes
export const REFRESH_TOKEN_STANDARD = 7 * 24 * 60 * 60 * 1000; // 7 days
export const REFRESH_TOKEN_REMEMBER_ME = 30 * 24 * 60 * 60 * 1000; // 30 days
