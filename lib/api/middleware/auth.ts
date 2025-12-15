import { validateAccessToken } from '@/lib/auth/tokens';
import type {
  EnhancedAccessTokenPayload,
  OrgAccessClaim,
} from '@/lib/auth/tokens/types';
import { authCache, rbacCache } from '@/lib/cache';
import { log } from '@/lib/logger';
import { getUserContextOrThrow, UserContextAuthError } from '@/lib/rbac/user-context';
import { organizationHierarchyService } from '@/lib/services/organization-hierarchy-service';
import type { Organization, Permission, Role, UserContext } from '@/lib/types/rbac';
import { AuthenticationError, AuthorizationError } from '../responses/error';

/**
 * Expand organization access claim to full organization list
 *
 * Interprets the compact OrgAccessClaim from JWT and expands it using cached hierarchy:
 * - 'all': Returns all organizations (for super admins)
 * - 'hierarchy': Expands root IDs to include all child organizations
 * - 'direct': Returns direct org membership only
 *
 * @param orgAccess - Organization access claim from JWT
 * @returns Array of accessible organizations
 */
async function expandOrgAccess(orgAccess: OrgAccessClaim): Promise<Organization[]> {
  if (orgAccess.type === 'all') {
    // Super admin - return all organizations from cached hierarchy
    return await organizationHierarchyService.getAllOrganizations();
  }

  const allOrgs = await organizationHierarchyService.getAllOrganizations();

  if (orgAccess.type === 'direct') {
    // Direct membership only - filter to specified org IDs
    return allOrgs.filter((o) => orgAccess.org_ids.includes(o.organization_id));
  }

  if (orgAccess.type === 'hierarchy') {
    // Expand hierarchy from root IDs using cached org tree
    const accessibleIds = new Set<string>();

    for (const rootId of orgAccess.root_ids) {
      const hierarchyIds = await organizationHierarchyService.getOrganizationHierarchy(
        rootId,
        allOrgs
      );
      for (const id of hierarchyIds) {
        accessibleIds.add(id);
      }
    }

    return allOrgs.filter((o) => accessibleIds.has(o.organization_id));
  }

  return [];
}

/**
 * Build UserContext from enhanced JWT claims + cached role permissions
 *
 * PERFORMANCE PATH:
 * 1. Check fast cache (60s TTL) - ~1ms
 * 2. If miss, build from JWT + role permission cache - ~5-10ms
 * 3. If role cache miss or version mismatch, return null (triggers DB fallback)
 *
 * @param payload - Enhanced JWT payload with RBAC claims
 * @returns UserContext or null if cache invalid (forces DB fallback)
 */
