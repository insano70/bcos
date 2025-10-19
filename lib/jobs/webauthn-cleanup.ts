/**
 * WebAuthn Challenge Cleanup Job
 * Automated task to remove expired WebAuthn challenges from database
 *
 * Schedule: Every 15 minutes
 * Purpose: Prevent database bloat and maintain query performance
 *
 * Usage:
 * - Add to your cron scheduler (Vercel Cron, node-cron, etc.)
 * - Can also be called manually for maintenance
 */

import { cleanupExpiredChallenges } from '@/lib/auth/webauthn/challenge-manager';
import { log, SLOW_THRESHOLDS } from '@/lib/logger';

// Export constant for use in vercel.json or cron configuration
export { CLEANUP_SCHEDULE } from '@/lib/auth/webauthn/constants';

/**
 * Run WebAuthn challenge cleanup
 * Removes all expired challenges from the database
 *
 * @returns Number of challenges removed
 */
export async function runWebAuthnCleanup(): Promise<number> {
  const startTime = Date.now();

  try {
    const count = await cleanupExpiredChallenges();

    const duration = Date.now() - startTime;

    log.info('webauthn cleanup job completed', {
      operation: 'webauthn_cleanup_job',
      challengesRemoved: count,
      duration,
      slow: duration > SLOW_THRESHOLDS.DB_QUERY * 10, // 10x normal DB query time
      component: 'jobs',
    });

    return count;
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('webauthn cleanup job failed', error, {
      operation: 'webauthn_cleanup_job',
      duration,
      component: 'jobs',
    });

    // Don't throw - log error and return 0
    // This prevents the job from failing completely
    return 0;
  }
}

/**
 * Schedule configuration (for reference)
 *
 * See CLEANUP_SCHEDULE constant in lib/auth/webauthn/constants.ts
 * Current schedule: Every 15 minutes (0,15,30,45 * * * *)
 *
 * For Vercel Cron (vercel.json):
 * {
 *   "crons": [
 *     {
 *       "path": "/api/cron/webauthn-cleanup",
 *       "schedule": CLEANUP_SCHEDULE  // Use constant to prevent drift
 *     }
 *   ]
 * }
 *
 * For node-cron:
 * cron.schedule(CLEANUP_SCHEDULE, async () => {
 *   await runWebAuthnCleanup();
 * });
 */
