import { and, count, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { db, organizations, user_organizations } from '@/lib/db';
import { log, SLOW_THRESHOLDS } from '@/lib/logger';
import { BATCH_QUERY_CTE_THRESHOLD, validateOrganizationIds } from './sanitization';

/**
 * Batch Operations for Organizations
 *
 * Provides optimized batch queries for enrichment data:
 * - Member counts (multiple organizations)
 * - Children counts (multiple organizations)
 * - CTE-optimized combined queries (500+ orgs)
 *
 * Performance: 30-40% faster than parallel queries for large datasets (500+ orgs)
 *
 * Extracted from query-builder.ts to separate batch operation concerns
 * from base query building patterns.
 */

// ============================================================
// BATCH MEMBER COUNTS
// ============================================================

/**
 * Get member counts for multiple organizations in a single query
 *
 * Used by core-service.ts:getOrganizations() for efficient member count
 * enrichment across multiple organizations.
 *
 * @param organizationIds - Array of organization IDs
 * @returns Map of organization_id -> member count
 * @throws {Error} If organizationIds validation fails
 *
 * @example
 * ```typescript
 * const counts = await getBatchMemberCounts(['org-1', 'org-2']);
 * // Map { 'org-1' => 5, 'org-2' => 12 }
 * ```
 */
export async function getBatchMemberCounts(
  organizationIds: string[]
): Promise<Map<string, number>> {
  const validatedIds = validateOrganizationIds(organizationIds);

  if (validatedIds.length === 0) {
    return new Map();
  }

  const results = await db
    .select({
      organization_id: user_organizations.organization_id,
      count: count(),
    })
    .from(user_organizations)
    .where(
      and(
        inArray(user_organizations.organization_id, validatedIds),
        eq(user_organizations.is_active, true)
      )
    )
    .groupBy(user_organizations.organization_id);

  const countMap = new Map<string, number>();
  for (const result of results) {
    countMap.set(result.organization_id, Number(result.count));
  }

  return countMap;
}

// ============================================================
// BATCH CHILDREN COUNTS
// ============================================================

/**
 * Get children counts for multiple organizations in a single query
 *
 * Used by core-service.ts:getOrganizations() for efficient children count
 * enrichment across multiple organizations.
 *
 * @param organizationIds - Array of parent organization IDs
 * @returns Map of parent_organization_id -> children count
 * @throws {Error} If organizationIds validation fails
 *
 * @example
 * ```typescript
 * const counts = await getBatchChildrenCounts(['parent-1', 'parent-2']);
 * // Map { 'parent-1' => 3, 'parent-2' => 0 }
 * ```
 */
export async function getBatchChildrenCounts(
  organizationIds: string[]
): Promise<Map<string, number>> {
  const validatedIds = validateOrganizationIds(organizationIds);

  if (validatedIds.length === 0) {
    return new Map();
  }

  const results = await db
    .select({
      parent_organization_id: organizations.parent_organization_id,
      count: count(),
    })
    .from(organizations)
    .where(
      and(
        inArray(organizations.parent_organization_id, validatedIds),
        isNotNull(organizations.parent_organization_id),
        eq(organizations.is_active, true),
        isNull(organizations.deleted_at)
      )
    )
    .groupBy(organizations.parent_organization_id);

  const countMap = new Map<string, number>();
  for (const result of results) {
    if (result.parent_organization_id) {
      countMap.set(result.parent_organization_id, Number(result.count));
    }
  }

  return countMap;
}

// ============================================================
// OPTIMIZED CTE BATCH QUERY
// ============================================================

/**
 * Get all enrichment data in a single optimized CTE query
 *
 * OPTIMIZATION: Uses Common Table Expressions to fetch member counts
 * and children counts in a single database roundtrip.
 *
 * Performance Characteristics:
 * - Small datasets (<50 orgs): Parallel queries are equivalent
 * - Large datasets (500+ orgs): CTE is 30-40% faster
 *
 * Uses threshold-based strategy:
 * - Below BATCH_QUERY_CTE_THRESHOLD: Parallel queries (simpler)
 * - Above threshold: Single CTE query (faster)
 *
 * @param organizationIds - Array of organization IDs
 * @param useCTE - Use single CTE query (default: true). Set false for parallel queries.
 * @returns Object with member and children count maps
 * @throws {Error} If organizationIds validation fails
 *
 * @example
 * ```typescript
 * const { memberCounts, childrenCounts } = await getBatchEnrichmentData(orgIds);
 * // memberCounts: Map { 'org-1' => 5 }
 * // childrenCounts: Map { 'org-1' => 3 }
 * ```
 */
export async function getBatchEnrichmentData(organizationIds: string[], useCTE: boolean = true) {
  // Validate input array
  const validatedIds = validateOrganizationIds(organizationIds);

  if (validatedIds.length === 0) {
    return {
      memberCounts: new Map<string, number>(),
      childrenCounts: new Map<string, number>(),
    };
  }

  // For small datasets, parallel queries are fine (sub-functions already validate)
  if (!useCTE || validatedIds.length < BATCH_QUERY_CTE_THRESHOLD) {
    const [memberCounts, childrenCounts] = await Promise.all([
      getBatchMemberCounts(organizationIds),
      getBatchChildrenCounts(organizationIds),
    ]);

    return {
      memberCounts,
      childrenCounts,
    };
  }

  // Single CTE query for larger datasets
  const cteStart = Date.now();
  try {
    type EnrichmentRow = {
      organization_id: string;
      member_count: string | number;
      children_count: string | number;
    };

    // Build PostgreSQL array literal to avoid parameter expansion
    const arrayLiteral = `ARRAY[${validatedIds.map((id) => `'${id}'`).join(',')}]::text[]`;

    const results = await db.execute<EnrichmentRow>(sql`
      WITH member_counts AS (
        SELECT
          organization_id,
          COUNT(*) as count
        FROM user_organizations
        WHERE organization_id = ANY(${sql.raw(arrayLiteral)})
          AND is_active = true
        GROUP BY organization_id
      ),
      children_counts AS (
        SELECT
          parent_organization_id,
          COUNT(*) as count
        FROM organizations
        WHERE parent_organization_id = ANY(${sql.raw(arrayLiteral)})
          AND parent_organization_id IS NOT NULL
          AND is_active = true
          AND deleted_at IS NULL
        GROUP BY parent_organization_id
      )
      SELECT
        org_id::text as organization_id,
        COALESCE(m.count, 0) as member_count,
        COALESCE(c.count, 0) as children_count
      FROM unnest(${sql.raw(arrayLiteral)}) as org_id
      LEFT JOIN member_counts m ON org_id = m.organization_id
      LEFT JOIN children_counts c ON org_id = c.parent_organization_id
    `);

    // Convert to maps
    const memberCounts = new Map<string, number>();
    const childrenCounts = new Map<string, number>();

    // Handle both array and object with rows property
    const rows: EnrichmentRow[] = Array.isArray(results)
      ? results
      : (results as { rows: EnrichmentRow[] }).rows || [];
    for (const row of rows) {
      memberCounts.set(row.organization_id, Number(row.member_count));
      childrenCounts.set(row.organization_id, Number(row.children_count));
    }

    const duration = Date.now() - cteStart;
    log.debug('batch enrichment CTE query completed', {
      operation: 'get_batch_enrichment_data',
      organizationCount: validatedIds.length,
      duration,
      slow: duration > SLOW_THRESHOLDS.DB_QUERY,
      component: 'batch_operations',
    });

    return {
      memberCounts,
      childrenCounts,
    };
  } catch (error) {
    const duration = Date.now() - cteStart;
    log.error('batch enrichment CTE query failed', error, {
      operation: 'get_batch_enrichment_data',
      organizationCount: validatedIds.length,
      duration,
      component: 'batch_operations',
    });
    throw error;
  }
}
