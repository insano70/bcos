/**
 * Security Admin Actions Service
 *
 * Handles admin security operations on user accounts.
 * - Unlock locked accounts
 * - Clear failed login attempts
 * - Flag/unflag suspicious users
 *
 * All operations create audit trail entries and use transactions for data integrity.
 *
 * **Non-CRUD Service** - Security administration operations only
 *
 * ## Error Handling Strategy
 *
 * - **Authorization Errors**: Service constructor throws `AuthorizationError` if user is not super admin
 * - **Validation Errors**: Invalid userId format throws `ValidationError` with clear message
 * - **Not Found Errors**: Missing user or security record throws `NotFoundError`
 * - **Transaction Failures**: Database errors propagate as-is (transaction auto-rollback)
 * - **Audit Log Failures**: Fire-and-forget - logged but don't fail the operation
 * - **No Graceful Degradation**: Write operations must succeed or fail explicitly
 *
 * @example
 * ```typescript
 * const service = createSecurityAdminActionsService(userContext);
 * await service.unlockAccount('user-123', {
 *   reason: 'Admin override - verified legitimate',
 *   ipAddress: '192.168.1.1'
 * });
 * ```
 */

// Third-party libraries
import { eq } from 'drizzle-orm';

// Database
import { account_security, db, users } from '@/lib/db';

// API responses
import { NotFoundError, ValidationError } from '@/lib/api/responses/error';

// API services
import { AuditLogger } from '@/lib/api/services/audit';

// API utilities
import { requireSuperAdmin } from '@/lib/api/utils/rbac-guards';

// Logging
import { calculateChanges, log, logTemplates } from '@/lib/logger';

// Types
import type { UserContext } from '@/lib/types/rbac';

// Constants
import { UUID_REGEX } from '@/lib/constants/security-monitoring';

// ============================================================
// INTERFACES
// ============================================================

export interface SecurityAdminActionsServiceInterface {
  /**
   * Unlock a locked user account
   *
   * Removes account lock, resets failed login attempts, and clears suspicious activity flag.
   * Operation is atomic (uses database transaction) and creates audit trail entry.
   *
   * @param userId - User ID to unlock (must be valid UUID)
   * @param data - Unlock request with reason and IP address for audit trail
   * @returns Promise resolving to unlock result with previous security status
   * @throws {AuthorizationError} If user is not super admin
   * @throws {ValidationError} If userId is not a valid UUID
   * @throws {NotFoundError} If user or security record not found
   *
   * @example
   * ```typescript
   * const result = await service.unlockAccount('user-123', {
   *   reason: 'Verified legitimate user - locked by mistake',
   *   ipAddress: '192.168.1.1'
   * });
   * console.log(`Unlocked ${result.userEmail}`);
   * console.log(`Previous failed attempts: ${result.previousStatus.failedAttempts}`);
   * ```
   */
  unlockAccount(userId: string, data: UnlockAccountData): Promise<UnlockAccountResult>;

  /**
   * Clear failed login attempts counter
   *
   * Resets the failed login attempts counter to zero. Does NOT unlock the account
   * or change suspicious activity flag - use unlockAccount() for full reset.
   * Operation is atomic (uses database transaction) and creates audit trail entry.
   *
   * @param userId - User ID (must be valid UUID)
   * @param data - Request with reason and IP address for audit trail
   * @returns Promise resolving to result with previous failed attempts count
   * @throws {AuthorizationError} If user is not super admin
   * @throws {ValidationError} If userId is not a valid UUID
   * @throws {NotFoundError} If user or security record not found
   *
   * @example
   * ```typescript
   * const result = await service.clearFailedAttempts('user-123', {
   *   reason: 'Reset counter after investigation',
   *   ipAddress: '192.168.1.1'
   * });
   * console.log(`Cleared ${result.previousFailedAttempts} failed attempts for ${result.userEmail}`);
   * ```
   */
  clearFailedAttempts(userId: string, data: ClearAttemptsData): Promise<ClearAttemptsResult>;

