/**
 * PageErrorBoundary Component
 *
 * A generic, reusable error boundary for wrapping page content.
 * Provides graceful fallback UI with retry capability.
 *
 * Benefits:
 * - Isolates page/section failures from crashing the entire app
 * - Prevents cascade failures across the page
 * - User-friendly error messages with contextual information
 * - Retry functionality to recover from transient errors
 * - Consistent styling with the application design system
 *
 * Usage:
 * ```tsx
 * <PageErrorBoundary context="User Settings" onRetry={() => refetch()}>
 *   <UserSettingsContent />
 * </PageErrorBoundary>
 * ```
 */

'use client';

import React, { type ReactNode } from 'react';
import { ErrorDisplay } from '@/components/error-display';
import { clientErrorLog } from '@/lib/utils/debug-client';

interface PageErrorBoundaryProps {
  children: ReactNode;
  /** Context name for error display (e.g., "User Settings", "Dashboard") */
  context?: string | undefined;
  /** Custom fallback UI to render when an error occurs */
  fallback?: ReactNode | undefined;
  /** Callback when an error is caught */
  onError?: ((error: Error, errorInfo: React.ErrorInfo) => void) | undefined;
  /** Custom retry handler (defaults to resetting error state) */
  onRetry?: (() => void) | undefined;
  /** Link to navigate to on "Go Back" action */
  backLink?: string | undefined;
  /** Label for the back link */
  backLinkLabel?: string | undefined;
  /** Whether to show technical details in development */
  showDevDetails?: boolean | undefined;
}

interface PageErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

/**
 * Error boundary component for page content
 *
 * Catches errors in child components and displays fallback UI
 * instead of crashing the entire page or application.
 */
export class PageErrorBoundary extends React.Component<
  PageErrorBoundaryProps,
  PageErrorBoundaryState
> {
  constructor(props: PageErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<PageErrorBoundaryState> {
    // Update state so next render shows fallback UI
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Client-side error logging
    clientErrorLog('Page rendering error caught by boundary', {
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
    // Call custom retry handler if provided
    if (this.props.onRetry) {
      this.props.onRetry();
    }

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

      const { context, backLink, backLinkLabel, showDevDetails = true } = this.props;

      // Default fallback UI using shared ErrorDisplay component
      return (
        <ErrorDisplay
          variant="full-page"
          error={this.state.error}
          title={context}
          onRetry={this.handleReset}
          backLink={backLink}
          backLinkLabel={backLinkLabel}
          showDevDetails={showDevDetails}
        />
      );
    }

    // No error, render children normally
    return this.props.children;
  }
}

/**
 * Higher-order component wrapper for easier usage
 *
 * @example
 * ```tsx
 * const ProtectedUserSettings = withPageErrorBoundary(
 *   UserSettings,
 *   'User Settings',
 *   '/dashboard'
 * );
 * ```
 */
export function withPageErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  context?: string | undefined,
  backLink?: string | undefined
): React.FC<P> {
  return function PageWithErrorBoundary(props: P) {
    return (
      <PageErrorBoundary context={context} backLink={backLink}>
        <Component {...props} />
      </PageErrorBoundary>
    );
  };
}

export default PageErrorBoundary;

