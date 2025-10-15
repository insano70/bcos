# CRITICAL SECURITY FIXES - Redis Cache Implementation

**Date:** October 15, 2025  
**Status:** MUST BE APPLIED BEFORE IMPLEMENTATION  
**Priority:** CRITICAL

---

## 🚨 CRITICAL VULNERABILITY #1: Empty accessible_practices Bypass

### **The Problem**

Current plan (lines 662-666):
```typescript
if (context.accessible_practices && context.accessible_practices.length > 0) {
  filtered = filtered.filter((row) => {
    const practiceUid = row.practice_uid as number | undefined;
    return practiceUid !== undefined && context.accessible_practices.includes(practiceUid);
  });
}
```

**API endpoints currently pass empty arrays:**
```typescript
const chartContext: ChartRenderContext = {
  user_id: userContext.user_id,
  accessible_practices: [], // ❌ EMPTY - NO FILTERING APPLIED!
  accessible_providers: [],
  roles: userContext.roles?.map((role) => role.name) || [],
};
```

### **Security Impact**

**If `accessible_practices` = `[]`:**
1. Array exists (truthy) ✓
2. But `length > 0` = false ✗
3. **NO FILTERING APPLIED** 🚨
4. **User receives ALL unfiltered data**

### **The Fix**

```typescript
/**
 * Apply RBAC filtering with FAIL-CLOSED security
 * CRITICAL: Non-admin users with empty accessible_practices get NO DATA
 */
private applyRBACFilter(
  rows: Record<string, unknown>[],
  context: ChartRenderContext
): Record<string, unknown>[] {
  const startTime = Date.now();
  
  // SECURITY: Validate permission scope first
  this.validatePermissionScope(context);
  
  // Super admin with 'all' scope: no filtering
  if (context.permission_scope === 'all') {
    log.security('RBAC filter: all scope, no filtering', 'info', {
      userId: context.user_id,
      rowCount: rows.length,
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
    });
    return []; // Fail closed - return empty array
  }
  
  // Apply practice filtering
  let filtered = rows.filter((row) => {
    const practiceUid = row.practice_uid as number | undefined;
    return practiceUid !== undefined && context.accessible_practices.includes(practiceUid);
  });
  
  // Apply provider filtering if specified
  if (context.accessible_providers && context.accessible_providers.length > 0) {
    filtered = filtered.filter((row) => {
      const providerUid = row.provider_uid as number | undefined | null;
      
      // NULL provider_uid = system-level data
      // Only accessible to organization/all scope
      if (providerUid === null || providerUid === undefined) {
        return context.permission_scope === 'all' || context.permission_scope === 'organization';
      }
      
      return context.accessible_providers.includes(providerUid);
    });
  }
  
  const duration = Date.now() - startTime;
  
  // Enhanced audit logging
  log.security('RBAC filtering completed', rows.length === filtered.length ? 'info' : 'medium', {
    userId: context.user_id,
    permissionScope: context.permission_scope,
    originalRowCount: rows.length,
    filteredRowCount: filtered.length,
    rowsBlocked: rows.length - filtered.length,
    duration,
    allDataBlocked: rows.length > 0 && filtered.length === 0,
  });
  
  return filtered;
}
```

---

## 🔴 FIX #2: Permission Scope Validation (Permission-Based, Not Role-Based)

### **The Correct Approach**

Validate `permission_scope` against **actual permissions**, not roles (except `super_admin` special case).

```typescript
/**
 * Validate permission scope matches user's actual analytics permissions
 * SECURITY: Prevents permission_scope spoofing
 */
private validatePermissionScope(context: ChartRenderContext): void {
  const permissionChecker = new PermissionChecker({
    user_id: context.user_id,
    roles: context.roles?.map(name => ({ name, permissions: [] })) || [],
    permissions: [], // Would need actual permissions from context
    is_super_admin: context.roles?.includes('super_admin') || false,
  });
  
  // Special case: super_admin is unique and always gets 'all' scope
  if (context.roles?.includes('super_admin')) {
    if (context.permission_scope !== 'all') {
      log.security('super_admin with non-all scope', 'high', {
        userId: context.user_id,
        claimedScope: context.permission_scope,
      });
      throw new Error(`Security violation: super_admin must have 'all' scope`);
    }
    return; // Valid
  }
  
  // Validate scope matches analytics permissions
  if (context.permission_scope === 'all') {
    // Must have analytics:read:all permission
    const hasAllPermission = permissionChecker.hasPermission('analytics:read:all');
    if (!hasAllPermission) {
      log.security('Permission scope spoofing detected', 'critical', {
        userId: context.user_id,
        claimedScope: 'all',
        actualPermissions: 'not analytics:read:all',
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
      });
      throw new Error(`Security violation: Invalid organization scope`);
    }
  }
  
  // Note: 'own' scope validation would check analytics:read:own
}
```

