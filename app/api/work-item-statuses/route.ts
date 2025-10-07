import type { NextRequest } from 'next/server';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import type { UserContext } from '@/lib/types/rbac';
import { log } from '@/lib/logger';
import { db } from '@/lib/db';
import { work_item_statuses } from '@/lib/db/schema';
import { and, asc, eq } from 'drizzle-orm';

/**
 * GET /api/work-item-statuses?work_item_type_id=<uuid>
 * List statuses for a specific work item type
 */
const getWorkItemStatusesHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  log.info('List work item statuses request initiated', {
    operation: 'list_work_item_statuses',
    requestingUserId: userContext.user_id,
  });

  try {
    const { searchParams } = new URL(request.url);
    const work_item_type_id = searchParams.get('work_item_type_id');

    if (!work_item_type_id) {
      return createErrorResponse('work_item_type_id is required', 400, request);
    }

    // Get statuses for the work item type
    const statusesStart = Date.now();
    const statuses = await db
      .select({
        id: work_item_statuses.work_item_status_id,
        work_item_type_id: work_item_statuses.work_item_type_id,
        status_name: work_item_statuses.status_name,
        status_category: work_item_statuses.status_category,
        is_initial: work_item_statuses.is_initial,
        is_final: work_item_statuses.is_final,
        color: work_item_statuses.color,
        display_order: work_item_statuses.display_order,
        created_at: work_item_statuses.created_at,
        updated_at: work_item_statuses.updated_at,
      })
      .from(work_item_statuses)
      .where(eq(work_item_statuses.work_item_type_id, work_item_type_id))
      .orderBy(asc(work_item_statuses.display_order));

    log.db('SELECT', 'work_item_statuses', Date.now() - statusesStart, {
      rowCount: statuses.length,
    });

    const totalDuration = Date.now() - startTime;
    log.info('Work item statuses list retrieved successfully', {
      statusesReturned: statuses.length,
      totalDuration,
    });

    return createSuccessResponse(statuses);
  } catch (error) {
    const totalDuration = Date.now() - startTime;

    log.error('Work item statuses list request failed', error, {
      requestingUserId: userContext.user_id,
      totalDuration,
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500,
      request
    );
  }
};

export const GET = rbacRoute(getWorkItemStatusesHandler, {
  permission: 'work_items:read:organization',
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});
