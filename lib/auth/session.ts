import { eq } from 'drizzle-orm';
import { db, users } from '@/lib/db';
import { validateAccessToken } from './token-manager';

/**
 * Updated session utilities for JWT + Refresh Token strategy
 * Replaces NextAuth session management with token-based approach
 */

export async function getCurrentUserFromToken(accessToken: string) {
  try {
    const payload = await validateAccessToken(accessToken);
    if (!payload) return null;

    // Runtime validation of payload structure
    if (typeof payload.sub !== 'string' || !payload.sub) {
      return null;
    }

    const userId = payload.sub;

    const [user] = await db.select().from(users).where(eq(users.user_id, userId)).limit(1);

    if (!user || !user.is_active) return null;

    // Safely extract optional fields with runtime validation
    const role =
      payload.role && typeof payload.role === 'string' ? payload.role : 'user';
    const practiceId =
      payload.practiceId && typeof payload.practiceId === 'string'
        ? payload.practiceId
        : undefined;

    return {
      id: user.user_id,
      email: user.email,
      name: `${user.first_name} ${user.last_name}`,
      firstName: user.first_name,
      lastName: user.last_name,
      role,
      emailVerified: user.email_verified,
      practiceId,
    };
  } catch (_error) {
    return null;
  }
}

/**
 * @deprecated Use rbacRoute() with RBAC permissions instead
 * @internal Legacy function - kept for backward compatibility only
 */
export async function validateTokenAndGetUser(accessToken: string) {
  const user = await getCurrentUserFromToken(accessToken);
  if (!user) {
    throw new Error('Authentication required');
  }
  return user;
}

/**
 * @deprecated Use rbacRoute() with permission checks instead of role checks
 * @internal Legacy function - bypasses RBAC permission system
 *
 * MIGRATION:
 * Instead of: requireTokenRole(token, ['admin', 'manager'])
 * Use: rbacRoute(handler, { permission: 'resource:action:scope' })
 *
 * Example:
 * export const GET = rbacRoute(handler, { permission: 'users:read:all' });
 */
export async function requireTokenRole(accessToken: string, allowedRoles: string[]) {
  const user = await validateTokenAndGetUser(accessToken);
  if (!allowedRoles.includes(user.role)) {
    throw new Error(`Access denied. Required role: ${allowedRoles.join(' or ')}`);
  }
  return user;
}

/**
 * @deprecated Use rbacRoute() with 'users:manage:all' permission instead
 * @internal Legacy function - uses hard-coded role names
 *
 * MIGRATION:
 * Instead of: requireTokenAdmin(token)
 * Use: rbacRoute(handler, { permission: 'users:manage:all' })
 */
export async function requireTokenAdmin(accessToken: string) {
  return await requireTokenRole(accessToken, ['admin']);
}

/**
 * @deprecated Use rbacRoute() with organization-scoped permissions instead
 * @internal Legacy function - uses hard-coded role-based logic
 *
 * MIGRATION:
 * Instead of: requireTokenPracticeAccess(token, practiceId)
 * Use: rbacRoute(handler, {
 *   permission: 'practices:read:organization',
 *   extractOrganizationId: (req) => getPracticeId(req)
 * })
 */
export async function requireTokenPracticeAccess(accessToken: string, practiceId: string) {
  const user = await validateTokenAndGetUser(accessToken);

  // Admins can access any practice
  if (user.role === 'admin') {
    return user;
  }

  // Practice owners can only access their own practice
  if (user.role === 'practice_owner' && user.practiceId === practiceId) {
    return user;
  }

  throw new Error('You do not have access to this practice');
}
