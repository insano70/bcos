# API Standardization Rollout Plan

**Status**: 🚧 In Progress - Phase 1 Complete, Phase 2 In Progress
**Start Date**: 2025-01-07
**Target Completion**: 2025-01-31 (3-4 weeks)
**Current Phase**: Phase 2 - Service Layer Creation (Task 2.1/4 Complete)
**Owner**: Claude AI Assistant
**Last Updated**: 2025-10-07
**Progress**: 19% (Phase 1: 100%, Phase 2: 25%)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Gold Standard Definition](#gold-standard-definition)
3. [Phase 1: Foundation & Documentation](#phase-1-foundation--documentation-days-1-2)
4. [Phase 2: Critical Service Layer Creation](#phase-2-critical-service-layer-creation-days-3-7)
5. [Phase 3: Refactor High-Priority APIs](#phase-3-refactor-high-priority-apis-days-8-11)
6. [Phase 4: Standardize Response Patterns](#phase-4-standardize-response-patterns-days-12-14)
7. [Phase 5: Eliminate Manual RBAC](#phase-5-eliminate-remaining-manual-rbac-days-15-17)
8. [Phase 6: Validation & Cleanup](#phase-6-validation-documentation--cleanup-days-18-20)
9. [Success Metrics](#success-metrics)
10. [Rollback Plan](#rollback-plan)

---

## Executive Summary

### Goal
Refactor all API routes to match the gold standard pattern identified in `app/api/users/route.ts` and `app/api/users/[id]/route.ts`.

### Key Problems Identified
1. **Direct DB queries** in handlers (15+ APIs)
2. **Manual RBAC logic** instead of service layer (10+ APIs)
3. **Inconsistent response patterns** (8+ APIs)
4. **Inline business logic** (upload API is 400+ lines)

### Gold Standard APIs (Use as Reference)
- ✅ `app/api/users/route.ts`
- ✅ `app/api/users/[id]/route.ts`
- ✅ `app/api/admin/data-sources/route.ts`
- ✅ `app/api/admin/data-sources/[id]/route.ts`
- ✅ `app/api/admin/data-sources/[id]/columns/[columnId]/route.ts`
- ✅ `app/api/roles/route.ts`

### Timeline
```
Week 1: Phase 1 (Days 1-2) → Phase 2 (Days 3-7)
Week 2: Phase 3 (Days 8-11) + Phase 4 (Days 12-14, parallel)
Week 3: Phase 5 (Days 15-17) → Phase 6 (Days 18-20)
```

---

## Gold Standard Definition

### Handler Structure Template

```typescript
import type { NextRequest } from 'next/server';
import { createSuccessResponse, createPaginatedResponse } from '@/lib/api/responses/success';
import { createErrorResponse, NotFoundError } from '@/lib/api/responses/error';
import { validateRequest, validateQuery } from '@/lib/api/middleware/validation';
import { getPagination, getSortParams } from '@/lib/api/utils/request';
import { extractRouteParams } from '@/lib/api/utils/params';
import { [resourceSchema] } from '@/lib/validations/[resource]';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import { createRBAC[Resource]Service } from '@/lib/services/rbac-[resource]-service';
import type { UserContext } from '@/lib/types/rbac';
import { log } from '@/lib/logger';

/**
 * Handler for [operation] on [resource]
 * [Brief description of what this endpoint does]
 */
const [operation][Resource]Handler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();

  log.info('[Operation] [resource] request initiated', {
    requestingUserId: userContext.user_id,
    organizationId: userContext.current_organization_id
  });

  try {
    // 1. Extract and validate parameters
    const { searchParams } = new URL(request.url);
    const pagination = getPagination(searchParams);
    const query = validateQuery(searchParams, querySchema);
    // For route params: const { id } = await extractRouteParams(args[0], paramsSchema);
    // For body: const body = await validateRequest(request, bodySchema);

    // 2. Create service instance
    const service = createRBAC[Resource]Service(userContext);

    // 3. Execute operation through service
    const result = await service.[operation](/* params */);

    // 4. Log success with metrics
    log.info('[Operation] [resource] completed successfully', {
      duration: Date.now() - startTime,
      resultCount: Array.isArray(result) ? result.length : 1
    });

    // 5. Return standardized response
    return createSuccessResponse(result, '[Success message]');
    // For lists: return createPaginatedResponse(result, pagination);

  } catch (error) {
    log.error('[Operation] [resource] failed', error, {
      duration: Date.now() - startTime,
      requestingUserId: userContext.user_id
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500,
      request
    );
  }
};

// Export with RBAC protection
export const [METHOD] = rbacRoute(
  [operation][Resource]Handler,
  {
    permission: ['[resource]:[action]:[scope]'],
    extractResourceId: extractors.[resource]Id,
    extractOrganizationId: extractors.organizationId,
    rateLimit: 'api'
  }
);
```

### Rules

1. **Service Layer Required**: All database operations MUST go through a service
2. **No Direct DB Imports**: Handlers must NOT import `db` directly
3. **No Manual RBAC**: Permission checking MUST be in service layer
4. **Standard Responses**: Always use `createSuccessResponse`, `createPaginatedResponse`, `createErrorResponse`
5. **Named Handlers**: Use `[operation][Resource]Handler` naming convention
6. **Performance Logging**: Track `startTime` and log duration
7. **Structured Logging**: Use `log.info`, `log.error` with context objects
8. **Type Safety**: No `any` types, full TypeScript strict mode

---

## Phase 1: Foundation & Documentation (Days 1-2)

**Status**: ⏳ Not Started
**Owner**: [Assign Developer]
**Goal**: Establish standards, create templates, and set up validation infrastructure

### Prerequisites
- None

### Tasks

#### Task 1.1: Create API Standards Document
**File**: `docs/api/STANDARDS.md`

**Instructions**:
1. Create the file with the template above
2. Add sections for:
   - Import order convention
   - Naming conventions (handlers, services, types)
   - Error handling patterns
   - Logging requirements
   - Validation patterns
   - Testing requirements
3. Include 3-5 complete examples from gold standard APIs
4. Add anti-patterns section showing what NOT to do

**Acceptance Criteria**:
- [ ] File exists at `docs/api/STANDARDS.md`
- [ ] Contains handler template with full example
- [ ] Documents all naming conventions
- [ ] Includes 3+ complete examples
- [ ] Has anti-patterns section
- [ ] Reviewed and approved by team

**Estimated Time**: 3-4 hours

---

#### Task 1.2: Create API Handler Template
**File**: `lib/api/templates/handler-template.ts`

**Instructions**:
1. Create directory if it doesn't exist: `mkdir -p lib/api/templates`
2. Copy the gold standard structure from `app/api/users/route.ts`
3. Replace specific logic with commented placeholders
4. Add detailed comments explaining each section
5. Include examples for common patterns:
   - List endpoints with pagination
   - Detail endpoints with route params
   - Create endpoints with body validation
   - Update endpoints with partial validation
   - Delete endpoints with soft delete

**Example Structure**:
```typescript
/**
 * API Handler Template
 *
 * Use this template when creating new API endpoints.
 * Replace [Resource] with your resource name (e.g., User, Practice, Chart)
 * Replace [operation] with the operation (e.g., get, list, create, update, delete)
 *
 * BEFORE YOU START:
 * 1. Ensure you have a service layer created (lib/services/rbac-[resource]-service.ts)
 * 2. Ensure you have validation schemas (lib/validations/[resource].ts)
 * 3. Review docs/api/STANDARDS.md for detailed guidelines
 */

// [Copy full template here with extensive comments]
```

**Acceptance Criteria**:
- [ ] File exists at `lib/api/templates/handler-template.ts`
- [ ] Template compiles without errors
- [ ] All sections are clearly commented
- [ ] Includes examples for 5 common patterns
- [ ] Can be copied and used immediately

**Estimated Time**: 2-3 hours

---

#### Task 1.3: Create Linting Rules
**File**: `.eslintrc.js` (or `.eslintrc.json`)

**Instructions**:
1. Add custom rule to detect direct `db` imports in API routes:
```javascript
{
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [{
        group: ['@/lib/db'],
        message: 'API routes must not import db directly. Use service layer instead.',
        // Apply only to files in app/api
        importNames: ['db']
      }]
    }]
  }
}
```

2. Add rule to detect manual permission checking:
```javascript
// In a custom ESLint plugin or via no-restricted-syntax
{
  rules: {
    'no-restricted-syntax': ['error', {
      selector: 'MemberExpression[object.property.name="all_permissions"] CallExpression[callee.property.name="some"]',
      message: 'Manual permission checking detected. Use service layer for RBAC.'
    }]
  }
}
```

3. Add rule to detect `NextResponse.json`:
```javascript
{
  rules: {
    'no-restricted-imports': ['error', {
      paths: [{
        name: 'next/server',
        importNames: ['NextResponse'],
        message: 'Use createSuccessResponse/createErrorResponse instead of NextResponse.json'
      }]
    }]
  }
}
```

**Note**: Some of these rules may need to be warnings initially during migration.

**Acceptance Criteria**:
- [ ] ESLint rules added to config
- [ ] Rules detect direct db imports in app/api/**
- [ ] Rules detect manual permission checks
- [ ] Rules detect NextResponse.json usage
- [ ] CI fails if rules are violated
- [ ] Documentation added for disabling rules when necessary

**Estimated Time**: 2-3 hours

---

#### Task 1.4: Set Up Testing Infrastructure
**File**: `lib/api/testing/api-test-helpers.ts`

**Instructions**:
1. Create the testing utilities directory: `mkdir -p lib/api/testing`
2. Create helper functions for testing:

```typescript
import type { NextRequest } from 'next/server';
import type { UserContext } from '@/lib/types/rbac';

/**
 * Create a mock NextRequest for testing
 */
export function createMockRequest(options: {
  method?: string;
  url?: string;
  body?: unknown;
  headers?: Record<string, string>;
}): NextRequest {
  const { method = 'GET', url = 'http://localhost:3000/api/test', body, headers = {} } = options;

  return new Request(url, {
    method,
    headers: new Headers(headers),
    body: body ? JSON.stringify(body) : undefined
  }) as NextRequest;
}

/**
 * Create a mock UserContext for testing
 */
export function createMockUserContext(overrides?: Partial<UserContext>): UserContext {
  return {
    user_id: 'test-user-id',
    email: 'test@example.com',
    first_name: 'Test',
    last_name: 'User',
    email_verified: true,
    is_super_admin: false,
    roles: [],
    all_permissions: [],
    organizations: [],
    accessible_organizations: [],
    current_organization_id: 'test-org-id',
    organization_admin_for: [],
    ...overrides
  };
}

/**
 * Create a mock super admin context
 */
export function createMockSuperAdminContext(): UserContext {
  return createMockUserContext({
    is_super_admin: true,
    all_permissions: [
      { permission_id: '1', name: 'admin:all', resource: 'admin', action: 'all', scope: 'all' }
    ]
  });
}

/**
 * Assert API response format
 */
export async function assertSuccessResponse(response: Response, expectedStatus = 200) {
  expect(response.status).toBe(expectedStatus);
  const data = await response.json();
  expect(data).toHaveProperty('success', true);
  expect(data).toHaveProperty('data');
  return data;
}

export async function assertErrorResponse(response: Response, expectedStatus = 500) {
  expect(response.status).toBe(expectedStatus);
  const data = await response.json();
  expect(data).toHaveProperty('success', false);
  expect(data).toHaveProperty('error');
  return data;
}

/**
 * Create mock with specific permission
 */
export function createMockUserWithPermission(permission: string): UserContext {
  return createMockUserContext({
    all_permissions: [
      {
        permission_id: '1',
        name: permission,
        resource: permission.split(':')[0],
        action: permission.split(':')[1],
        scope: permission.split(':')[2]
      }
    ]
  });
}
```

**Acceptance Criteria**:
- [ ] File exists at `lib/api/testing/api-test-helpers.ts`
- [ ] All helper functions are documented
- [ ] Helpers work with actual test files
- [ ] Example test file created showing usage
- [ ] Documentation added to STANDARDS.md

**Estimated Time**: 3-4 hours

---

### Phase 1 Completion Checklist

- [x] Task 1.1: STANDARDS.md complete
- [x] Task 1.2: Handler template complete
- [x] Task 1.3: Biome linting rules configured (docs/api/LINTING.md)
- [x] Task 1.4: Test helpers complete
- [ ] All tasks reviewed by team
- [ ] Documentation merged to main
- [ ] Team training session completed

**Phase 1 Complete**: ⏳ Awaiting Team Review

---

## Phase 2: Critical Service Layer Creation (Days 3-7)

**Status**: 🚧 In Progress (Task 2.1 Complete)
**Owner**: Claude AI Assistant
**Goal**: Create missing service layers for APIs currently doing direct DB operations
**Started**: 2025-10-07

### Prerequisites
- Phase 1 complete
- Gold standard service examples reviewed

### Reference Services
Study these before starting:
- `lib/services/rbac-users-service.ts`
- `lib/services/rbac-data-sources-service.ts`
- `lib/services/rbac-charts-service.ts`

---

### Task 2.1: Create Practices Service
**File**: `lib/services/rbac-practices-service.ts`

**Current Problem**:
`app/api/practices/route.ts` contains 100+ lines of direct DB queries and manual RBAC logic.

**Instructions**:

1. Create the service file with base structure:
```typescript
import { db, practices, practice_attributes, templates, users } from '@/lib/db';
import { eq, and, isNull, sql, asc, desc } from 'drizzle-orm';
import type { UserContext } from '@/lib/types/rbac';
import { NotFoundError, PermissionError } from '@/lib/api/responses/error';

export interface PracticesServiceInterface {
  getPractices(filters: PracticeFilters): Promise<Practice[]>;
  getPracticeById(id: string): Promise<Practice | null>;
  getPracticeCount(filters?: PracticeFilters): Promise<number>;
  createPractice(data: CreatePracticeData): Promise<Practice>;
  updatePractice(id: string, data: UpdatePracticeData): Promise<Practice>;
  deletePractice(id: string): Promise<boolean>;
}

export function createRBACPracticesService(userContext: UserContext): PracticesServiceInterface {
  // Implementation
}
```

2. Implement `getPractices()`:
   - Extract RBAC filtering logic from `app/api/practices/route.ts` lines 40-61
   - Move database query logic from lines 70-87
   - Apply filters based on userContext permissions automatically
   - Return typed Practice objects

3. Implement `getPracticeById()`:
   - Extract logic from `app/api/practices/[id]/route.ts` lines 18-29
   - Add automatic ownership checking
   - Throw `NotFoundError` if practice doesn't exist
   - Throw `PermissionError` if user can't access

4. Implement `createPractice()`:
   - Extract logic from `app/api/practices/route.ts` lines 110-178
   - Include permission checking (only super admins)
   - Create practice and default attributes in transaction
   - Return created practice

5. Implement `updatePractice()`:
   - Extract logic from `app/api/practices/[id]/route.ts` lines 60-104
   - Check ownership/permissions
   - Validate domain uniqueness
   - Return updated practice

6. Implement `deletePractice()`:
   - Extract logic from `app/api/practices/[id]/route.ts` lines 132-163
   - Soft delete only
   - Super admin only
   - Return success boolean

7. Add comprehensive tests:
```typescript
// lib/services/__tests__/rbac-practices-service.test.ts
describe('RBACPracticesService', () => {
  describe('getPractices', () => {
    it('returns only owned practices for regular user', async () => {});
    it('returns all practices for super admin', async () => {});
    it('filters by status', async () => {});
    it('filters by template_id', async () => {});
  });

  describe('getPracticeById', () => {
    it('returns practice for owner', async () => {});
    it('returns practice for super admin', async () => {});
    it('throws PermissionError for non-owner', async () => {});
    it('throws NotFoundError for deleted practice', async () => {});
  });

  // ... tests for all methods
});
```

**Files to Modify**:
- Create: `lib/services/rbac-practices-service.ts`
- Create: `lib/services/__tests__/rbac-practices-service.test.ts`

**Acceptance Criteria**:
- [x] Service implements all 6 methods
- [x] All RBAC logic is in service, not in handlers
- [x] Service throws appropriate errors (NotFoundError, AuthorizationError)
- [x] Test coverage >80% (13 passing tests)
- [x] All tests passing
- [x] TypeScript strict mode compliant
- [x] No `any` types used
- [x] Documented with JSDoc comments

**Completed**: 2025-10-07
**Files Created**:
- `lib/services/rbac-practices-service.ts` (600+ lines)
- `tests/integration/rbac/practices-service.test.ts` (250+ lines, 13 tests passing)

**Notes**:
- Used functional pattern instead of class-based (following charts service example)
- Implemented transaction support for practice creation with default attributes
- PostgreSQL count() returns string - added Number() conversion
- Tests follow permission enforcement pattern (no transaction-based data validation yet)

---

### Task 2.2: Create Search Service
**File**: `lib/services/rbac-search-service.ts`

**Current Problem**:
`app/api/search/route.ts` is 320+ lines with complex inline SQL, manual RBAC, and helper functions.

**Instructions**:

1. Create service with structure:
```typescript
export interface SearchFilters {
  query: string;
  type: 'all' | 'users' | 'practices' | 'staff' | 'templates';
  status?: 'active' | 'inactive' | 'all';
  sort?: 'relevance' | 'name' | 'created_at';
  order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface SearchResults {
  users: UserSearchResult[];
  practices: PracticeSearchResult[];
  staff: StaffSearchResult[];
  templates: TemplateSearchResult[];
  total: number;
  suggestions?: string[];
}

export function createRBACSearchService(userContext: UserContext) {
  return {
    search: async (filters: SearchFilters): Promise<SearchResults> => {},
  };
}
```

2. Extract and move helper functions:
   - Move `calculateRelevanceScore()` from line 238 → private method
   - Move `getOrderBy()` from line 254 → private method
   - Move `generateSearchSuggestions()` from line 274 → private method

3. Create private search methods:
   - `searchUsers()` - extract lines 62-96
   - `searchPractices()` - extract lines 99-131
   - `searchStaff()` - extract lines 134-164
   - `searchTemplates()` - extract lines 167-201

4. Implement automatic RBAC filtering:
   - Check `userContext.all_permissions` once
   - Apply to all search methods
   - No manual permission checks in each method

5. Implement main `search()` method:
   - Sanitize input (security)
   - Call appropriate private methods based on type
   - Aggregate results
   - Return structured SearchResults

6. Add tests:
```typescript
describe('RBACSearchService', () => {
  it('searches all types for super admin', async () => {});
  it('only searches allowed types for regular user', async () => {});
  it('sanitizes malicious input', async () => {});
  it('calculates relevance scores correctly', async () => {});
  it('generates suggestions when no results', async () => {});
});
```

**Files to Modify**:
- Create: `lib/services/rbac-search-service.ts`
- Create: `lib/services/__tests__/rbac-search-service.test.ts`

**Acceptance Criteria**:
- [ ] All search logic moved to service
- [ ] No `any` types (fix line 27: `let query: any`)
- [ ] RBAC checking is centralized
- [ ] Helper functions are private methods
- [ ] SQL injection prevention maintained
- [ ] Test coverage >75%
- [ ] Performance benchmarks met (baseline from current implementation)

**Estimated Time**: 2 days

---

### Task 2.3: Create Upload Service
**File**: `lib/services/upload-service.ts`

**Current Problem**:
`app/api/upload/route.ts` is 400+ lines with inline DB operations, repeated code, and manual RBAC.

**Instructions**:

1. Create service structure:
```typescript
export interface UploadOptions {
  folder?: string;
  optimizeImages?: boolean;
  generateThumbnails?: boolean;
  allowedTypes?: string[];
  maxFileSize?: number;
  maxFiles?: number;
}

export interface UploadContext {
  practiceId?: string;
  staffId?: string;
  imageType?: 'logo' | 'hero' | 'gallery' | 'provider';
}

export function createUploadService(userContext: UserContext) {
  return {
    uploadFiles: async (files: File[], options: UploadOptions): Promise<UploadResult> => {},
    updatePracticeImage: async (practiceId: string, imageType: string, url: string): Promise<void> => {},
    updateGalleryImages: async (practiceId: string, url: string): Promise<void> => {},
    updateStaffPhoto: async (practiceId: string, staffId: string, url: string): Promise<void> => {},
  };
}
```

2. Extract `uploadFiles()`:
   - Move S3 upload logic from lines 56-72
   - Keep as-is, just extract to method

3. Extract `updatePracticeImage()`:
   - Consolidate repeated logic from lines 96-255
   - Single method handles logo, hero
   - Checks permissions automatically
   - Updates practice_attributes table

4. Extract `updateGalleryImages()`:
   - Move gallery logic from lines 110-190
   - Handle array append logic
   - Check permissions

5. Extract `updateStaffPhoto()`:
   - Move staff photo logic from lines 258-344
   - Validate staff member exists
   - Check practice ownership
   - Update staff_members table

6. Consolidate permission checking:
   - Create private `checkPracticePermission(practiceId, permission)` method
   - Use in all update methods
   - Remove duplicate checks

7. Remove inline imports:
   - Move all imports to top of file (currently lines 113, 197, 267)

8. Add tests:
```typescript
describe('UploadService', () => {
  describe('updatePracticeImage', () => {
    it('updates logo for practice owner', async () => {});
    it('updates hero for super admin', async () => {});
    it('throws PermissionError for non-owner', async () => {});
    it('throws NotFoundError for invalid practice', async () => {});
  });

  describe('updateGalleryImages', () => {
    it('appends to existing gallery', async () => {});
    it('creates new gallery array if empty', async () => {});
  });

  describe('updateStaffPhoto', () => {
    it('updates staff photo for practice owner', async () => {});
    it('validates staff belongs to practice', async () => {});
  });
});
```

**Files to Modify**:
- Create: `lib/services/upload-service.ts`
- Create: `lib/services/__tests__/upload-service.test.ts`

**Acceptance Criteria**:
- [ ] Handler reduced from 400+ to <100 lines
- [ ] All DB operations in service
- [ ] No inline imports in handler
- [ ] Permission checking consolidated
- [ ] Repeated code eliminated
- [ ] Test coverage >80%
- [ ] All upload types tested (logo, hero, gallery, staff)

**Estimated Time**: 1.5-2 days

---

### Task 2.4: Enhance Charts Service
**File**: `lib/services/rbac-charts-service.ts` (already exists)

**Current Problem**:
`app/api/admin/analytics/charts/[chartId]/route.ts` does direct DB queries instead of using service.

**Instructions**:

1. Review existing service at `lib/services/rbac-charts-service.ts`
2. Ensure it has these methods:
   - `getCharts()` ✅ (already exists)
   - `getChartById()` - ADD IF MISSING
   - `createChart()` ✅ (already exists)
   - `updateChart()` - ADD IF MISSING
   - `deleteChart()` - ADD IF MISSING

3. Add `getChartById()` if missing:
```typescript
async getChartById(chartId: string): Promise<ChartWithDetails | null> {
  const [chart] = await db
    .select()
    .from(chart_definitions)
    .leftJoin(chart_categories, eq(chart_definitions.chart_category_id, chart_categories.chart_category_id))
    .leftJoin(users, eq(chart_definitions.created_by, users.user_id))
    .where(eq(chart_definitions.chart_definition_id, chartId));

  return chart || null;
}
```

4. Add `updateChart()` if missing:
```typescript
async updateChart(chartId: string, data: Partial<ChartUpdateData>): Promise<Chart> {
  const [updated] = await db
    .update(chart_definitions)
    .set({ ...data, updated_at: new Date() })
    .where(eq(chart_definitions.chart_definition_id, chartId))
    .returning();

  if (!updated) {
    throw NotFoundError('Chart');
  }

  return updated;
}
```

5. Add `deleteChart()` if missing (soft delete):
```typescript
async deleteChart(chartId: string): Promise<boolean> {
  const [deleted] = await db
    .update(chart_definitions)
    .set({ is_active: false, updated_at: new Date() })
    .where(eq(chart_definitions.chart_definition_id, chartId))
    .returning();

  return !!deleted;
}
```

6. Add tests for new methods

**Files to Modify**:
- Update: `lib/services/rbac-charts-service.ts`
- Update: `lib/services/__tests__/rbac-charts-service.test.ts`

**Acceptance Criteria**:
- [ ] Service has all CRUD methods
- [ ] Methods handle errors appropriately
- [ ] Tests added for new methods
- [ ] Test coverage maintained >80%

**Estimated Time**: 0.5 days

---

### Phase 2 Completion Checklist

- [ ] Task 2.1: Practices service complete with tests
- [ ] Task 2.2: Search service complete with tests
- [ ] Task 2.3: Upload service complete with tests
- [ ] Task 2.4: Charts service enhanced
- [ ] All service tests passing
- [ ] Test coverage >80% for all services
- [ ] Services documented with JSDoc
- [ ] Code review completed
- [ ] Services merged to main

**Phase 2 Complete**: ☐

---

## Phase 3: Refactor High-Priority APIs (Days 8-11)

**Status**: ⏳ Not Started
**Owner**: [Assign Developer]
**Goal**: Refactor the most problematic APIs to use new service layers

### Prerequisites
- Phase 2 complete (all services exist)
- Services tested and merged

---

### Task 3.1: Refactor Practices Collection API
**File**: `app/api/practices/route.ts`

**Current Issues**:
- Lines 30-61: Manual RBAC logic
- Lines 70-87: Direct DB queries
- No service layer usage

**Instructions**:

1. **Backup current implementation** (for comparison):
```bash
cp app/api/practices/route.ts app/api/practices/route.ts.backup
```

2. **Replace GET handler** (`getPracticesHandler`):

Before (lines 19-103):
```typescript
const getPracticesHandler = async (request: NextRequest, userContext: UserContext) => {
  // 85 lines of manual RBAC and direct DB queries
};
```

After:
```typescript
const getPracticesHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  log.info('List practices request initiated', {
    requestingUserId: userContext.user_id
  });

  try {
    const { searchParams } = new URL(request.url);
    const pagination = getPagination(searchParams);
    const sort = getSortParams(searchParams, ['name', 'domain', 'status', 'created_at']);
    const query = validateQuery(searchParams, practiceQuerySchema);

    // Use service layer instead of direct queries
    const practicesService = createRBACPracticesService(userContext);
    const practices = await practicesService.getPractices({
      status: query.status,
      template_id: query.template_id,
      limit: pagination.limit,
      offset: pagination.offset,
      sortBy: sort.sortBy,
      sortOrder: sort.sortOrder
    });

    const totalCount = await practicesService.getPracticeCount({
      status: query.status,
      template_id: query.template_id
    });

    log.info('Practices list retrieved successfully', {
      count: practices.length,
      total: totalCount,
      duration: Date.now() - startTime
    });

    return createPaginatedResponse(practices, {
      page: pagination.page,
      limit: pagination.limit,
      total: totalCount
    });

  } catch (error) {
    log.error('List practices failed', error, {
      duration: Date.now() - startTime
    });
    return createErrorResponse(error, 500, request);
  }
};
```

3. **Replace POST handler** (`createPracticeHandler`):

Before (lines 105-199):
```typescript
const createPracticeHandler = async (request: NextRequest, userContext: UserContext) => {
  // 95 lines of direct DB operations
};
```

After:
```typescript
const createPracticeHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  log.info('Create practice request initiated', {
    requestingUserId: userContext.user_id
  });

  try {
    const validatedData = await validateRequest(request, practiceCreateSchema);

    const practicesService = createRBACPracticesService(userContext);
    const newPractice = await practicesService.createPractice(validatedData);

    log.info('Practice created successfully', {
      practiceId: newPractice.id,
      duration: Date.now() - startTime
    });

    return createSuccessResponse(newPractice, 'Practice created successfully');

  } catch (error) {
    log.error('Create practice failed', error, {
      duration: Date.now() - startTime
    });
    return createErrorResponse(error, 500, request);
  }
};
```

4. **Remove unused imports**:
   - Remove: `import { db, practices, practice_attributes, templates, users } from '@/lib/db'`
   - Remove: `import { eq, isNull, and, asc, desc, sql } from 'drizzle-orm'`
   - Add: `import { createRBACPracticesService } from '@/lib/services/rbac-practices-service'`

5. **Verify exports remain the same** (no breaking changes)

6. **Update tests**:
```typescript
// app/api/practices/__tests__/route.test.ts
describe('GET /api/practices', () => {
  it('returns practices for authenticated user', async () => {
    const request = createMockRequest({ method: 'GET', url: '/api/practices' });
    const userContext = createMockUserContext();
    const response = await GET(request, userContext);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data)).toBe(true);
  });
});
```

**Files to Modify**:
- Update: `app/api/practices/route.ts`
- Update: `app/api/practices/__tests__/route.test.ts`

**Acceptance Criteria**:
- [ ] Handler reduced from 219 to <100 lines
- [ ] All RBAC logic removed from handler
- [ ] All DB queries removed from handler
- [ ] Uses `createRBACPracticesService`
- [ ] Tests updated and passing
- [ ] API contract unchanged (same request/response format)
- [ ] Performance benchmarks met

**Estimated Time**: 0.5 days

---

### Task 3.2: Refactor Practices Detail API
**File**: `app/api/practices/[id]/route.ts`

**Current Issues**:
- Lines 33-36: Manual permission checks
- Lines 76-78: Manual permission checks
- Lines 147-149: Manual permission checks
- Direct DB queries throughout

**Instructions**:

1. **Backup**:
```bash
cp app/api/practices/[id]/route.ts app/api/practices/[id]/route.ts.backup
```

2. **Replace GET handler**:
```typescript
const getPracticeHandler = async (request: NextRequest, userContext: UserContext, ...args: unknown[]) => {
  const startTime = Date.now();

  try {
    const { id: practiceId } = await extractRouteParams(args[0], practiceParamsSchema);

    log.info('Get practice request initiated', {
      practiceId,
      requestingUserId: userContext.user_id
    });

    const practicesService = createRBACPracticesService(userContext);
    const practice = await practicesService.getPracticeById(practiceId);

    if (!practice) {
      throw NotFoundError('Practice');
    }

    log.info('Practice retrieved successfully', {
      practiceId,
      duration: Date.now() - startTime
    });

    return createSuccessResponse(practice);

  } catch (error) {
    log.error('Get practice failed', error, {
      duration: Date.now() - startTime
    });
    return createErrorResponse(error, error instanceof NotFoundError ? 404 : 500, request);
  }
};
```

3. **Replace PUT handler** (similar simplification)

4. **Replace DELETE handler** (similar simplification)

5. **Remove manual permission checks** (all lines checking `is_super_admin` or `owner_user_id`)

6. **Update tests**

**Files to Modify**:
- Update: `app/api/practices/[id]/route.ts`
- Update: `app/api/practices/[id]/__tests__/route.test.ts`

**Acceptance Criteria**:
- [ ] Handler reduced from 204 to <80 lines
- [ ] All manual RBAC removed
- [ ] Service handles all permission checks
- [ ] Tests passing
- [ ] API contract unchanged

**Estimated Time**: 0.5 days

---

### Task 3.3: Refactor Search API
**File**: `app/api/search/route.ts`

**Current Issues**:
- 320+ lines in single file
- Line 27: `let query: any` - type safety violation
- Lines 52-59: Manual RBAC checks
- Lines 62-225: Complex inline SQL queries
- Lines 238-315: Helper functions in handler file

**Instructions**:

1. **Backup**:
```bash
cp app/api/search/route.ts app/api/search/route.ts.backup
```

2. **Replace entire handler**:
```typescript
const searchHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const pagination = getPagination(searchParams);
    const query = validateQuery(searchParams, searchQuerySchema); // No more 'any'!

    log.info('Search request initiated', {
      query: query.q,
      type: query.type,
      requestingUserId: userContext.user_id
    });

    const searchService = createRBACSearchService(userContext);
    const results = await searchService.search({
      query: query.q,
      type: query.type,
      status: query.status,
      sort: query.sort,
      order: query.order,
      limit: pagination.limit,
      offset: pagination.offset
    });

    log.info('Search completed successfully', {
      totalResults: results.total,
      duration: Date.now() - startTime
    });

    return createSuccessResponse(results, 'Search completed successfully');

  } catch (error) {
    log.error('Search failed', error, {
      duration: Date.now() - startTime
    });
    return createErrorResponse(error, 500, request);
  }
};
```

3. **Remove all helper functions** (now in service):
   - Delete `calculateRelevanceScore()`
   - Delete `getOrderBy()`
   - Delete `generateSearchSuggestions()`

4. **Remove imports**:
   - Remove direct DB table imports
   - Remove Drizzle ORM imports
   - Add service import

5. **Fix type safety**:
   - No more `any` types
   - All variables properly typed

**Files to Modify**:
- Update: `app/api/search/route.ts`
- Update: `app/api/search/__tests__/route.test.ts`

**Acceptance Criteria**:
- [ ] Handler reduced from 320+ to <50 lines
- [ ] No `any` types
- [ ] All SQL moved to service
- [ ] All RBAC moved to service
- [ ] Tests passing
- [ ] Performance maintained or improved

**Estimated Time**: 1 day

---

### Task 3.4: Refactor Upload API
**File**: `app/api/upload/route.ts`

**Current Issues**:
- 400+ lines
- Lines 113, 197, 267: Inline imports
- Lines 131-139, 215-223, 285-293: Duplicate permission checks
- Lines 96-346: Inline DB operations

**Instructions**:

1. **Backup**:
```bash
cp app/api/upload/route.ts app/api/upload/route.ts.backup
```

2. **Replace handler** (drastically simplified):
```typescript
const uploadFilesHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  log.info('File upload request initiated', {
    userId: userContext.user_id
  });

  try {
    // Parse form data
    const data = await request.formData();
    const files: File[] = [];

    for (const [key, value] of data.entries()) {
      if (key.startsWith('file') && value instanceof File) {
        files.push(value);
      }
    }

    if (files.length === 0) {
      return createErrorResponse('No files uploaded', 400, request);
    }

    // Get options from form data
    const folder = (data.get('folder') as string) || 'uploads';
    const optimizeImages = (data.get('optimizeImages') as string) !== 'false';
    const generateThumbnails = (data.get('generateThumbnails') as string) !== 'false';
    const practiceId = data.get('practiceId') as string;
    const staffId = data.get('staffId') as string;
    const imageType = data.get('type') as string;

    // Upload files
    const uploadService = createUploadService(userContext);
    const result = await uploadService.uploadFiles(files, {
      folder,
      optimizeImages,
      generateThumbnails,
      allowedTypes: [
        'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif',
        'application/pdf', 'text/plain'
      ],
      maxFileSize: 10 * 1024 * 1024,
      maxFiles: 5
    });

    if (!result.success) {
      return createErrorResponse(result.errors.join(', '), 400, request);
    }

    // Update practice/staff if applicable
    if (practiceId && imageType && result.files.length === 1) {
      const fileUrl = result.files[0]?.fileUrl;

      if (imageType === 'gallery') {
        await uploadService.updateGalleryImages(practiceId, fileUrl);
      } else if (['logo', 'hero'].includes(imageType)) {
        await uploadService.updatePracticeImage(practiceId, imageType, fileUrl);
      } else if (imageType === 'provider' && staffId) {
        await uploadService.updateStaffPhoto(practiceId, staffId, fileUrl);
      }
    }

    log.info('File upload completed successfully', {
      fileCount: result.files.length,
      duration: Date.now() - startTime
    });

    // Return appropriate response
    if (result.files.length === 1) {
      return createSuccessResponse({
        url: result.files[0]?.fileUrl,
        fileName: result.files[0]?.fileName,
        size: result.files[0]?.size
      }, 'File uploaded successfully');
    }

    return createSuccessResponse(result.files, 'Files uploaded successfully');

  } catch (error) {
    log.error('Upload failed', error, {
      duration: Date.now() - startTime
    });
    return createErrorResponse(error, 500, request);
  }
};
```

3. **Remove all inline logic**:
   - Delete lines 96-346 (all moved to service)
   - Remove inline imports
   - Remove inline DB operations
   - Remove inline permission checks

**Files to Modify**:
- Update: `app/api/upload/route.ts`
- Update: `app/api/upload/__tests__/route.test.ts`

**Acceptance Criteria**:
- [ ] Handler reduced from 400+ to <100 lines
- [ ] No inline imports
- [ ] No inline DB operations
- [ ] No duplicate code
- [ ] Tests passing for all upload types
- [ ] S3 integration verified

**Estimated Time**: 1 day

---

### Task 3.5: Refactor Charts Detail API
**File**: `app/api/admin/analytics/charts/[chartId]/route.ts`

**Current Issues**:
- Lines 29-34: Direct DB queries
- Lines 73-80: Manual update data construction

**Instructions**:

1. **Replace handlers to use service**:
```typescript
const getChartHandler = async (request: NextRequest, userContext: UserContext, ...args: unknown[]) => {
  const startTime = Date.now();

  try {
    const { params } = args[0] as { params: { chartId: string } };

    const chartsService = createRBACChartsService(userContext);
    const chart = await chartsService.getChartById(params.chartId);

    if (!chart) {
      return createErrorResponse('Chart definition not found', 404);
    }

    log.db('SELECT', 'chart_definitions', Date.now() - startTime, { rowCount: 1 });
    return createSuccessResponse({ chart }, 'Chart definition retrieved successfully');

  } catch (error) {
    log.error('Chart definition get error', error);
    return createErrorResponse(error, 500, request);
  }
};
```

2. **Simplify update handler** (use service.updateChart())

3. **Simplify delete handler** (use service.deleteChart())

**Files to Modify**:
- Update: `app/api/admin/analytics/charts/[chartId]/route.ts`

**Acceptance Criteria**:
- [ ] All DB queries go through service
- [ ] No manual update data construction
- [ ] Tests passing

**Estimated Time**: 0.5 days

---

### Phase 3 Completion Checklist

- [ ] Task 3.1: practices/route.ts refactored
- [ ] Task 3.2: practices/[id]/route.ts refactored
- [ ] Task 3.3: search/route.ts refactored
- [ ] Task 3.4: upload/route.ts refactored
- [ ] Task 3.5: charts/[chartId]/route.ts refactored
- [ ] All handlers <100 lines
- [ ] All tests passing
- [ ] Integration tests passing
- [ ] Performance benchmarks met
- [ ] Code review completed

**Phase 3 Complete**: ☐

---

## Phase 4: Standardize Response Patterns (Days 12-14)

**Status**: ⏳ Not Started
**Owner**: [Assign Developer]
**Goal**: Fix all APIs using non-standard response patterns

**Note**: This phase can run **in parallel with Phase 3**.

### Prerequisites
- Phase 1 complete (standards defined)

---

### Task 4.1: Standardize Contact Form API
**File**: `app/api/contact/route.ts`

**Current Issues**:
- Lines 27-32: Manual method checking (Next.js handles this)
- Line 37: Manual `ContactFormSchema.parse()` instead of helper
- Lines 63-66: `NextResponse.json()` instead of standard response
- Lines 74-81: Custom error format instead of `createErrorResponse`

**Instructions**:

1. **Remove method checking**:
   - Delete lines 27-32
   - Next.js routing already enforces POST only

2. **Use standard validation**:
```typescript
// Before:
const body = await request.json() as ContactFormData;
const validatedData = ContactFormSchema.parse(body);

// After:
const validatedData = await validateRequest(request, ContactFormSchema);
```

3. **Use standard responses**:
```typescript
// Before:
return NextResponse.json({
  success: true,
  message: 'Contact form submitted successfully'
});

// After:
return createSuccessResponse(null, 'Contact form submitted successfully');
```

4. **Use standard error handling**:
```typescript
// Before:
if (error instanceof z.ZodError) {
  return NextResponse.json(
    { error: 'Invalid form data', details: error.issues.map(...) },
    { status: 400 }
  );
}

// After:
catch (error) {
  log.error('Contact form submission failed', error);
  return createErrorResponse(error, 500, request);
}
```

**Complete Refactored File**:
```typescript
import { NextRequest } from 'next/server';
import { publicRoute } from '@/lib/api/rbac-route-handler';
import { emailService } from '@/lib/api/services/email-service-instance';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { validateRequest } from '@/lib/api/middleware/validation';
import { z } from 'zod';
import { log } from '@/lib/logger';

const ContactFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  email: z.string().email('Valid email required').max(255, 'Email too long'),
  phone: z.string().optional(),
  subject: z.string().min(1, 'Subject is required').max(200, 'Subject too long'),
  message: z.string().min(1, 'Message is required').max(2000, 'Message too long'),
  practiceEmail: z.string().email('Valid practice email required')
});

const handler = async (request: NextRequest) => {
  const startTime = Date.now();

  try {
    const validatedData = await validateRequest(request, ContactFormSchema);

    log.info('Contact form submission received', {
      name: validatedData.name,
      email: validatedData.email,
      subject: validatedData.subject,
      practiceEmail: validatedData.practiceEmail
    });

    await emailService.sendContactForm(validatedData.practiceEmail, {
      name: validatedData.name,
      email: validatedData.email,
      phone: validatedData.phone,
      subject: validatedData.subject,
      message: validatedData.message
    });

    log.info('Contact form processed successfully', {
      duration: Date.now() - startTime
    });

    return createSuccessResponse(null, 'Contact form submitted successfully');

  } catch (error) {
    log.error('Contact form submission failed', error, {
      duration: Date.now() - startTime
    });
    return createErrorResponse(error, 500, request);
  }
};

export const POST = publicRoute(handler, 'Allow visitors to submit contact forms', {
  rateLimit: 'api'
});
```

**Files to Modify**:
- Update: `app/api/contact/route.ts`
- Update: `app/api/contact/__tests__/route.test.ts`

**Acceptance Criteria**:
- [ ] No `NextResponse.json()` usage
- [ ] Uses `validateRequest()` helper
- [ ] Uses `createSuccessResponse()`
- [ ] Uses `createErrorResponse()`
- [ ] Method checking removed
- [ ] Tests passing
- [ ] API contract unchanged

**Estimated Time**: 1-2 hours

---

### Task 4.2: Standardize Appointments API
**File**: `app/api/appointments/route.ts`

**Current Issues**: Same as contact.ts

**Instructions**: Apply same changes as Task 4.1

**Files to Modify**:
- Update: `app/api/appointments/route.ts`
- Update: `app/api/appointments/__tests__/route.test.ts`

**Acceptance Criteria**: Same as Task 4.1

**Estimated Time**: 1-2 hours

---

### Task 4.3: Audit All Response Patterns
**Instructions**:

1. **Find all NextResponse.json usage**:
```bash
cd /Users/pstewart/bcos
grep -r "NextResponse.json" app/api/ --exclude-dir=node_modules > /tmp/nextresponse-audit.txt
cat /tmp/nextresponse-audit.txt
```

2. **Find all new Response() usage**:
```bash
grep -r "new Response(" app/api/ --exclude-dir=node_modules > /tmp/response-audit.txt
cat /tmp/response-audit.txt
```

3. **Create list of violations**:
   - Document each file and line number
   - Categorize by severity (critical vs. cosmetic)
   - Create GitHub issues for each

4. **Create tracking spreadsheet**:
```markdown
| File | Line | Pattern | Priority | Status |
|------|------|---------|----------|--------|
| contact/route.ts | 63 | NextResponse.json | High | Done |
| appointments/route.ts | 74 | NextResponse.json | High | Done |
| ... | ... | ... | ... | ... |
```

**Acceptance Criteria**:
- [ ] Complete audit documented
- [ ] All violations tracked
- [ ] Issues created for each
- [ ] Prioritized by impact

**Estimated Time**: 2-3 hours

---

### Task 4.4: Fix All Non-Standard Responses
**Instructions**:

For each file in the audit:

1. **Open file**
2. **Replace NextResponse.json with helpers**:
   - Success: `createSuccessResponse(data, message)`
   - Error: `createErrorResponse(error, status, request)`
3. **Ensure response shape unchanged** (no breaking changes)
4. **Update tests**
5. **Verify with curl/Postman**

**Template for each fix**:
```typescript
// Before:
return NextResponse.json(
  { success: true, data: result, message: 'Success' },
  { status: 200 }
);

// After:
return createSuccessResponse(result, 'Success');
```

**Acceptance Criteria**:
- [ ] Zero instances of `NextResponse.json` in app/api
- [ ] All responses use standard helpers
- [ ] API contracts unchanged
- [ ] All tests passing

**Estimated Time**: 1-2 days (depends on number of violations)

---

### Task 4.5: Standardize Error Messages
**File**: `lib/api/responses/error-messages.ts` (new)

**Instructions**:

1. **Create error message constants**:
```typescript
export const ERROR_MESSAGES = {
  // Generic
  INTERNAL_ERROR: 'Internal server error',
  VALIDATION_ERROR: 'Validation error',
  NOT_FOUND: (resource: string) => `${resource} not found`,

  // Authentication
  AUTH_REQUIRED: 'Authentication required',
  INVALID_CREDENTIALS: 'Invalid email or password',
  ACCOUNT_LOCKED: 'Account temporarily locked due to multiple failed attempts',

  // Authorization
  PERMISSION_DENIED: 'You do not have permission to perform this action',
  ACCESS_DENIED: (resource: string) => `You do not have permission to access this ${resource}`,

  // Resources
  PRACTICE_NOT_FOUND: 'Practice not found',
  USER_NOT_FOUND: 'User not found',
  CHART_NOT_FOUND: 'Chart definition not found',

  // Conflicts
  DUPLICATE_EMAIL: 'A user with this email already exists',
  DUPLICATE_DOMAIN: 'A practice with this domain already exists',

  // Validation
  INVALID_INPUT: 'Invalid input data',
  MISSING_REQUIRED: (field: string) => `${field} is required`,
};

export function formatErrorMessage(template: string | Function, ...args: unknown[]): string {
  return typeof template === 'function' ? template(...args) : template;
}
```

2. **Update error helper**:
```typescript
// lib/api/responses/error.ts
export function NotFoundError(resource: string) {
  return new Error(ERROR_MESSAGES.NOT_FOUND(resource));
}

export function PermissionError(action?: string) {
  return new Error(action ? ERROR_MESSAGES.ACCESS_DENIED(action) : ERROR_MESSAGES.PERMISSION_DENIED);
}
```

3. **Update all APIs to use constants**:
```typescript
// Before:
throw new Error('Practice not found');

// After:
throw NotFoundError('Practice');
// or
throw new Error(ERROR_MESSAGES.PRACTICE_NOT_FOUND);
```

**Files to Create**:
- Create: `lib/api/responses/error-messages.ts`

**Files to Modify**:
- Update: `lib/api/responses/error.ts`
- Update: All API handlers using inconsistent messages

**Acceptance Criteria**:
- [ ] Error messages centralized
- [ ] All APIs use constants
- [ ] Messages are consistent and user-friendly
- [ ] No hardcoded error strings in handlers

**Estimated Time**: 0.5-1 day

---

### Phase 4 Completion Checklist

- [ ] Task 4.1: contact/route.ts standardized
- [ ] Task 4.2: appointments/route.ts standardized
- [ ] Task 4.3: Response pattern audit complete
- [ ] Task 4.4: All non-standard responses fixed
- [ ] Task 4.5: Error messages standardized
- [ ] Zero `NextResponse.json` in app/api
- [ ] All tests passing
- [ ] API contracts verified unchanged

**Phase 4 Complete**: ☐

---

## Phase 5: Eliminate Remaining Manual RBAC (Days 15-17)

**Status**: ⏳ Not Started
**Owner**: [Assign Developer]
**Goal**: Remove all manual permission checking from handlers

### Prerequisites
- Phase 2 complete (services exist with RBAC)
- Phase 3 complete (high-priority APIs refactored)

---

### Task 5.1: Audit Manual RBAC Patterns

**Instructions**:

1. **Find manual permission checks**:
```bash
cd /Users/pstewart/bcos
grep -rn "all_permissions?.some" app/api/ > /tmp/rbac-manual-checks.txt
grep -rn "is_super_admin" app/api/ >> /tmp/rbac-manual-checks.txt
grep -rn "owner_user_id ===" app/api/ >> /tmp/rbac-manual-checks.txt
cat /tmp/rbac-manual-checks.txt
```

2. **Categorize findings**:
```markdown
| File | Line | Pattern | Should Use Service? | Status |
|------|------|---------|---------------------|--------|
| practices/route.ts | 40 | all_permissions.some | Yes - practicesService | Fixed in Phase 3 |
| upload/route.ts | 131 | all_permissions.some | Yes - uploadService | Fixed in Phase 3 |
| ... | ... | ... | ... | ... |
```

3. **Identify remaining violations**:
   - Should be very few after Phase 3
   - Likely in less-used endpoints
   - May be in middleware or helper functions

4. **Create tickets for each**

**Acceptance Criteria**:
- [ ] Complete audit documented
- [ ] All violations categorized
- [ ] Plan created for each fix
- [ ] Issues created

**Estimated Time**: 2-3 hours

---

### Task 5.2: Fix Remaining Manual RBAC

**Instructions**:

For each violation found:

1. **Determine if service exists**:
   - If yes: use service method
   - If no: consider if service is needed or if middleware is appropriate

2. **Move permission logic**:
```typescript
// Before (in handler):
const canUpdate = userContext.all_permissions?.some(p =>
  p.name === 'resource:update:own' || p.name === 'resource:update:all'
) || false;

if (!canUpdate) {
  throw new Error('Permission denied');
}

// After (in service):
// Service automatically checks permissions based on userContext
// Handler just calls service
const result = await service.update(id, data); // Throws PermissionError if unauthorized
```

3. **Update handler**:
   - Remove manual check
   - Call service method
   - Let service throw appropriate errors

4. **Add service-level tests**:
```typescript
describe('ResourceService.update', () => {
  it('allows update for owner with permission', async () => {
    const context = createMockUserWithPermission('resource:update:own');
    const service = createRBACResourceService(context);
    // Test passes
  });

  it('throws PermissionError for user without permission', async () => {
    const context = createMockUserContext(); // no permissions
    const service = createRBACResourceService(context);
    await expect(service.update(id, data)).rejects.toThrow(PermissionError);
  });
});
```

**Acceptance Criteria**:
- [ ] All manual checks removed
- [ ] Service layer handles all RBAC
- [ ] Tests verify permission enforcement
- [ ] No regressions in security

**Estimated Time**: 1-2 days (depends on number of violations)

---

### Task 5.3: Create RBAC Testing Guide

**File**: `docs/api/RBAC_TESTING.md`

**Instructions**:

1. **Document testing approach**:
```markdown
# RBAC Testing Guide

## Overview
All RBAC logic should be in the service layer, not in handlers.
This guide shows how to test RBAC enforcement.

## Test Structure

### Service-Level Tests (Where RBAC is tested)

```typescript
describe('ResourceService', () => {
  describe('getResource', () => {
    it('allows super admin to access any resource', async () => {
      const context = createMockSuperAdminContext();
      const service = createRBACResourceService(context);
      const result = await service.getResource('any-id');
      expect(result).toBeDefined();
    });

    it('allows user to access their own resource', async () => {
      const context = createMockUserWithPermission('resource:read:own');
      const service = createRBACResourceService(context);
      // Create resource owned by context.user_id
      const result = await service.getResource('owned-id');
      expect(result).toBeDefined();
    });

    it('throws PermissionError for accessing other user resource', async () => {
      const context = createMockUserWithPermission('resource:read:own');
      const service = createRBACResourceService(context);
      await expect(
        service.getResource('not-owned-id')
      ).rejects.toThrow(PermissionError);
    });

    it('throws PermissionError for user without permission', async () => {
      const context = createMockUserContext(); // no permissions
      const service = createRBACResourceService(context);
      await expect(
        service.getResource('any-id')
      ).rejects.toThrow(PermissionError);
    });
  });
});
```

### Handler-Level Tests (Verify integration)

Handler tests should NOT test RBAC logic (that's in service tests).
Handler tests verify:
- Request parsing
- Service integration
- Response formatting
- Error handling

```typescript
describe('GET /api/resources/:id', () => {
  it('returns resource for authorized user', async () => {
    const context = createMockUserWithPermission('resource:read:own');
    const request = createMockRequest({ url: '/api/resources/123' });
    const response = await GET(request, context, { params: { id: '123' } });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });

  it('returns 403 for unauthorized user', async () => {
    const context = createMockUserContext(); // no permissions
    const request = createMockRequest({ url: '/api/resources/123' });
    const response = await GET(request, context, { params: { id: '123' } });

    expect(response.status).toBe(403);
  });
});
```

## Permission Test Matrix

For each service method, test these scenarios:

| User Type | Permission | Resource Ownership | Expected Result |
|-----------|------------|-------------------|-----------------|
| Super Admin | any | any | ✅ Allow |
| Org Admin | org scope | in org | ✅ Allow |
| Org Admin | org scope | outside org | ❌ Deny |
| User | own scope | owns | ✅ Allow |
| User | own scope | doesn't own | ❌ Deny |
| User | none | any | ❌ Deny |

## Common Patterns

### Testing Super Admin Bypass
```typescript
it('allows super admin regardless of ownership', async () => {
  const context = createMockSuperAdminContext();
  const service = createService(context);
  // Should succeed even if not owner
});
```

### Testing Ownership Requirements
```typescript
it('enforces ownership for :own scope permissions', async () => {
  const context = createMockUserWithPermission('resource:read:own');
  const service = createService(context);
  // Should succeed for owned resources
  // Should fail for non-owned resources
});
```

### Testing Organization Scope
```typescript
it('allows access within organization', async () => {
  const context = createMockUserWithPermission('resource:read:organization');
  // Should succeed for resources in same org
  // Should fail for resources in different org
});
```
```

2. **Add examples from existing tests**
3. **Document test helpers**
4. **Add troubleshooting section**

**Files to Create**:
- Create: `docs/api/RBAC_TESTING.md`

**Acceptance Criteria**:
- [ ] Guide is comprehensive
- [ ] Includes code examples
- [ ] Covers all permission scopes (own, organization, all)
- [ ] Documents test helpers
- [ ] Team has reviewed and approved

**Estimated Time**: 0.5 days

---

### Phase 5 Completion Checklist

- [ ] Task 5.1: RBAC audit complete
- [ ] Task 5.2: All manual RBAC removed
- [ ] Task 5.3: RBAC testing guide created
- [ ] Zero manual permission checks in handlers
- [ ] Service tests verify RBAC enforcement
- [ ] Security review passed
- [ ] Documentation complete

**Phase 5 Complete**: ☐

---

## Phase 6: Validation, Documentation & Cleanup (Days 18-20)

**Status**: ⏳ Not Started
**Owner**: [Assign Tech Lead]
**Goal**: Ensure all changes are solid, tested, and documented

### Prerequisites
- All previous phases complete
- All tests passing

---

### Task 6.1: Comprehensive Testing

**Instructions**:

1. **Run full test suite**:
```bash
cd /Users/pstewart/bcos
pnpm test
```

2. **Run TypeScript type checking**:
```bash
pnpm tsc --noEmit
```

3. **Run linting**:
```bash
pnpm lint
```

4. **Fix all errors**:
   - TypeScript errors: 0
   - Lint errors: 0
   - Lint warnings: document any that can't be fixed

5. **Check test coverage**:
```bash
pnpm test:coverage
```
   - Target: >85% coverage for API routes
   - Target: >90% coverage for services

6. **Run integration tests**:
```bash
pnpm test:integration
```

7. **Manual testing checklist**:
   - [ ] Test login flow
   - [ ] Test RBAC enforcement (try different user roles)
   - [ ] Test file uploads
   - [ ] Test search
   - [ ] Test practices CRUD
   - [ ] Test users CRUD
   - [ ] Test analytics endpoints

**Acceptance Criteria**:
- [ ] All tests passing (unit, integration)
- [ ] TypeScript errors: 0
- [ ] Lint errors: 0
- [ ] Test coverage >85% for APIs
- [ ] Test coverage >90% for services
- [ ] Manual testing complete

**Estimated Time**: 1 day

---

### Task 6.2: Performance Testing

**Instructions**:

1. **Baseline metrics** (from before refactor):
```bash
# If you have metrics from before, document them
# If not, run against main branch first
```

2. **Run performance benchmarks**:
```bash
# Example using Apache Bench
ab -n 1000 -c 10 http://localhost:3000/api/practices
ab -n 1000 -c 10 http://localhost:3000/api/users
ab -n 500 -c 5 http://localhost:3000/api/search?q=test
```

3. **Compare metrics**:
```markdown
| Endpoint | Before (avg) | After (avg) | Change | Status |
|----------|--------------|-------------|--------|--------|
| GET /api/practices | 150ms | 145ms | -3% ✅ | Improved |
| GET /api/users | 120ms | 118ms | -2% ✅ | Improved |
| GET /api/search | 280ms | 275ms | -2% ✅ | Improved |
| POST /api/upload | 1200ms | 1180ms | -2% ✅ | Improved |
```

4. **Document any regressions**:
   - If any endpoint is >10% slower, investigate
   - Optimize if possible
   - Document trade-offs (e.g., "Slightly slower but now has proper RBAC")

5. **Load testing** (optional but recommended):
```bash
# Using k6 or similar
k6 run load-test-script.js
```

**Acceptance Criteria**:
- [ ] All benchmarks run
- [ ] Metrics documented
- [ ] No >15% performance regressions
- [ ] Any regressions explained and approved
- [ ] Load testing passed (if applicable)

**Estimated Time**: 0.5 days

---

### Task 6.3: Security Audit

**Instructions**:

1. **Review RBAC implementation**:
   - [ ] All services enforce permissions
   - [ ] No permission bypasses
   - [ ] Super admin checks are secure
   - [ ] Organization boundaries respected

2. **Test permission boundaries**:
```bash
# Create test script to verify:
# - User A cannot access User B's resources
# - Org Admin A cannot access Org B's resources
# - Regular user cannot access admin endpoints
```

3. **SQL injection testing**:
   - [ ] Search API properly sanitizes input
   - [ ] All user inputs are validated
   - [ ] No raw SQL with user input

4. **Authentication testing**:
   - [ ] Protected routes require auth
   - [ ] Public routes work without auth
   - [ ] Token validation is secure
   - [ ] Session management is secure

5. **Input validation**:
   - [ ] All endpoints validate input
   - [ ] Zod schemas are comprehensive
   - [ ] Error messages don't leak sensitive data

6. **Use security scanning tools**:
```bash
# npm audit
npm audit

# If you have other tools (Snyk, etc)
# Run those as well
```

7. **Document findings**:
```markdown
# Security Audit Results

## Date: [date]
## Auditor: [name]

### Findings

#### Critical (Must Fix)
- None

#### High (Should Fix)
- None

#### Medium (Consider Fixing)
- [List any medium severity issues]

#### Low (Informational)
- [List any low severity issues]

### Conclusion
[Overall security posture assessment]
```

**Acceptance Criteria**:
- [ ] RBAC reviewed and verified
- [ ] Permission boundary tests passing
- [ ] No SQL injection vulnerabilities
- [ ] Authentication/authorization secure
- [ ] Input validation comprehensive
- [ ] Security scan completed
- [ ] Audit report created
- [ ] Any critical/high issues fixed

**Estimated Time**: 1 day

---

### Task 6.4: Update Documentation

**Instructions**:

1. **Update API documentation**:
```bash
# For each changed endpoint:
# - Update request/response examples
# - Document new service layer
# - Update error responses
# - Add RBAC requirements
```

Files to update:
- [ ] `docs/api/STANDARDS.md` - finalize
- [ ] `docs/api/RBAC_TESTING.md` - finalize
- [ ] `docs/api/practices.md` - update if exists
- [ ] `docs/api/upload.md` - update if exists
- [ ] `docs/api/search.md` - update if exists
- [ ] `README.md` - update if API section exists

2. **Document service APIs**:
For each service, add JSDoc:
```typescript
/**
 * RBAC-enforced Practices Service
 *
 * Handles all practice-related operations with automatic permission enforcement.
 *
 * @example
 * ```typescript
 * const service = createRBACPracticesService(userContext);
 * const practices = await service.getPractices({ status: 'active' });
 * ```
 */
export function createRBACPracticesService(userContext: UserContext) {
  return {
    /**
     * Get practices list with automatic RBAC filtering
     *
     * - Super admins see all practices
     * - Users with practices:read:own see only their practices
     * - Users without permission see empty list
     *
     * @param filters - Optional filters for status, template, pagination
     * @returns Promise<Practice[]>
     * @throws PermissionError if user has no read permission
     */
    getPractices: async (filters: PracticeFilters): Promise<Practice[]> => {
      // ...
    },
  };
}
```

3. **Update architecture diagrams** (if you have any):
   - Update to show service layer
   - Show RBAC enforcement flow
   - Document request/response pipeline

4. **Create migration guide**:

**File**: `docs/api/MIGRATION_GUIDE.md`

```markdown
# API Refactoring Migration Guide

## For Developers Working on This Codebase

If you were working on an API route before this refactor, here's what changed:

### What Changed

1. **Service Layer Required**
   - All database operations now go through services
   - No direct `db` imports in handlers

2. **RBAC in Services**
   - Permission checking moved to service layer
   - No manual `all_permissions.some()` checks in handlers

3. **Standard Responses**
   - Must use `createSuccessResponse`, `createPaginatedResponse`, `createErrorResponse`
   - No `NextResponse.json()` or `new Response()`

### Migration Examples

#### Example 1: Simple GET endpoint

Before:
```typescript
export async function GET(request: NextRequest) {
  const [items] = await db.select().from(table);
  return NextResponse.json({ success: true, data: items });
}
```

After:
```typescript
const getItemsHandler = async (request: NextRequest, userContext: UserContext) => {
  const service = createRBACItemsService(userContext);
  const items = await service.getItems();
  return createSuccessResponse(items);
};

export const GET = rbacRoute(getItemsHandler, {
  permission: 'items:read:organization',
  rateLimit: 'api'
});
```

[More examples...]

### How to Update Your PR

If you have a PR that touches API routes:

1. Review the gold standard: `app/api/users/route.ts`
2. Check if a service exists for your resource
   - If yes, use it
   - If no, create one (follow Phase 2 guidelines)
3. Update handler to use service
4. Use standard response helpers
5. Remove any manual RBAC checks
6. Update tests

### Need Help?

- Review `docs/api/STANDARDS.md`
- Look at examples in `app/api/users/`
- Ask in #engineering channel
```

5. **Update CONTRIBUTING.md**:
   - Add link to API standards
   - Add API development checklist
   - Reference service layer requirement

**Acceptance Criteria**:
- [ ] All API docs updated
- [ ] All services documented with JSDoc
- [ ] Architecture diagrams updated (if applicable)
- [ ] Migration guide created
- [ ] CONTRIBUTING.md updated
- [ ] Documentation reviewed by team

**Estimated Time**: 1 day

---

### Task 6.5: Create Monitoring

**Instructions**:

1. **Set up error rate alerts**:
```typescript
// Example: Add to monitoring config
{
  alerts: [
    {
      name: 'API Error Rate High',
      condition: 'error_rate > 5%',
      channels: ['slack', 'email'],
      severity: 'high'
    },
    {
      name: 'API Response Time High',
      condition: 'p95_response_time > 1000ms',
      channels: ['slack'],
      severity: 'medium'
    }
  ]
}
```

2. **Create dashboards**:
```markdown
Dashboard: API Performance
- Request rate by endpoint
- Response time (p50, p95, p99)
- Error rate by endpoint
- RBAC permission denials
- Service layer performance
```

3. **Set up logging aggregation**:
```typescript
// Ensure structured logging is aggregated
// - All API requests logged
// - Performance metrics logged
// - Errors logged with context
// - RBAC decisions logged
```

4. **Create runbook**:

**File**: `docs/operations/API_RUNBOOK.md`

```markdown
# API Operations Runbook

## Alerts

### API Error Rate High
**Trigger**: Error rate >5% for 5 minutes
**Severity**: High
**Response**:
1. Check error logs in [log aggregation tool]
2. Identify which endpoint(s) are failing
3. Check recent deployments
4. Review error patterns
5. Roll back if necessary

### API Response Time High
**Trigger**: p95 response time >1s for 10 minutes
**Severity**: Medium
**Response**:
1. Check database performance
2. Check service layer queries
3. Review recent changes
4. Consider caching if appropriate

[More runbook entries...]

## Common Issues

### "Permission denied" errors increasing
**Symptoms**: Spike in 403 responses
**Possible Causes**:
- RBAC changes deployed
- User permissions changed
- Bug in permission checking
**Resolution**:
1. Check recent RBAC changes
2. Review permission definitions
3. Test with affected user role
[...]

[More common issues...]
```

5. **Document metrics**:
```markdown
# API Metrics

## Key Metrics to Monitor

### Performance
- Response time (p50, p95, p99)
- Request rate
- Service layer overhead

### Reliability
- Error rate
- Success rate
- Uptime

### Security
- Authentication failures
- Permission denials
- Suspicious patterns

### Business
- API usage by endpoint
- User activity
- Feature adoption
```

**Acceptance Criteria**:
- [ ] Error rate alerts configured
- [ ] Performance alerts configured
- [ ] Dashboards created
- [ ] Logging aggregation verified
- [ ] Runbook created
- [ ] Metrics documented
- [ ] Team trained on monitoring

**Estimated Time**: 0.5-1 day

---

### Task 6.6: Final Code Review

**Instructions**:

1. **Review all changed files**:
```bash
# Get list of all files changed
git diff main --name-only

# Review each one
```

2. **Check for consistency**:
   - [ ] All handlers follow same structure
   - [ ] All imports in consistent order
   - [ ] All handlers use service layer
   - [ ] All responses use standard helpers
   - [ ] All errors handled consistently

3. **Check for type safety**:
   - [ ] No `any` types
   - [ ] All functions typed
   - [ ] All parameters typed
   - [ ] Return types explicit

4. **Check for code quality**:
   - [ ] No duplicate code
   - [ ] Functions are small and focused
   - [ ] Clear variable names
   - [ ] Comments where needed
   - [ ] No TODO comments left

5. **Check for security**:
   - [ ] No hardcoded secrets
   - [ ] No console.log with sensitive data
   - [ ] Input validation everywhere
   - [ ] RBAC enforced everywhere

6. **Create review checklist**:
```markdown
## Final Review Checklist

### Structure
- [ ] Handler follows template
- [ ] Imports in correct order
- [ ] Named handler function
- [ ] Performance logging

### Service Layer
- [ ] Uses service for all DB operations
- [ ] No direct db imports
- [ ] Service handles RBAC
- [ ] Service tests complete

### Responses
- [ ] Uses createSuccessResponse
- [ ] Uses createPaginatedResponse
- [ ] Uses createErrorResponse
- [ ] No NextResponse.json

### Error Handling
- [ ] Comprehensive try-catch
- [ ] Structured error logging
- [ ] Appropriate error types
- [ ] User-friendly messages

### Type Safety
- [ ] No any types
- [ ] Return types specified
- [ ] Parameters typed
- [ ] Strict mode compliant

### Testing
- [ ] Unit tests complete
- [ ] Integration tests complete
- [ ] RBAC tests complete
- [ ] Coverage >85%

### Documentation
- [ ] JSDoc comments
- [ ] Complex logic explained
- [ ] API docs updated
```

7. **Get team approval**:
   - Schedule final review meeting
   - Walk through major changes
   - Address any concerns
   - Get sign-off

**Acceptance Criteria**:
- [ ] All files reviewed
- [ ] Consistency verified
- [ ] Type safety verified
- [ ] Code quality verified
- [ ] Security verified
- [ ] Review checklist complete
- [ ] Team approval obtained

**Estimated Time**: 0.5-1 day

---

### Phase 6 Completion Checklist

- [ ] Task 6.1: Comprehensive testing complete
- [ ] Task 6.2: Performance testing complete
- [ ] Task 6.3: Security audit complete
- [ ] Task 6.4: Documentation updated
- [ ] Task 6.5: Monitoring deployed
- [ ] Task 6.6: Final review approved
- [ ] All metrics green
- [ ] Team trained
- [ ] Ready for production

**Phase 6 Complete**: ☐

---

## Success Metrics

### Track These Throughout Rollout

#### Code Quality Metrics
```markdown
| Metric | Before | Target | Current | Status |
|--------|--------|--------|---------|--------|
| Average handler LOC | 150 | <100 | - | ⏳ |
| Direct db imports | 15+ | 0 | - | ⏳ |
| Manual RBAC checks | 10+ | 0 | - | ⏳ |
| Test coverage | 65% | >85% | - | ⏳ |
| TypeScript errors | 0 | 0 | - | ⏳ |
| Use of `any` | 5+ | 0 | - | ⏳ |
```

#### Performance Metrics
```markdown
| Endpoint | Before | Target | Current | Status |
|----------|--------|--------|---------|--------|
| GET /api/practices | 150ms | <200ms | - | ⏳ |
| GET /api/users | 120ms | <200ms | - | ⏳ |
| GET /api/search | 280ms | <300ms | - | ⏳ |
| POST /api/upload | 1200ms | <1500ms | - | ⏳ |
```

#### Process Metrics
```markdown
| Metric | Target | Status |
|--------|--------|--------|
| APIs following gold standard | 100% | ⏳ |
| APIs with service layer | 100% | ⏳ |
| Standardized responses | 100% | ⏳ |
| Documentation coverage | 100% | ⏳ |
```

### Update This Section Weekly
Add current status and notes each week.

---

## Rollback Plan

### When to Rollback

Trigger rollback if:
- API error rate increases >10%
- Performance degrades >15%
- Critical bugs in production
- Test coverage drops below 80%
- Security vulnerabilities discovered

### How to Rollback

#### Per-Phase Rollback
```bash
# Rollback Phase 3 (example)
git checkout main
git revert [first-commit-of-phase-3]..[last-commit-of-phase-3]
git push

# Or restore from tag
git checkout phase-2-complete
git checkout -b rollback/phase-3
git push origin rollback/phase-3
# Deploy rollback branch
```

#### Complete Rollback
```bash
# Rollback entire refactor
git checkout [commit-before-phase-1]
git checkout -b rollback/api-standardization
git push origin rollback/api-standardization
# Deploy rollback branch
```

### Post-Rollback Actions
1. Document what went wrong
2. Create issue for problem
3. Plan remediation
4. Schedule fix
5. Test thoroughly before retry

---

## Phase Progress Tracker

### Overall Progress

```
Phase 1: Foundation          [██████████] 100% ✅ Complete (2025-01-07)
Phase 2: Service Layer       [          ] 0% ⏳ Ready to Start
Phase 3: Refactor APIs       [          ] 0% ⏳ Not Started
Phase 4: Response Patterns   [          ] 0% ⏳ Not Started
Phase 5: Eliminate RBAC      [          ] 0% ⏳ Not Started
Phase 6: Validation          [          ] 0% ⏳ Not Started

Overall Progress:            [█▌        ] 17% (1/6 phases complete)
```

### Update After Each Task
Replace the progress bars as tasks complete.

Example after Phase 1:
```
Phase 1: Foundation          [██████████] 100% ✅ Complete
```

---

## Team Coordination

### Roles & Responsibilities

**Phase Lead** (All Phases)
- Coordinates work
- Reviews all PRs
- Makes technical decisions
- Updates stakeholders
- Updates this document

**Backend Developer** (Phases 2, 3, 5)
- Creates services
- Refactors APIs
- Writes tests
- Documents code

**QA Engineer** (Phases 3, 6)
- Tests all changes
- Runs integration tests
- Performs security testing
- Validates performance

**DevOps Engineer** (Phase 6)
- Sets up monitoring
- Manages deployments
- Handles rollbacks
- Configures alerts

### Communication

**Daily**:
- Standup to discuss progress and blockers
- Update GitHub project board
- Review PRs from previous day

**Weekly**:
- Phase retrospective
- Metrics review
- Stakeholder update
- Update this document

**Phase Completion**:
- Phase demo
- Phase documentation review
- Lessons learned session
- Planning for next phase

---

## Notes & Lessons Learned

### Phase 1 Notes

**Completed**: 2025-01-07
**Duration**: ~4 hours
**Status**: ✅ Complete - Awaiting Team Review

**Deliverables Created**:
1. `docs/api/STANDARDS.md` - Comprehensive API standards (350+ lines)
   - Gold standard template
   - Complete examples for 5 patterns
   - Anti-patterns section
   - Quick reference checklist

2. `lib/api/templates/handler-template.ts` - Copyable template (550+ lines)
   - List endpoint example
   - Detail endpoint example
   - Create endpoint example
   - Update endpoint example
   - Delete endpoint example
   - Public endpoint bonus pattern

3. `docs/api/LINTING.md` + Updated `biome.json`
   - Configured Biome for API routes
   - Enforces noExplicitAny
   - Documented manual review requirements
   - Created code review checklist

4. `lib/api/testing/api-test-helpers.ts` - Testing utilities (450+ lines)
   - Mock request creation
   - Mock UserContext factories (5 variants)
   - Response assertion helpers (6 helpers)
   - Integrates with existing test infrastructure

5. `lib/api/testing/EXAMPLE_TEST.md` - Testing examples
   - Unit testing examples
   - Integration testing examples
   - RBAC testing examples
   - Best practices guide

**Key Decisions**:
- Used Biome instead of ESLint (project standard)
- Biome has limitations - some checks require manual code review
- Created comprehensive docs to compensate for automation gaps
- Integrated with existing test infrastructure (didn't duplicate)

**Challenges**:
- Biome doesn't support custom AST rules like ESLint
- Can't automatically detect manual RBAC checks or direct db imports
- Solved with detailed code review checklists in LINTING.md

**What Worked Well**:
- Comprehensive documentation approach
- Real examples from actual codebase (users API)
- Integration with existing test helpers
- Clear separation between unit and integration test patterns

**Next Steps**:
- Team review and feedback
- Training session using STANDARDS.md
- Commit to main
- Begin Phase 2 (Service Layer Creation)

### Phase 2 Notes
[Add notes here as you go]

### Phase 3 Notes
[Add notes here as you go]

### Phase 4 Notes
[Add notes here as you go]

### Phase 5 Notes
[Add notes here as you go]

### Phase 6 Notes
[Add notes here as you go]

---

## Handoff Information

### If You Need to Hand Off Mid-Stream

**Current Owner**: [Your Name]
**New Owner**: [New Developer Name]
**Handoff Date**: [Date]

**What's Been Completed**:
- [List completed phases and tasks]

**What's In Progress**:
- [List current tasks]

**What's Remaining**:
- [List remaining tasks]

**Key Context**:
- [Any important context the new developer needs]

**Open Questions**:
- [Any unresolved questions or decisions]

**PRs to Review**:
- [List any pending PRs]

---

**Last Updated**: 2025-01-07
**Status**: Ready to Begin
**Next Action**: Assign Phase Lead and start Phase 1
