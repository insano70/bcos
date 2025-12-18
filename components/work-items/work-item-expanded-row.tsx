'use client';

import type { WorkItem } from '@/lib/hooks/use-work-items';
import { useWorkItemFields } from '@/lib/hooks/use-work-item-fields';
import { useWorkItemComments } from '@/lib/hooks/use-work-items';
import { useWorkItemAttachments } from '@/lib/hooks/use-work-item-attachments';
import { useRouter } from 'next/navigation';
import DateInput from '@/components/inputs/date-input';
import DateTimeInput from '@/components/inputs/datetime-input';
import { FormLabel } from '@/components/ui/form-label';

export interface WorkItemExpandedRowProps {
  workItem: WorkItem;
  isEditing?: boolean;
  changes?: Partial<WorkItem>;
  onChange?: (key: keyof WorkItem, value: unknown) => void;
  errors?: Record<string, string>;
}

export default function WorkItemExpandedRow({
  workItem,
  isEditing = false,
  changes = {},
  onChange,
  errors = {},
}: WorkItemExpandedRowProps) {
  const router = useRouter();

  const { data: customFields = [] } = useWorkItemFields({
    work_item_type_id: workItem.work_item_type_id,
    is_visible: true,
  });

  // Fetch comments (limit to 3 recent) - hide in edit mode to focus on data entry
  const { data: comments = [] } = useWorkItemComments({
    work_item_id: workItem.id,
    limit: 3,
  });

  // Fetch attachments (limit to 5 recent) - hide in edit mode to focus on data entry
  const { data: attachments = [] } = useWorkItemAttachments(workItem.id);

  // Get current values (use changes if available, otherwise fall back to workItem)
  const currentDescription = changes.description !== undefined ? changes.description : workItem.description;
  const currentCustomFields = changes.custom_fields !== undefined ? changes.custom_fields : workItem.custom_fields;

  return (
    <div className="px-5 py-4 bg-gray-50 dark:bg-gray-800/50 relative z-0">
      <div className="space-y-6">
        {/* Custom Fields Section - 2 column responsive grid */}
        {customFields.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
            {customFields.map((field) => {
              const fieldValue = currentCustomFields?.[field.work_item_field_id];
              const fieldError = errors[`custom_fields.${field.work_item_field_id}`];

              // Handler for custom field changes
              const handleCustomFieldChange = (value: unknown) => {
                if (!onChange) return;
                onChange('custom_fields', {
                  ...currentCustomFields,
                  [field.work_item_field_id]: value,
                });
              };

              return (
                <div key={field.work_item_field_id}>
                  <FormLabel required={field.is_required_on_creation} className="font-semibold mb-1">
                    {field.field_label}
                  </FormLabel>
                    {isEditing && onChange ? (
                      <div>
                        {/* Text field */}
                        {field.field_type === 'text' && (
                          <input
                            type="text"
                            value={String(fieldValue || '')}
                            onChange={(e) => handleCustomFieldChange(e.target.value || null)}
                            className={`form-input w-full text-sm ${fieldError ? 'border-red-500' : ''}`}
                          />
                        )}

                        {/* Number field */}
                        {field.field_type === 'number' && (
                          <input
                            type="number"
                            value={fieldValue !== null && fieldValue !== undefined ? Number(fieldValue) : ''}
                            onChange={(e) => handleCustomFieldChange(e.target.value ? Number(e.target.value) : null)}
                            className={`form-input w-full text-sm ${fieldError ? 'border-red-500' : ''}`}
                          />
                        )}

                        {/* Date field */}
                        {field.field_type === 'date' && (
                          <DateInput
                            value={fieldValue ? String(fieldValue) : null}
                            onChange={handleCustomFieldChange}
                            error={fieldError}
                            className="text-sm"
                          />
                        )}

                        {/* DateTime field */}
                        {field.field_type === 'datetime' && (
                          <DateTimeInput
                            value={fieldValue ? String(fieldValue) : null}
                            onChange={handleCustomFieldChange}
                            error={fieldError}
                            className="text-sm"
                          />
                        )}

                        {/* Dropdown field */}
                        {field.field_type === 'dropdown' && field.field_options && (
                          <select
                            value={String(fieldValue || '')}
                            onChange={(e) => handleCustomFieldChange(e.target.value || null)}
                            className={`form-select w-full text-sm ${fieldError ? 'border-red-500' : ''}`}
                          >
                            <option value="">Select...</option>
                            {field.field_options.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        )}

                        {/* Checkbox field */}
                        {field.field_type === 'checkbox' && (
                          <label className="flex items-center">
                            <input
                              type="checkbox"
                              checked={Boolean(fieldValue)}
                              onChange={(e) => handleCustomFieldChange(e.target.checked)}
                              className="form-checkbox"
                            />
                            <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                              {field.field_description || 'Enabled'}
                            </span>
                          </label>
                        )}

                        {/* Rich text / long text - use textarea */}
                        {field.field_type === 'rich_text' && (
                          <textarea
                            value={String(fieldValue || '')}
                            onChange={(e) => handleCustomFieldChange(e.target.value || null)}
                            rows={4}
                            className={`form-input w-full text-sm ${fieldError ? 'border-red-500' : ''}`}
                          />
                        )}

                        {/* URL field */}
                        {field.field_type === 'url' && (
                          <input
                            type="url"
                            value={String(fieldValue || '')}
                            onChange={(e) => handleCustomFieldChange(e.target.value || null)}
                            placeholder="https://..."
                            className={`form-input w-full text-sm ${fieldError ? 'border-red-500' : ''}`}
                          />
                        )}

                        {/* Email field */}
                        {field.field_type === 'email' && (
                          <input
                            type="email"
                            value={String(fieldValue || '')}
                            onChange={(e) => handleCustomFieldChange(e.target.value || null)}
                            placeholder="email@example.com"
                            className={`form-input w-full text-sm ${fieldError ? 'border-red-500' : ''}`}
                          />
                        )}

                        {/* Phone field */}
                        {field.field_type === 'phone' && (
                          <input
                            type="tel"
                            value={String(fieldValue || '')}
                            onChange={(e) => handleCustomFieldChange(e.target.value || null)}
                            className={`form-input w-full text-sm ${fieldError ? 'border-red-500' : ''}`}
                          />
                        )}

                        {/* Currency field */}
                        {field.field_type === 'currency' && (
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                            <input
                              type="number"
                              step="0.01"
                              value={fieldValue !== null && fieldValue !== undefined ? Number(fieldValue) : ''}
                              onChange={(e) => handleCustomFieldChange(e.target.value ? Number(e.target.value) : null)}
                              className={`form-input w-full text-sm pl-7 ${fieldError ? 'border-red-500' : ''}`}
                            />
                          </div>
                        )}

                        {/* Percentage field */}
                        {field.field_type === 'percentage' && (
                          <div className="relative">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={fieldValue !== null && fieldValue !== undefined ? Number(fieldValue) : ''}
                              onChange={(e) => handleCustomFieldChange(e.target.value ? Number(e.target.value) : null)}
                              className={`form-input w-full text-sm pr-7 ${fieldError ? 'border-red-500' : ''}`}
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">%</span>
                          </div>
                        )}

                        {fieldError && (
                          <p className="text-xs text-red-600 dark:text-red-400 mt-1">{fieldError}</p>
                        )}
                      </div>
                    ) : (
                      <div className="text-sm text-gray-900 dark:text-gray-100">
                        {fieldValue !== null && fieldValue !== undefined
                          ? field.field_type === 'checkbox'
                            ? fieldValue ? 'Yes' : 'No'
                            : field.field_type === 'date' || field.field_type === 'datetime'
                              ? new Date(String(fieldValue)).toLocaleDateString()
                              : String(fieldValue)
                          : '—'}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

        {/* Description Section - Full width below custom fields */}
        <div>
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
            Description
          </h4>
          {isEditing && onChange ? (
            <div>
              <textarea
                value={String(currentDescription || '')}
                onChange={(e) => onChange('description', e.target.value || null)}
                placeholder="Enter description..."
                rows={6}
                maxLength={10000}
                className={`form-input w-full text-sm ${errors.description ? 'border-red-500' : ''}`}
              />
              {errors.description && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.description}</p>
              )}
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {String(currentDescription || '').length} / 10,000 characters
              </p>
            </div>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              {workItem.description ? (
                <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                  {workItem.description}
                </div>
              ) : (
                <span className="text-sm text-gray-400 italic">No description</span>
              )}
            </div>
          )}
        </div>

        {/* Comments & Attachments - 2 column grid in non-edit mode */}
        {!isEditing && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Comments Preview */}
            <div>
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Recent Comments ({comments.length})
              </h4>
              {comments.length > 0 ? (
                <div className="space-y-2">
                  {comments.slice(0, 3).map((comment) => (
                    <div
                      key={comment.work_item_comment_id}
                      className="text-xs bg-white dark:bg-gray-900/50 rounded p-2"
                    >
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {comment.user_name}
                        </span>
                        <span className="text-gray-400 text-[10px]">
                          {new Date(comment.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-gray-700 dark:text-gray-300 line-clamp-2">
                        {comment.comment_text}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">No comments</p>
              )}
            </div>

            {/* Attachments Preview */}
            <div>
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Attachments ({attachments.length})
              </h4>
              {attachments.length > 0 ? (
                <div className="space-y-1">
                  {attachments.slice(0, 5).map((attachment) => (
                    <div
                      key={attachment.work_item_attachment_id}
                      className="text-xs bg-white dark:bg-gray-900/50 rounded p-2 flex items-center gap-2"
                    >
                      <svg
                        className="w-4 h-4 text-gray-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                        />
                      </svg>
                      <span className="text-gray-700 dark:text-gray-300 truncate flex-1">
                        {attachment.file_name}
                      </span>
                      <span className="text-gray-400 text-[10px]">
                        {(attachment.file_size / 1024).toFixed(1)} KB
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">No attachments</p>
              )}
            </div>
          </div>
        )}

        {/* Bottom: Actions - hide in edit mode */}
        {!isEditing && (
          <div className="flex items-center gap-4 pt-2 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={() => router.push(`/work/${workItem.id}`)}
              className="text-sm text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 font-medium"
            >
              View full details →
            </button>
            {comments.length > 0 && (
              <button
                type="button"
                onClick={() => router.push(`/work/${workItem.id}?tab=comments`)}
                className="text-sm text-gray-600 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
              >
                View all comments
              </button>
            )}
            {attachments.length > 0 && (
              <button
                type="button"
                onClick={() => router.push(`/work/${workItem.id}?tab=attachments`)}
                className="text-sm text-gray-600 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
              >
                View all attachments
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
