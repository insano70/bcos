'use client';

import { useItemSelection } from '@/components/utils/use-item-selection';
import { useTableSort } from '@/lib/hooks/use-table-sort';
import UsersTableItem from './users-table-item';

export interface User {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  email_verified: boolean | null;
  is_active: boolean | null;
  created_at: string;
  deleted_at: string | null;
}

export default function UsersTable({
  users,
  onEdit,
}: {
  users: User[];
  onEdit?: (user: User) => void;
}) {
  const { selectedItems, isAllSelected, handleCheckboxChange, handleSelectAllChange } =
    useItemSelection(users);
  const { sortedData, handleSort, getSortIcon } = useTableSort(users);

  return (
    <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl relative">
      <header className="px-5 py-4">
        <h2 className="font-semibold text-gray-800 dark:text-gray-100">
          All Users{' '}
          <span className="text-gray-400 dark:text-gray-500 font-medium">
            {users.filter((user) => user.is_active !== false).length}
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
                    onClick={() => handleSort('first_name')}
                    className="flex items-center gap-1 font-semibold text-left hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer"
                  >
                    <span>Name</span>
                    {getSortIcon('first_name')}
                  </button>
                </th>
                <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('email')}
                    className="flex items-center gap-1 font-semibold text-left hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer"
                  >
                    <span>Email</span>
                    {getSortIcon('email')}
                  </button>
                </th>
                <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('email_verified')}
                    className="flex items-center justify-center gap-1 font-semibold hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer w-full"
                  >
                    <span>Verified</span>
                    {getSortIcon('email_verified')}
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
              {sortedData.map((user) => (
                <UsersTableItem
                  key={user.id}
                  user={user}
                  onCheckboxChange={handleCheckboxChange}
                  isSelected={selectedItems.includes(user.id)}
                  {...(onEdit && { onEdit })}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
