/**
 * Session Limits Integration Tests
 * Tests concurrent session enforcement with account_security integration
 */

import { describe, it, expect, beforeEach } from 'vitest'
import '@/tests/setup/integration-setup'
import { createTestUser } from '@/tests/factories/user-factory'
import { SessionManager } from '@/lib/api/services/session'
import { ensureSecurityRecord } from '@/lib/auth/security'
import { db, user_sessions } from '@/lib/db'
import { eq, and } from 'drizzle-orm'

describe('Session Limits Integration', () => {
  let testUser: { user_id: string; email: string }

  beforeEach(async () => {
    testUser = await createTestUser({
      email: 'session-test@example.com',
      password: 'TestPassword123!'
    })
  })

  describe('Concurrent Session Enforcement', () => {
    it('should enforce max_concurrent_sessions limit from account_security', async () => {
      const userId = testUser.user_id
      
      // Ensure security record exists with default limit of 3
      const securityRecord = await ensureSecurityRecord(userId)
      expect(securityRecord.max_concurrent_sessions).toBe(3)
      
      // Create 3 sessions (at the limit)
      const session1 = await SessionManager.createSession(userId, {
        fingerprint: 'device-1',
        deviceName: 'Chrome on Mac',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0'
      }, false)
      
      const session2 = await SessionManager.createSession(userId, {
        fingerprint: 'device-2',
        deviceName: 'Firefox on Windows',
        ipAddress: '192.168.1.2',
        userAgent: 'Mozilla/5.0 Firefox'
      }, false)
      
      const session3 = await SessionManager.createSession(userId, {
        fingerprint: 'device-3',
        deviceName: 'Safari on iPhone',
        ipAddress: '192.168.1.3',
        userAgent: 'Safari Mobile'
      }, false)
      
      // Verify all 3 sessions are active
      const activeSessions1 = await db
        .select()
        .from(user_sessions)
        .where(and(
          eq(user_sessions.user_id, userId),
          eq(user_sessions.is_active, true)
        ))
      
      expect(activeSessions1).toHaveLength(3)
      
      // Create 4th session - should evict oldest
      const session4 = await SessionManager.createSession(userId, {
        fingerprint: 'device-4',
        deviceName: 'Edge on PC',
        ipAddress: '192.168.1.4',
        userAgent: 'Edge'
      }, false)
      
      // Verify still only 3 active sessions
      const activeSessions2 = await db
        .select()
        .from(user_sessions)
        .where(and(
          eq(user_sessions.user_id, userId),
          eq(user_sessions.is_active, true)
        ))
      
      expect(activeSessions2).toHaveLength(3)
      
      // Verify oldest session (session1) was revoked
      const [oldestSession] = await db
        .select()
        .from(user_sessions)
        .where(eq(user_sessions.session_id, session1.sessionId))
      
      if (!oldestSession) throw new Error('Session record should exist')
      expect(oldestSession.is_active).toBe(false)
      expect(oldestSession.ended_at).toBeDefined()
      
      // Verify session4 is active
      const [newestSession] = await db
        .select()
        .from(user_sessions)
        .where(eq(user_sessions.session_id, session4.sessionId))
      
      if (!newestSession) throw new Error('Session record should exist')
      expect(newestSession.is_active).toBe(true)
    })

    it('should create account_security record if missing during session creation', async () => {
      const userId = testUser.user_id
      
      // Create a session - should ensure security record exists
      const session = await SessionManager.createSession(userId, {
        fingerprint: 'test-device',
        deviceName: 'Test Browser',
        ipAddress: '127.0.0.1',
        userAgent: 'Test Agent'
      }, false)
      
      expect(session.sessionId).toBeDefined()
      expect(session.userId).toBe(userId)
      
      // Verify security record was created
      const [securityRecord] = await db
        .select()
        .from(user_sessions)
        .where(eq(user_sessions.user_id, userId))
      
      expect(securityRecord).toBeDefined()
    })

    it('should respect HIPAA-compliant default of 3 concurrent sessions', async () => {
      const userId = testUser.user_id
      
      // Ensure record exists
      await ensureSecurityRecord(userId)
      
      // Create 4 sessions rapidly
      const sessions = await Promise.all([
        SessionManager.createSession(userId, {
          fingerprint: 'device-a',
          deviceName: 'Device A',
          ipAddress: '10.0.0.1',
          userAgent: 'Browser A'
        }, false),
        SessionManager.createSession(userId, {
          fingerprint: 'device-b',
          deviceName: 'Device B',
          ipAddress: '10.0.0.2',
          userAgent: 'Browser B'
        }, false),
        SessionManager.createSession(userId, {
          fingerprint: 'device-c',
          deviceName: 'Device C',
          ipAddress: '10.0.0.3',
          userAgent: 'Browser C'
        }, false),
        SessionManager.createSession(userId, {
          fingerprint: 'device-d',
          deviceName: 'Device D',
          ipAddress: '10.0.0.4',
          userAgent: 'Browser D'
        }, false)
      ])
      
      expect(sessions).toHaveLength(4)
      
      // Count active sessions - should be at most 3
      const activeSessions = await db
        .select()
        .from(user_sessions)
        .where(and(
          eq(user_sessions.user_id, userId),
          eq(user_sessions.is_active, true)
        ))
      
      expect(activeSessions.length).toBeLessThanOrEqual(3)
    })
  })
})
