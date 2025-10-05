/**
 * Comprehensive TypeScript Types for RBAC System
 * Healthcare Practice Management with Multi-tenant Support
 */

// Import NextRequest type for route handlers
import type { NextRequest } from 'next/server';

// Base RBAC Entities
export interface Permission {
  permission_id: string;
  name: string;
  description?: string | undefined;
  resource: string;
  action: string;
  scope: PermissionScope;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Role {
  role_id: string;
  name: string;
  description?: string | undefined;
  organization_id?: string | undefined;
  is_system_role: boolean;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date | undefined;
  permissions: Permission[];
}

export interface Organization {
  organization_id: string;
  name: string;
  slug: string;
  parent_organization_id?: string | undefined;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date | undefined;
  // Optional: populated by queries
  parent?: Organization;
  children?: Organization[];
}

export interface UserRole {
  user_role_id: string;
  user_id: string;
  role_id: string;
  organization_id?: string | undefined;
  granted_by?: string | undefined;
  granted_at: Date;
  expires_at?: Date | undefined;
  is_active: boolean;
  created_at: Date;
  // Optional: populated by queries
  role?: Role;
  organization?: Organization | undefined;
}

export interface UserOrganization {
  user_organization_id: string;
  user_id: string;
  organization_id: string;
  is_active: boolean;
  joined_at: Date;
  created_at: Date;
  // Optional: populated by queries
  organization?: Organization;
}

// Permission System Types
export type PermissionScope = 'own' | 'organization' | 'all';

// Permission name type - format: resource:action:scope (defined below with specific values)

export type ResourceType =
  | 'users'
  | 'practices'
  | 'organizations'
  | 'analytics'
  | 'roles'
  | 'settings'
  | 'templates'
  | 'api';

export type ActionType =
  | 'read'
  | 'create'
  | 'update'
  | 'delete'
  | 'manage'
  | 'export'
  | 'invite'
  | 'staff:manage';

// Specific Permission Name Types for Type Safety
export type UserPermission =
  | 'users:read:own'
  | 'users:update:own'
  | 'users:read:organization'
  | 'users:create:organization'
  | 'users:update:organization'
  | 'users:delete:organization'
  | 'users:read:all'
  | 'users:manage:all';

export type PracticePermission =
  | 'practices:read:own'
  | 'practices:update:own'
  | 'practices:staff:manage:own'
  | 'practices:staff:read:own'
  | 'practices:create:all'
  | 'practices:read:all'
  | 'practices:manage:all';

export type AnalyticsPermission =
  | 'analytics:read:organization'
  | 'analytics:export:organization'
  | 'analytics:read:all';

export type RolePermission =
  | 'roles:read:organization'
  | 'roles:create:organization'
  | 'roles:update:organization'
  | 'roles:delete:organization'
  | 'roles:read:all'
  | 'roles:manage:all';

export type SettingsPermission =
  | 'settings:read:organization'
  | 'settings:update:organization'
  | 'settings:read:all'
  | 'settings:update:all';

export type TemplatePermission = 'templates:read:organization' | 'templates:manage:all';

export type ApiPermission = 'api:read:organization' | 'api:write:organization';

export type DataSourcePermission =
  | 'data-sources:read:organization'
  | 'data-sources:read:all'
  | 'data-sources:create:organization'
  | 'data-sources:create:all'
  | 'data-sources:update:organization'
  | 'data-sources:update:all'
  | 'data-sources:delete:organization'
  | 'data-sources:delete:all'
  | 'data-sources:manage:all';

export type PermissionName =
  | UserPermission
  | PracticePermission
  | AnalyticsPermission
  | RolePermission
  | SettingsPermission
  | TemplatePermission
  | ApiPermission
  | DataSourcePermission;

// Role Types for Healthcare Practices
export type SystemRoleName = 'super_admin';

export type PracticeRoleName =
  | 'practice_admin'
  | 'practice_manager'
  | 'practice_staff'
  | 'practice_user';

export type RoleName = SystemRoleName | PracticeRoleName;

// User Context - Complete user information with RBAC data
export interface UserContext {
  // Basic user information
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  email_verified: boolean;

  // RBAC information
  roles: Role[];
  organizations: Organization[];
  accessible_organizations: Organization[]; // Includes child organizations
  user_roles: UserRole[];
  user_organizations: UserOrganization[];

  // Current context
  current_organization_id?: string | undefined;

