import type { FieldValues } from 'react-hook-form';
import type { FieldRendererProps } from './types';
import CheckboxField from './fields/checkbox-field';
import CustomField from './fields/custom-field';
import EmailField from './fields/email-field';
import NumberField from './fields/number-field';
import PasswordField from './fields/password-field';
import SelectField from './fields/select-field';
import TextareaField from './fields/textarea-field';
import TextField from './fields/text-field';

export default function FieldRenderer<TFormData extends FieldValues = FieldValues>({
  field,
  register,
  errors,
  watch,
  setValue,
  isSubmitting,
}: FieldRendererProps<TFormData>) {
  // Evaluate visibility if it's a function
  const formData = watch() as TFormData;
  const isVisible = typeof field.visible === 'function' ? field.visible(formData) : field.visible !== false;

  if (!isVisible) {
    return null;
  }

  switch (field.type) {
    case 'text':
      return <TextField field={field} register={register} errors={errors} isSubmitting={isSubmitting} />;

    case 'email':
      return <EmailField field={field} register={register} errors={errors} isSubmitting={isSubmitting} />;

    case 'password':
      return <PasswordField field={field} register={register} errors={errors} isSubmitting={isSubmitting} />;

    case 'number':
      return <NumberField field={field} register={register} errors={errors} isSubmitting={isSubmitting} />;

    case 'textarea':
      return <TextareaField field={field} register={register} errors={errors} isSubmitting={isSubmitting} />;

    case 'checkbox':
      return <CheckboxField field={field} register={register} errors={errors} isSubmitting={isSubmitting} />;

    case 'select':
      return <SelectField field={field} register={register} errors={errors} watch={watch} isSubmitting={isSubmitting} />;

    case 'custom':
      return <CustomField field={field} errors={errors} watch={watch} setValue={setValue} isSubmitting={isSubmitting} />;

    default:
      return null;
  }
}
