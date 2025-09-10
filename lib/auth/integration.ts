import { TokenManager } from './token-manager'
import { AuditLogger } from '@/lib/api/services/audit'

/**
 * NextAuth Integration Layer
 * Bridges NextAuth authentication with our enterprise token system
 */

export interface NextAuthUser {
  id: string
  email: string
  firstName: string
  lastName: string
  role: string
  emailVerified: boolean
  rememberMe?: boolean
}

export interface LoginContext {
  ipAddress: string
  userAgent: string
  email: string
}

export class NextAuthTokenBridge {
  /**
   * Create enterprise tokens after successful NextAuth login
   */
  static async createTokensAfterLogin(
    user: NextAuthUser,
    context: LoginContext
  ): Promise<{ accessToken: string; refreshToken: string; sessionId: string } | null> {
    try {
      console.log('Creating enterprise tokens for user:', user.email, 'with context:', context)
      // Generate device info
      const deviceFingerprint = TokenManager.generateDeviceFingerprint(
        context.ipAddress, 
        context.userAgent
      )
      const deviceName = TokenManager.generateDeviceName(context.userAgent)

      const deviceInfo = {
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        fingerprint: deviceFingerprint,
        deviceName
      }

      // Create token pair using our enterprise system
      const tokenPair = await TokenManager.createTokenPair(
        user.id,
        deviceInfo,
        user.rememberMe || false
      )

      // Log the token creation
      await AuditLogger.logAuth({
        action: 'enterprise_tokens_created',
        userId: user.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: {
          sessionId: tokenPair.sessionId,
          rememberMe: user.rememberMe,
          deviceFingerprint,
          email: context.email
        }
      })

      return {
        accessToken: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
        sessionId: tokenPair.sessionId
      }
    } catch (error) {
      console.error('Failed to create enterprise tokens:', error)
      
      // Log the error but don't fail the login
      await AuditLogger.logSecurity({
        action: 'enterprise_token_creation_failed',
        userId: user.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error',
          email: context.email
        },
        severity: 'high'
      })
      
      return null
    }
  }

  /**
   * Cleanup enterprise tokens on logout
   */
  static async cleanupTokensOnLogout(userId: string, context: LoginContext): Promise<void> {
    try {
      // Revoke all refresh tokens for the user
      const revokedCount = await TokenManager.revokeAllUserTokens(userId, 'logout')

      // Log the cleanup
      await AuditLogger.logAuth({
        action: 'enterprise_tokens_cleaned_up',
        userId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: {
          revokedTokenCount: revokedCount,
          reason: 'nextauth_logout'
        }
      })

      console.log(`Cleaned up ${revokedCount} enterprise tokens for user ${userId}`)
    } catch (error) {
      console.error('Failed to cleanup enterprise tokens:', error)
      
      // Log the error
      await AuditLogger.logSecurity({
        action: 'enterprise_token_cleanup_failed',
        userId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error'
        },
        severity: 'medium'
      })
    }
  }

  /**
   * Extract request context for token operations
   */
  static extractRequestContext(req: any): LoginContext {
    return {
      ipAddress: req?.headers?.['x-forwarded-for'] || 
                 req?.headers?.['x-real-ip'] || 
                 req?.ip || 
                 'unknown',
      userAgent: req?.headers?.['user-agent'] || 'unknown',
      email: '' // Will be set by caller
    }
  }

  /**
   * Check if user should get enterprise tokens
   */
  static shouldCreateEnterpriseTokens(user: NextAuthUser): boolean {
    // For now, create tokens for all authenticated users
    // Later we can add role-based or feature-flag logic
    return user.role === 'admin' || user.role === 'practice_owner'
  }
}
