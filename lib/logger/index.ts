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
 */

// Simplified logger - automatic stack traces, file:line:function capture, correlation tracking
export { log, correlation } from './logger';

// Backward compatibility alias
export { log as logger } from './logger';

// Audit logging service
export { AuditLogger } from '../api/services/audit';

// Default export
export { log as default } from './logger';
