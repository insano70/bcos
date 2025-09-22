/**
 * Phase 3 Migration Flags Configuration
 * Specific feature flags for Phase 3 business logic and services migrations
 */

export interface Phase3MigrationFlags {
  // RBAC services (Priority 1)
  enableEnhancedUserContextLogging: boolean
  enableEnhancedCachedUserContextLogging: boolean
  enableEnhancedRBACMiddlewareLogging: boolean
  enableEnhancedPermissionCheckerLogging: boolean
  enableEnhancedOrganizationHierarchyLogging: boolean
  enableEnhancedBaseServiceLogging: boolean
  enableEnhancedServerPermissionServiceLogging: boolean
  enableEnhancedCacheInvalidationLogging: boolean
  enableEnhancedAPIPermissionsLogging: boolean
  enableEnhancedRouteProtectionLogging: boolean
  
  // Authentication services (Priority 2)
  enableEnhancedTokenManagerLogging: boolean
  enableEnhancedAuthSecurityLogging: boolean
  enableEnhancedAuthSessionLogging: boolean
  enableEnhancedAuthCleanupLogging: boolean
  enableEnhancedJWTLogging: boolean
  enableEnhancedPasswordLogging: boolean
  
  // Security utilities (Priority 3)
  enableEnhancedCSRFUnifiedLogging: boolean
  enableEnhancedCSRFClientLogging: boolean
  enableEnhancedCSRFLegacyLogging: boolean
  enableEnhancedSecurityHeadersLogging: boolean
  
  // Business services - RBAC (Priority 4a)
  enableEnhancedRBACUsersServiceLogging: boolean
  enableEnhancedRBACRolesServiceLogging: boolean
  enableEnhancedRBACOrganizationsServiceLogging: boolean
  
  // Business services - Analytics (Priority 4b)
  enableEnhancedAnalyticsDBLogging: boolean
  enableEnhancedAnalyticsCacheLogging: boolean
  enableEnhancedAnalyticsQueryBuilderLogging: boolean
  enableEnhancedUsageAnalyticsLogging: boolean
  enableEnhancedAnomalyDetectionLogging: boolean
  
  // Business services - Charts (Priority 4c)
  enableEnhancedChartConfigServiceLogging: boolean
  enableEnhancedChartExecutorLogging: boolean
  enableEnhancedChartValidationLogging: boolean
  enableEnhancedChartExportLogging: boolean
  enableEnhancedChartRefreshSchedulerLogging: boolean
  enableEnhancedChartTemplatesLogging: boolean
  enableEnhancedBulkChartOperationsLogging: boolean
  
  // Business services - Advanced (Priority 4d)
  enableEnhancedHistoricalComparisonLogging: boolean
  enableEnhancedCalculatedFieldsLogging: boolean
  enableEnhancedAdvancedPermissionsLogging: boolean
  
  // Database layer (Priority 5)
  enableEnhancedDatabaseSeedLogging: boolean
  enableEnhancedRBACSeedLogging: boolean
  enableEnhancedDatabaseUtilitiesLogging: boolean
  
  // Business intelligence features
  enableBusinessProcessAnalytics: boolean
  enableUserBehaviorBusinessAnalytics: boolean
  enablePerformanceBusinessAnalytics: boolean
  enableComplianceBusinessAnalytics: boolean
  enableResourceUtilizationAnalytics: boolean
  
  // Security intelligence features
  enableRBACSecurityIntelligence: boolean
  enableAuthenticationSecurityIntelligence: boolean
  enableBusinessDataSecurityIntelligence: boolean
  enableThreatCorrelationAcrossServices: boolean
  
  // Performance optimization features
  enableBusinessServicePerformanceOptimization: boolean
  enableCachePerformanceOptimization: boolean
  enableDatabasePerformanceOptimization: boolean
  enableResourceOptimization: boolean
  
  // Testing and monitoring
  enablePhase3PerformanceMonitoring: boolean
  enablePhase3SecurityAudit: boolean
  enablePhase3BusinessIntelligenceValidation: boolean
  enablePhase3RollbackOnError: boolean
}

/**
 * Default Phase 3 migration flags
 */
