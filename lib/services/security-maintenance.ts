/**
 * Security Maintenance Service
 * Handles cleanup of expired security-related data
 */

import { cleanupExpiredChallenges } from '@/lib/auth/webauthn';
import { log } from '@/lib/logger';

export class SecurityMaintenanceService {
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

  /**
   * Start automated cleanup processes
   */
  start(): void {
    if (this.cleanupInterval) {
      log.warn('Security maintenance already running');
      return;
    }

    log.info('Starting security maintenance service', {
      cleanupIntervalMinutes: this.CLEANUP_INTERVAL_MS / 60000,
    });

    // Run immediately on start
    this.runCleanup();

    // Schedule periodic cleanup
    this.cleanupInterval = setInterval(() => {
      this.runCleanup();
    }, this.CLEANUP_INTERVAL_MS);
  }

  /**
   * Stop automated cleanup processes
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      log.info('Security maintenance service stopped');
    }
  }

  /**
   * Run all cleanup tasks
   */
  private async runCleanup(): Promise<void> {
    const startTime = Date.now();

    try {
      log.info('Running security maintenance cleanup');

      // Cleanup expired WebAuthn challenges
      const challengesDeleted = await cleanupExpiredChallenges();

      const duration = Date.now() - startTime;
      log.info('Security maintenance cleanup completed', {
        duration,
        challengesDeleted,
      });
    } catch (error) {
      log.error('Security maintenance cleanup failed', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Manually trigger cleanup (useful for testing or manual operations)
   */
  async triggerManualCleanup(): Promise<{ challengesDeleted: number }> {
    log.info('Manual security maintenance cleanup triggered');
    const challengesDeleted = await cleanupExpiredChallenges();
    return { challengesDeleted };
  }
}

// Singleton instance
export const securityMaintenance = new SecurityMaintenanceService();
