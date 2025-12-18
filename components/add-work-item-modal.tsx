'use client';

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
import { Button } from '@/components/ui/button';
import { ErrorDisplay } from '@/components/error-display';
import { FormError } from '@/components/ui/form-error';
import { FormLabel } from '@/components/ui/form-label';
import { Modal } from '@/components/ui/modal';

/**
 * Client-side form schema for work item creation
 * 
 * Note: This extends the base validation patterns from lib/validations/work-items.ts
 * but adds form-specific transforms (empty string to undefined for optional fields).
 * The base patterns are reused via createSafeTextSchema for consistency.
 */
const createWorkItemFormSchema = z.object({
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

type CreateWorkItemForm = z.infer<typeof createWorkItemFormSchema>;

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
    resolver: zodResolver(createWorkItemFormSchema),
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
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        size="lg"
        title="Add New Work Item"
        preventClose={isSubmitting}
      >
        <form onSubmit={handleSubmit(onSubmit as never)}>
              <div className="px-6 py-4 space-y-4">
                {/* Work Item Type */}
                <div>
                  <FormLabel htmlFor={workItemTypeId} required>
                    Type
                  </FormLabel>
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
                  <FormError>{errors.work_item_type_id?.message}</FormError>
                </div>

                {/* Subject */}
                {!isFieldInherited('subject') && (
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
                )}

                {/* Description */}
                {!isFieldInherited('description') && (
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
                )}

                {/* Priority and Organization Row */}
                {(!isFieldInherited('priority') || !isFieldInherited('organization_id')) && (
                  <div className={`grid ${!isFieldInherited('priority') && !isFieldInherited('organization_id') ? 'grid-cols-2' : 'grid-cols-1'} gap-4`}>
                    {/* Priority */}
                    {!isFieldInherited('priority') && (
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
                    )}

                    {/* Organization */}
                    {!isFieldInherited('organization_id') && (
                      <div>
                        <FormLabel htmlFor={organizationId}>
                          Organization
                        </FormLabel>
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
                        <FormError>{errors.organization_id?.message}</FormError>
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
                    )}

                    {/* Due Date */}
                    {!isFieldInherited('due_date') && (
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
                  <ErrorDisplay
                    variant="alert"
                    error={createWorkItem.error instanceof Error
                      ? createWorkItem.error.message
                      : 'An error occurred while creating the work item'}
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
              disabled={typesLoading}
              loading={isSubmitting}
              loadingText="Creating..."
            >
              Create Work Item
            </Button>
          </div>
        </form>
      </Modal>

      <Toast type="success" open={showToast} setOpen={setShowToast}>
        Work item created successfully!
      </Toast>
    </>
  );
}
