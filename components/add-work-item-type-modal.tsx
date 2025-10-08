'use client';

import { useState } from 'react';
import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCreateWorkItemType } from '@/lib/hooks/use-work-item-types';
import { useOrganizations } from '@/lib/hooks/use-organizations';
import { createSafeTextSchema } from '@/lib/validations/sanitization';
import Toast from './toast';
import { useAuth } from '@/components/auth/rbac-auth-provider';

const createWorkItemTypeSchema = z.object({
  name: createSafeTextSchema(1, 255, 'Type name'),
  description: createSafeTextSchema(0, 1000, 'Description').optional(),
  icon: z.string().max(10, 'Icon must not exceed 10 characters').optional(),
  color: z.string().max(50, 'Color must not exceed 50 characters').optional(),
  organization_id: z.string().uuid('Invalid organization'),
  is_active: z.boolean().optional(),
});

type CreateWorkItemTypeForm = z.infer<typeof createWorkItemTypeSchema>;

interface AddWorkItemTypeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function AddWorkItemTypeModal({ isOpen, onClose, onSuccess }: AddWorkItemTypeModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const createWorkItemType = useCreateWorkItemType();
  const { data: organizations = [] } = useOrganizations();
  const { userContext } = useAuth();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<CreateWorkItemTypeForm>({
    resolver: zodResolver(createWorkItemTypeSchema),
    defaultValues: {
      organization_id: userContext?.current_organization_id || '',
      is_active: true,
    },
  });

  const onSubmit = async (data: CreateWorkItemTypeForm) => {
    setIsSubmitting(true);
    try {
      // Filter out undefined values for exactOptionalPropertyTypes
      const filteredData: {
        organization_id: string;
        name: string;
        description?: string;
        icon?: string;
        color?: string;
        is_active?: boolean;
      } = {
        organization_id: data.organization_id,
        name: data.name,
      };
      if (data.description !== undefined) filteredData.description = data.description;
      if (data.icon !== undefined) filteredData.icon = data.icon;
      if (data.color !== undefined) filteredData.color = data.color;
      if (data.is_active !== undefined) filteredData.is_active = data.is_active;

      await createWorkItemType.mutateAsync(filteredData);
      setShowToast(true);
      reset();
      onSuccess?.();
    } catch (error) {
      console.error('Failed to create work item type:', error);
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
                      <h2 className="font-semibold text-gray-800 dark:text-gray-100">Add Work Item Type</h2>
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
                        <label className="block text-sm font-medium mb-1" htmlFor="name">
                          Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          id="name"
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
                        <label className="block text-sm font-medium mb-1" htmlFor="description">
                          Description
                        </label>
                        <textarea
                          id="description"
                          className={`form-textarea w-full ${errors.description ? 'border-red-300' : ''}`}
                          rows={3}
                          {...register('description')}
                          placeholder="Describe this work item type..."
                        />
                        {errors.description && (
                          <div className="text-xs mt-1 text-red-500">{errors.description.message}</div>
                        )}
                      </div>

                      {/* Icon */}
                      <div>
                        <label className="block text-sm font-medium mb-1" htmlFor="icon">
                          Icon
                        </label>
                        <div className="flex gap-2 mb-2">
                          {iconOptions.map((iconOption) => (
                            <button
                              key={iconOption}
                              type="button"
                              className="p-2 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                              onClick={() => {
                                const input = document.getElementById('icon') as HTMLInputElement;
                                if (input) input.value = iconOption;
                              }}
                            >
                              {iconOption}
                            </button>
                          ))}
                        </div>
                        <input
                          id="icon"
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
                        <label className="block text-sm font-medium mb-1" htmlFor="color">
                          Color
                        </label>
                        <input
                          id="color"
                          className={`form-input w-full ${errors.color ? 'border-red-300' : ''}`}
                          type="color"
                          {...register('color')}
                        />
                        {errors.color && (
                          <div className="text-xs mt-1 text-red-500">{errors.color.message}</div>
                        )}
                      </div>

                      {/* Organization */}
                      <div>
                        <label className="block text-sm font-medium mb-1" htmlFor="organization_id">
                          Organization <span className="text-red-500">*</span>
                        </label>
                        <select
                          id="organization_id"
                          className={`form-select w-full ${errors.organization_id ? 'border-red-300' : ''}`}
                          {...register('organization_id')}
                        >
                          <option value="">Select organization</option>
                          {organizations
                            .filter((org) => org.is_active)
                            .map((org) => (
                              <option key={org.id} value={org.id}>
                                {org.name}
                              </option>
                            ))}
                        </select>
                        {errors.organization_id && (
                          <div className="text-xs mt-1 text-red-500">{errors.organization_id.message}</div>
                        )}
                      </div>

                      {/* Active Status */}
                      <div>
                        <label className="flex items-center">
                          <input type="checkbox" className="form-checkbox" {...register('is_active')} />
                          <span className="text-sm ml-2">Active</span>
                        </label>
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
                        {isSubmitting ? 'Creating...' : 'Create Work Item Type'}
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
        Work item type created successfully!
      </Toast>
    </>
  );
}
