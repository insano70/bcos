/**
 * Production Log Optimizer
 * Intelligent log level management, sampling, and performance optimization for production environments
 */

import { createAppLogger } from './factory';

interface SamplingConfig {
  // Log level sampling rates (0.0 to 1.0)
  debug: number;
  info: number;
  warn: number;
  error: number;
  
  // Feature-specific sampling
  security: number;
  performance: number;
  business: number;
  authentication: number;
  
  // Volume-based adaptive sampling
  adaptive: {
    enabled: boolean;
    maxLogsPerSecond: number;
    emergencyReduction: number; // Factor to reduce sampling when overwhelmed
  };
  
  // High-frequency operation sampling
  highFrequency: {
    enabled: boolean;
    operations: Record<string, number>; // operation -> sampling rate
  };
}

interface ProductionConfig {
  // Environment configuration
  environment: 'production' | 'staging' | 'development';
  
  // Log level configuration
  logLevel: 'error' | 'warn' | 'info' | 'debug';
  
  // Sampling configuration
  sampling: SamplingConfig;
  
  // Performance optimization
  performance: {
    asyncLogging: boolean;
    bufferSize: number;
    flushInterval: number; // milliseconds
    maxMemoryUsage: number; // MB
  };
  
  // Volume management
  volume: {
    maxLogsPerSecond: number;
    rateLimitingEnabled: boolean;
    compressionEnabled: boolean;
  };
  
  // Compliance and retention
  compliance: {
    hipaaMode: boolean;
    auditTrailRequired: boolean;
    retentionPeriod: number; // days
  };
}

class ProductionOptimizer {
  private config: ProductionConfig;
  private logCounts: Map<string, { count: number; timestamp: number }> = new Map();
  private lastFlush = Date.now();
  private logBuffer: Array<{ level: string; message: string; meta: Record<string, unknown>; timestamp: number }> = [];
  
  private readonly optimizerLogger = this.createSafeLogger();

  /**
   * Create safe logger that doesn't cause initialization issues
   */
  private createSafeLogger() {
    try {
      return createAppLogger('production-optimizer', {
        component: 'performance',
        feature: 'log-optimization',
        module: 'production-optimizer'
      });
    } catch (error) {
      // Fallback to simple console logger if universal logger fails
      return {
        info: (message: string, data?: Record<string, unknown>) => console.log(`[OPTIMIZER] ${message}`, data),
        warn: (message: string, data?: Record<string, unknown>) => console.warn(`[OPTIMIZER] ${message}`, data),
        error: (message: string, error?: Error, data?: Record<string, unknown>) => console.error(`[OPTIMIZER] ${message}`, error, data),
        debug: (message: string, data?: Record<string, unknown>) => console.debug(`[OPTIMIZER] ${message}`, data)
      };
    }
  }

  /**
   * Type-safe environment parsing with fallback
   */
  private parseEnvironment(env: string | undefined): 'production' | 'staging' | 'development' {
    if (env === 'production' || env === 'staging' || env === 'development') {
      return env
    }
    return 'development'
  }

  /**
   * Type-safe log level parsing with fallback
   */
  private parseLogLevel(level: string | undefined): 'error' | 'warn' | 'info' | 'debug' {
    if (level === 'error' || level === 'warn' || level === 'info' || level === 'debug') {
      return level
    }
    return 'info'
  }

  constructor(config?: Partial<ProductionConfig>) {
    // Type-safe environment variable parsing
    const environment = this.parseEnvironment(process.env.NODE_ENV)
    const logLevel = this.parseLogLevel(process.env.LOG_LEVEL)
    
    this.config = {
      environment,
      logLevel,
      sampling: {
        debug: process.env.NODE_ENV === 'production' ? 0.01 : 1.0, // 1% in prod
        info: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,   // 10% in prod
        warn: process.env.NODE_ENV === 'production' ? 0.5 : 1.0,   // 50% in prod
        error: 1.0, // Always log errors
        
        security: 1.0, // Always log security events
        performance: process.env.NODE_ENV === 'production' ? 0.05 : 1.0, // 5% in prod
        business: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,     // 20% in prod
        authentication: 1.0, // Always log auth events
        
        adaptive: {
          enabled: true,
          maxLogsPerSecond: 1000,
          emergencyReduction: 0.1 // Reduce to 10% when overwhelmed
        },
        
        highFrequency: {
          enabled: true,
          operations: {
            'database_query': 0.01,    // 1% of DB queries
            'cache_hit': 0.001,        // 0.1% of cache hits
            'api_request': 0.05,       // 5% of API requests
            'validation_check': 0.01,  // 1% of validations
            'permission_check': 0.02   // 2% of permission checks
          }
        }
      },
      
      performance: {
        asyncLogging: true,
        bufferSize: 1000,
        flushInterval: 5000, // 5 seconds
        maxMemoryUsage: 100 // 100 MB
      },
      
      volume: {
        maxLogsPerSecond: 1000,
        rateLimitingEnabled: true,
        compressionEnabled: true
      },
      
      compliance: {
        hipaaMode: true,
        auditTrailRequired: true,
        retentionPeriod: 2555 // 7 years for HIPAA
      },
      
      ...config
    };

    // Start flush timer if async logging is enabled
    if (this.config.performance.asyncLogging) {
      this.startFlushTimer();
    }
  }

