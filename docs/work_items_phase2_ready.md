# Work Items Phase 2 - Ready to Execute

**Status**: Ready to Start | **Created**: 2025-01-13
**Prerequisites**: ✅ Phase 1 Complete | **Branch**: `refactor/work-items-phase-1`

---

## Phase 2 Overview

**Goal**: Migrate remaining 4 CRUD methods + 2 helper methods to complete core service

**Estimated Time**: 10-12 hours
**Current Progress**: Phase 1 Complete (2/6 methods), Infrastructure ready

---

## What's Ready

### ✅ Phase 1 Complete
- `getWorkItemById` - Fully migrated with logTemplates
- `getWorkItemCount` - Fully migrated with structured logging
- Query builder helper (97 lines)
- Types file (69 lines)
- New service skeleton (358 lines)

### ✅ Phase 2 Prepared
- 31 detailed todos created
- Methods analyzed and documented
- Patterns established from Phase 1
- Branch ready: `refactor/work-items-phase-1`

---

## Methods to Migrate

### 1. getWorkItems (Lines 101-279)
**Complexity**: HIGH - 182 lines
**Estimated Time**: 3-4 hours

**Key Requirements**:
- Add logTemplates.crud.list
- Separate count query timing (currently missing count query)
- Separate list query timing
- Custom fields fetch timing
- SLOW_THRESHOLDS on all queries
- Pagination support (limit/offset)
- Search support (subject + description)
- Sort support (6 columns)
- Filter support (8 filters)

**Current Issues**:
- No count query (missing total)
- Uses old query builder (not our new helper)
- No performance tracking
- Manual result mapping

**Migration Strategy**:
```typescript
async getWorkItems(options: WorkItemQueryOptions = {}) {
  const startTime = Date.now();

  // Count query with timing
  const countStart = Date.now();
  const [countResult] = await db.select({ count: count() })...;
  const countDuration = Date.now() - countStart;

  // List query with timing
  const queryStart = Date.now();
  const results = await getWorkItemQueryBuilder()
    .where(and(...this.buildWorkItemWhereConditions(options)))
    .orderBy(...)
    .limit(options.limit || 50)
    .offset(options.offset || 0);
  const queryDuration = Date.now() - queryStart;

  // Custom fields with timing
  const customFieldsStart = Date.now();
  const customFieldsMap = await this.getCustomFieldValues(workItemIds);
  const customFieldsDuration = Date.now() - customFieldsStart;

  const duration = Date.now() - startTime;

  const template = logTemplates.crud.list('work_items', {
    userId: this.userContext.user_id,
    filters: { /* sanitize options */ },
    results: { returned: results.length, total: countResult.count, page: ... },
    duration,
    metadata: {
      countDuration,
      queryDuration,
      customFieldsDuration,
      slowCount: countDuration > SLOW_THRESHOLDS.DB_QUERY,
      slowQuery: queryDuration > SLOW_THRESHOLDS.DB_QUERY,
      slowCustomFields: customFieldsDuration > SLOW_THRESHOLDS.DB_QUERY,
      rbacScope: this.canReadAll ? 'all' : ...,
    },
  });

  log.info(template.message, template.context);
  return results.map(r => this.mapWorkItemResult(r, customFieldsMap.get(r.work_item_id)));
}
```

---

### 2. createWorkItem (Lines 398-542)
**Complexity**: HIGH - 145 lines
**Estimated Time**: 2-3 hours

**Key Requirements**:
- Add logTemplates.crud.create
- Track: default status query, max depth query, insert query, path update query
- **BREAKING CHANGE**: Remove autoCreateChildItems call (line 535-538)
- SLOW_THRESHOLDS on all queries
- Hierarchy calculation (parent_work_item_id, depth, path)

**Breaking Change Documentation**:
```typescript
// OLD (in service):
const newWorkItem = await createWorkItem(data);
// Auto-creation happens inside service

// NEW (in API route):
const newWorkItem = await workItemsService.createWorkItem(data);
// Then explicitly call automation service if needed:
if (shouldAutoCreate) {
  await automationService.autoCreateChildItems(newWorkItem.work_item_id);
}
```

---

### 3. updateWorkItem (Lines 725-914)
**Complexity**: VERY HIGH - 190 lines
**Estimated Time**: 3-4 hours

