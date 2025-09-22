/**
 * Phase 2 Migration Flags Configuration
 * Specific feature flags for Phase 2 API route migrations
 */

export interface Phase2MigrationFlags {
  // Authentication routes
  enableEnhancedLoginLogging: boolean
  enableEnhancedLogoutLogging: boolean
  enableEnhancedRefreshLogging: boolean
  enableEnhancedSessionLogging: boolean
  enableEnhancedCSRFLogging: boolean
  enableEnhancedMeEndpointLogging: boolean
  
  // API services
  enableEnhancedAuditServiceLogging: boolean
  enableEnhancedEmailServiceLogging: boolean
  enableEnhancedSessionServiceLogging: boolean
  enableEnhancedUploadServiceLogging: boolean
  
  // API middleware
  enableEnhancedAuthMiddleware: boolean
  enableEnhancedJWTMiddleware: boolean
  enableEnhancedRateLimitMiddleware: boolean
  enableEnhancedValidationMiddleware: boolean
  enableEnhancedCSRFMiddleware: boolean
  
  // High-traffic endpoints
  enableEnhancedUserAPIs: boolean
  enableEnhancedPracticeAPIs: boolean
  enableEnhancedUploadAPIs: boolean
  enableEnhancedSearchAPIs: boolean
  enableEnhancedAnalyticsAPIs: boolean
  
  // RBAC and security
  enableEnhancedRBACRouteHandler: boolean
  enableEnhancedSecurityMiddleware: boolean
  
  // Business intelligence features
  enableBusinessIntelligenceLogging: boolean
  enableUserBehaviorAnalytics: boolean
  enablePerformanceAnalytics: boolean
  enableComplianceAnalytics: boolean
  
  // Testing and monitoring
  enablePhase2PerformanceMonitoring: boolean
  enablePhase2SecurityAudit: boolean
  enablePhase2RollbackOnError: boolean
}

/**
 * Default Phase 2 migration flags
 */
const DEFAULT_PHASE2_FLAGS: Phase2MigrationFlags = {
  // Authentication routes - start with most critical
  enableEnhancedLoginLogging: false,
  enableEnhancedLogoutLogging: false,
  enableEnhancedRefreshLogging: false,
  enableEnhancedSessionLogging: false,
  enableEnhancedCSRFLogging: false,
  enableEnhancedMeEndpointLogging: false,
  
  // API services - systematic migration
  enableEnhancedAuditServiceLogging: false,
  enableEnhancedEmailServiceLogging: false,
  enableEnhancedSessionServiceLogging: false,
  enableEnhancedUploadServiceLogging: false,
  
  // API middleware - after services
  enableEnhancedAuthMiddleware: false,
  enableEnhancedJWTMiddleware: false,
  enableEnhancedRateLimitMiddleware: false,
  enableEnhancedValidationMiddleware: false,
  enableEnhancedCSRFMiddleware: false,
  
  // High-traffic endpoints - gradual rollout
  enableEnhancedUserAPIs: false,
  enableEnhancedPracticeAPIs: false,
  enableEnhancedUploadAPIs: false,
  enableEnhancedSearchAPIs: false,
  enableEnhancedAnalyticsAPIs: false,
  
  // RBAC and security - high priority
  enableEnhancedRBACRouteHandler: false,
  enableEnhancedSecurityMiddleware: false,
  
  // Business intelligence - enable after core migration
  enableBusinessIntelligenceLogging: false,
  enableUserBehaviorAnalytics: false,
  enablePerformanceAnalytics: false,
  enableComplianceAnalytics: false,
  
  // Monitoring - always enabled for safety
  enablePhase2PerformanceMonitoring: true,
  enablePhase2SecurityAudit: true,
  enablePhase2RollbackOnError: true
}

/**
 * Load Phase 2 migration flags from environment
 */
