# CLAUDE.md - Development Guide & Protocols

This file provides guidance to Claude Code when working with this repository.

---

# TIER 0: NON-NEGOTIABLE SAFETY PROTOCOLS

## Git Safety Protocol

**ABSOLUTE PROHIBITIONS - NO EXCEPTIONS:**

- **NEVER** use `git reset` (hard, soft, or any form) - FORBIDDEN
- **NEVER** use `git commit --no-verify` or `git commit -n`
- **NEVER** force push to main/master
- **NEVER** bypass pre-commit hooks under any circumstances
- **NEVER** skip hooks (`--no-verify`, `--no-gpg-sign`) unless explicitly requested
- **DO NOT** interact with git unless explicitly instructed
- **DO NOT** commit work without being told to do so
- **DO NOT** manually generate DDL migrations, always use drizzle-kit generate
- **Violation = Critical Safety Failure**

**Hook Failure Response (MANDATORY):**

1. Read error messages thoroughly
2. Fix all reported issues (linting, formatting, types)
3. Stage fixes: `git add <fixed-files>`
4. Commit again (hooks run automatically)
5. **NEVER use `--no-verify`** - non-compliance is unacceptable

**Commit Format** (only when explicitly requested):
```bash
git commit -m "$(cat <<'EOF'
Commit message here - focus on "why" not "what"

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## No Deviation Protocol

**ABSOLUTE PROHIBITIONS - NO EXCEPTIONS:**

- **NEVER** switch to alternative solutions when encountering issues
- **NEVER** take "the easy way out" by choosing different technologies/approaches
- **NEVER** substitute requested components without explicit user approval
- **MUST** fix the EXACT issue encountered, not work around it
- **Violation = Critical Task Failure**

**When Encountering Issues (MANDATORY):**

1. **STOP** - Do not proceed with alternatives
2. **DIAGNOSE** - Read error messages thoroughly, identify root cause
3. **FIX** - Resolve the specific issue with the requested technology/approach
4. **VERIFY** - Confirm the original request now works
5. **NEVER** suggest alternatives unless fixing is genuinely impossible

**Examples of PROHIBITED behavior:**
- ❌ "Let me use a different library instead of fixing this one"
- ❌ "Let me switch to REST instead of fixing the RBAC wrapper"
- ❌ "Let me use console.log instead of fixing the logger import"

**Required behavior:**
- ✅ "RBAC wrapper error: [X]. Fixing by [Y]"
- ✅ "Logger import issue: [X]. Resolving with [Y]"
- ✅ "TypeScript error: [X]. Debugging and fixing [Y]"

---

# TIER 1: CRITICAL PROTOCOLS (ALWAYS REQUIRED)

## Protocol 1: Root Cause Analysis

**BEFORE implementing ANY fix:**

- **MUST** apply "5 Whys" methodology - trace to root cause, not symptoms
- **MUST** search entire codebase for similar patterns using Grep/Glob tools
- **MUST** fix ALL affected locations, not just discovery point
- **MUST** document: "Root cause: [X], affects: [Y], fixing: [Z]"

**NEVER:**
- Fix symptoms without understanding root cause
- Declare "Fixed!" without codebase-wide search
- Use try-catch to mask errors without fixing underlying problem
- Guess or make assumptions without verification

---

## Protocol 2: Scope Completeness

**BEFORE any batch operation:**

- **MUST** use Glob tool with comprehensive patterns to find ALL matching items
- **MUST** list all items explicitly: "Found N items: [list]"
- **MUST** check multiple locations (root, subdirectories, nested paths)
- **MUST** verify completeness: "Processed N/N items"

**NEVER:**
- Process only obvious items
- Assume first search captured everything
- Declare complete without explicit count verification

---

## Protocol 3: Verification Loop

**MANDATORY validation after ANY code changes:**

```
1. Make change
2. Run `pnpm tsc` IMMEDIATELY (fix TypeScript errors)
3. Run `pnpm lint` IMMEDIATELY (fix linting errors)
4. Analyze failures
5. IF failures exist: fix and GOTO step 1
6. ONLY declare complete when ALL checks pass
```

**Completion criteria (ALL must be true):**
- ✅ `pnpm tsc` passes with no errors
- ✅ `pnpm lint` passes with no errors
- ✅ All relevant tests passing
- ✅ Verified in running environment (if applicable)
- **MUST** fix ALL failures before declaring complete, even if they existed before your changes

**ABSOLUTE PROHIBITIONS:**

- **NEVER** dismiss test failures as "pre-existing issues unrelated to changes"
- **NEVER** dismiss linting errors as "pre-existing issues unrelated to changes"
- **NEVER** ignore ANY failing test or linting issue, regardless of origin
- **NEVER** skip running `pnpm tsc` and `pnpm lint` after changes
- **Rationale**: Code quality is a collective responsibility. All failures block completion.

---

# TIER 2: IMPORTANT PROTOCOLS

## Protocol 4: Design Consistency

**BEFORE implementing any UI:**

- **MUST** study 3-5 existing similar pages/components using Read tool
- **MUST** extract patterns: colors, typography, components, layouts
- **MUST** reuse existing components (create new ONLY if no alternative)
- **MUST** compare against mockups if provided
- **MUST** document: "Based on [pages], using pattern: [X]"

**NEVER:**
- Use generic defaults or placeholder colors
- Deviate from mockups without explicit approval
- Create new components without checking existing ones first

---

## Protocol 5: Requirements Completeness

**For EVERY feature, verify ALL layers:**

```
UI Fields → API Endpoint → Validation → Business Logic → Database Schema
```

**BEFORE declaring complete:**

- **MUST** verify each UI field has corresponding:
  - API parameter
  - Validation rule
  - Business logic handler
  - Database column (correct type)
- **MUST** test end-to-end with realistic data

**NEVER:**
- Implement UI without checking backend support
- Change data model without database migration
- Skip any layer in the stack

---

## Protocol 6: API Route Security

**CRITICAL**: All API routes MUST use security wrapper functions. Direct route exports are FORBIDDEN.

**Three wrappers (from `@/lib/api/route-handlers`):**

1. **`rbacRoute`** - Permission-based (default for business logic)
   - Use for all business operations requiring specific permissions
   - Format: `permission: 'resource:action:scope'`
   - Example: `'users:read:all'`, `'analytics:create:organization'`

2. **`authRoute`** - Authentication without RBAC
   - Use for auth system routes (MFA, profile, sessions)
   - Provides session context without permission checks

3. **`publicRoute`** - No authentication
   - Use for public endpoints only (health checks, CSRF tokens, login)

**BEFORE creating/modifying any API route:**
- **MUST** determine which wrapper to use
- **MUST** include appropriate `rateLimit` option: `'auth'`, `'api'`, or `'upload'`
- **NEVER** export route handlers directly without wrappers
- **Exception**: Only `/api/auth/refresh` and `/api/auth/logout` may skip wrappers

**Rate Limit Options**:
- `auth`: 10 req/min (authentication endpoints)
- `api`: 100 req/min (standard operations)
- `upload`: 20 req/min (file uploads)

**Implementation Examples**:

```typescript
// 1. rbacRoute - Permission-based (most common)
import { rbacRoute } from '@/lib/api/route-handlers';
import type { UserContext } from '@/lib/types/rbac';