  /**
   * Determine if a log should be sampled based on level and context
   */
  shouldSample(
    level: string, 
    context?: { 
      component?: string; 
      feature?: string; 
      operation?: string;
      frequency?: 'high' | 'medium' | 'low';
    }
  ): boolean {
    // Always sample if not in production
    if (this.config.environment !== 'production') {
      return true;
    }

    // Check log level hierarchy
    if (!this.meetsLogLevel(level)) {
      return false;
    }

    // Always sample critical events
    if (level === 'error' || context?.component === 'security') {
      return true;
    }

    // Check adaptive sampling if enabled
    if (this.config.sampling.adaptive.enabled && this.isLogVolumeHigh()) {
      return this.applyAdaptiveSampling(level, context);
    }

    // Apply feature-specific sampling
    if (context?.component) {
      const featureRate = this.getFeatureSamplingRate(context.component);
      if (featureRate < 1.0 && Math.random() > featureRate) {
        return false;
      }
    }

    // Apply operation-specific sampling for high-frequency operations
    if (context?.operation && this.config.sampling.highFrequency.enabled) {
      const operationRate = this.config.sampling.highFrequency.operations[context.operation];
      if (operationRate && Math.random() > operationRate) {
        return false;
      }
    }

    // Apply level-based sampling
    const levelRate = this.getLevelSamplingRate(level);
    return Math.random() <= levelRate;
  }

  /**
   * Check if log level meets minimum threshold
   */
  private meetsLogLevel(level: string): boolean {
    const levelPriority = { debug: 0, info: 1, warn: 2, error: 3 };
    const configPriority = levelPriority[this.config.logLevel as keyof typeof levelPriority] || 1;
    const logPriority = levelPriority[level as keyof typeof levelPriority] || 1;
    return logPriority >= configPriority;
  }

  /**
   * Get sampling rate for log level
   */
  private getLevelSamplingRate(level: string): number {
    switch (level) {
      case 'debug': return this.config.sampling.debug;
      case 'info': return this.config.sampling.info;
      case 'warn': return this.config.sampling.warn;
      case 'error': return this.config.sampling.error;
      default: return 1.0;
    }
  }

  /**
   * Get sampling rate for feature/component
   */
  private getFeatureSamplingRate(component: string): number {
    switch (component) {
      case 'security': return this.config.sampling.security;
      case 'performance': return this.config.sampling.performance;
      case 'business-logic': return this.config.sampling.business;
      case 'authentication': return this.config.sampling.authentication;
      default: return 1.0;
    }
  }

  /**
   * Check if log volume is high and adaptive sampling should kick in
   */
  private isLogVolumeHigh(): boolean {
    const now = Date.now();
    const windowStart = now - 1000; // 1 second window
    
    // Clean old entries
    for (const [key, data] of Array.from(this.logCounts.entries())) {
      if (data.timestamp < windowStart) {
        this.logCounts.delete(key);
      }
    }

    // Count logs in current window
    const totalLogs = Array.from(this.logCounts.values())
      .reduce((sum, data) => sum + data.count, 0);

    return totalLogs > this.config.sampling.adaptive.maxLogsPerSecond;
  }

  /**
   * Apply adaptive sampling during high-volume periods
   */
  private applyAdaptiveSampling(level: string, context?: Record<string, unknown>): boolean {
    const baseRate = this.getLevelSamplingRate(level);
    const adaptiveRate = baseRate * this.config.sampling.adaptive.emergencyReduction;
    
    // Log that adaptive sampling is active
    if (Math.random() < 0.001) { // Sample 0.1% of these messages
      this.optimizerLogger.warn('Adaptive sampling active due to high log volume', {
        currentRate: adaptiveRate,
        baseRate,
        level,
        component: context?.component
      });
    }
    
    return Math.random() <= adaptiveRate;
  }

  /**
   * Record log for volume tracking
   */
  recordLog(level: string, component?: string): void {
    const key = `${level}:${component || 'default'}`;
    const now = Date.now();
    const existing = this.logCounts.get(key);
    
    if (existing && now - existing.timestamp < 1000) {
      existing.count++;
    } else {
      this.logCounts.set(key, { count: 1, timestamp: now });
    }
  }

