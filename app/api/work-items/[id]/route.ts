import type { NextRequest } from 'next/server';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse, NotFoundError } from '@/lib/api/responses/error';
import { validateRequest } from '@/lib/api/middleware/validation';
import { workItemUpdateSchema, workItemParamsSchema } from '@/lib/validations/work-items';
import { rbacRoute } from '@/lib/api/route-handlers';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import { extractRouteParams } from '@/lib/api/utils/params';
import { createRBACWorkItemsService } from '@/lib/services/rbac-work-items-service';
import { createRBACWorkItemFieldValuesService } from '@/lib/services/rbac-work-item-field-values-service';
import type { UserContext } from '@/lib/types/rbac';
import { log, logTemplates, calculateChanges } from '@/lib/logger';

/**
 * GET /api/work-items/[id]
 * Get a single work item by ID
 */
const getWorkItemHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();

  try {
    const validatedParams = await extractRouteParams(args[0], workItemParamsSchema);

    const workItemsService = createRBACWorkItemsService(userContext);
    const workItem = await workItemsService.getWorkItemById(validatedParams.id);

    if (!workItem) {
      const template = logTemplates.crud.read('work_item', {
        resourceId: String(validatedParams.id),
        found: false,
        userId: userContext.user_id,
        duration: Date.now() - startTime,
      });
      log.info(template.message, template.context);
      throw NotFoundError('Work item');
    }

    const duration = Date.now() - startTime;
    const template = logTemplates.crud.read('work_item', {
      resourceId: String(workItem.work_item_id),
      resourceName: workItem.subject,
      found: true,
      userId: userContext.user_id,
      duration,
      metadata: {
        organizationId: workItem.organization_id,
        workItemTypeId: workItem.work_item_type_id,
        statusCategory: workItem.status_category,
        priority: workItem.priority,
        assignedTo: workItem.assigned_to,
        hasDescription: !!workItem.description,
      },
    });

    log.info(template.message, template.context);

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
    log.error('work item read failed', error, {
      operation: 'read_work_item',
      userId: userContext.user_id,
      component: 'work-items',
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      error instanceof NotFoundError ? 404 : 500,
      request
    );
  }
};

