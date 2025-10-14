# Work Items Service Testing & Validation Plan

**Status**: Ready for Execution | **Created**: 2025-01-14 | **Owner**: Engineering Team

---

## Executive Summary

This document provides a comprehensive testing plan for validating the refactored work items services before removing the original service backup.

**Services Under Test**:
1. `lib/services/rbac-work-items-service.ts` (1,198 lines - Core CRUD)
2. `lib/services/work-item-hierarchy-service.ts` (369 lines - Hierarchy)
3. `lib/services/work-item-automation-service.ts` (371 lines - Automation)

**Validation Status**:
- ✅ TypeScript Compilation: PASSED
- ✅ Linting: PASSED (355 files, 0 errors)
- ⏸️ Integration Tests: Manual validation required
- ⏸️ Performance Benchmarks: Manual validation required

---

## Testing Priorities

### Priority 1 - Critical Path (MUST TEST)
Core CRUD operations that must work in production:
- Create work item
- Read work item by ID
- List work items with filters
- Update work item
- Delete work item

### Priority 2 - High Impact (SHOULD TEST)
Features heavily used by users:
- Auto-creation of child items
- Move work item (hierarchy)
- Get children
- Get ancestors/breadcrumb

### Priority 3 - Edge Cases (NICE TO TEST)
Edge cases and error handling:
- Permission boundaries
- Circular reference prevention
- Max depth validation
- Status transition validation

---

## Manual Testing Checklist

### 1. Core CRUD Operations

#### 1.1 Create Work Item
**Endpoint**: `POST /api/work-items`

**Test Cases**:
```bash
# Test 1: Basic create
curl -X POST http://localhost:3000/api/work-items \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "work_item_type_id": "uuid",
    "organization_id": "uuid",
    "subject": "Test Work Item",
    "description": "Test description",
    "priority": "high"
  }'

# Expected: 200 OK with work item details
# Verify: Check CloudWatch logs for:
#   - operation: create_work_item
#   - logTemplates.crud.create format
#   - statusDuration, insertDuration, updateDuration
#   - rbacScope in metadata
```

**Validation**:
- [ ] Work item created successfully
- [ ] Creator added as watcher automatically
- [ ] Auto-creation triggered if type has relationships
- [ ] Logs show comprehensive timing metrics
- [ ] RBAC scope visible in logs

#### 1.2 Read Work Item
**Endpoint**: `GET /api/work-items/:id`

**Test Cases**:
```bash
# Test 1: Get existing work item
curl http://localhost:3000/api/work-items/{work_item_id} \
  -H "Authorization: Bearer $TOKEN"

# Expected: 200 OK with full work item details
# Verify logs for:
#   - logTemplates.crud.read format
#   - found: true
#   - queryDuration tracked
```

**Validation**:
- [ ] Work item retrieved with all fields
- [ ] Custom fields included
- [ ] Logs show read operation
- [ ] Performance within SLOW_THRESHOLDS

#### 1.3 List Work Items
**Endpoint**: `GET /api/work-items?filters`

**Test Cases**:
```bash
# Test 1: List with filters
curl "http://localhost:3000/api/work-items?status_category=active&limit=25" \
  -H "Authorization: Bearer $TOKEN"

# Expected: 200 OK with paginated results
# Verify logs for:
#   - logTemplates.crud.list format
#   - countDuration, queryDuration, customFieldsDuration (3-way timing)
#   - rbacScope in metadata
```

**Validation**:
- [ ] List returns filtered results
- [ ] Pagination works correctly
- [ ] 3-way timing tracked (count, query, custom fields)
- [ ] RBAC filtering applied correctly
- [ ] Total count accurate

#### 1.4 Update Work Item
**Endpoint**: `PUT /api/work-items/:id`

**Test Cases**:
```bash
# Test 1: Update work item
curl -X PUT http://localhost:3000/api/work-items/{work_item_id} \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "Updated Subject",
    "priority": "medium"
  }'

# Expected: 200 OK with updated work item
# Verify logs for:
#   - logTemplates.crud.update format
#   - calculateChanges showing field changes
#   - fieldsChanged count
```

