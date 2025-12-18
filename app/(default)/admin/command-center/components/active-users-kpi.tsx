/**
 * Active Users KPI Card
 *
 * Displays count of currently active users (last 5 minutes).
 * Shows trend indicator if peak data is available.
 */

import { memo } from 'react';
import { Card } from '@/components/ui/card';

interface ActiveUsersKPIProps {
  activeUsers: {
    current: number;
    peak?: number;
    peakTime?: string;
  };
}

function ActiveUsersKPIInner({ activeUsers }: ActiveUsersKPIProps) {
  const { current, peak, peakTime } = activeUsers;

  // Calculate trend if we have peak data
  let trendIndicator = null;
  if (peak !== undefined && peak > 0) {
    const difference = current - peak;
    const percentChange = ((difference / peak) * 100).toFixed(0);
    const isPositive = difference > 0;

    trendIndicator = (
      <div className={`text-sm font-medium ${isPositive ? 'text-green-600' : 'text-gray-500'}`}>
        {isPositive ? '▲' : '▼'} {isPositive ? '+' : ''}
        {difference} ({percentChange}%)
      </div>
    );
  }

  return (
    <Card>
      {/* Header */}
      <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">Active Users</div>

      {/* User Count Display */}
      <div className="flex items-center gap-3 mb-3">
        <div className="text-4xl font-bold text-gray-900 dark:text-gray-100">{current}</div>
        <div className="h-12 w-12 rounded-full bg-violet-100 dark:bg-violet-900 flex items-center justify-center">
          <svg
            className="w-6 h-6 text-violet-600 dark:text-violet-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
        </div>
      </div>

      {/* Trend Indicator */}
      {trendIndicator || (
        <div className="text-sm text-gray-500 dark:text-gray-400">Last 5 minutes</div>
      )}

      {/* Peak Info */}
      {peak !== undefined && peakTime && (
        <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Peak: {peak} at {new Date(peakTime).toLocaleTimeString()}
        </div>
      )}
    </Card>
  );
}

const ActiveUsersKPI = memo(ActiveUsersKPIInner);
export default ActiveUsersKPI;
