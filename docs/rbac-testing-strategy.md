# RBAC API Testing Strategy

**Date**: 2025-10-01
**Status**: 🎯 Strategy Defined - Ready for Implementation
**Scope**: 55 API routes, 113 RBAC-protected endpoints

---

## 📊 Current State Analysis

### **API Routes Inventory**
- **Total API Routes**: 55 route files
- **RBAC-Protected Routes**: 113 endpoints (using `rbacRoute()`)
- **Public Routes**: ~10 endpoints (health, auth, SAML)
- **Current RBAC Test Coverage**: ~5% (only permission logic tests, no API tests)

### **What's Already Tested** ✅
- ✅ Permission logic (`tests/integration/rbac/permissions.test.ts`)
- ✅ User permission checks (positive/negative cases)
- ✅ Scope validation (own, organization, all)

### **What's NOT Tested** ❌
- ❌ Real API endpoints with RBAC enforcement
- ❌ HTTP-level permission validation
- ❌ Request/response flow with real data
- ❌ Cross-resource permission checks
- ❌ Organization isolation at API level

---

## 🎯 Testing Goals

### **Primary Objective**
> **Every RBAC-protected API endpoint must have both positive and negative test cases**

### **Test Requirements**
1. ✅ **Positive Case**: User WITH permission CAN access endpoint
2. ✅ **Negative Case**: User WITHOUT permission CANNOT access endpoint
3. ✅ **Negative Case**: User CANNOT access resources from different organization
4. ✅ **Response Validation**: Verify correct data returned (not just status codes)

---

## 📋 Phased Implementation Strategy

### **Phase 0: Infrastructure Setup** (1-2 hours)
**Goal**: Create reusable test infrastructure

**Deliverables**:
1. **Test helpers** (`tests/helpers/api-test-helper.ts`)
   - `makeAuthenticatedRequest(user, method, url, body?)`
   - `createUserWithPermissions(permissions, orgId?)`
   - `expectForbidden(response)` - assert 403
   - `expectSuccess(response)` - assert 200-299

2. **Test factories** (extend existing)
   - `createTestUserWithRole(permissions[])`
   - `createTestChart(orgId, createdBy)`
   - `createTestDashboard(orgId, createdBy)`

3. **Common test patterns** (template)
   - Standard RBAC test structure
   - Reusable test suites

**Time**: 1-2 hours
**Tests Created**: 0 (infrastructure only)

---

### **Phase 1: Chart Management APIs** (3-4 hours) 🎯 START HERE
**Priority**: HIGH - Core analytics feature
**Complexity**: Medium
**Routes**: 2 files, ~10 endpoints

#### **Endpoints to Test**
1. `GET /api/admin/analytics/charts` - List charts
2. `POST /api/admin/analytics/charts` - Create chart
3. `GET /api/admin/analytics/charts/[id]` - Get chart
4. `PUT /api/admin/analytics/charts/[id]` - Update chart
5. `DELETE /api/admin/analytics/charts/[id]` - Delete chart

#### **Required Permissions**
- `charts:read:organization` - Read charts in org
- `charts:create:organization` - Create charts in org
- `charts:update:organization` - Update charts in org
- `charts:delete:organization` - Delete charts in org
- `charts:read:all` - Super admin read
- `charts:update:all` - Super admin update

#### **Test Cases** (30 tests)

**File**: `tests/integration/api/admin/analytics/charts.test.ts`