const handler = async (request: NextRequest, userContext: UserContext) => {
  // Access: userContext.user_id, userContext.roles, userContext.all_permissions
  // userContext.is_super_admin, userContext.current_organization_id
  return NextResponse.json({ data });
};

export const GET = rbacRoute(handler, {
  permission: 'users:read:all',  // Single permission
  rateLimit: 'api',
});

// Multiple permissions (user needs ANY)
export const POST = rbacRoute(handler, {
  permission: ['users:create:all', 'users:create:organization'],
  rateLimit: 'api',
});

// Require ALL permissions
export const PUT = rbacRoute(handler, {
  permission: ['users:update:all', 'users:update:sensitive'],
  requireAllPermissions: true,
  rateLimit: 'api',
});

// 2. authRoute - Authentication without RBAC
import { authRoute } from '@/lib/api/route-handlers';
import type { AuthSession } from '@/lib/api/route-handlers';

const handler = async (request: NextRequest, session?: AuthSession) => {
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Access: session.user.id, session.user.email, session.accessToken
  return NextResponse.json({ data });
};

export const GET = authRoute(handler, { rateLimit: 'api' });

// 3. publicRoute - No authentication
import { publicRoute } from '@/lib/api/route-handlers';

const handler = async (request: NextRequest) => {
  return NextResponse.json({ status: 'ok' });
};

