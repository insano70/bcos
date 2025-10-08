import type { NextRequest } from 'next/server';
import { createSuccessResponse, createPaginatedResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { validateRequest, validateQuery } from '@/lib/api/middleware/validation';
import { workItemCreateSchema, workItemQuerySchema } from '@/lib/validations/work-items';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import { createRBACWorkItemsService } from '@/lib/services/rbac-work-items-service';
import { createRBACWorkItemFieldValuesService } from '@/lib/services/rbac-work-item-field-values-service';
import type { UserContext } from '@/lib/types/rbac';
import { log } from '@/lib/logger';

/**
 * GET /api/work-items
 * List work items with filtering, pagination, and RBAC
 */
const getWorkItemsHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  log.info('List work items request initiated', {
    operation: 'list_work_items',
    requestingUserId: userContext.user_id,
    organizationId: userContext.current_organization_id,
  });

  try {
    const { searchParams } = new URL(request.url);

    const validationStart = Date.now();
    const query = validateQuery(searchParams, workItemQuerySchema);
    log.info('Request validation completed', { duration: Date.now() - validationStart });

    log.info('Request parameters parsed', {
      filters: {
        work_item_type_id: query.work_item_type_id,
        organization_id: query.organization_id,
        status_id: query.status_id,
        status_category: query.status_category,
        priority: query.priority,
        assigned_to: query.assigned_to,
        created_by: query.created_by,
        search: query.search,
      },
      pagination: {
        limit: query.limit,
        offset: query.offset,
      },
      sort: {
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
      },
    });

    // Create RBAC service
    const serviceStart = Date.now();
    const workItemsService = createRBACWorkItemsService(userContext);
    log.info('RBAC service created', { duration: Date.now() - serviceStart });

    // Get work items with automatic permission-based filtering
    const workItemsStart = Date.now();
    const workItems = await workItemsService.getWorkItems({
      work_item_type_id: query.work_item_type_id,
      organization_id: query.organization_id,
      status_id: query.status_id,
      status_category: query.status_category,
      priority: query.priority,
      assigned_to: query.assigned_to,
      created_by: query.created_by,
      search: query.search,
      limit: query.limit,
      offset: query.offset,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });
    log.db('SELECT', 'work_items', Date.now() - workItemsStart, { rowCount: workItems.length });

    // Get total count
    const countStart = Date.now();
    const totalCount = await workItemsService.getWorkItemCount({
      work_item_type_id: query.work_item_type_id,
      organization_id: query.organization_id,
      status_id: query.status_id,
      status_category: query.status_category,
      priority: query.priority,
      assigned_to: query.assigned_to,
      created_by: query.created_by,
      search: query.search,
    });
    log.db('SELECT', 'work_items_count', Date.now() - countStart, { rowCount: 1 });

    const responseData = workItems.map((item) => ({
      id: item.work_item_id,
      work_item_type_id: item.work_item_type_id,
      work_item_type_name: item.work_item_type_name,
      organization_id: item.organization_id,
      organization_name: item.organization_name,
      subject: item.subject,
      description: item.description,
      status_id: item.status_id,
      status_name: item.status_name,
      status_category: item.status_category,
      priority: item.priority,
      assigned_to: item.assigned_to,
      assigned_to_name: item.assigned_to_name,
      due_date: item.due_date,
      started_at: item.started_at,
      completed_at: item.completed_at,
      created_by: item.created_by,
      created_by_name: item.created_by_name,
      created_at: item.created_at,
      updated_at: item.updated_at,
    }));

    const totalDuration = Date.now() - startTime;
    log.info('Work items list retrieved successfully', {
      workItemsReturned: workItems.length,
      totalCount,
      totalDuration,
    });

    return createPaginatedResponse(responseData, {
      page: Math.floor((query.offset || 0) / (query.limit || 50)) + 1,
      limit: query.limit || 50,
      total: totalCount,
    });
  } catch (error) {
    const totalDuration = Date.now() - startTime;

    log.error('Work items list request failed', error, {
      requestingUserId: userContext.user_id,
      organizationId: userContext.current_organization_id,
      totalDuration,
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500,
      request
    );
  }
};

export const GET = rbacRoute(getWorkItemsHandler, {
  permission: ['work-items:read:own', 'work-items:read:organization', 'work-items:read:all'],
  extractResourceId: extractors.workItemId,
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});

/**
 * POST /api/work-items
 * Create a new work item
 */
const createWorkItemHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  log.info('Work item creation request initiated', {
    createdByUserId: userContext.user_id,
    organizationId: userContext.current_organization_id,
  });

  try {
    const validationStart = Date.now();
    const validatedData = await validateRequest(request, workItemCreateSchema);
    log.info('Request validation completed', { duration: Date.now() - validationStart });

    // Create RBAC service
    const serviceStart = Date.now();
    const workItemsService = createRBACWorkItemsService(userContext);
    log.info('RBAC service created', { duration: Date.now() - serviceStart });

    // Create work item with automatic permission checking
    const workItemCreationStart = Date.now();
    const newWorkItem = await workItemsService.createWorkItem({
      work_item_type_id: validatedData.work_item_type_id,
      organization_id: validatedData.organization_id || userContext.current_organization_id || '',
      subject: validatedData.subject,
      description: validatedData.description || null,
      priority: validatedData.priority,
      assigned_to: validatedData.assigned_to || null,
      due_date: validatedData.due_date || null,
    });
    log.db('INSERT', 'work_items', Date.now() - workItemCreationStart, { rowCount: 1 });

    // Phase 3: Handle custom field values if provided
    if (validatedData.custom_fields && Object.keys(validatedData.custom_fields).length > 0) {
      const fieldValuesStart = Date.now();
      const fieldValuesService = createRBACWorkItemFieldValuesService(userContext);
      await fieldValuesService.setFieldValues(
        newWorkItem.work_item_id,
        validatedData.work_item_type_id,
        validatedData.custom_fields
      );
      log.db('INSERT', 'work_item_field_values', Date.now() - fieldValuesStart, {
        rowCount: Object.keys(validatedData.custom_fields).length,
      });
    }

    const totalDuration = Date.now() - startTime;
    log.info('Work item creation completed successfully', {
      newWorkItemId: newWorkItem.work_item_id,
      totalDuration,
    });

    return createSuccessResponse(
      {
        id: newWorkItem.work_item_id,
        work_item_type_id: newWorkItem.work_item_type_id,
        work_item_type_name: newWorkItem.work_item_type_name,
        organization_id: newWorkItem.organization_id,
        organization_name: newWorkItem.organization_name,
        subject: newWorkItem.subject,
        description: newWorkItem.description,
        status_id: newWorkItem.status_id,
        status_name: newWorkItem.status_name,
        status_category: newWorkItem.status_category,
        priority: newWorkItem.priority,
        assigned_to: newWorkItem.assigned_to,
        assigned_to_name: newWorkItem.assigned_to_name,
        due_date: newWorkItem.due_date,
        created_at: newWorkItem.created_at,
        updated_at: newWorkItem.updated_at,
      },
      'Work item created successfully'
    );
  } catch (error) {
    const totalDuration = Date.now() - startTime;

    log.error('Work item creation failed', error, {
      createdByUserId: userContext.user_id,
      organizationId: userContext.current_organization_id,
      totalDuration,
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500,
      request
    );
  }
};

export const POST = rbacRoute(createWorkItemHandler, {
  permission: ['work-items:create:own', 'work-items:create:organization'],
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});
