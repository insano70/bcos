'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';

interface DataTableDropdownAction<T> {
  label: string | ((item: T) => string);
  icon?: ReactNode;
  onClick: (item: T) => void | Promise<void>;
  variant?: 'default' | 'danger';
  confirm?: string | ((item: T) => string);
  show?: (item: T) => boolean;
}

interface DataTableDropdownProps<T> {
  item: T;
  actions: DataTableDropdownAction<T>[];
}

export default function DataTableDropdown<T>({ item, actions }: DataTableDropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleAction = async (action: DataTableDropdownAction<T>) => {
    const confirmMessage =
      typeof action.confirm === 'function' ? action.confirm(item) : action.confirm;

    if (confirmMessage && !confirm(confirmMessage)) {
      return;
    }

    setIsProcessing(true);
    try {
      await action.onClick(item);
      setIsOpen(false);
    } catch (error) {
      console.error('Action failed:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  // Filter visible actions
  const visibleActions = actions.filter((action) => action.show === undefined || action.show(item));

  if (visibleActions.length === 0) {
    return null;
  }

  return (
    <div className="relative inline-flex" ref={dropdownRef}>
      {/* Menu button */}
      <button
        type="button"
        className="text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400 rounded-full"
        aria-haspopup="true"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        disabled={isProcessing}
      >
        <span className="sr-only">Menu</span>
        <svg className="w-8 h-8 fill-current" viewBox="0 0 32 32">
          <circle cx="16" cy="16" r="2" />
          <circle cx="10" cy="16" r="2" />
          <circle cx="22" cy="16" r="2" />
        </svg>
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div
          className="origin-top-right z-50 fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 py-1.5 rounded-lg shadow-lg overflow-hidden min-w-44"
          style={{
            top: dropdownRef.current ? dropdownRef.current.getBoundingClientRect().bottom + 4 : 0,
            left: dropdownRef.current ? dropdownRef.current.getBoundingClientRect().right - 176 : 0,
          }}
        >
          <ul>
            {visibleActions.map((action, index) => {
              const label = typeof action.label === 'function' ? action.label(item) : action.label;
              const isDanger = action.variant === 'danger';
              const key = `${label}-${action.variant || 'default'}-${index}`;

              return (
                <li key={key}>
                  <button
                    type="button"
                    className={`font-medium text-sm flex items-center py-1 px-3 w-full text-left disabled:opacity-50 ${
                      isDanger
                        ? 'text-red-500 hover:text-red-600'
                        : 'text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-200'
                    }`}
                    onClick={() => handleAction(action)}
                    disabled={isProcessing}
                  >
                    {action.icon && (
                      <span
                        className={`shrink-0 mr-2 ${isDanger ? 'text-red-400' : 'text-gray-400 dark:text-gray-500'}`}
                      >
                        {action.icon}
                      </span>
                    )}
                    <span>{label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
