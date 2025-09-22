import { SignJWT, jwtVerify, type JWTPayload } from 'jose'
import { nanoid } from 'nanoid'
import { createHash } from 'crypto'
import { db, refresh_tokens, token_blacklist, user_sessions, login_attempts, } from '@/lib/db'
import { eq, and, gte, lte, } from 'drizzle-orm'
import { AuditLogger } from '@/lib/api/services/audit'
import { getJWTConfig } from '@/lib/env'
import { logger } from '@/lib/logger'
import { createAppLogger } from '@/lib/logger/factory'
import { isPhase3MigrationEnabled } from '@/lib/logger/phase3-migration-flags'
import { getCachedUserContextSafe } from '@/lib/rbac/cached-user-context'
import { rolePermissionCache } from '@/lib/cache/role-permission-cache'

/**
 * Enterprise JWT + Refresh Token Manager
 * Handles 15-minute access tokens with sliding window refresh tokens
 */

// Universal logger for token management operations
const tokenManagerLogger = createAppLogger('token-manager', {
  component: 'security',
  feature: 'jwt-token-management',
  securityLevel: 'critical'
})

const jwtConfig = getJWTConfig()
const ACCESS_TOKEN_SECRET = new TextEncoder().encode(jwtConfig.accessSecret)
const REFRESH_TOKEN_SECRET = new TextEncoder().encode(jwtConfig.refreshSecret)

export interface TokenPair {
  accessToken: string
  refreshToken: string
  expiresAt: Date
  sessionId: string
}

export interface DeviceInfo {
  ipAddress: string
  userAgent: string
  fingerprint: string
  deviceName: string
}

export interface RefreshTokenData {
  tokenId: string
  userId: string
  deviceFingerprint: string
  rememberMe: boolean
  expiresAt: Date
}

export class TokenManager {
  // Access token duration: 15 minutes
  private static readonly ACCESS_TOKEN_DURATION = 15 * 60 * 1000 // 15 minutes
  
  // Refresh token durations
  private static readonly REFRESH_TOKEN_STANDARD = 7 * 24 * 60 * 60 * 1000 // 7 days
  private static readonly REFRESH_TOKEN_REMEMBER_ME = 30 * 24 * 60 * 60 * 1000 // 30 days

