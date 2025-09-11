# Next.js Testing Strategy & Implementation Guide

## Overview

This document outlines a comprehensive testing strategy for a Next.js application using Vitest, Drizzle ORM, and PostgreSQL. The strategy prioritizes developer experience, test isolation, automated cleanup, and scalable patterns.

## Core Principles

1. **Complete Test Isolation** - Tests run independently without side effects
2. **Zero Manual Setup** - Fully automated test environment and cleanup
3. **Factory-Driven Data** - Centralized, reusable test data creation
4. **Automated RBAC Testing** - Security tests generated automatically for all routes
5. **Developer Experience First** - Simple commands, clear organization, maximum code reuse

## Project Structure

```
tests/
├── setup/
│   ├── global-setup.ts          # Database setup & cleanup
│   ├── test-setup.ts             # Test environment configuration
│   └── cleanup.ts                # Global cleanup utilities
├── factories/
│   ├── index.ts                  # Factory exports
│   ├── user-factory.ts           # User creation with unique identifiers
│   ├── organization-factory.ts   # Organization hierarchy creation
│   ├── practice-factory.ts       # Practice entity creation
│   └── role-factory.ts           # Role and permission creation
├── helpers/
│   ├── auth-helper.ts            # Authentication utilities
│   ├── db-helper.ts              # Database transaction management
│   ├── request-helper.ts         # API request utilities
│   └── rbac-helper.ts            # Role-based access control utilities
├── generators/
│   └── rbac-tests.ts             # Automated RBAC test generation
├── unit/
│   ├── services/
│   ├── utils/
│   └── components/
├── integration/
│   ├── api/
│   │   ├── users/
│   │   ├── organizations/
│   │   └── practices/
│   └── rbac/                     # Generated RBAC tests
└── mocks/
    ├── external-services.ts      # External service mocks
    └── middleware.ts             # Middleware mocks
```

## Configuration

### Vitest Configuration (`vitest.config.ts`)

```typescript
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup/test-setup.ts'],
    globalSetup: ['./tests/setup/global-setup.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    threads: false, // Ensure sequential execution for DB operations
    maxConcurrency: 1,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@tests': path.resolve(__dirname, './tests')
    }
  }
})
```

### Environment Variables (`.env.test`)

```env
DATABASE_URL="postgresql://user:password@localhost:5432/app_test"
NODE_ENV=test
JWT_SECRET=test_secret_key
NEXTAUTH_SECRET=test_nextauth_secret
```

## Core Implementation

### 1. Global Test Setup (`tests/setup/global-setup.ts`)

```typescript
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { migrate } from 'drizzle-orm/postgres-js/migrator'

export async function setup() {
  const connectionString = process.env.DATABASE_URL!
  
  // Create connection for setup
  const migrationClient = postgres(connectionString, { max: 1 })
  const db = drizzle(migrationClient)
  
  try {
    // Run migrations
    await migrate(db, { migrationsFolder: './drizzle' })
    console.log('✅ Test database migrations completed')
  } catch (error) {
    console.error('❌ Migration failed:', error)
    throw error
  } finally {
    await migrationClient.end()
  }
}

export async function teardown() {
  // Global cleanup runs after all tests
  const { cleanupDatabase } = await import('./cleanup')
  await cleanupDatabase()
  console.log('✅ Global test cleanup completed')
}
```

### 2. Test Environment Setup (`tests/setup/test-setup.ts`)

```typescript
import { beforeEach, afterEach } from 'vitest'
import { getTestTransaction, rollbackTransaction } from '@tests/helpers/db-helper'

// Setup transaction-based test isolation
beforeEach(async () => {
  // Each test gets a fresh transaction
  await getTestTransaction()
})

afterEach(async () => {
  // Always rollback, even on test failure
  await rollbackTransaction()
})
```

### 3. Database Helper (`tests/helpers/db-helper.ts`)

```typescript
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { type PostgresJsTransaction } from 'drizzle-orm/postgres-js'

let testClient: ReturnType<typeof postgres> | null = null
let testDb: ReturnType<typeof drizzle> | null = null
let currentTransaction: PostgresJsTransaction<any, any, any> | null = null

export function getTestDb() {
  if (!testClient) {
    testClient = postgres(process.env.DATABASE_URL!, { max: 1 })
    testDb = drizzle(testClient)
  }
  return testDb!
}

export async function getTestTransaction() {
  const db = getTestDb()
  currentTransaction = await db.transaction(async (tx) => {
    // Return the transaction to be used by tests
    return tx
  })
  return currentTransaction
}

export async function rollbackTransaction() {
  if (currentTransaction) {
    try {
      // Transaction will auto-rollback when function exits
      currentTransaction = null
    } catch (error) {
      console.error('Error rolling back transaction:', error)
    }
  }
}

export function getCurrentTransaction() {
  if (!currentTransaction) {
    throw new Error('No active transaction. Make sure test setup is running correctly.')
  }
  return currentTransaction
}
```

