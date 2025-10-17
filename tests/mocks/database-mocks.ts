import { vi } from 'vitest';

/**
 * Database Mock Factory
 * Provides standardized database mocking for consistent test patterns
 */

export interface DbMockOptions {
  /** Default return value for select queries */
  selectResult?: unknown[];
  /** Default return value for insert operations */
  insertResult?: { insertId?: number; affectedRows?: number };
  /** Default return value for update operations */
  updateResult?: { affectedRows?: number };
  /** Default return value for delete operations */
  deleteResult?: { affectedRows?: number };
  /** Enable query method chaining */
  enableChaining?: boolean;
}

export interface MockQueryChain {
  from: ReturnType<typeof vi.fn>;
}

export interface MockUpdateChain {
  set: ReturnType<typeof vi.fn>;
}

export interface MockInsertChain {
  values: ReturnType<typeof vi.fn>;
}

export interface MockDeleteChain {
  from: ReturnType<typeof vi.fn>;
}

export interface DatabaseMock {
  db: {
    select: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  // Schema tables
  users: Record<string, string>;
  refresh_tokens: Record<string, string>;
  token_blacklist: Record<string, string>;
  blacklisted_tokens: Record<string, string>;
  user_sessions: Record<string, string>;
  login_attempts: Record<string, string>;
  account_security: Record<string, string>;
  organizations: Record<string, string>;
  roles: Record<string, string>;
  practices: Record<string, string>;
  // Mock access helpers
  _mockHelpers: {
    setSelectResult: (result: unknown[]) => void;
    setInsertResult: (result: { insertId?: number; affectedRows?: number }) => void;
    setUpdateResult: (result: { affectedRows?: number }) => void;
    setDeleteResult: (result: { affectedRows?: number }) => void;
    resetAllMocks: () => void;
  };
}

/**
 * Create a comprehensive database mock with method chaining support
 */
export function createDatabaseMock(options: DbMockOptions = {}): DatabaseMock {
  const {
    selectResult = [],
    insertResult = { insertId: 1, affectedRows: 1 },
    updateResult = { affectedRows: 1 },
    deleteResult = { affectedRows: 1 },
    enableChaining = true,
  } = options;

  // Create query chain mocks
  const createQueryChain = (result: unknown[]): MockQueryChain => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => result),
        gte: vi.fn(() => result),
        lte: vi.fn(() => result),
        orderBy: vi.fn(() => ({
          limit: vi.fn(() => result),
          offset: vi.fn(() => result),
        })),
        offset: vi.fn(() => result),
      })),
      limit: vi.fn(() => result),
      orderBy: vi.fn(() => ({
        limit: vi.fn(() => result),
        offset: vi.fn(() => result),
      })),
    })),
  });

  const createUpdateChain = (result: unknown): MockUpdateChain => ({
    set: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve(result)),
    })),
  });

  const createInsertChain = (result: unknown): MockInsertChain => ({
    values: vi.fn(() => ({
      returning: vi.fn(() => Promise.resolve(result)),
    })),
  });

  const createDeleteChain = (result: unknown): MockDeleteChain => ({
    from: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve(result)),
    })),
  });

  // Current result values (can be updated)
  let currentSelectResult = selectResult;
  let currentInsertResult = insertResult;
  let currentUpdateResult = updateResult;
  let currentDeleteResult = deleteResult;

  // Create the main database mock
  const dbMock = {
    select: vi.fn(() => createQueryChain(currentSelectResult)),
    insert: vi.fn(() => createInsertChain(currentInsertResult)),
    update: vi.fn(() => createUpdateChain(currentUpdateResult)),
    delete: vi.fn(() => createDeleteChain(currentDeleteResult)),
  };

  // Schema table definitions (commonly used in tests)
  const schemaTables = {
    users: {
      user_id: 'user_id',
      email: 'email',
      first_name: 'first_name',
      last_name: 'last_name',
      is_active: 'is_active',
      email_verified: 'email_verified',
      password_hash: 'password_hash',
      created_at: 'created_at',
      updated_at: 'updated_at',
    },
    refresh_tokens: {
      token_id: 'token_id',
      user_id: 'user_id',
      token_hash: 'token_hash',
      device_fingerprint: 'device_fingerprint',
      ip_address: 'ip_address',
      user_agent: 'user_agent',
      remember_me: 'remember_me',
      expires_at: 'expires_at',
      is_active: 'is_active',
      rotation_count: 'rotation_count',
    },
    token_blacklist: {
      jti: 'jti',
      user_id: 'user_id',
      token_type: 'token_type',
      reason: 'reason',
      expires_at: 'expires_at',
      created_at: 'created_at',
    },
    blacklisted_tokens: {
      jti: 'jti',
      user_id: 'user_id',
      expires_at: 'expires_at',
      created_at: 'created_at',
    },
    user_sessions: {
      session_id: 'session_id',
      user_id: 'user_id',
      refresh_token_id: 'refresh_token_id',
      device_fingerprint: 'device_fingerprint',
      device_name: 'device_name',
      ip_address: 'ip_address',
      user_agent: 'user_agent',
      remember_me: 'remember_me',
      is_active: 'is_active',
      created_at: 'created_at',
    },
    login_attempts: {
      attempt_id: 'attempt_id',
      email: 'email',
      user_id: 'user_id',
      ip_address: 'ip_address',
      user_agent: 'user_agent',
      success: 'success',
      failure_reason: 'failure_reason',
      created_at: 'created_at',
    },
    account_security: {
      user_id: 'user_id',
      failed_login_attempts: 'failed_login_attempts',
      last_failed_attempt: 'last_failed_attempt',
      locked_until: 'locked_until',
      suspicious_activity_detected: 'suspicious_activity_detected',
    },
    organizations: {
      organization_id: 'organization_id',
      name: 'name',
      slug: 'slug',
      parent_organization_id: 'parent_organization_id',
      is_active: 'is_active',
    },
    roles: {
      role_id: 'role_id',
      name: 'name',
      organization_id: 'organization_id',
      permissions: 'permissions',
      is_active: 'is_active',
    },
    practices: {
      practice_id: 'practice_id',
      name: 'name',
      owner_id: 'owner_id',
      organization_id: 'organization_id',
      is_active: 'is_active',
    },
  };

  // Helper functions for updating mock behavior
  const mockHelpers = {
    setSelectResult: (result: unknown[]) => {
      currentSelectResult = result;
    },
    setInsertResult: (result: { insertId?: number; affectedRows?: number }) => {
      currentInsertResult = result;
    },
    setUpdateResult: (result: { affectedRows?: number }) => {
      currentUpdateResult = result;
    },
    setDeleteResult: (result: { affectedRows?: number }) => {
      currentDeleteResult = result;
    },
    resetAllMocks: () => {
      vi.clearAllMocks();
      currentSelectResult = selectResult;
      currentInsertResult = insertResult;
      currentUpdateResult = updateResult;
      currentDeleteResult = deleteResult;
    },
  };

  return {
    db: dbMock,
    ...schemaTables,
    _mockHelpers: mockHelpers,
  };
}

