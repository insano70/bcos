'use client';

import { forwardRef, type HTMLAttributes, type ReactNode, useId } from 'react';
import { cn } from '@/lib/utils';
import { FormLabel } from './form-label';
import { FormError } from './form-error';
import { FormHelp } from './form-help';

export interface FormFieldProps extends HTMLAttributes<HTMLDivElement> {
  /** Field label text */
  label: string;
  /** Whether the field is required */
  required?: boolean;
  /** Error message to display */
  error?: string | null;
  /** Help text to display (hidden when error is shown) */
  helpText?: string;
  /** Input element(s) to render */
  children: ReactNode;
  /** HTML id for the input (auto-generated if not provided) */
  htmlFor?: string;
  /** Additional CSS classes for the wrapper */
  className?: string;
  /** Additional CSS classes for the label */
  labelClassName?: string;
}

/**
 * Composite form field component that combines label, input, error, and help text.
 *
 * This component provides consistent structure and styling for form fields
 * following the CRUD modal pattern. It handles:
 * - Label with optional required indicator
 * - Error message display with proper accessibility (role="alert")
 * - Help text display (hidden when error is shown)
 * - Auto-generated IDs for label-input association
 *
 * @example
 * // Basic text field
 * <FormField label="Email" required error={errors.email?.message}>
 *   <input type="email" className="form-input w-full" {...register('email')} />
 * </FormField>
 *
 * @example
 * // With help text
 * <FormField
 *   label="Password"
 *   required
 *   helpText="Must be at least 8 characters"
 *   error={errors.password?.message}
 * >
 *   <input type="password" className="form-input w-full" {...register('password')} />
 * </FormField>
 *
 * @example
 * // Checkbox field (different layout)
 * <FormField label="Accept Terms" required error={errors.terms?.message}>
 *   <input type="checkbox" className="form-checkbox" {...register('terms')} />
 * </FormField>
 *
 * @example
 * // Custom ID for complex inputs
 * <FormField label="Category" htmlFor="category-select" error={errors.category?.message}>
 *   <Select id="category-select" {...register('category')} />
 * </FormField>
 */
const FormField = forwardRef<HTMLDivElement, FormFieldProps>(
  (
    {
      label,
      required = false,
      error,
      helpText,
      children,
      htmlFor,
      className,
      labelClassName,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const fieldId = htmlFor || generatedId;

    return (
      <div ref={ref} className={cn('', className)} {...props}>
        <FormLabel htmlFor={fieldId} required={required} className={labelClassName}>
          {label}
        </FormLabel>
        {children}
        <FormError>{error}</FormError>
        {!error && <FormHelp>{helpText}</FormHelp>}
      </div>
    );
  }
);

FormField.displayName = 'FormField';

export { FormField };
