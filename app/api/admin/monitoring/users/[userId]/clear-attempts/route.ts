/**
 * Clear Failed Login Attempts Endpoint
 *
 * POST /api/admin/monitoring/users/[userId]/clear-attempts
 *
 * Clears the failed login attempts counter for a user account.
 * Does NOT unlock the account if it's locked - use /unlock endpoint for that.
 *
 * SECURITY:
 * - RBAC: settings:write:all (Super Admin only)
 * - Requires reason field for audit trail
 * - Logs all actions to audit_logs
 * - Rate limited to prevent abuse
 *
 * AUDIT:
 * - Creates audit log entry with admin user ID
 * - Records previous failed attempts count
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
import { clearAttemptsSchema } from '@/lib/validations/monitoring';

const userIdParamsSchema = z.object({
  userId: z.string().uuid(),
});

const clearAttemptsHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();

  try {
    const { userId } = await extractRouteParams(args[0], userIdParamsSchema);
    const body = await validateRequest(request, clearAttemptsSchema);

    log.info('Clear failed attempts request initiated', {
      operation: 'clear_failed_attempts',
      adminUserId: userContext.user_id,
      targetUserId: userId,
      component: 'api',
    });

    const service = createSecurityAdminActionsService(userContext);
    const result = await service.clearFailedAttempts(userId, {
      reason: body.reason,
      ipAddress: getClientIP(request),
    });

    const duration = Date.now() - startTime;

    log.info('Failed attempts cleared successfully', {
      operation: 'clear_failed_attempts',
      duration,
      targetUserId: userId,
      targetUserEmail: result.userEmail,
      previousAttempts: result.previousFailedAttempts,
      component: 'api',
    });

    return createSuccessResponse(result, 'Failed login attempts cleared successfully');
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('Clear failed attempts failed', error, {
      operation: 'clear_failed_attempts',
      duration,
      adminUserId: userContext.user_id,
      component: 'api',
    });

    return createErrorResponse(toError(error), 500, request);
  }
};

// Export with RBAC protection - super admin write operation
export const POST = rbacRoute(clearAttemptsHandler, {
  permission: 'settings:update:all',
  rateLimit: 'api',
});
