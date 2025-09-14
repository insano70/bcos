/**
 * Centralized Logging System
 * Export all logging functionality from a single entry point
 */

// Core structured logger
export { 
  createLogger, 
  logger, 
  loggers,
  type LogContext,
  LOG_LEVELS 
} from './structured-logger'

// API-specific logging
export {
  createAPILogger,
  logAPIRequest,
  logAPIResponse,
  logDBOperation,
  logAPIAuth,
  logValidationError,
  logRateLimit,
  logSecurityEvent,
  logPerformanceMetric
} from './api-logger'

// Middleware functions
export {
  withLogging,
  withRBACLogging,
  withPerformanceLogging,
  withDBLogging
} from './middleware'

// Environment-specific configuration
export { 
  getLogConfig,
  LogLevels,
  type LogConfig 
} from './config'

// Correlation and tracing
export {
  CorrelationIdGenerator,
  CorrelationContextManager,
  withCorrelation,
  withDBCorrelation,
  withExternalAPICorrelation,
  withBackgroundJobCorrelation,
  withScheduledTaskCorrelation,
  CorrelationHeaders,
  CorrelationHelpers,
  type CorrelationContext
} from './correlation'

// Default exports for common use cases
export default logger