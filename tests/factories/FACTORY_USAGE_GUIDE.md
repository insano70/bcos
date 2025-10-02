# Factory Usage Guide

## Overview

This guide explains how to use the test factories in the BCOS testing system, specifically focusing on the distinction between **Transactional Factories** and **Committed Factories**.

## Quick Decision Tree

```
Need to test a service or database operation?
│
├─ Yes → Use COMMITTED factories
│   ├─ Service methods need to see the data
│   ├─ Testing actual RBAC enforcement
│   ├─ Integration tests with database
│   └─ Real CRUD operations
│
└─ No → Use TRANSACTIONAL factories
    ├─ Unit tests with mocked services
    ├─ Permission logic tests (no DB access)
    ├─ Fast tests with automatic rollback
    └─ Tests that don't need actual DB visibility
```

## Factory Types

### Transactional Factories

**Location**: `tests/factories/*.ts`

**Use When**:
- Testing permission logic without database
- Unit tests with mocked services
- Fast tests where automatic rollback is desired
- Data doesn't need to be visible to services

**Characteristics**:
- Creates data in test transaction with savepoints
- **Data is NOT visible to services using global db connection**
- Automatic rollback after each test
- No manual cleanup needed
- Very fast

**Example**:
```typescript
import { createTestUser, createTestOrganization } from '@/tests/factories'

it('should check permissions', async () => {
  // Data created in test transaction - invisible to services
  const user = await createTestUser()
  const org = await createTestOrganization()

  // Use for permission logic that doesn't hit the DB
  const hasPermission = checkUserPermission(user, 'analytics:read:all')

  // Automatic rollback - no cleanup needed
})
```

**⚠️ WARNING**: Do NOT use transactional factories when testing services that access the database. The service will not see the test data!

### Committed Factories

**Location**: `tests/factories/committed/*.ts`

**Use When**:
- Testing actual service methods
- Integration tests requiring database visibility
- Testing RBAC enforcement with real DB operations
- Service methods need to see created data

**Characteristics**:
- Creates data in committed transactions
- **Data IS visible to services using global db connection**
- Requires manual cleanup or scope-based cleanup
- Tracks dependencies for proper cleanup order
- Slightly slower but necessary for integration tests

**Example**:
```typescript
import {
  createCommittedUser,
  createCommittedDashboard
} from '@/tests/factories/committed'
import { createTestScope } from '@/tests/factories/base'
import { nanoid } from 'nanoid'

describe('Dashboard Service Tests', () => {
  let scope
  let scopeId

  beforeEach(() => {
    scopeId = `test-${nanoid(8)}`
    scope = createTestScope(scopeId)
  })

  afterEach(async () => {
    await scope.cleanup()
  })

  it('should retrieve dashboard', async () => {
    // Create user and dashboard - visible to services
    const user = await createCommittedUser({ scope: scopeId })
    const dashboard = await createCommittedDashboard({
      created_by: user.user_id,
      scope: scopeId
    })

    // Service can see this data!
    const service = createRBACDashboardsService(userContext)
    const result = await service.getDashboardById(dashboard.dashboard_id)

    expect(result).toBeDefined()
    // Cleanup happens in afterEach via scope.cleanup()
  })
})
```

## Critical Pattern: Service-Created Data

**IMPORTANT**: When tests use service methods to create data (e.g., `service.createDashboard()`), that data is created OUTSIDE the factory system and won't be automatically cleaned up.

### The Problem

```typescript
// ❌ WRONG - This will cause FK violations!
it('should create dashboard', async () => {
  const user = await createCommittedUser({ scope: scopeId })
  const service = createRBACDashboardsService(userContext)

  // This dashboard is NOT tracked by the factory!
  const dashboard = await service.createDashboard({
    dashboard_name: 'Test Dashboard',
    created_by: user.user_id
  })

  // Cleanup tries to delete user first → FK violation!
  // Dashboard still references the user
})
```

### The Solution: Manual Cleanup Tracking

