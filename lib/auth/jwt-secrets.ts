/**
 * JWT Secrets Module
 * Centralized JWT secret loading and encoding
 *
 * SECURITY:
 * - Secrets are validated and encoded at module load time (fail-fast)
 * - Module-scoped - NOT exported, only the encoded Uint8Arrays are exported
 * - Single source of truth for JWT cryptographic material
 * - Used by lib/auth/tokens and token-verification.ts
 *
 * @module lib/auth/jwt-secrets
 */

import { getJWTConfig } from '@/lib/env';

/**
 * Load and validate JWT configuration at module load time
 * SECURITY: Fail fast if secrets are missing or invalid
 */
const jwtConfig = getJWTConfig();

/**
 * Access token secret (HS256)
 * Used for signing and verifying 15-minute access tokens
 * Module-scoped, exported as encoded Uint8Array
 */
export const ACCESS_TOKEN_SECRET = new TextEncoder().encode(jwtConfig.accessSecret);

/**
 * Refresh token secret (HS256)
 * Used for signing and verifying 7-30 day refresh tokens
 * Module-scoped, exported as encoded Uint8Array
 */
export const REFRESH_TOKEN_SECRET = new TextEncoder().encode(jwtConfig.refreshSecret);