### 4. Unique ID Generator (`tests/helpers/unique-generator.ts`)

```typescript
export function generateUniqueId(): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  return `${timestamp}_${random}`
}

export function generateUniqueEmail(prefix = 'test'): string {
  return `${prefix}_${generateUniqueId()}@test.com`
}

export function generateUniqueUsername(prefix = 'user'): string {
  return `${prefix}_${generateUniqueId()}`
}

export function generateUniqueOrgName(prefix = 'org'): string {
  return `${prefix}_${generateUniqueId()}`
}
```

### 5. User Factory (`tests/factories/user-factory.ts`)

```typescript
import { getCurrentTransaction } from '@tests/helpers/db-helper'
import { users, type User } from '@/db/schema'
import { generateUniqueEmail, generateUniqueUsername } from '@tests/helpers/unique-generator'
import { hashPassword } from '@/lib/auth'

export interface CreateUserOptions {
  email?: string
  username?: string
  password?: string
  firstName?: string
  lastName?: string
  isActive?: boolean
}

export async function createTestUser(options: CreateUserOptions = {}): Promise<User> {
  const tx = getCurrentTransaction()
  
  const userData = {
    email: options.email || generateUniqueEmail(),
    username: options.username || generateUniqueUsername(),
    password: await hashPassword(options.password || 'TestPassword123!'),
    firstName: options.firstName || 'Test',
    lastName: options.lastName || 'User',
    isActive: options.isActive ?? true,
  }

  const [user] = await tx.insert(users).values(userData).returning()
  return user
}

export async function createTestUserWithRoles(
  roles: string[],
  userOptions: CreateUserOptions = {}
): Promise<{ user: User; roles: Role[] }> {
  const user = await createTestUser(userOptions)
  const userRoles = []
  
  for (const roleName of roles) {
    const role = await createTestRole({ name: roleName })
    await assignUserRole(user.id, role.id)
    userRoles.push(role)
  }
  
  return { user, roles: userRoles }
}
```

### 6. Organization Factory (`tests/factories/organization-factory.ts`)

```typescript
import { getCurrentTransaction } from '@tests/helpers/db-helper'
import { organizations, type Organization } from '@/db/schema'
import { generateUniqueOrgName } from '@tests/helpers/unique-generator'

export interface CreateOrgOptions {
  name?: string
  parentId?: string
  description?: string
  isActive?: boolean
}

export async function createTestOrganization(options: CreateOrgOptions = {}): Promise<Organization> {
  const tx = getCurrentTransaction()
  
  const orgData = {
    name: options.name || generateUniqueOrgName(),
    parentId: options.parentId || null,
    description: options.description || 'Test organization',
    isActive: options.isActive ?? true,
  }

  const [org] = await tx.insert(organizations).values(orgData).returning()
  return org
}

export async function createOrgHierarchy(levels: number = 3): Promise<Organization[]> {
  const orgs: Organization[] = []
  let parentId: string | undefined = undefined
  
  for (let i = 0; i < levels; i++) {
    const org = await createTestOrganization({
      name: generateUniqueOrgName(`level${i}`),
      parentId
    })
    orgs.push(org)
    parentId = org.id
  }
  
  return orgs
}
```

### 7. Auth Helper (`tests/helpers/auth-helper.ts`)

```typescript
import jwt from 'jsonwebtoken'
import { type User } from '@/db/schema'

export function generateTestJWT(user: User): string {
  return jwt.sign(
    { 
      userId: user.id,
      email: user.email,
      username: user.username
    },
    process.env.JWT_SECRET!,
    { expiresIn: '24h' }
  )
}

export function getAuthHeaders(user: User) {
  const token = generateTestJWT(user)
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
}

export async function authenticatedRequest(
  user: User,
  method: string,
  url: string,
  body?: any
) {
  const headers = getAuthHeaders(user)
  
  // Implementation depends on your test request utility
  return await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  })
}
```

### 8. RBAC Test Generator (`tests/generators/rbac-tests.ts`)

