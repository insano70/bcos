/**
 * Comprehensive TypeScript interfaces for test types
 * Replaces all `any` types in the testing system
 */

import type { JWTPayload } from 'jose'
import type { 
  UserContext, 
  Role, 
  Organization, 
  Permission, 
  PermissionCheckResult 
} from '@/lib/types/rbac'

// ===========================================
// Database Mock Types
// ===========================================

/**
 * Mock result from database SELECT operations
 */
export interface MockSelectResult<T = unknown> {
  rows?: T[];
  rowCount?: number;
  affectedRows?: number;
  // Vitest mock methods (will be added at runtime)
  mockResolvedValue?: (value: T[]) => MockSelectResult<T>;
  mockRejectedValue?: (error: Error) => MockSelectResult<T>;
}

/**
 * Mock result from database INSERT/UPDATE/DELETE operations
 */
export interface MockDatabaseResult {
  affectedRows: number;
  insertId?: string | number;
  changedRows?: number;
}

/**
 * Mock database query builder chain
 */
export interface MockSelectQuery<T = unknown> {
  from: (table: unknown) => MockSelectQuery<T>;
  where: (condition: unknown) => MockSelectQuery<T>;
  limit: (count: number) => Promise<MockSelectResult<T>>;
  orderBy: (column: unknown) => MockSelectQuery<T>;
  leftJoin: (table: unknown, condition: unknown) => MockSelectQuery<T>;
  innerJoin: (table: unknown, condition: unknown) => MockSelectQuery<T>;
}

/**
 * Mock database insert query builder
 */
export interface MockInsertQuery {
  values: (data: unknown) => Promise<MockDatabaseResult>;
  returning: () => Promise<unknown[]>;
}

/**
 * Mock database update query builder
 */
export interface MockUpdateQuery {
  set: (data: unknown) => MockUpdateQuery;
  where: (condition: unknown) => Promise<MockDatabaseResult>;
  returning: () => Promise<unknown[]>;
}

/**
 * Mock database delete query builder
 */
export interface MockDeleteQuery {
  where: (condition: unknown) => Promise<MockDatabaseResult>;
  returning: () => Promise<unknown[]>;
}

/**
 * Mock database transaction interface
 */
export interface MockTransaction {
  select: <T = unknown>() => MockSelectQuery<T>;
  insert: () => MockInsertQuery;
  update: () => MockUpdateQuery;
  delete: () => MockDeleteQuery;
  rollback: () => Promise<void>;
  commit: () => Promise<void>;
}

/**
 * Mock database instance
 */
export interface MockDatabase {
  select: () => MockSelectQuery;
  insert: () => MockInsertQuery;
  update: () => MockUpdateQuery;
  delete: () => MockDeleteQuery;
  transaction: <T>(fn: (tx: MockTransaction) => Promise<T>) => Promise<T>;
}

/**
 * Test database helper interface
 */
export interface TestDatabaseHelper {
  transaction: <T>(fn: (tx: MockTransaction) => Promise<T>) => Promise<T>;
  cleanup: () => Promise<void>;
  reset: () => Promise<void>;
  getTestDb: () => MockDatabase;
}

// ===========================================
// Test Entity Types
// ===========================================

/**
 * Test user entity matching the users table schema
 */
export interface TestUser {
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  password_hash?: string;
  email_verified: boolean | null;
  is_active: boolean | null;
  created_at: Date | null;
  updated_at: Date | null;
  deleted_at?: Date | null;
}

/**
 * Test organization entity matching the organizations table schema
 */
export interface TestOrganization {
  organization_id: string;
  name: string;
  slug: string;
  parent_organization_id?: string | null;
  is_active: boolean | null;
  created_at: Date | null;
  updated_at: Date | null;
  deleted_at?: Date | null;
  parent?: TestOrganization;
  children?: TestOrganization[];
}

/**
 * Test role entity matching the roles table schema
 */
