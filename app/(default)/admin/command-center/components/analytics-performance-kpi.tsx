/**
 * Analytics Performance KPI Card
 *
 * Displays p95 response time for analytics/dashboard queries.
 * Analytics queries are expected to be slower due to complex aggregations.
 *
 * Color-coded by analytics-specific thresholds:
 * - Green: < 2s (excellent)
 * - Yellow: 2-5s (good, acceptable)
 * - Red: > 5s (slow, needs optimization)
 */

import { memo } from 'react';
import { Card } from '@/components/ui/card';
import type { PercentileStats } from '@/lib/monitoring/types';

interface AnalyticsPerformanceKPIProps {
  responseTime: PercentileStats;
  requestCount: number;
  slowCount: number;
}

function AnalyticsPerformanceKPIInner({
  responseTime,
  requestCount,
  slowCount,
}: AnalyticsPerformanceKPIProps) {
  const p95 = responseTime.p95;

  // Determine status based on analytics-specific thresholds
  const getStatusColor = () => {
    if (p95 < 2000) return 'text-green-600 dark:text-green-400';
    if (p95 < 5000) return 'text-amber-600 dark:text-amber-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getBgColor = () => {
    if (p95 < 2000) return 'bg-green-100 dark:bg-green-900';
    if (p95 < 5000) return 'bg-amber-100 dark:bg-amber-900';
    return 'bg-red-100 dark:bg-red-900';
  };

  const getStatusIcon = () => {
    if (p95 < 2000) return '📊';
    if (p95 < 5000) return '⏱';
    return '🐌';
  };

  const getStatusText = () => {
    if (p95 < 2000) return 'Excellent';
    if (p95 < 5000) return 'Good';
    return 'Needs Optimization';
  };

  // Format duration for display
  const formatDuration = (ms: number): string => {
    if (ms >= 1000) {
      return `${(ms / 1000).toFixed(1)}s`;
    }
    return `${ms}ms`;
  };

  return (
    <Card>
      {/* Header */}
      <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">
        Analytics Performance (p95)
      </div>

      {/* Response Time Display */}
      <div className="flex items-center gap-3 mb-3">
        <div className={`text-4xl font-bold ${getStatusColor()}`}>{formatDuration(p95)}</div>
        <div className={`h-12 w-12 rounded-full ${getBgColor()} flex items-center justify-center`}>
          <span className="text-2xl">{getStatusIcon()}</span>
        </div>
      </div>

      {/* Status Text */}
      <div className={`text-sm font-medium ${getStatusColor()} mb-2`}>{getStatusText()}</div>

      {/* Request Stats */}
      <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
        <div>
          {requestCount} {requestCount === 1 ? 'query' : 'queries'} (last 5 min)
        </div>
        {slowCount > 0 && (
          <div className="text-amber-600 dark:text-amber-400">
            {slowCount} slow (&gt;5s) • {((slowCount / requestCount) * 100).toFixed(1)}%
          </div>
        )}
      </div>

      {/* Threshold Info */}
      <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
        Target: &lt;2s (excellent), &lt;5s (good)
      </div>

      {/* Expandable Details */}
      {responseTime.count > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 font-medium">
            View percentiles
          </summary>
          <div className="mt-2 space-y-1 text-xs text-gray-600 dark:text-gray-400">
            <div className="flex justify-between">
              <span>p50 (median):</span>
              <span className="font-medium">{formatDuration(responseTime.p50)}</span>
            </div>
            <div className="flex justify-between">
              <span>p95:</span>
              <span className="font-medium">{formatDuration(responseTime.p95)}</span>
            </div>
            <div className="flex justify-between">
              <span>p99:</span>
              <span className="font-medium">{formatDuration(responseTime.p99)}</span>
            </div>
            <div className="flex justify-between">
              <span>Average:</span>
              <span className="font-medium">{formatDuration(responseTime.avg)}</span>
            </div>
            <div className="flex justify-between">
              <span>Range:</span>
              <span className="font-medium">
                {formatDuration(responseTime.min)} - {formatDuration(responseTime.max)}
              </span>
            </div>
          </div>
        </details>
      )}
    </Card>
  );
}

const AnalyticsPerformanceKPI = memo(AnalyticsPerformanceKPIInner);
export default AnalyticsPerformanceKPI;
