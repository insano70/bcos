import { and, count, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { db, organizations, practices, user_organizations } from '@/lib/db';
import type {
  PracticeInfo,
  RawOrganizationRow,
} from './types';

/**
 * Organizations Query Builder
 *
 * Provides reusable query patterns for organization data retrieval.
 * Eliminates duplication across CRUD, hierarchy, and member services.
 *
 * Key patterns:
 * - Base organization select with practice join
 * - Batch member count queries
 * - Batch children count queries
 * - Practice info mapping
 */

// ============================================================
// BASE QUERY BUILDERS
// ============================================================

/**
 * Get base organization select fields
 * Used across all organization queries for consistency
 */
export function getOrganizationBaseSelect() {
  return {
    organization_id: organizations.organization_id,
    name: organizations.name,
    slug: organizations.slug,
    parent_organization_id: organizations.parent_organization_id,
    is_active: organizations.is_active,
    created_at: organizations.created_at,
    updated_at: organizations.updated_at,
    deleted_at: organizations.deleted_at,
  };
}

/**
 * Get organization select with practice join fields
 * Includes practice mapping for healthcare organizations
 */
export function getOrganizationWithPracticeSelect() {
  return {
    ...getOrganizationBaseSelect(),
    practice_id: practices.practice_id,
    practice_domain: practices.domain,
    practice_status: practices.status,
    practice_template_id: practices.template_id,
  };
}

/**
 * Create base organization query with practice join
 * Left join ensures we get organizations without practices
 */
export function createOrganizationQueryBuilder() {
  return db
    .select(getOrganizationWithPracticeSelect())
    .from(organizations)
    .leftJoin(practices, eq(organizations.organization_id, practices.practice_id));
}

// ============================================================
// BATCH QUERIES
// ============================================================

/**
 * Get member counts for multiple organizations in a single query
 *
 * @param organizationIds - Array of organization IDs
 * @returns Map of organization_id -> member count
 */
export async function getBatchMemberCounts(
  organizationIds: string[]
): Promise<Map<string, number>> {
  if (organizationIds.length === 0) {
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
        inArray(user_organizations.organization_id, organizationIds),
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

/**
 * Get children counts for multiple organizations in a single query
 *
 * @param organizationIds - Array of parent organization IDs
 * @returns Map of parent_organization_id -> children count
 */
export async function getBatchChildrenCounts(
  organizationIds: string[]
): Promise<Map<string, number>> {
  if (organizationIds.length === 0) {
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
        inArray(organizations.parent_organization_id, organizationIds),
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

/**
 * Get all enrichment data in a single batch operation
 *
 * OPTIMIZATION: Runs both queries in parallel for best performance.
 * Future: Could be optimized further with a single CTE query,
 * but parallel queries are fast enough for current scale (<1000 orgs).
 *
 * @param organizationIds - Array of organization IDs
 * @returns Object with member and children count maps
 */
export async function getBatchEnrichmentData(organizationIds: string[]) {
  if (organizationIds.length === 0) {
    return {
      memberCounts: new Map<string, number>(),
      childrenCounts: new Map<string, number>(),
    };
  }

  // Run both batch queries in parallel
  const [memberCounts, childrenCounts] = await Promise.all([
    getBatchMemberCounts(organizationIds),
    getBatchChildrenCounts(organizationIds),
  ]);

  return {
    memberCounts,
    childrenCounts,
  };
}

// ============================================================
// HELPER METHODS
// ============================================================

/**
 * Map raw database row to practice info
 * Handles null practice associations
 *
 * @param row - Raw organization row with practice join
 * @returns Practice info or undefined
 */
export function mapPracticeInfo(row: RawOrganizationRow): PracticeInfo | undefined {
  if (!row.practice_id) {
    return undefined;
  }

  return {
    practice_id: row.practice_id,
    domain: row.practice_domain || '',
    status: row.practice_status || 'active',
    template_id: row.practice_template_id || '',
  };
}

/**
 * Build common RBAC-safe WHERE conditions
 * Filters for active, non-deleted organizations
 */
export function buildBaseWhereConditions() {
  return [eq(organizations.is_active, true), isNull(organizations.deleted_at)];
}
