/**
 * Centralized Validation Exports
 * Single entry point for all validation schemas and utilities
 */

/**
 * Validation best practices utilities
 */
export { validateParams, validateQuery, validateRequest } from '../api/middleware/validation';
// Password policy
export {
  createPasswordSchema,
  getPasswordPolicyDescription,
  loginPasswordSchema,
  PASSWORD_POLICY,
  passwordSchema,
  validatePasswordStrength,
} from '../config/password-policy';
export {
  useFieldValidation,
  usePasswordConfirmation,
  useValidatedForm,
} from '../hooks/use-form-validation';
// Authentication schemas
export {
  loginSchema,
  passwordChangeSchema,
  passwordResetRequestSchema,
  passwordResetSchema,
  registerSchema,
} from './auth';
// Common validation utilities
export {
  colorSchema,
  domainSchema,
  emailSchema,
  fileUploadSchema,
  paginationSchema,
  phoneSchema,
  searchSchema,
  sortSchema,
  urlSchema,
  uuidSchema,
} from './common';
// Practice schemas
export {
  practiceCreateSchema,
  practiceUpdateSchema,
} from './practice';
// Role and permission schemas
export {
  roleCreateSchema,
  roleQuerySchema,
  roleUpdateSchema,
} from './role';
// Enhanced sanitization schemas
export {
  createJsonSchema,
  createNameSchema,
  createSafeTextSchema,
  safeDomainSchema,
  safeEmailSchema,
  safeUrlSchema,
} from './sanitization';
// Staff schemas
export {
  staffCreateSchema,
  staffUpdateSchema,
} from './staff';
// Template schemas
export {
  templateCreateSchema,
  templateUpdateSchema,
} from './template';
// User management schemas
export {
  passwordChangeSchema as userPasswordChangeSchema,
  userCreateSchema,
  userParamsSchema,
  userQuerySchema,
  userUpdateSchema,
} from './user';

/**
 * Type inference helpers for schemas
 * TODO: Fix circular dependency issues preventing schema access
 */
// export type LoginFormData = z.infer<typeof loginSchema>;
// export type RegisterFormData = z.infer<typeof registerSchema>;
// export type UserCreateData = z.infer<typeof userCreateSchema>;
// export type UserUpdateData = z.infer<typeof userUpdateSchema>;
// export type PasswordChangeData = z.infer<typeof passwordChangeSchema>;

// Re-export Zod for convenience
export { z } from 'zod';