**Validation**:
- [ ] Work item updated successfully
- [ ] calculateChanges tracks field changes correctly
- [ ] Assignee added as watcher if changed
- [ ] Status transition validated if changed
- [ ] Logs show audit trail

#### 1.5 Delete Work Item
**Endpoint**: `DELETE /api/work-items/:id`

**Test Cases**:
```bash
# Test 1: Soft delete
curl -X DELETE http://localhost:3000/api/work-items/{work_item_id} \
  -H "Authorization: Bearer $TOKEN"

# Expected: 200 OK
# Verify logs for:
#   - logTemplates.crud.delete format
#   - soft: true
#   - deleteDuration tracked
```

**Validation**:
- [ ] Work item soft deleted (deleted_at set)
- [ ] No longer appears in list queries
- [ ] Can still be retrieved by ID for audit
- [ ] Logs show delete operation

---

### 2. Automation Service

#### 2.1 Auto-Creation
**Triggered by**: Creating work item with type that has auto-create relationships

**Test Cases**:
```bash
# Test 1: Create parent with auto-create children
curl -X POST http://localhost:3000/api/work-items \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "work_item_type_id": "{parent_type_with_relationships}",
    "organization_id": "uuid",
    "subject": "Parent Work Item"
  }'

# Expected: 200 OK with parent created and children auto-created
# Verify logs for:
#   - operation: auto_create_child (per child)
#   - operation: auto_create_children (summary)
#   - relationshipsFound, childrenCreated counts
#   - statusDuration, insertDuration, pathDuration per child
```

**Validation**:
- [ ] Parent work item created
- [ ] Child items auto-created based on relationships
- [ ] Template interpolation works (subject templates)
- [ ] Field inheritance works
- [ ] Custom fields created on children
- [ ] One child failure doesn't fail all
- [ ] Comprehensive per-child logging

#### 2.2 Template Interpolation
**Test**: Verify template syntax works

**Validation**:
- [ ] `{{subject}}` interpolated from parent
- [ ] `{{work_item_type_name}}` interpolated
- [ ] `{{organization_name}}` interpolated
- [ ] Custom field templates work

---

### 3. Hierarchy Service

#### 3.1 Move Work Item
**Endpoint**: `POST /api/work-items/:id/move`

**Test Cases**:
```bash
# Test 1: Move to new parent
curl -X POST http://localhost:3000/api/work-items/{work_item_id}/move \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "parent_work_item_id": "{new_parent_id}"
  }'

# Expected: 200 OK with updated work item
# Verify logs for:
#   - operation: move_work_item
#   - changes: oldParentId, newParentId, oldDepth, newDepth
#   - fetchDuration, updateDuration, descendantsDuration
#   - descendants.updated count
```

**Validation**:
- [ ] Work item moved to new parent
- [ ] Depth recalculated correctly
- [ ] Path updated correctly
- [ ] Root ID updated if needed
- [ ] All descendants updated recursively
- [ ] Comprehensive timing tracked

#### 3.2 Circular Reference Prevention
**Test**: Try to move item to its own descendant

**Test Cases**:
```bash
# Test 1: Move parent to child (should fail)
curl -X POST http://localhost:3000/api/work-items/{parent_id}/move \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "parent_work_item_id": "{child_id}"
  }'

# Expected: 400 Bad Request with validation error
# Error message: "Cannot move work item to its own descendant"
```

**Validation**:
- [ ] Circular move rejected
- [ ] Clear error message returned
- [ ] No database changes made

#### 3.3 Max Depth Validation
**Test**: Try to exceed 10 levels of nesting

**Test Cases**:
```bash
# Test 1: Move to depth 11 (should fail)
curl -X POST http://localhost:3000/api/work-items/{item_id}/move \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "parent_work_item_id": "{depth_10_parent_id}"
  }'

# Expected: 400 Bad Request
# Error: "Maximum nesting depth of 10 levels exceeded"
```

**Validation**:
- [ ] Max depth enforced
- [ ] Clear error message
- [ ] No database changes

#### 3.4 Get Children
**Endpoint**: `GET /api/work-items/:id/children`

