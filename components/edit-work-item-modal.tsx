'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import DynamicFieldRenderer from '@/components/dynamic-field-renderer';
import UserPicker from '@/components/user-picker';
import { useUsers } from '@/lib/hooks/use-users';
import { useWorkItemFields } from '@/lib/hooks/use-work-item-fields';
import { useWorkItemStatuses } from '@/lib/hooks/use-work-item-statuses';
import { useUpdateWorkItem, type WorkItem } from '@/lib/hooks/use-work-items';
import { createSafeTextSchema } from '@/lib/validations/sanitization';
import Toast from './toast';
import { clientErrorLog } from '@/lib/utils/debug-client';
import { Button } from '@/components/ui/button';
import { ErrorDisplay } from '@/components/error-display';
import { FormError } from '@/components/ui/form-error';
import { FormLabel } from '@/components/ui/form-label';
import { Modal } from '@/components/ui/modal';

const updateWorkItemSchema = z.object({
  subject: createSafeTextSchema(1, 500, 'Subject'),
  description: createSafeTextSchema(0, 10000, 'Description').optional(),
  status_id: z.string().uuid('Invalid status ID'),
  priority: z.enum(['critical', 'high', 'medium', 'low'], {
    message: 'Priority must be one of: critical, high, medium, low',
  }),
  assigned_to: z.string().uuid('Invalid user ID').optional(),
  due_date: z.string().optional(),
});

type UpdateWorkItemForm = z.infer<typeof updateWorkItemSchema>;

interface EditWorkItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  workItem: WorkItem | null;
}

