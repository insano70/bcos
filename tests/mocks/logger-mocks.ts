import { vi } from 'vitest';

/**
 * Logger Mock Factory
 * Provides standardized logger mocking for consistent test patterns
 *
 * MODERNIZED: Aligned with current @/lib/logger API
 * - Uses log.* methods (info, error, warn, debug, auth, security, api, db, timing)
 * - Uses correlation.* utilities (generate, current, withContext, addMetadata, setUser)
 * - Maintains backward compatibility with old API names via type aliases
 */

export interface LoggerMockOptions {
  /** Enable call tracking for assertions */
  trackCalls?: boolean;
  /** Mock console methods (for debug utilities) */
  mockConsole?: boolean;
  /** Default log level for filtering */
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Current logger mock interface - matches @/lib/logger log.* API
 */
export interface LoggerMock {
  // Standard logging methods
  debug: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;

  // Enhanced logging methods (current API)
  auth: ReturnType<typeof vi.fn>;
  security: ReturnType<typeof vi.fn>;
  api: ReturnType<typeof vi.fn>;
  db: ReturnType<typeof vi.fn>;
  timing: ReturnType<typeof vi.fn>;

  // Legacy methods for backward compatibility
  audit?: ReturnType<typeof vi.fn>;
  log?: ReturnType<typeof vi.fn>;
  trace?: ReturnType<typeof vi.fn>;
}

/**
 * Correlation utilities mock - matches @/lib/logger correlation.* API
 */
export interface CorrelationMock {
  generate: ReturnType<typeof vi.fn>;
  current: ReturnType<typeof vi.fn>;
  withContext: ReturnType<typeof vi.fn>;
  addMetadata: ReturnType<typeof vi.fn>;
  setUser: ReturnType<typeof vi.fn>;
}

/**
 * @deprecated Use LoggerMock instead - kept for backward compatibility
 */
export type UniversalLoggerMock = LoggerMock;

/**
 * @deprecated Legacy interface - kept for backward compatibility only
 */
export interface AppLoggerMock extends LoggerMock {
  // Legacy app-specific logger methods (no longer in use)
  getLogger?: ReturnType<typeof vi.fn>;
  child?: ReturnType<typeof vi.fn>;
  withContext?: ReturnType<typeof vi.fn>;
}

export interface ConsoleMocks {
  log: ReturnType<typeof vi.spyOn>;
  error: ReturnType<typeof vi.spyOn>;
  warn: ReturnType<typeof vi.spyOn>;
  info: ReturnType<typeof vi.spyOn>;
  debug: ReturnType<typeof vi.spyOn>;
}

export interface LoggerMockSuite {
  logger: UniversalLoggerMock;
  appLogger: AppLoggerMock;
  console: ConsoleMocks | undefined;
  _mockHelpers: {
    resetAllMocks: () => void;
    getCallHistory: () => Array<{ method: string; args: unknown[] }>;
    clearCallHistory: () => void;
  };
}

/**
 * Create a logger mock matching current @/lib/logger API
 */
export function createLoggerMock(options: LoggerMockOptions = {}): LoggerMock {
  const { trackCalls = true } = options;

  const loggerMock: LoggerMock = {
    // Standard methods
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    // Current API methods
    auth: vi.fn(),
    security: vi.fn(),
    api: vi.fn(),
    db: vi.fn(),
    timing: vi.fn(),
    // Legacy methods for backward compatibility
    audit: vi.fn(),
    log: vi.fn(),
    trace: vi.fn(),
  };

  // Add call tracking if enabled
  if (trackCalls) {
    Object.values(loggerMock).forEach((mockFn) => {
      if (mockFn) {
        mockFn.mockImplementation((..._args: unknown[]) => {
          // Implementation can be customized per test
          return undefined;
        });
      }
    });
  }

  return loggerMock;
}

/**
 * Create correlation utilities mock matching current @/lib/logger API
 */
export function createCorrelationMock(): CorrelationMock {
  return {
    generate: vi.fn(() => 'test-correlation-id'),
    current: vi.fn(() => 'test-correlation-id'),
    withContext: vi.fn((_id, _metadata, fn) => fn()),
    addMetadata: vi.fn(),
    setUser: vi.fn(),
  };
}

/**
 * @deprecated Use createLoggerMock instead - kept for backward compatibility
 */
export function createUniversalLoggerMock(options: LoggerMockOptions = {}): UniversalLoggerMock {
  return createLoggerMock(options);
}

/**
 * @deprecated Legacy factory - kept for backward compatibility only
 */
export function createAppLoggerMock(options: LoggerMockOptions = {}): AppLoggerMock {
  const loggerMock = createLoggerMock(options);

  return {
    ...loggerMock,
    getLogger: vi.fn(() => loggerMock),
    child: vi.fn(() => loggerMock),
    withContext: vi.fn(() => loggerMock),
  };
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
    debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
  };
}

