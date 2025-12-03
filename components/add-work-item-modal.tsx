'use client';

import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import DynamicFieldRenderer from '@/components/dynamic-field-renderer';
import UserPicker from '@/components/user-picker';
import { useOrganizations } from '@/lib/hooks/use-organizations';
import { useUsers } from '@/lib/hooks/use-users';
import { useWorkItemFields } from '@/lib/hooks/use-work-item-fields';
import { useTypeRelationshipsForParent } from '@/lib/hooks/use-work-item-type-relationships';
import { useActiveWorkItemTypes } from '@/lib/hooks/use-work-item-types';
import { useCreateWorkItem, useWorkItem } from '@/lib/hooks/use-work-items';
import { createSafeTextSchema } from '@/lib/validations/sanitization';
import Toast from './toast';
import { clientErrorLog } from '@/lib/utils/debug-client';

const createWorkItemSchema = z.object({
  work_item_type_id: z.string().min(1, 'Work item type is required').uuid('Invalid work item type'),
  organization_id: z
    .string()
    .optional()
    .transform((val) => (val === '' ? undefined : val))
    .pipe(z.string().uuid('Invalid organization ID').optional()),
  subject: createSafeTextSchema(1, 500, 'Subject'),
  description: createSafeTextSchema(0, 10000, 'Description').optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low'], {
    message: 'Priority must be one of: critical, high, medium, low',
  }),
  assigned_to: z
    .string()
    .optional()
    .transform((val) => (val === '' ? undefined : val))
    .pipe(z.string().uuid('Invalid user ID').optional()),
  due_date: z.string().optional(),
  parent_work_item_id: z
    .string()
    .optional()
    .transform((val) => (val === '' ? undefined : val))
    .pipe(z.string().uuid('Invalid parent work item ID').optional()),
});

type CreateWorkItemForm = z.infer<typeof createWorkItemSchema>;

interface AddWorkItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  parentWorkItemId?: string;
}