  /**
   * Flag or unflag user as suspicious
   *
   * Sets or clears the suspicious activity flag on a user account.
   * Operation is atomic (uses database transaction) and creates audit trail entry.
   *
   * @param userId - User ID (must be valid UUID)
   * @param data - Flag request with flag value, reason, and IP address for audit trail
   * @returns Promise resolving to result with previous and current flag status
   * @throws {AuthorizationError} If user is not super admin
   * @throws {ValidationError} If userId is not a valid UUID
   * @throws {NotFoundError} If user or security record not found
   *
   * @example
   * ```typescript
   * // Flag user as suspicious
   * const result = await service.flagUser('user-123', {
   *   flag: true,
   *   reason: 'Unusual login pattern detected',
   *   ipAddress: '192.168.1.1'
   * });
   * console.log(`${result.userEmail} flagged: ${result.previousFlag} -> ${result.currentFlag}`);
   *
   * // Unflag user
   * await service.flagUser('user-123', {
   *   flag: false,
   *   reason: 'Verified as legitimate activity',
   *   ipAddress: '192.168.1.1'
   * });
   * ```
   */
  flagUser(userId: string, data: FlagUserData): Promise<FlagUserResult>;
}

export interface UnlockAccountData {
  /** Reason for unlocking (required for audit trail) */
  reason: string;
  /** IP address of admin performing action (for audit trail) */
  ipAddress: string;
}

export interface ClearAttemptsData {
  /** Reason for clearing attempts (required for audit trail) */
  reason: string;
  /** IP address of admin performing action (for audit trail) */
  ipAddress: string;
}

export interface FlagUserData {
  /** True to flag as suspicious, false to unflag */
  flag: boolean;
  /** Reason for flagging/unflagging (required for audit trail) */
  reason: string;
  /** IP address of admin performing action (for audit trail) */
  ipAddress: string;
}

export interface UnlockAccountResult {
  /** Always true for successful unlock */
  success: true;
  /** User ID that was unlocked */
  userId: string;
  /** Email of the unlocked user */
  userEmail: string;
  /** Previous security status before unlock */
  previousStatus: {
    /** Failed login attempts before unlock */
    failedAttempts: number;
    /** Lock expiration timestamp (ISO string) or null if not locked */
    lockedUntil: string | null;
    /** Suspicious activity flag before unlock */
    suspiciousActivity: boolean;
  };
}

export interface ClearAttemptsResult {
  /** Always true for successful clear */
  success: true;
  /** User ID */
  userId: string;
  /** Email of the user */
  userEmail: string;
  /** Failed attempts count before clearing */
  previousFailedAttempts: number;
}

export interface FlagUserResult {
  /** Always true for successful flag operation */
  success: true;
  /** User ID */
  userId: string;
  /** Email of the user */
  userEmail: string;
  /** Suspicious flag value before operation */
  previousFlag: boolean;
  /** Suspicious flag value after operation */
  currentFlag: boolean;
}

// ============================================================
// IMPLEMENTATION
// ============================================================

class SecurityAdminActionsService {
  constructor(private readonly userContext: UserContext) {
    requireSuperAdmin(userContext, 'security administration');
  }

  async unlockAccount(userId: string, data: UnlockAccountData): Promise<UnlockAccountResult> {
    const startTime = Date.now();

    // Validate UUID format
    if (!UUID_REGEX.test(userId)) {
      throw ValidationError('Invalid userId format');
    }

    try {
      // Use transaction for atomic operation
      return await db.transaction(async (tx) => {
        // Verify user exists
        const [user] = await tx
          .select({
            userId: users.user_id,
            email: users.email,
            firstName: users.first_name,
            lastName: users.last_name,
          })
          .from(users)
          .where(eq(users.user_id, userId))
          .limit(1);

        if (!user) {
          throw NotFoundError('User');
        }

        // Get current security status
        const [securityStatus] = await tx
          .select()
          .from(account_security)
          .where(eq(account_security.user_id, userId))
          .limit(1);

        if (!securityStatus) {
          throw NotFoundError('User security record');
        }

        // Store previous status for audit log
        const previousStatus = {
          failedAttempts: securityStatus.failed_login_attempts,
          lockedUntil: securityStatus.locked_until?.toISOString() || null,
          suspiciousActivity: securityStatus.suspicious_activity_detected,
        };

        // Update account_security: unlock account and reset counters
        await tx
          .update(account_security)
          .set({
            failed_login_attempts: 0,
            locked_until: null,
            suspicious_activity_detected: false,
            lockout_reason: null,
            updated_at: new Date(),
          })
          .where(eq(account_security.user_id, userId));

        // Audit trail (fire and forget - outside transaction)
        AuditLogger.logUserAction({
          action: 'user_account_unlocked',
          userId: this.userContext.user_id,
          resourceType: 'user',
          resourceId: userId,
          ipAddress: data.ipAddress,
          metadata: {
            reason: data.reason,
            previousFailedAttempts: previousStatus.failedAttempts,
            previousLockedUntil: previousStatus.lockedUntil,
            previousSuspiciousActivity: previousStatus.suspiciousActivity,
            targetUserEmail: user.email,
            targetUserName: `${user.firstName} ${user.lastName}`,
          },
        }).catch((err) => {
          log.error('audit log failed for unlock', err, {
            operation: 'unlock_account_audit',
            userId: this.userContext.user_id,
            targetUserId: userId,
            component: 'service',
          });
        });

        const duration = Date.now() - startTime;

        const template = logTemplates.crud.update('account_unlock', {
          resourceId: userId,
          resourceName: user.email,
          userId: this.userContext.user_id,
          changes: calculateChanges(securityStatus, {
            failed_login_attempts: 0,
            locked_until: null,
            suspicious_activity_detected: false,
            lockout_reason: null,
          }),
          duration,
        });

        log.info(template.message, template.context);

        log.security('user_account_unlocked', 'medium', {
          action: 'admin_unlock',
          adminUserId: this.userContext.user_id,
          targetUserId: userId,
          reason: data.reason,
        });

        return {
          success: true,
          userId,
          userEmail: user.email,
          previousStatus,
        };
      });
    } catch (error) {
      log.error('unlock account failed', error, {
        operation: 'unlock_account',
        userId: this.userContext.user_id,
        targetUserId: userId,
        duration: Date.now() - startTime,
        component: 'service',
      });
      throw error;
    }
  }

