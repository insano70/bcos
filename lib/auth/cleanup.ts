import { AuditLogger } from '@/lib/api/services/audit';
import { log } from '@/lib/logger';
import { databaseStateManager } from '@/lib/oidc/database-state-manager';
import { cleanupExpiredTokens } from './tokens';

/**
 * Token and OIDC State Cleanup Service
 * Automated cleanup of expired tokens, blacklist entries, and OIDC states
 */
export async function runTokenCleanup(): Promise<void> {
  try {
    log.info('Starting token and OIDC state cleanup process', {
      operation: 'securityCleanup',
      scheduled: true,
    });

    // Clean up expired refresh tokens and blacklist entries
    const tokenCleanupResult = await cleanupExpiredTokens();

    // Clean up expired OIDC states
    const oidcStatesCleaned = await databaseStateManager.cleanupExpired();

    await AuditLogger.logSystem({
      action: 'security_cleanup',
      metadata: {
        refreshTokensCleaned: tokenCleanupResult.refreshTokens,
        blacklistEntriesCleaned: tokenCleanupResult.blacklistEntries,
        oidcStatesCleaned,
        timestamp: new Date().toISOString(),
      },
      severity: 'low',
    });

    log.info('Token and OIDC state cleanup completed', {
      refreshTokensRemoved: tokenCleanupResult.refreshTokens,
      blacklistEntriesRemoved: tokenCleanupResult.blacklistEntries,
      oidcStatesRemoved: oidcStatesCleaned,
      operation: 'securityCleanup',
    });
  } catch (error) {
    log.error(
      'Security cleanup failed',
      error instanceof Error ? error : new Error(String(error)),
      {
        operation: 'securityCleanup',
      }
    );

    await AuditLogger.logSystem({
      action: 'security_cleanup_failed',
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
