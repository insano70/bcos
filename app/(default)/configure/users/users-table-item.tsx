import { useState, useEffect, useRef } from 'react';
import type { User } from './users-table';

interface UsersTableItemProps {
  user: User;
  onCheckboxChange: (id: string, checked: boolean) => void;
  isSelected: boolean;
}

export default function UsersTableItem({
  user,
  onCheckboxChange,
  isSelected,
}: UsersTableItemProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onCheckboxChange(user.id, e.target.checked);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleEdit = () => {
    // TODO: Implement edit functionality
    console.log('Edit user:', user.id);
    setDropdownOpen(false);
  };

  const handleInactivate = () => {
    // TODO: Implement inactivate functionality
    console.log('Inactivate user:', user.id);
    setDropdownOpen(false);
  };

  const handleDelete = () => {
    // TODO: Implement delete functionality
    console.log('Delete user:', user.id);
    setDropdownOpen(false);
  };

  const formatDate = (date: string | Date | null) => {
    if (!date) return '-';
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <tr>
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap w-px">
        <div className="flex items-center">
          <label className="inline-flex">
            <span className="sr-only">Select</span>
            <input
              className="form-checkbox"
              type="checkbox"
              onChange={handleCheckboxChange}
              checked={isSelected}
            />
          </label>
        </div>
      </td>
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
        <div className="flex items-center">
          <div className="w-10 h-10 shrink-0 mr-2 sm:mr-3">
            <div className="w-10 h-10 rounded-full bg-violet-500 flex items-center justify-center text-white font-medium">
              {user.first_name.charAt(0)}
              {user.last_name.charAt(0)}
            </div>
          </div>
          <div className="font-medium text-gray-800 dark:text-gray-100">
            {user.first_name} {user.last_name}
          </div>
        </div>
      </td>
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
        <div className="text-left">{user.email}</div>
      </td>
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
        <div className="text-center">
          {user.email_verified === true ? (
            <span className="inline-flex items-center justify-center px-2 py-1 text-xs font-medium text-green-700 bg-green-100 dark:bg-green-900/30 dark:text-green-400 rounded-full">
              Verified
            </span>
          ) : (
            <span className="inline-flex items-center justify-center px-2 py-1 text-xs font-medium text-yellow-700 bg-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-400 rounded-full">
              Pending
            </span>
          )}
        </div>
      </td>
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
        <div className="text-center">
          {user.is_active === true ? (
            <span className="inline-flex items-center justify-center px-2 py-1 text-xs font-medium text-green-700 bg-green-100 dark:bg-green-900/30 dark:text-green-400 rounded-full">
              Active
            </span>
          ) : (
            <span className="inline-flex items-center justify-center px-2 py-1 text-xs font-medium text-red-700 bg-red-100 dark:bg-red-900/30 dark:text-red-400 rounded-full">
              Inactive
            </span>
          )}
        </div>
      </td>
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
        <div className="text-left text-gray-500 dark:text-gray-400">
          {formatDate(user.created_at)}
        </div>
      </td>
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap w-px">
        <div className="relative inline-flex" ref={dropdownRef}>
          {/* Menu button */}
          <button 
            className="text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400 rounded-full"
            aria-haspopup="true"
            aria-expanded={dropdownOpen}
            onClick={() => setDropdownOpen(!dropdownOpen)}
          >
            <span className="sr-only">Menu</span>
            <svg className="w-8 h-8 fill-current" viewBox="0 0 32 32">
              <circle cx="16" cy="16" r="2" />
              <circle cx="10" cy="16" r="2" />
              <circle cx="22" cy="16" r="2" />
            </svg>
          </button>
          
          {/* Dropdown menu */}
          {dropdownOpen && (
            <div className="origin-top-right z-10 absolute top-full right-0 min-w-44 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 py-1.5 rounded-lg shadow-lg overflow-hidden mt-1">
              <ul>
                <li>
                  <button
                    className="font-medium text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-200 flex items-center py-1 px-3 w-full text-left"
                    onClick={handleEdit}
                  >
                    <svg className="w-4 h-4 fill-current text-gray-400 dark:text-gray-500 shrink-0 mr-2" viewBox="0 0 16 16">
                      <path d="m13.7 2.3-1-1c-.4-.4-1-.4-1.4 0l-10 10c-.2.2-.3.4-.3.7v4c0 .6.4 1 1 1h4c.3 0 .5-.1.7-.3l10-10c.4-.4.4-1 0-1.4zM10.5 6.5L9 5l.5-.5L11 6l-.5.5zM2 14v-3l6-6 3 3-6 6H2z" />
                    </svg>
                    <span>Edit</span>
                  </button>
                </li>
                <li>
                  <button
                    className="font-medium text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-200 flex items-center py-1 px-3 w-full text-left"
                    onClick={handleInactivate}
                  >
                    <svg className="w-4 h-4 fill-current text-gray-400 dark:text-gray-500 shrink-0 mr-2" viewBox="0 0 16 16">
                      <path d="M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zm0 12c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1zm1-3H7V4h2v5z" />
                    </svg>
                    <span>{user.is_active ? 'Inactivate' : 'Activate'}</span>
                  </button>
                </li>
                <li>
                  <button
                    className="font-medium text-sm text-red-500 hover:text-red-600 flex items-center py-1 px-3 w-full text-left"
                    onClick={handleDelete}
                  >
                    <svg className="w-4 h-4 fill-current text-red-400 shrink-0 mr-2" viewBox="0 0 16 16">
                      <path d="M5 7h6v6H5V7zm6-3.5V2h-1V.5a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5V2H5v1.5H4V4h8v-.5H11zM7 2V1h2v1H7zM6 5v6h1V5H6zm3 0v6h1V5H9z" />
                    </svg>
                    <span>Delete</span>
                  </button>
                </li>
              </ul>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}
