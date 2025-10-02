/**
 * Centralized Logging System
 * Export all logging functionality from a single entry point
 */

// Core structured logger (simplified)
export {
  createAppLogger,
  logger,
  loggers,
} from './factory';

export type { LogContext } from './universal-logger';

// Simplified log levels
export const LOG_LEVELS = {
  debug: 3,
  info: 2,
  warn: 1,
  error: 0,
};

// Audit logging services
export { AuditLogger } from '../api/services/audit';
// API-specific logging
export {
  createAPILogger,
  logAPIAuth,
  logAPIRequest,
  logAPIResponse,
  logDBOperation,
  logPerformanceMetric,
  logRateLimit,
  logSecurityEvent,
  logValidationError,
} from './api-logger';
export { BufferedAuditLogger } from './audit-optimizer';
// Correlation and tracing
export {
  type CorrelationContext,
  CorrelationContextManager,
  CorrelationHeaders,
  CorrelationHelpers,
  CorrelationIdGenerator,
  withBackgroundJobCorrelation,
  withCorrelation,
  withDBCorrelation,
  withExternalAPICorrelation,
  withScheduledTaskCorrelation,
} from './correlation';
// Database monitoring
export {
  logDBConnection,
  logDBHealth,
  logDBTransaction,
  logSlowQuery,
  withDBLogging,
} from './db-wrapper';
// Error handling
export {
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  ContextualError,
  createErrorHandler,
  createRateLimitError,
  createValidationError,
  DatabaseError,
  handleError,
  NotFoundError,
  RateLimitError,
  ValidationError,
  withDBErrorHandling,
  withErrorHandling,
} from './error-handler';
// Metrics and monitoring
export {
  PerformanceAggregator,
  performanceAggregator,
  RequestMetricsCollector,
  requestMetrics,
  withRequestMetrics,
} from './metrics';
// Middleware functions
export {
  withLogging,
  withPerformanceLogging,
  withRBACLogging,
} from './middleware';

// NEW simplified logger - use this for new code!
// Provides automatic stack traces, file:line:function capture, correlation tracking
export { log, correlation } from './logger';

// Default exports for common use cases (simplified)
import { logger as defaultLogger } from './factory';
export default defaultLogger;
