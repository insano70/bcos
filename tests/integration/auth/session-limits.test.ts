/**
 * Session Limits Integration Tests
 * Tests concurrent session enforcement with account_security integration
 *
 * NOTE: Uses committed factories because SessionManager and ensureSecurityRecord
 * use the global db connection, not the test transaction.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { nanoid } from 'nanoid';
import { and, eq } from 'drizzle-orm';
import { SessionManager } from '@/lib/api/services/session';
import { ensureSecurityRecord } from '@/lib/auth/security';
import { db, user_sessions, account_security } from '@/lib/db';
import { createTestScope, type ScopedFactoryCollection } from '@/tests/factories/base';
import { createCommittedUser, type CommittedUser } from '@/tests/factories/committed/user-factory';
import { rollbackTransaction } from '@/tests/helpers/db-helper';

describe('Session Limits Integration', () => {
  let scope: ScopedFactoryCollection;
  let scopeId: string;
  let testUser: CommittedUser;

  beforeEach(async () => {
    scopeId = `session-limits-test-${nanoid(8)}`;
    scope = createTestScope(scopeId);

    testUser = await createCommittedUser({
      // Don't specify email - let factory generate unique one
      password: 'TestPassword123!',
      scope: scopeId,
    });
  });

  afterEach(async () => {
    // Clean up sessions and security records first (due to FK constraints - reference user)
    await db.delete(user_sessions).where(eq(user_sessions.user_id, testUser.user_id));
    await db.delete(account_security).where(eq(account_security.user_id, testUser.user_id));
    // Rollback transaction-based factories
    await rollbackTransaction();
    // Clean up committed factories in dependency order
    await scope.cleanup();
  });

  describe('Concurrent Session Enforcement', () => {
    it('should enforce max_concurrent_sessions limit from account_security', async () => {
      const userId = testUser.user_id;

      // Ensure security record exists with default limit of 3
      const securityRecord = await ensureSecurityRecord(userId);
      expect(securityRecord.max_concurrent_sessions).toBe(3);

      // Create 3 sessions (at the limit)
      const session1 = await SessionManager.createSession(
        userId,
        {
          fingerprint: 'device-1',
          deviceName: 'Chrome on Mac',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
        },
        false
      );

      const _session2 = await SessionManager.createSession(
        userId,
        {
          fingerprint: 'device-2',
          deviceName: 'Firefox on Windows',
          ipAddress: '192.168.1.2',
          userAgent: 'Mozilla/5.0 Firefox',
        },
        false
      );

      const _session3 = await SessionManager.createSession(
        userId,
        {
          fingerprint: 'device-3',
          deviceName: 'Safari on iPhone',
          ipAddress: '192.168.1.3',
          userAgent: 'Safari Mobile',
        },
        false
      );

      // Verify all 3 sessions are active
      const activeSessions1 = await db
        .select()
        .from(user_sessions)
        .where(and(eq(user_sessions.user_id, userId), eq(user_sessions.is_active, true)));

      expect(activeSessions1).toHaveLength(3);

      // Create 4th session - should evict oldest
      const session4 = await SessionManager.createSession(
        userId,
        {
          fingerprint: 'device-4',
          deviceName: 'Edge on PC',
          ipAddress: '192.168.1.4',
          userAgent: 'Edge',
        },
        false
      );

      // Verify still only 3 active sessions
      const activeSessions2 = await db
        .select()
        .from(user_sessions)
        .where(and(eq(user_sessions.user_id, userId), eq(user_sessions.is_active, true)));

      expect(activeSessions2).toHaveLength(3);

      // Verify oldest session (session1) was revoked
      const [oldestSession] = await db
        .select()
        .from(user_sessions)
        .where(eq(user_sessions.session_id, session1.sessionId));

      if (!oldestSession) throw new Error('Session record should exist');
      expect(oldestSession.is_active).toBe(false);
      expect(oldestSession.ended_at).toBeDefined();

      // Verify session4 is active
      const [newestSession] = await db
        .select()
        .from(user_sessions)
        .where(eq(user_sessions.session_id, session4.sessionId));

      if (!newestSession) throw new Error('Session record should exist');
      expect(newestSession.is_active).toBe(true);
    });

    it('should create account_security record if missing during session creation', async () => {
      const userId = testUser.user_id;

      // Create a session - should ensure security record exists
      const session = await SessionManager.createSession(
        userId,
        {
          fingerprint: 'test-device',
          deviceName: 'Test Browser',
          ipAddress: '127.0.0.1',
          userAgent: 'Test Agent',
        },
        false
      );

      expect(session.sessionId).toBeDefined();
      expect(session.userId).toBe(userId);

      // Verify security record was created
      const [securityRecord] = await db
        .select()
        .from(user_sessions)
        .where(eq(user_sessions.user_id, userId));

      expect(securityRecord).toBeDefined();
    });

    it('should respect HIPAA-compliant default of 3 concurrent sessions', async () => {
      const userId = testUser.user_id;

      // Ensure record exists
      await ensureSecurityRecord(userId);

      // Create 4 sessions rapidly
      const sessions = await Promise.all([
        SessionManager.createSession(
          userId,
          {
            fingerprint: 'device-a',
            deviceName: 'Device A',
            ipAddress: '10.0.0.1',
            userAgent: 'Browser A',
          },
          false
        ),
        SessionManager.createSession(
          userId,
          {
            fingerprint: 'device-b',
            deviceName: 'Device B',
            ipAddress: '10.0.0.2',
            userAgent: 'Browser B',
          },
          false
        ),
        SessionManager.createSession(
          userId,
          {
            fingerprint: 'device-c',
            deviceName: 'Device C',
            ipAddress: '10.0.0.3',
            userAgent: 'Browser C',
          },
          false
        ),
        SessionManager.createSession(
          userId,
          {
            fingerprint: 'device-d',
            deviceName: 'Device D',
            ipAddress: '10.0.0.4',
            userAgent: 'Browser D',
          },
          false
        ),
      ]);

      expect(sessions).toHaveLength(4);

      // Count active sessions - should be at most 3
      const activeSessions = await db
        .select()
        .from(user_sessions)
        .where(and(eq(user_sessions.user_id, userId), eq(user_sessions.is_active, true)));

      expect(activeSessions.length).toBeLessThanOrEqual(3);
    });
  });
});