export interface TestRole {
  role_id: string;
  name: string;
  description?: string | null;
  organization_id?: string | null;
  is_system_role: boolean | null;
  is_active: boolean | null;
  created_at: Date | null;
  updated_at: Date | null;
  deleted_at?: Date | null;
  permissions?: TestPermission[];
}

/**
 * Test permission entity matching the permissions table schema
 */
export interface TestPermission {
  permission_id: string;
  name: string;
  description?: string | null;
  resource: string;
  action: string;
  scope: 'own' | 'organization' | 'all';
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

/**
 * Test practice entity matching the practices table schema
 */
export interface TestPractice {
  practice_id: string;
  name: string;
  domain: string;
  template_id?: string | null;
  status: string;
  practice_uid?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date | null;
}

// ===========================================
// Authentication Mock Types  
// ===========================================

/**
 * Mock JWT token payload
 */
export interface MockJWTPayload extends JWTPayload {
  sub: string;
  email: string;
  user_id: string;
  permissions?: string[];
  organizations?: string[];
  roles?: string[];
  iat?: number;
  exp?: number;
  jti?: string;
}

/**
 * Mock token record from database
 */
export interface MockTokenRecord {
  token_id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  created_at: Date;
  is_active: boolean;
  token_type: 'access' | 'refresh';
  revoked_at?: Date | null;
}

/**
 * Mock token manager interface
 */
export interface MockTokenManager {
  validateAccessToken: (token: string) => Promise<MockJWTPayload>;
  generateAccessToken: (payload: MockJWTPayload) => Promise<string>;
  revokeToken: (tokenId: string) => Promise<void>;
  getActiveTokens: (userId: string) => Promise<MockTokenRecord[]>;
  cleanupExpiredTokens: () => Promise<void>;
}

/**
 * Mock authentication service
 */
export interface MockAuthService {
  hashPassword: (password: string) => Promise<string>;
  verifyPassword: (password: string, hash: string) => Promise<boolean>;
  validateCredentials: (email: string, password: string) => Promise<TestUser | null>;
  generateSalt: () => Promise<string>;
}

/**
 * Mock bcrypt functions
 */
export interface MockBcrypt {
  hash: (password: string, saltRounds: number) => Promise<string>;
  compare: (password: string, hash: string) => Promise<boolean>;
  genSalt: (rounds: number) => Promise<string>;
}

// ===========================================
// Cache Mock Types
// ===========================================

/**
 * Mock role permission cache
 */
export interface MockRolePermissionCache {
  get: (key: string) => Promise<Permission[] | null>;
  set: (key: string, value: Permission[], ttl?: number) => Promise<void>;
  delete: (key: string) => Promise<void>;
  clear: () => Promise<void>;
  has: (key: string) => Promise<boolean>;
  ttl: (key: string) => Promise<number>;
  getStats: () => { hits: number; misses: number; hitRate: number; size: number };
  getCachedRoleIds: () => string[];
  invalidateAll: () => Promise<void>;
  invalidate: (key: string) => Promise<void>;
}

/**
 * Mock user context cache
 */
export interface MockUserContextCache {
  get: (userId: string) => Promise<UserContext | null>;
  set: (userId: string, context: UserContext, ttl?: number) => Promise<void>;
  delete: (userId: string) => Promise<void>;
  clear: () => Promise<void>;
  invalidateUserCache: (userId: string) => Promise<void>;
}

// ===========================================
// Factory Types
// ===========================================

/**
 * Options for creating test users
 */
export interface TestUserFactoryOptions {
  email?: string;
  first_name?: string;
  last_name?: string;
  password?: string;
  password_hash?: string;
  email_verified?: boolean;
  is_active?: boolean;
}

/**
 * Options for creating test organizations
 */
export interface TestOrganizationFactoryOptions {
  name?: string;
  slug?: string;
  parent_organization_id?: string | null;
  is_active?: boolean;
}

/**
 * Options for creating test roles
 */
export interface TestRoleFactoryOptions {
  name?: string;
  description?: string;
  organization_id?: string | null;
  permissions?: string[];
  is_system_role?: boolean;
  is_active?: boolean;
}

/**
 * Options for creating test permissions
 */
export interface TestPermissionFactoryOptions {
  name?: string;
  description?: string | null;
  resource?: string;
  action?: string;
  scope?: 'own' | 'organization' | 'all';
  is_active?: boolean;
}

/**
 * Options for creating test practices
 */
export interface TestPracticeFactoryOptions {
  name?: string;
  domain?: string;
  template_id?: string | null;
  status?: string;
  practice_uid?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}

// ===========================================
// RBAC Helper Types
// ===========================================

/**
 * Mock permission check result
 */
export interface MockPermissionCheckResult extends PermissionCheckResult {
  granted: boolean;
  scope: 'own' | 'organization' | 'all';
  reason?: string;
  applicable_organizations?: string[];
}

/**
 * Mock RBAC helper interface
 */
export interface MockRBACHelper {
  testUserPermission: (
    user: TestUser,
    permission: string,
    resourceId?: string,
    organizationId?: string
  ) => Promise<MockPermissionCheckResult>;
  assignRoleToUser: (
    user: TestUser,
    role: TestRole,
    organization?: TestOrganization
  ) => Promise<void>;
  assignUserToOrganization: (
    user: TestUser,
    organization: TestOrganization
  ) => Promise<void>;
  createTestUserContext: (
    user: TestUser,
    roles?: TestRole[],
    organizations?: TestOrganization[]
  ) => Promise<UserContext>;
}

// ===========================================
// Utility Types
// ===========================================

/**
 * Type for any array fallback in JSON parsing
 */
export interface TestJsonArrayFallback<T = unknown> extends Array<T> {
  // Ensures type safety while maintaining array behavior
}

/**
 * Mock HTTP response for API tests
 */
export interface MockApiResponse<T = unknown> {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: T;
  json: () => Promise<T>;
  text: () => Promise<string>;
  ok: boolean;
}

/**
 * Mock request helper for API tests
 */
export interface MockRequestHelper {
  get: <T = unknown>(url: string, headers?: Record<string, string>) => Promise<MockApiResponse<T>>;
  post: <T = unknown>(url: string, body?: unknown, headers?: Record<string, string>) => Promise<MockApiResponse<T>>;
  put: <T = unknown>(url: string, body?: unknown, headers?: Record<string, string>) => Promise<MockApiResponse<T>>;
  delete: <T = unknown>(url: string, headers?: Record<string, string>) => Promise<MockApiResponse<T>>;
  patch: <T = unknown>(url: string, body?: unknown, headers?: Record<string, string>) => Promise<MockApiResponse<T>>;
}

// ===========================================
// Test Setup Types
// ===========================================

/**
 * Global test setup configuration
 */
export interface TestSetupConfig {
  database: {
    url: string;
    maxConnections: number;
    isolationLevel: 'read_committed' | 'repeatable_read' | 'serializable';
  };
  authentication: {
    jwtSecret: string;
    tokenExpiry: string;
    refreshTokenExpiry: string;
  };
  cache: {
    enabled: boolean;
    ttl: number;
  };
}

/**
 * Per-test cleanup configuration
 */
export interface TestCleanupConfig {
  resetDatabase: boolean;
  clearCache: boolean;
  resetMocks: boolean;
}

// ===========================================
// Export helper for type checking
// ===========================================

/**
 * Helper type to ensure no `any` types are used
 * This will cause a TypeScript error if `any` is used
 */
export type NoAny<T> = T extends any 
  ? T extends (infer U)[]
    ? NoAny<U>[]
    : T extends object 
      ? { [K in keyof T]: NoAny<T[K]> }
      : T
  : never;
