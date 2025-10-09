'use client';

/**
 * Transition Action Builder Component
 * Phase 7: Advanced Workflows & Automation
 *
 * Allows admins to configure automated actions for status transitions:
 * - Notifications (email recipients, templates)
 * - Field updates (with template interpolation)
 * - Assignments (assign to specific users with conditions)
 */

import { useState } from 'react';
import { X, Plus, ChevronDown, ChevronRight, HelpCircle } from 'lucide-react';
import { useWorkItemFields } from '@/lib/hooks/use-work-item-fields';
import { useUsers } from '@/lib/hooks/use-users';

interface NotificationAction {
  type: 'notification';
  recipients: string[]; // 'assigned_to', 'creator', 'watchers', or user IDs
  template?: string;
  subject?: string;
}

interface FieldUpdateAction {
  type: 'field_update';
  field_id: string;
  value: string; // supports template tokens
  condition?: string;
}

interface AssignmentAction {
  type: 'assignment';
  assign_to: string; // user ID or template token like '{creator}'
  condition?: string;
}

type Action = NotificationAction | FieldUpdateAction | AssignmentAction;

interface ActionConfig {
  notifications: NotificationAction[];
  field_updates: FieldUpdateAction[];
  assignments: AssignmentAction[];
}

interface TransitionActionBuilderProps {
  workItemTypeId: string;
  initialConfig?: ActionConfig | null;
  onChange: (config: ActionConfig) => void;
}

const RECIPIENT_TYPES = [
  { value: 'assigned_to', label: 'Assigned User' },
  { value: 'creator', label: 'Creator' },
  { value: 'watchers', label: 'All Watchers' },
] as const;

const TEMPLATE_TOKENS = [
  { token: '{now}', description: 'Current date and time' },
  { token: '{creator}', description: 'Creator user ID' },
  { token: '{assigned_to}', description: 'Assigned user ID' },
  { token: '{work_item.subject}', description: 'Work item subject' },
  { token: '{work_item.description}', description: 'Work item description' },
  { token: '{work_item.priority}', description: 'Work item priority' },
] as const;

const CONDITIONS = [
  { value: 'status_is_terminal', label: 'Status is terminal (final)' },
  { value: 'status_name_equals:Completed', label: 'Status name equals Completed' },
  { value: 'status_name_equals:Cancelled', label: 'Status name equals Cancelled' },
] as const;

