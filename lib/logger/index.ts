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
  withPerformanceLogging
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

// Database monitoring
export {
  withDBLogging,
  logSlowQuery,
  logDBConnection,
  logDBTransaction,
  logDBHealth
} from './db-wrapper'

// Error handling
export {
  ContextualError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  DatabaseError,
  handleError,
  createErrorHandler,
  withErrorHandling,
  withDBErrorHandling,
  createValidationError,
  createRateLimitError
} from './error-handler'

// Audit optimization
export {
  BufferedAuditLogger
} from './audit-optimizer'

// Metrics and monitoring
export {
  RequestMetricsCollector,
  PerformanceAggregator,
  withRequestMetrics,
  requestMetrics,
  performanceAggregator
} from './metrics'

// Default exports for common use cases
import { logger as defaultLogger } from './winston-logger'
export default defaultLogger