```typescript
describe('GET /api/admin/analytics/charts', () => {
  describe('Positive Cases', () => {
    it('should list charts with charts:read:organization permission', async () => {
      const org = await createTestOrganization()
      const user = await createUserWithPermissions(['charts:read:organization'], org.id)
      const chart = await createTestChart(org.id, user.id)

      const response = await makeAuthenticatedRequest(user, 'GET', '/api/admin/analytics/charts')

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.charts).toHaveLength(1)
      expect(data.charts[0].chart_id).toBe(chart.chart_id)
    })

    it('should list all charts with charts:read:all (super admin)', async () => {
      const org1 = await createTestOrganization()
      const org2 = await createTestOrganization()
      const superAdmin = await createUserWithPermissions(['charts:read:all'])

      await createTestChart(org1.id, superAdmin.id)
      await createTestChart(org2.id, superAdmin.id)

      const response = await makeAuthenticatedRequest(superAdmin, 'GET', '/api/admin/analytics/charts')

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.charts.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('Negative Cases', () => {
    it('should deny access without charts:read permission', async () => {
      const user = await createUserWithPermissions([]) // No permissions

      const response = await makeAuthenticatedRequest(user, 'GET', '/api/admin/analytics/charts')

      expectForbidden(response)
      const data = await response.json()
      expect(data.error).toContain('Permission denied')
    })

    it('should not show charts from other organizations', async () => {
      const org1 = await createTestOrganization()
      const org2 = await createTestOrganization()
      const user1 = await createUserWithPermissions(['charts:read:organization'], org1.id)

      const chart1 = await createTestChart(org1.id, user1.id)
      const chart2 = await createTestChart(org2.id, user1.id)

      const response = await makeAuthenticatedRequest(user1, 'GET', '/api/admin/analytics/charts')

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.charts).toHaveLength(1)
      expect(data.charts[0].chart_id).toBe(chart1.chart_id)
      expect(data.charts.some(c => c.chart_id === chart2.chart_id)).toBe(false)
    })
  })
})

describe('POST /api/admin/analytics/charts', () => {
  describe('Positive Cases', () => {
    it('should create chart with charts:create:organization permission', async () => {
      const org = await createTestOrganization()
      const user = await createUserWithPermissions(['charts:create:organization'], org.id)

      const chartData = {
        name: 'Test Chart',
        chart_type: 'bar',
        configuration: { /* ... */ }
      }

      const response = await makeAuthenticatedRequest(
        user,
        'POST',
        '/api/admin/analytics/charts',
        chartData
      )

      expectSuccess(response)
      const data = await response.json()
      expect(data.chart.name).toBe('Test Chart')
      expect(data.chart.organization_id).toBe(org.id)
    })
  })

  describe('Negative Cases', () => {
    it('should deny creation without charts:create permission', async () => {
      const user = await createUserWithPermissions([])

      const response = await makeAuthenticatedRequest(
        user,
        'POST',
        '/api/admin/analytics/charts',
        { name: 'Test Chart' }
      )

      expectForbidden(response)
    })
  })
})

// ... Similar for PUT, DELETE
```

**Estimated Tests**: 30 tests (6 endpoints × 5 test cases each)
**Time**: 3-4 hours
**Value**: HIGH - validates core analytics RBAC

---

### **Phase 2: Dashboard Management APIs** (2-3 hours)
**Priority**: HIGH - Paired with charts
**Routes**: 2 files, ~8 endpoints

#### **Endpoints**
1. `GET /api/admin/analytics/dashboards` - List dashboards
2. `POST /api/admin/analytics/dashboards` - Create dashboard
3. `GET /api/admin/analytics/dashboards/[id]` - Get dashboard
4. `PUT /api/admin/analytics/dashboards/[id]` - Update dashboard
5. `DELETE /api/admin/analytics/dashboards/[id]` - Delete dashboard

#### **Required Permissions**
- `dashboards:read:organization`
- `dashboards:create:organization`
- `dashboards:update:organization`
- `dashboards:delete:organization`

**Estimated Tests**: 25 tests
**Time**: 2-3 hours

---

### **Phase 3: Data Source Management** (3-4 hours)
**Priority**: MEDIUM - Admin feature
**Routes**: 5 files, ~15 endpoints

#### **Endpoints**
1. `GET /api/admin/data-sources` - List data sources
2. `POST /api/admin/data-sources` - Create data source
3. `GET /api/admin/data-sources/[id]` - Get data source
4. `PUT /api/admin/data-sources/[id]` - Update data source
5. `DELETE /api/admin/data-sources/[id]` - Delete data source
6. `POST /api/admin/data-sources/[id]/test` - Test connection
7. `POST /api/admin/data-sources/[id]/introspect` - Introspect schema

**Estimated Tests**: 35 tests
**Time**: 3-4 hours

---

### **Phase 4: User Management APIs** (2-3 hours)
**Priority**: MEDIUM - Core admin feature
**Routes**: 3 files, ~10 endpoints

#### **Endpoints**
1. `GET /api/admin/users` - List users
2. `POST /api/admin/users` - Create user
3. `GET /api/admin/users/[id]` - Get user
4. `PUT /api/admin/users/[id]` - Update user
5. `DELETE /api/admin/users/[id]` - Delete user

