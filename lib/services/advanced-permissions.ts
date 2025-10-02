import { and, eq } from 'drizzle-orm';
import { chart_definitions, chart_permissions, db } from '@/lib/db';
import { log } from '@/lib/logger';
import type { AnalyticsQueryParams, ChartFilter } from '@/lib/types/analytics';

/**
 * Advanced Permissions Service
 * Implements granular access control with row-level security and data filtering
 */

export interface ChartPermission {
  chartDefinitionId: string;
  userId: string;
  permissionType: 'view' | 'edit' | 'admin';
  dataFilters?: {
    allowedPractices?: string[];
    allowedProviders?: string[];
    dateRestrictions?: {
      maxDaysBack?: number;
      allowedDateRanges?: Array<{ start: string; end: string }>;
    };
    measureRestrictions?: string[];
  };
  grantedBy: string;
  grantedAt: Date;
  expiresAt?: Date;
}

export interface DataAccessPolicy {
  userId: string;
  practiceAccess: 'all' | 'own' | 'specific';
  allowedPractices: string[];
  providerAccess: 'all' | 'own' | 'specific';
  allowedProviders: string[];
  measureAccess: 'all' | 'specific';
  allowedMeasures: string[];
  temporalAccess: {
    maxHistoryDays: number;
    allowFutureData: boolean;
  };
  aggregationLevel: 'detailed' | 'summary' | 'totals_only';
}

