'use client';

import { useState, useId } from 'react';
import { useGenerateSQL, useExecuteQuery } from '@/lib/hooks/use-data-explorer';

export default function DataExplorerPage() {
  const queryInputId = useId();
  const [query, setQuery] = useState('');
  const [generatedSQL, setGeneratedSQL] = useState('');
  const [queryHistoryId, setQueryHistoryId] = useState<string | null>(null);

  const generateSQL = useGenerateSQL();
  const executeQuery = useExecuteQuery();

  const handleGenerate = async () => {
    try {
      const result = await generateSQL.mutateAsync({
        natural_language_query: query,
        model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        temperature: 0.1,
        include_explanation: true,
      });

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

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Data Explorer</h1>

      <div className="mb-4">
        <label htmlFor={queryInputId} className="block text-sm font-medium mb-2">
          Ask a question about your data
        </label>
        <textarea
          id={queryInputId}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Example: How many patients were seen in January 2024?"
          className="w-full h-32 p-3 border rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
        />
      </div>

      <button
        type="button"
        onClick={handleGenerate}
        disabled={generateSQL.isPending || !query.trim()}
        className="px-4 py-2 bg-violet-500 text-white rounded-lg hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {generateSQL.isPending ? 'Generating SQL...' : 'Generate SQL'}
      </button>

      {generateSQL.error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <p className="font-semibold">Error:</p>
          <p>{generateSQL.error.message}</p>
        </div>
      )}

      {generatedSQL && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold mb-2">Generated SQL:</h2>
          <pre className="bg-gray-100 p-4 rounded-lg overflow-x-auto text-sm font-mono">
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
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <p className="font-semibold">Execution Error:</p>
          <p>{executeQuery.error.message}</p>
        </div>
      )}

      {executeQuery.data && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold mb-2">Results:</h2>
          <p className="text-sm text-gray-600 mb-4">
            Returned {executeQuery.data.row_count} rows in {executeQuery.data.execution_time_ms}ms
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 border">
              <thead className="bg-gray-50">
                <tr>
                  {executeQuery.data.columns.map((col) => (
                    <th
                      key={col.name}
                      className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase tracking-wider"
                    >
                      {col.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {executeQuery.data.rows.slice(0, 100).map((row, idx) => (
                  <tr key={`row-${idx}`}>
                    {executeQuery.data.columns.map((col) => (
                      <td key={col.name} className="px-4 py-2 text-sm text-gray-900">
                        {String((row as Record<string, unknown>)[col.name] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {executeQuery.data.row_count > 100 && (
              <p className="text-sm text-gray-500 mt-2">
                Showing first 100 of {executeQuery.data.row_count} rows
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

