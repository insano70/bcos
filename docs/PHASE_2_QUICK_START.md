# Phase 2: Quick Start Guide

**Current Status**: Phase 1 Complete ✅ → Phase 2 Ready to Start

---

## What You Need to Do

Create 3 new services + enhance 1 existing service:

1. ✅ **Practices Service** - `lib/services/rbac-practices-service.ts`
2. ✅ **Search Service** - `lib/services/rbac-search-service.ts`
3. ✅ **Upload Service** - `lib/services/upload-service.ts`
4. ✅ **Charts Service** - Enhance `lib/services/rbac-charts-service.ts`

---

## Quick Decision Tree

### "Where do I start?"

**Choose based on your comfort level:**

- 🟢 **Easy**: Start with **Task 2.4** (Charts enhancement)
  - Just add 3 missing methods to existing service
  - ~0.5 days

- 🟡 **Medium**: Start with **Task 2.1** (Practices service)
  - Standard CRUD pattern
  - Clear examples to follow
  - ~1-2 days

- 🔴 **Hard**: Tackle **Task 2.2** (Search service)
  - Complex queries
  - Multiple entity types
  - Helper functions
  - ~2 days

---

## Phase 2 Todos Breakdown

```
📋 Phase 2 Checklist:

Service Creation:
□ Task 2.1: Create rbac-practices-service.ts
□ Task 2.1: Add tests for practices service (>80%)
□ Task 2.2: Create rbac-search-service.ts
□ Task 2.2: Add tests for search service (>75%)
□ Task 2.3: Create upload-service.ts
□ Task 2.3: Add tests for upload service (>80%)
□ Task 2.4: Enhance rbac-charts-service.ts

Final Review:
□ All services consistent
□ All tests passing (>80% coverage)
□ Code review approval
□ Merge to main
```

---

## Each Service Needs

### Required Methods (CRUD):
```typescript
export function createRBAC[Resource]Service(userContext: UserContext) {
  return {
    // READ operations
    get[Resources]: async (filters) => Resource[],
    get[Resource]ById: async (id: string) => Resource | null,
    get[Resource]Count: async (filters?) => number,

    // WRITE operations
    create[Resource]: async (data) => Resource,
    update[Resource]: async (id, data) => Resource,
    delete[Resource]: async (id) => boolean,
  };
}
```

### Required Tests:
```typescript
describe('RBAC[Resource]Service', () => {
  describe('get[Resources]', () => {
    it('returns all for super admin');
    it('returns only owned for regular user');
    it('returns empty for no permission');
  });

  describe('get[Resource]ById', () => {
    it('returns for owner');
    it('throws PermissionError for non-owner');
    it('returns null for not found');
  });

  // ... tests for create, update, delete
});
```

---

## Copy-Paste Starter Template

```typescript
// lib/services/rbac-[resource]-service.ts
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
  // Check permissions once
  const canReadAll = userContext.all_permissions?.some(p =>
    p.name === '[resource]:read:all'
  ) || userContext.is_super_admin;

  const canReadOwn = userContext.all_permissions?.some(p =>
    p.name === '[resource]:read:own'
  );

  const canCreate = userContext.all_permissions?.some(p =>
    p.name === '[resource]:create:organization'
  ) || userContext.is_super_admin;

  const canUpdate = userContext.all_permissions?.some(p =>
    p.name === '[resource]:update:own' || p.name === '[resource]:update:all'
  ) || userContext.is_super_admin;

  const canDelete = userContext.all_permissions?.some(p =>
    p.name === '[resource]:delete:organization'
  ) || userContext.is_super_admin;

  return {
    async get[Resources](filters) {
      const whereConditions = [isNull([table].deleted_at)];

      // Apply RBAC
      if (!canReadAll) {
        if (canReadOwn) {
          whereConditions.push(eq([table].user_id, userContext.user_id));
        } else {
          return []; // No permission
        }
      }

      // Add filters
      // ...

      const results = await db
        .select()
        .from([table])
        .where(and(...whereConditions));

      return results;
    },

    async get[Resource]ById(id) {
      const [resource] = await db
        .select()
        .from([table])
        .where(eq([table].[id_column], id));

      if (!resource) return null;

      // Check access
      if (!canReadAll && resource.user_id !== userContext.user_id) {
        throw PermissionError('Access denied');
      }

      return resource;
    },

    async get[Resource]Count(filters) {
      // Similar to get[Resources] but return count
    },

    async create[Resource](data) {
      if (!canCreate) {
        throw PermissionError('Cannot create [resource]');
      }

      const [created] = await db
        .insert([table])
        .values({
          ...data,
          created_by: userContext.user_id,
          created_at: new Date()
        })
        .returning();

      return created;
    },

    async update[Resource](id, data) {
      if (!canUpdate) {
        throw PermissionError('Cannot update [resource]');
      }

      // Get existing
      const existing = await this.get[Resource]ById(id);
      if (!existing) {
        throw NotFoundError('[Resource]');
      }

      // Check ownership for non-super-admins
      if (!userContext.is_super_admin && existing.user_id !== userContext.user_id) {
        throw PermissionError('Cannot update [resource]');
      }

      const [updated] = await db
        .update([table])
        .set({ ...data, updated_at: new Date() })
        .where(eq([table].[id_column], id))
        .returning();

      return updated;
    },

    async delete[Resource](id) {
      if (!canDelete) {
        throw PermissionError('Cannot delete [resource]');
      }

      // Soft delete
      await db
        .update([table])
        .set({ deleted_at: new Date() })
        .where(eq([table].[id_column], id));

      return true;
    },
  };
}
```

