'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api/client';
import { generateCorrelationTraceURL } from '@/lib/monitoring/cloudwatch-queries';
import type { ErrorsResponse, ErrorLogEntry } from '@/lib/monitoring/types';

interface ErrorLogPanelProps {
  autoRefresh?: boolean;
  refreshInterval?: number;
  timeRange?: string;
}

export default function ErrorLogPanel({
  autoRefresh = true,
  refreshInterval = 30000,
  timeRange = '1h',
}: ErrorLogPanelProps) {
  const [data, setData] = useState<ErrorsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedErrors, setExpandedErrors] = useState<Set<number>>(new Set());

  const fetchErrors = async () => {
    try {
      const response = await apiClient.get(`/api/admin/monitoring/errors?timeRange=${timeRange}&limit=20`);
      setData(response as ErrorsResponse);
    } catch (err) {
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchErrors();
  }, [timeRange]);

  useEffect(() => {
    if (!autoRefresh || refreshInterval === 0) return;
    const interval = setInterval(fetchErrors, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, timeRange]);

  const toggleExpand = (index: number) => {
    const newExpanded = new Set(expandedErrors);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedErrors(newExpanded);
  };

  const groupErrors = (errors: ErrorLogEntry[]): Array<{ error: ErrorLogEntry; count: number }> => {
    const grouped = new Map<string, { error: ErrorLogEntry; count: number }>();
    
    for (const error of errors) {
      const key = `${error.endpoint}:${error.error?.name || 'Unknown'}`;
      if (grouped.has(key)) {
        grouped.get(key)!.count++;
      } else {
        grouped.set(key, { error, count: 1 });
      }
    }
    
    return Array.from(grouped.values()).sort((a, b) => b.count - a.count);
  };

  if (loading && !data) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500"></div>
        </div>
      </div>
    );
  }

  const groupedErrors = data ? groupErrors(data.errors) : [];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Recent Errors</h3>
      
      {groupedErrors.length > 0 ? (
        <div className="space-y-2">
          {groupedErrors.map((group, idx) => (
            <div key={idx} className="border border-gray-200 dark:border-gray-700 rounded">
              <div
                className="p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50"
                onClick={() => toggleExpand(idx)}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-red-600 dark:text-red-400">
                      {group.error.error?.name || 'Error'}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      {group.error.endpoint}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {group.count > 1 && (
                      <span className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 text-xs rounded">
                        {group.count}x
                      </span>
                    )}
                    <span className="text-xs text-gray-400">
                      {expandedErrors.has(idx) ? '▼' : '▶'}
                    </span>
                  </div>
                </div>
              </div>
              
              {expandedErrors.has(idx) && (
                <div className="p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                  <div className="text-xs space-y-2">
                    <div><strong>Message:</strong> {group.error.message}</div>
                    <div><strong>Status:</strong> {group.error.statusCode}</div>
                    <div><strong>Time:</strong> {new Date(group.error.timestamp).toLocaleString()}</div>
                    {group.error.correlationId && (
                      <div>
                        <strong>Correlation ID:</strong>{' '}
                        <a
                          href={generateCorrelationTraceURL(group.error.correlationId)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-violet-600 dark:text-violet-400 hover:underline font-mono text-xs"
                        >
                          {group.error.correlationId} 🔗
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8">
          <div className="text-4xl mb-2">✓</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">No errors in the last {timeRange}</div>
        </div>
      )}
    </div>
  );
}

