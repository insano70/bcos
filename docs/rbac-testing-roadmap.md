# RBAC API Testing Roadmap

**Status**: 📋 Ready to Start
**Approach**: Small phases, incremental value
**Current Coverage**: ~5% → **Target**: 62%

---

## 🎯 Quick Summary

### **The Problem**
- **113 RBAC-protected API endpoints** in production
- **Only ~5 permission logic tests** exist
- **Zero HTTP-level RBAC tests** for actual API endpoints
- **No validation** that permissions actually block API access

### **The Solution**
Systematic testing of every API endpoint with:
- ✅ **Positive case**: User WITH permission CAN access
- ✅ **Negative case**: User WITHOUT permission CANNOT access
- ✅ **Isolation case**: User CANNOT access other org's resources

---

## 📊 Implementation Roadmap

### **Phase 0: Infrastructure** 🔧
**Time**: 2 hours
**Tests**: 0 (setup only)
**Files**:
- `tests/helpers/api-test-helper.ts` (new)
- Extend `tests/factories/index.ts`

**Deliverables**:
```typescript
// Helper functions for all future tests
makeAuthenticatedRequest(user, 'GET', '/api/endpoint')
createUserWithPermissions(['charts:read:organization'], orgId)
expectSuccess(response)
expectForbidden(response)
```

**When to do**: Before Phase 1
**Value**: Speeds up all future phases

---

### **Phase 1: Chart APIs** 📊 ⭐ START HERE
**Time**: 3-4 hours
**Tests**: ~30 new tests
**Coverage**: 5% → 14%
**Priority**: HIGH

**Endpoints** (5):
```
GET    /api/admin/analytics/charts
POST   /api/admin/analytics/charts
GET    /api/admin/analytics/charts/[id]
PUT    /api/admin/analytics/charts/[id]
DELETE /api/admin/analytics/charts/[id]
```

**Test Matrix** (per endpoint):
- ✅ With permission (200)
- ❌ Without permission (403)
- ❌ Wrong organization (403/404)
- ✅ Super admin (200)
- ❌ Unauthenticated (401)
- ✅ Data validation

**Example**:
```typescript
it('should allow chart creation with permission', async () => {
  const user = await createUserWithPermissions(['charts:create:organization'], org.id)
  const response = await makeAuthenticatedRequest(user, 'POST', '/api/admin/analytics/charts', {
    name: 'Test Chart',
    chart_type: 'bar'
  })
  expectSuccess(response)
})

it('should deny chart creation without permission', async () => {
  const user = await createUserWithPermissions([], org.id) // No permissions
  const response = await makeAuthenticatedRequest(user, 'POST', '/api/admin/analytics/charts', {
    name: 'Test Chart'
  })
  expectForbidden(response)
})
```

**Why Start Here**:
- ✅ Core analytics feature (high value)
- ✅ Medium complexity (good learning)
- ✅ Clear permissions model
- ✅ Validates infrastructure works

---

### **Phase 2: Dashboard APIs** 📈
**Time**: 2-3 hours
**Tests**: ~25 new tests
**Coverage**: 14% → 23%
**Priority**: HIGH

**Endpoints** (5):
```
GET    /api/admin/analytics/dashboards
POST   /api/admin/analytics/dashboards
GET    /api/admin/analytics/dashboards/[id]
PUT    /api/admin/analytics/dashboards/[id]
DELETE /api/admin/analytics/dashboards/[id]
```

**Why Phase 2**: Paired with charts, similar patterns

---

### **Phase 3: Data Sources** 💾
**Time**: 3-4 hours
**Tests**: ~35 new tests
**Coverage**: 23% → 35%
**Priority**: MEDIUM

**Endpoints** (7):
```
GET    /api/admin/data-sources
POST   /api/admin/data-sources
GET    /api/admin/data-sources/[id]
PUT    /api/admin/data-sources/[id]
DELETE /api/admin/data-sources/[id]
POST   /api/admin/data-sources/[id]/test
POST   /api/admin/data-sources/[id]/introspect
```

