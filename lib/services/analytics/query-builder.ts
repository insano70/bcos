/**
 * Query Builder Module
 *
 * Provides SQL query building utilities for analytics queries.
 * Used by both cache and legacy query paths.
 *
 * ARCHITECTURE:
 * - buildWhereClause(): Full WHERE clause with RBAC security filters + user filters
 * - buildAdvancedFilterClause(): User filters only (for cache path - RBAC done in-memory)
 *
 * SECURITY:
 * - RBAC filtering via practice_uid and provider_uid (legacy path)
 * - Fail-closed security: empty accessible arrays result in no data
 * - Parameterized queries prevent SQL injection
 * - Field validation done before this layer (via QueryValidator)
 *
 * KEY DIFFERENCES:
 * Legacy Path: RBAC in SQL (buildWhereClause) → queries only accessible data
 * Cache Path: RBAC in-memory (buildAdvancedFilterClause) → queries all data, filters after
 */

import { log } from '@/lib/logger';
import type { ChartFilter, ChartRenderContext } from '@/lib/types/analytics';
import { ALLOWED_OPERATORS } from './query-types';
import { querySanitizer } from './query-sanitizer';

/**
 * Query builder for SQL WHERE clauses
 * Shared by both cache and legacy query paths
 */
export class QueryBuilder {
  /**
   * Build full WHERE clause with RBAC security filters + user filters
   * Used by LEGACY PATH (non-cache)
   *
   * SECURITY:
   * - Applies practice_uid filtering (organization-level security)
   * - Applies provider_uid filtering (provider-level security)
   * - Fail-closed: empty accessible arrays = no data returned
   *
   * @param filters - User-specified filters
   * @param context - Chart render context with RBAC info
   * @returns WHERE clause string and parameterized values
   */
  async buildWhereClause(
    filters: ChartFilter[],
    context: ChartRenderContext
  ): Promise<{ clause: string; params: unknown[] }> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    // Add security filters based on user context

    // PRACTICE_UID FILTERING (organization-level security)
    if (context.accessible_practices.length > 0) {
      conditions.push(`practice_uid = ANY($${paramIndex})`);
      params.push(context.accessible_practices);

      // Enhanced security audit logging
      log.info('Applied practice_uid security filter', {
        userId: context.user_id,
        permissionScope: context.permission_scope,
        practiceUidCount: context.accessible_practices.length,
        practiceUids: context.accessible_practices,
        includesHierarchy: context.includes_hierarchy,
        organizationIds: context.organization_ids,
        filterType: 'organization-level',
      });

      paramIndex++;
    } else if (context.permission_scope === 'organization') {
      // FAIL-CLOSED SECURITY: Organization user with no practice_uids
      log.security(
        'Organization user has no accessible practice_uids - query will return empty results',
        'medium',
        {
          userId: context.user_id,
          organizationCount: context.organization_ids?.length || 0,
          organizationIds: context.organization_ids,
          failedClosed: true,
          reason: 'empty_practice_uids',
        }
      );
    } else if (context.permission_scope === 'all') {
      // Super admin: no practice_uid filtering
      log.info('Super admin access - no practice_uid filtering applied', {
        userId: context.user_id,
        permissionScope: 'all',
        filterType: 'none',
      });
    }

    // PROVIDER_UID FILTERING (provider-level security)
    if (context.accessible_providers.length > 0) {
      // Allow NULL provider_uid OR matching provider_uid
      // (NULL = system-level data not tied to specific provider)
      conditions.push(`(provider_uid IS NULL OR provider_uid = ANY($${paramIndex}))`);
      params.push(context.accessible_providers);

      // Enhanced security audit logging
      log.info('Applied provider_uid security filter', {
        userId: context.user_id,
        permissionScope: context.permission_scope,
        providerUidCount: context.accessible_providers.length,
        providerUids: context.accessible_providers,
        filterType: 'provider-level',
        allowsNullProviderUid: true,
      });

      paramIndex++;
    } else if (context.permission_scope === 'own') {
      // FAIL-CLOSED SECURITY: Provider user with no provider_uid
      log.security('Provider user has no provider_uid - query will return empty results', 'medium', {
        userId: context.user_id,
        providerUid: context.provider_uid,
        failedClosed: true,
        reason: 'empty_provider_uid',
      });
    }

