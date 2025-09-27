/**
 * Centralized Validation Exports
 * Single entry point for all validation schemas and utilities
 */

// Authentication schemas
export { 
  loginSchema, 
  registerSchema, 
  passwordResetSchema, 
  passwordResetRequestSchema, 
  passwordChangeSchema 
} from './auth';

// User management schemas
export { 
  userCreateSchema, 
  userUpdateSchema, 
  userQuerySchema, 
  passwordChangeSchema as userPasswordChangeSchema,
  userParamsSchema 
} from './user';

// Common validation utilities
export { 
  uuidSchema, 
  paginationSchema, 
  sortSchema, 
  searchSchema, 
  fileUploadSchema, 
  colorSchema, 
  domainSchema, 
  emailSchema, 
  phoneSchema, 
  urlSchema 
} from './common';

// Enhanced sanitization schemas
export { 
  safeEmailSchema, 
  createNameSchema, 
  createSafeTextSchema, 
  safeDomainSchema, 
  safeUrlSchema, 
  createJsonSchema 
} from './sanitization';

// Password policy
export { 
  passwordSchema, 
  loginPasswordSchema, 
  createPasswordSchema, 
  validatePasswordStrength, 
  getPasswordPolicyDescription,
  PASSWORD_POLICY 
} from '../config/password-policy';

// Role and permission schemas
export { 
  roleCreateSchema, 
  roleUpdateSchema, 
  roleQuerySchema 
} from './role';

// Practice schemas
export { 
  practiceCreateSchema, 
  practiceUpdateSchema 
} from './practice';

// Staff schemas
export { 
  staffCreateSchema, 
  staffUpdateSchema 
} from './staff';

// Template schemas
export { 
  templateCreateSchema, 
  templateUpdateSchema 
} from './template';

/**
 * Validation best practices utilities
 */
export { validateRequest, validateQuery, validateParams } from '../api/middleware/validation';
export { useValidatedForm, usePasswordConfirmation, useFieldValidation } from '../hooks/use-form-validation';

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
