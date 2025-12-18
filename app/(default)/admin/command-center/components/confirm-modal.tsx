/**
 * Confirmation Modal Component
 *
 * Reusable confirmation dialog for destructive actions.
 * Features:
 * - Customizable title and message
 * - Color-coded confirm button (danger/warning/primary)
 * - Required reason field for audit trail
 * - Keyboard navigation (ESC to cancel, Enter to confirm)
 * - Focus trap
 */

'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { FormLabel } from '@/components/ui/form-label';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText: string;
  confirmVariant?: 'danger' | 'warning' | 'primary';
  requireReason?: boolean;
  reasonPlaceholder?: string;
  onConfirm: (reason?: string) => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText,
  confirmVariant = 'primary',
  requireReason = false,
  reasonPlaceholder = 'Enter reason for this action...',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const reasonId = useId();
  const [reason, setReason] = useState('');
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const reasonInputRef = useRef<HTMLTextAreaElement>(null);

  // Reset reason when modal closes
  useEffect(() => {
    if (!isOpen) {
      setReason('');
    }
  }, [isOpen]);

  // Focus management
  useEffect(() => {
    if (isOpen) {
      if (requireReason) {
        reasonInputRef.current?.focus();
      } else {
        confirmButtonRef.current?.focus();
      }
    }
  }, [isOpen, requireReason]);

  const handleConfirm = useCallback(() => {
    if (requireReason && reason.trim().length < 10) {
      return; // Don't confirm if reason is required but less than 10 characters
    }

    onConfirm(requireReason ? reason.trim() : undefined);
  }, [requireReason, reason, onConfirm]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        onCancel();
      }

      if (e.key === 'Enter' && e.ctrlKey) {
        if (!requireReason || reason.trim().length >= 10) {
          handleConfirm();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, reason, requireReason, onCancel, handleConfirm]);

  const getConfirmButtonClasses = () => {
    const baseClasses =
      'px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

    switch (confirmVariant) {
      case 'danger':
        return `${baseClasses} bg-red-600 text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800`;
      case 'warning':
        return `${baseClasses} bg-amber-600 text-white hover:bg-amber-700 dark:bg-amber-700 dark:hover:bg-amber-800`;
      default:
        return `${baseClasses} bg-violet-600 text-white hover:bg-violet-700 dark:bg-violet-700 dark:hover:bg-violet-800`;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onCancel}
        aria-label="Close modal"
      ></div>

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
          </div>

          {/* Content */}
          <div className="px-6 py-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{message}</p>

            {/* Reason Field */}
            {requireReason && (
              <div className="mb-4">
                <FormLabel htmlFor={reasonId} required className="mb-2">
                  Reason
                </FormLabel>
                <textarea
                  ref={reasonInputRef}
                  id={reasonId}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={reasonPlaceholder}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  required
                />
                <div className="flex justify-between items-center mt-1">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    This reason will be logged in the audit trail
                  </p>
                  <p
                    className={`text-xs ${reason.trim().length >= 10 ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}
                  >
                    {reason.trim().length}/10 min
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900 rounded-b-xl flex justify-end gap-3">
            <button type="button" onClick={onCancel}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button type="button" ref={confirmButtonRef}
              onClick={handleConfirm}
              disabled={requireReason && reason.trim().length < 10}
              className={getConfirmButtonClasses()}
            >
              {confirmText}
            </button>
          </div>

          {/* Keyboard hint */}
          <div className="px-6 pb-3 text-xs text-gray-500 dark:text-gray-400 text-center">
            Press <kbd className="px-1 bg-gray-200 dark:bg-gray-700 rounded">ESC</kbd> to cancel
            {!requireReason || reason.trim().length >= 10 ? (
              <>
                {' or '}
                <kbd className="px-1 bg-gray-200 dark:bg-gray-700 rounded">Ctrl+Enter</kbd> to
                confirm
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
