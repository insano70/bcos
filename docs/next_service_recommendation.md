# Next Service Migration Recommendation

**Date**: 2025-10-14
**Current Progress**: 4/15 services completed (27%)
**Last Completed**: rbac-practices-service.ts (Grade A, 2 hours)

---

## Executive Summary

**Recommended Next Service**: `rbac-organizations-service.ts`

**Rationale**:
- ✅ Already correct file size (675 lines)
- ✅ No split required - pure conversion
- ✅ Medium complexity (hierarchy logic)
- ✅ High business value (organization access control)
- ✅ Builds on practices migration patterns
- ✅ Estimated 3-4 hours (fast win)

---

## Candidate Services Analysis

### Option 1: rbac-organizations-service.ts ⭐ **RECOMMENDED**

**File**: [lib/services/rbac-organizations-service.ts](../lib/services/rbac-organizations-service.ts)
**Lines**: 675 (175 over limit but acceptable for hierarchy complexity)
**Pattern**: Class-based (extends BaseRBACService) ❌

#### Current Assessment
- **Score**: 5/10
- **Pattern**: Class-based with BaseRBACService inheritance
- **Complexity**: Medium (organization hierarchy, parent-child relationships)
- **Dependencies**: `organization-hierarchy.ts` helper functions

#### Migration Scope
**No split required** - Pure pattern conversion:
1. Convert class → hybrid pattern (internal class + factory)
2. Remove BaseRBACService inheritance
3. Add logTemplates for CRUD operations
4. Add calculateChanges for updates
5. Move permission checks to constructor
6. Add comprehensive JSDoc
7. Integrate SLOW_THRESHOLDS
8. Maintain hierarchy helpers integration

#### Estimated Effort
- **Optimistic**: 3 hours
- **Realistic**: 4 hours
- **Pessimistic**: 6 hours
- **Confidence**: High (similar to practices)

#### Risk Assessment
- **Technical Risk**: LOW
  - Size already acceptable
  - Clear CRUD pattern
  - Hierarchy helpers already extracted
  - No analytics to split
- **Business Risk**: MEDIUM
  - Core to multi-tenancy
  - Used for access control
  - Breaking changes impact all users
- **Integration Risk**: LOW
  - Well-defined API surface
  - Limited external dependencies

#### Pros
- ✅ File size compliant (no split needed)
- ✅ Fast migration (3-4 hours estimated)
- ✅ High business value (security boundaries)
- ✅ Builds confidence with hierarchy patterns
- ✅ Phase 2 service (natural progression)
- ✅ Comprehensive test coverage possible

#### Cons
- ⚠️ Hierarchy logic adds complexity
- ⚠️ Critical to security (must maintain RBAC correctly)
- ⚠️ Parent-child relationships need careful testing

---

### Option 2: rbac-dashboards-service.ts

**File**: [lib/services/rbac-dashboards-service.ts](../lib/services/rbac-dashboards-service.ts)
**Lines**: 1,011 (511 over limit)
**Pattern**: Class-based (extends BaseRBACService) ❌

#### Current Assessment
- **Score**: 4/10
- **Pattern**: Class-based
- **Issues**:
  - Excessive logging anti-pattern (9 log statements in createDashboard)
  - Chart management mixed with dashboard CRUD (lines 747-857)
  - File size violation

#### Migration Scope
**Requires split** (2 services):
1. `rbac-dashboards-service.ts` (dashboard CRUD) - ~450 lines
2. `dashboard-chart-associations-service.ts` (chart management) - ~350 lines
3. Fix excessive logging (replace with logTemplates)
4. All standard hybrid pattern work

#### Estimated Effort
- **Optimistic**: 6 hours
- **Realistic**: 8 hours
- **Pessimistic**: 12 hours

#### Risk Assessment
- **Technical Risk**: MEDIUM (split required, logging anti-pattern)
- **Business Risk**: MEDIUM (used in admin UI)
- **Integration Risk**: MEDIUM (two services means more API updates)

#### Pros
- ✅ Fixes excessive logging problem
- ✅ Clean separation of concerns (dashboard vs chart associations)
- ✅ Phase 2 service

#### Cons
- ❌ Requires split (more complex)
- ❌ Excessive logging needs careful refactoring
- ❌ Longer migration time (8 hours vs 4)
- ❌ More integration points to update

---

### Option 3: rbac-users-service.ts

**File**: [lib/services/rbac-users-service.ts](../lib/services/rbac-users-service.ts)
**Lines**: 1,029 (529 over limit)
**Pattern**: Class-based (extends BaseRBACService) ❌

#### Current Assessment
- **Score**: 4.5/10
- **Pattern**: Class-based
- **Issues**:
  - Large file size
  - Analytics methods mixed with CRUD
  - Inconsistent logging
  - Widely used across codebase

#### Migration Scope
**Requires 3-way split**:
1. `rbac-users-service.ts` (CRUD only) - ~450 lines
2. `user-analytics-service.ts` (analytics) - ~300 lines
3. `user-organization-service.ts` (org membership) - ~200 lines

#### Estimated Effort
- **Optimistic**: 10 hours
- **Realistic**: 12 hours
- **Pessimistic**: 15 hours

#### Risk Assessment
- **Technical Risk**: HIGH (3-way split, complex CRUD)
- **Business Risk**: CRITICAL (core user management)
- **Integration Risk**: HIGH (used everywhere)

#### Pros
- ✅ High impact when complete
- ✅ Phase 3 critical service

#### Cons
- ❌ Most complex migration yet (3 services)
- ❌ Longest time estimate (12 hours)
- ❌ Highest risk (widely used)
- ❌ Should wait until more patterns established

---

## Recommendation Matrix

