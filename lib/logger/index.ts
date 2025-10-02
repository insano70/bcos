/**
 * BendCare OS Logging System
 *
 * This is the centralized logging interface for the entire application.
 *
 * RECOMMENDED USAGE:
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

// NEW SIMPLIFIED LOGGER - Use this for all new code!
// Provides automatic stack traces, file:line:function capture, correlation tracking
export { log, correlation } from './logger';

// Audit logging service (still used by some routes)
export { AuditLogger } from '../api/services/audit';

// Legacy exports for backward compatibility (DEPRECATED - migrate to log.*)
export { logger, loggers } from './factory';

// Default export (legacy)
import { logger as defaultLogger } from './factory';
export default defaultLogger;
