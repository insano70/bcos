/**
 * Dashboard Error Boundary Component
 *
 * Catches errors in the Command Center dashboard to prevent entire page from crashing.
 * Provides graceful fallback UI with retry capability.
 */

'use client';

import React, { type ReactNode } from 'react';
import { ErrorDisplay } from '@/components/error-display';
import { clientComponentError } from '@/lib/utils/debug-client';

interface DashboardErrorBoundaryProps {
  children: ReactNode;
  sectionName?: string | undefined;
  fallback?: ReactNode | undefined;
}

interface DashboardErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary component for dashboard sections
 *
 * Catches errors in child components and displays fallback UI
 * instead of crashing the entire dashboard.
 */
export class DashboardErrorBoundary extends React.Component<
  DashboardErrorBoundaryProps,
  DashboardErrorBoundaryState
> {
  constructor(props: DashboardErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<DashboardErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Client-side error logging using proper client-safe logging utility
    clientComponentError(
      this.props.sectionName || 'DashboardSection',
      error,
      { componentStack: errorInfo.componentStack }
    );
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
    });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI using shared ErrorDisplay component
      return (
        <ErrorDisplay
          variant="card"
          error={this.state.error}
          title={this.props.sectionName || 'Section'}
          onRetry={this.handleReset}
          className="min-h-[200px]"
        />
      );
    }

    return this.props.children;
  }
}

export default DashboardErrorBoundary;

