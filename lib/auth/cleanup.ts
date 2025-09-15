import { TokenManager } from './token-manager'
import { logger } from '@/lib/logger'
import { AuditLogger } from '@/lib/api/services/audit'

/**
 * Token Cleanup Service
 * Automated cleanup of expired tokens and blacklist entries
 */
export async function runTokenCleanup(): Promise<void> {
  try {
    logger.info('Starting token cleanup process', {
      operation: 'tokenCleanup',
      scheduled: true
    })

    const cleanupResult = await TokenManager.cleanupExpiredTokens()

    await AuditLogger.logSystem({
      action: 'token_cleanup',
      metadata: {
        refreshTokensCleaned: cleanupResult.refreshTokens,
        blacklistEntriesCleaned: cleanupResult.blacklistEntries,
        timestamp: new Date().toISOString()
      },
      severity: 'low'
    })

    logger.info('Token cleanup completed', {
      refreshTokensRemoved: cleanupResult.refreshTokens,
      blacklistEntriesRemoved: cleanupResult.blacklistEntries,
      operation: 'tokenCleanup'
    })
  } catch (error) {
    logger.error('Token cleanup failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      operation: 'tokenCleanup'
    })

    await AuditLogger.logSystem({
      action: 'token_cleanup_failed',
      metadata: {
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      severity: 'medium'
    })
  }
}

export function scheduleTokenCleanup(): void {
  const cleanupInterval = 6 * 60 * 60 * 1000 // 6 hours
  setInterval(() => {
    void runTokenCleanup()
  }, cleanupInterval)
  logger.info('Token cleanup scheduled', {
    interval: '6 hours',
    operation: 'tokenCleanup',
    scheduled: true
  })
}
