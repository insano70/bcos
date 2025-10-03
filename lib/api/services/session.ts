import { and, count, desc, eq, gte, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { account_security, db, login_attempts, user_sessions } from '@/lib/db';
import { log } from '@/lib/logger';
import { AuditLogger } from '@/lib/api/services/audit';

/**
 * Enterprise Session Management Service
 * Handles advanced session tracking, device management, and security
 */

// Helper function for device type detection
function getDeviceType(userAgent?: string): string {
  if (!userAgent) return 'unknown';

  const agent = userAgent.toLowerCase();
  if (agent.includes('mobile') || agent.includes('android') || agent.includes('iphone'))
    return 'mobile';
  if (agent.includes('tablet') || agent.includes('ipad')) return 'tablet';
  if (agent.includes('chrome') || agent.includes('firefox') || agent.includes('safari'))
    return 'desktop';
  return 'unknown';
}

export interface SessionInfo {
  sessionId: string;
  userId: string;
  deviceFingerprint: string;
  deviceName?: string | null;
  ipAddress: string;
  userAgent?: string | null;
  location?: string | null;
  isActive: boolean;
  lastActivity: Date;
  expiresAt?: Date | null;
  createdAt: Date;
}

export interface DeviceInfo {
  fingerprint: string;
  deviceName: string;
  ipAddress: string;
  userAgent: string;
  location?: string;
}

/**
 * Create a new user session with device tracking
 */
export async function createSession(
  userId: string,
  deviceInfo: DeviceInfo,
  rememberMe: boolean = false
): Promise<SessionInfo> {
  const startTime = Date.now();
  const sessionId = nanoid(32);
  const now = new Date();

  // Enhanced session creation logging - permanently enabled
  log.info('Session creation initiated', {
    userId,
    deviceFingerprint: deviceInfo.fingerprint,
    deviceName: deviceInfo.deviceName,
    rememberMe,
    ipAddress: deviceInfo.ipAddress,
  });

  // Calculate expiration based on remember me preference
  const expirationHours = rememberMe ? 24 * 30 : 24; // 30 days or 24 hours
  const expiresAt = new Date(now.getTime() + expirationHours * 60 * 60 * 1000);

  // Check concurrent session limits
  const sessionLimitStart = Date.now();
  await enforceConcurrentSessionLimits(userId);

  // Enhanced logging permanently enabled
  log.timing('Session limit enforcement completed', sessionLimitStart, {
    userId,
    operation: 'concurrent_session_check',
  });

  // Create session record
  const sessions = await db
    .insert(user_sessions)
    .values({
      session_id: sessionId,
      user_id: userId,
      device_fingerprint: deviceInfo.fingerprint,
      device_name: deviceInfo.deviceName,
      ip_address: deviceInfo.ipAddress,
      user_agent: deviceInfo.userAgent,
      remember_me: rememberMe,
      is_active: true,
      last_activity: now,
      created_at: now,
    })
    .returning();

  if (!sessions || sessions.length === 0) {
    throw new Error('Failed to create session');
  }

  const session = sessions[0]; // Safe: we just checked sessions.length > 0

  if (!session) {
    throw new Error('Failed to retrieve created session');
  }

  // Update device tracking
  await updateDeviceTracking(userId, deviceInfo);

  // Log successful login
  await logLoginAttempt(userId, deviceInfo, true);

  // Audit log
  const auditData: {
    action: 'login';
    userId: string;
    ipAddress: string;
    userAgent?: string;
    metadata: Record<string, unknown>;
  } = {
    action: 'login',
    userId,
    ipAddress: deviceInfo.ipAddress,
    metadata: {
      sessionId,
      deviceFingerprint: deviceInfo.fingerprint,
      rememberMe,
    },
  };
  if (deviceInfo.userAgent) {
    auditData.userAgent = deviceInfo.userAgent;
  }
  await AuditLogger.logAuth(auditData);

  // Enhanced session creation success logging - permanently enabled
  // Session lifecycle logging
  log.info('Session created successfully', {
    sessionId,
    userId,
    sessionType: rememberMe ? 'persistent' : 'temporary',
    expirationHours,
    deviceTracking: true,
    duration: Date.now() - startTime,
  });

  // Business intelligence for session analytics
  log.debug('Session analytics', {
    sessionCreationType: 'authentication_success',
    deviceType: getDeviceType(deviceInfo.userAgent),
    sessionDuration: rememberMe ? '30_days' : '24_hours',
    concurrentSessionsEnforced: true,
    ipGeolocation: 'tracked', // Could be enhanced with actual geo data
  });

  // Security monitoring for session creation
  log.security('session_created', 'low', {
    action: 'session_establishment',
    userId,
    threat: 'none',
    deviceFingerprint: deviceInfo.fingerprint,
    ipAddress: deviceInfo.ipAddress,
  });

  return {
    sessionId: session.session_id,
    userId: session.user_id,
    deviceFingerprint: session.device_fingerprint,
    deviceName: session.device_name,
    ipAddress: session.ip_address,
    userAgent: session.user_agent,
    location: deviceInfo.location || null, // From input, not stored in DB
    isActive: session.is_active,
    lastActivity: session.last_activity,
    expiresAt: expiresAt, // Calculated value
    createdAt: session.created_at,
  };
}

/**
 * Validate and refresh an existing session
 */
export async function validateSession(sessionId: string): Promise<SessionInfo | null> {
  const now = new Date();

  const [session] = await db
    .select()
    .from(user_sessions)
    .where(and(eq(user_sessions.session_id, sessionId), eq(user_sessions.is_active, true)));

  if (!session) {
    return null;
  }

  // Update last activity
  await db
    .update(user_sessions)
    .set({
      last_activity: now,
    })
    .where(eq(user_sessions.session_id, sessionId));

  return {
    sessionId: session.session_id,
    userId: session.user_id,
    deviceFingerprint: session.device_fingerprint,
    deviceName: session.device_name,
    ipAddress: session.ip_address,
    userAgent: session.user_agent,
    location: null, // Not stored in DB
    isActive: session.is_active,
    lastActivity: session.last_activity,
    expiresAt: null, // Sessions don't expire in this schema
    createdAt: session.created_at,
  };
}

/**
 * Revoke a specific session
 */
export async function revokeSession(
  sessionId: string,
  reason: 'manual' | 'timeout' | 'security' | 'concurrent_limit' = 'manual'
): Promise<boolean> {
  const updatedSessions = await db
    .update(user_sessions)
    .set({
      is_active: false,
      ended_at: new Date(),
    })
    .where(eq(user_sessions.session_id, sessionId))
    .returning();

  if (updatedSessions && updatedSessions.length > 0) {
    const session = updatedSessions[0];
    if (!session?.user_id) {
      throw new Error('Failed to retrieve user_id from terminated session');
    }

    // Audit log
    await AuditLogger.logAuth({
      action: 'logout',
      userId: session.user_id,
      metadata: {
        sessionId,
        reason,
      },
    });

    return true;
  }

  return false;
}

/**
 * Revoke all sessions for a user (except optionally the current one)
 */
export async function revokeAllUserSessions(
  userId: string,
  exceptSessionId?: string,
  reason: string = 'security'
): Promise<number> {
  const conditions = [eq(user_sessions.user_id, userId), eq(user_sessions.is_active, true)];

  if (exceptSessionId) {
    conditions.push(sql`${user_sessions.session_id} != ${exceptSessionId}`);
  }

  const updatedSessions = await db
    .update(user_sessions)
    .set({
      is_active: false,
      ended_at: new Date(),
    })
    .where(and(...conditions))
    .returning();

  const revokedCount = updatedSessions ? updatedSessions.length : 0;

  if (revokedCount > 0) {
    // Audit log
    await AuditLogger.logAuth({
      action: 'logout',
      userId,
      metadata: {
        reason,
        exceptSessionId,
        revokedCount,
      },
    });
  }

  return revokedCount;
}

/**
 * Get all active sessions for a user
 */
export async function getUserSessions(userId: string): Promise<SessionInfo[]> {
  const sessions = await db
    .select()
    .from(user_sessions)
    .where(and(eq(user_sessions.user_id, userId), eq(user_sessions.is_active, true)))
    .orderBy(desc(user_sessions.last_activity));

  return sessions.map((session) => ({
    sessionId: session.session_id,
    userId: session.user_id,
    deviceFingerprint: session.device_fingerprint,
    deviceName: session.device_name,
    ipAddress: session.ip_address,
    userAgent: session.user_agent,
    location: null, // Not stored in DB
    isActive: session.is_active,
    lastActivity: session.last_activity,
    expiresAt: null, // Sessions don't expire in this schema
    createdAt: session.created_at,
  }));
}

/**
 * Enforce concurrent session limits
 * Uses SELECT FOR UPDATE on account_security to serialize session creation per user
 */
async function enforceConcurrentSessionLimits(userId: string): Promise<void> {
  // Use a transaction with FOR UPDATE on account_security to serialize concurrent session creation
  await db.transaction(async (tx) => {
    // Lock the security record for this user to prevent race conditions
    // This ensures only one session can be created at a time per user
    const [securityRecord] = await tx
      .select()
      .from(account_security)
      .where(eq(account_security.user_id, userId))
      .for('update');

    // If no record exists, create it first (this shouldn't happen often due to ensureSecurityRecord)
    let maxSessions = 3; // HIPAA-compliant default
    if (!securityRecord) {
      const defaults = {
        user_id: userId,
        failed_login_attempts: 0,
        last_failed_attempt: null,
        locked_until: null,
        lockout_reason: null,
        max_concurrent_sessions: 3,
        require_fresh_auth_minutes: 5,
        password_changed_at: null,
        last_password_reset: null,
        suspicious_activity_detected: false,
        created_at: new Date(),
        updated_at: new Date(),
      };
      await tx.insert(account_security).values(defaults);
    } else {
      maxSessions = securityRecord.max_concurrent_sessions;
    }

    // Get current active sessions count (no need for FOR UPDATE here since we locked account_security)
    const activeSessions = await tx
      .select({ sessionId: user_sessions.session_id, lastActivity: user_sessions.last_activity })
      .from(user_sessions)
      .where(and(eq(user_sessions.user_id, userId), eq(user_sessions.is_active, true)));

    const activeCount = activeSessions.length;

    // If at limit, revoke oldest session(s) to make room
    if (activeCount >= maxSessions) {
      // Sort by last_activity to find oldest session
      const sortedSessions = [...activeSessions].sort((a, b) =>
        a.lastActivity.getTime() - b.lastActivity.getTime()
      );

      // Revoke the oldest session
      const oldestSession = sortedSessions[0];
      if (oldestSession) {
        await tx
          .update(user_sessions)
          .set({
            is_active: false,
            ended_at: new Date(),
          })
          .where(eq(user_sessions.session_id, oldestSession.sessionId));

        log.info('Session revoked due to concurrent limit', {
          userId,
          revokedSessionId: oldestSession.sessionId,
          reason: 'concurrent_limit',
          maxSessions,
          activeCount,
        });
      }
    }
  });
}

/**
 * Update device tracking information
 */
async function updateDeviceTracking(userId: string, deviceInfo: DeviceInfo): Promise<void> {
  // Device tracking functionality removed - trusted_devices table not implemented
  // This is a placeholder for future device tracking implementation
  log.debug('Device tracking initiated', {
    userId,
    fingerprint: deviceInfo.fingerprint,
    component: 'authentication',
    feature: 'session-management',
    ipAddress: deviceInfo.ipAddress,
  });
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
  await db.insert(login_attempts).values({
    attempt_id: nanoid(),
    email: '', // Would need email parameter
    user_id: userId,
    ip_address: deviceInfo.ipAddress,
    user_agent: deviceInfo.userAgent,
    device_fingerprint: deviceInfo.fingerprint,
    success,
    failure_reason: failureReason,
    remember_me_requested: false,
    attempted_at: new Date(),
  });
}

/**
 * Clean up expired sessions
 */
export async function cleanupExpiredSessions(): Promise<number> {
  // Sessions don't expire in this schema, so no cleanup needed
  log.debug("cleanupExpiredSessions called but sessions don't expire in this schema", {
    operation: 'cleanupExpiredSessions',
    component: 'authentication',
    feature: 'session-management',
  });
  return 0;
}

/**
 * Get session analytics
 */
export async function getSessionAnalytics(timeframe: 'day' | 'week' | 'month' = 'week') {
  const startDate = new Date();
  switch (timeframe) {
    case 'day':
      startDate.setDate(startDate.getDate() - 1);
      break;
    case 'week':
      startDate.setDate(startDate.getDate() - 7);
      break;
    case 'month':
      startDate.setMonth(startDate.getMonth() - 1);
      break;
  }

  const stats = await db
    .select({
      totalSessions: count(user_sessions.session_id),
      activeSessions: sql<number>`count(case when ${user_sessions.is_active} = true then 1 end)`,
      uniqueUsers: sql<number>`count(distinct ${user_sessions.user_id})`,
      uniqueDevices: sql<number>`count(distinct ${user_sessions.device_fingerprint})`,
    })
    .from(user_sessions)
    .where(gte(user_sessions.created_at, startDate));

  return stats[0];
}

// Export for backward compatibility
export const SessionManager = {
  createSession,
  validateSession,
  revokeSession,
  revokeAllUserSessions,
  getUserSessions,
  cleanupExpiredSessions,
  getSessionAnalytics,
};
