'use client';

import { Spinner } from '@/components/ui/spinner';

interface DashboardActionsProps {
  isSaving: boolean;
  isEditMode: boolean;
  isDisabled: boolean;
  onSave: () => void;
  onPreview: () => void;
}

/**
 * Dashboard action buttons (preview, save)
 *
 * Displays the action buttons at the bottom of the dashboard builder:
 * - Preview button (left) - Opens preview modal
 * - Save/Update button (right) - Saves the dashboard
 *
 * Both buttons are disabled when the dashboard is invalid (no name or no rows).
 */
export default function DashboardActions({
  isSaving,
  isEditMode,
  isDisabled,
  onSave,
  onPreview,
}: DashboardActionsProps) {
  return (
    <div className="flex justify-between">
      <button
        type="button"
        onClick={onPreview}
        disabled={isDisabled}
        className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
      >
        <span className="mr-2">👁️</span>
        Preview Dashboard
      </button>

      <button
        type="button"
        onClick={onSave}
        disabled={isSaving || isDisabled}
        className="px-6 py-2 bg-violet-500 text-white rounded-md hover:bg-violet-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
      >
        {isSaving ? (
          <>
            <Spinner size="sm" className="mr-2" trackClassName="border-white/30" indicatorClassName="border-white" />
            Saving Dashboard...
          </>
        ) : (
          <>
            <span className="mr-2">💾</span>
            {isEditMode ? 'Update Dashboard' : 'Save Dashboard'}
          </>
        )}
      </button>
    </div>
  );
}
