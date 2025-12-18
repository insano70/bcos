/**
 * Organization Hierarchy Cache Warming Job
 * Proactively refreshes the organization hierarchy cache
 *
 * Schedule: Every 4 hours (or when stale cache detected)
 * Purpose: Ensure organization hierarchy data is always available in cache
 *          for fast RBAC lookups without cold cache penalties
 *
 * Usage:
 * - Automatically triggered via cron endpoint
 * - Can be called manually for maintenance
 * - Background refresh when stale cache detected
 */

import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { organizations } from '@/lib/db/schema';
import { rbacCache } from '@/lib/cache/rbac-cache';
import { log, SLOW_THRESHOLDS } from '@/lib/logger';
import type { Organization } from '@/lib/types/rbac';

/**
 * Cron schedule for cache warming
 * Every 4 hours: 0 *​/4 * * *
 */
export const HIERARCHY_CACHE_WARMING_SCHEDULE = '0 */4 * * *';

/**
 * Load all active organizations from the database
 *
 * @returns Array of all active organizations
 */
async function loadAllOrganizations(): Promise<Organization[]> {
  const orgs = await db
    .select({
      organization_id: organizations.organization_id,
      name: organizations.name,
      slug: organizations.slug,
      parent_organization_id: organizations.parent_organization_id,
      practice_uids: organizations.practice_uids, // Critical for analytics security
      is_active: organizations.is_active,
      created_at: organizations.created_at,
      updated_at: organizations.updated_at,
      deleted_at: organizations.deleted_at,
    })
    .from(organizations)
    .where(
      and(
        eq(organizations.is_active, true),
        isNull(organizations.deleted_at)
      )
    );

  return orgs.map((org) => ({
    organization_id: org.organization_id,
    name: org.name,
    slug: org.slug,
    parent_organization_id: org.parent_organization_id || undefined,
    practice_uids: org.practice_uids || undefined, // Analytics security - practice_uid filtering
    is_active: org.is_active ?? true,
    created_at: org.created_at ?? new Date(),
    updated_at: org.updated_at ?? new Date(),
    deleted_at: org.deleted_at || undefined,
  }));
}

/**
 * Run organization hierarchy cache warming
 * Loads all organizations from database and caches them
 *
 * @returns Object with organizationCount and success status
 */
export async function runHierarchyCacheWarming(): Promise<{
  organizationCount: number;
  success: boolean;
  cached: boolean;
}> {
  const startTime = Date.now();

  try {
    // Load all organizations from database
    const allOrganizations = await loadAllOrganizations();
    const loadDuration = Date.now() - startTime;

    // Cache the organizations
    const cached = await rbacCache.setOrganizationHierarchy(allOrganizations);

    const totalDuration = Date.now() - startTime;

    log.info('hierarchy cache warming completed', {
      operation: 'hierarchy_cache_warming',
      organizationCount: allOrganizations.length,
      loadDuration,
      cacheDuration: totalDuration - loadDuration,
      totalDuration,
      cached,
      slow: totalDuration > SLOW_THRESHOLDS.DB_QUERY * 5,
      component: 'jobs',
    });

    return {
      organizationCount: allOrganizations.length,
      success: true,
      cached,
    };
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('hierarchy cache warming failed', error, {
      operation: 'hierarchy_cache_warming',
      duration,
      component: 'jobs',
    });

    // Don't throw - log error and return failure status
    // This prevents the job from failing completely
    return {
      organizationCount: 0,
      success: false,
      cached: false,
    };
  }
}

/**
 * Check if hierarchy cache needs warming (is stale or missing)
 *
 * @returns True if cache needs warming
 */
export async function isHierarchyCacheStale(): Promise<boolean> {
  try {
    const cached = await rbacCache.getOrganizationHierarchy();
    return cached === null; // If null, cache is cold and needs warming
  } catch {
    return true; // On error, assume stale
  }
}