export function TransitionActionBuilder({
  workItemTypeId,
  initialConfig,
  onChange,
}: TransitionActionBuilderProps) {
  const { data: fields = [], isLoading: fieldsLoading } = useWorkItemFields({
    work_item_type_id: workItemTypeId,
  });
  const { data: users = [], isLoading: usersLoading } = useUsers();
  const [showPreview, setShowPreview] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const [notifications, setNotifications] = useState<NotificationAction[]>(
    initialConfig?.notifications || []
  );

  const [fieldUpdates, setFieldUpdates] = useState<FieldUpdateAction[]>(
    initialConfig?.field_updates || []
  );

  const [assignments, setAssignments] = useState<AssignmentAction[]>(
    initialConfig?.assignments || []
  );

  const emitChange = (
    newNotifications: NotificationAction[],
    newFieldUpdates: FieldUpdateAction[],
    newAssignments: AssignmentAction[]
  ) => {
    onChange({
      notifications: newNotifications,
      field_updates: newFieldUpdates,
      assignments: newAssignments,
    });
  };

  // Notification Actions
  const handleAddNotification = () => {
    const newNotification: NotificationAction = {
      type: 'notification',
      recipients: [],
      subject: '',
      template: '',
    };
    const updated = [...notifications, newNotification];
    setNotifications(updated);
    emitChange(updated, fieldUpdates, assignments);
  };

  const handleRemoveNotification = (index: number) => {
    const updated = notifications.filter((_, i) => i !== index);
    setNotifications(updated);
    emitChange(updated, fieldUpdates, assignments);
  };

  const handleNotificationChange = (
    index: number,
    field: keyof NotificationAction,
    value: string | string[]
  ) => {
    const updated = notifications.map((notif, i) =>
      i === index ? { ...notif, [field]: value } : notif
    );
    setNotifications(updated);
    emitChange(updated, fieldUpdates, assignments);
  };

  const handleRecipientToggle = (index: number, recipient: string) => {
    const notification = notifications[index];
    if (!notification) return;

    const newRecipients = notification.recipients.includes(recipient)
      ? notification.recipients.filter((r) => r !== recipient)
      : [...notification.recipients, recipient];

    handleNotificationChange(index, 'recipients', newRecipients);
  };

  // Field Update Actions
  const handleAddFieldUpdate = () => {
    const newFieldUpdate: FieldUpdateAction = {
      type: 'field_update',
      field_id: '',
      value: '',
      condition: '',
    };
    const updated = [...fieldUpdates, newFieldUpdate];
    setFieldUpdates(updated);
    emitChange(notifications, updated, assignments);
  };

  const handleRemoveFieldUpdate = (index: number) => {
    const updated = fieldUpdates.filter((_, i) => i !== index);
    setFieldUpdates(updated);
    emitChange(notifications, updated, assignments);
  };

  const handleFieldUpdateChange = (
    index: number,
    field: keyof FieldUpdateAction,
    value: string
  ) => {
    const updated = fieldUpdates.map((update, i) =>
      i === index ? { ...update, [field]: value } : update
    );
    setFieldUpdates(updated);
    emitChange(notifications, updated, assignments);
  };

  // Assignment Actions
  const handleAddAssignment = () => {
    const newAssignment: AssignmentAction = {
      type: 'assignment',
      assign_to: '',
      condition: '',
    };
    const updated = [...assignments, newAssignment];
    setAssignments(updated);
    emitChange(notifications, fieldUpdates, updated);
  };

  const handleRemoveAssignment = (index: number) => {
    const updated = assignments.filter((_, i) => i !== index);
    setAssignments(updated);
    emitChange(notifications, fieldUpdates, updated);
  };

  const handleAssignmentChange = (
    index: number,
    field: keyof AssignmentAction,
    value: string
  ) => {
    const updated = assignments.map((assignment, i) =>
      i === index ? { ...assignment, [field]: value } : assignment
    );
    setAssignments(updated);
    emitChange(notifications, fieldUpdates, updated);
  };

  const insertToken = (token: string, textareaId: string) => {
    const textarea = document.getElementById(textareaId) as HTMLTextAreaElement;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value;
      const newText = text.substring(0, start) + token + text.substring(end);
      textarea.value = newText;
      textarea.focus();
      textarea.setSelectionRange(start + token.length, start + token.length);
    }
  };

  if (fieldsLoading || usersLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-gray-500 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  const actionConfig: ActionConfig = {
    notifications,
    field_updates: fieldUpdates,
    assignments,
  };

  return (
    <div className="space-y-8">
      {/* Help Section */}
      <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800/30 rounded-lg p-4">
        <button
          type="button"
          onClick={() => setShowHelp(!showHelp)}
          className="flex items-center gap-2 text-sm font-medium text-blue-900 dark:text-blue-300 w-full"
        >
          <HelpCircle className="h-4 w-4" />
          Template Tokens
          {showHelp ? (
            <ChevronDown className="h-4 w-4 ml-auto" />
          ) : (
            <ChevronRight className="h-4 w-4 ml-auto" />
          )}
        </button>

        {showHelp && (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-blue-800 dark:text-blue-200">
              Use these tokens in field values and notification subjects:
            </p>
            <div className="grid grid-cols-2 gap-2">
              {TEMPLATE_TOKENS.map((item) => (
                <div
                  key={item.token}
                  className="text-xs bg-white dark:bg-gray-800 p-2 rounded border border-blue-200 dark:border-blue-800/30"
                >
                  <code className="text-blue-600 dark:text-blue-400 font-mono">
                    {item.token}
                  </code>
                  <div className="text-gray-600 dark:text-gray-400 mt-0.5">
                    {item.description}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Notifications Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
              Notification Actions
            </h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Send email notifications when this transition occurs.
            </p>
          </div>
          <button
            type="button"
            onClick={handleAddNotification}
            className="btn-sm bg-blue-500 hover:bg-blue-600 text-white flex items-center gap-1"
          >
            <Plus className="h-3 w-3" />
            Add Notification
          </button>
        </div>

        <div className="space-y-3">
          {notifications.length === 0 ? (
            <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-8 border border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
              No notifications configured. Click "Add Notification" to create one.
            </div>
          ) : (
            notifications.map((notification, index) => (
              <div
                key={index}
                className="border border-gray-200 dark:border-gray-700/60 rounded-lg p-4 bg-white dark:bg-gray-800 space-y-3"
              >
                <div className="flex items-start justify-between">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    Notification #{index + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveNotification(index)}
                    className="text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Recipients
                  </label>
                  <div className="space-y-1.5">
                    {RECIPIENT_TYPES.map((recipient) => (
                      <label
                        key={recipient.value}
                        className="flex items-center gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={notification.recipients.includes(
                            recipient.value
                          )}
                          onChange={() =>
                            handleRecipientToggle(index, recipient.value)
                          }
                          className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-gray-700 dark:text-gray-300">
                          {recipient.label}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Email Subject
                  </label>
                  <input
                    type="text"
                    value={notification.subject || ''}
                    onChange={(e) =>
                      handleNotificationChange(index, 'subject', e.target.value)
                    }
                    placeholder="Work item {work_item.subject} updated"
                    className="form-input w-full text-sm"
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Field Updates Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
              Field Update Actions
            </h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Automatically update field values when this transition occurs.
            </p>
          </div>
          <button
            type="button"
            onClick={handleAddFieldUpdate}
            className="btn-sm bg-blue-500 hover:bg-blue-600 text-white flex items-center gap-1"
          >
            <Plus className="h-3 w-3" />
            Add Field Update
          </button>
        </div>

        <div className="space-y-3">
          {fieldUpdates.length === 0 ? (
            <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-8 border border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
              No field updates configured. Click "Add Field Update" to create one.
            </div>
          ) : (
            fieldUpdates.map((update, index) => (
              <div
                key={index}
                className="border border-gray-200 dark:border-gray-700/60 rounded-lg p-4 bg-white dark:bg-gray-800 space-y-3"
              >
                <div className="flex items-start justify-between">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    Field Update #{index + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveFieldUpdate(index)}
                    className="text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Field
                    </label>
                    <select
                      value={update.field_id}
                      onChange={(e) =>
                        handleFieldUpdateChange(index, 'field_id', e.target.value)
                      }
                      className="form-select w-full text-sm"
                    >
                      <option value="">Select field...</option>
                      {fields.map((field) => (
                        <option key={field.work_item_field_id} value={field.work_item_field_id}>
                          {field.field_label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Condition (optional)
                    </label>
                    <select
                      value={update.condition || ''}
                      onChange={(e) =>
                        handleFieldUpdateChange(index, 'condition', e.target.value)
                      }
                      className="form-select w-full text-sm"
                    >
                      <option value="">Always apply</option>
                      {CONDITIONS.map((cond) => (
                        <option key={cond.value} value={cond.value}>
                          {cond.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Value (supports template tokens)
                  </label>
                  <textarea
                    id={`field-value-${index}`}
                    value={update.value}
                    onChange={(e) =>
                      handleFieldUpdateChange(index, 'value', e.target.value)
                    }
                    placeholder="Enter value or use template tokens like {now}"
                    rows={2}
                    className="form-textarea w-full text-sm"
                  />
                  <div className="flex gap-1 mt-1">
                    {TEMPLATE_TOKENS.slice(0, 3).map((item) => (
                      <button
                        key={item.token}
                        type="button"
                        onClick={() =>
                          insertToken(item.token, `field-value-${index}`)
                        }
                        className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
                      >
                        {item.token}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Assignments Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
              Assignment Actions
            </h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Automatically assign the work item when this transition occurs.
            </p>
          </div>
          <button
            type="button"
            onClick={handleAddAssignment}
            className="btn-sm bg-blue-500 hover:bg-blue-600 text-white flex items-center gap-1"
          >
            <Plus className="h-3 w-3" />
            Add Assignment
          </button>
        </div>

        <div className="space-y-3">
          {assignments.length === 0 ? (
            <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-8 border border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
              No assignments configured. Click "Add Assignment" to create one.
            </div>
          ) : (
            assignments.map((assignment, index) => (
              <div
                key={index}
                className="border border-gray-200 dark:border-gray-700/60 rounded-lg p-4 bg-white dark:bg-gray-800 space-y-3"
              >
                <div className="flex items-start justify-between">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    Assignment #{index + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveAssignment(index)}
                    className="text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Assign To
                    </label>
                    <select
                      value={assignment.assign_to}
                      onChange={(e) =>
                        handleAssignmentChange(index, 'assign_to', e.target.value)
                      }
                      className="form-select w-full text-sm"
                    >
                      <option value="">Select user...</option>
                      <option value="{creator}">Creator (template)</option>
                      <option value="{assigned_to}">Current Assignee (template)</option>
                      <optgroup label="Specific Users">
                        {users.map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.first_name} {user.last_name}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Condition (optional)
                    </label>
                    <select
                      value={assignment.condition || ''}
                      onChange={(e) =>
                        handleAssignmentChange(index, 'condition', e.target.value)
                      }
                      className="form-select w-full text-sm"
                    >
                      <option value="">Always assign</option>
                      {CONDITIONS.map((cond) => (
                        <option key={cond.value} value={cond.value}>
                          {cond.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Preview Section */}
      <div className="border-t border-gray-200 dark:border-gray-700/60 pt-4">
        <button
          type="button"
          onClick={() => setShowPreview(!showPreview)}
          className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
        >
          {showPreview ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          {showPreview ? 'Hide' : 'Show'} Configuration Preview
        </button>

        {showPreview && (
          <div className="mt-3">
            <pre className="bg-gray-900 dark:bg-gray-950 text-gray-100 p-4 rounded-lg text-xs overflow-x-auto">
              {JSON.stringify(actionConfig, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
