/**
 * WorkItemErrorBoundary Component
 *
 * Catches work item rendering errors to prevent entire page from crashing.
 * Provides graceful fallback UI with retry capability.
 *
 * Benefits:
 * - Isolates work item failures
 * - Prevents cascade failures across the page
 * - User-friendly error messages
 * - Retry functionality
 */

'use client';

import React, { type ReactNode } from 'react';
import { clientErrorLog } from '@/lib/utils/debug-client';

interface WorkItemErrorBoundaryProps {
  children: ReactNode;
  context?: string | undefined;
  fallback?: ReactNode | undefined;
  onError?: ((error: Error, errorInfo: React.ErrorInfo) => void) | undefined;
}

interface WorkItemErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

/**
 * Error boundary component for work item rendering
 *
 * Catches errors in child work item components and displays fallback UI
 * instead of crashing the entire page.
 */
export class WorkItemErrorBoundary extends React.Component<
  WorkItemErrorBoundaryProps,
  WorkItemErrorBoundaryState
> {
  constructor(props: WorkItemErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<WorkItemErrorBoundaryState> {
    // Update state so next render shows fallback UI
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Client-side error logging
    clientErrorLog('Work item rendering error caught by boundary', {
      context: this.props.context || 'Unknown',
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });

    // Update state with error info
    this.setState({
      errorInfo,
    });

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
      errorInfo: null,
    });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Custom fallback UI if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div
          role="alert"
          aria-live="assertive"
          className="flex flex-col items-center justify-center min-h-[200px] bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-6"
        >
          <div className="text-center">
            {/* Error icon */}
            <svg
              aria-hidden="true"
              className="w-12 h-12 text-amber-600 dark:text-amber-400 mx-auto mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>

            {/* Error title */}
            <h3 className="text-lg font-semibold text-amber-800 dark:text-amber-200 mb-2">
              {this.props.context
                ? `${this.props.context} Failed to Load`
                : 'Work Item Failed to Load'}
            </h3>

            {/* Error message */}
            <p className="text-sm text-amber-600 dark:text-amber-400 mb-4 max-w-md">
              {process.env.NODE_ENV === 'development' && this.state.error ? (
                <>
                  <span className="font-mono text-xs block mb-2">{this.state.error.message}</span>
                  <details className="text-left">
                    <summary className="cursor-pointer hover:text-amber-800 dark:hover:text-amber-200">
                      View Details
                    </summary>
                    <pre className="mt-2 text-xs overflow-auto max-h-32 bg-amber-100 dark:bg-amber-900/40 p-2 rounded">
                      {this.state.error.stack}
                    </pre>
                  </details>
                </>
              ) : (
                'An error occurred while loading this work item. Please try refreshing.'
              )}
            </p>

            {/* Retry button */}
            <button
              type="button"
              onClick={this.handleReset}
              className="inline-flex items-center px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors duration-200"
            >
              <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Try Again
            </button>
          </div>
        </div>
      );
    }

    // No error, render children normally
    return this.props.children;
  }
}

/**
 * Functional wrapper for easier usage with work item components
 */
export function withWorkItemErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  context?: string | undefined
): React.FC<P> {
  return function WorkItemWithErrorBoundary(props: P) {
    return (
      <WorkItemErrorBoundary context={context}>
        <Component {...props} />
      </WorkItemErrorBoundary>
    );
  };
}

export default WorkItemErrorBoundary;