const DEFAULT_PHASE3_FLAGS: Phase3MigrationFlags = {
  // RBAC services - start with most critical
  enableEnhancedUserContextLogging: false,
  enableEnhancedCachedUserContextLogging: false,
  enableEnhancedRBACMiddlewareLogging: false,
  enableEnhancedPermissionCheckerLogging: false,
  enableEnhancedOrganizationHierarchyLogging: false,
  enableEnhancedBaseServiceLogging: false,
  enableEnhancedServerPermissionServiceLogging: false,
  enableEnhancedCacheInvalidationLogging: false,
  enableEnhancedAPIPermissionsLogging: false,
  enableEnhancedRouteProtectionLogging: false,
  
  // Authentication services
  enableEnhancedTokenManagerLogging: false,
  enableEnhancedAuthSecurityLogging: false,
  enableEnhancedAuthSessionLogging: false,
  enableEnhancedAuthCleanupLogging: false,
  enableEnhancedJWTLogging: false,
  enableEnhancedPasswordLogging: false,
  
  // Security utilities
  enableEnhancedCSRFUnifiedLogging: false,
  enableEnhancedCSRFClientLogging: false,
  enableEnhancedCSRFLegacyLogging: false,
  enableEnhancedSecurityHeadersLogging: false,
  
  // Business services - RBAC
  enableEnhancedRBACUsersServiceLogging: false,
  enableEnhancedRBACRolesServiceLogging: false,
  enableEnhancedRBACOrganizationsServiceLogging: false,
  
  // Business services - Analytics
  enableEnhancedAnalyticsDBLogging: false,
  enableEnhancedAnalyticsCacheLogging: false,
  enableEnhancedAnalyticsQueryBuilderLogging: false,
  enableEnhancedUsageAnalyticsLogging: false,
  enableEnhancedAnomalyDetectionLogging: false,
  
  // Business services - Charts
  enableEnhancedChartConfigServiceLogging: false,
  enableEnhancedChartExecutorLogging: false,
  enableEnhancedChartValidationLogging: false,
  enableEnhancedChartExportLogging: false,
  enableEnhancedChartRefreshSchedulerLogging: false,
  enableEnhancedChartTemplatesLogging: false,
  enableEnhancedBulkChartOperationsLogging: false,
  
  // Business services - Advanced
  enableEnhancedHistoricalComparisonLogging: false,
  enableEnhancedCalculatedFieldsLogging: false,
  enableEnhancedAdvancedPermissionsLogging: false,
  
  // Database layer
  enableEnhancedDatabaseSeedLogging: false,
  enableEnhancedRBACSeedLogging: false,
  enableEnhancedDatabaseUtilitiesLogging: false,
  
  // Business intelligence - enable after core migration
  enableBusinessProcessAnalytics: false,
  enableUserBehaviorBusinessAnalytics: false,
  enablePerformanceBusinessAnalytics: false,
  enableComplianceBusinessAnalytics: false,
  enableResourceUtilizationAnalytics: false,
  
  // Security intelligence - enable after RBAC migration
  enableRBACSecurityIntelligence: false,
  enableAuthenticationSecurityIntelligence: false,
  enableBusinessDataSecurityIntelligence: false,
  enableThreatCorrelationAcrossServices: false,
  
  // Performance optimization - enable after service migration
  enableBusinessServicePerformanceOptimization: false,
  enableCachePerformanceOptimization: false,
  enableDatabasePerformanceOptimization: false,
  enableResourceOptimization: false,
  
  // Monitoring - always enabled for safety
  enablePhase3PerformanceMonitoring: true,
  enablePhase3SecurityAudit: true,
  enablePhase3BusinessIntelligenceValidation: true,
  enablePhase3RollbackOnError: true
}

/**
 * Load Phase 3 migration flags from environment
 */