export const GET = publicRoute(
  handler,
  'Health check endpoint for monitoring tools',
  { rateLimit: 'api' }
);
```

---

# TIER 3: STANDARD PROTOCOLS

## Protocol 7: TypeScript Strictness

**ABSOLUTE RULES:**

- **FORBIDDEN**: The `any` type under all circumstances
- **REQUIRED**: Strict mode compliance (`strictNullChecks`, `noUncheckedIndexedAccess`)
- **MUST** report any `any` types found in existing code to user
- **MUST** fix type issues properly, never use type assertions as shortcuts

---

## Protocol 8: Logging System

**CRITICAL**: Custom logging wrapper at `lib/logger/index.ts` - server-side only.

**RULES:**

- **MUST** use `import { log } from '@/lib/logger'` in server code
- **FORBIDDEN**: Client-side imports of `@/lib/logger` (enforced by custom lint rule)
- **FORBIDDEN**: `console.*` statements (use logging wrapper instead)
- **NEVER**: Use external logging libraries (Pino, Winston)

**Basic Logging Patterns:**
```typescript
import { log, correlation } from '@/lib/logger';

// Basic logging
log.info('Operation completed', { data });
log.error('Operation failed', error, { context });

// API routes with correlation ID
export const POST = async (request: NextRequest) => {
  return correlation.withContext(
    correlation.generate(),
    { method: request.method, path: new URL(request.url).pathname },
    async () => {
      log.api('Request started', request);
      // ... handler logic
      log.api('Request completed', request, 200, duration);
      return NextResponse.json(result);
    }
  );
};

// Specialized logging
log.auth('login', true, { userId, method: 'saml' });
log.security('rate_limit_exceeded', 'high', { blocked: true });
log.db('SELECT', 'users', duration, { recordCount });
```

**Enriched Logging Patterns:**
```typescript
import { log, SLOW_THRESHOLDS, logTemplates, calculateChanges } from '@/lib/logger';

// Success log with rich context
log.info('operation completed - summary', {
  operation: 'list_users',  // Required: unique operation ID
  userId: userContext.user_id,
  results: { returned: 25, total: 100, page: 1 },
  duration,
  slow: duration > SLOW_THRESHOLDS.API_OPERATION,
  component: 'api',  // Required for CloudWatch filtering
});

// CRUD operations with templates
const template = logTemplates.crud.create('user', {
  resourceId: String(newUser.user_id),
  resourceName: newUser.email,
  userId: userContext.user_id,
  duration,
});
log.info(template.message, template.context);

