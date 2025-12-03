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
import { ErrorDisplay } from '@/components/error-display';
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

      // Default fallback UI using shared ErrorDisplay component
      return (
        <ErrorDisplay
          variant="card"
          error={this.state.error}
          title={this.props.context || 'Work Item'}
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

