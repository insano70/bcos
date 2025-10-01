# Testing System - Prioritized Fix Plan

## CRITICAL ISSUES - Fix Today (P0)

### 1. Fix Foreign Key Cleanup Violations
**Impact:** 7 tests failing, database pollution, cascading failures
**Files Affected:**
- `tests/integration/rbac/dashboards-service-committed.test.ts`
- `tests/integration/rbac/dashboards-service.test.ts`
- `tests/factories/committed/dashboard-factory.ts`

**Fix Required:**
```typescript
// In afterEach, cleanup in correct order:
afterEach(async () => {
  // 1. Clean service-created dashboards FIRST
  if (serviceCreatedDashboardIds.length > 0) {
    await db.delete(dashboards)
      .where(inArray(dashboards.dashboard_id, serviceCreatedDashboardIds))
  }

  // 2. Then cleanup factory data (dashboards, then users)
  await scope.cleanup()
})
```

**Test to Verify:**
```bash
pnpm vitest run tests/integration/rbac/dashboards-service-committed.test.ts
```

### 2. Add Manual Cleanup Tracking for Service-Created Data
**Impact:** Data leakage, FK violations, test pollution

**Pattern to Add to All Committed Tests:**
```typescript
describe('Service Tests', () => {
  let scope: ScopedFactoryCollection
  let scopeId: string
  let serviceCreatedIds: string[] = []

  beforeEach(() => {
    scopeId = `test-${nanoid(8)}`
    scope = createTestScope(scopeId)
    serviceCreatedIds = []
  })

  afterEach(async () => {
    // Clean service-created data FIRST (in reverse dependency order)
    if (serviceCreatedIds.length > 0) {
      await db.delete(tableName)
        .where(inArray(tableName.id, serviceCreatedIds))
    }

    // Then cleanup factory data
    await scope.cleanup()
  })

  it('should create via service', async () => {
    const result = await service.create(data)
    serviceCreatedIds.push(result.id)  // TRACK IT!

    expect(result).toBeTruthy()
  })
})
```

**Files to Update:**
- `tests/integration/rbac/dashboards-service-committed.test.ts`
- `tests/integration/rbac/charts-service-committed.test.ts`
- `tests/integration/rbac/users-service-committed.test.ts`
- All other `*-service-committed.test.ts` files

### 3. Remove Hardcoded Database Credentials
**Impact:** Security risk, accidental production connection

**Current Code:**
```typescript
// tests/setup/integration-setup.ts:11-13
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://bcos_d:oRMgpg2micRfQVXz7Bfbr@localhost:5432/bcos_d';
}
```

**Fix:**
```typescript
if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL environment variable is required for integration tests. ' +
    'Set it in .env.test file.'
  );
}
```

### 4. Add Environment Guards to Cleanup Functions
**Impact:** Prevent accidental production data deletion

**Add to cleanup.ts:**
```typescript
export async function emergencyCleanup() {
  // SAFETY CHECK
  if (process.env.NODE_ENV !== 'test') {
    throw new Error(
      'Emergency cleanup can ONLY run in test environment! ' +
      `Current env: ${process.env.NODE_ENV}`
    );
  }

  const db = getTestDb()
  // ... rest of cleanup
}
```

---

## HIGH PRIORITY - Fix This Week (P1)

### 5. Fix Test Expectations vs Service Behavior
**Issue:** Test expects exception but service returns null

**Files:**
- `tests/integration/rbac/dashboards-service-committed.test.ts:450`

**Decision Needed:**
Either:
- Change test to expect `null`: `expect(result).toBeNull()`
- OR change service to throw: `throw new Error('Dashboard not found')`

**Verify service contract first:**
```typescript
const result = await dashboardsService.getDashboardById('non-existent-id')
// What should this return? null or throw?
```

### 6. Fix Organization Isolation Tests
**Issue:** User can see dashboards from orgs they don't belong to

**Test Failing:**
```typescript
// tests/integration/rbac/dashboards-service-committed.test.ts:563
expect(dashboardIds).not.toContain(dashboard.dashboard_id)
// But dashboard IS in results (security issue!)
```

**Investigation Needed:**
1. Check if service properly filters by accessible_organizations
2. Verify user context has correct org list
3. Test with `analytics:read:organization` scope

### 7. Document Factory Usage Patterns
**Create:** `tests/FACTORY_USAGE_GUIDE.md`

**Content:**
```markdown
# When to Use Which Factory

## Transactional Factories (Use for Permission Tests)
- Tests that only check permissions
- No need for service to see data
- Fast, auto-cleanup via rollback

## Committed Factories (Use for CRUD Tests)
- Service needs to see the data
- Testing actual database operations
- Requires manual cleanup tracking

## Rules:
1. NEVER mix both in same test
2. ALWAYS track service-created data manually
3. ALWAYS cleanup in reverse dependency order
```

### 8. Add Cleanup Order Documentation
**Update:** `tests/factories/committed/README.md`

