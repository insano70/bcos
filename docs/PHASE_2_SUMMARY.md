# Phase 2: Service Layer Creation - Summary

**Status**: ⏳ Ready to Start
**Estimated Duration**: 4-5 days
**Prerequisites**: Phase 1 Complete ✅
**Last Updated**: 2025-01-07

---

## Overview

Phase 2 focuses on creating missing service layers for APIs that currently do direct database operations. This is the foundation for Phase 3, where we'll refactor the handlers to use these services.

---

## Goals

1. **Create Practices Service** - Replace 100+ lines of direct DB queries and manual RBAC
2. **Create Search Service** - Extract 320+ lines of complex SQL and helper functions
3. **Create Upload Service** - Consolidate 400+ lines of inline upload logic
4. **Enhance Charts Service** - Add missing CRUD methods

---

## Task Breakdown

### Task 2.1: Practices Service (1-2 days)

**Create**: `lib/services/rbac-practices-service.ts`

**Implement**:
- `getPractices(filters)` - List with RBAC filtering
- `getPracticeById(id)` - Single with ownership checks
- `getPracticeCount(filters)` - Count for pagination
- `createPractice(data)` - Super admin only
- `updatePractice(id, data)` - Owner or super admin
- `deletePractice(id)` - Soft delete, super admin only

**Extract From**:
- `app/api/practices/route.ts` (lines 30-61, 70-87, 110-178)
- `app/api/practices/[id]/route.ts` (lines 18-29, 60-104, 132-163)

**Test Coverage Target**: >80%

**Reference**: `lib/services/rbac-users-service.ts` for pattern

---

### Task 2.2: Search Service (2 days)

**Create**: `lib/services/rbac-search-service.ts`

**Implement**:
- `search(filters)` - Main search with RBAC
- Private: `searchUsers()` - User search
- Private: `searchPractices()` - Practice search
- Private: `searchStaff()` - Staff search
- Private: `searchTemplates()` - Template search
- Private: `calculateRelevanceScore()` - Scoring algorithm
- Private: `generateSearchSuggestions()` - No results helper

**Extract From**:
- `app/api/search/route.ts` (entire file, 320+ lines)
- Lines 62-96: User search logic
- Lines 99-131: Practice search logic
- Lines 134-164: Staff search logic
- Lines 167-201: Template search logic
- Lines 238-315: Helper functions

**Key Improvements**:
- Fix type safety (remove `any` on line 27)
- Centralize RBAC checking
- Extract helper functions
- Simplify handler to <50 lines

**Test Coverage Target**: >75%

---

### Task 2.3: Upload Service (1.5-2 days)

**Create**: `lib/services/upload-service.ts`

**Implement**:
- `uploadFiles(files, options)` - S3 upload
- `updatePracticeImage(practiceId, imageType, url)` - Logo/hero
- `updateGalleryImages(practiceId, url)` - Gallery append
- `updateStaffPhoto(practiceId, staffId, url)` - Staff photos
- Private: `checkPracticePermission(practiceId, permission)` - Consolidated check

**Extract From**:
- `app/api/upload/route.ts` (400+ lines)
- Lines 96-255: Practice image logic (repeated 3x)
- Lines 110-190: Gallery logic
- Lines 258-344: Staff photo logic
- Lines 113, 197, 267: Inline imports (move to top)

**Key Improvements**:
- Consolidate repeated permission checks
- Remove inline imports
- Eliminate duplicate code
- Reduce handler from 400+ to <100 lines

**Test Coverage Target**: >80%

---

### Task 2.4: Enhance Charts Service (0.5 days)

**Update**: `lib/services/rbac-charts-service.ts`

**Add Missing Methods** (if not present):
- `getChartById(chartId)` - Single chart retrieval
- `updateChart(chartId, data)` - Update operations
- `deleteChart(chartId)` - Soft delete

**Extract From**:
- `app/api/admin/analytics/charts/[chartId]/route.ts` (lines 29-34, 73-80)

**Test Coverage Target**: Maintain >80%

---

## Service Pattern Template

All services should follow this structure:

