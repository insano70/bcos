'use client';

import { useState, useCallback, type ReactNode } from 'react';
import DeleteConfirmationModal from '../delete-confirmation-modal';
import type { DataTableBulkAction } from './types';

interface UseBulkActionModalOptions<T> {
  /** Array of selected items for the bulk action */
  selectedItems: T[];
  /** Count of selected items (used for display) */
  selectedCount: number;
}

interface UseBulkActionModalReturn<T> {
  /** Whether the confirmation modal is open */
  isModalOpen: boolean;
  /** Handler to initiate a bulk action (shows modal if confirmation required) */
  handleBulkAction: (action: DataTableBulkAction<T>) => void;
  /** Modal component to render (null if no pending action) */
  BulkActionModal: ReactNode;
}

/**
 * Hook for managing bulk action confirmation modals in data tables.
 * 
 * Extracts common modal logic shared between DataTableStandard and EditableDataTable.
 * Handles both modern `confirmModal` and legacy `confirm` props.
 * 
 * @example
 * ```tsx
 * const { handleBulkAction, BulkActionModal } = useBulkActionModal({
 *   selectedItems: selectedItemsData,
 *   selectedCount: selectedItems.length,
 * });
 * 
 * // In JSX:
 * <DataTableToolbar onBulkAction={handleBulkAction} />
 * {BulkActionModal}
 * ```
 */
export function useBulkActionModal<T>({
  selectedItems,
  selectedCount,
}: UseBulkActionModalOptions<T>): UseBulkActionModalReturn<T> {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<DataTableBulkAction<T> | null>(null);

  const handleBulkAction = useCallback((action: DataTableBulkAction<T>) => {
    // Show modal if confirmation is required (confirmModal preferred, legacy confirm supported)
    if (action.confirmModal || action.confirm) {
      setPendingAction(action);
      setIsModalOpen(true);
      return;
    }
    // No confirmation needed - execute directly
    action.onClick(selectedItems);
  }, [selectedItems]);

  const handleConfirm = useCallback(async () => {
    if (pendingAction) {
      await pendingAction.onClick(selectedItems);
      setPendingAction(null);
    }
  }, [pendingAction, selectedItems]);

  const handleClose = useCallback((open: boolean) => {
    setIsModalOpen(open);
    if (!open) {
      setPendingAction(null);
    }
  }, []);

  // Get first item for dynamic modal content (only used when function callbacks need it)
  const firstItem = selectedItems[0];

  // Compute modal props from pending action
  const getModalTitle = (): string => {
    if (!pendingAction) return 'Confirm Action';
    
    if (pendingAction.confirmModal?.title) {
      if (typeof pendingAction.confirmModal.title === 'function' && firstItem) {
        return pendingAction.confirmModal.title(firstItem);
      }
      if (typeof pendingAction.confirmModal.title === 'string') {
        return pendingAction.confirmModal.title;
      }
    }
    return 'Confirm Action';
  };

  const getModalMessage = (): string => {
    if (!pendingAction) return 'Are you sure you want to proceed?';
    
    if (pendingAction.confirmModal?.message) {
      if (typeof pendingAction.confirmModal.message === 'function' && firstItem) {
        return pendingAction.confirmModal.message(firstItem);
      }
      if (typeof pendingAction.confirmModal.message === 'string') {
        return pendingAction.confirmModal.message;
      }
    }
    // Legacy confirm prop support
    if (pendingAction.confirm) {
      return pendingAction.confirm;
    }
    return 'Are you sure you want to proceed?';
  };

  const getConfirmText = (): string => {
    if (!pendingAction) return 'Confirm';
    
    if (pendingAction.confirmModal?.confirmText) {
      if (typeof pendingAction.confirmModal.confirmText === 'function' && firstItem) {
        return pendingAction.confirmModal.confirmText(firstItem);
      }
      if (typeof pendingAction.confirmModal.confirmText === 'string') {
        return pendingAction.confirmModal.confirmText;
      }
    }
    return 'Confirm';
  };

  // Build the modal component
  const BulkActionModal = pendingAction && (pendingAction.confirmModal || pendingAction.confirm) ? (
    <DeleteConfirmationModal
      isOpen={isModalOpen}
      setIsOpen={handleClose}
      title={getModalTitle()}
      itemName={`${selectedCount} item${selectedCount !== 1 ? 's' : ''}`}
      message={getModalMessage()}
      confirmButtonText={getConfirmText()}
      onConfirm={handleConfirm}
    />
  ) : null;

  return {
    isModalOpen,
    handleBulkAction,
    BulkActionModal,
  };
}