async function buildUserContextFromEnhancedJWT(
  payload: EnhancedAccessTokenPayload
): Promise<UserContext | null> {
  const startTime = Date.now();

  // 1. Check fast cache first (~1ms)
  const cachedContext = await rbacCache.getFastUserContext(payload.sub);
  if (cachedContext) {
    log.debug('UserContext fast cache hit', {
      userId: payload.sub,
      duration: Date.now() - startTime,
      component: 'auth',
    });
    return cachedContext;
  }

  // 2. Build from JWT claims + role permission cache
  try {
    const roleIds = payload.role_ids;
    const rolesVersion = payload.roles_version;

    // Fetch role permissions from cache (parallel)
    const roles: Role[] = [];
    const permissionMap = new Map<string, Permission>();

    const roleResults = await Promise.all(
      roleIds.map(async (roleId) => {
        const cached = await rbacCache.getRolePermissions(roleId);
        if (!cached) {
          return { roleId, cached: null, valid: false };
        }

        // Validate version matches JWT - if not, role permissions have changed
        const jwtVersion = rolesVersion[roleId] ?? 1;
        if (cached.version !== jwtVersion) {
          log.debug('Role version mismatch - permissions changed', {
            roleId,
            jwtVersion,
            cachedVersion: cached.version,
            component: 'auth',
          });
          return { roleId, cached, valid: false };
        }

        return { roleId, cached, valid: true };
      })
    );

    // Check if any role cache is invalid - force database fallback
    const hasInvalidRole = roleResults.some((r) => !r.valid);
    if (hasInvalidRole) {
      log.debug('Role cache invalid, falling back to database', {
        userId: payload.sub,
        roleCount: roleIds.length,
        invalidRoles: roleResults.filter((r) => !r.valid).map((r) => r.roleId),
        component: 'auth',
      });
      return null;
    }

    // Build roles and permissions from cached data
    for (const result of roleResults) {
      if (!result.cached) continue;

      const role: Role = {
        role_id: result.roleId,
        name: result.cached.name,
        description: undefined,
        organization_id: undefined,
        is_system_role: result.cached.name === 'super_admin',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: undefined,
        permissions: result.cached.permissions,
      };

      roles.push(role);

      for (const permission of result.cached.permissions) {
        permissionMap.set(permission.permission_id, permission);
      }
    }

    // Expand organization access using cached hierarchy
    const accessibleOrganizations = await expandOrgAccess(payload.org_access);

    // Determine direct organizations (root memberships, not children)
    const directOrgIds =
      payload.org_access.type === 'hierarchy'
        ? payload.org_access.root_ids
        : payload.org_access.type === 'direct'
          ? payload.org_access.org_ids
          : [];

    // Build full UserContext
    const userContext: UserContext = {
      user_id: payload.sub,
      email: payload.email,
      first_name: payload.first_name,
      last_name: payload.last_name,
      is_active: true,
      email_verified: payload.email_verified,
      provider_uid: payload.provider_uid ?? undefined,

      roles,
      organizations: accessibleOrganizations.filter((o) => directOrgIds.includes(o.organization_id)),
      accessible_organizations: accessibleOrganizations,
      user_roles: [],
      user_organizations: [],

      current_organization_id: payload.primary_org_id ?? undefined,

      all_permissions: Array.from(permissionMap.values()),
      is_super_admin: payload.is_super_admin,
      organization_admin_for: payload.org_admin_for,
    };

    // Cache for 60 seconds (fire and forget)
    rbacCache.setFastUserContext(payload.sub, userContext).catch((err) => {
      log.warn('Failed to set fast user context cache', {
        userId: payload.sub,
        error: err instanceof Error ? err.message : String(err),
        component: 'auth',
      });
    });

    const duration = Date.now() - startTime;
    log.debug('UserContext built from enhanced JWT claims', {
      userId: payload.sub,
      roleCount: roles.length,
      permissionCount: permissionMap.size,
      orgCount: accessibleOrganizations.length,
      duration,
      component: 'auth',
    });

    return userContext;
  } catch (error) {
    log.error(
      'Failed to build UserContext from enhanced JWT',
      error instanceof Error ? error : new Error(String(error)),
      {
        userId: payload.sub,
        component: 'auth',
      }
    );
    return null;
  }
}

/**
 * Check if JWT payload has enhanced RBAC claims
 *
 * Returns the typed payload if it has all required enhanced claims, null otherwise.
 * This pattern avoids type predicate issues while maintaining type safety.
 */
function getEnhancedPayload(payload: Record<string, unknown>): EnhancedAccessTokenPayload | null {
  if (
    typeof payload.email === 'string' &&
    Array.isArray(payload.role_ids) &&
    typeof payload.is_super_admin === 'boolean' &&
    typeof payload.sub === 'string' &&
    payload.org_access !== undefined
  ) {
    return payload as unknown as EnhancedAccessTokenPayload;
  }
  return null;
}

/**
 * Require authentication for API routes
 *
 * Validates access token and loads user context with RBAC information.
 * All authentication failures throw AuthenticationError (maps to 401).
 *
 * SECURITY:
 * - Token validation failures → 401
 * - User not found → 401
 * - User inactive → 401
 * - User context load failure → 401
 * - Only database/server errors should result in 500
 *
 * @param request - The incoming request
 * @returns Session object with user info and RBAC context
 * @throws AuthenticationError for all auth-related failures (401)
 */
