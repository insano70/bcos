# Testing Guidelines and Standard Operating Procedures

## Purpose and Principles

This document establishes the standard operating procedures for building, maintaining, and running tests in our system. Our testing philosophy emphasizes **quality over quantity**, **real code testing over mocks**, and **preventing bugs rather than documenting them**.

### Core Principles

#### 1. **No Testing Theater**
❌ **Forbidden**: Tests that pass but don't validate actual functionality
❌ **Forbidden**: Tests that only exercise setup/teardown code
❌ **Forbidden**: Tests that assert obvious implementation details

✅ **Required**: Tests that verify business logic and user-facing behavior
✅ **Required**: Tests that catch regressions and prevent bugs
✅ **Required**: Tests that provide confidence in code changes

#### 2. **Test Real Code, Not Mocks**
❌ **Forbidden**: Mocking entire services to avoid testing implementation
❌ **Forbidden**: Using mocks to bypass actual business logic
❌ **Forbidden**: Testing against interfaces instead of implementations

✅ **Required**: Test actual implementations with minimal, targeted mocking
✅ **Required**: Mock only external dependencies (APIs, databases when isolated)
✅ **Required**: Integration tests that exercise full code paths

#### 3. **Quality Over Coverage Metrics**
❌ **Forbidden**: Chasing arbitrary coverage percentages
❌ **Forbidden**: Writing tests solely to increase coverage numbers
❌ **Forbidden**: Accepting low-quality tests to meet coverage goals

✅ **Required**: Comprehensive testing of critical paths
✅ **Required**: Risk-based testing prioritization
✅ **Required**: Quality metrics alongside coverage metrics

## Test Categories and Purposes

### 1. Unit Tests
**Purpose**: Verify individual functions and modules in isolation
**Scope**: Single functions, utilities, and isolated logic
**Mocking**: Minimal - only external dependencies

#### When to Write Unit Tests
- Pure utility functions (`format-date.ts`, `color-utils.ts`)
- Validation schemas and parsing logic
- Mathematical calculations and transformations
- Isolated business logic without external dependencies

#### Unit Test Structure
```typescript
describe('formatDate', () => {
  it('should format valid dates correctly', () => {
    // Test actual formatting logic
    const result = formatDate(new Date('2024-01-15'));
    expect(result).toBe('2024-01-15');
  });

  it('should handle timezone conversions', () => {
    // Test real timezone handling
    const result = formatDate(new Date('2024-01-15T00:00:00Z'), 'America/New_York');
    expect(result).toBe('2024-01-14'); // Real timezone calculation
  });

  it('should reject invalid dates', () => {
    // Test error handling
    expect(() => formatDate('not-a-date')).toThrow(ValidationError);
  });
});
```

### 2. Integration Tests
**Purpose**: Verify component interactions and data flow
**Scope**: API endpoints, database operations, service integrations
**Mocking**: Database transactions, external APIs when necessary

#### When to Write Integration Tests
- API endpoint behavior and responses
- Database CRUD operations
- Service layer interactions
- Authentication and authorization flows
- Cross-module data flow

#### Integration Test Structure
```typescript
describe('POST /api/users', () => {
  it('should create user with valid data', async () => {
    // Test real database insertion
    const userData = { email: 'test@example.com', password: 'ValidPass123!' };

    const response = await request(app)
      .post('/api/users')
      .send(userData);

    expect(response.status).toBe(201);
    expect(response.body.email).toBe('test@example.com');

    // Verify database persistence
    const savedUser = await db.select().from(users).where(eq(users.email, 'test@example.com'));
    expect(savedUser).toHaveLength(1);
  });

  it('should validate required fields', async () => {
    // Test real validation logic
    const invalidData = { email: 'test@example.com' }; // Missing password

    const response = await request(app)
      .post('/api/users')
      .send(invalidData);

    expect(response.status).toBe(400);
    expect(response.body.errors).toContain('Password is required');
  });
});
```

### 3. Component Tests
**Purpose**: Verify UI component behavior and user interactions
**Scope**: React components, forms, user interface elements
**Mocking**: API calls, router, external state

#### When to Write Component Tests
- Form validation and submission
- User interaction flows
- Component state management
- Accessibility requirements
- Visual component behavior