---

## Test Template

```typescript
// lib/services/__tests__/rbac-[resource]-service.test.ts
import { describe, it, expect } from 'vitest';
import '@/tests/setup/integration-setup';
import { createTest[Resource] } from '@/tests/factories';
import { createUserWithPermissions, buildUserContext } from '@/tests/helpers/rbac-helper';
import { createRBAC[Resource]Service } from '../rbac-[resource]-service';

describe('RBAC[Resource]Service', () => {
  describe('get[Resources]', () => {
    it('returns all [resources] for super admin', async () => {
      const [resource]1 = await createTest[Resource]();
      const [resource]2 = await createTest[Resource]();

      const superAdmin = await createUserWithPermissions(['[resource]:read:all']);
      const context = await buildUserContext(superAdmin);

      const service = createRBAC[Resource]Service(context);
      const results = await service.get[Resources]({});

      expect(results.length).toBeGreaterThanOrEqual(2);
    });

    it('returns only owned [resources] for regular user', async () => {
      const user = await createUserWithPermissions(['[resource]:read:own']);
      const context = await buildUserContext(user);

      const owned = await createTest[Resource]({ user_id: user.user_id });
      const notOwned = await createTest[Resource]();

      const service = createRBAC[Resource]Service(context);
      const results = await service.get[Resources]({});

      const ids = results.map(r => r.[id_column]);
      expect(ids).toContain(owned.[id_column]);
      expect(ids).not.toContain(notOwned.[id_column]);
    });

    it('returns empty array for user without permission', async () => {
      const user = await createUserWithPermissions([]);
      const context = await buildUserContext(user);

      const service = createRBAC[Resource]Service(context);
      const results = await service.get[Resources]({});

      expect(results).toEqual([]);
    });
  });

  describe('get[Resource]ById', () => {
    it('returns [resource] for owner', async () => {
      const user = await createUserWithPermissions(['[resource]:read:own']);
      const context = await buildUserContext(user);

      const [resource] = await createTest[Resource]({ user_id: user.user_id });

      const service = createRBAC[Resource]Service(context);
      const result = await service.get[Resource]ById([resource].[id_column]);

      expect(result).toBeDefined();
      expect(result?.[id_column]).toBe([resource].[id_column]);
    });

    it('throws PermissionError for non-owner', async () => {
      const user = await createUserWithPermissions(['[resource]:read:own']);
      const context = await buildUserContext(user);

      const [resource] = await createTest[Resource](); // Different owner

      const service = createRBAC[Resource]Service(context);

      await expect(
        service.get[Resource]ById([resource].[id_column])
      ).rejects.toThrow('Access denied');
    });

    it('returns null for non-existent [resource]', async () => {
      const user = await createUserWithPermissions(['[resource]:read:all']);
      const context = await buildUserContext(user);

      const service = createRBAC[Resource]Service(context);
      const result = await service.get[Resource]ById('non-existent-id');

      expect(result).toBeNull();
    });
  });

  // Add tests for create, update, delete...
});
```

---

## Where to Find Help

### 📖 Documentation:
- Full details: [docs/PHASE_2_SUMMARY.md](PHASE_2_SUMMARY.md)
- API standards: [docs/api/STANDARDS.md](api/STANDARDS.md)
- Master plan: [docs/api_standardization.md](api_standardization.md)

### 💡 Examples:
- **Service pattern**: `lib/services/rbac-users-service.ts`
- **Test pattern**: `tests/integration/rbac/users-service.test.ts`
- **Current problem code**:
  - `app/api/practices/route.ts` (practices)
  - `app/api/search/route.ts` (search)
  - `app/api/upload/route.ts` (upload)

### 🤔 Questions:
- Ask in #engineering Slack channel
- Tag @api-standards-team in PR

---

## Success Criteria

**You're done with Phase 2 when:**

✅ All 4 services created/enhanced
✅ All tests passing with >80% coverage
✅ No `any` types
✅ TypeScript strict mode passes
✅ Code review approved
✅ Merged to main

**Then move to Phase 3**: Refactor handlers to use these services

---

## Time Estimates

- **Task 2.1** (Practices): 1-2 days
- **Task 2.2** (Search): 2 days
- **Task 2.3** (Upload): 1.5-2 days
- **Task 2.4** (Charts): 0.5 days

**Total**: 4-5 days

---

**Ready?** Pick your starting task and go! 🚀