// UPDATE with change tracking
const changes = calculateChanges(existingUser, updatedData);
const template = logTemplates.crud.update('user', {
  resourceId: String(user.user_id),
  userId: userContext.user_id,
  changes,
  duration,
});
log.info(template.message, template.context);
```

**Slow Thresholds:**
- `DB_QUERY`: 500ms (detect missing indexes)
- `API_OPERATION`: 1000ms (user experience threshold)
- `AUTH_OPERATION`: 2000ms (password hashing, MFA)

**What NOT to Log:**
- ❌ Verbose intermediate logs (rate limit check, validation, etc.)
- ❌ Debug console.log statements
- ✅ One comprehensive final log per operation

**Features:**
- Automatic context capture (file, line, function)
- Correlation ID tracking across requests
- PII sanitization (emails, SSNs, credit cards, UUIDs)
- Production sampling (INFO: 10%, DEBUG: 1%)
- CloudWatch Logs integration

---

## Protocol 9: Testing Quality

**Test Quality Standards:**

- **MUST** test real code and add value, not "testing theater"
- **MUST** analyze test failures: is code wrong, test wrong, or requirement changed?
- **DO NOT** blindly modify tests to make them pass
- **NEVER** create stub/mock tests except for: slow external APIs, databases
- **NEVER** create tests solely to meet coverage metrics
- **Priority**: Quality code over 100% pass rate

---

# PROJECT-SPECIFIC TECHNICAL REFERENCE

## Tech Stack

- **Application**: Next.js 15, Node.js 24, React 19, TypeScript 5.9 (strict mode)
- **Infrastructure**: AWS ECS Fargate, PostgreSQL 17 (RDS), AWS Elasticache (Valkey/Redis)
- **Database**: Drizzle ORM 0.44 with modular schema architecture
- **Linting**: Biome 2.2 (linter + formatter), custom logger lint rule
- **Testing**: Vitest 3.2 with React Testing Library
- **Package Manager**: pnpm

## Essential Commands

```bash
# Development
pnpm dev              # Start dev server (port 4001)
pnpm dev:turbo        # Start with Turbopack (faster)

# Validation (REQUIRED after changes)
pnpm tsc              # Type check (MUST pass)
pnpm lint             # Lint check (MUST pass)
pnpm lint:fix         # Auto-fix linting issues

# Testing
pnpm test             # Run all tests
pnpm test:run         # Run once and exit
pnpm test:watch       # Watch mode

# Database
pnpm drizzle-kit migrate     # Run pending migrations
pnpm drizzle-kit generate    # Generate migration from schema

# Build
pnpm build            # Production build
```

## Critical Architecture Patterns

### 1. Database Schema (Modular)

**Location**: `lib/db/schema.ts` (re-exports from modular schema files)

**Import pattern** (REQUIRED):
```typescript
import { users, roles, permissions } from '@/lib/db/schema';
// NEVER import from individual schema files directly
```

**Key schema files**: `rbac-schema.ts`, `analytics-schema.ts`, `work-item-schema.ts`, etc.

### 2. Environment Variables

**Validation**: T3 Env + Zod schema in `lib/env.ts`

**Required variables**:
- `DATABASE_URL` - PostgreSQL connection
- `JWT_SECRET`, `JWT_REFRESH_SECRET` - Min 32 chars
- `CSRF_SECRET` - Min 32 chars
- `APP_URL`, `NEXT_PUBLIC_APP_URL` - Application URLs

**Optional**: S3 storage (`S3_PUBLIC_*`, `S3_PRIVATE_*`), Auth providers (`ENTRA_*`, `OIDC_*`)

### 3. RBAC System

**Permission format**: `resource:action:scope`
- Resources: `users`, `practices`, `analytics`, `work_items`, `roles`
- Actions: `read`, `create`, `update`, `delete`, `manage`
- Scopes: `all`, `organization`, `own`

**Caching**: User context cached in Redis with automatic invalidation.

**Server-side checks**: `lib/rbac/server-permission-service.ts`

### 4. S3 File Storage

**Architecture**: Two separate S3 systems with shared utilities for consistency.

**Systems**:
1. **Public Assets** (`lib/s3/public-assets/`) - CDN-backed public files
2. **Private Assets** (`lib/s3/private-assets/`) - Secure files with presigned URLs
3. **Shared** (`lib/s3/shared/`) - Common types and sanitization functions

#### Private Assets (Secure Files)

**Use cases**: Work item attachments, invoices, reports, user documents, any sensitive files requiring access control.

**Pattern**: Two-step upload with presigned URLs (client uploads directly to S3, bypassing server).

```typescript
import {
  generateS3Key,
  generateUploadUrl,
  generateDownloadUrl,
  deleteFile
} from '@/lib/s3/private-assets';

