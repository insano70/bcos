/**
 * ErrorDisplay Component
 *
 * A unified, reusable error display system with multiple variants for different contexts.
 * Provides consistent error UI across the application.
 *
 * Variants:
 * - `full-page`: For error boundaries and route-level errors (centered, large)
 * - `card`: For React Query errors within page sections (contained, medium)
 * - `inline`: For inline error states in data lists/tables (compact, horizontal)
 * - `alert`: For form submission errors and notifications (banner-style)
 *
 * Features:
 * - User-friendly error message translation
 * - Retry functionality with callback
 * - Optional navigation link
 * - Development-only technical details
 * - Dark mode support
 * - Accessible (role="alert", aria-live)
 *
 * @example
 * ```tsx
 * // Full page error (error boundaries)
 * <ErrorDisplay
 *   variant="full-page"
 *   error={error}
 *   title="Users"
 *   onRetry={() => refetch()}
 *   backLink="/dashboard"
 * />
 *
 * // Card error (React Query)
 * <ErrorDisplay
 *   variant="card"
 *   error={error}
 *   title="User List"
 *   onRetry={() => refetch()}
 * />
 *
 * // Inline error
 * <ErrorDisplay
 *   variant="inline"
 *   error={error}
 *   onRetry={() => refetch()}
 * />
 *
 * // Alert error (forms)
 * <ErrorDisplay
 *   variant="alert"
 *   error="Failed to save changes"
 *   onDismiss={() => setError(null)}
 * />
 * ```
 */

'use client';

import Link from 'next/link';
import { AlertCircle, RefreshCcw, X } from 'lucide-react';

/**
 * Error display variant types
 */
export type ErrorDisplayVariant = 'full-page' | 'card' | 'inline' | 'alert';

/**
 * Error display props
 */
export interface ErrorDisplayProps {
  /** Display variant */
  variant?: ErrorDisplayVariant | undefined;
  /** Error to display (string or Error object) */
  error: string | Error | null | undefined;
  /** Context title for error message (e.g., "Users", "Dashboard") */
  title?: string | undefined;
  /** Custom error message (overrides automatic translation) */
  message?: string | undefined;
  /** Retry callback */
  onRetry?: (() => void) | undefined;
  /** Retry button label */
  retryLabel?: string | undefined;
  /** Dismiss callback (for alert variant) */
  onDismiss?: (() => void) | undefined;
  /** Navigation link URL */
  backLink?: string | undefined;
  /** Navigation link label */
  backLinkLabel?: string | undefined;
  /** Show technical details in development */
  showDevDetails?: boolean | undefined;
  /** Additional CSS classes */
  className?: string | undefined;
}

/**
 * Translate error messages to user-friendly text
 */
function getUserFriendlyMessage(error: string | Error | null | undefined): string {
  if (!error) return 'An unexpected error occurred.';
  
  const message = error instanceof Error ? error.message : error;
  const lowerMessage = message.toLowerCase();

  // Network errors
  if (lowerMessage.includes('network') || lowerMessage.includes('fetch') || lowerMessage.includes('failed to fetch')) {
    return 'Unable to connect to the server. Please check your internet connection.';
  }

  // Authentication errors
  if (lowerMessage.includes('unauthorized') || lowerMessage.includes('401') || lowerMessage.includes('authentication')) {
    return 'Your session has expired. Please sign in again.';
  }

  // Authorization errors
  if (lowerMessage.includes('forbidden') || lowerMessage.includes('403') || lowerMessage.includes('permission')) {
    return 'You do not have permission to access this resource.';
  }

  // Not found errors
  if (lowerMessage.includes('not found') || lowerMessage.includes('404')) {
    return 'The requested resource could not be found.';
  }

  // Timeout errors
  if (lowerMessage.includes('timeout') || lowerMessage.includes('timed out')) {
    return 'The request timed out. Please try again.';
  }

  // Validation errors
  if (lowerMessage.includes('validation') || lowerMessage.includes('invalid')) {
    return 'Please check your input and try again.';
  }

  // Rate limit errors
  if (lowerMessage.includes('rate limit') || lowerMessage.includes('too many requests') || lowerMessage.includes('429')) {
    return 'Too many requests. Please wait a moment and try again.';
  }

  // Server errors
  if (lowerMessage.includes('server error') || lowerMessage.includes('500') || lowerMessage.includes('internal error')) {
    return 'A server error occurred. Please try again later.';
  }

  // Return original message if no match
  return message;
}

/**
 * Get raw error message for technical details
 */
