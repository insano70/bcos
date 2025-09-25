import { NextRequest } from 'next/server';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { bulkChartOperationsService } from '@/lib/services/bulk-chart-operations';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/analytics/bulk-operations/[operationId]
 * Get the progress of a bulk operation
 */
const handler = rbacRoute(
  async (request: NextRequest, userContext, ...args: unknown[]) => {
    const { params } = args[0] as { params: { operationId: string } };
    try {
      const { operationId } = params;
      
      const progress = bulkChartOperationsService.getOperationProgress(operationId);
      
      if (!progress) {
        return createErrorResponse('Operation not found', 404);
      }

      return createSuccessResponse({
        operationId,
        ...progress
      });
    } catch (error) {
      console.error('Failed to get bulk operation progress:', error);
      return createErrorResponse('Failed to get operation progress', 500);
    }
  },
  { 
    permission: 'analytics:read:all',
    rateLimit: 'api' // Add rate limiting for bulk operations
  }
);

export { handler as GET };
