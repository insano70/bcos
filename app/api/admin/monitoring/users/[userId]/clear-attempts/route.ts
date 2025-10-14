/**
 * Clear Failed Login Attempts Endpoint
 *
 * POST /api/admin/monitoring/users/[userId]/clear-attempts
 *
 * Resets the failed login attempt counter for a user.
 * Does NOT unlock the account (preserves lockout if still active).
 * Used when admin wants to give user another chance without fully unlocking.
 *
 * SECURITY:
 * - RBAC: settings:write:all (Super Admin only)
 * - Requires reason field for audit trail
 * - Logs all actions to audit_logs
 * - Rate limited to prevent abuse
 *
 * AUDIT:
 * - Creates audit log entry with admin user ID
 * - Records previous failed attempt count
 * - Includes reason provided by admin
 */

import type { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { log } from '@/lib/logger';
import { db, account_security, users } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { AuditLogger } from '@/lib/api/services/audit';
import type { UserContext } from '@/lib/types/rbac';
import { extractRouteParams } from '@/lib/api/utils/params';
import { z } from 'zod';

const userIdParamsSchema = z.object({
  userId: z.string().uuid(),
});

interface ClearAttemptsRequest {
  reason: string;
}

const clearAttemptsHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();
  const { userId } = await extractRouteParams(args[0], userIdParamsSchema);

  try {
    // Parse request body
    const body = (await request.json()) as ClearAttemptsRequest;

    if (!body.reason || body.reason.trim().length === 0) {
      return createErrorResponse('Reason is required for clearing failed attempts', 400, request);
    }

    log.info('Clear failed attempts initiated', {
      operation: 'clear_failed_attempts',
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

    const previousFailedAttempts = securityStatus.failed_login_attempts;

    // Update account_security: reset failed attempts only
    // Keep locked_until unchanged - if account is locked, it stays locked
    await db
      .update(account_security)
      .set({
        failed_login_attempts: 0,
        updated_at: new Date(),
      })
      .where(eq(account_security.user_id, userId));

    // Log to audit trail (compliance requirement)
    await AuditLogger.logUserAction({
      action: 'user_failed_attempts_cleared',
      userId: userContext.user_id, // Admin who performed the action
      resourceType: 'user',
      resourceId: userId, // Target user
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '',
      metadata: {
        reason: body.reason,
        previousFailedAttempts,
        targetUserEmail: user.email,
        targetUserName: `${user.firstName} ${user.lastName}`,
        lockedUntilUnchanged: securityStatus.locked_until?.toISOString() || null,
      },
    });

    const duration = Date.now() - startTime;

    log.info('Failed attempts cleared successfully', {
      operation: 'clear_failed_attempts',
      adminUserId: userContext.user_id,
      targetUserId: userId,
      targetUserEmail: user.email,
      previousFailedAttempts,
      duration,
      component: 'security-admin',
    });

    // Log security event
    log.security('user_failed_attempts_cleared', 'low', {
      action: 'admin_clear_attempts',
      adminUserId: userContext.user_id,
      targetUserId: userId,
      reason: body.reason,
    });

    return createSuccessResponse({
      success: true,
      userId,
      userEmail: user.email,
      previousFailedAttempts,
      message: 'Failed login attempts cleared successfully',
    });
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error(
      'Failed to clear failed attempts',
      error instanceof Error ? error : new Error(String(error)),
      {
        operation: 'clear_failed_attempts',
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

// Export with RBAC protection - only super admins can clear attempts
export const POST = rbacRoute(clearAttemptsHandler, {
  permission: 'settings:update:all',
  rateLimit: 'api',
});