  // Computed properties
  all_permissions: Permission[];
  is_super_admin: boolean;
  organization_admin_for: string[]; // Organization IDs where user is admin
}

// Access Control Types
export interface AccessScope {
  scope: PermissionScope;
  organizationIds?: string[];
  userId?: string;
}

export interface PermissionCheckOptions {
  resourceId?: string | undefined;
  organizationId?: string | undefined;
  requireAll?: boolean; // For multiple permissions
}

export interface PermissionCheckResult {
  granted: boolean;
  scope: PermissionScope;
  reason?: string | undefined;
  applicable_organizations?: string[] | undefined;
}

// Service Layer Types
export interface RBACServiceContext {
  userContext: UserContext;
  requestingUserId: string;
  currentOrganizationId?: string;
}

// Query Filter Types for Data Access
export interface DataAccessFilter {
  user_id?: string;
  organization_ids?: string[];
  scope: PermissionScope;
  accessible_resources: string[];
}

// Audit and Logging Types
export interface PermissionAuditLog {
  user_id: string;
  permission_name: string;
  resource_type: ResourceType;
  resource_id?: string;
  organization_id?: string;
  granted: boolean;
  scope: PermissionScope;
  timestamp: Date;
  ip_address?: string;
  user_agent?: string;
  reason?: string;
}

export interface RoleAssignmentAuditLog {
  user_id: string;
  role_id: string;
  organization_id?: string;
  action: 'granted' | 'revoked' | 'expired';
  granted_by: string;
  timestamp: Date;
  reason?: string;
}

// API Response Types
export interface RBACApiResponse<T> {
  success: boolean;
  data: T;
  permissions?: {
    granted: string[];
    denied: string[];
  };
  scope?: PermissionScope;
  accessible_organizations?: string[];
}

// Frontend Integration Types
export interface UsePermissionsReturn {
  hasPermission: (
    permission: PermissionName,
    resourceId?: string,
    organizationId?: string
  ) => boolean;
  hasAnyPermission: (
    permissions: PermissionName[],
    resourceId?: string,
    organizationId?: string
  ) => boolean;
  hasAllPermissions: (
    permissions: PermissionName[],
    resourceId?: string,
    organizationId?: string
  ) => boolean;
  canAccessResource: (resource: ResourceType, action: ActionType) => boolean;
  getAccessScope: (resource: ResourceType, action: ActionType) => AccessScope | null;
  getAllPermissions: () => Permission[];
  isAuthenticated: boolean;
  isSuperAdmin: boolean;
  isOrganizationAdmin: (organizationId?: string) => boolean;
  currentOrganization?: Organization | null;
  accessibleOrganizations: Organization[];
  isLoading: boolean;
}

// Component Props Types
export interface ProtectedComponentProps {
  permission?: PermissionName;
  permissions?: PermissionName[];
  requireAll?: boolean;
  resourceId?: string | undefined;
  organizationId?: string | undefined;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  showFallback?: boolean;
}

export interface ProtectedPageProps {
  permission?: PermissionName;
  permissions?: PermissionName[];
  requireAll?: boolean;
  redirectTo?: string;
  children: React.ReactNode;
  loadingComponent?: React.ReactNode;
}

// Error Types
export class RBACError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 403,
    public details?: unknown
  ) {
    super(message);
    this.name = 'RBACError';
  }
}

export class PermissionDeniedError extends RBACError {
  constructor(permission: string, resourceId?: string, organizationId?: string) {
    const message = `Permission denied: ${permission}${resourceId ? ` for resource ${resourceId}` : ''}${organizationId ? ` in organization ${organizationId}` : ''}`;
    super(message, 'PERMISSION_DENIED', 403, {
      permission,
      resourceId,
      organizationId,
    });
  }
}

export class InsufficientScopeError extends RBACError {
  constructor(requiredScope: PermissionScope, actualScope: PermissionScope) {
    super(
      `Insufficient scope: required ${requiredScope}, got ${actualScope}`,
      'INSUFFICIENT_SCOPE',
      403,
      { requiredScope, actualScope }
    );
  }
}

export class OrganizationAccessError extends RBACError {
  constructor(organizationId: string) {
    super(`Access denied to organization: ${organizationId}`, 'ORGANIZATION_ACCESS_DENIED', 403, {
      organizationId,
    });
  }
}

// Utility Types
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequiredPermissions<T extends Record<string, unknown>> = {
  [K in keyof T]: PermissionName | PermissionName[];
};

// Configuration Types
export interface RBACConfig {
  // Permission checking
  enableAuditLogging: boolean;
  enablePermissionCaching: boolean;
  permissionCacheTTL: number; // seconds

  // Organization hierarchy
  maxOrganizationDepth: number;
  enableOrganizationInheritance: boolean;

  // Security
  enableStrictModeChecking: boolean;
  requireFreshAuthForSensitiveOps: boolean;
  sensitiveOperationMaxAge: number; // minutes

  // Performance
  enableQueryOptimization: boolean;
  batchPermissionChecks: boolean;
  maxBatchSize: number;
}

// Next.js 15 Route Handler Types
export type RBACRouteHandler = (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => Promise<Response>;
