'use client';

import { usePermissions } from '@/lib/hooks/use-permissions';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { type ProtectedPageProps } from '@/lib/types/rbac';

/**
 * ProtectedPage - Page-level permission protection
 * 
 * Redirects users who don't have required permissions
 * Provides loading states during permission checking
 */
export function ProtectedPage({
  permission,
  permissions,
  requireAll = false,
  redirectTo = '/unauthorized',
  children,
  loadingComponent
}: ProtectedPageProps) {
  const { hasPermission, hasAnyPermission, hasAllPermissions, isAuthenticated } = usePermissions();
  const router = useRouter();

  useEffect(() => {
    // Redirect to login if not authenticated
    if (!isAuthenticated) {
      const currentPath = window.location.pathname + window.location.search;
      router.push(`/signin?callbackUrl=${encodeURIComponent(currentPath)}`);
      return;
    }

    // Check permissions
    let hasAccess = false;

    if (permission) {
      hasAccess = hasPermission(permission);
    } else if (permissions) {
      hasAccess = requireAll 
        ? hasAllPermissions(permissions)
        : hasAnyPermission(permissions);
    } else {
      // No specific permissions required - just need to be authenticated
      hasAccess = true;
    }

    // Redirect if no access
    if (!hasAccess) {
      router.push(redirectTo);
    }
  }, [
    isAuthenticated, 
    permission, 
    permissions, 
    requireAll, 
    redirectTo, 
    router, 
    hasPermission, 
    hasAnyPermission, 
    hasAllPermissions
  ]);

  // Show loading while checking authentication
  if (!isAuthenticated) {
    return loadingComponent || (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex items-center space-x-3">
          <svg className="animate-spin h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-gray-600">Checking authentication...</span>
        </div>
      </div>
    );
  }

  // Check permissions once authenticated
  let hasAccess = false;
  if (permission) {
    hasAccess = hasPermission(permission);
  } else if (permissions) {
    hasAccess = requireAll 
      ? hasAllPermissions(permissions)
      : hasAnyPermission(permissions);
  } else {
    hasAccess = true; // No specific permissions required
  }

  // Show loading while redirecting for insufficient permissions
  if (!hasAccess) {
    return loadingComponent || (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex items-center space-x-3">
          <svg className="animate-spin h-6 w-6 text-orange-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-gray-600">Checking permissions...</span>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

/**
 * Specialized page protection components
 */

/**
 * Admin Dashboard Page Protection
 */
export function AdminPageProtection({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedPage 
      permissions={[
        'users:read:organization',
        'practices:read:own',
        'analytics:read:organization'
      ]}
      redirectTo="/unauthorized"
    >
      {children}
    </ProtectedPage>
  );
}

/**
 * User Management Page Protection
 */
export function UserManagementPageProtection({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedPage 
      permissions={[
        'users:read:organization',
        'users:create:organization',
        'users:update:organization'
      ]}
      redirectTo="/unauthorized"
    >
      {children}
    </ProtectedPage>
  );
}

/**
 * Practice Management Page Protection
 */
export function PracticeManagementPageProtection({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedPage 
      permissions={[
        'practices:read:own',
        'practices:update:own'
      ]}
      redirectTo="/unauthorized"
    >
      {children}
    </ProtectedPage>
  );
}

/**
 * Analytics Page Protection
 */
export function AnalyticsPageProtection({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedPage 
      permissions={[
        'analytics:read:organization',
        'analytics:read:all'
      ]}
      redirectTo="/unauthorized"
    >
      {children}
    </ProtectedPage>
  );
}

/**
 * Settings Page Protection
 */
export function SettingsPageProtection({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedPage 
      permissions={[
        'settings:read:organization',
        'settings:update:organization',
        'settings:read:all',
        'settings:update:all'
      ]}
      redirectTo="/unauthorized"
    >
      {children}
    </ProtectedPage>
  );
}

/**
 * Super Admin Page Protection
 */
export function SuperAdminPageProtection({ children }: { children: React.ReactNode }) {
  const { isSuperAdmin } = usePermissions();
  
  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
          <p className="text-gray-600">Super administrator access required.</p>
        </div>
      </div>
    );
  }
  
  return <>{children}</>;
}

/**
 * Unauthorized Page Component
 */
export function UnauthorizedPage() {
  const { isAuthenticated, currentOrganization } = usePermissions();
  const router = useRouter();
  
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8 text-center">
        <div className="mb-6">
          <svg 
            className="w-16 h-16 text-red-500 mx-auto mb-4" 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" 
            />
          </svg>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-gray-600">
            You don't have permission to access this page.
          </p>
          {currentOrganization && (
            <p className="text-sm text-gray-500 mt-2">
              Current organization: {currentOrganization.name}
            </p>
          )}
        </div>
        
        <div className="space-y-3">
          <button
            onClick={() => router.push('/dashboard')}
            className="w-full btn bg-blue-600 text-white hover:bg-blue-700"
          >
            Go to Dashboard
          </button>
          
          {isAuthenticated ? (
            <button
              onClick={() => router.back()}
              className="w-full btn bg-gray-200 text-gray-800 hover:bg-gray-300"
            >
              Go Back
            </button>
          ) : (
            <button
              onClick={() => router.push('/signin')}
              className="w-full btn bg-gray-200 text-gray-800 hover:bg-gray-300"
            >
              Sign In
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ProtectedPage;
