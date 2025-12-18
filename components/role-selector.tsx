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
import { Badge } from '@/components/ui/badge';
import { FormLabel } from '@/components/ui/form-label';
import { useRoles } from '@/lib/hooks/use-roles';

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
  required = false,
}: RoleSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const { data: roles, isLoading, error: rolesError } = useRoles();

  // Filter roles based on search term
  const filteredRoles =
    roles?.filter(
      (role) =>
        role.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        role.description?.toLowerCase().includes(searchTerm.toLowerCase())
    ) || [];

  // Get selected roles for display
  const selectedRoles = roles?.filter((role) => selectedRoleIds.includes(role.id)) || [];

  // Handle role selection (toggle)
  const handleRoleChange = (roleIds: string[]) => {
    onChange(roleIds);
  };

  // Handle removing a role
  const handleRemoveRole = (roleId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    const newSelectedRoleIds = selectedRoleIds.filter((id) => id !== roleId);
    onChange(newSelectedRoleIds);
  };

  // Handle clearing all selections
  const handleClearAll = (event: React.MouseEvent) => {
    event.stopPropagation();
    onChange([]);
    setSearchTerm('');
  };

  return (
    <div className="relative">
      {/* Label */}
      <FormLabel required={required} className="mb-1">
        Roles
      </FormLabel>

      <Combobox
        value={selectedRoleIds}
        onChange={handleRoleChange}
        disabled={disabled}
        multiple
      >
        {({ open }) => (
          <>
            {/* Selected roles display */}
            <div
              className={`relative w-full min-h-[42px] border rounded-md shadow-sm ${
                error
                  ? 'border-red-300 focus-within:ring-red-500 focus-within:border-red-500 dark:border-red-600'
                  : 'border-gray-300 focus-within:ring-blue-500 focus-within:border-blue-500 dark:border-gray-600'
              } ${disabled ? 'bg-gray-100 dark:bg-gray-700 cursor-not-allowed' : 'bg-white dark:bg-gray-700'} text-gray-900 dark:text-gray-100 focus-within:ring-2`}
            >
              {/* Selected roles tags */}
              <div className="flex flex-wrap gap-1 px-3 py-2 pr-16">
                {selectedRoles.map((role) => (
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
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    )}
                  </span>
                ))}

                {/* Search input */}
                <ComboboxInput
                  className="flex-1 min-w-[120px] border-0 p-0 bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-0 focus:outline-none disabled:cursor-not-allowed"
                  placeholder={selectedRoles.length === 0 ? placeholder : 'Search roles...'}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  displayValue={() => searchTerm}
                />
              </div>

              {/* Dropdown arrow and clear button */}
              <div className="absolute inset-y-0 right-0 flex items-center pr-2">
                {selectedRoleIds.length > 0 && !disabled && (
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="p-1 text-gray-400 hover:text-gray-600 focus:outline-none"
                    aria-label="Clear all roles"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                )}
                <ComboboxButton className="p-1">
                  <svg
                    className={`h-5 w-5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </ComboboxButton>
              </div>
            </div>

            {/* Error message */}
            {error && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>}

            {/* Dropdown menu */}
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
                className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-800 shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none"
              >
                {isLoading ? (
                  <div className="px-3 py-2 text-gray-500 dark:text-gray-400">Loading roles...</div>
                ) : rolesError ? (
                  <div className="px-3 py-2 text-red-500 dark:text-red-400">Error loading roles</div>
                ) : filteredRoles.length === 0 ? (
                  <div className="px-3 py-2 text-gray-500 dark:text-gray-400">
                    {searchTerm ? 'No roles found' : 'No roles available'}
                  </div>
                ) : (
                  filteredRoles.map((role) => {
                    const isSelected = selectedRoleIds.includes(role.id);
                    return (
                      <ComboboxOption
                        key={role.id}
                        value={role.id}
                        className={({ focus }) =>
                          `cursor-pointer select-none relative py-2 pl-3 pr-9 ${
                            focus ? 'bg-gray-100 dark:bg-gray-700' : ''
                          } ${isSelected ? 'bg-blue-50 dark:bg-blue-900' : ''}`
                        }
                      >
                        <div className="flex items-center">
                          <span className={`block truncate ${isSelected ? 'font-semibold' : 'font-normal'}`}>
                            {role.name}
                          </span>
                          {role.is_system_role && (
                            <Badge color="gray" size="sm" shape="rounded" className="ml-2">
                              System
                            </Badge>
                          )}
                        </div>
                        {role.description && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                            {role.description}
                          </p>
                        )}
                        {isSelected && (
                          <span className="absolute inset-y-0 right-0 flex items-center pr-4">
                            <svg
                              className="h-5 w-5 text-blue-600 dark:text-blue-400"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          </span>
                        )}
                      </ComboboxOption>
                    );
                  })
                )}
              </ComboboxOptions>
            </Transition>
          </>
        )}
      </Combobox>

      {/* Helper text */}
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        Select one or more roles for this user
      </p>
    </div>
  );
}
