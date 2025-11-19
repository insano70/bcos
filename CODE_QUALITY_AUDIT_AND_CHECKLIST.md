# Deep Code Quality Audit & Review Checklist
**Version:** 2.0  
**Date:** November 19, 2025  
**Target Stack:** Next.js 15 (App Router) | PostgreSQL (Drizzle ORM) | AWS (CDK) | TypeScript

This document serves as a comprehensive guide for performing a "Level 3" code quality and security review. It is designed to enable any developer to audit code with the rigor of a principal engineer.

---

## 📋 Part 1: The Audit Checklist

### 1. 🏗️ Architecture & Structural Integrity

#### Directory & Organization
- [ ] **Feature Colocation:** Verify that all related files (components, hooks, utils, styles, tests) for a specific feature are colocated in the same directory (e.g., `app/(dashboard)/billing/`) rather than scattered by file type.
- [ ] **Private Folder Enforcement:** Ensure internal implementation details that are not routes are prefixed with `_` (e.g., `_components/`) to explicitly opt-out of routing.
- [ ] **Route Group Organization:** Check for logical grouping using `(groupName)` folders to organize layouts without affecting URL paths (e.g., `(auth)`, `(dashboard)`).
- [ ] **Strict Layer Separation:**
    - **UI Layer:** `app/`, `components/` (Only display logic).
    - **Business Logic Layer:** `lib/services/`, `lib/actions/` (Pure functions, no UI code).
    - **Data Layer:** `lib/db/` (Schema, raw queries).
    - *Violation Check:* Do you see database calls directly inside UI components? (Move to Server Actions/Services).

#### Component Composition
- [ ] **Server Component Default:** Verify components are Server Components by default. `use client` should only be present at the leaves of the component tree (buttons, inputs, interactive elements).
- [ ] **Prop Drilling vs. Composition:** Identify props passed down >2 levels. Refactor using *Component Composition* (passing `children` or slots) instead of Context where possible to prevent unnecessary re-renders.
- [ ] **Barrel File Usage:** Audit `index.ts` usage. Ensure they are not causing circular dependencies or blowing up bundle sizes by re-exporting unused heavy modules.

### 2. 🔒 Security (Deep Dive)

#### Authentication & Authorization (AuthN/AuthZ)
- [ ] **Middleware Boundary:** Verify `middleware.ts` explicitly defines *protected* vs. *public* routes. Default should be "deny all" with an allowlist for public paths.
- [ ] **RBAC Enforcement:**
    - Check that permission checks occur **twice**:
        1.  **UI Level:** To hide/show elements.
        2.  **Data Level:** Inside every Server Action or API route (using `rbacRoute` wrapper).
    - *Critical:* Verify tenant isolation. Ensure every query includes a `where(eq(table.tenantId, currentTenantId))` check.
- [ ] **Session Security:**
    - Confirm session cookies have `Secure`, `HttpOnly`, `SameSite=Lax` (or Strict) attributes.
    - Verify minimal session payload (store only User ID/Role, fetch rest from DB) to avoid stale data in cookies.

#### Input Validation & Sanitization
- [ ] **Zod Schema Strictness:**
    - Ensure *every* Server Action/API Route input is parsed with `zod` (using `validateRequest` or `validateQuery`).
    - Check for `strip()` or strict mode in schemas to silently drop unknown fields.
    - Verify string limits (`.min()`, `.max()`) are enforced on all text inputs to prevent buffer overflows/DoS.
- [ ] **XSS Prevention:**
    - Grep for `dangerouslySetInnerHTML`. If present, verify usage of `SafeHtmlRenderer` or `sanitizeHtml`.
    - Verify no user input is reflected directly into `href` attributes (prevents `javascript:` execution).
- [ ] **CSRF (Cross-Site Request Forgery):**
    - Next.js Server Actions handle this automatically, *but* if standard API Routes (`route.ts`) are used for mutations, verify `requiresCSRFProtection` is active (handled by `middleware.ts` in this codebase).

#### AWS Infrastructure Security (CDK)
- [ ] **IAM Principle of Least Privilege:**
    - Audit `infrastructure/` stacks. Ensure Lambdas/Containers have granular permissions (e.g., `s3:GetObject` on specific bucket) rather than `s3:*` or `AdministratorAccess`.
- [ ] **WAF Configuration:**
    - Verify Web Application Firewall rules are active for SQL injection, XSS, and rate limiting.
- [ ] **Secrets Management:**
    - **Zero Hardcoded Secrets:** Scan for keys, tokens, or passwords in code.
    - Verify secrets are injected at runtime via AWS Parameter Store/Secrets Manager and mapped to `process.env`.

### 3. 🐘 Database & Data Integrity (PostgreSQL + Drizzle)

#### Performance & Indexing
- [ ] **Index Coverage:**
    - Check every `where`, `orderBy`, and `join` column. Does an index exist in `schema.ts`?
    - Verify composite indexes are created for multi-column queries (e.g., `tenantId` + `status`).
- [ ] **N+1 Query Prevention:**
    - Audit loops in Server Components. Are you querying the DB inside a `map()`?
    - *Fix:* Use `inArray` queries (e.g., `getBatchMemberCounts`) or Drizzle's `with: { related: true }`.
- [ ] **Select Specificity:**
    - Banish `select *`. Ensure queries select only specific fields (e.g., `.select({ id: users.id })`) to reduce payload size and memory usage.

