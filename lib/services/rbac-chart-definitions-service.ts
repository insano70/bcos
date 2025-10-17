import { and, eq, type SQL, sql } from 'drizzle-orm';
import { NotFoundError } from '@/lib/api/responses/error';
import { db } from '@/lib/db';
import { chart_definitions } from '@/lib/db/analytics-schema';
import { log, logTemplates, SLOW_THRESHOLDS } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';

/**
 * Chart Definition data structure
 */
export interface ChartDefinition {
  chart_definition_id: string;
  chart_name: string;
  chart_type: string;
  chart_config: Record<string, unknown>;
  data_source_id: number | null;
  is_active: boolean | null;
  created_at: Date;
  updated_at: Date;
  created_by: string;
}

/**
 * Chart Definitions Service Interface
 *
 * Provides read-only access to chart definitions with automatic RBAC enforcement.
 * Chart definitions define the structure and configuration for analytics charts.
 *
 * **Permission Model:**
 * - `analytics:read:all` OR `charts:read:all` - Read all chart definitions
 * - `analytics:read:own` OR `charts:read:own` - Read only charts created by user
 * - `analytics:read:organization` - Read charts in user's organizations (treated as :own for charts)
 *
 * **Note:** Chart definitions table does not have organization_id column.
 * RBAC is based on created_by field only.
 *
 * @example
 * ```typescript
 * const service = createRBACChartDefinitionsService(userContext);
 *
 * // Get single chart definition
 * const chartDef = await service.getChartDefinitionById('uuid');
 *
 * // List active chart definitions
 * const charts = await service.getChartDefinitions({ is_active: true });
 * ```
 */
export interface ChartDefinitionsServiceInterface {
  getChartDefinitionById(chartDefinitionId: string): Promise<ChartDefinition | null>;
  getChartDefinitions(filters?: {
    is_active?: boolean;
    chart_type?: string;
  }): Promise<ChartDefinition[]>;
}

/**
 * Internal Chart Definitions Service Implementation
 *
 * Uses hybrid pattern: internal class with factory function.
 * Provides read-only access to chart definitions with automatic RBAC enforcement.
 */
class ChartDefinitionsService implements ChartDefinitionsServiceInterface {
  private readonly canReadAll: boolean;
  private readonly canReadOwn: boolean;

  constructor(private readonly userContext: UserContext) {
    // Check permissions at service creation (cached for performance)
    // Note: chart_definitions table does not have organization_id column
    // Only supports all/own scoping, not organization-level scoping
    this.canReadAll =
      userContext.all_permissions?.some(
        (p) => p.name === 'analytics:read:all' || p.name === 'charts:read:all'
      ) || userContext.is_super_admin;

    this.canReadOwn = userContext.all_permissions?.some(
      (p) =>
        p.name === 'analytics:read:own' ||
        p.name === 'charts:read:own' ||
        p.name === 'analytics:read:organization'
    );
  }

