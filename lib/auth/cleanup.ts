import { AuditLogger } from '@/lib/api/services/audit';
import { log } from '@/lib/logger';
import { TokenManager } from './token-manager';

/**
 * Token Cleanup Service
 * Automated cleanup of expired tokens and blacklist entries
 */
export async function runTokenCleanup(): Promise<void> {
  try {
    log.info('Starting token cleanup process', {
      operation: 'tokenCleanup',
      scheduled: true,
    });

    const cleanupResult = await TokenManager.cleanupExpiredTokens();

    await AuditLogger.logSystem({
      action: 'token_cleanup',
      metadata: {
        refreshTokensCleaned: cleanupResult.refreshTokens,
        blacklistEntriesCleaned: cleanupResult.blacklistEntries,
        timestamp: new Date().toISOString(),
      },
      severity: 'low',
    });

    log.info('Token cleanup completed', {
      refreshTokensRemoved: cleanupResult.refreshTokens,
      blacklistEntriesRemoved: cleanupResult.blacklistEntries,
      operation: 'tokenCleanup',
    });
  } catch (error) {
    log.error('Token cleanup failed', error instanceof Error ? error : new Error(String(error)), {
      operation: 'tokenCleanup',
    });

    await AuditLogger.logSystem({
      action: 'token_cleanup_failed',
      metadata: {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      severity: 'medium',
    });
  }
}

export function scheduleTokenCleanup(): void {
  const cleanupInterval = 6 * 60 * 60 * 1000; // 6 hours
  setInterval(() => {
    void runTokenCleanup();
  }, cleanupInterval);
  log.info('Token cleanup scheduled', {
    interval: '6 hours',
    operation: 'tokenCleanup',
    scheduled: true,
  });
}
