/**
 * Auth Transition Overlay
 *
 * Unified loading/transition component for all authentication-related states.
 * Provides a consistent visual experience across:
 * - Initial session checking (app load)
 * - Login form session checking
 * - Auth route transitions
 * - Post-login RBAC loading
 *
 * Usage:
 * - Full-page overlay: covers entire screen with fixed positioning
 * - Inline variant: renders as a centered loading indicator within container
 *
 * @example
 * // Full-page overlay (default)
 * <AuthTransitionOverlay message="Loading..." />
 *
 * // Inline variant
 * <AuthTransitionOverlay variant="inline" message="Checking your session..." />
 */

'use client';

import { Spinner } from '@/components/ui/spinner';

interface AuthTransitionOverlayProps {
  /**
   * Variant determines the layout:
   * - 'fullscreen': Fixed position, covers entire screen (default)
   * - 'inline': Centered within parent container
   */
  variant?: 'fullscreen' | 'inline';

  /**
   * Primary message shown below the spinner
   * @default "Loading..."
   */
  message?: string;

  /**
   * Optional secondary/subtitle message
   */
  subtitle?: string;
}

/**
 * Unified loading/transition overlay for authentication states
 *
 * Provides consistent visual feedback during:
 * - Session validation
 * - Token refresh
 * - RBAC context loading
 * - Route transitions
 */
export function AuthTransitionOverlay({
  variant = 'fullscreen',
  message = 'Loading...',
  subtitle,
}: AuthTransitionOverlayProps) {
  const content = (
    <div className="flex items-center justify-center">
      <div className="text-center">
        {/* Spinner */}
        <Spinner className="mb-4" />

        {/* Primary message */}
        <p className="text-lg text-gray-700 dark:text-gray-300 font-medium">{message}</p>

        {/* Optional subtitle */}
        {subtitle && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{subtitle}</p>
        )}
      </div>
    </div>
  );

  if (variant === 'inline') {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        {content}
      </div>
    );
  }

  // Fullscreen variant - covers entire screen
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-gray-50 via-gray-100 to-gray-200 dark:from-gray-950 dark:via-gray-900 dark:to-gray-800">
      {content}
    </div>
  );
}

export default AuthTransitionOverlay;
