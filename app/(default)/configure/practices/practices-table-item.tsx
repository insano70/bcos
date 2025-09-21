import { useState, useEffect, useRef } from 'react';
import type { Practice } from './practices-table';

interface PracticesTableItemProps {
  practice: Practice;
  onCheckboxChange: (id: string, checked: boolean) => void;
  isSelected: boolean;
}

export default function PracticesTableItem({
  practice,
  onCheckboxChange,
  isSelected,
}: PracticesTableItemProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onCheckboxChange(practice.id, e.target.checked);
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
    window.location.href = `/configure/practices/${practice.id}`;
    setDropdownOpen(false);
  };

  const handlePreview = () => {
    window.open(`/template-preview/${practice.id}`, '_blank', 'noopener,noreferrer');
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'text-green-700 bg-green-100 dark:bg-green-900/30 dark:text-green-400';
      case 'inactive':
        return 'text-red-700 bg-red-100 dark:bg-red-900/30 dark:text-red-400';
      case 'pending':
        return 'text-yellow-700 bg-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-400';
      default:
        return 'text-gray-700 bg-gray-100 dark:bg-gray-900/30 dark:text-gray-400';
    }
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
            <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-medium text-sm">
              🏥
            </div>
          </div>
          <div className="font-medium text-gray-800 dark:text-gray-100">{practice.name}</div>
        </div>
      </td>
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
        <div className="text-left">
          <a
            href={`https://${practice.domain}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
          >
            {practice.domain}
          </a>
        </div>
      </td>
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
        <div className="text-left text-gray-600 dark:text-gray-400">{practice.template_name}</div>
      </td>
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
        <div className="text-center">
          <span
            className={`inline-flex items-center justify-center px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(
              practice.status
            )}`}
          >
            {practice.status.charAt(0).toUpperCase() + practice.status.slice(1)}
          </span>
        </div>
      </td>
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
        <div className="text-left text-gray-600 dark:text-gray-400">{practice.owner_email}</div>
      </td>
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
        <div className="text-left text-gray-500 dark:text-gray-400">
          {formatDate(practice.created_at)}
        </div>
      </td>
      {/* Actions Menu */}
      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap w-px">
        <div className="relative inline-flex" ref={dropdownRef}>
          <button
            type="button"
            className="rounded-full"
            aria-haspopup="true"
            aria-expanded={dropdownOpen}
            onClick={() => setDropdownOpen(!dropdownOpen)}
          >
            <span className="sr-only">Menu</span>
            <svg className="w-8 h-8 fill-current text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400" viewBox="0 0 32 32">
              <circle cx="16" cy="16" r="2" />
              <circle cx="10" cy="16" r="2" />
              <circle cx="22" cy="16" r="2" />
            </svg>
          </button>
          {dropdownOpen && (
            <div className="origin-top-right z-50 fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 py-1.5 rounded-lg shadow-lg overflow-hidden min-w-36"
                 style={{
                   top: dropdownRef.current ? dropdownRef.current.getBoundingClientRect().bottom + 4 : 0,
                   left: dropdownRef.current ? dropdownRef.current.getBoundingClientRect().right - 144 : 0
                 }}>
              <ul>
                <li>
                  <button
                    type="button"
                    className="font-medium text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-200 flex items-center py-1 px-3 w-full text-left"
                    onClick={handleEdit}
                  >
                    <svg className="w-4 h-4 fill-current text-gray-400 dark:text-gray-500 shrink-0 mr-2" viewBox="0 0 16 16">
                      <path d="m13.7 2.3-1-1c-.4-.4-1-.4-1.4 0l-10 10c-.2.2-.3.4-.3.7v4c0 .6.4 1 1 1h4c.3 0 .5-.1.7-.3l10-10c.4-.4.4-1 0-1.4zM10.5 6.5L9 5l.5-.5L11 6l-.5.5zM2 14v-3l6-6 3 3-6 6H2z" />
                    </svg>
                    <span>Edit Practice</span>
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    className="font-medium text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-200 flex items-center py-1 px-3 w-full text-left"
                    onClick={handlePreview}
                  >
                    <svg className="w-4 h-4 fill-current text-gray-400 dark:text-gray-500 shrink-0 mr-2" viewBox="0 0 16 16">
                      <path d="M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zM7 11.4L3.6 8 5 6.6l2 2 4-4L12.4 6 7 11.4z" />
                    </svg>
                    <span>Preview Site</span>
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    className="font-medium text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-200 flex items-center py-1 px-3 w-full text-left"
                    onClick={() => {
                      navigator.clipboard.writeText(practice.domain);
                      setDropdownOpen(false);
                    }}
                  >
                    <svg className="w-4 h-4 fill-current text-gray-400 dark:text-gray-500 shrink-0 mr-2" viewBox="0 0 16 16">
                      <path d="M11 0H5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V1a1 1 0 0 0-1-1zM5 2h6v10H5V2z" />
                    </svg>
                    <span>Copy Domain</span>
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