#### Component Test Structure
```typescript
describe('UserRegistrationForm', () => {
  it('should validate and submit form data', async () => {
    // Mock API but test real form logic
    const mockCreateUser = vi.fn().mockResolvedValue({ id: 1 });
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 1 })
    });

    render(<UserRegistrationForm onSuccess={() => {}} />, {
      wrapper: TestWrapper
    });

    // Test real form validation
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'invalid-email' }
    });

    expect(screen.getByText(/invalid email format/i)).toBeInTheDocument();

    // Test real form submission with valid data
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'valid@example.com' }
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'ValidPass123!' }
    });

    fireEvent.click(screen.getByRole('button', { name: /register/i }));

    await waitFor(() => {
      expect(mockCreateUser).toHaveBeenCalledWith({
        email: 'valid@example.com',
        password: 'ValidPass123!'
      });
    });
  });
});
```

### 4. End-to-End Tests
**Purpose**: Verify complete user journeys and system integration
**Scope**: Full application workflows from user perspective
**Mocking**: None - test against real system

#### When to Write E2E Tests
- Critical user workflows (registration → login → dashboard)
- Payment flows and transactions
- Multi-step business processes
- Cross-system integrations

## Test Writing Standards

### 1. Test Naming Conventions

#### Describe Blocks
```typescript
// ✅ Good: Describes what is being tested
describe('UserRegistrationForm', () => {
describe('EmailValidation', () => {

// ❌ Bad: Describes implementation details
describe('FormComponent', () => {
describe('handleSubmit function', () => {
```

#### Test Cases
```typescript
// ✅ Good: Clear, behavior-focused names
it('should create account when valid data is submitted')
it('should show error for duplicate email addresses')
it('should redirect to dashboard after successful registration')

// ❌ Bad: Implementation-focused names
it('should call createUser API')
it('should set isSubmitting to true')
it('should dispatch USER_CREATED action')
```

### 2. Test Organization Principles

#### Arrange-Act-Assert Pattern
```typescript
it('should process valid payment', async () => {
  // Arrange: Set up test data and preconditions
  const paymentData = createValidPaymentData();
  const user = await createTestUser({ balance: 100 });

  // Act: Perform the action being tested
  const result = await processPayment(paymentData, user.id);

  // Assert: Verify the expected outcomes
  expect(result.status).toBe('completed');
  expect(result.amount).toBe(paymentData.amount);

  // Verify side effects
  const updatedUser = await getUserById(user.id);
  expect(updatedUser.balance).toBe(0);
});
```

#### Test Data Management
```typescript
// ✅ Good: Use factories for consistent test data
const user = await createTestUser({
  email: 'test@example.com',
  isVerified: true
});

// ❌ Bad: Inline test data creation
const user = {
  id: 123,
  email: 'test@example.com',
  password: 'hashed_password',
  created_at: new Date(),
  // ... 20 more fields with inconsistent data
};
```

### 3. Assertion Best Practices

#### Meaningful Assertions
```typescript
// ✅ Good: Test business logic outcomes
expect(order.total).toBe(99.99);
expect(order.status).toBe('confirmed');
expect(emailService.sendConfirmationEmail).toHaveBeenCalledWith(order.id);

// ❌ Bad: Test implementation details
expect(component.state.submitting).toBe(true);
expect(wrapper.find('.loading-spinner')).toHaveLength(1);
expect(store.getActions()).toContainEqual({ type: 'SET_LOADING' });
```

#### Comprehensive Validation
```typescript
// ✅ Good: Validate complete object structure
const user = await createUser(validData);
expect(user).toEqual({
  id: expect.any(String),
  email: 'test@example.com',
  firstName: 'John',
  lastName: 'Doe',
  createdAt: expect.any(Date),
  isActive: true
});

// ❌ Bad: Partial validation
const user = await createUser(validData);
expect(user.email).toBe('test@example.com');
// Missing validation of other critical fields
```

## Mocking Guidelines

### 1. When to Mock

#### ✅ Acceptable Mocking Scenarios
- **External APIs**: Third-party services, payment processors
- **Database in unit tests**: When testing isolated logic
- **Time-dependent functions**: `Date.now()`, timers
- **Random generators**: For deterministic testing
- **File system operations**: When not testing file I/O

#### ❌ Forbidden Mocking Scenarios
- **Business logic**: Core application rules and calculations
- **Validation logic**: Input validation and sanitization
- **Data transformations**: Pure functions that manipulate data
- **Internal service calls**: When testing integration behavior

### 2. Mock Implementation Standards

#### Realistic Mock Data
```typescript
// ✅ Good: Realistic mock that behaves like real API
const mockPaymentAPI = {
  charge: vi.fn().mockResolvedValue({
    id: 'ch_123',
    amount: 99.99,
    status: 'succeeded',
    created: Date.now()
  })
};

// ❌ Bad: Mock that always returns success
const mockPaymentAPI = {
  charge: vi.fn().mockResolvedValue({ success: true })
};
```

