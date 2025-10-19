import { eq, isNull } from 'drizzle-orm';
import { db, organizations, practices } from '@/lib/db';

/**
 * Organizations Query Builder
 *
 * Provides base query patterns for organization data retrieval.
 * Focuses on SELECT statement construction and WHERE condition building.
 *
 * Related utilities:
 * - batch-operations.ts: Member/children count batch queries
 * - practice-mapper.ts: Practice info mapping utilities
 *
 * Key patterns:
 * - Base organization select fields
 * - Organization select with practice join
 * - Query builder with practice join
 * - Base WHERE conditions
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


/**
 * Build common RBAC-safe WHERE conditions
 * Filters for active, non-deleted organizations
 */
export function buildBaseWhereConditions() {
  return [eq(organizations.is_active, true), isNull(organizations.deleted_at)];
}