```typescript
import { db, [tables] } from '@/lib/db';
import { eq, and, isNull } from 'drizzle-orm';
import type { UserContext } from '@/lib/types/rbac';
import { NotFoundError, PermissionError } from '@/lib/api/responses/error';

export interface [Resource]ServiceInterface {
  get[Resources](filters: Filters): Promise<Resource[]>;
  get[Resource]ById(id: string): Promise<Resource | null>;
  get[Resource]Count(filters?: Filters): Promise<number>;
  create[Resource](data: CreateData): Promise<Resource>;
  update[Resource](id: string, data: UpdateData): Promise<Resource>;
  delete[Resource](id: string): Promise<boolean>;
}

export function createRBAC[Resource]Service(
  userContext: UserContext
): [Resource]ServiceInterface {
  // Check permissions once at creation
  const canReadAll = userContext.all_permissions?.some(p =>
    p.name === '[resource]:read:all'
  ) || userContext.is_super_admin;

  return {
    async get[Resources](filters) {
      // Apply RBAC filtering
      // Execute query
      // Return results
    },

    async get[Resource]ById(id) {
      const resource = await db.select()...;

      if (!resource) return null;

      // Check access
      if (!canReadAll && resource.user_id !== userContext.user_id) {
        throw PermissionError('Access denied');
      }

      return resource;
    },

    // ... other methods
  };
}
```

---

## Testing Requirements

### For Each Service:

**Unit Tests**:
- ✅ Happy path for all methods
- ✅ RBAC enforcement (super admin, org admin, regular user)
- ✅ Permission denied scenarios
- ✅ Not found scenarios
- ✅ Edge cases (empty results, invalid input)

**Test Structure**:
```typescript
describe('RBAC[Resource]Service', () => {
  describe('get[Resources]', () => {
    it('returns all for super admin', async () => {});
    it('returns only owned for regular user', async () => {});
    it('filters by parameters', async () => {});
    it('returns empty array for no permission', async () => {});
  });

  describe('get[Resource]ById', () => {
    it('returns resource for owner', async () => {});
    it('throws PermissionError for non-owner', async () => {});
    it('returns null for not found', async () => {});
  });

  // ... tests for all methods
});
```

---

## Acceptance Criteria

### Per-Service Checklist:

- [ ] Service implements all required methods
- [ ] All RBAC logic is in service (no manual checks needed)
- [ ] Service throws appropriate errors (NotFoundError, PermissionError)
- [ ] Test coverage >80%
- [ ] All tests passing
- [ ] TypeScript strict mode compliant
- [ ] No `any` types used
- [ ] Documented with JSDoc comments
- [ ] Follows established patterns from rbac-users-service

### Phase 2 Completion Checklist:

- [ ] Task 2.1: Practices service complete with tests
- [ ] Task 2.2: Search service complete with tests
- [ ] Task 2.3: Upload service complete with tests
- [ ] Task 2.4: Charts service enhanced
- [ ] All service tests passing
- [ ] Test coverage >80% for all services
- [ ] Services documented with JSDoc
- [ ] Code review completed
- [ ] Services merged to main

---

## Reference Files

**Study these before starting**:

1. **Gold Standard Service**: `lib/services/rbac-users-service.ts`
   - Complete CRUD implementation
   - RBAC filtering pattern
   - Error handling
   - Test structure

2. **Existing Services**:
   - `lib/services/rbac-data-sources-service.ts`
   - `lib/services/rbac-charts-service.ts`
   - `lib/services/rbac-dashboards-service.ts`

3. **Current Problem APIs**:
   - `app/api/practices/route.ts` (practices service)
   - `app/api/search/route.ts` (search service)
   - `app/api/upload/route.ts` (upload service)
   - `app/api/admin/analytics/charts/[chartId]/route.ts` (charts enhancement)

---

## Common Patterns to Follow

### 1. Permission Checking at Service Creation

```typescript
export function createRBACResourceService(userContext: UserContext) {
  // Check permissions ONCE at creation
  const canReadAll = userContext.all_permissions?.some(p =>
    p.name === 'resource:read:all'
  ) || userContext.is_super_admin;

  const canReadOwn = userContext.all_permissions?.some(p =>
    p.name === 'resource:read:own'
  );

  return {
    // Use these checks in methods
  };
}
```