**Dependency Graph:**
```
Charts → Users (created_by)
Dashboards → Users (created_by)
User_Organizations → Users, Organizations
User_Roles → Users, Roles

Cleanup Order:
1. Charts (no dependencies on them)
2. Dashboards (no dependencies on them)
3. User_Organizations (junction table)
4. User_Roles (junction table)
5. Organizations (if no users reference them)
6. Users (last, many things reference them)
```

---

## MEDIUM PRIORITY - This Month (P2)

### 9. Add Critical API Endpoint Tests
**Coverage Target:** Test top 10 most-used endpoints

**Priority Endpoints:**
1. `POST /api/auth/login` - Authentication
2. `POST /api/auth/logout` - Session cleanup
3. `POST /api/auth/refresh` - Token rotation
4. `GET /api/auth/me` - Current user
5. `POST /api/practices` - Create practice
6. `GET /api/practices/[id]` - Get practice
7. `PUT /api/practices/[id]` - Update practice
8. `GET /api/admin/analytics/charts` - List charts
9. `POST /api/admin/analytics/charts` - Create chart
10. `GET /api/admin/analytics/dashboards` - List dashboards

**Template:**
```typescript
describe('POST /api/auth/login', () => {
  it('should authenticate valid credentials', async () => {
    const user = await createCommittedUser({
      email: 'test@example.com',
      password: 'TestPass123!'
    })

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'TestPass123!' })

    expect(response.status).toBe(200)
    expect(response.body).toHaveProperty('token')
  })
})
```

### 10. Add SQL Injection Tests
**Create:** `tests/integration/security/sql-injection.test.ts`

**Test Cases:**
```typescript
describe('SQL Injection Prevention', () => {
  it('should prevent SQL injection in search', async () => {
    const malicious = "'; DROP TABLE users; --"
    const response = await request(app)
      .get(`/api/users/search?q=${encodeURIComponent(malicious)}`)

    expect(response.status).toBe(200)
    // Verify table still exists
    const users = await db.select().from(usersTable)
    expect(users).toBeDefined()
  })
})
```

### 11. Consolidate Duplicate Test Files
**Issue:** Two test files for same service

**Files:**
- `dashboards-service.test.ts` - Permission tests only
- `dashboards-service-committed.test.ts` - CRUD tests

**Decision:**
Keep both BUT rename clearly:
- `dashboards-service-permissions.test.ts` - Permission enforcement
- `dashboards-service-crud.test.ts` - CRUD operations

### 12. Add Test Data Verification
**Add to committed factory tests:**

```typescript
afterEach(async () => {
  // Cleanup
  await scope.cleanup()

  // VERIFY: No orphaned records
  const orphanedDashboards = await db
    .select()
    .from(dashboards)
    .where(sql`created_by NOT IN (SELECT user_id FROM users)`)

  if (orphanedDashboards.length > 0) {
    console.error('Orphaned dashboards found:', orphanedDashboards)
    throw new Error('Cleanup failed: orphaned records detected')
  }
})
```

---

## LOW PRIORITY - Next Quarter (P3)

### 13. Component Testing Setup
**Setup:** React Testing Library + vitest

```bash
pnpm add -D @testing-library/react @testing-library/user-event @testing-library/jest-dom
```

**First Components:**
- Login form
- Registration form
- Dashboard header
- Chart component

### 14. E2E Testing Setup
**Setup:** Playwright

```bash
pnpm add -D @playwright/test
npx playwright install
```

**First Journeys:**
- Login → Dashboard → Logout
- Registration → Email verification → Login
- Create practice → Add staff → View analytics

### 15. Performance Testing
**Create:** `tests/performance/`

**Tests:**
- API response time benchmarks
- Concurrent request handling
- Database query performance
- Memory usage monitoring

---

## Verification Checklist

After fixing critical issues:

- [ ] All tests pass: `pnpm vitest run`
- [ ] No FK violations in logs
- [ ] Database clean after tests: Check for orphaned records
- [ ] No hardcoded credentials in code
- [ ] Environment guards in place
- [ ] Manual cleanup tracking added
- [ ] Documentation updated

**Verification Queries:**
```sql
-- Check for orphaned dashboards
SELECT * FROM dashboards
WHERE created_by NOT IN (SELECT user_id FROM users);

-- Check for orphaned charts
SELECT * FROM chart_definitions
WHERE created_by NOT IN (SELECT user_id FROM users);

-- Check for test data pollution
SELECT * FROM users WHERE email LIKE '%test%';
SELECT * FROM organizations WHERE name LIKE '%test%';
```

---

## Success Metrics

**Week 1:**
- ✅ All tests passing (0 failures)
- ✅ No FK violations
- ✅ Security fixes applied

**Week 2-4:**
- ✅ API endpoint coverage >50%
- ✅ Documentation complete
- ✅ Factory patterns consolidated

**Month 2-3:**
- ✅ Component testing started
- ✅ Security testing comprehensive
- ✅ Test coverage >50%

---

## Risk Mitigation

**Risk:** Fixing cleanup breaks other tests
**Mitigation:** Fix one test file at a time, verify before moving to next

**Risk:** Service behavior unclear (null vs throw)
**Mitigation:** Document expected behavior, get team agreement first

**Risk:** Time pressure to skip fixes
**Mitigation:** Critical fixes are non-negotiable, schedule them first
