'use client';

import { useState, useId } from 'react';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { useGenerateSQL, useExecuteQuery } from '@/lib/hooks/use-data-explorer';
import { exportToCSV } from '@/lib/utils/csv-export';
import { exportToExcel } from '@/lib/utils/excel-export';
import FeedbackModal from '@/components/feedback-modal';

export default function DataExplorerPage() {
  const queryInputId = useId();
  const tier1Id = useId();
  const tier2Id = useId();
  const tier3Id = useId();
  const [query, setQuery] = useState('');
  const [generatedSQL, setGeneratedSQL] = useState('');
  const [queryHistoryId, setQueryHistoryId] = useState<string | null>(null);
  const [selectedTiers, setSelectedTiers] = useState<Array<1 | 2 | 3>>([1, 2, 3]);
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);

  const generateSQL = useGenerateSQL();
  const executeQuery = useExecuteQuery();

  const toggleTier = (tier: 1 | 2 | 3) => {
    setSelectedTiers((prev) =>
      prev.includes(tier) ? prev.filter((t) => t !== tier) : [...prev, tier].sort()
    );
  };

  const handleGenerate = async () => {
    try {
      const params: {
        natural_language_query: string;
        temperature: number;
        include_explanation: boolean;
        tiers?: Array<1 | 2 | 3>;
      } = {
        natural_language_query: query,
        temperature: 0.1,
        include_explanation: true,
      };

      // Only add tiers if at least one is selected
      if (selectedTiers.length > 0) {
        params.tiers = selectedTiers;
      }

      const result = await generateSQL.mutateAsync(params);

      setGeneratedSQL(result.sql);
      setQueryHistoryId(result.query_history_id || null);
    } catch (_error) {
      // Error handled by React Query error state
    }
  };

  const handleExecute = async () => {
    try {
      await executeQuery.mutateAsync({
        sql: generatedSQL,
        limit: 1000,
        ...(queryHistoryId && { query_history_id: queryHistoryId }),
      });
      // Success handled by React Query data state
    } catch (_error) {
      // Error handled by React Query error state
    }
  };

  const handleExportCSV = () => {
    if (!executeQuery.data) return;

    // Build headers from column metadata
    const headers = executeQuery.data.columns.reduce((acc, col) => {
      acc[col.name] = col.name;
      return acc;
    }, {} as Record<string, string>);

    // Export all rows (not just displayed 100)
    exportToCSV(
      executeQuery.data.rows as Record<string, unknown>[],
      headers,
      'query-results'
    );
  };

  const handleExportExcel = async () => {
    if (!executeQuery.data) return;

    // Prepare column metadata for Excel
    const columns = executeQuery.data.columns.map((col) => ({
      name: col.name,
      type: col.type,
    }));

    // Export with metadata
    await exportToExcel(
      executeQuery.data.rows as Record<string, unknown>[],
      columns,
      generatedSQL,
      'query-results',
      {
        rowCount: executeQuery.data.row_count,
        executionTime: executeQuery.data.execution_time_ms,
      }
    );
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4 text-gray-800 dark:text-gray-100">Data Explorer</h1>

      <div className="mb-4">
        <label htmlFor={queryInputId} className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
          Ask a question about your data
        </label>
        <textarea
          id={queryInputId}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Example: How many patients were seen in January 2024?"
          className="form-textarea w-full h-32"
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Table Tiers to Include</label>
        <div className="flex gap-4">
          <label htmlFor={tier1Id} className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              id={tier1Id}
              checked={selectedTiers.includes(1)}
              onChange={() => toggleTier(1)}
              className="form-checkbox w-4 h-4"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Tier 1 (Core Tables)</span>
          </label>
          <label htmlFor={tier2Id} className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              id={tier2Id}
              checked={selectedTiers.includes(2)}
              onChange={() => toggleTier(2)}
              className="form-checkbox w-4 h-4"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Tier 2 (Supporting Tables)</span>
          </label>
          <label htmlFor={tier3Id} className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              id={tier3Id}
              checked={selectedTiers.includes(3)}
              onChange={() => toggleTier(3)}
              className="form-checkbox w-4 h-4"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Tier 3 (Specialized Tables)</span>
          </label>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Select which table tiers to include in the AI context. Fewer tiers = faster, more focused responses.
        </p>
      </div>

      <button
        type="button"
        onClick={handleGenerate}
        disabled={generateSQL.isPending || !query.trim() || selectedTiers.length === 0}
        className="px-4 py-2 bg-violet-500 text-white rounded-lg hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {generateSQL.isPending ? 'Generating SQL...' : 'Generate SQL'}
      </button>

      {generateSQL.error && (
        <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
          <p className="font-semibold">Error:</p>
          <p>{generateSQL.error.message}</p>
        </div>
      )}

      {generatedSQL && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold mb-2 text-gray-800 dark:text-gray-100">Generated SQL:</h2>
          <pre className="bg-gray-900 dark:bg-gray-800 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm font-mono">
            {generatedSQL}
          </pre>

          <button
            type="button"
            onClick={handleExecute}
            disabled={executeQuery.isPending}
            className="mt-4 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {executeQuery.isPending ? 'Executing...' : 'Execute Query'}
          </button>
        </div>
      )}

      {executeQuery.error && (
        <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
          <p className="font-semibold">Execution Error:</p>
          <p>{executeQuery.error.message}</p>
        </div>
      )}

      {executeQuery.data && (
        <div className="mt-6">
          {/* Header with Export Dropdown and Report Issue Button */}
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
              Results:
            </h2>
            <div className="flex items-center gap-2">
              {/* Report Issue Button */}
              <button
                type="button"
                onClick={() => setIsFeedbackModalOpen(true)}
                disabled={!queryHistoryId || !generatedSQL}
                className="btn border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 text-gray-800 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                title={!queryHistoryId ? 'Generate a query first to report an issue' : 'Report an issue with this query'}
              >
                <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 16 16">
                  <path d="M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zm1 12H7V7h2v5zM8 6c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1z" />
                </svg>
                <span className="ml-2">Report Issue</span>
              </button>

              {/* Export Menu */}
              <Menu as="div" className="relative inline-block text-left">
              <MenuButton className="btn border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 text-gray-800 dark:text-gray-300">
                <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 16 16">
                  <path d="M14 11h-1v-1h1v1zm0-3V7h-1v1h1zM7 8H6v1h1V8zm0-3H6v1h1V5zm7 0h-1v1h1V5zM8 3h1v1H8V3zm5.854 10.854l-3-3-.708.708L12.293 13H9v1h3.293l-2.147 2.146.708.708 3-3a.5.5 0 000-.708zM3 4h4V3H3a1 1 0 00-1 1v9a1 1 0 001 1h5v-1H3V4z" />
                </svg>
                <span className="ml-2">Export</span>
                <svg className="w-3 h-3 fill-current text-gray-400 dark:text-gray-500 shrink-0 ml-1" viewBox="0 0 12 12">
                  <path d="M5.9 11.4L.5 6l1.4-1.4 4 4 4-4L11.3 6z" />
                </svg>
              </MenuButton>
              <MenuItems
                className="absolute right-0 mt-2 w-48 origin-top-right rounded-md bg-white dark:bg-gray-800 shadow-lg ring-1 ring-black/5 dark:ring-white/10 focus:outline-none z-10"
                transition
              >
                <div className="py-1">
                  <MenuItem>
                    {({ focus }) => (
                      <button
                        type="button"
                        onClick={handleExportCSV}
                        className={`${
                          focus ? 'bg-violet-50 dark:bg-violet-500/10' : ''
                        } group flex w-full items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300`}
                      >
                        <svg className="w-4 h-4 fill-current shrink-0 mr-3" viewBox="0 0 16 16">
                          <path d="M9 0h5.5A1.5 1.5 0 0116 1.5V14a2 2 0 01-2 2H2a2 2 0 01-2-2V2a2 2 0 012-2h5.5L9 0zM5.5 7L8 7L8 8L5.5 8L5.5 7zM5.5 9L10.5 9L10.5 10L5.5 10L5.5 9zM5.5 11L10.5 11L10.5 12L5.5 12L5.5 11z" />
                        </svg>
                        Export as CSV
                      </button>
                    )}
                  </MenuItem>
                  <MenuItem>
                    {({ focus }) => (
                      <button
                        type="button"
                        onClick={handleExportExcel}
                        className={`${
                          focus ? 'bg-violet-50 dark:bg-violet-500/10' : ''
                        } group flex w-full items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300`}
                      >
                        <svg className="w-4 h-4 fill-current shrink-0 mr-3" viewBox="0 0 16 16">
                          <path d="M14 0H2C.9 0 0 .9 0 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V2c0-1.1-.9-2-2-2zM5 13H3V3h2v10zm3 0H6V3h2v10zm3 0H9V3h2v10zm3 0h-2V3h2v10z" />
                        </svg>
                        Export as Excel
                      </button>
                    )}
                  </MenuItem>
                </div>
              </MenuItems>
            </Menu>
            </div>
          </div>

          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Returned {executeQuery.data.row_count} rows in {executeQuery.data.execution_time_ms}ms
            {executeQuery.data.row_count > executeQuery.data.rows.length && (
              <span className="text-amber-600 dark:text-amber-400 ml-2">
                (Export will include all {executeQuery.data.rows.length} rows)
              </span>
            )}
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 border border-gray-200 dark:border-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900/20">
                <tr>
                  {executeQuery.data.columns.map((col) => (
                    <th
                      key={col.name}
                      className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                    >
                      {col.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {executeQuery.data.rows.slice(0, 100).map((row, idx) => (
                  <tr key={`${JSON.stringify(row)}-${idx}`}>
                    {executeQuery.data.columns.map((col) => (
                      <td key={col.name} className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">
                        {String((row as Record<string, unknown>)[col.name] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {executeQuery.data.rows.length > 100 && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                Showing first 100 of {executeQuery.data.rows.length} rows
              </p>
            )}
          </div>
        </div>
      )}

      {/* Feedback Modal */}
      {queryHistoryId && (
        <FeedbackModal
          isOpen={isFeedbackModalOpen}
          onClose={() => setIsFeedbackModalOpen(false)}
          queryHistoryId={queryHistoryId}
          originalSql={generatedSQL}
          naturalLanguageQuery={query}
        />
      )}
    </div>
  );
}

