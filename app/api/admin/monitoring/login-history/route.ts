/**
 * Login History API
 *
 * GET /api/admin/monitoring/login-history?userId={userId}
 *
 * Returns login attempt history for a specific user.
 * Includes both successful and failed attempts with IP addresses and device info.
 *
 * RBAC: settings:read:all (Super Admin only)
 */

// Next.js
import type { NextRequest } from 'next/server';

// API responses
import { createErrorResponse, toError } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';

// API route handlers
import { rbacRoute } from '@/lib/api/route-handlers';

// Logging
import { log } from '@/lib/logger';

// Services
import { createSecurityLoginHistoryService } from '@/lib/services/security-login-history-service';

// Types
import type { UserContext } from '@/lib/types/rbac';

const loginHistoryHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 500);
    const successOnly = searchParams.get('successOnly') === 'true';
    const failureOnly = searchParams.get('failureOnly') === 'true';

    if (!userId) {
      return createErrorResponse('userId parameter is required', 400, request);
    }

    log.info('Login history request initiated', {
      operation: 'query_login_history',
      requestingUserId: userContext.user_id,
      targetUserId: userId,
      limit,
      successOnly,
      failureOnly,
      component: 'api',
    });

    const service = createSecurityLoginHistoryService(userContext);
    const response = await service.getLoginHistory(userId, {
      limit,
      successOnly,
      failureOnly,
    });

    const duration = Date.now() - startTime;

    log.info('Login history retrieved', {
      operation: 'query_login_history',
      duration,
      targetUserId: userId,
      attemptCount: response.totalCount,
      component: 'api',
    });

    return createSuccessResponse(response);
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('Login history request failed', error, {
      operation: 'query_login_history',
      duration,
      requestingUserId: userContext.user_id,
      component: 'api',
    });

    return createErrorResponse(toError(error), 500, request);
  }
};

// Export with RBAC protection - only super admins can access
export const GET = rbacRoute(loginHistoryHandler, {
  permission: 'settings:read:all',
  rateLimit: 'api',
});
