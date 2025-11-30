/**
 * User Lookup Service - Authentication Helper
 *
 * Provides centralized user retrieval and validation for authentication flows.
 * Replaces duplicated user lookup logic across 8+ authentication routes.
 *
 * SECURITY FEATURES:
 * - Redis caching for performance (60s TTL)
 * - Consistent user validation (active status, SSO-only detection)
 * - Account lockout status checking
 * - Sanitized error messages (prevents user enumeration)
 *
 * REPLACES DIRECT SQL IN:
 * - /api/auth/login (line 69)
 * - /api/auth/mfa/verify (line 71)
 * - /api/auth/mfa/skip (line 55)
 * - /api/auth/mfa/register/begin (line 44)
 * - /api/auth/mfa/register/complete (line 101)
 * - /api/auth/oidc/callback (line 346)
 *
 * USAGE:
 * ```typescript
 * import { getUserByEmail, getUserById, validateUserForAuth } from '@/lib/services/auth/user-lookup-service';
 *
 * // Get user by email (cached)
 * const user = await getUserByEmail('user@example.com');
 *
 * // Get user by ID (cached)
 * const user = await getUserById('user-123');
 *
 * // Validate user for authentication (throws on inactive/locked)
 * const user = await validateUserForAuth('user@example.com');
 * ```
 */

import { eq } from 'drizzle-orm';
import { isAccountLocked } from '@/lib/auth/security';
import { CacheService } from '@/lib/cache/base';
import { db, users } from '@/lib/db';
import { log, SLOW_THRESHOLDS } from '@/lib/logger';
import { UserLookupError, UserLookupErrorCode } from './errors';

// Re-export for backward compatibility
export { UserLookupError, UserLookupErrorCode };

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * User type from database (matches users table schema)
 */
export interface User {
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  password_hash: string | null; // NULL = SSO-only user
  email_verified: boolean | null;
  is_active: boolean | null;
  provider_uid: number | null;
  created_at: Date | null;
  updated_at: Date | null;
  deleted_at: Date | null;
}

/**
 * User validation result
 */
export interface UserValidationResult {
  user: User;
  isLocked: boolean;
  lockedUntil?: number;
  isSSOOnly: boolean;
}


// ============================================================================
// Cache Configuration
// ============================================================================

/**
 * User lookup cache TTL in seconds
 * Can be overridden via environment variable USER_LOOKUP_CACHE_TTL
 * Default: 60 seconds (1 minute)
 */
const USER_LOOKUP_CACHE_TTL = Number(process.env.USER_LOOKUP_CACHE_TTL) || 60;

// ============================================================================
// Cache Service
// ============================================================================

/**
 * User Lookup Cache Service
 * Extends CacheService to provide user-specific caching
 */
class UserLookupCacheService extends CacheService<User> {
  protected namespace = 'auth:user';
  protected defaultTTL = USER_LOOKUP_CACHE_TTL;

  /**
   * Get user by email from cache
   */
  async getUserByEmail(email: string): Promise<User | null> {
    const key = this.buildKey('email', email);
    return this.get<User>(key);
  }

  /**
   * Set user in cache (by email)
   */
  async setUserByEmail(email: string, user: User): Promise<boolean> {
    const key = this.buildKey('email', email);
    return this.set(key, user, { ttl: this.defaultTTL });
  }

  /**
   * Delete user from cache (by email)
   */
  async deleteUserByEmail(email: string): Promise<void> {
    const key = this.buildKey('email', email);
    await this.del(key);
  }

  /**
   * Get user by ID from database (uses authCache internally)
   */
  async getUserById(userId: string): Promise<User | null> {
    // Import authCache dynamically to avoid circular dependencies
    const { authCache } = await import('@/lib/cache');
    return authCache.getUser(userId);
  }

  /**
   * Invalidate user cache (by ID)
   */
  async invalidateUserById(userId: string): Promise<void> {
    const { authCache } = await import('@/lib/cache');
    await authCache.invalidate(userId);
  }

  /**
   * Abstract method implementation - invalidate cache
   * @param args - Can be userId (string) or nothing (to invalidate all)
   */
  async invalidate(...args: unknown[]): Promise<void> {
    if (args.length > 0 && typeof args[0] === 'string') {
      await this.invalidateUserById(args[0]);
    }
  }
}

