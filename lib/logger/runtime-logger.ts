/**
 * Runtime-Adaptive Logger
 * Automatically chooses the appropriate logger based on runtime environment
 */

import type { 
  UniversalLogger, 
  LoggerAdapter, 
  LoggerConfig 
} from './universal-logger'
import { detectRuntimeSafe as detectRuntime, isNodeRuntimeSafe as isNodeRuntime, isEdgeRuntimeSafe as isEdgeRuntime, getRuntimeInfoSafe as getRuntimeInfo } from './runtime-detector-safe'
import { EdgeLoggerAdapter } from './adapters/edge-adapter'
import { WinstonLoggerAdapter } from './adapters/winston-adapter'

/**
 * Runtime-specific logger cache to avoid repeated adapter creation
 */
class AdapterManager {
  private nodeAdapter: LoggerAdapter | null = null
  private edgeAdapter: LoggerAdapter | null = null
  private adapterCache = new Map<string, LoggerAdapter>()
  
  /**
   * Get the appropriate adapter for current runtime
   */
  getAdapter(config?: LoggerConfig): LoggerAdapter {
    const runtime = detectRuntime()
    const cacheKey = `${runtime}-${JSON.stringify(config || {})}`
    
    // Return cached adapter if available
    if (this.adapterCache.has(cacheKey)) {
      return this.adapterCache.get(cacheKey)!
    }
    
    let adapter: LoggerAdapter
    
    if (runtime === 'nodejs') {
      adapter = this.getNodeAdapter(config)
    } else {
      adapter = this.getEdgeAdapter(config)
    }
    
    // Cache the adapter for reuse
    this.adapterCache.set(cacheKey, adapter)
    return adapter
  }
  
  /**
   * Get Node.js winston adapter with fallback
   */
  private getNodeAdapter(config?: LoggerConfig): LoggerAdapter {
    if (!this.nodeAdapter || config) {
      try {
        const adapter = new WinstonLoggerAdapter(config)
        if (adapter.isAvailable()) {
          if (!config) this.nodeAdapter = adapter // Only cache default config
          return adapter
        } else {
          throw new Error('Winston adapter not available')
        }
      } catch (error) {
        // Fallback to edge adapter if winston fails
        console.warn('Winston adapter failed, falling back to edge adapter:', error)
        return this.getEdgeAdapter(config)
      }
    }
    return this.nodeAdapter
  }
  
  /**
   * Get Edge runtime adapter
   */
  private getEdgeAdapter(config?: LoggerConfig): LoggerAdapter {
    if (!this.edgeAdapter || config) {
      const adapter = new EdgeLoggerAdapter(config)
      if (!config) this.edgeAdapter = adapter // Only cache default config
      return adapter
    }
    return this.edgeAdapter
  }
  
  /**
   * Clear adapter cache (useful for testing)
   */
  clearCache(): void {
    this.adapterCache.clear()
    this.nodeAdapter = null
    this.edgeAdapter = null
  }
  
  /**
   * Get runtime diagnostics
   */
  getDiagnostics(): {
    currentRuntime: string
    runtimeInfo: ReturnType<typeof getRuntimeInfo>
    nodeAdapterAvailable: boolean
    edgeAdapterAvailable: boolean
    cacheSize: number
  } {
    return {
      currentRuntime: detectRuntime(),
      runtimeInfo: getRuntimeInfo(),
      nodeAdapterAvailable: isNodeRuntime() && this.getNodeAdapter().isAvailable(),
      edgeAdapterAvailable: this.getEdgeAdapter().isAvailable(),
      cacheSize: this.adapterCache.size
    }
  }
}

// Global adapter manager instance
const adapterManager = new AdapterManager()

/**
 * Runtime-Adaptive Logger Implementation
 * Wraps the appropriate adapter based on runtime environment
 */
class RuntimeAdaptiveLogger implements UniversalLogger {
  private adapter: LoggerAdapter
  private underlyingLogger: UniversalLogger
  
