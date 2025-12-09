/**
 * Report Card Cache Service
 *
 * Handles caching for report card data:
 * - Organization report cards
 * - Peer comparison statistics
 * - Measure configurations
 *
 * KEY NAMING CONVENTION:
 *   report-card:org:{organizationId}
 *   report-card:peer:{sizeBucket}
 *   report-card:measures:active
 *   report-card:measures:all
 *
 * TTL STRATEGY:
 * - Organization report cards: 1 hour (refreshed daily via cron)
 * - Peer stats: 6 hours (aggregate data, less volatile)
 * - Measures config: 1 hour (admin-managed, rarely changes)
 */

import { log } from '@/lib/logger';
import { CacheService } from './base';
import type { ReportCard, PeerComparison, MeasureConfig, AnnualReview } from '@/lib/types/report-card';
import type { SizeBucket } from '@/lib/constants/report-card';
import { REPORT_CARD_TTL } from '@/lib/constants/cache-ttl';

/**
 * Report Card Cache Service
 *
 * Provides caching for report card data with automatic TTL management.
 */
class ReportCardCacheService extends CacheService<ReportCard> {
  protected namespace = 'report-card';
  protected defaultTTL = REPORT_CARD_TTL.DEFAULT;

  // ==========================================================================
  // Organization Report Cards
  // ==========================================================================

  /**
   * Get cached report card for an organization
   */
  async getReportCardByOrg(organizationId: string): Promise<ReportCard | null> {
    const key = this.buildKey('org', organizationId);
    return this.get<ReportCard>(key);
  }

  /**
   * Cache a report card for an organization
   */
  async setReportCardByOrg(organizationId: string, data: ReportCard): Promise<boolean> {
    const key = this.buildKey('org', organizationId);
    return this.set(key, data, { ttl: this.defaultTTL });
  }

  // ==========================================================================
  // Peer Comparison Statistics
  // ==========================================================================

  /**
   * Get cached peer comparison stats for a size bucket
   */
  async getPeerStats(sizeBucket: SizeBucket): Promise<PeerComparison | null> {
    const key = this.buildKey('peer', sizeBucket);
    return this.get<PeerComparison>(key);
  }

  /**
   * Cache peer comparison stats for a size bucket
   */
  async setPeerStats(sizeBucket: SizeBucket, data: PeerComparison): Promise<boolean> {
    const key = this.buildKey('peer', sizeBucket);
    return this.set(key, data, { ttl: REPORT_CARD_TTL.PEER_STATS });
  }

  // ==========================================================================
  // Annual Review
  // ==========================================================================

  /**
   * Get cached annual review for an organization
   */
  async getAnnualReview(organizationId: string): Promise<AnnualReview | null> {
    const key = this.buildKey('annual-review', organizationId);
    return this.get<AnnualReview>(key);
  }

  /**
   * Cache annual review for an organization
   */
  async setAnnualReview(organizationId: string, data: AnnualReview): Promise<boolean> {
    const key = this.buildKey('annual-review', organizationId);
    return this.set(key, data, { ttl: REPORT_CARD_TTL.ANNUAL_REVIEW });
  }

  // ==========================================================================
  // Measure Configurations
  // ==========================================================================

  /**
   * Get cached measure configurations
   */
  async getMeasures(activeOnly: boolean = true): Promise<MeasureConfig[] | null> {
    const key = this.buildKey('measures', activeOnly ? 'active' : 'all');
    return this.get<MeasureConfig[]>(key);
  }

  /**
   * Cache measure configurations
   */
  async setMeasures(measures: MeasureConfig[], activeOnly: boolean = true): Promise<boolean> {
    const key = this.buildKey('measures', activeOnly ? 'active' : 'all');
    return this.set(key, measures, { ttl: REPORT_CARD_TTL.MEASURES });
  }

  // ==========================================================================
  // Cache Invalidation
  // ==========================================================================

  /**
   * Invalidate cache entries
   *
   * @param resourceType - Type of resource to invalidate
   * @param id - Optional ID for specific resource invalidation
   */
  async invalidate(
    resourceType: 'org' | 'peer' | 'measures' | 'annual-review' | 'all',
    id?: string
  ): Promise<void> {
    try {
      if (resourceType === 'all') {
        // Invalidate all report card caches
        // IMPORTANT: Use wildcard prefix (*) because ioredis keyPrefix is NOT
        // automatically applied to SCAN patterns. Without this, SCAN won't find keys.
        const deletedCount = await this.delPattern(`*${this.namespace}:*`);
        log.info('Report card cache invalidated', {
          type: 'all',
          deletedCount,
          component: 'report-card-cache',
        });
        return;
      }

      if (resourceType === 'org' && id !== undefined) {
        // Invalidate specific organization report card
        const key = this.buildKey('org', id);
        await this.del(key);
        log.info('Report card cache invalidated', {
          type: 'org',
          organizationId: id,
          component: 'report-card-cache',
        });
        return;
      }

      if (resourceType === 'peer' && id !== undefined) {
        // Invalidate specific peer stats
        const key = this.buildKey('peer', id);
        await this.del(key);
        log.info('Report card cache invalidated', {
          type: 'peer',
          sizeBucket: id,
          component: 'report-card-cache',
        });
        return;
      }

      if (resourceType === 'annual-review' && id !== undefined) {
        // Invalidate specific organization's annual review
        const key = this.buildKey('annual-review', id);
        await this.del(key);
        log.info('Report card cache invalidated', {
          type: 'annual-review',
          organizationId: id,
          component: 'report-card-cache',
        });
        return;
      }

      if (resourceType === 'measures') {
        // Invalidate all measure caches
        await this.del(this.buildKey('measures', 'active'));
        await this.del(this.buildKey('measures', 'all'));
        log.info('Report card cache invalidated', {
          type: 'measures',
          component: 'report-card-cache',
        });
        return;
      }

      // Invalidate all for the resource type
      // IMPORTANT: Use wildcard prefix (*) for SCAN pattern matching
      const deletedCount = await this.delPattern(`*${this.namespace}:${resourceType}:*`);
      log.info('Report card cache invalidated', {
        type: resourceType,
        deletedCount,
        component: 'report-card-cache',
      });
    } catch (error) {
      log.error('Failed to invalidate report card cache', error as Error, {
        resourceType,
        id,
        component: 'report-card-cache',
      });
    }
  }
}

// Export singleton instance
export const reportCardCache = new ReportCardCacheService();
