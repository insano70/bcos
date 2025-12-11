'use client';

/**
 * Fullscreen Loading Modal
 *
 * Displays a fullscreen loading state during cross-dashboard navigation.
 * This prevents the jarring flash of the non-fullscreen dashboard view
 * when transitioning between dashboards while in fullscreen mode.
 *
 * The modal maintains the same visual structure as other fullscreen modals
 * so the transition feels seamless.
 */

import { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useChartFullscreen } from '@/hooks/useChartFullscreen';
import FullscreenModalFooter from './fullscreen-modal-footer';

interface FullscreenLoadingModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Dashboard name to display in footer */
  dashboardName?: string | undefined;
  /** Navigate to next dashboard */
  onNextDashboard?: (() => void) | undefined;
  /** Navigate to previous dashboard */
  onPreviousDashboard?: (() => void) | undefined;
  /** Can navigate to next dashboard */
  canGoNextDashboard?: boolean | undefined;
  /** Can navigate to previous dashboard */
  canGoPreviousDashboard?: boolean | undefined;
}

export default function FullscreenLoadingModal({
  isOpen,
  onClose,
  dashboardName,
  onNextDashboard,
  onPreviousDashboard,
  canGoNextDashboard,
  canGoPreviousDashboard,
}: FullscreenLoadingModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Use shared hook for modal lifecycle (mounting, scroll lock, escape key)
  const { mounted } = useChartFullscreen(isOpen, onClose);

  // Handle clicks outside modal
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen || !mounted) {
    return null;
  }

  const modalContent = (
    <div
      ref={modalRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 sm:p-4"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="relative bg-white dark:bg-gray-900 rounded-lg w-full h-full sm:h-[90vh] sm:max-w-6xl flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex-shrink-0">
          <h2 id={titleId} className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
            Loading...
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
            aria-label="Close fullscreen view"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content - Loading spinner */}
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-600" />
            <span className="text-gray-600 dark:text-gray-400 text-lg">Loading dashboard...</span>
          </div>
        </div>

        {/* Footer with navigation - maintains context during loading */}
        <FullscreenModalFooter
          onClose={onClose}
          dashboardName={dashboardName}
          onNextDashboard={onNextDashboard}
          onPreviousDashboard={onPreviousDashboard}
          canGoNextDashboard={canGoNextDashboard}
          canGoPreviousDashboard={canGoPreviousDashboard}
        />
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
