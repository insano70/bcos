# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Tech Stack

**Application**: Next.js 15, Node.js 24, React 19, TypeScript 5.9 (strict mode)
**Infrastructure**: AWS ECS Fargate, PostgreSQL 17 (RDS), AWS Elasticache (Valkey/Redis)
**Database**: Drizzle ORM 0.44 with modular schema architecture
**Linting**: Biome 2.2 (linter + formatter), custom logger lint rule
**Testing**: Vitest 3.2 with React Testing Library, parallel test execution
**Package Manager**: pnpm

## Commands

### Development
```bash
pnpm dev              # Start dev server on port 4001
pnpm dev:turbo        # Start dev with Turbopack (faster)
pnpm dev:warm         # Start dev with cache warming
```

### Type Checking & Linting
```bash
pnpm tsc              # Type check entire codebase
pnpm lint             # Run Biome + custom logger lint
pnpm lint:biome       # Run Biome only
pnpm lint:logger      # Check for server logger in client files
pnpm lint:fix         # Auto-fix Biome issues
pnpm format           # Format code with Biome
pnpm check            # Lint + format (auto-fix)
```

**REQUIRED**: After any code changes, run `pnpm tsc` AND `pnpm lint`. Fix all errors before proceeding, even unrelated ones.

### Testing
```bash
# Run tests
pnpm test                    # All tests (parallel)
pnpm test:run                # Run once and exit
pnpm test:watch              # Watch mode
pnpm test:ui                 # Vitest UI

# Specific suites
pnpm test:unit               # Unit tests only
pnpm test:integration        # Integration tests
pnpm test:api                # API route tests
pnpm test:rbac               # RBAC permission tests
pnpm test:saml               # SAML authentication tests
pnpm test:e2e                # End-to-end tests

# Coverage
pnpm test:coverage           # Generate coverage report
pnpm test:coverage:ui        # Coverage with UI

# Performance
pnpm test:parallel           # Parallel execution
pnpm test:parallel:max       # Max parallelism (8 workers)
pnpm test:sequential         # Sequential (debugging)

# Single test file
vitest run path/to/test.ts
```

### Database
```bash
pnpm db:migrate              # Run pending migrations
pnpm db:generate             # Generate new migration from schema
pnpm db:validate             # Validate migration integrity
pnpm db:push                 # Push schema directly (dev only)
pnpm db:seed                 # Seed database with test data
pnpm db:psql                 # Connect to PostgreSQL
pnpm db:check                # Test database connection
```

### Build & Deploy
```bash
pnpm build                   # Production build (validates env first)
pnpm start                   # Start production server
```

## Architecture

### Modular Database Schema

Database schema uses a **modular architecture** via re-exports in `lib/db/schema.ts`. Each domain has its own schema file:

- `rbac-schema.ts` - Users, roles, permissions, organizations
- `refresh-token-schema.ts` - Sessions, tokens, login attempts, account security
- `webauthn-schema.ts` - WebAuthn credentials and challenges
- `oidc-schema.ts` - OIDC states and nonces
- `work-item-schema.ts` - Work items core tables
- `work-item-fields-schema.ts` - Custom field definitions and values
- `analytics-schema.ts` - Charts, dashboards, data sources
- `chart-config-schema.ts` - Chart display configurations
- `audit-schema.ts` - Audit trail
- `csrf-schema.ts` - CSRF failure monitoring

**Import pattern**: Always import from `@/lib/db/schema` (never from individual schema files):

```typescript
import { users, roles, permissions } from '@/lib/db/schema';
```

### API Route Security Wrappers

**CRITICAL**: All API routes MUST use one of three security wrapper functions. Direct route exports are FORBIDDEN.

**Location**: `@/lib/api/route-handlers`

#### 1. `rbacRoute` - RBAC Permission-Based (Default for Business Logic)

Use for all business logic requiring specific permissions:

```typescript
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
```

**Permission Format**: `resource:action:scope`
- **Resources**: `users`, `practices`, `analytics`, `work_items`, `roles`
- **Actions**: `read`, `create`, `update`, `delete`, `manage`
- **Scopes**: `all`, `organization`, `own`

#### 2. `authRoute` - Authentication Without RBAC

Use for auth system routes (MFA, profile, sessions):

```typescript
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
```

#### 3. `publicRoute` - No Authentication

Use for public endpoints only (health checks, CSRF tokens, login):

