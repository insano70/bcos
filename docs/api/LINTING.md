# API Linting Rules and Standards

**Last Updated**: 2025-01-07
**Status**: Active

---

## Overview

This project uses **Biome** for linting and formatting. The following rules are enforced to maintain API standards.

## Automated Rules (Biome)

### 1. No `any` Types

**Rule**: `suspicious/noExplicitAny` (error)
**Applies to**: All TypeScript files

```typescript
// ❌ ERROR
let data: any;
const query: any = {};

// ✅ CORRECT
let data: UserData;
const query = validateQuery(searchParams, querySchema);
```

### 2. Direct Database Imports in API Routes

**Rule**: `nursery/noRestrictedImports` (error)
**Applies to**: Files in `app/api/**`

```typescript
// ❌ ERROR - in app/api/users/route.ts
import { db, users } from '@/lib/db';

const result = await db.select().from(users);

// ✅ CORRECT
import { createRBACUsersService } from '@/lib/services/rbac-users-service';

const usersService = createRBACUsersService(userContext);
const result = await usersService.getUsers();
```

**Exception**: This rule is currently configured to warn on `@/lib/db` imports. It will catch most cases but may need manual review during code review.

### 3. NextResponse.json Usage

**Rule**: `nursery/noRestrictedImports` (error)
**Applies to**: Files in `app/api/**`

```typescript
// ❌ ERROR
import { NextResponse } from 'next/server';
return NextResponse.json({ success: true, data });

// ✅ CORRECT
import { createSuccessResponse } from '@/lib/api/responses/success';
return createSuccessResponse(data);
```

### 4. Import Type Usage

**Rule**: `style/useImportType` (warn)
**Applies to**: All files

```typescript
// ⚠️ WARNING
import { NextRequest, UserContext } from 'types';

// ✅ CORRECT
import type { NextRequest, UserContext } from 'types';
```

---

## Manual Review Required

The following patterns cannot be automatically detected by Biome and require code review:

### 1. Manual RBAC Permission Checking

**⚠️ Must be caught in code review**

```typescript
// ❌ BAD - Must be caught in review
const canRead = userContext.all_permissions?.some(p =>
  p.name === 'users:read:all'
);

if (!canRead) {
  return createErrorResponse('Permission denied', 403, request);
}

// ✅ GOOD
const usersService = createRBACUsersService(userContext);
// Service automatically checks permissions
const users = await usersService.getUsers();
```

**Detection Strategy**:
- Search for `all_permissions` in API routes during review
- Search for `.some(` patterns
- Look for manual `is_super_admin` checks

### 2. Handler Naming Convention

**⚠️ Must be caught in code review**

```typescript
// ❌ BAD
const handler = async (request: NextRequest) => {};
export const GET = rbacRoute(handler, { /* ... */ });

// ✅ GOOD
const getUsersHandler = async (request: NextRequest, userContext: UserContext) => {};
export const GET = rbacRoute(getUsersHandler, { /* ... */ });
```

**Detection Strategy**:
- Check that handlers are named `[operation][Resource]Handler`
- Verify during PR review

### 3. Missing Performance Logging

**⚠️ Must be caught in code review**

```typescript
// ❌ BAD - No timing
const getUsersHandler = async (request: NextRequest, userContext: UserContext) => {
  const users = await service.getUsers();
  return createSuccessResponse(users);
};

// ✅ GOOD - Track timing
const getUsersHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();
  const users = await service.getUsers();
  log.info('Users retrieved', { duration: Date.now() - startTime });
  return createSuccessResponse(users);
};
```

**Detection Strategy**:
- Look for `startTime` declaration
- Verify `duration` is logged

### 4. Inline Business Logic

**⚠️ Must be caught in code review**