  constructor(
    private module: string,
    private context: Record<string, unknown> = {},
    config?: LoggerConfig
  ) {
    this.adapter = adapterManager.getAdapter(config)
    this.underlyingLogger = this.adapter.createLogger(module, context)
  }
  
  // Forward all methods to the underlying logger
  info(message: string, data?: Record<string, unknown>): void {
    this.underlyingLogger.info(message, data)
  }
  
  warn(message: string, data?: Record<string, unknown>): void {
    this.underlyingLogger.warn(message, data)
  }
  
  error(message: string, error?: Error | unknown, data?: Record<string, unknown>): void {
    this.underlyingLogger.error(message, error, data)
  }
  
  debug(message: string, data?: Record<string, unknown>): void {
    this.underlyingLogger.debug(message, data)
  }
  
  child(context: Record<string, unknown>, module?: string): UniversalLogger {
    // Create new adaptive logger with combined context
    return new RuntimeAdaptiveLogger(
      module || this.module,
      { ...this.context, ...context }
    )
  }
  
  withRequest(request: Request | { headers: Headers; url: string; method: string }): UniversalLogger {
    return this.underlyingLogger.withRequest(request)
  }
  
  withUser(userId: string, organizationId?: string): UniversalLogger {
    return this.underlyingLogger.withUser(userId, organizationId)
  }
  
  timing(message: string, startTime: number, data?: Record<string, unknown>): void {
    this.underlyingLogger.timing(message, startTime, data)
  }
  
  http(message: string, statusCode: number, duration?: number, data?: Record<string, unknown>): void {
    this.underlyingLogger.http(message, statusCode, duration, data)
  }
  
  db(operation: string, table: string, duration?: number, data?: Record<string, unknown>): void {
    this.underlyingLogger.db(operation, table, duration, data)
  }
  
  auth(action: string, success: boolean, data?: Record<string, unknown>): void {
    this.underlyingLogger.auth(action, success, data)
  }
  
  security(event: string, severity: 'low' | 'medium' | 'high' | 'critical', data?: Record<string, unknown>): void {
    this.underlyingLogger.security(event, severity, data)
  }
}

/**
 * Create a runtime-adaptive logger for the specified module
 */
export function createUniversalLogger(module: string, context?: Record<string, unknown>, config?: LoggerConfig): UniversalLogger {
  return new RuntimeAdaptiveLogger(module, context, config)
}

/**
 * Create logger with automatic runtime behavior tracking
 */
export function createTrackedLogger(module: string, context?: Record<string, unknown>, config?: LoggerConfig): UniversalLogger {
  const logger = createUniversalLogger(module, context, config)
  
  // Log which runtime adapter is being used (only in development)
  if (process.env.NODE_ENV === 'development') {
    const diagnostics = adapterManager.getDiagnostics()
    logger.debug('Logger adapter selected', {
      runtime: diagnostics.currentRuntime,
      nodeAvailable: diagnostics.nodeAdapterAvailable,
      edgeAvailable: diagnostics.edgeAdapterAvailable,
      module
    })
  }
  
  return logger
}

/**
 * Get runtime diagnostics for monitoring and debugging
 */
export function getLoggerDiagnostics(): ReturnType<typeof AdapterManager.prototype.getDiagnostics> {
  return adapterManager.getDiagnostics()
}

/**
 * Clear adapter cache (useful for testing)
 */
export function clearLoggerCache(): void {
  adapterManager.clearCache()
}

/**
 * Force adapter selection for testing
 */
export function createLoggerWithAdapter(
  adapter: 'winston' | 'edge',
  module: string,
  context?: Record<string, unknown>,
  config?: LoggerConfig
): UniversalLogger {
  let loggerAdapter: LoggerAdapter
  
  if (adapter === 'winston') {
    loggerAdapter = new WinstonLoggerAdapter(config)
    if (!loggerAdapter.isAvailable()) {
      throw new Error('Winston adapter is not available in this environment')
    }
  } else {
    loggerAdapter = new EdgeLoggerAdapter(config)
  }
  
  return loggerAdapter.createLogger(module, context)
}

/**
 * Default exports
 */
export { RuntimeAdaptiveLogger }
export default createUniversalLogger


