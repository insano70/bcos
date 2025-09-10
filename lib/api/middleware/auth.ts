import { TokenManager } from '@/lib/auth/token-manager'
import { AuthenticationError, AuthorizationError } from '../responses/error'
import { db, users } from '@/lib/db'
import { eq } from 'drizzle-orm'

export async function requireAuth(request: Request) {
  // Extract access token from Authorization header
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    throw AuthenticationError('Access token required')
  }
  
  const accessToken = authHeader.slice(7)
  
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
  
  // Return session-like object for compatibility
  return {
    user: {
      id: user.user_id,
      email: user.email,
      name: `${user.first_name} ${user.last_name}`,
      firstName: user.first_name,
      lastName: user.last_name,
      role: 'admin', // For now, all users are admins
      emailVerified: user.email_verified
    },
    accessToken,
    sessionId: payload.session_id as string
  }
}

export async function requireRole(request: Request, allowedRoles: string[]) {
  const session = await requireAuth(request)
  
  if (!allowedRoles.includes(session.user.role)) {
    throw AuthorizationError(`Access denied. Required role: ${allowedRoles.join(' or ')}`)
  }
  
  return session
}

export async function requireAdmin(request: Request) {
  return await requireRole(request, ['admin'])
}

export async function requirePracticeOwner(request: Request) {
  return await requireRole(request, ['admin', 'practice_owner'])
}

export async function requireOwnership(request: Request, resourceUserId: string) {
  const session = await requireAuth(request)
  
  if (session.user.id !== resourceUserId && session.user.role !== 'admin') {
    throw AuthorizationError('You can only access your own resources')
  }
  
  return session
}

export async function requirePracticeAccess(request: Request, practiceId: string) {
  const session = await requireAuth(request)
  
  // Admins can access any practice
  if (session.user.role === 'admin') {
    return session
  }
  
  // Practice owners can only access their own practice
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