  /**
   * Create initial token pair on login
   */
  static async createTokenPair(
    userId: string,
    deviceInfo: DeviceInfo,
    rememberMe: boolean = false,
    email?: string
  ): Promise<TokenPair> {
    const startTime = Date.now()
    const now = new Date()
    const sessionId = nanoid(32)
    const refreshTokenId = nanoid(32)
    
    // Enhanced token creation logging
    if (isPhase3MigrationEnabled('enableEnhancedTokenManagerLogging')) {
      tokenManagerLogger.info('Token pair creation initiated', {
        userId,
        sessionId,
        deviceFingerprint: deviceInfo.fingerprint,
        rememberMe,
        securityLevel: 'critical',
        operation: 'create_token_pair'
      })
    }
    
    // Load user context to include in JWT (eliminates future database queries)
    const contextLoadStart = Date.now()
    const userContext = await getCachedUserContextSafe(userId)
    const contextLoadDuration = Date.now() - contextLoadStart
    
    if (!userContext) {
      // Enhanced token creation failure logging
      if (isPhase3MigrationEnabled('enableEnhancedTokenManagerLogging')) {
        tokenManagerLogger.security('token_creation_failed', 'high', {
          action: 'user_context_load_failed',
          userId,
          threat: 'authentication_bypass_attempt',
          blocked: true,
          reason: 'invalid_user_context'
        })
      }
      throw new Error(`Failed to load user context for JWT creation: ${userId}`)
    }
    
    // Log successful context loading
    if (isPhase3MigrationEnabled('enableEnhancedTokenManagerLogging')) {
      tokenManagerLogger.debug('User context loaded for token creation', {
        userId,
        roleCount: userContext.roles.length,
        permissionCount: userContext.all_permissions.length,
        organizationCount: userContext.organizations.length,
        contextLoadTime: contextLoadDuration,
        cacheOptimized: true
      })
    }
    
    // Create access token (15 minutes) with enhanced user data
    const accessTokenPayload = {
      // Security & session
      sub: userId,
      jti: nanoid(), // Unique JWT ID for blacklist capability
      session_id: sessionId,
      
      // User data (eliminates user table queries)
      email: userContext.email,
      first_name: userContext.first_name,
      last_name: userContext.last_name,
      email_verified: userContext.email_verified,
      
      // RBAC cache keys (eliminates RBAC queries)
      role_ids: userContext.roles.map(r => r.role_id),
      user_role_ids: userContext.user_roles.map(ur => ur.user_role_id),
      primary_org_id: userContext.current_organization_id,
      is_super_admin: userContext.is_super_admin,
      org_admin_for: userContext.organization_admin_for,
      
      // Cache versioning for invalidation
      roles_version: userContext.roles.reduce((acc, role) => {
        acc[role.role_id] = rolePermissionCache.getRoleVersion(role.role_id)
        return acc
      }, {} as Record<string, number>),
      
      iat: Math.floor(now.getTime() / 1000),
      exp: Math.floor((now.getTime() + TokenManager.ACCESS_TOKEN_DURATION) / 1000)
    }
    
    const accessToken = await new SignJWT(accessTokenPayload)
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .sign(ACCESS_TOKEN_SECRET)

    // Create refresh token
    const refreshTokenDuration = rememberMe ? TokenManager.REFRESH_TOKEN_REMEMBER_ME : TokenManager.REFRESH_TOKEN_STANDARD
    const refreshExpiresAt = new Date(now.getTime() + refreshTokenDuration)
    
    const refreshTokenPayload = {
      sub: userId,
      jti: refreshTokenId,
      session_id: sessionId,
      remember_me: rememberMe,
      iat: Math.floor(now.getTime() / 1000),
      exp: Math.floor(refreshExpiresAt.getTime() / 1000)
    }
    
    const refreshToken = await new SignJWT(refreshTokenPayload)
      .setProtectedHeader({ alg: 'HS256', typ: 'REFRESH' })
      .sign(REFRESH_TOKEN_SECRET)

    // Store refresh token in database
    await db.insert(refresh_tokens).values({
      token_id: refreshTokenId,
      user_id: userId,
      token_hash: TokenManager.hashToken(refreshToken),
      device_fingerprint: deviceInfo.fingerprint,
      ip_address: deviceInfo.ipAddress,
      user_agent: deviceInfo.userAgent,
      remember_me: rememberMe,
      expires_at: refreshExpiresAt,
      rotation_count: 0
    })

    // Create session record
    await db.insert(user_sessions).values({
      session_id: sessionId,
      user_id: userId,
      refresh_token_id: refreshTokenId,
      device_fingerprint: deviceInfo.fingerprint,
      device_name: deviceInfo.deviceName,
      ip_address: deviceInfo.ipAddress,
      user_agent: deviceInfo.userAgent,
      remember_me: rememberMe
    })

    // Log successful login
    await TokenManager.logLoginAttempt({
      email: email || '', // Use provided email or empty string
      userId,
      deviceInfo,
      success: true,
      rememberMe,
      sessionId
    })

    // Audit log
    await AuditLogger.logAuth({
      action: 'login',
      userId,
      ipAddress: deviceInfo.ipAddress,
      userAgent: deviceInfo.userAgent,
      metadata: {
        sessionId,
        refreshTokenId,
        rememberMe,
        deviceFingerprint: deviceInfo.fingerprint
      }
    })

    // Enhanced token creation completion logging
    if (isPhase3MigrationEnabled('enableEnhancedTokenManagerLogging')) {
      const duration = Date.now() - startTime
      
      // Token security analytics
      tokenManagerLogger.security('token_pair_created', 'low', {
        action: 'jwt_token_generation_success',
        userId,
        sessionId,
        tokenTypes: ['access_token', 'refresh_token'],
        securityFeatures: ['device_binding', 'session_tracking', 'rbac_embedded'],
        expirationPolicy: rememberMe ? '30_days' : '24_hours'
      })
      
      // Business intelligence for token analytics
      tokenManagerLogger.info('Token creation analytics', {
        tokenLifecycle: 'created',
        userSegment: userContext.roles[0]?.name || 'no_role',
        deviceType: deviceInfo.deviceName || 'unknown',
        sessionType: rememberMe ? 'persistent' : 'session',
        securityCompliance: 'jwt_standard',
        rbacEmbedded: true,
        cacheOptimized: true
      })
      
      // Performance monitoring
      tokenManagerLogger.timing('Token pair creation completed', startTime, {
        contextLoadTime: contextLoadDuration,
        tokenGenerationTime: duration - contextLoadDuration,
        totalOperations: 3, // access token + refresh token + session
        performanceOptimized: duration < 200 // Target under 200ms
      })
    }

    return {
      accessToken,
      refreshToken,
      expiresAt: new Date(now.getTime() + TokenManager.ACCESS_TOKEN_DURATION),
      sessionId
    }
  }

