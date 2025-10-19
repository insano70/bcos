/**
 * Re-export PracticeFormData from the validation schema
 * This ensures the type is always in sync with the Zod schema
 */
export type { PracticeConfigFormData as PracticeFormData } from '@/lib/validations/practice-form';