#### Reliability & Safety
- [ ] **Transaction Boundaries:**
    - Logical units of work (e.g., "Create Order" + "Decrement Inventory") MUST be wrapped in `db.transaction()`.
- [ ] **Connection Pooling:**
    - Verify usage of connection pooling if high concurrency is expected.

### 4. 💎 Code Quality & TypeScript Standards

#### Type Safety
- [ ] **No Explicit Any:** Strictly enforce `noExplicitAny: error`.
    - If a type is unknown, use `unknown` and narrow it with Zod or type guards.
- [ ] **Strict Null Checks:** Verify optional chaining (`?.`) usage. Ensure developers are handling `null`/`undefined` cases explicitly.
- [ ] **Return Type Annotation:** Public functions and API endpoints should have explicit return types to prevent accidental data leaks.

#### Linter & Formatter
- [ ] **Biome Compliance:**
    - Ensure `biome check` passes without warnings.
- [ ] **No Console Logs:** Ensure no `console.log` remains in production code. Use `log.info` or `log.error` from `@/lib/logger`.

### 5. ⚡ Performance Optimization

#### Core Web Vitals
- [ ] **Image Optimization:**
    - Verify `next/image` usage with explicit `sizes` prop for responsive loading.
    - Check for `priority` prop on LCP (Largest Contentful Paint) images.
- [ ] **Font Loading:**
    - Confirm `next/font` is used (variable fonts preferred) to prevent layout shifts (CLS).
- [ ] **Bundle Analysis:**
    - Check for large library imports (e.g., importing all of `lodash` vs `lodash/debounce`).

#### React Rendering
- [ ] **Memoization Strategy:**
    - Audit `useMemo`/`useCallback`. Are they optimizing expensive calculations or just adding overhead?
- [ ] **Suspense & Streaming:**
    - Verify usage of `<Suspense>` boundaries around slow fetching components.

### 6. 🧪 Testing & Reliability

#### Strategy (Vitest)
- [ ] **Isolation:** Tests must not depend on global state or run order.
- [ ] **Factory Pattern:** Verify use of factories (e.g., `UserFactory.create()`) instead of hardcoded JSON fixtures.
- [ ] **Integration Focus:**
    - Prioritize testing *User Flows* (Server Actions + Database) over testing internal implementation details.

---

## 📊 Part 2: Current Audit Findings (November 19, 2025)

### Executive Summary
The codebase demonstrates a **high level of maturity**, particularly in Security, Architecture, and Pattern Standardization. The backend follows strict RBAC, Validation, and Logging patterns. However, **Code Hygiene** (specifically logging and legacy types) needs attention.

### ✅ Strengths
1.  **Robust Security Architecture:**
    -   Middleware (`middleware.ts`) handles CSRF, Auth, Headers, and Routing comprehensively.
    -   API Routes use standardized wrappers (`rbacRoute`, `publicRoute`) ensuring consistent permission checks.
    -   Input validation is standardized using `zod` and `validateRequest`.
2.  **Performance Awareness:**
    -   Explicit batching patterns found (`batchGetUserRoles`, `getBatchEnrichmentData`) to prevent N+1 issues.
    -   Structured logging includes timing execution duration.
3.  **Sanitization:**
    -   Custom `SafeHtmlRenderer` correctly wraps `dangerouslySetInnerHTML` with `dompurify` sanitization.

### ⚠️ Areas for Improvement (Action Items)

#### 1. Console Logging (High Priority for Hygiene)
-   **Finding:** Over **1,300** instances of `console.log` found in the codebase.
-   **Risk:** Clutters production logs, potentially leaks info (if not stripped), makes debugging harder.
-   **Recommendation:** Replace with `log.info`, `log.debug` from `@/lib/logger` or `debugLog` from `@/lib/utils/debug`.
-   **Action:** Run a cleanup script to migrate or remove `console.log` usage, especially those marked `// TEST:`.

#### 2. `any` Type Usage (Medium Priority)
-   **Finding:** Approximately **72** instances of `: any` usage found.
-   **Risk:** Defeats TypeScript's purpose, potential for runtime errors.
-   **Locations:** Mostly in `templates/` and some documentation, but some in component props.
-   **Action:** Systematically replace `any` with specific interfaces or `unknown` + Zod schemas.

#### 3. Documentation for Junior Devs (Medium Priority)
-   **Finding:** The codebase uses sophisticated patterns (Factories, Service Layers, Route Wrappers).
-   **Risk:** Junior developers might bypass these if not documented (e.g., writing a raw route handler instead of using `rbacRoute`).
-   **Action:** Create a "How to Build an API Route" guide that explicitly requires the `rbacRoute` wrapper and `zod` validation.

#### 4. Test Cleanup (Low Priority)
-   **Finding:** Some tests contain commented-out console logs and experimental code.
-   **Action:** Enforce "clean code" standards in tests as strictly as production code.

### Scorecard
| Category | Status | Notes |
|----------|--------|-------|
| **Security** | 🟢 **Excellent** | Strong RBAC, CSRF, Sanitization. |
| **Architecture** | 🟢 **Good** | Clean separation, Server Components used well. |
| **Performance** | 🟢 **Good** | N+1 awareness, Batching patterns present. |
| **Code Hygiene** | 🔴 **Needs Work** | Excessive `console.log`, stray `any` types. |
| **Testing** | 🟡 **Adequate** | Tests exist but need cleanliness review. |