  /**
   * Refresh access token using refresh token (with rotation)
   */
  static async refreshTokenPair(refreshToken: string, deviceInfo: DeviceInfo): Promise<TokenPair | null> {
    try {
      // Verify refresh token
      const payload = await jwtVerify(refreshToken, REFRESH_TOKEN_SECRET)
      const refreshTokenId = payload.payload.jti as string
      const userId = payload.payload.sub as string
      const sessionId = payload.payload.session_id as string
      const rememberMe = payload.payload.remember_me as boolean

      // Check if refresh token exists and is active
      const [tokenRecord] = await db
        .select()
        .from(refresh_tokens)
        .where(
          and(
            eq(refresh_tokens.token_id, refreshTokenId),
            eq(refresh_tokens.is_active, true),
            gte(refresh_tokens.expires_at, new Date())
          )
        )
        .limit(1)

      if (!tokenRecord) {
        throw new Error('Refresh token not found or expired')
      }

      // Verify token hash matches
      if (tokenRecord.token_hash !== TokenManager.hashToken(refreshToken)) {
        throw new Error('Invalid refresh token')
      }

      // Check if token is blacklisted
      const [blacklisted] = await db
        .select()
        .from(token_blacklist)
        .where(eq(token_blacklist.jti, refreshTokenId))
        .limit(1)

      if (blacklisted) {
        throw new Error('Refresh token has been revoked')
      }

      const now = new Date()

      // Load fresh user context for the new access token
      const userContext = await getCachedUserContextSafe(userId)
      if (!userContext) {
        throw new Error(`Failed to load user context for token refresh: ${userId}`)
      }

      // Create new access token with enhanced user data
      const accessTokenPayload = {
        // Security & session
        sub: userId,
        jti: nanoid(),
        session_id: sessionId,
        
        // User data (eliminates user table queries)
        email: userContext.email,
        first_name: userContext.first_name,
        last_name: userContext.last_name,
        email_verified: userContext.email_verified,
        
        // RBAC cache keys (eliminates RBAC queries)
        role_ids: userContext.roles.map(r => r.role_id),
        user_role_ids: userContext.user_roles.map(ur => ur.user_role_id),
        primary_org_id: userContext.current_organization_id,
        is_super_admin: userContext.is_super_admin,
        org_admin_for: userContext.organization_admin_for,
        
        // Cache versioning for invalidation
        roles_version: userContext.roles.reduce((acc, role) => {
          acc[role.role_id] = rolePermissionCache.getRoleVersion(role.role_id)
          return acc
        }, {} as Record<string, number>),
        
        iat: Math.floor(now.getTime() / 1000),
        exp: Math.floor((now.getTime() + TokenManager.ACCESS_TOKEN_DURATION) / 1000)
      }

      const newAccessToken = await new SignJWT(accessTokenPayload)
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .sign(ACCESS_TOKEN_SECRET)

      // Create new refresh token (rotation)
      const newRefreshTokenId = nanoid(32)
      const refreshTokenDuration = rememberMe ? TokenManager.REFRESH_TOKEN_REMEMBER_ME : TokenManager.REFRESH_TOKEN_STANDARD
      const newRefreshExpiresAt = new Date(now.getTime() + refreshTokenDuration) // Sliding window

      const newRefreshTokenPayload = {
        sub: userId,
        jti: newRefreshTokenId,
        session_id: sessionId,
        remember_me: rememberMe,
        iat: Math.floor(now.getTime() / 1000),
        exp: Math.floor(newRefreshExpiresAt.getTime() / 1000)
      }

      const newRefreshToken = await new SignJWT(newRefreshTokenPayload)
        .setProtectedHeader({ alg: 'HS256', typ: 'REFRESH' })
        .sign(REFRESH_TOKEN_SECRET)

      // Revoke old refresh token
      await db
        .update(refresh_tokens)
        .set({
          is_active: false,
          revoked_at: now,
          revoked_reason: 'rotation'
        })
        .where(eq(refresh_tokens.token_id, refreshTokenId))

      // Store new refresh token
      await db.insert(refresh_tokens).values({
        token_id: newRefreshTokenId,
        user_id: userId,
        token_hash: TokenManager.hashToken(newRefreshToken),
        device_fingerprint: deviceInfo.fingerprint,
        ip_address: deviceInfo.ipAddress,
        user_agent: deviceInfo.userAgent,
        remember_me: rememberMe,
        expires_at: newRefreshExpiresAt,
        rotation_count: tokenRecord.rotation_count + 1
      })

      // Update session
      await db
        .update(user_sessions)
        .set({
          refresh_token_id: newRefreshTokenId,
          last_activity: now
        })
        .where(eq(user_sessions.session_id, sessionId))

      // Audit log
      await AuditLogger.logAuth({
        action: 'login',
        userId,
        ipAddress: deviceInfo.ipAddress,
        userAgent: deviceInfo.userAgent,
        metadata: {
          sessionId,
          oldRefreshTokenId: refreshTokenId,
          newRefreshTokenId,
          rotationCount: tokenRecord.rotation_count + 1
        }
      })

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        expiresAt: new Date(now.getTime() + TokenManager.ACCESS_TOKEN_DURATION),
        sessionId
      }

    } catch (error) {
      logger.error('Token refresh error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        refreshToken: refreshToken ? 'present' : 'missing'
      })
      return null
    }
  }

  /**
   * Validate access token
   */
  static async validateAccessToken(accessToken: string): Promise<JWTPayload | null> {
    try {
      const { payload } = await jwtVerify(accessToken, ACCESS_TOKEN_SECRET)
      
      // Check if token is blacklisted
      const jti = payload.jti as string
      const [blacklisted] = await db
        .select()
        .from(token_blacklist)
        .where(eq(token_blacklist.jti, jti))
        .limit(1)

      if (blacklisted) {
        return null
      }

      return payload
    } catch (_error) {
      return null
    }
  }

  /**
   * Revoke refresh token (logout)
   */
  static async revokeRefreshToken(
    refreshToken: string, 
    reason: 'logout' | 'security' | 'admin_action' = 'logout'
  ): Promise<boolean> {
    try {
      const payload = await jwtVerify(refreshToken, REFRESH_TOKEN_SECRET)
      const refreshTokenId = payload.payload.jti as string
      const userId = payload.payload.sub as string
      const sessionId = payload.payload.session_id as string

      const now = new Date()

      // Revoke refresh token
      await db
        .update(refresh_tokens)
        .set({
          is_active: false,
          revoked_at: now,
          revoked_reason: reason
        })
        .where(eq(refresh_tokens.token_id, refreshTokenId))

      // Add to blacklist
      await db.insert(token_blacklist).values({
        jti: refreshTokenId,
        user_id: userId,
        token_type: 'refresh',
        expires_at: new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000)), // Keep in blacklist for 30 days
        reason
      })

      // End session
      await db
        .update(user_sessions)
        .set({
          is_active: false,
          ended_at: now,
          end_reason: reason
        })
        .where(eq(user_sessions.session_id, sessionId))

      // Audit log
      await AuditLogger.logAuth({
        action: 'logout',
        userId,
        metadata: {
          sessionId,
          refreshTokenId,
          reason
        }
      })

      return true
    } catch (error) {
      logger.error('Token revocation error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        userId: 'unknown' // userId may not be available if JWT verification fails
      })
      return false
    }
  }

  /**
   * Revoke all refresh tokens for a user
   */
  static async revokeAllUserTokens(
    userId: string, 
    reason: 'security' | 'admin_action' | 'user_disabled' = 'security'
  ): Promise<number> {
    const now = new Date()

    // Get all active refresh tokens for user
    const activeTokens = await db
      .select({ tokenId: refresh_tokens.token_id })
      .from(refresh_tokens)
      .where(
        and(
          eq(refresh_tokens.user_id, userId),
          eq(refresh_tokens.is_active, true)
        )
      )

    // Revoke all refresh tokens
    const _revokedResult = await db
      .update(refresh_tokens)
      .set({
        is_active: false,
        revoked_at: now,
        revoked_reason: reason
      })
      .where(
        and(
          eq(refresh_tokens.user_id, userId),
          eq(refresh_tokens.is_active, true)
        )
      )

    // Add all to blacklist
    for (const token of activeTokens) {
      await db.insert(token_blacklist).values({
        jti: token.tokenId,
        user_id: userId,
        token_type: 'refresh',
        expires_at: new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000)),
        reason
      })
    }

    // End all sessions
    await db
      .update(user_sessions)
      .set({
        is_active: false,
        ended_at: now,
        end_reason: reason
      })
      .where(
        and(
          eq(user_sessions.user_id, userId),
          eq(user_sessions.is_active, true)
        )
      )

    // Audit log
    await AuditLogger.logSecurity({
      action: 'bulk_token_revocation',
      userId,
      metadata: {
        revokedCount: activeTokens.length,
        reason
      },
      severity: 'high'
    })

    return activeTokens.length
  }

  /**
   * Generate device fingerprint from IP + User-Agent
   */
  static generateDeviceFingerprint(ipAddress: string, userAgent: string): string {
    return createHash('sha256')
      .update(`${ipAddress}:${userAgent}`)
      .digest('hex')
      .substring(0, 32)
  }

  /**
   * Generate device name from User-Agent
   */
  static generateDeviceName(userAgent: string): string {
    // Simple device name extraction - check most specific first
    if (userAgent.includes('Edge')) return 'Edge Browser'
    if (userAgent.includes('Chrome')) return 'Chrome Browser'
    if (userAgent.includes('Firefox')) return 'Firefox Browser'
    if (userAgent.includes('iPhone')) return 'iPhone Safari'
    if (userAgent.includes('Safari')) return 'Safari Browser'
    if (userAgent.includes('Android')) return 'Android Browser'
    return 'Unknown Browser'
  }

  /**
   * Hash token for secure storage
   */
  private static hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex')
  }

  /**
   * Log login attempt for audit trail
   */
  private static async logLoginAttempt(data: {
    email: string
    userId: string
    deviceInfo: DeviceInfo
    success: boolean
    failureReason?: string
    rememberMe: boolean
    sessionId?: string
  }): Promise<void> {
    await db.insert(login_attempts).values({
      attempt_id: nanoid(),
      email: data.email,
      user_id: data.userId,
      ip_address: data.deviceInfo.ipAddress,
      user_agent: data.deviceInfo.userAgent,
      device_fingerprint: data.deviceInfo.fingerprint,
      success: data.success,
      failure_reason: data.failureReason,
      remember_me_requested: data.rememberMe,
      session_id: data.sessionId
    })
  }

  /**
   * Clean up expired tokens and blacklist entries
   */
  static async cleanupExpiredTokens(): Promise<{ refreshTokens: number; blacklistEntries: number }> {
    const now = new Date()

    // Clean up expired refresh tokens
    const expiredRefreshTokens = await db
      .update(refresh_tokens)
      .set({
        is_active: false,
        revoked_at: now,
        revoked_reason: 'expired'
      })
      .where(
        and(
          eq(refresh_tokens.is_active, true),
          lte(refresh_tokens.expires_at, now)
        )
      )

    // Clean up expired blacklist entries
    const expiredBlacklistEntries = await db
      .delete(token_blacklist)
      .where(lte(token_blacklist.expires_at, now))

    logger.info('Token cleanup completed', {
      expiredRefreshTokens: expiredRefreshTokens.length || 0,
      expiredBlacklistEntries: expiredBlacklistEntries.length || 0,
      operation: 'cleanupExpiredTokens'
    })

    return {
      refreshTokens: expiredRefreshTokens.length || 0,
      blacklistEntries: expiredBlacklistEntries.length || 0
    }
  }
}
