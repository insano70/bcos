'use client';

import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react';
import { useState } from 'react';
import DeleteConfirmationModal from './delete-confirmation-modal';
import { useWorkItemStatuses, type WorkItemStatus } from '@/lib/hooks/use-work-item-statuses';
import {
  useCreateWorkItemTransition,
  useDeleteWorkItemTransition,
  useUpdateWorkItemTransition,
  useWorkItemTransitions,
  type WorkItemStatusTransition,
} from '@/lib/hooks/use-work-item-transitions';
import EditTransitionConfigModal from './edit-transition-config-modal';
import Toast from './toast';

interface WorkflowVisualizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  workItemTypeId: string;
  workItemTypeName: string;
  organizationId: string;
}

export default function WorkflowVisualizationModal({
  isOpen,
  onClose,
  workItemTypeId,
  workItemTypeName,
  organizationId: _organizationId,
}: WorkflowVisualizationModalProps) {
  const { data: statuses = [], isLoading: statusesLoading } = useWorkItemStatuses(workItemTypeId);
  const {
    data: transitions = [],
    isLoading: transitionsLoading,
    refetch,
  } = useWorkItemTransitions(workItemTypeId);
  const createTransition = useCreateWorkItemTransition();
  const updateTransition = useUpdateWorkItemTransition();
  const deleteTransition = useDeleteWorkItemTransition();

  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [_selectedFromStatus, _setSelectedFromStatus] = useState<string | null>(null);
  const [_selectedToStatus, _setSelectedToStatus] = useState<string | null>(null);
  const [editingTransition, setEditingTransition] = useState<WorkItemStatusTransition | null>(null);

  const sortedStatuses = [...statuses].sort((a, b) => a.display_order - b.display_order);

  // Check if a transition exists between two statuses
  const getTransition = (fromId: string, toId: string): WorkItemStatusTransition | undefined => {
    return transitions.find((t) => t.from_status_id === fromId && t.to_status_id === toId);
  };

  const handleToggleTransition = async (fromStatus: WorkItemStatus, toStatus: WorkItemStatus) => {
    const existingTransition = getTransition(
      fromStatus.work_item_status_id,
      toStatus.work_item_status_id
    );

    try {
      if (existingTransition) {
        // Toggle the is_allowed flag
        await updateTransition.mutateAsync({
          id: existingTransition.work_item_status_transition_id,
          data: {
            is_allowed: !existingTransition.is_allowed,
          },
          typeId: workItemTypeId,
        });
        setToastMessage(
          existingTransition.is_allowed ? 'Transition blocked' : 'Transition allowed'
        );
      } else {
        // Create new transition (allowed by default)
        await createTransition.mutateAsync({
          work_item_type_id: workItemTypeId,
          from_status_id: fromStatus.work_item_status_id,
          to_status_id: toStatus.work_item_status_id,
          is_allowed: true,
        });
        setToastMessage('Transition created');
      }
      setShowToast(true);
      refetch();
    } catch (error) {
      console.error('Failed to toggle transition:', error);
    }
  };

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [transitionToDelete, setTransitionToDelete] = useState<WorkItemStatusTransition | null>(null);

  const handleDeleteClick = (transition: WorkItemStatusTransition) => {
    setTransitionToDelete(transition);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!transitionToDelete) return;
    
    try {
      await deleteTransition.mutateAsync({
        id: transitionToDelete.work_item_status_transition_id,
        typeId: workItemTypeId,
      });
      setToastMessage('Transition deleted');
      setShowToast(true);
      setTransitionToDelete(null);
      refetch();
    } catch (error) {
      console.error('Failed to delete transition:', error);
    }
  };

  const isLoading = statusesLoading || transitionsLoading;

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
              <DialogPanel className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-auto max-w-6xl w-full max-h-full">
                {/* Modal header */}
                <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700/60">
                  <div className="flex justify-between items-center">
                    <h2 className="font-semibold text-gray-800 dark:text-gray-100">
                      Status Workflow - {workItemTypeName}
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
                  {isLoading ? (
                    <div className="text-center py-8 text-gray-500">Loading workflow...</div>
                  ) : statuses.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      No statuses defined. Add statuses first to create workflow rules.
                    </div>
                  ) : (
                    <>
                      <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                          Click on a cell to allow/block a transition. Green = allowed, Red =
                          blocked, Gray = no rule (permissive by default).
                        </p>
                      </div>

                      {/* Transition Matrix */}
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                          <thead>
                            <tr>
                              <th className="border border-gray-300 dark:border-gray-600 p-2 bg-gray-100 dark:bg-gray-700 text-sm font-medium">
                                From \ To
                              </th>
                              {sortedStatuses.map((toStatus) => (
                                <th
                                  key={toStatus.work_item_status_id}
                                  className="border border-gray-300 dark:border-gray-600 p-2 bg-gray-100 dark:bg-gray-700 text-sm font-medium min-w-[100px]"
                                >
                                  <div className="flex items-center gap-2 justify-center">
                                    <div
                                      className="w-3 h-3 rounded"
                                      style={{ backgroundColor: toStatus.color || '#gray' }}
                                    />
                                    <span className="truncate">{toStatus.status_name}</span>
                                  </div>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {sortedStatuses.map((fromStatus) => (
                              <tr key={fromStatus.work_item_status_id}>
                                <td className="border border-gray-300 dark:border-gray-600 p-2 bg-gray-100 dark:bg-gray-700 font-medium">
                                  <div className="flex items-center gap-2">
                                    <div
                                      className="w-3 h-3 rounded"
                                      style={{ backgroundColor: fromStatus.color || '#gray' }}
                                    />
                                    <span>{fromStatus.status_name}</span>
                                  </div>
                                </td>
                                {sortedStatuses.map((toStatus) => {
                                  const transition = getTransition(
                                    fromStatus.work_item_status_id,
                                    toStatus.work_item_status_id
                                  );
                                  const isSameStatus =
                                    fromStatus.work_item_status_id === toStatus.work_item_status_id;
                                  const bgColor = isSameStatus
                                    ? 'bg-gray-200 dark:bg-gray-600'
                                    : transition
                                      ? transition.is_allowed
                                        ? 'bg-green-100 dark:bg-green-900/30 hover:bg-green-200 dark:hover:bg-green-900/50'
                                        : 'bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50'
                                      : 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700';

                                  return (
                                    <td
                                      key={toStatus.work_item_status_id}
                                      className={`border border-gray-300 dark:border-gray-600 p-2 text-center ${
                                        isSameStatus ? 'cursor-not-allowed' : 'cursor-pointer'
                                      } ${bgColor}`}
                                      onClick={() => {
                                        if (!isSameStatus) {
                                          handleToggleTransition(fromStatus, toStatus);
                                        }
                                      }}
                                      title={
                                        isSameStatus
                                          ? 'Same status'
                                          : transition
                                            ? transition.is_allowed
                                              ? 'Allowed - Click to block'
                                              : 'Blocked - Click to allow'
                                            : 'No rule (allowed by default) - Click to set explicit rule'
                                      }
                                    >
                                      {isSameStatus ? (
                                        <span className="text-gray-400">-</span>
                                      ) : transition ? (
                                        <div className="flex items-center justify-center gap-1">
                                          {transition.is_allowed ? (
                                            <svg
                                              className="w-5 h-5 text-green-600 dark:text-green-400"
                                              fill="currentColor"
                                              viewBox="0 0 20 20"
                                            >
                                              <path
                                                fillRule="evenodd"
                                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                                clipRule="evenodd"
                                              />
                                            </svg>
                                          ) : (
                                            <svg
                                              className="w-5 h-5 text-red-600 dark:text-red-400"
                                              fill="currentColor"
                                              viewBox="0 0 20 20"
                                            >
                                              <path
                                                fillRule="evenodd"
                                                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                                                clipRule="evenodd"
                                              />
                                            </svg>
                                          )}
                                        </div>
                                      ) : (
                                        <span className="text-gray-400 text-sm">+</span>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Legend */}
                      <div className="mt-4 flex gap-4 text-sm text-gray-600 dark:text-gray-400">
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 bg-green-100 dark:bg-green-900/30 border border-gray-300 dark:border-gray-600 rounded" />
                          <span>Allowed</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 bg-red-100 dark:bg-red-900/30 border border-gray-300 dark:border-gray-600 rounded" />
                          <span>Blocked</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded" />
                          <span>No rule (allowed by default)</span>
                        </div>
                      </div>

                      {/* Active Transitions List */}
                      {transitions.length > 0 && (
                        <div className="mt-6">
                          <h3 className="text-lg font-semibold mb-3">Active Transition Rules</h3>
                          <div className="space-y-2">
                            {transitions.map((transition) => {
                              const fromStatus = statuses.find(
                                (s) => s.work_item_status_id === transition.from_status_id
                              );
                              const toStatus = statuses.find(
                                (s) => s.work_item_status_id === transition.to_status_id
                              );
                              if (!fromStatus || !toStatus) return null;

                              return (
                                <div
                                  key={transition.work_item_status_transition_id}
                                  className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-lg"
                                >
                                  <div className="flex items-center gap-3">
                                    <span className="font-medium">{fromStatus.status_name}</span>
                                    <span className="text-gray-400">→</span>
                                    <span className="font-medium">{toStatus.status_name}</span>
                                    <span
                                      className={`px-2 py-1 text-xs rounded-full ${
                                        transition.is_allowed
                                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                          : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                                      }`}
                                    >
                                      {transition.is_allowed ? 'Allowed' : 'Blocked'}
                                    </span>
                                    {(transition.validation_config !== null ||
                                      transition.action_config !== null) && (
                                      <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                                        Configured
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setEditingTransition(transition)}
                                      className="text-blue-500 hover:text-blue-600 dark:hover:text-blue-400"
                                      title="Configure validation and actions"
                                    >
                                      <svg className="w-4 h-4 fill-current" viewBox="0 0 16 16">
                                        <path d="M11.7.3c-.4-.4-1-.4-1.4 0l-10 10c-.2.2-.3.4-.3.7v4c0 .6.4 1 1 1h4c.3 0 .5-.1.7-.3l10-10c.4-.4.4-1 0-1.4l-4-4zM4.6 14H2v-2.6l6-6L10.6 8l-6 6zM12 6.6L9.4 4 11 2.4 13.6 5 12 6.6z" />
                                      </svg>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteClick(transition)}
                                      className="text-red-400 hover:text-red-600 dark:hover:text-red-300"
                                      title="Delete rule"
                                    >
                                      <svg className="w-4 h-4 fill-current" viewBox="0 0 16 16">
                                        <path d="M5 7h6v6H5V7zm6-3.5V2h-1V.5a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5V2H5v1.5H4V4h8v-.5H11zM7 2V1h2v1H7zM6 5v6h1V5H6zm3 0v6h1V5H9z" />
                                      </svg>
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </>
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

      {editingTransition && (
        <EditTransitionConfigModal
          isOpen={!!editingTransition}
          onClose={() => {
            setEditingTransition(null);
            refetch(); // Refresh transitions after config changes
          }}
          transition={editingTransition}
          fromStatusName={
            statuses.find((s) => s.work_item_status_id === editingTransition.from_status_id)
              ?.status_name || 'Unknown'
          }
          toStatusName={
            statuses.find((s) => s.work_item_status_id === editingTransition.to_status_id)
              ?.status_name || 'Unknown'
          }
          workItemTypeId={workItemTypeId}
        />
      )}

      <Toast type="success" open={showToast} setOpen={setShowToast}>
        {toastMessage}
      </Toast>
      
      {/* Delete Confirmation Modal */}
      {transitionToDelete && (
        <DeleteConfirmationModal
          isOpen={deleteModalOpen}
          setIsOpen={setDeleteModalOpen}
          title="Delete Transition Rule"
          itemName="transition rule"
          message="This action cannot be undone."
          confirmButtonText="Delete Rule"
          onConfirm={handleConfirmDelete}
        />
      )}
    </>
  );
}
