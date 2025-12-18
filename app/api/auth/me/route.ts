import type { NextRequest } from 'next/server';
import { handleRouteError } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { AuthValidator } from '@/lib/api/middleware/auth-validation';
import { authRoute, type AuthSession } from '@/lib/api/route-handlers';
import { log } from '@/lib/logger';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';

/**
 * Get current user with full RBAC context
 * Provides complete user information including roles, permissions, and organization access
 */
const handler = async (request: NextRequest, session?: AuthSession) => {
  const startTime = Date.now();

  try {
    // Validate session and user context using AuthValidator
    const validatedSession = AuthValidator.requireSession(session, request);
    const userContext = AuthValidator.requireUserContext(validatedSession, request);

    // Note: Auth success already logged by auth middleware
    // No need for duplicate logging here

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
        sessionId: validatedSession.sessionId,
      },
      'User context retrieved successfully'
    );
  } catch (error) {
    log.error('User context retrieval failed', error, {
      operation: 'get_user_context',
      duration: Date.now() - startTime,
      component: 'auth',
    });
    return handleRouteError(error, 'Failed to retrieve user context', request);
  }
};

export const GET = authRoute(handler, { rateLimit: 'session_read' });
