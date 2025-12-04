'use client';

/**
 * Global Error Boundary
 *
 * This is a special Next.js App Router error boundary that catches errors
 * in the root layout. It must include its own <html> and <body> tags since
 * it completely replaces the root layout when an error occurs.
 *
 * This is the last line of defense for unhandled errors in the application.
 */

import { useEffect } from 'react';
import { AlertCircle, RefreshCcw } from 'lucide-react';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    // Log the error to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('Global error caught:', error);
    }
  }, [error]);

  return (
    <html lang="en">
      <body className="font-sans antialiased bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-400">
        <div role="alert" aria-live="assertive" className="min-h-screen flex items-center justify-center px-4">
          <div className="max-w-md w-full space-y-8 text-center">
            {/* Error Icon */}
            <div className="flex justify-center">
              <div className="rounded-full bg-red-100 dark:bg-red-900/20 p-4">
                <AlertCircle
                  className="w-16 h-16 text-red-600 dark:text-red-400"
                  aria-hidden="true"
                />
              </div>
            </div>

            {/* Error Title */}
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              Something went wrong
            </h1>

            {/* Error Message */}
            <p className="text-gray-600 dark:text-gray-400">
              An unexpected error occurred. We apologize for the inconvenience.
            </p>

            {/* Error Details (Development Only) */}
            {process.env.NODE_ENV === 'development' && (
              <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/10 rounded-lg text-left">
                <p className="text-sm font-mono text-red-800 dark:text-red-300 break-all">
                  {error.message}
                </p>
                {error.digest && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-2">
                    Error ID: {error.digest}
                  </p>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-medium rounded-lg hover:bg-gray-800 dark:hover:bg-white transition-colors"
              >
                <RefreshCcw className="w-5 h-5" />
                Try Again
              </button>
              <a
                href="/signin"
                className="inline-flex items-center justify-center px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Return to Sign In
              </a>
            </div>

            {/* Help Text */}
            <p className="text-sm text-gray-500 dark:text-gray-500 pt-4">
              If this problem persists, please contact support.
            </p>
          </div>
        </div>
      </body>
    </html>
  );
}
