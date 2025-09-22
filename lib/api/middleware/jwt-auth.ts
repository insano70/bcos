/**
 * Enhanced JWT Authentication Middleware
 * Uses JWT user data and cached role permissions to eliminate database queries
 */

import { TokenManager } from '@/lib/auth/token-manager'
import { AuthenticationError } from '../responses/error'
import { rolePermissionCache } from '@/lib/cache/role-permission-cache'
import { debugLog } from '@/lib/utils/debug'
import type { UserContext, Role, Permission } from '@/lib/types/rbac'

/**
 * Enhanced auth session with JWT data
 */
export interface JWTAuthSession {
  user: {
    id: string;
    email: string | null;
    name: string;
    firstName: string | null;
    lastName: string | null;
    role: string | undefined;
    emailVerified: boolean | null;
    practiceId: string | null | undefined;
    roles: string[];
    permissions: string[];
    isSuperAdmin: boolean;
    organizationAdminFor: string[];
  };
  accessToken: string;
  sessionId: string;
  userContext: UserContext | null;
}

/**
 * Build user context from JWT payload and cached role permissions
 */
async function buildUserContextFromJWT(payload: Record<string, unknown>): Promise<UserContext | null> {
  try {
    // Check if JWT has enhanced user data - if not, return null to force database query
    if (!payload.email || !payload.role_ids || !Array.isArray(payload.role_ids)) {
      return null;
    }
    
    const roleIds = payload.role_ids as string[];
    const rolesVersion = (payload.roles_version as Record<string, number>) || {};
    
    // Get role permissions from cache
    const roles: Role[] = [];
    const permissionMap = new Map<string, Permission>();
    
    for (const roleId of roleIds) {
      const cached = rolePermissionCache.get(roleId);
      if (cached) {
        // Check if cache version matches JWT version
        const jwtVersion = rolesVersion[roleId] || 1;
        if (cached.version === jwtVersion) {
          // Use cached data
          const role: Role = {
            role_id: roleId,
            name: cached.name,
            description: undefined,
            organization_id: undefined,
            is_system_role: cached.name === 'super_admin',
            is_active: true,
            created_at: new Date(),
            updated_at: new Date(),
            deleted_at: undefined,
            permissions: cached.permissions
          };
          
          roles.push(role);
          
          // Add permissions to global list (deduplicated)
          cached.permissions.forEach(permission => {
            permissionMap.set(permission.permission_id, permission);
          });
        } else {
          // Version mismatch - cache is stale, need fresh data
          debugLog.auth(`Role cache version mismatch for role ${roleId}: cached=${cached.version}, jwt=${jwtVersion}`);
          return null; // Force fallback to database
        }
      } else {
        // Cache miss - need fresh data
        debugLog.auth(`Role cache miss for role ${roleId}`);
        return null; // Force fallback to database
      }
    }
    
    // Build user context from JWT + cached data
    const userContext: UserContext = {
      // Basic user information (from JWT)
      user_id: payload.sub as string,
      email: payload.email as string,
      first_name: (payload.first_name as string) || '',
      last_name: (payload.last_name as string) || '',
      is_active: true,
      email_verified: (payload.email_verified as boolean) || false,
      
      // RBAC information (from cache)
      roles,
      organizations: [], // TODO: Could cache this too
      accessible_organizations: [],
      user_roles: [], // TODO: Could derive from JWT user_role_ids
      user_organizations: [],
      
      // Current context (from JWT)
      current_organization_id: (payload.primary_org_id as string) || undefined,
      
      // Computed properties
      all_permissions: Array.from(permissionMap.values()),
      is_super_admin: (payload.is_super_admin as boolean) || false,
      organization_admin_for: (payload.org_admin_for as string[]) || []
    };
    
    return userContext;
    
  } catch (error) {
    debugLog.auth('Error building user context from JWT:', error);
    return null;
  }
}

/**
 * JWT-enhanced authentication with cache-first approach
 */
export async function requireJWTAuth(request: Request): Promise<JWTAuthSession> {
  // Extract access token from Authorization header OR httpOnly cookie
  const authHeader = request.headers.get('Authorization')
  let accessToken: string | null = null
  
  if (authHeader?.startsWith('Bearer ')) {
    // Use Authorization header if present (for API clients)
    accessToken = authHeader.slice(7)
  } else {
    // Fallback to httpOnly cookie (for browser requests)
    const cookieHeader = request.headers.get('Cookie')
    if (cookieHeader) {
      const cookies = cookieHeader.split(';')
      const accessTokenCookie = cookies
        .find(cookie => cookie.trim().startsWith('access-token='))
        ?.split('=')[1]
      
      if (accessTokenCookie) {
        accessToken = accessTokenCookie
        debugLog.auth('Using access token from httpOnly cookie')
      }
    }
  }
  
  if (!accessToken) {
    throw AuthenticationError('Access token required')
  }
  
  // Validate access token
  const payload = await TokenManager.validateAccessToken(accessToken)
  if (!payload) {
    throw AuthenticationError('Invalid or expired access token')
  }
  
  const userId = payload.sub as string
  
  // Try to build user context from JWT + cache first
  let userContext = await buildUserContextFromJWT(payload)
  
  if (!userContext) {
    // Fallback to database query (cache miss or version mismatch)
    debugLog.auth('JWT cache miss, falling back to database query')
    const { getCachedUserContextSafe } = await import('@/lib/rbac/cached-user-context')
    userContext = await getCachedUserContextSafe(userId)
  }
  
  if (!userContext) {
    throw AuthenticationError('User context not available')
  }
  
  // Build user session data from JWT (no database queries needed!)
  const user = {
    id: userId,
    email: (payload.email as string) || null,
    name: `${(payload.first_name as string) || ''} ${(payload.last_name as string) || ''}`.trim(),
    firstName: (payload.first_name as string) || null,
    lastName: (payload.last_name as string) || null,
    role: userContext.roles[0]?.name,
    emailVerified: (payload.email_verified as boolean) || null,
    practiceId: (payload.primary_org_id as string) || null,
    roles: userContext.roles.map(r => r.name),
    permissions: userContext.all_permissions.map(p => p.name),
    isSuperAdmin: (payload.is_super_admin as boolean) || false,
    organizationAdminFor: (payload.org_admin_for as string[]) || []
  }
  
  debugLog.auth('JWT authentication successful', {
    userId,
    email: user.email,
    rolesCount: user.roles.length,
    permissionsCount: user.permissions.length,
    usedCache: userContext !== null
  })
  
  // Return session-like object with JWT-derived information
  return {
    user,
    accessToken,
    sessionId: payload.session_id as string,
    userContext
  }
}
