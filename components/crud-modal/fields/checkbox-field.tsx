import { memo, useId } from 'react';
import type { FieldErrors, FieldValues, UseFormRegister } from 'react-hook-form';
import type { CheckboxFieldConfig } from '../types';

interface CheckboxFieldProps<TFormData extends FieldValues = FieldValues> {
  field: CheckboxFieldConfig<TFormData>;
  register: UseFormRegister<TFormData>;
  errors: FieldErrors<TFormData>;
  isSubmitting: boolean;
}

// NOTE: Checkbox has a fundamentally different layout (label after input),
// so it doesn't use BaseFieldWrapper like other fields.
function CheckboxFieldInner<TFormData extends FieldValues = FieldValues>({
  field,
  register,
  errors,
  isSubmitting,
}: CheckboxFieldProps<TFormData>) {
  const fieldId = useId();
  const error = errors[field.name];
  const errorMessage = error?.message as string | undefined;

  const isDisabled =
    typeof field.disabled === 'function' ? false : field.disabled || isSubmitting;

  return (
    <div>
      <div className="flex items-center">
        <input
          type="checkbox"
          id={fieldId}
          {...register(field.name as never)}
          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          disabled={isDisabled}
        />
        <label htmlFor={fieldId} className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
          {field.label}
          {field.required && ' *'}
        </label>
      </div>
      {field.description && !error && (
        <p className="mt-1 ml-6 text-xs text-gray-500 dark:text-gray-400">{field.description}</p>
      )}
      {errorMessage && (
        <p className="mt-1 ml-6 text-sm text-red-600 dark:text-red-400">{errorMessage}</p>
      )}
      {field.helpText && !error && !field.description && (
        <p className="mt-1 ml-6 text-xs text-gray-500 dark:text-gray-400">{field.helpText}</p>
      )}
    </div>
  );
}

const CheckboxField = memo(CheckboxFieldInner) as typeof CheckboxFieldInner;
export default CheckboxField;