**Better Solution: Pass UserContext instead of ChartRenderContext**

The real fix is to pass `UserContext` (which has permissions) to the cache service, not just `ChartRenderContext`. This allows proper permission validation.

```typescript
// Task 1.7 signature change:
async fetchDataSource(
  params: CacheQueryParams,
  userContext: UserContext, // ← Pass full UserContext, not ChartRenderContext
  nocache: boolean = false
): Promise<Record<string, unknown>[]> {
  // Build ChartRenderContext from UserContext (with validation)
  const context = await this.buildChartContext(userContext);
  
  // Now we can validate permission_scope against userContext.permissions
  this.validatePermissionScope(context, userContext);
  
  // ... rest of method
}
```

---

## 🔴 FIX #3: Dynamic Column Validation (Data Source Aware)

### **The Problem**

Cannot hard-code allowed columns (except practice_uid, provider_uid, measure, frequency).

### **The Fix**

```typescript
/**
 * Standard columns that always exist
 */
private readonly STANDARD_COLUMNS = new Set([
  'practice_uid',
  'provider_uid', 
  'measure',
  'frequency',
  'time_period', // Alternative to frequency
]);

/**
 * Validate advanced filter fields against data source column configuration
 * SECURITY: Prevents SQL injection via custom column names
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
    ...this.STANDARD_COLUMNS,
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
      throw new Error(`Invalid filter field: ${filter.field}`);
    }
  }
}

/**
 * Build SQL WHERE clause from advanced filters (with validation)
 */
private async buildAdvancedFilterClause(
  filters: ChartFilter[],
  dataSourceId: number,
  userContext: UserContext,
  startIndex: number
): Promise<{ clause: string; params: unknown[]; nextIndex: number }> {
  // SECURITY: Validate filter fields first
  await this.validateFilterFields(filters, dataSourceId, userContext);
  
  const clauses: string[] = [];
  const params: unknown[] = [];
  let paramIndex = startIndex;
  
  for (const filter of filters) {
    // Field name is now validated - safe to use in SQL
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
          // SECURITY: Empty array = fail closed
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
 * Query database with validated filters (UPDATED)
 */
private async queryDatabase(
  params: CacheQueryParams,
  userContext: UserContext // ← Need UserContext for validation
): Promise<Record<string, unknown>[]> {
  const { schema, table, measure, practiceUid, providerUid, frequency, advancedFilters, dataSourceId } = params;
  
  // ... existing WHERE clause building ...
  
  // CRITICAL: Validate and apply advanced filters
  if (advancedFilters && advancedFilters.length > 0) {
    const advancedResult = await this.buildAdvancedFilterClause(
      advancedFilters,
      dataSourceId,
      userContext, // Pass UserContext for validation
      paramIndex
    );
    if (advancedResult.clause) {
      whereClauses.push(advancedResult.clause);
      queryParams.push(...advancedResult.params);
      paramIndex = advancedResult.nextIndex;
    }
  }
  
  // ... rest of method
}
```

**Update CacheQueryParams interface:**

```typescript
export interface CacheQueryParams {
  dataSourceId: number; // Required for column validation
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
```

---

## 🔴 FIX #4: Cache Warming Race Condition

```typescript
private readonly WARMING_LOCK_PREFIX = 'datasource:warming:lock';
private readonly WARMING_LOCK_TTL = 300; // 5 minutes

/**
 * Warm cache with distributed locking
 */
async warmDataSource(dataSourceId: number): Promise<{
  entriesCached: number;
  totalRows: number;
  duration: number;
  skipped?: boolean;
}> {
  const lockKey = `${this.WARMING_LOCK_PREFIX}:${dataSourceId}`;
  
  // Try to acquire lock (NX = only if not exists)
  const client = this.getClient();
  if (!client) {
    throw new Error('Redis client not available');
  }
  
  const acquired = await client.set(lockKey, Date.now().toString(), 'EX', this.WARMING_LOCK_TTL, 'NX');
  
  if (!acquired) {
    log.info('Data source warming already in progress, skipping', { dataSourceId });
    return { entriesCached: 0, totalRows: 0, duration: 0, skipped: true };
  }
  
  try {
    // ... existing warming logic ...
  } finally {
    // Always release lock
    await client.del(lockKey);
  }
}
```

---

## 🔴 FIX #5: API Endpoints Security

**Create shared helper:**

