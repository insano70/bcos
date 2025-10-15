/**
 * API Permission Requirements Mapping
 * Defines specific permission requirements for each API endpoint
 */

import type { PermissionName } from '@/lib/types/rbac';

/**
 * Permission requirements for all API endpoints
 * Maps HTTP method + endpoint to required permissions
 */
export const API_PERMISSIONS: Record<string, PermissionName | PermissionName[]> = {
  // User Management API
  'GET /api/users': ['users:read:own', 'users:read:organization', 'users:read:all'],
  'POST /api/users': 'users:create:organization',
  'GET /api/users/[id]': ['users:read:own', 'users:read:organization', 'users:read:all'],
  'PUT /api/users/[id]': ['users:update:own', 'users:update:organization'],
  'DELETE /api/users/[id]': 'users:delete:organization',

  // Practice Management API
  'GET /api/practices': ['practices:read:own', 'practices:read:all'],
  'POST /api/practices': 'practices:create:all', // Super admin only
  'GET /api/practices/[id]': ['practices:read:own', 'practices:read:all'],
  'PUT /api/practices/[id]': 'practices:update:own',
  'DELETE /api/practices/[id]': 'practices:manage:all', // Super admin only

  // Practice Attributes API
  'GET /api/practices/[id]/attributes': ['practices:read:own', 'practices:read:all'],
  'PUT /api/practices/[id]/attributes': 'practices:update:own',

  // Practice Staff API
  'GET /api/practices/[id]/staff': ['practices:read:own', 'practices:staff:manage:own'],
  'POST /api/practices/[id]/staff': 'practices:staff:manage:own',
  'PUT /api/practices/[id]/staff/[staffId]': 'practices:staff:manage:own',
  'DELETE /api/practices/[id]/staff/[staffId]': 'practices:staff:manage:own',

  // Analytics API
  'GET /api/admin/analytics/practices': ['analytics:read:all'],
  'GET /api/admin/analytics/system': ['analytics:read:all'],

  // Data Sources API
  'GET /api/admin/data-sources': ['data-sources:read:organization', 'data-sources:read:all'],
  'POST /api/admin/data-sources': ['data-sources:create:organization', 'data-sources:create:all'],
  'GET /api/admin/data-sources/[id]': ['data-sources:read:organization', 'data-sources:read:all'],
  'PATCH /api/admin/data-sources/[id]': [
    'data-sources:update:organization',
    'data-sources:update:all',
  ],
  'DELETE /api/admin/data-sources/[id]': [
    'data-sources:delete:organization',
    'data-sources:delete:all',
  ],
  'POST /api/admin/data-sources/[id]/test': [
    'data-sources:read:organization',
    'data-sources:read:all',
  ],

  // Templates API (read-only for most users)
  'GET /api/templates': 'templates:read:organization',

  // Settings API (organization-scoped)
  'GET /api/settings': ['settings:read:organization', 'settings:read:all'],
  'PUT /api/settings': ['settings:update:organization', 'settings:update:all'],

  // Upload API (organization-scoped)
  'POST /api/upload': ['practices:update:own', 'users:update:own'],

  // Search API (scoped to accessible data)
  'GET /api/search': ['users:read:organization', 'practices:read:own', 'practices:read:all'],

  // Admin-only APIs
  'GET /api/admin/*': ['users:read:all', 'practices:read:all'], // Super admin only
  'POST /api/admin/*': ['users:manage:all', 'practices:manage:all'], // Super admin only
  'PUT /api/admin/*': ['users:manage:all', 'practices:manage:all'], // Super admin only
  'DELETE /api/admin/*': ['users:manage:all', 'practices:manage:all'], // Super admin only
};

/**
 * Permission requirements by resource type
 */