**Estimated Tests**: 30 tests
**Time**: 2-3 hours

---

### **Phase 5: Practice Management APIs** (2-3 hours)
**Priority**: LOW - Depends on business need
**Routes**: 2 files, ~8 endpoints

**Estimated Tests**: 25 tests
**Time**: 2-3 hours

---

### **Phase 6: Bulk Operations & Advanced** (3-4 hours)
**Priority**: LOW - Can defer
**Routes**: Multiple files, ~20 endpoints

**Estimated Tests**: 40 tests
**Time**: 3-4 hours

---

## 🧪 Test Template

### **Standard RBAC API Test Structure**

```typescript
/**
 * RBAC API Tests: [Resource] Management
 *
 * Tests both positive and negative permission cases
 * Pattern: tests/integration/api/admin/analytics/charts.test.ts
 */

import { describe, it, expect, beforeEach } from 'vitest'
import '@/tests/setup/integration-setup'
import {
  createTestOrganization,
  createUserWithPermissions,
  createTest[Resource]
} from '@/tests/factories'
import {
  makeAuthenticatedRequest,
  expectSuccess,
  expectForbidden
} from '@/tests/helpers/api-test-helper'

describe('[METHOD] /api/[endpoint]', () => {
  let org: Organization
  let otherOrg: Organization

  beforeEach(async () => {
    org = await createTestOrganization()
    otherOrg = await createTestOrganization()
  })

  describe('Positive Cases - Permission Granted', () => {
    it('should allow access with required permission', async () => {
      const user = await createUserWithPermissions(['resource:action:scope'], org.id)

      const response = await makeAuthenticatedRequest(user, 'GET', '/api/endpoint')

      expectSuccess(response)
      const data = await response.json()
      // Assert data correctness
      expect(data.items).toBeDefined()
    })

    it('should allow super admin with :all scope', async () => {
      const superAdmin = await createUserWithPermissions(['resource:action:all'])

      const response = await makeAuthenticatedRequest(superAdmin, 'GET', '/api/endpoint')

      expectSuccess(response)
    })
  })

  describe('Negative Cases - Permission Denied', () => {
    it('should deny access without permission', async () => {
      const user = await createUserWithPermissions([], org.id)

      const response = await makeAuthenticatedRequest(user, 'GET', '/api/endpoint')

      expectForbidden(response)
      const data = await response.json()
      expect(data.error).toContain('Permission denied')
    })

    it('should deny access to resources from other organization', async () => {
      const user = await createUserWithPermissions(['resource:read:organization'], org.id)
      const otherResource = await createTest[Resource](otherOrg.id)

      const response = await makeAuthenticatedRequest(
        user,
        'GET',
        `/api/endpoint/${otherResource.id}`
      )

      // Should either be 403 or 404 (depending on implementation)
      expect([403, 404]).toContain(response.status)
    })

    it('should deny unauthenticated requests', async () => {
      const response = await fetch('/api/endpoint') // No auth

      expect(response.status).toBe(401)
    })
  })

  describe('Data Validation', () => {
    it('should return only resources user has access to', async () => {
      const user = await createUserWithPermissions(['resource:read:organization'], org.id)

      const ownResource = await createTest[Resource](org.id, user.id)
      const otherResource = await createTest[Resource](otherOrg.id)

      const response = await makeAuthenticatedRequest(user, 'GET', '/api/endpoint')

      expectSuccess(response)
      const data = await response.json()

      expect(data.items).toContainEqual(expect.objectContaining({ id: ownResource.id }))
      expect(data.items).not.toContainEqual(expect.objectContaining({ id: otherResource.id }))
    })
  })
})
```

---

## 📊 Metrics & Goals

### **Coverage Goals by Phase**

| Phase | Endpoints | Tests | Time | Coverage |
|-------|-----------|-------|------|----------|
| Phase 0 | 0 | 0 | 2h | Infrastructure |
| Phase 1 | 10 | 30 | 4h | 9% |
| Phase 2 | 8 | 25 | 3h | 16% |
| Phase 3 | 15 | 35 | 4h | 29% |
| Phase 4 | 10 | 30 | 3h | 38% |
| Phase 5 | 8 | 25 | 3h | 45% |
| Phase 6 | 20 | 40 | 4h | 62% |
| **Total** | **71** | **185** | **23h** | **62%** |

