/**
 * Mock Utilities Index
 * Central export point for all standardized test mocks
 */

// Database Mocks
export {
  createDatabaseMock,
  createSimpleDatabaseMock,
  createIntegrationDatabaseMock,
  createDbModuleMock,
  type DatabaseMock,
  type DbMockOptions,
  type MockQueryChain,
  type MockUpdateChain,
  type MockInsertChain,
  type MockDeleteChain
} from './database-mocks'

// Logger Mocks
export {
  createUniversalLoggerMock,
  createAppLoggerMock,
  createConsoleMocks,
  createLoggerMockSuite,
  createLoggerModuleMock,
  createLoggerFactoryModuleMock,
  createSimpleLoggerMock,
  createDebugLoggerMock,
  LoggerMockPresets,
  type UniversalLoggerMock,
  type AppLoggerMock,
  type ConsoleMocks,
  type LoggerMockSuite,
  type LoggerMockOptions
} from './logger-mocks'

// Auth Mocks
export {
  createJWTMocks,
  createBcryptMocks,
  createTokenManagerMock,
  createSessionMocks,
  createRBACMocks,
  createPasswordMocks,
  createAuthMockSuite,
  createJoseModuleMock,
  createBcryptModuleMock,
  createNanoidModuleMock,
  createTokenManagerModuleMock,
  createSessionModuleMock,
  createRBACModuleMock,
  createPasswordPolicyModuleMock,
  AuthMockPresets,
  type JWTMocks,
  type BcryptMocks,
  type TokenManagerMock,
  type SessionMocks,
  type RBACMocks,
  type PasswordMocks,
  type AuthMockSuite,
  type AuthMockOptions
} from './auth-mocks'

// Import the actual functions for internal use
import {
  createDatabaseMock,
  createSimpleDatabaseMock,
  createIntegrationDatabaseMock,
  createDbModuleMock,
  type DatabaseMock
} from './database-mocks'

import {
  createLoggerMockSuite,
  createLoggerModuleMock,
  createLoggerFactoryModuleMock,
  LoggerMockPresets,
  type LoggerMockSuite
} from './logger-mocks'

import {
  createAuthMockSuite,
  createJoseModuleMock,
  createBcryptModuleMock,
  createNanoidModuleMock,
  createTokenManagerModuleMock,
  createSessionModuleMock,
  createRBACModuleMock,
  createPasswordPolicyModuleMock,
  AuthMockPresets,
  type AuthMockSuite
} from './auth-mocks'

/**
 * Complete Mock Suite Factory
 * Creates a comprehensive mock suite for full-stack testing
 */
export interface CompleteMockSuite {
  database: DatabaseMock
  logger: LoggerMockSuite
  auth: AuthMockSuite
  _helpers: {
    resetAll: () => void
    setupDefaults: () => void
  }
}

/**
 * Create a complete mock suite with all utilities
 */
export function createCompleteMockSuite(): CompleteMockSuite {
  const database = createDatabaseMock()
  const logger = createLoggerMockSuite()
  const auth = createAuthMockSuite()

  const helpers = {
    resetAll: () => {
      database._mockHelpers.resetAllMocks()
      logger._mockHelpers.resetAllMocks()
      auth._mockHelpers.resetAllMocks()
    },
    setupDefaults: () => {
      // Set up common default values for testing
      database._mockHelpers.setSelectResult([])
      database._mockHelpers.setInsertResult({ insertId: 1, affectedRows: 1 })
      
      auth._mockHelpers.setDefaultTokenPayload({ 
        sub: 'test-user-123', 
        jti: 'test-jti-123' 
      })
      
      auth._mockHelpers.setDefaultUserContext({
        userId: 'test-user-123',
        organizationId: 'test-org-123',
        roles: ['user'],
        permissions: ['basic:read']
      })
    }
  }

  return {
    database,
    logger,
    auth,
    _helpers: helpers
  }
}

/**
 * Quick Mock Presets for Common Test Scenarios
 */
export const MockPresets = {
  /** Unit test preset - minimal mocking */
  unit: () => ({
    database: createSimpleDatabaseMock(),
    logger: LoggerMockPresets.unit(),
    auth: AuthMockPresets.unit()
  }),

  /** Integration test preset - comprehensive mocking */
  integration: () => ({
    database: createIntegrationDatabaseMock(),
    logger: LoggerMockPresets.integration(),
    auth: AuthMockPresets.integration()
  }),

  /** Auth-focused test preset */
  auth: () => ({
    database: createSimpleDatabaseMock(),
    logger: LoggerMockPresets.unit(),
    auth: AuthMockPresets.integration()
  }),

  /** Database-focused test preset */
  database: () => ({
    database: createIntegrationDatabaseMock(),
    logger: LoggerMockPresets.unit(),
    auth: AuthMockPresets.unit()
  }),

  /** Debug utility test preset */
  debug: () => ({
    database: createSimpleDatabaseMock(),
    logger: LoggerMockPresets.debug(),
    auth: AuthMockPresets.unit()
  }),

  /** Performance test preset - minimal overhead */
  performance: () => ({
    database: createSimpleDatabaseMock(),
    logger: LoggerMockPresets.performance(),
    auth: AuthMockPresets.unit()
  })
} as const

/**
 * Common Vi.mock Module Factories
 * Ready-to-use mock factories for common modules
 */
export const ModuleMockFactories = {
  // Database
  db: createDbModuleMock,
  
  // Logging
  logger: createLoggerModuleMock,
  loggerFactory: createLoggerFactoryModuleMock,
  
  // Authentication
  jose: createJoseModuleMock,
  bcrypt: createBcryptModuleMock,
  nanoid: createNanoidModuleMock,
  tokenManager: createTokenManagerModuleMock,
  session: createSessionModuleMock,
  rbac: createRBACModuleMock,
  passwordPolicy: createPasswordPolicyModuleMock
} as const

/**
 * Mock Usage Examples and Best Practices
 * 
 * @example Basic Unit Test Setup
 * ```typescript
 * import { MockPresets } from '@tests/mocks'
 * 
 * describe('My Component', () => {
 *   const mocks = MockPresets.unit()
 *   
 *   beforeEach(() => {
 *     vi.clearAllMocks()
 *   })
 * })
 * ```
 * 
 * @example Integration Test Setup
 * ```typescript
 * import { createCompleteMockSuite } from '@tests/mocks'
 * 
 * describe('Integration Tests', () => {
 *   const mockSuite = createCompleteMockSuite()
 *   
 *   beforeEach(() => {
 *     mockSuite._helpers.resetAll()
 *     mockSuite._helpers.setupDefaults()
 *   })
 * })
 * ```
 * 
 * @example Module Mocking
 * ```typescript
 * import { ModuleMockFactories } from '@tests/mocks'
 * 
 * vi.mock('@/lib/db', ModuleMockFactories.db())
 * vi.mock('@/lib/logger', ModuleMockFactories.logger())
 * vi.mock('jose', ModuleMockFactories.jose())
 * ```
 */
