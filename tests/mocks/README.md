# Mock Utilities Documentation

## Overview

This directory contains standardized mock utilities for consistent testing patterns across the test suite. These utilities eliminate duplicate mock definitions and provide reusable, well-tested mocking infrastructure.

## Mock Categories

### Database Mocks (`database-mocks.ts`)
- **Purpose**: Standardized database mocking with method chaining support
- **Use Cases**: Unit tests requiring database operations
- **Key Features**: Query chain mocking, CRUD operations, schema table definitions

### Logger Mocks (`logger-mocks.ts`)
- **Purpose**: Universal logger mocking for all logger types
- **Use Cases**: Tests involving logging, debug utilities, error handling
- **Key Features**: Console spies, universal logger mocks, call tracking

### Auth Mocks (`auth-mocks.ts`)
- **Purpose**: Authentication and authorization mocking
- **Use Cases**: Auth flow tests, JWT tests, session tests, RBAC tests
- **Key Features**: JWT mocking, bcrypt mocking, session mocking, RBAC mocking

## Usage Patterns

### Basic Unit Test Setup
```typescript
import { MockPresets } from '@tests/mocks'

describe('My Component', () => {
  const mocks = MockPresets.unit()
  
  beforeEach(() => {
    vi.clearAllMocks()
  })
})
```

### Integration Test Setup
```typescript
import { createCompleteMockSuite } from '@tests/mocks'

describe('Integration Tests', () => {
  const mockSuite = createCompleteMockSuite()
  
  beforeEach(() => {
    mockSuite._helpers.resetAll()
    mockSuite._helpers.setupDefaults()
  })
})
```

### Module Mocking
```typescript
import { ModuleMockFactories } from '@tests/mocks'

vi.mock('@/lib/db', ModuleMockFactories.db)
vi.mock('@/lib/logger', ModuleMockFactories.logger)
vi.mock('jose', ModuleMockFactories.jose)
```

## Mock Conventions

### Naming Conventions

1. **Mock Variables**: Use descriptive names with `mock` prefix
   ```typescript
   let mockDb: DatabaseMock['db']
   let mockTokenManager: TokenManagerMock
   let mockSelectResult: ReturnType<typeof vi.fn>
   ```

2. **Mock Functions**: Use `create` prefix for factory functions
   ```typescript
   createDatabaseMock()
   createTokenManagerMock()
   createLoggerMockSuite()
   ```

3. **Mock Helpers**: Use `_mock` prefix for internal helpers
   ```typescript
   _mockDbHelpers
   _mockSelectResult
   _mockLoggerHelpers
   ```

### Reset Patterns

1. **Standard Reset**: Use in `beforeEach` hooks
   ```typescript
   beforeEach(() => {
     vi.clearAllMocks()
   })
   ```

2. **Mock Helper Reset**: For complex mocks with state
   ```typescript
   beforeEach(() => {
     mockSuite._helpers.resetAll()
   })
   ```

3. **Selective Reset**: For specific mock behavior
   ```typescript
   beforeEach(() => {
     mockDbHelpers.resetAllMocks()
     mockDbHelpers.setSelectResult([])
   })
   ```

### Test Isolation

1. **Database Tests**: Use transaction-based isolation
   ```typescript
   // Integration tests automatically get transaction isolation
   import '@/tests/setup/integration-setup'
   ```

2. **Unit Tests**: Use mock reset for isolation
   ```typescript
   beforeEach(() => {
     vi.clearAllMocks()
     // Reset mock state to defaults
   })
   ```

## Best Practices

### DO ✅

1. **Use Standardized Mocks**: Prefer mock utilities over inline mocks
2. **Test Business Logic**: Focus on business outcomes, not implementation details
3. **Mock External Dependencies**: Mock libraries and external services
4. **Use Consistent Patterns**: Follow established mock patterns
5. **Reset Between Tests**: Ensure test isolation with proper cleanup

### DON'T ❌

1. **Test Console Output**: Avoid testing console.log calls (testing theater)
2. **Over-Mock**: Don't mock internal business logic being tested
3. **Duplicate Mocks**: Don't create multiple mocks for the same module
4. **Ignore TypeScript**: Ensure all mocks are properly typed
5. **Test Implementation Details**: Focus on business value, not internal mechanics

## Mock Types by Test Category

### Unit Tests
- **Scope**: Single function or class
- **Mocking**: External dependencies only
- **Pattern**: `MockPresets.unit()`
- **Focus**: Business logic validation

### Integration Tests
- **Scope**: Multiple components working together
- **Mocking**: External services and APIs
- **Pattern**: `MockPresets.integration()`
- **Focus**: End-to-end business workflows

### Auth Tests
- **Scope**: Authentication and authorization flows
- **Mocking**: JWT libraries, password hashing, database
- **Pattern**: `AuthMockPresets.integration()`
- **Focus**: Security policies and access control

### Database Tests
- **Scope**: Database operations and queries
- **Mocking**: Database client and query builders
- **Pattern**: `MockPresets.database()`
- **Focus**: Data integrity and query correctness

## Troubleshooting

### Common Issues

1. **Module Import Errors**: Ensure mock factories are called correctly
   ```typescript
   // ❌ Wrong
   vi.mock('@/lib/db', ModuleMockFactories.db())
   
   // ✅ Correct
   vi.mock('@/lib/db', ModuleMockFactories.db)
   ```

2. **Mock Not Working**: Check if mock is hoisted properly
   ```typescript
   // ❌ Wrong - imports inside vi.mock
   vi.mock('@/lib/db', () => {
     const { createDbMock } = require('@tests/mocks')
     return createDbMock()
   })
   
   // ✅ Correct - inline mock creation
   vi.mock('@/lib/db', () => ({
     db: { /* mock implementation */ }
   }))
   ```

3. **Type Errors**: Use proper type casting for mocks
   ```typescript
   // ✅ Correct type casting
   const mockTokenManager = vi.mocked(TokenManager) as unknown as TokenManagerMock
   ```

### Performance Considerations

1. **Mock Complexity**: Keep mocks as simple as possible
2. **Reset Overhead**: Use selective resets when possible
3. **Memory Usage**: Clean up mocks in afterEach hooks
4. **Parallel Execution**: Ensure mocks work in parallel test execution

## Migration Guide

### From Inline Mocks to Standardized Mocks

1. **Identify Mock Pattern**: Determine which mock utility fits your use case
2. **Replace Inline Mock**: Use appropriate mock factory
3. **Update Test Setup**: Use standardized beforeEach patterns
4. **Test Migration**: Verify tests still pass with new mocks
5. **Clean Up**: Remove old mock code and unused variables

### Example Migration

```typescript
// Before: Inline mock
vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([])
        })
      })
    })
  }
}))

// After: Standardized mock
vi.mock('@/lib/db', () => {
  const dbMock = createDatabaseMock()
  return {
    db: dbMock.db,
    users: dbMock.users,
    _mockDbHelpers: dbMock._mockHelpers
  }
})
```

## Contributing

When adding new mock utilities:

1. **Follow Naming Conventions**: Use established patterns
2. **Add TypeScript Types**: Ensure full type safety
3. **Include Documentation**: Add JSDoc comments
4. **Test Mock Utilities**: Verify mocks work correctly
5. **Update Index**: Export new utilities from index.ts
6. **Update Documentation**: Add usage examples