### **Success Criteria**
- ✅ All endpoints have positive + negative test cases
- ✅ Organization isolation validated
- ✅ Permission matrix fully tested
- ✅ All tests pass consistently
- ✅ < 5% flaky test rate

---

## 🔧 Infrastructure Setup (Phase 0)

### **File 1: `tests/helpers/api-test-helper.ts`**

```typescript
import type { User } from '@/lib/db/schema'
import { TokenManager } from '@/lib/auth/token-manager'

/**
 * Make authenticated API request as a specific user
 */
export async function makeAuthenticatedRequest(
  user: User,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  endpoint: string,
  body?: unknown
): Promise<Response> {
  // Create token for user
  const tokenPair = await TokenManager.createTokenPair(
    user.user_id,
    {
      userAgent: 'Test Client',
      ipAddress: '127.0.0.1',
      fingerprint: 'test-fingerprint',
      deviceName: 'Test Device'
    },
    false,
    user.email
  )

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4001'

  return fetch(`${baseUrl}${endpoint}`, {
    method,
    headers: {
      'Cookie': `access-token=${tokenPair.accessToken}`,
      'Content-Type': 'application/json'
    },
    ...(body && { body: JSON.stringify(body) })
  })
}

/**
 * Assert response is successful (200-299)
 */
export function expectSuccess(response: Response) {
  expect(response.status).toBeGreaterThanOrEqual(200)
  expect(response.status).toBeLessThan(300)
}

/**
 * Assert response is forbidden (403)
 */
export function expectForbidden(response: Response) {
  expect(response.status).toBe(403)
}

/**
 * Assert response is unauthorized (401)
 */
export function expectUnauthorized(response: Response) {
  expect(response.status).toBe(401)
}

/**
 * Assert response is not found (404)
 */
export function expectNotFound(response: Response) {
  expect(response.status).toBe(404)
}
```

### **File 2: Extend `tests/factories/index.ts`**

```typescript
/**
 * Create user with specific permissions
 */
export async function createUserWithPermissions(
  permissions: string[],
  organizationId?: string
): Promise<User> {
  const tx = getCurrentTransaction()
  const user = await createTestUser()

  if (organizationId) {
    const org = await tx.query.organizations.findFirst({
      where: eq(organizations.organization_id, organizationId)
    })
    if (org) {
      await assignUserToOrganization(user, mapDatabaseOrgToOrg(org))
    }
  }

  if (permissions.length > 0) {
    const role = await createTestRole({
      name: `test_role_${Date.now()}`,
      organizationId,
      permissions
    })
    await assignRoleToUser(user, mapDatabaseRoleToRole(role))
  }

  return user
}
```

---

## 🎯 Recommended Start

### **Week 1: Phase 0 + Phase 1**
1. **Day 1**: Build infrastructure (helpers, factories) - 2 hours
2. **Day 2-3**: Implement Phase 1 (Charts) - 4 hours
3. **Review**: Run tests, fix issues, document learnings

### **Success Metrics for Week 1**
- ✅ Infrastructure reusable
- ✅ 30 tests passing for charts
- ✅ Template validated and ready for other APIs

---

## 📚 Best Practices

### **DO** ✅
- Test both positive AND negative cases
- Validate organization isolation
- Test with real data (not just mocks)
- Use transaction rollback for cleanup
- Reuse infrastructure
- Follow existing patterns

### **DON'T** ❌
- Mock permission checks (test real RBAC)
- Skip negative cases
- Test only happy paths
- Create tests that test themselves
- Ignore organization isolation

---

## 📖 References

- **Existing Tests**: `tests/integration/rbac/permissions.test.ts`
- **Testing Strategy**: `docs/testing_strategy.md`
- **RBAC Middleware**: `lib/api/rbac-route-handler.ts`
- **Permission Types**: `lib/types/rbac.ts`

---

## ✅ Conclusion

This strategy provides:
- ✅ **Clear phases** with time estimates
- ✅ **Reusable infrastructure** to speed up later phases
- ✅ **Small starting scope** (Phase 1 = 30 tests, 4 hours)
- ✅ **Comprehensive coverage** when fully implemented
- ✅ **Practical approach** focusing on real API testing

**Recommended Next Step**: Implement Phase 0 + Phase 1 (6 hours total)

This will validate the approach and create momentum for subsequent phases.
