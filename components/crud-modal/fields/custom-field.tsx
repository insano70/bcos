import { memo } from 'react';
import type { FieldErrors, FieldValues, UseFormSetValue, UseFormWatch } from 'react-hook-form';
import type { CustomFieldConfig } from '../types';

interface CustomFieldProps<TFormData extends FieldValues = FieldValues> {
  field: CustomFieldConfig<TFormData>;
  errors: FieldErrors<TFormData>;
  watch: UseFormWatch<TFormData>;
  setValue: UseFormSetValue<TFormData>;
  isSubmitting: boolean;
}

function CustomFieldInner<TFormData extends FieldValues = FieldValues>({
  field,
  errors,
  watch,
  setValue,
  isSubmitting,
}: CustomFieldProps<TFormData>) {
  const CustomComponent = field.component;
  const error = errors[field.name];
  const errorMessage = error?.message as string | undefined;
  const value = watch(field.name as never);
  const formData = watch() as TFormData;

  // Evaluate disabled if it's a function
  const isDisabled =
    typeof field.disabled === 'function' ? field.disabled(formData) : field.disabled || isSubmitting;

  const handleChange = (newValue: unknown) => {
    setValue(field.name as never, newValue as never, { shouldValidate: true });
  };

  return (
    <div>
      <CustomComponent
        name={field.name}
        value={value}
        onChange={handleChange}
        {...(errorMessage && { error: errorMessage })}
        disabled={isDisabled}
        {...(field.required !== undefined && { required: field.required })}
        {...(formData && { formData })}
        {...field.props}
      />
    </div>
  );
}

const CustomField = memo(CustomFieldInner) as typeof CustomFieldInner;
export default CustomField;
