import { memo, useId } from 'react';
import type { FieldErrors, FieldValues, UseFormRegister } from 'react-hook-form';
import type { TextareaFieldConfig } from '../types';

interface TextareaFieldProps<TFormData extends FieldValues = FieldValues> {
  field: TextareaFieldConfig<TFormData>;
  register: UseFormRegister<TFormData>;
  errors: FieldErrors<TFormData>;
  isSubmitting: boolean;
}

function TextareaFieldInner<TFormData extends FieldValues = FieldValues>({
  field,
  register,
  errors,
  isSubmitting,
}: TextareaFieldProps<TFormData>) {
  const fieldId = useId();
  const error = errors[field.name];
  const errorMessage = error?.message as string | undefined;

  const isDisabled =
    typeof field.disabled === 'function' ? false : field.disabled || isSubmitting;

  return (
    <div>
      <label
        htmlFor={fieldId}
        className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
      >
        {field.label}
        {field.required && ' *'}
      </label>
      <textarea
        id={fieldId}
        {...register(field.name as never)}
        className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 ${
          error
            ? 'border-red-300 focus:ring-red-500 focus:border-red-500 dark:border-red-600'
            : 'border-gray-300 dark:border-gray-600'
        }`}
        placeholder={field.placeholder}
        disabled={isDisabled}
        rows={field.rows || 4}
        maxLength={field.maxLength}
      />
      {errorMessage && (
        <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errorMessage}</p>
      )}
      {field.helpText && !error && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{field.helpText}</p>
      )}
    </div>
  );
}

const TextareaField = memo(TextareaFieldInner) as typeof TextareaFieldInner;
export default TextareaField;
