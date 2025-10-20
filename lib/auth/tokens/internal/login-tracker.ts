/**
 * Login Attempt Tracker (Internal)
 *
 * Logs successful and failed login attempts for audit trail.
 * This is an internal helper module, not part of the public API.
 *
 * SECURITY:
 * - Permanent audit trail of all login attempts
 * - Enables security analytics (brute force detection, anomaly patterns)
 * - Links login attempts to created sessions
 *
 * COMPLIANCE:
 * - HIPAA audit requirements
 * - SOC 2 authentication logging
 * - Incident response forensics
 *
 * @module lib/auth/tokens/internal/login-tracker
 * @internal
 */

import { nanoid } from 'nanoid';
import { db, login_attempts } from '@/lib/db';
import type { DeviceInfo } from '../types';

/**
 * Login attempt data
 */
interface LoginAttemptData {
  email: string;
  userId: string;
  deviceInfo: DeviceInfo;
  success: boolean;
  failureReason?: string;
  rememberMe: boolean;
  sessionId?: string;
}

/**
 * Log login attempt to database
 *
 * Creates permanent audit record of authentication attempt.
 * Called by token creation module on successful login.
 *
 * DATA RETENTION:
 * - Login attempts stored indefinitely
 * - Indexed by email, IP, timestamp for security analytics
 * - Failed attempts enable brute force detection
 *
 * @param data - Login attempt data
 *
 * @example
 * await logLoginAttempt({
 *   email: 'user@example.com',
 *   userId: 'user-123',
 *   deviceInfo: { ipAddress, userAgent, fingerprint, deviceName },
 *   success: true,
 *   rememberMe: false,
 *   sessionId: 'session-abc'
 * });
 */
export async function logLoginAttempt(data: LoginAttemptData): Promise<void> {
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
    session_id: data.sessionId,
  });
}
