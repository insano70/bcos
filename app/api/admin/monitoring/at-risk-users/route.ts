/**
 * At-Risk Users API
 *
 * GET /api/admin/monitoring/at-risk-users
 *
 * Returns users with failed logins, locked accounts, or suspicious activity.
 * Calculates risk scores (0-100) based on security factors.
 *
 * RBAC: settings:read:all (Super Admin only)
 */

// Next.js
import type { NextRequest } from 'next/server';

// API responses
import { handleRouteError, toError } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';

// API route handlers
import { rbacRoute } from '@/lib/api/route-handlers';

// Logging
import { log } from '@/lib/logger';

// Services
import { createSecurityAtRiskUsersService } from '@/lib/services/security-at-risk-users-service';

// Types
import type { UserContext } from '@/lib/types/rbac';

// Constants
import { SECURITY_MONITORING_LIMITS } from '@/lib/constants/security-monitoring';

const atRiskUsersHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(
      parseInt(
        searchParams.get('limit') || String(SECURITY_MONITORING_LIMITS.DEFAULT_PAGE_SIZE),
        10
      ),
      SECURITY_MONITORING_LIMITS.MAX_PAGE_SIZE
    );
    const minRiskScore = parseInt(searchParams.get('minRiskScore') || '0', 10);

    log.info('At-risk users request initiated', {
      operation: 'query_at_risk_users',
      requestingUserId: userContext.user_id,
      limit,
      minRiskScore,
      component: 'api',
    });

    const service = createSecurityAtRiskUsersService(userContext);
    const response = await service.getAtRiskUsers({ limit, minRiskScore });

    const duration = Date.now() - startTime;

    log.info('At-risk users retrieved', {
      operation: 'query_at_risk_users',
      duration,
      userCount: response.totalCount,
      locked: response.summary.locked,
      suspicious: response.summary.suspicious,
      component: 'api',
    });

    return createSuccessResponse(response);
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('At-risk users request failed', error, {
      operation: 'query_at_risk_users',
      duration,
      requestingUserId: userContext.user_id,
      component: 'api',
    });

    // Return error response to admin - don't mask failures
    return handleRouteError(toError(error), 'Failed to retrieve at-risk users', request);
  }
};

// Export with RBAC protection - only super admins can access
export const GET = rbacRoute(atRiskUsersHandler, {
  permission: 'settings:read:all',
  rateLimit: 'api',
});
