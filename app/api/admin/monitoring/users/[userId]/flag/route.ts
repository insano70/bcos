/**
 * Flag/Unflag User Endpoint
 *
 * POST /api/admin/monitoring/users/[userId]/flag
 *
 * Flags or unflags a user as suspicious.
 * Used for manual intervention when admin identifies suspicious behavior.
 *
 * SECURITY:
 * - RBAC: settings:write:all (Super Admin only)
 * - Requires reason field for audit trail
 * - Logs all actions to audit_logs
 * - Rate limited to prevent abuse
 *
 * AUDIT:
 * - Creates audit log entry with admin user ID
 * - Records flag status change
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
import { flagUserSchema } from '@/lib/validations/monitoring';

const userIdParamsSchema = z.object({
  userId: z.string().uuid(),
});

const flagUserHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();
  const { userId } = await extractRouteParams(args[0], userIdParamsSchema);

  try {
    // Validate request body with Zod
    const body = await validateRequest(request, flagUserSchema);

    const action = body.flag ? 'flag_user' : 'unflag_user';

    log.info(`User ${action} initiated`, {
      operation: action,
      adminUserId: userContext.user_id,
      targetUserId: userId,
      flag: body.flag,
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

    const previousSuspiciousFlag = securityStatus.suspicious_activity_detected;

    // Check if already in desired state
    if (previousSuspiciousFlag === body.flag) {
      return createSuccessResponse({
        success: true,
        userId,
        userEmail: user.email,
        previousSuspiciousFlag,
        currentSuspiciousFlag: body.flag,
        message: `User already ${body.flag ? 'flagged' : 'unflagged'}`,
        noChangeNeeded: true,
      });
    }

    // Update account_security: set suspicious activity flag
    await db
      .update(account_security)
      .set({
        suspicious_activity_detected: body.flag,
        updated_at: new Date(),
      })
      .where(eq(account_security.user_id, userId));

    // Log to audit trail (compliance requirement)
    await AuditLogger.logUserAction({
      action: body.flag ? 'user_flagged_suspicious' : 'user_unflagged',
      userId: userContext.user_id, // Admin who performed the action
      resourceType: 'user',
      resourceId: userId, // Target user
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '',
      metadata: {
        reason: body.reason,
        previousSuspiciousFlag,
        newSuspiciousFlag: body.flag,
        targetUserEmail: user.email,
        targetUserName: `${user.firstName} ${user.lastName}`,
        failedLoginAttempts: securityStatus.failed_login_attempts,
        lockedUntil: securityStatus.locked_until?.toISOString() || null,
      },
    });

    const duration = Date.now() - startTime;

    log.info(`User ${action} successfully`, {
      operation: action,
      adminUserId: userContext.user_id,
      targetUserId: userId,
      targetUserEmail: user.email,
      previousFlag: previousSuspiciousFlag,
      newFlag: body.flag,
      duration,
      component: 'security-admin',
    });

    // Log security event
    log.security(body.flag ? 'user_flagged_suspicious' : 'user_unflagged', 'medium', {
      action: 'admin_flag_change',
      adminUserId: userContext.user_id,
      targetUserId: userId,
      flag: body.flag,
      reason: body.reason,
    });

    return createSuccessResponse({
      success: true,
      userId,
      userEmail: user.email,
      previousSuspiciousFlag,
      currentSuspiciousFlag: body.flag,
      message: `User ${body.flag ? 'flagged' : 'unflagged'} successfully`,
    });
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error(
      'Failed to flag/unflag user',
      error instanceof Error ? error : new Error(String(error)),
      {
        operation: 'flag_user',
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

// Export with RBAC protection - only super admins can flag users
export const POST = rbacRoute(flagUserHandler, {
  permission: 'settings:update:all',
  rateLimit: 'api',
});
