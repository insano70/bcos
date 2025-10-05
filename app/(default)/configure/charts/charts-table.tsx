'use client';

import { useItemSelection } from '@/components/utils/use-item-selection';
import { useTableSort } from '@/lib/hooks/use-table-sort';
import ChartsTableItem from './charts-table-item';

export interface ChartDefinitionListItem {
  id: string;
  chart_definition_id: string;
  chart_name: string;
  chart_description?: string | undefined;
  chart_type: 'line' | 'bar' | 'pie' | 'doughnut' | 'area';
  chart_category_id?: number | undefined;
  category_name?: string | undefined;
  created_by: string;
  creator_name?: string | undefined;
  creator_last_name?: string | undefined;
  created_at: string;
  updated_at: string;
  is_active: boolean;
}

interface ChartsTableProps {
  charts: ChartDefinitionListItem[];
  onEdit?: (chart: ChartDefinitionListItem) => void;
  onDelete?: (chart: ChartDefinitionListItem) => void;
}

export default function ChartsTable({ charts, onEdit, onDelete }: ChartsTableProps) {
  // Map charts to have 'id' property for useItemSelection
  const chartsWithId = charts.map((chart) => ({ ...chart, id: chart.chart_definition_id }));

  const { selectedItems, isAllSelected, handleCheckboxChange, handleSelectAllChange } =
    useItemSelection(chartsWithId);
  const { sortedData, handleSort, getSortIcon } = useTableSort(chartsWithId);

  return (
    <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl relative">
      <header className="px-5 py-4">
        <h2 className="font-semibold text-gray-800 dark:text-gray-100">
          All Charts{' '}
          <span className="text-gray-400 dark:text-gray-500 font-medium">
            {charts.filter((chart) => chart.is_active !== false).length}
          </span>
        </h2>
      </header>
      <div>
        {/* Table */}
        <div className="overflow-x-auto">
          <table className="table-auto w-full dark:text-gray-300">
            {/* Table header */}
            <thead className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20 border-t border-b border-gray-100 dark:border-gray-700/60">
              <tr>
                <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap w-px">
                  <div className="flex items-center">
                    <label className="inline-flex">
                      <span className="sr-only">Select all</span>
                      <input
                        className="form-checkbox"
                        type="checkbox"
                        onChange={handleSelectAllChange}
                        checked={isAllSelected}
                      />
                    </label>
                  </div>
                </th>
                <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('chart_name')}
                    className="flex items-center gap-1 font-semibold text-left hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer"
                  >
                    <span>Chart Name</span>
                    {getSortIcon('chart_name')}
                  </button>
                </th>
                <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('chart_type')}
                    className="flex items-center gap-1 font-semibold text-left hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer"
                  >
                    <span>Type</span>
                    {getSortIcon('chart_type')}
                  </button>
                </th>
                <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('chart_description')}
                    className="flex items-center gap-1 font-semibold text-left hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer"
                  >
                    <span>Description</span>
                    {getSortIcon('chart_description')}
                  </button>
                </th>
                <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('category_name')}
                    className="flex items-center gap-1 font-semibold text-left hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer"
                  >
                    <span>Category</span>
                    {getSortIcon('category_name')}
                  </button>
                </th>
                <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('is_active')}
                    className="flex items-center justify-center gap-1 font-semibold hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer w-full"
                  >
                    <span>Status</span>
                    {getSortIcon('is_active')}
                  </button>
                </th>
                <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('creator_name')}
                    className="flex items-center gap-1 font-semibold text-left hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer"
                  >
                    <span>Created By</span>
                    {getSortIcon('creator_name')}
                  </button>
                </th>
                <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('created_at')}
                    className="flex items-center gap-1 font-semibold text-left hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer"
                  >
                    <span>Created</span>
                    {getSortIcon('created_at')}
                  </button>
                </th>
                <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                  <span className="sr-only">Menu</span>
                </th>
              </tr>
            </thead>
            {/* Table body */}
            <tbody className="text-sm divide-y divide-gray-100 dark:divide-gray-700/60">
              {sortedData.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-2 first:pl-5 last:pr-5 py-12 text-center">
                    <div className="text-gray-500 dark:text-gray-400">📊 No charts found</div>
                    <p className="text-gray-600 dark:text-gray-400 text-sm mt-2">
                      Create your first chart to get started
                    </p>
                  </td>
                </tr>
              ) : (
                sortedData.map((chart) => (
                  <ChartsTableItem
                    key={chart.chart_definition_id}
                    chart={chart}
                    onCheckboxChange={handleCheckboxChange}
                    isSelected={selectedItems.includes(chart.chart_definition_id)}
                    {...(onEdit && { onEdit })}
                    {...(onDelete && { onDelete })}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
