# Committed Test Factories

## Overview

Committed factories create test data in **committed transactions** that are visible to services using the global database connection. This is essential for integration tests that need to test actual service behavior with real database operations.

## When to Use Committed Factories

Use committed factories when:

- Testing service methods that access the database
- Testing RBAC permission enforcement with real DB operations
- Writing integration tests that require database visibility
- Services need to see the created test data

**Do NOT use** when:
- Writing unit tests with mocked services
- Testing permission logic without database access
- Speed is critical and data visibility isn't needed
- (Use transactional factories instead)

## Available Factories

### User Factory

**File**: `user-factory.ts`

**Usage**:
```typescript
import { createCommittedUser } from '@/tests/factories/committed'

const user = await createCommittedUser({
  email: 'test@example.com',
  scope: 'my-test-scope'
})
```

**Options**:
- `email` - User email (auto-generated if not provided)
- `password_hash` - Password hash
- `first_name` - First name
- `last_name` - Last name
- `is_active` - Active status (default: true)
- `scope` - Scope for cleanup isolation

**Dependencies**: None (base entity)

### Organization Factory

**File**: `organization-factory.ts`

**Usage**:
```typescript
import { createCommittedOrganization } from '@/tests/factories/committed'

const org = await createCommittedOrganization({
  name: 'Test Organization',
  scope: 'my-test-scope'
})
```

**Options**:
- `name` - Organization name (auto-generated if not provided)
- `description` - Organization description
- `is_active` - Active status (default: true)
- `scope` - Scope for cleanup isolation

**Dependencies**: None (base entity)

### Dashboard Factory

**File**: `dashboard-factory.ts`

**Usage**:
```typescript
import { createCommittedDashboard, createCommittedUser } from '@/tests/factories/committed'

// Create user first (dashboards require a creator)
const user = await createCommittedUser({ scope: 'my-test' })

const dashboard = await createCommittedDashboard({
  dashboard_name: 'Analytics Dashboard',
  created_by: user.user_id,
  scope: 'my-test'
})
```

**Options**:
- `dashboard_name` - Dashboard name (auto-generated if not provided)
- `dashboard_description` - Description
- `created_by` - **REQUIRED** - User ID of creator
- `layout_config` - JSON layout configuration
- `dashboard_category_id` - Category ID
- `is_active` - Active status (default: true)
- `is_published` - Published status (default: false)
- `scope` - Scope for cleanup isolation

**Dependencies**: Requires `user` (via `created_by`)

**Cleanup Note**: Dashboards MUST be cleaned up before their creators (handled automatically by factory system)

### Chart Factory

**File**: `chart-factory.ts`

**Usage**:
```typescript
import { createCommittedChart, createCommittedUser } from '@/tests/factories/committed'

// Create user first (charts require a creator)
const user = await createCommittedUser({ scope: 'my-test' })

const chart = await createCommittedChart({
  chart_name: 'Revenue Chart',
  created_by: user.user_id,
  scope: 'my-test'
})
```

**Options**:
- `chart_name` - Chart name (auto-generated if not provided)
- `chart_description` - Description
- `created_by` - **REQUIRED** - User ID of creator
- `chart_type` - Type of chart (e.g., 'bar', 'line', 'pie')
- `data_source_id` - Data source reference
- `chart_config` - JSON chart configuration
- `is_active` - Active status (default: true)
- `scope` - Scope for cleanup isolation

**Dependencies**: Requires `user` (via `created_by`)

**Cleanup Note**: Charts MUST be cleaned up before their creators (handled automatically by factory system)

## Dependency Graph

The factories have the following dependency relationships:

```
┌─────────────────┐
│  organizations  │ ◄──────┐
└─────────────────┘        │
                           │
┌─────────────────┐        │
│     users       │ ◄──────┼────────┐
└─────────────────┘        │        │
         ▲                 │        │
         │                 │        │
         │ created_by      │        │
         │                 │        │
    ┌────┴────────┐   ┌────┴────┐  │
    │  dashboards  │   │  charts  │  │
    └──────────────┘   └──────────┘  │
                                      │
                                      │
                                 (FK relationships)
```

**Cleanup Order** (automatic):
1. **Charts** (highest priority: 70)
2. **Dashboards** (priority: 60)
3. **Practices** (priority: 50)
4. **Roles** (priority: 30)
5. **Users** (priority: 20)
6. **Organizations** (lowest priority: 10)

Higher priority entities are cleaned up first to respect foreign key constraints.

## Basic Usage Pattern

