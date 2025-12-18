import { memo } from 'react';
import type { FieldErrors, FieldValues, UseFormRegister } from 'react-hook-form';
import type { PasswordFieldConfig } from '../types';
import BaseFieldWrapper from './base-field-wrapper';

interface PasswordFieldProps<TFormData extends FieldValues = FieldValues> {
  field: PasswordFieldConfig<TFormData>;
  register: UseFormRegister<TFormData>;
  errors: FieldErrors<TFormData>;
  isSubmitting: boolean;
}

function PasswordFieldInner<TFormData extends FieldValues = FieldValues>({
  field,
  register,
  errors,
  isSubmitting,
}: PasswordFieldProps<TFormData>) {
  return (
    <BaseFieldWrapper field={field} error={errors[field.name]} isSubmitting={isSubmitting}>
      {({ fieldId, isDisabled, inputClassName }) => (
        <input
          type="password"
          id={fieldId}
          {...register(field.name as never)}
          className={inputClassName}
          placeholder={field.placeholder}
          disabled={isDisabled}
          maxLength={field.maxLength}
        />
      )}
    </BaseFieldWrapper>
  );
}

const PasswordField = memo(PasswordFieldInner) as typeof PasswordFieldInner;
export default PasswordField;
