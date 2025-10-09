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
import { log, logTemplates } from '@/lib/logger';

/**
 * GET /api/work-items
 * List work items with filtering, pagination, and RBAC
 */
const getWorkItemsHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  try {
    const { searchParams } = new URL(request.url);

    // Track performance breakdown
    const validationStart = Date.now();
    const query = validateQuery(searchParams, workItemQuerySchema);
    const validationDuration = Date.now() - validationStart;

    // Create RBAC service
    const workItemsService = createRBACWorkItemsService(userContext);

    // Get work items with automatic permission-based filtering
    const queryStart = Date.now();
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

    // Get total count
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
    const queryDuration = Date.now() - queryStart;

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

    // Single comprehensive log with rich context
    log.info(`work_items list query completed - returned ${workItems.length} of ${totalCount}`, {
      operation: 'list_work_items',
      resourceType: 'work_items',
      userId: userContext.user_id,
      ...(userContext.current_organization_id && { organizationId: userContext.current_organization_id }),

      // Filters applied
      filters: {
        type: query.work_item_type_id || 'all',
        status: query.status_id || query.status_category || 'all',
        priority: query.priority || 'all',
        assignee: query.assigned_to || 'all',
        creator: query.created_by || 'all',
        search: query.search ? query.search.substring(0, 50) : null,
      },
      filterCount: [query.work_item_type_id, query.status_id || query.status_category, query.priority, query.assigned_to, query.created_by, query.search].filter(Boolean).length,

      // Results summary
      results: {
        returned: workItems.length,
        total: totalCount,
        page: Math.floor((query.offset || 0) / (query.limit || 50)) + 1,
      },
      empty: workItems.length === 0,

      // Performance
      duration: Date.now() - startTime,
      slow: (Date.now() - startTime) > 1000,
      performance: {
        validation: validationDuration,
        query: queryDuration,
      },
      sort: {
        by: query.sortBy || 'created_at',
        order: query.sortOrder || 'desc',
      },

      component: 'business-logic',
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

  try {
    // Validate request
    const validationStart = Date.now();
    const validatedData = await validateRequest(request, workItemCreateSchema);
    const validationDuration = Date.now() - validationStart;

    // Create RBAC service
    const workItemsService = createRBACWorkItemsService(userContext);

    // Create work item with automatic permission checking
    const creationStart = Date.now();
    const newWorkItem = await workItemsService.createWorkItem({
      work_item_type_id: validatedData.work_item_type_id,
      organization_id: validatedData.organization_id || userContext.current_organization_id || '',
      subject: validatedData.subject,
      description: validatedData.description || null,
      priority: validatedData.priority,
      assigned_to: validatedData.assigned_to || null,
      due_date: validatedData.due_date || null,
    });

    // Handle custom field values if provided
    let customFieldCount = 0;
    if (validatedData.custom_fields && Object.keys(validatedData.custom_fields).length > 0) {
      const fieldValuesService = createRBACWorkItemFieldValuesService(userContext);
      await fieldValuesService.setFieldValues(
        newWorkItem.work_item_id,
        validatedData.work_item_type_id,
        validatedData.custom_fields
      );
      customFieldCount = Object.keys(validatedData.custom_fields).length;
    }
    const creationDuration = Date.now() - creationStart;

    // Single comprehensive log with rich context using template
    const template = logTemplates.crud.create('work_item', {
      resourceId: newWorkItem.work_item_id,
      resourceName: newWorkItem.subject,
      userId: userContext.user_id,
      organizationId: newWorkItem.organization_id,
      duration: Date.now() - startTime,
      metadata: {
        type: newWorkItem.work_item_type_name,
        priority: newWorkItem.priority,
        assignee: newWorkItem.assigned_to_name || 'unassigned',
        hasDueDate: !!newWorkItem.due_date,
        customFieldCount,
        performance: {
          validation: validationDuration,
          creation: creationDuration,
        },
      },
    });
    log.info(template.message, template.context);

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
