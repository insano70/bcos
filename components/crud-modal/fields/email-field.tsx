import { memo } from 'react';
import type { FieldErrors, FieldValues, UseFormRegister } from 'react-hook-form';
import type { EmailFieldConfig } from '../types';
import BaseFieldWrapper from './base-field-wrapper';

interface EmailFieldProps<TFormData extends FieldValues = FieldValues> {
  field: EmailFieldConfig<TFormData>;
  register: UseFormRegister<TFormData>;
  errors: FieldErrors<TFormData>;
  isSubmitting: boolean;
}

function EmailFieldInner<TFormData extends FieldValues = FieldValues>({
  field,
  register,
  errors,
  isSubmitting,
}: EmailFieldProps<TFormData>) {
  return (
    <BaseFieldWrapper field={field} error={errors[field.name]} isSubmitting={isSubmitting}>
      {({ fieldId, isDisabled, inputClassName }) => (
        <input
          type="email"
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

const EmailField = memo(EmailFieldInner) as typeof EmailFieldInner;
export default EmailField;
