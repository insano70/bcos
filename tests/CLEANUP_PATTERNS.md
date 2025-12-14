# Test Cleanup Patterns Guide

This document explains the multi-layer cleanup architecture used in our test suite to ensure test isolation and prevent data pollution.

## Overview

Our test infrastructure provides **5 redundant layers of cleanup**:

| Layer | Mechanism | Coverage | Explicit Code Required |
|-------|-----------|----------|------------------------|
| 1 | Transaction rollback | All integration tests | None (automatic) |
| 2 | Scope-based cleanup | Committed factories | `scope.cleanup()` |
| 3 | Service data tracking | Service-created data | Manual ID tracking |
| 4 | Cleanup verification | All integration tests | None (automatic) |
| 5 | Manual cleanup script | Accumulated pollution | Run script manually |

## Layer 1: Transaction-Based Cleanup (Automatic)

**When to use:** All tests importing `@/tests/setup/integration-setup`

This is the primary cleanup mechanism. Every test runs inside a database savepoint that is automatically rolled back after each test.

```typescript
// In integration-setup.ts (automatic):
beforeAll  → BEGIN main transaction
beforeEach → SAVEPOINT test_savepoint_{id}
afterEach  → ROLLBACK TO SAVEPOINT (all test data gone)
afterAll   → ROLLBACK main transaction
```

**Example - No cleanup code needed:**

```typescript
import { describe, it, expect } from 'vitest';
import '@/tests/setup/integration-setup';
import { createTestUser } from '@/tests/factories/user-factory';

describe('My Feature', () => {
  it('should work', async () => {
    // User is created inside a savepoint
    const user = await createTestUser({ email: 'test@example.com' });

    // Test your feature
    expect(user).toBeDefined();

    // NO CLEANUP NEEDED - savepoint rolls back automatically
  });
});
```

## Layer 2: Scope-Based Cleanup (Committed Factories)

**When to use:** Tests using `createCommittedUser()`, `createCommittedDashboard()`, etc.

Committed factories create data outside the transaction (visible to services using the global database connection). These require explicit cleanup.

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '@/tests/setup/integration-setup';
import { createCommittedUser, createCommittedDashboard } from '@/tests/factories/committed';
import { createTestScope } from '@/tests/factories/base';
import { rollbackTransaction } from '@/tests/helpers/db-helper';
import { nanoid } from 'nanoid';

describe('Dashboard Service', () => {
  let scopeId: string;
  let scope: ReturnType<typeof createTestScope>;

  beforeEach(() => {
    // Create unique scope for this test
    scopeId = `test-${nanoid(8)}`;
    scope = createTestScope(scopeId);
  });

  afterEach(async () => {
    // 1. Rollback transaction-based data
    await rollbackTransaction();
    // 2. Clean committed factory data (respects FK order)
    await scope.cleanup();
  });

  it('should retrieve dashboard', async () => {
    const user = await createCommittedUser({ scope: scopeId });
    const dashboard = await createCommittedDashboard({
      dashboard_name: 'Test Dashboard',
      created_by: user.user_id,
      scope: scopeId,
    });

    // Test service (can see committed data)
    const result = await dashboardService.getDashboardById(dashboard.dashboard_id);
    expect(result).toBeDefined();

    // Cleanup happens in afterEach
  });
});
```

## Layer 3: Service-Created Data Tracking

**When to use:** Tests where services (not factories) create data

When a service creates data (e.g., `dashboardService.create()`), it's not tracked by factories. You must track IDs manually and clean them up BEFORE scope.cleanup().

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '@/tests/setup/integration-setup';
import { createCommittedUser } from '@/tests/factories/committed';
import { createTestScope } from '@/tests/factories/base';
import { rollbackTransaction } from '@/tests/helpers/db-helper';
import { db } from '@/lib/db';
import { dashboards } from '@/lib/db/schema';
import { inArray } from 'drizzle-orm';

describe('Dashboard Creation', () => {
  let scopeId: string;
  let scope: ReturnType<typeof createTestScope>;
  let serviceCreatedDashboardIds: string[] = [];  // Track IDs

  beforeEach(() => {
    scopeId = `test-${nanoid(8)}`;
    scope = createTestScope(scopeId);
    serviceCreatedDashboardIds = [];  // Reset each test
  });

  afterEach(async () => {
    await rollbackTransaction();

    // CRITICAL: Clean service-created data FIRST (FK constraints)
    if (serviceCreatedDashboardIds.length > 0) {
      await db.delete(dashboards)
        .where(inArray(dashboards.dashboard_id, serviceCreatedDashboardIds));
    }

    // Then clean factory data
    await scope.cleanup();
  });

  it('should create dashboard via service', async () => {
    const user = await createCommittedUser({ scope: scopeId });

    // Service creates data - NOT tracked by factories
    const result = await dashboardService.createDashboard({
      dashboard_name: 'Service Dashboard',
      created_by: user.user_id,
    });

    // MUST track manually
    serviceCreatedDashboardIds.push(result.dashboard_id);

    expect(result).toBeDefined();
  });
});
```

## Layer 4: Cleanup Verification (Automatic)