// 1. Generate S3 key with consistent pattern
const s3Key = generateS3Key(
  ['work-items', workItemId, 'attachments'],  // Path segments
  fileName                                     // Original filename
);
// => 'work-items/abc-123/attachments/document_k3j2h4g5.pdf'

// 2. Generate presigned upload URL (1 hour expiration, with size limit)
const { uploadUrl, bucket } = await generateUploadUrl(s3Key, {
  contentType: 'application/pdf',
  expiresIn: 3600,  // 1 hour
  maxFileSize: 50 * 1024 * 1024,  // 50MB limit for documents
  metadata: {
    resource_type: 'work_item_attachment',
    resource_id: workItemId,
    uploaded_by: userId,
  }
});

// 3. Return uploadUrl to client (client uploads directly to S3)

// 4. Generate presigned download URL (15 min expiration)
const { downloadUrl } = await generateDownloadUrl(s3Key, {
  fileName: 'document.pdf',
  expiresIn: 900,  // 15 minutes
  disposition: 'attachment',
});
```

**Resource Type Patterns**:
```typescript
// Work item attachments
['work-items', workItemId, 'attachments']
// => 'work-items/abc-123/attachments/file_xyz.pdf'

// Invoices by organization and period
['invoices', orgId, '2024', 'january']
// => 'invoices/org-456/2024/january/invoice_xyz.pdf'

// User documents (nested structure)
['users', userId, 'documents', 'licenses']
// => 'users/user-456/documents/licenses/license_xyz.jpg'
```

**Security**:
- ✅ Short-lived presigned URLs (15 min download, 1 hour upload)
- ✅ Server-side RBAC checks required before URL generation
- ✅ Path traversal prevention via sanitization
- ✅ MIME type whitelist (blocks executables, scripts)
- ✅ File size limits by type (50MB images/documents, 100MB archives/default)

**File Upload Constraints**:
```typescript
import { FILE_SIZE_LIMITS, ALLOWED_MIME_TYPES } from '@/lib/s3/private-assets';

// File size limits by category
FILE_SIZE_LIMITS.image      // 50MB
FILE_SIZE_LIMITS.document   // 50MB
FILE_SIZE_LIMITS.archive    // 100MB
FILE_SIZE_LIMITS.default    // 100MB

// Allowed MIME types (whitelist)
ALLOWED_MIME_TYPES.has('application/pdf')        // ✅ true
ALLOWED_MIME_TYPES.has('image/jpeg')             // ✅ true
ALLOWED_MIME_TYPES.has('application/x-msdownload') // ❌ false (executables blocked)
```

#### Public Assets (CDN Files)

**Use cases**: Practice logos, user avatars, hero images, static assets.

**Pattern**: Server-side buffer upload, returns CloudFront CDN URL.

```typescript
import { generateS3Key, uploadToS3, deleteFromS3 } from '@/lib/s3/public-assets';

// Generate S3 key (same pattern as private assets)
const s3Key = generateS3Key(['practices', practiceId, 'logo'], 'logo.jpg');

// Upload file buffer
const buffer = await file.arrayBuffer().then(ab => Buffer.from(ab));
const { fileUrl, size } = await uploadToS3(buffer, s3Key, {
  contentType: 'image/jpeg',
  cacheControl: 'public, max-age=31536000, immutable',  // 1 year
});