  /**
   * Build RBAC where conditions for queries
   * @returns Array of where conditions based on user permissions
   */
  private buildRBACWhereConditions(): SQL[] {
    const conditions: SQL[] = [];

    if (!this.canReadAll) {
      if (this.canReadOwn) {
        // Filter to only charts created by this user
        conditions.push(eq(chart_definitions.created_by, this.userContext.user_id));
      } else {
        // No permission - return condition that matches nothing
        conditions.push(sql`FALSE`);
      }
    }

    return conditions;
  }
  /**
   * Get chart definition by ID with RBAC enforcement
   *
   * @param chartDefinitionId - UUID of chart definition
   * @returns Chart definition or null if not found/no access
   * @throws NotFoundError if chart not found or access denied
   */
  async getChartDefinitionById(chartDefinitionId: string): Promise<ChartDefinition | null> {
    const startTime = Date.now();

    try {
      // Execute query with performance tracking
      const queryStart = Date.now();
      const [chartDefinition] = await db
        .select()
        .from(chart_definitions)
        .where(eq(chart_definitions.chart_definition_id, chartDefinitionId))
        .limit(1);

      const queryDuration = Date.now() - queryStart;

      if (!chartDefinition) {
        const duration = Date.now() - startTime;
        const template = logTemplates.crud.read('chart_definition', {
          resourceId: chartDefinitionId,
          userId: this.userContext.user_id,
          found: false,
          duration,
          metadata: { queryDuration, slow: queryDuration > SLOW_THRESHOLDS.DB_QUERY },
        });

        log.info(template.message, template.context);
        return null;
      }

      // Apply RBAC filtering
      // Chart definitions don't have organization_id, only created_by
      if (!this.canReadAll) {
        if (this.canReadOwn) {
          // Check if chart was created by user
          if (chartDefinition.created_by !== this.userContext.user_id) {
            throw NotFoundError('Chart definition');
          }
        } else {
          throw NotFoundError('Chart definition');
        }
      }

      const duration = Date.now() - startTime;

      // Log successful read using logTemplates
      const template = logTemplates.crud.read('chart_definition', {
        resourceId: chartDefinitionId,
        resourceName: chartDefinition.chart_name,
        userId: this.userContext.user_id,
        found: true,
        duration,
        metadata: {
          chartType: chartDefinition.chart_type,
          isActive: chartDefinition.is_active,
          queryDuration,
          slow: queryDuration > SLOW_THRESHOLDS.DB_QUERY,
        },
      });

      log.info(template.message, template.context);

      return chartDefinition as ChartDefinition;
    } catch (error) {
      log.error('chart definition read failed', error, {
        operation: 'read_chart_definition',
        chartDefinitionId,
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'service',
      });

      throw error;
    }
  }

  /**
   * Get list of chart definitions with optional filters
   *
   * @param filters - Optional filters for chart definitions
   * @returns Array of chart definitions user has access to
   */
  async getChartDefinitions(filters?: {
    is_active?: boolean;
    chart_type?: string;
  }): Promise<ChartDefinition[]> {
    const startTime = Date.now();

    try {
      const whereConditions = [];

      // Apply RBAC filtering
      const rbacConditions = this.buildRBACWhereConditions();
      whereConditions.push(...rbacConditions);

      // If no permission, return empty array immediately
      if (!this.canReadAll && !this.canReadOwn) {
        const template = logTemplates.crud.list('chart_definitions', {
          userId: this.userContext.user_id,
          filters: filters || {},
          results: { returned: 0, total: 0, page: 1 },
          duration: Date.now() - startTime,
          metadata: { noPermission: true },
        });

        log.info(template.message, template.context);
        return [];
      }

      // Apply filters
      if (filters?.is_active !== undefined) {
        whereConditions.push(eq(chart_definitions.is_active, filters.is_active));
      }

      if (filters?.chart_type) {
        whereConditions.push(eq(chart_definitions.chart_type, filters.chart_type));
      }

      // Execute query with performance tracking
      const queryStart = Date.now();
      const results = await db
        .select()
        .from(chart_definitions)
        .where(whereConditions.length > 0 ? and(...whereConditions) : undefined);

      const queryDuration = Date.now() - queryStart;
      const duration = Date.now() - startTime;

      // Log using logTemplates
      const template = logTemplates.crud.list('chart_definitions', {
        userId: this.userContext.user_id,
        filters: filters || {},
        results: { returned: results.length, total: results.length, page: 1 },
        duration,
        metadata: {
          queryDuration,
          slow: queryDuration > SLOW_THRESHOLDS.DB_QUERY,
          rbacScope: this.canReadAll ? 'all' : 'own',
        },
      });

      log.info(template.message, template.context);

      return results as ChartDefinition[];
    } catch (error) {
      log.error('chart definitions list failed', error, {
        operation: 'list_chart_definitions',
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'service',
      });

      throw error;
    }
  }
}

/**
 * Factory function to create RBAC Chart Definitions Service
 *
 * Following service layer standards - hybrid pattern with internal class.
 *
 * @param userContext - User context with RBAC permissions
 * @returns Chart definitions service with RBAC enforcement
 *
 * @example
 * ```typescript
 * const chartDefService = createRBACChartDefinitionsService(userContext);
 * const chartDef = await chartDefService.getChartDefinitionById('chart-uuid');
 * ```
 */
export function createRBACChartDefinitionsService(
  userContext: UserContext
): ChartDefinitionsServiceInterface {
  return new ChartDefinitionsService(userContext);
}
