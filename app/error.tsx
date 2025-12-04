'use client';

/**
 * Root Error Boundary
 *
 * This Next.js App Router error boundary catches errors in route segments
 * and provides a graceful fallback UI with retry capability.
 *
 * This boundary catches errors from all routes that don't have their own
 * error.tsx file.
 */

import { useEffect } from 'react';
import { ErrorDisplay } from '@/components/error-display';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function RootError({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log the error to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('Route error caught:', error);
    }
  }, [error]);

  return (
    <div role="alert" aria-live="assertive">
      <ErrorDisplay
        variant="full-page"
        error={error}
        title="Page"
        message="An error occurred while loading this page. Please try again."
        onRetry={reset}
        backLink="/dashboard"
        backLinkLabel="Go to Dashboard"
      />
    </div>
  );
}