**Test Cases**:
```bash
# Test 1: Get children of parent
curl http://localhost:3000/api/work-items/{parent_id}/children \
  -H "Authorization: Bearer $TOKEN"

# Expected: 200 OK with array of children
# Verify logs for:
#   - operation: list_work_item_children
#   - count, queryDuration
```

**Validation**:
- [ ] Direct children returned (not descendants)
- [ ] RBAC filtering applied
- [ ] Ordered by created_at
- [ ] Query performance tracked

#### 3.5 Get Ancestors
**Endpoint**: `GET /api/work-items/:id/ancestors`

**Test Cases**:
```bash
# Test 1: Get ancestors (breadcrumb trail)
curl http://localhost:3000/api/work-items/{work_item_id}/ancestors \
  -H "Authorization: Bearer $TOKEN"

# Expected: 200 OK with array of ancestors (root to parent)
# Verify logs for:
#   - operation: list_work_item_ancestors
#   - count, depth in metadata
```

**Validation**:
- [ ] Ancestors returned in order (root first)
- [ ] Path-based extraction works
- [ ] RBAC filtering applied
- [ ] Empty array for root items

---

### 4. RBAC Testing

#### 4.1 Super Admin Access
**User**: Super admin account

**Test Cases**:
- [ ] Can see all work items across all organizations
- [ ] Can create work items in any organization
- [ ] Can update any work item
- [ ] Can delete any work item
- [ ] Can move any work item
- [ ] Logs show `rbacScope: 'all'`

#### 4.2 Organization Access
**User**: User with `work-items:read:organization` permission

**Test Cases**:
- [ ] Can see work items in their organizations only
- [ ] Cannot see work items in other organizations
- [ ] Can create work items in their organizations
- [ ] Can update work items in their organizations
- [ ] Cannot update work items in other organizations
- [ ] Logs show `rbacScope: 'organization'`

#### 4.3 Own Access
**User**: User with `work-items:read:own` permission

**Test Cases**:
- [ ] Can see only work items they created
- [ ] Cannot see work items created by others
- [ ] Can update own work items
- [ ] Cannot update others' work items
- [ ] Logs show `rbacScope: 'own'`

#### 4.4 No Permission
**User**: User with no work items permissions

**Test Cases**:
- [ ] List returns empty array
- [ ] Get by ID returns 404
- [ ] Create returns 403
- [ ] Update returns 403
- [ ] Delete returns 403
- [ ] Logs show `noPermission: true`

---

### 5. Error Handling

#### 5.1 Not Found Errors
**Test Cases**:
- [ ] Get non-existent work item → 404
- [ ] Update non-existent work item → 404
- [ ] Delete non-existent work item → 404
- [ ] Move non-existent work item → 404
- [ ] Move to non-existent parent → 404

#### 5.2 Validation Errors
**Test Cases**:
- [ ] Create without required fields → 400
- [ ] Invalid status transition → 400
- [ ] Circular reference on move → 400
- [ ] Max depth exceeded → 400

#### 5.3 Authorization Errors
**Test Cases**:
- [ ] Access work item in other org → 403
- [ ] Update other user's work item (own scope) → 403
- [ ] Create in org without permission → 403

---

### 6. Performance Testing

#### 6.1 Slow Query Detection
**Test**: Monitor CloudWatch logs for slow queries

**Validation**:
- [ ] Queries over 500ms flagged with `slow: true`
- [ ] slowCount, slowQuery, slowCustomFields flags present
- [ ] Individual query durations tracked

#### 6.2 Load Testing
**Test**: Create 100 work items with auto-creation

```bash
# Script to create 100 work items
for i in {1..100}; do
  curl -X POST http://localhost:3000/api/work-items \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"work_item_type_id\": \"$TYPE_ID\",
      \"organization_id\": \"$ORG_ID\",
      \"subject\": \"Load Test Item $i\"
    }"
done
```

**Validation**:
- [ ] All items created successfully
- [ ] No memory leaks
- [ ] Response times consistent
- [ ] Auto-creation doesn't fail under load

#### 6.3 Benchmark Comparison
**Test**: Compare old vs new service response times

