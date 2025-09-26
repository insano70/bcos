import { TokenManager } from './token-manager'
import { db, users } from '@/lib/db'
import { eq } from 'drizzle-orm'

/**
 * Updated session utilities for JWT + Refresh Token strategy
 * Replaces NextAuth session management with token-based approach
 */

export async function getCurrentUserFromToken(accessToken: string) {
  try {
    const payload = await TokenManager.validateAccessToken(accessToken)
    if (!payload) return null
    
    const userId = payload.sub as string
    
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.user_id, userId))
      .limit(1)
    
    if (!user || !user.is_active) return null
    
    return {
      id: user.user_id,
      email: user.email,
      name: `${user.first_name} ${user.last_name}`,
      firstName: user.first_name,
      lastName: user.last_name,
      role: (payload.role as string) || 'user', // Use role from JWT payload
      emailVerified: user.email_verified,
      practiceId: (payload.practiceId as string) || undefined // Use practiceId from JWT payload
    }
  } catch (_error) {
    return null
  }
}

export async function validateTokenAndGetUser(accessToken: string) {
  const user = await getCurrentUserFromToken(accessToken)
  if (!user) {
    throw new Error('Authentication required')
  }
  return user
}

export async function requireTokenRole(accessToken: string, allowedRoles: string[]) {
  const user = await validateTokenAndGetUser(accessToken)
  if (!allowedRoles.includes(user.role)) {
    throw new Error(`Access denied. Required role: ${allowedRoles.join(' or ')}`)
  }
  return user
}

export async function requireTokenAdmin(accessToken: string) {
  return await requireTokenRole(accessToken, ['admin'])
}

export async function requireTokenPracticeAccess(accessToken: string, practiceId: string) {
  const user = await validateTokenAndGetUser(accessToken)
  
  // Admins can access any practice
  if (user.role === 'admin') {
    return user
  }
  
  // Practice owners can only access their own practice
  if (user.role === 'practice_owner' && user.practiceId === practiceId) {
    return user
  }
  
  throw new Error('You do not have access to this practice')
}
