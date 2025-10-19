/**
 * WebAuthn Challenge Manager
 * Manages challenge lifecycle: creation, validation, one-time use, cleanup
 *
 * Security Features:
 * - One-time use enforcement (replay attack prevention)
 * - 5-minute expiration
 * - User binding validation
 * - Challenge type validation (registration vs authentication)
 */

import { eq, lt } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db, webauthn_challenges } from '@/lib/db';
import { log } from '@/lib/logger';
import type { WebAuthnChallenge } from '@/lib/types/webauthn';
import { CHALLENGE_EXPIRATION_MS } from './constants';

/**
 * Create a new WebAuthn challenge
 * Stores challenge in database with expiration and metadata
 *
 * @param userId - User ID for challenge binding
 * @param challengeType - 'registration' or 'authentication'
 * @param challenge - Base64URL encoded challenge from SimpleWebAuthn
 * @param ipAddress - Client IP address for audit
 * @param userAgent - Client user agent for audit
 * @returns Challenge ID for client to reference
 */
export async function createChallenge(
  userId: string,
  challengeType: 'registration' | 'authentication',
  challenge: string,
  ipAddress: string,
  userAgent: string | null
): Promise<string> {
  const challengeId = nanoid(32);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CHALLENGE_EXPIRATION_MS);

  await db.insert(webauthn_challenges).values({
    challenge_id: challengeId,
    user_id: userId,
    challenge,
    challenge_type: challengeType,
    ip_address: ipAddress,
    user_agent: userAgent,
    expires_at: expiresAt,
  });

  log.debug('webauthn challenge created', {
    operation: 'create_challenge',
    challengeId: challengeId.substring(0, 8),
    userId,
    challengeType,
    expiresAt: expiresAt.toISOString(),
    component: 'auth',
  });

  return challengeId;
}

/**
 * Retrieve and validate challenge
 * Validates: exists, not expired, correct user, correct type, not used
 *
 * Security: This function does NOT mark the challenge as used
 * Call markChallengeUsed() separately BEFORE verification to prevent replay attacks
 *
 * @param challengeId - Challenge ID to validate
 * @param userId - Expected user ID
 * @param expectedType - Expected challenge type
 * @returns Validated challenge record
 * @throws Error if validation fails
 */
export async function validateChallenge(
  challengeId: string,
  userId: string,
  expectedType: 'registration' | 'authentication'
): Promise<WebAuthnChallenge> {
  const [challenge] = await db
    .select()
    .from(webauthn_challenges)
    .where(eq(webauthn_challenges.challenge_id, challengeId))
    .limit(1);

  if (!challenge) {
    log.warn('challenge validation failed - not found', {
      operation: 'validate_challenge',
      challengeId: challengeId.substring(0, 8),
      userId,
      reason: 'not_found',
      component: 'auth',
    });
    throw new Error('Challenge not found or expired');
  }

  if (challenge.user_id !== userId) {
    log.security('challenge_user_mismatch', 'high', {
      challengeId: challengeId.substring(0, 8),
      expectedUserId: userId,
      actualUserId: challenge.user_id,
      blocked: true,
      threat: 'challenge_hijacking_attempt',
    });
    throw new Error('Challenge does not belong to this user');
  }

  if (challenge.challenge_type !== expectedType) {
    log.warn('challenge validation failed - wrong type', {
      operation: 'validate_challenge',
      challengeId: challengeId.substring(0, 8),
      userId,
      expectedType,
      actualType: challenge.challenge_type,
      reason: 'type_mismatch',
      component: 'auth',
    });
    throw new Error(
      `Invalid challenge type. Expected ${expectedType}, got ${challenge.challenge_type}`
    );
  }

  if (challenge.used_at) {
    log.security('challenge_reuse_attempt', 'high', {
      challengeId: challengeId.substring(0, 8),
      userId,
      challengeType: challenge.challenge_type,
      usedAt: challenge.used_at.toISOString(),
      blocked: true,
      threat: 'replay_attack',
    });
    throw new Error('Challenge has already been used');
  }

  const now = new Date();
  if (now > challenge.expires_at) {
    log.warn('challenge validation failed - expired', {
      operation: 'validate_challenge',
      challengeId: challengeId.substring(0, 8),
      userId,
      expiresAt: challenge.expires_at.toISOString(),
      reason: 'expired',
      component: 'auth',
    });
    throw new Error('Challenge has expired');
  }

  log.debug('challenge validation successful', {
    operation: 'validate_challenge',
    challengeId: challengeId.substring(0, 8),
    userId,
    challengeType: challenge.challenge_type,
    component: 'auth',
  });

  return challenge as WebAuthnChallenge;
}

/**
 * Mark challenge as used (one-time use enforcement)
 * MUST be called BEFORE credential verification to prevent replay attacks
 *
 * Security: If verification fails after marking as used, the challenge
 * cannot be retried. This is intentional and prevents timing attacks.
 *
 * @param challengeId - Challenge ID to mark as used
 */
export async function markChallengeUsed(challengeId: string): Promise<void> {
  await db
    .update(webauthn_challenges)
    .set({ used_at: new Date() })
    .where(eq(webauthn_challenges.challenge_id, challengeId));

  log.debug('challenge marked as used', {
    operation: 'mark_challenge_used',
    challengeId: challengeId.substring(0, 8),
    component: 'auth',
  });
}

/**
 * Cleanup expired challenges (maintenance function)
 * Called periodically by security maintenance service
 *
 * @returns Number of challenges deleted
 */
export async function cleanupExpiredChallenges(): Promise<number> {
  const now = new Date();
  const result = await db
    .delete(webauthn_challenges)
    .where(lt(webauthn_challenges.expires_at, now));

  const count = Array.isArray(result) ? result.length : 0;

  log.info('expired webauthn challenges cleaned up', {
    operation: 'cleanup_expired_challenges',
    count,
    component: 'auth',
  });

  return count;
}