// Singleton instance
const userLookupCache = new UserLookupCacheService();

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Get user by email (with caching)
 *
 * CACHE STRATEGY:
 * - First check Redis cache (60s TTL)
 * - On cache miss, query database
 * - Fire-and-forget cache update
 *
 * @param email - User email address
 * @returns User object or null if not found
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  const startTime = Date.now();

  // Normalize email (lowercase)
  const normalizedEmail = email.toLowerCase().trim();

  // Check cache first
  const cached = await userLookupCache.getUserByEmail(normalizedEmail);

  if (cached !== null) {
    log.debug('user lookup cache hit', {
      operation: 'get_user_by_email',
      email: normalizedEmail.replace(/(.{2}).*@/, '$1***@'),
      cacheHit: true,
      duration: Date.now() - startTime,
      component: 'auth',
    });
    return cached;
  }

  // Cache miss - query database
  const dbStartTime = Date.now();
  const [user] = await db
    .select({
      user_id: users.user_id,
      email: users.email,
      first_name: users.first_name,
      last_name: users.last_name,
      password_hash: users.password_hash,
      email_verified: users.email_verified,
      is_active: users.is_active,
      provider_uid: users.provider_uid,
      created_at: users.created_at,
      updated_at: users.updated_at,
      deleted_at: users.deleted_at,
    })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  const dbDuration = Date.now() - dbStartTime;
  const totalDuration = Date.now() - startTime;

  if (!user) {
    log.debug('user lookup - user not found', {
      operation: 'get_user_by_email',
      email: normalizedEmail.replace(/(.{2}).*@/, '$1***@'),
      cacheHit: false,
      query: { duration: dbDuration, slow: dbDuration > SLOW_THRESHOLDS.DB_QUERY },
      duration: totalDuration,
      component: 'auth',
    });
    return null;
  }

  // Cache for future lookups (fire and forget)
  userLookupCache.setUserByEmail(normalizedEmail, user).catch(() => {});

  log.debug('user lookup cache miss - database query executed', {
    operation: 'get_user_by_email',
    email: normalizedEmail.replace(/(.{2}).*@/, '$1***@'),
    userId: user.user_id,
    cacheHit: false,
    query: { duration: dbDuration, slow: dbDuration > SLOW_THRESHOLDS.DB_QUERY },
    duration: totalDuration,
    component: 'auth',
  });

  return user;
}

/**
 * Get user by ID (with caching)
 *
 * CACHE STRATEGY:
 * - First check authCache.getUser() (5min TTL)
 * - On cache miss, query database
 * - Fire-and-forget cache update
 *
 * @param userId - User UUID
 * @returns User object or null if not found
 */
export async function getUserById(userId: string): Promise<User | null> {
  const startTime = Date.now();

  // Use userLookupCache.getUserById() which leverages authCache
  const user = await userLookupCache.getUserById(userId);

  const duration = Date.now() - startTime;

  if (!user) {
    log.debug('user lookup by id - user not found', {
      operation: 'get_user_by_id',
      userId,
      duration,
      component: 'auth',
    });
    return null;
  }

  log.debug('user lookup by id successful', {
    operation: 'get_user_by_id',
    userId,
    duration,
    component: 'auth',
  });

  return user;
}

/**
 * Validate user for authentication
 *
 * VALIDATION CHECKS:
 * 1. User exists
 * 2. User is not deleted
 * 3. User is active
 * 4. Account is not locked
 *
 * SECURITY:
 * - Returns sanitized errors (prevents user enumeration)
 * - Checks account lockout status
 * - Detects SSO-only users
 *
 * @param email - User email address
 * @returns User validation result
 * @throws {UserLookupError} If validation fails
 */
