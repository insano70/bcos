'use client';

import { useEffect, useRef, useState } from 'react';

import type { User } from '@/lib/hooks/use-users';
import { useUsers } from '@/lib/hooks/use-users';

interface MultiUserPickerProps {
  /** Field name (required for CrudModal compatibility but not used) */
  name?: string;
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
 * Combines UserPicker styling with MultiSelectField multi-select logic
 */
export default function MultiUserPicker({
  value,
  onChange,
  error,
  disabled = false,
}: MultiUserPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { data: users = [], isLoading } = useUsers();
  const selectedIds = value ?? [];

  const selectedUsers = users.filter((u) => selectedIds.includes(u.id));

  const filteredUsers = users.filter((user) => {
    const fullName = `${user.first_name} ${user.last_name}`.toLowerCase();
    const email = user.email.toLowerCase();
    const query = searchQuery.toLowerCase();
    return fullName.includes(query) || email.includes(query);
  });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  const handleToggle = (userId: string) => {
    if (selectedIds.includes(userId)) {
      onChange(selectedIds.filter((id) => id !== userId));
    } else {
      onChange([...selectedIds, userId]);
    }
  };

  const handleRemove = (userId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    onChange(selectedIds.filter((id) => id !== userId));
  };

  const handleClear = (event: React.MouseEvent) => {
    event.stopPropagation();
    onChange([]);
  };

  const getInitials = (user: User): string => {
    return `${user.first_name.charAt(0)}${user.last_name.charAt(0)}`.toUpperCase();
  };

  const getAvatarColor = (userId: string): string => {
    const colors = [
      'bg-blue-500',
      'bg-green-500',
      'bg-yellow-500',
      'bg-red-500',
      'bg-purple-500',
      'bg-pink-500',
      'bg-indigo-500',
      'bg-teal-500',
    ];
    const index = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
    return colors[index] || 'bg-gray-500';
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger Button */}
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`
          form-input w-full min-h-[42px] cursor-pointer flex items-center justify-between
          ${error ? 'border-red-500' : ''}
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <div className="flex flex-1 flex-wrap gap-1">
          {selectedUsers.length === 0 ? (
            <span className="text-gray-400 dark:text-gray-500">
              {isLoading ? 'Loading users...' : 'Select users...'}
            </span>
          ) : (
            selectedUsers.map((user) => (
              <span
                key={user.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-violet-100 dark:bg-violet-900/30 text-violet-900 dark:text-violet-100 text-sm"
              >
                <span
                  className={`w-4 h-4 rounded-full ${getAvatarColor(user.id)} flex items-center justify-center text-[10px] font-medium text-white`}
                >
                  {getInitials(user)}
                </span>
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
            ))
          )}
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
          <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-80 flex flex-col">
          {/* Search Input */}
          <div className="p-2 border-b border-gray-200 dark:border-gray-700">
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400"
                fill="none"
                viewBox="0 0 20 20"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search users..."
                className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
          </div>

          {/* User List */}
          <div className="overflow-y-auto flex-1 max-h-60">
            {isLoading ? (
              <div className="px-3 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                Loading users...
              </div>
            ) : filteredUsers.length > 0 ? (
              filteredUsers.map((user) => (
                <div
                  key={user.id}
                  onClick={() => handleToggle(user.id)}
                  className={`
                    px-3 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2
                    ${selectedIds.includes(user.id) ? 'bg-violet-50 dark:bg-violet-900/20' : ''}
                  `}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(user.id)}
                    readOnly
                    className="form-checkbox text-violet-600"
                  />
                  {/* Avatar */}
                  <div
                    className={`flex-shrink-0 w-6 h-6 rounded-full ${getAvatarColor(user.id)} flex items-center justify-center text-xs font-medium text-white`}
                  >
                    {getInitials(user)}
                  </div>
                  {/* Name and Email */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {user.first_name} {user.last_name}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {user.email}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="px-3 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                No users found
              </div>
            )}
          </div>
        </div>
      )}

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
