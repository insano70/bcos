/**
 * RBAC Filter Service - Security-Critical Module
 *
 * Provides in-memory RBAC filtering and permission validation for analytics data.
 *
 * SECURITY MODEL:
 * - Fail-closed: Empty accessible_practices for non-admin → NO DATA
 * - Permission-based validation (not role-based)
 * - Dynamic scope validation against actual permissions
 * - NULL provider_uid scope handling (system-level data)
 * - Comprehensive security audit logging
 *
 * KEY FEATURES:
 * - Practice-level filtering (organization security)
 * - Provider-level filtering (provider security)
 * - Permission scope validation (prevents spoofing)
 * - Enhanced security audit logging
 *
 * ARCHITECTURE:
 * - Applied in-memory AFTER cache/database fetch
 * - Enables maximum cache reuse across users
 * - Stateless service (no dependencies on cache)
 */

import { log } from '@/lib/logger';
import { PermissionChecker } from '@/lib/rbac/permission-checker';
import type { ChartRenderContext } from '@/lib/types/analytics';
import type { UserContext } from '@/lib/types/rbac';

/**
 * RBAC Filter Service
 * Security-critical filtering of analytics data based on user permissions
 */
export class RBACFilterService {
  /**
   * Validate permission scope matches user's actual analytics permissions
   * SECURITY: Prevents permission_scope spoofing
   *
   * Special case: super_admin is unique and always gets 'all' scope
   * Otherwise: Validates scope against actual analytics permissions
   *
   * @param context - Chart render context
   * @param userContext - User context with permissions
   * @throws Error if permission scope is invalid or spoofed
   */
  validatePermissionScope(context: ChartRenderContext, userContext: UserContext): void {
    // Special case: super_admin is unique (not a "super-user role", but a specific role)
    if (userContext.is_super_admin) {
      if (context.permission_scope !== 'all') {
        log.security('super_admin with non-all scope', 'high', {
          userId: context.user_id,
          claimedScope: context.permission_scope,
        });
        throw new Error(`Security violation: super_admin must have 'all' scope`);
      }
      return; // Valid
    }

    // For non-super-admin, validate scope against analytics permissions
    const permissionChecker = new PermissionChecker(userContext);

    if (context.permission_scope === 'all') {
      // Must have analytics:read:all permission
      const hasAllPermission = permissionChecker.hasPermission('analytics:read:all');
      if (!hasAllPermission) {
        log.security('Permission scope spoofing detected', 'critical', {
          userId: context.user_id,
          claimedScope: 'all',
          hasAnalyticsReadAll: false,
        });
        throw new Error(
          `Security violation: User claims 'all' scope without analytics:read:all permission`
        );
      }
    } else if (context.permission_scope === 'organization') {
      // Must have at least analytics:read:organization
      const hasOrgPermission = permissionChecker.hasAnyPermission([
        'analytics:read:organization',
        'analytics:read:all',
      ]);
      if (!hasOrgPermission) {
        log.security('Permission scope mismatch', 'critical', {
          userId: context.user_id,
          claimedScope: 'organization',
          hasOrgPermission: false,
        });
        throw new Error(`Security violation: Invalid organization scope`);
      }
    }
    // Note: 'own' scope validation would check analytics:read:own
  }

  /**
   * Apply RBAC filtering in-memory with FAIL-CLOSED security
   * Filters rows based on user's accessible practices and providers
   *
   * SECURITY CRITICAL:
   * - Non-admin users with empty accessible_practices get NO DATA (fail closed)
   * - Permission scope validated against actual permissions
   * - NULL provider_uid only accessible to org/all scope
   * - Enhanced security audit logging
   *
   * This is THE KEY to making cache reuse work across users with different permissions
   *
   * @param rows - Data rows to filter
   * @param context - Chart render context with RBAC info
   * @param userContext - User context with permissions
   * @returns Filtered rows based on user's accessible practices/providers
   */
  applyRBACFilter(
    rows: Record<string, unknown>[],
    context: ChartRenderContext,
    userContext: UserContext
  ): Record<string, unknown>[] {
    const startTime = Date.now();

    // SECURITY: Validate permission scope first
    this.validatePermissionScope(context, userContext);

    // Super admin / 'all' scope: no filtering needed
    if (context.permission_scope === 'all') {
      log.security('RBAC filter: all scope, no filtering', 'low', {
        userId: context.user_id,
        rowCount: rows.length,
        permissionScope: context.permission_scope,
      });
      return rows;
    }

    // FAIL CLOSED: Non-admin with empty accessible_practices = NO DATA
    if (!context.accessible_practices || context.accessible_practices.length === 0) {
      log.security(
        'RBAC filter: Empty accessible_practices for non-admin - blocking all data',
        'critical',
        {
          userId: context.user_id,
          permissionScope: context.permission_scope,
          originalRowCount: rows.length,
          reason: 'fail_closed_security',
          isSuperAdmin: userContext.is_super_admin,
        }
      );
      return []; // Fail closed - return empty array
    }

    // Apply practice filtering
    let filtered = rows.filter((row) => {
      const practiceUid = row.practice_uid as number | undefined;
      return practiceUid !== undefined && context.accessible_practices.includes(practiceUid);
    });

    const practicesInData = Array.from(
      new Set(rows.map((r) => r.practice_uid as number).filter(Boolean))
    );
    const practicesAfterFilter = Array.from(
      new Set(filtered.map((r) => r.practice_uid as number).filter(Boolean))
    );

    // Apply provider filtering if specified
    if (context.accessible_providers && context.accessible_providers.length > 0) {
      filtered = filtered.filter((row) => {
        const providerUid = row.provider_uid as number | undefined | null;

        // SECURITY: NULL provider_uid = system-level data
        // Only accessible to organization/all scope
        if (providerUid === null || providerUid === undefined) {
          const canAccessSystemData =
            context.permission_scope === 'all' || context.permission_scope === 'organization';
          return canAccessSystemData;
        }

        // For non-NULL provider_uid, check accessible_providers
        return context.accessible_providers.includes(providerUid);
      });
    }

    const duration = Date.now() - startTime;

    // SECURITY: Enhanced audit logging
    log.security('RBAC filtering completed', rows.length === filtered.length ? 'low' : 'medium', {
      userId: context.user_id,
      permissionScope: context.permission_scope,
      accessiblePractices: context.accessible_practices,
      accessibleProviders: context.accessible_providers,
      isSuperAdmin: userContext.is_super_admin,

      // Data scope
      originalRowCount: rows.length,
      filteredRowCount: filtered.length,
      rowsBlocked: rows.length - filtered.length,
      blockPercentage:
        rows.length > 0 ? Math.round(((rows.length - filtered.length) / rows.length) * 100) : 0,

      // Affected entities
      practicesInData,
      practicesAfterFilter,
      practicesBlocked: practicesInData.filter((p) => !practicesAfterFilter.includes(p)),

      // Performance
      duration,

      // Security flags
      suspiciousActivity: rows.length > 0 && filtered.length === 0,
      allDataBlocked: rows.length > 0 && filtered.length === 0,

      timestamp: new Date().toISOString(),
    });

    // Security audit: Log if filtering resulted in empty set
    if (filtered.length === 0 && rows.length > 0) {
      log.security('RBAC filtering blocked all data', 'high', {
        userId: context.user_id,
        originalRowCount: rows.length,
        practicesInData,
        accessiblePractices: context.accessible_practices,
        reason: 'no_matching_practices_or_providers',
      });
    }

    return filtered;
  }
}

// Export singleton instance
export const rbacFilterService = new RBACFilterService();
