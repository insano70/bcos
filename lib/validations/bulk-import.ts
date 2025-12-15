import { z } from 'zod';
import { passwordSchema } from '@/lib/config/password-policy';
import { createNameSchema, safeEmailSchema } from '@/lib/validations/sanitization';

/**
 * Bulk User Import Validation Schemas
 *
 * Provides Zod schemas for validating CSV rows during bulk user import.
 * Reuses existing validation patterns for consistency.
 */

/**
 * Required headers for the CSV import file
 */
export const REQUIRED_CSV_HEADERS = [
  'first_name',
  'last_name',
  'email',
  'organization',
  'password',
  'roles',
] as const;

/**
 * Optional headers for the CSV import file
 */
export const OPTIONAL_CSV_HEADERS = ['provider_uid'] as const;

/**
 * All valid headers for the CSV import file
 */
export const ALL_CSV_HEADERS = [...REQUIRED_CSV_HEADERS, ...OPTIONAL_CSV_HEADERS] as const;

/**
 * Type for CSV header names
 */
export type CSVHeader = (typeof ALL_CSV_HEADERS)[number];

/**
 * Raw CSV row data from parsing (all strings)
 */
export interface RawCSVRow {
  first_name: string;
  last_name: string;
  email: string;
  organization: string;
  password: string;
  roles: string;
  provider_uid?: string;
}

/**
 * Validated row data after field validation (before resolution)
 */
export interface ValidatedCSVRow {
  first_name: string;
  last_name: string;
  email: string;
  organization_name: string;
  password: string;
  roles: string[];
  provider_uid: number | null;
}

/**
 * Fully resolved row data (after org/role resolution)
 */
export interface ResolvedCSVRow {
  row_number: number;
  data: {
    first_name: string;
    last_name: string;
    email: string;
    organization_name: string;
    organization_id: string | null;
    roles: string[];
    role_ids: string[];
    provider_uid: number | null;
  };
  is_valid: boolean;
  errors: string[];
}

/**
 * Request body for commit endpoint
 */
export interface BulkImportCommitRow {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  organization_id: string;
  role_ids: string[];
  provider_uid?: number | null;
}

/**
 * Result of a single user creation attempt
 */
export interface UserCreationResult {
  row_number: number;
  email: string;
  success: boolean;
  user_id?: string;
  error?: string;
}

/**
 * Schema for parsing pipe-delimited roles string
 * Roles are separated by | character (e.g., "Admin|User")
 */
export const rolesStringSchema = z
  .string()
  .min(1, 'At least one role is required')
  .transform((val) => {
    // Split by pipe, trim whitespace, filter empty strings
    return val
      .split('|')
      .map((role) => role.trim())
      .filter((role) => role.length > 0);
  })
  .refine((roles) => roles.length > 0, {
    message: 'At least one role is required',
  });

/**
 * Schema for provider_uid - optional positive integer
 */
export const providerUidSchema = z
  .string()
  .optional()
  .transform((val) => {
    if (!val?.trim()) return null;
    const parsed = Number.parseInt(val.trim(), 10);
    if (Number.isNaN(parsed) || parsed <= 0) return null;
    return parsed;
  });

/**
 * Schema for validating a raw CSV row (field-level validation only)
 * Does not perform database lookups - that happens in the service layer
 */
export const csvRowSchema = z.object({
  first_name: createNameSchema('First name'),
  last_name: createNameSchema('Last name'),
  email: safeEmailSchema,
  organization: z.string().min(1, 'Organization is required').trim(),
  password: passwordSchema,
  roles: rolesStringSchema,
  provider_uid: providerUidSchema,
});

/**
 * Schema for commit request body
 */
export const bulkImportCommitRowSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(1),
  organization_id: z.string().uuid(),
  role_ids: z.array(z.string().uuid()).min(1),
  provider_uid: z.number().int().positive().nullable().default(null),
});

/**
 * Schema for the full commit request
 */
export const bulkImportCommitSchema = z.object({
  rows: z.array(bulkImportCommitRowSchema).min(1, 'At least one row is required'),
});

/**
 * Type inference helpers
 */
export type CSVRowInput = z.input<typeof csvRowSchema>;
export type CSVRowOutput = z.output<typeof csvRowSchema>;
export type BulkImportCommitInput = z.input<typeof bulkImportCommitSchema>;
