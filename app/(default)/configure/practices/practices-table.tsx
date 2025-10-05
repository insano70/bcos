'use client';

import { useItemSelection } from '@/components/utils/use-item-selection';
import { useTableSort } from '@/lib/hooks/use-table-sort';
import PracticesTableItem from './practices-table-item';

export interface Practice {
  id: string;
  name: string;
  domain: string;
  status: string;
  template_id: string;
  template_name: string;
  owner_email: string;
  created_at: string;
}

export default function PracticesTable({ practices }: { practices: Practice[] }) {
  const { selectedItems, isAllSelected, handleCheckboxChange, handleSelectAllChange } =
    useItemSelection(practices);
  const { sortedData, handleSort, getSortIcon } = useTableSort(practices);

  return (
    <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl relative">
      <header className="px-5 py-4">
        <h2 className="font-semibold text-gray-800 dark:text-gray-100">
          All Practices{' '}
          <span className="text-gray-400 dark:text-gray-500 font-medium">{practices.length}</span>
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
                    onClick={() => handleSort('name')}
                    className="flex items-center gap-1 font-semibold text-left hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer"
                  >
                    <span>Practice Name</span>
                    {getSortIcon('name')}
                  </button>
                </th>
                <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('domain')}
                    className="flex items-center gap-1 font-semibold text-left hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer"
                  >
                    <span>Domain</span>
                    {getSortIcon('domain')}
                  </button>
                </th>
                <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('template_name')}
                    className="flex items-center gap-1 font-semibold text-left hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer"
                  >
                    <span>Template</span>
                    {getSortIcon('template_name')}
                  </button>
                </th>
                <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('status')}
                    className="flex items-center justify-center gap-1 font-semibold hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer w-full"
                  >
                    <span>Status</span>
                    {getSortIcon('status')}
                  </button>
                </th>
                <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('owner_email')}
                    className="flex items-center gap-1 font-semibold text-left hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer"
                  >
                    <span>Owner</span>
                    {getSortIcon('owner_email')}
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
              {sortedData.map((practice) => (
                <PracticesTableItem
                  key={practice.id}
                  practice={practice}
                  onCheckboxChange={handleCheckboxChange}
                  isSelected={selectedItems.includes(practice.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
