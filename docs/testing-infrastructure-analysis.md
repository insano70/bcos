# Testing Infrastructure Analysis

## Executive Summary

Analysis of existing testing infrastructure reveals well-established patterns for integration testing. The planned login integration tests can leverage existing helpers, factories, and patterns without reinventing infrastructure.

## Existing Testing Infrastructure

### 1. Test Setup and Isolation

**Pattern: Transaction-based Isolation with Savepoints**

- **File**: `tests/setup/integration-setup.ts`
- **Mechanism**:
  - `beforeAll`: Creates main transaction via `initializeMainTransaction()`
  - `beforeEach`: Creates savepoint via `getTestTransaction()`
  - `afterEach`: Rolls back to savepoint via `rollbackTransaction()`
  - `afterAll`: Rolls back main transaction via `cleanupTestDb()`
- **Usage**: Import `@/tests/setup/integration-setup` at top of test file
- **Database Access**: Use `getCurrentTransaction()` to get current transaction

**Pattern: Factory Registry for Committed Transactions**

- **File**: `tests/factories/committed/setup.ts` (imported by integration-setup)
- **Purpose**: Factories that can create data that persists across tests
- **Registered**: Automatically imported when using integration-setup

### 2. Database Helper Functions

**File**: `tests/helpers/db-helper.ts` (171 lines)

Functions:
- `initializeMainTransaction()` - Start main test transaction
- `getTestTransaction()` - Create savepoint for test
- `rollbackTransaction()` - Rollback to savepoint
- `cleanupTestDb()` - Final cleanup
- `getCurrentTransaction()` - Get current transaction for queries

Pattern:
```typescript
import { getCurrentTransaction } from '@/tests/helpers/db-helper'

const tx = getCurrentTransaction()
const [user] = await tx.select().from(users).where(eq(users.email, email))
```

### 3. Factory Functions

**Files**: `tests/factories/*.ts`

Available Factories:
- `createTestUser(options?)` - Create test user with defaults
- `createTestAdminUser(options?)` - Create admin user
- `createInactiveTestUser(options?)` - Create inactive user
- `createUnverifiedTestUser(options?)` - Create unverified user
- `createTestUsers(count, options?)` - Batch create users
- Organization, practice, role, dashboard factories also available

Pattern:
```typescript
import { createTestUser } from '@/tests/factories/user-factory'

const user = await createTestUser({
  email: 'test@example.com',
  password: 'TestPassword123!',
  emailVerified: true
})
```

**Central Export**: `tests/factories/index.ts` exports all factories

### 4. Unique Identifier Generation

**File**: `tests/helpers/unique-generator.ts`

Functions:
- `generateUniqueEmail(prefix?)` - Crypto-random email
- `generateUniqueUsername(prefix?)` - Crypto-random username
- `generateCryptoUniqueId(prefix?)` - Base crypto ID
- `generateUniqueOrgName(prefix?)` - Organization name
- `generateUniqueDomain(prefix?)` - Domain name
- `generateUniqueRoleName(prefix?)` - Role name

Pattern: Prevents collision in parallel tests using `crypto.randomBytes(8)`

### 5. RBAC Helper Functions

**File**: `tests/helpers/rbac-helper.ts`

Functions:
- `assignUserToOrganization(userId, orgId, roleId?)` - Assign user to org
- Mapper functions for converting DB objects

Pattern: Reusable RBAC setup for tests requiring permissions

### 6. Mock Utilities

**File**: `tests/helpers/csrf-monitor-mock.ts`

- In-memory CSRF monitor for tests
- `getMockCSRFMonitor()` - Get singleton instance
- `resetMockCSRFMonitor()` - Reset for next test

**Pattern**: Specialized mocks for complex dependencies

### 7. Integration Test Patterns

**Two Primary Patterns Identified:**

#### Pattern A: HTTP Endpoint Testing (SAML Example)

**File**: `tests/integration/saml-endpoints.test.ts` (89 lines)

```typescript
import { describe, it, expect } from 'vitest'
import '@/tests/setup/integration-setup'

describe('SAML Login Initiation', () => {
  it('should redirect to Microsoft Entra', async () => {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4001'
    const response = await fetch(`${baseUrl}/api/auth/saml/login`, {
      redirect: 'manual'
    })

    expect([302, 307]).toContain(response.status)
    const location = response.headers.get('location')
    expect(location).toBeTruthy()
    expect(location).toContain('login.microsoftonline.com')
  })
})
```

