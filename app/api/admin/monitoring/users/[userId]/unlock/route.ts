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

import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { validateRequest } from '@/lib/api/middleware/validation';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { extractRouteParams } from '@/lib/api/utils/params';
import { log } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';
import { unlockAccountSchema } from '@/lib/validations/monitoring';
import { createSecurityAdminActionsService } from '@/lib/services/security-admin-actions-service';

const userIdParamsSchema = z.object({
  userId: z.string().uuid(),
});

const unlockAccountHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();

  try {
    const { userId } = await extractRouteParams(args[0], userIdParamsSchema);
    const body = await validateRequest(request, unlockAccountSchema);

    log.info('Account unlock request initiated', {
      operation: 'unlock_user_account',
      adminUserId: userContext.user_id,
      targetUserId: userId,
      component: 'api',
    });

    const service = createSecurityAdminActionsService(userContext);
    const result = await service.unlockAccount(userId, {
      reason: body.reason,
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
    });

    const duration = Date.now() - startTime;

    log.info('Account unlocked successfully', {
      operation: 'unlock_user_account',
      duration,
      targetUserId: userId,
      targetUserEmail: result.userEmail,
      component: 'api',
    });

    return createSuccessResponse(result, 'User account unlocked successfully');
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('Account unlock failed', error, {
      operation: 'unlock_user_account',
      duration,
      adminUserId: userContext.user_id,
      component: 'api',
    });

    return createErrorResponse(error instanceof Error ? error : new Error(String(error)), 500, request);
  }
};

// Export with RBAC protection - super admin write operation
export const POST = rbacRoute(unlockAccountHandler, {
  permission: 'settings:update:all',
  rateLimit: 'api',
});
