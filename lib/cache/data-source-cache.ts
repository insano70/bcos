/**
 * Data Source Cache Service (with Secondary Index Sets)
 *
 * Redis-backed cache for analytics data source query results with in-memory RBAC filtering.
 * Delegates to IndexedAnalyticsCache for efficient index-based cache operations.
 *
 * KEY FEATURES:
 * - Secondary index sets for O(1) cache lookups (no hierarchy fallback or SCAN)
 * - Granular cache keys: one entry per (datasource, measure, practice_uid, provider_uid, frequency)
 * - In-memory RBAC filtering (maximum cache reuse across users)
 * - Date range and advanced filtering
 * - Graceful degradation (inherited from base)
 * - 4-hour TTL with scheduled cache warming
 * - Distributed locking for cache warming (prevents race conditions)
 * - Enhanced statistics (per-data-source breakdown, largest entries)
 *
 * SECURITY:
 * - Fail-closed RBAC (empty accessible_practices for non-admin → no data)
 * - Permission-based scope validation (not role-based)
 * - Dynamic column validation (prevents SQL injection)
 * - NULL provider_uid scope handling
 * - Comprehensive security audit logging
 */

import { log } from '@/lib/logger';
import { PermissionChecker } from '@/lib/rbac/permission-checker';
import { queryBuilder } from '@/lib/services/analytics/query-builder';
import { queryValidator } from '@/lib/services/analytics/query-validator';
import { executeAnalyticsQuery } from '@/lib/services/analytics-db';
import { chartConfigService } from '@/lib/services/chart-config-service';
import type { ChartFilter, ChartRenderContext } from '@/lib/types/analytics';
import type { UserContext } from '@/lib/types/rbac';
import { buildChartRenderContext } from '@/lib/utils/chart-context';
import { CacheService } from './base';
import type { CacheQueryFilters } from './indexed-analytics-cache';
import { indexedAnalyticsCache } from './indexed-analytics-cache';

/**
 * Cache key components (dimensions used in cache key building)
 */
export interface CacheKeyComponents {
  dataSourceId: number;
  measure?: string;
  practiceUid?: number; // Only from explicit chart filters, NOT from RBAC
  providerUid?: number;
  frequency?: string;
  // Note: RBAC filtering (accessible_practices) applied in-memory, NOT in cache key
}

/**
 * Query parameters for database queries and cache operations
 */
export interface CacheQueryParams {
  dataSourceId: number;
  schema: string;
  table: string;
  measure?: string;
  practiceUid?: number;
  providerUid?: number;
  frequency?: string;
  startDate?: string;
  endDate?: string;
  advancedFilters?: ChartFilter[];
}

/**
 * Result from fetchDataSource including cache metadata
 */
export interface DataSourceFetchResult {
  rows: Record<string, unknown>[];
  cacheHit: boolean;
}

/**
 * Cached data entry structure
 */
interface CachedDataEntry {
  rows: Record<string, unknown>[];
  rowCount: number;
  cachedAt: string;
  expiresAt: string;
  sizeBytes: number;
  keyComponents: CacheKeyComponents;
}

/**
 * Data Source Cache Service
 *
 * Caches analytics data source query results with in-memory RBAC filtering.
 * Extends CacheService base class for consistency with other cache services.
 */
class DataSourceCacheService extends CacheService<CachedDataEntry> {
  protected namespace = 'datasource';
  protected defaultTTL = 14400; // 4 hours (data updates 1-2x daily)

  private readonly MAX_CACHE_SIZE = 50 * 1024 * 1024; // 50MB
  private readonly WILDCARD = '*';

  /**
   * Build cache key from components using base class buildKey()
   * Format: datasource:{ds_id}:m:{measure}:p:{practice_uid}:prov:{provider_uid}:freq:{frequency}
   *
   * Uses inherited buildKey() method for consistent key naming across all cache services
   */
  private buildDataSourceKey(components: CacheKeyComponents): string {
    // Base class buildKey() automatically prepends namespace
    return this.buildKey(
      components.dataSourceId,
      'm',
      components.measure || this.WILDCARD,
      'p',
      components.practiceUid || this.WILDCARD,
      'prov',
      components.providerUid || this.WILDCARD,
      'freq',
      components.frequency || this.WILDCARD
    );
  }

