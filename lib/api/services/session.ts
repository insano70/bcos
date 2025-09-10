import { db, user_sessions, login_attempts, account_security, trusted_devices } from '@/lib/db'
import { eq, and, gte, lte, desc, count, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { AuditLogger } from './audit'

/**
 * Enterprise Session Management Service
 * Handles advanced session tracking, device management, and security
 */

export interface SessionInfo {
  sessionId: string
  userId: string
  deviceFingerprint: string
  deviceName?: string
  ipAddress: string
  userAgent?: string
  location?: string
  isActive: boolean
  lastActivity: Date
  expiresAt: Date
  createdAt: Date
}

export interface DeviceInfo {
  fingerprint: string
  name: string
  ipAddress: string
  userAgent?: string
  location?: string
}

export class SessionManager {
  /**
   * Create a new user session with device tracking
   */
  static async createSession(
    userId: string,
    deviceInfo: DeviceInfo,
    rememberMe: boolean = false
  ): Promise<SessionInfo> {
    const sessionId = nanoid(32)
    const now = new Date()
    
    // Calculate expiration based on remember me preference
    const expirationHours = rememberMe ? 24 * 30 : 24 // 30 days or 24 hours
    const expiresAt = new Date(now.getTime() + (expirationHours * 60 * 60 * 1000))

    // Check concurrent session limits
    await SessionManager.enforceConcurrentSessionLimits(userId)

    // Create session record
    const [session] = await db
      .insert(user_sessions)
      .values({
        session_id: sessionId,
        user_id: userId,
        device_fingerprint: deviceInfo.fingerprint,
        device_name: deviceInfo.name,
        ip_address: deviceInfo.ipAddress,
        user_agent: deviceInfo.userAgent,
        location: deviceInfo.location,
        expires_at: expiresAt,
        last_activity: now,
      })
      .returning()

    // Update device tracking
    await SessionManager.updateDeviceTracking(userId, deviceInfo)

    // Log successful login
    await SessionManager.logLoginAttempt(userId, deviceInfo, true)

    // Audit log
    await AuditLogger.logAuth({
      action: 'login',
      userId,
      ipAddress: deviceInfo.ipAddress,
      userAgent: deviceInfo.userAgent,
      metadata: {
        sessionId,
        deviceFingerprint: deviceInfo.fingerprint,
        rememberMe
      }
    })

    return {
      sessionId: session.session_id,
      userId: session.user_id,
      deviceFingerprint: session.device_fingerprint,
      deviceName: session.device_name || undefined,
      ipAddress: session.ip_address,
      userAgent: session.user_agent || undefined,
      location: session.location || undefined,
      isActive: session.is_active,
      lastActivity: session.last_activity,
      expiresAt: session.expires_at,
      createdAt: session.created_at
    }
  }

  /**
   * Validate and refresh an existing session
   */
  static async validateSession(sessionId: string): Promise<SessionInfo | null> {
    const [session] = await db
      .select()
      .from(user_sessions)
      .where(
        and(
          eq(user_sessions.session_id, sessionId),
          eq(user_sessions.is_active, true),
          gte(user_sessions.expires_at, new Date())
        )
      )
      .limit(1)

    if (!session) {
      return null
    }

    // Update last activity
    await db
      .update(user_sessions)
      .set({ last_activity: new Date() })
      .where(eq(user_sessions.session_id, sessionId))

    return {
      sessionId: session.session_id,
      userId: session.user_id,
      deviceFingerprint: session.device_fingerprint,
      deviceName: session.device_name || undefined,
      ipAddress: session.ip_address,
      userAgent: session.user_agent || undefined,
      location: session.location || undefined,
      isActive: session.is_active,
      lastActivity: new Date(), // Updated timestamp
      expiresAt: session.expires_at,
      createdAt: session.created_at
    }
  }

  /**
   * Revoke a specific session
   */
  static async revokeSession(
    sessionId: string,
    reason: 'manual' | 'timeout' | 'security' | 'concurrent_limit' = 'manual'
  ): Promise<boolean> {
    const result = await db
      .update(user_sessions)
      .set({
        is_active: false,
        revoked_at: new Date(),
        revoked_reason: reason
      })
      .where(eq(user_sessions.session_id, sessionId))

    return result.rowCount > 0
  }

  /**
   * Revoke all sessions for a user (except optionally the current one)
   */
  static async revokeAllUserSessions(
    userId: string,
    exceptSessionId?: string,
    reason: string = 'security'
  ): Promise<number> {
    const conditions = [
      eq(user_sessions.user_id, userId),
      eq(user_sessions.is_active, true)
    ]

    if (exceptSessionId) {
      conditions.push(sql`${user_sessions.session_id} != ${exceptSessionId}`)
    }

    const result = await db
      .update(user_sessions)
      .set({
        is_active: false,
        revoked_at: new Date(),
        revoked_reason: reason
      })
      .where(and(...conditions))

    // Audit log
    await AuditLogger.logSecurity({
      action: 'bulk_session_revocation',
      userId,
      metadata: {
        revokedCount: result.rowCount,
        reason,
        exceptSessionId
      },
      severity: 'medium'
    })

    return result.rowCount
  }

  /**
   * Get all active sessions for a user
   */
  static async getUserSessions(userId: string): Promise<SessionInfo[]> {
    const sessions = await db
      .select()
      .from(user_sessions)
      .where(
        and(
          eq(user_sessions.user_id, userId),
          eq(user_sessions.is_active, true)
        )
      )
      .orderBy(desc(user_sessions.last_activity))

    return sessions.map(session => ({
      sessionId: session.session_id,
      userId: session.user_id,
      deviceFingerprint: session.device_fingerprint,
      deviceName: session.device_name || undefined,
      ipAddress: session.ip_address,
      userAgent: session.user_agent || undefined,
      location: session.location || undefined,
      isActive: session.is_active,
      lastActivity: session.last_activity,
      expiresAt: session.expires_at,
      createdAt: session.created_at
    }))
  }

  /**
   * Enforce concurrent session limits
   */
  private static async enforceConcurrentSessionLimits(userId: string): Promise<void> {
    // Get user's session limit (default 5)
    const [securitySettings] = await db
      .select({ maxSessions: account_security.max_concurrent_sessions })
      .from(account_security)
      .where(eq(account_security.user_id, userId))
      .limit(1)

    const maxSessions = securitySettings?.maxSessions || 5

    // Count active sessions
    const [{ activeCount }] = await db
      .select({ activeCount: count() })
      .from(user_sessions)
      .where(
        and(
          eq(user_sessions.user_id, userId),
          eq(user_sessions.is_active, true),
          gte(user_sessions.expires_at, new Date())
        )
      )

    // If at limit, revoke oldest session
    if (activeCount >= maxSessions) {
      const [oldestSession] = await db
        .select({ sessionId: user_sessions.session_id })
        .from(user_sessions)
        .where(
          and(
            eq(user_sessions.user_id, userId),
            eq(user_sessions.is_active, true)
          )
        )
        .orderBy(user_sessions.last_activity)
        .limit(1)

      if (oldestSession) {
        await SessionManager.revokeSession(oldestSession.sessionId, 'concurrent_limit')
      }
    }
  }

  /**
   * Update device tracking information
   */
  private static async updateDeviceTracking(userId: string, deviceInfo: DeviceInfo): Promise<void> {
    const now = new Date()

    // Check if device exists
    const [existingDevice] = await db
      .select()
      .from(trusted_devices)
      .where(
        and(
          eq(trusted_devices.user_id, userId),
          eq(trusted_devices.device_fingerprint, deviceInfo.fingerprint)
        )
      )
      .limit(1)

    if (existingDevice) {
      // Update last seen
      await db
        .update(trusted_devices)
        .set({ last_seen: now })
        .where(eq(trusted_devices.device_id, existingDevice.device_id))
    } else {
      // Create new device record
      await db
        .insert(trusted_devices)
        .values({
          device_id: nanoid(),
          user_id: userId,
          device_fingerprint: deviceInfo.fingerprint,
          device_name: deviceInfo.name,
          first_seen: now,
          last_seen: now
        })
    }
  }

  /**
   * Log login attempt
   */
  private static async logLoginAttempt(
    userId: string | null,
    deviceInfo: DeviceInfo,
    success: boolean,
    failureReason?: string
  ): Promise<void> {
    await db
      .insert(login_attempts)
      .values({
        attempt_id: nanoid(),
        email: '', // Would need email parameter
        user_id: userId,
        ip_address: deviceInfo.ipAddress,
        user_agent: deviceInfo.userAgent,
        device_fingerprint: deviceInfo.fingerprint,
        success,
        failure_reason: failureReason,
        location: deviceInfo.location,
      })
  }

  /**
   * Clean up expired sessions
   */
  static async cleanupExpiredSessions(): Promise<number> {
    const result = await db
      .update(user_sessions)
      .set({
        is_active: false,
        revoked_at: new Date(),
        revoked_reason: 'timeout'
      })
      .where(
        and(
          eq(user_sessions.is_active, true),
          lte(user_sessions.expires_at, new Date())
        )
      )

    console.log(`Cleaned up ${result.rowCount} expired sessions`)
    return result.rowCount
  }

  /**
   * Get session analytics
   */
  static async getSessionAnalytics(timeframe: 'day' | 'week' | 'month' = 'week') {
    const startDate = new Date()
    switch (timeframe) {
      case 'day':
        startDate.setDate(startDate.getDate() - 1)
        break
      case 'week':
        startDate.setDate(startDate.getDate() - 7)
        break
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1)
        break
    }

    const [stats] = await db
      .select({
        totalSessions: count(),
        activeSessions: sql<number>`count(case when is_active = true then 1 end)`,
        uniqueUsers: sql<number>`count(distinct user_id)`,
        uniqueDevices: sql<number>`count(distinct device_fingerprint)`
      })
      .from(user_sessions)
      .where(gte(user_sessions.created_at, startDate))

    return stats
  }
}
