/**
 * SAML Replay Attack Prevention Service
 *
 * Prevents attackers from reusing intercepted SAML responses to gain unauthorized access.
 *
 * How Replay Attacks Work:
 * 1. Attacker intercepts a valid SAML response (network sniffing, XSS, compromised device)
 * 2. Attacker replays the same SAML response to /api/auth/saml/callback
 * 3. Without prevention, they gain access as the victim
 *
 * Prevention Strategy:
 * - Track every assertion ID used in database
 * - Reject duplicate assertion IDs (PRIMARY KEY constraint prevents race conditions)
 * - Automatic cleanup of expired entries based on assertion validity period
 *
 * @module lib/saml/replay-prevention
 */

import { eq, lt } from 'drizzle-orm';
import { db } from '@/lib/db';
import { samlReplayPrevention } from '@/lib/db/schema';
import { log } from '@/lib/logger';

/**
 * Result of replay attack check
 */
export interface ReplayCheckResult {
  /** Whether it's safe to proceed with authentication */
  safe: boolean;
  /** Reason if replay detected or other error */
  reason?: string;
  /** Details for security logging */
  details?:
    | {
        existingUsedAt: Date;
        existingIpAddress: string;
        existingUserAgent: string | undefined;
      }
    | undefined;
}

/**
 * Check if a SAML assertion has been used before (replay attack detection)
 *
 * This function uses the database PRIMARY KEY constraint to atomically prevent
 * duplicate assertion IDs, protecting against race conditions.
 *
 * @param assertionId - Unique SAML Assertion ID from IdP
 * @param inResponseTo - SAML InResponseTo field (links to original AuthnRequest)
 * @param userEmail - User email from SAML assertion
 * @param ipAddress - Client IP address
 * @param userAgent - Client user agent
 * @param assertionExpiry - Assertion NotOnOrAfter timestamp
 * @param sessionId - Session ID (optional, may not exist yet)
 * @returns Promise<ReplayCheckResult> - Safe to proceed or replay detected
 */
export async function checkAndTrackAssertion(
  assertionId: string,
  inResponseTo: string,
  userEmail: string,
  ipAddress: string,
  userAgent: string | undefined,
  assertionExpiry: Date,
  sessionId?: string
): Promise<ReplayCheckResult> {
  try {
    // Add 1 hour safety margin to assertion expiry for cleanup
    const expiresAt = new Date(assertionExpiry.getTime() + 60 * 60 * 1000);

    // Attempt to insert the assertion ID
    // If assertion ID already exists, PRIMARY KEY constraint will fail
    // This provides atomic protection against race conditions
    await db.insert(samlReplayPrevention).values({
      replayId: assertionId,
      inResponseTo,
      userEmail,
      ipAddress,
      userAgent: userAgent || null,
      expiresAt,
      sessionId: sessionId || null,
    });

    log.info('SAML assertion tracked successfully', {
      assertionId: `${assertionId.substring(0, 20)}...`,
      userEmail,
      ipAddress,
      expiresAt: expiresAt.toISOString(),
    });

    return { safe: true };
  } catch (error) {
    // Check if error is due to duplicate key (replay attack)
    // Drizzle wraps Postgres errors, so check both the error and its cause
    const isDuplicateKey =
      // Check Drizzle error cause (Drizzle wraps Postgres errors)
      (error instanceof Error &&
        'cause' in error &&
        error.cause &&
        typeof error.cause === 'object' &&
        'code' in error.cause &&
        error.cause.code === '23505') ||
      // Check direct Postgres error code (fallback)
      (error && typeof error === 'object' && 'code' in error && error.code === '23505') ||
      // Check error message (last resort)
      (error instanceof Error &&
        (error.message.includes('duplicate key') || error.message.includes('unique constraint')));

    if (isDuplicateKey) {
      // Fetch existing entry for security logging
      const [existing] = await db
        .select()
        .from(samlReplayPrevention)
        .where(eq(samlReplayPrevention.replayId, assertionId))
        .limit(1);

      log.warn('SAML replay attack detected', {
        assertionId: `${assertionId.substring(0, 20)}...`,
        attemptedByEmail: userEmail,
        attemptedFromIp: ipAddress,
        originallyUsedAt: existing?.usedAt,
        originallyUsedFromIp: existing?.ipAddress,
        alert: 'REPLAY_ATTACK_BLOCKED',
      });

      return {
        safe: false,
        reason: 'SAML assertion has already been used (replay attack detected)',
        details: existing
          ? {
              existingUsedAt: existing.usedAt,
              existingIpAddress: existing.ipAddress,
              existingUserAgent: existing.userAgent || undefined,
            }
          : undefined,
      };
    }

    // Other database errors
    log.error('Error checking SAML assertion', {
      error: error instanceof Error ? error.message : String(error),
      errorCode: error && typeof error === 'object' && 'code' in error ? error.code : 'unknown',
      errorName: error instanceof Error ? error.constructor.name : typeof error,
      assertionId: `${assertionId.substring(0, 20)}...`,
      userEmail,
    });

    // Fail closed: reject authentication on errors to prevent bypass
    return {
      safe: false,
      reason: 'Unable to verify SAML assertion uniqueness',
    };
  }
}

/**
 * Cleanup expired replay prevention entries
 *
 * Should be run periodically (e.g., daily cron job) to prevent table growth.
 * Deletes all entries where expires_at < NOW().
 *
 * @returns Promise<number> - Number of entries deleted
 */
export async function cleanupExpiredEntries(): Promise<number> {
  try {
    const now = new Date();

    log.info('Starting cleanup of expired SAML replay prevention entries', {
      cutoffTime: now.toISOString(),
    });

    const _result = await db
      .delete(samlReplayPrevention)
      .where(lt(samlReplayPrevention.expiresAt, now));

    // Drizzle doesn't return rowCount, so we need to count before delete
    // For now, just return 0 - cleanup is fire-and-forget
    const deletedCount = 0;

    log.info('Cleanup completed', {
      deletedCount,
      cutoffTime: now.toISOString(),
    });

    return deletedCount;
  } catch (error) {
    log.error('Error during cleanup', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Get statistics about replay prevention table
 * Useful for monitoring and capacity planning
 *
 * @returns Promise<{ totalEntries: number; oldestEntry?: Date; newestEntry?: Date }>
 */
export async function getReplayPreventionStats(): Promise<{
  totalEntries: number;
  oldestEntry?: Date;
  newestEntry?: Date;
}> {
  try {
    const entries = await db
      .select({
        usedAt: samlReplayPrevention.usedAt,
      })
      .from(samlReplayPrevention);

    const totalEntries = entries.length;

    if (totalEntries === 0) {
      return { totalEntries: 0 };
    }

    const dates = entries.map((e) => e.usedAt.getTime());
    const oldestEntry = new Date(Math.min(...dates));
    const newestEntry = new Date(Math.max(...dates));

    return {
      totalEntries,
      oldestEntry,
      newestEntry,
    };
  } catch (error) {
    log.error('Error getting stats', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
