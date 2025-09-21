/**
 * Edge-compatible logger for use in middleware
 * Uses console logging instead of winston to avoid Node.js dependencies
 */

export interface EdgeLogger {
  info: (message: string, meta?: unknown) => void;
  warn: (message: string, meta?: unknown) => void;
  error: (message: string, error?: unknown, meta?: unknown) => void;
  debug: (message: string, meta?: unknown) => void;
}

/**
 * Format log entry for edge runtime
 */
function formatLog(level: string, message: string, meta?: unknown): string {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    ...(meta && typeof meta === 'object' && !Array.isArray(meta) ? meta as Record<string, unknown> : {})
  };
  return JSON.stringify(logEntry);
}

/**
 * Create an edge-compatible logger
 */
export function createEdgeLogger(context?: unknown): EdgeLogger {
  const contextMeta = (context && typeof context === 'object' && !Array.isArray(context)) ? context as Record<string, unknown> : {};

  return {
    info: (message: string, meta?: unknown) => {
      const safeMeta = (meta && typeof meta === 'object' && !Array.isArray(meta)) ? meta as Record<string, unknown> : {};
      console.log(formatLog('info', message, { ...contextMeta, ...safeMeta }));
    },
    warn: (message: string, meta?: unknown) => {
      const safeMeta = (meta && typeof meta === 'object' && !Array.isArray(meta)) ? meta as Record<string, unknown> : {};
      console.warn(formatLog('warn', message, { ...contextMeta, ...safeMeta }));
    },
    error: (message: string, error?: unknown, meta?: unknown) => {
      const errorMeta = error instanceof Error 
        ? { 
            error: error.message, 
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined 
          }
        : { error };
      const safeMeta = (meta && typeof meta === 'object' && !Array.isArray(meta)) ? meta as Record<string, unknown> : {};
      console.error(formatLog('error', message, { ...contextMeta, ...errorMeta, ...safeMeta }));
    },
    debug: (message: string, meta?: unknown) => {
      if (process.env.NODE_ENV === 'development') {
        const safeMeta = (meta && typeof meta === 'object' && !Array.isArray(meta)) ? meta as Record<string, unknown> : {};
        console.log(formatLog('debug', message, { ...contextMeta, ...safeMeta }));
      }
    }
  };
}

/**
 * Log security event in edge runtime
 */
export function logEdgeSecurityEvent(
  logger: EdgeLogger,
  event: string,
  severity: 'low' | 'medium' | 'high' | 'critical',
  details?: unknown
): void {
  const safeDetails = (details && typeof details === 'object' && !Array.isArray(details)) ? details as Record<string, unknown> : {};
  logger.warn(`Security Event: ${event}`, {
    security: true,
    event,
    severity,
    ...safeDetails
  });
}

/**
 * Log performance metric in edge runtime
 */
export function logEdgePerformanceMetric(
  logger: EdgeLogger,
  metric: string,
  duration: number,
  details?: unknown
): void {
  const safeDetails = (details && typeof details === 'object' && !Array.isArray(details)) ? details as Record<string, unknown> : {};
  logger.info(`Performance: ${metric}`, {
    performance: true,
    metric,
    duration,
    ...safeDetails
  });
}

/**
 * Create API logger for edge runtime
 */
export function createEdgeAPILogger(request: Request): EdgeLogger {
  const url = new URL(request.url);
  const context = {
    path: url.pathname,
    method: request.method,
    userAgent: request.headers.get('user-agent') || 'unknown',
    ip: request.headers.get('x-forwarded-for') || 'unknown'
  };
  
  return createEdgeLogger(context);
}
