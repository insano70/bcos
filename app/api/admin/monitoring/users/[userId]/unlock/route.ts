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

// Next.js
import type { NextRequest } from 'next/server';

// Third-party libraries
import { z } from 'zod';

// API middleware
import { validateRequest } from '@/lib/api/middleware/validation';

// API responses
import { createErrorResponse, toError } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';

// API route handlers
import { rbacRoute } from '@/lib/api/route-handlers';

// API utilities
import { getClientIP } from '@/lib/api/utils/get-client-ip';
import { extractRouteParams } from '@/lib/api/utils/params';

// Logging
import { log } from '@/lib/logger';

// Services
import { createSecurityAdminActionsService } from '@/lib/services/security-admin-actions-service';

// Types
import type { UserContext } from '@/lib/types/rbac';

// Validations
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
      ipAddress: getClientIP(request),
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

    return createErrorResponse(toError(error), 500, request);
  }
};

// Export with RBAC protection - super admin write operation
export const POST = rbacRoute(unlockAccountHandler, {
  permission: 'settings:update:all',
  rateLimit: 'api',
});
