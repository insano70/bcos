import { SignJWT, jwtVerify, type JWTPayload } from 'jose'
import { nanoid } from 'nanoid'
import { createHash } from 'crypto'
import { db, refresh_tokens, token_blacklist, user_sessions, login_attempts, account_security } from '@/lib/db'
import { eq, and, gte, lte, desc, count, sql } from 'drizzle-orm'
import { AuditLogger } from '@/lib/api/services/audit'
import { getJWTConfig } from '@/lib/env'

/**
 * Enterprise JWT + Refresh Token Manager
 * Handles 15-minute access tokens with sliding window refresh tokens
 */

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
    rememberMe: boolean = false
  ): Promise<TokenPair> {
    const now = new Date()
    const sessionId = nanoid(32)
    const refreshTokenId = nanoid(32)
    
    // Create access token (15 minutes)
    const accessTokenPayload = {
      sub: userId,
      jti: nanoid(), // Unique JWT ID for blacklist capability
      session_id: sessionId,
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
      email: '', // Would need email parameter
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

      // Create new access token
      const accessTokenPayload = {
        sub: userId,
        jti: nanoid(),
        session_id: sessionId,
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
      console.error('Token refresh error:', error)
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
    } catch (error) {
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
      console.error('Token revocation error:', error)
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
    const revokedResult = await db
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
    // Simple device name extraction
    if (userAgent.includes('Chrome')) return 'Chrome Browser'
    if (userAgent.includes('Firefox')) return 'Firefox Browser'
    if (userAgent.includes('Safari')) return 'Safari Browser'
    if (userAgent.includes('Edge')) return 'Edge Browser'
    if (userAgent.includes('iPhone')) return 'iPhone Safari'
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

    console.log(`Cleaned up ${expiredRefreshTokens.length || 0} expired refresh tokens and ${expiredBlacklistEntries.length || 0} blacklist entries`)

    return {
      refreshTokens: expiredRefreshTokens.length || 0,
      blacklistEntries: expiredBlacklistEntries.length || 0
    }
  }
}