```typescript
import { publicRoute } from '@/lib/api/route-handlers';

const handler = async (request: NextRequest) => {
  return NextResponse.json({ status: 'ok' });
};

export const GET = publicRoute(
  handler,
  'Health check endpoint for monitoring tools and load balancers',
  { rateLimit: 'api' }
);
```

**Rate Limit Options**:
- `auth`: 10 req/min (authentication endpoints)
- `api`: 100 req/min (standard operations)
- `upload`: 20 req/min (file uploads)

**Exception**: Only `/api/auth/refresh` and `/api/auth/logout` may skip wrappers (custom auth flows with internal validation).

### Logging System

**CRITICAL**: Custom logging wrapper at `lib/logger/index.ts` - server-side only.

**FORBIDDEN**: Client-side imports of `@/lib/logger` (enforced by custom lint rule).

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

**Enriched Logging Patterns**:

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

**Slow Thresholds**:
- `DB_QUERY`: 500ms (detect missing indexes)
- `API_OPERATION`: 1000ms (user experience threshold)
- `AUTH_OPERATION`: 2000ms (password hashing, MFA)

**What NOT to Log**:
- ❌ Verbose intermediate logs (rate limit check, validation, etc.)
- ❌ Debug console.log statements
- ✅ One comprehensive final log per operation

**Features**:
- Automatic context capture (file, line, function)
- Correlation ID tracking across requests
- PII sanitization (emails, SSNs, credit cards, UUIDs)
- Production sampling (INFO: 10%, DEBUG: 1%)
- CloudWatch Logs integration

**NEVER**: Use external logging libraries (Pino, Winston). Never use `console.*` directly.

### RBAC System

**Permission Hierarchy**: Super Admin > Organization Admin > Manager > Staff

**Caching**: User context cached in Redis with automatic invalidation on permission changes.

**Server-side permission checks**: `lib/rbac/server-permission-service.ts`

```typescript
import { ServerPermissionService } from '@/lib/rbac/server-permission-service';

const hasPermission = await ServerPermissionService.hasPermission(
  userId,
  'users:update:all'
);
```

### Environment Variables

**Validation**: T3 Env + Zod schema in `lib/env.ts`