**When it runs:** After all tests in each integration test file

The integration-setup automatically verifies no test data remains after tests complete. If pollution is detected, it logs a warning:

```
⚠️  TEST DATA POLLUTION DETECTED
═══════════════════════════════════════════════════════════════
Test entities remaining in database:
  - users: 45
  - organizations: 9
Run cleanup with: pnpm tsx scripts/cleanup-test-data.ts
═══════════════════════════════════════════════════════════════
```

**To enable strict mode (fail on pollution):**

```typescript
import { logCleanupVerification } from '@/tests/helpers/cleanup-verification';

afterAll(async () => {
  await logCleanupVerification({ throwOnPollution: true });
});
```

## Layer 5: Manual Cleanup Script

**When to use:** When test data accumulates (e.g., after test failures, interrupted tests)

```bash
# Preview what would be deleted
pnpm tsx scripts/cleanup-test-data.ts --dry-run

# Delete with confirmation
pnpm tsx scripts/cleanup-test-data.ts

# Delete without confirmation (CI)
pnpm tsx scripts/cleanup-test-data.ts --force
```

**Safety features:**
- Refuses to run against production databases
- Shows counts before deletion
- Respects foreign key order

## Decision Tree: Which Pattern to Use?

```
Does your test import integration-setup?
├─ NO → Unit test, no cleanup needed (mocks only)
└─ YES → Continue...
    │
    Does your test use committed factories (createCommittedUser, etc.)?
    ├─ NO → Layer 1 only, no explicit cleanup needed
    └─ YES → Continue...
        │
        Does your test call services that CREATE data?
        ├─ NO → Use Layer 1 + Layer 2 pattern
        └─ YES → Use Layer 1 + Layer 2 + Layer 3 pattern
```

## Test Data Identification Patterns

Test data is identified by these patterns (must match cleanup-test-data.ts):

| Entity | Pattern |
|--------|---------|
| Users | `email LIKE '%@test.local'` OR `email LIKE '%test%'` OR `first_name LIKE 'Test%'` |
| Organizations | `name LIKE 'Test%'` OR `name LIKE 'test_%'` OR `slug LIKE 'test_%'` |
| Roles | `name LIKE 'test_%'` OR `name LIKE '%test%'` |
| Work Item Types | `name LIKE 'Test%'` OR `name LIKE '%test%'` OR `name LIKE 'type_test_%'` |
| Dashboards | `dashboard_name LIKE 'Test%'` OR `dashboard_name LIKE '%test%'` |
| Practices | `name LIKE 'Test%'` OR `domain LIKE '%.local'` |

**IMPORTANT:** When creating test data manually (not via factories), ensure names/emails follow these patterns for automatic cleanup detection.

## Common Mistakes

### 1. Forgetting scope.cleanup() with committed factories

```typescript
// ❌ WRONG - Data persists after test
afterEach(async () => {
  await rollbackTransaction();
  // Missing scope.cleanup()!
});

// ✅ CORRECT
afterEach(async () => {
  await rollbackTransaction();
  await scope.cleanup();
});
```

### 2. Wrong cleanup order with service-created data

```typescript
// ❌ WRONG - FK violation (user deleted before dashboard)
afterEach(async () => {
  await scope.cleanup();  // Deletes user
  await db.delete(dashboards)...;  // Dashboard still references user!
});

// ✅ CORRECT - Clean dependents first
afterEach(async () => {
  await db.delete(dashboards)...;  // Dashboard first
  await scope.cleanup();  // User second
});
```

### 3. Using hardcoded emails

```typescript
// ❌ WRONG - Collision if rollback fails
await createTestUser({ email: 'test@example.com' });

// ✅ CORRECT - Unique every time
import { generateUniqueEmail } from '@/tests/helpers/unique-generator';
await createTestUser({ email: generateUniqueEmail() });
```

### 4. Not tracking service-created data

```typescript
// ❌ WRONG - Service data not tracked
const dashboard = await service.createDashboard(...);
// Dashboard left in database!

// ✅ CORRECT - Track and clean
serviceCreatedIds.push(dashboard.dashboard_id);
// Clean in afterEach
```

## Debugging Cleanup Issues

### Check what test data exists

```typescript
import { listTestEntities, getCleanupReport } from '@/tests/helpers/cleanup-verification';

// Get counts
const report = await getCleanupReport();
console.log(report.testEntities);

// Get actual entities
const entities = await listTestEntities();
console.log(entities.users);
```

### Check orphaned data

```typescript
import { countOrphanedData } from '@/tests/helpers/cleanup-verification';

const orphaned = await countOrphanedData();
if (orphaned.userRoles > 0) {
  console.log('Orphaned user_roles found');
}
```

### Find entities by scope

```typescript
import { findEntitiesByScope } from '@/tests/helpers/cleanup-verification';

const remaining = await findEntitiesByScope('my-test-scope');
console.log(remaining);
```

## See Also

- [Committed Factories README](tests/factories/committed/README.md) - Factory usage
- [Cleanup Verification](tests/helpers/cleanup-verification.ts) - Verification utilities
- [Cleanup Script](scripts/cleanup-test-data.ts) - Manual cleanup