---

### **Phase 4: User Management** 👥
**Time**: 2-3 hours
**Tests**: ~30 new tests
**Coverage**: 35% → 45%
**Priority**: MEDIUM

**Endpoints** (5):
```
GET    /api/admin/users
POST   /api/admin/users
GET    /api/admin/users/[id]
PUT    /api/admin/users/[id]
DELETE /api/admin/users/[id]
```

---

### **Phase 5: Practices** 🏥
**Time**: 2-3 hours
**Tests**: ~25 new tests
**Coverage**: 45% → 53%
**Priority**: LOW

---

### **Phase 6: Remaining APIs** 🔧
**Time**: 3-4 hours
**Tests**: ~40 new tests
**Coverage**: 53% → 62%
**Priority**: LOW

---

## 📈 Progress Tracking

### **Cumulative Progress**

| Phase | Time | Tests | Endpoints | Coverage |
|-------|------|-------|-----------|----------|
| Start | 0h | 5 | 0/113 | 5% |
| After Phase 0 | 2h | 5 | 0/113 | 5% |
| After Phase 1 | 6h | 35 | 5/113 | 14% |
| After Phase 2 | 9h | 60 | 10/113 | 23% |
| After Phase 3 | 13h | 95 | 17/113 | 35% |
| After Phase 4 | 16h | 125 | 22/113 | 45% |
| After Phase 5 | 19h | 150 | 27/113 | 53% |
| After Phase 6 | 23h | 190 | 47/113 | 62% |

### **Visual Progress**

```
Phase 0 (Infrastructure)  [========] 2h
Phase 1 (Charts)          [============] 4h  ⭐ START
Phase 2 (Dashboards)      [=========] 3h
Phase 3 (Data Sources)    [============] 4h
Phase 4 (Users)           [=========] 3h
Phase 5 (Practices)       [=========] 3h
Phase 6 (Remaining)       [============] 4h
───────────────────────────────────────────
Total                     [==================] 23h
```

---

## 🚀 Week-by-Week Plan

### **Week 1: Foundation** (6 hours)
**Goal**: Validate approach

- **Day 1**: Phase 0 - Infrastructure (2h)
- **Day 2**: Phase 1 - Charts Part 1 (2h)
- **Day 3**: Phase 1 - Charts Part 2 (2h)

**Deliverables**:
- ✅ Reusable test infrastructure
- ✅ 30 passing tests for chart APIs
- ✅ Validated test template
- ✅ Documentation of learnings

**Success Criteria**:
- All tests pass
- Infrastructure is reusable
- Team can replicate pattern

---

### **Week 2: Core Features** (6 hours)
**Goal**: Cover high-value APIs

- **Day 1**: Phase 2 - Dashboards (3h)
- **Day 2**: Phase 3 - Data Sources Part 1 (2h)
- **Day 3**: Phase 3 - Data Sources Part 2 (2h)

**Deliverables**:
- ✅ 60 additional tests (95 total)
- ✅ 35% coverage

---

### **Week 3: Admin Features** (5 hours)
**Goal**: Cover admin APIs

- **Day 1**: Phase 4 - User Management (3h)
- **Day 2**: Phase 5 - Practices (2h)

**Deliverables**:
- ✅ 55 additional tests (150 total)
- ✅ 53% coverage

---

### **Week 4: Completion** (4 hours)
**Goal**: Fill remaining gaps

- **Day 1-2**: Phase 6 - Remaining APIs (4h)

**Deliverables**:
- ✅ 40 additional tests (190 total)
- ✅ 62% coverage
- ✅ Complete documentation

---

## 💡 Quick Start Guide

### **Step 1: Review Strategy** (15 min)
Read `docs/rbac-testing-strategy.md` to understand:
- Why we're doing this
- How tests are structured
- What patterns to follow

