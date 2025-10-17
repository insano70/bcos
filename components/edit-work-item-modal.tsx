'use client';

import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
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
      setValue('status_id', workItem.status_id);
      setValue('priority', workItem.priority as 'critical' | 'high' | 'medium' | 'low');
      setValue('assigned_to', workItem.assigned_to || '');

      // Format due_date for date input (YYYY-MM-DD)
      if (workItem.due_date) {
        const date = new Date(workItem.due_date);
        const formattedDate = date.toISOString().split('T')[0];
        setValue('due_date', formattedDate as string);
      } else {
        setValue('due_date', '');
      }
    }
  }, [workItem, setValue]);

  const onSubmit = async (data: UpdateWorkItemForm) => {
    if (!workItem) return;

    setIsSubmitting(true);

    try {
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
      if (process.env.NODE_ENV === 'development') {
        console.error('Error updating work item:', error);
      }
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
    <Transition appear show={isOpen}>
      <Dialog as="div" onClose={handleClose}>
        <TransitionChild
          as="div"
          className="fixed inset-0 bg-gray-900/30 z-50 transition-opacity"
          enter="transition ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="transition ease-out duration-100"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
          aria-hidden="true"
        />
        <TransitionChild
          as="div"
          className="fixed inset-0 z-50 overflow-hidden flex items-center my-4 justify-center px-4 sm:px-6"
          enter="transition ease-in-out duration-200"
          enterFrom="opacity-0 translate-y-4"
          enterTo="opacity-100 translate-y-0"
          leave="transition ease-in-out duration-200"
          leaveFrom="opacity-100 translate-y-0"
          leaveTo="opacity-0 translate-y-4"
        >
          <DialogPanel className="bg-white dark:bg-gray-800 rounded-lg shadow-xl overflow-hidden max-w-2xl w-full max-h-full overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700/60">
              <div className="flex justify-between items-center">
                <Dialog.Title className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                  Edit Work Item
                </Dialog.Title>
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isSubmitting}
                  className="text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400 disabled:opacity-50"
                >
                  <div className="sr-only">Close</div>
                  <svg className="fill-current" width="16" height="16" viewBox="0 0 16 16">
                    <path d="M7.95 6.536l4.242-4.243a1 1 0 111.415 1.414L9.364 7.95l4.243 4.242a1 1 0 11-1.415 1.415L7.95 9.364l-4.243 4.243a1 1 0 01-1.414-1.415L6.536 7.95 2.293 3.707a1 1 0 011.414-1.414L7.95 6.536z" />
                  </svg>
                </button>
              </div>
              <div className="mt-2">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {workItem.work_item_type_name} • {workItem.organization_name}
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit(onSubmit as never)}>
              <div className="px-6 py-4 space-y-4">
                {/* Subject */}
                <div>
                  <label
                    htmlFor="subject"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >
                    Subject <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="subject"
                    type="text"
                    {...register('subject')}
                    disabled={isSubmitting}
                    className="form-input w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 disabled:opacity-50"
                    placeholder="Enter work item subject"
                  />
                  {errors.subject && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                      {errors.subject.message}
                    </p>
                  )}
                </div>

                {/* Description */}
                <div>
                  <label
                    htmlFor="description"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >
                    Description
                  </label>
                  <textarea
                    id="description"
                    {...register('description')}
                    disabled={isSubmitting}
                    rows={4}
                    className="form-textarea w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 disabled:opacity-50"
                    placeholder="Enter work item description"
                  />
                  {errors.description && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                      {errors.description.message}
                    </p>
                  )}
                </div>

                {/* Status and Priority Row */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Status */}
                  <div>
                    <label
                      htmlFor="status_id"
                      className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                    >
                      Status <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="status_id"
                      {...register('status_id')}
                      disabled={isSubmitting}
                      className="form-select w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 disabled:opacity-50"
                    >
                      {statuses.map((status) => (
                        <option key={status.work_item_status_id} value={status.work_item_status_id}>
                          {status.status_name}
                        </option>
                      ))}
                    </select>
                    {errors.status_id && (
                      <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                        {errors.status_id.message}
                      </p>
                    )}
                  </div>

                  {/* Priority */}
                  <div>
                    <label
                      htmlFor="priority"
                      className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                    >
                      Priority <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="priority"
                      {...register('priority')}
                      disabled={isSubmitting}
                      className="form-select w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 disabled:opacity-50"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                    {errors.priority && (
                      <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                        {errors.priority.message}
                      </p>
                    )}
                  </div>
                </div>

                {/* Assigned To and Due Date Row */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Assigned To */}
                  <div>
                    <label
                      htmlFor="assigned_to"
                      className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                    >
                      Assigned To
                    </label>
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
                    <label
                      htmlFor="due_date"
                      className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                    >
                      Due Date
                    </label>
                    <input
                      id="due_date"
                      type="date"
                      {...register('due_date')}
                      disabled={isSubmitting}
                      className="form-input w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 disabled:opacity-50"
                    />
                    {errors.due_date && (
                      <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                        {errors.due_date.message}
                      </p>
                    )}
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
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                    <p className="text-sm text-red-600 dark:text-red-400">
                      {updateWorkItem.error instanceof Error
                        ? updateWorkItem.error.message
                        : 'An error occurred while updating the work item'}
                    </p>
                  </div>
                )}
              </div>

              <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700/60 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isSubmitting}
                  className="btn border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 text-gray-600 dark:text-gray-300 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white disabled:opacity-50"
                >
                  {isSubmitting ? 'Updating...' : 'Update Work Item'}
                </button>
              </div>
            </form>
          </DialogPanel>
        </TransitionChild>
      </Dialog>

      <Toast type="success" open={showToast} setOpen={setShowToast}>
        Work item updated successfully!
      </Toast>
    </Transition>
  );
}
