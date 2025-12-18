'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/modal';
import DeleteConfirmationModal from './delete-confirmation-modal';
import {
  useUpdateWorkItemTransition,
  type WorkItemStatusTransition,
} from '@/lib/hooks/use-work-item-transitions';
import {
  type ActionConfig,
  parseActionConfigSafe,
  parseValidationConfigSafe,
  type ValidationConfig,
} from '@/lib/validations/workflow-transitions';
import { TransitionActionBuilder } from './transition-action-builder';
import { TransitionValidationBuilder } from './transition-validation-builder';
import { Button } from '@/components/ui/button';

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
  const [validationConfig, setValidationConfig] = useState<ValidationConfig>(
    parseValidationConfigSafe(transition.validation_config)
  );
  const [actionConfig, setActionConfig] = useState<ActionConfig>(
    parseActionConfigSafe(transition.action_config)
  );
  const [hasChanges, setHasChanges] = useState(false);

  const updateTransition = useUpdateWorkItemTransition();

  // Reset state when transition changes
  useEffect(() => {
    setValidationConfig(parseValidationConfigSafe(transition.validation_config));
    setActionConfig(parseActionConfigSafe(transition.action_config));
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
    } catch {
      // Error is already logged by the mutation hook
      toast.error('Failed to save transition configuration');
    }
  };

  const [unsavedModalOpen, setUnsavedModalOpen] = useState(false);

  const handleCancelClick = () => {
    if (hasChanges) {
      setUnsavedModalOpen(true);
      return;
    }
    setValidationConfig(parseValidationConfigSafe(transition.validation_config));
    setActionConfig(parseActionConfigSafe(transition.action_config));
    setHasChanges(false);
    onClose();
  };

  const handleConfirmClose = async () => {
    setValidationConfig(parseValidationConfigSafe(transition.validation_config));
    setActionConfig(parseActionConfigSafe(transition.action_config));
    setHasChanges(false);
    onClose();
  };

  const handleValidationChange = (config: ValidationConfig) => {
    setValidationConfig(config);
    setHasChanges(true);
  };

  const handleActionChange = (config: ActionConfig) => {
    setActionConfig(config);
    setHasChanges(true);
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleCancelClick}
        size="full"
        title="Configure Transition"
        description={`${fromStatusName} → ${toStatusName}`}
      >
        {/* Tabs */}
        <div className="px-5 border-b border-gray-200 dark:border-gray-700">
          <div className="flex gap-4">
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
                    initialConfig={validationConfig}
                    onChange={handleValidationChange}
                  />
                ) : (
                  <TransitionActionBuilder
                    workItemTypeId={workItemTypeId}
                    initialConfig={actionConfig}
                    onChange={handleActionChange}
                  />
                )}
              </div>

              {/* Modal footer */}
              <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700/60 flex-shrink-0">
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {hasChanges && (
                      <span className="text-amber-600 dark:text-amber-400">• Unsaved changes</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={handleCancelClick}>
                      Cancel
                    </Button>
                    <Button
                      variant="blue"
                      onClick={handleSave}
                      disabled={!hasChanges}
                      loading={updateTransition.isPending}
                      loadingText="Saving..."
                    >
                      Save Configuration
                    </Button>
                  </div>
                </div>
              </div>
      </Modal>

      {/* Unsaved Changes Warning Modal */}
      <DeleteConfirmationModal
        isOpen={unsavedModalOpen}
        setIsOpen={setUnsavedModalOpen}
        title="Unsaved Changes"
        itemName="unsaved changes"
        message="You have unsaved changes. Are you sure you want to close without saving?"
        confirmButtonText="Close Without Saving"
        onConfirm={handleConfirmClose}
      />
    </>
  );
}