```typescript
import {
  createCommittedUser,
  createCommittedOrganization,
  createCommittedDashboard
} from '@/tests/factories/committed'
import { createTestScope } from '@/tests/factories/base'
import { nanoid } from 'nanoid'

describe('Dashboard Service Tests', () => {
  let scope
  let scopeId

  beforeEach(() => {
    // Create unique scope for this test
    scopeId = `test-${nanoid(8)}`
    scope = createTestScope(scopeId)
  })

  afterEach(async () => {
    // Cleanup all test data in proper order
    await scope.cleanup()
  })

  it('should retrieve dashboard', async () => {
    // Create test data
    const user = await createCommittedUser({ scope: scopeId })
    const dashboard = await createCommittedDashboard({
      dashboard_name: 'Test Dashboard',
      created_by: user.user_id,
      scope: scopeId
    })

    // Test service (can see committed data)
    const service = createRBACDashboardsService(userContext)
    const result = await service.getDashboardById(dashboard.dashboard_id)

    expect(result).toBeDefined()
    expect(result.dashboard_name).toBe('Test Dashboard')

    // Automatic cleanup in afterEach
  })
})
```

## Service-Created Data Pattern

**CRITICAL**: When services create data (not factories), you must track it manually for cleanup:

```typescript
describe('Dashboard Creation Tests', () => {
  let scope
  let scopeId
  let serviceCreatedDashboardIds = [] // Manual tracking

  beforeEach(() => {
    scopeId = `test-${nanoid(8)}`
    scope = createTestScope(scopeId)
    serviceCreatedDashboardIds = []
  })

  afterEach(async () => {
    // STEP 1: Clean service-created data FIRST
    if (serviceCreatedDashboardIds.length > 0) {
      await db.delete(dashboards)
        .where(inArray(dashboards.dashboard_id, serviceCreatedDashboardIds))
    }

    // STEP 2: Clean factory-created data
    await scope.cleanup()
  })

  it('should create dashboard via service', async () => {
    const user = await createCommittedUser({ scope: scopeId })
    const service = createRBACDashboardsService(userContext)

    // Service creates dashboard (NOT tracked by factory)
    const result = await service.createDashboard({
      dashboard_name: 'Service-Created Dashboard',
      created_by: user.user_id
    })

    // MUST track manually
    serviceCreatedDashboardIds.push(result.dashboard_id)

    expect(result).toBeDefined()
  })
})
```

## Bulk Creation

Create multiple entities at once:

```typescript
import { createCommittedDashboards, createCommittedUser } from '@/tests/factories/committed'

const user = await createCommittedUser({ scope: scopeId })

// Create 10 dashboards
const dashboards = await createCommittedDashboards(10, {
  created_by: user.user_id,
  dashboard_name: 'Bulk Dashboard',
  scope: scopeId
})

expect(dashboards).toHaveLength(10)
// Each dashboard gets unique name: "Bulk Dashboard 1", "Bulk Dashboard 2", ...
```

## Scope Isolation

Scopes provide test isolation to prevent data leakage:

```typescript
describe('Test Suite', () => {
  it('test 1 - isolated scope', async () => {
    const scopeId = `test-a-${nanoid(8)}`
    const scope = createTestScope(scopeId)

    const user1 = await createCommittedUser({ scope: scopeId })

    await scope.cleanup() // Only cleans user1
  })

  it('test 2 - different isolated scope', async () => {
    const scopeId = `test-b-${nanoid(8)}`
    const scope = createTestScope(scopeId)

    const user2 = await createCommittedUser({ scope: scopeId })

    await scope.cleanup() // Only cleans user2
    // user1 was already cleaned up in previous test
  })
})
```

## ID Generation

All entities get cryptographically unique test IDs:

```typescript
const user = await createCommittedUser({ scope: 'my-test' })

// user.user_id will be like: "test_user_a1B2c3D4"
// Format: test_<type>_<nanoid(8)>
```

This ensures:
- No ID collisions between tests
- Easy identification of test data
- Secure cleanup (only test IDs are cleaned)

## Foreign Key Handling

The factory system automatically tracks and handles foreign key dependencies:

```typescript
const user = await createCommittedUser({ scope: scopeId })
const dashboard = await createCommittedDashboard({
  created_by: user.user_id, // FK dependency
  scope: scopeId
})

// Cleanup automatically happens in correct order:
// 1. Delete dashboard (has FK to user)
// 2. Delete user (no more dependencies)
```

**Dependency Tracking**:
- `dashboard.created_by` → `user.user_id`
- `chart.created_by` → `user.user_id`
- Automatically tracked by `trackDependencies()` method
- Cleanup order respects these relationships

## Common Patterns

### Pattern 1: Simple CRUD Test

```typescript
it('should perform CRUD operations', async () => {
  const user = await createCommittedUser({ scope: scopeId })
  const dashboard = await createCommittedDashboard({
    created_by: user.user_id,
    scope: scopeId
  })

  const service = createRBACDashboardsService(userContext)

  // Read
  const result = await service.getDashboardById(dashboard.dashboard_id)
  expect(result).toBeDefined()

  // Update
  await service.updateDashboard(dashboard.dashboard_id, {
    dashboard_name: 'Updated Name'
  })

  // Delete
  await service.deleteDashboard(dashboard.dashboard_id)
})
```

### Pattern 2: Multi-User Scenario