    // Add user-specified filters
    for (const filter of filters) {
      // Note: Field validation is done by QueryValidator before calling this method
      const sanitizedValue = querySanitizer.sanitizeValue(filter.value, filter.operator);
      const sqlOperator = ALLOWED_OPERATORS[filter.operator as keyof typeof ALLOWED_OPERATORS];

      if (filter.operator === 'in' || filter.operator === 'not_in') {
        // Use ANY for array parameters in PostgreSQL
        const anyOperator = filter.operator === 'in' ? '= ANY' : '!= ANY';
        conditions.push(`${filter.field} ${anyOperator}($${paramIndex})`);
        params.push(sanitizedValue);
        paramIndex++;
      } else if (filter.operator === 'between') {
        conditions.push(`${filter.field} ${sqlOperator} $${paramIndex} AND $${paramIndex + 1}`);
        if (Array.isArray(sanitizedValue) && sanitizedValue.length >= 2) {
          params.push(sanitizedValue[0], sanitizedValue[1]);
        } else {
          throw new Error('Between operator requires array with two values');
        }
        paramIndex += 2;
      } else {
        conditions.push(`${filter.field} ${sqlOperator} $${paramIndex}`);
        params.push(sanitizedValue);
        paramIndex++;
      }
    }

    const clause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return { clause, params };
  }

  /**
   * Build advanced filter clause (user filters only, no RBAC)
   * Used by CACHE PATH
   *
   * ARCHITECTURE:
   * - Cache path applies RBAC filtering in-memory AFTER fetch
   * - This allows maximum cache reuse across users
   * - Only explicit chart filters are included in the SQL query
   *
   * @param filters - User-specified filters
   * @param startIndex - Starting parameter index (for combining with other params)
   * @returns Filter clause, params, and next available param index
   */
  async buildAdvancedFilterClause(
    filters: ChartFilter[],
    startIndex: number
  ): Promise<{ clause: string; params: unknown[]; nextIndex: number }> {
    const clauses: string[] = [];
    const params: unknown[] = [];
    let paramIndex = startIndex;

    for (const filter of filters) {
      const field = filter.field;
      const operator = filter.operator || 'eq';
      const value = filter.value;

      switch (operator) {
        case 'eq':
          clauses.push(`${field} = $${paramIndex++}`);
          params.push(value);
          break;
        case 'neq':
          clauses.push(`${field} != $${paramIndex++}`);
          params.push(value);
          break;
        case 'gt':
          clauses.push(`${field} > $${paramIndex++}`);
          params.push(value);
          break;
        case 'gte':
          clauses.push(`${field} >= $${paramIndex++}`);
          params.push(value);
          break;
        case 'lt':
          clauses.push(`${field} < $${paramIndex++}`);
          params.push(value);
          break;
        case 'lte':
          clauses.push(`${field} <= $${paramIndex++}`);
          params.push(value);
          break;
        case 'in':
          if (Array.isArray(value) && value.length > 0) {
            clauses.push(`${field} = ANY($${paramIndex++})`);
            params.push(value);
          } else {
            // Empty array = no results (fail-closed security)
            clauses.push(`${field} = $${paramIndex++}`);
            params.push(-1); // Impossible value
          }
          break;
        case 'not_in':
          if (Array.isArray(value) && value.length > 0) {
            clauses.push(`${field} != ALL($${paramIndex++})`);
            params.push(value);
          }
          break;
        case 'like':
          clauses.push(`${field} ILIKE $${paramIndex++}`);
          params.push(`%${value}%`);
          break;
        default:
          log.warn('Unsupported filter operator', { operator, field });
      }
    }

    return {
      clause: clauses.length > 0 ? `(${clauses.join(' AND ')})` : '',
      params,
      nextIndex: paramIndex,
    };
  }
}

// Export singleton instance
export const queryBuilder = new QueryBuilder();
