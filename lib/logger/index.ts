/**
 * BendCare OS Logging System
 *
 * Simplified, production-ready logging with automatic context capture.
 *
 * USAGE:
 * import { log } from '@/lib/logger';
 *
 * Available methods:
 * - log.info(message, context?)
 * - log.warn(message, context?)
 * - log.error(message, error?, context?)
 * - log.debug(message, context?)
 * - log.auth(action, success, context?)
 * - log.security(event, severity, context?)
 * - log.api(message, request, statusCode?, duration?)
 * - log.db(operation, table, duration?, context?)
 * - log.timing(message, startTime, context?)
 *
 * Correlation utilities:
 * - correlation.generate() - Generate new correlation ID
 * - correlation.current() - Get current correlation ID
 * - correlation.withContext(id, metadata, fn) - Run function with correlation context
 * - correlation.addMetadata(metadata) - Add metadata to current context
 * - correlation.setUser(userId, orgId?) - Set user in current context
 *
 * IMPORTANT: Server-side only (uses Node.js AsyncLocalStorage)
 * Do not import from client components - use React error boundaries instead
 */

// Simplified logger - automatic stack traces, file:line:function capture, correlation tracking
// Backward compatibility alias
// Default export
export { correlation, log, log as logger, log as default } from './logger';

// Message templates for rich, consistent logging
export { logTemplates, calculateChanges, sanitizeFilters } from './message-templates';

// Logging constants (slow thresholds, etc.)
export { SLOW_THRESHOLDS } from './constants';
