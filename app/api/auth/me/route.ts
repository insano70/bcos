import type { NextRequest } from 'next/server';
import { requireJWTAuth } from '@/lib/api/middleware/jwt-auth';
import { applyRateLimit } from '@/lib/api/middleware/rate-limit';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { log } from '@/lib/logger';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';

/**
 * Get current user with full RBAC context
 * Provides complete user information including roles, permissions, and organization access
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  log.api('GET /api/auth/me - User context request', request);

  try {
    // RATE LIMITING: Apply API-level rate limiting to prevent user context abuse
    const rateLimitStart = Date.now();
    await applyRateLimit(request, 'api');
    log.info('Rate limit check completed', { duration: Date.now() - rateLimitStart });

    // Get authenticated user session with JWT-enhanced data (eliminates database queries!)
    const authStart = Date.now();
    const session = await requireJWTAuth(request);
    log.info('JWT authentication completed', { duration: Date.now() - authStart });

    // User context is already available from JWT + cache - no additional database queries needed!
    const userContext = session.userContext;

    if (!userContext) {
      log.warn('User context not found in session', {
        userId: session.user?.id,
        hasSession: !!session,
      });
      return createErrorResponse('User context not found', 404, request);
    }

    log.info('User context retrieved successfully', {
      userId: userContext.user_id,
      roleCount: userContext.roles.length,
      permissionCount: userContext.all_permissions.length,
      organizationCount: userContext.organizations.length,
      duration: Date.now() - startTime,
    });

    // Return user data with full RBAC context
    return createSuccessResponse(
      {
        user: {
          id: userContext.user_id,
          email: userContext.email,
          name: `${userContext.first_name} ${userContext.last_name}`,
          firstName: userContext.first_name,
          lastName: userContext.last_name,
          emailVerified: userContext.email_verified,

          // RBAC Data
          roles: userContext.roles.map((role) => ({
            id: role.role_id,
            name: role.name,
            description: role.description,
            isSystemRole: role.is_system_role,
          })),
          permissions: userContext.all_permissions.map((permission) => ({
            id: permission.permission_id,
            name: permission.name,
            resource: permission.resource,
            action: permission.action,
            scope: permission.scope,
          })),

          // Organization Data
          organizations: userContext.organizations.map((org) => ({
            id: org.organization_id,
            name: org.name,
            slug: org.slug,
          })),
          accessibleOrganizations: userContext.accessible_organizations.map((org) => ({
            id: org.organization_id,
            name: org.name,
            slug: org.slug,
          })),

          // Current context
          currentOrganizationId: userContext.current_organization_id,

          // Computed properties
          isSuperAdmin: userContext.is_super_admin,
          organizationAdminFor: userContext.organization_admin_for,
        },
      },
      'User context retrieved successfully'
    );
  } catch (error) {
    log.error('User context retrieval failed', error, {
      duration: Date.now() - startTime,
      endpoint: '/api/auth/me',
    });
    return createErrorResponse(
      error instanceof Error ? error.message : 'Failed to retrieve user context',
      500,
      request
    );
  }
}
