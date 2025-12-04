/**
 * Authentication Cache Service
 *
 * Handles caching for authentication-related data:
 * - Token blacklist (revoked tokens)
 * - User data (basic user info for auth)
 *
 * KEY NAMING CONVENTION:
 *   auth:token:blacklist:{jti}
 *   auth:user:{userId}
 *
 * TTL STRATEGY:
 * - Token blacklist checks: 1 minute (fast but can tolerate short staleness)
 * - Token blacklist confirmed: 1 hour (once confirmed blacklisted, cache longer)
 * - User data: 5 minutes (balance between freshness and performance)
 */

import { eq } from 'drizzle-orm';
import { db, token_blacklist, users } from '@/lib/db';
import { log } from '@/lib/logger';
import { CacheService } from './base';

/**
 * User type from database
 */
interface User {
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  password_hash: string | null;
  email_verified: boolean | null;
  is_active: boolean | null;
  provider_uid: number | null; // Analytics provider filtering
  created_at: Date | null;
  updated_at: Date | null;
  deleted_at: Date | null;
}

/**
 * Blacklist cache entry
 */
interface BlacklistEntry {
  blacklisted: boolean;
  cachedAt: number;
}

/**
 * Authentication cache service
 */
class AuthCacheService extends CacheService {
  protected namespace = 'auth';
  protected defaultTTL = 300; // 5 minutes

  // TTL constants
  private readonly BLACKLIST_CHECK_TTL = 60; // 1 minute for regular checks
  private readonly BLACKLIST_CONFIRMED_TTL = 3600; // 1 hour after confirming blacklisted
  private readonly USER_DATA_TTL = 300; // 5 minutes

  /**
   * Check if token is blacklisted (with caching)
   *
   * @param jti - JWT token ID
   * @returns true if blacklisted, false otherwise
   */
  async isTokenBlacklisted(jti: string): Promise<boolean> {
    // Key: auth:token:blacklist:{jti}
    const key = this.buildKey('token', 'blacklist', jti);
    const cached = await this.get<BlacklistEntry>(key);

    if (cached !== null) {
      return cached.blacklisted;
    }

    // Cache miss - query database
    const blacklisted = await this.checkBlacklistInDatabase(jti);

    // Cache the result (fire and forget)
    // Silent failure is intentional - cache write shouldn't block blacklist check
    const ttl = blacklisted ? this.BLACKLIST_CONFIRMED_TTL : this.BLACKLIST_CHECK_TTL;
    this.set(key, { blacklisted, cachedAt: Date.now() }, { ttl }).catch((e) => {
      log.debug('Blacklist cache write failed (non-blocking)', {
        component: 'auth-cache',
        jti: jti.substring(0, 8),
        error: e instanceof Error ? e.message : String(e),
      });
    });

    return blacklisted;
  }

  /**
   * Add token to blacklist (updates both cache and database)
   *
   * @param jti - JWT token ID
   * @param userId - User ID who owns the token
   * @param tokenType - Type of token ('access' or 'refresh')
   * @param expiresAt - When the token expires
   * @param reason - Reason for blacklisting
   * @param blacklistedBy - User ID who blacklisted the token (optional)
   * @param ipAddress - IP address (optional)
   * @param userAgent - User agent (optional)
   */
  async addTokenToBlacklist(
    jti: string,
    userId: string,
    tokenType: 'access' | 'refresh',
    expiresAt: Date,
    reason: string,
    blacklistedBy?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    // Insert into database
    await db.insert(token_blacklist).values({
      jti,
      user_id: userId,
      token_type: tokenType,
      expires_at: expiresAt,
      reason,
      blacklisted_by: blacklistedBy || null,
      ip_address: ipAddress || null,
      user_agent: userAgent || null,
    });

    // Update cache (fire and forget)
    // Silent failure is intentional - database is source of truth, cache is optional
    const key = this.buildKey('token', 'blacklist', jti);
    this.set(
      key,
      { blacklisted: true, cachedAt: Date.now() },
      { ttl: this.BLACKLIST_CONFIRMED_TTL }
    ).catch((e) => {
      log.debug('Blacklist cache update failed (non-blocking)', {
        component: 'auth-cache',
        jti: jti.substring(0, 8),
        error: e instanceof Error ? e.message : String(e),
      });
    });

    log.info('Token added to blacklist', {
      component: 'auth-cache',
      jti: jti.substring(0, 8),
      userId,
      tokenType,
      reason,
    });
  }

  /**
   * Get user data from cache or database
   *
   * @param userId - User ID
   * @returns User object or null if not found
   */
  async getUser(userId: string): Promise<User | null> {
    // Key: auth:user:{userId}
    const key = this.buildKey('user', userId);
    const cached = await this.get<User>(key);

    if (cached !== null) {
      return cached;
    }

    // Cache miss - query database
    const user = await this.getUserFromDatabase(userId);

    if (user) {
      // Cache for 5 minutes (fire and forget)
      // Silent failure is intentional - database is source of truth, cache is optional
      this.set(key, user, { ttl: this.USER_DATA_TTL }).catch((e) => {
        log.debug('User cache write failed (non-blocking)', {
          component: 'auth-cache',
          userId,
          error: e instanceof Error ? e.message : String(e),
        });
      });
    }

    return user;
  }

  /**
   * Invalidate user cache
   *
   * @param userId - User ID to invalidate (if not provided, does nothing)
   */
  async invalidate(userId?: string): Promise<void> {
    if (!userId) {
      return;
    }

    const key = this.buildKey('user', userId);
    await this.del(key);

    log.debug('User cache invalidated', {
      component: 'auth-cache',
      userId,
    });
  }

  /**
   * Query database for token blacklist
   */
  private async checkBlacklistInDatabase(jti: string): Promise<boolean> {
    const [blacklisted] = await db
      .select()
      .from(token_blacklist)
      .where(eq(token_blacklist.jti, jti))
      .limit(1);

    return !!blacklisted;
  }

  /**
   * Query database for user data
   */
  private async getUserFromDatabase(userId: string): Promise<User | null> {
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
      .where(eq(users.user_id, userId))
      .limit(1);

    return user || null;
  }
}

// Export singleton instance
export const authCache = new AuthCacheService();
