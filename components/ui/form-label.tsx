'use client';

import { forwardRef, type LabelHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface FormLabelProps extends Omit<LabelHTMLAttributes<HTMLLabelElement>, 'className'> {
  /** Label content */
  children: ReactNode;
  /** Whether the field is required (shows asterisk) */
  required?: boolean;
  /** Additional CSS classes */
  className?: string | undefined;
}

/**
 * Standardized form label component with consistent required indicator.
 *
 * Uses the CRUD modal pattern: inline asterisk after label text.
 * This is screen reader friendly as the asterisk flows naturally with the label.
 *
 * @example
 * // Basic usage
 * <FormLabel htmlFor="email">Email Address</FormLabel>
 *
 * @example
 * // Required field
 * <FormLabel htmlFor="name" required>Full Name</FormLabel>
 *
 * @example
 * // Custom styling
 * <FormLabel htmlFor="bio" className="mb-2">Biography</FormLabel>
 */
const FormLabel = forwardRef<HTMLLabelElement, FormLabelProps>(
  ({ children, required = false, className, ...props }, ref) => {
    return (
      <label
        ref={ref}
        className={cn(
          'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1',
          className
        )}
        {...props}
      >
        {children}
        {required && ' *'}
      </label>
    );
  }
);

FormLabel.displayName = 'FormLabel';

export { FormLabel };
