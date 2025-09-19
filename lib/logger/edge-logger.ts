/**
 * Edge-compatible logger for use in middleware
 * Uses console logging instead of winston to avoid Node.js dependencies
 */

export interface EdgeLogger {
  info: (message: string, meta?: any) => void;
  warn: (message: string, meta?: any) => void;
  error: (message: string, error?: any, meta?: any) => void;
  debug: (message: string, meta?: any) => void;
}

/**
 * Format log entry for edge runtime
 */
function formatLog(level: string, message: string, meta?: any): string {
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
export function createEdgeLogger(context?: any): EdgeLogger {
  const contextMeta = context || {};

  return {
    info: (message: string, meta?: any) => {
      console.log(formatLog('info', message, { ...contextMeta, ...meta }));
    },
    warn: (message: string, meta?: any) => {
      console.warn(formatLog('warn', message, { ...contextMeta, ...meta }));
    },
    error: (message: string, error?: any, meta?: any) => {
      const errorMeta = error instanceof Error 
        ? { 
            error: error.message, 
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined 
          }
        : { error };
      console.error(formatLog('error', message, { ...contextMeta, ...errorMeta, ...meta }));
    },
    debug: (message: string, meta?: any) => {
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
  details?: any
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
  details?: any
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
