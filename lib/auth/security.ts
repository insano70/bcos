import bcrypt from 'bcrypt';
import { eq, lt } from 'drizzle-orm';
import { validatePasswordStrength as validatePasswordStrengthPolicy } from '@/lib/config/password-policy';
import { account_security, db, users } from '@/lib/db';
import { log } from '@/lib/logger';

/**
 * Password Security - Pure Functions Module
 * Handles password hashing, verification, and strength validation
 */

/**
 * Bcrypt salt rounds for password hashing
 */
export const BCRYPT_SALT_ROUNDS = 12;

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

/**
 * Verify a password against a hash using bcrypt
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

/**
 * Validate password strength using centralized policy
 * ✅ SINGLE SOURCE OF TRUTH: Uses lib/config/password-policy.ts
 */
export function validatePasswordStrength(password: string): { isValid: boolean; errors: string[] } {
  return validatePasswordStrengthPolicy(password);
}

/**
 * Account Security - Pure Functions Module
 * Handles account lockout, failed login attempts, and security record management
 * Database-backed with HIPAA-compliant defaults
 */

/**
 * Progressive lockout timeouts based on failed attempt count
 * - 3 attempts: 1 minute
 * - 4 attempts: 5 minutes
 * - 5+ attempts: 15 minutes
 */
export const PROGRESSIVE_LOCKOUT_TIMEOUTS = [
  1 * 60 * 1000, // 1 minute after 3 attempts
  5 * 60 * 1000, // 5 minutes after 4 attempts
  15 * 60 * 1000, // 15 minutes after 5+ attempts
];

/**
 * Ensure account_security record exists for a user
 * Creates record with HIPAA-compliant defaults if missing
 * This function is idempotent and safe to call multiple times
 *
 * @param userId - The user's UUID
 * @returns The security record (existing or newly created)
 */
export async function ensureSecurityRecord(userId: string): Promise<{
    user_id: string;
    failed_login_attempts: number;
    last_failed_attempt: Date | null;
    locked_until: Date | null;
    lockout_reason: string | null;
    max_concurrent_sessions: number;
    require_fresh_auth_minutes: number;
    password_changed_at: Date | null;
    last_password_reset: Date | null;
    suspicious_activity_detected: boolean;
    created_at: Date;
    updated_at: Date;
  }> {
  try {
    // Check if record exists
    const [existing] = await db
      .select()
      .from(account_security)
      .where(eq(account_security.user_id, userId))
      .limit(1);

    if (existing) {
      return existing;
    }

    // Create new record with HIPAA-compliant defaults
    const [newRecord] = await db
      .insert(account_security)
      .values({
        user_id: userId,
        failed_login_attempts: 0,
        last_failed_attempt: null,
        locked_until: null,
        lockout_reason: null,
        max_concurrent_sessions: 3, // Conservative default for HIPAA compliance
        require_fresh_auth_minutes: 5, // Step-up authentication requirement
        password_changed_at: null,
        last_password_reset: null,
        suspicious_activity_detected: false,
      })
      .returning();

    if (!newRecord) {
      throw new Error('Failed to create account_security record');
    }

    // Log security event for new record creation
    log.security('account_security_record_created', 'low', {
      action: 'security_record_initialization',
      userId,
      reason: 'ensure_on_access',
      defaults: {
        max_concurrent_sessions: 3,
        require_fresh_auth_minutes: 5,
        failed_login_attempts: 0,
      },
    });

    return newRecord;
  } catch (error) {
    // If the error is a unique constraint violation, the record was created by another request
    // Re-fetch and return it
    if (error instanceof Error && error.message.includes('unique')) {
      const [existing] = await db
        .select()
        .from(account_security)
        .where(eq(account_security.user_id, userId))
        .limit(1);

      if (existing) {
        return existing;
      }
    }

    // For any other error, log and re-throw
    log.error('Failed to ensure account security record', {
      error: error instanceof Error ? error.message : String(error),
      userId,
      operation: 'ensureSecurityRecord',
    });
    throw error;
  }
}

/**
 * Check if an account is currently locked
 * @param identifier - User email address
 * @returns Locked status and expiration time
 */
export async function isAccountLocked(
    identifier: string
  ): Promise<{ locked: boolean; lockedUntil?: number }> {
    try {
      // For login attempts, the identifier is the email, but we need to find the user_id first
      // Get user by email to find user_id
      const [user] = await db
        .select({ user_id: users.user_id })
        .from(users)
        .where(eq(users.email, identifier))
        .limit(1);

      if (!user) {
        return { locked: false };
      }

      // Ensure security record exists for this user
      const securityRecord = await ensureSecurityRecord(user.user_id);

      const now = new Date();

      // Check if lockout has expired
      if (securityRecord.locked_until && now > securityRecord.locked_until) {
        // Clear expired lockout
        await db
          .update(account_security)
          .set({
            locked_until: null,
            suspicious_activity_detected: false,
          })
          .where(eq(account_security.user_id, user.user_id));
        return { locked: false };
      }

      // Check if account is currently locked
      if (
        securityRecord.failed_login_attempts >= 3 &&
        securityRecord.locked_until &&
        now <= securityRecord.locked_until
      ) {
        return { locked: true, lockedUntil: securityRecord.locked_until.getTime() };
      }

      return { locked: false };
    } catch (error) {
      log.error('Error checking account lockout status', {
        error: error instanceof Error ? error.message : String(error),
        identifier,
        operation: 'isAccountLocked',
      });
      return { locked: false }; // Fail open on database errors
    }
  }

