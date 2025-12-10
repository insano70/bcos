/**
 * Shared Organization Mapping Utility
 *
 * Provides consistent practice → organization mapping for all report card services.
 * Uses the organizations table as the single source of truth.
 *
 * Used by:
 * - StatisticsCollectorService (when storing statistics)
 * - ReportCardGeneratorService (when generating report cards)
 * - TrendAnalysisService (when calculating trends)
 */

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { organizations } from '@/lib/db/schema';
import { log } from '@/lib/logger';

/**
 * Get practice → organization mappings from the organizations table
 *
 * Queries active organizations and expands their practice_uids arrays
 * to build a mapping of practice_uid → organization_id.
 *
 * @param practiceUids - Optional filter to specific practices. If provided:
 *   - Only returns mappings for practices in this list
 *   - Sets null for practices in the list that have no organization
 *   If not provided, returns ALL practice mappings from active organizations.
 *
 * @returns Map of practice_uid → organization_id (null if unmapped)
 *
 * @example
 * // Get all mappings
 * const allMappings = await getPracticeOrganizationMappings();
 *
 * @example
 * // Get mappings for specific practices (with null for unmapped)
 * const mappings = await getPracticeOrganizationMappings([1, 2, 3]);
 * // Result: Map { 1 => "org-uuid", 2 => "org-uuid", 3 => null }
 */
export async function getPracticeOrganizationMappings(
  practiceUids?: number[]
): Promise<Map<number, string | null>> {
  const mappings = new Map<number, string | null>();

  try {
    const orgs = await db
      .select({
        organization_id: organizations.organization_id,
        practice_uids: organizations.practice_uids,
      })
      .from(organizations)
      .where(eq(organizations.is_active, true));

    for (const org of orgs) {
      if (org.practice_uids && Array.isArray(org.practice_uids)) {
        for (const practiceUid of org.practice_uids) {
          // If filter provided, only include matching practices
          if (!practiceUids || practiceUids.includes(practiceUid)) {
            mappings.set(practiceUid, org.organization_id);
          }
        }
      }
    }

    // If filter provided, set null for unmapped practices
    if (practiceUids) {
      let unmappedCount = 0;
      for (const uid of practiceUids) {
        if (!mappings.has(uid)) {
          mappings.set(uid, null);
          unmappedCount++;
        }
      }

      if (unmappedCount > 0) {
        log.debug('Some practices have no organization mapping', {
          operation: 'get_practice_organization_mappings',
          totalPractices: practiceUids.length,
          unmappedCount,
          component: 'report-card',
        });
      }
    }
  } catch (error) {
    log.warn('Failed to get practice-organization mappings', {
      error: error instanceof Error ? error.message : 'Unknown error',
      practiceUidsCount: practiceUids?.length ?? 'all',
      component: 'report-card',
    });
    // Return empty map on error - callers handle missing mappings gracefully
  }

  return mappings;
}