  async clearFailedAttempts(
    userId: string,
    data: ClearAttemptsData
  ): Promise<ClearAttemptsResult> {
    const startTime = Date.now();

    // Validate UUID format
    if (!UUID_REGEX.test(userId)) {
      throw ValidationError('Invalid userId format');
    }

    try {
      return await db.transaction(async (tx) => {
        // Verify user exists
        const [user] = await tx
          .select({
            userId: users.user_id,
            email: users.email,
            firstName: users.first_name,
            lastName: users.last_name,
          })
          .from(users)
          .where(eq(users.user_id, userId))
          .limit(1);

        if (!user) {
          throw NotFoundError('User');
        }

        // Get current security status
        const [securityStatus] = await tx
          .select()
          .from(account_security)
          .where(eq(account_security.user_id, userId))
          .limit(1);

        if (!securityStatus) {
          throw NotFoundError('User security record');
        }

        const previousFailedAttempts = securityStatus.failed_login_attempts;

        // Update account_security: reset failed attempts only
        // Keep locked_until unchanged - if account is locked, it stays locked
        await tx
          .update(account_security)
          .set({
            failed_login_attempts: 0,
            updated_at: new Date(),
          })
          .where(eq(account_security.user_id, userId));

        // Audit trail (fire and forget)
        AuditLogger.logUserAction({
          action: 'user_failed_attempts_cleared',
          userId: this.userContext.user_id,
          resourceType: 'user',
          resourceId: userId,
          ipAddress: data.ipAddress,
          metadata: {
            reason: data.reason,
            previousFailedAttempts,
            targetUserEmail: user.email,
            targetUserName: `${user.firstName} ${user.lastName}`,
            lockedUntilUnchanged: securityStatus.locked_until?.toISOString() || null,
          },
        }).catch((err) => {
          log.error('audit log failed for clear attempts', err, {
            operation: 'clear_attempts_audit',
            userId: this.userContext.user_id,
            targetUserId: userId,
            component: 'service',
          });
        });

        const duration = Date.now() - startTime;

        log.info('failed attempts cleared', {
          operation: 'clear_failed_attempts',
          userId: this.userContext.user_id,
          targetUserId: userId,
          targetUserEmail: user.email,
          previousFailedAttempts,
          duration,
          component: 'service',
        });

        log.security('user_failed_attempts_cleared', 'low', {
          action: 'admin_clear_attempts',
          adminUserId: this.userContext.user_id,
          targetUserId: userId,
          reason: data.reason,
        });

        return {
          success: true,
          userId,
          userEmail: user.email,
          previousFailedAttempts,
        };
      });
    } catch (error) {
      log.error('clear failed attempts failed', error, {
        operation: 'clear_failed_attempts',
        userId: this.userContext.user_id,
        targetUserId: userId,
        duration: Date.now() - startTime,
        component: 'service',
      });
      throw error;
    }
  }

