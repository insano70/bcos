Comprehensive Testing System Documentation
Next.js Application Testing Architecture
This document provides a complete overview of the testing system used in this Next.js 15 application. It includes enough detail for engineers to adapt this testing architecture to their own Next.js applications.
Table of Contents
Technology Stack
Configuration
File Organization
Test Types & Patterns
Factory System
Test Utilities
Testing Standards
Execution & Scripts
Best Practices
Adaptation Guide
1. Technology Stack
Core Framework: Vitest
Why Vitest:
Native ESM support (modern Next.js requirement)
Faster than Jest (thanks to Vite)
Excellent TypeScript integration
Compatible with Jest ecosystem (matchers, syntax)
Built-in parallel execution
Hot module reload for test files
Supporting Libraries:
{
  "vitest": "^3.5.3",
  "@vitest/ui": "^3.5.3",
  "@testing-library/react": "^17.3.0",
  "@testing-library/jest-dom": "^7.0.3",
  "jsdom": "^26.0.0"
}
Dev Dependencies:
@testing-library/react - Component testing
@testing-library/jest-dom - DOM matchers (toBeInTheDocument, etc.)
jsdom - Browser environment simulation
@vitest/ui - Interactive test UI dashboard
2. Configuration
Main Configuration: vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { cpus } from 'os';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.test' });

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup/unit-setup.ts'],
    globalSetup: ['./tests/setup/global-setup.ts'],
    globals: true,

    // Parallel execution with process forks
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: false,
        isolate: true,
        execArgv: ['--max-old-space-size=4096']
      }
    },

    // Performance optimization
    maxConcurrency: Math.min(cpus().length, 8),
    fileParallelism: true,

    // Timeouts for database operations
    testTimeout: 30000,
    hookTimeout: 30000,

    // Retry flaky tests
    retry: 1,

    // CI/CD reporters
    reporters: process.env.CI ? ['junit', 'github-actions'] : ['verbose'],

    // Coverage thresholds
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      thresholds: {
        statements: 20,
        branches: 15,
        functions: 20,
        lines: 20
      }
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './'),
      '@tests': resolve(__dirname, './tests'),
    },
  }
});
Environment Variables: .env.test
NODE_ENV=test
DATABASE_URL=postgresql://user:pass@localhost:5432/test_db
REDIS_URL=redis://localhost:6379/1
# Other test-specific environment variables
Global Setup: tests/setup/global-setup.ts
/**
 * Runs ONCE before all tests across all processes
 * - Verifies database connection
 * - Initializes connection pool
 */
export async function setup() {
  // Verify database connectivity
  const testClient = postgres(process.env.DATABASE_URL);
  await testClient`SELECT 1`;
  await testClient.end();
}

/**
 * Runs ONCE after all tests complete
 * - Closes all database connections
 * - Cleans up resources
 */
export async function teardown() {
  await TestDatabasePool.closeAllConnections();
}
Unit Test Setup: tests/setup/unit-setup.ts
/**
 * Runs BEFORE EACH test file
 * - Initializes mocks
 * - Sets up environment
 */
import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock logger for all tests
vi.mock('@/lib/logger', () => ({
  log: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }
}));
3. File Organization
Directory Structure
/tests/
├── setup/                      # Test environment configuration
│   ├── global-setup.ts             # Global initialization (runs once)
│   ├── unit-setup.ts               # Unit test setup (runs per file)
│   ├── integration-setup.ts        # Integration test setup
│   └── cleanup.ts                  # Cleanup utilities
│
├── unit/                       # Unit tests (no database)
│   ├── auth/                       # Authentication logic
│   ├── validations/                # Zod schema validation
│   ├── utils/                      # Utility functions
│   ├── chart-data/                 # Data formatting
│   ├── cache/                      # Redis caching logic
│   └── services/                   # Business logic (mocked DB)
│
├── integration/                # Integration tests (with database)
│   ├── api/                        # API route testing
│   │   ├── users.test.ts
│   │   ├── auth/
│   │   └── ...
│   ├── rbac/                       # RBAC permission testing
│   │   ├── permissions.test.ts
│   │   ├── dashboards-service-committed.test.ts
│   │   └── ...
│   ├── auth-flow.test.ts           # End-to-end auth flows
│   └── ...
│
├── factories/                  # Test data factories
│   ├── base/                       # Core factory architecture
│   │   ├── base-factory.ts
│   │   ├── scoped-factory.ts
│   │   └── factory-types.ts
│   ├── committed/                  # Committed transaction factories
│   │   ├── user-committed.ts
│   │   ├── dashboard-committed.ts
│   │   └── ...
│   ├── user-factory.ts             # Transactional factories
│   ├── role-factory.ts
│   └── ...
│
├── helpers/                    # Test utilities
│   ├── rbac-helper.ts              # RBAC context builders
│   ├── db-helper.ts                # Transaction management
│   ├── test-database-pool.ts       # Connection pooling
│   └── unique-generator.ts         # Unique data generation
│
├── mocks/                      # Mock implementations
│   ├── auth-mocks.ts               # Authentication mocks
│   ├── database-mocks.ts           # Database mocks
│   ├── logger-mocks.ts             # Logger mocks
│   └── oidc-mocks.ts               # OIDC provider mocks
│
└── security/                   # Security-focused tests
    └── saml-security.test.ts