export const RESOURCE_PERMISSIONS = {
  users: {
    read: ['users:read:own', 'users:read:organization', 'users:read:all'],
    create: ['users:create:organization'],
    update: ['users:update:own', 'users:update:organization'],
    delete: ['users:delete:organization'],
  },
  practices: {
    read: ['practices:read:own', 'practices:read:all'],
    create: ['practices:create:all'], // Super admin only
    update: ['practices:update:own'],
    delete: ['practices:manage:all'], // Super admin only
  },
  analytics: {
    read: ['analytics:read:organization', 'analytics:read:all'],
    export: ['analytics:export:organization'],
  },
  roles: {
    read: ['roles:read:organization'],
    create: ['roles:create:organization'],
    update: ['roles:update:organization'],
    delete: ['roles:delete:organization'],
  },
  settings: {
    read: ['settings:read:organization', 'settings:read:all'],
    update: ['settings:update:organization', 'settings:update:all'],
  },
  templates: {
    read: ['templates:read:organization'],
    manage: ['templates:manage:all'], // Super admin only
  },
  dataSources: {
    read: ['data-sources:read:organization', 'data-sources:read:all'],
    create: ['data-sources:create:organization', 'data-sources:create:all'],
    update: ['data-sources:update:organization', 'data-sources:update:all'],
    delete: ['data-sources:delete:organization', 'data-sources:delete:all'],
    manage: ['data-sources:manage:all'],
  },
  dashboards: {
    read: ['dashboards:read:own', 'dashboards:read:organization', 'dashboards:read:all'],
    create: ['dashboards:create:own', 'dashboards:create:organization'],
    update: ['dashboards:update:own', 'dashboards:update:organization'],
    delete: ['dashboards:delete:own', 'dashboards:delete:organization'],
    manage: ['dashboards:manage:all'],
  },
  charts: {
    read: ['charts:read:own', 'charts:read:organization', 'charts:read:all'],
    create: ['charts:create:own', 'charts:create:organization'],
    update: ['charts:update:own', 'charts:update:organization'],
    delete: ['charts:delete:own', 'charts:delete:organization'],
    manage: ['charts:manage:all'],
  },
} as const;

/**
 * Role-based access patterns for common scenarios
 */
export const ROLE_ACCESS_PATTERNS = {
  // Super Admin - Full system access
  super_admin: [
    'users:read:all',
    'users:manage:all',
    'practices:create:all',
    'practices:read:all',
    'practices:manage:all',
    'analytics:read:all',
    'data-sources:read:all',
    'data-sources:create:all',
    'data-sources:update:all',
    'data-sources:delete:all',
    'data-sources:manage:all',
    'dashboards:read:all',
    'dashboards:manage:all',
    'charts:read:all',
    'charts:manage:all',
    'roles:manage:all',
    'settings:read:all',
    'settings:update:all',
    'templates:manage:all',
  ],

  // Practice Admin - Full practice management
  practice_admin: [
    'users:read:own',
    'users:update:own',
    'users:read:organization',
    'users:create:organization',
    'users:update:organization',
    'users:delete:organization',
    'practices:read:own',
    'practices:update:own',
    'practices:staff:manage:own',
    'analytics:read:organization',
    'analytics:export:organization',
    'data-sources:read:organization',
    'data-sources:create:organization',
    'data-sources:update:organization',
    'data-sources:delete:organization',
    'roles:read:organization',
    'roles:create:organization',
    'roles:update:organization',
    'roles:delete:organization',
    'settings:read:organization',
    'settings:update:organization',
    'templates:read:organization',
    'api:read:organization',
    'api:write:organization',
  ],

  // Practice Manager - Staff and operations
  practice_manager: [
    'users:read:own',
    'users:update:own',
    'users:read:organization',
    'users:create:organization',
    'users:update:organization',
    'practices:read:own',
    'practices:update:own',
    'practices:staff:manage:own',
    'analytics:read:organization',
    'analytics:export:organization',
    'data-sources:read:organization',
    'roles:read:organization',
    'settings:read:organization',
    'templates:read:organization',
    'api:read:organization',
  ],

  // Practice Staff - Basic access
  practice_staff: [
    'users:read:own',
    'users:update:own',
    'users:read:organization',
    'practices:read:own',
    'analytics:read:organization',
    'data-sources:read:organization',
    'templates:read:organization',
  ],

  // Practice User - Minimal access
  practice_user: [
    'users:read:own',
    'users:update:own',
    'practices:read:own',
    'data-sources:read:organization',
    'templates:read:organization',
  ],
} as const;

/**
 * Endpoint categorization for security analysis
 */
