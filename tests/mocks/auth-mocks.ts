import { vi } from 'vitest'

/**
 * Authentication Mock Factory
 * Provides standardized auth mocking for consistent test patterns
 */

export interface AuthMockOptions {
  /** Enable JWT token validation */
  enableJWT?: boolean
  /** Enable bcrypt password hashing */
  enableBcrypt?: boolean
  /** Enable session management */
  enableSessions?: boolean
  /** Enable RBAC user context */
  enableRBAC?: boolean
}

export interface JWTMocks {
  SignJWT: ReturnType<typeof vi.fn>
  jwtVerify: ReturnType<typeof vi.fn>
  nanoid: ReturnType<typeof vi.fn>
}

export interface BcryptMocks {
  hash: ReturnType<typeof vi.fn>
  compare: ReturnType<typeof vi.fn>
}

export interface TokenManagerMock {
  validateAccessToken: ReturnType<typeof vi.fn>
  createTokenPair: ReturnType<typeof vi.fn>
  refreshTokenPair: ReturnType<typeof vi.fn>
  revokeRefreshToken: ReturnType<typeof vi.fn>
  revokeAllUserTokens: ReturnType<typeof vi.fn>
  cleanupExpiredTokens: ReturnType<typeof vi.fn>
  generateDeviceFingerprint: ReturnType<typeof vi.fn>
  generateDeviceName: ReturnType<typeof vi.fn>
  hashToken: ReturnType<typeof vi.fn>
}

export interface SessionMocks {
  getCurrentUserFromToken: ReturnType<typeof vi.fn>
  validateTokenAndGetUser: ReturnType<typeof vi.fn>
  requireTokenRole: ReturnType<typeof vi.fn>
  requireTokenAdmin: ReturnType<typeof vi.fn>
  requireTokenPracticeAccess: ReturnType<typeof vi.fn>
}

export interface RBACMocks {
  getCachedUserContextSafe: ReturnType<typeof vi.fn>
  PermissionChecker: ReturnType<typeof vi.fn>
  rolePermissionCache: {
    getRoleVersion: ReturnType<typeof vi.fn>
    getStats: ReturnType<typeof vi.fn>
    invalidateAll: ReturnType<typeof vi.fn>
    invalidate: ReturnType<typeof vi.fn>
    getCachedRoleIds: ReturnType<typeof vi.fn>
  }
}

export interface PasswordMocks {
  validatePasswordStrength: ReturnType<typeof vi.fn>
  hashPassword: ReturnType<typeof vi.fn>
  verifyPassword: ReturnType<typeof vi.fn>
  needsRehash: ReturnType<typeof vi.fn>
}

export interface AuthMockSuite {
  jwt: JWTMocks
  bcrypt: BcryptMocks
  tokenManager: TokenManagerMock
  session: SessionMocks
  rbac: RBACMocks
  password: PasswordMocks
  _mockHelpers: {
    resetAllMocks: () => void
    setDefaultTokenPayload: (payload: unknown) => void
    setDefaultUserContext: (context: unknown) => void
    setDefaultBcryptHash: (hash: string) => void
  }
}

/**
 * Create JWT-related mocks
 */
export function createJWTMocks(): JWTMocks {
  // Mock SignJWT class
  const mockSignJWT = vi.fn().mockImplementation(() => ({
    setProtectedHeader: vi.fn().mockReturnThis(),
    setJti: vi.fn().mockReturnThis(),
    setIssuedAt: vi.fn().mockReturnThis(),
    setExpirationTime: vi.fn().mockReturnThis(),
    sign: vi.fn().mockResolvedValue('mock.jwt.token')
  }))

  return {
    SignJWT: mockSignJWT,
    jwtVerify: vi.fn().mockResolvedValue({
      payload: { sub: 'user-123', jti: 'jti-123' },
      protectedHeader: { alg: 'HS256' }
    }),
    nanoid: vi.fn().mockReturnValue('mock-nano-id')
  }
}