  /**
   * Optimize log data for performance and compliance
   */
  optimizeLogData(
    level: string, 
    message: string, 
    meta: Record<string, unknown>
  ): { message: string; meta: Record<string, unknown> } {
    const optimizedMeta = { ...meta };

    // Add optimization metadata
    optimizedMeta._optimization = {
      sampled: true,
      timestamp: new Date().toISOString(),
      environment: this.config.environment,
      optimizerVersion: '1.0.0'
    };

    // Add compliance metadata if required
    if (this.config.compliance.hipaaMode) {
      optimizedMeta._compliance = {
        framework: 'HIPAA',
        retentionRequired: this.config.compliance.auditTrailRequired,
        retentionPeriod: `${this.config.compliance.retentionPeriod}_days`,
        dataClassification: this.classifyData(meta)
      };
    }

    // Compress large metadata if enabled
    if (this.config.volume.compressionEnabled) {
      return this.compressLogData(message, optimizedMeta);
    }

    return { message, meta: optimizedMeta };
  }

  /**
   * Classify data for compliance purposes
   */
  private classifyData(meta: Record<string, unknown>): string {
    // Check for sensitive data patterns
    const sensitiveFields = ['userId', 'email', 'password', 'ssn', 'phone'];
    const hasSensitiveData = Object.keys(meta).some(key => 
      sensitiveFields.some(field => key.toLowerCase().includes(field))
    );

    if (hasSensitiveData) return 'SENSITIVE';
    if (meta.component === 'security' || meta.component === 'authentication') return 'SECURITY';
    if (meta.component === 'business-logic') return 'BUSINESS';
    return 'OPERATIONAL';
  }

  /**
   * Compress log data for storage efficiency
   */
  private compressLogData(
    message: string, 
    meta: Record<string, unknown>
  ): { message: string; meta: Record<string, unknown> } {
    // Truncate very long messages
    const truncatedMessage = message.length > 500 
      ? message.substring(0, 497) + '...'
      : message;

    // Compress large metadata objects
    const compressedMeta = this.compressMetadata(meta);

    return { message: truncatedMessage, meta: compressedMeta };
  }

  /**
   * Compress metadata object
   */
  private compressMetadata(meta: Record<string, unknown>): Record<string, unknown> {
    const compressed: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(meta)) {
      if (typeof value === 'string' && value.length > 200) {
        compressed[key] = value.substring(0, 197) + '...';
      } else if (Array.isArray(value) && value.length > 10) {
        compressed[key] = [...value.slice(0, 10), `... +${value.length - 10} more`];
      } else {
        compressed[key] = value;
      }
    }

    return compressed;
  }

  /**
   * Start automatic buffer flushing for async logging
   */
  private startFlushTimer(): void {
    setInterval(() => {
      this.flushBuffer();
    }, this.config.performance.flushInterval);
  }

  /**
   * Flush log buffer (placeholder for actual implementation)
   */
  private flushBuffer(): void {
    if (this.logBuffer.length === 0) return;

    const bufferSize = this.logBuffer.length;
    this.logBuffer = [];

    // In a real implementation, this would write to the actual log transport
    if (bufferSize > 0) {
      this.optimizerLogger.debug('Flushed log buffer', {
        bufferSize,
        memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024, // MB
        interval: this.config.performance.flushInterval
      });
    }
  }

  /**
   * Get current optimization statistics
   */
  getStats(): {
    environment: string;
    logLevel: string;
    samplingRates: Record<string, number>;
    currentVolume: number;
    bufferSize: number;
    adaptiveSamplingActive: boolean;
  } {
    return {
      environment: this.config.environment,
      logLevel: this.config.logLevel,
      samplingRates: {
        debug: this.config.sampling.debug,
        info: this.config.sampling.info,
        warn: this.config.sampling.warn,
        error: this.config.sampling.error
      },
      currentVolume: Array.from(this.logCounts.values())
        .reduce((sum, data) => sum + data.count, 0),
      bufferSize: this.logBuffer.length,
      adaptiveSamplingActive: this.isLogVolumeHigh()
    };
  }

  /**
   * Update configuration at runtime
   */
  updateConfig(updates: Partial<ProductionConfig>): void {
    this.config = { ...this.config, ...updates };
    
    this.optimizerLogger.info('Production optimizer configuration updated', {
      updates: Object.keys(updates),
      newConfig: {
        logLevel: this.config.logLevel,
        environment: this.config.environment,
        asyncLogging: this.config.performance.asyncLogging
      }
    });
  }
}

// Global production optimizer instance - lazy initialization to prevent startup issues
let productionOptimizerInstance: ProductionOptimizer | null = null

export const productionOptimizer = {
  get instance(): ProductionOptimizer {
    if (!productionOptimizerInstance) {
      productionOptimizerInstance = new ProductionOptimizer();
    }
    return productionOptimizerInstance;
  },
  
  // Proxy methods for backward compatibility
  shouldSample: (level: string, context?: Record<string, unknown>) => {
    return productionOptimizer.instance.shouldSample(level, context);
  },
  
  recordLog: (level: string, component?: string) => {
    return productionOptimizer.instance.recordLog(level, component);
  },
  
  getStats: () => {
    return productionOptimizer.instance.getStats();
  },
  
  updateConfig: (updates: Partial<ProductionConfig>) => {
    return productionOptimizer.instance.updateConfig(updates);
  }
};

// Export types and classes for advanced usage
export { ProductionOptimizer, type ProductionConfig, type SamplingConfig };