export const ENDPOINT_CATEGORIES = {
  // Public endpoints (no auth required)
  public: [
    '/api/health',
    '/api/health/db',
    '/api/health/services',
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/refresh',
    '/api/auth/logout',
    '/api/csrf',
    '/api/webhooks/*',
  ],

  // User management endpoints
  user_management: ['/api/users', '/api/users/[id]', '/api/auth/sessions'],

  // Practice management endpoints
  practice_management: [
    '/api/practices',
    '/api/practices/[id]',
    '/api/practices/[id]/attributes',
    '/api/practices/[id]/staff',
  ],

  // Analytics endpoints
  analytics: [
    '/api/admin/analytics/practices',
    '/api/admin/analytics/system',
  ],

  // System administration endpoints
  admin_only: ['/api/admin/*', '/api/templates', '/api/upload'],

  // Utility endpoints
  utility: ['/api/search'],
} as const;

/**
 * Security level classification
 */
export const SECURITY_LEVELS = {
  // Level 1: Public access
  public: ENDPOINT_CATEGORIES.public,

  // Level 2: Authenticated user access
  authenticated: ['/api/search', '/api/templates'],

  // Level 3: Organization member access
  organization_member: [
    '/api/users',
    '/api/practices',
    '/api/practices/[id]',
    '/api/practices/[id]/attributes',
  ],

  // Level 4: Organization admin access
  organization_admin: ['/api/users', '/api/practices/[id]/staff', '/api/practices/[id]/attributes'],

  // Level 5: Super admin access
  super_admin: [
    '/api/admin/*',
    '/api/practices', // Create new practices
    '/api/templates', // Manage templates
    '/api/upload',
  ],
} as const;

/**
 * Helper function to get required permissions for an endpoint
 */
export function getRequiredPermissions(
  method: string,
  pathname: string
): PermissionName | PermissionName[] | null {
  const key = `${method} ${pathname}`;
  return API_PERMISSIONS[key] || null;
}

/**
 * Check if endpoint is public (no auth required)
 */
export function isPublicEndpoint(pathname: string): boolean {
  return ENDPOINT_CATEGORIES.public.some((publicPath) => {
    if (publicPath.endsWith('/*')) {
      return pathname.startsWith(publicPath.slice(0, -2));
    }
    return pathname === publicPath;
  });
}

/**
 * Get security level for an endpoint
 */
export function getEndpointSecurityLevel(pathname: string): keyof typeof SECURITY_LEVELS {
  for (const [level, endpoints] of Object.entries(SECURITY_LEVELS)) {
    if (
      endpoints.some((endpoint) => {
        if (endpoint.endsWith('/*')) {
          return pathname.startsWith(endpoint.slice(0, -2));
        }
        if (endpoint.includes('[id]')) {
          const pattern = endpoint.replace(/\[id\]/g, '[^/]+');
          return new RegExp(`^${pattern}$`).test(pathname);
        }
        return pathname === endpoint;
      })
    ) {
      return level as keyof typeof SECURITY_LEVELS;
    }
  }

  return 'authenticated'; // Default fallback
}

/**
 * Validation helper for API route migration
 */
export function validateApiMigration() {
  const issues: string[] = [];

  // Check that all defined endpoints have permissions
  Object.entries(API_PERMISSIONS).forEach(([endpoint, permissions]) => {
    if (!permissions || (Array.isArray(permissions) && permissions.length === 0)) {
      issues.push(`No permissions defined for: ${endpoint}`);
    }
  });

  // Check for permission consistency
  const allPermissions = Object.values(API_PERMISSIONS).flat();
  const uniquePermissions = new Set(allPermissions);

  console.log(`📊 API Migration Validation:`);
  console.log(`   • ${Object.keys(API_PERMISSIONS).length} endpoints with permissions`);
  console.log(`   • ${uniquePermissions.size} unique permissions used`);
  console.log(`   • ${issues.length} issues found`);

  if (issues.length > 0) {
    console.warn('⚠️ Issues found:');
    for (const issue of issues) {
      console.warn(`   - ${issue}`);
    }
  }

  return { issues, totalEndpoints: Object.keys(API_PERMISSIONS).length };
}
