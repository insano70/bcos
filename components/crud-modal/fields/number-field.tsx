import { memo } from 'react';
import type { FieldErrors, FieldValues, UseFormRegister } from 'react-hook-form';
import type { NumberFieldConfig } from '../types';
import BaseFieldWrapper from './base-field-wrapper';

interface NumberFieldProps<TFormData extends FieldValues = FieldValues> {
  field: NumberFieldConfig<TFormData>;
  register: UseFormRegister<TFormData>;
  errors: FieldErrors<TFormData>;
  isSubmitting: boolean;
}

function NumberFieldInner<TFormData extends FieldValues = FieldValues>({
  field,
  register,
  errors,
  isSubmitting,
}: NumberFieldProps<TFormData>) {
  return (
    <BaseFieldWrapper field={field} error={errors[field.name]} isSubmitting={isSubmitting}>
      {({ fieldId, isDisabled, inputClassName }) => (
        <input
          type="number"
          id={fieldId}
          {...register(field.name as never)}
          className={inputClassName}
          placeholder={field.placeholder}
          disabled={isDisabled}
          min={field.min}
          max={field.max}
          step={field.step}
        />
      )}
    </BaseFieldWrapper>
  );
}

const NumberField = memo(NumberFieldInner) as typeof NumberFieldInner;
export default NumberField;
