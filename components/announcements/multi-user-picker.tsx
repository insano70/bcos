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

import { useUsers } from '@/lib/hooks/use-users';
import { Avatar } from '@/components/ui/avatar';

interface MultiUserPickerProps {
  /** Selected user IDs */
  value?: string[] | undefined;
  /** Change handler */
  onChange: (value: unknown) => void;
  /** Error message */
  error?: string | undefined;
  /** Whether field is disabled */
  disabled?: boolean | undefined;
}

/**
 * Multi-User Picker Component
 * Custom field for CrudModal to select multiple users as recipients
 * Uses Headless UI Combobox with multi-select for accessibility and keyboard navigation
 */
export default function MultiUserPicker({
  value,
  onChange,
  error,
  disabled = false,
}: MultiUserPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const { data: users = [], isLoading } = useUsers();
  const selectedIds = value ?? [];

  const selectedUsers = users.filter((u) => selectedIds.includes(u.id));

  const filteredUsers = users.filter((user) => {
    const fullName = `${user.first_name} ${user.last_name}`.toLowerCase();
    const email = user.email.toLowerCase();
    const query = searchQuery.toLowerCase();
    return fullName.includes(query) || email.includes(query);
  });

  const handleChange = (newValue: string[]) => {
    onChange(newValue);
  };

  const handleRemove = (userId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    onChange(selectedIds.filter((id) => id !== userId));
  };

  const handleClear = (event: React.MouseEvent) => {
    event.stopPropagation();
    onChange([]);
    setSearchQuery('');
  };

  return (
    <div className="relative">
      <Combobox value={selectedIds} onChange={handleChange} disabled={disabled} multiple>
        {({ open }) => (
          <>
            {/* Trigger */}
            <div
              className={`
                form-input w-full min-h-[42px] flex items-center justify-between
                ${error ? 'border-red-500' : ''}
                ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
                ${open ? 'ring-2 ring-violet-500 border-violet-500' : ''}
              `}
            >
              <div className="flex flex-1 flex-wrap gap-1 pr-2">
                {selectedUsers.map((user) => (
                  <span
                    key={user.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-violet-100 dark:bg-violet-900/30 text-violet-900 dark:text-violet-100 text-sm"
                  >
                    <Avatar
                      size="xs"
                      firstName={user.first_name}
                      lastName={user.last_name}
                      userId={user.id}
                    />
                    {user.first_name} {user.last_name}
                    {!disabled && (
                      <button
                        type="button"
                        onClick={(e) => handleRemove(user.id, e)}
                        className="hover:text-red-500 ml-1"
                      >
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fillRule="evenodd"
                            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </button>
                    )}
                  </span>
                ))}

                <ComboboxInput
                  className="flex-1 min-w-[120px] border-0 p-0 bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-0 focus:outline-none disabled:cursor-not-allowed text-sm"
                  placeholder={
                    selectedUsers.length === 0
                      ? isLoading
                        ? 'Loading users...'
                        : 'Select users...'
                      : 'Search users...'
                  }
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  displayValue={() => searchQuery}
                />
              </div>

              <div className="flex items-center gap-2 ml-2">
                {selectedUsers.length > 0 && !disabled && (
                  <button type="button" onClick={handleClear} className="hover:text-red-500">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                )}
                <ComboboxButton>
                  <svg
                    className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </ComboboxButton>
              </div>
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
                className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-60 overflow-auto focus:outline-none"
              >
                {isLoading ? (
                  <div className="px-3 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                    Loading users...
                  </div>
                ) : filteredUsers.length > 0 ? (
                  filteredUsers.map((user) => {
                    const isSelected = selectedIds.includes(user.id);

                    return (
                      <ComboboxOption
                        key={user.id}
                        value={user.id}
                        className={({ focus }) => `
                          px-3 py-2 cursor-pointer flex items-center gap-2
                          ${focus ? 'bg-violet-100 dark:bg-violet-900/40' : ''}
                          ${isSelected && !focus ? 'bg-violet-50 dark:bg-violet-900/20' : ''}
                        `}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          readOnly
                          tabIndex={-1}
                          className="form-checkbox text-violet-600"
                        />
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
                      </ComboboxOption>
                    );
                  })
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

      {/* Selection Count */}
      {selectedUsers.length > 0 && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {selectedUsers.length} user{selectedUsers.length !== 1 ? 's' : ''} selected
        </p>
      )}
    </div>
  );
}
