'use client';

import { usePermissions } from '@/lib/hooks/use-permissions';
import { type ProtectedComponentProps } from '@/lib/types/rbac';

/**
 * ProtectedComponent - Conditional rendering based on permissions
 * 
 * Hides/shows UI elements based on user's RBAC permissions
 * This is the UX layer of security - not a security boundary
 */
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
  const { hasPermission, hasAnyPermission, hasAllPermissions, isLoading } = usePermissions();

  // Wait for user context to load before making permission decisions
  // This prevents hiding content during the initial auth/RBAC loading phase
  if (isLoading) {
    return null;
  }

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

/**
 * Specialized permission components for common use cases
 */

/**
 * Super Admin Only Component
 */
export function SuperAdminOnly({
  children,
  fallback
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { isSuperAdmin, isLoading } = usePermissions();

  if (isLoading) {
    return null;
  }

  if (!isSuperAdmin) {
    return fallback ? <>{fallback}</> : null;
  }

  return <>{children}</>;
}

/**
 * Organization Admin Only Component
 */
export function OrgAdminOnly({
  children,
  fallback,
  organizationId
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  organizationId?: string;
}) {
  const permissions = usePermissions();

  if (permissions.isLoading) {
    return null;
  }

  const isAdmin = organizationId
    ? permissions.isOrganizationAdmin(organizationId)
    : permissions.accessibleOrganizations.some(org =>
        permissions.isOrganizationAdmin(org.organization_id)
      );

  if (!isAdmin) {
    return fallback ? <>{fallback}</> : null;
  }

  return <>{children}</>;
}

/**
 * User Management Component
 */
export function UserManagementOnly({ 
  children, 
  fallback 
}: { 
  children: React.ReactNode; 
  fallback?: React.ReactNode; 
}) {
  return (
    <ProtectedComponent 
      permissions={[
        'users:read:organization',
        'users:create:organization',
        'users:update:organization',
        'users:delete:organization'
      ]}
      fallback={fallback}
    >
      {children}
    </ProtectedComponent>
  );
}

/**
 * Practice Management Component
 */
export function PracticeManagementOnly({ 
  children, 
  fallback 
}: { 
  children: React.ReactNode; 
  fallback?: React.ReactNode; 
}) {
  return (
    <ProtectedComponent 
      permissions={[
        'practices:update:own',
        'practices:staff:manage:own',
        'practices:manage:all'
      ]}
      fallback={fallback}
    >
      {children}
    </ProtectedComponent>
  );
}

/**
 * Analytics Access Component
 */
export function AnalyticsOnly({ 
  children, 
  fallback 
}: { 
  children: React.ReactNode; 
  fallback?: React.ReactNode; 
}) {
  return (
    <ProtectedComponent 
      permissions={[
        'analytics:read:organization',
        'analytics:read:all'
      ]}
      fallback={fallback}
    >
      {children}
    </ProtectedComponent>
  );
}

/**
 * Settings Access Component
 */
export function SettingsOnly({ 
  children, 
  fallback 
}: { 
  children: React.ReactNode; 
  fallback?: React.ReactNode; 
}) {
  return (
    <ProtectedComponent 
      permissions={[
        'settings:read:organization',
        'settings:update:organization',
        'settings:read:all',
        'settings:update:all'
      ]}
      fallback={fallback}
    >
      {children}
    </ProtectedComponent>
  );
}

/**
 * Own Resource Only Component (for profile pages, etc.)
 */
export function OwnResourceOnly({
  children,
  fallback,
  resourceId,
  resourceType = 'users'
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  resourceId?: string;
  resourceType?: 'users' | 'practices';
}) {
  // Map resource type to specific permission string
  const permissionMap = {
    users: 'users:read:own' as const,
    practices: 'practices:read:own' as const,
  };

  return (
    <ProtectedComponent
      permission={permissionMap[resourceType]}
      resourceId={resourceId}
      fallback={fallback}
    >
      {children}
    </ProtectedComponent>
  );
}

/**
 * Conditional component that shows different content based on permission level
 */
export function PermissionLevelComponent({
  ownContent,
  orgContent,
  allContent,
  resourceType,
  resourceId,
  organizationId
}: {
  ownContent?: React.ReactNode;
  orgContent?: React.ReactNode;
  allContent?: React.ReactNode;
  resourceType: 'users' | 'practices' | 'analytics';
  resourceId?: string;
  organizationId?: string;
}) {
  const { hasPermission, isLoading } = usePermissions();

  if (isLoading) {
    return null;
  }

  // Map resource type to specific permission strings
  const permissionMap = {
    users: {
      all: 'users:read:all' as const,
      organization: 'users:read:organization' as const,
      own: 'users:read:own' as const,
    },
    practices: {
      all: 'practices:read:all' as const,
      organization: 'practices:read:organization' as const,
      own: 'practices:read:own' as const,
    },
    analytics: {
      all: 'analytics:read:all' as const,
      organization: 'analytics:read:organization' as const,
      own: 'analytics:read:own' as const,
    },
  };

  const permissions = permissionMap[resourceType];

  // Check permissions in order of increasing scope
  if (allContent && hasPermission(permissions.all, resourceId, organizationId)) {
    return <>{allContent}</>;
  }

  if (orgContent && hasPermission(permissions.organization, resourceId, organizationId)) {
    return <>{orgContent}</>;
  }

  if (ownContent && hasPermission(permissions.own, resourceId, organizationId)) {
    return <>{ownContent}</>;
  }

  return null;
}

export default ProtectedComponent;