/**
 * Create bcrypt-related mocks
 */
export function createBcryptMocks(): BcryptMocks {
  return {
    hash: vi.fn().mockResolvedValue('$2b$12$mock.hash.value'),
    compare: vi.fn().mockResolvedValue(true)
  }
}

/**
 * Create TokenManager mock
 */
export function createTokenManagerMock(): TokenManagerMock {
  return {
    validateAccessToken: vi.fn().mockResolvedValue({ sub: 'user-123', jti: 'jti-123' }),
    createTokenPair: vi.fn().mockResolvedValue({
      accessToken: 'mock.access.token',
      refreshToken: 'mock.refresh.token',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      sessionId: 'mock-session-id'
    }),
    refreshTokenPair: vi.fn().mockResolvedValue({
      accessToken: 'new.access.token',
      refreshToken: 'new.refresh.token',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      sessionId: 'mock-session-id'
    }),
    revokeRefreshToken: vi.fn().mockResolvedValue(true),
    revokeAllUserTokens: vi.fn().mockResolvedValue(true),
    cleanupExpiredTokens: vi.fn().mockResolvedValue({
      refreshTokens: 0,
      blacklistEntries: 0
    }),
    generateDeviceFingerprint: vi.fn().mockReturnValue('mock-fingerprint'),
    generateDeviceName: vi.fn().mockReturnValue('Chrome Browser'),
    hashToken: vi.fn().mockReturnValue('mock-token-hash')
  }
}

/**
 * Create session authentication mocks
 */
export function createSessionMocks(): SessionMocks {
  const mockUser = {
    user_id: 'user-123',
    email: 'test@example.com',
    first_name: 'Test',
    last_name: 'User',
    is_active: true,
    email_verified: true
  }

  return {
    getCurrentUserFromToken: vi.fn().mockResolvedValue(mockUser),
    validateTokenAndGetUser: vi.fn().mockResolvedValue(mockUser),
    requireTokenRole: vi.fn().mockResolvedValue(mockUser),
    requireTokenAdmin: vi.fn().mockResolvedValue(mockUser),
    requireTokenPracticeAccess: vi.fn().mockResolvedValue(mockUser)
  }
}

/**
 * Create RBAC-related mocks
 */
export function createRBACMocks(): RBACMocks {
  const mockUserContext = {
    userId: 'user-123',
    organizationId: 'org-123',
    roles: ['admin'],
    permissions: ['users:read', 'users:write']
  }

  return {
    getCachedUserContextSafe: vi.fn().mockResolvedValue(mockUserContext),
    PermissionChecker: vi.fn().mockImplementation(() => ({
      hasPermission: vi.fn().mockReturnValue(true),
      hasRole: vi.fn().mockReturnValue(true),
      isSuperAdmin: vi.fn().mockReturnValue(false)
    })),
    rolePermissionCache: {
      getRoleVersion: vi.fn().mockReturnValue(1),
      getStats: vi.fn().mockReturnValue({
        size: 10,
        hits: 100,
        misses: 5
      }),
      invalidateAll: vi.fn(),
      invalidate: vi.fn(),
      getCachedRoleIds: vi.fn().mockReturnValue(['role-1', 'role-2'])
    }
  }
}

/**
 * Create password-related mocks
 */
export function createPasswordMocks(): PasswordMocks {
  return {
    validatePasswordStrength: vi.fn().mockReturnValue({ isValid: true, errors: [] }),
    hashPassword: vi.fn().mockResolvedValue('$2b$12$mock.hash.value'),
    verifyPassword: vi.fn().mockResolvedValue(true),
    needsRehash: vi.fn().mockReturnValue(false)
  }
}

/**
 * Create a complete auth mock suite
 */
