'use client';

import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useUpdateWorkItemType, type WorkItemType } from '@/lib/hooks/use-work-item-types';
import { createSafeTextSchema } from '@/lib/validations/sanitization';
import Toast from './toast';

const updateWorkItemTypeSchema = z.object({
  name: createSafeTextSchema(1, 255, 'Type name').optional(),
  description: createSafeTextSchema(0, 1000, 'Description').optional().nullable(),
  icon: z.string().max(10, 'Icon must not exceed 10 characters').optional().nullable(),
  color: z.string().max(50, 'Color must not exceed 50 characters').optional().nullable(),
  is_active: z.boolean().optional(),
});

type UpdateWorkItemTypeForm = z.infer<typeof updateWorkItemTypeSchema>;

interface EditWorkItemTypeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  workItemType: WorkItemType;
}

export default function EditWorkItemTypeModal({
  isOpen,
  onClose,
  onSuccess,
  workItemType,
}: EditWorkItemTypeModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const updateWorkItemType = useUpdateWorkItemType();

  const nameId = useId();
  const descriptionId = useId();
  const iconId = useId();
  const colorId = useId();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<UpdateWorkItemTypeForm>({
    resolver: zodResolver(updateWorkItemTypeSchema),
    defaultValues: {
      name: workItemType.name,
      description: workItemType.description || undefined,
      icon: workItemType.icon || undefined,
      color: workItemType.color || undefined,
      is_active: workItemType.is_active,
    },
  });

  // Reset form when workItemType changes
  useEffect(() => {
    reset({
      name: workItemType.name,
      description: workItemType.description || undefined,
      icon: workItemType.icon || undefined,
      color: workItemType.color || undefined,
      is_active: workItemType.is_active,
    });
  }, [workItemType, reset]);

  const onSubmit = async (data: UpdateWorkItemTypeForm) => {
    setIsSubmitting(true);
    try {
      // Filter out undefined values for exactOptionalPropertyTypes
      const filteredData: {
        name?: string;
        description?: string | null;
        icon?: string | null;
        color?: string | null;
        is_active?: boolean;
      } = {};
      if (data.name !== undefined) filteredData.name = data.name;
      if (data.description !== undefined) filteredData.description = data.description || null;
      if (data.icon !== undefined) filteredData.icon = data.icon || null;
      if (data.color !== undefined) filteredData.color = data.color || null;
      if (data.is_active !== undefined) filteredData.is_active = data.is_active;

      await updateWorkItemType.mutateAsync({
        id: workItemType.id,
        data: filteredData,
      });
      setShowToast(true);
      onSuccess?.();
    } catch (error) {
      console.error('Failed to update work item type:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  // Common icon options
  const iconOptions = ['📋', '🐛', '✨', '📝', '🎯', '⚡', '🔧', '📊', '💡', '🚀'];

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
                        Edit Work Item Type
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
                      {/* Name */}
                      <div>
                        <label className="block text-sm font-medium mb-1" htmlFor={nameId}>
                          Name
                        </label>
                        <input
                          id={nameId}
                          className={`form-input w-full ${errors.name ? 'border-red-300' : ''}`}
                          type="text"
                          {...register('name')}
                          placeholder="e.g., Bug Report, Feature Request"
                        />
                        {errors.name && (
                          <div className="text-xs mt-1 text-red-500">{errors.name.message}</div>
                        )}
                      </div>

                      {/* Description */}
                      <div>
                        <label className="block text-sm font-medium mb-1" htmlFor={descriptionId}>
                          Description
                        </label>
                        <textarea
                          id={descriptionId}
                          className={`form-textarea w-full ${errors.description ? 'border-red-300' : ''}`}
                          rows={3}
                          {...register('description')}
                          placeholder="Describe this work item type..."
                        />
                        {errors.description && (
                          <div className="text-xs mt-1 text-red-500">
                            {errors.description.message}
                          </div>
                        )}
                      </div>

                      {/* Icon */}
                      <div>
                        <label className="block text-sm font-medium mb-1" htmlFor={iconId}>
                          Icon
                        </label>
                        <div className="flex gap-2 mb-2">
                          {iconOptions.map((iconOption) => (
                            <button
                              key={iconOption}
                              type="button"
                              className="p-2 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                              onClick={() => {
                                const input = document.getElementById(iconId) as HTMLInputElement;
                                if (input) input.value = iconOption;
                              }}
                            >
                              {iconOption}
                            </button>
                          ))}
                        </div>
                        <input
                          id={iconId}
                          className={`form-input w-full ${errors.icon ? 'border-red-300' : ''}`}
                          type="text"
                          {...register('icon')}
                          placeholder="📋"
                        />
                        {errors.icon && (
                          <div className="text-xs mt-1 text-red-500">{errors.icon.message}</div>
                        )}
                      </div>

                      {/* Color */}
                      <div>
                        <label className="block text-sm font-medium mb-1" htmlFor={colorId}>
                          Color
                        </label>
                        <input
                          id={colorId}
                          className={`form-input w-full ${errors.color ? 'border-red-300' : ''}`}
                          type="color"
                          {...register('color')}
                        />
                        {errors.color && (
                          <div className="text-xs mt-1 text-red-500">{errors.color.message}</div>
                        )}
                      </div>

                      {/* Active Status */}
                      <div>
                        <label className="flex items-center">
                          <input
                            type="checkbox"
                            className="form-checkbox"
                            {...register('is_active')}
                          />
                          <span className="text-sm ml-2">Active</span>
                        </label>
                      </div>

                      {/* Organization info (read-only) */}
                      <div>
                        <label className="block text-sm font-medium mb-1">Organization</label>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          {workItemType.organization_name || 'Global'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Modal footer */}
                  <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700/60">
                    <div className="flex flex-wrap justify-end space-x-2">
                      <button
                        type="button"
                        className="btn-sm border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 text-gray-800 dark:text-gray-300"
                        onClick={handleClose}
                        disabled={isSubmitting}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="btn-sm bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white disabled:opacity-50"
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

      <Toast type="success" open={showToast} setOpen={setShowToast}>
        Work item type updated successfully!
      </Toast>
    </>
  );
}
