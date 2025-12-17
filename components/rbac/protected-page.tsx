'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { usePermissions } from '@/lib/hooks/use-permissions';
import type { ProtectedPageProps } from '@/lib/types/rbac';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';

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
  loadingComponent,
}: ProtectedPageProps) {
  const { hasPermission, hasAnyPermission, hasAllPermissions, isAuthenticated, isLoading } =
    usePermissions();
  const router = useRouter();

  // PERFORMANCE: Memoize permission check to prevent duplicate calculations
  const hasAccess = useMemo(() => {
    // Don't check permissions while loading or not authenticated
    if (isLoading || !isAuthenticated) {
      return false;
    }

    if (permission) {
      return hasPermission(permission);
    } else if (permissions) {
      return requireAll ? hasAllPermissions(permissions) : hasAnyPermission(permissions);
    } else {
      // No specific permissions required - just need to be authenticated
      return true;
    }
  }, [
    isLoading,
    isAuthenticated,
    permission,
    permissions,
    requireAll,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
  ]);

  useEffect(() => {
    // Wait for auth state to load before making redirect decisions
    if (isLoading) {
      return;
    }

    // Redirect to login if not authenticated
    if (!isAuthenticated) {
      const currentPath = window.location.pathname + window.location.search;
      router.push(`/signin?callbackUrl=${encodeURIComponent(currentPath)}`);
      return;
    }

    // Redirect if no access
    if (!hasAccess) {
      router.push(redirectTo);
    }
  }, [isLoading, isAuthenticated, hasAccess, redirectTo, router]);

  // Show loading while auth state is being determined
  if (isLoading) {
    return (
      loadingComponent || (
        <div className="flex items-center justify-center min-h-screen">
          <div className="flex items-center space-x-3">
            <Spinner
              sizeClassName="w-6 h-6"
              borderClassName="border-2"
              trackClassName="border-current opacity-25"
              indicatorClassName="border-current opacity-75"
              className="text-blue-600"
            />
            <span className="text-gray-600">Checking authentication...</span>
          </div>
        </div>
      )
    );
  }

  // Redirect handled by useEffect - show nothing during redirect
  if (!isAuthenticated) {
    return null;
  }

  // Show loading while redirecting for insufficient permissions
  if (!hasAccess) {
    return (
      loadingComponent || (
        <div className="flex items-center justify-center min-h-screen">
          <div className="flex items-center space-x-3">
            <Spinner
              sizeClassName="w-6 h-6"
              borderClassName="border-2"
              trackClassName="border-current opacity-25"
              indicatorClassName="border-current opacity-75"
              className="text-orange-600"
            />
            <span className="text-gray-600">Checking permissions...</span>
          </div>
        </div>
      )
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
      permissions={['users:read:organization', 'practices:read:own', 'analytics:read:organization']}
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
        'users:update:organization',
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
      permissions={['practices:read:own', 'practices:update:own']}
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
      permissions={['analytics:read:organization', 'analytics:read:all']}
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
        'settings:update:all',
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
          <p className="text-gray-600">You don't have permission to access this page.</p>
          {currentOrganization && (
            <p className="text-sm text-gray-500 mt-2">
              Current organization: {currentOrganization.name}
            </p>
          )}
        </div>

        <div className="space-y-3">
          <Button variant="blue" fullWidth onClick={() => router.push('/dashboard')}>
            Go to Dashboard
          </Button>

          {isAuthenticated ? (
            <Button variant="secondary" fullWidth onClick={() => router.back()}>
              Go Back
            </Button>
          ) : (
            <Button variant="secondary" fullWidth onClick={() => router.push('/signin')}>
              Sign In
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ProtectedPage;
