import { TokenManager } from './token-manager'
import { AuditLogger } from '@/lib/api/services/audit'

/**
 * Token Cleanup Service
 * Automated cleanup of expired tokens and blacklist entries
 */
export class TokenCleanupService {
  /**
   * Run complete cleanup process
   */
  static async runCleanup(): Promise<void> {
    try {
      console.log('Starting token cleanup process...')
      
      // Clean up expired tokens
      const cleanupResult = await TokenManager.cleanupExpiredTokens()
      
      // Log cleanup results
      await AuditLogger.logSystem({
        action: 'token_cleanup',
        metadata: {
          refreshTokensCleaned: cleanupResult.refreshTokens,
          blacklistEntriesCleaned: cleanupResult.blacklistEntries,
          timestamp: new Date().toISOString()
        },
        severity: 'low'
      })
      
      console.log(`Token cleanup completed: ${cleanupResult.refreshTokens} refresh tokens, ${cleanupResult.blacklistEntries} blacklist entries`)
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
  
  /**
   * Schedule automatic cleanup (call this on app startup)
   */
  static scheduleCleanup(): void {
    // Run cleanup every 6 hours
    const cleanupInterval = 6 * 60 * 60 * 1000 // 6 hours
    
    setInterval(() => {
      this.runCleanup()
    }, cleanupInterval)
    
    console.log('Token cleanup scheduled to run every 6 hours')
  }
}