| Service | Lines | Split? | Effort | Risk | Priority | Score |
|---------|-------|--------|--------|------|----------|-------|
| **Organizations** ⭐ | 675 | No | 4h | LOW | HIGH | **9/10** |
| Dashboards | 1,011 | Yes (2) | 8h | MEDIUM | MEDIUM | 6/10 |
| Users | 1,029 | Yes (3) | 12h | HIGH | CRITICAL | 4/10 |

---

## Migration Plan: rbac-organizations-service.ts

### Phase 1: Analysis & Preparation (30 min)
1. Read full service code (675 lines)
2. Document all public methods
3. Identify hierarchy helper dependencies
4. Create test scenarios
5. Backup original file

### Phase 2: Pattern Conversion (2 hours)
1. Convert BaseRBACService class → internal class
2. Remove inheritance, inline permission checks
3. Move permission checks to constructor
4. Export interface
5. Add factory function
6. Maintain hierarchy helper integration

### Phase 3: Observability (1 hour)
1. Add logTemplates.crud.* for all CRUD operations
2. Add calculateChanges for updates
3. Add SLOW_THRESHOLDS performance tracking
4. Add 2-way timing (count + query) for list operations
5. Component tagging: `component: 'service'`

### Phase 4: Documentation & Testing (1 hour)
1. Add comprehensive JSDoc (class + methods)
2. Run `pnpm tsc --noEmit`
3. Run `pnpm lint`
4. Manual testing with hierarchy scenarios
5. Update STANDARDIZATION_PROGRESS.md

### Total Estimated Time: 4.5 hours

---

## Key Patterns to Apply

### 1. Hierarchy Helper Integration

**Current Pattern** (uses helper functions):
```typescript
import { getOrganizationChildren, getOrganizationHierarchy } from '@/lib/rbac/organization-hierarchy';
```

**Maintain This Pattern** - Don't inline these helpers, they're reusable:
```typescript
// In hybrid service
async getOrganizationWithChildren(orgId: string) {
  // Use existing helper
  const children = await getOrganizationChildren(orgId, this.userContext);
  // ... rest of logic
}
```

### 2. Parent-Child Validation

Ensure RBAC checks work correctly:
```typescript
// Must verify user has access to parent before allowing child creation
async createOrganization(data: CreateOrganizationData) {
  if (data.parent_organization_id) {
    // Verify access to parent
    const parent = await this.getOrganizationById(data.parent_organization_id);
    if (!parent) {
      throw NotFoundError('Parent organization');
    }
  }
  // ... create logic
}
```

### 3. Logging Hierarchy Operations

Use metadata to track parent-child relationships:
```typescript
const logTemplate = logTemplates.crud.create('organization', {
  resourceId: created.organization_id,
  resourceName: created.name,
  userId: this.userContext.user_id,
  duration,
  metadata: {
    slug: created.slug,
    parentOrganizationId: created.parent_organization_id,  // Track hierarchy
    level: calculateLevel(created),  // Useful for debugging
    component: 'service',
  },
});
```

---

## Success Criteria

### Must Have
- ✅ All TypeScript compilation passes
- ✅ All linting passes
- ✅ Hybrid pattern implemented
- ✅ logTemplates integrated
- ✅ calculateChanges in updates
- ✅ SLOW_THRESHOLDS tracking
- ✅ Hierarchy operations preserved

### Should Have
- ✅ Comprehensive JSDoc
- ✅ 2-way timing (count + query)
- ✅ Component tags standardized
- ✅ RBAC scope in all metadata

### Nice to Have
- ✅ Query builder if duplication found
- ✅ Helper methods for complex operations
- ✅ Example usage in JSDoc

---

## Alternative Paths

### If Organizations Blocked
1. **Plan B**: Migrate `rbac-templates-service.ts` (~400 lines estimated)
   - Simpler domain
   - No hierarchy
   - Lower risk
   - Similar patterns to practices

2. **Plan C**: Migrate smaller work-items auxiliary services
   - `rbac-work-item-statuses-service.ts`
   - `rbac-work-item-types-service.ts`
   - Build familiarity with work items domain

---

## Expected Outcomes

### Upon Completion
- **Progress**: 5/15 services (33% complete)
- **Phase 2**: 2/3 complete (67%)
- **Patterns Validated**:
  - ✅ Simple services (chart definitions)
  - ✅ Complex services (staff members)
  - ✅ Analytics split (practices)
  - ✅ Hierarchy services (organizations) ← NEW
- **Estimated Time**: 4 hours
- **Compliance Score**: 55% → 58%

### Lessons to Learn
1. How to handle hierarchy helper integration
2. Parent-child RBAC validation patterns
3. Logging for tree structures
4. Testing recursive operations

---

## Timeline

| Task | Duration | Start | End |
|------|----------|-------|-----|
| Read & analyze | 30 min | - | - |
| Pattern conversion | 2 hours | - | - |
| Observability | 1 hour | - | - |
| Documentation & testing | 1 hour | - | - |
| **TOTAL** | **4.5 hours** | - | - |

---

## Decision

**Proceed with rbac-organizations-service.ts migration**

**Reasoning**:
1. Natural progression from practices (both Phase 2)
2. No split required (faster, less risk)
3. Builds hierarchy pattern experience
4. File size already compliant
5. High business value (multi-tenancy core)
6. Estimated 4 hours (quick win)

**Next Steps**:
1. Create backup of original file
2. Begin Phase 1: Analysis
3. Follow migration plan above
4. Complete within single session if possible

---

**Prepared by**: Claude Code
**Based on**: STANDARDIZATION_PROGRESS.md v1.2
**Reference**: Practices migration (2 hours, Grade A)