export async function requireAuth(request: Request) {
  const startTime = Date.now();
  const timings: Record<string, number> = {};

  // Extract access token from Authorization header OR httpOnly cookie
  const authHeader = request.headers.get('Authorization');
  let accessToken: string | null = null;
  let tokenSource: 'header' | 'cookie' | null = null;

  if (authHeader?.startsWith('Bearer ')) {
    // Use Authorization header if present (for API clients)
    accessToken = authHeader.slice(7);
    tokenSource = 'header';
  } else {
    // Fallback to httpOnly cookie (for browser requests)
    const cookieHeader = request.headers.get('Cookie');
    if (cookieHeader) {
      const cookies = cookieHeader.split(';');
      const accessTokenCookie = cookies
        .find((cookie) => cookie.trim().startsWith('access-token='))
        ?.split('=')[1];

      if (accessTokenCookie) {
        accessToken = accessTokenCookie;
        tokenSource = 'cookie';
        log.debug('Using access token from httpOnly cookie', { component: 'auth' });
      }
    }
  }

  if (!accessToken) {
    log.security('auth_no_token', 'low', {
      tokenSource,
      hasAuthHeader: !!authHeader,
      action: 'rejecting_request',
    });
    throw AuthenticationError('Access token required');
  }

  // Validate access token
  const t1 = Date.now();
  const payload = await validateAccessToken(accessToken);
  timings.validateToken = Date.now() - t1;

  if (!payload) {
    log.security('auth_invalid_token', 'medium', {
      tokenSource,
      action: 'rejecting_request',
    });
    throw AuthenticationError('Invalid or expired access token');
  }

  const userId = payload.sub as string;
  const sessionId = payload.session_id as string;

  // Check if JWT has enhanced RBAC claims for optimized path
  let userContext: UserContext;
  let user: Awaited<ReturnType<typeof authCache.getUser>>;
  let authPath: 'enhanced_jwt' | 'enhanced_jwt_fallback' | 'legacy' = 'legacy';

  const enhancedPayload = getEnhancedPayload(payload);
  if (enhancedPayload) {
    // OPTIMIZED PATH: Try to build UserContext from JWT claims + cache
    const t2 = Date.now();
    const contextFromJWT = await buildUserContextFromEnhancedJWT(enhancedPayload);
    timings.buildContextFromJWT = Date.now() - t2;

    if (contextFromJWT) {
      // Success! Use context from JWT + cache
      userContext = contextFromJWT;
      authPath = 'enhanced_jwt';

      // Still need user object for session response - get from cache (fast)
      const t3 = Date.now();
      user = await authCache.getUser(userId);
      timings.getUser = Date.now() - t3;

      if (!user) {
        log.security('auth_user_not_found', 'medium', {
          userId,
          sessionId,
          action: 'rejecting_request',
        });
        throw AuthenticationError('User account not found');
      }

      if (!user.is_active) {
        log.security('auth_user_inactive', 'medium', {
          userId,
          sessionId,
          action: 'rejecting_request',
        });
        throw AuthenticationError('User account is inactive');
      }
    } else {
      // JWT context build failed (cache miss or version mismatch) - fall back to database
      authPath = 'enhanced_jwt_fallback';

      const t3 = Date.now();
      user = await authCache.getUser(userId);
      timings.getUser = Date.now() - t3;

      if (!user) {
        log.security('auth_user_not_found', 'medium', {
          userId,
          sessionId,
          action: 'rejecting_request',
        });
        throw AuthenticationError('User account not found');
      }

      if (!user.is_active) {
        log.security('auth_user_inactive', 'medium', {
          userId,
          sessionId,
          action: 'rejecting_request',
        });
        throw AuthenticationError('User account is inactive');
      }

      const t4 = Date.now();
      try {
        userContext = await getUserContextOrThrow(user.user_id);
        timings.getUserContext = Date.now() - t4;
      } catch (error) {
        timings.getUserContext = Date.now() - t4;
        if (error instanceof UserContextAuthError) {
          log.security('auth_context_load_failed', 'medium', {
            userId,
            sessionId,
            reason: error.reason,
            action: 'rejecting_request',
          });
          throw AuthenticationError(`Session invalid: ${error.message}`);
        }
        log.error(
          'User context load failed with server error',
          error instanceof Error ? error : new Error(String(error)),
          { userId, sessionId, operation: 'requireAuth', component: 'auth' }
        );
        throw AuthenticationError('Unable to verify session - please sign in again');
      }
    }
  } else {
    // LEGACY PATH: Token without enhanced claims - full database query required
    const t2 = Date.now();
    user = await authCache.getUser(userId);
    timings.getUser = Date.now() - t2;

    if (!user) {
      log.security('auth_user_not_found', 'medium', {
        userId,
        sessionId,
        action: 'rejecting_request',
      });
      throw AuthenticationError('User account not found');
    }

    if (!user.is_active) {
      log.security('auth_user_inactive', 'medium', {
        userId,
        sessionId,
        action: 'rejecting_request',
      });
      throw AuthenticationError('User account is inactive');
    }

    const t3 = Date.now();
    try {
      userContext = await getUserContextOrThrow(user.user_id);
      timings.getUserContext = Date.now() - t3;
    } catch (error) {
      timings.getUserContext = Date.now() - t3;
      if (error instanceof UserContextAuthError) {
        log.security('auth_context_load_failed', 'medium', {
          userId,
          sessionId,
          reason: error.reason,
          action: 'rejecting_request',
        });
        throw AuthenticationError(`Session invalid: ${error.message}`);
      }

      log.error(
        'User context load failed with server error',
        error instanceof Error ? error : new Error(String(error)),
        { userId, sessionId, operation: 'requireAuth', component: 'auth' }
      );

      throw AuthenticationError('Unable to verify session - please sign in again');
    }
  }

  // Get the user's actual assigned roles
  const userRoles = userContext.roles?.map((r) => r.name) || [];
  const primaryRole = userRoles.length > 0 ? userRoles[0] : 'user';

  // Log timing breakdown for performance analysis
  timings.total = Date.now() - startTime;
  log.info('[PERF] requireAuth timing breakdown', {
    userId,
    authPath, // 'enhanced_jwt' (cache hit), 'enhanced_jwt_fallback' (cache miss), or 'legacy'
    timings,
    totalMs: timings.total,
  });

  // Return session-like object with actual RBAC information
  return {
    user: {
      id: user.user_id,
      email: user.email,
      name: `${user.first_name} ${user.last_name}`,
      firstName: user.first_name,
      lastName: user.last_name,
      role: primaryRole, // First assigned role, or 'user' if none
      emailVerified: user.email_verified,
      practiceId: userContext.current_organization_id,
      roles: userRoles, // All explicitly assigned roles
      permissions: userContext.all_permissions?.map((p) => p.name) || [],
      isSuperAdmin: userContext.is_super_admin || false,
      organizationAdminFor: userContext.organization_admin_for || [],
    },
    accessToken,
    sessionId,
    userContext, // Include full RBAC context for middleware
  };
}

