'use client';

import { LayoutGrid } from 'lucide-react';
import type { DashboardRow } from '@/components/charts/dashboard-row-builder';
import DashboardRowBuilder from '@/components/charts/dashboard-row-builder';
import { EmptyState } from '@/components/ui/empty-state';
import type { ChartDefinition } from '@/lib/types/analytics';

interface RowControlsProps {
  rows: DashboardRow[];
  availableCharts: ChartDefinition[];
  onAddRow: () => void;
  onUpdateRow: (rowId: string, updates: Partial<DashboardRow>) => void;
  onDeleteRow: (rowId: string) => void;
  onMoveRowUp: (rowId: string) => void;
  onMoveRowDown: (rowId: string) => void;
}

/**
 * Row controls component - manages dashboard rows
 *
 * Displays the list of dashboard rows and provides controls to:
 * - Add new rows
 * - Render individual row builders
 * - Show empty state when no rows exist
 */
export default function RowControls({
  rows,
  availableCharts,
  onAddRow,
  onUpdateRow,
  onDeleteRow,
  onMoveRowUp,
  onMoveRowDown,
}: RowControlsProps) {
  return (
    <div className="mb-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Dashboard Layout ({rows.length} row{rows.length !== 1 ? 's' : ''})
        </h3>

        <button
          type="button"
          onClick={onAddRow}
          className="px-4 py-2 bg-violet-500 text-white rounded-md hover:bg-violet-600 transition-colors flex items-center"
        >
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Row
        </button>
      </div>

      {/* Rows List */}
      {rows.length === 0 ? (
        <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg py-8">
          <EmptyState
            icon={LayoutGrid}
            iconSize="lg"
            title="Empty Dashboard"
            description="Start building your dashboard by adding rows"
            action={
              <button
                type="button"
                onClick={onAddRow}
                className="px-4 py-2 bg-violet-500 text-white rounded-md hover:bg-violet-600 transition-colors"
              >
                Add Your First Row
              </button>
            }
          />
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map((row, index) => (
            <DashboardRowBuilder
              key={row.id}
              row={row}
              availableCharts={availableCharts}
              onUpdateRow={onUpdateRow}
              onDeleteRow={onDeleteRow}
              onMoveRowUp={onMoveRowUp}
              onMoveRowDown={onMoveRowDown}
              canMoveUp={index > 0}
              canMoveDown={index < rows.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