Naming Conventions
Test files: *.test.ts or *.test.tsx (NEVER .spec.ts)
Location: Centralized in /tests directory (NOT co-located with source)
Grouping: By test type (unit vs integration) and domain (auth, rbac, api)
Rationale for centralized tests:
Cleaner source directories
Easier to run all tests of a type
Clearer separation of concerns
Better organization for large codebases
4. Test Types & Patterns
A. Unit Tests (/tests/unit/)
Purpose: Test individual functions/modules in isolation without external dependencies. Characteristics:
No database access
Mock all external dependencies
Fast execution (milliseconds)
Focus on logic, not integration
Example: Validation Schema Testing
// tests/unit/validations/auth.test.ts
import { describe, expect, it } from 'vitest';
import { loginSchema } from '@/lib/validations/auth';

describe('loginSchema', () => {
  describe('email validation', () => {
    it('should accept valid email', () => {
      const result = loginSchema.safeParse({
        email: 'user@example.com',
        password: 'ValidPass123!',
      });
      
      expect(result.success).toBe(true);
    });

    it('should reject invalid email format', () => {
      const result = loginSchema.safeParse({
        email: 'not-an-email',
        password: 'ValidPass123!',
      });
      
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toContain('email');
    });
  });

  describe('password validation', () => {
    it('should require minimum length', () => {
      const result = loginSchema.safeParse({
        email: 'user@example.com',
        password: 'short',
      });
      
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toMatch(/password/i);
    });
  });
});
Example: Utility Function Testing
// tests/unit/utils/sanitize.test.ts
import { describe, expect, it } from 'vitest';
import { sanitizeEmail } from '@/lib/utils/sanitize';

describe('sanitizeEmail', () => {
  it('should convert to lowercase', () => {
    expect(sanitizeEmail('USER@EXAMPLE.COM')).toBe('user@example.com');
  });

  it('should trim whitespace', () => {
    expect(sanitizeEmail('  user@example.com  ')).toBe('user@example.com');
  });

  it('should handle null/undefined', () => {
    expect(sanitizeEmail(null)).toBeNull();
    expect(sanitizeEmail(undefined)).toBeNull();
  });
});
B. Integration Tests (/tests/integration/)
Purpose: Test complete flows with real database interactions. Characteristics:
Real Postgres database (test environment)
Transaction-based isolation
Automatic rollback after each test
Tests actual database constraints, triggers, etc.
Example: Authentication Flow Testing
// tests/integration/auth-flow.test.ts
import '@/tests/setup/integration-setup';
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestUser } from '@/tests/factories';
import { createTokenPair, validateAccessToken, refreshTokenPair } from '@/lib/auth';

describe('Complete Authentication Flow', () => {
  let testUser: User;

  beforeEach(async () => {
    testUser = await createTestUser();
  });

  it('should handle login → session → auth → logout', async () => {
    const deviceInfo = {
      userAgent: 'Test Browser',
      ipAddress: '127.0.0.1',
    };

    // 1. Login (create token pair)
    const tokenPair = await createTokenPair(
      testUser.user_id,
      deviceInfo
    );
    expect(tokenPair.accessToken).toBeDefined();
    expect(tokenPair.refreshToken).toBeDefined();

    // 2. Authorization (validate access token)
    const validated = await validateAccessToken(tokenPair.accessToken);
    expect(validated?.sub).toBe(testUser.user_id);

    // 3. Token refresh
    const newTokens = await refreshTokenPair(
      tokenPair.refreshToken,
      deviceInfo
    );
    expect(newTokens?.accessToken).not.toBe(tokenPair.accessToken);

    // 4. Logout (revoke tokens)
    const revoked = await revokeRefreshToken(
      newTokens.refreshToken,
      'logout'
    );
    expect(revoked).toBe(true);

    // 5. Verify refresh fails after logout
    const shouldFail = await refreshTokenPair(
      tokenPair.refreshToken,
      deviceInfo
    );
    expect(shouldFail).toBeNull();
  });
});
Example: RBAC Permission Testing
// tests/integration/rbac/permissions.test.ts
import '@/tests/setup/integration-setup';
import { describe, it, expect } from 'vitest';
import { createTestUser, createTestRole, createTestOrganization } from '@/tests/factories';
import { assignRoleToUser, assignUserToOrganization } from '@/tests/factories';
import { testUserPermission } from '@/tests/helpers/rbac-helper';