export const GET = rbacRoute(getWorkItemHandler, {
  permission: ['work-items:read:own', 'work-items:read:organization', 'work-items:read:all'],
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
  ...args: unknown[]
) => {
  const startTime = Date.now();

  try {
    const validatedParams = await extractRouteParams(args[0], workItemParamsSchema);
    const validatedData = await validateRequest(request, workItemUpdateSchema);

    const workItemsService = createRBACWorkItemsService(userContext);
    const before = await workItemsService.getWorkItemById(validatedParams.id);

    if (!before) {
      throw NotFoundError('Work item');
    }

    // Update work item with automatic permission checking
    const updatedWorkItem = await workItemsService.updateWorkItem(validatedParams.id, validatedData);

    // Handle custom field values if provided
    if (validatedData.custom_fields && Object.keys(validatedData.custom_fields).length > 0) {
      const fieldValuesService = createRBACWorkItemFieldValuesService(userContext);
      await fieldValuesService.setFieldValues(
        validatedParams.id,
        updatedWorkItem.work_item_type_id,
        validatedData.custom_fields
      );
    }

    // Send status change notification if status changed
    let statusChangeNotificationSent = false;
    if (validatedData.status_id && before.status_id !== updatedWorkItem.status_id) {
      try {
        const { createNotificationService } = await import('@/lib/services/notification-service');
        const notificationService = createNotificationService();

        await notificationService.sendStatusChangeNotification(
          {
            work_item_id: updatedWorkItem.work_item_id,
            subject: updatedWorkItem.subject,
            description: updatedWorkItem.description,
            priority: updatedWorkItem.priority,
            organization_id: updatedWorkItem.organization_id,
            organization_name: updatedWorkItem.organization_name,
          },
          {
            work_item_status_id: before.status_id,
            work_item_type_id: before.work_item_type_id,
            status_name: before.status_name,
            status_category: before.status_category,
            is_initial: false,
            is_final: false,
            color: null,
            display_order: 0,
            created_at: new Date(),
            updated_at: new Date(),
          },
          {
            work_item_status_id: updatedWorkItem.status_id,
            work_item_type_id: updatedWorkItem.work_item_type_id,
            status_name: updatedWorkItem.status_name,
            status_category: updatedWorkItem.status_category,
            is_initial: false,
            is_final: false,
            color: null,
            display_order: 0,
            created_at: new Date(),
            updated_at: new Date(),
          }
        );
        statusChangeNotificationSent = true;

        log.info('status change notification sent', {
          workItemId: validatedParams.id,
          oldStatus: before.status_name,
          newStatus: updatedWorkItem.status_name,
        });
      } catch (error) {
        // Don't fail work item update if notification fails
        log.error('failed to send status change notification', error, {
          workItemId: validatedParams.id,
        });
      }
    }

    // Add assignee as watcher when assignment changes
    let watcherAdded = false;
    if (validatedData.assigned_to && updatedWorkItem.assigned_to) {
      const { createRBACWorkItemWatchersService } = await import('@/lib/services/rbac-work-item-watchers-service');
      const watchersService = createRBACWorkItemWatchersService(userContext);

      try {
        const existingWatchers = await watchersService.getWatchersForWorkItem(validatedParams.id);
        const isAlreadyWatcher = existingWatchers.some(
          (w) => w.user_id === updatedWorkItem.assigned_to
        );

        if (!isAlreadyWatcher) {
          await watchersService.addWatcher({
            work_item_id: validatedParams.id,
            user_id: updatedWorkItem.assigned_to,
            watch_type: 'auto_assignee',
            notify_status_changes: true,
            notify_comments: true,
            notify_assignments: true,
            notify_due_date: true,
          });
          watcherAdded = true;
        }
      } catch (error) {
        log.error('failed to add assignee as watcher', error, {
          workItemId: validatedParams.id,
          userId: updatedWorkItem.assigned_to,
        });
      }
    }

    const duration = Date.now() - startTime;
    const changes = calculateChanges(
      {
        subject: before.subject,
        description: before.description,
        status_id: before.status_id,
        priority: before.priority,
        assigned_to: before.assigned_to,
        due_date: before.due_date,
      },
      {
        subject: updatedWorkItem.subject,
        description: updatedWorkItem.description,
        status_id: updatedWorkItem.status_id,
        priority: updatedWorkItem.priority,
        assigned_to: updatedWorkItem.assigned_to,
        due_date: updatedWorkItem.due_date,
      }
    );

    const template = logTemplates.crud.update('work_item', {
      resourceId: String(updatedWorkItem.work_item_id),
      resourceName: updatedWorkItem.subject,
      userId: userContext.user_id,
      changes,
      duration,
      metadata: {
        organizationId: updatedWorkItem.organization_id,
        workItemTypeId: updatedWorkItem.work_item_type_id,
        statusCategory: updatedWorkItem.status_category,
        priority: updatedWorkItem.priority,
        assignedTo: updatedWorkItem.assigned_to,
        customFieldsUpdated: validatedData.custom_fields
          ? Object.keys(validatedData.custom_fields).length
          : 0,
        statusChangeNotificationSent,
        watcherAdded,
      },
    });

    log.info(template.message, template.context);

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
    log.error('work item update failed', error, {
      operation: 'update_work_item',
      userId: userContext.user_id,
      component: 'work-items',
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      error instanceof NotFoundError ? 404 : 500,
      request
    );
  }
};

export const PUT = rbacRoute(updateWorkItemHandler, {
  permission: ['work-items:update:own', 'work-items:update:organization', 'work-items:update:all'],
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
  ...args: unknown[]
) => {
  const startTime = Date.now();

  try {
    const validatedParams = await extractRouteParams(args[0], workItemParamsSchema);

    const workItemsService = createRBACWorkItemsService(userContext);
    const workItem = await workItemsService.getWorkItemById(validatedParams.id);

    if (!workItem) {
      throw NotFoundError('Work item');
    }

    await workItemsService.deleteWorkItem(validatedParams.id);

    const duration = Date.now() - startTime;
    const template = logTemplates.crud.delete('work_item', {
      resourceId: String(workItem.work_item_id),
      resourceName: workItem.subject,
      userId: userContext.user_id,
      soft: true,
      duration,
      metadata: {
        organizationId: workItem.organization_id,
        workItemTypeId: workItem.work_item_type_id,
        statusCategory: workItem.status_category,
        wasAssigned: !!workItem.assigned_to,
      },
    });

    log.info(template.message, template.context);

    return createSuccessResponse(null, 'Work item deleted successfully');
  } catch (error) {
    log.error('work item deletion failed', error, {
      operation: 'delete_work_item',
      userId: userContext.user_id,
      component: 'work-items',
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      error instanceof NotFoundError ? 404 : 500,
      request
    );
  }
};

export const DELETE = rbacRoute(deleteWorkItemHandler, {
  permission: ['work-items:delete:own', 'work-items:delete:organization', 'work-items:delete:all'],
  extractResourceId: extractors.workItemId,
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});