function loadPhase2MigrationFlags(): Phase2MigrationFlags {
  const flags: Phase2MigrationFlags = { ...DEFAULT_PHASE2_FLAGS }
  
  // Parse environment variables with PHASE2_ prefix
  Object.keys(flags).forEach(key => {
    const envKey = `PHASE2_${key.replace(/([A-Z])/g, '_$1').toUpperCase()}`
    const envValue = process.env[envKey]
    
    if (envValue !== undefined) {
      const boolValue = envValue.toLowerCase() === 'true' || envValue === '1'
      ;(flags as unknown as Record<string, boolean>)[key] = boolValue
    }
  })
  
  // Development environment special handling
  if (process.env.NODE_ENV === 'development') {
    // Enable all authentication routes in development
    if (process.env.PHASE2_DEV_ENABLE_AUTH === 'true') {
      flags.enableEnhancedLoginLogging = true
      flags.enableEnhancedLogoutLogging = true
      flags.enableEnhancedRefreshLogging = true
      flags.enableEnhancedSessionLogging = true
      flags.enableEnhancedCSRFLogging = true
      flags.enableEnhancedMeEndpointLogging = true
    }
    
    // Enable all API services in development
    if (process.env.PHASE2_DEV_ENABLE_SERVICES === 'true') {
      flags.enableEnhancedAuditServiceLogging = true
      flags.enableEnhancedEmailServiceLogging = true
      flags.enableEnhancedSessionServiceLogging = true
      flags.enableEnhancedUploadServiceLogging = true
    }
    
    // Enable all Phase 2 features in development
    if (process.env.PHASE2_DEV_ENABLE_ALL === 'true') {
      Object.keys(flags).forEach(key => {
        if (!key.includes('RollbackOnError')) { // Keep rollback enabled
          ;(flags as unknown as Record<string, boolean>)[key] = true
        }
      })
    }
  }
  
  return flags
}

/**
 * Cached Phase 2 flags instance
 */
let cachedPhase2Flags: Phase2MigrationFlags | null = null

/**
 * Get Phase 2 migration flags (cached)
 */
export function getPhase2MigrationFlags(): Phase2MigrationFlags {
  if (!cachedPhase2Flags) {
    cachedPhase2Flags = loadPhase2MigrationFlags()
  }
  return cachedPhase2Flags
}

/**
 * Reset Phase 2 migration flags cache
 */
export function resetPhase2MigrationFlagsCache(): void {
  cachedPhase2Flags = null
}

/**
 * Check if a specific Phase 2 migration feature is enabled
 */
export function isPhase2MigrationEnabled(feature: keyof Phase2MigrationFlags): boolean {
  const flags = getPhase2MigrationFlags()
  return flags[feature]
}

/**
 * Get authentication routes flags
 */
export function getAuthRoutesFlags() {
  const flags = getPhase2MigrationFlags()
  return {
    enableEnhancedLoginLogging: flags.enableEnhancedLoginLogging,
    enableEnhancedLogoutLogging: flags.enableEnhancedLogoutLogging,
    enableEnhancedRefreshLogging: flags.enableEnhancedRefreshLogging,
    enableEnhancedSessionLogging: flags.enableEnhancedSessionLogging,
    enableEnhancedCSRFLogging: flags.enableEnhancedCSRFLogging,
    enableEnhancedMeEndpointLogging: flags.enableEnhancedMeEndpointLogging
  }
}

/**
 * Get API services flags
 */
export function getAPIServicesFlags() {
  const flags = getPhase2MigrationFlags()
  return {
    enableEnhancedAuditServiceLogging: flags.enableEnhancedAuditServiceLogging,
    enableEnhancedEmailServiceLogging: flags.enableEnhancedEmailServiceLogging,
    enableEnhancedSessionServiceLogging: flags.enableEnhancedSessionServiceLogging,
    enableEnhancedUploadServiceLogging: flags.enableEnhancedUploadServiceLogging
  }
}

/**
 * Get middleware flags
 */
export function getMiddlewareFlags() {
  const flags = getPhase2MigrationFlags()
  return {
    enableEnhancedAuthMiddleware: flags.enableEnhancedAuthMiddleware,
    enableEnhancedJWTMiddleware: flags.enableEnhancedJWTMiddleware,
    enableEnhancedRateLimitMiddleware: flags.enableEnhancedRateLimitMiddleware,
    enableEnhancedValidationMiddleware: flags.enableEnhancedValidationMiddleware,
    enableEnhancedCSRFMiddleware: flags.enableEnhancedCSRFMiddleware
  }
}

/**
 * Get high-traffic endpoints flags
 */
export function getHighTrafficFlags() {
  const flags = getPhase2MigrationFlags()
  return {
    enableEnhancedUserAPIs: flags.enableEnhancedUserAPIs,
    enableEnhancedPracticeAPIs: flags.enableEnhancedPracticeAPIs,
    enableEnhancedUploadAPIs: flags.enableEnhancedUploadAPIs,
    enableEnhancedSearchAPIs: flags.enableEnhancedSearchAPIs,
    enableEnhancedAnalyticsAPIs: flags.enableEnhancedAnalyticsAPIs
  }
}