**Key Requirements**:
- Add logTemplates.crud.update
- Add calculateChanges for audit trail
- Track: fetch existing, validate status, update query
- **BREAKING CHANGE**: Remove notification calls (lines 880-910)
- SLOW_THRESHOLDS on all queries
- Status validation logic (calls validateStatusTransition)

**Breaking Change Documentation**:
```typescript
// OLD (in service):
const updated = await updateWorkItem(id, data);
// Notifications sent inside service

// NEW (in API route):
const updated = await workItemsService.updateWorkItem(id, data);
// Then explicitly call notification helper:
if (updated.status_id !== existing.status_id) {
  await notificationHelper.notifyStatusChange(updated);
}
```

---

### 4. deleteWorkItem (Lines 916-963)
**Complexity**: LOW - 48 lines
**Estimated Time**: 1 hour

**Key Requirements**:
- Add logTemplates.crud.delete with `soft: true`
- Track: fetch existing, delete query (sets deleted_at)
- SLOW_THRESHOLDS on queries
- Simple soft delete

---

### 5. getCustomFieldValues (Lines 1401-1424)
**Complexity**: LOW - 24 lines
**Estimated Time**: 30 minutes

**Key Requirements**:
- Move to new service as private method
- Add SLOW_THRESHOLDS tracking
- Already well-structured

---

### 6. validateStatusTransition (Lines 1430-1460)
**Complexity**: MEDIUM - 31 lines
**Estimated Time**: 1 hour

**Key Requirements**:
- Move to new service as private method
- Add SLOW_THRESHOLDS tracking
- Used by updateWorkItem

---

## Expected Final State

### File: rbac-work-items-service-new.ts
**Estimated Lines**: 650-700
**Methods**: 6 public + 3 private helpers
**Compliance**: 10/10

**Structure**:
```typescript
class WorkItemsService {
  // Constructor with cached permissions
  private readonly canReadAll: boolean;
  private readonly canReadOwn: boolean;
  private readonly canReadOrg: boolean;
  private readonly canManageWorkItems: boolean;
  private readonly accessibleOrgIds: string[];

  constructor(userContext: UserContext) { ... }

  // Helper methods
  private buildWorkItemWhereConditions() { ... }
  private mapWorkItemResult() { ... }
  private async getCustomFieldValues() { ... }
  private async validateStatusTransition() { ... }

  // Public CRUD methods
  async getWorkItems() { ... }        // Phase 2
  async getWorkItemById() { ... }     // Phase 1 ✅
  async createWorkItem() { ... }      // Phase 2
  async updateWorkItem() { ... }      // Phase 2
  async deleteWorkItem() { ... }      // Phase 2
  async getWorkItemCount() { ... }    // Phase 1 ✅
}

export function createRBACWorkItemsService(userContext: UserContext) {
  return new WorkItemsService(userContext);
}
```

---

## Breaking Changes Summary

### 1. Auto-Creation Removal
**Location**: `createWorkItem` method
**Impact**: API routes must explicitly call automation service
**Files Affected**: `app/api/work-items/route.ts`

### 2. Notification Removal
**Location**: `updateWorkItem` method
**Impact**: API routes must explicitly call notification helper
**Files Affected**: `app/api/work-items/[id]/route.ts`

---

## Todo List (31 tasks)

All 31 tasks are documented and ready to execute. Key milestones:

- [ ] Tasks 1-7: getWorkItems migration (3-4 hours)
- [ ] Tasks 8-12: createWorkItem migration (2-3 hours)
- [ ] Tasks 13-19: updateWorkItem migration (3-4 hours)
- [ ] Tasks 20-23: deleteWorkItem migration (1 hour)
- [ ] Tasks 24-31: Integration & validation (2 hours)

---

## Success Criteria

- [ ] All 6 CRUD methods migrated
- [ ] All methods use logTemplates
- [ ] calculateChanges in updateWorkItem
- [ ] 10+ queries tracked with SLOW_THRESHOLDS
- [ ] File under 700 lines (acceptable for 6 methods + helpers)
- [ ] TypeScript compilation passes
- [ ] Linting passes
- [ ] Breaking changes documented
- [ ] API route migration guide created

---

## Next Steps

When ready to continue Phase 2:

1. Checkout branch: `git checkout refactor/work-items-phase-1`
2. Open service file: `lib/services/rbac-work-items-service-new.ts`
3. Execute todos sequentially
4. Test after each method migration
5. Update progress document

---

**Ready for Phase 2 execution in next session!**