/**
 * Create a simple database mock for basic testing
 */
export function createSimpleDatabaseMock(): Pick<DatabaseMock, 'db' | '_mockHelpers'> {
  const mockDb = createDatabaseMock({
    selectResult: [],
    insertResult: { insertId: 1 },
    updateResult: { affectedRows: 1 },
    deleteResult: { affectedRows: 1 },
  });

  return {
    db: mockDb.db,
    _mockHelpers: mockDb._mockHelpers,
  };
}

/**
 * Create a database mock specifically for integration tests
 */
export function createIntegrationDatabaseMock(): DatabaseMock {
  return createDatabaseMock({
    selectResult: [],
    insertResult: { insertId: 1, affectedRows: 1 },
    updateResult: { affectedRows: 1 },
    deleteResult: { affectedRows: 1 },
    enableChaining: true,
  });
}

/**
 * Vi.mock factory function for @/lib/db module
 */
export function createDbModuleMock(options: DbMockOptions = {}) {
  const dbMock = createDatabaseMock(options);

  return () => ({
    db: dbMock.db,
    users: dbMock.users,
    refresh_tokens: dbMock.refresh_tokens,
    token_blacklist: dbMock.token_blacklist,
    blacklisted_tokens: dbMock.blacklisted_tokens,
    user_sessions: dbMock.user_sessions,
    login_attempts: dbMock.login_attempts,
    account_security: dbMock.account_security,
    organizations: dbMock.organizations,
    roles: dbMock.roles,
    practices: dbMock.practices,
    // Export mock helpers for test access
    _mockDbHelpers: dbMock._mockHelpers,
  });
}