### 2. RBAC Filtering in Queries

```typescript
async getResources(filters) {
  const whereConditions = [isNull(table.deleted_at)];

  // Apply RBAC filtering
  if (!canReadAll) {
    if (canReadOwn) {
      whereConditions.push(eq(table.user_id, userContext.user_id));
    } else {
      return []; // No permission
    }
  }

  // Add other filters
  if (filters.status) {
    whereConditions.push(eq(table.status, filters.status));
  }

  const results = await db
    .select()
    .from(table)
    .where(and(...whereConditions));

  return results;
}
```

### 3. Throwing Appropriate Errors

```typescript
async getResourceById(id) {
  const resource = await db.select()...;

  if (!resource) {
    throw NotFoundError('Resource'); // 404
  }

  // Check ownership
  if (!canReadAll && resource.user_id !== userContext.user_id) {
    throw PermissionError('Access denied'); // 403
  }

  return resource;
}
```

### 4. Create Operations

```typescript
async createResource(data) {
  // Check permission
  if (!canCreate) {
    throw PermissionError('You cannot create resources');
  }

  // Validate uniqueness
  const existing = await db.select()
    .from(table)
    .where(eq(table.email, data.email));

  if (existing.length > 0) {
    throw ConflictError('Resource already exists'); // 409
  }

  // Create
  const [created] = await db
    .insert(table)
    .values({
      ...data,
      created_by: userContext.user_id,
      created_at: new Date()
    })
    .returning();

  return created;
}
```

---

## Tips for Success

### 1. Start with Simplest Service

**Recommended order**:
1. Charts service enhancement (easiest - just adding methods)
2. Practices service (medium - standard CRUD)
3. Upload service (medium - consolidating repeated logic)
4. Search service (hardest - complex queries and helpers)

### 2. Test as You Go

Don't wait until the end to write tests:
- Write interface first
- Implement one method
- Write tests for that method
- Repeat for next method

### 3. Extract Incrementally

When extracting from handlers:
1. Copy logic to service
2. Simplify and clean up
3. Add type safety
4. Add RBAC checks
5. Test thoroughly
6. Don't modify handler yet (that's Phase 3)

### 4. Use Existing Patterns

When in doubt, check `rbac-users-service.ts`:
- Method signatures
- Error handling
- RBAC patterns
- Query structure

---

## Potential Challenges

### Challenge 1: Complex RBAC in Search

**Problem**: Search has different RBAC rules for each entity type

**Solution**: Check permissions at service creation, use flags:
```typescript
const canReadUsers = userContext.all_permissions?.some(...);
const canReadPractices = userContext.all_permissions?.some(...);

// In search method:
if (canReadUsers) {
  results.users = await this.searchUsers(query);
}
```

### Challenge 2: Upload Service State

**Problem**: Upload has many variations (practice, staff, gallery)

**Solution**: Create separate methods for each:
```typescript
return {
  uploadFiles: async (files, options) => {},
  updatePracticeImage: async (practiceId, type, url) => {},
  updateGalleryImages: async (practiceId, url) => {},
  updateStaffPhoto: async (practiceId, staffId, url) => {},
};
```

### Challenge 3: Inline Imports in Upload

**Problem**: Upload handler has inline imports for performance

**Solution**: Move all imports to top of service file. The performance concern was about loading DB in every request, but services are only created when needed.

---

## Next Steps After Phase 2

Once all services are created and tested:

1. **Phase 3**: Refactor handlers to use services
   - Practices API
   - Search API
   - Upload API
   - Charts detail API

2. **Phase 4**: Standardize response patterns
   - Contact form
   - Appointments
   - Other non-standard APIs

3. **Phase 5**: Eliminate remaining manual RBAC

---

## Questions?

- Review [docs/api/STANDARDS.md](api/STANDARDS.md) for handler patterns
- Study `lib/services/rbac-users-service.ts` for service patterns
- Check test files in `tests/integration/rbac/` for testing patterns
- Ask in #engineering for clarification

---

**Ready to begin?** Start with Task 2.1 (Practices Service) or Task 2.4 (Charts Enhancement - easiest)
