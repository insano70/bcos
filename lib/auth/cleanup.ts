import { TokenManager } from './token-manager'
import { AuditLogger } from '@/lib/api/services/audit'

/**
 * Token Cleanup Service
 * Automated cleanup of expired tokens and blacklist entries
 */
export async function runTokenCleanup(): Promise<void> {
  try {
    console.log('Starting token cleanup process...')

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

    console.log(
      `Token cleanup completed: ${cleanupResult.refreshTokens} refresh tokens, ${cleanupResult.blacklistEntries} blacklist entries`
    )
  } catch (error) {
    console.error('Token cleanup failed:', error)

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
  console.log('Token cleanup scheduled to run every 6 hours')
}