  /**
   * Get cached data (with secondary index sets)
   * Tries indexed cache first with O(1) index lookup
   *
   * Caches data at granular level (measure + practice + provider + frequency)
   * and uses secondary indexes for efficient selective fetching
   */
  async getCached(components: CacheKeyComponents): Promise<{
    rows: Record<string, unknown>[];
    cacheKey: string;
    cacheLevel: number;
  } | null> {
    // Check if indexed cache is warm for this datasource
    const isWarm = await indexedAnalyticsCache.isCacheWarm(components.dataSourceId);

    if (isWarm && components.measure && components.frequency) {
      // Try indexed cache with index lookup
      const filters: CacheQueryFilters = {
        datasourceId: components.dataSourceId,
        measure: components.measure,
        frequency: components.frequency,
        ...(components.practiceUid && { practiceUids: [components.practiceUid] }),
        ...(components.providerUid && { providerUids: [components.providerUid] }),
      };

      try {
        const rows = await indexedAnalyticsCache.query(filters);

        if (rows.length > 0) {
          log.info('Data source cache hit', {
            cacheKey: `ds:${components.dataSourceId}:m:${components.measure}:freq:${components.frequency}`,
            cacheLevel: 0,
            rowCount: rows.length,
          });

          return {
            rows,
            cacheKey: `ds:${components.dataSourceId}:m:${components.measure}`,
            cacheLevel: 0,
          };
        }
      } catch (error) {
        log.warn('Cache query failed, will try database', { error, components });
      }
    }

    log.info('Data source cache miss', {
      dataSourceId: components.dataSourceId,
      measure: components.measure,
      isWarm,
    });

    return null;
  }

  /**
   * Set data in cache
   * Uses inherited set() method from CacheService base class
   */
  async setCached(
    components: CacheKeyComponents,
    rows: Record<string, unknown>[],
    ttl?: number
  ): Promise<void> {
    const key = this.buildDataSourceKey(components);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (ttl || this.defaultTTL) * 1000);

    const cachedData: CachedDataEntry = {
      rows,
      rowCount: rows.length,
      cachedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      sizeBytes: 0,
      keyComponents: components,
    };

    const jsonString = JSON.stringify(cachedData);
    cachedData.sizeBytes = Buffer.byteLength(jsonString, 'utf8');

    // Check size limit
    if (cachedData.sizeBytes > this.MAX_CACHE_SIZE) {
      log.warn('Data source cache entry too large', {
        key,
        sizeMB: Math.round(cachedData.sizeBytes / 1024 / 1024),
        maxMB: Math.round(this.MAX_CACHE_SIZE / 1024 / 1024),
        rowCount: rows.length,
      });
      return;
    }

    // Base class set() handles Redis unavailable, JSON serialization, error handling
    const success = await this.set(key, cachedData, ttl ? { ttl } : undefined);

