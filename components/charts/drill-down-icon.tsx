'use client';

/**
 * DrillDownIcon Component
 *
 * Floating magnifying glass icon that appears after a user clicks
 * a chart element. Triggers drill-down action when clicked.
 *
 * Features:
 * - Positioned near the click location
 * - 44px minimum touch target for mobile
 * - Auto-fade-in animation
 * - Accessible with keyboard support
 * - Tooltip with action label
 *
 * Single Responsibility: Render drill-down action icon
 *
 * @module components/charts/drill-down-icon
 */

import { useCallback, useEffect, useRef } from 'react';
import { Search } from 'lucide-react';
import type { DrillDownIconProps } from '@/lib/types/drill-down';

/**
 * Floating icon button for drill-down actions
 */
export function DrillDownIcon({
  isVisible,
  position: _position, // Position kept in props for API compatibility but icon uses fixed position
  label,
  onClick,
  onDismiss,
}: DrillDownIconProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Focus button when it becomes visible for keyboard accessibility
  useEffect(() => {
    if (isVisible && buttonRef.current) {
      // Small delay to allow animation to start
      const timer = setTimeout(() => {
        buttonRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isVisible]);

  // Handle escape key to dismiss
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onDismiss();
      }
    },
    [onDismiss]
  );

  // Handle click outside to dismiss
  useEffect(() => {
    if (!isVisible) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (buttonRef.current && !buttonRef.current.contains(event.target as Node)) {
        // Only dismiss if clicking outside the button
        // Give a small delay to allow button click to register first
        setTimeout(() => {
          onDismiss();
        }, 50);
      }
    };

    // Add listener after a short delay to avoid immediate dismiss
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [isVisible, onDismiss]);

  // Don't render if not visible
  if (!isVisible) {
    return null;
  }

  return (
    <div
      className="!absolute z-50 animate-fade-in top-14 right-4"
      role="presentation"
    >
      <button
        ref={buttonRef}
        type="button"
        onClick={onClick}
        onKeyDown={handleKeyDown}
        className="
          flex items-center gap-2 px-3 py-2
          bg-violet-600 hover:bg-violet-700 active:bg-violet-800
          text-white rounded-lg shadow-lg
          transition-all duration-200
          min-h-[44px] min-w-[44px]
          focus:outline-none focus:ring-2 focus:ring-violet-400 focus:ring-offset-2
          hover:shadow-xl hover:scale-105
        "
        title={label}
        aria-label={label}
      >
        <Search className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
        <span className="text-sm font-medium hidden sm:inline whitespace-nowrap">
          {label}
        </span>
      </button>
    </div>
  );
}

export default DrillDownIcon;