**Required variables** (`.env.local`):
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Min 32 chars for JWT access tokens
- `JWT_REFRESH_SECRET` - Min 32 chars for refresh tokens
- `CSRF_SECRET` - Min 32 chars for CSRF protection
- `APP_URL` - Application URL (e.g., http://localhost:4001)
- `NEXT_PUBLIC_APP_URL` - Client-side app URL

**Optional** (authentication):
- `ENTRA_TENANT_ID`, `ENTRA_APP_ID`, `ENTRA_CLIENT_SECRET` - Microsoft Entra ID
- `OIDC_*` - OpenID Connect configuration
- `SMTP_*` - AWS SES email configuration

**Optional** (S3 file storage):
- `S3_PUBLIC_*` - Public assets (logos, avatars) via CloudFront CDN
- `S3_PRIVATE_*` - Private assets (attachments, documents) with presigned URLs

### S3 File Storage

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

// Reports with timestamp versioning
generateS3Key(['reports', orgId, 'analytics'], 'report.xlsx', { 
  addTimestamp: true 
})
// => 'reports/org-789/analytics/report_1704067200000_xyz.xlsx'

// User documents (nested structure)
['users', userId, 'documents', 'licenses']
// => 'users/user-456/documents/licenses/license_xyz.jpg'
```

**Security**:
- ✅ Separate IAM credentials (`S3_PRIVATE_*` env vars)
- ✅ Short-lived presigned URLs (15 min download, 1 hour upload)
- ✅ Server-side RBAC checks required before URL generation
- ✅ Path traversal prevention via sanitization
- ✅ MIME type whitelist (blocks executables, scripts)
- ✅ File size limits by type (50MB images/documents, 100MB archives/default)
- ✅ Comprehensive audit logging with metadata

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

**Image Thumbnails** (automatic for images):
```typescript
import { isImage, generateThumbnail, getThumbnailKey } from '@/lib/s3/private-assets';

// Check if file is an image
if (isImage('image/jpeg')) {
  // Generate thumbnail (max 300x300px, JPEG, 80% quality)
  const thumbnailBuffer = await generateThumbnail(imageBuffer, 'image/jpeg');
  
  // Thumbnail key automatically generated
  const thumbnailKey = getThumbnailKey('work-items/abc/photo.jpg');
  // => 'work-items/abc/thumbnails/photo_thumb.jpg'
}
```

**Key generation options**:
- `addUniqueId: true` (default) - Adds collision-resistant nanoid
- `addTimestamp: false` (default) - Adds Unix timestamp for versioning
- `preserveName: false` (default) - Lowercase sanitization vs minimal sanitization

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

**Consistency**: Both systems use identical `generateS3Key()` API for developer experience.

**Configuration**:
```bash
# Private Assets (required for attachments)
S3_PRIVATE_REGION=us-east-1
S3_PRIVATE_ACCESS_KEY_ID=AKIA...
S3_PRIVATE_SECRET_ACCESS_KEY=secret...
S3_PRIVATE_BUCKET=bcos-private-assets
S3_PRIVATE_UPLOAD_EXPIRATION=3600    # Optional: 1 hour default
S3_PRIVATE_DOWNLOAD_EXPIRATION=900   # Optional: 15 min default

# Public Assets (required for logos/avatars)
S3_PUBLIC_REGION=us-east-1
S3_PUBLIC_ACCESS_KEY_ID=AKIA...
S3_PUBLIC_SECRET_ACCESS_KEY=secret...
S3_PUBLIC_BUCKET=bcos-public-assets
CDN_URL=https://cdn.bendcare.com
```

## Code Quality Standards

### TypeScript Rules

- **FORBIDDEN**: The `any` type under all circumstances
- **REQUIRED**: Strict mode with `strictNullChecks`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- If you encounter `any` in existing code, address it and report to user

### Testing Standards

- **Test Quality**: Tests must test real code and add value, not "testing theater"
- **Test Failures**: Analyze first, determine if code is wrong, test is wrong, or requirement changed
- **DO NOT**: Blindly modify tests to make them pass
- **Priority**: Quality code, not 100% pass rate

### File Naming

- **DO NOT**: Use adjectives or buzzwords ("enhanced", "optimized", "new", "updated")
- **DO**: Name files plainly and descriptively
- Focus on what the file does, not marketing language

### Post-Change Validation

**REQUIRED** after any code changes:
1. `pnpm tsc` - Fix TypeScript errors
2. `pnpm lint` - Fix linting errors
3. Fix ALL errors (even unrelated ones) before proceeding

### Quality Over Speed

- Do NOT take shortcuts for speed
- Speed is NOT the priority; high quality code is the priority
- Always prioritize correctness and maintainability

## Security

### Priority

Security is paramount. Never make changes that negatively impact security profile.

### API Route Protection Audit

Last audited: 2025-01-17
- Total Routes: 110
- Protected with rbacRoute: 84.7%
- Public Routes: 8.8%
- Auth Routes: 2.4%
- Unprotected: 0% (all have internal auth)

### Migration from Legacy Wrappers

If you encounter these patterns, migrate them:

**Legacy** → **Modern**:
- `secureRoute()` → `authRoute()`
- `adminRoute()` → `rbacRoute()` with `permission: 'admin:*:*'`
- `publicRoute()` from `@/lib/api/route-handler` → `publicRoute()` from `@/lib/api/route-handlers`

## Git Operations

### Strict Prohibitions

- **NEVER**: Use `git reset` (hard, soft, or any form) - FORBIDDEN
- **NEVER**: Force push to main/master
- **NEVER**: Skip hooks (`--no-verify`, `--no-gpg-sign`) unless explicitly requested
- **DO NOT**: Interact with git unless explicitly instructed
- **DO NOT**: Commit work without being told to do so

### Commit Message Format

When creating commits (only when explicitly requested):

```bash
git commit -m "$(cat <<'EOF'
Commit message here - focus on "why" not "what"

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

## Development Workflow

1. Make code changes
2. Run `pnpm tsc` to check TypeScript compilation
3. Run `pnpm lint` to check linting rules
4. Fix any errors that you created
5. Only proceed when all checks pass
6. **DO NOT** create documents unless asked - display findings to user
7. **DO NOT** defer work unless previously instructed and approved

## Project Context

- **OS**: macOS (darwin 24.6.0)
- **Shell**: zsh
- **Package Manager**: pnpm
- **Workspace**: `/Users/pstewart/bcos`
- **Tech Stack**: Next.js 15, TypeScript 5.9, React 19
- **Infrastructure**: AWS CDK for IaC

## Key Principles

1. **Security First**: Always prioritize security in all decisions
2. **Type Safety**: Strict TypeScript, no `any` types
3. **Quality Over Speed**: Take time to do things correctly
4. **Test Value**: Tests must provide real value, not just coverage
5. **Clean Git History**: No destructive git operations
6. **Explicit Actions**: Only commit or interact with git when explicitly instructed
