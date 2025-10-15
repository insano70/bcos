import { and, eq, inArray, isNull, like, or } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { organizations, user_organizations, users } from '@/lib/db/schema';
import type { UserWithOrganizations } from '../rbac-users-service';

/**
 * User Query Builders
 *
 * Shared query building utilities for user-related operations.
 * Prevents duplication of complex join and aggregation logic.
 *
 * **Pattern**: Query builder extraction (STANDARDS.md lines 1,523-1,527)
 * Following rbac-work-items-service.ts pattern for query reusability.
 */

/**
 * Base query builder for users with organizations
 * Returns standardized user + organizations join
 *
 * @example
 * ```typescript
 * const results = await getUsersBaseQuery()
 *   .where(and(...whereConditions))
 *   .limit(50);
 * ```
 */
export function getUsersBaseQuery() {
  return db
    .select({
      user_id: users.user_id,
      email: users.email,
      first_name: users.first_name,
      last_name: users.last_name,
      email_verified: users.email_verified,
      is_active: users.is_active,
      provider_uid: users.provider_uid,
      created_at: users.created_at,
      updated_at: users.updated_at,
      // Organization info from join
      organization_id: organizations.organization_id,
      org_name: organizations.name,
      org_slug: organizations.slug,
      org_is_active: organizations.is_active,
    })
    .from(users)
    .leftJoin(user_organizations, eq(users.user_id, user_organizations.user_id))
    .leftJoin(
      organizations,
      eq(user_organizations.organization_id, organizations.organization_id)
    );
}

/**
 * Build RBAC where conditions for user queries
 * Handles three scopes: own, organization, all
 *
 * @param canReadAll - User has users:read:all permission
 * @param canReadOrganization - User has users:read:organization permission
 * @param accessibleOrgIds - Organization IDs user can access
 * @param currentUserId - Current user's ID (for 'own' scope)
 * @returns Array of SQL conditions to apply
 */
export function buildUserRBACConditions(
  canReadAll: boolean,
  canReadOrganization: boolean,
  accessibleOrgIds: string[],
  currentUserId: string
): SQL[] {
  const conditions: SQL[] = [isNull(users.deleted_at), eq(users.is_active, true)];

  // Super admin or all scope - no additional filtering
  if (canReadAll) {
    return conditions;
  }

  // Organization scope - filter to accessible organizations
  if (canReadOrganization && accessibleOrgIds.length > 0) {
    conditions.push(
      inArray(user_organizations.organization_id, accessibleOrgIds),
      eq(user_organizations.is_active, true)
    );
    return conditions;
  }

  // Own scope - can only see self
  conditions.push(eq(users.user_id, currentUserId));
  return conditions;
}

/**
 * Apply search filters to user queries
 * Searches across first_name, last_name, and email
 *
 * @param conditions - Existing conditions to append to
 * @param search - Search term (optional)
 * @returns Updated conditions array
 */
export function applyUserSearchFilters(conditions: SQL[], search?: string): SQL[] {
  if (search) {
    const searchCondition = or(
      like(users.first_name, `%${search}%`),
      like(users.last_name, `%${search}%`),
      like(users.email, `%${search}%`)
    );
    if (searchCondition) {
      conditions.push(searchCondition);
    }
  }
  return conditions;
}

/**
 * Group user results by user_id and aggregate organizations
 * Prevents duplicate users from LEFT JOIN with organizations
 *
 * @param results - Raw query results with potential duplicates
 * @returns Map of userId -> UserWithOrganizations
 *
 * @example
 * ```typescript
 * const results = await getUsersBaseQuery().where(...);
 * const usersMap = groupUsersByIdWithOrganizations(results);
 * return Array.from(usersMap.values());
 * ```
 */
