/**
 * Token Cleanup Module
 *
 * Maintenance functions for token lifecycle management.
 * Handles cleanup of expired tokens and blacklist entries.
 *
 * ARCHITECTURE:
 * - Scheduled job (cron or background worker)
 * - Idempotent operations (safe to run multiple times)
 * - Metrics logging for monitoring
 *
 * PERFORMANCE:
 * - Bulk operations with indexed queries
 * - Runs during off-peak hours
 * - Low priority database transactions
 *
 * USAGE:
 * ```typescript
 * import { cleanupExpiredTokens } from '@/lib/auth/tokens/cleanup';
 *
 * // Run as cron job
 * const stats = await cleanupExpiredTokens();
 * console.log(`Cleaned ${stats.refreshTokens} tokens`);
 * ```
 *
 * @module lib/auth/tokens/cleanup
 */

import { and, eq, lte } from 'drizzle-orm';
import { db, refresh_tokens, token_blacklist } from '@/lib/db';
import { log } from '@/lib/logger';

/**
 * Cleanup statistics
 */
export interface CleanupStats {
  refreshTokens: number;
  blacklistEntries: number;
}

/**
 * Clean up expired tokens and blacklist entries
 *
 * Performs two cleanup operations:
 * 1. Marks expired refresh tokens as inactive
 * 2. Deletes expired blacklist entries
 *
 * SCHEDULING:
 * - Recommended: Daily at off-peak hours (e.g., 3 AM)
 * - Can run more frequently if needed (hourly)
 * - Idempotent: safe to run multiple times
 *
 * DATABASE IMPACT:
 * - Uses indexed queries (expires_at columns)
 * - Bulk operations for efficiency
 * - Low priority transactions (no locks)
 *
 * METRICS:
 * - Logs cleanup statistics for monitoring
 * - Track trends to detect anomalies
 * - Alert if cleanup volume spikes (possible attack)
 *
 * @returns Cleanup statistics
 *
 * @example
 * // Cron job: 0 3 * * * (daily at 3 AM)
 * const stats = await cleanupExpiredTokens();
 * console.log(`Cleaned ${stats.refreshTokens} refresh tokens`);
 * console.log(`Cleaned ${stats.blacklistEntries} blacklist entries`);
 */
export async function cleanupExpiredTokens(): Promise<CleanupStats> {
  const now = new Date();
  const startTime = Date.now();

  // Clean up expired refresh tokens
  // Note: Tokens are marked inactive, not deleted (audit trail)
  const expiredRefreshTokens = await db
    .update(refresh_tokens)
    .set({
      is_active: false,
      revoked_at: now,
      revoked_reason: 'expired',
    })
    .where(and(eq(refresh_tokens.is_active, true), lte(refresh_tokens.expires_at, now)));

  const refreshTokensCount = expiredRefreshTokens.length || 0;

  // Clean up expired blacklist entries
  // Note: Blacklist entries are deleted (no longer needed)
  const expiredBlacklistEntries = await db
    .delete(token_blacklist)
    .where(lte(token_blacklist.expires_at, now));

  const blacklistEntriesCount = expiredBlacklistEntries.length || 0;

  const duration = Date.now() - startTime;

  // Log cleanup metrics
  log.info('Token cleanup completed', {
    operation: 'cleanup_expired_tokens',
    refreshTokens: refreshTokensCount,
    blacklistEntries: blacklistEntriesCount,
    duration,
    component: 'auth',
  });

  return {
    refreshTokens: refreshTokensCount,
    blacklistEntries: blacklistEntriesCount,
  };
}
