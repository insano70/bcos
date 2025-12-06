# TypeScript Type Conventions

This document outlines the TypeScript type conventions and patterns used in this codebase.

## Table of Contents

1. [Core Principles](#core-principles)
2. [Type Organization](#type-organization)
3. [Branded Types](#branded-types)
4. [Error Handling](#error-handling)
5. [API Response Types](#api-response-types)
6. [Database Types](#database-types)
7. [Hook Return Types](#hook-return-types)
8. [Service Method Types](#service-method-types)
9. [Validation Schema Types](#validation-schema-types)
10. [Best Practices](#best-practices)

---

## Core Principles

### 1. No `any` Types

The `any` type is **strictly forbidden**. Use these alternatives:

```typescript
// ❌ Bad
function process(data: any) { ... }

// ✅ Good
function process(data: unknown) { ... }
function process<T>(data: T) { ... }
function process(data: Record<string, unknown>) { ... }
```

### 2. Explicit Return Types

All functions should have explicit return types:

```typescript
// ❌ Bad
async function getUser(id: string) {
  return await db.users.findUnique({ where: { id } });
}

// ✅ Good
async function getUser(id: string): Promise<User | null> {
  return await db.users.findUnique({ where: { id } });
}
```

### 3. Strict Optional Properties

With `exactOptionalPropertyTypes: true`, optional properties must explicitly include `undefined`:

```typescript
// ❌ Will cause type errors
interface Config {
  timeout?: number;
}

// ✅ Correct
interface Config {
  timeout?: number | undefined;
}
```

---

## Type Organization

### Directory Structure

```
lib/types/
├── analytics.ts        # Chart and dashboard types
├── api-responses.ts    # API response discriminated unions
├── callbacks.ts        # Callback function types
├── dashboard-config.ts # Dashboard layout types
├── dashboards.ts       # Dashboard CRUD types
├── data-explorer.ts    # Data explorer types
├── data-rows.ts        # Analytics row types
├── dimensions.ts       # Dimension expansion types
├── filters.ts          # Filter types
├── jsonb.ts            # JSONB field types
├── practice.ts         # Practice types
├── rbac.ts             # RBAC types
├── utility-types.ts    # Reusable utility types
└── work-items.ts       # Work item types
```

### Import Conventions

Always use `import type` for type-only imports:

```typescript
// ✅ Correct
import type { User, UserContext } from '@/lib/types/rbac';
import { createUser } from '@/lib/services/users';
```

---

## Branded Types

Branded types provide compile-time distinction between similar primitive types.

### Available Branded Types

```typescript
import { UUID, Email, ISODateString, PositiveInt } from '@/lib/types/utility-types';

// These are distinct types even though they're all strings/numbers
type UserId = UUID;
type UserEmail = Email;
type CreatedAt = ISODateString;
type ItemCount = PositiveInt;
```

### Type Guards and Factories

```typescript
import { isUUID, toUUID, tryUUID } from '@/lib/types/utility-types';

// Type guard
if (isUUID(value)) {
  // value is now UUID type
}

// Factory (throws on invalid)
const id = toUUID('550e8400-e29b-41d4-a716-446655440000');

// Safe factory (returns undefined on invalid)
const maybeId = tryUUID(userInput);
```

---

## Error Handling

### Domain Errors

Use typed error classes from `@/lib/errors`:

```typescript
import {
  NotFoundError,
  ValidationError,
  PermissionDeniedError,
  assertExists,
} from '@/lib/errors';

// Throwing specific errors
throw new NotFoundError('User', userId);
throw new ValidationError('Invalid input', [
  { field: 'email', message: 'Invalid format' }
]);

// Assertion helpers
const user = await getUser(id);
assertExists(user, 'User', id); // Throws NotFoundError if null
```

### Error Hierarchy

```
DomainError (abstract base)
├── AuthenticationRequiredError (401)
├── InvalidCredentialsError (401)
├── TokenExpiredError (401)
├── TokenInvalidError (401)
├── PermissionDeniedError (403)
├── ForbiddenError (403)
├── ValidationError (400)
├── NotFoundError (404)
├── ConflictError (409)
├── ResourceLockedError (409)
├── RateLimitExceededError (429)
├── InternalError (500)
├── DatabaseError (500)
├── ExternalServiceError (502)
└── ServiceUnavailableError (503)
```

---

## API Response Types

Use discriminated unions for type-safe response handling:

```typescript
import type { ApiResponse, isSuccessResponse } from '@/lib/types/api-responses';

async function handleResponse(response: ApiResponse<User>) {
  if (isSuccessResponse(response)) {
    // TypeScript knows response.data is User
    console.log(response.data.email);
  } else {
    // TypeScript knows response.error exists
    console.error(response.error.message);
  }
}
```

### Response Type Patterns

```typescript
// Single item
type UserResponse = ApiResponse<User>;

// List with pagination
type UsersResponse = ListResponse<User>;

// Create (includes ID)
type CreateUserResponse = CreateResponse<User>;

// Delete
type DeleteUserResponse = DeleteResponse;

// Batch operations
type BatchUserResponse = BatchResponse<User>;
```

---

## Database Types

### Nullable Types

Use explicit nullable types for database fields:

```typescript
import type { DBNullable, DBOptional } from '@/lib/types/utility-types';

interface User {
  id: string;
  email: string;
  phone: DBNullable<string>;      // Can be null in DB
  deletedAt: DBNullable<Date>;    // Soft delete field
}

interface UpdateUserInput {
  phone?: DBOptional<string>;     // Can be null, undefined, or string
}
```

### JSONB Fields

Use specific types instead of `unknown` for JSONB fields:

```typescript
import type {
  ExecutionPlan,
  ResultSample,
  QueryMetadata,
} from '@/lib/types/jsonb';

interface QueryHistory {
  execution_plan: ExecutionPlan | null;
  result_sample: ResultSample | null;
  metadata: QueryMetadata | null;
}
```

---

## Hook Return Types

Define explicit return type interfaces for custom hooks:

```typescript
interface UseUsersReturn {
  users: User[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  createUser: (data: CreateUserInput) => Promise<User>;
}

export function useUsers(): UseUsersReturn {
  // Implementation
}
```

---

## Service Method Types

### Explicit Return Types

```typescript
class UserService {
  async getUser(id: string): Promise<User | null> { ... }
  async createUser(data: CreateUserInput): Promise<User> { ... }
  async updateUser(id: string, data: UpdateUserInput): Promise<User> { ... }
  async deleteUser(id: string): Promise<void> { ... }
  async listUsers(options: ListOptions): Promise<PaginatedResult<User>> { ... }
}
```

### Result Types

Define specific result types for complex operations:

```typescript
interface ListHistoryResult {
  items: HistoryEntry[];
  total: number;
}

interface EditStatisticsResult {
  overall: {
    total_queries: number;
    edited_queries: number;
    edit_percentage: number;
  };
  top_edited_queries: EditedQuery[];
}
```

---

## Validation Schema Types

Use Zod's `z.infer` to derive types from schemas:

```typescript
import { z } from 'zod';

export const userCreateSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  roleIds: z.array(z.string().uuid()),
});

// Infer type from schema
export type UserCreate = z.infer<typeof userCreateSchema>;
```

---

## Best Practices

### 1. Prefer Specific Types Over Generic

```typescript
// ❌ Avoid
const config: Record<string, unknown> = { ... };

// ✅ Better
interface ChartConfig {
  chartType: ChartType;
  dataSourceId: number;
  // ... specific properties
}
```

### 2. Use Discriminated Unions for Polymorphic Data

```typescript
// ❌ Avoid
interface ChartConfig {
  type: string;
  lineOptions?: LineOptions;
  barOptions?: BarOptions;
}

// ✅ Better
type ChartConfig =
  | { type: 'line'; options: LineOptions }
  | { type: 'bar'; options: BarOptions }
  | { type: 'pie'; options: PieOptions };
```

### 3. Type Guards for Runtime Validation

```typescript
function isChartConfig(value: unknown): value is ChartConfig {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    'options' in value
  );
}
```

### 4. Assertion Functions for Null Checks

```typescript
function assertDefined<T>(
  value: T | null | undefined,
  name: string
): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(`${name} is not defined`);
  }
}
```

### 5. Avoid Index Signatures Where Possible

```typescript
// ❌ Avoid when structure is known
interface DashboardLayout {
  [key: string]: unknown;
}

// ✅ Better
interface DashboardLayout {
  columns: number;
  rowHeight: number;
  margin: number | [number, number];
  filterConfig?: DashboardFilterConfig | undefined;
}
```

---

## Migration Guide

When encountering legacy code with poor typing:

1. **Identify the actual shape** of the data being used
2. **Create specific interfaces** for that shape
3. **Add type guards** for runtime validation
4. **Update usages** incrementally
5. **Run `pnpm tsc`** to verify

Example migration:

```typescript
// Before
function processData(data: Record<string, unknown>) {
  const name = data.name as string;
  const count = data.count as number;
}

// After
interface ProcessedData {
  name: string;
  count: number;
}

function isProcessedData(data: unknown): data is ProcessedData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'name' in data &&
    'count' in data &&
    typeof (data as ProcessedData).name === 'string' &&
    typeof (data as ProcessedData).count === 'number'
  );
}

function processData(data: ProcessedData) {
  const { name, count } = data;
}
```

---

## Resources

- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/)
- [TypeScript Deep Dive](https://basarat.gitbook.io/typescript/)
- [Type Challenges](https://github.com/type-challenges/type-challenges)





