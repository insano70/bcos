# Work Items Service Refactoring Plan

**Status:** In Progress
**Started:** 2025-10-16
**Service:** `lib/services/rbac-work-items-service.ts` (1,219 lines)

---

## Objective

Refactor the monolithic `rbac-work-items-service.ts` (1,219 lines) into a modular architecture following the same proven pattern used for organizations service.

### Goals
1. Eliminate permission checking duplication (27 lines)
2. Separate concerns (CRUD vs Hierarchy)
3. Reduce file sizes to manageable levels (<700 lines per file)
4. Maintain 100% backward compatibility
5. Preserve all existing functionality including:
   - Custom fields handling
   - Status transition validation
   - 3-way timing tracking (query + count + customFields)
   - Comprehensive logging with logTemplates

---

## Current State Analysis

### File Structure (Before)
```
lib/services/
├── rbac-work-items-service.ts        (1,219 lines) ❌ Monolithic
└── work-items/
    ├── query-builder.ts               (97 lines) ✅ Already extracted
    └── base-service.ts                (130 lines) ✅ CREATED

lib/types/
└── work-items.ts                      (69 lines) ✅ Already exists
```

### Code Breakdown

**Lines 1-66:** Comments, imports, interface definitions
**Lines 67-94:** Permission checking in constructor (27 lines) ⚠️ DUPLICATED PATTERN
**Lines 103-149:** `buildWorkItemWhereConditions()` helper (47 lines)
**Lines 159-196:** `mapWorkItemResult()` helper (38 lines)
**Lines 205-294:** `getWorkItemById()` method (90 lines)
**Lines 296-362:** `getWorkItemCount()` method (67 lines)
**Lines 364-515:** `getWorkItems()` method (152 lines)
**Lines 517-549:** `getCustomFieldValues()` helper (33 lines)
**Lines 551-719:** `createWorkItem()` method (169 lines)
**Lines 721-827:** `updateWorkItem()` method (107 lines)
**Lines 829-902:** `deleteWorkItem()` method (74 lines)
**Lines 904-990:** `getWorkItemChildren()` method (87 lines)
**Lines 992-1094:** `getWorkItemAncestors()` method (103 lines)
**Lines 1095-1219:** Factory function and exports (125 lines)

---

## Planned Architecture

### File Structure (After)
```
lib/services/work-items/
├── index.ts                           # NEW: Barrel exports (~30 lines)
├── work-items-service.ts              # NEW: Main composite (~150 lines)
├── base-service.ts                    # CREATED ✅: Shared permission logic (130 lines)
├── core-service.ts                    # IN PROGRESS 🔄: CRUD operations (~750 lines)
├── hierarchy-service.ts               # PENDING ⏸️: Parent-child operations (~220 lines)
└── query-builder.ts                   # EXISTS ✅: Query helpers (97 lines)

lib/types/
└── work-items.ts                      # EXISTS ✅: Type definitions (69 lines)
```

---

## Implementation Progress

### ✅ Phase 1: Base Service (COMPLETED)
**File:** [lib/services/work-items/base-service.ts](../../lib/services/work-items/base-service.ts) (130 lines)

**Contents:**
- Extends `BaseRBACService`
- Caches 7 permissions in constructor
- Provides `buildBaseRBACWhereConditions()` method
- Provides `getRBACScope()` and `getManagementRBACScope()` helpers
- Provides `canAccessOrganization()` helper

**Completion Date:** 2025-10-16
**Status:** ✅ Complete, TypeScript verified, linting passed

---

### 🔄 Phase 2: Core Service (IN PROGRESS - BLOCKED)
**File:** `lib/services/work-items/core-service.ts` (~750 lines)

**Target Contents:**
- 6 CRUD methods (getWorkItemById, getWorkItemCount, getWorkItems, createWorkItem, updateWorkItem, deleteWorkItem)
- 3 helper methods (buildWorkItemWhereConditions, mapWorkItemResult, getCustomFieldValues)
- Full logTemplates integration
- 3-way timing tracking
- calculateChanges for audit trail

**Current Status:** INCOMPLETE
- File was partially created but removed due to extraction errors
- Needs complete re-extraction from original service

**Blockers:**
1. Complex business logic must be preserved:
   - Custom fields querying (work_item_field_values table)
   - Status transition validation (work_item_status_transitions table)
   - Hierarchy calculations (depth, path, root_work_item_id)
   - Recursive child deletion

2. Helper method placement decision needed:
   - **Option A:** Keep all helpers in core-service.ts (simpler, but larger file)
   - **Option B:** Move mapWorkItemResult + getCustomFieldValues to base-service.ts as protected methods (allows hierarchy-service to reuse)
   - **Recommendation:** Option B - hierarchy service needs these helpers too

**Next Actions:**
1. Decide on helper method placement (Option A vs Option B)
2. Extract each CRUD method completely with all business logic
3. Verify import order follows STANDARDS.md
4. Add factory function
5. Run TypeScript + linter

---

### ⏸️ Phase 3: Hierarchy Service (NOT STARTED)
**File:** `lib/services/work-items/hierarchy-service.ts` (~220 lines)

**Planned Contents:**
```typescript
class WorkItemHierarchyService extends BaseWorkItemsService {
  async getWorkItemChildren(workItemId: string): Promise<WorkItemWithDetails[]>
  async getWorkItemAncestors(workItemId: string): Promise<WorkItemWithDetails[]>
}
```