```typescript
// ✅ CORRECT - Manual cleanup tracking
describe('Dashboard Service Tests', () => {
  let scope
  let scopeId
  let serviceCreatedDashboardIds = []

  beforeEach(() => {
    scopeId = `test-${nanoid(8)}`
    scope = createTestScope(scopeId)
    serviceCreatedDashboardIds = []
  })

  afterEach(async () => {
    // CRITICAL: Clean service-created data FIRST
    if (serviceCreatedDashboardIds.length > 0) {
      await db.delete(dashboards)
        .where(inArray(dashboards.dashboard_id, serviceCreatedDashboardIds))
    }

    // Then cleanup factory-created data (proper order handled automatically)
    await scope.cleanup()
  })

  it('should create dashboard', async () => {
    const user = await createCommittedUser({ scope: scopeId })
    const service = createRBACDashboardsService(userContext)

    const dashboard = await service.createDashboard({
      dashboard_name: 'Test Dashboard',
      created_by: user.user_id
    })

    // Track for manual cleanup
    serviceCreatedDashboardIds.push(dashboard.dashboard_id)

    expect(dashboard).toBeDefined()
  })
})
```

## Cleanup Order

The factory system automatically handles cleanup order based on foreign key dependencies:

```
1. service-created data (manual cleanup - MUST BE FIRST)
2. chart_definitions (depends on users)
3. dashboards (depends on users)
4. practices (may depend on users)
5. roles (may depend on organizations)
6. users (depends on organizations)
7. organizations (no dependencies)
```

**Automatic Cleanup Order** (defined in `cleanup-tracker.ts`):
```typescript
const CLEANUP_ORDER = {
  appointment: 100,  // Cleaned first
  patient: 90,
  staff: 80,
  chart: 70,
  dashboard: 60,
  practice: 50,
  permission: 40,
  role: 30,
  user: 20,
  organization: 10   // Cleaned last
}
```

## Common Patterns

### Pattern 1: Pure Factory-Created Data

```typescript
it('should work with factory data', async () => {
  const user = await createCommittedUser({ scope: scopeId })
  const dashboard = await createCommittedDashboard({
    created_by: user.user_id,
    scope: scopeId
  })

  // No manual cleanup needed - scope.cleanup() handles it
  expect(dashboard.created_by).toBe(user.user_id)
})
```

### Pattern 2: Mixed Factory + Service Data

```typescript
describe('Mixed Data Tests', () => {
  let serviceCreatedIds = []

  afterEach(async () => {
    // Clean service data first
    if (serviceCreatedIds.length > 0) {
      await db.delete(dashboards)
        .where(inArray(dashboards.dashboard_id, serviceCreatedIds))
    }
    await scope.cleanup()
  })

  it('should handle mixed data', async () => {
    // Factory-created (tracked)
    const user = await createCommittedUser({ scope: scopeId })

    // Service-created (needs manual tracking)
    const dashboard = await service.createDashboard({
      dashboard_name: 'Test',
      created_by: user.user_id
    })
    serviceCreatedIds.push(dashboard.dashboard_id)

    expect(dashboard).toBeDefined()
  })
})
```

### Pattern 3: Bulk Creation

```typescript
it('should create multiple dashboards', async () => {
  const user = await createCommittedUser({ scope: scopeId })

  // Create 5 dashboards at once
  const dashboards = await createCommittedDashboards(5, {
    created_by: user.user_id,
    dashboard_name: 'Bulk Dashboard',
    scope: scopeId
  })

  expect(dashboards).toHaveLength(5)
  // All tracked and cleaned up automatically
})
```

## Testing Services vs Testing Factories

### Testing Services (Use Committed Factories)

```typescript
import { createCommittedUser } from '@/tests/factories/committed'

it('should retrieve dashboards from service', async () => {
  const user = await createCommittedUser({ scope: scopeId })
  const service = createRBACDashboardsService(userContext)

  // Service accesses database - needs committed data
  const dashboards = await service.getDashboards()

  expect(Array.isArray(dashboards)).toBe(true)
})
```

### Testing Factories (Can Use Transactional)

