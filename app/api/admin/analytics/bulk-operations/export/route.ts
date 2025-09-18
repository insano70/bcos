import { NextRequest } from 'next/server';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { bulkChartOperationsService } from '@/lib/services/bulk-chart-operations';

/**
 * POST /api/admin/analytics/bulk-operations/export
 * Start a bulk export operation
 */
const handler = rbacRoute(
  async (request: NextRequest, userContext) => {
    try {
      const body = await request.json();
      const { chartIds, format } = body;
      
      if (!Array.isArray(chartIds) || chartIds.length === 0) {
        return createErrorResponse('Chart IDs are required', 400);
      }
      
      if (!format || typeof format !== 'string') {
        return createErrorResponse('Export format is required', 400);
      }

      const operationId = await bulkChartOperationsService.bulkExportCharts(
        chartIds,
        format as 'png' | 'pdf' | 'csv',
        userContext.user_id
      );

      return createSuccessResponse({
        operationId,
        message: 'Bulk export operation started'
      });
    } catch (error) {
      console.error('Failed to start bulk export operation:', error);
      return createErrorResponse('Failed to start bulk export operation', 500);
    }
  },
  { permission: 'analytics:read:all' }
);

export { handler as POST };