/**
 * Record a failed login attempt and apply progressive lockout
 * @param identifier - User email address
 * @returns Locked status and expiration time
 */
export async function recordFailedAttempt(
  identifier: string
): Promise<{ locked: boolean; lockedUntil?: number }> {
  try {
    const now = new Date();

    // Get user by email to find user_id
    const [user] = await db
      .select({ user_id: users.user_id })
      .from(users)
      .where(eq(users.email, identifier))
      .limit(1);

    if (!user) {
      // User doesn't exist, but still return as if we recorded the attempt for security
      return { locked: false };
    }

    // Ensure security record exists for this user
    const existing = await ensureSecurityRecord(user.user_id);

    // Calculate new failed attempts count
    const failedAttempts = existing.failed_login_attempts + 1;

    // Apply progressive lockout
    let lockedUntil: Date | null = null;
    if (failedAttempts >= 3) {
      const lockoutIndex = Math.min(
        failedAttempts - 3,
        PROGRESSIVE_LOCKOUT_TIMEOUTS.length - 1
      );
      const lockoutDuration = PROGRESSIVE_LOCKOUT_TIMEOUTS[lockoutIndex] || 0;
      lockedUntil = new Date(now.getTime() + lockoutDuration);
    }

    // Update security record
    await db
      .update(account_security)
      .set({
        failed_login_attempts: failedAttempts,
        last_failed_attempt: now,
        locked_until: lockedUntil,
        suspicious_activity_detected: failedAttempts >= 3,
      })
      .where(eq(account_security.user_id, user.user_id));

    const isLocked = lockedUntil !== null && now <= lockedUntil;
    const result: { locked: boolean; lockedUntil?: number } = { locked: isLocked };
    if (lockedUntil) {
      result.lockedUntil = lockedUntil.getTime();
    }
    return result;
  } catch (error) {
    log.error('Error recording failed attempt', {
      error: error instanceof Error ? error.message : String(error),
      identifier,
      operation: 'recordFailedAttempt',
    });
    return { locked: false }; // Fail open on database errors
  }
}

/**
 * Clear all failed login attempts and reset lockout for an account
 * @param identifier - User email address
 */
export async function clearFailedAttempts(identifier: string): Promise<void> {
  try {
    // Get user by email to find user_id
    const [user] = await db
      .select({ user_id: users.user_id })
      .from(users)
      .where(eq(users.email, identifier))
      .limit(1);

    if (!user) {
      return; // User doesn't exist, nothing to clear
    }

    // Ensure security record exists for this user
    await ensureSecurityRecord(user.user_id);

    // Clear failed attempts and lockout
    await db
      .update(account_security)
      .set({
        failed_login_attempts: 0,
        last_failed_attempt: null,
        locked_until: null,
        suspicious_activity_detected: false,
      })
      .where(eq(account_security.user_id, user.user_id));
  } catch (error) {
    log.error('Error clearing failed attempts', {
      error: error instanceof Error ? error.message : String(error),
      identifier,
      operation: 'clearFailedAttempts',
    });
  }
}

/**
 * Get the current failed login attempt count for an account
 * @param identifier - User email address
 * @returns Number of failed attempts
 */
export async function getFailedAttemptCount(identifier: string): Promise<number> {
  try {
    // Get user by email to find user_id
    const [user] = await db
      .select({ user_id: users.user_id })
      .from(users)
      .where(eq(users.email, identifier))
      .limit(1);

    if (!user) {
      return 0; // User doesn't exist
    }

    // Ensure security record exists for this user
    const securityRecord = await ensureSecurityRecord(user.user_id);

    return securityRecord.failed_login_attempts;
  } catch (error) {
    log.error('Error getting failed attempt count', {
      error: error instanceof Error ? error.message : String(error),
      identifier,
      operation: 'getFailedAttemptCount',
    });
    return 0;
  }
}

/**
 * Clean up expired lockout records
 * Updates security records where lockout period has expired
 * @returns Number of records updated
 */
export async function cleanupExpiredLockouts(): Promise<number> {
  try {
    const now = new Date();
    // Update expired lockouts instead of deleting records
    const result = await db
      .update(account_security)
      .set({
        locked_until: null,
        suspicious_activity_detected: false,
      })
      .where(lt(account_security.locked_until, now));

    return Array.isArray(result) ? result.length : 0;
  } catch (error) {
    log.error('Error cleaning up expired lockouts', {
      error: error instanceof Error ? error.message : String(error),
      operation: 'cleanupExpiredLockouts',
    });
    return 0;
  }
}
