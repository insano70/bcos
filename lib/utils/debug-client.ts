/**
 * Client-Safe Debug Logging Utility
 * Edge Runtime safe debug logging for client components
 * Does NOT import universal logger factory to prevent Winston bundling issues
 */

const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * Edge Runtime Safe Debug Logger
 * Simple console-based logging that works in all contexts without imports
 */
export const clientDebugLog = {
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

  // Additional client-safe categories
  component: (message: string, data?: unknown) => {
    if (isDevelopment) {
      console.log(`🧩 COMPONENT: ${message}`, data);
    }
  },

  ui: (message: string, data?: unknown) => {
    if (isDevelopment) {
      console.log(`🎨 UI: ${message}`, data);
    }
  },

  api: (message: string, data?: unknown) => {
    if (isDevelopment) {
      console.log(`🌐 API: ${message}`, data);
    }
  },

  // Performance debugging for client-side
  performance: (message: string, startTime?: number, data?: unknown) => {
    if (isDevelopment && startTime) {
      const duration = Date.now() - startTime;
      console.log(`⚡ PERFORMANCE: ${message}`, {
        duration,
        performanceOptimized: duration < 100,
        ...(data && typeof data === 'object' ? data : { data }),
      });

      if (duration > 100) {
        console.warn(`Slow client operation: ${message} took ${duration}ms`);
      }
    } else if (isDevelopment) {
      console.log(`⚡ PERFORMANCE: ${message}`, data);
    }
  },
};

/**
 * Client-Safe Error Logging
 * Edge Runtime safe error logging without universal logger dependencies
 */
export const clientErrorLog = (message: string, error?: unknown, context?: unknown) => {
  if (isDevelopment) {
    console.error(`❌ CLIENT ERROR: ${message}`, error, context);
  } else {
    // Production: Basic error logging without sensitive data
    console.error(`❌ CLIENT ERROR: ${message}`, {
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
      context: typeof context === 'object' ? '[CONTEXT_OBJECT]' : context,
    });
  }
};

/**
 * Client-Safe Component Error Logging
 * Specialized for React component errors
 */
export const clientComponentError = (
  componentName: string,
  error: unknown,
  props?: Record<string, unknown>
) => {
  if (isDevelopment) {
    console.error(`💥 COMPONENT ERROR [${componentName}]:`, error, { props });
  } else {
    console.error(`💥 COMPONENT ERROR [${componentName}]:`, {
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
      componentName,
      hasProps: !!props,
    });
  }
};

/**
 * Client-Safe Performance Timing
 * Simple performance measurement for client components
 */
export const clientTiming = (label: string, startTime: number, threshold = 100) => {
  if (isDevelopment) {
    const duration = Date.now() - startTime;
    const isSlowOperation = duration > threshold;

    console.log(`⏱️ CLIENT TIMING: ${label}`, {
      duration,
      threshold,
      isSlowOperation,
    });

    if (isSlowOperation) {
      console.warn(`Slow client operation: ${label} took ${duration}ms`);
    }
  }
};

/**
 * Detect if we're in a client-side context
 */
export const isClientContext = (): boolean => {
  return typeof window !== 'undefined';
};

/**
 * Client-Safe Assert
 * Development-only assertions for client-side code
 */
export const clientAssert = (condition: boolean, message: string, context?: unknown) => {
  if (isDevelopment && !condition) {
    const assertionError = new Error(`Client Assertion Failed: ${message}`);
    console.error('💥 CLIENT ASSERTION FAILED:', {
      assertion: message,
      context,
      timestamp: new Date().toISOString(),
    });

    // In development, throw to halt execution
    throw assertionError;
  }
};

/**
 * Legacy compatibility exports
 * For backward compatibility during migration
 */
export { clientDebugLog as debugLog };
export { clientErrorLog as errorLog };

// Add runtime safety notice
if (isDevelopment && isClientContext()) {
  console.info('🔒 CLIENT-SAFE DEBUG: Using Edge Runtime safe logging (no Winston dependencies)');
}