function getRawErrorMessage(error: string | Error | null | undefined): string {
  if (!error) return 'Unknown error';
  return error instanceof Error ? error.message : error;
}

/**
 * Get error stack trace if available
 */
function getErrorStack(error: string | Error | null | undefined): string | undefined {
  if (error instanceof Error) {
    return error.stack;
  }
  return undefined;
}

/**
 * Error Icon Component
 */
function ErrorIcon({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'w-5 h-5',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  };

  return (
    <AlertCircle className={`${sizeClasses[size]} text-red-600 dark:text-red-400`} />
  );
}

/**
 * Retry Button Component
 */
function RetryButton({ 
  onClick, 
  label = 'Try Again',
  variant = 'primary' 
}: { 
  onClick: () => void; 
  label?: string | undefined;
  variant?: 'primary' | 'secondary' | undefined;
}) {
  const baseClasses = 'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-colors';
  const variantClasses = {
    primary: 'px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white',
    secondary: 'px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${baseClasses} ${variantClasses[variant]}`}
    >
      <RefreshCcw className="w-4 h-4" />
      {label}
    </button>
  );
}

/**
 * Technical Details Component (Development Only)
 */
function TechnicalDetails({ error }: { error: string | Error | null | undefined }) {
  if (process.env.NODE_ENV !== 'development') return null;

  const rawMessage = getRawErrorMessage(error);
  const stack = getErrorStack(error);

  return (
    <details className="mt-4 text-left">
      <summary className="text-xs text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300">
        Technical Details
      </summary>
      <div className="mt-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
        <p className="text-sm font-mono text-red-800 dark:text-red-300 break-all">
          {rawMessage}
        </p>
        {stack && (
          <pre className="mt-2 text-xs overflow-auto max-h-32 bg-red-100 dark:bg-red-900/40 p-2 rounded text-red-700 dark:text-red-300">
            {stack}
          </pre>
        )}
      </div>
    </details>
  );
}

/**
 * Full Page Error Display
 * Used for error boundaries and route-level errors
 */
