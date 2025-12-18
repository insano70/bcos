/**
 * System Health KPI Card
 *
 * Displays overall system health score (0-100) with expandable factor breakdown.
 * Color-coded by health status:
 * - Green (90-100): Healthy
 * - Yellow (70-89): Degraded
 * - Red (<70): Unhealthy
 */

import { memo } from 'react';
import { Card } from '@/components/ui/card';
import {
  getFactorColor,
  getFactorIndicator,
  getHealthScoreBgColor,
  getHealthScoreColor,
} from '@/lib/monitoring/health-score';
import type { SystemHealth } from '@/lib/monitoring/types';

interface SystemHealthKPIProps {
  systemHealth: SystemHealth;
}

function SystemHealthKPIInner({ systemHealth }: SystemHealthKPIProps) {
  const { status, score, factors } = systemHealth;

  // Determine status icon and text
  const statusConfig = {
    healthy: {
      icon: '✓',
      text: 'Healthy',
      color: 'text-green-600 dark:text-green-400',
    },
    degraded: {
      icon: '⚠',
      text: 'Degraded',
      color: 'text-amber-600 dark:text-amber-400',
    },
    unhealthy: {
      icon: '✗',
      text: 'Unhealthy',
      color: 'text-red-600 dark:text-red-400',
    },
  }[status];

  return (
    <Card>
      {/* Header */}
      <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">System Health</div>

      {/* Score Display */}
      <div className="flex items-center gap-3 mb-3">
        <div className={`text-4xl font-bold ${getHealthScoreColor(score)}`}>{score}%</div>
        <div
          className={`h-12 w-12 rounded-full ${getHealthScoreBgColor(score)} flex items-center justify-center`}
        >
          <span className={`text-2xl ${statusConfig.color}`}>{statusConfig.icon}</span>
        </div>
      </div>

      {/* Status Text */}
      <div className={`text-sm font-medium ${statusConfig.color} mb-4`}>
        {getFactorIndicator(status)} {statusConfig.text}
      </div>

      {/* Expandable Factor Breakdown */}
      <details className="mt-4">
        <summary className="cursor-pointer text-sm text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 font-medium">
          View health factors
        </summary>
        <div className="mt-3 space-y-2">
          <HealthFactor label="Error Rate" status={factors.errorRate} />
          <HealthFactor label="Response Time" status={factors.responseTime} />
          <HealthFactor label="Cache Performance" status={factors.cachePerformance} />
          <HealthFactor label="Database Latency" status={factors.databaseLatency} />
          <HealthFactor label="Security Events" status={factors.uptime} />
        </div>
      </details>
    </Card>
  );
}

/**
 * Individual health factor display
 */
interface HealthFactorProps {
  label: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
}

const HealthFactor = memo(function HealthFactor({ label, status }: HealthFactorProps) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-600 dark:text-gray-400">{label}</span>
      <span className={`font-medium ${getFactorColor(status)}`}>
        {getFactorIndicator(status)} {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    </div>
  );
});

const SystemHealthKPI = memo(SystemHealthKPIInner);
export default SystemHealthKPI;
