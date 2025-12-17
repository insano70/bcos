'use client';

import { Button } from '@/components/ui/button';
import type { ResolvedCSVRow } from '@/lib/validations/bulk-import';

interface CSVPreviewTableProps {
  rows: ResolvedCSVRow[];
  onImport: () => void;
  isImporting: boolean;
}

/**
 * CSV Preview Table Component
 *
 * Displays parsed CSV data with validation status indicators.
 * Shows valid/invalid counts and allows importing valid rows only.
 */
export default function CSVPreviewTable({ rows, onImport, isImporting }: CSVPreviewTableProps) {
  const validCount = rows.filter((r) => r.is_valid).length;
  const invalidCount = rows.filter((r) => !r.is_valid).length;
  const hasValidRows = validCount > 0;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Total: <span className="font-medium text-gray-900 dark:text-gray-100">{rows.length}</span>
          </span>
          <span className="text-sm">
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-green-700 dark:text-green-400">Valid: {validCount}</span>
            </span>
          </span>
          <span className="text-sm">
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-red-700 dark:text-red-400">Invalid: {invalidCount}</span>
            </span>
          </span>
        </div>
        <Button
          variant="primary"
          onClick={onImport}
          disabled={!hasValidRows}
          loading={isImporting}
          loadingText="Importing..."
        >
          Import {validCount} Valid Row{validCount !== 1 ? 's' : ''}
        </Button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Row
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                First Name
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Last Name
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Email
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Organization
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Roles
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Provider UID
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {rows.map((row) => (
              <tr
                key={row.row_number}
                className={row.is_valid ? '' : 'bg-red-50 dark:bg-red-900/10'}
              >
                <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                  {row.row_number}
                </td>
                <td className="px-4 py-3">
                  {row.is_valid ? (
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-100 dark:bg-green-900/30">
                      <svg
                        className="w-4 h-4 text-green-600 dark:text-green-400"
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
                  ) : (
                    <div className="group relative">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-100 dark:bg-red-900/30 cursor-help">
                        <svg
                          className="w-4 h-4 text-red-600 dark:text-red-400"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </span>
                      {/* Error tooltip */}
                      <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-10">
                        <div className="bg-gray-900 text-white text-xs rounded py-2 px-3 max-w-xs shadow-lg">
                          <ul className="list-disc list-inside space-y-1">
                            {row.errors.map((error) => (
                              <li key={error}>{error}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                  {row.data.first_name || '-'}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                  {row.data.last_name || '-'}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                  {row.data.email || '-'}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                  <span
                    className={
                      row.data.organization_id
                        ? ''
                        : 'text-red-600 dark:text-red-400'
                    }
                  >
                    {row.data.organization_name || '-'}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                  {row.data.roles.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {row.data.roles.map((role, idx) => {
                        const isResolved = row.data.role_ids.length > idx;
                        return (
                          <span
                            key={role}
                            className={`inline-flex px-2 py-0.5 text-xs rounded ${
                              isResolved
                                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                                : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                            }`}
                          >
                            {role}
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    '-'
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                  {row.data.provider_uid ?? '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Validation errors summary */}
      {invalidCount > 0 && (
        <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <div className="flex items-start">
            <svg
              className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5 mr-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <div>
              <h4 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                {invalidCount} row{invalidCount !== 1 ? 's' : ''} cannot be imported
              </h4>
              <p className="mt-1 text-sm text-yellow-700 dark:text-yellow-300">
                Hover over the error icon in each row to see the specific validation errors.
                Fix the issues in your CSV file and re-upload to import these rows.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
