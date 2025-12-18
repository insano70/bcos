'use client';

import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// Size presets based on actual usage analysis
const MODAL_SIZES = {
  sm: 'max-w-md',    // 448px - Confirmations, small forms
  md: 'max-w-lg',    // 512px - Default
  lg: 'max-w-2xl',   // 672px - Forms with more fields
  xl: 'max-w-4xl',   // 896px - Data views, tables
  full: 'max-w-6xl', // 1152px - Complex visualizations
} as const;

export type ModalSize = keyof typeof MODAL_SIZES;

export interface ModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback when the modal should close */
  onClose: () => void;
  /** Modal content */
  children: ReactNode;
  /** Size preset for the modal */
  size?: ModalSize;
  /** Title for the modal header. If provided, renders a header with close button */
  title?: string;
  /** Optional description/subtitle under the title */
  description?: string | undefined;
  /** Whether to show the close button. Defaults to true when title is provided */
  showCloseButton?: boolean;
  /** Prevent closing on backdrop click or escape key (useful for progress modals) */
  preventClose?: boolean;
  /** Additional classes for the DialogPanel */
  className?: string;
  /** Additional classes for the content area */
  contentClassName?: string;
  /** Additional classes for the modal container (for custom positioning like top-aligned search modals) */
  containerClassName?: string;
}

/**
 * Modal component - unified modal/dialog for the application.
 *
 * @example
 * // Basic modal with title
 * <Modal isOpen={open} onClose={close} title="Delete Item" size="sm">
 *   <div className="p-5">Are you sure?</div>
 * </Modal>
 *
 * @example
 * // Modal without header (blank)
 * <Modal isOpen={open} onClose={close} size="lg">
 *   <CustomContent />
 * </Modal>
 *
 * @example
 * // Large modal with description
 * <Modal isOpen={open} onClose={close} title="View Results" description="Query results" size="full">
 *   <ResultsTable />
 * </Modal>
 */
export function Modal({
  isOpen,
  onClose,
  children,
  size = 'md',
  title,
  description,
  showCloseButton,
  preventClose = false,
  className,
  contentClassName,
  containerClassName,
}: ModalProps) {
  // Default showCloseButton to true when title is provided
  const shouldShowCloseButton = showCloseButton ?? !!title;

  const handleClose = () => {
    if (!preventClose) {
      onClose();
    }
  };

  return (
    <Transition appear show={isOpen}>
      <Dialog as="div" onClose={handleClose}>
        {/* Backdrop */}
        <TransitionChild
          as="div"
          className="fixed inset-0 bg-gray-900/30 z-50 transition-opacity"
          enter="transition ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="transition ease-out duration-100"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
          aria-hidden="true"
        />

        {/* Modal container */}
        <TransitionChild
          as="div"
          className={cn(
            'fixed inset-0 z-50 overflow-hidden flex items-center my-4 justify-center px-4 sm:px-6',
            containerClassName
          )}
          enter="transition ease-in-out duration-200"
          enterFrom="opacity-0 translate-y-4"
          enterTo="opacity-100 translate-y-0"
          leave="transition ease-in-out duration-200"
          leaveFrom="opacity-100 translate-y-0"
          leaveTo="opacity-0 translate-y-4"
        >
          <DialogPanel
            className={cn(
              'bg-white dark:bg-gray-800 rounded-lg shadow-xl overflow-hidden w-full max-h-full',
              MODAL_SIZES[size],
              className
            )}
          >
            {/* Header (optional) */}
            {title && (
              <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700/60">
                <div className="flex justify-between items-center">
                  <div>
                    <DialogTitle className="font-semibold text-gray-800 dark:text-gray-100">
                      {title}
                    </DialogTitle>
                    {description && (
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        {description}
                      </p>
                    )}
                  </div>
                  {shouldShowCloseButton && (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Close"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleClose();
                      }}
                      className="p-0 shrink-0"
                    >
                      <svg className="fill-current" width="16" height="16" viewBox="0 0 16 16">
                        <path d="M7.95 6.536l4.242-4.243a1 1 0 111.415 1.414L9.364 7.95l4.243 4.242a1 1 0 11-1.415 1.415L7.95 9.364l-4.243 4.243a1 1 0 01-1.414-1.415L6.536 7.95 2.293 3.707a1 1 0 011.414-1.414L7.95 6.536z" />
                      </svg>
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Close button for headerless modals */}
            {!title && shouldShowCloseButton && (
              <div className="absolute top-4 right-4 z-10">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Close"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClose();
                  }}
                  className="p-0"
                >
                  <svg className="fill-current" width="16" height="16" viewBox="0 0 16 16">
                    <path d="M7.95 6.536l4.242-4.243a1 1 0 111.415 1.414L9.364 7.95l4.243 4.242a1 1 0 11-1.415 1.415L7.95 9.364l-4.243 4.243a1 1 0 01-1.414-1.415L6.536 7.95 2.293 3.707a1 1 0 011.414-1.414L7.95 6.536z" />
                  </svg>
                </Button>
              </div>
            )}

            {/* Content */}
            <div className={cn('overflow-auto', contentClassName)}>
              {children}
            </div>
          </DialogPanel>
        </TransitionChild>
      </Dialog>
    </Transition>
  );
}

// Export size constant for external use
export { MODAL_SIZES };
