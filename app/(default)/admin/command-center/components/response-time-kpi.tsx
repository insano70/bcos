/**
 * Response Time KPI Card
 *
 * Displays p95 response time with threshold indicators.
 * Color-coded by performance thresholds:
 * - Green: < 300ms
 * - Yellow: 300-1000ms
 * - Red: > 1000ms
 */

interface ResponseTimeKPIProps {
  p95: number; // milliseconds
}

export default function ResponseTimeKPI({ p95 }: ResponseTimeKPIProps) {
  // Determine status based on SLOW_THRESHOLDS
  const getStatusColor = () => {
    if (p95 < 300) return 'text-green-600 dark:text-green-400';
    if (p95 < 1000) return 'text-amber-600 dark:text-amber-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getBgColor = () => {
    if (p95 < 300) return 'bg-green-100 dark:bg-green-900';
    if (p95 < 1000) return 'bg-amber-100 dark:bg-amber-900';
    return 'bg-red-100 dark:bg-red-900';
  };

  const getStatusIcon = () => {
    if (p95 < 300) return '⚡';
    if (p95 < 1000) return '⏱';
    return '🐌';
  };

  const getStatusText = () => {
    if (p95 < 300) return 'Excellent';
    if (p95 < 1000) return 'Good';
    return 'Slow';
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
      {/* Header */}
      <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">Response Time (p95)</div>

      {/* Response Time Display */}
      <div className="flex items-center gap-3 mb-3">
        <div className={`text-4xl font-bold ${getStatusColor()}`}>{p95}ms</div>
        <div
          className={`h-12 w-12 rounded-full ${getBgColor()} flex items-center justify-center`}
        >
          <span className="text-2xl">{getStatusIcon()}</span>
        </div>
      </div>

      {/* Status Text */}
      <div className={`text-sm font-medium ${getStatusColor()}`}>{getStatusText()}</div>

      {/* Threshold Indicator */}
      <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
        Target: &lt; 300ms (excellent), &lt; 1s (good)
      </div>
    </div>
  );
}