export async function validateUserForAuth(email: string): Promise<UserValidationResult> {
  const startTime = Date.now();

  // Get user by email
  const user = await getUserByEmail(email);

  if (!user) {
    log.warn('authentication validation failed - user not found', {
      operation: 'validate_user_for_auth',
      email: email.replace(/(.{2}).*@/, '$1***@'),
      reason: 'user_not_found',
      duration: Date.now() - startTime,
      component: 'auth',
    });

    throw new UserLookupError(
      UserLookupErrorCode.USER_NOT_FOUND,
      'Invalid email or password', // Generic message to prevent user enumeration
      { email }
    );
  }

  // Check if user is deleted
  if (user.deleted_at) {
    log.warn('authentication validation failed - user deleted', {
      operation: 'validate_user_for_auth',
      userId: user.user_id,
      email: email.replace(/(.{2}).*@/, '$1***@'),
      reason: 'user_deleted',
      deletedAt: user.deleted_at.toISOString(),
      duration: Date.now() - startTime,
      component: 'auth',
    });

    throw new UserLookupError(
      UserLookupErrorCode.USER_DELETED,
      'This account has been deleted',
      { userId: user.user_id }
    );
  }

  // Check if user is active
  if (!user.is_active) {
    log.warn('authentication validation failed - user inactive', {
      operation: 'validate_user_for_auth',
      userId: user.user_id,
      email: email.replace(/(.{2}).*@/, '$1***@'),
      reason: 'user_inactive',
      duration: Date.now() - startTime,
      component: 'auth',
    });

    throw new UserLookupError(
      UserLookupErrorCode.USER_INACTIVE,
      'Account is inactive',
      { userId: user.user_id }
    );
  }

  // Check account lockout status
  const lockoutStatus = await isAccountLocked(email);

  if (lockoutStatus.locked) {
    log.warn('authentication validation failed - account locked', {
      operation: 'validate_user_for_auth',
      userId: user.user_id,
      email: email.replace(/(.{2}).*@/, '$1***@'),
      reason: 'account_locked',
      lockedUntil: lockoutStatus.lockedUntil,
      duration: Date.now() - startTime,
      component: 'auth',
    });

    throw new UserLookupError(
      UserLookupErrorCode.ACCOUNT_LOCKED,
      'Account temporarily locked due to multiple failed attempts. Please try again later.',
      {
        userId: user.user_id,
        lockedUntil: lockoutStatus.lockedUntil,
      }
    );
  }

  // Detect SSO-only users (no password hash)
  const isSSOOnly = !user.password_hash;

  const duration = Date.now() - startTime;
  log.debug('authentication validation successful', {
    operation: 'validate_user_for_auth',
    userId: user.user_id,
    email: email.replace(/(.{2}).*@/, '$1***@'),
    isActive: user.is_active,
    isLocked: lockoutStatus.locked,
    isSSOOnly,
    duration,
    component: 'auth',
  });

  return {
    user,
    isLocked: lockoutStatus.locked,
    ...(lockoutStatus.lockedUntil ? { lockedUntil: lockoutStatus.lockedUntil } : {}),
    isSSOOnly,
  };
}

/**
 * Invalidate user cache (both by email and by ID)
 *
 * ⚠️ **CRITICAL**: This function MUST be called after any user data modification to prevent stale cache data.
 *
 * REQUIRED AFTER:
 * - ✅ Email change: `await invalidateUserCache(userId, oldEmail)`
 * - ✅ Password change: `await invalidateUserCache(userId, user.email)`
 * - ✅ Status change (is_active): `await invalidateUserCache(userId, user.email)`
 * - ✅ User deletion: `await invalidateUserCache(userId, user.email)`
 * - ✅ SSO configuration change: `await invalidateUserCache(userId, user.email)`
 * - ✅ provider_uid change: `await invalidateUserCache(userId, user.email)`
 *
 * EXAMPLE:
 * ```typescript
 * // After updating user password
 * await db.update(users).set({ password_hash: newHash }).where(eq(users.user_id, userId));
 * await invalidateUserCache(userId, user.email); // ← REQUIRED
 * ```
 *
 * @param userId - User UUID
 * @param email - User email (optional, if known - recommended for complete invalidation)
 */
export async function invalidateUserCache(userId: string, email?: string): Promise<void> {
  // Invalidate by ID
  await userLookupCache.invalidateUserById(userId);

  // Invalidate by email if provided
  if (email) {
    const normalizedEmail = email.toLowerCase().trim();
    await userLookupCache.deleteUserByEmail(normalizedEmail);
  }

  log.debug('user cache invalidated', {
    operation: 'invalidate_user_cache',
    userId,
    email: email?.replace(/(.{2}).*@/, '$1***@'),
    component: 'auth',
  });
}

/**
 * Check if user is SSO-only (no password authentication available)
 *
 * @param user - User object
 * @returns true if user is SSO-only, false otherwise
 */
export function isUserSSOOnly(user: User): boolean {
  return !user.password_hash;
}

/**
 * Check if user has password authentication enabled
 *
 * @param user - User object
 * @returns true if user can authenticate with password, false otherwise
 */
export function canUserAuthenticateWithPassword(user: User): boolean {
  return !!user.password_hash;
}
