import { vi } from 'vitest'

/**
 * Logger Mock Factory
 * Provides standardized logger mocking for consistent test patterns
 */

export interface LoggerMockOptions {
  /** Enable call tracking for assertions */
  trackCalls?: boolean
  /** Mock console methods (for debug utilities) */
  mockConsole?: boolean
  /** Default log level for filtering */
  logLevel?: 'debug' | 'info' | 'warn' | 'error'
}

export interface UniversalLoggerMock {
  // Standard logging methods
  debug: ReturnType<typeof vi.fn>
  info: ReturnType<typeof vi.fn>
  warn: ReturnType<typeof vi.fn>
  error: ReturnType<typeof vi.fn>
  
  // Enhanced logging methods
  security: ReturnType<typeof vi.fn>
  timing: ReturnType<typeof vi.fn>
  audit: ReturnType<typeof vi.fn>
  
  // Specialized methods
  log: ReturnType<typeof vi.fn>
  trace: ReturnType<typeof vi.fn>
}

export interface AppLoggerMock extends UniversalLoggerMock {
  // App-specific logger methods
  getLogger: ReturnType<typeof vi.fn>
  child: ReturnType<typeof vi.fn>
  withContext: ReturnType<typeof vi.fn>
}

export interface ConsoleMocks {
  log: ReturnType<typeof vi.spyOn>
  error: ReturnType<typeof vi.spyOn>
  warn: ReturnType<typeof vi.spyOn>
  info: ReturnType<typeof vi.spyOn>
  debug: ReturnType<typeof vi.spyOn>
}

export interface LoggerMockSuite {
  logger: UniversalLoggerMock
  appLogger: AppLoggerMock
  console: ConsoleMocks | undefined
  _mockHelpers: {
    resetAllMocks: () => void
    getCallHistory: () => Array<{ method: string; args: unknown[] }>
    clearCallHistory: () => void
  }
}

/**
 * Create a universal logger mock that works with all logger types
 */
export function createUniversalLoggerMock(options: LoggerMockOptions = {}): UniversalLoggerMock {
  const { trackCalls = true } = options

  const loggerMock: UniversalLoggerMock = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    security: vi.fn(),
    timing: vi.fn(),
    audit: vi.fn(),
    log: vi.fn(),
    trace: vi.fn()
  }

  // Add call tracking if enabled
  if (trackCalls) {
    Object.values(loggerMock).forEach(mockFn => {
      mockFn.mockImplementation((...args: unknown[]) => {
        // Implementation can be customized per test
        return undefined
      })
    })
  }

  return loggerMock
}

/**
 * Create an app logger mock (for createAppLogger factory)
 */
export function createAppLoggerMock(options: LoggerMockOptions = {}): AppLoggerMock {
  const universalMock = createUniversalLoggerMock(options)

  return {
    ...universalMock,
    getLogger: vi.fn(() => universalMock),
    child: vi.fn(() => universalMock),
    withContext: vi.fn(() => universalMock)
  }
}

/**
 * Create console mocks for debug utilities testing
 */
export function createConsoleMocks(): ConsoleMocks {
  return {
    log: vi.spyOn(console, 'log').mockImplementation(() => {}),
    error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    info: vi.spyOn(console, 'info').mockImplementation(() => {}),
    debug: vi.spyOn(console, 'debug').mockImplementation(() => {})
  }
}

/**
 * Create a complete logger mock suite
 */
export function createLoggerMockSuite(options: LoggerMockOptions = {}): LoggerMockSuite {
  const { mockConsole = false } = options
  
  const logger = createUniversalLoggerMock(options)
  const appLogger = createAppLoggerMock(options)
  const consoleMocks = mockConsole ? createConsoleMocks() : undefined

  // Call history tracking
  const callHistory: Array<{ method: string; args: unknown[] }> = []

  const mockHelpers = {
    resetAllMocks: () => {
      vi.clearAllMocks()
      callHistory.length = 0
    },
    getCallHistory: () => [...callHistory],
    clearCallHistory: () => {
      callHistory.length = 0
    }
  }

  return {
    logger,
    appLogger,
    console: consoleMocks,
    _mockHelpers: mockHelpers
  }
}

/**
 * Vi.mock factory function for @/lib/logger module
 */
export function createLoggerModuleMock(options: LoggerMockOptions = {}) {
  const loggerMock = createUniversalLoggerMock(options)
  
  return () => ({
    logger: loggerMock,
    // Export mock for test access
    _mockLoggerHelpers: {
      resetMocks: () => vi.clearAllMocks()
    }
  })
}

/**
 * Vi.mock factory function for @/lib/logger/factory module
 */
export function createLoggerFactoryModuleMock(options: LoggerMockOptions = {}) {
  const appLoggerMock = createAppLoggerMock(options)
  
  return () => ({
    createAppLogger: vi.fn(() => appLoggerMock),
    // Export mock for test access
    _mockFactoryHelpers: {
      resetMocks: () => vi.clearAllMocks(),
      getAppLoggerMock: () => appLoggerMock
    }
  })
}

/**
 * Create a simple logger mock for basic testing
 */
export function createSimpleLoggerMock(): UniversalLoggerMock {
  return createUniversalLoggerMock({ trackCalls: false })
}

/**
 * Create a debug utility logger mock (for debug.test.ts)
 */
export function createDebugLoggerMock(): {
  consoleMocks: ConsoleMocks
  resetMocks: () => void
} {
  const consoleMocks = createConsoleMocks()
  
  return {
    consoleMocks,
    resetMocks: () => {
      vi.clearAllMocks()
    }
  }
}

/**
 * Preset configurations for common test scenarios
 */
export const LoggerMockPresets = {
  /** Basic logger mock for unit tests */
  unit: (): LoggerMockSuite => createLoggerMockSuite({ trackCalls: false }),
  
  /** Enhanced logger mock for integration tests */
  integration: (): LoggerMockSuite => createLoggerMockSuite({ trackCalls: true }),
  
  /** Debug utility mock with console spies */
  debug: (): LoggerMockSuite => createLoggerMockSuite({ 
    trackCalls: true, 
    mockConsole: true 
  }),
  
  /** Performance-focused mock (minimal tracking) */
  performance: (): LoggerMockSuite => createLoggerMockSuite({ 
    trackCalls: false,
    mockConsole: false
  })
} as const
