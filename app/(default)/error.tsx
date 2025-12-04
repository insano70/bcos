'use client';

/**
 * Default Route Group Error Boundary
 *
 * This error boundary catches errors in the main application routes
 * (dashboard, configure, admin, work, data, settings, tasks).
 *
 * It provides a styled fallback UI that matches the application's design
 * and includes navigation options to help users recover.
 */

import { useEffect } from 'react';
import { ErrorDisplay } from '@/components/error-display';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function DefaultError({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log the error to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('Default route error caught:', error);
    }
  }, [error]);

  return (
    <div role="alert" aria-live="assertive">
      <ErrorDisplay
        variant="full-page"
        error={error}
        title="Page"
        message="We encountered an error while loading this page. This has been logged and we'll look into it."
        onRetry={reset}
        backLink="/dashboard"
        backLinkLabel="Go to Dashboard"
      />
    </div>
  );
}
