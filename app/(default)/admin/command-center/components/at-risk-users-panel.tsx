/**
 * At-Risk Users Panel Component
 *
 * Displays users with failed logins, locked accounts, or suspicious activity.
 * Features:
 * - Risk score badges with color coding
 * - Status indicators (locked, suspicious, monitoring)
 * - Click to view user details
 * - Sortable columns
 * - Summary statistics
 */

'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api/client';
import type { AtRiskUsersResponse, AtRiskUser } from '@/lib/monitoring/types';
import {
  getRiskCategory,
  getRiskIndicator,
  getRiskScoreColor,
  getRiskScoreBgColor,
} from '@/lib/monitoring/risk-score';
import { exportToCSV, formatDateForCSV } from '@/lib/utils/csv-export';

interface AtRiskUsersPanelProps {
  autoRefresh?: boolean;
  refreshInterval?: number;
  onViewUser?: (user: AtRiskUser) => void;
}

export default function AtRiskUsersPanel({
  autoRefresh = true,
  refreshInterval = 30000,
  onViewUser,
}: AtRiskUsersPanelProps) {
  const [data, setData] = useState<AtRiskUsersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleExport = () => {
    if (!data || data.users.length === 0) {
      return;
    }

    const exportData = data.users.map((user) => ({
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      riskScore: user.riskScore,
      failedAttempts: user.failedAttempts,
      recentAttempts24h: user.recentAttempts24h,
      uniqueIPs7d: user.uniqueIPs7d,
      lockedUntil: formatDateForCSV(user.lockedUntil),
      lastFailedAttempt: formatDateForCSV(user.lastFailedAttempt),
      suspiciousActivity: user.suspiciousActivity ? 'Yes' : 'No',
      lockoutReason: user.lockoutReason || '',
      riskFactors: user.riskFactors.join('; '),
    }));

    exportToCSV(
      exportData,
      {
        email: 'Email',
        firstName: 'First Name',
        lastName: 'Last Name',
        riskScore: 'Risk Score',
        failedAttempts: 'Failed Attempts',
        recentAttempts24h: 'Recent Attempts (24h)',
        uniqueIPs7d: 'Unique IPs (7d)',
        lockedUntil: 'Locked Until',
        lastFailedAttempt: 'Last Failed Attempt',
        suspiciousActivity: 'Suspicious',
        lockoutReason: 'Lockout Reason',
        riskFactors: 'Risk Factors',
      },
      'at-risk-users'
    );
  };

  const fetchUsers = async () => {
    try {
      const response = await apiClient.get('/api/admin/monitoring/at-risk-users?limit=10');
      setData(response as AtRiskUsersResponse);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch at-risk users:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch at-risk users');
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchUsers();
  }, []);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh || refreshInterval === 0) return;

    const interval = setInterval(fetchUsers, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6" role="region" aria-label="At-risk users">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">At-Risk Users</h3>
        <div className="flex items-center gap-2">
          {/* Export Button */}
          <button
            onClick={handleExport}
            disabled={!data || data.users.length === 0}
            className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Export to CSV"
          >
            <svg className="w-4 h-4 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>

          {/* Refresh Button */}
          <button
            onClick={() => {
              setLoading(true);
              fetchUsers();
            }}
            disabled={loading}
            className="text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 disabled:text-gray-400"
            title="Refresh users"
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
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-800 dark:text-red-200">
          {error}
        </div>
      )}

      {/* Loading State */}
      {loading && !data && (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500"></div>
        </div>
      )}

      {/* Content */}
      {data && (
        <>
          {/* Summary Cards */}
          {(data.summary.locked > 0 || data.summary.suspicious > 0) && (
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
                <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {data.summary.locked}
                </div>
                <div className="text-xs text-red-600 dark:text-red-400">Locked</div>
              </div>
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
                <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                  {data.summary.suspicious}
                </div>
                <div className="text-xs text-amber-600 dark:text-amber-400">Suspicious</div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                <div className="text-2xl font-bold text-gray-600 dark:text-gray-400">
                  {data.summary.monitoring}
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400">Monitoring</div>
              </div>
            </div>
          )}

          {/* Users List */}
          {data.users.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">✓</div>
              <div className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                No At-Risk Users
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                All user accounts are secure
              </div>
              <div className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                No failed login attempts or suspicious activity detected
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {data.users.map((user) => (
                <AtRiskUserRow key={user.userId} user={user} onView={onViewUser} />
              ))}
            </div>
          )}

          {/* Footer */}
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {data.totalCount} at-risk {data.totalCount === 1 ? 'user' : 'users'}
            </div>
            <div className="text-sm text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 font-medium cursor-pointer">
              View all →
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Individual at-risk user row
 */
interface AtRiskUserRowProps {
  user: AtRiskUser;
  onView: ((user: AtRiskUser) => void) | undefined;
}

function AtRiskUserRow({ user, onView }: AtRiskUserRowProps) {
  const now = new Date();
  const isLocked = user.lockedUntil && new Date(user.lockedUntil) > now;
  const category = getRiskCategory(user.riskScore);

  return (
    <div className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-violet-500 dark:hover:border-violet-500 transition-colors">
      <div className="flex items-center justify-between">
        {/* User Info */}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {user.firstName} {user.lastName}
            </div>
            {/* Risk Badge */}
            <span
              className={`px-2 py-0.5 ${getRiskScoreBgColor(user.riskScore)} ${getRiskScoreColor(user.riskScore)} text-xs font-medium rounded`}
            >
              {getRiskIndicator(category)} {user.riskScore}
            </span>
            {/* Status Badge */}
            {isLocked ? (
              <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 text-xs font-medium rounded">
                🔒 Locked
              </span>
            ) : user.suspiciousActivity ? (
              <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 text-xs font-medium rounded">
                ⚠️ Suspicious
              </span>
            ) : null}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{user.email}</div>
          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
            {user.failedAttempts} failed • {user.recentAttempts24h} in 24h • {user.uniqueIPs7d} IPs (7d)
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={() => onView?.(user)}
          className="px-3 py-1 text-sm text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 font-medium"
          aria-label={`Review security details for ${user.email}`}
        >
          Review
        </button>
      </div>
    </div>
  );
}

