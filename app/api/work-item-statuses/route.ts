import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import { log, logTemplates, sanitizeFilters } from '@/lib/logger';
import { createRBACWorkItemStatusesService } from '@/lib/services/rbac-work-item-statuses-service';
import type { UserContext } from '@/lib/types/rbac';

/**
 * GET /api/work-item-statuses?work_item_type_id=<uuid>
 * List statuses for a specific work item type
 */
const getWorkItemStatusesHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  try {
    const { searchParams } = new URL(request.url);

    // Validate query parameter format
    const querySchema = z.object({
      work_item_type_id: z.string().uuid({ message: 'Invalid work item type ID format' }),
    });

    const validationResult = querySchema.safeParse({
      work_item_type_id: searchParams.get('work_item_type_id'),
    });

    if (!validationResult.success) {
      const errorMessage = validationResult.error.issues[0]?.message || 'Invalid query parameters';
      return createErrorResponse(errorMessage, 400, request);
    }

    const { work_item_type_id } = validationResult.data;

    // Use service layer for data access
    const statusesService = createRBACWorkItemStatusesService(userContext);
    const statuses = await statusesService.getStatusesByType(work_item_type_id);

    const duration = Date.now() - startTime;
    const filters = sanitizeFilters({ work_item_type_id });

    // Calculate category counts for logging
    const categoryCounts = statuses.reduce<Record<string, number>>(
      (acc, status) => {
        const category = status.status_category || 'unknown';
        acc[category] = (acc[category] || 0) + 1;
        return acc;
      },
      {}
    );

    const initialCount = statuses.filter((s) => s.is_initial).length;
    const finalCount = statuses.filter((s) => s.is_final).length;

    // Use logTemplates for consistent logging
    const template = logTemplates.crud.list('work_item_statuses', {
      userId: userContext.user_id,
      filters,
      results: {
        returned: statuses.length,
        total: statuses.length,
        page: 1,
      },
      duration,
      metadata: {
        work_item_type_id,
        byCategory: categoryCounts,
        initial: initialCount,
        final: finalCount,
      },
    });

    log.info(template.message, template.context);

    // Map service response to API response format
    return createSuccessResponse(
      statuses.map((status) => ({
        id: status.work_item_status_id,
        work_item_type_id: status.work_item_type_id,
        status_name: status.status_name,
        status_category: status.status_category,
        is_initial: status.is_initial,
        is_final: status.is_final,
        color: status.color,
        display_order: status.display_order,
        created_at: status.created_at,
        updated_at: status.updated_at,
      }))
    );
  } catch (error) {
    log.error('work item statuses list failed', error, {
      operation: 'list_work_item_statuses',
      userId: userContext.user_id,
      component: 'work-items',
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500,
      request
    );
  }
};

export const GET = rbacRoute(getWorkItemStatusesHandler, {
  permission: 'work-items:read:organization',
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});