/**
 * Get business intelligence flags
 */
export function getBusinessIntelligenceFlags() {
  const flags = getPhase2MigrationFlags()
  return {
    enableBusinessIntelligenceLogging: flags.enableBusinessIntelligenceLogging,
    enableUserBehaviorAnalytics: flags.enableUserBehaviorAnalytics,
    enablePerformanceAnalytics: flags.enablePerformanceAnalytics,
    enableComplianceAnalytics: flags.enableComplianceAnalytics
  }
}

/**
 * Conditional Phase 2 logger creation utility
 */
export function createConditionalPhase2Logger<T>(
  flagName: keyof Phase2MigrationFlags,
  enhancedLoggerFactory: () => T,
  fallbackLoggerFactory: () => T
): T {
  try {
    if (isPhase2MigrationEnabled(flagName)) {
      return enhancedLoggerFactory()
    } else {
      return fallbackLoggerFactory()
    }
  } catch (error) {
    console.error(`Phase 2 logger creation failed for ${String(flagName)}:`, error)
    return fallbackLoggerFactory()
  }
}

/**
 * Print Phase 2 migration flags status
 */
export function printPhase2MigrationStatus(): void {
  const flags = getPhase2MigrationFlags()
  
  console.log('🚀 Phase 2 Migration Flags Status:')
  console.log('=' .repeat(60))
  
  console.log('\n🔐 Authentication Routes:')
  console.log(`  Login Enhancement: ${flags.enableEnhancedLoginLogging ? '✅' : '❌'}`)
  console.log(`  Logout Enhancement: ${flags.enableEnhancedLogoutLogging ? '✅' : '❌'}`)
  console.log(`  Refresh Enhancement: ${flags.enableEnhancedRefreshLogging ? '✅' : '❌'}`)
  console.log(`  Session Enhancement: ${flags.enableEnhancedSessionLogging ? '✅' : '❌'}`)
  console.log(`  CSRF Enhancement: ${flags.enableEnhancedCSRFLogging ? '✅' : '❌'}`)
  console.log(`  Me Endpoint Enhancement: ${flags.enableEnhancedMeEndpointLogging ? '✅' : '❌'}`)
  
  console.log('\n🔧 API Services:')
  console.log(`  Audit Service: ${flags.enableEnhancedAuditServiceLogging ? '✅' : '❌'}`)
  console.log(`  Email Service: ${flags.enableEnhancedEmailServiceLogging ? '✅' : '❌'}`)
  console.log(`  Session Service: ${flags.enableEnhancedSessionServiceLogging ? '✅' : '❌'}`)
  console.log(`  Upload Service: ${flags.enableEnhancedUploadServiceLogging ? '✅' : '❌'}`)
  
  console.log('\n🛡️ API Middleware:')
  console.log(`  Auth Middleware: ${flags.enableEnhancedAuthMiddleware ? '✅' : '❌'}`)
  console.log(`  JWT Middleware: ${flags.enableEnhancedJWTMiddleware ? '✅' : '❌'}`)
  console.log(`  Rate Limit Middleware: ${flags.enableEnhancedRateLimitMiddleware ? '✅' : '❌'}`)
  console.log(`  Validation Middleware: ${flags.enableEnhancedValidationMiddleware ? '✅' : '❌'}`)
  console.log(`  CSRF Middleware: ${flags.enableEnhancedCSRFMiddleware ? '✅' : '❌'}`)
  
  console.log('\n🌐 High-Traffic Endpoints:')
  console.log(`  User APIs: ${flags.enableEnhancedUserAPIs ? '✅' : '❌'}`)
  console.log(`  Practice APIs: ${flags.enableEnhancedPracticeAPIs ? '✅' : '❌'}`)
  console.log(`  Upload APIs: ${flags.enableEnhancedUploadAPIs ? '✅' : '❌'}`)
  console.log(`  Search APIs: ${flags.enableEnhancedSearchAPIs ? '✅' : '❌'}`)
  console.log(`  Analytics APIs: ${flags.enableEnhancedAnalyticsAPIs ? '✅' : '❌'}`)
  
  console.log('\n🏢 Security & RBAC:')
  console.log(`  RBAC Route Handler: ${flags.enableEnhancedRBACRouteHandler ? '✅' : '❌'}`)
  console.log(`  Security Middleware: ${flags.enableEnhancedSecurityMiddleware ? '✅' : '❌'}`)
  
  console.log('\n📊 Business Intelligence:')
  console.log(`  Business Intelligence: ${flags.enableBusinessIntelligenceLogging ? '✅' : '❌'}`)
  console.log(`  User Behavior Analytics: ${flags.enableUserBehaviorAnalytics ? '✅' : '❌'}`)
  console.log(`  Performance Analytics: ${flags.enablePerformanceAnalytics ? '✅' : '❌'}`)
  console.log(`  Compliance Analytics: ${flags.enableComplianceAnalytics ? '✅' : '❌'}`)
  
  console.log('\n🔍 Monitoring & Safety:')
  console.log(`  Performance Monitoring: ${flags.enablePhase2PerformanceMonitoring ? '✅' : '❌'}`)
  console.log(`  Security Audit: ${flags.enablePhase2SecurityAudit ? '✅' : '❌'}`)
  console.log(`  Rollback on Error: ${flags.enablePhase2RollbackOnError ? '✅' : '❌'}`)
  
  console.log('\n' + '='.repeat(60))
}

