/**
 * Universal Logger Migration Feature Flags
 * Controls gradual rollout of universal logging system
 */

export interface MigrationFlags {
  // Phase 1 flags
  enableUniversalCSRFLogging: boolean
  enableUniversalMiddlewareLogging: boolean
  enableUniversalRequestSanitization: boolean
  enableEdgeLoggerReplacement: boolean
  
  // Phase 2 flags
  enableUniversalAuthRoutes: boolean
  enableUniversalAPIRoutes: boolean
  enableUniversalCoreServices: boolean
  
  // Phase 3 flags
  enableUniversalRBACServices: boolean
  enableUniversalBusinessServices: boolean
  enableUniversalDatabaseServices: boolean
  
  // Phase 4 flags
  enableConsoleLoggerReplacement: boolean
  enableDebugLoggerReplacement: boolean
  
  // Performance and monitoring flags
  enablePerformanceMonitoring: boolean
  enableMigrationMetrics: boolean
  enableRollbackOnError: boolean
  
  // Development and testing flags
  enableMigrationDebugging: boolean
  enableVerboseLogging: boolean
}

/**
 * Default migration flags configuration
 */
const DEFAULT_MIGRATION_FLAGS: MigrationFlags = {
  // Phase 1 - Start with all disabled for safety
  enableUniversalCSRFLogging: false,
  enableUniversalMiddlewareLogging: false,
  enableUniversalRequestSanitization: false,
  enableEdgeLoggerReplacement: false,
  
  // Phase 2 - All disabled initially
  enableUniversalAuthRoutes: false,
  enableUniversalAPIRoutes: false,
  enableUniversalCoreServices: false,
  
  // Phase 3 - All disabled initially
  enableUniversalRBACServices: false,
  enableUniversalBusinessServices: false,
  enableUniversalDatabaseServices: false,
  
  // Phase 4 - All disabled initially
  enableConsoleLoggerReplacement: false,
  enableDebugLoggerReplacement: false,
  
  // Monitoring - Enabled by default for tracking
  enablePerformanceMonitoring: true,
  enableMigrationMetrics: true,
  enableRollbackOnError: true,
  
  // Development - Enabled in development only
  enableMigrationDebugging: process.env.NODE_ENV === 'development',
  enableVerboseLogging: process.env.NODE_ENV === 'development'
}

/**
 * Load migration flags from environment variables and defaults
 */
function loadMigrationFlags(): MigrationFlags {
  const flags: MigrationFlags = { ...DEFAULT_MIGRATION_FLAGS }
  
  // Parse environment variables with MIGRATION_ prefix
  Object.keys(flags).forEach(key => {
    const envKey = `MIGRATION_${key.replace(/([A-Z])/g, '_$1').toUpperCase()}`
    const envValue = process.env[envKey]
    
    if (envValue !== undefined) {
      // Convert string to boolean
      const boolValue = envValue.toLowerCase() === 'true' || envValue === '1'
      ;(flags as unknown as Record<string, boolean>)[key] = boolValue
    }
  })
  
  // Special handling for development environment
  if (process.env.NODE_ENV === 'development') {
    // Enable debugging in development
    flags.enableMigrationDebugging = true
    flags.enableVerboseLogging = true
    
    // Optionally enable all Phase 1 flags in development
    if (process.env.MIGRATION_DEV_ENABLE_ALL === 'true') {
      flags.enableUniversalCSRFLogging = true
      flags.enableUniversalMiddlewareLogging = true
      flags.enableUniversalRequestSanitization = true
      flags.enableEdgeLoggerReplacement = true
    }
  }
  
  return flags
}

/**
 * Cached migration flags instance
 */
let cachedFlags: MigrationFlags | null = null

/**
 * Get migration flags (cached)
 */
export function getMigrationFlags(): MigrationFlags {
  if (!cachedFlags) {
    cachedFlags = loadMigrationFlags()
  }
  return cachedFlags
}

/**
 * Reset migration flags cache (useful for testing)
 */
