'use client';

import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
  Transition,
} from '@headlessui/react';
import { useState } from 'react';
import type { User } from '@/lib/hooks/use-users';
import { Avatar } from '@/components/ui/avatar';

interface UserPickerProps {
  users: User[];
  value: string | undefined;
  onChange: (userId: string | undefined) => void;
  disabled?: boolean | undefined;
  error?: string | undefined;
  placeholder?: string | undefined;
  allowClear?: boolean | undefined;
  required?: boolean | undefined;
}

/**
 * Enhanced user picker with search and avatar display
 */
export default function UserPicker({
  users,
  value,
  onChange,
  disabled = false,
  error,
  placeholder = 'Select a user',
  allowClear = true,
  required = false,
}: UserPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const selectedUser = users.find((u) => u.id === value);

  // Filter users based on search query
  const filteredUsers = users.filter((user) => {
    const fullName = `${user.first_name} ${user.last_name}`.toLowerCase();
    const email = user.email.toLowerCase();
    const query = searchQuery.toLowerCase();
    return fullName.includes(query) || email.includes(query);
  });

  const handleChange = (userId: string | null | undefined) => {
    onChange(userId ?? undefined);
    setSearchQuery('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onChange(undefined);
    setSearchQuery('');
  };

  return (
    <div className="relative">
      <Combobox value={value} onChange={handleChange} disabled={disabled}>
        {({ open }) => (
          <>
            {/* Trigger */}
            <div
              className={`
                relative w-full border rounded-lg flex items-center
                ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
                ${error ? 'border-red-500 dark:border-red-500' : 'border-gray-300 dark:border-gray-600'}
                ${open ? 'ring-2 ring-blue-500 border-blue-500' : ''}
                bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100
              `}
            >
              {/* Selected user avatar (when not open) */}
              {selectedUser && !open && (
                <div className="pl-3">
                  <Avatar
                    size="sm"
                    firstName={selectedUser.first_name}
                    lastName={selectedUser.last_name}
                    userId={selectedUser.id}
                  />
                </div>
              )}

              <ComboboxInput
                className={`
                  w-full px-3 py-2 bg-transparent border-none focus:outline-none focus:ring-0
                  text-gray-800 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400
                  ${selectedUser && !open ? 'pl-2' : ''}
                `}
                placeholder={
                  open
                    ? 'Search users...'
                    : selectedUser
                      ? `${selectedUser.first_name} ${selectedUser.last_name}`
                      : `${placeholder}${required ? ' *' : ''}`
                }
                displayValue={() => (open ? searchQuery : '')}
                onChange={(e) => setSearchQuery(e.target.value)}
              />

              {/* Clear button */}
              {allowClear && selectedUser && !disabled && !open && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded mr-1"
                  aria-label="Clear selection"
                >
                  <svg
                    className="w-3 h-3 text-gray-500 dark:text-gray-400"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              )}

              <ComboboxButton className="pr-3">
                <svg
                  className={`w-4 h-4 text-gray-500 dark:text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 20 20"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </ComboboxButton>
            </div>

            {/* Dropdown */}
            <Transition
              show={open}
              enter="transition ease-out duration-100 transform"
              enterFrom="opacity-0 -translate-y-2"
              enterTo="opacity-100 translate-y-0"
              leave="transition ease-out duration-100"
              leaveFrom="opacity-100"
              leaveTo="opacity-0"
            >
              <ComboboxOptions
                static
                className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-80 overflow-auto focus:outline-none"
              >
                {/* Unassigned Option */}
                {allowClear && (
                  <ComboboxOption
                    value={undefined}
                    className={({ focus }) => `
                      px-3 py-2 cursor-pointer flex items-center gap-2
                      ${focus ? 'bg-gray-100 dark:bg-gray-700' : ''}
                      ${value === undefined ? 'bg-blue-50 dark:bg-blue-900/20' : ''}
                    `}
                  >
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center">
                      <svg
                        className="w-4 h-4 text-gray-600 dark:text-gray-300"
                        fill="none"
                        viewBox="0 0 20 20"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </div>
                    <span className="text-gray-600 dark:text-gray-400 text-sm">Unassigned</span>
                  </ComboboxOption>
                )}

                {/* Users */}
                {filteredUsers.length > 0 ? (
                  filteredUsers.map((user) => (
                    <ComboboxOption
                      key={user.id}
                      value={user.id}
                      className={({ focus }) => `
                        px-3 py-2 cursor-pointer flex items-center gap-2
                        ${focus ? 'bg-gray-100 dark:bg-gray-700' : ''}
                        ${value === user.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''}
                      `}
                    >
                      {/* Avatar */}
                      <Avatar
                        size="sm"
                        firstName={user.first_name}
                        lastName={user.last_name}
                        userId={user.id}
                      />
                      {/* Name and Email */}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {user.first_name} {user.last_name}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {user.email}
                        </div>
                      </div>
                      {/* Selected Checkmark */}
                      {value === user.id && (
                        <svg
                          className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                    </ComboboxOption>
                  ))
                ) : (
                  <div className="px-3 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                    No users found
                  </div>
                )}
              </ComboboxOptions>
            </Transition>
          </>
        )}
      </Combobox>

      {/* Error Message */}
      {error && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
