import { db, user_sessions, login_attempts, account_security } from '@/lib/db'
import { eq, and, gte, lte, desc, count, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { AuditLogger } from './audit'
import { logger } from '@/lib/logger'

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

/**
 * Create a new user session with device tracking
 */
export async function createSession(
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
  await enforceConcurrentSessionLimits(userId)

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
      is_active: true,
      last_activity: now,
      expires_at: expiresAt,
      created_at: now
    })
    .returning()

  // Update device tracking
  await updateDeviceTracking(userId, deviceInfo)

  // Log successful login
  await logLoginAttempt(userId, deviceInfo, true)

  // Audit log
  await AuditLogger.logAuth({
    action: 'login',
    userId,
    success: true,
    details: {
      sessionId,
      deviceFingerprint: deviceInfo.fingerprint,
      ipAddress: deviceInfo.ipAddress,
      rememberMe
    }
  })

  return {
    sessionId: session.session_id,
    userId: session.user_id,
    deviceFingerprint: session.device_fingerprint,
    deviceName: session.device_name,
    ipAddress: session.ip_address,
    userAgent: session.user_agent,
    location: session.location,
    isActive: session.is_active,
    lastActivity: session.last_activity,
    expiresAt: session.expires_at,
    createdAt: session.created_at
  }
}

/**
 * Validate and refresh an existing session
 */
export async function validateSession(sessionId: string): Promise<SessionInfo | null> {
  const now = new Date()

  const [session] = await db
    .select()
    .from(user_sessions)
    .where(
      and(
        eq(user_sessions.session_id, sessionId),
        eq(user_sessions.is_active, true),
        gte(user_sessions.expires_at, now)
      )
    )

  if (!session) {
    return null
  }

  // Update last activity
  await db
    .update(user_sessions)
    .set({
      last_activity: now
    })
    .where(eq(user_sessions.session_id, sessionId))

  // Check if session needs refresh (within 1 hour of expiry)
  const oneHourFromExpiry = new Date(session.expires_at.getTime() - (60 * 60 * 1000))
  if (now >= oneHourFromExpiry) {
    const newExpiry = new Date(now.getTime() + (24 * 60 * 60 * 1000)) // Extend by 24 hours
    await db
      .update(user_sessions)
      .set({
        expires_at: newExpiry
      })
      .where(eq(user_sessions.session_id, sessionId))
  }

  return {
    sessionId: session.session_id,
    userId: session.user_id,
    deviceFingerprint: session.device_fingerprint,
    deviceName: session.device_name,
    ipAddress: session.ip_address,
    userAgent: session.user_agent,
    location: session.location,
    isActive: session.is_active,
    lastActivity: session.last_activity,
    expiresAt: session.expires_at,
    createdAt: session.created_at
  }
}

/**
 * Revoke a specific session
 */
export async function revokeSession(
  sessionId: string,
  reason: 'manual' | 'timeout' | 'security' | 'concurrent_limit' = 'manual'
): Promise<boolean> {
  const result = await db
    .update(user_sessions)
    .set({
      is_active: false,
      ended_at: new Date()
    })
    .where(eq(user_sessions.session_id, sessionId))

  if (result.rowCount && result.rowCount > 0) {
    // Audit log
    await AuditLogger.logAuth({
      action: 'logout',
      userId: '', // Would need to get from session
      success: true,
      details: {
        sessionId,
        reason
      }
    })

    return true
  }

  return false
}

/**
 * Revoke all sessions for a user (except optionally the current one)
 */
export async function revokeAllUserSessions(
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
      ended_at: new Date()
    })
    .where(and(...conditions))

  const revokedCount = result.rowCount || 0

  if (revokedCount > 0) {
    // Audit log
    await AuditLogger.logAuth({
      action: 'bulk_logout',
      userId,
      success: true,
      details: {
        reason,
        exceptSessionId,
        revokedCount
      }
    })
  }

  return revokedCount
}

/**
 * Get all active sessions for a user
 */
export async function getUserSessions(userId: string): Promise<SessionInfo[]> {
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
    deviceName: session.device_name,
    ipAddress: session.ip_address,
    userAgent: session.user_agent,
    location: session.location,
    isActive: session.is_active,
    lastActivity: session.last_activity,
    expiresAt: session.expires_at,
    createdAt: session.created_at
  }))
}

/**
 * Enforce concurrent session limits
 */
async function enforceConcurrentSessionLimits(userId: string): Promise<void> {
  // Get user's session limit (default 5)
  const [securitySettings] = await db
    .select({ maxSessions: account_security.max_concurrent_sessions })
    .from(account_security)
    .where(eq(account_security.user_id, userId))

  const maxSessions = securitySettings?.maxSessions || 5

  // Get current active sessions count
  const [{ count: activeCount }] = await db
    .select({ count: count() })
    .from(user_sessions)
    .where(
      and(
        eq(user_sessions.user_id, userId),
        eq(user_sessions.is_active, true)
      )
    )

  // If at limit, revoke oldest session
  if (activeCount >= maxSessions) {
    const oldestSession = await db
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

    if (oldestSession.length > 0) {
      await revokeSession(oldestSession[0].sessionId, 'concurrent_limit')
    }
  }
}

/**
 * Update device tracking information
 */
async function updateDeviceTracking(userId: string, deviceInfo: DeviceInfo): Promise<void> {
  // Device tracking functionality removed - trusted_devices table not implemented
  // This is a placeholder for future device tracking implementation
  logger.debug('Device tracking initiated', {
    userId,
    fingerprint: deviceInfo.fingerprint,
    ipAddress: deviceInfo.ipAddress
  })
}

/**
 * Log login attempt
 */
async function logLoginAttempt(
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
      location: deviceInfo.location,
      success,
      failure_reason: failureReason,
      attempted_at: new Date()
    })
}

/**
 * Clean up expired sessions
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const result = await db
    .update(user_sessions)
    .set({
      is_active: false,
      ended_at: new Date()
    })
    .where(
      and(
        eq(user_sessions.is_active, true),
        lte(user_sessions.expires_at, new Date())
      )
    )

  const cleanedCount = result.rowCount || 0

  if (cleanedCount > 0) {
    logger.info('Expired sessions cleaned up', {
      operation: 'cleanupExpiredSessions',
      cleanedCount
    })
  }

  return cleanedCount
}

/**
 * Get session analytics
 */
export async function getSessionAnalytics(timeframe: 'day' | 'week' | 'month' = 'week') {
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

  const stats = await db
    .select({
      totalSessions: count(user_sessions.session_id),
      activeSessions: sql<number>`count(case when ${user_sessions.is_active} = true then 1 end)`,
      uniqueUsers: sql<number>`count(distinct ${user_sessions.user_id})`,
      uniqueDevices: sql<number>`count(distinct ${user_sessions.device_fingerprint})`
    })
    .from(user_sessions)
    .where(gte(user_sessions.created_at, startDate))

  return stats[0]
}

// Export for backward compatibility
export const SessionManager = {
  createSession,
  validateSession,
  revokeSession,
  revokeAllUserSessions,
  getUserSessions,
  cleanupExpiredSessions,
  getSessionAnalytics
}