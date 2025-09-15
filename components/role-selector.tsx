'use client';

import { useState, useEffect, useRef } from 'react';
// Inline SVG icons
import { useRoles, type Role } from '@/lib/hooks/use-roles';

interface RoleSelectorProps {
  selectedRoleIds: string[];
  onChange: (roleIds: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: string | undefined;
  required?: boolean;
}

export default function RoleSelector({
  selectedRoleIds,
  onChange,
  placeholder = 'Select roles...',
  disabled = false,
  error,
  required = false
}: RoleSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: roles, isLoading, error: rolesError } = useRoles();

  // Filter roles based on search term
  const filteredRoles = roles?.filter(role =>
    role.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    role.description?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  // Get selected roles for display
  const selectedRoles = roles?.filter(role => selectedRoleIds.includes(role.id)) || [];

  // Handle clicking outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle role selection
  const handleRoleToggle = (roleId: string) => {
    const newSelectedRoleIds = selectedRoleIds.includes(roleId)
      ? selectedRoleIds.filter(id => id !== roleId)
      : [...selectedRoleIds, roleId];

    onChange(newSelectedRoleIds);
  };

  // Handle removing a role
  const handleRemoveRole = (roleId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    const newSelectedRoleIds = selectedRoleIds.filter(id => id !== roleId);
    onChange(newSelectedRoleIds);
  };

  // Handle clearing all selections
  const handleClearAll = () => {
    onChange([]);
    setSearchTerm('');
  };

  // Handle keyboard navigation
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      setIsOpen(false);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setIsOpen(!isOpen);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Label */}
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        Roles {required && <span className="text-red-500">*</span>}
      </label>

      {/* Selected roles display */}
      <div
        className={`relative w-full min-h-[42px] px-3 py-2 border rounded-md shadow-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
          error
            ? 'border-red-300 focus:ring-red-500 focus:border-red-500 dark:border-red-600'
            : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500 dark:border-gray-600'
        } ${disabled ? 'bg-gray-100 dark:bg-gray-700 cursor-not-allowed' : 'bg-white dark:bg-gray-700'} text-gray-900 dark:text-gray-100`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        tabIndex={disabled ? -1 : 0}
        role="button"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        {/* Selected roles tags */}
        <div className="flex flex-wrap gap-1">
          {selectedRoles.map(role => (
            <span
              key={role.id}
              className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
            >
              {role.name}
              {!disabled && (
                <button
                  type="button"
                  onClick={(e) => handleRemoveRole(role.id, e)}
                  className="ml-1 inline-flex items-center p-0.5 rounded-full text-blue-400 hover:bg-blue-200 hover:text-blue-500 focus:outline-none"
                  aria-label={`Remove ${role.name}`}
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
                </button>
              )}
            </span>
          ))}

          {/* Placeholder or search input */}
          {selectedRoles.length === 0 ? (
            <span className="text-gray-500 dark:text-gray-400">
              {placeholder}
            </span>
          ) : (
            <input
              ref={inputRef}
              type="text"
              className="flex-1 min-w-0 border-0 p-0 bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-0 focus:outline-none"
              placeholder="Search roles..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onFocus={() => setIsOpen(true)}
              disabled={disabled}
            />
          )}
        </div>

        {/* Dropdown arrow and clear button */}
        <div className="absolute inset-y-0 right-0 flex items-center pr-2">
          {selectedRoleIds.length > 0 && !disabled && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleClearAll();
              }}
              className="p-1 text-gray-400 hover:text-gray-600 focus:outline-none"
              aria-label="Clear all roles"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            </button>
          )}
          <svg
            className={`h-5 w-5 text-gray-400 transition-transform ${
              isOpen ? 'transform rotate-180' : ''
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-800 shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none">
          {isLoading ? (
            <div className="px-3 py-2 text-gray-500 dark:text-gray-400">
              Loading roles...
            </div>
          ) : rolesError ? (
            <div className="px-3 py-2 text-red-500 dark:text-red-400">
              Error loading roles
            </div>
          ) : filteredRoles.length === 0 ? (
            <div className="px-3 py-2 text-gray-500 dark:text-gray-400">
              {searchTerm ? 'No roles found' : 'No roles available'}
            </div>
          ) : (
            filteredRoles.map(role => {
              const isSelected = selectedRoleIds.includes(role.id);
              return (
                <div
                  key={role.id}
                  className={`cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-gray-100 dark:hover:bg-gray-700 ${
                    isSelected ? 'bg-blue-50 dark:bg-blue-900' : ''
                  }`}
                  onClick={() => handleRoleToggle(role.id)}
                >
                  <div className="flex items-center">
                    <span className={`block truncate ${isSelected ? 'font-semibold' : 'font-normal'}`}>
                      {role.name}
                    </span>
                    {role.is_system_role && (
                      <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200">
                        System
                      </span>
                    )}
                  </div>
                  {role.description && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                      {role.description}
                    </p>
                  )}
                  {isSelected && (
                    <span className="absolute inset-y-0 right-0 flex items-center pr-4">
                      <svg className="h-5 w-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Helper text */}
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        Select one or more roles for this user
      </p>
    </div>
  );
}
