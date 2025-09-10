import { TokenManager } from '@/lib/auth/token-manager'
import { AuthenticationError } from '../responses/error'

/**
 * Step-up Authentication Middleware
 * Requires fresh authentication for sensitive operations
 */

export async function requireFreshAuth(
  request: Request, 
  maxAgeMinutes: number = 5
): Promise<{ userId: string; sessionId: string; issuedAt: number }> {
  // Extract access token
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    throw AuthenticationError('Access token required for sensitive operation')
  }
  
  const accessToken = authHeader.slice(7)
  
  // Validate access token
  const payload = await TokenManager.validateAccessToken(accessToken)
  if (!payload) {
    throw AuthenticationError('Invalid access token')
  }
  
  // Check token age
  const issuedAt = (payload.iat as number) * 1000 // Convert to milliseconds
  const now = Date.now()
  const ageMinutes = (now - issuedAt) / (60 * 1000)
  
  if (ageMinutes > maxAgeMinutes) {
    throw AuthenticationError(`Fresh authentication required. Please log in again to perform this action. (Token age: ${Math.round(ageMinutes)} minutes, max: ${maxAgeMinutes} minutes)`)
  }
  
  return {
    userId: payload.sub as string,
    sessionId: payload.session_id as string,
    issuedAt: issuedAt
  }
}

/**
 * Require very fresh auth for password changes (2 minutes)
 */
export async function requireFreshAuthForPassword(request: Request) {
  return await requireFreshAuth(request, 2)
}

/**
 * Require fresh auth for user management (5 minutes)
 */
export async function requireFreshAuthForUserManagement(request: Request) {
  return await requireFreshAuth(request, 5)
}

/**
 * Require fresh auth for practice configuration (10 minutes)
 */
export async function requireFreshAuthForPracticeConfig(request: Request) {
  return await requireFreshAuth(request, 10)
}
