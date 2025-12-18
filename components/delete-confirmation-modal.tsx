'use client';

import { type ReactNode, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { clientErrorLog } from '@/lib/utils/debug-client';

/**
 * Generic Delete Confirmation Modal
 * 
 * Reusable confirmation dialog for delete operations with:
 * - Consistent red warning design
 * - Loading state during deletion
 * - Optional additional content (impact warnings, etc.)
 * - Matches existing delete modal patterns
 * 
 * @example
 * <DeleteConfirmationModal
 *   isOpen={isOpen}
 *   setIsOpen={setIsOpen}
 *   title="Delete Dashboard"
 *   itemName={dashboardName}
 *   message="This action cannot be undone and will remove all chart arrangements."
 *   confirmButtonText="Delete Dashboard"
 *   onConfirm={async () => await handleDelete(id)}
 * />
 * 
 * @example With additional content
 * <DeleteConfirmationModal
 *   isOpen={isOpen}
 *   setIsOpen={setIsOpen}
 *   title="Delete Work Item"
 *   itemName={workItemSubject}
 *   onConfirm={handleDelete}
 * >
 *   <ImpactWarning childCount={5} commentCount={10} />
 * </DeleteConfirmationModal>
 */

interface DeleteConfirmationModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  
  /** Function to control modal open state */
  setIsOpen: (value: boolean) => void;
  
  /** Modal title (e.g., "Delete Dashboard") */
  title: string;
  
  /** Name of the item being deleted (shown in bold) */
  itemName: string;
  
  /** Optional custom message. Defaults to standard delete warning */
  message?: string;
  
  /** Text for the confirm button (e.g., "Delete Dashboard") */
  confirmButtonText?: string;
  
  /** Async function called when user confirms deletion */
  onConfirm: () => Promise<void>;
  
  /** Optional children for additional content (impact warnings, etc.) */
  children?: ReactNode;
}

export default function DeleteConfirmationModal({
  isOpen,
  setIsOpen,
  title,
  itemName,
  message,
  confirmButtonText = 'Delete',
  onConfirm,
  children,
}: DeleteConfirmationModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirm = async () => {
    try {
      setIsDeleting(true);
      await onConfirm();
      setIsOpen(false);
    } catch (error) {
      clientErrorLog('Delete failed:', error);
      // Error will be handled by parent component
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCancel = () => {
    if (!isDeleting) {
      setIsOpen(false);
    }
  };

  const defaultMessage = `Are you sure you want to delete this? This action cannot be undone.`;

  return (
    <Modal isOpen={isOpen} onClose={handleCancel} size="sm" title={title} preventClose={isDeleting}>
      <div className="px-5 py-4">
        {/* Icon */}
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/20 mx-auto mb-4">
          <svg
            className="w-6 h-6 text-red-600 dark:text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </div>

        {/* Content */}
        <div className="text-center">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
            {title}
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            {message || (
              <>
                Are you sure you want to delete <strong>"{itemName}"</strong>? {defaultMessage}
              </>
            )}
          </p>
        </div>

        {/* Optional children (impact warnings, additional info, etc.) */}
        {children}

        {/* Actions */}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 mt-6">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleCancel}
            disabled={isDeleting}
            fullWidth
            className="sm:w-auto mt-3 sm:mt-0"
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={handleConfirm}
            loading={isDeleting}
            loadingText="Deleting..."
            fullWidth
            className="sm:w-auto"
          >
            {confirmButtonText}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