```typescript
// lib/utils/chart-context.ts (NEW FILE)
import type { UserContext, ChartRenderContext } from '@/lib/types/rbac';
import { createOrganizationAccessService } from '@/lib/services/organizations/access-service';

/**
 * Build ChartRenderContext from UserContext with proper RBAC
 * USE THIS IN ALL API ENDPOINTS
 */
export async function buildChartRenderContext(userContext: UserContext): Promise<ChartRenderContext> {
  const accessService = createOrganizationAccessService(userContext);
  const practiceAccess = await accessService.getAccessiblePracticeUids();
  const providerAccess = await accessService.getAccessibleProviderUid();
  
  return {
    user_id: userContext.user_id,
    accessible_practices: practiceAccess.practiceUids,
    accessible_providers: providerAccess.providerUid ? [providerAccess.providerUid] : [],
    roles: userContext.roles?.map((role) => role.name) || [],
    permission_scope: practiceAccess.scope,
    organization_ids: practiceAccess.organizationIds,
    includes_hierarchy: practiceAccess.includesHierarchy,
    provider_uid: providerAccess.providerUid,
  };
}
```

**Update all API endpoints:**

```typescript
// app/api/admin/analytics/measures/route.ts

// BEFORE (INSECURE):
const chartContext: ChartRenderContext = {
  user_id: userContext.user_id,
  accessible_practices: [], // ❌ SECURITY VULNERABILITY
  accessible_providers: [],
  roles: userContext.roles?.map((role) => role.name) || [],
};

// AFTER (SECURE):
import { buildChartRenderContext } from '@/lib/utils/chart-context';

const chartContext = await buildChartRenderContext(userContext); // ✅
```

**Files to update:**
- `app/api/admin/analytics/measures/route.ts`
- `app/api/admin/analytics/chart-data/route.ts`
- Any other API endpoints constructing ChartRenderContext

---

## 📋 IMPLEMENTATION CHECKLIST

### **Phase 0: Security Foundations (NEW - 2 hours)**

- [ ] **Task 0.1:** Create `lib/utils/chart-context.ts` with `buildChartRenderContext()`
- [ ] **Task 0.2:** Update API endpoints to use `buildChartRenderContext()`
  - [ ] `app/api/admin/analytics/measures/route.ts`
  - [ ] `app/api/admin/analytics/chart-data/route.ts`
- [ ] **Task 0.3:** Update `CacheQueryParams` interface to require `dataSourceId`
- [ ] **Task 0.4:** Update cache service signatures to accept `UserContext` (not just ChartRenderContext)

### **Phase 1: Core Cache Service (Updated)**

- [ ] **Task 1.5:** Add `validateFilterFields()` method with dynamic column validation
- [ ] **Task 1.5:** Update `buildAdvancedFilterClause()` to call `validateFilterFields()`
- [ ] **Task 1.5:** Update `queryDatabase()` signature to accept `UserContext`
- [ ] **Task 1.6:** Add `validatePermissionScope()` with permission-based validation
- [ ] **Task 1.6:** Update `applyRBACFilter()` with fail-closed security
- [ ] **Task 1.7:** Update `fetchDataSource()` to pass `UserContext` to `queryDatabase()`
- [ ] **Task 1.10:** Add distributed locking to `warmDataSource()`

### **Phase 3: Security Testing (CRITICAL - MUST PASS)**

- [ ] **Test:** Empty `accessible_practices` returns empty array (not all data)
- [ ] **Test:** `permission_scope='all'` without proper permission → throws error
- [ ] **Test:** NULL `provider_uid` with provider scope → blocked
- [ ] **Test:** Invalid column name in `advancedFilters` → throws error
- [ ] **Test:** Concurrent cache warming → only one proceeds
- [ ] **Test:** Practice user cannot see other practices via shared cache
- [ ] **Test:** Dynamic column validation works with custom data sources

---

## 🎯 REVISED TIME ESTIMATE

| Phase | Original | Security Additions | New Total |
|-------|----------|-------------------|-----------|
| **Phase 0** | - | +2 hours (foundations) | **2 hours** |
| **Phase 1** | 5.5-6.5 hours | +1.5 hours (hardening) | **7-8 hours** |
| **Phase 2** | 3-4 hours | - (fixed in Phase 0) | **3-4 hours** |
| **Phase 3** | 3-4 hours | +1 hour (security tests) | **4-5 hours** |
| **Phase 4** | 1 hour | +0.5 hours (docs) | **1.5 hours** |
| **TOTAL** | **12.5-15.5 hours** | **+5 hours** | **17.5-20.5 hours** |

---

## ✅ CRITICAL REQUIREMENTS

1. **FAIL CLOSED:** Empty `accessible_practices` for non-admin = NO DATA
2. **PERMISSION VALIDATION:** `permission_scope` validated against actual permissions
3. **DYNAMIC COLUMNS:** Column validation uses data source configuration
4. **DISTRIBUTED LOCKING:** Cache warming uses Redis locks
5. **API CONSISTENCY:** All endpoints use `buildChartRenderContext()`
6. **AUDIT LOGGING:** All RBAC filtering logged with security level
7. **NULL HANDLING:** NULL `provider_uid` restricted to org/all scope

**DO NOT PROCEED WITHOUT THESE FIXES.**