**Characteristics:**
- Uses `fetch()` with real HTTP requests
- Tests HTTP status codes, headers, redirects
- Uses `redirect: 'manual'` to prevent auto-follow
- Checks response headers and body
- **BEST FOR**: API route integration testing

#### Pattern B: Business Logic Testing (Token Lifecycle Example)

**File**: `tests/integration/token-lifecycle.test.ts` (222 lines)

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import '@/tests/setup/integration-setup'
import { createTestUser } from '@/tests/factories/user-factory'
import { createTokenPair, validateAccessToken } from '@/lib/auth/token-manager'

describe('Token Lifecycle', () => {
  let testUser: any

  beforeEach(async () => {
    testUser = await createTestUser()
  })

  it('should create valid token pair', async () => {
    const deviceInfo = { /* ... */ }
    const tokenPair = await createTokenPair(testUser.user_id, deviceInfo, false)

    expect(tokenPair.accessToken).toBeTruthy()
    expect(tokenPair.refreshToken).toBeTruthy()

    const validation = await validateAccessToken(tokenPair.accessToken)
    expect(validation.valid).toBe(true)
  })
})
```

**Characteristics:**
- Direct function calls (no HTTP)
- Tests business logic and data flow
- Uses factories for test data setup
- Uses `beforeEach` for common setup
- **BEST FOR**: Service/utility function testing

### 8. Mock Setup Patterns

**File**: `tests/integration/csrf-lifecycle.test.ts` (495 lines)

Shows comprehensive mocking pattern:
```typescript
import { vi, beforeEach } from 'vitest'

// Mock Next.js cookies
vi.mock('next/headers', () => ({
  cookies: vi.fn()
}))

// Mock Web Crypto API
globalThis.crypto = {
  subtle: {
    encrypt: vi.fn(),
    decrypt: vi.fn()
  }
} as any

// Helper to create mock requests
function createMockRequest(options: {
  cookies?: Record<string, string>
  headers?: Record<string, string>
}): NextRequest {
  // ... implementation
}
```

**Pattern**: Extensive mocking for Next.js/Web APIs when needed

## Comparison: Original Plan vs Existing Patterns

### Original Plan (NEEDS UPDATE)

**Planned Approach:**
- Create new HTTP integration test files
- Test all login routes via HTTP
- Create custom test helpers
- ~2,600 lines of new code

**Issues with Original Plan:**
1. ❌ Did not identify existing HTTP pattern (saml-endpoints.test.ts)
2. ❌ Planned to create custom helpers that already exist
3. ❌ Did not leverage transaction-based isolation
4. ❌ Did not use existing factory functions
5. ❌ Missed unique ID generator utilities

### Updated Plan (LEVERAGES EXISTING PATTERNS)

**Pattern to Follow: HTTP Endpoint Testing (Pattern A)**

Based on `saml-endpoints.test.ts`, login integration tests should:
1. ✅ Import `@/tests/setup/integration-setup` for transaction isolation
2. ✅ Use `fetch()` for HTTP requests to test API routes
3. ✅ Use `redirect: 'manual'` for redirect testing
4. ✅ Use existing factories (`createTestUser`, etc.) for test data
5. ✅ Use `getCurrentTransaction()` for database queries
6. ✅ Use `generateUniqueEmail()` for unique identifiers
7. ✅ Structure: describe blocks by endpoint/feature
8. ✅ Test HTTP responses, status codes, headers, cookies

**Reusable Infrastructure (DO NOT RECREATE):**

| Component | Existing File | Usage |
|-----------|--------------|-------|
| Transaction setup | `integration-setup.ts` | Import at top |
| Database access | `db-helper.ts` | `getCurrentTransaction()` |
| User creation | `user-factory.ts` | `createTestUser(options)` |
| Unique IDs | `unique-generator.ts` | `generateUniqueEmail()` |
| RBAC setup | `rbac-helper.ts` | `assignUserToOrganization()` |
| CSRF mocking | `csrf-monitor-mock.ts` | `getMockCSRFMonitor()` |

**New Code Required (MINIMAL):**

1. Test files themselves (~500-700 lines each)
2. Login-specific test helpers (if truly unique, ~50 lines max)
3. Cookie extraction utilities (if not using direct fetch response)

## Updated Implementation Plan

### Test File Structure (Following saml-endpoints.test.ts Pattern)

```typescript
// tests/integration/login-password.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import '@/tests/setup/integration-setup'
import { createTestUser } from '@/tests/factories/user-factory'
import { generateUniqueEmail } from '@/tests/helpers/unique-generator'
import { getCurrentTransaction } from '@/tests/helpers/db-helper'

