/**
 * Unit tests for BaseCrudService
 *
 * Tests the generic CRUD service infrastructure with mocked database and RBAC.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PgTable, TableConfig } from 'drizzle-orm/pg-core';

import { BaseCrudService } from '@/lib/services/crud/base-crud-service';
import type { CrudServiceConfig } from '@/lib/services/crud/types';
import type { PermissionName, UserContext } from '@/lib/types/rbac';
import { DatabaseError, NotFoundError } from '@/lib/errors/domain-errors';

// Mock dependencies
vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/lib/logger', () => ({
  log: {
    info: vi.fn(),
    error: vi.fn(),
  },
  logTemplates: {
    crud: {
      list: vi.fn(() => ({ message: 'list', context: {} })),
      read: vi.fn(() => ({ message: 'read', context: {} })),
      create: vi.fn(() => ({ message: 'create', context: {} })),
      update: vi.fn(() => ({ message: 'update', context: {} })),
      delete: vi.fn(() => ({ message: 'delete', context: {} })),
    },
  },
  calculateChanges: vi.fn(() => ({})),
}));

// Mock the BaseRBACService
vi.mock('@/lib/rbac/base-service', () => ({
  BaseRBACService: class MockBaseRBACService {
    userContext: UserContext;

    constructor(userContext: UserContext) {
      this.userContext = userContext;
    }

    requireAnyPermission = vi.fn();
    requirePermission = vi.fn();
    isSuperAdmin = vi.fn(() => false);
    getAccessibleOrganizationIds = vi.fn(() => ['org-1', 'org-2']);
    canAccessOrganization = vi.fn(() => true);
  },
}));

// Get the mocked db
import { db } from '@/lib/db';

// Test entity types
interface TestEntity {
  id: string;
  name: string;
  organization_id: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

interface CreateTestData {
  name: string;
  organization_id: string;
}

interface UpdateTestData {
  name?: string;
}

// Mock table structure for testing
const mockTable = {
  id: { name: 'id' },
  name: { name: 'name' },
  organization_id: { name: 'organization_id' },
  created_at: { name: 'created_at' },
  updated_at: { name: 'updated_at' },
  deleted_at: { name: 'deleted_at' },
} as unknown as PgTable<TableConfig>;

// Use actual permission names from the system
const READ_PERMISSION = 'users:read:all' as PermissionName;
const CREATE_PERMISSION = 'users:create:all' as PermissionName;
const UPDATE_PERMISSION = 'users:update:all' as PermissionName;
const DELETE_PERMISSION = 'users:delete:all' as PermissionName;

// Concrete implementation for testing
class TestCrudService extends BaseCrudService<
  typeof mockTable,
  TestEntity,
  CreateTestData,
  UpdateTestData
> {
  protected config: CrudServiceConfig<typeof mockTable, TestEntity, CreateTestData, UpdateTestData> =
    {
      table: mockTable,
      resourceName: 'test-entities',
      displayName: 'test entity',
      primaryKeyName: 'id',
      deletedAtColumnName: 'deleted_at',
      updatedAtColumnName: 'updated_at',
      permissions: {
        read: READ_PERMISSION,
        create: CREATE_PERMISSION,
        update: UPDATE_PERMISSION,
        delete: DELETE_PERMISSION,
      },
      organizationScoping: {
        columnName: 'organization_id',
        autoFilter: true,
      },
    };
}

// Helper to create mock user context
// Note: We use a partial mock with type assertion since we only need the fields used by BaseCrudService
function createMockUserContext(overrides: Record<string, unknown> = {}): UserContext {
  return {
    user_id: 'user-123',
    email: 'test@example.com',
    first_name: 'Test',
    last_name: 'User',
    is_active: true,
    email_verified: true,
    roles: [],
    organizations: [],
    accessible_organizations: [],
    user_roles: [],
    user_organizations: [],
    all_permissions: [],
    is_super_admin: false,
    organization_admin_for: [],
    current_organization_id: 'org-1',
    ...overrides,
  } as UserContext;
}

// Helper to create mock entity
function createMockEntity(overrides: Partial<TestEntity> = {}): TestEntity {
  return {
    id: 'entity-1',
    name: 'Test Entity',
    organization_id: 'org-1',
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
    deleted_at: null,
    ...overrides,
  };
}

// Helper type for mocked db method returns
type MockedDbReturn = ReturnType<typeof db.select>;

describe('BaseCrudService', () => {
  let service: TestCrudService;
  let userContext: UserContext;

  beforeEach(() => {
    vi.clearAllMocks();
    userContext = createMockUserContext();
    service = new TestCrudService(userContext);
  });

  describe('getList', () => {
    it('should return paginated list of entities', async () => {
      const mockEntities = [createMockEntity(), createMockEntity({ id: 'entity-2' })];

      // Setup mock chain
      const mockSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockResolvedValue(mockEntities),
      };

      const mockCountChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ count: 2 }]),
      };

      vi.mocked(db.select)
        .mockReturnValueOnce(mockCountChain as unknown as MockedDbReturn)
        .mockReturnValueOnce(mockSelectChain as unknown as MockedDbReturn);

      const result = await service.getList({ limit: 10, offset: 0 });

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(10);
      expect(result.hasMore).toBe(false);
    });

    it('should apply default pagination values', async () => {
      const mockSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockResolvedValue([]),
      };

      const mockCountChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ count: 0 }]),
      };

      vi.mocked(db.select)
        .mockReturnValueOnce(mockCountChain as unknown as MockedDbReturn)
        .mockReturnValueOnce(mockSelectChain as unknown as MockedDbReturn);

      const result = await service.getList();

      expect(result.pageSize).toBe(100); // Default limit
      expect(mockSelectChain.limit).toHaveBeenCalledWith(100);
      expect(mockSelectChain.offset).toHaveBeenCalledWith(0);
    });

    it('should calculate hasMore correctly', async () => {
      const mockEntities = [createMockEntity()];

      const mockSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockResolvedValue(mockEntities),
      };

      const mockCountChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ count: 10 }]),
      };

      vi.mocked(db.select)
        .mockReturnValueOnce(mockCountChain as unknown as MockedDbReturn)
        .mockReturnValueOnce(mockSelectChain as unknown as MockedDbReturn);

      const result = await service.getList({ limit: 1, offset: 0 });

      expect(result.hasMore).toBe(true);
      expect(result.total).toBe(10);
    });
  });

  describe('getById', () => {
    it('should return entity when found', async () => {
      const mockEntity = createMockEntity();

      const mockSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([mockEntity]),
      };

      vi.mocked(db.select).mockReturnValue(mockSelectChain as unknown as MockedDbReturn);

      const result = await service.getById('entity-1');

      expect(result).toEqual(mockEntity);
    });

    it('should return null when entity not found', async () => {
      const mockSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      };

      vi.mocked(db.select).mockReturnValue(mockSelectChain as unknown as MockedDbReturn);

      const result = await service.getById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('getCount', () => {
    it('should return count of matching entities', async () => {
      const mockCountChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ count: 5 }]),
      };

      vi.mocked(db.select).mockReturnValue(mockCountChain as unknown as MockedDbReturn);

      const result = await service.getCount();

      expect(result).toBe(5);
    });

    it('should return 0 when no entities match', async () => {
      const mockCountChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ count: 0 }]),
      };

      vi.mocked(db.select).mockReturnValue(mockCountChain as unknown as MockedDbReturn);

      const result = await service.getCount();

      expect(result).toBe(0);
    });
  });

  describe('create', () => {
    it('should create and return new entity', async () => {
      const createData: CreateTestData = {
        name: 'New Entity',
        organization_id: 'org-1',
      };

      const createdEntity = createMockEntity({
        id: 'new-entity-id',
        name: 'New Entity',
      });

      const mockInsertChain = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([createdEntity]),
      };

      vi.mocked(db.insert).mockReturnValue(
        mockInsertChain as unknown as ReturnType<typeof db.insert>
      );

      const result = await service.create(createData);

      expect(result).toEqual(createdEntity);
      expect(db.insert).toHaveBeenCalled();
    });

    it('should throw DatabaseError when insert fails', async () => {
      const createData: CreateTestData = {
        name: 'New Entity',
        organization_id: 'org-1',
      };

      const mockInsertChain = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([]),
      };

      vi.mocked(db.insert).mockReturnValue(
        mockInsertChain as unknown as ReturnType<typeof db.insert>
      );

      await expect(service.create(createData)).rejects.toThrow(DatabaseError);
    });
  });

  describe('update', () => {
    it('should update and return entity', async () => {
      const existingEntity = createMockEntity();
      const updateData: UpdateTestData = { name: 'Updated Name' };
      const updatedEntity = { ...existingEntity, name: 'Updated Name' };

      // Mock getById for existence check
      const mockSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([existingEntity]),
      };

      vi.mocked(db.select).mockReturnValue(mockSelectChain as unknown as MockedDbReturn);

      // Mock update
      const mockUpdateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([updatedEntity]),
      };

      vi.mocked(db.update).mockReturnValue(
        mockUpdateChain as unknown as ReturnType<typeof db.update>
      );

      const result = await service.update('entity-1', updateData);

      expect(result).toEqual(updatedEntity);
    });

    it('should throw NotFoundError when entity does not exist', async () => {
      const updateData: UpdateTestData = { name: 'Updated Name' };

      const mockSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      };

      vi.mocked(db.select).mockReturnValue(mockSelectChain as unknown as MockedDbReturn);

      await expect(service.update('non-existent', updateData)).rejects.toThrow(NotFoundError);
    });
  });

  describe('delete', () => {
    it('should soft delete entity when deletedAtColumnName is configured', async () => {
      const existingEntity = createMockEntity();

      // Mock getById for existence check
      const mockSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([existingEntity]),
      };

      vi.mocked(db.select).mockReturnValue(mockSelectChain as unknown as MockedDbReturn);

      // Mock update for soft delete
      const mockUpdateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(db.update).mockReturnValue(
        mockUpdateChain as unknown as ReturnType<typeof db.update>
      );

      await service.delete('entity-1');

      expect(db.update).toHaveBeenCalled();
      expect(mockUpdateChain.set).toHaveBeenCalled();
    });

    it('should throw NotFoundError when entity does not exist', async () => {
      const mockSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      };

      vi.mocked(db.select).mockReturnValue(mockSelectChain as unknown as MockedDbReturn);

      await expect(service.delete('non-existent')).rejects.toThrow(NotFoundError);
    });
  });

  describe('organization scoping', () => {
    it('should filter by accessible organizations for non-super-admin users', async () => {
      const mockEntities = [createMockEntity()];

      const mockSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockResolvedValue(mockEntities),
      };

      const mockCountChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ count: 1 }]),
      };

      vi.mocked(db.select)
        .mockReturnValueOnce(mockCountChain as unknown as MockedDbReturn)
        .mockReturnValueOnce(mockSelectChain as unknown as MockedDbReturn);

      // Verify the service uses getAccessibleOrganizationIds
      const result = await service.getList();

      expect(result.items).toHaveLength(1);
      // The where clause should be called with org filtering
      expect(mockCountChain.where).toHaveBeenCalled();
    });
  });

  describe('validators', () => {
    it('should call beforeCreate validator when configured', async () => {
      const beforeCreateMock = vi.fn();

      // Create service with validator
      class TestServiceWithValidator extends BaseCrudService<
        typeof mockTable,
        TestEntity,
        CreateTestData,
        UpdateTestData
      > {
        protected config: CrudServiceConfig<
          typeof mockTable,
          TestEntity,
          CreateTestData,
          UpdateTestData
        > = {
          table: mockTable,
          resourceName: 'test-entities',
          displayName: 'test entity',
          primaryKeyName: 'id',
          permissions: {
            read: READ_PERMISSION,
            create: CREATE_PERMISSION,
          },
          validators: {
            beforeCreate: beforeCreateMock,
          },
        };
      }

      const serviceWithValidator = new TestServiceWithValidator(userContext);
      const createData: CreateTestData = { name: 'Test', organization_id: 'org-1' };
      const createdEntity = createMockEntity();

      const mockInsertChain = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([createdEntity]),
      };

      vi.mocked(db.insert).mockReturnValue(
        mockInsertChain as unknown as ReturnType<typeof db.insert>
      );

      await serviceWithValidator.create(createData);

      expect(beforeCreateMock).toHaveBeenCalledWith(createData, userContext);
    });
  });

  describe('hooks', () => {
    it('should call afterCreate hook when configured', async () => {
      const afterCreateMock = vi.fn().mockResolvedValue(undefined);

      class TestServiceWithHook extends BaseCrudService<
        typeof mockTable,
        TestEntity,
        CreateTestData,
        UpdateTestData
      > {
        protected config: CrudServiceConfig<
          typeof mockTable,
          TestEntity,
          CreateTestData,
          UpdateTestData
        > = {
          table: mockTable,
          resourceName: 'test-entities',
          displayName: 'test entity',
          primaryKeyName: 'id',
          permissions: {
            read: READ_PERMISSION,
            create: CREATE_PERMISSION,
          },
          hooks: {
            afterCreate: afterCreateMock,
          },
        };
      }

      const serviceWithHook = new TestServiceWithHook(userContext);
      const createData: CreateTestData = { name: 'Test', organization_id: 'org-1' };
      const createdEntity = createMockEntity();

      const mockInsertChain = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([createdEntity]),
      };

      vi.mocked(db.insert).mockReturnValue(
        mockInsertChain as unknown as ReturnType<typeof db.insert>
      );

      await serviceWithHook.create(createData);

      // Give the fire-and-forget promise a chance to resolve
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(afterCreateMock).toHaveBeenCalledWith(createdEntity, userContext);
    });
  });

  describe('transformers', () => {
    it('should use toEntity transformer when configured', async () => {
      interface CustomEntity extends TestEntity {
        customField: string;
      }

      const toEntityMock = vi.fn((row: Record<string, unknown>): CustomEntity => ({
        ...(row as unknown as TestEntity),
        customField: 'transformed',
      }));

      class TestServiceWithTransformer extends BaseCrudService<
        typeof mockTable,
        CustomEntity,
        CreateTestData,
        UpdateTestData
      > {
        protected config: CrudServiceConfig<
          typeof mockTable,
          CustomEntity,
          CreateTestData,
          UpdateTestData
        > = {
          table: mockTable,
          resourceName: 'test-entities',
          displayName: 'test entity',
          primaryKeyName: 'id',
          permissions: {
            read: READ_PERMISSION,
          },
          transformers: {
            toEntity: toEntityMock,
          },
        };
      }

      const serviceWithTransformer = new TestServiceWithTransformer(userContext);
      const mockEntity = createMockEntity();

      const mockSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([mockEntity]),
      };

      vi.mocked(db.select).mockReturnValue(mockSelectChain as unknown as MockedDbReturn);

      const result = await serviceWithTransformer.getById('entity-1');

      expect(toEntityMock).toHaveBeenCalled();
      expect(result?.customField).toBe('transformed');
    });
  });
});