export function groupUsersByIdWithOrganizations(
  results: Array<{
    user_id: string;
    email: string;
    first_name: string;
    last_name: string;
    email_verified: boolean | null;
    is_active: boolean | null;
    provider_uid: number | null;
    created_at: Date | null;
    updated_at: Date | null;
    organization_id: string | null;
    org_name: string | null;
    org_slug: string | null;
    org_is_active: boolean | null;
  }>
): Map<string, UserWithOrganizations> {
  const usersMap = new Map<string, UserWithOrganizations>();

  results.forEach((row) => {
    // Create user entry if not exists
    if (!usersMap.has(row.user_id)) {
      usersMap.set(row.user_id, {
        user_id: row.user_id,
        email: row.email,
        first_name: row.first_name,
        last_name: row.last_name,
        email_verified: row.email_verified ?? false,
        is_active: row.is_active ?? true,
        provider_uid: row.provider_uid || undefined,
        created_at: row.created_at ?? new Date(),
        updated_at: row.updated_at ?? new Date(),
        organizations: [],
      });
    }

    const user = usersMap.get(row.user_id);
    if (!user) {
      throw new Error(`User unexpectedly not found in map: ${row.user_id}`);
    }

    // Add organization if present and not already added (due to JOIN duplicates)
    if (
      row.organization_id &&
      row.org_name &&
      row.org_slug &&
      !user.organizations.some((org) => org.organization_id === row.organization_id)
    ) {
      user.organizations.push({
        organization_id: row.organization_id,
        name: row.org_name,
        slug: row.org_slug,
        is_active: row.org_is_active ?? true,
      });
    }
  });

  return usersMap;
}

/**
 * Build single user query with organization joins
 * Used by getUserById for consistent query structure
 *
 * @param userId - User ID to fetch
 * @returns Query builder for single user
 */
export function getSingleUserQuery(userId: string) {
  return db
    .select({
      user_id: users.user_id,
      email: users.email,
      first_name: users.first_name,
      last_name: users.last_name,
      email_verified: users.email_verified,
      is_active: users.is_active,
      provider_uid: users.provider_uid,
      created_at: users.created_at,
      updated_at: users.updated_at,
      organization_id: user_organizations.organization_id,
      org_name: organizations.name,
      org_slug: organizations.slug,
      org_is_active: organizations.is_active,
    })
    .from(users)
    .leftJoin(
      user_organizations,
      and(eq(user_organizations.user_id, users.user_id), eq(user_organizations.is_active, true))
    )
    .leftJoin(
      organizations,
      and(
        eq(organizations.organization_id, user_organizations.organization_id),
        isNull(organizations.deleted_at)
      )
    )
    .where(and(eq(users.user_id, userId), isNull(users.deleted_at)));
}

/**
 * Build single UserWithOrganizations object from query results
 * Aggregates organization data from multiple rows
 *
 * @param results - Query results for single user
 * @returns UserWithOrganizations object or null if no results
 */
export function buildSingleUserWithOrganizations(
  results: Array<{
    user_id: string;
    email: string;
    first_name: string;
    last_name: string;
    email_verified: boolean | null;
    is_active: boolean | null;
    provider_uid: number | null;
    created_at: Date | null;
    updated_at: Date | null;
    organization_id: string | null;
    org_name: string | null;
    org_slug: string | null;
    org_is_active: boolean | null;
  }>
): UserWithOrganizations | null {
  if (results.length === 0) {
    return null;
  }

  const firstResult = results[0];
  if (!firstResult) {
    return null;
  }

  if (
    !firstResult.user_id ||
    !firstResult.email ||
    !firstResult.first_name ||
    !firstResult.last_name
  ) {
    return null;
  }

  const userObj: UserWithOrganizations = {
    user_id: firstResult.user_id,
    email: firstResult.email,
    first_name: firstResult.first_name,
    last_name: firstResult.last_name,
    email_verified: firstResult.email_verified ?? false,
    is_active: firstResult.is_active ?? true,
    provider_uid: firstResult.provider_uid || undefined,
    created_at: firstResult.created_at ?? new Date(),
    updated_at: firstResult.updated_at ?? new Date(),
    organizations: [],
  };

  // Add all organizations from results
  results.forEach((row) => {
    if (
      row.organization_id &&
      row.org_name &&
      row.org_slug &&
      !userObj.organizations.some((org) => org.organization_id === row.organization_id)
    ) {
      userObj.organizations.push({
        organization_id: row.organization_id,
        name: row.org_name,
        slug: row.org_slug,
        is_active: row.org_is_active ?? true,
      });
    }
  });

  return userObj;
}
