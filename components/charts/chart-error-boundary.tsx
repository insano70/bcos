/**
 * ChartErrorBoundary Component
 * 
 * Phase 2: Safety Net
 * 
 * Catches chart rendering errors to prevent entire dashboard from crashing.
 * Provides graceful fallback UI with retry capability.
 * 
 * Benefits:
 * - Isolates chart failures
 * - Prevents cascade failures
 * - User-friendly error messages
 * - Retry functionality
 */

'use client';

import React, { type ReactNode } from 'react';
import { ErrorDisplay } from '@/components/error-display';
import { clientComponentError } from '@/lib/utils/debug-client';

interface ChartErrorBoundaryProps {
  children: ReactNode;
  chartName?: string | undefined;
  fallback?: ReactNode | undefined;
  onError?: ((error: Error, errorInfo: React.ErrorInfo) => void) | undefined;
}

interface ChartErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary component for chart rendering
 * 
 * Catches errors in child chart components and displays fallback UI
 * instead of crashing the entire dashboard.
 */
export class ChartErrorBoundary extends React.Component<
  ChartErrorBoundaryProps,
  ChartErrorBoundaryState
> {
  constructor(props: ChartErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ChartErrorBoundaryState> {
    // Update state so next render shows fallback UI
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Client-side error logging using specialized component error logger
    clientComponentError(
      this.props.chartName || 'ChartErrorBoundary',
      error,
      { componentStack: errorInfo.componentStack }
    );

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleReset = (): void => {
    // Reset error state to retry rendering
    this.setState({
      hasError: false,
      error: null,
    });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Custom fallback UI if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI using shared ErrorDisplay component
      return (
        <ErrorDisplay
          variant="card"
          error={this.state.error}
          title={this.props.chartName || 'Chart'}
          onRetry={this.handleReset}
          className="min-h-[200px]"
        />
      );
    }

    // No error, render children normally
    return this.props.children;
  }
}

/**
 * Functional wrapper for easier usage
 */
export function withChartErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  chartName?: string | undefined
): React.FC<P> {
  return function ChartWithErrorBoundary(props: P) {
    return (
      <ChartErrorBoundary chartName={chartName}>
        <Component {...props} />
      </ChartErrorBoundary>
    );
  };
}

export default ChartErrorBoundary;
