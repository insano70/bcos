import { getServerSession } from 'next-auth'
import { authConfig } from '@/lib/auth/config'
import { TokenManager } from '@/lib/auth/token-manager'
import { AuthenticationError, AuthorizationError } from '../responses/error'
import { db, users } from '@/lib/db'
import { eq } from 'drizzle-orm'

/**
 * Dual Authentication Middleware
 * Supports both NextAuth sessions AND enterprise access tokens during transition
 */

export async function requireDualAuth(request: Request) {
  // Try NextAuth session first (current working method)
  try {
    const session = await getServerSession(authConfig)
    if (session?.user) {
      console.log('Authenticated via NextAuth session:', session.user.email)
      return {
        user: session.user,
        authMethod: 'nextauth',
        accessToken: session.accessToken,
        sessionId: session.sessionId
      }
    }
  } catch (error) {
    console.log('NextAuth session validation failed:', error)
  }

  // Try enterprise access token (future method)
  try {
    const authHeader = request.headers.get('Authorization')
    if (authHeader?.startsWith('Bearer ')) {
      const accessToken = authHeader.slice(7)
      
      // Validate access token
      const payload = await TokenManager.validateAccessToken(accessToken)
      if (payload) {
        const userId = payload.sub as string
        
        // Get user info from database
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.user_id, userId))
          .limit(1)
        
        if (user && user.is_active) {
          console.log('Authenticated via enterprise access token:', user.email)
          return {
            user: {
              id: user.user_id,
              email: user.email,
              name: `${user.first_name} ${user.last_name}`,
              firstName: user.first_name,
              lastName: user.last_name,
              role: 'admin',
              emailVerified: user.email_verified
            },
            authMethod: 'enterprise',
            accessToken,
            sessionId: payload.session_id as string
          }
        }
      }
    }
  } catch (error) {
    console.log('Enterprise token validation failed:', error)
  }

  // Neither authentication method worked
  throw AuthenticationError('Authentication required - please log in')
}

export async function requireDualRole(request: Request, allowedRoles: string[]) {
  const authResult = await requireDualAuth(request)
  
  if (!allowedRoles.includes(authResult.user.role)) {
    throw AuthorizationError(`Access denied. Required role: ${allowedRoles.join(' or ')}`)
  }
  
  return authResult
}

export async function requireDualAdmin(request: Request) {
  return await requireDualRole(request, ['admin'])
}