```typescript
import { createTestUser } from '@/tests/factories'

it('should create user with defaults', async () => {
  // Just testing factory behavior - transactional is fine
  const user = await createTestUser()

  expect(user.user_id).toMatch(/^test_user_/)
  expect(user.email).toContain('@test.example.com')
})
```

## Scope Isolation

Scopes provide test isolation to prevent data leakage between tests:

```typescript
describe('Test Suite', () => {
  let scope1
  let scope2

  it('test 1 - isolated scope', async () => {
    const scopeId = `test-${nanoid(8)}`
    scope1 = createTestScope(scopeId)

    const user1 = await createCommittedUser({ scope: scopeId })

    await scope1.cleanup() // Only cleans user1
  })

  it('test 2 - different isolated scope', async () => {
    const scopeId = `test-${nanoid(8)}`
    scope2 = createTestScope(scopeId)

    const user2 = await createCommittedUser({ scope: scopeId })

    await scope2.cleanup() // Only cleans user2
    // user1 is already cleaned up from previous test
  })
})
```

## Common Mistakes

### ❌ Mistake 1: Using Transactional Factories for Service Tests

```typescript
// WRONG - Service can't see transactional data!
it('should get dashboard', async () => {
  const user = await createTestUser() // Transactional
  const dashboard = await createTestDashboard({ // Transactional
    created_by: user.user_id
  })

  const service = createRBACDashboardsService(userContext)
  const result = await service.getDashboardById(dashboard.dashboard_id)

  // result will be null - service can't see the data!
})
```

**Fix**: Use committed factories

```typescript
// CORRECT
const user = await createCommittedUser({ scope: scopeId })
const dashboard = await createCommittedDashboard({
  created_by: user.user_id,
  scope: scopeId
})
```

### ❌ Mistake 2: Not Tracking Service-Created Data

```typescript
// WRONG - FK violation on cleanup!
it('should create dashboard', async () => {
  const user = await createCommittedUser({ scope: scopeId })
  const service = createRBACDashboardsService(userContext)

  await service.createDashboard({
    dashboard_name: 'Test',
    created_by: user.user_id
  })
  // Not tracked - will cause FK violation when user is deleted first
})
```

**Fix**: Track service-created IDs

```typescript
// CORRECT
const result = await service.createDashboard({
  dashboard_name: 'Test',
  created_by: user.user_id
})
serviceCreatedDashboardIds.push(result.dashboard_id)
```

### ❌ Mistake 3: Wrong Cleanup Order

```typescript
// WRONG - Tries to clean users before dashboards
afterEach(async () => {
  await scope.cleanup() // Tries to delete users first
  // Then tries to clean service data (too late - FK violation)
  if (serviceCreatedIds.length > 0) {
    await db.delete(dashboards)
      .where(inArray(dashboards.dashboard_id, serviceCreatedIds))
  }
})
```

**Fix**: Service data MUST be cleaned first

```typescript
// CORRECT
afterEach(async () => {
  // Clean service data FIRST
  if (serviceCreatedIds.length > 0) {
    await db.delete(dashboards)
      .where(inArray(dashboards.dashboard_id, serviceCreatedIds))
  }
  // Then factory data (correct order handled automatically)
  await scope.cleanup()
})
```

## Environment Safety

All cleanup functions are protected with environment guards:

```typescript
// CRITICAL: Prevents accidental execution in production
if (process.env.NODE_ENV !== 'test') {
  throw new Error(
    'SAFETY GUARD: cleanup can only be run in test environment'
  );
}
```

Never disable or bypass these guards!

## Best Practices

1. **Always use scopes** for committed factory tests
2. **Track service-created data** manually
3. **Clean service data first** in afterEach
4. **Use transactional factories** when possible (faster)
5. **Use committed factories** when testing services
6. **Never hardcode database credentials** in test setup
7. **Ensure NODE_ENV=test** before running tests

## Further Reading

- [Testing Strategy](../../docs/testing_strategy.md) - Overall testing approach
- [Committed Factory README](./committed/README.md) - Detailed committed factory docs
- [Base Factory README](./base/README.md) - Core factory architecture
- [Testing Audit Report](../../TESTING_AUDIT_REPORT.md) - Testing system audit