export function resetMigrationFlagsCache(): void {
  cachedFlags = null
}

/**
 * Check if a specific migration feature is enabled
 */
export function isMigrationEnabled(feature: keyof MigrationFlags): boolean {
  const flags = getMigrationFlags()
  return flags[feature]
}

/**
 * Get phase-specific flags
 */
export function getPhase1Flags() {
  const flags = getMigrationFlags()
  return {
    enableUniversalCSRFLogging: flags.enableUniversalCSRFLogging,
    enableUniversalMiddlewareLogging: flags.enableUniversalMiddlewareLogging,
    enableUniversalRequestSanitization: flags.enableUniversalRequestSanitization,
    enableEdgeLoggerReplacement: flags.enableEdgeLoggerReplacement
  }
}

export function getPhase2Flags() {
  const flags = getMigrationFlags()
  return {
    enableUniversalAuthRoutes: flags.enableUniversalAuthRoutes,
    enableUniversalAPIRoutes: flags.enableUniversalAPIRoutes,
    enableUniversalCoreServices: flags.enableUniversalCoreServices
  }
}

export function getPhase3Flags() {
  const flags = getMigrationFlags()
  return {
    enableUniversalRBACServices: flags.enableUniversalRBACServices,
    enableUniversalBusinessServices: flags.enableUniversalBusinessServices,
    enableUniversalDatabaseServices: flags.enableUniversalDatabaseServices
  }
}

export function getPhase4Flags() {
  const flags = getMigrationFlags()
  return {
    enableConsoleLoggerReplacement: flags.enableConsoleLoggerReplacement,
    enableDebugLoggerReplacement: flags.enableDebugLoggerReplacement
  }
}

/**
 * Get monitoring and debugging flags
 */
export function getMonitoringFlags() {
  const flags = getMigrationFlags()
  return {
    enablePerformanceMonitoring: flags.enablePerformanceMonitoring,
    enableMigrationMetrics: flags.enableMigrationMetrics,
    enableRollbackOnError: flags.enableRollbackOnError,
    enableMigrationDebugging: flags.enableMigrationDebugging,
    enableVerboseLogging: flags.enableVerboseLogging
  }
}

/**
 * Migration logger with feature flag support
 */
export class MigrationLogger {
  private static instance: MigrationLogger | null = null
  private flags: MigrationFlags
  
  private constructor() {
    this.flags = getMigrationFlags()
  }
  
  static getInstance(): MigrationLogger {
    if (!MigrationLogger.instance) {
      MigrationLogger.instance = new MigrationLogger()
    }
    return MigrationLogger.instance
  }
  
  /**
   * Log migration event if debugging is enabled
   */
  logMigration(phase: string, component: string, event: string, data?: Record<string, unknown>): void {
    if (!this.flags.enableMigrationDebugging) return
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      phase,
      component,
      event,
      ...data
    }
    
    if (this.flags.enableVerboseLogging) {
      console.log(`[MIGRATION] ${phase}/${component}: ${event}`, logEntry)
    } else {
      console.log(`[MIGRATION] ${phase}/${component}: ${event}`)
    }
  }
  
  /**
   * Log performance metric if monitoring is enabled
   */
  logPerformance(component: string, operation: string, duration: number, metadata?: Record<string, unknown>): void {
    if (!this.flags.enablePerformanceMonitoring) return
    
    const perfEntry = {
      timestamp: new Date().toISOString(),
      component,
      operation,
      duration,
      ...metadata
    }
    
    console.log(`[MIGRATION-PERF] ${component}/${operation}: ${duration.toFixed(2)}ms`, perfEntry)
  }
  
  /**
   * Log migration error
   */
  logError(phase: string, component: string, error: Error, context?: Record<string, unknown>): void {
    const errorEntry = {
      timestamp: new Date().toISOString(),
      phase,
      component,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      },
      ...context
    }
    
    console.error(`[MIGRATION-ERROR] ${phase}/${component}:`, errorEntry)
    
    // Trigger rollback if enabled
    if (this.flags.enableRollbackOnError) {
      console.error(`[MIGRATION] Rollback triggered by error in ${phase}/${component}`)
      // Note: Actual rollback implementation would be handled by the migration system
    }
  }
}