```typescript
import { describe, it, expect } from 'vitest'
import { createTestUser, createTestUserWithRoles } from '@tests/factories'
import { authenticatedRequest } from '@tests/helpers/auth-helper'

interface EndpointTest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: string
  requiredPermissions: string[]
  scope: 'user' | 'organization' | 'all'
  testData?: any
}

export const API_ENDPOINTS: EndpointTest[] = [
  {
    method: 'GET',
    path: '/api/users',
    requiredPermissions: ['users.read'],
    scope: 'all'
  },
  {
    method: 'POST',
    path: '/api/users',
    requiredPermissions: ['users.create'],
    scope: 'organization',
    testData: { email: 'test@test.com', username: 'testuser' }
  },
  {
    method: 'GET',
    path: '/api/organizations/{id}',
    requiredPermissions: ['organizations.read'],
    scope: 'organization'
  },
  // Add more endpoints as they're created
]

export function generateRBACTests() {
  describe('RBAC - Automated Access Control Tests', () => {
    
    API_ENDPOINTS.forEach(endpoint => {
      describe(`${endpoint.method} ${endpoint.path}`, () => {
        
        it('should allow access with correct permissions', async () => {
          const { user } = await createTestUserWithRoles(['admin'])
          // Grant required permissions to admin role
          await grantPermissionsToRole('admin', endpoint.requiredPermissions)
          
          const response = await authenticatedRequest(
            user,
            endpoint.method,
            endpoint.path,
            endpoint.testData
          )
          
          expect(response.status).not.toBe(403)
        })
        
        it('should deny access without permissions', async () => {
          const user = await createTestUser()
          
          const response = await authenticatedRequest(
            user,
            endpoint.method,
            endpoint.path,
            endpoint.testData
          )
          
          expect(response.status).toBe(403)
        })
        
        it('should deny access to unauthenticated requests', async () => {
          const response = await fetch(endpoint.path, {
            method: endpoint.method,
            headers: { 'Content-Type': 'application/json' },
            body: endpoint.testData ? JSON.stringify(endpoint.testData) : undefined
          })
          
          expect(response.status).toBe(401)
        })
        
        if (endpoint.scope === 'organization') {
          it('should enforce organization scope', async () => {
            const org1 = await createTestOrganization()
            const org2 = await createTestOrganization()
            
            const { user: user1 } = await createTestUserWithRoles(['member'])
            const { user: user2 } = await createTestUserWithRoles(['member'])
            
            await assignUserToOrganization(user1.id, org1.id)
            await assignUserToOrganization(user2.id, org2.id)
            
            // Grant permissions to member role
            await grantPermissionsToRole('member', endpoint.requiredPermissions)
            
            const testPath = endpoint.path.replace('{id}', org1.id)
            
            // User1 should access org1 resources
            const response1 = await authenticatedRequest(user1, endpoint.method, testPath)
            expect(response1.status).not.toBe(403)
            
            // User2 should NOT access org1 resources
            const response2 = await authenticatedRequest(user2, endpoint.method, testPath)
            expect(response2.status).toBe(403)
          })
        }
      })
    })
  })
}
```

### 9. Cleanup Strategy (`tests/setup/cleanup.ts`)

```typescript
import { getTestDb } from '@tests/helpers/db-helper'
import { users, organizations, practices, roles, userRoles } from '@/db/schema'
import { sql } from 'drizzle-orm'

export async function cleanupDatabase() {
  const db = getTestDb()
  
  try {
    // Delete test data in dependency order
    await db.delete(userRoles).where(sql`1=1`)
    await db.delete(users).where(sql`email LIKE '%test.com'`)
    await db.delete(organizations).where(sql`name LIKE '%test_%'`)
    await db.delete(practices).where(sql`name LIKE '%test_%'`)
    await db.delete(roles).where(sql`name LIKE '%test_%'`)
    
    console.log('✅ Test data cleanup completed')
  } catch (error) {
    console.error('❌ Cleanup failed:', error)
    throw error
  }
}

// Utility for cleaning up specific test data patterns
export async function cleanupByPattern(pattern: string) {
  const db = getTestDb()
  const timestamp = pattern.split('_')[0]
  
  // Clean up data created in specific test run
  await db.delete(users).where(sql`username LIKE ${'%' + timestamp + '%'}`)
  await db.delete(organizations).where(sql`name LIKE ${'%' + timestamp + '%'}`)
  // Add other cleanup as needed
}
```

