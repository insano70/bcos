import { NextRequest } from 'next/server';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { bulkChartOperationsService } from '@/lib/services/bulk-chart-operations';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/analytics/bulk-operations/update
 * Start a bulk update operation
 */
const handler = rbacRoute(
  async (request: NextRequest, userContext) => {
    try {
      const body = await request.json();
      const { chartIds, updates } = body;
      
      if (!Array.isArray(chartIds) || chartIds.length === 0) {
        return createErrorResponse('Chart IDs are required', 400);
      }
      
      if (!updates || typeof updates !== 'object') {
        return createErrorResponse('Updates object is required', 400);
      }

      const operationId = await bulkChartOperationsService.bulkUpdateCharts(
        chartIds,
        updates,
        userContext.user_id
      );

      return createSuccessResponse({
        operationId,
        message: 'Bulk update operation started'
      });
    } catch (error) {
      console.error('Failed to start bulk update operation:', error);
      return createErrorResponse('Failed to start bulk update operation', 500);
    }
  },
  { 
    permission: 'analytics:read:all',
    rateLimit: 'api' // Add rate limiting for bulk operations
  }
);

export { handler as POST };
