'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { apiClient } from '@/lib/api/client';
import type { SlowQueriesResponse } from '@/lib/monitoring/types';
import { clientErrorLog } from '@/lib/utils/debug-client';
import { Spinner } from '@/components/ui/spinner';

interface SlowQueriesPanelProps {
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export default function SlowQueriesPanel({
  autoRefresh = true,
  refreshInterval = 30000,
}: SlowQueriesPanelProps) {
  const [data, setData] = useState<SlowQueriesResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchQueries = useCallback(async () => {
    try {
      const response = await apiClient.get('/api/admin/monitoring/slow-queries?limit=10');
      setData(response as SlowQueriesResponse);
    } catch (err) {
      clientErrorLog('Failed to fetch slow queries', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueries();
  }, [fetchQueries]);

  useEffect(() => {
    if (!autoRefresh || refreshInterval === 0) return;
    const interval = setInterval(fetchQueries, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchQueries]);

  return (
    <Card>
      <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Slow Queries</h3>

      {loading && !data ? (
        <div className="flex items-center justify-center py-8">
          <Spinner size="md" />
        </div>
      ) : data && data.queries.length > 0 ? (
        <div className="space-y-2">
          {data.queries.map((query) => (
            <div key={`${query.operation}-${query.table}-${query.timestamp}`} className="p-3 border border-gray-200 dark:border-gray-700 rounded">
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {query.operation} on {query.table}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {query.recordCount} rows • {new Date(query.timestamp).toLocaleString()}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-red-600 dark:text-red-400">
                    {query.duration}ms
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8">
          <div className="text-4xl mb-2">⚡</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">No slow queries detected</div>
        </div>
      )}
    </Card>
  );
}