export default function AddWorkItemModal({ isOpen, onClose, onSuccess, parentWorkItemId }: AddWorkItemModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, unknown>>({});
  const createWorkItem = useCreateWorkItem();
  const { data: allWorkItemTypes, isLoading: typesLoading } = useActiveWorkItemTypes();
  const { data: organizations = [] } = useOrganizations();
  const { data: users = [] } = useUsers();
  
  // Fetch parent work item if creating a sub-item
  const { data: parentWorkItem } = useWorkItem(parentWorkItemId || null);
  
  // Fetch type relationships for the parent type
  const { data: typeRelationships } = useTypeRelationshipsForParent(
    parentWorkItem?.work_item_type_id || undefined
  );
  
  // Filter work item types based on parent relationships
  const workItemTypes = parentWorkItemId && typeRelationships
    ? allWorkItemTypes?.filter((type) =>
        typeRelationships.some((rel) => rel.child_type_id === type.id)
      )
    : allWorkItemTypes;

  const workItemTypeId = useId();
  const subjectId = useId();
  const descriptionId = useId();
  const priorityId = useId();
  const organizationId = useId();
  const dueDateId = useId();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
    setValue,
  } = useForm<CreateWorkItemForm>({
    resolver: zodResolver(createWorkItemSchema),
    defaultValues: {
      work_item_type_id: '',
      organization_id: undefined,
      subject: '',
      description: undefined,
      priority: 'medium',
      assigned_to: undefined,
      due_date: undefined,
      parent_work_item_id: parentWorkItemId || undefined,
    },
  });

  const selectedTypeId = watch('work_item_type_id');
  const { data: allCustomFields = [] } = useWorkItemFields({
    work_item_type_id: selectedTypeId || '',
  });

  // Determine which fields should be hidden (inherited from parent)
  const inheritedFields =
    parentWorkItem && selectedTypeId && typeRelationships
      ? typeRelationships.find((rel) => rel.child_type_id === selectedTypeId)?.auto_create_config
          ?.inherit_fields || []
      : [];

  const isFieldInherited = (fieldName: string) => inheritedFields.includes(fieldName);

  // Filter out custom fields that are inherited
  const customFields = allCustomFields.filter(
    (field) => !isFieldInherited(`custom_field_${field.work_item_field_id}`)
  );

  // Pre-select first work item type when types load
  useEffect(() => {
    if (workItemTypes && workItemTypes.length > 0 && !selectedTypeId && workItemTypes[0]) {
      setValue('work_item_type_id', workItemTypes[0].id);
    }
  }, [workItemTypes, selectedTypeId, setValue]);

  // Set parent work item ID when provided
  useEffect(() => {
    if (parentWorkItemId) {
      setValue('parent_work_item_id', parentWorkItemId);
    }
  }, [parentWorkItemId, setValue]);

  // Inherit fields from parent work item based on relationship configuration
  useEffect(() => {
    if (!parentWorkItem || !selectedTypeId || !typeRelationships) return;

    // Find the relationship for the selected child type
    const relationship = typeRelationships.find((rel) => rel.child_type_id === selectedTypeId);
    if (!relationship?.auto_create_config?.inherit_fields) return;

    const inheritFields = relationship.auto_create_config.inherit_fields;

    // Map of parent work item fields to form fields
    inheritFields.forEach((field) => {
      switch (field) {
        case 'subject':
          if (parentWorkItem.subject) {
            setValue('subject', parentWorkItem.subject);
          }
          break;
        case 'description':
          if (parentWorkItem.description) {
            setValue('description', parentWorkItem.description);
          }
          break;
        case 'priority':
          if (parentWorkItem.priority) {
            setValue('priority', parentWorkItem.priority as 'critical' | 'high' | 'medium' | 'low');
          }
          break;
        case 'assigned_to':
          if (parentWorkItem.assigned_to) {
            setValue('assigned_to', parentWorkItem.assigned_to);
          }
          break;
        case 'due_date':
          if (parentWorkItem.due_date) {
            // Format date for input field (YYYY-MM-DD)
            const dueDate = new Date(parentWorkItem.due_date);
            const formattedDate = dueDate.toISOString().split('T')[0];
            setValue('due_date', formattedDate);
          }
          break;
        case 'organization_id':
          if (parentWorkItem.organization_id) {
            setValue('organization_id', parentWorkItem.organization_id);
          }
          break;
        default:
          // Handle custom fields
          if (field.startsWith('custom_field_') && parentWorkItem.custom_fields) {
            const fieldId = field.replace('custom_field_', '');
            if (parentWorkItem.custom_fields[fieldId] !== undefined) {
              setCustomFieldValues((prev) => ({
                ...prev,
                [fieldId]: parentWorkItem.custom_fields?.[fieldId],
              }));
            }
          }
          break;
      }
    });
  }, [parentWorkItem, selectedTypeId, typeRelationships, setValue]);

  const onSubmit = async (data: CreateWorkItemForm) => {
    setIsSubmitting(true);

    try {
      // Custom fields are already in correct ISO format from DateInput/DateTimeInput components
      const workItemData = {
        work_item_type_id: data.work_item_type_id,
        organization_id: data.organization_id,
        subject: data.subject,
        description: data.description,
        priority: data.priority,
        assigned_to: data.assigned_to,
        due_date:
          data.due_date && data.due_date.trim() !== ''
            ? new Date(data.due_date).toISOString()
            : undefined,
        parent_work_item_id: data.parent_work_item_id,
        custom_fields: Object.keys(customFieldValues).length > 0 ? customFieldValues : undefined,
      };

      await createWorkItem.mutateAsync(workItemData);

      setShowToast(true);

      setTimeout(() => {
        reset();
        setCustomFieldValues({});
        onClose();
        onSuccess?.();
        setShowToast(false);
      }, 2000);
    } catch (error) {
      clientErrorLog('Error creating work item:', error);
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

  // Filter active organizations only
  const activeOrganizations = organizations.filter((org) => org.is_active);

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
                  Add New Work Item
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
            </div>

            <form onSubmit={handleSubmit(onSubmit as never)}>
              <div className="px-6 py-4 space-y-4">
                {/* Work Item Type */}
                <div>
                  <label
                    htmlFor={workItemTypeId}
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >
                    Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    id={workItemTypeId}
                    {...register('work_item_type_id')}
                    disabled={isSubmitting || typesLoading}
                    className="form-select w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 disabled:opacity-50"
                  >
                    <option value="">{typesLoading ? 'Loading types...' : 'Select a type'}</option>
                    {workItemTypes?.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.icon ? `${type.icon} ` : ''}
                        {type.name}
                        {type.organization_id ? ` (${type.organization_name})` : ' (Global)'}
                      </option>
                    ))}
                  </select>
                  {errors.work_item_type_id && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                      {errors.work_item_type_id.message}
                    </p>
                  )}
                </div>

                {/* Subject */}
                {!isFieldInherited('subject') && (
                  <div>
                    <label
                      htmlFor={subjectId}
                      className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                    >
                      Subject <span className="text-red-500">*</span>
                    </label>
                    <input
                      id={subjectId}
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
                )}

                {/* Description */}
                {!isFieldInherited('description') && (
                  <div>
                    <label
                      htmlFor={descriptionId}
                      className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                    >
                      Description
                    </label>
                    <textarea
                      id={descriptionId}
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
                )}

                {/* Priority and Organization Row */}
                {(!isFieldInherited('priority') || !isFieldInherited('organization_id')) && (
                  <div className={`grid ${!isFieldInherited('priority') && !isFieldInherited('organization_id') ? 'grid-cols-2' : 'grid-cols-1'} gap-4`}>
                    {/* Priority */}
                    {!isFieldInherited('priority') && (
                      <div>
                        <label
                          htmlFor={priorityId}
                          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                        >
                          Priority <span className="text-red-500">*</span>
                        </label>
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
                        {errors.priority && (
                          <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                            {errors.priority.message}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Organization */}
                    {!isFieldInherited('organization_id') && (
                      <div>
                        <label
                          htmlFor={organizationId}
                          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                        >
                          Organization
                        </label>
                        <select
                          id={organizationId}
                          {...register('organization_id')}
                          disabled={isSubmitting}
                          className="form-select w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 disabled:opacity-50"
                        >
                          <option value="">Use current organization</option>
                          {activeOrganizations.map((org) => (
                            <option key={org.id} value={org.id}>
                              {org.name}
                            </option>
                          ))}
                        </select>
                        {errors.organization_id && (
                          <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                            {errors.organization_id.message}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Assigned To and Due Date Row */}
                {(!isFieldInherited('assigned_to') || !isFieldInherited('due_date')) && (
                  <div className={`grid ${!isFieldInherited('assigned_to') && !isFieldInherited('due_date') ? 'grid-cols-2' : 'grid-cols-1'} gap-4`}>
                    {/* Assigned To */}
                    {!isFieldInherited('assigned_to') && (
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
                    )}

                    {/* Due Date */}
                    {!isFieldInherited('due_date') && (
                      <div>
                        <label
                          htmlFor={dueDateId}
                          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                        >
                          Due Date
                        </label>
                        <input
                          id={dueDateId}
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
                    )}
                  </div>
                )}

                {/* Phase 3: Custom Fields */}
                {customFields.length > 0 && (
                  <DynamicFieldRenderer
                    fields={customFields}
                    values={customFieldValues}
                    onChange={handleCustomFieldChange}
                  />
                )}

                {/* Error display */}
                {createWorkItem.error && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                    <p className="text-sm text-red-600 dark:text-red-400">
                      {createWorkItem.error instanceof Error
                        ? createWorkItem.error.message
                        : 'An error occurred while creating the work item'}
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
                  disabled={isSubmitting || typesLoading}
                  className="btn bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white disabled:opacity-50"
                >
                  {isSubmitting ? 'Creating...' : 'Create Work Item'}
                </button>
              </div>
            </form>
          </DialogPanel>
        </TransitionChild>
      </Dialog>

      <Toast type="success" open={showToast} setOpen={setShowToast}>
        Work item created successfully!
      </Toast>
    </Transition>
  );
}