**Dependencies:**
- Requires `mapWorkItemResult()` helper
- Requires `getCustomFieldValues()` helper
- Both should be moved to base-service as protected methods

**Cannot Start Until:**
- Core service is complete
- Helper method placement is resolved

---

### ⏸️ Phase 4: Main Composite Service (NOT STARTED)
**File:** `lib/services/work-items/work-items-service.ts` (~150 lines)

Pure delegation service following organizations pattern.

**Cannot Start Until:**
- Core service is complete
- Hierarchy service is complete

---

### ⏸️ Phase 5: Barrel Exports (NOT STARTED)
**File:** `lib/services/work-items/index.ts` (~30 lines)

Standard barrel export file.

---

### ⏸️ Phase 6: Verification (NOT STARTED)
- TypeScript compilation
- Linting
- Import order verification
- Backward compatibility testing

---

### ⏸️ Phase 7: Cleanup (NOT STARTED)
- Delete `rbac-work-items-service.ts`
- Update imports

---

## Key Decisions Required

### Decision 1: Helper Method Placement

**Current Helpers:**
1. `buildWorkItemWhereConditions()` - 47 lines
2. `mapWorkItemResult()` - 38 lines
3. `getCustomFieldValues()` - 33 lines

**Options:**

**Option A: Keep in core-service.ts**
- ✅ Simpler extraction
- ✅ All CRUD logic in one place
- ❌ Hierarchy service can't reuse helpers
- ❌ Slightly larger core-service file

**Option B: Move to base-service.ts as protected methods**
- ✅ Hierarchy service can reuse
- ✅ Better code reuse
- ✅ Follows DRY principle
- ❌ More complex extraction
- ❌ Base service grows to ~250 lines

**Recommendation:** Option B
- Hierarchy service needs `mapWorkItemResult` and `getCustomFieldValues`
- Better long-term maintainability
- Follows organizations service pattern

---

## Original Plan vs Current Reality

### Original Plan (from initial analysis)
```
lib/services/work-items/
├── base-service.ts              ~130 lines ✅ DONE
├── core-service.ts              ~700 lines 🔄 IN PROGRESS
├── hierarchy-service.ts         ~250 lines ⏸️ PENDING
├── work-items-service.ts        ~100 lines ⏸️ PENDING
└── index.ts                     ~30 lines  ⏸️ PENDING

Total: ~1,210 lines (vs 1,219 original)
```

### Current Reality
- Base service: ✅ Complete (130 lines)
- Core service: 🔄 Blocked on helper method placement decision
- Hierarchy service: ⏸️ Waiting for core service
- Main service: ⏸️ Waiting for core + hierarchy
- Index: ⏸️ Waiting for all services

---

## Principles Being Followed

From [CLAUDE.md](../../CLAUDE.md):

1. **Quality Over Speed** (line 24)
   - ✅ No shortcuts
   - ✅ Taking time to do things correctly
   - ✅ No "lazy" script-based approaches

2. **Type Safety** (line 18)
   - ✅ No `any` types in base-service.ts
   - ⏳ Will verify in core-service.ts

3. **Logging Standards** (line 181)
   - ⏳ All CRUD must use logTemplates
   - ⏳ All errors must include error object

4. **File Naming** (line 331)
   - ✅ No buzzwords
   - ✅ Plain descriptive names

From [docs/services/STANDARDS.md](../services/STANDARDS.md):

1. **Import Order** (line 526)
   - ✅ Followed in base-service.ts
   - ⏳ Must follow in core-service.ts

2. **Hybrid Pattern** (line 62)
   - ✅ Using internal class + factory

3. **Permission Caching** (line 599)
   - ✅ Done in base-service constructor

4. **Database Filtering** (line 628)
   - ✅ buildBaseRBACWhereConditions() in base-service

---

## Remaining Work Estimate

### If Option A (helpers in core-service):
- Core service extraction: 3-4 hours
- Hierarchy service: 1 hour
- Main service: 30 minutes
- Testing & verification: 1 hour
- **Total:** ~6 hours

### If Option B (helpers in base-service):
- Move helpers to base-service: 1 hour
- Core service extraction: 3-4 hours
- Hierarchy service: 45 minutes
- Main service: 30 minutes
- Testing & verification: 1 hour
- **Total:** ~6.5 hours

---

## Next Session Checklist

**Before starting:**
- [ ] Make decision on helper method placement (A or B)
- [ ] Read this document completely
- [ ] Review [rbac-work-items-service.ts](../../lib/services/rbac-work-items-service.ts) structure

**During core-service extraction:**
- [ ] Extract getWorkItemById (lines 205-294)
- [ ] Extract getWorkItemCount (lines 296-362)
- [ ] Extract getWorkItems (lines 364-515)
- [ ] Extract createWorkItem (lines 551-719)
- [ ] Extract updateWorkItem (lines 721-827)
- [ ] Extract deleteWorkItem (lines 829-902)
- [ ] Add all 3 helper methods
- [ ] Fix import order with section comments
- [ ] Add factory function
- [ ] Verify TypeScript compiles
- [ ] Verify linting passes

**After core-service complete:**
- [ ] Extract hierarchy service
- [ ] Create main composite service
- [ ] Create index.ts
- [ ] Run all verifications
- [ ] Delete old service

---

**Last Updated:** 2025-10-16 22:20 UTC
**Status:** Awaiting decision on helper method placement