/**
 * Utility function to conditionally use universal logger or fallback
 */
export function createConditionalLogger<T>(
  flagName: keyof MigrationFlags,
  universalLoggerFactory: () => T,
  fallbackLoggerFactory: () => T
): T {
  const migrationLogger = MigrationLogger.getInstance()
  
  try {
    if (isMigrationEnabled(flagName)) {
      migrationLogger.logMigration('conditional', String(flagName), 'using_universal_logger')
      return universalLoggerFactory()
    } else {
      migrationLogger.logMigration('conditional', String(flagName), 'using_fallback_logger')
      return fallbackLoggerFactory()
    }
  } catch (error) {
    migrationLogger.logError('conditional', String(flagName), error as Error)
    
    // Always fallback on error
    migrationLogger.logMigration('conditional', String(flagName), 'fallback_due_to_error')
    return fallbackLoggerFactory()
  }
}

/**
 * Helper to print current migration flags status
 */
export function printMigrationFlagsStatus(): void {
  const flags = getMigrationFlags()
  
  console.log('🚩 Migration Flags Status:')
  console.log('=' .repeat(50))
  
  console.log('\n📋 Phase 1 (Edge Runtime Critical):')
  console.log(`  CSRF Logging: ${flags.enableUniversalCSRFLogging ? '✅' : '❌'}`)
  console.log(`  Middleware Logging: ${flags.enableUniversalMiddlewareLogging ? '✅' : '❌'}`)
  console.log(`  Request Sanitization: ${flags.enableUniversalRequestSanitization ? '✅' : '❌'}`)
  console.log(`  Edge Logger Replacement: ${flags.enableEdgeLoggerReplacement ? '✅' : '❌'}`)
  
  console.log('\n🔐 Phase 2 (API Routes):')
  console.log(`  Auth Routes: ${flags.enableUniversalAuthRoutes ? '✅' : '❌'}`)
  console.log(`  API Routes: ${flags.enableUniversalAPIRoutes ? '✅' : '❌'}`)
  console.log(`  Core Services: ${flags.enableUniversalCoreServices ? '✅' : '❌'}`)
  
  console.log('\n🏢 Phase 3 (Business Services):')
  console.log(`  RBAC Services: ${flags.enableUniversalRBACServices ? '✅' : '❌'}`)
  console.log(`  Business Services: ${flags.enableUniversalBusinessServices ? '✅' : '❌'}`)
  console.log(`  Database Services: ${flags.enableUniversalDatabaseServices ? '✅' : '❌'}`)
  
  console.log('\n🧹 Phase 4 (Console Cleanup):')
  console.log(`  Console Replacement: ${flags.enableConsoleLoggerReplacement ? '✅' : '❌'}`)
  console.log(`  Debug Replacement: ${flags.enableDebugLoggerReplacement ? '✅' : '❌'}`)
  
  console.log('\n📊 Monitoring & Debugging:')
  console.log(`  Performance Monitoring: ${flags.enablePerformanceMonitoring ? '✅' : '❌'}`)
  console.log(`  Migration Metrics: ${flags.enableMigrationMetrics ? '✅' : '❌'}`)
  console.log(`  Rollback on Error: ${flags.enableRollbackOnError ? '✅' : '❌'}`)
  console.log(`  Migration Debugging: ${flags.enableMigrationDebugging ? '✅' : '❌'}`)
  console.log(`  Verbose Logging: ${flags.enableVerboseLogging ? '✅' : '❌'}`)
  
  console.log('\n' + '='.repeat(50))
}

export default {
  getMigrationFlags,
  isMigrationEnabled,
  getPhase1Flags,
  getPhase2Flags,
  getPhase3Flags,
  getPhase4Flags,
  getMonitoringFlags,
  MigrationLogger,
  createConditionalLogger,
  printMigrationFlagsStatus
}