/**
 * Create a complete logger mock suite
 */
export function createLoggerMockSuite(options: LoggerMockOptions = {}): LoggerMockSuite {
  const { mockConsole = false } = options;

  const logger = createUniversalLoggerMock(options);
  const appLogger = createAppLoggerMock(options);
  const consoleMocks = mockConsole ? createConsoleMocks() : undefined;

  // Call history tracking
  const callHistory: Array<{ method: string; args: unknown[] }> = [];

  const mockHelpers = {
    resetAllMocks: () => {
      vi.clearAllMocks();
      callHistory.length = 0;
    },
    getCallHistory: () => [...callHistory],
    clearCallHistory: () => {
      callHistory.length = 0;
    },
  };

  return {
    logger,
    appLogger,
    console: consoleMocks,
    _mockHelpers: mockHelpers,
  };
}

/**
 * Vi.mock factory function for @/lib/logger module (current API)
 */
export function createLoggerModuleMock(options: LoggerMockOptions = {}) {
  const loggerMock = createLoggerMock(options);
  const correlationMock = createCorrelationMock();

  return () => ({
    log: loggerMock,
    logger: loggerMock, // Backward compatibility alias
    correlation: correlationMock,
    // Export mock for test access
    _mockLoggerHelpers: {
      resetMocks: () => vi.clearAllMocks(),
      getLoggerMock: () => loggerMock,
      getCorrelationMock: () => correlationMock,
    },
  });
}

/**
 * @deprecated lib/logger/factory module no longer exists - kept for backward compatibility
 * This factory returns a no-op mock to prevent test failures
 */
export function createLoggerFactoryModuleMock(options: LoggerMockOptions = {}) {
  const loggerMock = createLoggerMock(options);

  return () => ({
    createAppLogger: vi.fn(() => loggerMock),
    // Export mock for test access
    _mockFactoryHelpers: {
      resetMocks: () => vi.clearAllMocks(),
      getAppLoggerMock: () => loggerMock,
    },
  });
}

/**
 * Create a simple logger mock for basic testing
 */
export function createSimpleLoggerMock(): UniversalLoggerMock {
  return createUniversalLoggerMock({ trackCalls: false });
}

/**
 * Create a debug utility logger mock (for debug.test.ts)
 */
export function createDebugLoggerMock(): {
  consoleMocks: ConsoleMocks;
  resetMocks: () => void;
} {
  const consoleMocks = createConsoleMocks();

  return {
    consoleMocks,
    resetMocks: () => {
      vi.clearAllMocks();
    },
  };
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
  debug: (): LoggerMockSuite =>
    createLoggerMockSuite({
      trackCalls: true,
      mockConsole: true,
    }),

  /** Performance-focused mock (minimal tracking) */
  performance: (): LoggerMockSuite =>
    createLoggerMockSuite({
      trackCalls: false,
      mockConsole: false,
    }),
} as const;
