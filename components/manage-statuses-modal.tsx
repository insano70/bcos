'use client';

import { useState } from 'react';
import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  useWorkItemStatuses,
  useCreateWorkItemStatus,
  useUpdateWorkItemStatus,
  useDeleteWorkItemStatus,
  type WorkItemStatus,
} from '@/lib/hooks/use-work-item-statuses';
import { createSafeTextSchema } from '@/lib/validations/sanitization';
import Toast from './toast';

const statusSchema = z.object({
  status_name: createSafeTextSchema(1, 100, 'Status name'),
  status_category: z.enum(['backlog', 'in_progress', 'done', 'cancelled']),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a valid hex color'),
  is_initial: z.boolean(),
  is_final: z.boolean(),
  display_order: z.number().int().min(0),
});

type StatusForm = z.infer<typeof statusSchema>;

interface ManageStatusesModalProps {
  isOpen: boolean;
  onClose: () => void;
  workItemTypeId: string;
  workItemTypeName: string;
}

export default function ManageStatusesModal({
  isOpen,
  onClose,
  workItemTypeId,
  workItemTypeName,
}: ManageStatusesModalProps) {
  const { data: statuses = [], isLoading, refetch } = useWorkItemStatuses(workItemTypeId);
  const createStatus = useCreateWorkItemStatus();
  const updateStatus = useUpdateWorkItemStatus();
  const deleteStatus = useDeleteWorkItemStatus();

  const [isAddingStatus, setIsAddingStatus] = useState(false);
  const [editingStatusId, setEditingStatusId] = useState<string | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
  } = useForm<StatusForm>({
    resolver: zodResolver(statusSchema),
    defaultValues: {
      status_category: 'in_progress',
      color: '#3b82f6',
      is_initial: false,
      is_final: false,
      display_order: statuses.length,
    },
  });

  const handleAddStatus = () => {
    setIsAddingStatus(true);
    setEditingStatusId(null);
    reset({
      status_name: '',
      status_category: 'in_progress',
      color: '#3b82f6',
      is_initial: false,
      is_final: false,
      display_order: statuses.length,
    });
  };

  const handleEditStatus = (status: WorkItemStatus) => {
    setEditingStatusId(status.work_item_status_id);
    setIsAddingStatus(false);
    setValue('status_name', status.status_name);
    setValue('status_category', status.status_category as 'backlog' | 'in_progress' | 'done' | 'cancelled');
    setValue('color', status.color || '#3b82f6');
    setValue('is_initial', status.is_initial);
    setValue('is_final', status.is_final);
    setValue('display_order', status.display_order);
  };

  const handleCancelEdit = () => {
    setIsAddingStatus(false);
    setEditingStatusId(null);
    reset();
  };

  const onSubmit = async (data: StatusForm) => {
    try {
      if (isAddingStatus) {
        await createStatus.mutateAsync({
          work_item_type_id: workItemTypeId,
          ...data,
        });
        setToastMessage('Status created successfully');
      } else if (editingStatusId) {
        await updateStatus.mutateAsync({
          id: editingStatusId,
          data: {
            status_name: data.status_name,
            status_category: data.status_category,
            color: data.color,
            is_initial: data.is_initial,
            is_final: data.is_final,
            display_order: data.display_order,
          },
        });
        setToastMessage('Status updated successfully');
      }
      setShowToast(true);
      handleCancelEdit();
      refetch();
    } catch (error) {
      console.error('Failed to save status:', error);
    }
  };

  const handleDeleteStatus = async (status: WorkItemStatus) => {
    if (!confirm(`Are you sure you want to delete "${status.status_name}"?`)) {
      return;
    }

    try {
      await deleteStatus.mutateAsync({
        id: status.work_item_status_id,
        typeId: workItemTypeId,
      });
      setToastMessage('Status deleted successfully');
      setShowToast(true);
      refetch();
    } catch (error) {
      console.error('Failed to delete status:', error);
    }
  };

  const categoryColors = {
    backlog: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
    in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    done: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  };

  return (
    <>
      <Transition show={isOpen}>
        <Dialog onClose={onClose}>
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
              <DialogPanel className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-auto max-w-4xl w-full max-h-full">
                {/* Modal header */}
                <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700/60">
                  <div className="flex justify-between items-center">
                    <h2 className="font-semibold text-gray-800 dark:text-gray-100">
                      Manage Statuses - {workItemTypeName}
                    </h2>
                    <button
                      type="button"
                      className="text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400"
                      onClick={onClose}
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
                  {/* Add Status Button */}
                  {!isAddingStatus && !editingStatusId && (
                    <div className="mb-4">
                      <button
                        type="button"
                        onClick={handleAddStatus}
                        className="btn bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white"
                      >
                        <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 16 16">
                          <path d="M15 7H9V1c0-.6-.4-1-1-1S7 .4 7 1v6H1c-.6 0-1 .4-1 1s.4 1 1 1h6v6c0 .6.4 1 1 1s1-.4 1-1V9h6c.6 0 1-.4 1-1s-.4-1-1-1z" />
                        </svg>
                        <span className="ml-2">Add Status</span>
                      </button>
                    </div>
                  )}

                  {/* Add/Edit Form */}
                  {(isAddingStatus || editingStatusId) && (
                    <form onSubmit={handleSubmit(onSubmit)} className="mb-6 p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                      <h3 className="text-lg font-semibold mb-4">
                        {isAddingStatus ? 'Add New Status' : 'Edit Status'}
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Status Name */}
                        <div>
                          <label className="block text-sm font-medium mb-1" htmlFor="status_name">
                            Status Name <span className="text-red-500">*</span>
                          </label>
                          <input
                            id="status_name"
                            type="text"
                            className={`form-input w-full ${errors.status_name ? 'border-red-300' : ''}`}
                            {...register('status_name')}
                            placeholder="e.g., In Review"
                          />
                          {errors.status_name && (
                            <div className="text-xs mt-1 text-red-500">{errors.status_name.message}</div>
                          )}
                        </div>

                        {/* Category */}
                        <div>
                          <label className="block text-sm font-medium mb-1" htmlFor="status_category">
                            Category <span className="text-red-500">*</span>
                          </label>
                          <select
                            id="status_category"
                            className={`form-select w-full ${errors.status_category ? 'border-red-300' : ''}`}
                            {...register('status_category')}
                          >
                            <option value="backlog">Backlog</option>
                            <option value="in_progress">In Progress</option>
                            <option value="done">Done</option>
                            <option value="cancelled">Cancelled</option>
                          </select>
                          {errors.status_category && (
                            <div className="text-xs mt-1 text-red-500">{errors.status_category.message}</div>
                          )}
                        </div>

                        {/* Color */}
                        <div>
                          <label className="block text-sm font-medium mb-1" htmlFor="color">
                            Color <span className="text-red-500">*</span>
                          </label>
                          <input
                            id="color"
                            type="color"
                            className={`form-input w-full h-10 ${errors.color ? 'border-red-300' : ''}`}
                            {...register('color')}
                          />
                          {errors.color && (
                            <div className="text-xs mt-1 text-red-500">{errors.color.message}</div>
                          )}
                        </div>

                        {/* Display Order */}
                        <div>
                          <label className="block text-sm font-medium mb-1" htmlFor="display_order">
                            Display Order <span className="text-red-500">*</span>
                          </label>
                          <input
                            id="display_order"
                            type="number"
                            min="0"
                            className={`form-input w-full ${errors.display_order ? 'border-red-300' : ''}`}
                            {...register('display_order', { valueAsNumber: true })}
                          />
                          {errors.display_order && (
                            <div className="text-xs mt-1 text-red-500">{errors.display_order.message}</div>
                          )}
                        </div>

                        {/* Flags */}
                        <div className="md:col-span-2 flex gap-4">
                          <label className="flex items-center">
                            <input type="checkbox" className="form-checkbox" {...register('is_initial')} />
                            <span className="text-sm ml-2">Initial Status</span>
                          </label>
                          <label className="flex items-center">
                            <input type="checkbox" className="form-checkbox" {...register('is_final')} />
                            <span className="text-sm ml-2">Final Status</span>
                          </label>
                        </div>
                      </div>

                      <div className="flex gap-2 mt-4">
                        <button
                          type="submit"
                          className="btn bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white"
                        >
                          {isAddingStatus ? 'Add Status' : 'Save Changes'}
                        </button>
                        <button
                          type="button"
                          onClick={handleCancelEdit}
                          className="btn border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 text-gray-800 dark:text-gray-300"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Statuses List */}
                  {isLoading ? (
                    <div className="text-center py-8 text-gray-500">Loading statuses...</div>
                  ) : statuses.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      No statuses defined. Add your first status to get started.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {statuses
                        .sort((a, b) => a.display_order - b.display_order)
                        .map((status) => (
                          <div
                            key={status.work_item_status_id}
                            className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50"
                          >
                            <div className="flex items-center gap-3 flex-1">
                              {/* Color indicator */}
                              <div
                                className="w-4 h-4 rounded"
                                style={{ backgroundColor: status.color || '#gray' }}
                              />

                              {/* Status name */}
                              <div className="font-medium text-gray-800 dark:text-gray-100">
                                {status.status_name}
                              </div>

                              {/* Category badge */}
                              <span className={`px-2 py-1 text-xs rounded-full ${categoryColors[status.status_category as keyof typeof categoryColors]}`}>
                                {status.status_category}
                              </span>

                              {/* Flags */}
                              {status.is_initial && (
                                <span className="px-2 py-1 text-xs bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400 rounded-full">
                                  Initial
                                </span>
                              )}
                              {status.is_final && (
                                <span className="px-2 py-1 text-xs bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 rounded-full">
                                  Final
                                </span>
                              )}

                              {/* Display order */}
                              <span className="text-sm text-gray-500 dark:text-gray-400">
                                Order: {status.display_order}
                              </span>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => handleEditStatus(status)}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                title="Edit"
                              >
                                <svg className="w-4 h-4 fill-current" viewBox="0 0 16 16">
                                  <path d="m13.7 2.3-1-1c-.4-.4-1-.4-1.4 0l-10 10c-.2.2-.3.4-.3.7v4c0 .6.4 1 1 1h4c.3 0 .5-.1.7-.3l10-10c.4-.4.4-1 0-1.4zM10.5 6.5L9 5l.5-.5L11 6l-.5.5zM2 14v-3l6-6 3 3-6 6H2z" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteStatus(status)}
                                className="text-red-400 hover:text-red-600 dark:hover:text-red-300"
                                title="Delete"
                              >
                                <svg className="w-4 h-4 fill-current" viewBox="0 0 16 16">
                                  <path d="M5 7h6v6H5V7zm6-3.5V2h-1V.5a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5V2H5v1.5H4V4h8v-.5H11zM7 2V1h2v1H7zM6 5v6h1V5H6zm3 0v6h1V5H9z" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>

                {/* Modal footer */}
                <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700/60">
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={onClose}
                      className="btn border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 text-gray-800 dark:text-gray-300"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </DialogPanel>
            </div>
          </TransitionChild>
        </Dialog>
      </Transition>

      <Toast type="success" open={showToast} setOpen={setShowToast}>
        {toastMessage}
      </Toast>
    </>
  );
}