    if (success) {
      log.info('Data source cached', {
        key,
        rowCount: rows.length,
        sizeKB: Math.round(cachedData.sizeBytes / 1024),
        ttl: ttl || this.defaultTTL,
        expiresAt: expiresAt.toISOString(),
      });
    }
    // Note: Error handling is automatic via base class set()
  }

  /**
   * Validate advanced filter fields against data source column configuration
   * SECURITY: Prevents SQL injection via custom column names
   *
   * Delegates to shared QueryValidator (used by both cache and legacy paths)
   */
  private async validateFilterFields(
    filters: ChartFilter[],
    dataSourceId: number,
    userContext: UserContext
  ): Promise<void> {
    // Delegate to shared validator
    await queryValidator.validateFilterFields(filters, dataSourceId, userContext);
  }

  /**
   * Build SQL WHERE clause from advanced filters
   * Handles all filter operators: eq, neq, gt, gte, lt, lte, in, not_in, like
   *
   * Delegates to shared QueryBuilder (used by both cache and legacy paths)
   */
  private async buildAdvancedFilterClause(
    filters: ChartFilter[],
    _dataSourceId: number,
    _userContext: UserContext,
    startIndex: number
  ): Promise<{ clause: string; params: unknown[]; nextIndex: number }> {
    // Delegate to shared query builder
    return await queryBuilder.buildAdvancedFilterClause(filters, startIndex);
  }

  /**
   * Query database with explicit chart filters
   * Builds SELECT query with WHERE clause based on cache key components + advanced filters
   *
   * IMPORTANT:
   * - Does NOT apply RBAC filtering here (done in-memory after cache/DB fetch)
   * - DOES apply explicit chart filters (practice_uid, provider_uid, dashboard universal filters)
   * - DOES apply advancedFilters (dashboard universal filters like organization → practices)
   * - DOES validate all filter field names against data source configuration
   *
   * This allows maximum cache reuse while respecting explicit chart-level filters
   */
  private async queryDatabase(
    params: CacheQueryParams,
    userContext: UserContext
  ): Promise<Record<string, unknown>[]> {
    const {
      schema,
      table,
      measure,
      practiceUid,
      providerUid,
      frequency,
      advancedFilters,
      dataSourceId,
    } = params;

    // Get data source config to determine correct column names
    const dataSourceConfig = await chartConfigService.getDataSourceConfigById(dataSourceId);
    if (!dataSourceConfig) {
      throw new Error(`Data source not found: ${dataSourceId}`);
    }

    // Determine the time period column name (could be 'frequency', 'time_period', or custom)
    const timePeriodColumn = dataSourceConfig.columns.find((col) => col.isTimePeriod);
    const timePeriodField = timePeriodColumn?.columnName || 'frequency';

    // Determine the date field column name (could be 'date_index', 'date_value', or custom)
    const dateColumn =
      dataSourceConfig.columns.find(
        (col) =>
          col.isDateField &&
          col.columnName !== timePeriodField &&
          (col.columnName === 'date_value' ||
            col.columnName === 'date_index' ||
            col.dataType === 'date')
      ) ||
      dataSourceConfig.columns.find((col) => col.isDateField && col.columnName !== timePeriodField);
    const dateField = dateColumn?.columnName || 'date_index';

    // Build WHERE clause (explicit chart filters only, NOT RBAC)
    const whereClauses: string[] = [];
    const queryParams: unknown[] = [];
    let paramIndex = 1;

    if (measure) {
      whereClauses.push(`measure = $${paramIndex++}`);
      queryParams.push(measure);
    }

    // Only filter by practice_uid if explicitly specified in chart config
    if (practiceUid) {
      whereClauses.push(`practice_uid = $${paramIndex++}`);
      queryParams.push(practiceUid);
    }

    if (providerUid) {
      whereClauses.push(`provider_uid = $${paramIndex++}`);
      queryParams.push(providerUid);
    }

    if (frequency) {
      // Use the correct column name from data source config
      whereClauses.push(`${timePeriodField} = $${paramIndex++}`);
      queryParams.push(frequency);
    }

    // CRITICAL: Validate and apply advanced filters (dashboard universal filters)
    // This includes organizationId → practiceUids conversion
    if (advancedFilters && advancedFilters.length > 0) {
      // SECURITY: Validate filter fields before building SQL
      await this.validateFilterFields(advancedFilters, dataSourceId, userContext);

      const advancedResult = await this.buildAdvancedFilterClause(
        advancedFilters,
        dataSourceId,
        userContext,
        paramIndex
      );
      if (advancedResult.clause) {
        whereClauses.push(advancedResult.clause);
        queryParams.push(...advancedResult.params);
        paramIndex = advancedResult.nextIndex;
      }
    }

    const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const query = `
      SELECT * 
      FROM ${schema}.${table}
      ${whereClause}
      ORDER BY ${dateField} ASC
    `;

    log.debug('Executing data source query', {
      query,
      paramCount: queryParams.length,
      hasAdvancedFilters: advancedFilters && advancedFilters.length > 0,
      note: 'RBAC filtering will be applied in-memory after fetch',
    });

    const queryStart = Date.now();
    const rows = await executeAnalyticsQuery(query, queryParams);
    const queryDuration = Date.now() - queryStart;

    log.info('Database query completed', {
      schema,
      table,
      rowCount: rows.length,
      queryDuration,
      hasAdvancedFilters: advancedFilters && advancedFilters.length > 0,
    });

    return rows;
  }

  /**
   * Validate permission scope matches user's actual analytics permissions
   * SECURITY: Prevents permission_scope spoofing
   *
   * Special case: super_admin is unique and always gets 'all' scope
   * Otherwise: Validates scope against actual analytics permissions
   */
  private validatePermissionScope(context: ChartRenderContext, userContext: UserContext): void {
    // Special case: super_admin is unique (not a "super-user role", but a specific role)
    if (userContext.is_super_admin) {
      if (context.permission_scope !== 'all') {
        log.security('super_admin with non-all scope', 'high', {
          userId: context.user_id,
          claimedScope: context.permission_scope,
        });
        throw new Error(`Security violation: super_admin must have 'all' scope`);
      }
      return; // Valid
    }

    // For non-super-admin, validate scope against analytics permissions
    const permissionChecker = new PermissionChecker(userContext);

    if (context.permission_scope === 'all') {
      // Must have analytics:read:all permission
      const hasAllPermission = permissionChecker.hasPermission('analytics:read:all');
      if (!hasAllPermission) {
        log.security('Permission scope spoofing detected', 'critical', {
          userId: context.user_id,
          claimedScope: 'all',
          hasAnalyticsReadAll: false,
        });
        throw new Error(
          `Security violation: User claims 'all' scope without analytics:read:all permission`
        );
      }
    } else if (context.permission_scope === 'organization') {
      // Must have at least analytics:read:organization
      const hasOrgPermission = permissionChecker.hasAnyPermission([
        'analytics:read:organization',
        'analytics:read:all',
      ]);
      if (!hasOrgPermission) {
        log.security('Permission scope mismatch', 'critical', {
          userId: context.user_id,
          claimedScope: 'organization',
          hasOrgPermission: false,
        });
        throw new Error(`Security violation: Invalid organization scope`);
      }
    }
    // Note: 'own' scope validation would check analytics:read:own
  }

  /**
   * Apply RBAC filtering in-memory with FAIL-CLOSED security
   * Filters rows based on user's accessible practices and providers
   *
   * SECURITY CRITICAL:
   * - Non-admin users with empty accessible_practices get NO DATA (fail closed)
   * - Permission scope validated against actual permissions
   * - NULL provider_uid only accessible to org/all scope
   * - Enhanced security audit logging
   *
   * This is THE KEY to making cache reuse work across users with different permissions
   */
  private applyRBACFilter(
    rows: Record<string, unknown>[],
    context: ChartRenderContext,
    userContext: UserContext
  ): Record<string, unknown>[] {
    const startTime = Date.now();

    // SECURITY: Validate permission scope first
    this.validatePermissionScope(context, userContext);

    // Super admin / 'all' scope: no filtering needed
    if (context.permission_scope === 'all') {
      log.security('RBAC filter: all scope, no filtering', 'low', {
        userId: context.user_id,
        rowCount: rows.length,
        permissionScope: context.permission_scope,
      });
      return rows;
    }

    // FAIL CLOSED: Non-admin with empty accessible_practices = NO DATA
    if (!context.accessible_practices || context.accessible_practices.length === 0) {
      log.security(
        'RBAC filter: Empty accessible_practices for non-admin - blocking all data',
        'critical',
        {
          userId: context.user_id,
          permissionScope: context.permission_scope,
          originalRowCount: rows.length,
          reason: 'fail_closed_security',
          isSuperAdmin: userContext.is_super_admin,
        }
      );
      return []; // Fail closed - return empty array
    }

    // Apply practice filtering
    let filtered = rows.filter((row) => {
      const practiceUid = row.practice_uid as number | undefined;
      return practiceUid !== undefined && context.accessible_practices.includes(practiceUid);
    });

    const practicesInData = Array.from(
      new Set(rows.map((r) => r.practice_uid as number).filter(Boolean))
    );
    const practicesAfterFilter = Array.from(
      new Set(filtered.map((r) => r.practice_uid as number).filter(Boolean))
    );

    // Apply provider filtering if specified
    if (context.accessible_providers && context.accessible_providers.length > 0) {
      filtered = filtered.filter((row) => {
        const providerUid = row.provider_uid as number | undefined | null;

        // SECURITY: NULL provider_uid = system-level data
        // Only accessible to organization/all scope
        if (providerUid === null || providerUid === undefined) {
          const canAccessSystemData =
            context.permission_scope === 'all' || context.permission_scope === 'organization';
          return canAccessSystemData;
        }

        // For non-NULL provider_uid, check accessible_providers
        return context.accessible_providers.includes(providerUid);
      });
    }

    const duration = Date.now() - startTime;

    // SECURITY: Enhanced audit logging
    log.security('RBAC filtering completed', rows.length === filtered.length ? 'low' : 'medium', {
      userId: context.user_id,
      permissionScope: context.permission_scope,
      accessiblePractices: context.accessible_practices,
      accessibleProviders: context.accessible_providers,
      isSuperAdmin: userContext.is_super_admin,

      // Data scope
      originalRowCount: rows.length,
      filteredRowCount: filtered.length,
      rowsBlocked: rows.length - filtered.length,
      blockPercentage:
        rows.length > 0 ? Math.round(((rows.length - filtered.length) / rows.length) * 100) : 0,

      // Affected entities
      practicesInData,
      practicesAfterFilter,
      practicesBlocked: practicesInData.filter((p) => !practicesAfterFilter.includes(p)),

      // Performance
      duration,

      // Security flags
      suspiciousActivity: rows.length > 0 && filtered.length === 0,
      allDataBlocked: rows.length > 0 && filtered.length === 0,

      timestamp: new Date().toISOString(),
    });

    // Security audit: Log if filtering resulted in empty set
    if (filtered.length === 0 && rows.length > 0) {
      log.security('RBAC filtering blocked all data', 'high', {
        userId: context.user_id,
        originalRowCount: rows.length,
        practicesInData,
        accessiblePractices: context.accessible_practices,
        reason: 'no_matching_practices_or_providers',
      });
    }

    return filtered;
  }

  /**
   * Apply date range filter in-memory using dynamic column names
   */
  private async applyDateRangeFilter(
    rows: Record<string, unknown>[],
    dataSourceId: number,
    startDate?: string,
    endDate?: string
  ): Promise<Record<string, unknown>[]> {
    if (!startDate && !endDate) {
      return rows;
    }

    // Get column mapping for dynamic date field access
    const { columnMappingService } = await import('@/lib/services/column-mapping-service');
    const mapping = await columnMappingService.getMapping(dataSourceId);
    const dateField = mapping.dateField;

    return rows.filter((row) => {
      const dateValue = row[dateField] as string;

      if (!dateValue) {
        return false; // Filter out rows without date value
      }

      if (startDate && dateValue < startDate) {
        return false;
      }

      if (endDate && dateValue > endDate) {
        return false;
      }

      return true;
    });
  }

  /**
   * Apply advanced filters in-memory
   * Used when serving from cache (where SQL filters cannot be applied)
   *
   * @param rows - Data rows to filter
   * @param filters - Advanced filter definitions (e.g., practice_uid IN [114])
   * @returns Filtered rows
   */
  private applyAdvancedFiltersInMemory(
    rows: Record<string, unknown>[],
    filters: ChartFilter[]
  ): Record<string, unknown>[] {
    return rows.filter((row) => {
      // All filters must pass (AND logic)
      for (const filter of filters) {
        const fieldValue = row[filter.field];
        const filterValue = filter.value;
        const operator = filter.operator || 'eq';

        switch (operator) {
          case 'eq':
            if (fieldValue !== filterValue) return false;
            break;
          case 'neq':
            if (fieldValue === filterValue) return false;
            break;
          case 'gt':
            if (
              !(
                typeof fieldValue === 'number' &&
                typeof filterValue === 'number' &&
                fieldValue > filterValue
              )
            )
              return false;
            break;
          case 'gte':
            if (
              !(
                typeof fieldValue === 'number' &&
                typeof filterValue === 'number' &&
                fieldValue >= filterValue
              )
            )
              return false;
            break;
          case 'lt':
            if (
              !(
                typeof fieldValue === 'number' &&
                typeof filterValue === 'number' &&
                fieldValue < filterValue
              )
            )
              return false;
            break;
          case 'lte':
            if (
              !(
                typeof fieldValue === 'number' &&
                typeof filterValue === 'number' &&
                fieldValue <= filterValue
              )
            )
              return false;
            break;
          case 'in':
            if (!Array.isArray(filterValue)) return false;
            // Type guard: fieldValue could be any type, check if it's in the array
            if (!(filterValue as unknown[]).includes(fieldValue)) return false;
            break;
          case 'not_in':
            if (!Array.isArray(filterValue)) return true; // If not array, pass
            // Type guard: fieldValue could be any type, check if it's NOT in the array
            if ((filterValue as unknown[]).includes(fieldValue)) return false;
            break;
          case 'like':
            if (typeof fieldValue !== 'string' || typeof filterValue !== 'string') return false;
            if (!fieldValue.toLowerCase().includes(filterValue.toLowerCase())) return false;
            break;
          default:
            log.warn('Unsupported in-memory filter operator', { operator, field: filter.field });
            return false;
        }
      }

      // All filters passed
      return true;
    });
  }

  /**
   * Fetch data source with caching
   * Main entry point - handles cache lookup, database fallback, and in-memory filtering
   *
   * IMPORTANT: RBAC filtering is applied in-memory AFTER cache/DB fetch
   * This allows maximum cache reuse across users with different permissions
   *
   * SECURITY: Accepts UserContext for permission validation
   * Builds ChartRenderContext internally to ensure consistent RBAC
   */
  async fetchDataSource(
    params: CacheQueryParams,
    userContext: UserContext,
    nocache: boolean = false
  ): Promise<DataSourceFetchResult> {
    const startTime = Date.now();

    // Build ChartRenderContext from UserContext with proper RBAC
    // This ensures consistent accessible_practices population
    const context = await buildChartRenderContext(userContext);

    // Build cache key components (only from chart filters, NOT from RBAC)
    const keyComponents: CacheKeyComponents = {
      dataSourceId: params.dataSourceId,
      ...(params.measure && { measure: params.measure }),
      ...(params.practiceUid && { practiceUid: params.practiceUid }), // Only if explicit chart filter
      ...(params.providerUid && { providerUid: params.providerUid }), // Only if explicit chart filter
      ...(params.frequency && { frequency: params.frequency }),
    };

    // Try cache first (unless nocache=true)
    if (!nocache) {
      const cached = await this.getCached(keyComponents);

      if (cached) {
        // Apply in-memory filters (ORDER MATTERS: RBAC first for security)
        let filteredRows = cached.rows;

        // 1. RBAC filtering (SECURITY CRITICAL - applied server-side before returning to client)
        filteredRows = this.applyRBACFilter(filteredRows, context, userContext);

        // 2. Date range filtering (in-memory for maximum cache reuse)
        if (params.startDate || params.endDate) {
          filteredRows = await this.applyDateRangeFilter(
            filteredRows,
            params.dataSourceId,
            params.startDate,
            params.endDate
          );
        }

        // 3. CRITICAL FIX: Apply advanced filters (dashboard/organization filters) in-memory
        // These are NOT applied during cache population, so must be applied when serving from cache
        if (params.advancedFilters && params.advancedFilters.length > 0) {
          const rowCountBeforeAdvanced = filteredRows.length;
          filteredRows = this.applyAdvancedFiltersInMemory(filteredRows, params.advancedFilters);

          log.info('Advanced filters applied in-memory (cache hit path)', {
            userId: context.user_id,
            filterCount: params.advancedFilters.length,
            filters: params.advancedFilters,
            beforeFilter: rowCountBeforeAdvanced,
            afterFilter: filteredRows.length,
            rowsFiltered: rowCountBeforeAdvanced - filteredRows.length,
          });
        }

        const duration = Date.now() - startTime;

        log.info('Data source served from cache (server-filtered)', {
          cacheKey: cached.cacheKey,
          cacheLevel: cached.cacheLevel,
          cachedRowCount: cached.rows.length,
          afterRBAC: filteredRows.length,
          finalRowCount: filteredRows.length,
          duration,
          userId: context.user_id,
          permissionScope: context.permission_scope,
          security: 'filtered_before_client_send',
        });

        return {
          rows: filteredRows,
          cacheHit: true,
        };
      }
    }

    // Cache miss - query database
    log.info('Data source cache miss - querying database', {
      dataSourceId: params.dataSourceId,
      measure: params.measure,
      practiceUid: params.practiceUid,
      nocache,
      userId: context.user_id,
    });

    const rows = await this.queryDatabase(params, userContext);

    // Cache the result (unless nocache=true)
    if (!nocache && rows.length > 0) {
      await this.setCached(keyComponents, rows);
    }

    // Apply in-memory filters (ORDER MATTERS: RBAC first for security)
    let filteredRows = rows;

    // 1. RBAC filtering (SECURITY CRITICAL - applied server-side before returning to client)
    filteredRows = this.applyRBACFilter(filteredRows, context, userContext);

    // 2. Date range filtering (in-memory for maximum cache reuse)
    if (params.startDate || params.endDate) {
      filteredRows = await this.applyDateRangeFilter(
        filteredRows,
        params.dataSourceId,
        params.startDate,
        params.endDate
      );
    }

    // 3. CRITICAL FIX: Apply advanced filters if NOT applied in SQL
    // Note: Advanced filters ARE applied in SQL query (Task 1.5), but as a safety measure,
    // we verify and log if they would have filtered additional rows (indicates SQL issue)
    if (params.advancedFilters && params.advancedFilters.length > 0) {
      const rowCountBefore = filteredRows.length;
      const testFiltered = this.applyAdvancedFiltersInMemory(filteredRows, params.advancedFilters);

      if (testFiltered.length !== rowCountBefore) {
        log.error('Advanced filters NOT applied in SQL - applying in-memory as fallback', {
          userId: context.user_id,
          filterCount: params.advancedFilters.length,
          filters: params.advancedFilters,
          beforeFilter: rowCountBefore,
          afterFilter: testFiltered.length,
          rowsFiltered: rowCountBefore - testFiltered.length,
          source: 'cache_miss_path',
          action: 'fallback_applied',
        });
        filteredRows = testFiltered;
      }
    }

    const duration = Date.now() - startTime;

    log.info('Data source fetched from database (server-filtered)', {
      totalRowCount: rows.length,
      afterRBAC: filteredRows.length,
      finalRowCount: filteredRows.length,
      duration,
      userId: context.user_id,
      permissionScope: context.permission_scope,
      security: 'filtered_before_client_send',
    });

    return {
      rows: filteredRows,
      cacheHit: false,
    };
  }

  /**
   * Invalidate cache entries
   * Implementation of abstract method from CacheService base class
   *
   * Uses inherited delPattern() method for pattern-based deletion
   */
  async invalidate(dataSourceId?: number, measure?: string): Promise<void> {
    if (!dataSourceId) {
      // Clear all data source caches
      const deleted = await this.delPattern(`${this.namespace}:*`);
      log.info('All data source caches cleared', { keysDeleted: deleted });
      return;
    }

    if (measure) {
      // Invalidate specific data source + measure
      const pattern = `${this.namespace}:${dataSourceId}:m:${measure}:*`;
      const deleted = await this.delPattern(pattern);
      log.info('Cache invalidated for data source + measure', {
        dataSourceId,
        measure,
        keysDeleted: deleted,
      });
    } else {
      // Invalidate entire data source
      const pattern = `${this.namespace}:${dataSourceId}:*`;
      const deleted = await this.delPattern(pattern);
      log.info('Cache invalidated for data source', {
        dataSourceId,
        keysDeleted: deleted,
      });
    }
    // Note: Error handling automatic via base class delPattern()
  }

  /**
   * Get enhanced cache statistics
   * Uses inherited scan() method from CacheService base class
   *
   * Enhanced with per-data-source breakdown, hit rates, and largest entries
   */
  async getStats(): Promise<{
    totalKeys: number;
    totalMemoryMB: number;
    cacheKeys: string[];
    keysByLevel: Record<string, number>;
    byDataSource: Record<
      number,
      {
        keys: number;
        memoryMB: number;
        measures: string[];
      }
    >;
    largestEntries: Array<{
      key: string;
      sizeMB: number;
      rowCount?: number;
    }>;
  }> {
    // Use base class scan() method
    const pattern = `${this.namespace}:*`;
    const keys = await this.scan(pattern, 10000);

    if (keys.length === 0) {
      return {
        totalKeys: 0,
        totalMemoryMB: 0,
        cacheKeys: [],
        keysByLevel: {},
        byDataSource: {},
        largestEntries: [],
      };
    }

    const client = this.getClient();
    if (!client) {
      return {
        totalKeys: keys.length,
        totalMemoryMB: 0,
        cacheKeys: keys,
        keysByLevel: {},
        byDataSource: {},
        largestEntries: [],
      };
    }

    let totalSize = 0;
    const keysByLevel: Record<string, number> = {
      'Level 0 (Full DS)': 0,
      'Level 1 (Measure)': 0,
      'Level 2 (Measure+Practice)': 0,
      'Level 3 (Measure+Practice+Freq)': 0,
      'Level 4 (Full)': 0,
    };
    const byDataSource: Record<number, { keys: number; memoryMB: number; measures: Set<string> }> =
      {};
    const entrySizes: Array<{ key: string; size: number; rowCount?: number }> = [];

    for (const key of keys) {
      const value = await client.get(key);
      if (value) {
        const size = Buffer.byteLength(value, 'utf8');
        totalSize += size;

        // Parse key to extract data source ID
        // Format: datasource:{id}:m:{measure}:p:{practice}:prov:{provider}:freq:{frequency}
        const match = key.match(/^datasource:(\d+):/);
        if (match?.[1]) {
          const dataSourceId = parseInt(match[1], 10);
          if (!byDataSource[dataSourceId]) {
            byDataSource[dataSourceId] = {
              keys: 0,
              memoryMB: 0,
              measures: new Set<string>(),
            };
          }
          const dsStats = byDataSource[dataSourceId];
          if (dsStats) {
            dsStats.keys++;
            dsStats.memoryMB += size / 1024 / 1024;

            // Extract measure name
            const measureMatch = key.match(/:m:([^:]+):/);
            if (measureMatch?.[1] && measureMatch[1] !== '*') {
              dsStats.measures.add(measureMatch[1]);
            }
          }
        }

        // Count wildcards to determine level
        const wildcards = (key.match(/\*/g) || []).length;
        if (wildcards === 4) {
          keysByLevel['Level 0 (Full DS)'] = (keysByLevel['Level 0 (Full DS)'] || 0) + 1;
        } else if (wildcards === 3) {
          keysByLevel['Level 1 (Measure)'] = (keysByLevel['Level 1 (Measure)'] || 0) + 1;
        } else if (wildcards === 2) {
          keysByLevel['Level 2 (Measure+Practice)'] =
            (keysByLevel['Level 2 (Measure+Practice)'] || 0) + 1;
        } else if (wildcards === 1) {
          keysByLevel['Level 3 (Measure+Practice+Freq)'] =
            (keysByLevel['Level 3 (Measure+Practice+Freq)'] || 0) + 1;
        } else {
          keysByLevel['Level 4 (Full)'] = (keysByLevel['Level 4 (Full)'] || 0) + 1;
        }

        // Track entry sizes for largest entries
        try {
          const parsed = JSON.parse(value) as CachedDataEntry;
          entrySizes.push({
            key,
            size,
            rowCount: parsed.rowCount,
          });
        } catch {
          entrySizes.push({ key, size });
        }
      }
    }

    // Get top 10 largest entries
    const largestEntries = entrySizes
      .sort((a, b) => b.size - a.size)
      .slice(0, 10)
      .map((entry) => ({
        key: entry.key,
        sizeMB: entry.size / 1024 / 1024,
        ...(entry.rowCount !== undefined && { rowCount: entry.rowCount }),
      }));

    // Convert byDataSource to final format (Set → Array)
    const byDataSourceFinal: Record<
      number,
      { keys: number; memoryMB: number; measures: string[] }
    > = {};
    for (const [dataSourceId, stats] of Object.entries(byDataSource)) {
      byDataSourceFinal[parseInt(dataSourceId, 10)] = {
        keys: stats.keys,
        memoryMB: Math.round(stats.memoryMB * 100) / 100,
        measures: Array.from(stats.measures).sort(),
      };
    }

    return {
      totalKeys: keys.length,
      totalMemoryMB: Math.round((totalSize / 1024 / 1024) * 100) / 100,
      cacheKeys: keys,
      keysByLevel,
      byDataSource: byDataSourceFinal,
      largestEntries,
    };
    // Note: Error handling automatic via base class scan()
  }

  /**
   * Warm cache for a specific data source (delegates to indexed cache)
   * Fetches all data and caches it with secondary index sets
   *
   * SECURITY: Uses distributed locking to prevent concurrent warming
   * Called by scheduled job every 4 hours (matches data update schedule)
   */
  async warmDataSource(dataSourceId: number): Promise<{
    entriesCached: number;
    totalRows: number;
    duration: number;
    skipped?: boolean;
  }> {
    log.info('Warming data source cache', { dataSourceId });

    // Delegate to indexed cache which handles locking, grouping, and index creation
    return await indexedAnalyticsCache.warmCache(dataSourceId);
  }

  /**
   * Warm cache for all active data sources
   */
  async warmAllDataSources(): Promise<{
    dataSourcesWarmed: number;
    totalEntriesCached: number;
    totalRows: number;
    duration: number;
  }> {
    const startTime = Date.now();

    log.info('Starting cache warming for all data sources');

    // Get all active data sources
    const dataSources = await chartConfigService.getAllDataSources();

    let totalEntriesCached = 0;
    let totalRows = 0;

    for (const dataSource of dataSources) {
      try {
        const result = await this.warmDataSource(dataSource.id);
        totalEntriesCached += result.entriesCached;
        totalRows += result.totalRows;
      } catch (error) {
        log.error('Failed to warm data source', error, {
          dataSourceId: dataSource.id,
        });
        // Continue with other data sources
      }
    }

    const duration = Date.now() - startTime;

    log.info('Cache warming completed for all data sources', {
      dataSourcesWarmed: dataSources.length,
      totalEntriesCached,
      totalRows,
      duration,
      durationMinutes: Math.round(duration / 60000),
    });

    return {
      dataSourcesWarmed: dataSources.length,
      totalEntriesCached,
      totalRows,
      duration,
    };
  }
}

export const dataSourceCache = new DataSourceCacheService();