## Testing Patterns

### Unit Test Example

```typescript
// tests/unit/services/user-service.test.ts
import { describe, it, expect } from 'vitest'
import { createTestUser } from '@tests/factories'
import { UserService } from '@/services/user-service'

describe('UserService', () => {
  it('should create user with hashed password', async () => {
    const userData = {
      email: 'test@test.com',
      username: 'testuser',
      password: 'plaintext'
    }
    
    const user = await UserService.create(userData)
    
    expect(user.password).not.toBe('plaintext')
    expect(user.email).toBe(userData.email)
  })
})
```

### Integration Test Example

```typescript
// tests/integration/api/users/create-user.test.ts
import { describe, it, expect } from 'vitest'
import { createTestUserWithRoles } from '@tests/factories'
import { authenticatedRequest } from '@tests/helpers/auth-helper'

describe('POST /api/users', () => {
  it('should create user with valid permissions', async () => {
    const { user: admin } = await createTestUserWithRoles(['admin'])
    
    const newUserData = {
      email: generateUniqueEmail(),
      username: generateUniqueUsername(),
      firstName: 'New',
      lastName: 'User'
    }
    
    const response = await authenticatedRequest(
      admin,
      'POST',
      '/api/users',
      newUserData
    )
    
    expect(response.status).toBe(201)
    const createdUser = await response.json()
    expect(createdUser.email).toBe(newUserData.email)
  })
  
  it('should reject invalid email format', async () => {
    const { user: admin } = await createTestUserWithRoles(['admin'])
    
    const invalidData = {
      email: 'invalid-email',
      username: generateUniqueUsername()
    }
    
    const response = await authenticatedRequest(
      admin,
      'POST',
      '/api/users',
      invalidData
    )
    
    expect(response.status).toBe(400)
  })
})
```

## Developer Commands

### Package.json Scripts

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest watch",
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration",
    "test:rbac": "vitest run tests/integration/rbac",
    "test:coverage": "vitest run --coverage",
    "test:cleanup": "node -r esbuild-register tests/setup/cleanup.ts"
  }
}
```

### Running Tests

```bash
# Run all tests
npm test

# Watch mode for development
npm run test:watch

# Run specific test suite
npm run test:unit
npm run test:integration

# Run specific file
npx vitest tests/integration/api/users/create-user.test.ts

# Run tests matching pattern
npx vitest --grep "user creation"

# Manual cleanup if needed
npm run test:cleanup
```

## Mocking Strategy

### External Services Mock (`tests/mocks/external-services.ts`)

```typescript
import { vi } from 'vitest'

// Mock external email service
export const mockEmailService = {
  sendEmail: vi.fn().mockResolvedValue({ success: true, messageId: 'mock-id' }),
  sendBulkEmail: vi.fn().mockResolvedValue({ success: true, count: 5 })
}

// Mock file storage
export const mockFileStorage = {
  upload: vi.fn().mockResolvedValue({ url: 'https://mock-storage.com/file.pdf' }),
  delete: vi.fn().mockResolvedValue({ success: true })
}
```

### Test-Specific Mocking

```typescript
import { vi, beforeEach } from 'vitest'
import * as emailService from '@/services/email'

// Mock at the module level
vi.mock('@/services/email', () => ({
  sendWelcomeEmail: vi.fn().mockResolvedValue({ success: true })
}))

describe('User Registration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  
  it('should send welcome email on registration', async () => {
    // Test implementation
    expect(emailService.sendWelcomeEmail).toHaveBeenCalledWith(user.email)
  })
})
```

## Maintenance & Best Practices

### Adding New Endpoints

1. Add endpoint definition to `API_ENDPOINTS` in `rbac-tests.ts`
2. RBAC tests are automatically generated
3. Create specific integration tests for business logic
4. Update factories if new entities are involved

### Factory Updates

1. Keep factories simple and focused
2. Use options pattern for flexibility
3. Always generate unique identifiers
4. Maintain relationships between entities

### Cleanup Guidelines

1. Transaction-based isolation handles most cleanup
2. Global cleanup catches any lingering data
3. Use timestamp patterns for emergency manual cleanup
4. Monitor test database size in CI/CD

### Performance Optimization

1. Use single database connection per test run
2. Transaction rollback is faster than delete operations
3. Minimize external service calls with mocks
4. Parallel test execution disabled for database consistency

This testing strategy provides a solid foundation that scales with your application while maintaining developer productivity and test reliability.