/**
 * ChartError Component
 *
 * Phase 4.3: Reusable error state display
 *
 * Extracts error UI from analytics-chart.tsx into a reusable component.
 * Provides consistent error display across all chart types with retry action.
 *
 * Benefits:
 * - Consistent error design across all charts
 * - User-friendly error messages
 * - Built-in retry action
 * - Easy to extend with additional error handling
 */

'use client';

import { AlertCircle, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Chart error props
 */
interface ChartErrorProps {
  /** Error message to display */
  error: string | Error;

  /** Retry callback - called when retry button is clicked */
  onRetry?: () => void;

  /** Chart title (optional, for context) */
  chartTitle?: string;

  /** Additional CSS classes */
  className?: string;
}

/**
 * ChartError
 *
 * Reusable error state component for analytics charts.
 *
 * @param props - Chart error props
 * @returns Error state component
 *
 * @example
 * ```tsx
 * {error && (
 *   <ChartError
 *     error={error}
 *     onRetry={refetch}
 *     chartTitle="Monthly Revenue"
 *   />
 * )}
 * ```
 */
export default function ChartError({
  error,
  onRetry,
  chartTitle,
  className = '',
}: ChartErrorProps) {
  // Extract error message
  const errorMessage = error instanceof Error ? error.message : error;

  // User-friendly error messages
  const getUserFriendlyMessage = (message: string): string => {
    if (message.includes('network') || message.includes('fetch')) {
      return 'Unable to connect to the server. Please check your internet connection.';
    }
    if (message.includes('unauthorized') || message.includes('403')) {
      return 'You do not have permission to view this chart.';
    }
    if (message.includes('not found') || message.includes('404')) {
      return 'The requested chart data could not be found.';
    }
    if (message.includes('timeout')) {
      return 'The request timed out. Please try again.';
    }
    if (message.includes('No handler registered')) {
      return 'This chart type is not supported.';
    }
    return message;
  };

  const friendlyMessage = getUserFriendlyMessage(errorMessage);

  return (
    <div
      className={`flex items-center justify-center h-64 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 ${className}`}
    >
      <div className="text-center max-w-md px-6">
        {/* Error icon */}
        <div className="flex justify-center mb-4">
          <div className="p-3 bg-red-100 dark:bg-red-900/20 rounded-full">
            <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
          </div>
        </div>

        {/* Error title */}
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
          {chartTitle ? `Unable to load ${chartTitle}` : 'Unable to load chart'}
        </h3>

        {/* Error message */}
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">{friendlyMessage}</p>

        {/* Retry button */}
        {onRetry && (
          <Button
            variant="violet"
            onClick={onRetry}
            leftIcon={<RefreshCcw className="w-4 h-4" />}
          >
            Try Again
          </Button>
        )}

        {/* Technical details (development only) */}
        {process.env.NODE_ENV === 'development' && (
          <details className="mt-6 text-left">
            <summary className="text-xs text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300">
              Technical Details
            </summary>
            <pre className="mt-2 p-3 bg-gray-100 dark:bg-gray-800 rounded text-xs text-gray-700 dark:text-gray-300 overflow-auto max-h-32">
              {errorMessage}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
