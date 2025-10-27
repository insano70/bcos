import type { NextRequest } from 'next/server';
import { validateQuery, validateRequest } from '@/lib/api/middleware/validation';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createPaginatedResponse, createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import { log, logTemplates, sanitizeFilters } from '@/lib/logger';
import { createRBACWorkItemFieldValuesService } from '@/lib/services/rbac-work-item-field-values-service';
import { createRBACWorkItemsService } from '@/lib/services/work-items';
import type { UserContext } from '@/lib/types/rbac';
import { workItemCreateSchema, workItemQuerySchema } from '@/lib/validations/work-items';

/**
 * GET /api/work-items
 * List work items with filtering, pagination, and RBAC
 */
const getWorkItemsHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const query = validateQuery(searchParams, workItemQuerySchema);

    // Create RBAC service
    const workItemsService = createRBACWorkItemsService(userContext);

    // Get work items with automatic permission-based filtering
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
      show_hierarchy: query.show_hierarchy,
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
      show_hierarchy: query.show_hierarchy,
    });

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
      custom_fields: item.custom_fields,
    }));

    // Prepare sanitized filter context
    const filters = sanitizeFilters({
      type: query.work_item_type_id,
      organization: query.organization_id,
      status: query.status_id || query.status_category,
      priority: query.priority,
      assignee: query.assigned_to,
      creator: query.created_by,
      search: query.search,
      hierarchy: query.show_hierarchy,
    });

    // Count active filters
    const activeFilters = [
      query.work_item_type_id,
      query.organization_id,
      query.status_id,
      query.status_category,
      query.priority,
      query.assigned_to,
      query.created_by,
      query.search,
      query.show_hierarchy !== 'root_only' ? query.show_hierarchy : undefined,
    ].filter(Boolean);

    // Enriched success log - consolidates 6 separate logs into 1 comprehensive log
    log.info(`work-items list query completed - returned ${workItems.length} of ${totalCount}`, {
      operation: 'list_work_items',
      resourceType: 'work_items',
      userId: userContext.user_id,
      organizationId: userContext.current_organization_id,
      filters,
      filterCount: activeFilters.length,
      results: {
        returned: workItems.length,
        total: totalCount,
        page: Math.floor((query.offset || 0) / (query.limit || 50)) + 1,
        pageSize: query.limit || 50,
      },
      sort: {
        field: query.sortBy || 'created_at',
        direction: query.sortOrder || 'desc',
      },
      duration: Date.now() - startTime,
      slow: Date.now() - startTime > 1000,
      component: 'business-logic',
    });

    return createPaginatedResponse(responseData, {
      page: Math.floor((query.offset || 0) / (query.limit || 50)) + 1,
      limit: query.limit || 50,
      total: totalCount,
    });
  } catch (error) {
    log.error('Work items list query failed', error, {
      operation: 'list_work_items',
      userId: userContext.user_id,
      organizationId: userContext.current_organization_id,
      duration: Date.now() - startTime,
      component: 'business-logic',
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
    const validatedData = await validateRequest(request, workItemCreateSchema);

    // Create RBAC service
    const workItemsService = createRBACWorkItemsService(userContext);

    // Create work item with automatic permission checking
    const newWorkItem = await workItemsService.createWorkItem({
      work_item_type_id: validatedData.work_item_type_id,
      organization_id: validatedData.organization_id || userContext.current_organization_id || '',
      subject: validatedData.subject,
      description: validatedData.description || null,
      priority: validatedData.priority,
      assigned_to: validatedData.assigned_to || null,
      due_date: validatedData.due_date || null,
      parent_work_item_id: validatedData.parent_work_item_id || null,
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

    // Auto-create child work items based on type relationships using automation service
    const { createWorkItemAutomationService } = await import(
      '@/lib/services/work-item-automation-service'
    );
    const automationService = createWorkItemAutomationService(userContext);

    const autoCreatedCount = await automationService.autoCreateChildItems(
      newWorkItem.work_item_id,
      validatedData.work_item_type_id
    );

    // Add creator as watcher (auto-watcher logic)
    const { createRBACWorkItemWatchersService } = await import(
      '@/lib/services/rbac-work-item-watchers-service'
    );
    const watchersService = createRBACWorkItemWatchersService(userContext);

    let watcherAdded = false;
    try {
      await watchersService.addWatcher({
        work_item_id: newWorkItem.work_item_id,
        user_id: userContext.user_id,
        watch_type: 'auto_creator',
        notify_status_changes: true,
        notify_comments: true,
        notify_assignments: true,
        notify_due_date: true,
      });
      watcherAdded = true;
    } catch (error) {
      log.error('Failed to add creator as watcher', error, {
        operation: 'add_watcher',
        workItemId: newWorkItem.work_item_id,
        userId: userContext.user_id,
        component: 'business-logic',
      });
      // Don't fail work item creation if watcher addition fails
    }

    // Enriched creation success log - consolidates 8+ separate logs into 1 comprehensive log
    const template = logTemplates.crud.create('work_item', {
      resourceId: newWorkItem.work_item_id,
      resourceName: newWorkItem.subject,
      userId: userContext.user_id,
      organizationId: newWorkItem.organization_id,
      duration: Date.now() - startTime,
      metadata: {
        workItemType: newWorkItem.work_item_type_name,
        workItemTypeId: newWorkItem.work_item_type_id,
        status: newWorkItem.status_name,
        priority: newWorkItem.priority,
        hasDescription: !!newWorkItem.description,
        ...(newWorkItem.assigned_to && { assignedTo: newWorkItem.assigned_to }),
        ...(newWorkItem.due_date && { dueDate: newWorkItem.due_date }),
        customFieldsSet: customFieldCount,
        autoCreatedChildren: autoCreatedCount,
        creatorWatcherAdded: watcherAdded,
        organizationName: newWorkItem.organization_name,
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
    log.error('Work item creation failed', error, {
      operation: 'create_work_item',
      userId: userContext.user_id,
      organizationId: userContext.current_organization_id,
      duration: Date.now() - startTime,
      component: 'business-logic',
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