**Metrics to Compare**:
- Create work item (without auto-creation)
- List 50 work items
- Get single work item
- Update work item
- Move work item

**Target**: No regression (< 10% slower acceptable for observability gains)

---

### 7. CloudWatch Log Validation

#### 7.1 Log Format Validation
**Check CloudWatch Logs Insights for**:

```
fields @timestamp, message, operation, duration
| filter component = "service"
| filter operation = "create_work_item"
| sort @timestamp desc
| limit 10
```

**Validation**:
- [ ] logTemplates format used
- [ ] operation field present
- [ ] duration tracked
- [ ] rbacScope in metadata
- [ ] Individual query timings present
- [ ] correlationId present for tracing

#### 7.2 Slow Query Monitoring
**Query**:
```
fields @timestamp, operation, duration, metadata.queryDuration
| filter slow = true
| stats count() by operation
```

**Validation**:
- [ ] Slow queries flagged correctly
- [ ] SLOW_THRESHOLDS.DB_QUERY (500ms) enforced
- [ ] Slow query details captured

#### 7.3 Error Monitoring
**Query**:
```
fields @timestamp, message, level, operation
| filter level = "ERROR"
| filter operation like /work_item/
| sort @timestamp desc
```

**Validation**:
- [ ] Errors logged with full context
- [ ] Stack traces included
- [ ] Operation and duration captured

---

### 8. Custom Fields Testing

#### 8.1 Create with Custom Fields
**Test**: Create work item with custom fields

**Validation**:
- [ ] Custom fields saved correctly
- [ ] Custom fields returned in GET
- [ ] Custom fields timing tracked

#### 8.2 Update Custom Fields
**Test**: Update work item custom fields

**Validation**:
- [ ] Custom fields updated
- [ ] Timing tracked separately

---

## Automated Test Recommendations

### Unit Tests to Add
```typescript
// tests/unit/services/rbac-work-items-service.test.ts
describe('RBACWorkItemsService', () => {
  describe('getWorkItemById', () => {
    it('should return work item for valid ID');
    it('should return null for non-existent ID');
    it('should enforce RBAC permissions');
    it('should log with logTemplates.crud.read');
  });

  describe('getWorkItems', () => {
    it('should return filtered list');
    it('should track 3-way timing');
    it('should apply RBAC filtering');
  });

  // ... more tests
});
```

### Integration Tests to Add
```typescript
// tests/integration/services/work-items-full-flow.test.ts
describe('Work Items Full Flow', () => {
  it('should create → auto-create children → update → move → delete');
  it('should handle hierarchy operations correctly');
  it('should enforce RBAC at all levels');
});
```

---

## Sign-Off Criteria

Before removing `rbac-work-items-service-original.ts`:

### Must Pass
- [ ] All Priority 1 tests passing
- [ ] TypeScript compilation passing
- [ ] Linting passing
- [ ] No performance regression detected
- [ ] CloudWatch logs showing correct format
- [ ] RBAC enforcement validated

### Should Pass
- [ ] All Priority 2 tests passing
- [ ] Error handling validated
- [ ] Custom fields working

### Nice to Have
- [ ] All Priority 3 tests passing
- [ ] Load testing completed
- [ ] Performance benchmarks documented

---

## Rollback Plan

If critical issues found during testing:

1. **Keep Original Service**: Don't remove `rbac-work-items-service-original.ts`
2. **Document Issues**: Create detailed bug reports
3. **Fix Forward**: Address issues in new services
4. **Re-test**: Run full test suite again
5. **Sign-Off**: Only remove original after all issues resolved

---

## Notes

**Testing Environment**:
- Development: Use local database with test data
- Staging: Use staging environment for load testing
- Production: Monitor closely after deployment

**Monitoring Post-Deployment**:
- Watch CloudWatch for errors
- Monitor response times
- Check RBAC enforcement
- Validate auto-creation working

**Contact**:
- Issues: Report in #engineering
- Questions: Tag engineering lead

---

**Document Owner**: Engineering Team
**Created**: 2025-01-14
**Status**: Ready for Execution
