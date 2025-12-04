'use client';

/**
 * Auth Route Group Error Boundary
 *
 * This error boundary catches errors in authentication routes
 * (signin, reset-password, authenticating, saml-authenticated, etc.).
 *
 * It provides a clean, minimal UI consistent with auth page styling
 * and focuses on getting users back to the sign-in flow.
 */

import { useEffect } from 'react';
import { ErrorDisplay } from '@/components/error-display';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AuthError({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log the error to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('Auth route error caught:', error);
    }
  }, [error]);

  return (
    <div role="alert" aria-live="assertive">
      <ErrorDisplay
        variant="full-page"
        error={error}
        title="Authentication"
        message="An error occurred during the authentication process. Please try signing in again."
        onRetry={reset}
        backLink="/signin"
        backLinkLabel="Back to Sign In"
      />
    </div>
  );
}
