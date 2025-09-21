/**
 * Conditional Debug Logging Utility
 * Only logs in development environment to prevent information disclosure in production
 */

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
  }
};

/**
 * Production-safe error logging
 * Always logs errors but sanitizes sensitive information in production
 */
export const errorLog = (message: string, error?: unknown, context?: unknown) => {
  if (isDevelopment) {
    console.error(`❌ ${message}`, error, context);
  } else {
    // Production: Log only essential information, sanitized
    const sanitizedError = sanitizeErrorForProduction(error);
    const sanitizedContext = sanitizeContextForProduction(context);
    
    console.error(`❌ ${message}`, {
      error: sanitizedError,
      timestamp: new Date().toISOString(),
      context: sanitizedContext
    });
  }
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
      if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
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
