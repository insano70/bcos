import { log } from '@/lib/logger';
import { createNotificationService } from '@/lib/services/notification-service';
import type { WorkItemStatus } from '@/lib/hooks/use-work-item-statuses';

/**
 * Notification action interface
 */
export interface NotificationAction {
  type: 'email';
  recipients: string[]; // 'assigned_to', 'creator', 'watchers', or specific user IDs
  template: string;
  subject?: string;
}

/**
 * Field update action interface
 */
export interface FieldUpdateAction {
  field: string;
  value: string; // Can contain template tokens like {now}, {creator}, {assigned_to}
  condition?: string; // Optional condition like "status_is_terminal"
}

/**
 * Assignment action interface
 */
export interface AssignmentAction {
  action: 'assign_to';
  user_id: string; // Can contain template tokens like {creator}
  condition?: string; // Optional condition like "status_name_equals:In Review"
}

/**
 * Action config interface
 */
export interface ActionConfig {
  notifications?: NotificationAction[];
  field_updates?: FieldUpdateAction[];
  assignments?: AssignmentAction[];
}

/**
 * Status transition interface
 */
export interface StatusTransition {
  work_item_status_transition_id: string;
  from_status_id: string;
  to_status_id: string;
  is_allowed: boolean;
  validation_config: Record<string, unknown> | null;
  action_config: ActionConfig | null;
}

/**
 * Work item context for actions
 */
export interface WorkItemContext {
  work_item_id: string;
  subject: string;
  description: string | null;
  priority: string | null;
  organization_id: string;
  organization_name?: string;
  assigned_to: string | null;
  created_by: string;
  due_date: Date | null;
}

/**
 * Action execution result
 */
export interface ActionExecutionResult {
  success: boolean;
  errors: string[];
  field_updates?: Record<string, unknown>;
  assignments?: { assigned_to: string };
}

/**
 * Execute transition actions
 *
 * Executes configured actions when a status transition occurs:
 * 1. Notifications (email)
 * 2. Field updates
 * 3. Assignments
 *
 * @param workItem - The work item context
 * @param transition - The transition configuration
 * @param oldStatus - The previous status
 * @param newStatus - The new status
 * @returns ActionExecutionResult with success flag, errors, and any data changes
 */
export async function executeTransitionActions(
  workItem: WorkItemContext,
  transition: StatusTransition,
  oldStatus: WorkItemStatus,
  newStatus: WorkItemStatus
): Promise<ActionExecutionResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  const result: ActionExecutionResult = {
    success: true,
    errors: [],
  };

  try {
    log.info('Executing transition actions', {
      work_item_id: workItem.work_item_id,
      transition_id: transition.work_item_status_transition_id,
      from_status: oldStatus.status_name,
      to_status: newStatus.status_name,
    });

    const actionConfig = transition.action_config;

    // If no action config, nothing to do
    if (!actionConfig) {
      log.info('No action config - skipping actions', {
        work_item_id: workItem.work_item_id,
        duration: Date.now() - startTime,
      });
      return result;
    }

    // Execute field updates
    if (actionConfig.field_updates && actionConfig.field_updates.length > 0) {
      const fieldUpdates = executeFieldUpdates(
        workItem,
        actionConfig.field_updates,
        newStatus
      );
      if (Object.keys(fieldUpdates).length > 0) {
        result.field_updates = fieldUpdates;
      }
    }

    // Execute assignments
    if (actionConfig.assignments && actionConfig.assignments.length > 0) {
      const assignment = executeAssignments(
        workItem,
        actionConfig.assignments,
        newStatus
      );
      if (assignment) {
        result.assignments = assignment;
      }
    }

    // Execute notifications (async, don't wait)
    if (actionConfig.notifications && actionConfig.notifications.length > 0) {
      // Fire and forget - notifications shouldn't block the transition
      void executeNotifications(
        workItem,
        actionConfig.notifications,
        oldStatus,
        newStatus
      );
    }

    const duration = Date.now() - startTime;

    log.info('Transition actions executed', {
      work_item_id: workItem.work_item_id,
      field_updates_count: result.field_updates ? Object.keys(result.field_updates).length : 0,
      assignments_count: result.assignments ? 1 : 0,
      notifications_count: actionConfig.notifications?.length || 0,
      duration,
    });

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    log.error('Failed to execute transition actions', error, {
      work_item_id: workItem.work_item_id,
      transition_id: transition.work_item_status_transition_id,
      duration,
    });

    errors.push('Failed to execute some transition actions. Please check the logs.');
    return { success: false, errors };
  }
}

/**
 * Execute field update actions
 *
 * @param workItem - The work item context
 * @param fieldUpdates - Array of field update actions
 * @param newStatus - The new status
 * @returns Object with field updates to apply
 */