export function createAuthMockSuite(options: AuthMockOptions = {}): AuthMockSuite {
  const jwt = createJWTMocks()
  const bcrypt = createBcryptMocks()
  const tokenManager = createTokenManagerMock()
  const session = createSessionMocks()
  const rbac = createRBACMocks()
  const password = createPasswordMocks()

  // Default values for common test scenarios
  let defaultTokenPayload = { sub: 'user-123', jti: 'jti-123' }
  let defaultUserContext = {
    userId: 'user-123',
    organizationId: 'org-123',
    roles: ['admin'],
    permissions: ['users:read', 'users:write']
  }
  let defaultBcryptHash = '$2b$12$mock.hash.value'

  const mockHelpers = {
    resetAllMocks: () => {
      vi.clearAllMocks()
      // Reset to default values
      jwt.jwtVerify.mockResolvedValue({
        payload: defaultTokenPayload,
        protectedHeader: { alg: 'HS256' }
      })
      rbac.getCachedUserContextSafe.mockResolvedValue(defaultUserContext)
      bcrypt.hash.mockResolvedValue(defaultBcryptHash)
    },
    setDefaultTokenPayload: (payload: unknown) => {
      defaultTokenPayload = payload as typeof defaultTokenPayload
      jwt.jwtVerify.mockResolvedValue({
        payload,
        protectedHeader: { alg: 'HS256' }
      })
    },
    setDefaultUserContext: (context: unknown) => {
      defaultUserContext = context as typeof defaultUserContext
      rbac.getCachedUserContextSafe.mockResolvedValue(context)
    },
    setDefaultBcryptHash: (hash: string) => {
      defaultBcryptHash = hash
      bcrypt.hash.mockResolvedValue(hash)
    }
  }

  return {
    jwt,
    bcrypt,
    tokenManager,
    session,
    rbac,
    password,
    _mockHelpers: mockHelpers
  }
}

/**
 * Vi.mock factory functions for common auth modules
 */

export function createJoseModuleMock() {
  const jwtMocks = createJWTMocks()
  
  return () => ({
    SignJWT: jwtMocks.SignJWT,
    jwtVerify: jwtMocks.jwtVerify
  })
}

export function createBcryptModuleMock() {
  const bcryptMocks = createBcryptMocks()
  
  return () => ({
    default: bcryptMocks
  })
}

export function createNanoidModuleMock() {
  const jwtMocks = createJWTMocks()
  
  return () => ({
    nanoid: jwtMocks.nanoid
  })
}

export function createTokenManagerModuleMock() {
  const tokenManagerMock = createTokenManagerMock()
  
  return () => ({
    TokenManager: tokenManagerMock
  })
}

export function createSessionModuleMock() {
  const sessionMocks = createSessionMocks()
  
  return () => sessionMocks
}

export function createRBACModuleMock() {
  const rbacMocks = createRBACMocks()
  
  return () => ({
    getCachedUserContextSafe: rbacMocks.getCachedUserContextSafe
  })
}

export function createPasswordPolicyModuleMock() {
  const passwordMocks = createPasswordMocks()
  
  return () => ({
    validatePasswordStrength: passwordMocks.validatePasswordStrength
  })
}

/**
 * Preset configurations for common test scenarios
 */
export const AuthMockPresets = {
  /** Basic auth mock for unit tests */
  unit: (): AuthMockSuite => createAuthMockSuite({
    enableJWT: true,
    enableBcrypt: true,
    enableSessions: false,
    enableRBAC: false
  }),
  
  /** Full auth mock for integration tests */
  integration: (): AuthMockSuite => createAuthMockSuite({
    enableJWT: true,
    enableBcrypt: true,
    enableSessions: true,
    enableRBAC: true
  }),
  
  /** JWT-only mock for token tests */
  jwt: (): AuthMockSuite => createAuthMockSuite({
    enableJWT: true,
    enableBcrypt: false,
    enableSessions: false,
    enableRBAC: false
  }),
  
  /** Password-only mock for password tests */
  password: (): AuthMockSuite => createAuthMockSuite({
    enableJWT: false,
    enableBcrypt: true,
    enableSessions: false,
    enableRBAC: false
  })
} as const