// Returns: { fileUrl: 'https://cdn.bendcare.com/practices/123/logo/logo_xyz.jpg' }
```

**Configuration**:
```bash
# Private Assets (required for attachments)
S3_PRIVATE_REGION=us-east-1
S3_PRIVATE_ACCESS_KEY_ID=AKIA...
S3_PRIVATE_SECRET_ACCESS_KEY=secret...
S3_PRIVATE_BUCKET=bcos-private-assets

# Public Assets (required for logos/avatars)
S3_PUBLIC_REGION=us-east-1
S3_PUBLIC_ACCESS_KEY_ID=AKIA...
S3_PUBLIC_SECRET_ACCESS_KEY=secret...
S3_PUBLIC_BUCKET=bcos-public-assets
CDN_URL=https://cdn.bendcare.com
```

### 5. Confirmation Modals

**NEVER** use native `window.confirm()` for destructive actions.

**MUST** use `DeleteConfirmationModal` component from `@/components/delete-confirmation-modal`.

**Basic Usage**:
```typescript
import DeleteConfirmationModal from '@/components/delete-confirmation-modal';

const [deleteModalOpen, setDeleteModalOpen] = useState(false);
const [itemToDelete, setItemToDelete] = useState<Item | null>(null);

// On delete button click
<button onClick={() => {
  setItemToDelete(item);
  setDeleteModalOpen(true);
}}>Delete</button>