function executeFieldUpdates(
  workItem: WorkItemContext,
  fieldUpdates: FieldUpdateAction[],
  newStatus: WorkItemStatus
): Record<string, unknown> {
  const updates: Record<string, unknown> = {};

  for (const action of fieldUpdates) {
    // Check condition if present
    if (action.condition && !evaluateCondition(action.condition, workItem, newStatus)) {
      log.info('Skipping field update - condition not met', {
        work_item_id: workItem.work_item_id,
        field: action.field,
        condition: action.condition,
      });
      continue;
    }

    // Interpolate template tokens
    const value = interpolateTokens(action.value, workItem);

    updates[action.field] = value;

    log.info('Field update action executed', {
      work_item_id: workItem.work_item_id,
      field: action.field,
      value,
    });
  }

  return updates;
}

/**
 * Execute assignment actions
 *
 * @param workItem - The work item context
 * @param assignments - Array of assignment actions
 * @param newStatus - The new status
 * @returns Assignment data to apply, or null if no assignment
 */
function executeAssignments(
  workItem: WorkItemContext,
  assignments: AssignmentAction[],
  newStatus: WorkItemStatus
): { assigned_to: string } | null {
  // Only apply the first matching assignment
  for (const action of assignments) {
    // Check condition if present
    if (action.condition && !evaluateCondition(action.condition, workItem, newStatus)) {
      log.info('Skipping assignment - condition not met', {
        work_item_id: workItem.work_item_id,
        condition: action.condition,
      });
      continue;
    }

    // Interpolate template tokens
    const userId = interpolateTokens(action.user_id, workItem);

    log.info('Assignment action executed', {
      work_item_id: workItem.work_item_id,
      assigned_to: userId,
    });

    return { assigned_to: userId };
  }

  return null;
}

/**
 * Execute notification actions
 *
 * @param workItem - The work item context
 * @param notifications - Array of notification actions
 * @param oldStatus - The previous status
 * @param newStatus - The new status
 */
async function executeNotifications(
  workItem: WorkItemContext,
  notifications: NotificationAction[],
  oldStatus: WorkItemStatus,
  newStatus: WorkItemStatus
): Promise<void> {
  try {
    const notificationService = createNotificationService();

    for (const action of notifications) {
      if (action.type === 'email') {
        // For now, we only support status change notifications
        // The NotificationService will handle recipient resolution via watchers
        await notificationService.sendStatusChangeNotification(
          workItem,
          oldStatus,
          newStatus
        );

        log.info('Notification action executed', {
          work_item_id: workItem.work_item_id,
          type: action.type,
          template: action.template,
        });
      }
    }
  } catch (error) {
    log.error('Failed to execute notification actions', error, {
      work_item_id: workItem.work_item_id,
    });
    // Don't throw - notification failures shouldn't block the transition
  }
}

/**
 * Evaluate a condition string
 *
 * Supported conditions:
 * - "status_is_terminal" - checks if newStatus.is_final is true
 * - "status_name_equals:StatusName" - checks if newStatus.status_name equals "StatusName"
 *
 * @param condition - The condition string
 * @param workItem - The work item context
 * @param newStatus - The new status
 * @returns True if condition is met, false otherwise
 */
function evaluateCondition(
  condition: string,
  workItem: WorkItemContext,
  newStatus: WorkItemStatus
): boolean {
  if (condition === 'status_is_terminal') {
    return newStatus.is_final;
  }

  if (condition.startsWith('status_name_equals:')) {
    const expectedStatus = condition.split(':')[1];
    return newStatus.status_name === expectedStatus;
  }

  log.warn('Unknown condition type', { condition, work_item_id: workItem.work_item_id });
  return false;
}

/**
 * Interpolate template tokens in a string
 *
 * Supported tokens:
 * - {now} - Current ISO timestamp
 * - {creator} - Work item creator user ID
 * - {assigned_to} - Work item assigned_to user ID
 * - {work_item.field} - Any work item field
 *
 * @param template - The template string
 * @param workItem - The work item context
 * @returns The interpolated string
 */
function interpolateTokens(template: string, workItem: WorkItemContext): string {
  let result = template;

  // Replace {now} with current timestamp
  result = result.replace(/{now}/g, new Date().toISOString());

  // Replace {creator} with creator user ID
  result = result.replace(/{creator}/g, workItem.created_by);

  // Replace {assigned_to} with assigned_to user ID
  if (workItem.assigned_to) {
    result = result.replace(/{assigned_to}/g, workItem.assigned_to);
  }

  // Replace {work_item.field} with work item field values
  result = result.replace(/{work_item\.(\w+)}/g, (_match, fieldName) => {
    const value = (workItem as unknown as Record<string, unknown>)[fieldName];
    return value !== null && value !== undefined ? String(value) : '';
  });

  return result;
}