### **Step 2: Build Infrastructure** (2 hours)
Create the test helpers and factories from Phase 0

### **Step 3: Pick ONE Endpoint** (30 min)
Start with `GET /api/admin/analytics/charts`

Write 6 tests:
1. ✅ With permission → expect 200
2. ❌ Without permission → expect 403
3. ❌ Different org → expect 403
4. ✅ Super admin → expect 200
5. ❌ No auth → expect 401
6. ✅ Data validation

### **Step 4: Replicate Pattern** (3 hours)
Copy the pattern to remaining chart endpoints

### **Step 5: Review & Refine** (30 min)
- Did tests find any bugs?
- Is infrastructure working well?
- What can be improved?

---

## 📋 Test Checklist (Per Endpoint)

For EVERY API endpoint, ensure you have:

- [ ] **Positive case**: User with permission CAN access
- [ ] **Negative case**: User without permission CANNOT access (403)
- [ ] **Isolation case**: User cannot access other org's resources (403/404)
- [ ] **Super admin case**: Super admin with :all permission CAN access
- [ ] **Auth case**: Unauthenticated request CANNOT access (401)
- [ ] **Data validation**: Response contains correct data
- [ ] **No test pollution**: Tests clean up after themselves (transaction rollback)

---

## 🎯 Success Metrics

### **Quantitative**
- ✅ 190 total tests passing
- ✅ 62% API endpoint coverage
- ✅ <5% flaky test rate
- ✅ <30s test execution time
- ✅ 100% permission matrix validated

### **Qualitative**
- ✅ Team confident in RBAC implementation
- ✅ Tests catch real permission bugs
- ✅ Easy to add tests for new endpoints
- ✅ Clear documentation for new developers
- ✅ Tests serve as RBAC documentation

---

## ⚠️ Common Pitfalls to Avoid

### **Don't** ❌
1. **Mock permission checks** - Test real RBAC middleware
2. **Skip negative cases** - Most important tests!
3. **Ignore organization isolation** - Common bug source
4. **Create flaky tests** - Use transaction rollback
5. **Test only status codes** - Validate returned data too

### **Do** ✅
1. **Test real API endpoints** - Full HTTP request/response
2. **Use transaction rollback** - No test pollution
3. **Reuse infrastructure** - Don't copy-paste
4. **Follow the template** - Consistency matters
5. **Document learnings** - Help future developers

---

## 📚 Key Files

### **Strategy & Planning**
- `docs/rbac-testing-strategy.md` - Detailed strategy
- `docs/rbac-testing-roadmap.md` - This file (quick reference)

### **Implementation**
- `tests/helpers/api-test-helper.ts` - Test utilities (Phase 0)
- `tests/factories/index.ts` - Data factories (Phase 0)
- `tests/integration/api/admin/analytics/charts.test.ts` - First implementation (Phase 1)

### **Reference**
- `tests/integration/rbac/permissions.test.ts` - Existing permission tests
- `lib/api/rbac-route-handler.ts` - RBAC middleware
- `lib/types/rbac.ts` - Permission types

---

## 🎉 Next Steps

**Ready to start?**

1. ✅ Read `docs/rbac-testing-strategy.md` (15 min)
2. ✅ Implement Phase 0 - Infrastructure (2 hours)
3. ✅ Implement Phase 1 - Chart APIs (4 hours)
4. 📊 Review results and learnings
5. 🚀 Continue with remaining phases

**Questions?**
- Check `docs/rbac-testing-strategy.md` for detailed examples
- Review `tests/integration/rbac/permissions.test.ts` for patterns
- Look at `tests/integration/api/users.test.ts` for API test examples

---

**Status**: 📋 **Ready to implement Phase 0 + Phase 1**
**Time Investment**: 6 hours for first deliverable
**Expected Value**: Validated approach + 30 tests + reusable infrastructure
