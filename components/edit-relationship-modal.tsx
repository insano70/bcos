'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  useUpdateTypeRelationship,
  type WorkItemTypeRelationship,
} from '@/lib/hooks/use-work-item-type-relationships';
import { createSafeTextSchema } from '@/lib/validations/sanitization';
import Toast from './toast';
import AutoCreateConfigBuilder, { type AutoCreateConfig } from './auto-create-config-builder';

const editRelationshipSchema = z
  .object({
    relationship_name: createSafeTextSchema(1, 100, 'Relationship name'),
    is_required: z.boolean().default(false),
    min_count: z.coerce.number().int().min(0).optional(),
    max_count: z.coerce.number().int().min(1).optional(),
    auto_create: z.boolean().default(false),
    display_order: z.coerce.number().int().min(0).default(0),
  })
  .refine(
    (data) => {
      if (data.min_count !== undefined && data.max_count !== undefined) {
        return data.min_count <= data.max_count;
      }
      return true;
    },
    {
      message: 'Minimum count must be less than or equal to maximum count',
      path: ['min_count'],
    }
  );

type EditRelationshipForm = z.infer<typeof editRelationshipSchema>;

interface EditRelationshipModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  relationship: WorkItemTypeRelationship;
}

export default function EditRelationshipModal({
  isOpen,
  onClose,
  onSuccess,
  relationship,
}: EditRelationshipModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [autoCreateConfig, setAutoCreateConfig] = useState<AutoCreateConfig | null>(
    relationship.auto_create_config || null
  );
  const updateRelationship = useUpdateTypeRelationship();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm({
    resolver: zodResolver(editRelationshipSchema),
    defaultValues: {
      relationship_name: '',
      is_required: false,
      auto_create: false,
      display_order: 0,
    },
  });

  const autoCreate = watch('auto_create');

  useEffect(() => {
    if (relationship) {
      setValue('relationship_name', relationship.relationship_name);
      setValue('is_required', relationship.is_required);
      setValue('min_count', relationship.min_count ?? undefined);
      setValue('max_count', relationship.max_count ?? undefined);
      setValue('auto_create', relationship.auto_create);
      setValue('display_order', relationship.display_order);
      setAutoCreateConfig(relationship.auto_create_config || null);
    }
  }, [relationship, setValue]);

  const onSubmit = async (data: EditRelationshipForm) => {
    setIsSubmitting(true);
    try {
      await updateRelationship.mutateAsync({
        id: relationship.work_item_type_relationship_id,
        data: {
          relationship_name: data.relationship_name,
          is_required: data.is_required,
          min_count: data.min_count,
          max_count: data.max_count,
          auto_create: data.auto_create,
          display_order: data.display_order,
          auto_create_config: data.auto_create && autoCreateConfig ? autoCreateConfig : undefined,
        },
      });

      setToastMessage('Relationship updated successfully');
      setShowToast(true);
      onSuccess?.();
    } catch (error) {
      console.error('Failed to update relationship:', error);
      setToastMessage('Failed to update relationship');
      setShowToast(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <>
      <Transition show={isOpen}>
        <Dialog onClose={handleClose}>
          <TransitionChild
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-out duration-100"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-gray-900 bg-opacity-30 z-50 transition-opacity" />
          </TransitionChild>

          <TransitionChild
            enter="ease-out duration-200"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-out duration-200"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <div className="fixed inset-0 z-50 overflow-hidden flex items-center my-4 justify-center px-4 sm:px-6">
              <DialogPanel className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-auto max-w-2xl w-full max-h-full">
                <form onSubmit={handleSubmit(onSubmit)}>
                  {/* Modal header */}
                  <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700/60">
                    <div className="flex justify-between items-center">
                      <h2 className="font-semibold text-gray-800 dark:text-gray-100">
                        Edit Relationship - {relationship.child_type_name}
                      </h2>
                      <button
                        type="button"
                        className="text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400"
                        onClick={handleClose}
                      >
                        <span className="sr-only">Close</span>
                        <svg className="w-4 h-4 fill-current">
                          <path d="M7.95 6.536l4.242-4.243a1 1 0 111.415 1.414L9.364 7.95l4.243 4.242a1 1 0 11-1.415 1.415L7.95 9.364l-4.243 4.243a1 1 0 01-1.414-1.415L6.536 7.95 2.293 3.707a1 1 0 011.414-1.414L7.95 6.536z" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Modal content */}
                  <div className="px-5 py-4">
                    <div className="space-y-4">
                      {/* Child Type (read-only) */}
                      <div>
                        <label className="block text-sm font-medium mb-1">Child Type</label>
                        <div className="form-input w-full bg-gray-50 dark:bg-gray-900/50 text-gray-600 dark:text-gray-400 cursor-not-allowed">
                          {relationship.child_type_name}
                        </div>
                        <div className="text-xs mt-1 text-gray-500">Child type cannot be changed</div>
                      </div>

                      {/* Relationship Name */}
                      <div>
                        <label className="block text-sm font-medium mb-1" htmlFor="relationship_name">
                          Relationship Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          id="relationship_name"
                          className={`form-input w-full ${errors.relationship_name ? 'border-red-300' : ''}`}
                          type="text"
                          {...register('relationship_name')}
                          placeholder="e.g., patient, document, subtask"
                        />
                        {errors.relationship_name && (
                          <div className="text-xs mt-1 text-red-500">
                            {errors.relationship_name.message}
                          </div>
                        )}
                      </div>

                      {/* Count Constraints */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium mb-1" htmlFor="min_count">
                            Minimum Count
                          </label>
                          <input
                            id="min_count"
                            type="number"
                            min="0"
                            className={`form-input w-full ${errors.min_count ? 'border-red-300' : ''}`}
                            {...register('min_count')}
                            placeholder="0"
                          />
                          {errors.min_count && (
                            <div className="text-xs mt-1 text-red-500">{errors.min_count.message}</div>
                          )}
                        </div>

                        <div>
                          <label className="block text-sm font-medium mb-1" htmlFor="max_count">
                            Maximum Count
                          </label>
                          <input
                            id="max_count"
                            type="number"
                            min="1"
                            className={`form-input w-full ${errors.max_count ? 'border-red-300' : ''}`}
                            {...register('max_count')}
                            placeholder="No limit"
                          />
                          {errors.max_count && (
                            <div className="text-xs mt-1 text-red-500">{errors.max_count.message}</div>
                          )}
                        </div>
                      </div>

                      {/* Display Order */}
                      <div>
                        <label className="block text-sm font-medium mb-1" htmlFor="display_order">
                          Display Order
                        </label>
                        <input
                          id="display_order"
                          type="number"
                          min="0"
                          className={`form-input w-full ${errors.display_order ? 'border-red-300' : ''}`}
                          {...register('display_order')}
                        />
                        {errors.display_order && (
                          <div className="text-xs mt-1 text-red-500">{errors.display_order.message}</div>
                        )}
                      </div>

                      {/* Flags */}
                      <div className="space-y-2">
                        <label className="flex items-center">
                          <input type="checkbox" className="form-checkbox" {...register('is_required')} />
                          <span className="text-sm ml-2 font-medium">Required</span>
                          <span className="text-xs ml-2 text-gray-500">
                            (Child items of this type must exist)
                          </span>
                        </label>

                        <label className="flex items-center">
                          <input type="checkbox" className="form-checkbox" {...register('auto_create')} />
                          <span className="text-sm ml-2 font-medium">Auto-create</span>
                          <span className="text-xs ml-2 text-gray-500">
                            (Automatically create child items when parent is created)
                          </span>
                        </label>
                      </div>

                      {/* Auto-create configuration */}
                      {autoCreate && (
                        <div className="p-4 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg">
                          <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
                            Auto-Create Configuration
                          </h4>
                          <AutoCreateConfigBuilder
                            childTypeId={relationship.child_type_id}
                            value={autoCreateConfig}
                            onChange={setAutoCreateConfig}
                            disabled={isSubmitting}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Modal footer */}
                  <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700/60">
                    <div className="flex flex-wrap justify-end space-x-2">
                      <button
                        type="button"
                        className="btn border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 text-gray-800 dark:text-gray-300"
                        onClick={handleClose}
                        disabled={isSubmitting}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="btn bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  </div>
                </form>
              </DialogPanel>
            </div>
          </TransitionChild>
        </Dialog>
      </Transition>

      <Toast type={toastMessage.includes('Failed') ? 'error' : 'success'} open={showToast} setOpen={setShowToast}>
        {toastMessage}
      </Toast>
    </>
  );
}
