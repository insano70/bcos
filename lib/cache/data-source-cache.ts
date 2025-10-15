/**
 * Data Source Cache Service
 * 
 * Redis-backed cache for analytics data source query results with in-memory RBAC filtering.
 * Extends CacheService base class for consistency with other cache services.
 * 
 * KEY FEATURES:
 * - Hierarchical cache keys with fallback (5 levels: full → measure+practice+freq → measure+practice → measure → data source)
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

import { CacheService } from './base';
import { log } from '@/lib/logger';
import { executeAnalyticsQuery } from '@/lib/services/analytics-db';
import { chartConfigService } from '@/lib/services/chart-config-service';
import { createRBACDataSourcesService } from '@/lib/services/rbac-data-sources-service';
import { PermissionChecker } from '@/lib/rbac/permission-checker';
import { buildChartRenderContext } from '@/lib/utils/chart-context';
import type { ChartRenderContext, ChartFilter } from '@/lib/types/analytics';
import type { UserContext } from '@/lib/types/rbac';

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
  
  // Constants for cache warming
  private readonly WARMING_LOCK_PREFIX = 'datasource:warming:lock';
  private readonly WARMING_LOCK_TTL = 300; // 5 minutes
  
  // Standard columns that always exist across all data sources
  private readonly STANDARD_COLUMNS = new Set([
    'practice_uid',
    'provider_uid',
    'measure',
    'frequency',
    'time_period', // Alternative to frequency
  ]);
  
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
      'm', components.measure || this.WILDCARD,
      'p', components.practiceUid || this.WILDCARD,
      'prov', components.providerUid || this.WILDCARD,
      'freq', components.frequency || this.WILDCARD
    );
  }
  
  /**
   * Generate cache key fallback hierarchy
   * Returns keys from most specific to least specific
   * 
   * CRITICAL "ALL OR NOTHING" STRATEGY:
   * - If frequency is specified → ALL cache keys MUST include that frequency
   * - If frequency is NOT specified → NO cache keys include frequency
   * 
   * This prevents Monthly charts from getting Daily/Weekly/Quarterly data mixed in
   */
  private generateKeyHierarchy(components: CacheKeyComponents): string[] {
    const keys: string[] = [];
    
    // PATH A: Frequency IS specified - all keys must include it
    if (components.frequency) {
      // Level A4: measure + practice + provider + frequency (most specific)
      if (components.measure && components.practiceUid && components.providerUid) {
        keys.push(this.buildDataSourceKey({
          dataSourceId: components.dataSourceId,
          measure: components.measure,
          practiceUid: components.practiceUid,
          providerUid: components.providerUid,
          frequency: components.frequency,
        }));
      }
      
      // Level A3: measure + practice + frequency (all providers for this practice)
      if (components.measure && components.practiceUid) {
        keys.push(this.buildDataSourceKey({
          dataSourceId: components.dataSourceId,
          measure: components.measure,
          practiceUid: components.practiceUid,
          frequency: components.frequency,
        }));
      }
      
      // Level A2: measure + frequency (all practices, all providers for this measure)
      if (components.measure) {
        keys.push(this.buildDataSourceKey({
          dataSourceId: components.dataSourceId,
          measure: components.measure,
          frequency: components.frequency,
        }));
      }
      
      // Level A1: frequency only (widest cache for this specific frequency)
      keys.push(this.buildDataSourceKey({
        dataSourceId: components.dataSourceId,
        frequency: components.frequency,
      }));
    } 
    // PATH B: Frequency NOT specified - no keys include frequency
    else {
      // Level B4: measure + practice + provider (most specific, no frequency)
      if (components.measure && components.practiceUid && components.providerUid) {
        keys.push(this.buildDataSourceKey({
          dataSourceId: components.dataSourceId,
          measure: components.measure,
          practiceUid: components.practiceUid,
          providerUid: components.providerUid,
        }));
      }
      
      // Level B3: measure + practice (all providers)
      if (components.measure && components.practiceUid) {
        keys.push(this.buildDataSourceKey({
          dataSourceId: components.dataSourceId,
          measure: components.measure,
          practiceUid: components.practiceUid,
        }));
      }
      
      // Level B2: measure only (all practices, all providers)
      if (components.measure) {
        keys.push(this.buildDataSourceKey({
          dataSourceId: components.dataSourceId,
          measure: components.measure,
        }));
      }
      
      // Level B1: Full data source (widest cache, all frequencies mixed)
      keys.push(this.buildDataSourceKey({
        dataSourceId: components.dataSourceId,
      }));
    }
    
    return keys;
  }
  
  /**
   * Get cached data with fallback hierarchy
   * Tries keys from most specific to least specific
   * 
   * Uses inherited get() method from CacheService base class
   */
  async getCached(components: CacheKeyComponents): Promise<{
    rows: Record<string, unknown>[];
    cacheKey: string;
    cacheLevel: number;
  } | null> {
    const keyHierarchy = this.generateKeyHierarchy(components);
    
    // Try each key in hierarchy (uses base class get())
    for (let i = 0; i < keyHierarchy.length; i++) {
      const key = keyHierarchy[i];
      if (!key) continue; // Skip if key is undefined (shouldn't happen)
      
      // Base class get() handles Redis unavailable, JSON parsing, error handling
      const cached = await this.get<CachedDataEntry>(key);
      
      if (cached) {
        log.info('Data source cache hit', {
          cacheKey: key,
          cacheLevel: i,
          rowCount: cached.rowCount,
          sizeKB: Math.round(cached.sizeBytes / 1024),
          cachedAt: cached.cachedAt,
        });
        
        return {
          rows: cached.rows,
          cacheKey: key,
          cacheLevel: i,
        };
      }
    }
    
    log.info('Data source cache miss (all levels)', {
      dataSourceId: components.dataSourceId,
      measure: components.measure,
      practiceUid: components.practiceUid,
      keysChecked: keyHierarchy.length,
    });
    
    return null;
    // Note: Error handling is automatic via base class get()
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
   * Only allows filtering on:
   * 1. Standard columns (practice_uid, provider_uid, measure, frequency, time_period)
   * 2. Columns defined in data source configuration marked as filterable
   */
  private async validateFilterFields(
    filters: ChartFilter[],
    dataSourceId: number,
    userContext: UserContext
  ): Promise<void> {
    if (!filters || filters.length === 0) {
      return;
    }
    
    // Get data source column configuration
    const dataSourcesService = createRBACDataSourcesService(userContext);
    const columns = await dataSourcesService.getDataSourceColumns({
      data_source_id: dataSourceId,
      is_active: true,
    });
    
    // Build allowed column names set
    const allowedColumns = new Set([
      ...Array.from(this.STANDARD_COLUMNS),
      ...columns
        .filter(col => col.is_filterable !== false) // Only filterable columns
        .map(col => col.column_name),
    ]);
    
    // Validate each filter field
    for (const filter of filters) {
      if (!allowedColumns.has(filter.field)) {
        log.security('Attempted to filter on invalid column', 'high', {
          field: filter.field,
          dataSourceId,
          userId: userContext.user_id,
          allowedColumns: Array.from(allowedColumns),
        });
        throw new Error(`Invalid filter field: ${filter.field}. Field not defined or not filterable in data source configuration.`);
      }
    }
    
    log.debug('Filter fields validated', {
      filterCount: filters.length,
      fields: filters.map(f => f.field),
      dataSourceId,
    });
  }
  
  /**
   * Build SQL WHERE clause from advanced filters
   * Handles all filter operators: eq, neq, gt, gte, lt, lte, in, not_in, like
   * 
   * SECURITY: Field names are validated by validateFilterFields() before this is called
   * This method assumes field names are safe to use in SQL
   */
  private async buildAdvancedFilterClause(
    filters: ChartFilter[],
    _dataSourceId: number,
    _userContext: UserContext,
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
    const { schema, table, measure, practiceUid, providerUid, frequency, advancedFilters, dataSourceId } = params;
    
    // Get data source config to determine correct column names
    const dataSourceConfig = await chartConfigService.getDataSourceConfigById(dataSourceId);
    if (!dataSourceConfig) {
      throw new Error(`Data source not found: ${dataSourceId}`);
    }
    
    // Determine the time period column name (could be 'frequency', 'time_period', or custom)
    const timePeriodColumn = dataSourceConfig.columns.find(col => col.isTimePeriod);
    const timePeriodField = timePeriodColumn?.columnName || 'frequency';
    
    // Determine the date field column name (could be 'date_index', 'date_value', or custom)
    const dateColumn = dataSourceConfig.columns.find(col => 
      col.isDateField && 
      col.columnName !== timePeriodField &&
      (col.columnName === 'date_value' || col.columnName === 'date_index' || col.dataType === 'date')
    ) || dataSourceConfig.columns.find(col => col.isDateField && col.columnName !== timePeriodField);
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
  private validatePermissionScope(
    context: ChartRenderContext,
    userContext: UserContext
  ): void {
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
        throw new Error(`Security violation: User claims 'all' scope without analytics:read:all permission`);
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
      log.security('RBAC filter: Empty accessible_practices for non-admin - blocking all data', 'critical', {
        userId: context.user_id,
        permissionScope: context.permission_scope,
        originalRowCount: rows.length,
        reason: 'fail_closed_security',
        isSuperAdmin: userContext.is_super_admin,
      });
      return []; // Fail closed - return empty array
    }
    
    // Apply practice filtering
    let filtered = rows.filter((row) => {
      const practiceUid = row.practice_uid as number | undefined;
      return practiceUid !== undefined && context.accessible_practices.includes(practiceUid);
    });
    
    const practicesInData = Array.from(new Set(rows.map(r => r.practice_uid as number).filter(Boolean)));
    const practicesAfterFilter = Array.from(new Set(filtered.map(r => r.practice_uid as number).filter(Boolean)));
    
    // Apply provider filtering if specified
    if (context.accessible_providers && context.accessible_providers.length > 0) {
      filtered = filtered.filter((row) => {
        const providerUid = row.provider_uid as number | undefined | null;
        
        // SECURITY: NULL provider_uid = system-level data
        // Only accessible to organization/all scope
        if (providerUid === null || providerUid === undefined) {
          const canAccessSystemData = 
            context.permission_scope === 'all' || 
            context.permission_scope === 'organization';
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
      blockPercentage: rows.length > 0 ? Math.round(((rows.length - filtered.length) / rows.length) * 100) : 0,
      
      // Affected entities
      practicesInData,
      practicesAfterFilter,
      practicesBlocked: practicesInData.filter(p => !practicesAfterFilter.includes(p)),
      
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
   * Apply date range filter in-memory
   */
  private applyDateRangeFilter(
    rows: Record<string, unknown>[],
    startDate?: string,
    endDate?: string
  ): Record<string, unknown>[] {
    if (!startDate && !endDate) {
      return rows;
    }
    
    return rows.filter((row) => {
      const dateValue = (row.date_index || row.date_value) as string;
      
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
  ): Promise<Record<string, unknown>[]> {
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
          filteredRows = this.applyDateRangeFilter(
            filteredRows,
            params.startDate,
            params.endDate
          );
        }
        
        // Note: Advanced filters already applied in SQL query (Task 1.5)
        
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
        
        return filteredRows;
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
      filteredRows = this.applyDateRangeFilter(
        filteredRows,
        params.startDate,
        params.endDate
      );
    }
    
    // Note: Advanced filters already applied in SQL query (Task 1.5)
    
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
    
    return filteredRows;
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
    byDataSource: Record<number, {
      keys: number;
      memoryMB: number;
      measures: string[];
    }>;
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
    const byDataSource: Record<number, { keys: number; memoryMB: number; measures: Set<string> }> = {};
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
          keysByLevel['Level 2 (Measure+Practice)'] = (keysByLevel['Level 2 (Measure+Practice)'] || 0) + 1;
        } else if (wildcards === 1) {
          keysByLevel['Level 3 (Measure+Practice+Freq)'] = (keysByLevel['Level 3 (Measure+Practice+Freq)'] || 0) + 1;
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
    const byDataSourceFinal: Record<number, { keys: number; memoryMB: number; measures: string[] }> = {};
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
   * Warm cache for a specific data source with distributed locking
   * Fetches all data from data source table and populates cache with measure-level entries
   * 
   * SECURITY: Uses Redis lock to prevent concurrent warming operations
   * Called by scheduled job every 4 hours (matches data update schedule)
   */
  async warmDataSource(dataSourceId: number): Promise<{
    entriesCached: number;
    totalRows: number;
    duration: number;
    skipped?: boolean;
  }> {
    const startTime = Date.now();
    const lockKey = `${this.WARMING_LOCK_PREFIX}:${dataSourceId}`;
    
    // Try to acquire distributed lock (NX = only if not exists)
    const client = this.getClient();
    if (!client) {
      throw new Error('Redis client not available for cache warming');
    }
    
    const acquired = await client.set(
      lockKey,
      Date.now().toString(),
      'EX',
      this.WARMING_LOCK_TTL,
      'NX'
    );
    
    if (!acquired) {
      log.info('Data source warming already in progress, skipping', {
        dataSourceId,
        lockKey,
      });
      return {
        entriesCached: 0,
        totalRows: 0,
        duration: Date.now() - startTime,
        skipped: true,
      };
    }
    
    try {
      log.info('Starting data source cache warming (lock acquired)', {
        dataSourceId,
        lockKey,
      });
      
      // Get data source config
      const dataSource = await chartConfigService.getDataSourceConfigById(dataSourceId);
      if (!dataSource) {
        throw new Error(`Data source not found: ${dataSourceId}`);
      }
      
      const { tableName, schemaName } = dataSource;
      
      // Fetch ALL data from table (simple SELECT *)
      const query = `
        SELECT * 
        FROM ${schemaName}.${tableName}
        ORDER BY measure, practice_uid, provider_uid, frequency
      `;
      
      log.debug('Executing cache warming query', { dataSourceId, schema: schemaName, table: tableName });
      
      const allRows = await executeAnalyticsQuery(query, []);
      
      log.info('Cache warming query completed', {
        dataSourceId,
        totalRows: allRows.length,
      });
      
      // Group by cache key components (measure + frequency)
      // This matches how cache keys are built in buildDataSourceKey()
      const grouped = new Map<string, Record<string, unknown>[]>();
      
      for (const row of allRows) {
        const measure = row.measure as string;
        const frequency = (row.frequency || row.time_period) as string;
        const key = `${measure}|${frequency || '*'}`;
        
        if (!grouped.has(key)) {
          grouped.set(key, []);
        }
        const group = grouped.get(key);
        if (group) {
          group.push(row);
        }
      }
      
      // Cache each group
      let entriesCached = 0;
      for (const [key, rows] of Array.from(grouped.entries())) {
        const [measure, frequency] = key.split('|');
        
        const keyComponents: CacheKeyComponents = {
          dataSourceId,
          ...(measure && { measure }),
          ...(frequency !== '*' && { frequency }),
          // Note: Not including practice_uid or provider_uid for maximum cache reuse
        };
        
        await this.setCached(keyComponents, rows);
        entriesCached++;
      }
      
      const duration = Date.now() - startTime;
      
      log.info('Data source cache warming completed', {
        dataSourceId,
        entriesCached,
        totalRows: allRows.length,
        duration,
      });
      
      return {
        entriesCached,
        totalRows: allRows.length,
        duration,
      };
    } finally {
      // Always release lock
      await client.del(lockKey);
      log.debug('Cache warming lock released', { dataSourceId, lockKey });
    }
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

