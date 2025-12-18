import { memo } from 'react';
import type { FieldErrors, FieldValues, UseFormRegister } from 'react-hook-form';
import type { TextFieldConfig } from '../types';
import BaseFieldWrapper from './base-field-wrapper';

interface TextFieldProps<TFormData extends FieldValues = FieldValues> {
  field: TextFieldConfig<TFormData>;
  register: UseFormRegister<TFormData>;
  errors: FieldErrors<TFormData>;
  isSubmitting: boolean;
}

function TextFieldInner<TFormData extends FieldValues = FieldValues>({
  field,
  register,
  errors,
  isSubmitting,
}: TextFieldProps<TFormData>) {
  return (
    <BaseFieldWrapper field={field} error={errors[field.name]} isSubmitting={isSubmitting}>
      {({ fieldId, isDisabled, inputClassName }) => (
        <input
          type="text"
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

const TextField = memo(TextFieldInner) as typeof TextFieldInner;
export default TextField;
