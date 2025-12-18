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

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api/client';
import type { AtRiskUser, MonitoringMetrics } from '@/lib/monitoring/types';
import ActiveUsersKPI from './components/active-users-kpi';
import AtRiskUsersPanel from './components/at-risk-users-panel';
import { DashboardErrorBoundary } from './components/dashboard-error-boundary';
import EndpointPerformanceTable from './components/endpoint-performance-table';
import ErrorLogPanel from './components/error-log-panel';
import ErrorRateChart from './components/error-rate-chart';
import ErrorRateKPI from './components/error-rate-kpi';
import PerformanceChart from './components/performance-chart';
import RedisAdminTabs from './components/redis-admin-tabs';
import ResponseTimeKPI from './components/response-time-kpi';
import SecurityEventsFeed from './components/security-events-feed';
import SecurityStatusKPI from './components/security-status-kpi';
import { KPISkeleton, PanelSkeleton } from './components/skeleton';
import SlowQueriesPanel from './components/slow-queries-panel';
import SystemHealthKPI from './components/system-health-kpi';
import UserDetailModal from './components/user-detail-modal';
import { InlineAlert } from '@/components/ui/inline-alert';

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
  const [globalTimeRange, setGlobalTimeRange] = useState('1h');

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
  const fetchMetrics = useCallback(async () => {
    try {
      const response = await apiClient.get('/api/admin/monitoring/metrics');
      setMetrics(response as MonitoringMetrics);
      setLastUpdate(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch metrics');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  // Auto-refresh setup
  useEffect(() => {
    if (!autoRefresh || refreshInterval === 0) {
      return;
    }

    const interval = setInterval(fetchMetrics, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchMetrics]);

  // Manual refresh handler
  const handleManualRefresh = () => {
    setLoading(true);
    fetchMetrics();
  };

  return (
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
            {/* Time Range Selector */}
            <select
              value={globalTimeRange}
              onChange={(e) => setGlobalTimeRange(e.target.value)}
              className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-violet-500"
              aria-label="Select time range"
            >
              <option value="1h">Last Hour</option>
              <option value="6h">Last 6 Hours</option>
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
            </select>

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
            <button type="button" onClick={handleManualRefresh}
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
          <InlineAlert type="error" className="mb-6">
            Error loading metrics: {error}
          </InlineAlert>
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
            <DashboardErrorBoundary sectionName="KPI Dashboard">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
                <SystemHealthKPI systemHealth={metrics.systemHealth} />
                <ActiveUsersKPI activeUsers={metrics.activeUsers} />
                <ErrorRateKPI
                  errorRate={metrics.performance.errors.rate}
                  total={metrics.performance.errors.total}
                />
                <ResponseTimeKPI p95={metrics.performance.responseTime.p95} />
                <SecurityStatusKPI security={metrics.security} />
              </div>
            </DashboardErrorBoundary>

            {/* Row 2: Performance Charts */}
            <DashboardErrorBoundary sectionName="Performance Charts">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <PerformanceChart category="standard" timeRange={globalTimeRange} height={350} />
                <ErrorRateChart category="standard" timeRange={globalTimeRange} height={350} />
              </div>
            </DashboardErrorBoundary>

            {/* Row 2.5: Performance Tables */}
            <DashboardErrorBoundary sectionName="Performance Tables">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <EndpointPerformanceTable metrics={metrics} />
                <ErrorLogPanel
                  autoRefresh={autoRefresh}
                  refreshInterval={refreshInterval}
                  timeRange={globalTimeRange}
                />
              </div>
            </DashboardErrorBoundary>

            {/* Row 3: Cache & Database */}
            <DashboardErrorBoundary sectionName="Redis Cache">
              <div className="grid grid-cols-1 gap-6">
                <RedisAdminTabs autoRefresh={autoRefresh} refreshInterval={refreshInterval} />
              </div>
            </DashboardErrorBoundary>

            {/* Row 3.5: Slow Queries */}
            <DashboardErrorBoundary sectionName="Slow Queries">
              <div className="grid grid-cols-1 gap-6">
                <SlowQueriesPanel autoRefresh={autoRefresh} refreshInterval={refreshInterval} />
              </div>
            </DashboardErrorBoundary>

            {/* Row 4: Security Monitoring */}
            <DashboardErrorBoundary sectionName="Security Monitoring">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <SecurityEventsFeed autoRefresh={autoRefresh} refreshInterval={refreshInterval} />
                <AtRiskUsersPanel
                  autoRefresh={autoRefresh}
                  refreshInterval={refreshInterval}
                  onViewUser={handleViewUser}
                  key={refreshTrigger}
                />
              </div>
            </DashboardErrorBoundary>

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
  );
}