#### Proper Mock Cleanup
```typescript
describe('PaymentService', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();

    // Reset mock implementations to defaults
    mockPaymentAPI.charge.mockResolvedValue(defaultSuccessResponse);
  });

  afterEach(() => {
    // Verify no unexpected calls were made
    expect(mockPaymentAPI.charge).not.toHaveBeenCalled();
  });
});
```

### 3. Spy vs Mock vs Stub

#### Use Spies for Verification
```typescript
// ✅ Good: Spy on real method to verify calls
const emailSpy = vi.spyOn(emailService, 'sendWelcomeEmail');

await registerUser(userData);

expect(emailSpy).toHaveBeenCalledWith(userData.email, {
  firstName: userData.firstName
});
```

#### Use Mocks for External Dependencies
```typescript
// ✅ Good: Mock external API calls
vi.mock('@/lib/external-api', () => ({
  getWeatherData: vi.fn()
}));
```

## Running Tests

### 1. Local Development

#### Running Test Suites
```bash
# Run all tests
npm test

# Run specific test categories
npm run test:unit        # Unit tests only
npm run test:integration # Integration tests only
npm run test:api         # API endpoint tests
npm run test:components  # Component tests

# Run with coverage
npm run test:coverage

# Run in watch mode during development
npm run test:watch
```

#### Debugging Tests
```bash
# Run specific test file
npm test -- tests/unit/utils/format-date.test.ts

# Run tests matching pattern
npm test -- -t "should validate email format"

# Run with debugging output
npm test -- --reporter=verbose

# Debug in browser (for component tests)
npm run test:ui
```

### 2. CI/CD Integration

#### Pre-commit Hooks
```bash
# Run tests before committing
npm run test:run

# Run lint and type check
npm run lint && npm run tsc
```

#### CI Pipeline Stages
```yaml
# .github/workflows/ci.yml
- name: Run Tests
  run: |
    npm run test:coverage
    npm run test:integration

- name: Upload Coverage
  uses: codecov/codecov-action@v3
  with:
    file: ./coverage/lcov.info

- name: Check Coverage Threshold
  run: |
    npx istanbul check-coverage \
      --statements 85 \
      --branches 80 \
      --functions 90 \
      --lines 85
```

## Test Failure Resolution

### 1. Failure Analysis Framework

#### Step 1: Reproduce the Failure
```bash
# Run the failing test in isolation
npm test -- tests/unit/utils/format-date.test.ts -t "should handle invalid dates"

# Run with verbose output to see full error
npm test -- --reporter=verbose
```

#### Step 2: Categorize the Failure Type

**Type A: Logic Error**
- Symptom: Test fails because code doesn't work as expected
- Action: Fix the implementation, not the test

**Type B: Test Error**
- Symptom: Test is wrong, code is correct
- Action: Fix the test to properly validate correct behavior

**Type C: Environmental Error**
- Symptom: Test passes locally but fails in CI
- Action: Investigate environment differences

**Type D: Flaky Test**
- Symptom: Test passes sometimes, fails sometimes
- Action: Fix timing issues, race conditions, or non-deterministic behavior

### 2. Resolution Strategies by Failure Type

#### Logic Error Resolution
```typescript
// ❌ Failing test - code has bug
it('should calculate total correctly', () => {
  const cart = [{ price: 10 }, { price: 20 }];
  expect(calculateTotal(cart)).toBe(30); // Fails, returns 25
});

// ✅ Fixed implementation
function calculateTotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.price, 0);
  // Was: return items.reduce((sum, item) => sum + item.price - 1, 0);
}
```

#### Test Error Resolution
```typescript
// ❌ Bad test - tests implementation, not behavior
it('should call calculateTotal with reduce method', () => {
  const spy = vi.spyOn(Array.prototype, 'reduce');
  calculateTotal([{ price: 10 }]);
  expect(spy).toHaveBeenCalled();
});

// ✅ Good test - tests actual behavior
it('should sum all item prices', () => {
  const items = [{ price: 10 }, { price: 20 }, { price: 5 }];
  expect(calculateTotal(items)).toBe(35);
});
```

#### Environmental Error Resolution
```typescript
// Check for environment-specific code
if (process.env.NODE_ENV === 'test') {
  // Test-specific behavior
}

// Use proper test setup
beforeAll(async () => {
  await setupTestDatabase();
  await seedTestData();
});

afterAll(async () => {
  await cleanupTestDatabase();
});
```

