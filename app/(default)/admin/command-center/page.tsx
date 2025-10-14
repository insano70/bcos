'use client';

/**
 * Admin Command Center - Main Dashboard Page
 *
 * Real-time application monitoring and management dashboard.
 * Features:
 * - System health score and KPIs
 * - Performance metrics
 * - Security monitoring
 * - Redis cache statistics
 *
 * RBAC: settings:read:all (Super Admin only)
 */

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api/client';
import type { MonitoringMetrics } from '@/lib/monitoring/types';
import SystemHealthKPI from './components/system-health-kpi';
import ActiveUsersKPI from './components/active-users-kpi';
import ErrorRateKPI from './components/error-rate-kpi';
import ResponseTimeKPI from './components/response-time-kpi';
import SecurityStatusKPI from './components/security-status-kpi';
import AnalyticsPerformanceKPI from './components/analytics-performance-kpi';
import SecurityEventsFeed from './components/security-events-feed';
import AtRiskUsersPanel from './components/at-risk-users-panel';
import UserDetailModal from './components/user-detail-modal';
import RedisCacheStats from './components/redis-cache-stats';
import { ToastProvider } from './components/toast';
import { KPISkeleton, PanelSkeleton } from './components/skeleton';
import type { AtRiskUser } from '@/lib/monitoring/types';

// Auto-refresh intervals
const REFRESH_INTERVALS = [
  { label: '5s', value: 5000 },
  { label: '30s', value: 30000 },
  { label: '1m', value: 60000 },
  { label: 'Off', value: 0 },
];