export async function requireRole(request: Request, allowedRoles: string[]) {
  const session = await requireAuth(request);

  // For super_admin, always allow (special case)
  if (session.user.isSuperAdmin) {
    return session;
  }

  // For other roles, check if user has any of the required roles
  const hasRequiredRole = allowedRoles.some((role) => session.user.roles?.includes(role));

  if (!hasRequiredRole) {
    throw AuthorizationError(`Access denied. Required role: ${allowedRoles.join(' or ')}`);
  }

  return session;
}

// Note: This is legacy - prefer using permission-based checks instead
// Super admins get special case handling (full access)
// Other users should be checked via specific permissions
export async function requireAdmin(request: Request) {
  return await requireRole(request, ['admin', 'super_admin']);
}

export async function requirePracticeOwner(request: Request) {
  return await requireRole(request, ['admin', 'practice_owner', 'super_admin']);
}

export async function requireOwnership(request: Request, resourceUserId: string) {
  const session = await requireAuth(request);

  const hasOwnership =
    session.user.id === resourceUserId ||
    session.user.isSuperAdmin ||
    session.user.organizationAdminFor?.length > 0;

  if (!hasOwnership) {
    throw AuthorizationError('You can only access your own resources');
  }

  return session;
}

export async function requirePracticeAccess(request: Request, practiceId: string) {
  const session = await requireAuth(request);

  // Super admins can access any practice
  if (session.user.isSuperAdmin) {
    return session;
  }

  // Organization admins can access practices in their organizations
  if (session.user.organizationAdminFor?.includes(practiceId)) {
    return session;
  }

  // Practice owners can access their own practice
  if (session.user.role === 'practice_owner' && session.user.practiceId === practiceId) {
    return session;
  }

  throw AuthorizationError('You do not have access to this practice');
}

/**
 * Require fresh authentication for sensitive operations
 */
export async function requireFreshAuth(request: Request, maxAgeMinutes: number = 5) {
  const session = await requireAuth(request);

  // Check if we have fresh authentication timestamp in the access token
  const authHeader = request.headers.get('Authorization');
  const accessToken = authHeader?.slice(7);

  if (!accessToken) {
    throw AuthenticationError('Fresh authentication required');
  }

  const payload = await validateAccessToken(accessToken);
  if (!payload) {
    throw AuthenticationError('Invalid access token');
  }

  const issuedAt = (payload.iat as number) * 1000; // Convert to milliseconds
  const now = Date.now();
  const ageMinutes = (now - issuedAt) / (60 * 1000);

  if (ageMinutes > maxAgeMinutes) {
    throw AuthenticationError('Fresh authentication required for this operation');
  }

  return session;
}
