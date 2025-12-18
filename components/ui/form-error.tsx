'use client';

import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface FormErrorProps extends HTMLAttributes<HTMLParagraphElement> {
  /** Error message content */
  children: ReactNode;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Standardized form error message component.
 *
 * Uses the CRUD modal pattern:
 * - text-sm for readable error text
 * - text-red-600 / dark:text-red-400 for consistent error color
 * - mt-1 for proper spacing below input
 *
 * @example
 * // Basic usage
 * {error && <FormError>{error}</FormError>}
 *
 * @example
 * // With react-hook-form
 * {errors.email && <FormError>{errors.email.message}</FormError>}
 *
 * @example
 * // Custom styling
 * <FormError className="mt-2">This field is required</FormError>
 */
const FormError = forwardRef<HTMLParagraphElement, FormErrorProps>(
  ({ children, className, ...props }, ref) => {
    if (!children) {
      return null;
    }

    return (
      <p
        ref={ref}
        role="alert"
        className={cn(
          'mt-1 text-sm text-red-600 dark:text-red-400',
          className
        )}
        {...props}
      >
        {children}
      </p>
    );
  }
);

FormError.displayName = 'FormError';

export { FormError };
