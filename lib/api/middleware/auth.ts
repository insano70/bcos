import { TokenManager } from '@/lib/auth/token-manager'
import { AuthenticationError, AuthorizationError } from '../responses/error'
import { db, users } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { getUserContextSafe } from '@/lib/rbac/user-context'
import { debugLog } from '@/lib/utils/debug'

export async function requireAuth(request: Request) {
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
  
  // Get user info from database
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.user_id, userId))
    .limit(1)
  
  if (!user || !user.is_active) {
    throw AuthenticationError('User account is inactive')
  }
  
  // Get user's RBAC context
  const userContext = await getUserContextSafe(user.user_id)

  // Get the user's actual assigned roles
  const userRoles = userContext?.roles?.map(r => r.name) || [];
  const primaryRole = userRoles.length > 0 ? userRoles[0] : 'user';

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
      practiceId: userContext?.current_organization_id,
      roles: userRoles, // All explicitly assigned roles
      permissions: userContext?.all_permissions?.map(p => p.name) || [],
      isSuperAdmin: userContext?.is_super_admin || false,
      organizationAdminFor: userContext?.organization_admin_for || []
    },
    accessToken,
    sessionId: payload.session_id as string,
    userContext // Include full RBAC context for middleware
  }
}

export async function requireRole(request: Request, allowedRoles: string[]) {
  const session = await requireAuth(request)

  // For super_admin, always allow (special case)
  if (session.user.isSuperAdmin) {
    return session
  }

  // For other roles, check if user has any of the required roles
  const hasRequiredRole = allowedRoles.some(role =>
    session.user.roles?.includes(role)
  )

  if (!hasRequiredRole) {
    throw AuthorizationError(`Access denied. Required role: ${allowedRoles.join(' or ')}`)
  }

  return session
}

// Note: This is legacy - prefer using permission-based checks instead
// Super admins get special case handling (full access)
// Other users should be checked via specific permissions
export async function requireAdmin(request: Request) {
  return await requireRole(request, ['admin', 'super_admin'])
}

export async function requirePracticeOwner(request: Request) {
  return await requireRole(request, ['admin', 'practice_owner', 'super_admin'])
}

export async function requireOwnership(request: Request, resourceUserId: string) {
  const session = await requireAuth(request)

  const hasOwnership = session.user.id === resourceUserId ||
    session.user.isSuperAdmin ||
    session.user.organizationAdminFor?.length > 0

  if (!hasOwnership) {
    throw AuthorizationError('You can only access your own resources')
  }

  return session
}

export async function requirePracticeAccess(request: Request, practiceId: string) {
  const session = await requireAuth(request)

  // Super admins can access any practice
  if (session.user.isSuperAdmin) {
    return session
  }

  // Organization admins can access practices in their organizations
  if (session.user.organizationAdminFor?.includes(practiceId)) {
    return session
  }

  // Practice owners can access their own practice
  if (session.user.role === 'practice_owner' && session.user.practiceId === practiceId) {
    return session
  }

  throw AuthorizationError('You do not have access to this practice')
}

/**
 * Require fresh authentication for sensitive operations
 */
export async function requireFreshAuth(request: Request, maxAgeMinutes: number = 5) {
  const session = await requireAuth(request)
  
  // Check if we have fresh authentication timestamp in the access token
  const authHeader = request.headers.get('Authorization')
  const accessToken = authHeader?.slice(7)
  
  if (!accessToken) {
    throw AuthenticationError('Fresh authentication required')
  }
  
  const payload = await TokenManager.validateAccessToken(accessToken)
  if (!payload) {
    throw AuthenticationError('Invalid access token')
  }
  
  const issuedAt = (payload.iat as number) * 1000 // Convert to milliseconds
  const now = Date.now()
  const ageMinutes = (now - issuedAt) / (60 * 1000)
  
  if (ageMinutes > maxAgeMinutes) {
    throw AuthenticationError('Fresh authentication required for this operation')
  }
  
  return session
}
