'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react';
import { TransitionValidationBuilder } from './transition-validation-builder';
import { TransitionActionBuilder } from './transition-action-builder';
import { useUpdateWorkItemTransition, type WorkItemStatusTransition } from '@/lib/hooks/use-work-item-transitions';
import { toast } from 'sonner';

interface EditTransitionConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  transition: WorkItemStatusTransition;
  fromStatusName: string;
  toStatusName: string;
  workItemTypeId: string;
}

export default function EditTransitionConfigModal({
  isOpen,
  onClose,
  transition,
  fromStatusName,
  toStatusName,
  workItemTypeId,
}: EditTransitionConfigModalProps) {
  const [activeTab, setActiveTab] = useState<'validation' | 'actions'>('validation');
  const [validationConfig, setValidationConfig] = useState<unknown>(transition.validation_config);
  const [actionConfig, setActionConfig] = useState<unknown>(transition.action_config);
  const [hasChanges, setHasChanges] = useState(false);

  const updateTransition = useUpdateWorkItemTransition();

  // Reset state when transition changes
  useEffect(() => {
    setValidationConfig(transition.validation_config);
    setActionConfig(transition.action_config);
    setHasChanges(false);
  }, [transition]);

  const handleSave = async () => {
    try {
      await updateTransition.mutateAsync({
        id: transition.work_item_status_transition_id,
        data: {
          validation_config: validationConfig,
          action_config: actionConfig,
        },
        typeId: workItemTypeId,
      });
      toast.success('Transition configuration saved successfully');
      setHasChanges(false);
      onClose();
    } catch (error) {
      toast.error('Failed to save transition configuration');
      console.error('Failed to save transition configuration:', error);
    }
  };

  const handleCancel = () => {
    if (hasChanges && !confirm('You have unsaved changes. Are you sure you want to close?')) {
      return;
    }
    setValidationConfig(transition.validation_config);
    setActionConfig(transition.action_config);
    setHasChanges(false);
    onClose();
  };

  const handleValidationChange = (config: unknown) => {
    setValidationConfig(config);
    setHasChanges(true);
  };

  const handleActionChange = (config: unknown) => {
    setActionConfig(config);
    setHasChanges(true);
  };

  return (
    <Transition show={isOpen}>
      <Dialog onClose={handleCancel}>
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
            <DialogPanel className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden max-w-6xl w-full max-h-[90vh] flex flex-col">
              {/* Modal header */}
              <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700/60 flex-shrink-0">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="font-semibold text-gray-800 dark:text-gray-100">
                      Configure Transition
                    </h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {fromStatusName} → {toStatusName}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400"
                    onClick={handleCancel}
                  >
                    <span className="sr-only">Close</span>
                    <svg className="w-4 h-4 fill-current">
                      <path d="M7.95 6.536l4.242-4.243a1 1 0 111.415 1.414L9.364 7.95l4.243 4.242a1 1 0 11-1.415 1.415L7.95 9.364l-4.243 4.243a1 1 0 01-1.414-1.415L6.536 7.95 2.293 3.707a1 1 0 011.414-1.414L7.95 6.536z" />
                    </svg>
                  </button>
                </div>

                {/* Tabs */}
                <div className="flex gap-4 mt-4 border-b border-gray-200 dark:border-gray-700">
                  <button
                    type="button"
                    onClick={() => setActiveTab('validation')}
                    className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === 'validation'
                        ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                        : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                    }`}
                  >
                    Validation Rules
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('actions')}
                    className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === 'actions'
                        ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                        : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                    }`}
                  >
                    Automated Actions
                  </button>
                </div>
              </div>

              {/* Modal content - scrollable */}
              <div className="px-5 py-4 overflow-y-auto flex-1">
                {activeTab === 'validation' ? (
                  <TransitionValidationBuilder
                    workItemTypeId={workItemTypeId}
                    initialConfig={validationConfig as any}
                    onChange={handleValidationChange}
                  />
                ) : (
                  <TransitionActionBuilder
                    workItemTypeId={workItemTypeId}
                    initialConfig={actionConfig as any}
                    onChange={handleActionChange}
                  />
                )}
              </div>

              {/* Modal footer */}
              <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700/60 flex-shrink-0">
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {hasChanges && <span className="text-amber-600 dark:text-amber-400">• Unsaved changes</span>}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleCancel}
                      className="btn border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 text-gray-800 dark:text-gray-300"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={!hasChanges || updateTransition.isPending}
                      className="btn bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {updateTransition.isPending ? 'Saving...' : 'Save Configuration'}
                    </button>
                  </div>
                </div>
              </div>
            </DialogPanel>
          </div>
        </TransitionChild>
      </Dialog>
    </Transition>
  );
}
