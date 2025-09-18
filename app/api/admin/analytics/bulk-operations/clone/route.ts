import { NextRequest } from 'next/server';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { bulkChartOperationsService } from '@/lib/services/bulk-chart-operations';

/**
 * POST /api/admin/analytics/bulk-operations/clone
 * Start a bulk clone operation
 */
const handler = rbacRoute(
  async (request: NextRequest, userContext) => {
    try {
      const body = await request.json();
      const { chartIds, targetCategoryId } = body;
      
      if (!Array.isArray(chartIds) || chartIds.length === 0) {
        return createErrorResponse('Chart IDs are required', 400);
      }

      const operationId = await bulkChartOperationsService.bulkCloneCharts(
        chartIds,
        { chart_category_id: targetCategoryId }, // modifications object
        userContext.user_id
      );

      return createSuccessResponse({
        operationId,
        message: 'Bulk clone operation started'
      });
    } catch (error) {
      console.error('Failed to start bulk clone operation:', error);
      return createErrorResponse('Failed to start bulk clone operation', 500);
    }
  },
  { permission: 'analytics:read:all' }
);

export { handler as POST };
