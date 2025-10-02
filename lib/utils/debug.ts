/**
 * Enhanced Debug Logging Utility
 * Uses universal logger with development-only behavior and enhanced debugging features
 */

import { createAppLogger } from '@/lib/logger/factory';

const isDevelopment = process.env.NODE_ENV === 'development';

// Create universal debug loggers with component context
const debugLoggers = {
  auth: createAppLogger('debug-auth', {
    component: 'security',
    feature: 'authentication-debug',
    module: 'debug-utility',
  }),
  middleware: createAppLogger('debug-middleware', {
    component: 'middleware',
    feature: 'middleware-debug',
    module: 'debug-utility',
  }),
  rbac: createAppLogger('debug-rbac', {
    component: 'security',
    feature: 'rbac-debug',
    module: 'debug-utility',
  }),
  security: createAppLogger('debug-security', {
    component: 'security',
    feature: 'security-debug',
    module: 'debug-utility',
    securityLevel: 'critical',
  }),
  session: createAppLogger('debug-session', {
    component: 'authentication',
    feature: 'session-debug',
    module: 'debug-utility',
  }),
  database: createAppLogger('debug-database', {
    component: 'database',
    feature: 'database-debug',
    module: 'debug-utility',
  }),
  api: createAppLogger('debug-api', {
    component: 'api',
    feature: 'api-debug',
    module: 'debug-utility',
  }),
  business: createAppLogger('debug-business', {
    component: 'business-logic',
    feature: 'business-debug',
    module: 'debug-utility',
  }),
};

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
      debugLoggers.database.debug(`🗄️ DATABASE: ${message}`, data as Record<string, unknown>);
    }
  },

  api: (message: string, data?: unknown) => {
    if (isDevelopment) {
      debugLoggers.api.debug(`🌐 API: ${message}`, data as Record<string, unknown>);
    }
  },

  business: (message: string, data?: unknown) => {
    if (isDevelopment) {
      debugLoggers.business.debug(`💼 BUSINESS: ${message}`, data as Record<string, unknown>);
    }
  },

  // Performance debugging
  performance: (message: string, startTime?: number, data?: unknown) => {
    if (isDevelopment && startTime) {
      const duration = Date.now() - startTime;
      debugLoggers.api.timing(`⚡ PERFORMANCE: ${message}`, startTime, {
        duration,
        performanceOptimized: duration < 100,
        ...(data as Record<string, unknown>),
      });
    } else if (isDevelopment) {
      debugLoggers.api.debug(`⚡ PERFORMANCE: ${message}`, data as Record<string, unknown>);
    }
  },

  // Context correlation debugging
  correlation: (message: string, correlationId: string, data?: unknown) => {
    if (isDevelopment) {
      debugLoggers.api.debug(`🔗 CORRELATION: ${message}`, {
        correlationId,
        timestamp: new Date().toISOString(),
        ...(data as Record<string, unknown>),
      });
    }
  },
};

/**
 * Enhanced Production-safe Error Logging
 * Uses universal logger with automatic sanitization and enhanced error tracking
 */
const errorLogger = createAppLogger('error-utility', {
  component: 'error-handling',
  feature: 'production-safe-errors',
  module: 'debug-utility',
});

export const errorLog = (message: string, error?: unknown, context?: unknown) => {
  const sanitizedError = sanitizeErrorForProduction(error);
  const sanitizedContext = sanitizeContextForProduction(context);

  if (isDevelopment) {
    // Development: Log to console for test compatibility
    console.error(`❌ ${message}`, error, context);
  } else {
    // Production: Sanitized error logging with enhanced metadata
    errorLogger.error(`❌ ${message}`, new Error(String(sanitizedError)), {
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
    errorLogger.security('production_error_logged', 'medium', {
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

  errorLogger.error(
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
  errorLogger.info('Business error analytics', {
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
    errorLogger.error(
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
  errorLogger.timing(`Performance issue detected: ${operation}`, Date.now() - duration, {
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
 */
export const createDebugLogger = (component: string, feature?: string) => {
  return createAppLogger(`debug-${component}`, {
    component,
    feature: feature || `${component}-debug`,
    module: 'debug-utility',
  });
};

/**
 * Conditional performance timing with debug output
 */
export const debugTiming = (label: string, startTime: number, threshold = 100) => {
  if (isDevelopment) {
    const duration = Date.now() - startTime;
    const isSlowOperation = duration > threshold;

    debugLoggers.api.timing(`⏱️ ${label}`, startTime, {
      duration,
      threshold,
      isSlowOperation,
      performanceOptimized: !isSlowOperation,
    });

    if (isSlowOperation) {
      debugLoggers.api.warn(`Slow operation detected: ${label}`, {
        duration,
        threshold,
        exceededBy: duration - threshold,
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
    errorLogger.error('Debug assertion failed', assertionError, {
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
