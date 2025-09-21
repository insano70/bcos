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
    ...meta
  };
  return JSON.stringify(logEntry);
}

/**
 * Create an edge-compatible logger
 */
export function createEdgeLogger(context?: unknown): EdgeLogger {
  const contextMeta = context || {};

  return {
    info: (message: string, meta?: unknown) => {
      console.log(formatLog('info', message, { ...contextMeta, ...meta }));
    },
    warn: (message: string, meta?: unknown) => {
      console.warn(formatLog('warn', message, { ...contextMeta, ...meta }));
    },
    error: (message: string, error?: unknown, meta?: unknown) => {
      const errorMeta = error instanceof Error 
        ? { 
            error: error.message, 
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined 
          }
        : { error };
      console.error(formatLog('error', message, { ...contextMeta, ...errorMeta, ...meta }));
    },
    debug: (message: string, meta?: unknown) => {
      if (process.env.NODE_ENV === 'development') {
        console.log(formatLog('debug', message, { ...contextMeta, ...meta }));
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
  logger.warn(`Security Event: ${event}`, {
    security: true,
    event,
    severity,
    ...details
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
  logger.info(`Performance: ${metric}`, {
    performance: true,
    metric,
    duration,
    ...details
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
