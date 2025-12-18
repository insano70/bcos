/**
 * Security Events Feed Component
 *
 * Displays live feed of security events from CloudWatch Logs.
 * Features:
 * - Color-coded severity indicators
 * - Auto-refresh every 30 seconds
 * - Expandable event details
 * - Severity filtering
 * - Time range selector
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { apiClient } from '@/lib/api/client';
import type { SecurityEvent, SecurityEventsResponse } from '@/lib/monitoring/types';
import { exportToCSV, formatDateForCSV } from '@/lib/utils/csv-export';
import { clientErrorLog } from '@/lib/utils/debug-client';

interface SecurityEventsFeedProps {
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export default function SecurityEventsFeed({
  autoRefresh = true,
  refreshInterval = 30000,
}: SecurityEventsFeedProps) {
  const [data, setData] = useState<SecurityEventsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState('1h');
  const [severityFilter, setSeverityFilter] = useState<string>('all');

  const handleExport = () => {
    if (!data || data.events.length === 0) {
      return;
    }

    const exportData = data.events.map((event) => ({
      timestamp: formatDateForCSV(event.timestamp),
      severity: event.severity,
      event: event.event,
      message: event.message,
      blocked: event.blocked ? 'Yes' : 'No',
      threat: event.threat || '',
      ipAddress: (event.details.ipAddress as string) || '',
      userId: (event.details.userId as string) || '',
      action: event.action,
    }));

    exportToCSV(
      exportData,
      {
        timestamp: 'Timestamp',
        severity: 'Severity',
        event: 'Event Type',
        message: 'Message',
        blocked: 'Blocked',
        threat: 'Threat',
        ipAddress: 'IP Address',
        userId: 'User ID',
        action: 'Action',
      },
      'security-events'
    );
  };

  const fetchEvents = useCallback(async () => {
    try {
      let url = `/api/admin/monitoring/security-events?timeRange=${timeRange}`;

      if (severityFilter !== 'all') {
        url += `&severity=${severityFilter}`;
      }

      const response = await apiClient.get(url);
      setData(response as SecurityEventsResponse);
      setError(null);
    } catch (err) {
      clientErrorLog('Failed to fetch security events', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch security events');
    } finally {
      setLoading(false);
    }
  }, [timeRange, severityFilter]);

  // Initial fetch
  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh || refreshInterval === 0) return;

    const interval = setInterval(fetchEvents, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchEvents]);

  return (
    <Card
      role="region"
      aria-label="Security events"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Security Events</h3>
        <div className="flex items-center gap-2">
          {/* Severity Filter */}
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300"
          >
            <option value="all">All Severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          {/* Time Range */}
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300"
          >
            <option value="1h">Last Hour</option>
            <option value="6h">Last 6 Hours</option>
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
          </select>

          {/* Export Button */}
          <button type="button" onClick={handleExport}
            disabled={!data || data.events.length === 0}
            className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Export to CSV"
          >
            <svg
              className="w-4 h-4 inline-block"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
          </button>

          {/* Manual Refresh */}
          <button type="button" onClick={() => {
              setLoading(true);
              fetchEvents();
            }}
            disabled={loading}
            className="text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 disabled:text-gray-400"
            title="Refresh events"
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
          <Spinner size="md" />
        </div>
      )}

      {/* Events Feed */}
      {data && (
        <>
          {/* Summary Badges */}
          {(data.summary.critical > 0 || data.summary.high > 0) && (
            <div className="flex gap-2 mb-4">
              {data.summary.critical > 0 && (
                <Badge color="red" shape="rounded">
                  {data.summary.critical} Critical
                </Badge>
              )}
              {data.summary.high > 0 && (
                <Badge color="amber" shape="rounded">
                  {data.summary.high} High
                </Badge>
              )}
            </div>
          )}

          {/* Events List */}
          {data.events.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">🛡️</div>
              <div className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                All Clear!
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                No security events detected in the last {timeRange}
              </div>
              <div className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                Your application security is working as expected
              </div>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {data.events.map((event) => (
                <SecurityEventItem key={event.id} event={event} />
              ))}
            </div>
          )}

          {/* Footer */}
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {data.totalCount} {data.totalCount === 1 ? 'event' : 'events'} (last {timeRange})
            </div>
            <div className="text-sm text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 font-medium cursor-pointer">
              View all →
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

/**
 * Individual security event item
 */
interface SecurityEventItemProps {
  event: SecurityEvent;
}

function SecurityEventItem({ event }: SecurityEventItemProps) {
  const [expanded, setExpanded] = useState(false);

  const severityConfig = {
    critical: { emoji: '🔴', color: 'text-red-600 dark:text-red-400' },
    high: { emoji: '🔴', color: 'text-red-600 dark:text-red-400' },
    medium: { emoji: '🟡', color: 'text-amber-600 dark:text-amber-400' },
    low: { emoji: '🟢', color: 'text-green-600 dark:text-green-400' },
  }[event.severity];

  return (
    <div className="p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
      <div className="flex items-start gap-3">
        {/* Severity Indicator */}
        <div className={`text-lg ${severityConfig.color}`}>{severityConfig.emoji}</div>

        {/* Event Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {event.message}
            </span>
            {event.blocked && (
              <Badge color="red" size="sm" shape="rounded">
                Blocked
              </Badge>
            )}
          </div>

          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {new Date(event.timestamp).toLocaleString()}
            {event.details.ipAddress ? ` • ${String(event.details.ipAddress)}` : ''}
            {event.threat ? ` • ${event.threat}` : ''}
          </div>

          {/* Expandable Details */}
          {expanded && (
            <div className="mt-2 p-2 bg-gray-100 dark:bg-gray-700 rounded text-xs space-y-1">
              <div className="font-medium text-gray-700 dark:text-gray-300">Event Details:</div>
              {Object.entries(event.details).map(([key, value]) => (
                <div key={key} className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">{key}:</span>
                  <span className="text-gray-800 dark:text-gray-200 font-mono">
                    {value !== null && value !== undefined ? String(value) : 'N/A'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Expand Button */}
        <button type="button" onClick={() => setExpanded(!expanded)}
          className="text-xs text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 flex-shrink-0"
        >
          {expanded ? 'Hide' : 'Details'}
        </button>
      </div>
    </div>
  );
}
