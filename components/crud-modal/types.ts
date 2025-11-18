import type { ComponentType } from 'react';
import type {
  FieldErrors,
  FieldValues,
  UseFormRegister,
  UseFormSetValue,
  UseFormWatch,
} from 'react-hook-form';
import type { ZodSchema } from 'zod';

/**
 * Mode for the CRUD modal
 */
export type CrudMode = 'create' | 'edit';

/**
 * Modal size options
 */
export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl';

/**
 * Column layout for two-column forms
 */
export type ColumnPosition = 'full' | 'left' | 'right';

/**
 * Base field configuration shared by all field types
 */
export interface BaseFieldConfig<TFormData extends FieldValues = FieldValues> {
  /** Field name (must match form data key) */
  name: keyof TFormData;
  /** Display label */
  label: string;
  /** Placeholder text */
  placeholder?: string;
  /** Whether field is required */
  required?: boolean;
  /** Help text displayed below field */
  helpText?: string;
  /** Disable field (can be dynamic based on form state) */
  disabled?: boolean | ((formData: TFormData) => boolean);
  /** Show/hide field conditionally */
  visible?: boolean | ((formData: TFormData) => boolean);
  /** Column position in two-column layout */
  column?: ColumnPosition;
}

/**
 * Text input field configuration
 */
export interface TextFieldConfig<TFormData extends FieldValues = FieldValues>
  extends BaseFieldConfig<TFormData> {
  type: 'text';
  /** Maximum length */
  maxLength?: number;
}

/**
 * Email input field configuration
 */
export interface EmailFieldConfig<TFormData extends FieldValues = FieldValues>
  extends BaseFieldConfig<TFormData> {
  type: 'email';
  /** Maximum length */
  maxLength?: number;
}

/**
 * Password input field configuration
 */
export interface PasswordFieldConfig<TFormData extends FieldValues = FieldValues>
  extends BaseFieldConfig<TFormData> {
  type: 'password';
  /** Maximum length */
  maxLength?: number;
}

/**
 * Number input field configuration
 */
export interface NumberFieldConfig<TFormData extends FieldValues = FieldValues>
  extends BaseFieldConfig<TFormData> {
  type: 'number';
  /** Minimum value */
  min?: number;
  /** Maximum value */
  max?: number;
  /** Step increment */
  step?: number;
}

/**
 * Textarea field configuration
 */
export interface TextareaFieldConfig<TFormData extends FieldValues = FieldValues>
  extends BaseFieldConfig<TFormData> {
  type: 'textarea';
  /** Number of rows */
  rows?: number;
  /** Maximum length */
  maxLength?: number;
}

/**
 * Checkbox field configuration
 */
export interface CheckboxFieldConfig<TFormData extends FieldValues = FieldValues>
  extends BaseFieldConfig<TFormData> {
  type: 'checkbox';
  /** Description text displayed next to checkbox */
  description?: string;
}

/**
 * Select dropdown option
 */
export interface SelectOption {
  /** Option value */
  value: string | number;
  /** Option display label */
  label: string;
  /** Whether option is disabled */
  disabled?: boolean;
}

/**
 * Select dropdown field configuration
 */
export interface SelectFieldConfig<TFormData extends FieldValues = FieldValues>
  extends BaseFieldConfig<TFormData> {
  type: 'select';
  /** Available options */
  options: SelectOption[] | ((formData: TFormData) => SelectOption[]);
}

/**
 * Props passed to custom field components
 */
export interface CustomFieldProps<TFormData extends FieldValues = FieldValues> {
  /** Field name */
  name: keyof TFormData;
  /** Field value */
  value: unknown;
  /** Change handler */
  onChange: (value: unknown) => void;
  /** Error message */
  error?: string | undefined;
  /** Whether field is disabled */
  disabled?: boolean;
  /** Whether field is required */
  required?: boolean;
  /** All form data (for conditional rendering) */
  formData?: TFormData;
}

/**
 * Custom component field configuration
 */
export interface CustomFieldConfig<TFormData extends FieldValues = FieldValues>
  extends BaseFieldConfig<TFormData> {
  type: 'custom';
  /** Custom React component */
  component: ComponentType<CustomFieldProps<TFormData>>;
  /** Additional props to pass to component */
  props?: Record<string, unknown>;
}

/**
 * Union type of all field configurations
 */
export type FieldConfig<TFormData extends FieldValues = FieldValues> =
  | TextFieldConfig<TFormData>
  | EmailFieldConfig<TFormData>
  | PasswordFieldConfig<TFormData>
  | NumberFieldConfig<TFormData>
  | TextareaFieldConfig<TFormData>
  | CheckboxFieldConfig<TFormData>
  | SelectFieldConfig<TFormData>
  | CustomFieldConfig<TFormData>;

/**
 * Props for field renderer component
 */
export interface FieldRendererProps<TFormData extends FieldValues = FieldValues> {
  /** Field configuration */
  field: FieldConfig<TFormData>;
  /** React Hook Form register function */
  register: UseFormRegister<TFormData>;
  /** Form errors */
  errors: FieldErrors<TFormData>;
  /** React Hook Form watch function */
  watch: UseFormWatch<TFormData>;
  /** React Hook Form setValue function */
  setValue: UseFormSetValue<TFormData>;
  /** Whether form is submitting */
  isSubmitting: boolean;
}

/**
 * Main CRUD modal component props
 */
export interface CrudModalProps<TFormData extends FieldValues = FieldValues, TEntity = unknown> {
  // Mode and data
  /** Modal mode: create or edit */
  mode: CrudMode;
  /** Entity being edited (required for edit mode, null for create mode) */
  entity?: TEntity | null;

  // Display
  /** Modal title */
  title: string;
  /** Resource name for success messages (e.g., "user", "organization") */
  resourceName: string;

  // Modal state
  /** Whether modal is open */
  isOpen: boolean;
  /** Close modal handler */
  onClose: () => void;
  /** Success callback (called after successful create/update) */
  onSuccess?: () => void;

  // Form configuration
  /** Zod validation schema */
  schema: ZodSchema<TFormData, never, never>;
  /** Default form values */
  defaultValues: Partial<TFormData>;
  /** Field configurations */
  fields: FieldConfig<TFormData>[];

  // Submission
  /** Form submit handler */
  onSubmit: (data: TFormData) => Promise<void>;

  // Optional customization
  /** Modal size */
  size?: ModalSize;
  /** Submit button text (defaults to "Create {resourceName}" or "Update {resourceName}") */
  submitButtonText?: string;
  /** Cancel button text (defaults to "Cancel") */
  cancelButtonText?: string;
  /** Transform data before submit */
  beforeSubmit?: (data: TFormData) => TFormData;
  /** Additional action after successful submit (runs after onSuccess) */
  afterSuccess?: () => void;
  /** Show success toast (defaults to true) */
  showSuccessToast?: boolean;
  /** Custom success message */
  successMessage?: string;
}
