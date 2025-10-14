/**
 * Error Rate KPI Card
 *
 * Displays error rate percentage with color-coded status.
 * Shows total error count and trend indicator.
 *
 * Thresholds:
 * - Green: < 1%
 * - Yellow: 1-5%
 * - Red: > 5%
 */

interface ErrorRateKPIProps {
  errorRate: number; // Percentage (0-100)
  total: number; // Total error count
}

export default function ErrorRateKPI({ errorRate, total }: ErrorRateKPIProps) {
  // Determine status color based on error rate thresholds
  const getStatusColor = () => {
    if (errorRate < 1) return 'text-green-600 dark:text-green-400';
    if (errorRate < 5) return 'text-amber-600 dark:text-amber-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getBgColor = () => {
    if (errorRate < 1) return 'bg-green-100 dark:bg-green-900';
    if (errorRate < 5) return 'bg-amber-100 dark:bg-amber-900';
    return 'bg-red-100 dark:bg-red-900';
  };

  const getStatusIcon = () => {
    if (errorRate < 1) return '✓';
    if (errorRate < 5) return '⚠';
    return '✗';
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
      {/* Header */}
      <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">Error Rate</div>

      {/* Error Rate Display */}
      <div className="flex items-center gap-3 mb-3">
        <div className={`text-4xl font-bold ${getStatusColor()}`}>
          {errorRate.toFixed(1)}%
        </div>
        <div
          className={`h-12 w-12 rounded-full ${getBgColor()} flex items-center justify-center`}
        >
          <span className={`text-2xl ${getStatusColor()}`}>{getStatusIcon()}</span>
        </div>
      </div>

      {/* Total Error Count */}
      <div className="text-sm text-gray-600 dark:text-gray-400">
        {total} {total === 1 ? 'error' : 'errors'} (last 5 min)
      </div>

      {/* Status Message */}
      <div className={`text-xs font-medium mt-2 ${getStatusColor()}`}>
        {errorRate < 1 && 'Excellent'}
        {errorRate >= 1 && errorRate < 5 && 'Monitor closely'}
        {errorRate >= 5 && 'Immediate attention required'}
      </div>
    </div>
  );
}

