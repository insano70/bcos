/**
 * Centralized Logging System
 * Export all logging functionality from a single entry point
 */

// Core structured logger
export { 
  createAppLogger, 
  logger, 
  loggers,
  type LogContext,
  LOG_LEVELS 
} from './winston-logger'

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
import { logger as defaultLogger } from './winston-logger'
export default defaultLogger