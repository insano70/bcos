/**
 * Database-Backed OIDC State Manager
 *
 * CRITICAL SECURITY COMPONENT
 *
 * Manages one-time use validation for OIDC state tokens using PostgreSQL.
 * Replaces in-memory state manager to support horizontal scaling across
 * multiple application instances.
 *
 * Features:
 * - One-time use enforcement via PostgreSQL row-level locking (SELECT FOR UPDATE)
 * - Atomic operations prevent race conditions across multiple servers
 * - Automatic expiration tracking (5 minutes + 30s clock skew tolerance)
 * - Works with load balancers and blue/green deployments
 * - Survives application restarts and deployments
 *
 * Security Properties:
 * - Prevents CSRF attacks (state validation)
 * - Prevents replay attacks (one-time use enforcement)
 * - Prevents race conditions (PostgreSQL row locking)
 * - Works across distributed systems
 *
 * @module lib/oidc/database-state-manager
 * @security CRITICAL - Required for OIDC security in production
 */

import { and, eq, gt, lt } from 'drizzle-orm';
import { db, oidc_states } from '@/lib/db';
import { log } from '@/lib/logger';

/**
 * Database State Manager Class
 *
 * Provides atomic state management using PostgreSQL transactions.
 * All operations use row-level locking to ensure thread-safety across
 * multiple application instances.
 */
class DatabaseStateManager {
  // State TTL: 5 minutes + 30 seconds clock skew tolerance
  private readonly STATE_TTL = 5 * 60 * 1000 + 30 * 1000;

  /**
   * Register State Token
   *
   * Creates a new state record in the database for one-time use validation.
   * Called during OIDC login initiation.
   *
   * Uses INSERT to atomically create the state record. The PRIMARY KEY
   * constraint ensures no duplicate states can be created.
   *
   * @param state - State token to register (cryptographically random)
   * @param nonce - Nonce for ID token validation
   * @param userFingerprint - Device fingerprint (optional, for session hijacking prevention)
   */
  async registerState(state: string, nonce: string, userFingerprint?: string): Promise<void> {
    if (!state || state.length === 0) {
      log.error('Attempted to register empty state token');
      throw new Error('Invalid state token');
    }

    if (!nonce || nonce.length === 0) {
      log.error('Attempted to register empty nonce');
      throw new Error('Invalid nonce');
    }

    const expiresAt = new Date(Date.now() + this.STATE_TTL);

    try {
      await db.insert(oidc_states).values({
        state,
        nonce,
        user_fingerprint: userFingerprint || null,
        is_used: false,
        expires_at: expiresAt,
      });

      log.debug('State token registered in database', {
        state: `${state.substring(0, 8)}...`,
        expiresAt: expiresAt.toISOString(),
      });
    } catch (error) {
      // Check for duplicate key violation (PostgreSQL error code 23505)
      if (error instanceof Error && 'code' in error && error.code === '23505') {
        log.error('Duplicate state token attempted', {
          state: `${state.substring(0, 8)}...`,
        });
        throw new Error('State token already exists (possible collision)');
      }

      log.error('Failed to register state token', error, {
        state: `${state.substring(0, 8)}...`,
      });
      throw error;
    }
  }