describe('RBAC Permission: users:read:organization', () => {
  it('should allow reading users in own organization', async () => {
    const user = await createTestUser();
    const org = await createTestOrganization();
    
    await assignUserToOrganization(user, org);
    
    const role = await createTestRole({
      organizationId: org.organization_id,
      permissions: ['users:read:organization'],
    });
    await assignRoleToUser(user, role, org);
    
    const result = await testUserPermission(
      user,
      'users:read:organization',
      undefined,
      org.organization_id
    );
    
    expect(result.granted).toBe(true);
  });

  it('should deny reading users in different organization', async () => {
    const user = await createTestUser();
    const org1 = await createTestOrganization();
    const org2 = await createTestOrganization();
    
    const role = await createTestRole({
      organizationId: org1.organization_id,
      permissions: ['users:read:organization'],
    });
    await assignRoleToUser(user, role, org1);
    
    const result = await testUserPermission(
      user,
      'users:read:organization',
      undefined,
      org2.organization_id  // Different org
    );
    
    expect(result.granted).toBe(false);
  });
});
C. Component Tests (React)
Purpose: Test React components with DOM interactions. Characteristics:
Uses jsdom environment
Testing Library for queries
Mock external dependencies
Focus on user interactions
Example: Component with Sanitization
/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DOMPurify from 'isomorphic-dompurify';
import { SafeHtmlRenderer } from '@/components/SafeHtmlRenderer';

vi.mock('isomorphic-dompurify', () => ({
  default: { sanitize: vi.fn() }
}));