describe('Password Login', () => {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4001'

  beforeEach(async () => {
    // Test isolation handled automatically by integration-setup
  })

  describe('Successful Login', () => {
    it('should login with valid credentials', async () => {
      const email = generateUniqueEmail()
      const password = 'TestPassword123!'

      const user = await createTestUser({ email, password, emailVerified: true })

      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, remember: false })
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.data.user.email).toBe(email)

      // Verify cookies set
      const cookies = response.headers.get('set-cookie')
      expect(cookies).toContain('refresh-token')
      expect(cookies).toContain('access-token')
    })
  })

  describe('Rate Limiting', () => {
    it('should enforce rate limits on login attempts', async () => {
      // Use fetch() to test HTTP rate limiting
      // ...
    })
  })

  // ... more tests following HTTP pattern
})
```

### Minimal New Infrastructure (If Needed)

**Only create if truly needed:**

```typescript
// tests/helpers/auth-test-helpers.ts (ONLY IF NECESSARY)

/**
 * Extract cookie value from Set-Cookie header
 * ONLY CREATE IF fetch response.headers.get('set-cookie') parsing is complex
 */
export function extractCookieValue(setCookieHeader: string, name: string): string | null {
  const match = setCookieHeader.match(new RegExp(`${name}=([^;]+)`))
  return match ? match[1] : null
}

/**
 * Create authenticated fetch request with cookies
 * ONLY CREATE IF multiple tests need authenticated requests
 */
export async function authenticatedFetch(url: string, cookies: string, options?: RequestInit) {
  return fetch(url, {
    ...options,
    headers: {
      ...options?.headers,
      'Cookie': cookies
    }
  })
}
```

## Recommendations

### 1. Follow HTTP Testing Pattern (Pattern A)

✅ Use `saml-endpoints.test.ts` as the template for login integration tests
✅ Test via HTTP `fetch()` to validate full request/response cycle
✅ Test status codes, headers, cookies, response bodies

### 2. Leverage Existing Infrastructure

✅ Use `createTestUser()` instead of manual user creation
✅ Use `generateUniqueEmail()` for test data
✅ Use `getCurrentTransaction()` when database queries needed
✅ Import `@/tests/setup/integration-setup` for automatic isolation

### 3. Minimize New Code

❌ Do NOT create new transaction helpers (already exists)
❌ Do NOT create new user factories (already exists)
❌ Do NOT create new unique ID generators (already exists)
✅ Only create helpers if truly unique to login testing

### 4. Test Organization

**File Naming**: Follow existing pattern
- `login-password.test.ts` ✅
- `logout.test.ts` ✅
- `refresh-token.test.ts` ✅
- `user-context.test.ts` ✅
- `login-oidc.test.ts` ✅

**Location**: `tests/integration/` (alongside existing tests)

**Structure**: Nested describe blocks by feature/scenario

## Revised Estimates

| Test File | Original Estimate | Revised Estimate | Savings |
|-----------|------------------|------------------|---------|
| login-password.test.ts | 700 lines | 500 lines | 200 lines |
| logout.test.ts | 500 lines | 350 lines | 150 lines |
| refresh-token.test.ts | 600 lines | 400 lines | 200 lines |
| user-context.test.ts | 350 lines | 250 lines | 100 lines |
| login-oidc.test.ts | 450 lines | 300 lines | 150 lines |
| **New helpers** | - | ~50 lines | - |
| **TOTAL** | **2,600 lines** | **~1,850 lines** | **~750 lines saved** |

**Efficiency Gain**: ~29% reduction by leveraging existing infrastructure

## Next Steps

1. ✅ Complete this analysis (DONE)
2. Update todos with revised implementation approach
3. Implement each test file following HTTP pattern
4. Reuse existing factories, helpers, and setup
5. Only create new helpers if absolutely necessary
6. Run tests, TypeScript, and lint checks

## Conclusion

The existing testing infrastructure is robust and well-designed. By following the HTTP endpoint testing pattern demonstrated in `saml-endpoints.test.ts` and leveraging existing factories, helpers, and transaction-based isolation, we can implement comprehensive login integration tests with significantly less code and maximum consistency with existing patterns.

**Key Principle**: Reuse, don't reinvent.
