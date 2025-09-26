/**
 * Debug Utility Migration Helper
 * Provides backward-compatible interface while migrating to structured logging
 */

import { loggers, createAppLogger } from './factory'
type LogData = Record<string, unknown>

/**
 * Migrated debug logging interface
 * Maintains compatibility with existing debugLog usage
 */
export const debugLog = {
  auth: (message: string, data?: LogData) => {
    loggers.auth.debug(message, data)
  },

  middleware: (message: string, data?: LogData) => {
    loggers.api.debug(`Middleware: ${message}`, data)
  },

  rbac: (message: string, data?: LogData) => {
    loggers.rbac.debug(message, data)
  },

  security: (message: string, data?: LogData) => {
    loggers.security.debug(message, data)
  },

  session: (message: string, data?: LogData) => {
    loggers.auth.debug(`Session: ${message}`, data)
  }
}

/**
 * Migrated error logging function
 * Maintains compatibility with existing errorLog usage
 */
export const errorLog = (message: string, error?: Error | unknown, context?: LogData) => {
  // Create a temporary logger for error logging if we don't have a specific context
  const logger = createAppLogger('error')
  
  if (context) {
    logger.error(message, error, context)
  } else {
    logger.error(message, error)
  }
}

/**
 * Migration notice for developers
 */
export const MIGRATION_NOTICE = `
⚠️  DEBUG UTILITY MIGRATION NOTICE ⚠️

The debugLog and errorLog utilities are being migrated to structured logging.

OLD USAGE:
  import { debugLog, errorLog } from '@/lib/utils/debug'
  debugLog.auth('User authenticated', { userId })
  errorLog('Login failed', error, { userId })

NEW USAGE:
  import { loggers } from '@/lib/logger'
  loggers.auth.debug('User authenticated', { userId })
  loggers.auth.error('Login failed', error, { userId })

Benefits of migration:
- ✅ Structured JSON logging
- ✅ Request correlation IDs  
- ✅ Performance metrics
- ✅ Environment-specific configuration
- ✅ External log aggregation support
- ✅ Better error context preservation

This compatibility layer will be removed in a future version.
`

// Log migration notice in development
if (process.env.NODE_ENV === 'development') {
  console.log(MIGRATION_NOTICE)
}
