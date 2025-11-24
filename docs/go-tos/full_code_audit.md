# BendCare OS - Comprehensive Security and Code Quality Review Guide

**Version:** 2.0
**Last Updated:** 2025-10-16
**System:** BendCare OS (Next.js 15, React 19, TypeScript, PostgreSQL, Redis)

---

## Table of Contents

1. [Review Overview](#review-overview)
2. [Code Quality Review](#code-quality-review)
3. [Architecture Review](#architecture-review)
4. [Security Review](#security-review)
5. [Performance and Optimization](#performance-and-optimization)
6. [Testing and Reliability](#testing-and-reliability)
7. [Accessibility](#accessibility)
8. [Quick Wins](#quick-wins)
9. [Audit Report Generation](#audit-report-generation)
10. [Appendices](#appendices)

---

## Review Overview

### Purpose

This guide provides a systematic framework for conducting comprehensive security and code quality reviews of the BendCare OS application. It is designed to be:

- **Thorough**: Covers all aspects of security, quality, and best practices
- **System-specific**: Tailored to BendCare OS architecture and technology stack
- **Scalable**: Applicable as the system grows and evolves
- **Actionable**: Produces prioritized recommendations with clear remediation paths

### Review Scope

All reviews should assess:

1. **Code Quality**: TypeScript standards, maintainability, duplication, React patterns
2. **Architecture**: Design patterns, separation of concerns, scalability
3. **Security**: Authentication, authorization, data protection, OWASP Top 10
4. **Performance**: Query optimization, caching, resource utilization, React optimization
5. **Reliability**: Error handling, resilience, monitoring
6. **Testing**: Coverage, quality, integration, test organization
7. **Accessibility**: WCAG 2.1 compliance, keyboard navigation, screen readers
8. **Dependencies**: Vulnerability scanning, version management
9. **Documentation**: Code comments, API documentation, component documentation

### Technology Stack Context

- **Framework**: Next.js 15 (App Router, Edge Runtime, Server Components)
- **Language**: TypeScript 5.9+ (strict mode, no `any` types)
- **Database**: PostgreSQL (Drizzle ORM)
- **Cache**: Redis (ioredis)
- **Authentication**: JWT (jose), WebAuthn, OIDC/Microsoft Entra
- **Security**: CSRF protection, CSP with nonces, RBAC
- **Logging**: Custom wrapper around native console with correlation tracking
- **Testing**: Vitest, Testing Library

---

## Code Quality Review

### 1. TypeScript Standards

#### 1.1 Type Safety

**Review Checklist:**

- [ ] No `any` types in codebase
- [ ] Strict mode enabled in tsconfig.json
- [ ] All functions have explicit return types
- [ ] No type assertions without justification
- [ ] Proper generic constraints
- [ ] Discriminated unions for complex types
- [ ] No `as` assertions (use type guards instead)
- [ ] Unknown used instead of any when type is truly unknown

**Test Commands:**
```bash
# Find 'any' types (should be zero)
grep -r ": any\|<any>" lib/ app/ components/ --include="*.ts" --include="*.tsx" | grep -v "node_modules"

# Check strict mode
grep "strict" tsconfig.json

# Run type checker
pnpm tsc --noEmit

# Find type assertions
grep -r " as " lib/ app/ components/ --include="*.ts" --include="*.tsx" | wc -l
```

**Common Issues:**
- Using `any` to bypass type errors
- Missing return types on functions
- Type assertions hiding errors
- Loose generic constraints
- Using `as` instead of proper type narrowing

**Good Pattern:**
```typescript
// Good: Type guard
function isUser(value: unknown): value is User {
  return typeof value === 'object' && value !== null && 'id' in value;
}

// Bad: Type assertion
const user = data as User; // Unsafe
```

**Remediation Priority:** **CRITICAL**

---

#### 1.2 Type Organization

**Review Checklist:**

- [ ] Types defined in dedicated `types.ts` files
- [ ] Shared types in `lib/types/`
- [ ] No duplicate type definitions
- [ ] Types exported from barrel files (where appropriate)
- [ ] Interface vs Type usage is consistent
- [ ] Generic types have descriptive names (not T, U, V)
- [ ] Complex types have JSDoc documentation

**Test Commands:**
```bash
# Find duplicate type definitions
grep -r "export type\|export interface" lib/ | sort | uniq -d

# Find generic single-letter types
grep -r "<T>" lib/ --include="*.ts" | wc -l
```

**Good Pattern:**
```typescript
// Good: Descriptive generics
type Result<DataType, ErrorType = Error> = 
  | { success: true; data: DataType }
  | { success: false; error: ErrorType };

// Bad: Non-descriptive generics
type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };
```

**Files to Review:**
- [lib/types/\*](../lib/types/)

---

### 2. React & Next.js Code Quality

#### 2.1 Component Design

**Review Checklist:**

- [ ] Single Responsibility Principle per component
- [ ] Props interface properly typed (no implicit any)
- [ ] Component composition over prop drilling (max 3 levels)
- [ ] Custom hooks extract reusable logic
- [ ] No business logic in components (delegate to services)
- [ ] Proper use of Server vs Client Components
- [ ] Components < 300 lines (extract subcomponents if larger)
- [ ] No god components with too many responsibilities

**Test Commands:**
```bash
# Find large components
find components/ app/ -name "*.tsx" | xargs wc -l | sort -rn | head -20

# Find components without prop types
grep -L "interface.*Props\|type.*Props" components/**/*.tsx

# Check Server vs Client Component ratio
echo "Client Components:" && grep -r "use client" app/ components/ | wc -l
echo "Total Components:" && find app/ components/ -name "*.tsx" | wc -l
```

**Good Pattern:**
```typescript
// Good: Single responsibility, typed props, composition
interface UserCardProps {
  user: User;
  onEdit?: (user: User) => void;
}

function UserCard({ user, onEdit }: UserCardProps) {
  return (
    <Card>
      <UserAvatar user={user} />
      <UserInfo user={user} />
      {onEdit && <EditButton onClick={() => onEdit(user)} />}
    </Card>
  );
}

// Bad: Too many responsibilities, inline styles, business logic
function UserCard({ user }: any) {
  const [data, setData] = useState();
  useEffect(() => {
    // Fetching in component
    fetch('/api/user').then(r => r.json()).then(setData);
  }, []);
  
  return <div style={{...}} onClick={() => {
    // Business logic here
    if (user.role === 'admin') { /* ... */ }
  }}>...</div>;
}
```

**Common Issues:**
- Too many props (> 7 indicates refactor needed)
- Business logic in render methods
- Direct API calls in components
- Prop drilling through multiple levels
- Components doing too much

**Files to Review:**
- All components in [components/](../components/)
- All page components in [app/](../app/)

---

#### 2.2 Server vs Client Components

**Review Checklist:**

- [ ] Default to Server Components unless client interactivity needed
- [ ] Proper async/await in Server Components
- [ ] No client-only APIs in Server Components (useState, useEffect, etc.)
- [ ] No server-only APIs in Client Components (direct DB access)
- [ ] Streaming boundaries properly placed
- [ ] Loading.tsx and error.tsx files present for routes
- [ ] Client Components marked with 'use client' at top of file
- [ ] Data fetching in Server Components when possible

**Test Commands:**
```bash
# Find Client Components (review each for necessity)
grep -r "use client" app/ components/

# Find potential Server Components with client hooks
grep -r "useState\|useEffect" app/ | grep -v "use client"

# Find missing loading/error boundaries
find app/ -type d | while read dir; do
  if [ -f "$dir/page.tsx" ]; then
    [ ! -f "$dir/loading.tsx" ] && echo "Missing loading.tsx in $dir"
    [ ! -f "$dir/error.tsx" ] && echo "Missing error.tsx in $dir"
  fi
done
```

**Good Pattern:**
```typescript
// Good: Server Component with async data fetching
export default async function UsersPage() {
  const users = await getUsers(); // Direct server-side fetch
  return <UserList users={users} />; // Can be Server Component too
}

// Good: Client Component when needed
'use client';
import { useState } from 'react';

export function InteractiveUserList({ users }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  return <div onClick={() => setSelected(user.id)}>...</div>;
}

// Bad: Client Component unnecessarily
'use client';
export function StaticUserCard({ user }: Props) {
  return <div>{user.name}</div>; // No interactivity, should be Server Component
}
```

**Common Issues:**
- Marking components as 'use client' unnecessarily
- Fetching data in Client Components instead of Server Components
- Missing error boundaries
- Missing loading states
- Not leveraging streaming

---

#### 2.3 Hooks Quality

**Review Checklist:**

- [ ] Custom hooks follow `use` prefix convention
- [ ] Hooks don't violate Rules of Hooks (only call at top level)
- [ ] useEffect has proper dependency arrays
- [ ] No unnecessary useEffect (can often be derived state)
- [ ] useCallback/useMemo used appropriately (not prematurely)
- [ ] Custom hooks have single responsibility
- [ ] Hooks properly typed with generics when needed
- [ ] No complex logic in useEffect (extract to functions)

**Test Commands:**
```bash
# Find useEffect without dependencies (potential issues)
grep -A 5 "useEffect" components/ app/ | grep -B 5 "\[\]$"

# Find potential Rules of Hooks violations
grep -A 20 "use[A-Z]" components/ app/ --include="*.tsx" | grep -E "if \(|for \(|while \("

# Find custom hooks without 'use' prefix
grep -r "export function [a-z].*Hook\|export const [a-z].*Hook" components/ app/
```

**Good Pattern:**
```typescript
// Good: Simple, focused custom hook
function useUserData(userId: string) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    let cancelled = false;
    
    async function fetchUser() {
      const data = await getUser(userId);
      if (!cancelled) {
        setUser(data);
        setLoading(false);
      }
    }
    
    fetchUser();
    return () => { cancelled = true; };
  }, [userId]); // Proper dependencies
  
  return { user, loading };
}

// Bad: Too complex, multiple responsibilities, missing dependencies
function useEverything(id) {
  const [data, setData] = useState();
  useEffect(() => {
    // Doing too much
    fetch(`/api/${id}`).then(r => r.json()).then(setData);
    doSomethingElse();
    andAnotherThing();
  }); // Missing dependency array!
  
  return data;
}
```

**Common Issues:**
- Missing dependency arrays (causes infinite loops or stale closures)
- Over-using useEffect when derived state would work
- Premature optimization with useMemo/useCallback
- Hooks that do too many things
- Conditional hook calls (violates Rules of Hooks)

---

#### 2.4 Component Composition Patterns

**Review Checklist:**

- [ ] Compound components pattern for related UI
- [ ] Render props or children functions when appropriate
- [ ] Higher-order components used sparingly (prefer hooks)
- [ ] Slot pattern for flexible layouts
- [ ] No prop drilling beyond 3 levels
- [ ] Context used appropriately (not for frequently changing values)

**Good Pattern:**
```typescript
// Good: Compound component pattern
function Tabs({ children }: Props) {
  const [active, setActive] = useState(0);
  return (
    <TabsContext.Provider value={{ active, setActive }}>
      {children}
    </TabsContext.Provider>
  );
}

Tabs.List = function TabsList({ children }: Props) { /* ... */ };
Tabs.Panel = function TabsPanel({ children }: Props) { /* ... */ };

// Usage
<Tabs>
  <Tabs.List>
    <Tabs.Tab>Tab 1</Tabs.Tab>
    <Tabs.Tab>Tab 2</Tabs.Tab>
  </Tabs.List>
  <Tabs.Panel>Content 1</Tabs.Panel>
  <Tabs.Panel>Content 2</Tabs.Panel>
</Tabs>
```

---

### 3. Code Organization and File Structure

#### 3.1 Directory Structure

**Review Checklist:**

- [ ] Clear separation of concerns
- [ ] Consistent directory structure
- [ ] No circular dependencies
- [ ] Barrel exports used appropriately (not in hot paths)
- [ ] No "god" modules (> 1000 lines)
- [ ] Feature-based organization where appropriate
- [ ] Shared components in components/ui/
- [ ] Feature-specific components co-located with routes

**Test Commands:**
```bash
# Find circular dependencies
npx madge --circular lib/

# Find large files
find . -name "*.ts" -o -name "*.tsx" | xargs wc -l | sort -rn | head -20

# Visualize dependency graph
npx madge --image graph.png lib/
```

**Recommended Structure:**
```
app/
├── (auth)/           # Route group for authenticated pages
├── (public)/         # Route group for public pages
├── api/              # API routes
└── [feature]/        # Feature-based organization
    ├── components/   # Feature-specific components
    ├── page.tsx      # Route page
    ├── loading.tsx   # Loading UI
    └── error.tsx     # Error UI

components/
├── ui/               # Shared, reusable UI components
├── layouts/          # Layout components
├── rbac/             # RBAC-specific components
└── [feature]/        # Feature-specific shared components

lib/
├── api/              # API utilities, middleware, route handlers
├── auth/             # Authentication logic
├── cache/            # Caching layer
├── db/               # Database schemas and connection
├── hooks/            # Shared React hooks
├── logger/           # Logging system
├── rbac/             # Authorization logic
├── security/         # Security utilities (CSRF, headers)
├── services/         # Business logic services
├── types/            # Shared TypeScript types
├── utils/            # Utility functions
└── validations/      # Input validation schemas
```

**Common Issues:**
- Mixing features in same directory
- No clear public API (barrel exports)
- Deeply nested directories (> 4 levels)
- Inconsistent naming across similar modules

---

#### 3.2 File Naming Conventions

**Review Checklist:**

- [ ] Files: kebab-case (e.g., `user-service.ts`)
- [ ] Components: PascalCase (e.g., `UserProfile.tsx`)
- [ ] Hooks: `use-feature-name.ts` or `useFeatureName.ts` (consistent)
- [ ] Utils: `feature-name-utils.ts` or `feature-name.utils.ts` (consistent)
- [ ] Constants: `constants.ts` or `CONSTANT_NAME.ts`
- [ ] Test files: `component-name.test.tsx`
- [ ] No generic names (e.g., `utils.ts`, `helpers.ts` without context)
- [ ] Related files grouped logically

**Test Commands:**
```bash
# Find inconsistent naming
find . -name "*.ts" -o -name "*.tsx" | grep -v node_modules | sort

# Find generic filenames (potential issues)
find . -name "utils.ts" -o -name "helpers.ts" -o -name "common.ts"
```

**Good Pattern:**
```
components/
├── UserProfile.tsx           # Component
├── UserProfile.test.tsx      # Test
└── use-user-profile.ts       # Hook

lib/
├── user-service.ts           # Service
├── user-types.ts             # Types
└── user-validation.ts        # Validation
```

**Common Issues:**
- Inconsistent casing (UserProfile.tsx vs userProfile.tsx)
- Non-descriptive names (component1.tsx, temp.ts)
- Abbreviations without context (usr.ts, mgr.ts)
- No clear relationship between related files

---

#### 3.3 Import/Export Best Practices

**Review Checklist:**

- [ ] Named exports for utilities (better tree-shaking)
- [ ] Default exports for components (Next.js convention)
- [ ] Path aliases used (@/ for lib/, @components/ for components/)
- [ ] No barrel exports with side effects
- [ ] Import order: external → internal → relative
- [ ] No circular dependencies through re-exports
- [ ] No overly deep import paths (> 4 levels of ../)
- [ ] Index files only for public API surface

**Test Commands:**
```bash
# Find circular dependencies
npx madge --circular lib/

# Find deep relative imports
grep -r "\.\./\.\./\.\./\.\." lib/ app/ components/

# Check import order (manual review needed)
head -20 lib/services/user-service.ts
```

**Good Pattern:**
```typescript
// Good: Clean imports with aliases
import { db } from '@/lib/db';
import { UserService } from '@/lib/services/user-service';
import { Button } from '@/components/ui/button';
import { formatDate } from './utils';

// Bad: Deep relative paths
import { db } from '../../../../lib/db';
import { UserService } from '../../../services/user-service';
```

**Import Organization:**
```typescript
// 1. External dependencies
import { useState, useEffect } from 'react';
import { z } from 'zod';

// 2. Internal imports (grouped)
// Types
import type { User } from '@/lib/types';

// Components
import { Button } from '@/components/ui/button';

// Utils
import { formatDate } from '@/lib/utils';

// Config
import { env } from '@/lib/env';

// 3. Relative imports
import { LocalComponent } from './local-component';
import type { LocalType } from './types';
```

**Common Issues:**
- Mixing import styles (default vs named inconsistently)
- Barrel exports causing circular dependencies
- No path aliases (long relative paths)
- Importing from index files in hot paths (performance)

---

### 4. Code Duplication

#### 4.1 Identifying Duplication

**Review Checklist:**

- [ ] No copy-pasted code blocks (> 5 lines)
- [ ] Shared utilities extracted to `lib/utils/`
- [ ] Common patterns abstracted
- [ ] Reusable components in `components/ui/`
- [ ] Service layer patterns consistent
- [ ] Similar validation schemas consolidated
- [ ] Common error handling patterns

**Test Commands:**
```bash
# Find large files (potential duplication)
find lib/ app/ components/ -name "*.ts" -o -name "*.tsx" | xargs wc -l | sort -rn | head -20

# Look for similar patterns
grep -r "const.*=.*Date.now()" lib/ | wc -l

# Use jscpd for duplication detection
npx jscpd lib/ app/ components/
```

**Tools:**
- jscpd (Copy/Paste Detector)
- SonarQube
- Manual review of similar filenames

**Duplication Thresholds:**
- **> 5%**: Requires immediate attention
- **3-5%**: Plan refactoring
- **< 3%**: Acceptable

**Remediation Priority:** **HIGH**

---

#### 4.2 Refactoring Opportunities

**Review Checklist:**

- [ ] Similar functions consolidated
- [ ] Shared business logic in services
- [ ] Reusable validation schemas
- [ ] Common error handling patterns
- [ ] Middleware pipelines for API routes
- [ ] Similar React components composed from shared primitives

**Good Pattern:**
```typescript
// Good: Shared utility
function formatUserName(user: User, options?: FormatOptions) {
  const { includeTitle, format } = options ?? {};
  // Single implementation used everywhere
}

// Bad: Duplicated logic
function getUserDisplayName(user: User) {
  return `${user.firstName} ${user.lastName}`;
}

function formatUserFullName(user: User) {
  return `${user.firstName} ${user.lastName}`; // Duplicate!
}
```

**Files to Review:**
- Any file > 500 lines
- Multiple files with similar names
- Files with similar function signatures

---

### 5. Code Smell Detection

#### 5.1 Common Code Smells

**Review Checklist:**

- [ ] Functions > 50 lines (should be decomposed)
- [ ] Files > 500 lines (should be split)
- [ ] Cyclomatic complexity > 10
- [ ] Deeply nested conditionals (> 3 levels)
- [ ] Long parameter lists (> 4 parameters, use options object)
- [ ] Boolean traps (multiple boolean parameters)
- [ ] Magic numbers (use named constants)
- [ ] Inconsistent naming across similar functions
- [ ] Shotgun surgery (one change requires many file updates)
- [ ] Feature envy (method uses more of another class than its own)
- [ ] Dead code (unused exports, functions, variables)
- [ ] Commented-out code

**Test Commands:**
```bash
# Find long functions
npx ts-complexity lib/ app/ --limit 50

# Find files with high complexity
npx ts-complexity lib/ --over 10

# Find commented code
grep -r "// [a-z].*(" lib/ app/ | head -20

# Find unused exports
npx ts-prune
```

**Good Pattern:**
```typescript
// Good: Decomposed function
function processUserData(user: User) {
  const validated = validateUser(user);
  const enriched = enrichUserData(validated);
  return formatForDisplay(enriched);
}

// Bad: Long function with too much logic
function processUserData(user: User) {
  // 100 lines of validation
  // 50 lines of enrichment
  // 30 lines of formatting
  // Should be split!
}
```

**Boolean Trap Example:**
```typescript
// Bad: Boolean trap
function createUser(name: string, isAdmin: boolean, isActive: boolean, isVerified: boolean) {
  // Which boolean is which?
}
createUser('John', true, false, true); // Hard to read

// Good: Options object with named properties
interface CreateUserOptions {
  name: string;
  role: 'admin' | 'user';
  status: 'active' | 'inactive';
  verified: boolean;
}
function createUser(options: CreateUserOptions) { /* ... */ }
createUser({ 
  name: 'John', 
  role: 'admin', 
  status: 'inactive', 
  verified: true 
}); // Clear!
```

---

### 6. Documentation Standards

#### 6.1 Code Documentation

**Review Checklist:**

- [ ] Complex functions have JSDoc comments
- [ ] Public APIs fully documented
- [ ] Type definitions have descriptions
- [ ] Non-obvious code has inline comments
- [ ] TODO comments include ticket numbers
- [ ] Edge cases documented
- [ ] Performance considerations noted
- [ ] Security considerations noted

**Good Pattern:**
```typescript
/**
 * Validates and creates a new user account
 * 
 * @param data - User registration data
 * @param options - Optional configuration
 * @returns Created user object with generated ID
 * @throws {ValidationError} If user data is invalid
 * @throws {DuplicateError} If email already exists
 * 
 * @example
 * ```typescript
 * const user = await createUser({
 *   email: 'user@example.com',
 *   password: 'secure123',
 *   name: 'John Doe'
 * });
 * ```
 * 
 * @security Passwords are hashed using bcrypt with cost factor 12
 * @performance Checks cache before database query
 */
export async function createUser(
  data: CreateUserInput,
  options?: CreateUserOptions
): Promise<User> {
  // Implementation
}
```

**Common Issues:**
- Missing documentation on exported functions
- No examples for complex APIs
- Outdated comments that don't match code
- Too many comments (self-documenting code is better)
- Comments explaining "what" instead of "why"

---

#### 6.2 Component Documentation

**Review Checklist:**

- [ ] Props interfaces documented
- [ ] Complex state logic explained
- [ ] Side effects documented
- [ ] Example usage in JSDoc (for shared components)
- [ ] Accessibility considerations noted
- [ ] Performance implications documented

**Good Pattern:**
```typescript
/**
 * Displays a user's profile with avatar, name, and role badge
 * 
 * @remarks
 * This component uses Server-Side Rendering by default.
 * Avatar images are optimized using next/image.
 * 
 * @example
 * ```tsx
 * <UserProfile 
 *   user={currentUser} 
 *   size="lg"
 *   showBadge 
 * />
 * ```
 */
interface UserProfileProps {
  /** User data to display */
  user: User;
  
  /** Display size variant */
  size?: 'sm' | 'md' | 'lg';
  
  /** Whether to show role badge */
  showBadge?: boolean;
  
  /** Callback when profile is clicked */
  onClick?: (user: User) => void;
}

export function UserProfile({ 
  user, 
  size = 'md',
  showBadge = false,
  onClick 
}: UserProfileProps) {
  // ...
}
```

---

### 7. Environment & Configuration

#### 7.1 Configuration Quality

**Review Checklist:**

- [ ] All environment variables in lib/env.ts with validation
- [ ] No hardcoded values in source code
- [ ] Configuration separated by environment
- [ ] Type-safe environment variables
- [ ] No sensitive values in client-side code
- [ ] Environment variables documented
- [ ] Default values provided where appropriate
- [ ] Required vs optional clearly marked

**Test Commands:**
```bash
# Find hardcoded URLs
grep -r "http://" app/ lib/ --include="*.ts" | grep -v "localhost" | grep -v ".env"
grep -r "https://" app/ lib/ --include="*.ts" | grep -v ".env"

# Find hardcoded values
grep -r "const.*=.*['\"].*@.*['\"]" lib/ | grep -v "test"

# Check for client-side env vars (must start with NEXT_PUBLIC_)
grep "NEXT_PUBLIC_" .env.example
```

**Good Pattern:**
```typescript
// lib/env.ts
import { z } from 'zod';

const envSchema = z.object({
  // Server-only
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(64),
  
  // Client-available (prefixed with NEXT_PUBLIC_)
  NEXT_PUBLIC_API_URL: z.string().url(),
  NEXT_PUBLIC_APP_NAME: z.string().default('BendCare OS'),
});

export const env = envSchema.parse(process.env);

// Bad: Hardcoded value
const API_URL = 'https://api.example.com'; // Should be in env!

// Bad: No validation
const dbUrl = process.env.DATABASE_URL; // Type is string | undefined
```

**Files to Review:**
- [lib/env.ts](../lib/env.ts)
- .env.example (should document all variables)

---

### 8. Error Handling

#### 8.1 Error Handling Patterns

**Review Checklist:**

- [ ] All async functions wrapped in try-catch or properly handled
- [ ] Errors logged with context
- [ ] User-friendly error messages
- [ ] No silent failures
- [ ] Error types properly defined
- [ ] Errors don't leak stack traces to clients
- [ ] Error boundaries for React components
- [ ] Proper error recovery strategies

**Test Commands:**
```bash
# Find async functions without try-catch
grep -A 10 "async function\|async (" lib/ app/ --include="*.ts" | grep -v "try"

# Find throw statements without custom error types
grep -r "throw new Error(" lib/ | wc -l
```

**Good Pattern:**
```typescript
// Good: Custom error types
export class ValidationError extends Error {
  constructor(
    message: string,
    public field: string,
    public code: string = 'VALIDATION_ERROR'
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

// Good: Proper error handling
async function createUser(data: UserInput) {
  try {
    const validated = validateUserInput(data);
    const user = await db.insert(users).values(validated);
    
    log.info('User created', { userId: user.id });
    return user;
  } catch (error) {
    if (error instanceof ValidationError) {
      log.warn('User validation failed', { field: error.field });
      throw error; // Re-throw for caller to handle
    }
    
    log.error('Failed to create user', { error });
    throw new Error('Failed to create user account');
  }
}

// Bad: Silent failure
async function createUser(data: UserInput) {
  const user = await db.insert(users).values(data).catch(() => null);
  return user; // Returns null on error, no logging!
}
```

**Common Issues:**
- Missing error handling
- Generic error messages ('An error occurred')
- Exposing internal errors to users
- Not logging errors
- Catching errors without handling them

**Files to Review:**
- [lib/api/route-handlers/utils/error-handler.ts](../lib/api/route-handlers/utils/error-handler.ts)
- All API route handlers
- All service functions

---

#### 8.2 Error Response Format

**Review Checklist:**

- [ ] Consistent error response structure across all APIs
- [ ] HTTP status codes appropriate (4xx for client, 5xx for server)
- [ ] Error codes for client handling
- [ ] Correlation IDs in errors
- [ ] Validation errors include field details
- [ ] No stack traces in production responses
- [ ] Error responses follow RFC 7807 Problem Details

**Example Error Response:**
```json
{
  "success": false,
  "error": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": {
    "fields": {
      "email": "Invalid email format",
      "password": "Password must be at least 8 characters"
    }
  },
  "meta": {
    "timestamp": "2025-10-16T12:00:00Z",
    "correlationId": "cor_abc123",
    "path": "/api/users"
  }
}
```

**Files to Review:**
- [lib/api/responses/error.ts](../lib/api/responses/error.ts)

---

### 9. Logging Standards

#### 9.1 Logging Consistency

**Review Checklist:**

- [ ] Using `log` wrapper (not direct `console.*`)
- [ ] Correlation IDs in all logs
- [ ] Structured logging with context objects
- [ ] Appropriate log levels (ERROR, WARN, INFO, DEBUG)
- [ ] No console.log in production code
- [ ] PII automatically sanitized
- [ ] Performance metrics logged for slow operations
- [ ] Security events logged

**Test Commands:**
```bash
# Find direct console usage (should be zero)
grep -r "console\." lib/ app/ --include="*.ts" | grep -v "node_modules" | grep -v "logger"

# Check log wrapper usage
grep -r "log\.info\|log\.error" lib/ | wc -l

# Find potential PII in logs
grep -r "log.*password\|log.*ssn\|log.*creditCard" lib/
```

**Good Pattern:**
```typescript
// Good: Structured logging with context
log.info('User created', {
  userId: user.id,
  organizationId: user.organizationId,
  role: user.role,
  duration: Date.now() - startTime,
  correlationId: req.correlationId
});

// Bad: Unstructured console.log
console.log(`User ${user.id} created`); // No context, no correlation ID
```

**Common Issues:**
- Using console.log directly
- Missing context in logs
- Excessive logging (performance impact)
- Logging sensitive data
- Inconsistent log message formats

**Files to Review:**
- [lib/logger/index.ts](../lib/logger/index.ts)
- [CLAUDE.md](../CLAUDE.md) (Logging Standards section)

---

#### 9.2 Log Templates

**Review Checklist:**

- [ ] Using `logTemplates` for CRUD operations
- [ ] Consistent message format across application
- [ ] Required fields: `operation`, `userId`, `duration`, `component`
- [ ] Slow operation flagging with constants
- [ ] Change tracking on updates
- [ ] Audit trail for sensitive operations

**Test Commands:**
```bash
# Check log template usage
grep -r "logTemplates\.crud" lib/services/

# Check slow threshold constants
grep -r "SLOW_THRESHOLDS" lib/
```

**Files to Review:**
- [lib/logger/message-templates.ts](../lib/logger/message-templates.ts)
- [lib/logger/constants.ts](../lib/logger/constants.ts)

---

### 10. Performance Anti-patterns

#### 10.1 React Performance Issues

**Review Checklist:**

- [ ] No excessive re-renders (check with React DevTools Profiler)
- [ ] Appropriate use of React.memo (not premature optimization)
- [ ] useCallback/useMemo used for expensive operations only
- [ ] Large component trees optimized with code splitting
- [ ] Keys in lists are stable and unique (not array index)
- [ ] Context providers don't cause unnecessary re-renders
- [ ] Virtual scrolling for long lists (> 100 items)

**Test Commands:**
```bash
# Find lists without keys
grep -r "\.map(" components/ app/ | grep -v "key="

# Find array index as key (anti-pattern)
grep -r "key={.*index}" components/ app/

# Find large data arrays in state
grep -r "useState.*\[\]" components/ app/ | wc -l
```

**Good Pattern:**
```typescript
// Good: Memoized expensive computation
const sortedUsers = useMemo(
  () => users.sort((a, b) => a.name.localeCompare(b.name)),
  [users]
);

// Good: Stable key
{users.map(user => (
  <UserCard key={user.id} user={user} />
))}

// Bad: Index as key (causes issues with reordering)
{users.map((user, index) => (
  <UserCard key={index} user={user} />
))}

// Bad: Premature optimization
const memoizedValue = useMemo(() => props.value * 2, [props.value]); // Unnecessary!
```

---

#### 10.2 Next.js Performance Issues

**Review Checklist:**

- [ ] Using next/image for all images (not <img>)
- [ ] Using next/font for font optimization
- [ ] Client Components only when necessary
- [ ] Data fetching in Server Components (not Client Components)
- [ ] Proper loading.tsx boundaries for async routes
- [ ] Route segment config used (dynamic, revalidate)
- [ ] Static generation for static content
- [ ] Proper cache headers configured

**Test Commands:**
```bash
# Find <img> tags (should use next/image)
grep -r "<img" app/ components/ | grep -v "next/image" | grep -v "eslint-disable"

# Find font imports (should use next/font)
grep -r "@import.*fonts.googleapis" app/ components/

# Find data fetching in Client Components
grep -A 5 "use client" app/ components/ | grep "fetch\|axios"

# Check for missing route config
find app/ -name "page.tsx" -exec grep -L "export const" {} \;
```

**Good Pattern:**
```typescript
// Good: next/image with optimization
import Image from 'next/image';

<Image 
  src="/user.jpg" 
  alt="User avatar"
  width={100}
  height={100}
  priority={isAboveTheFold}
/>

// Good: next/font
import { Inter } from 'next/font/google';
const inter = Inter({ subsets: ['latin'] });

// Good: Route segment config
export const dynamic = 'force-static';
export const revalidate = 3600; // Revalidate every hour

// Bad: Regular img tag
<img src="/user.jpg" alt="User" /> // No optimization!

// Bad: Fetching in Client Component
'use client';
function UserProfile() {
  const [user, setUser] = useState();
  useEffect(() => {
    fetch('/api/user').then(r => r.json()).then(setUser);
  }, []);
  // Should be Server Component with direct data fetch!
}
```

---

#### 10.3 Database Query Performance

**Review Checklist:**

- [ ] SELECT only needed columns (no `SELECT *`)
- [ ] WHERE clauses on indexed columns
- [ ] LIMIT on potentially large result sets
- [ ] JOINs minimized and optimized
- [ ] N+1 queries prevented (use joins or data loaders)
- [ ] Subqueries optimized or eliminated
- [ ] Database indexes on frequently queried columns

**Test Commands:**
```bash
# Find potential SELECT * usage
grep -r "select()" lib/services/

# Check for missing LIMIT
grep -r "\.from(" lib/services/ | grep -v "limit\|LIMIT"

# Find potential N+1 queries
grep -r "for.*of\|\.map(" lib/services/ | grep -A 3 "await"
```

**Good Pattern:**
```typescript
// Good: Select specific columns with limit
const users = await db
  .select({
    id: users.id,
    name: users.name,
    email: users.email
  })
  .from(users)
  .where(eq(users.organizationId, orgId))
  .limit(100);

// Good: Prevent N+1 with join
const usersWithPosts = await db
  .select()
  .from(users)
  .leftJoin(posts, eq(users.id, posts.userId))
  .where(eq(users.organizationId, orgId));

// Bad: N+1 query problem
const users = await getUsers();
for (const user of users) {
  const posts = await getPosts(user.id); // N+1!
}

// Bad: No limit on potentially large result
const allUsers = await db.select().from(users); // Could be millions!
```

---

## Architecture Review

### 1. Separation of Concerns

#### 1.1 Layered Architecture

**Review Checklist:**

- [ ] Clear separation: Presentation → API → Service → Data
- [ ] No business logic in API routes (delegate to services)
- [ ] No database queries in components (use Server Components or API)
- [ ] Services encapsulate business logic
- [ ] Reusable services across routes
- [ ] Each layer has single responsibility
- [ ] Dependencies flow inward (UI → API → Service → Data)

**Layer Responsibilities:**
- **Presentation (components/, app/)**: UI rendering, user interaction, display logic only
- **API (app/api/)**: Request handling, validation, authentication, orchestration
- **Service (lib/services/)**: Business logic, data transformation, complex operations
- **Data (lib/db/)**: Database access, schema definition, queries

**Good Pattern:**
```typescript
// Good: Layered approach

// Presentation Layer - app/users/page.tsx
export default async function UsersPage() {
  const users = await getUsers(); // Service call
  return <UserList users={users} />;
}

// API Layer - app/api/users/route.ts
export const GET = rbacRoute({
  permissions: ['users:read:all'],
}, async (req, { user }) => {
  const users = await UserService.getAllUsers(user.organizationId);
  return successResponse(users);
});

// Service Layer - lib/services/user-service.ts
export class UserService {
  static async getAllUsers(orgId: string): Promise<User[]> {
    // Business logic here
    const users = await UserRepository.findByOrganization(orgId);
    return users.map(enrichUserData);
  }
}

// Data Layer - lib/services/user-repository.ts
export class UserRepository {
  static async findByOrganization(orgId: string): Promise<User[]> {
    return db.select().from(users).where(eq(users.organizationId, orgId));
  }
}

// Bad: Everything in one place
export const GET = authRoute(async (req) => {
  // Validation, business logic, and database query all mixed!
  const users = await db.select().from(users)
    .where(eq(users.organizationId, req.user.organizationId));
  const enriched = users.map(u => ({ ...u, fullName: `${u.firstName} ${u.lastName}` }));
  return NextResponse.json(enriched);
});
```

**Test Commands:**
```bash
# Find database queries in API routes (should use services)
grep -r "db\\.select\|db\\.insert" app/api/

# Find business logic in components
grep -r "\.map\|\.filter\|\.reduce" app/ components/ | wc -l
```

**Files to Review:**
- [app/api/\*\*/route.ts](../app/api/)
- [lib/services/\*\*/index.ts](../lib/services/)

---

#### 1.2 Dependency Direction

**Review Checklist:**

- [ ] Dependencies flow inward (UI → API → Service → Data)
- [ ] No circular dependencies
- [ ] Services don't depend on API layer
- [ ] Database layer has no business logic
- [ ] Components don't import from API routes
- [ ] Clear dependency boundaries

**Test Commands:**
```bash
# Check for circular dependencies
npx madge --circular lib/

# Visualize dependency graph
npx madge --image graph.png lib/

# Find violations (services importing from API)
grep -r "from.*app/api" lib/services/
```

---

### 2. State Management

#### 2.1 State Organization

**Review Checklist:**

- [ ] Server state separate from client state
- [ ] URL as source of truth for shareable state (search params, filters)
- [ ] Local state preferred over global (lift state only when needed)
- [ ] Context used sparingly (not for frequently changing values)
- [ ] No prop drilling > 3 levels (use composition or context)
- [ ] Form state managed appropriately (React Hook Form, Server Actions)
- [ ] Optimistic updates where appropriate

**Good Pattern:**
```typescript
// Good: URL as state for filters
'use client';
import { useSearchParams, useRouter } from 'next/navigation';

function UserList() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const filter = searchParams.get('filter') ?? 'all';
  
  const updateFilter = (newFilter: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('filter', newFilter);
    router.push(`/users?${params.toString()}`);
  };
  
  return <FilterButtons current={filter} onChange={updateFilter} />;
}

// Bad: Local state for shareable data
function UserList() {
  const [filter, setFilter] = useState('all'); // Not shareable via URL!
  return <FilterButtons current={filter} onChange={setFilter} />;
}
```

**Common Issues:**
- Overusing global state
- Not leveraging URL for state
- Prop drilling instead of composition
- Using Context for frequently changing values (performance issue)

---

#### 2.2 Server State Management

**Review Checklist:**

- [ ] Server state in Server Components when possible
- [ ] Client-side server state uses proper library (React Query, SWR)
- [ ] Proper cache invalidation strategies
- [ ] Optimistic updates for better UX
- [ ] Error boundaries for failed requests
- [ ] Loading states properly handled
- [ ] Stale-while-revalidate pattern where appropriate

**Good Pattern:**
```typescript
// Good: Server Component with server state
export default async function UserPage({ params }: Props) {
  const user = await getUser(params.id); // Direct server fetch
  return <UserProfile user={user} />;
}

// Good: Client Component with React Query (if needed)
'use client';
import { useQuery } from '@tanstack/react-query';

function UserProfile({ userId }: Props) {
  const { data: user, isLoading, error } = useQuery({
    queryKey: ['user', userId],
    queryFn: () => fetchUser(userId),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
  
  if (isLoading) return <Skeleton />;
  if (error) return <ErrorMessage error={error} />;
  return <div>{user.name}</div>;
}

// Bad: Duplicating server state in client state
function UserProfile({ userId }: Props) {
  const [user, setUser] = useState();
  useEffect(() => {
    fetchUser(userId).then(setUser);
  }, [userId]);
  // Manual state management, no caching, no error handling
}
```

---

### 3. Service Layer Patterns

#### 3.1 RBAC Service Pattern

**Review Checklist:**

- [ ] Services extend `BaseRBACService`
- [ ] Consistent CRUD method signatures
- [ ] Organization isolation enforced
- [ ] Resource ownership validation
- [ ] Audit logging integrated
- [ ] Cache invalidation hooks
- [ ] Proper error handling
- [ ] Transaction support for multi-step operations

**Files to Review:**
- [lib/rbac/base-service.ts](../lib/rbac/base-service.ts)
- [lib/services/rbac-\*-service.ts](../lib/services/)

---

### 4. Middleware Pipeline

#### 4.1 Route Handler Architecture

**Review Checklist:**

- [ ] Using composable middleware system
- [ ] Clear pipeline: Correlation → RateLimit → Auth → RBAC
- [ ] Middleware order documented
- [ ] Each middleware single responsibility
- [ ] Middleware testable in isolation
- [ ] Error handling at each layer
- [ ] Request context properly passed

**Files to Review:**
- [lib/api/route-handlers/middleware/pipeline.ts](../lib/api/route-handlers/middleware/pipeline.ts)
- [docs/RBAC_ROUTE_HANDLER_REFACTOR.md](../docs/RBAC_ROUTE_HANDLER_REFACTOR.md)

---

### 5. Database Access Patterns

#### 5.1 Query Optimization

**Review Checklist:**

- [ ] Indexes on foreign keys
- [ ] Indexes on frequently queried columns
- [ ] No N+1 query problems
- [ ] Pagination on large result sets
- [ ] Query result caching where appropriate
- [ ] Connection pooling configured
- [ ] Prepared statements used

**Test Commands:**
```bash
# Check database schema for indexes
grep -r "index(" lib/db/schema.ts

# Find queries without limits
grep -r "\.from(" lib/services/ | grep -v "limit"
```

**Files to Review:**
- [lib/db/schema.ts](../lib/db/schema.ts)
- [lib/services/\*/query-builder.ts](../lib/services/)

---

#### 5.2 Migration Quality

**Review Checklist:**

- [ ] Migrations are idempotent (can run multiple times safely)
- [ ] Rollback migrations provided
- [ ] No data loss in migrations
- [ ] Migration tested on copy of production data
- [ ] Large data migrations handled in batches
- [ ] Index creation uses CONCURRENTLY (PostgreSQL)
- [ ] Migrations versioned and ordered
- [ ] Breaking changes have migration path

**Test Commands:**
```bash
# Run migrations in test environment
pnpm db:migrate

# Check for missing rollback
find migrations/ -name "*.up.sql" | while read file; do
  down_file="${file/.up.sql/.down.sql}"
  [ ! -f "$down_file" ] && echo "Missing rollback for $file"
done
```

---

## Security Review

### 1. Authentication and Session Management

#### 1.1 JWT Token Security

**Review Checklist:**

- [ ] JWT secrets are at least 64 characters in production (enforced in `lib/env.ts`)
- [ ] Access token and refresh token secrets are different
- [ ] Access tokens have short expiration (15 minutes recommended)
- [ ] Refresh tokens have longer expiration (7-30 days)
- [ ] Tokens include proper claims: `jti`, `sub`, `iat`, `exp`
- [ ] Tokens are signed using HS256 or RS256 (check `lib/auth/jwt.ts`)
- [ ] No sensitive data in JWT payload (only user ID, roles)

**Test Commands:**
```bash
# Check JWT configuration
grep -r "JWT_SECRET" lib/env.ts
grep -r "jwtVerify\|SignJWT" lib/
```

**Common Issues:**
- Weak or reused secrets
- Excessive token expiration times
- Storing passwords or PII in tokens
- Missing token revocation on logout

**Files to Review:**
- [lib/auth/jwt.ts](../lib/auth/jwt.ts)
- [lib/env.ts](../lib/env.ts)
- [lib/db/token-schema.ts](../lib/db/token-schema.ts)

---

#### 1.2 Token Storage and Transport

**Review Checklist:**

- [ ] Access tokens stored in httpOnly cookies
- [ ] Refresh tokens stored in httpOnly cookies
- [ ] Cookie flags: `httpOnly: true`, `secure: true` (production), `sameSite: 'strict'`
- [ ] No tokens in localStorage or sessionStorage
- [ ] Authorization header support for API clients
- [ ] Tokens transmitted over HTTPS only in production

**Test Commands:**
```bash
# Check cookie configuration
grep -r "cookies()" app/api/auth/
grep -r "httpOnly\|secure\|sameSite" lib/
```

**Common Issues:**
- Storing tokens in localStorage (XSS vulnerability)
- Missing `secure` flag in production
- `sameSite: 'none'` without justification
- Exposing tokens in client-side code

**Files to Review:**
- [app/api/auth/login/route.ts](../app/api/auth/login/route.ts)
- [middleware.ts](../middleware.ts)
- [lib/api/middleware/auth.ts](../lib/api/middleware/auth.ts)

---

#### 1.3 Token Revocation and Blacklisting

**Review Checklist:**

- [ ] Refresh tokens can be revoked via database flag
- [ ] Token blacklist implemented for emergency revocation
- [ ] Logout revokes all user tokens
- [ ] Role changes invalidate existing tokens
- [ ] Token validation checks database for revocation status
- [ ] Cache invalidation on token revocation

**Test Commands:**
```bash
# Check token revocation logic
grep -r "is_active\|blacklist" lib/db/refresh-token-schema.ts
grep -r "revokeToken\|invalidateToken" lib/
```

**Common Issues:**
- No revocation mechanism (tokens valid until expiry)
- Cache bypassing revocation checks
- Missing revocation on password change
- No cleanup of expired tokens

**Files to Review:**
- [lib/db/refresh-token-schema.ts](../lib/db/refresh-token-schema.ts)
- [lib/db/token-schema.ts](../lib/db/token-schema.ts)
- [middleware.ts#74-142](../middleware.ts#L74-L142)
- [lib/cache/auth-cache.ts](../lib/cache/auth-cache.ts)

---

#### 1.4 Multi-Factor Authentication (MFA)

**Review Checklist:**

- [ ] MFA supported via WebAuthn (FIDO2)
- [ ] MFA enrollment properly secured (requires existing session)
- [ ] MFA verification enforced on login for enrolled users
- [ ] Backup codes or recovery mechanism available
- [ ] MFA bypass only via secure recovery flow
- [ ] Rate limiting on MFA verification attempts

**Test Commands:**
```bash
# Check MFA implementation
grep -r "webauthn\|passkey" lib/auth/
grep -r "mfa" app/api/auth/
```

**Common Issues:**
- Weak MFA bypass mechanisms
- No rate limiting on verification
- Missing recovery options
- Storing credentials insecurely

**Files to Review:**
- [lib/auth/webauthn.ts](../lib/auth/webauthn.ts)
- [lib/db/webauthn-schema.ts](../lib/db/webauthn-schema.ts)
- [app/api/auth/mfa/\*](../app/api/auth/mfa/)

---

### 2. Authorization and Access Control (RBAC)

#### 2.1 Permission Model

**Review Checklist:**

- [ ] Fine-grained permissions (not just roles)
- [ ] Permissions follow format: `resource:action:scope`
- [ ] Super admin bypass properly controlled
- [ ] Organization-based isolation enforced
- [ ] Resource-level permissions checked where applicable
- [ ] No hardcoded role checks in business logic

**Test Commands:**
```bash
# Check permission definitions
grep -r "PermissionName" lib/types/rbac.ts
grep -r "hasPermission" lib/rbac/
```

**Common Issues:**
- Role-based checks instead of permission-based
- Missing organization context
- Super admin bypassing audit logs
- Inconsistent permission naming

**Files to Review:**
- [lib/types/rbac.ts](../lib/types/rbac.ts)
- [lib/rbac/permission-checker.ts](../lib/rbac/permission-checker.ts)
- [lib/db/rbac-schema.ts](../lib/db/rbac-schema.ts)

---

#### 2.2 API Route Protection

**Review Checklist:**

- [ ] All API routes use `rbacRoute`, `authRoute`, or `publicRoute`
- [ ] Public routes explicitly documented with reason
- [ ] Permission requirements clearly specified
- [ ] Resource ID extraction functions implemented
- [ ] Organization ID validation where applicable
- [ ] No authentication bypass paths

**Test Commands:**
```bash
# Find unprotected routes
find app/api -name "route.ts" | xargs grep -L "rbacRoute\|authRoute\|publicRoute"

# Check route protection patterns
grep -r "export const GET\|POST\|PUT\|DELETE" app/api/ | head -20
```

**Common Issues:**
- Missing authentication on API routes
- Inconsistent protection patterns
- Public routes without documented reason
- Missing resource validation

**Files to Review:**
- [lib/api/route-handlers/index.ts](../lib/api/route-handlers/index.ts)
- [app/api/\*\*/route.ts](../app/api/)
- [lib/api/middleware/rbac-middleware.ts](../lib/api/middleware/rbac-middleware.ts)

---

#### 2.3 Frontend Authorization

**Review Checklist:**

- [ ] `<ProtectedComponent>` used for conditional rendering
- [ ] `<ProtectedPage>` used for page-level protection
- [ ] Server-side validation always enforced (never rely on client-only)
- [ ] No sensitive data in client bundles
- [ ] Permission checks match API routes

**Test Commands:**
```bash
# Check frontend protection usage
grep -r "ProtectedComponent\|ProtectedPage" components/
grep -r "hasPermission" components/
```

**Common Issues:**
- Client-only permission checks
- Sensitive data exposed in props
- Mismatched frontend/backend permissions
- Hard-coded role checks in UI

**Files to Review:**
- [components/rbac/protected-component.tsx](../components/rbac/protected-component.tsx)
- [components/rbac/protected-page.tsx](../components/rbac/protected-page.tsx)

---

### 3. CSRF Protection

#### 3.1 Token Generation and Validation

**Review Checklist:**

- [ ] CSRF tokens use HMAC with secret (at least 32 chars)
- [ ] Anonymous tokens for public endpoints (login, register)
- [ ] Authenticated tokens for protected endpoints
- [ ] Double-submit cookie pattern enforced
- [ ] Constant-time comparison to prevent timing attacks
- [ ] Request fingerprinting (IP, User-Agent) for anonymous tokens

**Test Commands:**
```bash
# Check CSRF implementation
grep -r "generateAnonymousToken\|generateAuthenticatedToken" lib/security/
grep -r "verifyCSRFToken" middleware.ts
```

**Common Issues:**
- Weak or predictable tokens
- Missing CSRF on state-changing operations
- Non-constant-time comparison
- Accepting GET requests for mutations

**Files to Review:**
- [lib/security/csrf-unified.ts](../lib/security/csrf-unified.ts)
- [middleware.ts#206-223](../middleware.ts#L206-L223)
- [app/api/csrf/route.ts](../app/api/csrf/route.ts)

---

#### 3.2 CSRF Exemptions

**Review Checklist:**

- [ ] Exemptions documented with security justification
- [ ] Webhooks exempt (external services, signature verification)
- [ ] Health checks exempt (GET-only, no state changes)
- [ ] CSRF token endpoint exempt (can't require CSRF to get CSRF)
- [ ] No exemptions for user-facing mutation endpoints

**Test Commands:**
```bash
# Review CSRF exemptions
grep -A 15 "CSRF_EXEMPT_PATHS" middleware.ts
```

**Common Issues:**
- Over-broad exemptions
- Missing justification comments
- Exempt endpoints with state changes
- Inconsistent exemption patterns

**Files to Review:**
- [middleware.ts#12-24](../middleware.ts#L12-L24)

---

### 4. Content Security Policy (CSP)

#### 4.1 CSP Configuration

**Review Checklist:**

- [ ] CSP enforced in production (`Content-Security-Policy` header)
- [ ] CSP report-only in development for debugging
- [ ] Nonce-based script execution (no `unsafe-inline` in production)
- [ ] Nonce-based style execution (no `unsafe-inline` in production)
- [ ] SHA256 hashes for Next.js framework scripts
- [ ] Strict `default-src`, `script-src`, `style-src` directives
- [ ] `frame-ancestors 'none'` to prevent clickjacking
- [ ] `upgrade-insecure-requests` in production

**Test Commands:**
```bash
# Check CSP implementation
grep -r "Content-Security-Policy" lib/security/headers.ts
grep -r "nonce" middleware.ts
```

**Common Issues:**
- `unsafe-inline` or `unsafe-eval` in production
- Missing nonce generation
- Over-permissive CSP in production
- No CSP violation reporting

**Files to Review:**
- [lib/security/headers.ts#82-170](../lib/security/headers.ts#L82-L170)
- [middleware.ts#156-189](../middleware.ts#L156-L189)
- [app/api/security/csp-report/route.ts](../app/api/security/csp-report/route.ts)

---

#### 4.2 Nonce Management

**Review Checklist:**

- [ ] Unique nonces per request
- [ ] Separate nonces for scripts and styles
- [ ] Nonces passed to client via headers
- [ ] Nonces injected into inline scripts/styles
- [ ] No nonce reuse across requests

**Test Commands:**
```bash
# Check nonce generation and usage
grep -r "generateCSPNonces" lib/security/
grep -r "x-script-nonce\|x-style-nonce" middleware.ts
```

**Common Issues:**
- Reusing nonces across requests
- Missing nonce in inline content
- Nonces exposed in URLs
- Weak randomness in nonce generation

**Files to Review:**
- [lib/security/headers.ts#54-76](../lib/security/headers.ts#L54-L76)
- [middleware.ts#157-167](../middleware.ts#L157-L167)

---

### 5. Security Headers

#### 5.1 Mandatory Security Headers

**Review Checklist:**

- [ ] `X-Frame-Options: DENY`
- [ ] `X-Content-Type-Options: nosniff`
- [ ] `Referrer-Policy: strict-origin-when-cross-origin`
- [ ] `X-XSS-Protection: 1; mode=block` (legacy browsers)
- [ ] `Strict-Transport-Security` (production only, HTTPS)
- [ ] `Permissions-Policy` (restrict browser features)
- [ ] `X-DNS-Prefetch-Control: off`

**Test Commands:**
```bash
# Check security headers
grep -r "X-Frame-Options\|X-Content-Type-Options" lib/security/headers.ts
curl -I https://your-domain.com | grep "X-"
```

**Common Issues:**
- Missing headers
- Incorrect header values
- HSTS in development (breaks local testing)
- Overly permissive Permissions-Policy

**Files to Review:**
- [lib/security/headers.ts#8-42](../lib/security/headers.ts#L8-L42)
- [next.config.js#14-28](../next.config.js#L14-L28)

---

### 6. Rate Limiting

#### 6.1 Rate Limit Configuration

**Review Checklist:**

- [ ] Redis-based rate limiting (multi-instance safe)
- [ ] Different limits per endpoint type (auth, api, upload, mfa)
- [ ] Sliding window algorithm
- [ ] IP-based identification (respects proxy headers)
- [ ] Rate limit headers in responses
- [ ] Security event logging on violations

**Test Commands:**
```bash
# Check rate limit configuration
grep -r "RATE_LIMIT_CONFIGS" lib/api/middleware/rate-limit.ts
grep -r "applyRateLimit" lib/api/
```

**Common Issues:**
- In-memory rate limiting (not multi-instance safe)
- Too lenient limits
- No rate limiting on auth endpoints
- Missing client feedback (no headers)

**Files to Review:**
- [lib/api/middleware/rate-limit.ts](../lib/api/middleware/rate-limit.ts)
- [lib/cache/rate-limit-cache.ts](../lib/cache/rate-limit-cache.ts)

---

#### 6.2 Rate Limit Bypass Prevention

**Review Checklist:**

- [ ] No admin bypass for rate limits
- [ ] IP extraction respects proxy headers correctly
- [ ] X-Forwarded-For properly parsed (first IP)
- [ ] No rate limit bypass via authentication
- [ ] Cache properly shared across instances

**Test Commands:**
```bash
# Check IP extraction logic
grep -r "getRateLimitKey\|x-forwarded-for" lib/api/middleware/
```

**Common Issues:**
- Taking last IP from X-Forwarded-For (spoofable)
- Admin users exempt from rate limiting
- Race conditions in distributed rate limiting
- Missing normalization (IPv6 localhost variants)

**Files to Review:**
- [lib/api/middleware/rate-limit.ts#44-50](../lib/api/middleware/rate-limit.ts#L44-L50)
- [middleware.ts#62-96](../middleware.ts#L62-L96)

---

### 7. Input Validation and Sanitization

#### 7.1 Request Validation

**Review Checklist:**

- [ ] All inputs validated with Zod or Valibot schemas
- [ ] No direct database queries with user input
- [ ] Parameterized queries used everywhere (Drizzle ORM)
- [ ] File uploads validated (type, size, content)
- [ ] Request body size limits enforced
- [ ] HTML/SQL injection prevention

**Test Commands:**
```bash
# Check validation usage
grep -r "z\.object\|v\.object" lib/validations/
grep -r "\.parse\|safeParse" app/api/

# Find raw SQL usage (should be none)
grep -r "sql\`" lib/ --include="*.ts" | grep -v "drizzle"
```

**Common Issues:**
- Missing input validation
- Using `any` types for request bodies
- Trusting user input without sanitization
- No file upload restrictions

**Files to Review:**
- [lib/validations/\*.ts](../lib/validations/)
- [lib/api/middleware/request-sanitization.ts](../lib/api/middleware/request-sanitization.ts)

---

#### 7.2 SQL Injection Prevention

**Review Checklist:**

- [ ] Using Drizzle ORM for all database queries
- [ ] No raw SQL with string concatenation
- [ ] Parameterized queries for dynamic filters
- [ ] No user input in table/column names
- [ ] Query builder for complex queries

**Test Commands:**
```bash
# Check for SQL injection risks
grep -r "db\.execute\|sql\`" lib/services/ | grep -v "@drizzle"
grep -r "SELECT.*FROM.*WHERE" lib/ --include="*.ts"
```

**Common Issues:**
- String concatenation in queries
- User input in ORDER BY clauses
- Dynamic table names from user input
- Missing parameterization

**Files to Review:**
- [lib/services/analytics/query-builder.ts](../lib/services/analytics/query-builder.ts)
- [lib/services/analytics/query-sanitizer.ts](../lib/services/analytics/query-sanitizer.ts)
- All files in [lib/services/](../lib/services/)

---

#### 7.3 XSS Prevention

**Review Checklist:**

- [ ] Output encoding for all user-generated content
- [ ] DOMPurify used for rich text content
- [ ] React JSX automatic escaping (no `dangerouslySetInnerHTML` without sanitization)
- [ ] CSP with nonces to prevent inline script injection
- [ ] No `eval()` or `Function()` with user input

**Test Commands:**
```bash
# Check for XSS risks
grep -r "dangerouslySetInnerHTML" components/
grep -r "innerHTML\|outerHTML" app/
grep -r "eval\|new Function" lib/
```

**Common Issues:**
- Unsanitized HTML rendering
- Missing DOMPurify on rich text
- Over-permissive CSP
- Client-side templating without escaping

**Files to Review:**
- [lib/utils/sanitize-html.ts](../lib/utils/sanitize-html.ts)
- All React components using rich text

---

### 8. Data Protection and Privacy

#### 8.1 PII Handling

**Review Checklist:**

- [ ] No PII in logs (automatic sanitization in logger)
- [ ] Password hashing with bcrypt (cost factor ≥ 10)
- [ ] No passwords in JWT tokens
- [ ] No sensitive data in error messages
- [ ] Audit logs for PII access
- [ ] Data encryption at rest (database level)
- [ ] TLS 1.2+ for data in transit

**Test Commands:**
```bash
# Check password hashing
grep -r "bcrypt\.hash" lib/auth/
grep -r "saltRounds\|rounds" lib/

# Check for PII in logs
grep -r "log\.info.*password\|log\.info.*ssn" lib/
```

**Common Issues:**
- Logging passwords or tokens
- Weak bcrypt cost factor (< 10)
- PII in error messages
- Missing encryption for sensitive fields

**Files to Review:**
- [lib/auth/password.ts](../lib/auth/password.ts)
- [lib/logger/sanitizer.ts](../lib/logger/sanitizer.ts)
- [lib/logger/logger.ts](../lib/logger/logger.ts)

---

#### 8.2 Audit Logging

**Review Checklist:**

- [ ] Authentication events logged
- [ ] Authorization failures logged
- [ ] Data access logged for sensitive resources
- [ ] Administrative actions logged
- [ ] Logs include user ID, IP, timestamp, action
- [ ] Logs immutable (append-only)
- [ ] Log retention policy defined

**Test Commands:**
```bash
# Check audit logging usage
grep -r "AuditLogger\.log" lib/services/
grep -r "log\.auth\|log\.security" lib/
```

**Common Issues:**
- Missing audit logs for critical actions
- Insufficient detail in logs
- Logs can be deleted by users
- No log monitoring/alerting

**Files to Review:**
- [lib/db/audit-schema.ts](../lib/db/audit-schema.ts)
- [lib/logger/index.ts](../lib/logger/index.ts)
- [lib/services/\*/index.ts](../lib/services/)

---

### 9. OWASP Top 10 (2021) Coverage

#### 9.1 A01:2021 - Broken Access Control

**Review Checklist:**

- [ ] RBAC enforced on all API routes
- [ ] Resource-level authorization checks
- [ ] No direct object reference vulnerabilities
- [ ] Organization isolation enforced
- [ ] No privilege escalation paths

**Files to Review:**
- [lib/rbac/middleware.ts](../lib/rbac/middleware.ts)
- [lib/api/route-handlers/builders/rbac-route-builder.ts](../lib/api/route-handlers/builders/rbac-route-builder.ts)

---

#### 9.2 A02:2021 - Cryptographic Failures

**Review Checklist:**

- [ ] TLS 1.2+ enforced in production
- [ ] Strong JWT secrets (64+ chars)
- [ ] bcrypt for password hashing
- [ ] No hardcoded secrets in code
- [ ] Secrets in environment variables only

**Files to Review:**
- [lib/env.ts](../lib/env.ts)
- [lib/auth/password.ts](../lib/auth/password.ts)

---

#### 9.3 A03:2021 - Injection

**Review Checklist:**

- [ ] Parameterized queries (Drizzle ORM)
- [ ] Input validation with schemas
- [ ] No dynamic SQL construction
- [ ] Command injection prevention (no `exec` with user input)

**Files to Review:**
- All [lib/services/](../lib/services/) files
- [lib/validations/](../lib/validations/)

---

#### 9.4 A04:2021 - Insecure Design

**Review Checklist:**

- [ ] Rate limiting on authentication
- [ ] MFA available and enforced for admins
- [ ] Account lockout on brute force
- [ ] Security logging and monitoring
- [ ] Secure password reset flow

**Files to Review:**
- [app/api/auth/\*](../app/api/auth/)
- [lib/api/middleware/rate-limit.ts](../lib/api/middleware/rate-limit.ts)

---

#### 9.5 A05:2021 - Security Misconfiguration

**Review Checklist:**

- [ ] No default credentials
- [ ] Security headers configured
- [ ] Error messages don't leak information
- [ ] Dependencies up to date
- [ ] Unused features disabled

**Files to Review:**
- [next.config.js](../next.config.js)
- [lib/security/headers.ts](../lib/security/headers.ts)
- [package.json](../package.json)

---

#### 9.6 A06:2021 - Vulnerable and Outdated Components

**Review Checklist:**

- [ ] Regular `pnpm update` runs
- [ ] Automated vulnerability scanning (npm audit, Snyk)
- [ ] No dependencies with known CVEs
- [ ] Minimal dependency footprint

**Test Commands:**
```bash
pnpm audit
pnpm outdated
```

---

#### 9.7 A07:2021 - Identification and Authentication Failures

**Review Checklist:**

- [ ] Strong password requirements
- [ ] Session timeout implemented
- [ ] Multi-session management
- [ ] Secure password reset
- [ ] Token revocation on logout

**Files to Review:**
- [lib/auth/\*](../lib/auth/)
- [app/api/auth/\*](../app/api/auth/)

---

#### 9.8 A08:2021 - Software and Data Integrity Failures

**Review Checklist:**

- [ ] Webhook signature verification
- [ ] Dependency integrity checks (lock files)
- [ ] Signed commits (optional)
- [ ] CI/CD pipeline security

**Files to Review:**
- [app/api/webhooks/\*](../app/api/webhooks/)
- [pnpm-lock.yaml](../pnpm-lock.yaml)

---

#### 9.9 A09:2021 - Security Logging and Monitoring Failures

**Review Checklist:**

- [ ] Comprehensive logging with correlation IDs
- [ ] Security event logging
- [ ] CloudWatch integration
- [ ] Alert on suspicious activity
- [ ] Log retention policy

**Files to Review:**
- [lib/logger/\*](../lib/logger/)
- [CLAUDE.md](../CLAUDE.md)

---

#### 9.10 A10:2021 - Server-Side Request Forgery (SSRF)

**Review Checklist:**

- [ ] URL validation on all external requests
- [ ] Whitelist of allowed domains
- [ ] No user-controlled URLs without validation
- [ ] Network segmentation (internal APIs not accessible from external)

**Test Commands:**
```bash
# Check for external requests
grep -r "fetch\|axios\|got\|request" lib/services/ | grep -v "node_modules"
```

---

## Performance and Optimization

### 1. Caching Strategy

#### 1.1 Redis Cache Usage

**Review Checklist:**

- [ ] User context cached (RBAC)
- [ ] Auth tokens cached (rate limits)
- [ ] Analytics queries cached
- [ ] Cache invalidation on updates
- [ ] TTL appropriate for data type
- [ ] Cache keys properly namespaced
- [ ] Cache hit/miss metrics logged

**Test Commands:**
```bash
# Check cache usage
grep -r "cache\.get\|cache\.set" lib/

# Review cache TTLs
grep -r "TTL\|expires" lib/cache/
```

**Files to Review:**
- [lib/cache/\*.ts](../lib/cache/)
- [lib/rbac/cached-user-context.ts](../lib/rbac/cached-user-context.ts)

---

#### 1.2 Cache Invalidation

**Review Checklist:**

- [ ] Cache invalidated on data updates
- [ ] Invalidation patterns consistent
- [ ] No stale data served
- [ ] Cascade invalidation for related data
- [ ] Invalidation logged

**Files to Review:**
- [lib/rbac/cache-invalidation.ts](../lib/rbac/cache-invalidation.ts)
- [lib/services/\*\*/index.ts](../lib/services/)

---

### 2. Database Query Performance

#### 2.1 Query Optimization

**Review Checklist:**

- [ ] SELECT only needed columns (no `SELECT *`)
- [ ] WHERE clauses on indexed columns
- [ ] LIMIT on potentially large result sets
- [ ] JOINs minimized
- [ ] Subqueries optimized or eliminated

**Test Commands:**
```bash
# Find potential SELECT * usage
grep -r "select()" lib/services/ | head -20

# Check for missing LIMIT
grep -r "\.from(" lib/services/ | grep -v "limit\|LIMIT"
```

---

#### 2.2 Slow Query Detection

**Review Checklist:**

- [ ] Query timing logged
- [ ] Slow queries flagged (> 500ms)
- [ ] EXPLAIN ANALYZE for slow queries
- [ ] Database performance monitoring

**Files to Review:**
- [lib/logger/constants.ts](../lib/logger/constants.ts)
- [lib/services/analytics/query-executor.ts](../lib/services/analytics/query-executor.ts)

---

### 3. Frontend Performance

#### 3.1 React Optimization

**Review Checklist:**

- [ ] Server Components used where possible
- [ ] Client Components minimized
- [ ] Memoization for expensive computations
- [ ] Lazy loading for heavy components
- [ ] Debouncing on user input
- [ ] Virtual scrolling for long lists

**Test Commands:**
```bash
# Find 'use client' directives
grep -r "\"use client\"" components/ app/
```

---

#### 3.2 Bundle Size

**Review Checklist:**

- [ ] Code splitting configured
- [ ] Tree shaking enabled
- [ ] No unnecessary dependencies in client bundle
- [ ] Images optimized (using next/image)
- [ ] Fonts optimized (using next/font)

**Test Commands:**
```bash
# Analyze bundle
pnpm build
npx @next/bundle-analyzer
```

---

## Testing and Reliability

### 1. Test Organization

#### 1.1 Test Structure

**Review Checklist:**

- [ ] Tests mirror source directory structure
- [ ] Test file naming: [file-name].test.ts
- [ ] Test suites grouped by feature/module
- [ ] Integration tests in tests/integration/
- [ ] Unit tests co-located or in tests/unit/
- [ ] E2E tests in separate directory
- [ ] Test fixtures organized and reusable

**Test Commands:**
```bash
# Find test files
find tests/ -name "*.test.ts"

# Check test file naming consistency
find . -name "*.test.ts" -o -name "*.spec.ts" | wc -l
```

**Recommended Structure:**
```
tests/
├── unit/              # Unit tests
│   ├── utils/
│   ├── services/
│   └── components/
├── integration/       # Integration tests
│   ├── api/
│   ├── auth/
│   └── rbac/
├── e2e/              # End-to-end tests
├── fixtures/         # Test data
└── helpers/          # Test utilities
```

---

#### 1.2 Test Quality Patterns

**Review Checklist:**

- [ ] Tests follow Arrange-Act-Assert pattern
- [ ] One assertion concept per test
- [ ] Descriptive test names (should/when/given pattern)
- [ ] No test interdependencies
- [ ] Proper cleanup in afterEach/afterAll
- [ ] Mock at boundaries, not internal implementation
- [ ] Tests are deterministic (no flaky tests)
- [ ] Tests are fast (< 100ms for unit tests)

**Good Pattern:**
```typescript
// Good: Descriptive, tests behavior
describe('UserService', () => {
  describe('createUser', () => {
    it('should create user with hashed password', async () => {
      // Arrange
      const userData = { email: 'test@example.com', password: 'password123' };
      
      // Act
      const user = await UserService.createUser(userData);
      
      // Assert
      expect(user.email).toBe(userData.email);
      expect(user.password).not.toBe(userData.password); // Hashed
      expect(bcrypt.compareSync(userData.password, user.password)).toBe(true);
    });
    
    it('should throw error when email already exists', async () => {
      // Arrange
      await UserService.createUser({ email: 'test@example.com', password: 'pass' });
      
      // Act & Assert
      await expect(
        UserService.createUser({ email: 'test@example.com', password: 'pass2' })
      ).rejects.toThrow('Email already exists');
    });
  });
});

// Bad: Testing implementation, not behavior
it('should call bcrypt.hash', async () => {
  const spy = vi.spyOn(bcrypt, 'hash');
  await UserService.createUser({ email: 'test@example.com', password: 'pass' });
  expect(spy).toHaveBeenCalled(); // Testing implementation detail!
});
```

---

#### 1.3 What NOT to Test

**Review Checklist:**

- [ ] Don't test library code (React, Next.js internals)
- [ ] Don't test implementation details
- [ ] Don't snapshot entire components (too brittle)
- [ ] Don't test third-party integrations (mock them)
- [ ] Don't test trivial code (getters/setters)

**Anti-patterns:**
```typescript
// Bad: Testing React internals
it('should call useState', () => {
  const spy = vi.spyOn(React, 'useState');
  render(<Component />);
  expect(spy).toHaveBeenCalled();
});

// Bad: Testing implementation
it('should have correct internal state', () => {
  const { result } = renderHook(() => useCounter());
  expect(result.current.internalCounter).toBe(0); // Internal detail!
});

// Good: Testing behavior
it('should increment counter when button clicked', () => {
  render(<Counter />);
  fireEvent.click(screen.getByText('Increment'));
  expect(screen.getByText('Count: 1')).toBeInTheDocument();
});
```

---

### 2. Test Coverage Goals

**Coverage Targets:**
- **Overall:** 70%+ (branch coverage)
- **Authentication:** 90%+
- **Authorization (RBAC):** 90%+
- **Services:** 80%+
- **Utilities:** 90%+
- **API Routes:** 60%+
- **Components:** 60%+

**Test Commands:**
```bash
# Run with coverage
pnpm test:coverage

# View coverage report
open coverage/index.html

# Check coverage for specific directory
pnpm test:coverage --coverage lib/services/
```

**Note:** Focus on critical paths and business logic. 100% coverage is not necessary and can lead to diminishing returns.

---

### 3. Critical Flow Testing

**Must-Test Flows:**

1. **Authentication:**
   - Login (password, OIDC)
   - Logout
   - Token refresh
   - MFA enrollment and verification
   - Password reset

2. **Authorization:**
   - Permission checks (own/org/all scopes)
   - Resource isolation
   - Role changes
   - Organization switching

3. **Security:**
   - CSRF protection
   - Rate limiting
   - Input validation
   - XSS prevention

**Files to Review:**
- [tests/integration/auth-flow.test.ts](../tests/integration/auth-flow.test.ts)
- [tests/integration/rbac/permissions.test.ts](../tests/integration/rbac/permissions.test.ts)
- [tests/integration/security-features.test.ts](../tests/integration/security-features.test.ts)

---

### 4. Error Handling Robustness

#### 4.1 Graceful Degradation

**Review Checklist:**

- [ ] Database connection failures handled
- [ ] Redis failures don't break app (fallback to no cache)
- [ ] External service failures handled
- [ ] Retry logic for transient errors
- [ ] Circuit breakers for external APIs
- [ ] Timeout limits on external calls

**Test Commands:**
```bash
# Check error handling patterns
grep -r "try.*catch" lib/services/ | wc -l
grep -r "retry\|circuit" lib/
```

---

#### 4.2 Health Checks

**Review Checklist:**

- [ ] Database health check
- [ ] Redis health check
- [ ] Health endpoint returns proper status
- [ ] Dependency health monitored
- [ ] Graceful shutdown implemented

**Files to Review:**
- [app/api/health/route.ts](../app/api/health/route.ts)
- [lib/db/index.ts](../lib/db/index.ts)

---

## Accessibility

### 1. WCAG 2.1 Compliance

#### 1.1 Keyboard Navigation

**Review Checklist:**

- [ ] All interactive elements keyboard accessible
- [ ] Logical tab order
- [ ] Focus indicators visible (no outline: none without alternative)
- [ ] Keyboard shortcuts don't conflict with screen readers
- [ ] Skip links for navigation
- [ ] Modal trapping (focus stays within modal)
- [ ] No keyboard traps

**Test Commands:**
```bash
# Find missing tabindex or keyboard handlers
grep -r "onClick" components/ | grep -v "onKeyDown\|onKeyPress"

# Find outline: none (anti-pattern)
grep -r "outline: none\|outline:none" app/ components/
```

**Good Pattern:**
```typescript
// Good: Keyboard accessible
<button 
  onClick={handleClick}
  onKeyDown={(e) => e.key === 'Enter' && handleClick()}
>
  Click me
</button>

// Good: Proper focus management
<Dialog>
  <button ref={firstFocusableElement}>Close</button>
  {/* Content */}
  <button ref={lastFocusableElement}>Submit</button>
</Dialog>

// Bad: Not keyboard accessible
<div onClick={handleClick}>Click me</div> // Should be button!

// Bad: Removing outline without alternative
button {
  outline: none; /* No focus indicator! */
}
```

**Manual Testing:**
- Tab through entire page
- Ensure all functionality available via keyboard
- Test with screen reader (NVDA, JAWS, VoiceOver)

---

#### 1.2 Semantic HTML and ARIA

**Review Checklist:**

- [ ] Proper heading hierarchy (h1 → h2 → h3, no skipping)
- [ ] ARIA labels on icon-only buttons
- [ ] Form inputs have associated labels
- [ ] Landmark regions (header, nav, main, footer)
- [ ] Lists use proper list markup (ul, ol, li)
- [ ] Tables use proper table markup with headers
- [ ] ARIA roles used appropriately (not overused)
- [ ] ARIA states updated dynamically (aria-expanded, aria-selected)

**Test Commands:**
```bash
# Find icon buttons without labels
grep -r "<button.*<Icon" components/ | grep -v "aria-label"

# Find inputs without labels
grep -r "<input" components/ | grep -v "label\|aria-label"

# Check heading hierarchy
grep -r "<h[1-6]" app/ components/
```

**Good Pattern:**
```typescript
// Good: Semantic HTML with ARIA
<button aria-label="Close dialog">
  <XIcon />
</button>

<input 
  type="email" 
  id="email" 
  aria-describedby="email-error"
/>
<label htmlFor="email">Email</label>
<span id="email-error" role="alert">Invalid email</span>

// Good: Proper heading hierarchy
<h1>Page Title</h1>
<section>
  <h2>Section Title</h2>
  <h3>Subsection</h3>
</section>

// Bad: Missing labels
<button><XIcon /></button> // What does this do?

// Bad: Skipping heading levels
<h1>Title</h1>
<h3>Subtitle</h3> // Skipped h2!
```

---

#### 1.3 Color and Contrast

**Review Checklist:**

- [ ] Color contrast meets AA standards (4.5:1 for text, 3:1 for large text)
- [ ] Color not sole indicator of information
- [ ] Focus indicators have 3:1 contrast
- [ ] Interactive elements distinguishable
- [ ] Error messages not color-only

**Test Commands:**
```bash
# Manual: Use browser DevTools Accessibility panel
# Automated: Run Lighthouse accessibility audit
npx lighthouse https://localhost:3000 --only-categories=accessibility
```

**Good Pattern:**
```typescript
// Good: Color + icon + text
<Alert variant="error">
  <ErrorIcon />
  <span>Error: Invalid input</span>
</Alert>

// Good: Sufficient contrast
const buttonStyles = {
  background: '#0066cc', // Blue
  color: '#ffffff', // White (contrast ratio: 8.59:1 ✓)
};

// Bad: Color only
<div style={{ color: 'red' }}>Error</div> // Screen readers don't see color!

// Bad: Poor contrast
const badStyles = {
  background: '#999999', // Gray
  color: '#cccccc', // Light gray (contrast ratio: 1.37:1 ✗)
};
```

**Tools:**
- WebAIM Contrast Checker
- Chrome DevTools Accessibility panel
- axe DevTools browser extension

---

#### 1.4 Images and Media

**Review Checklist:**

- [ ] All images have alt text
- [ ] Decorative images have empty alt (alt="")
- [ ] Complex images have detailed descriptions
- [ ] Videos have captions
- [ ] Audio content has transcripts

**Test Commands:**
```bash
# Find images without alt text
grep -r "<img" app/ components/ | grep -v "alt="
grep -r "<Image" app/ components/ | grep -v "alt="
```

**Good Pattern:**
```typescript
// Good: Descriptive alt text
<Image 
  src="/user-profile.jpg" 
  alt="John Doe, Senior Engineer at Acme Corp"
  width={200}
  height={200}
/>

// Good: Empty alt for decorative
<Image 
  src="/decorative-background.jpg" 
  alt="" // Decorative, screen reader will skip
  width={1200}
  height={600}
/>

// Bad: Missing alt
<Image src="/important-chart.jpg" width={800} height={600} />

// Bad: Non-descriptive alt
<Image src="/profile.jpg" alt="image" /> // Not helpful!
```

---

#### 1.5 Forms Accessibility

**Review Checklist:**

- [ ] All form inputs have labels
- [ ] Error messages associated with fields (aria-describedby)
- [ ] Required fields marked (required attribute and aria-required)
- [ ] Error messages have role="alert" for screen readers
- [ ] Form validation accessible
- [ ] Autocomplete attributes for common fields

**Good Pattern:**
```typescript
// Good: Accessible form
<form>
  <div>
    <label htmlFor="email">
      Email <span aria-label="required">*</span>
    </label>
    <input
      type="email"
      id="email"
      name="email"
      required
      aria-required="true"
      aria-invalid={hasError}
      aria-describedby={hasError ? 'email-error' : undefined}
      autoComplete="email"
    />
    {hasError && (
      <span id="email-error" role="alert">
        Please enter a valid email address
      </span>
    )}
  </div>
  
  <button type="submit">Submit</button>
</form>
```

---

### 2. Accessibility Testing

#### 2.1 Automated Testing

**Review Checklist:**

- [ ] axe-core integrated in tests
- [ ] Lighthouse accessibility score > 90
- [ ] ESLint jsx-a11y plugin enabled
- [ ] Automated checks in CI/CD

**Test Commands:**
```bash
# Run accessibility tests
pnpm test:a11y

# Run Lighthouse
npx lighthouse https://localhost:3000 --only-categories=accessibility --view

# Check with axe-core in tests
import { axe, toHaveNoViolations } from 'jest-axe';

it('should have no accessibility violations', async () => {
  const { container } = render(<Component />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

---

#### 2.2 Manual Testing

**Review Checklist:**

- [ ] Keyboard navigation tested on all pages
- [ ] Screen reader tested (NVDA on Windows, VoiceOver on Mac)
- [ ] Zoom to 200% without horizontal scrolling
- [ ] High contrast mode tested
- [ ] Color blindness simulation tested

**Tools:**
- NVDA (Windows)
- JAWS (Windows)
- VoiceOver (Mac)
- Chrome DevTools Accessibility panel
- axe DevTools browser extension
- WAVE browser extension

---

## Quick Wins

### Quick Fixes (< 1 hour each)

**High-Impact Low-Effort Improvements:**

- [ ] Add missing TypeScript strict flags in tsconfig.json
- [ ] Fix all console.log → log.* calls
- [ ] Add JSDoc to all exported functions
- [ ] Remove unused imports (ESLint --fix)
- [ ] Add alt text to all images
- [ ] Update outdated dependencies (non-breaking)
- [ ] Add loading.tsx to async routes
- [ ] Replace <img> with next/image
- [ ] Add error.tsx boundaries
- [ ] Fix missing key props in lists
- [ ] Add aria-labels to icon buttons
- [ ] Remove outline: none without alternatives
- [ ] Add proper heading hierarchy
- [ ] Fix color contrast issues
- [ ] Add autocomplete to form inputs

**Test Commands:**
```bash
# Fix auto-fixable issues
pnpm lint --fix

# Remove unused imports
npx eslint --fix "**/*.{ts,tsx}"

# Find quick wins
grep -r "console\." lib/ app/ | wc -l  # console.log to fix
grep -r "<img" app/ components/ | wc -l  # img to Image
grep -r "\.map(" components/ | grep -v "key=" | wc -l  # missing keys
```

---

## Audit Report Generation

### 1. Report Structure

#### 1.1 Executive Summary

**Contents:**
- Review scope and duration
- Overall security posture (Low/Medium/High risk)
- Overall code quality score (A-F)
- Number of findings by severity
- Key recommendations (top 5)
- Compliance status (OWASP, WCAG, TypeScript standards)

---

#### 1.2 Findings Catalog

**For Each Finding:**

| Field | Description |
|-------|-------------|
| **ID** | Unique identifier (e.g., SEC-001, QUAL-042) |
| **Severity** | Critical / High / Medium / Low |
| **Category** | Security / Quality / Performance / Accessibility |
| **Title** | Brief description (50 chars max) |
| **Location** | File path and line number |
| **Description** | Detailed finding with context |
| **Impact** | Business and technical impact |
| **Recommendation** | Specific remediation steps |
| **Effort** | Estimated hours to fix |
| **Priority Score** | Calculated score (see below) |
| **Status** | Open / In Progress / Resolved |

---

### 2. Severity Definitions

#### 2.1 Critical

**Criteria:**
- Remote code execution vulnerability
- SQL injection vulnerability
- Authentication bypass
- Hardcoded secrets in production
- Unpatched dependency with known exploit

**SLA:** Fix within 24 hours

---

#### 2.2 High

**Criteria:**
- Authorization bypass
- XSS vulnerability
- CSRF missing on critical endpoints
- PII exposure
- Missing encryption
- Type safety violations (extensive use of `any`)

**SLA:** Fix within 7 days

---

#### 2.3 Medium

**Criteria:**
- Missing rate limiting
- Weak CSP configuration
- Information disclosure
- Missing audit logging
- Code duplication (> 5%)
- Missing accessibility features
- Poor error handling

**SLA:** Fix within 30 days

---

#### 2.4 Low

**Criteria:**
- Missing security headers (non-critical)
- Code quality issues (naming, organization)
- Minor performance issues
- Documentation gaps
- Missing tests for non-critical features

**SLA:** Fix within 90 days

---

### 3. Prioritization Framework

**Priority Score = (Severity × 10) + (Exploitability × 5) + (Business Impact × 3)**

**Severity:**
- Critical: 10
- High: 7
- Medium: 4
- Low: 1

**Exploitability:**
- Easy: 10 (can be exploited with basic knowledge)
- Moderate: 5 (requires some expertise)
- Difficult: 1 (requires advanced expertise)

**Business Impact:**
- Critical: 10 (data breach, system compromise)
- High: 7 (service disruption, data loss)
- Medium: 4 (degraded experience)
- Low: 1 (minor inconvenience)

**Examples:**
- SQL Injection (Critical, Easy, Critical): (10×10) + (10×5) + (10×3) = **180**
- Missing CSRF (High, Moderate, High): (7×10) + (5×5) + (7×3) = **116**
- Code Duplication (Medium, N/A, Low): (4×10) + (0×5) + (1×3) = **43**
- Missing Security Header (Low, Difficult, Low): (1×10) + (1×5) + (1×3) = **18**

---

### 4. Report Template

```markdown
# Security and Code Quality Audit Report

**Project:** BendCare OS
**Review Date:** YYYY-MM-DD
**Reviewer:** [Name]
**Scope:** [e.g., Full application, Authentication module, API routes]
**Review Duration:** [e.g., 8 hours]

---

## Executive Summary

### Overview
[2-3 paragraphs summarizing the review, highlighting major findings and overall assessment]

### Key Metrics
- **Total Findings:** X
  - Critical: X
  - High: X
  - Medium: X
  - Low: X
- **Code Quality Score:** B+ (85/100)
- **Test Coverage:** 72%
- **Accessibility Score:** 88/100
- **Security Posture:** Medium Risk

### Overall Assessments

**Security:** [LOW / MEDIUM / HIGH / CRITICAL] Risk
- [Brief summary of security posture]

**Code Quality:** [A / B / C / D / F]
- TypeScript: A (100% type-safe)
- Architecture: B+ (well-structured with minor improvements needed)
- Documentation: C (needs improvement)

**Accessibility:** [Compliant / Partial / Non-compliant]
- WCAG 2.1 Level AA: Partial compliance

### Top 5 Recommendations
1. [Most critical finding with priority score]
2. [Second most critical]
3. [Third most critical]
4. [Fourth most critical]
5. [Fifth most critical]

---

## Detailed Findings

### Critical Findings

#### SEC-001: [Finding Title]

**Severity:** Critical  
**Category:** Security  
**Priority Score:** 180  
**Location:** `lib/auth/jwt.ts:42`  
**Effort:** 2 hours

**Description:**
[Detailed description of the finding, including context and how it was discovered]

**Impact:**
- **Technical:** [e.g., Allows authentication bypass, enables remote code execution]
- **Business:** [e.g., Unauthorized access to sensitive patient data, potential data breach with regulatory penalties]

**Evidence:**
```typescript
// Vulnerable code snippet
const token = jwt.sign({ userId }, "weak_secret");
```

**Recommendation:**
1. Update JWT secret to 64+ characters in production
2. Store secret in environment variable (DATABASE_JWT_SECRET)
3. Rotate all existing tokens
4. Add validation in lib/env.ts to enforce minimum length
5. Update documentation on secret management

**References:**
- OWASP A07:2021 - Identification and Authentication Failures
- [Internal documentation link]

---

### High Findings

#### QUAL-002: [Finding Title]

[Same structure as above]

---

### Medium Findings

[Continue for all findings...]

---

## Summary by Category

### Security: X findings
- Critical: X
- High: X
- Medium: X
- Low: X

**Key Issues:**
- [Summary of security issues]

### Code Quality: X findings
- High: X
- Medium: X
- Low: X

**Key Issues:**
- [Summary of quality issues]

### Performance: X findings
- Medium: X
- Low: X

**Key Issues:**
- [Summary of performance issues]

### Accessibility: X findings
- High: X
- Medium: X
- Low: X

**Key Issues:**
- [Summary of accessibility issues]

---

## Compliance Checklist

### Standards Compliance
- [x] OWASP Top 10 (2021)
- [x] TypeScript strict mode
- [x] Code quality standards (CLAUDE.md)
- [ ] Test coverage > 70% (currently 65%)
- [x] Dependency vulnerabilities addressed
- [x] Security headers configured
- [ ] WCAG 2.1 Level AA (partial compliance)

### Best Practices
- [x] RBAC properly implemented
- [x] Logging standards followed
- [ ] Documentation complete (needs improvement)
- [x] Error handling consistent
- [ ] Component organization (needs minor refactoring)

---

## Testing Results

### Test Coverage
- Overall: 72% (target: 70%+) ✓
- Services: 85% (target: 80%+) ✓
- Auth: 92% (target: 90%+) ✓
- Components: 58% (target: 60%+) ✗

### Performance Metrics
- Lighthouse Score: 89/100
- Bundle Size: 245 KB (good)
- Time to Interactive: 1.8s (good)

### Accessibility Score
- Lighthouse Accessibility: 88/100
- axe-core violations: 7 (need fixing)

---

## Recommendations Roadmap

### Immediate Actions (Week 1)
1. [Critical finding 1]
2. [Critical finding 2]
3. [High priority quick wins]

### Short-term (Weeks 2-4)
1. [High findings]
2. [Medium findings with high impact]
3. [Code quality improvements]

### Long-term (Months 2-3)
1. [Medium findings]
2. [Low findings]
3. [Technical debt reduction]
4. [Documentation improvements]

---

## Appendices

### A. Testing Results
[Attach test coverage reports, security scan results]

### B. Dependency Audit
```
pnpm audit output:
- 0 critical vulnerabilities
- 2 high vulnerabilities (need review)
- 5 moderate vulnerabilities (acceptable)
```

### C. Tools Used
- TypeScript Compiler (tsc)
- ESLint with security plugins
- pnpm audit
- Lighthouse
- axe-core
- Manual code review
- OWASP ZAP (for security testing)

### D. References
- OWASP Top 10: https://owasp.org/Top10/
- WCAG 2.1: https://www.w3.org/WAI/WCAG21/quickref/
- CLAUDE.md: [link to project guidelines]
- Next.js Security: https://nextjs.org/docs/app/building-your-application/security
```

---

## Appendices

### A. Common Vulnerability Patterns

#### A.1 Authentication Vulnerabilities

**Pattern:** Weak JWT secrets  
**Detection:** `grep -r "JWT_SECRET" .env* | awk '{print length($2)}'`  
**Fix:** Use 64+ character secrets

**Pattern:** Missing token expiration  
**Detection:** `grep -r "expiresIn\|exp:" lib/auth/`  
**Fix:** Set short expiration (15 min for access tokens)

**Pattern:** Token stored in localStorage  
**Detection:** `grep -r "localStorage\.setItem.*token" app/ components/`  
**Fix:** Use httpOnly cookies

---

#### A.2 Authorization Vulnerabilities

**Pattern:** Missing RBAC check  
**Detection:** Find API routes without `rbacRoute` wrapper  
**Fix:** Add `rbacRoute` with appropriate permissions

**Pattern:** Direct object reference  
**Detection:** Routes that accept IDs without ownership validation  
**Fix:** Add resource ID validation in RBAC middleware

**Pattern:** Insecure direct object reference (IDOR)  
**Detection:** User can access resources by guessing IDs  
**Fix:** Validate resource ownership before access

---

#### A.3 Injection Vulnerabilities

**Pattern:** SQL injection  
**Detection:** `grep -r "sql\`.*\${" lib/`  
**Fix:** Use parameterized queries

**Pattern:** Command injection  
**Detection:** `grep -r "exec\|spawn" lib/ | grep "\$"`  
**Fix:** Validate and sanitize inputs, use arrays instead of strings

**Pattern:** XSS (Cross-Site Scripting)  
**Detection:** `grep -r "dangerouslySetInnerHTML" components/`  
**Fix:** Use DOMPurify for HTML sanitization

---

### B. Code Quality Metrics

#### B.1 Cyclomatic Complexity

**Target:** < 10 per function

**Tool:**
```bash
npx ts-complexity lib/ app/
```

**High Complexity Indicators:**
- Many if/else branches
- Nested loops
- Long functions (> 50 lines)
- Multiple return statements

**Refactoring Strategies:**
- Extract functions
- Use early returns
- Replace conditionals with polymorphism or lookup tables
- Use guard clauses

---

#### B.2 Code Duplication

**Target:** < 3% duplication

**Tool:**
```bash
npx jscpd lib/ app/ components/
```

**Refactoring Strategies:**
- Extract shared utilities
- Create base classes or services
- Use composition over inheritance
- Create reusable components

---

#### B.3 File Size

**Target:** < 500 lines per file

**Detection:**
```bash
find . -name "*.ts" -o -name "*.tsx" | xargs wc -l | sort -rn | head -20
```

**Refactoring Strategies:**
- Split into multiple modules
- Extract utilities
- Separate concerns (UI, logic, data)
- Use composition

---

### C. Security Testing Tools

#### C.1 Static Analysis

**ESLint Security Plugin:**
```bash
pnpm add -D eslint-plugin-security
```

**TypeScript Strict Mode:**
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true
  }
}
```

---

#### C.2 Dependency Scanning

**npm audit:**
```bash
pnpm audit
pnpm audit fix
```

**Snyk:**
```bash
npx snyk test
npx snyk monitor
```

---

#### C.3 Dynamic Testing

**OWASP ZAP:**
- Automated vulnerability scanning
- API security testing
- Authentication testing

**Burp Suite:**
- Manual security testing
- Request manipulation
- Session testing

---

### D. Performance Testing

#### D.1 Lighthouse

```bash
npx lighthouse https://your-domain.com --view
```

**Targets:**
- Performance: 90+
- Accessibility: 90+
- Best Practices: 100
- SEO: 90+

---

#### D.2 Load Testing

**k6:**
```bash
k6 run load-test.js
```

**Artillery:**
```bash
npx artillery run artillery.yml
```

---

### E. Review Checklist Template

#### E.1 Pull Request Checklist

**Before Submitting:**
- [ ] All tests pass (`pnpm test:run`)
- [ ] TypeScript compiles (`pnpm tsc`)
- [ ] Linting passes (`pnpm lint`)
- [ ] No `any` types added
- [ ] Logging follows standards (no `console.log`)
- [ ] Error handling implemented
- [ ] Security considerations documented
- [ ] Tests added for new features
- [ ] Documentation updated
- [ ] Accessibility checked
- [ ] No hardcoded values
- [ ] Environment variables documented

---

#### E.2 Reviewer Checklist

**Security:**
- [ ] Authentication/authorization correct
- [ ] Input validation present
- [ ] No SQL injection risks
- [ ] No XSS vulnerabilities
- [ ] Secrets not hardcoded
- [ ] CSRF protection present
- [ ] Rate limiting appropriate

**Code Quality:**
- [ ] Type safety maintained (no `any`)
- [ ] No code duplication
- [ ] Clear naming conventions
- [ ] Proper error handling
- [ ] Logging consistent
- [ ] No commented-out code
- [ ] Documentation adequate

**Architecture:**
- [ ] Separation of concerns
- [ ] No circular dependencies
- [ ] Follows existing patterns
- [ ] Testable code
- [ ] Appropriate abstraction level

**React/Next.js:**
- [ ] Server Components used appropriately
- [ ] Client Components only when needed
- [ ] Proper hooks usage
- [ ] No performance anti-patterns
- [ ] Images use next/image
- [ ] Fonts use next/font

**Accessibility:**
- [ ] Keyboard accessible
- [ ] ARIA labels present
- [ ] Color contrast sufficient
- [ ] Alt text on images
- [ ] Proper heading hierarchy

---

### F. Quick Reference Commands

#### F.1 Development Commands

```bash
# Type checking
pnpm tsc --noEmit

# Linting
pnpm lint
pnpm lint --fix

# Testing
pnpm test:run            # All tests
pnpm test:unit           # Unit tests only
pnpm test:integration    # Integration tests only
pnpm test:coverage       # With coverage

# Security
pnpm audit              # Dependency vulnerabilities
pnpm outdated           # Outdated packages

# Code Analysis
npx madge --circular lib/                    # Circular dependencies
npx ts-complexity lib/ --over 10             # High complexity
npx jscpd lib/ app/ components/              # Duplication detection
npx ts-prune                                 # Unused exports

# Find Issues
grep -r ": any" lib/ app/ --include="*.ts"   # any types
grep -r "console\." lib/ app/                # console.log
grep -r "TODO\|FIXME" lib/ app/              # TODOs

# Performance
pnpm build              # Build for production
npx @next/bundle-analyzer  # Bundle analysis

# Accessibility
npx lighthouse https://localhost:3000 --only-categories=accessibility
```

---

#### F.2 Critical Files Reference

| File | Purpose | Review Priority |
|------|---------|----------------|
| [CLAUDE.md](../CLAUDE.md) | Project standards and guidelines | Critical |
| [lib/env.ts](../lib/env.ts) | Environment configuration and validation | Critical |
| [middleware.ts](../middleware.ts) | Global middleware (auth, CSRF, CSP) | Critical |
| [lib/api/route-handlers/](../lib/api/route-handlers/) | API route protection system | High |
| [lib/rbac/](../lib/rbac/) | Authorization system | High |
| [lib/logger/](../lib/logger/) | Logging system | High |
| [lib/security/](../lib/security/) | Security utilities | High |
| [lib/services/](../lib/services/) | Business logic | Medium |
| [components/ui/](../components/ui/) | Shared UI components | Medium |

---

#### F.3 Review Frequency

**Continuous (Automated):**
- Dependency vulnerability scanning (daily)
- Static analysis (on commit)
- Test coverage (on PR)
- Linting (on commit)

**Per Pull Request:**
- Code quality review
- Security review
- Accessibility check (if UI changes)
- Performance check (if significant changes)

**Weekly:**
- Dependency updates
- Quick code smell scan

**Monthly:**
- Manual security review
- Code duplication analysis
- Performance profiling
- Accessibility audit

**Quarterly:**
- Full security audit with penetration testing
- Architecture review
- Third-party security assessment

**Annually:**
- Comprehensive security assessment
- Code quality deep dive
- Technology stack review
- Training and standards update

---

## Conclusion

This guide provides a comprehensive framework for conducting security and code quality reviews of the BendCare OS application. By following these standards systematically, reviewers can ensure consistent, thorough evaluations that maintain the security, quality, and accessibility standards of the application.

**Key Takeaways:**

1. **Security First**: Always prioritize security vulnerabilities, especially authentication and authorization
2. **Type Safety**: Maintain strict TypeScript standards with no `any` types
3. **Code Quality**: Focus on maintainability, readability, and testability
4. **Accessibility**: Ensure WCAG 2.1 Level AA compliance
5. **Performance**: Leverage Next.js 15 features appropriately (Server Components, caching)
6. **Testing**: Maintain high coverage for critical paths
7. **Documentation**: Keep code self-documenting and well-commented

By conducting reviews at the recommended frequencies and addressing findings based on their priority scores, the team can maintain a secure, high-quality codebase that scales with the organization.

---

**Review Guide Version:** 2.0  
**Last Updated:** 2025-10-16  
**Next Review:** 2025-11-16
