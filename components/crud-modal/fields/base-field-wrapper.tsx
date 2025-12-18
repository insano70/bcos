import { useId, type ReactNode } from 'react';
import type { FieldErrors, FieldValues } from 'react-hook-form';
import type { BaseFieldConfig } from '../types';

/**
 * Props for the BaseFieldWrapper component
 */
interface BaseFieldWrapperProps<TFormData extends FieldValues = FieldValues> {
  /** Field configuration containing label, required, helpText */
  field: BaseFieldConfig<TFormData>;
  /** Field error from react-hook-form (supports complex nested error types) */
  error: FieldErrors<TFormData>[keyof TFormData];
  /** Whether the form is currently submitting */
  isSubmitting: boolean;
  /** Render function for the input element */
  children: (props: {
    fieldId: string;
    isDisabled: boolean;
    hasError: boolean;
    inputClassName: string;
  }) => ReactNode;
}

/**
 * Standard input className with error state styling.
 * Used by text, email, password, number, textarea, and select fields.
 */
export function getInputClassName(hasError: boolean): string {
  const baseClasses =
    'w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100';
  const errorClasses = hasError
    ? 'border-red-300 focus:ring-red-500 focus:border-red-500 dark:border-red-600'
    : 'border-gray-300 dark:border-gray-600';
  return `${baseClasses} ${errorClasses}`;
}

/**
 * BaseFieldWrapper - Shared wrapper for CRUD modal form fields.
 *
 * Handles common field functionality:
 * - Generates unique field ID
 * - Renders label with required indicator
 * - Computes disabled state
 * - Displays error message
 * - Displays help text (hidden when error shown)
 *
 * @example
 * ```tsx
 * <BaseFieldWrapper field={field} error={errors[field.name]} isSubmitting={isSubmitting}>
 *   {({ fieldId, isDisabled, inputClassName }) => (
 *     <input
 *       type="text"
 *       id={fieldId}
 *       className={inputClassName}
 *       disabled={isDisabled}
 *       {...register(field.name)}
 *     />
 *   )}
 * </BaseFieldWrapper>
 * ```
 */
export default function BaseFieldWrapper<TFormData extends FieldValues = FieldValues>({
  field,
  error,
  isSubmitting,
  children,
}: BaseFieldWrapperProps<TFormData>) {
  const fieldId = useId();
  // Extract message from error (handles both simple FieldError and nested error types)
  const errorMessage = (error as { message?: string } | undefined)?.message;
  const hasError = !!error;

  // Evaluate disabled: function-based disabled requires form watching (handled in parent),
  // so we treat functions as false here and let the actual disabled prop handle it
  const isDisabled =
    typeof field.disabled === 'function' ? false : field.disabled || isSubmitting;

  const inputClassName = getInputClassName(hasError);

  return (
    <div>
      <label
        htmlFor={fieldId}
        className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
      >
        {field.label}
        {field.required && ' *'}
      </label>
      {children({ fieldId, isDisabled, hasError, inputClassName })}
      {errorMessage && (
        <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errorMessage}</p>
      )}
      {field.helpText && !error && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{field.helpText}</p>
      )}
    </div>
  );
}
