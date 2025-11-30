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
 * Type inference exports from validation schemas
 * These types are inferred directly from Zod schemas for type-safety
 */

// Auth types
export type {
  Login,
  Register,
  PasswordResetRequest,
  PasswordReset,
  AuthPasswordChange,
  Session,
} from './auth';

// User types
export type {
  UserCreate,
  UserUpdate,
  UserQuery,
  UserParams,
  PasswordChange,
} from './user';

// Organization types
export type {
  OrganizationCreate,
  OrganizationUpdate,
  OrganizationQuery,
  OrganizationParams,
  OrganizationUsersBatchUpdate,
} from './organization';

// Role types
export type {
  RoleQuery,
  RoleCreate,
  RoleUpdate,
} from './role';

// Practice types
export type {
  PracticeCreate,
  PracticeUpdate,
  PracticeQuery,
  PracticeAttributesUpdate,
  PracticeParams,
} from './practice';

// Analytics types
export type {
  ChartCategoryCreate,
  ChartCategoryUpdate,
  ChartDefinitionCreate,
  ChartDefinitionUpdate,
  DashboardCreate,
  DashboardUpdate,
  FavoriteCreate,
  BulkOperation,
  DataSource,
  ChartDataRequest,
  DashboardUniversalFilters,
  DashboardRenderRequest,
} from './analytics';

// Work item types
export type {
  WorkItemCreate,
  WorkItemUpdate,
  WorkItemQuery,
  WorkItemParams,
  WorkItemTypeCreate,
  WorkItemTypeUpdate,
  WorkItemTypeQuery,
  WorkItemTypeParams,
  WorkItemStatusCreate,
  WorkItemStatusUpdate,
  WorkItemStatusParams,
  WorkItemStatusTransitionCreate,
  WorkItemStatusTransitionUpdate,
  WorkItemStatusTransitionQuery,
  WorkItemStatusTransitionParams,
  ValidationConfig,
  ActionConfig,
} from './work-items';

// Re-export Zod for convenience
export { z } from 'zod';
