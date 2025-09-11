# Complete RBAC System Implementation Guide for Next.js

This guide provides a comprehensive, production-ready Role-Based Access Control (RBAC) system for Next.js applications using PostgreSQL, Drizzle ORM, and TypeScript.

## Table of Contents
1. [System Overview](#system-overview)
2. [Database Schema](#database-schema)
3. [Permission Granularity Strategy](#permission-granularity-strategy)
4. [TypeScript Types](#typescript-types)
5. [Core RBAC Implementation](#core-rbac-implementation)
6. [Middleware Layer](#middleware-layer)
7. [Service Layer](#service-layer)
8. [Frontend Integration](#frontend-integration)
9. [Multi-Layer Security](#multi-layer-security)
10. [Implementation Steps](#implementation-steps)
11. [Testing Strategy](#testing-strategy)
12. [Best Practices](#best-practices)

## System Overview

This RBAC system implements a three-tier permission model with multi-tenant support:

- **Resource-Action-Scope Pattern**: `resource:action:scope`
- **Multi-tenancy**: Organization-based isolation
- **Flexible Scoping**: `own`, `organization`, `all` access levels
- **Multi-layer Security**: Frontend, Middleware, Service, and Database enforcement

### Key Features
- ✅ Type-safe permission checking
- ✅ Multi-tenant organization support
- ✅ Flexible role hierarchy
- ✅ Scope-based data filtering
- ✅ Audit trail capabilities
- ✅ Performance optimized with proper indexing

## Database Schema

```sql
-- Organizations table (for multi-tenancy/scoping)
CREATE TABLE public.organizations (
    organization_id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Permissions table
CREATE TABLE public.permissions (
    permission_id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE, -- e.g., 'users:read', 'organizations:create'
    description TEXT,
    resource VARCHAR(50) NOT NULL, -- e.g., 'users', 'organizations', 'analytics'
    action VARCHAR(50) NOT NULL, -- e.g., 'read', 'create', 'update', 'delete'
    scope VARCHAR(50) DEFAULT 'own', -- 'own', 'organization', 'all'
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Roles table
CREATE TABLE public.roles (
    role_id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    name VARCHAR(100) NOT NULL, -- e.g., 'admin', 'manager', 'user'
    description TEXT,
    organization_id UUID REFERENCES public.organizations(organization_id) ON DELETE CASCADE,
    is_system_role BOOLEAN DEFAULT false, -- true for global roles like 'super_admin'
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    -- Ensure unique role names per organization (or globally for system roles)
    CONSTRAINT unique_role_per_org UNIQUE (name, organization_id)
);

-- Role permissions junction table
CREATE TABLE public.role_permissions (
    role_permission_id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    role_id UUID NOT NULL REFERENCES public.roles(role_id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES public.permissions(permission_id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    
    CONSTRAINT unique_role_permission UNIQUE (role_id, permission_id)
);

-- User roles junction table
CREATE TABLE public.user_roles (
    user_role_id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES public.roles(role_id) ON DELETE CASCADE,
    organization_id UUID REFERENCES public.organizations(organization_id) ON DELETE CASCADE,
    granted_by UUID REFERENCES public.users(user_id),
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    expires_at TIMESTAMP WITH TIME ZONE, -- Optional: for temporary role assignments
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    
    CONSTRAINT unique_user_role_org UNIQUE (user_id, role_id, organization_id)
);

-- User organizations table (for multi-tenant membership)
CREATE TABLE public.user_organizations (
    user_organization_id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(organization_id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT true,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    
    CONSTRAINT unique_user_organization UNIQUE (user_id, organization_id)
);

-- Performance indexes
CREATE INDEX idx_permissions_resource_action ON public.permissions (resource, action);
CREATE INDEX idx_permissions_name ON public.permissions (name);
CREATE INDEX idx_roles_organization ON public.roles (organization_id);
CREATE INDEX idx_roles_name ON public.roles (name);
CREATE INDEX idx_role_permissions_role ON public.role_permissions (role_id);
CREATE INDEX idx_role_permissions_permission ON public.role_permissions (permission_id);
CREATE INDEX idx_user_roles_user ON public.user_roles (user_id);
CREATE INDEX idx_user_roles_role ON public.user_roles (role_id);
CREATE INDEX idx_user_roles_organization ON public.user_roles (organization_id);
CREATE INDEX idx_user_organizations_user ON public.user_organizations (user_id);
CREATE INDEX idx_user_organizations_org ON public.user_organizations (organization_id);
CREATE INDEX idx_organizations_slug ON public.organizations (slug);

-- Set table ownership
ALTER TABLE public.organizations OWNER TO bcos_d;
ALTER TABLE public.permissions OWNER TO bcos_d;
ALTER TABLE public.roles OWNER TO bcos_d;
ALTER TABLE public.role_permissions OWNER TO bcos_d;
ALTER TABLE public.user_roles OWNER TO bcos_d;
ALTER TABLE public.user_organizations OWNER TO bcos_d;
```

### Sample Data Setup

```sql
-- Sample permissions
INSERT INTO public.permissions (name, description, resource, action, scope) VALUES
-- User management
('users:read:own', 'Read own user profile', 'users', 'read', 'own'),
('users:update:own', 'Update own user profile', 'users', 'update', 'own'),
('users:read:organization', 'Read users in organization', 'users', 'read', 'organization'),
('users:create:organization', 'Create users in organization', 'users', 'create', 'organization'),
('users:update:organization', 'Update users in organization', 'users', 'update', 'organization'),
('users:delete:organization', 'Delete users in organization', 'users', 'delete', 'organization'),
('users:read:all', 'Read all users (super admin)', 'users', 'read', 'all'),

-- Organization management
('organizations:read:own', 'Read own organizations', 'organizations', 'read', 'own'),
('organizations:update:own', 'Update own organizations', 'organizations', 'update', 'own'),
('organizations:create:all', 'Create organizations', 'organizations', 'create', 'all'),
('organizations:read:all', 'Read all organizations', 'organizations', 'read', 'all'),

-- Analytics
('analytics:read:organization', 'View organization analytics', 'analytics', 'read', 'organization'),
('analytics:read:all', 'View all analytics', 'analytics', 'read', 'all'),

-- Role management
('roles:read:organization', 'Read roles in organization', 'roles', 'read', 'organization'),
('roles:create:organization', 'Create roles in organization', 'roles', 'create', 'organization'),
('roles:update:organization', 'Update roles in organization', 'roles', 'update', 'organization'),
('roles:delete:organization', 'Delete roles in organization', 'roles', 'delete', 'organization');

-- Sample roles
INSERT INTO public.roles (name, description, is_system_role) VALUES
('super_admin', 'Super administrator with all permissions', true),
('org_admin', 'Organization administrator', false),
('manager', 'Team manager', false),
('user', 'Regular user', false);
```

## Permission Granularity Strategy

### Resource-Action-Scope Pattern

All permissions follow the format: `resource:action:scope`

**Resources**: Logical groupings of functionality
- `users` - User management
- `organizations` - Organization management
- `analytics` - Reporting and analytics
- `roles` - Role and permission management
- `billing` - Billing and payments
- `api` - API access
- `integrations` - Third-party integrations

**Actions**: What can be done with the resource
- `read` - View/list resources
- `create` - Create new resources
- `update` - Modify existing resources
- `delete` - Remove resources
- `invite` - Invite users
- `export` - Export data
- `manage` - Full management (create/update/delete)

**Scopes**: Data access boundaries
- `own` - User's own data only
- `organization` - Data within user's organization(s)
- `all` - All data across the system (super admin)

### Permission Examples by Feature

```typescript
// User Management Permissions
const USER_PERMISSIONS = [
  'users:read:own',           // View own profile
  'users:update:own',         // Edit own profile
  'users:read:organization',  // View org members
  'users:invite:organization', // Invite new users
  'users:update:organization', // Edit org members
  'users:delete:organization', // Remove org members
  'users:read:all'            // Super admin: view all users
];

// Organization Management
const ORG_PERMISSIONS = [
  'organizations:read:own',     // View own orgs
  'organizations:update:own',   // Edit own orgs
  'organizations:create:all',   // Create new orgs
  'organizations:read:all'      // View all orgs
];

// Analytics & Reporting
const ANALYTICS_PERMISSIONS = [
  'analytics:read:organization', // View org analytics
  'analytics:export:organization', // Export org reports
  'analytics:read:all'          // View all analytics
];

// Settings & Configuration
const SETTINGS_PERMISSIONS = [
  'settings:read:organization',
  'settings:update:organization',
  'billing:read:organization',
  'billing:update:organization'
];

// API Access Control
const API_PERMISSIONS = [
  'api:read:organization',      // Read API access
  'api:write:organization',     // Write API access
  'api:keys:manage:organization' // Manage API keys
];
```

## TypeScript Types

Create comprehensive type definitions for type safety:

```typescript
// types/rbac.ts
export interface Permission {
  permission_id: string;
  name: string;
  description?: string;
  resource: string;
  action: string;
  scope: 'own' | 'organization' | 'all';
  is_active: boolean;
}

export interface Role {
  role_id: string;
  name: string;
  description?: string;
  organization_id?: string;
  is_system_role: boolean;
  is_active: boolean;
  permissions: Permission[];
}

export interface Organization {
  organization_id: string;
  name: string;
  slug: string;
  is_active: boolean;
}

export interface UserContext {
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  roles: Role[];
  organizations: Organization[];
  current_organization_id?: string;
}

export interface AccessScope {
  scope: 'own' | 'organization' | 'all';
  organizationIds?: string[];
  userId?: string;
}

export type PermissionName = 
  | `users:${UserAction}:${Scope}`
  | `organizations:${OrgAction}:${Scope}`
  | `analytics:${AnalyticsAction}:${Scope}`
  | `roles:${RoleAction}:${Scope}`;

type UserAction = 'read' | 'create' | 'update' | 'delete' | 'invite';
type OrgAction = 'read' | 'create' | 'update' | 'delete';
type AnalyticsAction = 'read' | 'export';
type RoleAction = 'read' | 'create' | 'update' | 'delete';
type Scope = 'own' | 'organization' | 'all';
```

## Core RBAC Implementation

### Permission Checker Class

```typescript
// lib/rbac/permission-checker.ts
export class PermissionChecker {
  constructor(private userContext: UserContext) {}

  /**
   * Check if user has a specific permission
   * @param permissionName - e.g., 'users:read:organization'
   * @param resourceId - ID of the resource being accessed (optional)
   * @param organizationId - Organization context (optional)
   */
  hasPermission(
    permissionName: string,
    resourceId?: string,
    organizationId?: string
  ): boolean {
    const [resource, action, scope] = permissionName.split(':');
    
    // Check if user has the permission through any of their roles
    const hasPermission = this.userContext.roles.some(role => 
      role.permissions.some(permission => 
        permission.name === permissionName ||
        (permission.resource === resource && 
         permission.action === action && 
         this.checkScope(permission.scope, resourceId, organizationId))
      )
    );

    return hasPermission;
  }

  /**
   * Check multiple permissions (OR logic)
   */
  hasAnyPermission(permissions: string[], resourceId?: string, organizationId?: string): boolean {
    return permissions.some(permission => 
      this.hasPermission(permission, resourceId, organizationId)
    );
  }

  /**
   * Check multiple permissions (AND logic)
   */
  hasAllPermissions(permissions: string[], resourceId?: string, organizationId?: string): boolean {
    return permissions.every(permission => 
      this.hasPermission(permission, resourceId, organizationId)
    );
  }

  /**
   * Get the highest scope available for a resource:action combination
   */
  getAccessibleResourceIds(resource: string, action: string): AccessScope {
    const permissions = this.userContext.roles
      .flatMap(role => role.permissions)
      .filter(p => p.resource === resource && p.action === action);

    // Return the highest scope available
    if (permissions.some(p => p.scope === 'all')) {
      return { scope: 'all' };
    }
    
    if (permissions.some(p => p.scope === 'organization')) {
      return { 
        scope: 'organization', 
        organizationIds: this.userContext.organizations.map(org => org.organization_id)
      };
    }
    
    if (permissions.some(p => p.scope === 'own')) {
      return { 
        scope: 'own', 
        userId: this.userContext.user_id 
      };
    }

    throw new Error(`No permission for ${resource}:${action}`);
  }

  /**
   * Get all permissions for the user
   */
  getAllPermissions(): Permission[] {
    return this.userContext.roles
      .flatMap(role => role.permissions)
      .filter((permission, index, array) => 
        array.findIndex(p => p.permission_id === permission.permission_id) === index
      );
  }

  /**
   * Check if user can access a specific organization
   */
  canAccessOrganization(organizationId: string): boolean {
    return this.userContext.organizations.some(org => 
      org.organization_id === organizationId && org.is_active
    );
  }

  private checkScope(
    scope: string,
    resourceId?: string,
    organizationId?: string
  ): boolean {
    switch (scope) {
      case 'own':
        // User can only access their own resources
        return resourceId === this.userContext.user_id;
      
      case 'organization':
        // User can access resources within their organization
        const targetOrg = organizationId || this.userContext.current_organization_id;
        return this.userContext.organizations.some(org => 
          org.organization_id === targetOrg && org.is_active
        );
      
      case 'all':
        // User can access all resources (super admin)
        return true;
      
      default:
        return false;
    }
  }
}
```

### User Context Service

```typescript
// lib/rbac/user-context.ts
import { db } from '@/lib/db';
import { users, roles, permissions, userRoles, organizations, rolePermissions } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getOrganizationHierarchy } from './organization-hierarchy';

export async function getUserContext(userId: string): Promise<UserContext> {
  // Get user basic info with organization
  const user = await db
    .select({
      user_id: users.user_id,
      email: users.email,
      first_name: users.first_name,
      last_name: users.last_name,
      organization_id: users.organization_id,
      org_name: organizations.name,
      org_slug: organizations.slug,
      org_parent_id: organizations.parent_organization_id,
      org_is_active: organizations.is_active
    })
    .from(users)
    .innerJoin(organizations, eq(users.organization_id, organizations.organization_id))
    .where(eq(users.user_id, userId))
    .limit(1);

  if (!user.length) {
    throw new Error('User not found');
  }

  const userData = user[0];

  // Get user's accessible organizations (their org + all children)
  const accessibleOrganizations = await getOrganizationHierarchy(userData.organization_id);

  // Get user's roles with permissions
  const userRolesWithPermissions = await db
    .select({
      role_id: roles.role_id,
      role_name: roles.name,
      role_description: roles.description,
      organization_id: roles.organization_id,
      is_system_role: roles.is_system_role,
      permission_id: permissions.permission_id,
      permission_name: permissions.name,
      permission_description: permissions.description,
      resource: permissions.resource,
      action: permissions.action,
      scope: permissions.scope,
      permission_is_active: permissions.is_active,
    })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.role_id, roles.role_id))
    .innerJoin(rolePermissions, eq(roles.role_id, rolePermissions.role_id))
    .innerJoin(permissions, eq(rolePermissions.permission_id, permissions.permission_id))
    .where(and(
      eq(userRoles.user_id, userId),
      eq(userRoles.is_active, true),
      eq(roles.is_active, true),
      eq(permissions.is_active, true)
    ));

  // Group permissions by role
  const rolesMap = new Map<string, Role>();
  
  userRolesWithPermissions.forEach(row => {
    if (!rolesMap.has(row.role_id)) {
      rolesMap.set(row.role_id, {
        role_id: row.role_id,
        name: row.role_name,
        description: row.role_description,
        organization_id: row.organization_id,
        is_system_role: row.is_system_role,
        permissions: []
      });
    }

    const role = rolesMap.get(row.role_id)!;
    role.permissions.push({
      permission_id: row.permission_id,
      name: row.permission_name,
      description: row.permission_description,
      resource: row.resource,
      action: row.action,
      scope: row.scope as 'own' | 'organization' | 'all',
      is_active: row.permission_is_active
    });
  });

  return {
    user_id: userData.user_id,
    email: userData.email,
    first_name: userData.first_name,
    last_name: userData.last_name,
    organization_id: userData.organization_id,
    organization: {
      organization_id: userData.organization_id,
      name: userData.org_name,
      slug: userData.org_slug,
      parent_organization_id: userData.org_parent_id,
      is_active: userData.org_is_active
    },
    accessible_organizations: accessibleOrganizations,
    roles: Array.from(rolesMap.values())
  };
}
    last_name: user[0].last_name,
    roles: Array.from(rolesMap.values()),
    organizations: userOrgs,
    current_organization_id: userOrgs[0]?.organization_id // Default to first org
  };
}
```

## Middleware Layer

### RBAC Middleware

```typescript
// lib/rbac/middleware.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { getUserContext } from '@/lib/rbac/user-context';
import { PermissionChecker } from '@/lib/rbac/permission-checker';

export function createRBACMiddleware(requiredPermission: string | string[]) {
  return async (request: NextRequest) => {
    try {
      const sessionUser = await getSessionUser();
      if (!sessionUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const userContext = await getUserContext(sessionUser.user_id);
      const checker = new PermissionChecker(userContext);
      
      // Extract resource ID from URL if present
      const pathSegments = request.nextUrl.pathname.split('/');
      const resourceId = pathSegments[pathSegments.length - 1];
      const orgId = request.headers.get('x-organization-id') || userContext.current_organization_id;

      // Check permissions (support both single permission and array)
      const permissions = Array.isArray(requiredPermission) ? requiredPermission : [requiredPermission];
      const hasAccess = checker.hasAnyPermission(permissions, resourceId, orgId);

      if (!hasAccess) {
        return NextResponse.json({ 
          error: 'Forbidden',
          message: `Missing required permissions: ${permissions.join(' or ')}`
        }, { status: 403 });
      }

      // Add user context to headers for downstream use
      const response = NextResponse.next();
      response.headers.set('x-user-context', JSON.stringify(userContext));
      response.headers.set('x-organization-id', orgId || '');
      return response;
    } catch (error) {
      console.error('RBAC Middleware Error:', error);
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
  };
}

// Specialized middleware creators
export const requirePermission = (permission: string) => createRBACMiddleware(permission);
export const requireAnyPermission = (permissions: string[]) => createRBACMiddleware(permissions);

// Common middleware instances
export const requireUserRead = createRBACMiddleware(['users:read:own', 'users:read:organization', 'users:read:all']);
export const requireUserWrite = createRBACMiddleware(['users:update:own', 'users:update:organization']);
export const requireOrgAdmin = createRBACMiddleware(['organizations:update:own', 'users:create:organization']);
```

### Route Protection Decorator

```typescript
// lib/rbac/route-protection.ts
import { NextRequest } from 'next/server';
import { createRBACMiddleware } from './middleware';

export function withRBAC(permission: string | string[]) {
  return function <T extends (...args: any[]) => any>(
    target: T,
    context: ClassMethodDecoratorContext
  ) {
    const middleware = createRBACMiddleware(permission);
    
    return async function (this: any, request: NextRequest, ...args: any[]) {
      const middlewareResult = await middleware(request);
      
      if (middlewareResult.status !== 200) {
        return middlewareResult;
      }
      
      // Extract user context from middleware
      const userContext = JSON.parse(
        middlewareResult.headers.get('x-user-context') || '{}'
      );
      
      // Call original method with user context
      return target.call(this, request, userContext, ...args);
    } as T;
  };
}
```

## Service Layer

### Base Service with RBAC

```typescript
// lib/services/base-service.ts
import { AccessScope, UserContext } from '@/types/rbac';
import { PermissionChecker } from '@/lib/rbac/permission-checker';

export abstract class BaseRBACService {
  protected checker: PermissionChecker;
  
  constructor(protected userContext: UserContext) {
    this.checker = new PermissionChecker(userContext);
  }

  protected requirePermission(permission: string, resourceId?: string, organizationId?: string): void {
    if (!this.checker.hasPermission(permission, resourceId, organizationId)) {
      throw new Error(`Access denied: Missing permission ${permission}`);
    }
  }

  protected getAccessScope(resource: string, action: string): AccessScope {
    return this.checker.getAccessibleResourceIds(resource, action);
  }
}
```

### Users Service with RBAC

```typescript
// lib/services/users-service.ts
import { BaseRBACService } from './base-service';
import { db } from '@/lib/db';
import { users, userOrganizations } from '@/lib/db/schema';
import { eq, inArray, and } from 'drizzle-orm';

export class UsersService extends BaseRBACService {
  async getUsers(organizationId?: string) {
    const accessScope = this.getAccessScope('users', 'read');
    
    let query = db.select({
      user_id: users.user_id,
      email: users.email,
      first_name: users.first_name,
      last_name: users.last_name,
      is_active: users.is_active,
      created_at: users.created_at
    }).from(users);

    switch (accessScope.scope) {
      case 'own':
        query = query.where(eq(users.user_id, accessScope.userId!));
        break;
      
      case 'organization':
        // Filter by organization membership
        const targetOrgId = organizationId || this.userContext.current_organization_id;
        if (!targetOrgId || !accessScope.organizationIds?.includes(targetOrgId)) {
          throw new Error('Access denied: Invalid organization');
        }
        
        query = query
          .innerJoin(userOrganizations, eq(users.user_id, userOrganizations.user_id))
          .where(and(
            eq(userOrganizations.organization_id, targetOrgId),
            eq(userOrganizations.is_active, true),
            eq(users.is_active, true)
          ));
        break;
      
      case 'all':
        // No filtering - return all users
        query = query.where(eq(users.is_active, true));
        break;
    }

    return await query;
  }

  async getUserById(userId: string) {
    // Check if user can access this specific user
    if (!this.checker.hasPermission('users:read:own', userId) &&
        !this.checker.hasPermission('users:read:organization') &&
        !this.checker.hasPermission('users:read:all')) {
      throw new Error('Access denied');
    }

    const user = await db
      .select()
      .from(users)
      .where(eq(users.user_id, userId))
      .limit(1);

    if (!user.length) {
      throw new Error('User not found');
    }

    // For organization scope, verify user is in same org
    if (this.checker.hasPermission('users:read:organization') && 
        !this.checker.hasPermission('users:read:all')) {
      const userOrgs = await db
        .select({ organization_id: userOrganizations.organization_id })
        .from(userOrganizations)
        .where(eq(userOrganizations.user_id, userId));
      
      const hasSharedOrg = userOrgs.some(org => 
        this.userContext.organizations.some(userOrg => 
          userOrg.organization_id === org.organization_id
        )
      );

      if (!hasSharedOrg) {
        throw new Error('Access denied: User not in accessible organization');
      }
    }

    return user[0];
  }

  async createUser(userData: CreateUserData, organizationId: string) {
    this.requirePermission('users:create:organization', undefined, organizationId);
    
    // Verify user can create in this organization
    if (!this.checker.canAccessOrganization(organizationId)) {
      throw new Error('Access denied: Cannot create user in this organization');
    }

    // Implementation for user creation
    // ... user creation logic
  }

  async updateUser(userId: string, updateData: UpdateUserData) {
    // Check permissions: can update own profile OR can update organization users
    const canUpdateOwn = this.checker.hasPermission('users:update:own', userId);
    const canUpdateOrg = this.checker.hasPermission('users:update:organization');
    const canUpdateAll = this.checker.hasPermission('users:update:all');

    if (!canUpdateOwn && !canUpdateOrg && !canUpdateAll) {
      throw new Error('Access denied: Cannot update user');
    }

    // For organization scope, verify user is in same org
    if (canUpdateOrg && !canUpdateAll && userId !== this.userContext.user_id) {
      // Verify shared organization logic here
    }

    // Implementation for user update
    // ... user update logic
  }

  async deleteUser(userId: string) {
    this.requirePermission('users:delete:organization');
    
    // Prevent self-deletion
    if (userId === this.userContext.user_id) {
      throw new Error('Cannot delete your own account');
    }

    // Implementation for user deletion
    // ... user deletion logic
  }
}

// Factory function for creating service instance
export function createUsersService(userContext: UserContext): UsersService {
  return new UsersService(userContext);
}
```

### Organizations Service

```typescript
// lib/services/organizations-service.ts
import { BaseRBACService } from './base-service';
import { db } from '@/lib/db';
import { organizations, userOrganizations } from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';

export class OrganizationsService extends BaseRBACService {
  async getOrganizations() {
    const accessScope = this.getAccessScope('organizations', 'read');
    
    let query = db.select().from(organizations);

    switch (accessScope.scope) {
      case 'own':
        // Return only organizations user belongs to
        query = query
          .innerJoin(userOrganizations, eq(organizations.organization_id, userOrganizations.organization_id))
          .where(eq(userOrganizations.user_id, this.userContext.user_id));
        break;
      
      case 'all':
        // No filtering - return all organizations
        break;
    }

    return await query;
  }

  async createOrganization(orgData: CreateOrganizationData) {
    this.requirePermission('organizations:create:all');
    
    // Implementation for organization creation
    // ... organization creation logic
  }

  async updateOrganization(organizationId: string, updateData: UpdateOrganizationData) {
    this.requirePermission('organizations:update:own', undefined, organizationId);
    
    // Verify user can access this organization
    if (!this.checker.canAccessOrganization(organizationId)) {
      throw new Error('Access denied: Cannot update this organization');
    }

    // Implementation for organization update
    // ... organization update logic
  }
}

export function createOrganizationsService(userContext: UserContext): OrganizationsService {
  return new OrganizationsService(userContext);
}
```

## Frontend Integration

### React Hooks for RBAC

```typescript
// hooks/usePermissions.ts
import { useUser } from '@/lib/auth/user-context';
import { PermissionChecker } from '@/lib/rbac/permission-checker';
import { useMemo } from 'react';

export function usePermissions() {
  const { user } = useUser();
  
  const checker = useMemo(() => {
    return user ? new PermissionChecker(user) : null;
  }, [user]);

  const hasPermission = (
    permission: string, 
    resourceId?: string, 
    organizationId?: string
  ) => {
    if (!checker) return false;
    return checker.hasPermission(permission, resourceId, organizationId);
  };

  const hasAnyPermission = (
    permissions: string[], 
    resourceId?: string, 
    organizationId?: string
  ) => {
    if (!checker) return false;
    return checker.hasAnyPermission(permissions, resourceId, organizationId);
  };

  const hasAllPermissions = (
    permissions: string[], 
    resourceId?: string, 
    organizationId?: string
  ) => {
    if (!checker) return false;
    return checker.hasAllPermissions(permissions, resourceId, organizationId);
  };

  const canAccessResource = (resource: string, action: string) => {
    if (!checker) return false;
    
    try {
      checker.getAccessibleResourceIds(resource, action);
      return true;
    } catch {
      return false;
    }
  };

  const getAccessScope = (resource: string, action: string) => {
    if (!checker) return null;
    
    try {
      return checker.getAccessibleResourceIds(resource, action);
    } catch {
      return null;
    }
  };

  const getAllPermissions = () => {
    if (!checker) return [];
    return checker.getAllPermissions();
  };

  return { 
    hasPermission, 
    hasAnyPermission,
    hasAllPermissions,
    canAccessResource,
    getAccessScope,
    getAllPermissions,
    isAuthenticated: !!user
  };
}
```

### Protected Components

```typescript
// components/rbac/ProtectedComponent.tsx
import { usePermissions } from '@/hooks/usePermissions';
import { ReactNode } from 'react';

interface ProtectedComponentProps {
  permission?: string;
  permissions?: string[];
  requireAll?: boolean; // true = AND logic, false = OR logic
  resourceId?: string;
  organizationId?: string;
  children: ReactNode;
  fallback?: ReactNode;
  showFallback?: boolean;
}

export function ProtectedComponent({ 
  permission,
  permissions,
  requireAll = false,
  resourceId, 
  organizationId, 
  children, 
  fallback = null,
  showFallback = true
}: ProtectedComponentProps) {
  const { hasPermission, hasAnyPermission, hasAllPermissions } = usePermissions();
  
  let hasAccess = false;

  if (permission) {
    hasAccess = hasPermission(permission, resourceId, organizationId);
  } else if (permissions) {
    hasAccess = requireAll 
      ? hasAllPermissions(permissions, resourceId, organizationId)
      : hasAnyPermission(permissions, resourceId, organizationId);
  }
  
  if (!hasAccess) {
    return showFallback ? <>{fallback}</> : null;
  }
  
  return <>{children}</>;
}

// Specialized permission components
export function AdminOnly({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  return (
    <ProtectedComponent 
      permissions={['users:read:all', 'organizations:read:all']} 
      fallback={fallback}
    >
      {children}
    </ProtectedComponent>
  );
}

export function OrgAdminOnly({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  return (
    <ProtectedComponent 
      permissions={['users:create:organization', 'organizations:update:own']} 
      fallback={fallback}
    >
      {children}
    </ProtectedComponent>
  );
}
```

### Page-Level Protection

```typescript
// components/rbac/ProtectedPage.tsx
import { usePermissions } from '@/hooks/usePermissions';
import { useRouter } from 'next/navigation';
import { useEffect, ReactNode } from 'react';

interface ProtectedPageProps {
  permission?: string;
  permissions?: string[];
  requireAll?: boolean;
  redirectTo?: string;
  children: ReactNode;
  loadingComponent?: ReactNode;
}

export function ProtectedPage({
  permission,
  permissions,
  requireAll = false,
  redirectTo = '/unauthorized',
  children,
  loadingComponent = <div>Loading...</div>
}: ProtectedPageProps) {
  const { hasPermission, hasAnyPermission, hasAllPermissions, isAuthenticated } = usePermissions();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    let hasAccess = false;

    if (permission) {
      hasAccess = hasPermission(permission);
    } else if (permissions) {
      hasAccess = requireAll 
        ? hasAllPermissions(permissions)
        : hasAnyPermission(permissions);
    }

    if (!hasAccess) {
      router.push(redirectTo);
    }
  }, [isAuthenticated, permission, permissions, requireAll, redirectTo, router, hasPermission, hasAnyPermission, hasAllPermissions]);

  if (!isAuthenticated) {
    return <>{loadingComponent}</>;
  }

  let hasAccess = false;
  if (permission) {
    hasAccess = hasPermission(permission);
  } else if (permissions) {
    hasAccess = requireAll 
      ? hasAllPermissions(permissions)
      : hasAnyPermission(permissions);
  }

  if (!hasAccess) {
    return <>{loadingComponent}</>;
  }

  return <>{children}</>;
}
```

### Example Page Implementation

```typescript
// app/users/page.tsx
import { ProtectedPage } from '@/components/rbac/ProtectedPage';
import { ProtectedComponent } from '@/components/rbac/ProtectedComponent';
import { usePermissions } from '@/hooks/usePermissions';

export default function UsersPage() {
  return (
    <ProtectedPage permissions={['users:read:own', 'users:read:organization', 'users:read:all']}>
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Users</h1>
          
          <ProtectedComponent permission="users:create:organization">
            <CreateUserButton />
          </ProtectedComponent>
        </div>
        
        <UsersList />
        
        <ProtectedComponent permission="users:read:all">
          <SuperAdminPanel />
        </ProtectedComponent>
      </div>
    </ProtectedPage>
  );
}

function UsersList() {
  const { getAccessScope } = usePermissions();
  const scope = getAccessScope('users', 'read');
  
  return (
    <div>
      <p className="text-sm text-gray-600 mb-4">
        Viewing users with {scope?.scope} access
      </p>
      {/* User list implementation */}
    </div>
  );
}
```

## API Route Examples

### Complete API Route with RBAC

```typescript
// app/api/users/route.ts
import { NextRequest } from 'next/server';
import { createRBACMiddleware } from '@/lib/rbac/middleware';
import { createUsersService } from '@/lib/services/users-service';
import { z } from 'zod';

const rbacMiddleware = createRBACMiddleware(['users:read:own', 'users:read:organization', 'users:read:all']);

export async function GET(request: NextRequest) {
  const middlewareResult = await rbacMiddleware(request);
  if (middlewareResult.status !== 200) {
    return middlewareResult;
  }

  try {
    const userContext = JSON.parse(
      middlewareResult.headers.get('x-user-context') || '{}'
    );
    
    const organizationId = request.nextUrl.searchParams.get('organizationId') || undefined;
    
    const usersService = createUsersService(userContext);
    const users = await usersService.getUsers(organizationId);
    
    return Response.json({
      users,
      total: users.length,
      scope: usersService.getAccessScope('users', 'read')
    });
  } catch (error) {
    console.error('Users API Error:', error);
    return Response.json({ 
      error: error instanceof Error ? error.message : 'Failed to fetch users' 
    }, { status: 500 });
  }
}

// Create user endpoint
const createUserSchema = z.object({
  email: z.string().email(),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  organization_id: z.string().uuid()
});

const createUserMiddleware = createRBACMiddleware('users:create:organization');

export async function POST(request: NextRequest) {
  const middlewareResult = await createUserMiddleware(request);
  if (middlewareResult.status !== 200) {
    return middlewareResult;
  }

  try {
    const userContext = JSON.parse(
      middlewareResult.headers.get('x-user-context') || '{}'
    );
    
    const body = await request.json();
    const validatedData = createUserSchema.parse(body);
    
    const usersService = createUsersService(userContext);
    const newUser = await usersService.createUser(validatedData, validatedData.organization_id);
    
    return Response.json({ user: newUser }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: 'Validation error', details: error.errors }, { status: 400 });
    }
    
    console.error('Create User API Error:', error);
    return Response.json({ 
      error: error instanceof Error ? error.message : 'Failed to create user' 
    }, { status: 500 });
  }
}
```

### Dynamic Route with RBAC

```typescript
// app/api/users/[userId]/route.ts
import { NextRequest } from 'next/server';
import { createRBACMiddleware } from '@/lib/rbac/middleware';
import { createUsersService } from '@/lib/services/users-service';

const rbacMiddleware = createRBACMiddleware(['users:read:own', 'users:read:organization', 'users:read:all']);

export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  const middlewareResult = await rbacMiddleware(request);
  if (middlewareResult.status !== 200) {
    return middlewareResult;
  }

  try {
    const userContext = JSON.parse(
      middlewareResult.headers.get('x-user-context') || '{}'
    );
    
    const usersService = createUsersService(userContext);
    const user = await usersService.getUserById(params.userId);
    
    return Response.json({ user });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Access denied')) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    
    if (error instanceof Error && error.message.includes('not found')) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }
    
    console.error('Get User API Error:', error);
    return Response.json({ error: 'Failed to fetch user' }, { status: 500 });
  }
}
```

## Multi-Layer Security Implementation

### 1. Frontend Layer (UX Protection)

**Purpose**: Hide/show UI elements, provide better user experience
**Security Level**: Low (easily bypassed)

```typescript
// Example: Conditional rendering based on permissions
function UserManagementPanel() {
  const { hasPermission } = usePermissions();
  
  return (
    <div>
      {hasPermission('users:read:organization') && (
        <UsersList />
      )}
      
      {hasPermission('users:create:organization') && (
        <CreateUserButton />
      )}
      
      {hasPermission('analytics:read:organization') && (
        <AnalyticsDashboard />
      )}
    </div>
  );
}
```

### 2. Middleware Layer (Request Filtering)

**Purpose**: Early request validation, consistent permission checking
**Security Level**: High (server-side enforcement)

```typescript
// middleware.ts - Global middleware
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Apply RBAC to API routes
  if (request.nextUrl.pathname.startsWith('/api/')) {
    // RBAC middleware will be applied per route
    return NextResponse.next();
  }
  
  // Apply authentication to protected pages
  if (request.nextUrl.pathname.startsWith('/dashboard')) {
    // Check authentication
    const token = request.cookies.get('auth-token');
    if (!token) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*', '/dashboard/:path*']
};
```

### 3. Service Layer (Data Filtering)

**Purpose**: Apply scope-based filtering, business logic enforcement
**Security Level**: High (cannot be bypassed)

```typescript
// Example: Automatic data filtering based on user scope
class DataService extends BaseRBACService {
  async getFilteredData(resource: string, action: string) {
    const scope = this.getAccessScope(resource, action);
    
    // Automatically apply appropriate filters
    switch (scope.scope) {
      case 'own':
        return this.getOwnData(scope.userId!);
      case 'organization':
        return this.getOrganizationData(scope.organizationIds!);
      case 'all':
        return this.getAllData();
    }
  }
}
```

### 4. Database Layer (Final Safeguard)

**Purpose**: Row-level security, audit logging
**Security Level**: Maximum (database-enforced)

```sql
-- Row Level Security (RLS) policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Policy for users to read their own data
CREATE POLICY users_own_data ON users
  FOR SELECT
  USING (user_id = current_setting('app.current_user_id')::uuid);

-- Policy for organization-level access
CREATE POLICY users_organization_data ON users
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_organizations uo1
      WHERE uo1.user_id = users.user_id
      AND uo1.organization_id IN (
        SELECT uo2.organization_id 
        FROM user_organizations uo2 
        WHERE uo2.user_id = current_setting('app.current_user_id')::uuid
      )
    )
  );

-- Audit logging trigger
CREATE OR REPLACE FUNCTION audit_access()
RETURNS TRIGGER AS $
BEGIN
  INSERT INTO access_logs (user_id, table_name, action, resource_id, timestamp)
  VALUES (
    current_setting('app.current_user_id')::uuid,
    TG_TABLE_NAME,
    TG_OP,
    COALESCE(NEW.user_id, OLD.user_id),
    NOW()
  );
  RETURN COALESCE(NEW, OLD);
END;
$ LANGUAGE plpgsql;
```

## Implementation Steps

### Step 1: Database Setup

1. **Create the RBAC tables**:
```bash
# Run the SQL schema provided above
psql -d your_database -f rbac_schema.sql
```

2. **Set up Drizzle schema**:
```typescript
// lib/db/schema/rbac.ts
import { pgTable, uuid, varchar, text, boolean, timestamp } from 'drizzle-orm/pg-core';

export const organizations = pgTable('organizations', {
  organization_id: uuid('organization_id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  is_active: boolean('is_active').default(true),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  deleted_at: timestamp('deleted_at', { withTimezone: true })
});

export const permissions = pgTable('permissions', {
  permission_id: uuid('permission_id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  description: text('description'),
  resource: varchar('resource', { length: 50 }).notNull(),
  action: varchar('action', { length: 50 }).notNull(),
  scope: varchar('scope', { length: 50 }).default('own'),
  is_active: boolean('is_active').default(true),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow()
});

// ... other tables
```

3. **Generate and run migrations**:
```bash
npm run db:generate
npm run db:push
```

### Step 2: Seed Initial Data

```typescript
// lib/db/rbac-seed.ts
import { db } from './index';
import { permissions, roles, rolePermissions } from './schema';

export async function seedRBACData() {
  // Insert base permissions
  await db.insert(permissions).values([
    { name: 'users:read:own', resource: 'users', action: 'read', scope: 'own' },
    { name: 'users:read:organization', resource: 'users', action: 'read', scope: 'organization' },
    { name: 'users:read:all', resource: 'users', action: 'read', scope: 'all' },
    // ... more permissions
  ]);

  // Insert base roles
  await db.insert(roles).values([
    { name: 'super_admin', description: 'Super administrator', is_system_role: true },
    { name: 'org_admin', description: 'Organization administrator' },
    { name: 'user', description: 'Regular user' }
  ]);

  // Assign permissions to roles
  // ... role permission assignments
}
```

### Step 3: Authentication Integration

```typescript
// lib/auth/session.ts - Update your existing session management
import { getUserContext } from '@/lib/rbac/user-context';

export async function getSessionUser() {
  // Your existing session logic
  const sessionData = await getSession();
  
  if (!sessionData?.user_id) {
    return null;
  }
  
  // Get full user context with roles and permissions
  return await getUserContext(sessionData.user_id);
}
```

### Step 4: API Route Migration

Update your existing API routes to use RBAC:

```typescript
// Before: Basic auth check
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  // Get all users (no permission checking)
  const users = await db.select().from(users);
  return Response.json(users);
}

// After: RBAC implementation
export async function GET(request: NextRequest) {
  const middlewareResult = await rbacMiddleware(request);
  if (middlewareResult.status !== 200) {
    return middlewareResult;
  }

  const userContext = JSON.parse(
    middlewareResult.headers.get('x-user-context') || '{}'
  );
  
  const usersService = createUsersService(userContext);
  const users = await usersService.getUsers();
  
  return Response.json(users);
}
```

### Step 5: Frontend Integration

1. **Update your user context provider**:
```typescript
// contexts/UserContext.tsx
import { createContext, useContext, useEffect, useState } from 'react';
import { UserContext } from '@/types/rbac';

const UserContextProvider = createContext<{
  user: UserContext | null;
  loading: boolean;
  refetch: () => Promise<void>;
}>({
  user: null,
  loading: true,
  refetch: async () => {}
});

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserContext | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = async () => {
    try {
      const response = await fetch('/api/auth/me');
      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
      } else {
        setUser(null);
      }
    } catch (error) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();
  }, []);

  return (
    <UserContextProvider.Provider value={{ user, loading, refetch: fetchUser }}>
      {children}
    </UserContextProvider.Provider>
  );
}

export const useUser = () => useContext(UserContextProvider);
```

2. **Wrap your app**:
```typescript
// app/layout.tsx
import { UserProvider } from '@/contexts/UserContext';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <UserProvider>
          {children}
        </UserProvider>
      </body>
    </html>
  );
}
```

## Testing Strategy

### Unit Tests for Permission Logic

```typescript
// __tests__/rbac/permission-checker.test.ts
import { PermissionChecker } from '@/lib/rbac/permission-checker';
import { UserContext } from '@/types/rbac';

describe('PermissionChecker', () => {
  const mockUserContext: UserContext = {
    user_id: 'user-1',
    email: 'test@example.com',
    first_name: 'Test',
    last_name: 'User',
    organizations: [
      { organization_id: 'org-1', name: 'Test Org', slug: 'test-org', is_active: true }
    ],
    roles: [
      {
        role_id: 'role-1',
        name: 'user',
        is_system_role: false,
        organization_id: 'org-1',
        permissions: [
          { 
            permission_id: 'perm-1', 
            name: 'users:read:own', 
            resource: 'users', 
            action: 'read', 
            scope: 'own',
            is_active: true
          }
        ]
      }
    ],
    current_organization_id: 'org-1'
  };

  it('should allow user to read their own data', () => {
    const checker = new PermissionChecker(mockUserContext);
    expect(checker.hasPermission('users:read:own', 'user-1')).toBe(true);
  });

  it('should deny user from reading other users data with own scope', () => {
    const checker = new PermissionChecker(mockUserContext);
    expect(checker.hasPermission('users:read:own', 'other-user')).toBe(false);
  });

  it('should return correct access scope', () => {
    const checker = new PermissionChecker(mockUserContext);
    const scope = checker.getAccessibleResourceIds('users', 'read');
    
    expect(scope.scope).toBe('own');
    expect(scope.userId).toBe('user-1');
  });
});
```

### Integration Tests for API Routes

```typescript
// __tests__/api/users.test.ts
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/users/route';

jest.mock('@/lib/auth/session');
jest.mock('@/lib/rbac/user-context');

describe('/api/users', () => {
  it('should return 401 for unauthenticated requests', async () => {
    const request = new NextRequest('http://localhost/api/users');
    const response = await GET(request);
    
    expect(response.status).toBe(401);
  });

  it('should return filtered users based on scope', async () => {
    // Mock authenticated user with organization scope
    // ... test implementation
  });
});
```

### End-to-End Tests

```typescript
// e2e/rbac.spec.ts (Playwright/Cypress)
import { test, expect } from '@playwright/test';

test.describe('RBAC System', () => {
  test('should hide admin features from regular users', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[data-testid=email]', 'user@example.com');
    await page.fill('[data-testid=password]', 'password');
    await page.click('[data-testid=login-button]');
    
    await page.goto('/users');
    
    // Should not see admin-only features
    await expect(page.locator('[data-testid=create-user-button]')).not.toBeVisible();
    await expect(page.locator('[data-testid=delete-user-button]')).not.toBeVisible();
  });

  test('should show admin features to admins', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[data-testid=email]', 'admin@example.com');
    await page.fill('[data-testid=password]', 'password');
    await page.click('[data-testid=login-button]');
    
    await page.goto('/users');
    
    // Should see admin features
    await expect(page.locator('[data-testid=create-user-button]')).toBeVisible();
    await expect(page.locator('[data-testid=delete-user-button]')).toBeVisible();
  });
});
```

## Best Practices

### 1. Permission Naming Convention

- **Consistent format**: `resource:action:scope`
- **Clear naming**: Use descriptive resource and action names
- **Scope progression**: `own` < `organization` < `all`

### 2. Role Design

- **Principle of least privilege**: Grant minimum necessary permissions
- **Role hierarchy**: Design roles that build upon each other
- **Organization-specific**: Most roles should be organization-scoped

### 3. Security Considerations

- **Never trust frontend**: Always validate permissions server-side
- **Defense in depth**: Use multiple security layers
- **Audit everything**: Log all permission checks and access attempts
- **Regular reviews**: Periodically audit roles and permissions

### 4. Performance Optimization

- **Cache user context**: Cache permission lookups where appropriate
- **Efficient queries**: Use proper indexing and query optimization
- **Lazy loading**: Load permissions only when needed

### 5. Error Handling

- **Consistent responses**: Use standard error formats
- **Security through obscurity**: Don't reveal system internals in errors
- **Graceful degradation**: Handle permission failures gracefully

### Step 5: Frontend Integration

1. **Update your user context provider**:
```typescript
// contexts/UserContext.tsx
import { createContext, useContext, useEffect, useState } from 'react';
import { UserContext } from '@/types/rbac';

const UserContextProvider = createContext<{
  user: UserContext | null;
  loading: boolean;
  refetch: () => Promise<void>;
}>({
  user: null,
  loading: true,
  refetch: async () => {}
});

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserContext | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = async () => {
    try {
      const response = await fetch('/api/auth/me');
      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
      } else {
        setUser(null);
      }
    } catch (error) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();
  }, []);

  return (
    <UserContextProvider.Provider value={{ user, loading, refetch: fetchUser }}>
      {children}
    </UserContextProvider.Provider>
  );
}

export const useUser = () => useContext(UserContextProvider);
```

2. **Wrap your app**:
```typescript
// app/layout.tsx
import { UserProvider } from '@/contexts/UserContext';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <UserProvider>
          {children}
        </UserProvider>
      </body>
    </html>
  );
}
```

## Testing Strategy

### Unit Tests for Permission Logic

```typescript
// __tests__/rbac/permission-checker.test.ts
import { PermissionChecker } from '@/lib/rbac/permission-checker';
import { UserContext } from '@/types/rbac';

describe('PermissionChecker', () => {
  const mockUserContext: UserContext = {
    user_id: 'user-1',
    email: 'test@example.com',
    first_name: 'Test',
    last_name: 'User',
    organization_id: 'org-1',
    organization: {
      organization_id: 'org-1',
      name: 'Test Org',
      slug: 'test-org',
      parent_organization_id: null,
      is_active: true
    },
    accessible_organizations: [
      { organization_id: 'org-1', name: 'Test Org', slug: 'test-org', is_active: true },
      { organization_id: 'org-2', name: 'Child Org', slug: 'child-org', parent_organization_id: 'org-1', is_active: true }
    ],
    roles: [
      {
        role_id: 'role-1',
        name: 'user',
        is_system_role: false,
        organization_id: 'org-1',
        permissions: [
          { 
            permission_id: 'perm-1', 
            name: 'users:read:own', 
            resource: 'users', 
            action: 'read', 
            scope: 'own',
            is_active: true
          }
        ]
      }
    ]
  };

  it('should allow user to read their own data', () => {
    const checker = new PermissionChecker(mockUserContext);
    expect(checker.hasPermission('users:read:own', 'user-1')).toBe(true);
  });

  it('should deny user from reading other users data with own scope', () => {
    const checker = new PermissionChecker(mockUserContext);
    expect(checker.hasPermission('users:read:own', 'other-user')).toBe(false);
  });

  it('should return correct access scope', () => {
    const checker = new PermissionChecker(mockUserContext);
    const scope = checker.getAccessibleResourceIds('users', 'read');
    
    expect(scope.scope).toBe('own');
    expect(scope.userId).toBe('user-1');
  });

  it('should allow access to child organizations', () => {
    const checker = new PermissionChecker(mockUserContext);
    expect(checker.canAccessOrganization('org-2')).toBe(true); // Child org
  });
});
```

### Integration Tests for Organization Hierarchy

```typescript
// __tests__/rbac/organization-hierarchy.test.ts
import { getOrganizationHierarchy } from '@/lib/rbac/organization-hierarchy';
import { db } from '@/lib/db';

describe('Organization Hierarchy', () => {
  beforeEach(async () => {
    // Set up test data
    await db.insert(organizations).values([
      { organization_id: 'parent', name: 'Parent Org', slug: 'parent' },
      { organization_id: 'child1', name: 'Child 1', slug: 'child1', parent_organization_id: 'parent' },
      { organization_id: 'child2', name: 'Child 2', slug: 'child2', parent_organization_id: 'parent' },
      { organization_id: 'grandchild', name: 'Grandchild', slug: 'grandchild', parent_organization_id: 'child1' }
    ]);
  });

  it('should return organization and all descendants', async () => {
    const hierarchy = await getOrganizationHierarchy('parent');
    
    expect(hierarchy).toHaveLength(4);
    expect(hierarchy.map(org => org.organization_id)).toContain('parent');
    expect(hierarchy.map(org => org.organization_id)).toContain('child1');
    expect(hierarchy.map(org => org.organization_id)).toContain('child2');
    expect(hierarchy.map(org => org.organization_id)).toContain('grandchild');
  });

  it('should handle leaf organizations', async () => {
    const hierarchy = await getOrganizationHierarchy('grandchild');
    
    expect(hierarchy).toHaveLength(1);
    expect(hierarchy[0].organization_id).toBe('grandchild');
  });
});
```

### Integration Tests for API Routes

```typescript
// __tests__/api/users.test.ts
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/users/route';

jest.mock('@/lib/auth/session');
jest.mock('@/lib/rbac/user-context');

describe('/api/users', () => {
  it('should return 401 for unauthenticated requests', async () => {
    const request = new NextRequest('http://localhost/api/users');
    const response = await GET(request);
    
    expect(response.status).toBe(401);
  });

  it('should return filtered users based on organization hierarchy', async () => {
    // Mock authenticated user with organization scope
    const mockUserContext = {
      user_id: 'user-1',
      organization_id: 'parent-org',
      accessible_organizations: [
        { organization_id: 'parent-org' },
        { organization_id: 'child-org' }
      ],
      // ... other properties
    };

    // Mock the session and user context
    jest.mocked(getSessionUser).mockResolvedValue(mockUserContext);
    
    const request = new NextRequest('http://localhost/api/users');
    const response = await GET(request);
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.accessible_organizations).toHaveLength(2);
  });
});
```

### End-to-End Tests

```typescript
// e2e/rbac.spec.ts (Playwright/Cypress)
import { test, expect } from '@playwright/test';

test.describe('RBAC System', () => {
  test('should hide admin features from regular users', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[data-testid=email]', 'user@example.com');
    await page.fill('[data-testid=password]', 'password');
    await page.click('[data-testid=login-button]');
    
    await page.goto('/users');
    
    // Should not see admin-only features
    await expect(page.locator('[data-testid=create-user-button]')).not.toBeVisible();
    await expect(page.locator('[data-testid=delete-user-button]')).not.toBeVisible();
  });

  test('should show admin features to org admins', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[data-testid=email]', 'admin@example.com');
    await page.fill('[data-testid=password]', 'password');
    await page.click('[data-testid=login-button]');
    
    await page.goto('/users');
    
    // Should see admin features
    await expect(page.locator('[data-testid=create-user-button]')).toBeVisible();
    await expect(page.locator('[data-testid=delete-user-button]')).toBeVisible();
  });

  test('should respect organization hierarchy in user listings', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[data-testid=email]', 'parent-org-admin@example.com');
    await page.fill('[data-testid=password]', 'password');
    await page.click('[data-testid=login-button]');
    
    await page.goto('/users');
    
    // Should see users from parent org and child orgs
    await expect(page.locator('[data-testid=user-list]')).toBeVisible();
    
    // Check that users from child organizations are visible
    await expect(page.locator('[data-testid=user-row][data-org="child-org"]')).toBeVisible();
  });
});
```

## Best Practices

### 1. Permission Naming Convention

- **Consistent format**: `resource:action:scope`
- **Clear naming**: Use descriptive resource and action names
- **Scope progression**: `own` < `organization` < `all`

### 2. Role Design

- **Principle of least privilege**: Grant minimum necessary permissions
- **Role hierarchy**: Design roles that build upon each other
- **Organization-specific**: Most roles should be organization-scoped
- **Inheritance-aware**: Consider how permissions work across organization hierarchies

### 3. Organization Hierarchy Considerations

- **Performance**: Cache organization hierarchies to avoid recursive queries
- **Depth limits**: Consider maximum organization depth for performance
- **Circular references**: Prevent circular parent-child relationships
- **Soft deletes**: Use soft deletes to maintain hierarchy integrity

### 4. Security Considerations

- **Never trust frontend**: Always validate permissions server-side
- **Defense in depth**: Use multiple security layers
- **Regular reviews**: Periodically audit roles and permissions
- **Hierarchy validation**: Ensure organization hierarchy integrity

### 5. Performance Optimization

- **Cache user context**: Cache permission lookups where appropriate
- **Efficient queries**: Use proper indexing and query optimization
- **Lazy loading**: Load permissions only when needed
- **Hierarchy caching**: Cache organization hierarchies for frequent access

### 6. Error Handling

- **Consistent responses**: Use standard error formats
- **Security through obscurity**: Don't reveal system internals in errors
- **Graceful degradation**: Handle permission failures gracefully
- **Clear error messages**: Provide helpful error messages for debugging

This comprehensive RBAC system provides enterprise-grade security with hierarchical organization support. The system automatically handles organization inheritance, allowing users to access their organization and all child organizations while maintaining strict permission boundaries. The three-layer enforcement (Frontend → Middleware → Service) ensures security cannot be bypassed, while the hierarchical organization model provides flexible multi-tenant capabilities. Monitoring and Alerting

```typescript
// lib/rbac/audit.ts
export async function logPermissionCheck(
  userId: string,
  permission: string,
  resourceId: string | undefined,
  granted: boolean
) {
  await db.insert(auditLogs).values({
    user_id: userId,
    action: 'permission_check',
    resource: permission,
    resource_id: resourceId,
    granted,
    timestamp: new Date(),
    ip_address: getClientIP(),
    user_agent: getUserAgent()
  });
}
```

This comprehensive RBAC system provides enterprise-grade security with the flexibility to handle complex permission scenarios while maintaining excellent developer experience through TypeScript type safety and clear architectural patterns.userOrganizations.user_id, this.userContext.user_id));
        break;
      
      case 'organization':
        // Same as 'own' for organizations
        query = query
          .innerJoin(userOrganizations, eq(organizations.organization_id, userOrganizations.organization_id))
          .where(eq(