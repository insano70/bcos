/**
 * Analytics Cache Datasource Card Component
 *
 * Displays cache metrics and health for individual datasources with action buttons
 */

'use client';

import { formatDistanceToNow } from 'date-fns';
import type { DatasourceCacheMetrics } from '@/lib/monitoring/types';
import CacheHealthBadge from './cache-health-badge';

interface AnalyticsCacheDatasourceCardProps {
  metrics: DatasourceCacheMetrics;
  onRefresh?: (datasourceId: number) => void;
  onInvalidate?: (datasourceId: number) => void;
  isRefreshing?: boolean;
}

export default function AnalyticsCacheDatasourceCard({
  metrics,
  onRefresh,
  onInvalidate,
  isRefreshing = false,
}: AnalyticsCacheDatasourceCardProps) {
  const formatNumber = (num: number) => num.toLocaleString();

  const formatAge = (lastWarmed: string | null): string => {
    if (!lastWarmed) return 'Never';
    try {
      return formatDistanceToNow(new Date(lastWarmed), { addSuffix: true });
    } catch {
      return 'Unknown';
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
            {metrics.datasourceName}
          </h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            DS #{metrics.datasourceId}
          </p>
        </div>
        <CacheHealthBadge health={metrics.health} score={metrics.healthScore} size="sm" />
      </div>

      {/* Status */}
      <div className="mb-3 pb-3 border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-600 dark:text-gray-400">Last warmed:</span>
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {formatAge(metrics.lastWarmed)}
          </span>
        </div>
        {metrics.ageMinutes !== Infinity && metrics.ageMinutes > 0 && (
          <div className="flex items-center justify-between text-xs mt-1">
            <span className="text-gray-600 dark:text-gray-400">Age:</span>
            <span className="text-gray-700 dark:text-gray-300">
              {Math.round(metrics.ageMinutes)} min
            </span>
          </div>
        )}
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Cache Entries</div>
          <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
            {formatNumber(metrics.totalEntries)}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Memory</div>
          <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
            {metrics.estimatedMemoryMB.toFixed(1)} MB
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Indexes</div>
          <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
            {formatNumber(metrics.indexCount)}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Hit Rate</div>
          <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
            {metrics.cacheHitRate.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Coverage Details */}
      {metrics.isWarm && (
        <details className="mb-3">
          <summary className="cursor-pointer text-xs text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 font-medium">
            Coverage Details
          </summary>
          <div className="mt-2 space-y-1 text-xs text-gray-600 dark:text-gray-400">
            <div className="flex justify-between">
              <span>Measures:</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {metrics.uniqueMeasures}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Practices:</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {metrics.uniquePractices}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Providers:</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {metrics.uniqueProviders}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Frequencies:</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {metrics.uniqueFrequencies.length > 0
                  ? metrics.uniqueFrequencies.join(', ')
                  : 'N/A'}
              </span>
            </div>
          </div>
        </details>
      )}

      {/* Warnings */}
      {metrics.warnings.length > 0 && (
        <div className="mb-3 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded text-xs">
          <div className="font-medium text-amber-800 dark:text-amber-200 mb-1">⚠️ Warnings</div>
          <ul className="space-y-0.5 text-amber-700 dark:text-amber-300">
            {metrics.warnings.map((warning, index) => (
              <li key={index}>• {warning}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2">
        {onRefresh && (
          <button type="button" onClick={() => onRefresh(metrics.datasourceId)}
            disabled={isRefreshing}
            className="flex-1 px-3 py-1.5 bg-violet-600 text-white text-xs font-medium rounded hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Refresh cache for this datasource"
          >
            {isRefreshing ? (
              <>
                <span className="inline-block animate-spin mr-1">⟳</span>
                Refreshing...
              </>
            ) : (
              '🔄 Refresh'
            )}
          </button>
        )}
        {onInvalidate && (
          <button type="button" onClick={() => onInvalidate(metrics.datasourceId)}
            disabled={isRefreshing}
            className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium rounded hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Invalidate cache for this datasource"
          >
            🗑️ Clear
          </button>
        )}
      </div>
    </div>
  );
}
