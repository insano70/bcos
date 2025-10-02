/**
 * Enhanced Debug Logging Utility
 * Uses universal logger with development-only behavior and enhanced debugging features
 */

import { log } from '@/lib/logger';

const isDevelopment = process.env.NODE_ENV === 'development';

export const debugLog = {
  auth: (message: string, data?: unknown) => {
    if (isDevelopment) {
      console.log(`🔐 AUTH: ${message}`, data);
    }
  },

  middleware: (message: string, data?: unknown) => {
    if (isDevelopment) {
      console.log(`🌐 MIDDLEWARE: ${message}`, data);
    }
  },

  rbac: (message: string, data?: unknown) => {
    if (isDevelopment) {
      console.log(`🎯 RBAC: ${message}`, data);
    }
  },

  security: (message: string, data?: unknown) => {
    if (isDevelopment) {
      console.log(`🛡️ SECURITY: ${message}`, data);
    }
  },

  session: (message: string, data?: unknown) => {
    if (isDevelopment) {
      console.log(`🔄 SESSION: ${message}`, data);
    }
  },

  // Enhanced debug categories
  database: (message: string, data?: unknown) => {
    if (isDevelopment) {
      log.debug(`🗄️ DATABASE: ${message}`, {
        ...data as Record<string, unknown>,
        component: 'database',
        feature: 'database-debug',
        module: 'debug-utility',
      });
    }
  },

  api: (message: string, data?: unknown) => {
    if (isDevelopment) {
      log.debug(`🌐 API: ${message}`, {
        ...data as Record<string, unknown>,
        component: 'api',
        feature: 'api-debug',
        module: 'debug-utility',
      });
    }
  },

  business: (message: string, data?: unknown) => {
    if (isDevelopment) {
      log.debug(`💼 BUSINESS: ${message}`, {
        ...data as Record<string, unknown>,
        component: 'business-logic',
        feature: 'business-debug',
        module: 'debug-utility',
      });
    }
  },

  // Performance debugging
  performance: (message: string, startTime?: number, data?: unknown) => {
    if (isDevelopment && startTime) {
      const duration = Date.now() - startTime;
      log.timing(`⚡ PERFORMANCE: ${message}`, startTime, {
        duration,
        performanceOptimized: duration < 100,
        ...(data as Record<string, unknown>),
        component: 'api',
        feature: 'api-debug',
        module: 'debug-utility',
      });
    } else if (isDevelopment) {
      log.debug(`⚡ PERFORMANCE: ${message}`, {
        ...data as Record<string, unknown>,
        component: 'api',
        feature: 'api-debug',
        module: 'debug-utility',
      });
    }
  },

  // Context correlation debugging
  correlation: (message: string, correlationId: string, data?: unknown) => {
    if (isDevelopment) {
      log.debug(`🔗 CORRELATION: ${message}`, {
        correlationId,
        timestamp: new Date().toISOString(),
        ...(data as Record<string, unknown>),
        component: 'api',
        feature: 'api-debug',
        module: 'debug-utility',
      });
    }
  },
};

/**
 * Enhanced Production-safe Error Logging
 * Uses universal logger with automatic sanitization and enhanced error tracking
 */
export const errorLog = (message: string, error?: unknown, context?: unknown) => {
  const sanitizedError = sanitizeErrorForProduction(error);
  const sanitizedContext = sanitizeContextForProduction(context);

  if (isDevelopment) {
    // Development: Log to console for test compatibility
    console.error(`❌ ${message}`, error, context);
  } else {
    // Production: Sanitized error logging with enhanced metadata
    log.error(`❌ ${message}`, new Error(String(sanitizedError)), {
      sanitizedContext,
      productionMode: true,
      errorClassification: 'application_error',
      sensitivityLevel: 'sanitized',
      timestamp: new Date().toISOString(),
      complianceFramework: 'HIPAA',
      retentionPeriod: '7_years',
    });

    // Also log sanitized data to console for test compatibility
    console.error(`❌ ${message}`, {
      error: sanitizedError,
      ...(typeof sanitizedContext === 'object' && sanitizedContext !== null
        ? sanitizedContext
        : { context: sanitizedContext }),
    });

    // Enhanced security logging for production errors
    log.security('production_error_logged', 'medium', {
      action: 'error_handling',
      errorType: typeof error,
      messageSanitized: true,
      contextSanitized: true,
      threat: 'potential_data_exposure_prevented',
    });
  }
};

/**
 * Enhanced Business Logic Error Logging
 * Specialized error logging for business operations with analytics
 */
export const businessErrorLog = (
  operation: string,
  error: unknown,
  context?: { userId?: string; organizationId?: string; resourceId?: string }
) => {
  const _sanitizedError = sanitizeErrorForProduction(error);
  const sanitizedContext = sanitizeContextForProduction(context);

  log.error(
    `💼 Business Error: ${operation}`,
    error instanceof Error ? error : new Error(String(error)),
    {
      operation,
      sanitizedContext,
      businessProcess: true,
      errorImpact: 'business_operation',
      requiresReview: true,
    }
  );

  // Business intelligence logging
  log.info('Business error analytics', {
    operation,
    errorOccurred: true,
    impactLevel: 'business_operation',
    userContext: sanitizedContext,
    requiresBusinessReview: true,
    dataClassification: 'business_critical',
  });
};

/**
 * Performance Error Logging
 * Specialized logging for performance-related issues
 */