  /**
   * Validate and Mark Used
   *
   * Validates a state token and atomically marks it as used.
   * This enforces ONE-TIME USE - a state can only be validated once.
   *
   * Uses PostgreSQL transaction with SELECT FOR UPDATE to ensure atomicity
   * across multiple application instances. This prevents race conditions where
   * two servers might try to validate the same state simultaneously.
   *
   * Returns:
   * - true: State is valid and has been marked as used
   * - false: State is invalid, expired, or already used
   *
   * @param state - State token to validate
   * @returns true if valid and unused, false otherwise
   */
  async validateAndMarkUsed(state: string): Promise<boolean> {
    try {
      // Use transaction with row-level locking for atomicity
      const result = await db.transaction(async (tx) => {
        // Lock the row for update (prevents concurrent access)
        const [stateRecord] = await tx
          .select()
          .from(oidc_states)
          .where(
            and(
              eq(oidc_states.state, state),
              gt(oidc_states.expires_at, new Date()) // Not expired
            )
          )
          .for('update'); // PostgreSQL row lock

        // State not found or expired
        if (!stateRecord) {
          log.warn('State token not found or expired', {
            state: `${state.substring(0, 8)}...`,
          });
          return false;
        }

        // State already used (REPLAY ATTACK DETECTED)
        if (stateRecord.is_used) {
          log.error('State token replay attempt detected', {
            state: `${state.substring(0, 8)}...`,
            originalTimestamp: stateRecord.created_at.toISOString(),
            usedAt: stateRecord.used_at?.toISOString(),
          });
          return false;
        }

        // Mark as used (CRITICAL: Prevents replay)
        await tx
          .update(oidc_states)
          .set({
            is_used: true,
            used_at: new Date(),
          })
          .where(eq(oidc_states.state, state));

        log.info('State token validated and marked as used', {
          state: `${state.substring(0, 8)}...`,
          age: Date.now() - stateRecord.created_at.getTime(),
        });

        return true;
      });

      return result;
    } catch (error) {
      log.error('State validation transaction failed', error, {
        state: `${state.substring(0, 8)}...`,
      });
      return false;
    }
  }

  /**
   * Get Nonce for State
   *
   * Retrieves the nonce associated with a state token.
   * Used during callback to validate the ID token.
   *
   * @param state - State token
   * @returns Nonce string or null if state not found
   */
  async getNonce(state: string): Promise<string | null> {
    try {
      const [stateRecord] = await db
        .select({ nonce: oidc_states.nonce })
        .from(oidc_states)
        .where(
          and(
            eq(oidc_states.state, state),
            gt(oidc_states.expires_at, new Date()) // Not expired
          )
        )
        .limit(1);

      return stateRecord?.nonce || null;
    } catch (error) {
      log.error('Failed to retrieve nonce for state', error, {
        state: `${state.substring(0, 8)}...`,
      });
      return null;
    }
  }

  /**
   * Cleanup Expired States
   *
   * Removes expired state records from the database.
   * Should be called periodically (e.g., via cron job or scheduled task).
   *
   * Returns the number of states deleted.
   *
   * @returns Number of expired states removed
   */
  async cleanupExpired(): Promise<number> {
    try {
      const result = await db.delete(oidc_states).where(lt(oidc_states.expires_at, new Date()));

      const deleted = result.length || 0;

      if (deleted > 0) {
        log.info('Expired OIDC states cleaned up', { deleted });
      }

      return deleted;
    } catch (error) {
      log.error('Failed to cleanup expired states', error);
      return 0;
    }
  }

  /**
   * Get State Count
   *
   * Returns the number of currently tracked states (for monitoring).
   * Useful for debugging and capacity planning.
   *
   * @returns Total number of states in database
   */
  async getStateCount(): Promise<number> {
    try {
      const result = await db.select({ count: oidc_states.state }).from(oidc_states);

      return result.length;
    } catch (error) {
      log.error('Failed to get state count', error);
      return 0;
    }
  }

  /**
   * Clear All States
   *
   * Removes ALL state records from the database.
   * USE WITH CAUTION - This will invalidate all active OIDC flows.
   *
   * Only use for:
   * - Testing/development
   * - Emergency security response
   * - Database maintenance
   *
   * @returns Number of states deleted
   */
  async clearAll(): Promise<number> {
    try {
      const result = await db.delete(oidc_states);
      const deleted = result.length || 0;

      log.warn('All OIDC states cleared from database', { deleted });

      return deleted;
    } catch (error) {
      log.error('Failed to clear all states', error);
      return 0;
    }
  }
}

// Export singleton instance
export const databaseStateManager = new DatabaseStateManager();
