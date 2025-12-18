import { memo } from 'react';
import type { FieldErrors, FieldValues, UseFormRegister } from 'react-hook-form';
import type { TextareaFieldConfig } from '../types';
import BaseFieldWrapper from './base-field-wrapper';

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
  return (
    <BaseFieldWrapper field={field} error={errors[field.name]} isSubmitting={isSubmitting}>
      {({ fieldId, isDisabled, inputClassName }) => (
        <textarea
          id={fieldId}
          {...register(field.name as never)}
          className={inputClassName}
          placeholder={field.placeholder}
          disabled={isDisabled}
          rows={field.rows || 4}
          maxLength={field.maxLength}
        />
      )}
    </BaseFieldWrapper>
  );
}

const TextareaField = memo(TextareaFieldInner) as typeof TextareaFieldInner;
export default TextareaField;