  async flagUser(userId: string, data: FlagUserData): Promise<FlagUserResult> {
    const startTime = Date.now();

    // Validate UUID format
    if (!UUID_REGEX.test(userId)) {
      throw ValidationError('Invalid userId format');
    }

    try {
      return await db.transaction(async (tx) => {
        // Verify user exists
        const [user] = await tx
          .select({
            userId: users.user_id,
            email: users.email,
            firstName: users.first_name,
            lastName: users.last_name,
          })
          .from(users)
          .where(eq(users.user_id, userId))
          .limit(1);

        if (!user) {
          throw NotFoundError('User');
        }

        // Get current security status
        const [securityStatus] = await tx
          .select()
          .from(account_security)
          .where(eq(account_security.user_id, userId))
          .limit(1);

        if (!securityStatus) {
          throw NotFoundError('User security record');
        }

        const previousFlag = securityStatus.suspicious_activity_detected;

        // Skip if already in desired state
        if (previousFlag === data.flag) {
          return {
            success: true,
            userId,
            userEmail: user.email,
            previousFlag,
            currentFlag: data.flag,
          };
        }

        // Update account_security: set suspicious activity flag
        await tx
          .update(account_security)
          .set({
            suspicious_activity_detected: data.flag,
            updated_at: new Date(),
          })
          .where(eq(account_security.user_id, userId));

        // Audit trail (fire and forget)
        AuditLogger.logUserAction({
          action: data.flag ? 'user_flagged_suspicious' : 'user_unflagged',
          userId: this.userContext.user_id,
          resourceType: 'user',
          resourceId: userId,
          ipAddress: data.ipAddress,
          metadata: {
            reason: data.reason,
            previousFlag,
            newFlag: data.flag,
            targetUserEmail: user.email,
            targetUserName: `${user.firstName} ${user.lastName}`,
            failedLoginAttempts: securityStatus.failed_login_attempts,
            lockedUntil: securityStatus.locked_until?.toISOString() || null,
          },
        }).catch((err) => {
          log.error('audit log failed for flag user', err, {
            operation: 'flag_user_audit',
            userId: this.userContext.user_id,
            targetUserId: userId,
            component: 'service',
          });
        });

        const duration = Date.now() - startTime;

        log.info(`user ${data.flag ? 'flagged' : 'unflagged'}`, {
          operation: data.flag ? 'flag_user' : 'unflag_user',
          userId: this.userContext.user_id,
          targetUserId: userId,
          targetUserEmail: user.email,
          previousFlag,
          newFlag: data.flag,
          duration,
          component: 'service',
        });

        log.security(data.flag ? 'user_flagged_suspicious' : 'user_unflagged', 'medium', {
          action: 'admin_flag_change',
          adminUserId: this.userContext.user_id,
          targetUserId: userId,
          flag: data.flag,
          reason: data.reason,
        });

        return {
          success: true,
          userId,
          userEmail: user.email,
          previousFlag,
          currentFlag: data.flag,
        };
      });
    } catch (error) {
      log.error('flag user failed', error, {
        operation: 'flag_user',
        userId: this.userContext.user_id,
        targetUserId: userId,
        duration: Date.now() - startTime,
        component: 'service',
      });
      throw error;
    }
  }
}

// ============================================================
// FACTORY
// ============================================================

/**
 * Create Security Admin Actions Service
 *
 * Handles admin security operations on user accounts.
 * Super admin access required.
 *
 * @param userContext - User context (must be super admin)
 * @returns Service interface
 * @throws {AuthorizationError} If user is not super admin
 *
 * @example
 * ```typescript
 * const service = createSecurityAdminActionsService(userContext);
 *
 * // Unlock a locked account
 * await service.unlockAccount('user-123', {
 *   reason: 'Verified legitimate user - locked by mistake',
 *   ipAddress: request.headers.get('x-forwarded-for') || ''
 * });
 *
 * // Clear failed attempts without unlocking
 * await service.clearFailedAttempts('user-456', {
 *   reason: 'Reset counter after investigation',
 *   ipAddress: request.headers.get('x-forwarded-for') || ''
 * });
 *
 * // Flag user as suspicious
 * await service.flagUser('user-789', {
 *   flag: true,
 *   reason: 'Unusual login pattern detected',
 *   ipAddress: request.headers.get('x-forwarded-for') || ''
 * });
 * ```
 */
export function createSecurityAdminActionsService(
  userContext: UserContext
): SecurityAdminActionsServiceInterface {
  return new SecurityAdminActionsService(userContext);
}
