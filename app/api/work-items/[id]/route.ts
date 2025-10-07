import type { NextRequest } from 'next/server';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { validateRequest, validateParams } from '@/lib/api/middleware/validation';
import { workItemUpdateSchema, workItemParamsSchema } from '@/lib/validations/work-items';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import { createRBACWorkItemsService } from '@/lib/services/rbac-work-items-service';
import type { UserContext } from '@/lib/types/rbac';
import { log } from '@/lib/logger';

/**
 * GET /api/work-items/[id]
 * Get a single work item by ID
 */
const getWorkItemHandler = async (
  request: NextRequest,
  userContext: UserContext,
  _options: unknown,
  params: Record<string, string>
) => {
  const startTime = Date.now();

  log.info('Get work item request initiated', {
    requestingUserId: userContext.user_id,
  });

  try {
    const validationStart = Date.now();
    const validatedParams = validateParams(params, workItemParamsSchema);
    log.info('Request validation completed', { duration: Date.now() - validationStart });

    // Create RBAC service
    const serviceStart = Date.now();
    const workItemsService = createRBACWorkItemsService(userContext);
    log.info('RBAC service created', { duration: Date.now() - serviceStart });

    // Get work item with automatic permission checking
    const workItemStart = Date.now();
    const workItem = await workItemsService.getWorkItemById(validatedParams.id);
    log.db('SELECT', 'work_items', Date.now() - workItemStart, { rowCount: workItem ? 1 : 0 });

    if (!workItem) {
      return createErrorResponse('Work item not found', 404, request);
    }

    const totalDuration = Date.now() - startTime;
    log.info('Work item retrieved successfully', {
      workItemId: validatedParams.id,
      totalDuration,
    });

    return createSuccessResponse({
      id: workItem.work_item_id,
      work_item_type_id: workItem.work_item_type_id,
      work_item_type_name: workItem.work_item_type_name,
      organization_id: workItem.organization_id,
      organization_name: workItem.organization_name,
      subject: workItem.subject,
      description: workItem.description,
      status_id: workItem.status_id,
      status_name: workItem.status_name,
      status_category: workItem.status_category,
      priority: workItem.priority,
      assigned_to: workItem.assigned_to,
      assigned_to_name: workItem.assigned_to_name,
      due_date: workItem.due_date,
      started_at: workItem.started_at,
      completed_at: workItem.completed_at,
      created_by: workItem.created_by,
      created_by_name: workItem.created_by_name,
      created_at: workItem.created_at,
      updated_at: workItem.updated_at,
    });
  } catch (error) {
    const totalDuration = Date.now() - startTime;

    log.error('Get work item failed', error, {
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

export const GET = rbacRoute(getWorkItemHandler, {
  permission: ['work_items:read:own', 'work_items:read:organization', 'work_items:read:all'],
  extractResourceId: extractors.workItemId,
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});

/**
 * PUT /api/work-items/[id]
 * Update a work item
 */
const updateWorkItemHandler = async (
  request: NextRequest,
  userContext: UserContext,
  _options: unknown,
  params: Record<string, string>
) => {
  const startTime = Date.now();

  log.info('Update work item request initiated', {
    requestingUserId: userContext.user_id,
  });

  try {
    const validationStart = Date.now();
    const validatedParams = validateParams(params, workItemParamsSchema);
    const validatedData = await validateRequest(request, workItemUpdateSchema);
    log.info('Request validation completed', { duration: Date.now() - validationStart });

    // Create RBAC service
    const serviceStart = Date.now();
    const workItemsService = createRBACWorkItemsService(userContext);
    log.info('RBAC service created', { duration: Date.now() - serviceStart });

    // Update work item with automatic permission checking
    const updateStart = Date.now();
    const updatedWorkItem = await workItemsService.updateWorkItem(validatedParams.id, validatedData);
    log.db('UPDATE', 'work_items', Date.now() - updateStart, { rowCount: 1 });

    const totalDuration = Date.now() - startTime;
    log.info('Work item updated successfully', {
      workItemId: validatedParams.id,
      totalDuration,
    });

    return createSuccessResponse(
      {
        id: updatedWorkItem.work_item_id,
        work_item_type_id: updatedWorkItem.work_item_type_id,
        work_item_type_name: updatedWorkItem.work_item_type_name,
        organization_id: updatedWorkItem.organization_id,
        organization_name: updatedWorkItem.organization_name,
        subject: updatedWorkItem.subject,
        description: updatedWorkItem.description,
        status_id: updatedWorkItem.status_id,
        status_name: updatedWorkItem.status_name,
        status_category: updatedWorkItem.status_category,
        priority: updatedWorkItem.priority,
        assigned_to: updatedWorkItem.assigned_to,
        assigned_to_name: updatedWorkItem.assigned_to_name,
        due_date: updatedWorkItem.due_date,
        started_at: updatedWorkItem.started_at,
        completed_at: updatedWorkItem.completed_at,
        created_by: updatedWorkItem.created_by,
        created_by_name: updatedWorkItem.created_by_name,
        created_at: updatedWorkItem.created_at,
        updated_at: updatedWorkItem.updated_at,
      },
      'Work item updated successfully'
    );
  } catch (error) {
    const totalDuration = Date.now() - startTime;

    log.error('Update work item failed', error, {
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

export const PUT = rbacRoute(updateWorkItemHandler, {
  permission: ['work_items:update:own', 'work_items:update:organization', 'work_items:update:all'],
  extractResourceId: extractors.workItemId,
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});

/**
 * DELETE /api/work-items/[id]
 * Delete a work item (soft delete)
 */
const deleteWorkItemHandler = async (
  request: NextRequest,
  userContext: UserContext,
  _options: unknown,
  params: Record<string, string>
) => {
  const startTime = Date.now();

  log.info('Delete work item request initiated', {
    requestingUserId: userContext.user_id,
  });

  try {
    const validationStart = Date.now();
    const validatedParams = validateParams(params, workItemParamsSchema);
    log.info('Request validation completed', { duration: Date.now() - validationStart });

    // Create RBAC service
    const serviceStart = Date.now();
    const workItemsService = createRBACWorkItemsService(userContext);
    log.info('RBAC service created', { duration: Date.now() - serviceStart });

    // Delete work item with automatic permission checking
    const deleteStart = Date.now();
    await workItemsService.deleteWorkItem(validatedParams.id);
    log.db('UPDATE', 'work_items', Date.now() - deleteStart, { rowCount: 1 });

    const totalDuration = Date.now() - startTime;
    log.info('Work item deleted successfully', {
      workItemId: validatedParams.id,
      totalDuration,
    });

    return createSuccessResponse(null, 'Work item deleted successfully');
  } catch (error) {
    const totalDuration = Date.now() - startTime;

    log.error('Delete work item failed', error, {
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

export const DELETE = rbacRoute(deleteWorkItemHandler, {
  permission: ['work_items:delete:own', 'work_items:delete:organization', 'work_items:delete:all'],
  extractResourceId: extractors.workItemId,
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});
