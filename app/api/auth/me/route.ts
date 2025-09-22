import { NextRequest } from 'next/server'
import { requireJWTAuth } from '@/lib/api/middleware/jwt-auth'
import { createSuccessResponse } from '@/lib/api/responses/success'
import { createErrorResponse } from '@/lib/api/responses/error'
import { errorLog } from '@/lib/utils/debug'
import { applyRateLimit } from '@/lib/api/middleware/rate-limit'

/**
 * Get current user with full RBAC context
 * Provides complete user information including roles, permissions, and organization access
 */
export async function GET(request: NextRequest) {
  try {
    // RATE LIMITING: Apply API-level rate limiting to prevent user context abuse
    await applyRateLimit(request, 'api')

    // Get authenticated user session with JWT-enhanced data (eliminates database queries!)
    const session = await requireJWTAuth(request)

    // User context is already available from JWT + cache - no additional database queries needed!
    const userContext = session.userContext

    if (!userContext) {
      return createErrorResponse('User context not found', 404, request)
    }

    // Return user data with full RBAC context
    return createSuccessResponse({
      user: {
        id: userContext.user_id,
        email: userContext.email,
        name: `${userContext.first_name} ${userContext.last_name}`,
        firstName: userContext.first_name,
        lastName: userContext.last_name,
        emailVerified: userContext.email_verified,

        // RBAC Data
        roles: userContext.roles.map(role => ({
          id: role.role_id,
          name: role.name,
          description: role.description,
          isSystemRole: role.is_system_role
        })),
        permissions: userContext.all_permissions.map(permission => ({
          id: permission.permission_id,
          name: permission.name,
          resource: permission.resource,
          action: permission.action,
          scope: permission.scope
        })),

        // Organization Data
        organizations: userContext.organizations.map(org => ({
          id: org.organization_id,
          name: org.name,
          slug: org.slug
        })),
        accessibleOrganizations: userContext.accessible_organizations.map(org => ({
          id: org.organization_id,
          name: org.name,
          slug: org.slug
        })),

        // Current context
        currentOrganizationId: userContext.current_organization_id,

        // Computed properties
        isSuperAdmin: userContext.is_super_admin,
        organizationAdminFor: userContext.organization_admin_for
      }
    }, 'User context retrieved successfully')

  } catch (error) {
    errorLog('Get user context error:', error)
    return createErrorResponse(
      error instanceof Error ? error.message : 'Failed to retrieve user context',
      500,
      request
    )
  }
}
