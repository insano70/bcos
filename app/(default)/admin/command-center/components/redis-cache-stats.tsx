/**
 * Redis Cache Statistics Component
 *
 * Displays Redis cache performance metrics with visual gauges.
 * Features:
 * - Hit rate percentage with progress bar
 * - Memory usage with warning thresholds
 * - Operations per second
 * - Key count by pattern
 * - Command statistics
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api/client';
import type { RedisStats } from '@/lib/monitoring/types';

interface RedisCacheStatsProps {
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export default function RedisCacheStats({
  autoRefresh = true,
  refreshInterval = 30000,
}: RedisCacheStatsProps) {
  const [stats, setStats] = useState<RedisStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const response = await apiClient.get('/api/admin/redis/stats');
      setStats(response as RedisStats);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch Redis stats:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch Redis stats');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh || refreshInterval === 0) return;

    const interval = setInterval(fetchStats, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchStats]);

  // Format uptime
  const formatUptime = (seconds: number): string => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  // Get memory usage color
  const getMemoryColor = (percentage: number): string => {
    if (percentage > 90) return 'bg-red-500';
    if (percentage > 75) return 'bg-amber-500';
    if (percentage > 60) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  if (loading && !stats) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">
          Redis Cache Statistics
        </h3>
        <div className="text-center py-8">
          <div className="text-4xl mb-2">⚠️</div>
          <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Redis may not be configured or unavailable
          </div>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
          Redis Cache Statistics
        </h3>
        <button type="button" onClick={() => {
            setLoading(true);
            fetchStats();
          }}
          disabled={loading}
          className="text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 disabled:text-gray-400"
          title="Refresh stats"
          aria-label="Refresh Redis statistics"
        >
          <svg
            className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>
      </div>

      {/* Connection Status */}
      <div className="mb-4 flex items-center gap-2">
        <div className="h-3 w-3 bg-green-500 rounded-full animate-pulse"></div>
        <span className="text-sm text-gray-600 dark:text-gray-400">
          Connected • Uptime: {formatUptime(stats.uptime)}
        </span>
      </div>

      {/* Hit Rate */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-600 dark:text-gray-400">Hit Rate</span>
          <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {stats.stats.hitRate.toFixed(1)}%
          </span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div
            className="bg-violet-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${stats.stats.hitRate}%` }}
          />
        </div>
        <div className="flex justify-between mt-1 text-xs text-gray-500 dark:text-gray-400">
          <span>{stats.stats.totalHits.toLocaleString()} hits</span>
          <span>{stats.stats.totalMisses.toLocaleString()} misses</span>
        </div>
      </div>

      {/* Memory Usage */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-600 dark:text-gray-400">Memory</span>
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {stats.memory.used}MB / {stats.memory.total}MB
          </span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all duration-300 ${getMemoryColor(stats.memory.percentage)}`}
            style={{ width: `${stats.memory.percentage}%` }}
          />
        </div>
        <div className="flex justify-between mt-1 text-xs text-gray-500 dark:text-gray-400">
          <span>Peak: {stats.memory.peak}MB</span>
          <span>Fragmentation: {stats.memory.fragmentation.toFixed(2)}</span>
        </div>
      </div>

      {/* Key Stats Grid */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Total Keys</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {stats.keys.total.toLocaleString()}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Ops/sec</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {stats.stats.opsPerSec}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Clients</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {stats.stats.connectedClients}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Evicted</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {stats.stats.evictedKeys}
          </div>
        </div>
      </div>

      {/* Key Distribution */}
      {Object.keys(stats.keys.byPattern).length > 0 && (
        <details className="mb-4">
          <summary className="cursor-pointer text-sm text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 font-medium">
            View key distribution
          </summary>
          <div className="mt-2 space-y-1 text-xs">
            {Object.entries(stats.keys.byPattern).map(([pattern, count]) => (
              <div key={pattern} className="flex justify-between text-gray-600 dark:text-gray-400">
                <span className="font-mono">{pattern}</span>
                <span className="font-medium">{count.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Cache Management APIs */}
      <details className="mt-4">
        <summary className="cursor-pointer text-sm text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 font-medium">
          View cache management APIs
        </summary>
        <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-700 rounded text-xs space-y-2">
          <div className="font-medium text-gray-900 dark:text-gray-100 mb-2">
            Available Cache Management APIs:
          </div>
          <div className="space-y-1 text-gray-600 dark:text-gray-400">
            <div>
              <code className="bg-gray-200 dark:bg-gray-800 px-1 rounded">
                GET /api/admin/redis/stats
              </code>{' '}
              - Statistics
            </div>
            <div>
              <code className="bg-gray-200 dark:bg-gray-800 px-1 rounded">
                GET /api/admin/redis/keys?pattern=*
              </code>{' '}
              - Search keys
            </div>
            <div>
              <code className="bg-gray-200 dark:bg-gray-800 px-1 rounded">
                GET /api/admin/redis/inspect?key=...
              </code>{' '}
              - View key
            </div>
            <div>
              <code className="bg-gray-200 dark:bg-gray-800 px-1 rounded">
                POST /api/admin/redis/purge
              </code>{' '}
              - Delete keys
            </div>
            <div>
              <code className="bg-gray-200 dark:bg-gray-800 px-1 rounded">
                POST /api/admin/redis/ttl
              </code>{' '}
              - Update TTL
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400">
            Full UI components for key browsing and cache purging can be added in a future
            iteration. For now, use the APIs directly via curl/Postman or browser dev tools.
          </div>
        </div>
      </details>
    </div>
  );
}
