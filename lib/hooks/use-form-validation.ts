import { useForm, type UseFormProps, type FieldValues, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { useState } from 'react';
import type { ZodIssue } from 'zod';

/**
 * Enhanced form validation hook with Zod integration
 * Provides consistent error handling and validation patterns
 */

interface UseValidatedFormOptions<T extends FieldValues> extends Omit<UseFormProps<T>, 'resolver'> {
  schema: z.ZodSchema<T>;
  onSubmit: (data: T) => Promise<void> | void;
  onError?: (error: Error) => void;
}

interface UseValidatedFormReturn<T extends FieldValues> extends UseFormReturn<T> {
  onSubmit: (e?: React.BaseSyntheticEvent) => Promise<void>;
  isSubmitting: boolean;
  submitError: string | null;
  clearError: () => void;
}

export function useValidatedForm<T extends FieldValues>({
  schema,
  onSubmit,
  onError,
  ...formOptions
}: UseValidatedFormOptions<T>): UseValidatedFormReturn<T> {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<T>({
    resolver: zodResolver(schema as never), // Type assertion for complex generic constraints
    mode: 'onChange', // Real-time validation
    reValidateMode: 'onChange',
    ...formOptions
  });

  const handleSubmit = form.handleSubmit(async (data: T) => {
    try {
      setIsSubmitting(true);
      setSubmitError(null);
      
      // ✅ BEST PRACTICE: Additional client-side validation with safeParse
      const result = schema.safeParse(data);
      if (!result.success) {
        const firstError = result.error.issues[0];
        throw new Error(firstError?.message || 'Validation failed');
      }
      
      await onSubmit(result.data);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      setSubmitError(errorMessage);
      onError?.(error instanceof Error ? error : new Error(errorMessage));
    } finally {
      setIsSubmitting(false);
    }
  });

  const clearError = () => setSubmitError(null);

  return {
    ...form,
    onSubmit: handleSubmit,
    isSubmitting,
    submitError,
    clearError
  } as UseValidatedFormReturn<T>;
}

/**
 * Hook for password confirmation validation
 */
export function usePasswordConfirmation(
  passwordFieldName: string = 'password',
  confirmFieldName: string = 'confirmPassword'
) {
  return {
    validate: (confirmPassword: string, formValues: Record<string, unknown>) => {
      const password = formValues[passwordFieldName];
      return password === confirmPassword || "Passwords don't match";
    }
  };
}

/**
 * Hook for real-time field validation
 */
export function useFieldValidation<T>(schema: z.ZodSchema<T>) {
  const validateField = (fieldName: keyof T, value: unknown): string | null => {
    try {
      // Create a partial schema for single field validation
      // Use type assertion with proper Zod types
      const fieldSchema = (schema as z.ZodObject<Record<string, z.ZodTypeAny>>).pick({ [fieldName]: true } as Record<string, true>);
      const result = fieldSchema.safeParse({ [fieldName]: value });

      if (!result.success) {
        const fieldError = result.error.issues.find((issue: ZodIssue) =>
          issue.path.includes(fieldName as string)
        );
        return fieldError?.message || 'Invalid value';
      }

      return null;
    } catch {
      return 'Validation error';
    }
  };

  return { validateField };
}