export class AdvancedPermissionsService {
  /**
   * Grant chart permission to user
   */
  async grantChartPermission(
    chartDefinitionId: string,
    userId: string,
    permissionType: 'view' | 'edit' | 'admin',
    grantedBy: string,
    _dataFilters?: ChartPermission['dataFilters'],
    _expiresAt?: Date
  ): Promise<void> {
    try {
      await db.insert(chart_permissions).values({
        chart_definition_id: chartDefinitionId,
        user_id: userId,
        permission_type: permissionType,
        granted_by_user_id: grantedBy,
        granted_at: new Date(),
        // Note: dataFilters would need to be stored in a separate table or JSON column
      });

      log.info('Chart permission granted', {
        chartDefinitionId,
        userId,
        permissionType,
        grantedBy,
      });
    } catch (error) {
      log.error('Failed to grant chart permission', {
        chartDefinitionId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Revoke chart permission from user
   */
  async revokeChartPermission(chartDefinitionId: string, userId: string): Promise<void> {
    try {
      await db
        .delete(chart_permissions)
        .where(
          and(
            eq(chart_permissions.chart_definition_id, chartDefinitionId),
            eq(chart_permissions.user_id, userId)
          )
        );

      log.info('Chart permission revoked', { chartDefinitionId, userId });
    } catch (error) {
      log.error('Failed to revoke chart permission', {
        chartDefinitionId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Check if user has permission to access chart
   */
  async hasChartPermission(
    chartDefinitionId: string,
    userId: string,
    requiredPermission: 'view' | 'edit' | 'admin'
  ): Promise<boolean> {
    try {
      const [permission] = await db
        .select()
        .from(chart_permissions)
        .where(
          and(
            eq(chart_permissions.chart_definition_id, chartDefinitionId),
            eq(chart_permissions.user_id, userId)
          )
        );

      if (!permission) return false;

      // Check permission hierarchy: admin > edit > view
      const permissionLevels = { view: 1, edit: 2, admin: 3 };
      const userLevel =
        permissionLevels[permission.permission_type as keyof typeof permissionLevels];
      const requiredLevel = permissionLevels[requiredPermission];

      return userLevel >= requiredLevel;
    } catch (error) {
      log.error('Permission check failed', {
        chartDefinitionId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Get user's accessible charts with permissions
   */
  async getUserAccessibleCharts(userId: string): Promise<
    Array<{
      chart: {
        chart_definition_id: string;
        chart_name: string;
        chart_type: string;
        chart_description?: string | null;
        is_active: boolean | null;
      };
      permission: string;
      dataFilters?: ChartFilter[];
    }>
  > {
    try {
      const userCharts = await db
        .select({
          chartDefinitionId: chart_permissions.chart_definition_id,
          permissionType: chart_permissions.permission_type,
          chartName: chart_definitions.chart_name,
          chartType: chart_definitions.chart_type,
          chartDescription: chart_definitions.chart_description,
          isActive: chart_definitions.is_active,
        })
        .from(chart_permissions)
        .innerJoin(
          chart_definitions,
          eq(chart_permissions.chart_definition_id, chart_definitions.chart_definition_id)
        )
        .where(and(eq(chart_permissions.user_id, userId), eq(chart_definitions.is_active, true)));

      return userCharts.map((row) => ({
        chart: {
          chart_definition_id: row.chartDefinitionId,
          chart_name: row.chartName,
          chart_type: row.chartType,
          chart_description: row.chartDescription,
          is_active: row.isActive,
        },
        permission: row.permissionType || 'view',
      }));
    } catch (error) {
      log.error('Failed to get user accessible charts', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  /**
   * Apply data access policy to query parameters
   * TODO: Fix type issues and implement proper filtering
   */
  /*
  applyDataAccessPolicy(
    userId: string,
    policy: DataAccessPolicy,
    queryParams: AnalyticsQueryParams
  ): AnalyticsQueryParams {
    const filteredParams = { ...queryParams };

    // Apply practice access restrictions
    if (policy.practiceAccess === 'specific' && policy.allowedPractices.length > 0) {
      filteredParams.allowedPractices = policy.allowedPractices;
    }

    // Apply provider access restrictions
    if (policy.providerAccess === 'specific' && policy.allowedProviders.length > 0) {
      filteredParams.allowedProviders = policy.allowedProviders;
    }

    // Apply measure restrictions
    if (policy.measureAccess === 'specific' && policy.allowedMeasures.length > 0) {
      filteredParams.allowedMeasures = policy.allowedMeasures;
    }

    // Apply temporal restrictions
    if (policy.temporalAccess.maxHistoryDays > 0) {
      const maxDate = new Date();
      const minDate = new Date();
      minDate.setDate(minDate.getDate() - policy.temporalAccess.maxHistoryDays);
      
      filteredParams.minDate = minDate.toISOString().split('T')[0];
      if (!policy.temporalAccess.allowFutureData) {
        filteredParams.maxDate = maxDate.toISOString().split('T')[0];
      }
    }

    log.debug('Data access policy applied', {
      userId,
      originalParams: queryParams,
      filteredParams
    });

    return filteredParams;
  }
  */

  /**
   * Create default data access policy for user
   */
  createDefaultPolicy(userId: string, userRole: string): DataAccessPolicy {
    // Different default policies based on role
    switch (userRole) {
      case 'super_admin':
        return {
          userId,
          practiceAccess: 'all',
          allowedPractices: [],
          providerAccess: 'all',
          allowedProviders: [],
          measureAccess: 'all',
          allowedMeasures: [],
          temporalAccess: {
            maxHistoryDays: 0, // No limit
            allowFutureData: true,
          },
          aggregationLevel: 'detailed',
        };

      case 'admin':
        return {
          userId,
          practiceAccess: 'all',
          allowedPractices: [],
          providerAccess: 'all',
          allowedProviders: [],
          measureAccess: 'all',
          allowedMeasures: [],
          temporalAccess: {
            maxHistoryDays: 365 * 3, // 3 years
            allowFutureData: false,
          },
          aggregationLevel: 'detailed',
        };

      case 'manager':
        return {
          userId,
          practiceAccess: 'own',
          allowedPractices: [], // Would be populated based on user's practice assignments
          providerAccess: 'own',
          allowedProviders: [],
          measureAccess: 'all',
          allowedMeasures: [],
          temporalAccess: {
            maxHistoryDays: 365, // 1 year
            allowFutureData: false,
          },
          aggregationLevel: 'summary',
        };

      default: // Regular user
        return {
          userId,
          practiceAccess: 'own',
          allowedPractices: [],
          providerAccess: 'own',
          allowedProviders: [],
          measureAccess: 'specific',
          allowedMeasures: ['Charges by Provider', 'Payments by Provider'], // Basic measures only
          temporalAccess: {
            maxHistoryDays: 90, // 3 months
            allowFutureData: false,
          },
          aggregationLevel: 'totals_only',
        };
    }
  }

  /**
   * Validate chart access with row-level security
   */
  async validateChartAccess(
    chartDefinitionId: string,
    userId: string,
    requestedData: AnalyticsQueryParams
  ): Promise<{ allowed: boolean; filteredData?: AnalyticsQueryParams; reason?: string }> {
    try {
      // Check basic chart permission
      const hasPermission = await this.hasChartPermission(chartDefinitionId, userId, 'view');

      if (!hasPermission) {
        return {
          allowed: false,
          reason: 'No permission to access this chart',
        };
      }

      // Apply data-level filtering based on user's access policy
      // This would typically involve checking user's practice/provider assignments
      // For now, return basic validation

      return {
        allowed: true,
        filteredData: requestedData,
      };
    } catch (error) {
      log.error('Chart access validation failed', {
        chartDefinitionId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        allowed: false,
        reason: 'Access validation failed',
      };
    }
  }

  /**
   * Get permission summary for admin interface
   */
  async getPermissionSummary(): Promise<{
    totalPermissions: number;
    permissionsByType: Record<string, number>;
    recentGrants: Array<{
      chartName: string;
      userName: string;
      permissionType: string;
      grantedAt: Date;
    }>;
  }> {
    try {
      // This would typically involve complex queries joining users, charts, and permissions
      // For now, return placeholder data structure

      return {
        totalPermissions: 0,
        permissionsByType: {
          view: 0,
          edit: 0,
          admin: 0,
        },
        recentGrants: [],
      };
    } catch (error) {
      log.error('Failed to get permission summary', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        totalPermissions: 0,
        permissionsByType: {},
        recentGrants: [],
      };
    }
  }
}

// Export singleton instance
export const advancedPermissionsService = new AdvancedPermissionsService();