```typescript
// ❌ BAD - Business logic in handler
const createUserHandler = async (request: NextRequest, userContext: UserContext) => {
  const data = await validateRequest(request, userCreateSchema);

  // Hash password
  const hashedPassword = await bcrypt.hash(data.password, 10);

  // Create user
  const [newUser] = await db.insert(users).values({
    ...data,
    password_hash: hashedPassword
  }).returning();

  return createSuccessResponse(newUser);
};

// ✅ GOOD - Business logic in service
const createUserHandler = async (request: NextRequest, userContext: UserContext) => {
  const data = await validateRequest(request, userCreateSchema);
  const usersService = createRBACUsersService(userContext);
  const newUser = await usersService.createUser(data);
  return createSuccessResponse(newUser);
};
```

**Detection Strategy**:
- Handlers should be < 100 lines
- Check for direct DB operations
- Look for complex logic in handlers

---

## Running Linting

### Check for violations

```bash
pnpm lint
```

### Auto-fix what's possible

```bash
pnpm lint:fix
```

### Format code

```bash
pnpm format
```

### Check and fix everything

```bash
pnpm check
```

---

## CI/CD Integration

Linting is enforced in CI/CD pipeline:

```yaml
# .github/workflows/ci.yml (example)
- name: Lint
  run: pnpm lint

- name: Type Check
  run: pnpm tsc --noEmit
```

**Failures**: Any linting error will block the build.

---

## Code Review Checklist

Use this during PR reviews to catch what automation can't:

### API Route Checklist

- [ ] No direct `db` imports (should use service layer)
- [ ] No `NextResponse.json()` (should use helpers)
- [ ] No manual RBAC checks (should be in service)
- [ ] Handler follows naming convention
- [ ] Has performance logging (`startTime`, `duration`)
- [ ] All parameters typed (no `any`)
- [ ] Uses standard validation helpers
- [ ] Uses standard response helpers
- [ ] Handler is < 100 lines
- [ ] No inline business logic

### Service Layer Checklist

- [ ] All RBAC logic in service
- [ ] Throws appropriate errors (NotFoundError, PermissionError)
- [ ] Returns typed data
- [ ] No `any` types
- [ ] Comprehensive tests

---

## Suppressing Rules

### When to suppress

Only suppress rules in exceptional circumstances:
- Test files may need `any` for mocking
- Migration scripts may need direct DB access
- Infrastructure code may have different patterns

### How to suppress (Biome)

```typescript
// Suppress for specific line
// biome-ignore lint/suspicious/noExplicitAny: Test mock requires any
const mockFn: any = vi.fn();

// Suppress for entire file (rarely needed)
// @ts-nocheck
```

**Important**: Always include a comment explaining WHY the rule is suppressed.

---

## Troubleshooting

### "Module not found" errors with Biome

If Biome can't resolve imports:

1. Check `biome.json` includes your file path
2. Verify `tsconfig.json` paths are correct
3. Restart your editor/IDE

### False positives on restricted imports

If you need to import `db` in a legitimate place (e.g., service layer):

1. The rule only applies to `app/api/**` files
2. Service files in `lib/services/**` can import `db`
3. If still an issue, file path configuration may need adjustment

### Biome version mismatch

Ensure Biome version matches `package.json`:

```bash
pnpm install @biomejs/biome@^2.2.5
```

---

## Future Improvements

### Potential Custom Rules

We may add custom linting rules in the future for:

1. **Handler signature validation** - Ensure correct parameters
2. **RBAC pattern detection** - Detect manual permission checks
3. **Import order enforcement** - Automated import ordering
4. **Logging requirement** - Ensure handlers have performance logs

### Migration to ESLint (if needed)

If Biome's limitations become problematic, we could migrate to ESLint with custom plugins:

- `eslint-plugin-no-restricted-imports` - Better import restrictions
- Custom AST rules for handler patterns
- Better integration with existing tooling

---

## Resources

- [Biome Documentation](https://biomejs.dev/)
- [API Standards](./STANDARDS.md)
- [Handler Template](../../lib/api/templates/handler-template.ts)
- [RBAC Testing Guide](./RBAC_TESTING.md)

---

**Questions?** Ask in #engineering or tag @api-standards-team in PR.
