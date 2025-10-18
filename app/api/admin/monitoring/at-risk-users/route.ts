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

import type { NextRequest } from 'next/server';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { createSecurityAtRiskUsersService } from '@/lib/services/security-at-risk-users-service';
import type { UserContext } from '@/lib/types/rbac';
import { log } from '@/lib/logger';
import type { AtRiskUsersResponse } from '@/lib/monitoring/types';

const atRiskUsersHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 500);
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

    // Return empty result on error
    const fallback: AtRiskUsersResponse = {
      users: [],
      totalCount: 0,
      summary: { locked: 0, suspicious: 0, monitoring: 0 },
    };

    return createSuccessResponse(fallback);
  }
};

// Export with RBAC protection - only super admins can access
export const GET = rbacRoute(atRiskUsersHandler, {
  permission: 'settings:read:all',
  rateLimit: 'api',
});
