/**
 * MFA Skip Tracker Service
 * Manages graceful MFA onboarding with skip tracking
 *
 * Security Features:
 * - Fail-closed: When skips exhausted, MFA is mandatory
 * - Audit trail: All skips logged for compliance
 * - Transparent: Users see remaining skip count
 * - Progressive enforcement: Becomes mandatory after 5 skips
 */

import { eq } from 'drizzle-orm';
import { AuditLogger } from '@/lib/api/services/audit';
import { account_security, db } from '@/lib/db';
import { log } from '@/lib/logger';

export interface MFASkipStatus {
  skips_remaining: number;
  skip_count: number;
  first_skipped_at: Date | null;
  last_skipped_at: Date | null;
}

/**
 * Get MFA skip status for a user
 * Returns current skip state including remaining skips and audit timestamps
 *
 * @param userId - User ID to check
 * @returns Skip status with remaining count and timestamps
 */
export async function getMFASkipStatus(userId: string): Promise<MFASkipStatus> {
  // Ensure security record exists before querying
  const { ensureSecurityRecord } = await import('./security');
  await ensureSecurityRecord(userId);

  const [security] = await db
    .select()
    .from(account_security)
    .where(eq(account_security.user_id, userId))
    .limit(1);

  return {
    skips_remaining: security?.mfa_skips_remaining ?? 5,
    skip_count: security?.mfa_skip_count ?? 0,
    first_skipped_at: security?.mfa_first_skipped_at ?? null,
    last_skipped_at: security?.mfa_last_skipped_at ?? null,
  };
}

/**
 * Record MFA setup skip
 * Decrements skips_remaining, increments skip_count, updates timestamps
 *
 * Security: Fails if no skips remaining (fail-closed)
 * Audit: Logs all skips to audit_logs table
 *
 * @param userId - User ID skipping MFA setup
 * @param ipAddress - Client IP address for audit
 * @param userAgent - Client user agent for audit
 * @returns Success status and remaining skips
 * @throws Error if no skips remaining
 */
export async function recordMFASkip(
  userId: string,
  ipAddress: string,
  userAgent: string | null
): Promise<{ success: boolean; skips_remaining: number }> {
  const currentStatus = await getMFASkipStatus(userId);

  // Fail-closed: No skips remaining
  if (currentStatus.skips_remaining <= 0) {
    log.security('mfa_skip_denied', 'medium', {
      userId,
      reason: 'no_skips_remaining',
      blocked: true,
      threat: 'skip_limit_exceeded',
    });

    throw new Error('No MFA skips remaining. Setup is now required.');
  }

  const now = new Date();
  const newSkipsRemaining = currentStatus.skips_remaining - 1;
  const newSkipCount = currentStatus.skip_count + 1;

  // Update skip counters and timestamps
  await db
    .update(account_security)
    .set({
      mfa_skips_remaining: newSkipsRemaining,
      mfa_skip_count: newSkipCount,
      mfa_first_skipped_at: currentStatus.first_skipped_at || now,
      mfa_last_skipped_at: now,
      updated_at: now,
    })
    .where(eq(account_security.user_id, userId));

  // Audit log for compliance
  await AuditLogger.logAuth({
    action: 'mfa_setup_skipped',
    userId,
    ipAddress,
    userAgent: userAgent || undefined,
    metadata: {
      skipsRemaining: newSkipsRemaining,
      totalSkips: newSkipCount,
      isFirstSkip: newSkipCount === 1,
      isFinalSkip: newSkipsRemaining === 0,
    },
  });

  log.info('mfa setup skipped', {
    operation: 'mfa_skip',
    userId,
    skipsRemaining: newSkipsRemaining,
    totalSkips: newSkipCount,
    isFirstSkip: newSkipCount === 1,
    isFinalSkip: newSkipsRemaining === 0,
    ipAddress,
    component: 'auth',
  });

  // Security alert if this is the final skip
  if (newSkipsRemaining === 0) {
    log.security('mfa_skip_limit_reached', 'medium', {
      userId,
      totalSkips: newSkipCount,
      action: 'mfa_will_be_enforced_next_login',
      blocked: false,
    });
  }

  return {
    success: true,
    skips_remaining: newSkipsRemaining,
  };
}

/**
 * Check if MFA is enforced (no skips remaining)
 *
 * @param userId - User ID to check
 * @returns true if MFA is enforced, false if skips remain
 */
export async function isMFAEnforced(userId: string): Promise<boolean> {
  const status = await getMFASkipStatus(userId);
  return status.skips_remaining <= 0;
}

/**
 * Reset skip counter (admin function)
 * Used to give users additional skips or reset after security incidents
 *
 * Security: Should only be called by super admins
 * Audit: Logs reset action for compliance
 *
 * @param adminUserId - Admin performing the reset
 * @param targetUserId - User whose skips are being reset
 * @param newSkipsRemaining - Number of skips to grant (default: 5)
 * @returns Success status
 * @throws Error if admin lacks permission or attempts self-reset
 */
export async function adminResetSkipCounter(
  adminUserId: string,
  targetUserId: string,
  newSkipsRemaining: number = 5
): Promise<{ success: boolean }> {
  // SECURITY: Verify admin has permission to manage users
  const { getUserContext } = await import('@/lib/rbac/user-context');
  const { PermissionChecker } = await import('@/lib/rbac/permission-checker');

  const adminContext = await getUserContext(adminUserId);
  const permissionChecker = new PermissionChecker(adminContext);

  permissionChecker.requirePermission('users:manage:all');

  // SECURITY: Prevent self-reset (defense in depth)
  if (adminUserId === targetUserId) {
    log.warn('admin attempted to reset own mfa skip counter', {
      operation: 'admin_reset_skip_counter',
      adminUserId,
      reason: 'self_reset_blocked',
      component: 'auth',
    });
    throw new Error('Administrators cannot reset their own MFA skip counter');
  }

  const now = new Date();

  await db
    .update(account_security)
    .set({
      mfa_skips_remaining: newSkipsRemaining,
      updated_at: now,
    })
    .where(eq(account_security.user_id, targetUserId));

  await AuditLogger.logSecurity({
    action: 'mfa_skip_counter_reset',
    userId: targetUserId,
    metadata: {
      adminUserId,
      newSkipsRemaining,
      action_taken: 'skip_counter_reset',
    },
    severity: 'medium',
  });

  log.info('admin reset mfa skip counter', {
    operation: 'admin_reset_skip_counter',
    adminUserId,
    targetUserId,
    newSkipsRemaining,
    component: 'auth',
  });

  return { success: true };
}
