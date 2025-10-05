'use client';

import { useItemSelection } from '@/components/utils/use-item-selection';
import { useTableSort } from '@/lib/hooks/use-table-sort';
import type { DataSource } from '@/lib/hooks/use-data-sources';
import DataSourcesTableItem from './data-sources-table-item';

interface DataSourcesTableProps {
  dataSources: DataSource[];
  onEdit?: ((dataSource: DataSource) => void) | undefined;
  onDelete?: ((dataSource: DataSource) => void) | undefined;
  onTest?: ((dataSource: DataSource) => void) | undefined;
}

export default function DataSourcesTable({
  dataSources,
  onEdit,
  onDelete,
  onTest,
}: DataSourcesTableProps) {
  // Add id property for useItemSelection compatibility
  const dataSourcesWithId = dataSources.map((dataSource, index) => ({
    ...dataSource,
    id: dataSource.data_source_id.toString(),
    _uniqueKey: `${dataSource.data_source_id}-${index}`,
  }));

  const { selectedItems, isAllSelected, handleCheckboxChange, handleSelectAllChange } =
    useItemSelection(dataSourcesWithId);
  const { sortedData, handleSort, getSortIcon } = useTableSort(dataSourcesWithId);

  return (
    <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl relative">
      <header className="px-5 py-4">
        <h2 className="font-semibold text-gray-800 dark:text-gray-100">
          All Data Sources{' '}
          <span className="text-gray-400 dark:text-gray-500 font-medium">
            {dataSources.filter((ds) => ds.is_active !== false).length}
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
                        checked={isAllSelected}
                        onChange={handleSelectAllChange}
                      />
                    </label>
                  </div>
                </th>
                <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('data_source_name')}
                    className="flex items-center gap-1 font-semibold text-left hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer"
                  >
                    <span>Name</span>
                    {getSortIcon('data_source_name')}
                  </button>
                </th>
                <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('table_name')}
                    className="flex items-center gap-1 font-semibold text-left hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer"
                  >
                    <span>Table</span>
                    {getSortIcon('table_name')}
                  </button>
                </th>
                <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('database_type')}
                    className="flex items-center gap-1 font-semibold text-left hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer"
                  >
                    <span>Database</span>
                    {getSortIcon('database_type')}
                  </button>
                </th>
                <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('is_active')}
                    className="flex items-center gap-1 font-semibold text-left hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer"
                  >
                    <span>Status</span>
                    {getSortIcon('is_active')}
                  </button>
                </th>
                <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('column_count')}
                    className="flex items-center gap-1 font-semibold text-left hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer"
                  >
                    <span>Columns</span>
                    {getSortIcon('column_count')}
                  </button>
                </th>
                <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('updated_at')}
                    className="flex items-center gap-1 font-semibold text-left hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer"
                  >
                    <span>Updated</span>
                    {getSortIcon('updated_at')}
                  </button>
                </th>
                <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                  <div className="sr-only">Menu</div>
                </th>
              </tr>
            </thead>
            {/* Table body */}
            <tbody className="text-sm divide-y divide-gray-100 dark:divide-gray-700/60">
              {sortedData.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center">
                    <div className="text-gray-500 dark:text-gray-400">No data sources found</div>
                  </td>
                </tr>
              ) : (
                sortedData.map((dataSource) => (
                  <DataSourcesTableItem
                    key={dataSource._uniqueKey}
                    dataSource={dataSource}
                    onCheckboxChange={handleCheckboxChange}
                    isSelected={selectedItems.includes(dataSource.id)}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onTest={onTest}
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