export const performanceErrorLog = (
  operation: string,
  duration: number,
  threshold: number,
  error?: unknown,
  context?: unknown
) => {
  const performanceIssue = duration > threshold;
  const sanitizedContext = sanitizeContextForProduction(context);

  if (error) {
    log.error(
      `⚡ Performance Error: ${operation}`,
      error instanceof Error ? error : new Error(String(error)),
      {
        operation,
        duration,
        threshold,
        performanceIssue,
        sanitizedContext,
        performanceOptimizationNeeded: true,
      }
    );
  }

  // Performance monitoring
  log.timing(`Performance issue detected: ${operation}`, Date.now() - duration, {
    operation,
    duration,
    threshold,
    performanceIssue,
    exceededBy: duration - threshold,
    requiresOptimization: performanceIssue,
  });
};

/**
 * Sanitize error information for production logging
 * Removes sensitive data while preserving diagnostic value
 */
function sanitizeErrorForProduction(error: unknown): unknown {
  if (!error) return 'No error details';

  if (error instanceof Error) {
    return {
      name: error.name,
      message: sanitizeErrorMessage(error.message),
      // Don't include stack traces in production logs
    };
  }

  if (typeof error === 'string') {
    return sanitizeErrorMessage(error);
  }

  return 'Unknown error type';
}

/**
 * Sanitize error messages to remove sensitive information
 */
function sanitizeErrorMessage(message: string): string {
  // Remove common sensitive patterns
  return message
    .replace(/password[=:\s]+[^\s]+/gi, 'password=***')
    .replace(/token[=:\s]+[^\s]+/gi, 'token=***')
    .replace(/key[=:\s]+[^\s]+/gi, 'key=***')
    .replace(/secret[=:\s]+[^\s]+/gi, 'secret=***')
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer ***')
    .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '[UUID]')
    .replace(/\b[\w.-]+@[\w.-]+\.\w+\b/gi, '[EMAIL]')
    .replace(/\d{3,}/g, '[NUMBER]'); // Hide potentially sensitive numeric data
}

/**
 * Sanitize context information for production logging
 */
function sanitizeContextForProduction(context: unknown): unknown {
  if (!context) return undefined;

  if (typeof context === 'string') {
    return sanitizeErrorMessage(context);
  }

  if (typeof context === 'object' && context !== null) {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(context)) {
      // Skip potentially sensitive keys
      const sensitiveKeys = ['password', 'token', 'secret', 'key', 'auth', 'session'];
      if (sensitiveKeys.some((sk) => key.toLowerCase().includes(sk))) {
        sanitized[key] = '***';
        continue;
      }

      // Sanitize string values
      if (typeof value === 'string') {
        sanitized[key] = sanitizeErrorMessage(value);
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        sanitized[key] = value;
      } else {
        sanitized[key] = '[OBJECT]';
      }
    }

    return sanitized;
  }

  return '[UNKNOWN_TYPE]';
}

/**
 * Enhanced Development Utility Functions
 */

/**
 * Create a scoped debug logger for specific components
 * Returns log object with preset context
 */
export const createDebugLogger = (component: string, feature?: string) => {
  const context = {
    component,
    feature: feature || `${component}-debug`,
    module: 'debug-utility',
  };

  return {
    debug: (message: string, data?: Record<string, unknown>) => log.debug(message, { ...data, ...context }),
    info: (message: string, data?: Record<string, unknown>) => log.info(message, { ...data, ...context }),
    warn: (message: string, data?: Record<string, unknown>) => log.warn(message, { ...data, ...context }),
    error: (message: string, error?: Error, data?: Record<string, unknown>) => log.error(message, error, { ...data, ...context }),
  };
};

/**
 * Conditional performance timing with debug output
 */
export const debugTiming = (label: string, startTime: number, threshold = 100) => {
  if (isDevelopment) {
    const duration = Date.now() - startTime;
    const isSlowOperation = duration > threshold;

    log.timing(`⏱️ ${label}`, startTime, {
      duration,
      threshold,
      isSlowOperation,
      performanceOptimized: !isSlowOperation,
      component: 'api',
      feature: 'api-debug',
      module: 'debug-utility',
    });

    if (isSlowOperation) {
      log.warn(`Slow operation detected: ${label}`, {
        duration,
        threshold,
        exceededBy: duration - threshold,
        component: 'api',
        feature: 'api-debug',
        module: 'debug-utility',
      });
    }
  }
};

/**
 * Debug assertion with enhanced logging
 */
export const debugAssert = (condition: boolean, message: string, context?: unknown) => {
  if (isDevelopment && !condition) {
    const assertionError = new Error(`Assertion failed: ${message}`);
    log.error('Debug assertion failed', assertionError, {
      assertion: message,
      context: context as Record<string, unknown>,
      developmentAssertion: true,
      requiresInvestigation: true,
    });

    // In development, also throw to halt execution
    throw assertionError;
  }
};

/**
 * Legacy Compatibility
 * Maintain backward compatibility while encouraging migration
 */

// Re-export enhanced functions with original names
export { debugLog as enhancedDebugLog };
export { errorLog as enhancedErrorLog };

// Add deprecation notice in development
if (isDevelopment) {
  console.warn(
    '💡 MIGRATION NOTICE: debug.ts has been enhanced with universal logger. ' +
      'Consider using the new enhanced functions for better observability.'
  );
}