export default function EditWorkItemModal({
  isOpen,
  onClose,
  onSuccess,
  workItem,
}: EditWorkItemModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, unknown>>({});
  const updateWorkItem = useUpdateWorkItem();
  const { data: statuses = [] } = useWorkItemStatuses(workItem?.work_item_type_id || undefined);
  const { data: users = [] } = useUsers();
  const { data: customFields = [] } = useWorkItemFields({
    work_item_type_id: workItem?.work_item_type_id || '',
  });

  const subjectId = useId();
  const descriptionId = useId();
  const statusId = useId();
  const priorityId = useId();
  const dueDateId = useId();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm<UpdateWorkItemForm>({
    resolver: zodResolver(updateWorkItemSchema),
  });

  // Populate form when workItem changes
  useEffect(() => {
    if (workItem) {
      setValue('subject', workItem.subject);
      setValue('description', workItem.description || '');
      setValue('priority', workItem.priority as 'critical' | 'high' | 'medium' | 'low');
      setValue('assigned_to', workItem.assigned_to || undefined);

      // Format due_date for date input (YYYY-MM-DD)
      if (workItem.due_date) {
        const date = new Date(workItem.due_date);
        const formattedDate = date.toISOString().split('T')[0];
        setValue('due_date', formattedDate as string);
      } else {
        setValue('due_date', '');
      }

      // Populate custom field values
      if (workItem.custom_fields) {
        setCustomFieldValues(workItem.custom_fields);
      } else {
        setCustomFieldValues({});
      }
    }
  }, [workItem, setValue]);

  // Separate effect for status to avoid infinite loop
  useEffect(() => {
    if (workItem && statuses.length > 0) {
      setValue('status_id', workItem.status_id);
    }
  }, [workItem, statuses.length, setValue]);

  const onSubmit = async (data: UpdateWorkItemForm) => {
    if (!workItem) return;

    setIsSubmitting(true);

    try {
      // Custom fields are already in correct ISO format from DateInput/DateTimeInput components
      await updateWorkItem.mutateAsync({
        id: workItem.id,
        data: {
          subject: data.subject,
          description: data.description,
          status_id: data.status_id,
          priority: data.priority,
          assigned_to: data.assigned_to,
          due_date:
            data.due_date && data.due_date.trim() !== ''
              ? new Date(data.due_date).toISOString()
              : undefined,
          custom_fields: Object.keys(customFieldValues).length > 0 ? customFieldValues : undefined,
        },
      });

      setShowToast(true);

      setTimeout(() => {
        reset();
        setCustomFieldValues({});
        onClose();
        onSuccess?.();
        setShowToast(false);
      }, 2000);
    } catch (error) {
      clientErrorLog('Error updating work item:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      reset();
      setCustomFieldValues({});
      onClose();
    }
  };

  const handleCustomFieldChange = (fieldId: string, value: unknown) => {
    setCustomFieldValues((prev) => ({
      ...prev,
      [fieldId]: value,
    }));
  };

  // Filter active users only
  const activeUsers = users.filter((user) => user.is_active);

  if (!workItem) {
    return null;
  }

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        size="lg"
        title="Edit Work Item"
        description={`${workItem.work_item_type_name} • ${workItem.organization_name}`}
        preventClose={isSubmitting}
      >
        <form onSubmit={handleSubmit(onSubmit as never)}>
              <div className="px-6 py-4 space-y-4">
                {/* Subject */}
                <div>
                  <FormLabel htmlFor={subjectId} required>
                    Subject
                  </FormLabel>
                  <input
                    id={subjectId}
                    type="text"
                    {...register('subject')}
                    disabled={isSubmitting}
                    className="form-input w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 disabled:opacity-50"
                    placeholder="Enter work item subject"
                  />
                  <FormError>{errors.subject?.message}</FormError>
                </div>

                {/* Description */}
                <div>
                  <FormLabel htmlFor={descriptionId}>
                    Description
                  </FormLabel>
                  <textarea
                    id={descriptionId}
                    {...register('description')}
                    disabled={isSubmitting}
                    rows={4}
                    className="form-textarea w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 disabled:opacity-50"
                    placeholder="Enter work item description"
                  />
                  <FormError>{errors.description?.message}</FormError>
                </div>

                {/* Status and Priority Row */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Status */}
                  <div>
                    <FormLabel htmlFor={statusId} required>
                      Status
                    </FormLabel>
                    <select
                      id={statusId}
                      {...register('status_id')}
                      disabled={isSubmitting}
                      className="form-select w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 disabled:opacity-50"
                    >
                      {statuses
                        .filter((status) => status?.work_item_status_id)
                        .map((status) => (
                          <option key={status.work_item_status_id} value={status.work_item_status_id}>
                            {status.status_name}
                          </option>
                        ))}
                    </select>
                    <FormError>{errors.status_id?.message}</FormError>
                  </div>

                  {/* Priority */}
                  <div>
                    <FormLabel htmlFor={priorityId} required>
                      Priority
                    </FormLabel>
                    <select
                      id={priorityId}
                      {...register('priority')}
                      disabled={isSubmitting}
                      className="form-select w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 disabled:opacity-50"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                    <FormError>{errors.priority?.message}</FormError>
                  </div>
                </div>

                {/* Assigned To and Due Date Row */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Assigned To */}
                  <div>
                    <FormLabel htmlFor="assigned_to">
                      Assigned To
                    </FormLabel>
                    <UserPicker
                      users={activeUsers}
                      value={watch('assigned_to')}
                      onChange={(userId) => setValue('assigned_to', userId)}
                      disabled={isSubmitting}
                      error={errors.assigned_to?.message}
                      placeholder="Unassigned"
                      allowClear={true}
                    />
                  </div>

                  {/* Due Date */}
                  <div>
                    <FormLabel htmlFor={dueDateId}>
                      Due Date
                    </FormLabel>
                    <input
                      id={dueDateId}
                      type="date"
                      {...register('due_date')}
                      disabled={isSubmitting}
                      className="form-input w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 disabled:opacity-50"
                    />
                    <FormError>{errors.due_date?.message}</FormError>
                  </div>
                </div>

                {/* Phase 3: Custom Fields */}
                {customFields.length > 0 && (
                  <DynamicFieldRenderer
                    fields={customFields}
                    values={customFieldValues}
                    onChange={handleCustomFieldChange}
                  />
                )}

                {/* Error display */}
                {updateWorkItem.error && (
                  <ErrorDisplay
                    variant="alert"
                    error={updateWorkItem.error instanceof Error
                      ? updateWorkItem.error.message
                      : 'An error occurred while updating the work item'}
                  />
                )}
              </div>

          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700/60 flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              loading={isSubmitting}
              loadingText="Updating..."
            >
              Update Work Item
            </Button>
          </div>
        </form>
      </Modal>

      <Toast type="success" open={showToast} setOpen={setShowToast}>
        Work item updated successfully!
      </Toast>
    </>
  );
}
