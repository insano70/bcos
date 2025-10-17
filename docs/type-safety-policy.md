# Type Safety Policy

This document defines the type safety standards and acceptable practices for the codebase.

## Core Principles

1. **Zero `any` types in production code** - The `any` type is strictly forbidden
2. **Minimize type assertions** - Avoid `as` type assertions except in documented cases
3. **Explicit types over inference** - Use explicit types for public APIs and exported functions
4. **Runtime validation before type assertions** - Type assertions must be preceded by validation

## Status: Current Type Safety Metrics

As of the latest audit:

- ✅ **Zero `any` types** in production code (lib/, components/, app/)
- ✅ **3 documented double assertions** in infrastructure code (all necessary)
- ✅ **All TypeScript strict checks enabled** with zero compilation errors
- ✅ **Index signatures used appropriately** for dynamic property access

## Acceptable Type Assertion Use Cases

Double type assertions (`as unknown as Type`) are **only acceptable** in the following scenarios:

### 1. Raw SQL Query Results
**Location**: [lib/services/analytics-db.ts:144](../lib/services/analytics-db.ts#L144)

```typescript
return result as unknown as T[];
```

**Rationale**:
- Raw SQL queries return untyped database results
- Generic type T is validated by caller (chart definitions, query builders)
- Runtime validation occurs at the query builder level

**When to use**: Generic database query utilities that return typed results

---

### 2. Error Object Serialization
**Location**: [lib/logger/logger.ts:241](../lib/logger/logger.ts#L241)

```typescript
const value = (error as unknown as Record<string, unknown>)[key];
```

**Rationale**:
- Error objects can have custom properties not in standard Error type
- Accessing dynamic properties requires index signature access
- Only used in error serialization utilities

**When to use**: Error handling utilities that serialize custom error properties

---

### 3. JWT Payload Validation
**Location**: [lib/auth/webauthn-temp-token.ts:100](../lib/auth/webauthn-temp-token.ts#L100)

```typescript
return payload as unknown as MFATempTokenPayload;
```

**Rationale**:
- JWT decode returns generic untyped payload
- Runtime validation precedes the assertion (lines 80-94)
- Structure validation ensures payload matches expected type

**When to use**: JWT/token validation where runtime checks verify structure

---

## Unacceptable Type Assertion Patterns

### ❌ Never Do This

```typescript
// Bad: No runtime validation
const user = apiResponse as unknown as User;

// Bad: Casting to bypass type checking
const config = data as unknown as Record<string, unknown>;

// Bad: Using any instead of proper typing
function processData(data: any) { ... }
```

### ✅ Do This Instead

```typescript
// Good: Use type guards
function isUser(value: unknown): value is User {
  return typeof value === 'object' && value !== null &&
         'id' in value && 'email' in value;
}

if (isUser(apiResponse)) {
  const user = apiResponse; // Type is User
}

// Good: Use proper interface types
interface Config {
  [key: string]: string | number | boolean;
}

// Good: Use explicit types
function processData(data: UserData): Result { ... }
```

## Adding New Type Assertions

If you believe a new type assertion is necessary:

1. **Exhaust all alternatives first**:
   - Can you use a type guard instead?
   - Can you create a proper interface/type?
   - Can you add runtime validation?

2. **Document it inline** with a comment explaining:
   ```typescript
   // Type Safety Note: This assertion is necessary because [reason].
   // Runtime validation: [describe validation that occurs].
   // This is acceptable because [justify why it's safe].
   const result = value as unknown as TargetType;
   ```

3. **Add runtime validation** if the assertion involves external data:
   ```typescript
   // Validate structure before asserting
   if (!isValidStructure(data)) {
     throw new Error('Invalid data structure');
   }
   return data as unknown as ExpectedType;
   ```

4. **Update this document** if the pattern is reusable

## Type Safety Checklist

Before committing code, verify:

- [ ] No `any` types in production code (lib/, components/, app/)
- [ ] All type assertions are documented with inline comments
- [ ] Runtime validation precedes type assertions for external data
- [ ] TypeScript compilation passes with zero errors (`pnpm tsc`)
- [ ] Linting passes with zero errors (`pnpm lint`)

## Tools and Validation

### Check for `any` types
```bash
# Should return 0 matches in production code
rg ":\s*any\b" --type ts -g '!*.test.ts' -g '!tests/**' lib components app
```

### Check for type assertions
```bash
# Find all double assertions
rg "as unknown as" --type ts -g '!*.test.ts' lib components app
```

### Run type checking
```bash
pnpm tsc
```

## References

- TypeScript Handbook: [Type Assertions](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#type-assertions)
- TypeScript Deep Dive: [Type Assertion Considered Harmful](https://basarat.gitbook.io/typescript/type-system/type-assertion)
- Our project rules: [CLAUDE.md](../CLAUDE.md)

## Revision History

- **2025-01-17**: Initial policy created after type safety audit
  - Eliminated all production `any` types (previously 41)
  - Reduced double assertions from 27 to 3 documented cases
  - Fixed all TypeScript compilation errors
