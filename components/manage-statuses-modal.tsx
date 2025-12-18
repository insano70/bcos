'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { FormLabel } from '@/components/ui/form-label';
import { FormError } from '@/components/ui/form-error';
import { Modal } from '@/components/ui/modal';
import ColorPicker from './color-picker';
import DeleteConfirmationModal from './delete-confirmation-modal';
import {
  useCreateWorkItemStatus,
  useDeleteWorkItemStatus,
  useUpdateWorkItemStatus,
  useWorkItemStatuses,
  type WorkItemStatus,
} from '@/lib/hooks/use-work-item-statuses';
import { createSafeTextSchema } from '@/lib/validations/sanitization';
import Toast from './toast';
import { getStatusBadgeColor } from '@/lib/utils/badge-colors';
import { clientErrorLog } from '@/lib/utils/debug-client';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

const statusSchema = z.object({
  status_name: createSafeTextSchema(1, 100, 'Status name'),
  status_category: z.enum(['backlog', 'in_progress', 'completed', 'cancelled']),
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

  const statusNameId = useId();
  const statusCategoryId = useId();
  const displayOrderId = useId();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
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
    setValue(
      'status_category',
      status.status_category as 'backlog' | 'in_progress' | 'completed' | 'cancelled'
    );
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
          typeId: workItemTypeId,
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
      clientErrorLog('Failed to save status:', error);
    }
  };

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [statusToDelete, setStatusToDelete] = useState<WorkItemStatus | null>(null);

  const handleDeleteClick = (status: WorkItemStatus) => {
    setStatusToDelete(status);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!statusToDelete) return;
    
    try {
      await deleteStatus.mutateAsync({
        id: statusToDelete.work_item_status_id,
        typeId: workItemTypeId,
      });
      setToastMessage('Status deleted successfully');
      setShowToast(true);
      setStatusToDelete(null);
      refetch();
    } catch (error) {
      clientErrorLog('Failed to delete status:', error);
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        size="xl"
        title={`Manage Statuses - ${workItemTypeName}`}
      >
        {/* Modal content */}
        <div className="px-5 py-4">
                  {/* Add Status Button */}
                  {!isAddingStatus && !editingStatusId && (
                    <div className="mb-4">
                      <Button
                        variant="primary"
                        onClick={handleAddStatus}
                        leftIcon={
                          <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 16 16">
                            <path d="M15 7H9V1c0-.6-.4-1-1-1S7 .4 7 1v6H1c-.6 0-1 .4-1 1s.4 1 1 1h6v6c0 .6.4 1 1 1s1-.4 1-1V9h6c.6 0 1-.4 1-1s-.4-1-1-1z" />
                          </svg>
                        }
                      >
                        Add Status
                      </Button>
                    </div>
                  )}

                  {/* Add/Edit Form */}
                  {(isAddingStatus || editingStatusId) && (
                    <form
                      onSubmit={handleSubmit(onSubmit)}
                      className="mb-6 p-4 border border-gray-200 dark:border-gray-700 rounded-lg"
                    >
                      <h3 className="text-lg font-semibold mb-4">
                        {isAddingStatus ? 'Add New Status' : 'Edit Status'}
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Status Name */}
                        <div>
                          <FormLabel htmlFor={statusNameId} required className="mb-1">
                            Status Name
                          </FormLabel>
                          <input
                            id={statusNameId}
                            type="text"
                            className={`form-input w-full ${errors.status_name ? 'border-red-300' : ''}`}
                            {...register('status_name')}
                            placeholder="e.g., In Review"
                          />
                          <FormError>{errors.status_name?.message}</FormError>
                        </div>

                        {/* Category */}
                        <div>
                          <FormLabel htmlFor={statusCategoryId} required className="mb-1">
                            Category
                          </FormLabel>
                          <select
                            id={statusCategoryId}
                            className={`form-select w-full ${errors.status_category ? 'border-red-300' : ''}`}
                            {...register('status_category')}
                          >
                            <option value="backlog">Backlog</option>
                            <option value="in_progress">In Progress</option>
                            <option value="completed">Completed</option>
                            <option value="cancelled">Cancelled</option>
                          </select>
                          <FormError>{errors.status_category?.message}</FormError>
                        </div>

                        {/* Color */}
                        <div>
                          <ColorPicker
                            label="Color"
                            value={watch('color') || '#3b82f6'}
                            onChange={(color) => setValue('color', color, { shouldValidate: true })}
                            defaultColor="#3b82f6"
                            description="Pick from presets or enter a custom hex color"
                          />
                          <FormError>{errors.color?.message}</FormError>
                        </div>

                        {/* Display Order */}
                        <div>
                          <FormLabel htmlFor={displayOrderId} required className="mb-1">
                            Display Order
                          </FormLabel>
                          <input
                            id={displayOrderId}
                            type="number"
                            min="0"
                            className={`form-input w-full ${errors.display_order ? 'border-red-300' : ''}`}
                            {...register('display_order', { valueAsNumber: true })}
                          />
                          <FormError>{errors.display_order?.message}</FormError>
                        </div>

                        {/* Flags */}
                        <div className="md:col-span-2 flex gap-4">
                          <label className="flex items-center">
                            <input
                              type="checkbox"
                              className="form-checkbox"
                              {...register('is_initial')}
                            />
                            <span className="text-sm ml-2">Initial Status</span>
                          </label>
                          <label className="flex items-center">
                            <input
                              type="checkbox"
                              className="form-checkbox"
                              {...register('is_final')}
                            />
                            <span className="text-sm ml-2">Final Status</span>
                          </label>
                        </div>
                      </div>

                      <div className="flex gap-2 mt-4">
                        <Button variant="primary" type="submit">
                          {isAddingStatus ? 'Add Status' : 'Save Changes'}
                        </Button>
                        <Button variant="secondary" onClick={handleCancelEdit}>
                          Cancel
                        </Button>
                      </div>
                    </form>
                  )}

                  {/* Statuses List */}
                  {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-8 gap-3">
                      <Spinner size="md" />
                      <div className="text-gray-500">Loading statuses...</div>
                    </div>
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
                              <Badge color={getStatusBadgeColor(status.status_category)} size="sm">
                                {status.status_category}
                              </Badge>

                              {/* Flags */}
                              {status.is_initial && (
                                <Badge color="purple" size="sm">Initial</Badge>
                              )}
                              {status.is_final && (
                                <Badge color="orange" size="sm">Final</Badge>
                              )}

                              {/* Display order */}
                              <span className="text-sm text-gray-500 dark:text-gray-400">
                                Order: {status.display_order}
                              </span>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-2">
                              <Button
                                variant="ghost"
                                size="xs"
                                onClick={() => handleEditStatus(status)}
                                aria-label="Edit"
                                className="p-1"
                              >
                                <svg className="w-4 h-4 fill-current" viewBox="0 0 16 16">
                                  <path d="m13.7 2.3-1-1c-.4-.4-1-.4-1.4 0l-10 10c-.2.2-.3.4-.3.7v4c0 .6.4 1 1 1h4c.3 0 .5-.1.7-.3l10-10c.4-.4.4-1 0-1.4zM10.5 6.5L9 5l.5-.5L11 6l-.5.5zM2 14v-3l6-6 3 3-6 6H2z" />
                                </svg>
                              </Button>
                              <Button
                                variant="ghost"
                                size="xs"
                                onClick={() => handleDeleteClick(status)}
                                aria-label="Delete"
                                className="p-1 text-red-400 hover:text-red-600 dark:hover:text-red-300"
                              >
                                <svg className="w-4 h-4 fill-current" viewBox="0 0 16 16">
                                  <path d="M5 7h6v6H5V7zm6-3.5V2h-1V.5a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5V2H5v1.5H4V4h8v-.5H11zM7 2V1h2v1H7zM6 5v6h1V5H6zm3 0v6h1V5H9z" />
                                </svg>
                              </Button>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>

                {/* Modal footer */}
                <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700/60">
                  <div className="flex justify-end">
                    <Button variant="secondary" onClick={onClose}>
                      Close
                    </Button>
                  </div>
                </div>
      </Modal>

      <Toast type="success" open={showToast} setOpen={setShowToast}>
        {toastMessage}
      </Toast>
      
      {/* Delete Confirmation Modal */}
      {statusToDelete && (
        <DeleteConfirmationModal
          isOpen={deleteModalOpen}
          setIsOpen={setDeleteModalOpen}
          title="Delete Status"
          itemName={statusToDelete.status_name}
          message="This action cannot be undone. Work items using this status will need to be updated."
          confirmButtonText="Delete Status"
          onConfirm={handleConfirmDelete}
        />
      )}
    </>
  );
}