function FullPageError({
  error,
  title,
  message,
  onRetry,
  retryLabel,
  backLink,
  backLinkLabel,
  showDevDetails = true,
}: {
  error: string | Error | null | undefined;
  title?: string | undefined;
  message?: string | undefined;
  onRetry?: (() => void) | undefined;
  retryLabel?: string | undefined;
  backLink?: string | undefined;
  backLinkLabel?: string | undefined;
  showDevDetails?: boolean | undefined;
}) {
  const displayMessage = message || getUserFriendlyMessage(error);
  const displayTitle = title ? `${title} Failed to Load` : 'Something went wrong';

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="max-w-lg w-full">
          <div
            role="alert"
            aria-live="assertive"
            className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 border border-gray-200 dark:border-gray-700"
          >
            {/* Error Icon */}
            <div className="flex justify-center mb-6">
              <div className="rounded-full bg-red-100 dark:bg-red-900/20 p-4">
                <ErrorIcon size="lg" />
              </div>
            </div>

            {/* Title */}
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 text-center mb-3">
              {displayTitle}
            </h2>

            {/* Message */}
            <p className="text-gray-600 dark:text-gray-400 text-center mb-6">
              {displayMessage}
            </p>

            {/* Technical Details */}
            {showDevDetails && <TechnicalDetails error={error} />}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 mt-6">
              {onRetry && (
                <div className="flex-1">
                  <RetryButton onClick={onRetry} label={retryLabel} variant="primary" />
                </div>
              )}
              {backLink && (
                <Link
                  href={backLink}
                  className="flex-1 inline-flex items-center justify-center px-5 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  {backLinkLabel || 'Go Back'}
                </Link>
              )}
            </div>
          </div>

          {/* Help Text */}
          <p className="text-sm text-gray-500 dark:text-gray-500 text-center mt-6">
            If this problem persists, please contact support.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Card Error Display
 * Used for React Query errors within page sections
 */
function CardError({
  error,
  title,
  message,
  onRetry,
  retryLabel,
  showDevDetails = true,
  className = '',
}: {
  error: string | Error | null | undefined;
  title?: string | undefined;
  message?: string | undefined;
  onRetry?: (() => void) | undefined;
  retryLabel?: string | undefined;
  showDevDetails?: boolean | undefined;
  className?: string | undefined;
}) {
  const displayMessage = message || getUserFriendlyMessage(error);
  const displayTitle = title ? `Unable to load ${title}` : 'Unable to load content';

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-700 ${className}`}
    >
      <div className="flex flex-col items-center text-center">
        {/* Error Icon */}
        <div className="rounded-full bg-red-100 dark:bg-red-900/20 p-3 mb-4">
          <ErrorIcon size="md" />
        </div>

        {/* Title */}
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
          {displayTitle}
        </h3>

        {/* Message */}
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 max-w-md">
          {displayMessage}
        </p>

        {/* Retry Button */}
        {onRetry && <RetryButton onClick={onRetry} label={retryLabel} variant="primary" />}

        {/* Technical Details */}
        {showDevDetails && <TechnicalDetails error={error} />}
      </div>
    </div>
  );
}

/**
 * Inline Error Display
 * Used for inline error states in data lists/tables
 */
function InlineError({
  error,
  title,
  message,
  onRetry,
  retryLabel,
  backLink,
  backLinkLabel,
  className = '',
}: {
  error: string | Error | null | undefined;
  title?: string | undefined;
  message?: string | undefined;
  onRetry?: (() => void) | undefined;
  retryLabel?: string | undefined;
  backLink?: string | undefined;
  backLinkLabel?: string | undefined;
  className?: string | undefined;
}) {
  const displayMessage = message || getUserFriendlyMessage(error);

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6 ${className}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          <ErrorIcon size="sm" />
        </div>
        <div className="flex-1 min-w-0">
          {title && (
            <h3 className="text-red-800 dark:text-red-200 font-semibold">
              Error loading {title.toLowerCase()}
            </h3>
          )}
          <p className="text-red-600 dark:text-red-400 text-sm mt-1">
            {displayMessage}
          </p>
          {(onRetry || backLink) && (
            <div className="mt-3 flex items-center gap-3">
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <RefreshCcw className="w-3.5 h-3.5" />
                  {retryLabel || 'Try Again'}
                </button>
              )}
              {backLink && (
                <Link
                  href={backLink}
                  className="inline-flex items-center px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  {backLinkLabel || 'Go Back'}
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Alert Error Display
 * Used for form submission errors and notifications
 */
function AlertError({
  error,
  message,
  onDismiss,
  onRetry,
  retryLabel,
  className = '',
}: {
  error: string | Error | null | undefined;
  message?: string | undefined;
  onDismiss?: (() => void) | undefined;
  onRetry?: (() => void) | undefined;
  retryLabel?: string | undefined;
  className?: string | undefined;
}) {
  const displayMessage = message || getUserFriendlyMessage(error);

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 ${className}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          <ErrorIcon size="sm" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-red-800 dark:text-red-200">
            {displayMessage}
          </p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 text-sm text-red-700 dark:text-red-300 hover:text-red-800 dark:hover:text-red-200 underline inline-flex items-center gap-1"
            >
              <RefreshCcw className="w-3 h-3" />
              {retryLabel || 'Try again'}
            </button>
          )}
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="flex-shrink-0 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
            aria-label="Dismiss error"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * ErrorDisplay Component
 *
 * Unified error display with multiple variants for different contexts.
 */
export function ErrorDisplay({
  variant = 'card',
  error,
  title,
  message,
  onRetry,
  retryLabel,
  onDismiss,
  backLink,
  backLinkLabel,
  showDevDetails = true,
  className = '',
}: ErrorDisplayProps) {
  // Don't render if no error
  if (!error) return null;

  switch (variant) {
    case 'full-page':
      return (
        <FullPageError
          error={error}
          title={title}
          message={message}
          onRetry={onRetry}
          retryLabel={retryLabel}
          backLink={backLink}
          backLinkLabel={backLinkLabel}
          showDevDetails={showDevDetails}
        />
      );
    case 'card':
      return (
        <CardError
          error={error}
          title={title}
          message={message}
          onRetry={onRetry}
          retryLabel={retryLabel}
          showDevDetails={showDevDetails}
          className={className}
        />
      );
    case 'inline':
      return (
        <InlineError
          error={error}
          title={title}
          message={message}
          onRetry={onRetry}
          retryLabel={retryLabel}
          backLink={backLink}
          backLinkLabel={backLinkLabel}
          className={className}
        />
      );
    case 'alert':
      return (
        <AlertError
          error={error}
          message={message}
          onDismiss={onDismiss}
          onRetry={onRetry}
          retryLabel={retryLabel}
          className={className}
        />
      );
    default:
      return (
        <CardError
          error={error}
          title={title}
          message={message}
          onRetry={onRetry}
          retryLabel={retryLabel}
          showDevDetails={showDevDetails}
          className={className}
        />
      );
  }
}

export default ErrorDisplay;