#### Flaky Test Resolution
```typescript
// ❌ Flaky: Timing-dependent
it('should show loading then success', async () => {
  render(<AsyncComponent />);
  expect(screen.getByText('Loading...')).toBeInTheDocument();

  await waitFor(() => {
    expect(screen.getByText('Success!')).toBeInTheDocument();
  });
});

// ✅ Stable: Proper async handling
it('should show loading then success', async () => {
  render(<AsyncComponent />);

  // Wait for loading state
  await waitFor(() => {
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  // Wait for completion
  await waitFor(() => {
    expect(screen.getByText('Success!')).toBeInTheDocument();
  }, { timeout: 5000 });
});
```

### 3. Debugging Techniques

#### 1. Isolate the Problem
```typescript
// Test individual components
describe('isolated component behavior', () => {
  it('should work without dependencies', () => {
    const result = pureFunction(input);
    expect(result).toBe(expected);
  });
});
```

#### 2. Use Debugging Tools
```typescript
it('should debug complex logic', () => {
  const input = createComplexInput();

  // Add debugging
  console.log('Input:', input);

  const result = complexFunction(input);
  console.log('Result:', result);

  expect(result).toEqual(expected);
});
```

#### 3. Test Incrementally
```typescript
// Build up test complexity gradually
it('should handle simple case', () => {
  const result = processData({ type: 'simple' });
  expect(result).toBe('processed');
});

it('should handle complex case', () => {
  const result = processData({
    type: 'complex',
    nested: { data: 'value' }
  });
  expect(result).toEqual({ processed: 'value' });
});
```

### 4. Test Maintenance Procedures

#### Regular Test Review
- Review test failures weekly
- Refactor tests with code changes
- Remove obsolete tests
- Update tests for API changes

#### Test Health Metrics
```typescript
// Track test health in CI
- Average test execution time
- Flaky test detection
- Coverage trends
- Failure rate by category
```

## Quality Assurance Checklist

### Pre-Test Writing
- [ ] **Purpose**: Does this test verify real user value?
- [ ] **Scope**: Is this the right test type (unit/integration/component/e2e)?
- [ ] **Coverage**: Does this test cover a critical or high-risk code path?
- [ ] **Dependencies**: Are external dependencies properly mocked?

### Test Implementation
- [ ] **Naming**: Clear, behavior-focused test names?
- [ ] **Structure**: Proper Arrange-Act-Assert pattern?
- [ ] **Assertions**: Meaningful assertions testing business logic?
- [ ] **Data**: Realistic test data using factories?
- [ ] **Isolation**: Proper setup/teardown and test isolation?

### Post-Test Validation
- [ ] **Execution**: Test passes reliably?
- [ ] **Performance**: Test completes within reasonable time?
- [ ] **Maintenance**: Test will be easy to maintain?
- [ ] **Documentation**: Test purpose is clear from name and comments?

## Common Anti-Patterns to Avoid

### 1. Testing Implementation Details
```typescript
// ❌ Bad: Tests internal state
expect(component.state.isLoading).toBe(true);

// ✅ Good: Tests user-visible behavior
expect(screen.getByText('Loading...')).toBeInTheDocument();
```

### 2. Over-Mocking
```typescript
// ❌ Bad: Mocks entire business logic
const mockService = vi.fn().mockReturnValue({ success: true });

// ✅ Good: Tests real logic with minimal mocking
const realService = new PaymentService();
```

### 3. Brittle Tests
```typescript
// ❌ Bad: Breaks with any UI change
expect(wrapper.find('.btn-primary')).toHaveLength(1);

// ✅ Good: Tests behavior, not structure
expect(screen.getByRole('button', { name: /submit/i })).toBeEnabled();
```

### 4. Slow Tests
```typescript
// ❌ Bad: Unnecessary delays
await new Promise(resolve => setTimeout(resolve, 1000));

// ✅ Good: Proper async handling
await waitFor(() => expect(result).toBeDefined());
```

## Conclusion

These guidelines ensure that our testing practices focus on quality, reliability, and maintainability. Remember:

1. **Tests are code**: They should be written with the same care as production code
2. **Tests serve the team**: They provide confidence and prevent regressions
3. **Tests evolve**: Update them as the codebase changes
4. **Quality over quantity**: One good test is worth many poor ones

Follow these procedures consistently to build a testing culture that enhances rather than hinders development velocity.
