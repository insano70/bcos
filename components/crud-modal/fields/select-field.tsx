import { useId } from 'react';
import type { FieldErrors, FieldValues, UseFormRegister, UseFormWatch } from 'react-hook-form';
import type { SelectFieldConfig } from '../types';

interface SelectFieldProps<TFormData extends FieldValues = FieldValues> {
  field: SelectFieldConfig<TFormData>;
  register: UseFormRegister<TFormData>;
  errors: FieldErrors<TFormData>;
  watch: UseFormWatch<TFormData>;
  isSubmitting: boolean;
}

export default function SelectField<TFormData extends FieldValues = FieldValues>({
  field,
  register,
  errors,
  watch,
  isSubmitting,
}: SelectFieldProps<TFormData>) {
  const fieldId = useId();
  const error = errors[field.name];
  const errorMessage = error?.message as string | undefined;

  const isDisabled =
    typeof field.disabled === 'function' ? false : field.disabled || isSubmitting;

  // Get options (can be static array or function)
  const formData = watch() as TFormData;
  const options = typeof field.options === 'function' ? field.options(formData) : field.options;

  return (
    <div>
      <label
        htmlFor={fieldId}
        className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
      >
        {field.label}
        {field.required && ' *'}
      </label>
      <select
        id={fieldId}
        {...register(field.name as never)}
        className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 ${
          error
            ? 'border-red-300 focus:ring-red-500 focus:border-red-500 dark:border-red-600'
            : 'border-gray-300 dark:border-gray-600'
        }`}
        disabled={isDisabled}
      >
        {field.placeholder && (
          <option value="" disabled>
            {field.placeholder}
          </option>
        )}
        {options.map((option) => (
          <option key={String(option.value)} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      {errorMessage && (
        <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errorMessage}</p>
      )}
      {field.helpText && !error && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{field.helpText}</p>
      )}
    </div>
  );
}
