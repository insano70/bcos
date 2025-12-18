'use client';

import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface FormHelpProps extends HTMLAttributes<HTMLParagraphElement> {
  /** Help text content */
  children: ReactNode;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Standardized form help text component.
 *
 * Uses the CRUD modal pattern:
 * - text-xs for smaller helper text (visual hierarchy below labels/errors)
 * - text-gray-500 / dark:text-gray-400 for subtle appearance
 * - mt-1 for proper spacing below input
 *
 * Note: Help text should typically be hidden when an error is displayed
 * to avoid visual clutter. The FormField component handles this automatically.
 *
 * @example
 * // Basic usage
 * <FormHelp>Enter your email address for account recovery</FormHelp>
 *
 * @example
 * // Conditional display (hide when error present)
 * {!error && helpText && <FormHelp>{helpText}</FormHelp>}
 *
 * @example
 * // Custom styling
 * <FormHelp className="mt-2">Maximum 500 characters</FormHelp>
 */
const FormHelp = forwardRef<HTMLParagraphElement, FormHelpProps>(
  ({ children, className, ...props }, ref) => {
    if (!children) {
      return null;
    }

    return (
      <p
        ref={ref}
        className={cn(
          'mt-1 text-xs text-gray-500 dark:text-gray-400',
          className
        )}
        {...props}
      >
        {children}
      </p>
    );
  }
);

FormHelp.displayName = 'FormHelp';

export { FormHelp };
