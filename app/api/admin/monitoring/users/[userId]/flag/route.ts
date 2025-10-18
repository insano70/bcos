/**
 * Flag/Unflag User Endpoint
 *
 * POST /api/admin/monitoring/users/[userId]/flag
 *
 * Flags or unflags a user as suspicious.
 * Used when admin identifies suspicious behavior requiring additional monitoring.
 *
 * SECURITY:
 * - RBAC: settings:write:all (Super Admin only)
 * - Requires flag (boolean) and reason field for audit trail
 * - Logs all actions to audit_logs
 * - Rate limited to prevent abuse
 *
 * AUDIT:
 * - Creates audit log entry with admin user ID
 * - Records previous flag status
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
import { flagUserSchema } from '@/lib/validations/monitoring';
import { createSecurityAdminActionsService } from '@/lib/services/security-admin-actions-service';

const userIdParamsSchema = z.object({
  userId: z.string().uuid(),
});

const flagUserHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();

  try {
    const { userId } = await extractRouteParams(args[0], userIdParamsSchema);
    const body = await validateRequest(request, flagUserSchema);

    log.info('Flag user request initiated', {
      operation: 'flag_user',
      adminUserId: userContext.user_id,
      targetUserId: userId,
      flag: body.flag,
      component: 'api',
    });

    const service = createSecurityAdminActionsService(userContext);
    const result = await service.flagUser(userId, {
      flag: body.flag,
      reason: body.reason,
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
    });

    const duration = Date.now() - startTime;

    log.info(`User ${body.flag ? 'flagged' : 'unflagged'} successfully`, {
      operation: 'flag_user',
      duration,
      targetUserId: userId,
      targetUserEmail: result.userEmail,
      previousFlag: result.previousFlag,
      currentFlag: result.currentFlag,
      component: 'api',
    });

    return createSuccessResponse(
      result,
      `User ${body.flag ? 'flagged as suspicious' : 'unflagged'} successfully`
    );
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('Flag user failed', error, {
      operation: 'flag_user',
      duration,
      adminUserId: userContext.user_id,
      component: 'api',
    });

    return createErrorResponse(error instanceof Error ? error : new Error(String(error)), 500, request);
  }
};

// Export with RBAC protection - super admin write operation
export const POST = rbacRoute(flagUserHandler, {
  permission: 'settings:update:all',
  rateLimit: 'api',
});