function loadPhase3MigrationFlags(): Phase3MigrationFlags {
  const flags: Phase3MigrationFlags = { ...DEFAULT_PHASE3_FLAGS }
  
  // Parse environment variables with PHASE3_ prefix
  Object.keys(flags).forEach(key => {
    const envKey = `PHASE3_${key.replace(/([A-Z])/g, '_$1').toUpperCase()}`
    const envValue = process.env[envKey]
    
    if (envValue !== undefined) {
      const boolValue = envValue.toLowerCase() === 'true' || envValue === '1'
      ;(flags as unknown as Record<string, boolean>)[key] = boolValue
    }
  })
  
  // Development environment special handling
  if (process.env.NODE_ENV === 'development') {
    // Enable all RBAC services in development
    if (process.env.PHASE3_DEV_ENABLE_RBAC === 'true') {
      flags.enableEnhancedUserContextLogging = true
      flags.enableEnhancedCachedUserContextLogging = true
      flags.enableEnhancedRBACMiddlewareLogging = true
      flags.enableEnhancedPermissionCheckerLogging = true
      flags.enableEnhancedOrganizationHierarchyLogging = true
    }
    
    // Enable all authentication services in development
    if (process.env.PHASE3_DEV_ENABLE_AUTH === 'true') {
      flags.enableEnhancedTokenManagerLogging = true
      flags.enableEnhancedAuthSecurityLogging = true
      flags.enableEnhancedAuthSessionLogging = true
      flags.enableEnhancedAuthCleanupLogging = true
    }
    
    // Enable all business services in development
    if (process.env.PHASE3_DEV_ENABLE_BUSINESS === 'true') {
      flags.enableEnhancedRBACUsersServiceLogging = true
      flags.enableEnhancedRBACRolesServiceLogging = true
      flags.enableEnhancedAnalyticsDBLogging = true
      flags.enableEnhancedChartConfigServiceLogging = true
    }
    
    // Enable all Phase 3 features in development
    if (process.env.PHASE3_DEV_ENABLE_ALL === 'true') {
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
 * Cached Phase 3 flags instance
 */
let cachedPhase3Flags: Phase3MigrationFlags | null = null

/**
 * Get Phase 3 migration flags (cached)
 */
export function getPhase3MigrationFlags(): Phase3MigrationFlags {
  if (!cachedPhase3Flags) {
    cachedPhase3Flags = loadPhase3MigrationFlags()
  }
  return cachedPhase3Flags
}

/**
 * Reset Phase 3 migration flags cache
 */
export function resetPhase3MigrationFlagsCache(): void {
  cachedPhase3Flags = null
}

/**
 * Check if a specific Phase 3 migration feature is enabled
 */
export function isPhase3MigrationEnabled(feature: keyof Phase3MigrationFlags): boolean {
  const flags = getPhase3MigrationFlags()
  return flags[feature]
}

/**
 * Get RBAC services flags
 */
export function getRBACServicesFlags() {
  const flags = getPhase3MigrationFlags()
  return {
    enableEnhancedUserContextLogging: flags.enableEnhancedUserContextLogging,
    enableEnhancedCachedUserContextLogging: flags.enableEnhancedCachedUserContextLogging,
    enableEnhancedRBACMiddlewareLogging: flags.enableEnhancedRBACMiddlewareLogging,
    enableEnhancedPermissionCheckerLogging: flags.enableEnhancedPermissionCheckerLogging,
    enableEnhancedOrganizationHierarchyLogging: flags.enableEnhancedOrganizationHierarchyLogging
  }
}

/**
 * Get authentication services flags
 */
export function getAuthServicesFlags() {
  const flags = getPhase3MigrationFlags()
  return {
    enableEnhancedTokenManagerLogging: flags.enableEnhancedTokenManagerLogging,
    enableEnhancedAuthSecurityLogging: flags.enableEnhancedAuthSecurityLogging,
    enableEnhancedAuthSessionLogging: flags.enableEnhancedAuthSessionLogging,
    enableEnhancedAuthCleanupLogging: flags.enableEnhancedAuthCleanupLogging
  }
}

/**
 * Get business services flags
 */
export function getBusinessServicesFlags() {
  const flags = getPhase3MigrationFlags()
  return {
    enableEnhancedRBACUsersServiceLogging: flags.enableEnhancedRBACUsersServiceLogging,
    enableEnhancedRBACRolesServiceLogging: flags.enableEnhancedRBACRolesServiceLogging,
    enableEnhancedAnalyticsDBLogging: flags.enableEnhancedAnalyticsDBLogging,
    enableEnhancedChartConfigServiceLogging: flags.enableEnhancedChartConfigServiceLogging
  }
}

/**
 * Get business intelligence flags
 */
export function getPhase3BusinessIntelligenceFlags() {
  const flags = getPhase3MigrationFlags()
  return {
    enableBusinessProcessAnalytics: flags.enableBusinessProcessAnalytics,
    enableUserBehaviorBusinessAnalytics: flags.enableUserBehaviorBusinessAnalytics,
    enablePerformanceBusinessAnalytics: flags.enablePerformanceBusinessAnalytics,
    enableComplianceBusinessAnalytics: flags.enableComplianceBusinessAnalytics
  }
}

/**
 * Conditional Phase 3 logger creation utility
 */
export function createConditionalPhase3Logger<T>(
  flagName: keyof Phase3MigrationFlags,
  enhancedLoggerFactory: () => T,
  fallbackLoggerFactory: () => T
): T {
  try {
    if (isPhase3MigrationEnabled(flagName)) {
      return enhancedLoggerFactory()
    } else {
      return fallbackLoggerFactory()
    }
  } catch (error) {
    console.error(`Phase 3 logger creation failed for ${String(flagName)}:`, error)
    return fallbackLoggerFactory()
  }
}

/**
 * Print Phase 3 migration flags status
 */
export function printPhase3MigrationStatus(): void {
  const flags = getPhase3MigrationFlags()
  
  console.log('🏢 Phase 3 Migration Flags Status:')
  console.log('=' .repeat(60))
  
  console.log('\n🛡️ RBAC Services:')
  console.log(`  User Context: ${flags.enableEnhancedUserContextLogging ? '✅' : '❌'}`)
  console.log(`  Cached User Context: ${flags.enableEnhancedCachedUserContextLogging ? '✅' : '❌'}`)
  console.log(`  RBAC Middleware: ${flags.enableEnhancedRBACMiddlewareLogging ? '✅' : '❌'}`)
  console.log(`  Permission Checker: ${flags.enableEnhancedPermissionCheckerLogging ? '✅' : '❌'}`)
  console.log(`  Organization Hierarchy: ${flags.enableEnhancedOrganizationHierarchyLogging ? '✅' : '❌'}`)
  
  console.log('\n🔐 Authentication Services:')
  console.log(`  Token Manager: ${flags.enableEnhancedTokenManagerLogging ? '✅' : '❌'}`)
  console.log(`  Auth Security: ${flags.enableEnhancedAuthSecurityLogging ? '✅' : '❌'}`)
  console.log(`  Auth Session: ${flags.enableEnhancedAuthSessionLogging ? '✅' : '❌'}`)
  console.log(`  Auth Cleanup: ${flags.enableEnhancedAuthCleanupLogging ? '✅' : '❌'}`)
  
  console.log('\n🔒 Security Utilities:')
  console.log(`  CSRF Unified: ${flags.enableEnhancedCSRFUnifiedLogging ? '✅' : '❌'}`)
  console.log(`  CSRF Client: ${flags.enableEnhancedCSRFClientLogging ? '✅' : '❌'}`)
  console.log(`  Security Headers: ${flags.enableEnhancedSecurityHeadersLogging ? '✅' : '❌'}`)
  
  console.log('\n🏢 Business Services - RBAC:')
  console.log(`  RBAC Users Service: ${flags.enableEnhancedRBACUsersServiceLogging ? '✅' : '❌'}`)
  console.log(`  RBAC Roles Service: ${flags.enableEnhancedRBACRolesServiceLogging ? '✅' : '❌'}`)
  console.log(`  RBAC Organizations Service: ${flags.enableEnhancedRBACOrganizationsServiceLogging ? '✅' : '❌'}`)
  
  console.log('\n📊 Business Services - Analytics:')
  console.log(`  Analytics DB: ${flags.enableEnhancedAnalyticsDBLogging ? '✅' : '❌'}`)
  console.log(`  Analytics Cache: ${flags.enableEnhancedAnalyticsCacheLogging ? '✅' : '❌'}`)
  console.log(`  Query Builder: ${flags.enableEnhancedAnalyticsQueryBuilderLogging ? '✅' : '❌'}`)
  console.log(`  Usage Analytics: ${flags.enableEnhancedUsageAnalyticsLogging ? '✅' : '❌'}`)
  
  console.log('\n📈 Business Services - Charts:')
  console.log(`  Chart Config: ${flags.enableEnhancedChartConfigServiceLogging ? '✅' : '❌'}`)
  console.log(`  Chart Executor: ${flags.enableEnhancedChartExecutorLogging ? '✅' : '❌'}`)
  console.log(`  Chart Validation: ${flags.enableEnhancedChartValidationLogging ? '✅' : '❌'}`)
  console.log(`  Bulk Operations: ${flags.enableEnhancedBulkChartOperationsLogging ? '✅' : '❌'}`)
  
  console.log('\n🗃️ Database Layer:')
  console.log(`  Database Seed: ${flags.enableEnhancedDatabaseSeedLogging ? '✅' : '❌'}`)
  console.log(`  RBAC Seed: ${flags.enableEnhancedRBACSeedLogging ? '✅' : '❌'}`)
  console.log(`  Database Utilities: ${flags.enableEnhancedDatabaseUtilitiesLogging ? '✅' : '❌'}`)
  
  console.log('\n📊 Business Intelligence:')
  console.log(`  Business Process Analytics: ${flags.enableBusinessProcessAnalytics ? '✅' : '❌'}`)
  console.log(`  User Behavior Analytics: ${flags.enableUserBehaviorBusinessAnalytics ? '✅' : '❌'}`)
  console.log(`  Performance Analytics: ${flags.enablePerformanceBusinessAnalytics ? '✅' : '❌'}`)
  console.log(`  Compliance Analytics: ${flags.enableComplianceBusinessAnalytics ? '✅' : '❌'}`)
  
  console.log('\n🔒 Security Intelligence:')
  console.log(`  RBAC Security Intelligence: ${flags.enableRBACSecurityIntelligence ? '✅' : '❌'}`)
  console.log(`  Auth Security Intelligence: ${flags.enableAuthenticationSecurityIntelligence ? '✅' : '❌'}`)
  console.log(`  Business Data Security: ${flags.enableBusinessDataSecurityIntelligence ? '✅' : '❌'}`)
  console.log(`  Threat Correlation: ${flags.enableThreatCorrelationAcrossServices ? '✅' : '❌'}`)
  
  console.log('\n⚡ Performance Optimization:')
  console.log(`  Business Service Optimization: ${flags.enableBusinessServicePerformanceOptimization ? '✅' : '❌'}`)
  console.log(`  Cache Optimization: ${flags.enableCachePerformanceOptimization ? '✅' : '❌'}`)
  console.log(`  Database Optimization: ${flags.enableDatabasePerformanceOptimization ? '✅' : '❌'}`)
  
  console.log('\n🔍 Monitoring & Validation:')
  console.log(`  Performance Monitoring: ${flags.enablePhase3PerformanceMonitoring ? '✅' : '❌'}`)
  console.log(`  Security Audit: ${flags.enablePhase3SecurityAudit ? '✅' : '❌'}`)
  console.log(`  Business Intelligence Validation: ${flags.enablePhase3BusinessIntelligenceValidation ? '✅' : '❌'}`)
  console.log(`  Rollback on Error: ${flags.enablePhase3RollbackOnError ? '✅' : '❌'}`)
  
  console.log('\n' + '='.repeat(60))
}

/**
 * Get migration progress summary for Phase 3
 */
export function getPhase3Progress(): {
  rbacServices: { enabled: number; total: number }
  authServices: { enabled: number; total: number }
  securityUtilities: { enabled: number; total: number }
  businessServices: { enabled: number; total: number }
  databaseLayer: { enabled: number; total: number }
  businessIntelligence: { enabled: number; total: number }
  securityIntelligence: { enabled: number; total: number }
  performanceOptimization: { enabled: number; total: number }
  overall: { enabled: number; total: number }
} {
  const flags = getPhase3MigrationFlags()
  
  const rbacServices = [
    flags.enableEnhancedUserContextLogging,
    flags.enableEnhancedCachedUserContextLogging,
    flags.enableEnhancedRBACMiddlewareLogging,
    flags.enableEnhancedPermissionCheckerLogging,
    flags.enableEnhancedOrganizationHierarchyLogging,
    flags.enableEnhancedBaseServiceLogging,
    flags.enableEnhancedServerPermissionServiceLogging,
    flags.enableEnhancedCacheInvalidationLogging,
    flags.enableEnhancedAPIPermissionsLogging,
    flags.enableEnhancedRouteProtectionLogging
  ]
  
  const authServices = [
    flags.enableEnhancedTokenManagerLogging,
    flags.enableEnhancedAuthSecurityLogging,
    flags.enableEnhancedAuthSessionLogging,
    flags.enableEnhancedAuthCleanupLogging,
    flags.enableEnhancedJWTLogging,
    flags.enableEnhancedPasswordLogging
  ]
  
  const securityUtilities = [
    flags.enableEnhancedCSRFUnifiedLogging,
    flags.enableEnhancedCSRFClientLogging,
    flags.enableEnhancedCSRFLegacyLogging,
    flags.enableEnhancedSecurityHeadersLogging
  ]
  
  const businessServices = [
    flags.enableEnhancedRBACUsersServiceLogging,
    flags.enableEnhancedRBACRolesServiceLogging,
    flags.enableEnhancedRBACOrganizationsServiceLogging,
    flags.enableEnhancedAnalyticsDBLogging,
    flags.enableEnhancedAnalyticsCacheLogging,
    flags.enableEnhancedAnalyticsQueryBuilderLogging,
    flags.enableEnhancedUsageAnalyticsLogging,
    flags.enableEnhancedAnomalyDetectionLogging,
    flags.enableEnhancedChartConfigServiceLogging,
    flags.enableEnhancedChartExecutorLogging,
    flags.enableEnhancedChartValidationLogging,
    flags.enableEnhancedChartExportLogging,
    flags.enableEnhancedChartRefreshSchedulerLogging,
    flags.enableEnhancedChartTemplatesLogging,
    flags.enableEnhancedBulkChartOperationsLogging,
    flags.enableEnhancedHistoricalComparisonLogging,
    flags.enableEnhancedCalculatedFieldsLogging,
    flags.enableEnhancedAdvancedPermissionsLogging
  ]
  
  const databaseLayer = [
    flags.enableEnhancedDatabaseSeedLogging,
    flags.enableEnhancedRBACSeedLogging,
    flags.enableEnhancedDatabaseUtilitiesLogging
  ]
  
  const businessIntelligence = [
    flags.enableBusinessProcessAnalytics,
    flags.enableUserBehaviorBusinessAnalytics,
    flags.enablePerformanceBusinessAnalytics,
    flags.enableComplianceBusinessAnalytics,
    flags.enableResourceUtilizationAnalytics
  ]
  
  const securityIntelligence = [
    flags.enableRBACSecurityIntelligence,
    flags.enableAuthenticationSecurityIntelligence,
    flags.enableBusinessDataSecurityIntelligence,
    flags.enableThreatCorrelationAcrossServices
  ]
  
  const performanceOptimization = [
    flags.enableBusinessServicePerformanceOptimization,
    flags.enableCachePerformanceOptimization,
    flags.enableDatabasePerformanceOptimization,
    flags.enableResourceOptimization
  ]
  
  const allFlags = [
    ...rbacServices,
    ...authServices,
    ...securityUtilities,
    ...businessServices,
    ...databaseLayer,
    ...businessIntelligence,
    ...securityIntelligence,
    ...performanceOptimization
  ]
  
  return {
    rbacServices: {
      enabled: rbacServices.filter(Boolean).length,
      total: rbacServices.length
    },
    authServices: {
      enabled: authServices.filter(Boolean).length,
      total: authServices.length
    },
    securityUtilities: {
      enabled: securityUtilities.filter(Boolean).length,
      total: securityUtilities.length
    },
    businessServices: {
      enabled: businessServices.filter(Boolean).length,
      total: businessServices.length
    },
    databaseLayer: {
      enabled: databaseLayer.filter(Boolean).length,
      total: databaseLayer.length
    },
    businessIntelligence: {
      enabled: businessIntelligence.filter(Boolean).length,
      total: businessIntelligence.length
    },
    securityIntelligence: {
      enabled: securityIntelligence.filter(Boolean).length,
      total: securityIntelligence.length
    },
    performanceOptimization: {
      enabled: performanceOptimization.filter(Boolean).length,
      total: performanceOptimization.length
    },
    overall: {
      enabled: allFlags.filter(Boolean).length,
      total: allFlags.length
    }
  }
}

export default {
  getPhase3MigrationFlags,
  isPhase3MigrationEnabled,
  getRBACServicesFlags,
  getAuthServicesFlags,
  getBusinessServicesFlags,
  getPhase3BusinessIntelligenceFlags,
  createConditionalPhase3Logger,
  printPhase3MigrationStatus,
  getPhase3Progress
}