```typescript
it('should handle multiple users', async () => {
  const user1 = await createCommittedUser({ scope: scopeId })
  const user2 = await createCommittedUser({ scope: scopeId })

  const dashboard1 = await createCommittedDashboard({
    created_by: user1.user_id,
    scope: scopeId
  })

  const dashboard2 = await createCommittedDashboard({
    created_by: user2.user_id,
    scope: scopeId
  })

  // Test RBAC - user1 shouldn't see user2's dashboard
  const service = createRBACDashboardsService(user1Context)
  const dashboards = await service.getDashboards()

  // Verify isolation
  expect(dashboards).toContain(dashboard1)
  // May or may not contain dashboard2 depending on RBAC rules
})
```

### Pattern 3: Organization Context

```typescript
it('should respect organization context', async () => {
  const org1 = await createCommittedOrganization({ scope: scopeId })
  const org2 = await createCommittedOrganization({ scope: scopeId })

  const user = await createCommittedUser({ scope: scopeId })
  await assignUserToOrganization(user, org1)

  // User has access to org1 only
  const userContext = await buildUserContext(user, org1.organization_id)
  const service = createRBACDashboardsService(userContext)

  // Test organization-scoped operations
  const dashboards = await service.getDashboards()
  expect(Array.isArray(dashboards)).toBe(true)
})
```

## Error Handling

### Missing Required Fields

```typescript
// ❌ WRONG - Will throw error
await createCommittedDashboard({
  dashboard_name: 'Test',
  scope: scopeId
  // Missing required created_by field
})

// Error: "Dashboard creation requires created_by field"
```

### Invalid Foreign Keys

```typescript
// ❌ WRONG - Will throw FK constraint error
await createCommittedDashboard({
  created_by: 'non-existent-user-id',
  scope: scopeId
})

// PostgresError: foreign key constraint violation
```

### Cleanup Order Violation

```typescript
// ❌ WRONG - Manual cleanup in wrong order
afterEach(async () => {
  // Trying to delete user before dashboard
  await db.delete(users).where(eq(users.user_id, user.user_id))
  await db.delete(dashboards).where(eq(dashboards.created_by, user.user_id))
  // FK violation - dashboard references deleted user
})

// ✅ CORRECT - Use scope.cleanup() which handles order
afterEach(async () => {
  await scope.cleanup() // Automatically handles order
})
```

## Best Practices

1. **Always use scopes** for test isolation
2. **Track service-created data** manually
3. **Clean service data first** in afterEach
4. **Respect foreign key dependencies** when creating data
5. **Use bulk creation** for performance when creating many entities
6. **Never hardcode IDs** - always use factory-generated IDs
7. **Clean up in afterEach** - don't rely on afterAll

## Anti-Patterns

### ❌ Creating Entities Out of Order

```typescript
// WRONG - Dashboard before user
const dashboard = await createCommittedDashboard({
  created_by: 'will-create-later',
  scope: scopeId
})
const user = await createCommittedUser({ scope: scopeId })
// Dashboard has invalid created_by reference
```

### ❌ Forgetting Scope

```typescript
// WRONG - No scope specified
const user = await createCommittedUser({
  email: 'test@example.com'
  // Missing scope
})
// Will create data that's hard to clean up
```

### ❌ Not Cleaning Service Data

```typescript
// WRONG - Service creates data but not tracked
it('should create dashboard', async () => {
  const user = await createCommittedUser({ scope: scopeId })
  const service = createRBACDashboardsService(userContext)

  await service.createDashboard({
    dashboard_name: 'Test',
    created_by: user.user_id
  })
  // Not tracked - will cause FK violation on cleanup
})
```

## Troubleshooting

### "Foreign key constraint violation"

**Cause**: Cleanup happening in wrong order

**Fix**: Ensure service-created data is cleaned before factory data:

```typescript
afterEach(async () => {
  // Clean service data first
  if (serviceCreatedIds.length > 0) {
    await db.delete(dashboards)
      .where(inArray(dashboards.dashboard_id, serviceCreatedIds))
  }
  // Then factory data
  await scope.cleanup()
})
```

### "Dashboard created_by does not look like a test ID"

**Cause**: Using real user ID instead of test user

**Fix**: Create user with factory:

```typescript
// WRONG
const dashboard = await createCommittedDashboard({
  created_by: 'real-user-uuid',
  scope: scopeId
})

// CORRECT
const user = await createCommittedUser({ scope: scopeId })
const dashboard = await createCommittedDashboard({
  created_by: user.user_id,
  scope: scopeId
})
```

### Tests passing but data not visible to service

**Cause**: Using transactional factories instead of committed

**Fix**: Use committed factories:

```typescript
// WRONG
import { createTestUser } from '@/tests/factories'
const user = await createTestUser()

// CORRECT
import { createCommittedUser } from '@/tests/factories/committed'
const user = await createCommittedUser({ scope: scopeId })
```

## Further Reading

- [Factory Usage Guide](../FACTORY_USAGE_GUIDE.md) - Complete usage guide
- [Testing Strategy](../../../docs/testing_strategy.md) - Overall testing approach
- [Base Factory README](../base/README.md) - Core factory architecture