export default function CommandCenterPage() {
  const [metrics, setMetrics] = useState<MonitoringMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(30000); // 30 seconds default
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [selectedUser, setSelectedUser] = useState<AtRiskUser | null>(null);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleViewUser = (user: AtRiskUser) => {
    setSelectedUser(user);
    setIsUserModalOpen(true);
  };

  const handleCloseUserModal = () => {
    setIsUserModalOpen(false);
    setSelectedUser(null);
  };

  const handleUserUpdated = () => {
    // Trigger refresh of at-risk users panel
    setRefreshTrigger((prev) => prev + 1);
  };

  // Fetch metrics from API
  const fetchMetrics = async () => {
    try {
      const response = await apiClient.get('/api/admin/monitoring/metrics');
      setMetrics(response as MonitoringMetrics);
      setLastUpdate(new Date());
      setError(null);
    } catch (err) {
      console.error('Failed to fetch metrics:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch metrics');
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchMetrics();
  }, []);

  // Auto-refresh setup
  useEffect(() => {
    if (!autoRefresh || refreshInterval === 0) {
      return;
    }

    const interval = setInterval(fetchMetrics, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval]);

  // Manual refresh handler
  const handleManualRefresh = () => {
    setLoading(true);
    fetchMetrics();
  };

  return (
    <ToastProvider>
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      {/* Page Header */}
      <div className="sm:flex sm:justify-between sm:items-center mb-8">
        {/* Left: Title */}
        <div className="mb-4 sm:mb-0">
          <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">
            Admin Command Center
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Real-time application monitoring and management
          </p>
        </div>

        {/* Right: Controls */}
        <div className="flex items-center gap-4">
          {/* Last Update */}
          {lastUpdate && (
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Updated: {lastUpdate.toLocaleTimeString()}
            </div>
          )}

          {/* Auto-refresh Toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="w-4 h-4 text-violet-500 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 rounded focus:ring-violet-500"
              aria-label="Enable auto-refresh"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Auto-refresh</span>
          </label>

          {/* Refresh Interval Selector */}
          {autoRefresh && (
            <select
              value={refreshInterval}
              onChange={(e) => setRefreshInterval(Number(e.target.value))}
              className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-violet-500"
              aria-label="Select refresh interval"
            >
              {REFRESH_INTERVALS.filter((interval) => interval.value > 0).map((interval) => (
                <option key={interval.value} value={interval.value}>
                  {interval.label}
                </option>
              ))}
            </select>
          )}

          {/* Manual Refresh Button */}
          <button
            onClick={handleManualRefresh}
            disabled={loading}
            className="px-4 py-2 bg-violet-500 text-white rounded-lg hover:bg-violet-600 disabled:bg-gray-400 transition-colors flex items-center gap-2"
            aria-label="Refresh dashboard metrics"
          >
            <svg
              className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-center gap-2 text-red-800 dark:text-red-200">
            <svg
              className="w-5 h-5"
              fill="currentColor"
              viewBox="0 0 20 20"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
            <span className="font-medium">Error loading metrics: {error}</span>
          </div>
        </div>
      )}

      {/* Loading State with Skeletons */}
      {loading && !metrics && (
        <div className="space-y-6">
          {/* Row 1: KPI Skeletons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
            <KPISkeleton />
            <KPISkeleton />
            <KPISkeleton />
            <KPISkeleton />
            <KPISkeleton />
          </div>

          {/* Row 2: Performance Skeletons */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <PanelSkeleton />
            <PanelSkeleton />
          </div>

          {/* Row 3: Cache & DB Skeletons */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <PanelSkeleton />
            <PanelSkeleton />
          </div>

          {/* Row 4: Security Skeletons */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <PanelSkeleton />
            <PanelSkeleton />
          </div>
        </div>
      )}

      {/* Dashboard Content */}
      {metrics && (
        <div className="space-y-6">
          {/* Row 1: KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
            <SystemHealthKPI systemHealth={metrics.systemHealth} />
            <ActiveUsersKPI activeUsers={metrics.activeUsers} />
            <ErrorRateKPI errorRate={metrics.performance.errors.rate} total={metrics.performance.errors.total} />
            <ResponseTimeKPI p95={metrics.performance.responseTime.p95} />
            <SecurityStatusKPI security={metrics.security} />
          </div>

          {/* Row 2: Performance Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Standard API Performance (detailed) */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">
                Standard API Performance
              </h3>
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">p50</div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                      {metrics.performance.responseTime.p50}ms
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">p95</div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                      {metrics.performance.responseTime.p95}ms
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">p99</div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                      {metrics.performance.responseTime.p99}ms
                    </div>
                  </div>
                </div>
                <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {metrics.performance.requests.total} requests • {metrics.performance.slowRequests.count} slow
                  </div>
                </div>
              </div>
            </div>

            {/* Analytics Performance */}
            <AnalyticsPerformanceKPI
              responseTime={metrics.analytics.responseTime}
              requestCount={metrics.analytics.requests.total}
              slowCount={metrics.analytics.slowRequests.count}
            />
          </div>

          {/* Row 3: Cache & Database */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RedisCacheStats
              autoRefresh={autoRefresh}
              refreshInterval={refreshInterval}
            />

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">
                Slow Queries
              </h3>
              <div className="text-gray-600 dark:text-gray-400 text-center py-8">
                Coming in Phase 4
              </div>
            </div>
          </div>

          {/* Row 4: Security Monitoring */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SecurityEventsFeed autoRefresh={autoRefresh} refreshInterval={refreshInterval} />
            <AtRiskUsersPanel
              autoRefresh={autoRefresh}
              refreshInterval={refreshInterval}
              onViewUser={handleViewUser}
              key={refreshTrigger}
            />
          </div>

          {/* User Detail Modal */}
          <UserDetailModal
            user={selectedUser}
            isOpen={isUserModalOpen}
            onClose={handleCloseUserModal}
            onUserUpdated={handleUserUpdated}
          />

          {/* Debug Info (Development Only) */}
          {process.env.NODE_ENV === 'development' && (
            <details className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
              <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300">
                Debug: Raw Metrics Data
              </summary>
              <pre className="mt-2 text-xs text-gray-600 dark:text-gray-400 overflow-x-auto">
                {JSON.stringify(metrics, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}
      </div>
    </ToastProvider>
  );
}