// Render modal
{itemToDelete && (
  <DeleteConfirmationModal
    isOpen={deleteModalOpen}
    setIsOpen={setDeleteModalOpen}
    title="Delete Item"
    itemName={itemToDelete.name}
    message="This action cannot be undone."
    confirmButtonText="Delete Item"
    onConfirm={async () => await handleDelete(itemToDelete.id)}
  />
)}
```

**For DataTable dropdown actions**:
```typescript
// Use confirmModal (preferred over confirm)
const dropdownActions = (item: User) => [
  {
    label: 'Delete',
    variant: 'danger',
    onClick: handleDelete,
    confirmModal: {  // ✅ Custom modal
      title: 'Delete User',
      message: 'This action cannot be undone.',
      confirmText: 'Delete User',
    },
    // confirm: 'Are you sure?'  // ❌ Deprecated (native browser dialog)
  }
];
```

## File Naming Standards

- **DO NOT**: Use adjectives or buzzwords ("enhanced", "optimized", "new", "updated")
- **DO**: Name files plainly and descriptively
- Focus on what the file does, not marketing language

---

# CONSOLIDATED VERIFICATION CHECKLIST

## Before Starting Any Work

- [ ] Searched for existing patterns/components using Glob/Grep?
- [ ] Listed ALL items in scope with explicit count?
- [ ] Understood full stack impact (UI → API → DB)?
- [ ] Identified root cause (not just symptom)?
- [ ] All assumptions clarified with user?

## Before Declaring Complete

- [ ] Ran `pnpm tsc` and it passes with no errors?
- [ ] Ran `pnpm lint` and it passes with no errors?
- [ ] All relevant tests passing?
- [ ] Verified in running environment (if applicable)?
- [ ] Fixed ALL related issues (searched codebase)?
- [ ] Updated ALL affected layers (UI → API → DB)?
- [ ] No `any` types introduced?
- [ ] Used correct security wrappers for API routes?
- [ ] Used logger wrapper (not console.*)?
- [ ] Pre-commit hooks will NOT be bypassed?

## Never Do

- ❌ Use `git reset` or `--no-verify` flags
- ❌ Switch to alternatives when encountering issues
- ❌ Fix symptoms without root cause analysis
- ❌ Declare complete without running `pnpm tsc && pnpm lint`
- ❌ Dismiss failures as "pre-existing issues"
- ❌ Use generic designs instead of existing patterns
- ❌ Skip layers in the stack (UI → API → DB)
- ❌ Export API routes without security wrappers
- ❌ Use `any` type or client-side logger imports
- ❌ Use `console.*` or `window.confirm()`
- ❌ Defer work without approval


## Always Do

- ✅ Search entire codebase for similar issues using Grep/Glob
- ✅ List ALL items before processing (with count)
- ✅ Run `pnpm tsc && pnpm lint` after changes, fix ALL errors
- ✅ Fix the EXACT issue, never switch technologies
- ✅ Study existing patterns before implementing (Read tool)
- ✅ Trace through entire stack (UI → API → DB)
- ✅ Use `rbacRoute`, `authRoute`, or `publicRoute` wrappers
- ✅ Import from `@/lib/db/schema` (not individual schema files)
- ✅ Use `log` from `@/lib/logger` (server-side only)
- ✅ Follow Git Safety Protocol strictly

---

# META-PATTERN: THE FIVE COMMON MISTAKES

1. **Premature Completion**: Saying "Done!" without running `pnpm tsc && pnpm lint`
   - **Fix**: Always run validation and include results

2. **Missing Systematic Inventory**: Processing obvious items, missing edge cases
   - **Fix**: Use Glob patterns, list ALL items with count

3. **Insufficient Research**: Implementing without studying existing patterns
   - **Fix**: Use Read tool on 3-5 examples first, extract patterns

4. **Incomplete Stack Analysis**: Fixing one layer, missing others
   - **Fix**: Trace through UI → API → DB, update ALL layers

5. **Not Following Established Patterns**: Creating new when patterns exist
   - **Fix**: Search for existing patterns/components first (Grep/Glob)

---

# WORKFLOW STANDARDS

## Pre-Task Requirements

- **ALWAYS** ask clarifying questions when requirements ambiguous
- **ALWAYS** aim for complete clarity before execution
- **NEVER** assume or fabricate information

## Communication Style

- **NEVER** use flattery ("Great idea!", "Excellent!")
- **ALWAYS** provide honest, objective feedback
- **NEVER** use emojis unless explicitly requested
- **Rationale**: Value through truth, not validation

## Quality Over Speed

- **DO NOT** take shortcuts for speed
- **Speed is NOT the priority** - high quality code is the priority
- **ALWAYS** prioritize correctness and maintainability

---

# PROTOCOL USAGE GUIDE

## When to Reference Specific Protocols

- **ANY task** → Git Safety + No Deviation (Tier 0 - ALWAYS)
- **Fixing bugs** → Root Cause Analysis (Tier 1)
- **Batch operations** → Scope Completeness (Tier 1)
- **After ANY changes** → Verification Loop (Tier 1 - REQUIRED)
- **UI work** → Design Consistency (Tier 2)
- **Feature development** → Requirements Completeness (Tier 2)
- **API routes** → API Route Security (Tier 2)
- **All code** → TypeScript Strictness (Tier 3)
- **Server code** → Logging System (Tier 3)
- **Testing** → Testing Quality (Tier 3)

## Integration Approach

1. **Tier 0 protocols**: ALWAYS enforced, no exceptions
2. **Tier 1 protocols**: ALWAYS apply before/during/after work
3. **Tier 2 protocols**: Apply when context matches
4. **Tier 3 protocols**: Apply as needed for specific scenarios

**Solution Pattern**:
- **Before starting** → Research & Inventory (Protocols 1, 2, 4)
- **During work** → Follow established patterns (Protocols 5, 6, 7, 8, 9)
- **After finishing** → Verify & Iterate (Protocol 3 - MANDATORY)

---

# KEY PRINCIPLES

1. **Security First**: Always prioritize security in all decisions
2. **Type Safety**: Strict TypeScript, no `any` types
3. **Quality Over Speed**: Take time to do things correctly
4. **Validation Required**: `pnpm tsc && pnpm lint` after ANY changes
5. **Pattern Reuse**: Study existing code before creating new
6. **Full Stack Awareness**: Consider UI → API → DB for all features
7. **Clean Git History**: No destructive operations, no hook bypassing
8. **Explicit Actions**: Only commit when explicitly instructed