describe('SafeHtmlRenderer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render sanitized HTML', () => {
    const html = '<p>Hello World</p>';
    const sanitized = '<p>Hello World</p>';
    
    vi.mocked(DOMPurify.sanitize).mockReturnValue(sanitized);
    
    render(<SafeHtmlRenderer html={html} />);
    
    expect(screen.getByText('Hello World')).toBeInTheDocument();
    expect(DOMPurify.sanitize).toHaveBeenCalledWith(
      html,
      expect.objectContaining({
        ALLOWED_TAGS: expect.arrayContaining(['p', 'br', 'strong']),
      })
    );
  });

  it('should strip dangerous scripts', () => {
    const html = '<p>Safe</p><script>alert("xss")</script>';
    const sanitized = '<p>Safe</p>';
    
    vi.mocked(DOMPurify.sanitize).mockReturnValue(sanitized);
    
    render(<SafeHtmlRenderer html={html} />);
    
    expect(screen.queryByText(/xss/)).not.toBeInTheDocument();
    expect(screen.getByText('Safe')).toBeInTheDocument();
  });
});
Key Pattern: Use @vitest-environment jsdom comment at top of file.
5. Factory System
This codebase uses a sophisticated dual factory architecture for test data creation.
Architecture Overview
┌─────────────────────────────────────────────────────────┐
│                   Factory System                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────────────┐    ┌──────────────────────┐  │
│  │ Transactional        │    │ Committed            │  │
│  │ Factories            │    │ Factories            │  │
│  ├──────────────────────┤    ├──────────────────────┤  │
│  │ • Test transaction   │    │ • Real commits       │  │
│  │ • Auto rollback      │    │ • Visible to app     │  │
│  │ • NOT visible to app │    │ • Manual cleanup     │  │
│  │ • Fast               │    │ • Scope tracking     │  │
│  └──────────────────────┘    └──────────────────────┘  │
│          ↓                            ↓                 │
│  ┌──────────────────────┐    ┌──────────────────────┐  │
│  │ Unit Tests           │    │ Integration Tests    │  │
│  │ Service Tests (mock) │    │ Service Tests (real) │  │
│  └──────────────────────┘    └──────────────────────┘  │
└─────────────────────────────────────────────────────────┘
A. Transactional Factories
Location: /tests/factories/*.ts Use when:
Testing logic that doesn't query the database directly
Unit testing services with mocked database
Fast test execution is priority
How it works:
// Automatic transaction management
await initializeMainTransaction();  // Once per test session
const tx = await getTestTransaction();  // Savepoint for each test
// ... test runs ...
await rollbackTransaction();  // Automatic cleanup
Example:
// tests/factories/user-factory.ts
import { getCurrentTransaction } from '@/tests/helpers/db-helper';
import { users } from '@/lib/db/schema';
import { nanoid } from 'nanoid';

export async function createTestUser(overrides = {}) {
  const tx = getCurrentTransaction();
  
  const userData = {
    user_id: nanoid(16),
    email: `user-${nanoid(8)}@test.local`,
    first_name: 'Test',
    last_name: 'User',
    is_active: true,
    email_verified: true,
    ...overrides,
  };
  
  const [user] = await tx
    .insert(users)
    .values(userData)
    .returning();
  
  return user;
}

// Variations
export async function createAdminUser(overrides = {}) {
  return createTestUser({
    is_super_admin: true,
    ...overrides,
  });
}

export async function createInactiveUser(overrides = {}) {
  return createTestUser({
    is_active: false,
    ...overrides,
  });
}
Usage:
import { createTestUser } from '@/tests/factories';

describe('User Tests', () => {
  it('should create user', async () => {
    const user = await createTestUser();
    // Data exists in test transaction
    // Automatically rolled back after test
    expect(user.email).toMatch(/@test\.local$/);
  });
});
B. Committed Factories
Location: /tests/factories/committed/*.ts Use when:
Testing services that query the database directly
Integration testing real database operations
Testing with real foreign key constraints
How it works:
// Data is COMMITTED to database
// Visible to application code
// Requires manual cleanup with scopes
Example:
// tests/factories/committed/user-committed.ts
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { nanoid } from 'nanoid';
import { registerCleanup } from '@/tests/factories/base';

export async function createCommittedUser(options: {
  scope: string;
  overrides?: Partial<User>;
}) {
  const userData = {
    user_id: nanoid(16),
    email: `user-${nanoid(8)}@test.local`,
    first_name: 'Test',
    last_name: 'User',
    is_active: true,
    ...options.overrides,
  };
  
  const [user] = await db
    .insert(users)
    .values(userData)
    .returning();
  
  // Register for cleanup (FK-aware)
  registerCleanup(options.scope, 'users', user.user_id);
  
  return user;
}
Usage with Scopes:
import { createCommittedUser, createCommittedDashboard } from '@/tests/factories/committed';
import { createTestScope } from '@/tests/factories/base';
import { DashboardService } from '@/lib/services/dashboards';

describe('Dashboard Service Integration Tests', () => {
  let scope: ScopedFactoryCollection;
  let scopeId: string;
  let serviceCreatedIds: string[] = [];

  beforeEach(() => {
    scopeId = `test-${nanoid(8)}`;
    scope = createTestScope(scopeId);
    serviceCreatedIds = [];
  });

  afterEach(async () => {
    // CRITICAL: Clean service-created data FIRST
    if (serviceCreatedIds.length > 0) {
      await db.delete(dashboards)
        .where(inArray(dashboards.dashboard_id, serviceCreatedIds));
    }
    
    // Then clean factory data (FK-aware cleanup)
    await scope.cleanup();
  });

  it('should create dashboard through service', async () => {
    // Create user via committed factory
    const user = await createCommittedUser({
      scope: scopeId,
    });
    
    // Service can see this user
    const service = new DashboardService(user);
    const dashboard = await service.createDashboard({
      title: 'Test Dashboard',
    });
    
    // Track for cleanup
    serviceCreatedIds.push(dashboard.dashboard_id);
    
    expect(dashboard.created_by).toBe(user.user_id);
  });

  it('should retrieve dashboards', async () => {
    const user = await createCommittedUser({ scope: scopeId });
    
    // Create via committed factory (also visible to service)
    const dashboard = await createCommittedDashboard({
      scope: scopeId,
      overrides: { created_by: user.user_id },
    });
    
    const service = new DashboardService(user);
    const dashboards = await service.getDashboards();
    
    expect(dashboards.map(d => d.dashboard_id))
      .toContain(dashboard.dashboard_id);
  });
});
Scope-Based Cleanup
How scopes work:
Create scope: const scope = createTestScope(scopeId);
Pass to factories: createCommittedUser({ scope: scopeId })
Automatic tracking: Factory registers cleanup with scope
FK-aware cleanup: await scope.cleanup(); deletes in correct order
Cleanup order (respects foreign keys):
dashboards (no dependencies)
  ↓
dashboard_widgets (depends on dashboards)
  ↓
user_organizations (depends on users)
  ↓
users (depends on nothing)
6. Test Utilities
A. Database Transaction Management
File: tests/helpers/db-helper.ts Key Functions:
// Initialize main transaction (once per test session)
await initializeMainTransaction();

// Get transaction for current test (creates savepoint)
const tx = await getTestTransaction();

// Get current transaction (for factories)
const tx = getCurrentTransaction();

// Rollback test changes (automatic in afterEach)
await rollbackTransaction();

// Clean up connections
await cleanupTestDatabase();
How it works:
┌──────────────────────────────────────────┐
│ Test Session                             │
├──────────────────────────────────────────┤
│                                          │
│  BEGIN TRANSACTION;  ← Main transaction │
│                                          │
│  ┌────────────────────────────────────┐ │
│  │ Test 1                             │ │
│  │ SAVEPOINT test1;                   │ │
│  │ ... test operations ...            │ │
│  │ ROLLBACK TO test1;                 │ │
│  └────────────────────────────────────┘ │
│                                          │
│  ┌────────────────────────────────────┐ │
│  │ Test 2                             │ │
│  │ SAVEPOINT test2;                   │ │
│  │ ... test operations ...            │ │
│  │ ROLLBACK TO test2;                 │ │
│  └────────────────────────────────────┘ │
│                                          │
│  ROLLBACK;  ← End of session           │
└──────────────────────────────────────────┘
Benefits:
No database pollution between tests
Fast rollback (no actual deletes)
Parallel test execution support
Real database constraint testing
B. RBAC Testing Helpers
File: tests/helpers/rbac-helper.ts Key Functions:
// Build full user context (with roles, permissions, org)
const userContext = await buildUserContext(
  user,
  organizationId
);

// Test permission enforcement
const result = await testUserPermission(
  user,
  'users:read:all',
  undefined,  // resourceUserId
  organizationId
);

// Create user with specific permissions
const user = await createUserWithPermissions([
  'users:read:all',
  'users:create:organization',
]);

// Assign roles and organizations
await assignRoleToUser(user, role, organization);
await assignUserToOrganization(user, organization);
Example Usage:
describe('Permission Testing', () => {
  it('should enforce users:read:all permission', async () => {
    // Create user without permission
    const user = await createTestUser();
    
    // Should deny
    let result = await testUserPermission(user, 'users:read:all');
    expect(result.granted).toBe(false);
    
    // Grant permission
    const role = await createTestRole({
      permissions: ['users:read:all'],
    });
    await assignRoleToUser(user, role);
    
    // Should allow
    result = await testUserPermission(user, 'users:read:all');
    expect(result.granted).toBe(true);
  });
});
C. Mock System
File: tests/mocks/index.ts Quick Presets:
import { MockPresets } from '@tests/mocks';

// Minimal mocking for unit tests
const mocks = MockPresets.unit();

// Comprehensive mocking for integration tests
const mocks = MockPresets.integration();
Module Mocking:
import { ModuleMockFactories } from '@tests/mocks';
import { vi } from 'vitest';

// Mock database module
vi.mock('@/lib/db', ModuleMockFactories.db());

// Mock logger module
vi.mock('@/lib/logger', ModuleMockFactories.logger());

// Mock JWT library
vi.mock('jose', ModuleMockFactories.jose());
Available Mock Modules:
Database Mocks (tests/mocks/database-mocks.ts)
Mock query builder
Mock transaction handling
Mock ORM operations
Logger Mocks (tests/mocks/logger-mocks.ts)
Mock all log levels
Mock correlation tracking
Mock audit logging
Auth Mocks (tests/mocks/auth-mocks.ts)
Mock JWT creation/validation
Mock session management
Mock token encryption
OIDC Mocks (tests/mocks/oidc-mocks.ts)
Mock OIDC provider
Mock token endpoints
Mock user info endpoints
D. Unique Data Generation
File: tests/helpers/unique-generator.ts Key Functions:
import { generateUniqueEmail, generateUniqueString } from '@/tests/helpers/unique-generator';

// Unique email (cryptographically secure)
const email = generateUniqueEmail();
// → "user-AbC123XyZ@test.local"

// Unique string with prefix
const username = generateUniqueString('user');
// → "user-AbC123XyZ"

// Unique ID (nanoid)
const id = generateUniqueId();
// → "V1StGXR8_Z5jdHi6B-myT"
Why cryptographically unique:
Prevents test collisions in parallel execution
No need for counters or timestamps
Deterministic test data (same seed = same output)
7. Testing Standards
A. Test Structure (AAA Pattern)
describe('Feature Name', () => {
  describe('Sub-feature or Method', () => {
    it('should do something specific when condition', async () => {
      // ARRANGE: Setup test data and conditions
      const user = await createTestUser();
      const role = await createTestRole({
        permissions: ['users:read:all'],
      });
      await assignRoleToUser(user, role);
      
      // ACT: Execute the operation being tested
      const result = await operation(user);
      
      // ASSERT: Verify expectations
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });
  });
});
B. Descriptive Test Names
Good:
it('should allow users:read:all with permission')
it('should deny users:read:all without permission')
it('should return 401 when access token is expired')
it('should sanitize XSS attempts in user input')
Bad:
it('works')
it('test user permissions')
it('should pass')
C. One Assertion Per Concept
Good:
it('should create user with default values', async () => {
  const user = await createTestUser();
  
  expect(user.user_id).toBeDefined();
  expect(user.is_active).toBe(true);
  expect(user.email_verified).toBe(true);
});

it('should generate unique email', async () => {
  const user = await createTestUser();
  
  expect(user.email).toMatch(/@test\.local$/);
});
Bad:
it('should work correctly', async () => {
  const user = await createTestUser();
  
  expect(user.user_id).toBeDefined();
  expect(user.is_active).toBe(true);
  expect(user.email).toMatch(/@test\.local$/);
  
  const role = await createTestRole();
  expect(role.role_id).toBeDefined();
  
  await assignRoleToUser(user, role);
  const context = await buildUserContext(user);
  expect(context.roles).toHaveLength(1);
});
D. Transaction-Based Test Isolation
Always use transactions for integration tests:
import '@/tests/setup/integration-setup';

describe('Integration Tests', () => {
  beforeEach(async () => {
    // Transaction is automatically started via integration-setup
    // Each test gets a fresh savepoint
  });

  afterEach(async () => {
    // Automatic rollback to savepoint
    // No manual cleanup needed for transactional factories
  });

  it('should test database operation', async () => {
    const user = await createTestUser();
    // Test runs in transaction
    // Automatically rolled back after test
  });
});
E. Committed Factory Cleanup Pattern
For tests using committed factories:
describe('Service Integration Tests', () => {
  let scope: ScopedFactoryCollection;
  let scopeId: string;
  let serviceCreatedIds: string[] = [];

  beforeEach(() => {
    scopeId = `test-${nanoid(8)}`;
    scope = createTestScope(scopeId);
    serviceCreatedIds = [];
  });

  afterEach(async () => {
    // CRITICAL ORDER:
    // 1. Clean service-created data FIRST (prevent FK violations)
    if (serviceCreatedIds.length > 0) {
      await db.delete(table)
        .where(inArray(table.id, serviceCreatedIds));
    }
    
    // 2. Clean factory data (FK-aware)
    await scope.cleanup();
  });

  it('should work', async () => {
    const user = await createCommittedUser({ scope: scopeId });
    
    const service = new Service(user);
    const result = await service.create({ data });
    
    serviceCreatedIds.push(result.id);
    
    expect(result).toBeDefined();
  });
});
F. Permission Testing Pattern
Test both positive and negative cases:
describe('Permission: resource:action:scope', () => {
  it('should allow with permission', async () => {
    const user = await createUserWithPermissions(['resource:action:scope']);
    
    const result = await testUserPermission(user, 'resource:action:scope');
    
    expect(result.granted).toBe(true);
  });

  it('should deny without permission', async () => {
    const user = await createTestUser(); // No permissions
    
    const result = await testUserPermission(user, 'resource:action:scope');
    
    expect(result.granted).toBe(false);
  });

  it('should deny in different organization', async () => {
    const user = await createTestUser();
    const org1 = await createTestOrganization();
    const org2 = await createTestOrganization();
    
    const role = await createTestRole({
      organizationId: org1.organization_id,
      permissions: ['resource:action:organization'],
    });
    await assignRoleToUser(user, role, org1);
    
    const result = await testUserPermission(
      user,
      'resource:action:organization',
      undefined,
      org2.organization_id  // Different org
    );
    
    expect(result.granted).toBe(false);
  });
});
G. Component Testing Pattern
Use Testing Library queries:
/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';

describe('MyComponent', () => {
  it('should render and handle interaction', async () => {
    const onSubmit = vi.fn();
    
    render(<MyComponent onSubmit={onSubmit} />);
    
    // Query by role (preferred)
    const button = screen.getByRole('button', { name: /submit/i });
    expect(button).toBeInTheDocument();
    
    // Interact
    fireEvent.click(button);
    
    // Wait for async operations
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
  });
});
Testing Library Query Priority:
getByRole (accessibility-first)
getByLabelText (forms)
getByPlaceholderText (inputs)
getByText (content)
getByTestId (last resort)
8. Execution & Scripts
NPM Scripts (from package.json)
Basic Execution:
pnpm test              # Watch mode (interactive)
pnpm test:run          # Run once
pnpm test:ui           # Interactive UI dashboard
By Test Type:
pnpm test:unit         # Unit tests only (fast)
pnpm test:integration  # Integration tests (database)
pnpm test:api          # API route tests
pnpm test:rbac         # RBAC permission tests
pnpm test:saml         # SAML authentication tests
Execution Modes:
pnpm test:parallel         # Parallel with forks
pnpm test:parallel:max     # Max concurrency (8 workers)
pnpm test:sequential       # Single worker (debugging)
Coverage:
pnpm test:coverage         # Generate coverage report
pnpm test:coverage:ui      # Coverage with interactive UI
Specific Tests:
pnpm test:specific:users       # Users API tests
pnpm test:specific:permissions # Permission tests

# Or by file pattern
vitest run tests/integration/api/users.test.ts
vitest run tests/unit/validations
Watch Mode:
pnpm test:watch        # Watch and re-run on changes
pnpm test:watch:ui     # Watch with UI
Debug Mode:
pnpm test:debug        # Verbose output, no coverage
pnpm test:debug:single # Single worker for debugging
CI/CD Integration
GitHub Actions Example:
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:17
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: test_db
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    
    steps:
      - uses: actions/checkout@v4
      
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      
      - run: pnpm install
      
      - run: pnpm test:coverage
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test_db
          CI: true
      
      - uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
Test Output
JUnit XML (CI):
<!-- test-results.xml -->
<testsuites>
  <testsuite name="RBAC Permission Tests" tests="42" failures="0">
    <testcase name="should allow users:read:all" time="0.123"/>
    <testcase name="should deny users:read:all" time="0.089"/>
  </testsuite>
</testsuites>
Coverage Report:
File                           | % Stmts | % Branch | % Funcs | % Lines
-------------------------------|---------|----------|---------|--------
lib/auth/token-manager.ts      |   85.23 |    78.12 |   90.00 |   84.67
lib/services/user-service.ts   |   72.45 |    65.33 |   80.00 |   71.89
lib/rbac/permission-check.ts   |   95.67 |    92.45 |  100.00 |   95.34
9. Best Practices
1. Choose the Right Factory Type
Use Transactional Factories when:
Testing pure logic (validation, calculation, formatting)
Mocking database in service layer
Speed is critical
No need for real database visibility
Use Committed Factories when:
Testing services that query database directly
Integration testing with real constraints
Testing cascade deletes, triggers, etc.
Need to verify data persistence
2. Always Clean Up Committed Data
// WRONG: No cleanup
it('should work', async () => {
  const user = await createCommittedUser({ scope: scopeId });
  // Test runs
  // Data left in database! 💥
});

// CORRECT: Proper cleanup
let scope: ScopedFactoryCollection;

beforeEach(() => {
  scope = createTestScope(`test-${nanoid(8)}`);
});

afterEach(async () => {
  await scope.cleanup();
});

it('should work', async () => {
  const user = await createCommittedUser({ scope: scope.id });
  // Test runs
  // Data cleaned up automatically ✅
});
3. Test Edge Cases
describe('User Registration', () => {
  it('should handle valid registration', async () => {
    // Happy path
  });

  it('should reject duplicate email', async () => {
    await createTestUser({ email: 'duplicate@test.com' });
    
    await expect(
      createTestUser({ email: 'duplicate@test.com' })
    ).rejects.toThrow(/duplicate/i);
  });

  it('should reject invalid email format', async () => {
    await expect(
      createTestUser({ email: 'not-an-email' })
    ).rejects.toThrow(/email/i);
  });

  it('should handle null values gracefully', async () => {
    await expect(
      createTestUser({ email: null })
    ).rejects.toThrow();
  });
});
4. Mock External Dependencies
import { vi } from 'vitest';

// Mock external API
vi.mock('@/lib/external/api-client', () => ({
  fetchUserData: vi.fn().mockResolvedValue({ id: '123', name: 'Test' }),
}));

// Mock file system
vi.mock('fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue('file contents'),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

// Mock date/time
vi.mock('@/lib/utils/time', () => ({
  getCurrentTimestamp: vi.fn().mockReturnValue('2024-01-01T00:00:00Z'),
}));
5. Use Descriptive Assertions
// BAD: No message
expect(result).toBe(true);

// GOOD: Descriptive
expect(result.granted).toBe(true);

// BETTER: With custom message
expect(result.granted, 'User should have permission').toBe(true);

// BEST: Multiple specific assertions
expect(result.granted).toBe(true);
expect(result.permission).toBe('users:read:all');
expect(result.userId).toBe(user.user_id);
6. Isolate Tests Completely
// BAD: Shared state
let sharedUser: User;

beforeAll(async () => {
  sharedUser = await createTestUser();
});

it('test 1', async () => {
  // Modifies shared state
  await updateUser(sharedUser, { is_active: false });
});

it('test 2', async () => {
  // Breaks because test 1 modified state! 💥
  expect(sharedUser.is_active).toBe(true);
});

// GOOD: Isolated state
beforeEach(async () => {
  // Fresh user for each test
  const user = await createTestUser();
});

it('test 1', async () => {
  const user = await createTestUser();
  await updateUser(user, { is_active: false });
  expect(user.is_active).toBe(false);
});

it('test 2', async () => {
  const user = await createTestUser();
  expect(user.is_active).toBe(true); // ✅ Independent
});
7. Document Known Issues
it.skip('should handle complex cascade delete', async () => {
  // TODO: Bug #1234 - Cascade delete fails with circular references
  // Unskip after fixing foreign key constraints
  
  const user = await createCommittedUser({ scope: scopeId });
  const dashboard = await createCommittedDashboard({
    scope: scopeId,
    overrides: { created_by: user.user_id },
  });
  
  await expect(
    deleteUser(user.user_id)
  ).resolves.not.toThrow();
});
8. Parallel Execution Safety
// SAFE: Each test has unique scope
describe('Parallel Safe Tests', () => {
  let scopeId: string;

  beforeEach(() => {
    scopeId = `test-${nanoid(8)}`; // Unique per test
  });

  it('test 1', async () => {
    const user = await createCommittedUser({ scope: scopeId });
    // Unique scope prevents collisions
  });

  it('test 2', async () => {
    const user = await createCommittedUser({ scope: scopeId });
    // Different scope, no collision
  });
});
10. Adaptation Guide
Adapting to Your Next.js Application
Step 1: Install Dependencies
pnpm add -D vitest @vitest/ui @testing-library/react @testing-library/jest-dom jsdom
Step 2: Create Vitest Config
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.test' });

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup/unit-setup.ts'],
    globalSetup: ['./tests/setup/global-setup.ts'],
    globals: true,
    pool: 'forks',
    maxConcurrency: 8,
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './'),
    },
  },
});
Step 3: Create Test Directory Structure
mkdir -p tests/{setup,unit,integration,factories,helpers,mocks}
Step 4: Set Up Database Transaction Helper
Adapt tests/helpers/db-helper.ts from this codebase:
Replace database client (Drizzle → your ORM)
Keep transaction/savepoint logic
Adjust for your schema
Step 5: Create Basic Factories
Start with user factory:
// tests/factories/user-factory.ts
import { getCurrentTransaction } from '../helpers/db-helper';
import { nanoid } from 'nanoid';

export async function createTestUser(overrides = {}) {
  const tx = getCurrentTransaction();
  
  const user = {
    id: nanoid(16),
    email: `user-${nanoid(8)}@test.local`,
    name: 'Test User',
    ...overrides,
  };
  
  // Adapt to your ORM
  const created = await tx.insert('users').values(user);
  
  return created;
}
Step 6: Add Test Scripts
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run",
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration",
    "test:coverage": "vitest run --coverage"
  }
}
Step 7: Write Your First Test
// tests/integration/users.test.ts
import { describe, it, expect } from 'vitest';
import { createTestUser } from '../factories';

describe('User CRUD', () => {
  it('should create user', async () => {
    const user = await createTestUser();
    
    expect(user.id).toBeDefined();
    expect(user.email).toMatch(/@test\.local$/);
  });
});
Step 8: Gradually Add Complexity
Add more factories (roles, organizations, etc.)
Add committed factories for integration tests
Add helper utilities (RBAC helpers, etc.)
Add mock system for external dependencies
Increase coverage thresholds as tests grow
Key Takeaways
Vitest is faster and more modern than Jest for Next.js apps
Dual factory system (transactional vs committed) provides flexibility
Transaction-based isolation prevents database pollution
Scope-based cleanup handles foreign key dependencies
Parallel execution with forks speeds up test suites
RBAC testing is critical for permission-based systems
Mock strategically - only mock what's necessary
Test edge cases - not just happy paths
Document known issues with .skip() and comments
Adapt incrementally - start simple, add complexity as needed
Additional Resources
Vitest Docs: https://vitest.dev
Testing Library: https://testing-library.com
Test Database Patterns: https://brandur.org/fragments/testing-patterns
Factory Pattern: https://thoughtbot.com/blog/factory-girl-for-testing
Stats for this codebase:
61 test files
~22,862 lines of test code
20% coverage (targeting 50%+)
Parallel execution (up to 8 workers)
1 retry for flaky tests
30s timeout for database operations