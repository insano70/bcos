/**
 * Analytics Cache Dashboard Component
 *
 * Main dashboard for analytics cache management showing:
 * - Overall summary statistics
 * - Per-datasource metrics cards
 * - Quick actions for cache management
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import ModalAction from '@/components/modal-action';
import Toast from '@/components/toast';
import { apiClient } from '@/lib/api/client';
import type { AnalyticsCacheStatsResponse } from '@/lib/monitoring/types';
import { clientErrorLog } from '@/lib/utils/debug-client';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import AnalyticsCacheDatasourceCard from './analytics-cache-datasource-card';
import WarmingJobList from './warming-job-list';

interface AnalyticsCacheDashboardProps {
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export default function AnalyticsCacheDashboard({
  autoRefresh = true,
  refreshInterval = 30000,
}: AnalyticsCacheDashboardProps) {
  const [stats, setStats] = useState<AnalyticsCacheStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshingDs, setRefreshingDs] = useState<Set<number>>(new Set());

  // Toast notification state
  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error' | 'warning' | ''>('');

  // Confirmation modal state
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);
  const [confirmTitle, setConfirmTitle] = useState('');
  const [confirmMessage, setConfirmMessage] = useState('');

  // Helper to show toast notifications
  const showToast = (message: string, type: 'success' | 'error' | 'warning' | '' = '') => {
    setToastMessage(message);
    setToastType(type);
    setToastOpen(true);
    // Auto-hide after 5 seconds
    setTimeout(() => setToastOpen(false), 5000);
  };

  // Helper to show confirmation modal
  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setConfirmTitle(title);
    setConfirmMessage(message);
    setConfirmAction(() => onConfirm);
    setConfirmModalOpen(true);
  };

  // Shared fetch stats function (memoized to prevent infinite loops)
  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/api/admin/analytics/cache/stats');
      setStats(response as AnalyticsCacheStatsResponse);
      setError(null);
    } catch (err) {
      clientErrorLog('Failed to fetch analytics cache stats', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch cache stats');
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

  const handleRefreshDatasource = async (datasourceId: number) => {
    setRefreshingDs((prev) => new Set(prev).add(datasourceId));
    try {
      await apiClient.post('/api/admin/analytics/cache/warm', { datasourceId });
      showToast('Cache warming started successfully', 'success');
      // Poll for completion (or wait a reasonable time)
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await fetchStats();
    } catch (err) {
      clientErrorLog('Failed to refresh datasource cache', err);
      showToast('Failed to start cache warming. Please try again.', 'error');
    } finally {
      setRefreshingDs((prev) => {
        const next = new Set(prev);
        next.delete(datasourceId);
        return next;
      });
    }
  };

  const handleInvalidateDatasource = (datasourceId: number) => {
    showConfirm(
      'Invalidate Cache',
      'Are you sure you want to invalidate this cache? This will clear all cached data.',
      async () => {
        try {
          await apiClient.post('/api/admin/analytics/cache/invalidate', {
            datasourceId,
            reason: 'User-initiated invalidation from command center',
          });
          showToast('Cache invalidated successfully', 'success');
          await fetchStats();
        } catch (err) {
          clientErrorLog('Failed to invalidate datasource cache', err);
          showToast('Failed to invalidate cache. Please try again.', 'error');
        }
      }
    );
  };

  const handleWarmAll = () => {
    showConfirm(
      'Warm All Caches',
      'Are you sure you want to warm all datasource caches? This will queue multiple warming jobs and may take several minutes.',
      async () => {
        try {
          setLoading(true);
          await apiClient.post('/api/admin/analytics/cache/warm', {});
          showToast('Cache warming started for all datasources', 'success');
          // Wait a bit, then refresh stats
          await new Promise((resolve) => setTimeout(resolve, 3000));
          await fetchStats();
        } catch (err) {
          clientErrorLog('Failed to warm all caches', err);
          showToast('Failed to start bulk cache warming. Please try again.', 'error');
        } finally {
          setLoading(false);
        }
      }
    );
  };

  if (loading && !stats) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
        <div className="text-center py-8">
          <div className="text-4xl mb-2">⚠️</div>
          <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const { summary, datasources } = stats;

  return (
    <div className="space-y-6">
      {/* Header with Actions */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
          Analytics Cache Overview
        </h3>
        <div className="flex items-center gap-3">
          <Button
            variant="violet"
            size="sm"
            onClick={handleWarmAll}
            disabled={loading}
            title="Warm all datasource caches"
            aria-label="Warm all caches"
          >
            Warm All
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setLoading(true);
              fetchStats();
            }}
            disabled={loading}
            title="Refresh stats"
            aria-label="Refresh cache statistics"
            className="text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300"
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
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Data Sources</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {summary.warmDatasources}/{summary.totalDatasources}
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">Warm</div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Cache Entries</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {summary.totalCacheEntries.toLocaleString()}
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
            {summary.totalIndexes.toLocaleString()} indexes
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Memory Usage</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {summary.totalMemoryMB.toFixed(1)} MB
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">Total allocated</div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Hit Rate</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {summary.overallCacheHitRate.toFixed(1)}%
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">Overall</div>
        </div>
      </div>

      {/* Health Distribution */}
      {summary.totalDatasources > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Health Distribution
          </div>
          <div className="flex gap-2 text-xs">
            {summary.healthDistribution.excellent > 0 && (
              <div className="flex items-center gap-1">
                <span className="text-green-600 dark:text-green-400">🟢</span>
                <span className="text-gray-600 dark:text-gray-400">
                  {summary.healthDistribution.excellent} Excellent
                </span>
              </div>
            )}
            {summary.healthDistribution.good > 0 && (
              <div className="flex items-center gap-1">
                <span className="text-blue-600 dark:text-blue-400">🔵</span>
                <span className="text-gray-600 dark:text-gray-400">
                  {summary.healthDistribution.good} Good
                </span>
              </div>
            )}
            {summary.healthDistribution.degraded > 0 && (
              <div className="flex items-center gap-1">
                <span className="text-yellow-600 dark:text-yellow-400">🟡</span>
                <span className="text-gray-600 dark:text-gray-400">
                  {summary.healthDistribution.degraded} Degraded
                </span>
              </div>
            )}
            {summary.healthDistribution.stale > 0 && (
              <div className="flex items-center gap-1">
                <span className="text-orange-600 dark:text-orange-400">🟠</span>
                <span className="text-gray-600 dark:text-gray-400">
                  {summary.healthDistribution.stale} Stale
                </span>
              </div>
            )}
            {summary.healthDistribution.cold > 0 && (
              <div className="flex items-center gap-1">
                <span className="text-red-600 dark:text-red-400">🔴</span>
                <span className="text-gray-600 dark:text-gray-400">
                  {summary.healthDistribution.cold} Cold
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Warming Jobs */}
      <WarmingJobList autoRefresh={autoRefresh} refreshInterval={10000} onJobComplete={fetchStats} />

      {/* Data Sources Grid */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Data Sources</h4>
        {datasources.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
            <div className="text-4xl mb-2">📊</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">No data sources found</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {datasources.map((ds) => (
              <AnalyticsCacheDatasourceCard
                key={ds.datasourceId}
                metrics={ds}
                onRefresh={handleRefreshDatasource}
                onInvalidate={handleInvalidateDatasource}
                isRefreshing={refreshingDs.has(ds.datasourceId)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Toast Notifications */}
      <Toast
        type={toastType}
        open={toastOpen}
        setOpen={setToastOpen}
        className="fixed bottom-4 right-4 z-50"
      >
        {toastMessage}
      </Toast>

      {/* Confirmation Modal */}
      <ModalAction isOpen={confirmModalOpen} setIsOpen={setConfirmModalOpen}>
        <div className="space-y-4">
          <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {confirmTitle}
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">{confirmMessage}</p>
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="secondary" onClick={() => setConfirmModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="violet"
              onClick={() => {
                setConfirmModalOpen(false);
                if (confirmAction) {
                  confirmAction();
                }
              }}
            >
              Confirm
            </Button>
          </div>
        </div>
      </ModalAction>
    </div>
  );
}
