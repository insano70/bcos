/**
 * Client-Safe Debug Factory
 * Provides debug utilities for client components without importing universal logger factory
 * Prevents Winston bundling in Edge Runtime contexts
 */

// Detect if we're in a client-side context at build time
const isClientContext = typeof window !== 'undefined' || 
                       typeof document !== 'undefined' ||
                       (typeof globalThis !== 'undefined' && 
                        'window' in globalThis && globalThis.window !== undefined);

const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * Simple logger interface for client-safe operations
 */
interface ClientSafeLogger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, error?: Error | unknown, data?: Record<string, unknown>): void;
  debug(message: string, data?: Record<string, unknown>): void;
  timing(message: string, startTime: number, data?: Record<string, unknown>): void;
}

/**
 * Client-safe logger implementation using console
 */
class ClientSafeLoggerImpl implements ClientSafeLogger {
  constructor(private prefix: string) {}

  info(message: string, data?: Record<string, unknown>): void {
    if (isDevelopment) {
      console.log(`ℹ️ ${this.prefix}: ${message}`, data);
    }
  }

  warn(message: string, data?: Record<string, unknown>): void {
    if (isDevelopment) {
      console.warn(`⚠️ ${this.prefix}: ${message}`, data);
    }
  }

  error(message: string, error?: Error | unknown, data?: Record<string, unknown>): void {
    if (isDevelopment) {
      console.error(`❌ ${this.prefix}: ${message}`, error, data);
    } else {
      // Production: Sanitized error logging
      console.error(`❌ ${this.prefix}: ${message}`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
        data: data || {}
      });
    }
  }

  debug(message: string, data?: Record<string, unknown>): void {
    if (isDevelopment) {
      console.debug(`🔍 ${this.prefix}: ${message}`, data);
    }
  }

  timing(message: string, startTime: number, data?: Record<string, unknown>): void {
    if (isDevelopment) {
      const duration = Date.now() - startTime;
      console.log(`⏱️ ${this.prefix} TIMING: ${message}`, {
        duration,
        performanceOptimized: duration < 100,
        ...(data && typeof data === 'object' ? data : { data })
      });
      
      if (duration > 100) {
        console.warn(`Slow operation: ${message} took ${duration}ms`);
      }
    }
  }
}

/**
 * Create client-safe debug logger by category
 */
export function createClientSafeLogger(category: string): ClientSafeLogger {
  const categoryMap: Record<string, string> = {
    auth: '🔐 AUTH',
    middleware: '🌐 MIDDLEWARE', 
    rbac: '🎯 RBAC',
    security: '🛡️ SECURITY',
    session: '🔄 SESSION',
    component: '🧩 COMPONENT',
    ui: '🎨 UI',
    api: '🌐 API',
    performance: '⚡ PERFORMANCE'
  };
  
  const prefix = categoryMap[category] || `🔧 ${category.toUpperCase()}`;
  return new ClientSafeLoggerImpl(prefix);
}

/**
 * Client-safe debug utilities with same interface as server-side debug
 */
export const clientSafeDebugLog = {
  auth: createClientSafeLogger('auth'),
  middleware: createClientSafeLogger('middleware'),
  rbac: createClientSafeLogger('rbac'),
  security: createClientSafeLogger('security'),
  session: createClientSafeLogger('session'),
  component: createClientSafeLogger('component'),
  ui: createClientSafeLogger('ui'),
  api: createClientSafeLogger('api'),
  
  // Performance debugging
  performance: (message: string, startTime?: number, data?: unknown) => {
    const perfLogger = createClientSafeLogger('performance');
    if (startTime) {
      perfLogger.timing(message, startTime, data as Record<string, unknown>);
    } else {
      perfLogger.debug(message, data as Record<string, unknown>);
    }
  }
};

/**
 * Runtime context detection for logging strategy
 */
export function isInClientContext(): boolean {
  return isClientContext;
}

/**
 * Get appropriate debug logger based on context
 * Returns client-safe logger in client contexts, can import universal logger in server contexts
 */
export async function getContextualDebugLogger() {
  if (isClientContext) {
    return clientSafeDebugLog;
  } else {
    // Dynamic import for server contexts only
    try {
      const { debugLog } = await import('./debug');
      return debugLog;
    } catch (error) {
      // Fallback to client-safe logger if import fails
      console.warn('Falling back to client-safe debug logger:', error);
      return clientSafeDebugLog;
    }
  }
}

// Default export for client contexts
export default clientSafeDebugLog;
