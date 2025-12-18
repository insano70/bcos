import type { FieldErrors, FieldValues, UseFormRegister, UseFormWatch } from 'react-hook-form';
import type { SelectFieldConfig } from '../types';
import BaseFieldWrapper from './base-field-wrapper';

interface SelectFieldProps<TFormData extends FieldValues = FieldValues> {
  field: SelectFieldConfig<TFormData>;
  register: UseFormRegister<TFormData>;
  errors: FieldErrors<TFormData>;
  watch: UseFormWatch<TFormData>;
  isSubmitting: boolean;
}

// NOTE: Do NOT wrap this component with memo()!
// SelectField uses watch() to get formData for dynamic options.
// memo() blocks re-renders triggered by watch() subscriptions.
export default function SelectField<TFormData extends FieldValues = FieldValues>({
  field,
  register,
  errors,
  watch,
  isSubmitting,
}: SelectFieldProps<TFormData>) {
  // Get options (can be static array or function)
  const formData = watch() as TFormData;
  const options = typeof field.options === 'function' ? field.options(formData) : field.options;

  return (
    <BaseFieldWrapper field={field} error={errors[field.name]} isSubmitting={isSubmitting}>
      {({ fieldId, isDisabled, inputClassName }) => (
        <select
          id={fieldId}
          {...register(field.name as never)}
          className={inputClassName}
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
      )}
    </BaseFieldWrapper>
  );
}
