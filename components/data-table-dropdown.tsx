'use client';

import { memo, useEffect, useRef, useState } from 'react';
import DeleteConfirmationModal from './delete-confirmation-modal';
import { clientErrorLog } from '@/lib/utils/debug-client';
import type { DataTableDropdownAction } from './data-table/types';

interface DataTableDropdownProps<T> {
  item: T;
  actions: DataTableDropdownAction<T>[];
}

function DataTableDropdownInner<T>({ item, actions }: DataTableDropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<DataTableDropdownAction<T> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleActionClick = (action: DataTableDropdownAction<T>) => {
    // Check for custom modal first (preferred)
    if (action.confirmModal) {
      setPendingAction(action);
      setConfirmModalOpen(true);
      setIsOpen(false); // Close dropdown when modal opens
      return;
    }

    // Auto-convert deprecated confirm prop to modal pattern
    if (action.confirm) {
      setPendingAction(action);
      setConfirmModalOpen(true);
      setIsOpen(false); // Close dropdown when modal opens
      return;
    }

    // Execute action
    handleAction(action);
  };

  const handleAction = async (action: DataTableDropdownAction<T>) => {
    setIsProcessing(true);
    try {
      await action.onClick(item);
      setIsOpen(false);
    } catch (error) {
      clientErrorLog('Action failed', error);
    } finally {
      setIsProcessing(false);
    }
  };
  
  const handleConfirmModal = async () => {
    if (pendingAction) {
      await handleAction(pendingAction);
      setPendingAction(null);
    }
  };

  // Filter visible actions
  const visibleActions = actions.filter((action) => action.show === undefined || action.show(item));

  if (visibleActions.length === 0) {
    return null;
  }

  return (
    <div className="relative inline-flex" ref={dropdownRef}>
      {/* Menu button */}
      <button
        type="button"
        className="text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400 rounded-full"
        aria-haspopup="true"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        disabled={isProcessing}
      >
        <span className="sr-only">Menu</span>
        <svg className="w-8 h-8 fill-current" viewBox="0 0 32 32">
          <circle cx="16" cy="16" r="2" />
          <circle cx="10" cy="16" r="2" />
          <circle cx="22" cy="16" r="2" />
        </svg>
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div
          className="origin-top-right z-50 fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 py-1.5 rounded-lg shadow-lg overflow-hidden min-w-44"
          style={{
            top: dropdownRef.current ? dropdownRef.current.getBoundingClientRect().bottom + 4 : 0,
            left: dropdownRef.current ? dropdownRef.current.getBoundingClientRect().right - 176 : 0,
          }}
        >
          <ul>
            {visibleActions.map((action, index) => {
              const label = typeof action.label === 'function' ? action.label(item) : action.label;
              const isDanger = action.variant === 'danger';
              const key = `${label}-${action.variant || 'default'}-${index}`;

              return (
                <li key={key}>
                  <button
                    type="button"
                    className={`font-medium text-sm flex items-center py-1 px-3 w-full text-left disabled:opacity-50 ${
                      isDanger
                        ? 'text-red-500 hover:text-red-600'
                        : 'text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-200'
                    }`}
                    onClick={() => handleActionClick(action)}
                    disabled={isProcessing}
                  >
                    {action.icon && (
                      <span
                        className={`shrink-0 mr-2 ${isDanger ? 'text-red-400' : 'text-gray-400 dark:text-gray-500'}`}
                      >
                        {action.icon}
                      </span>
                    )}
                    <span>{label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      
      {/* Confirmation Modal */}
      {pendingAction && (pendingAction.confirmModal || pendingAction.confirm) && (
        <DeleteConfirmationModal
          isOpen={confirmModalOpen}
          setIsOpen={(value) => {
            setConfirmModalOpen(value);
            if (!value) {
              setPendingAction(null);
            }
          }}
          title={
            pendingAction.confirmModal?.title
              ? typeof pendingAction.confirmModal.title === 'function'
                ? pendingAction.confirmModal.title(item)
                : pendingAction.confirmModal.title
              : 'Confirm Action'
          }
          itemName={
            typeof pendingAction.label === 'function'
              ? pendingAction.label(item)
              : pendingAction.label
          }
          message={
            pendingAction.confirmModal?.message
              ? typeof pendingAction.confirmModal.message === 'function'
                ? pendingAction.confirmModal.message(item)
                : pendingAction.confirmModal.message
              : pendingAction.confirm
                ? typeof pendingAction.confirm === 'function'
                  ? pendingAction.confirm(item)
                  : pendingAction.confirm
                : 'Are you sure you want to proceed?'
          }
          confirmButtonText={
            pendingAction.confirmModal?.confirmText
              ? typeof pendingAction.confirmModal.confirmText === 'function'
                ? pendingAction.confirmModal.confirmText(item)
                : pendingAction.confirmModal.confirmText
              : 'Confirm'
          }
          onConfirm={handleConfirmModal}
        />
      )}
    </div>
  );
}

/**
 * Custom comparator for DataTableDropdown memo.
 * Compares actions by structure (label, variant, icon presence) rather than reference,
 * since callbacks are often recreated on each parent render.
 */
function arePropsEqual<T>(
  prevProps: DataTableDropdownProps<T>,
  nextProps: DataTableDropdownProps<T>
): boolean {
  // Item changed - need to re-render
  if (prevProps.item !== nextProps.item) {
    return false;
  }

  // Actions array length changed
  if (prevProps.actions.length !== nextProps.actions.length) {
    return false;
  }

  // Compare each action's structural properties (not function references)
  for (let i = 0; i < prevProps.actions.length; i++) {
    const prevAction = prevProps.actions[i];
    const nextAction = nextProps.actions[i];

    if (!prevAction || !nextAction) {
      return false;
    }

    // Compare static label (string labels only - function labels need re-render)
    if (typeof prevAction.label === 'string' && typeof nextAction.label === 'string') {
      if (prevAction.label !== nextAction.label) {
        return false;
      }
    } else if (prevAction.label !== nextAction.label) {
      // Function labels - compare reference (usually stable)
      return false;
    }

    // Compare variant
    if (prevAction.variant !== nextAction.variant) {
      return false;
    }

    // Compare icon presence (not content, as icons are usually stable)
    if (Boolean(prevAction.icon) !== Boolean(nextAction.icon)) {
      return false;
    }
  }

  return true;
}

const DataTableDropdown = memo(DataTableDropdownInner, arePropsEqual) as typeof DataTableDropdownInner;
export default DataTableDropdown;