/**
 * Get migration progress summary
 */
export function getPhase2Progress(): {
  authRoutes: { enabled: number; total: number }
  apiServices: { enabled: number; total: number }
  middleware: { enabled: number; total: number }
  highTrafficEndpoints: { enabled: number; total: number }
  businessIntelligence: { enabled: number; total: number }
  overall: { enabled: number; total: number }
} {
  const flags = getPhase2MigrationFlags()
  
  const authRoutes = [
    flags.enableEnhancedLoginLogging,
    flags.enableEnhancedLogoutLogging,
    flags.enableEnhancedRefreshLogging,
    flags.enableEnhancedSessionLogging,
    flags.enableEnhancedCSRFLogging,
    flags.enableEnhancedMeEndpointLogging
  ]
  
  const apiServices = [
    flags.enableEnhancedAuditServiceLogging,
    flags.enableEnhancedEmailServiceLogging,
    flags.enableEnhancedSessionServiceLogging,
    flags.enableEnhancedUploadServiceLogging
  ]
  
  const middleware = [
    flags.enableEnhancedAuthMiddleware,
    flags.enableEnhancedJWTMiddleware,
    flags.enableEnhancedRateLimitMiddleware,
    flags.enableEnhancedValidationMiddleware,
    flags.enableEnhancedCSRFMiddleware
  ]
  
  const highTrafficEndpoints = [
    flags.enableEnhancedUserAPIs,
    flags.enableEnhancedPracticeAPIs,
    flags.enableEnhancedUploadAPIs,
    flags.enableEnhancedSearchAPIs,
    flags.enableEnhancedAnalyticsAPIs,
    flags.enableEnhancedRBACRouteHandler,
    flags.enableEnhancedSecurityMiddleware
  ]
  
  const businessIntelligence = [
    flags.enableBusinessIntelligenceLogging,
    flags.enableUserBehaviorAnalytics,
    flags.enablePerformanceAnalytics,
    flags.enableComplianceAnalytics
  ]
  
  const allFlags = [
    ...authRoutes,
    ...apiServices,
    ...middleware,
    ...highTrafficEndpoints,
    ...businessIntelligence
  ]
  
  return {
    authRoutes: {
      enabled: authRoutes.filter(Boolean).length,
      total: authRoutes.length
    },
    apiServices: {
      enabled: apiServices.filter(Boolean).length,
      total: apiServices.length
    },
    middleware: {
      enabled: middleware.filter(Boolean).length,
      total: middleware.length
    },
    highTrafficEndpoints: {
      enabled: highTrafficEndpoints.filter(Boolean).length,
      total: highTrafficEndpoints.length
    },
    businessIntelligence: {
      enabled: businessIntelligence.filter(Boolean).length,
      total: businessIntelligence.length
    },
    overall: {
      enabled: allFlags.filter(Boolean).length,
      total: allFlags.length
    }
  }
}

export default {
  getPhase2MigrationFlags,
  isPhase2MigrationEnabled,
  getAuthRoutesFlags,
  getAPIServicesFlags,
  getMiddlewareFlags,
  getHighTrafficFlags,
  getBusinessIntelligenceFlags,
  createConditionalPhase2Logger,
  printPhase2MigrationStatus,
  getPhase2Progress
}
