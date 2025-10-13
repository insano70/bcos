import type { UserContext } from '@/lib/types/rbac';
import { db } from '@/lib/db';
import { chart_definitions } from '@/lib/db/analytics-schema';
import { eq, and } from 'drizzle-orm';
import { NotFoundError } from '@/lib/api/responses/error';
import { log } from '@/lib/logger';

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
 * RBAC Chart Definitions Service Interface
 *
 * Provides methods for accessing chart definitions with RBAC enforcement
 */
export interface ChartDefinitionsServiceInterface {
  getChartDefinitionById(chartDefinitionId: string): Promise<ChartDefinition | null>;
  getChartDefinitions(filters?: {
    is_active?: boolean;
    chart_type?: string;
  }): Promise<ChartDefinition[]>;
}

/**
 * Create RBAC-enabled Chart Definitions Service
 *
 * Following API Standards section 8 - Service Layer Requirements
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
  // Check permissions at service creation
  // Note: chart_definitions table does not have organization_id column
  // Only supports all/own scoping, not organization-level scoping
  const canReadAll = userContext.all_permissions?.some(p =>
    p.name === 'analytics:read:all' || p.name === 'charts:read:all'
  ) || userContext.is_super_admin;

  const canReadOwn = userContext.all_permissions?.some(p =>
    p.name === 'analytics:read:own' || p.name === 'charts:read:own' || p.name === 'analytics:read:organization'
  );

  return {
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
        log.info('Fetching chart definition', {
          chartDefinitionId,
          userId: userContext.user_id,
        });

        const [chartDefinition] = await db
          .select()
          .from(chart_definitions)
          .where(eq(chart_definitions.chart_definition_id, chartDefinitionId))
          .limit(1);

        if (!chartDefinition) {
          log.warn('Chart definition not found', {
            chartDefinitionId,
            userId: userContext.user_id,
          });
          return null;
        }

        // Apply RBAC filtering
        // Chart definitions don't have organization_id, only created_by
        if (!canReadAll) {
          if (canReadOwn) {
            // Check if chart was created by user
            if (chartDefinition.created_by !== userContext.user_id) {
              log.warn('Chart definition access denied - not owner', {
                chartDefinitionId,
                userId: userContext.user_id,
                chartOwnerId: chartDefinition.created_by,
              });
              throw NotFoundError('Chart definition');
            }
          } else {
            log.warn('Chart definition access denied - no permission', {
              chartDefinitionId,
              userId: userContext.user_id,
            });
            throw NotFoundError('Chart definition');
          }
        }

        const duration = Date.now() - startTime;

        log.info('Chart definition fetched successfully', {
          chartDefinitionId,
          chartType: chartDefinition.chart_type,
          isActive: chartDefinition.is_active,
          duration,
        });

        return chartDefinition as ChartDefinition;
      } catch (error) {
        log.error('Failed to fetch chart definition', error, {
          chartDefinitionId,
          userId: userContext.user_id,
          duration: Date.now() - startTime,
        });

        throw error;
      }
    },

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
        log.info('Fetching chart definitions list', {
          userId: userContext.user_id,
          filters,
        });

        const whereConditions = [];

        // Apply RBAC filtering
        // Chart definitions don't have organization_id, only created_by
        if (!canReadAll) {
          if (canReadOwn) {
            whereConditions.push(
              eq(chart_definitions.created_by, userContext.user_id)
            );
          } else {
            log.warn('No permission to read chart definitions', {
              userId: userContext.user_id,
            });
            return [];
          }
        }

        // Apply filters
        if (filters?.is_active !== undefined) {
          whereConditions.push(eq(chart_definitions.is_active, filters.is_active));
        }

        if (filters?.chart_type) {
          whereConditions.push(eq(chart_definitions.chart_type, filters.chart_type));
        }

        const results = await db
          .select()
          .from(chart_definitions)
          .where(whereConditions.length > 0 ? and(...whereConditions) : undefined);

        const duration = Date.now() - startTime;

        log.info('Chart definitions list fetched successfully', {
          count: results.length,
          duration,
        });

        return results as ChartDefinition[];
      } catch (error) {
        log.error('Failed to fetch chart definitions list', error, {
          userId: userContext.user_id,
          duration: Date.now() - startTime,
        });

        throw error;
      }
    },
  };
}
