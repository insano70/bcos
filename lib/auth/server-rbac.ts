/**
 * Server-Side RBAC Helper for SSR Pages
 *
 * Provides permission checking for Next.js Server Components
 * SECURITY: Validates permissions BEFORE fetching sensitive data
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ACCESS_TOKEN_SECRET } from '@/lib/auth/jwt-secrets';
import { getCachedUserContextSafe } from '@/lib/rbac/cached-user-context';
import { PermissionChecker } from '@/lib/rbac/permission-checker';
import type { PermissionName } from '@/lib/types/rbac';

/**
 * Get authenticated user ID from server-side cookies
 * Returns null if not authenticated
 */
async function getAuthenticatedUserId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get('access-token')?.value;

    if (!accessToken) {
      return null;
    }

    // Verify JWT and extract user ID (using centralized secret)
    const { jwtVerify } = await import('jose');
    const { payload } = await jwtVerify(accessToken, ACCESS_TOKEN_SECRET);
    return payload.sub as string;
  } catch {
    return null;
  }
}

/**
 * Require authentication for SSR page
 * Redirects to signin if not authenticated
 * Returns user ID
 */
export async function requireServerAuth(): Promise<string> {
  const userId = await getAuthenticatedUserId();

  if (!userId) {
    redirect('/signin');
  }

  return userId;
}

/**
 * Require specific permission for SSR page
 * Redirects to signin if not authenticated
 * Redirects to unauthorized if lacks permission
 * Returns permission checker for further checks
 */
export async function requireServerPermission(
  permission: PermissionName,
  resourceId?: string,
  organizationId?: string
): Promise<PermissionChecker> {
  const userId = await requireServerAuth();

  // Load user RBAC context
  const userContext = await getCachedUserContextSafe(userId);

  if (!userContext) {
    redirect('/signin');
  }

  // Create permission checker
  const checker = new PermissionChecker(userContext);

  // Check required permission
  if (!checker.hasPermission(permission, resourceId, organizationId)) {
    redirect('/unauthorized');
  }

  return checker;
}

/**
 * Require any of the specified permissions for SSR page
 * Redirects to signin if not authenticated
 * Redirects to unauthorized if lacks all permissions
 * Returns permission checker for further checks
 */
export async function requireServerAnyPermission(
  permissions: PermissionName[],
  resourceId?: string,
  organizationId?: string
): Promise<PermissionChecker> {
  const userId = await requireServerAuth();

  // Load user RBAC context
  const userContext = await getCachedUserContextSafe(userId);

  if (!userContext) {
    redirect('/signin');
  }

  // Create permission checker
  const checker = new PermissionChecker(userContext);

  // Check if user has any of the required permissions
  if (!checker.hasAnyPermission(permissions, resourceId, organizationId)) {
    redirect('/unauthorized');
  }

  return checker;
}

/**
 * Get permission checker for current user (if authenticated)
 * Returns null if not authenticated (does NOT redirect)
 * Use this when you want to conditionally show data based on permissions
 */
export async function getServerPermissionChecker(): Promise<PermissionChecker | null> {
  const userId = await getAuthenticatedUserId();

  if (!userId) {
    return null;
  }

  const userContext = await getCachedUserContextSafe(userId);

  if (!userContext) {
    return null;
  }

  return new PermissionChecker(userContext);
}
