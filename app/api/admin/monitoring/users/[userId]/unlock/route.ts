/**
 * Unlock User Account Endpoint
 *
 * POST /api/admin/monitoring/users/[userId]/unlock
 *
 * Unlocks a user account that has been locked due to failed login attempts.
 * Resets failed login counter and clears suspicious activity flag.
 *
 * SECURITY:
 * - RBAC: settings:write:all (Super Admin only)
 * - Requires reason field for audit trail
 * - Logs all actions to audit_logs
 * - Rate limited to prevent abuse
 *
 * AUDIT:
 * - Creates audit log entry with admin user ID
 * - Records previous status for rollback capability
 * - Includes reason provided by admin
 */

import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { validateRequest } from '@/lib/api/middleware/validation';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { AuditLogger } from '@/lib/api/services/audit';
import { extractRouteParams } from '@/lib/api/utils/params';
import { account_security, db, users } from '@/lib/db';
import { log } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';
import { unlockAccountSchema } from '@/lib/validations/monitoring';

const userIdParamsSchema = z.object({
  userId: z.string().uuid(),
});

const unlockAccountHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();
  const { userId } = await extractRouteParams(args[0], userIdParamsSchema);

  try {
    // Validate request body with Zod
    const body = await validateRequest(request, unlockAccountSchema);

    log.info('Account unlock initiated', {
      operation: 'unlock_user_account',
      adminUserId: userContext.user_id,
      targetUserId: userId,
      component: 'security-admin',
    });

    // Verify user exists
    const [user] = await db
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
      return createErrorResponse('User not found', 404, request);
    }

    // Get current security status
    const [securityStatus] = await db
      .select()
      .from(account_security)
      .where(eq(account_security.user_id, userId))
      .limit(1);

    if (!securityStatus) {
      return createErrorResponse('User security record not found', 404, request);
    }

    // Store previous status for audit log
    const previousStatus = {
      failedAttempts: securityStatus.failed_login_attempts,
      lockedUntil: securityStatus.locked_until?.toISOString() || null,
      suspiciousActivity: securityStatus.suspicious_activity_detected,
    };

    // Update account_security: unlock account and reset counters
    await db
      .update(account_security)
      .set({
        failed_login_attempts: 0,
        locked_until: null,
        suspicious_activity_detected: false,
        lockout_reason: null,
        updated_at: new Date(),
      })
      .where(eq(account_security.user_id, userId));

    // Log to audit trail (compliance requirement)
    await AuditLogger.logUserAction({
      action: 'user_account_unlocked',
      userId: userContext.user_id, // Admin who performed the action
      resourceType: 'user',
      resourceId: userId, // Target user
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '',
      metadata: {
        reason: body.reason,
        previousFailedAttempts: previousStatus.failedAttempts,
        previousLockedUntil: previousStatus.lockedUntil,
        previousSuspiciousActivity: previousStatus.suspiciousActivity,
        targetUserEmail: user.email,
        targetUserName: `${user.firstName} ${user.lastName}`,
      },
    });

    const duration = Date.now() - startTime;

    log.info('Account unlocked successfully', {
      operation: 'unlock_user_account',
      adminUserId: userContext.user_id,
      targetUserId: userId,
      targetUserEmail: user.email,
      previousFailedAttempts: previousStatus.failedAttempts,
      duration,
      component: 'security-admin',
    });

    // Log security event
    log.security('user_account_unlocked', 'medium', {
      action: 'admin_unlock',
      adminUserId: userContext.user_id,
      targetUserId: userId,
      reason: body.reason,
    });

    return createSuccessResponse({
      success: true,
      userId,
      userEmail: user.email,
      previousStatus,
      message: 'Account unlocked successfully',
    });
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error(
      'Failed to unlock account',
      error instanceof Error ? error : new Error(String(error)),
      {
        operation: 'unlock_user_account',
        adminUserId: userContext.user_id,
        targetUserId: userId,
        duration,
        component: 'security-admin',
      }
    );

    return createErrorResponse(
      error instanceof Error ? error : new Error(String(error)),
      500,
      request
    );
  }
};

// Export with RBAC protection - only super admins can unlock accounts
export const POST = rbacRoute(unlockAccountHandler, {
  permission: 'settings:update:all',
  rateLimit: 'api',
});
