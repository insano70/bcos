/**
 * RBAC Measure Service
 *
 * RBAC-protected CRUD service for report card measures.
 * Extends BaseCrudService for consistency with other CRUD services.
 *
 * NOTE: For CLI/cron operations without user context, use getActiveMeasures()
 * from './get-active-measures' instead.
 */

import { eq, like, or, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { report_card_measures } from '@/lib/db/schema';
import { BaseCrudService } from '@/lib/services/crud';
import type { CrudServiceConfig } from '@/lib/services/crud';
import { log, logTemplates } from '@/lib/logger';
import { ConflictError } from '@/lib/errors/domain-errors';
import type { MeasureConfig, MeasureCreateInput, MeasureUpdateInput } from '@/lib/types/report-card';
import type { UserContext } from '@/lib/types/rbac';

/** Query options for measure list operations */
export interface MeasureQueryOptions {
  limit?: number;
  offset?: number;
  search?: string;
  activeOnly?: boolean;
}

/**
 * RBAC-protected CRUD service for report card measures.
 *
 * Uses BaseCrudService infrastructure for consistency with other services.
 *
 * NOTE: For CLI/cron operations without user context, use getActiveMeasures()
 * from './get-active-measures' instead.
 */
export class RBACMeasureService extends BaseCrudService<
  typeof report_card_measures,
  MeasureConfig,
  MeasureCreateInput,
  MeasureUpdateInput,
  MeasureQueryOptions
> {
  protected config: CrudServiceConfig<
    typeof report_card_measures,
    MeasureConfig,
    MeasureCreateInput,
    MeasureUpdateInput,
    MeasureQueryOptions
  > = {
    table: report_card_measures,
    resourceName: 'report-card-measures',
    displayName: 'measure',
    primaryKeyName: 'measure_id',
    updatedAtColumnName: 'updated_at',
    // NOTE: No deletedAtColumnName - we use is_active boolean instead
    // Override delete() method below to handle this

    permissions: {
      read: 'analytics:read:all',
      create: 'analytics:read:all',
      update: 'analytics:read:all',
      delete: 'analytics:read:all',
    },

    // No organization scoping - measures are global (omit property for exactOptionalPropertyTypes)

    validators: {
      beforeCreate: async (data: MeasureCreateInput) => {
        // Check for duplicate measure_name
        const [existing] = await db
          .select({ measure_id: report_card_measures.measure_id })
          .from(report_card_measures)
          .where(eq(report_card_measures.measure_name, data.measure_name))
          .limit(1);

        if (existing) {
          throw new ConflictError(`Measure with name '${data.measure_name}' already exists`);
        }
      },
      beforeUpdate: async (
        id: string | number,
        data: MeasureUpdateInput,
        existing: MeasureConfig
      ) => {
        // If changing measure_name, check for duplicates
        if (data.measure_name && data.measure_name !== existing.measure_name) {
          const [duplicate] = await db
            .select({ measure_id: report_card_measures.measure_id })
            .from(report_card_measures)
            .where(eq(report_card_measures.measure_name, data.measure_name))
            .limit(1);

          if (duplicate && duplicate.measure_id !== Number(id)) {
            throw new ConflictError(`Measure with name '${data.measure_name}' already exists`);
          }
        }
      },
    },

    transformers: {
      toEntity: (row: Record<string, unknown>): MeasureConfig => ({
        measure_id: row.measure_id as number,
        measure_name: row.measure_name as string,
        display_name: row.display_name as string,
        weight: parseFloat((row.weight as string) || '5'),
        is_active: (row.is_active as boolean) ?? true,
        higher_is_better: (row.higher_is_better as boolean) ?? true,
        format_type: (row.format_type as 'number' | 'currency' | 'percentage') || 'number',
        data_source_id: row.data_source_id as number | null,
        value_column: (row.value_column as string) || 'numeric_value',
        filter_criteria: (row.filter_criteria as Record<string, string>) || {},
        created_at: (row.created_at as Date)?.toISOString() || new Date().toISOString(),
        updated_at: (row.updated_at as Date)?.toISOString() || new Date().toISOString(),
      }),
    },
  };

  /**
   * Override delete to use is_active = false instead of deleted_at timestamp.
   * The report_card_measures table uses a boolean flag for soft delete.
   */
  async delete(id: string | number): Promise<void> {
    const startTime = Date.now();

    // Check permission
    this.requireAnyPermission(['analytics:read:all']);

    // Verify entity exists
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error(`Measure ${id} not found`);
    }

    // Soft delete using is_active = false
    await db
      .update(report_card_measures)
      .set({
        is_active: false,
        updated_at: new Date(),
      })
      .where(eq(report_card_measures.measure_id, Number(id)));

    const duration = Date.now() - startTime;

    // Log using standard template
    const template = logTemplates.crud.delete('measure', {
      resourceId: String(id),
      resourceName: existing.measure_name,
      userId: this.userContext.user_id,
      soft: true,
      duration,
      metadata: {
        component: 'crud-service',
        resourceType: 'report-card-measures',
      },
    });
    log.info(template.message, template.context);
  }

  /**
   * Build custom filter conditions for is_active filtering.
   */
  protected buildCustomConditions(options: MeasureQueryOptions): SQL[] {
    const conditions: SQL[] = [];

    // Default to active only unless explicitly set to false
    if (options.activeOnly !== false) {
      conditions.push(eq(report_card_measures.is_active, true));
    }

    return conditions;
  }

  /**
   * Build search conditions for measure name and display name.
   */
  protected buildSearchConditions(search: string): SQL[] {
    const searchPattern = `%${search}%`;
    return [
      or(
        like(report_card_measures.measure_name, searchPattern),
        like(report_card_measures.display_name, searchPattern)
      ),
    ].filter((condition): condition is SQL => condition !== undefined);
  }
}

/** Factory function for creating service instances */
export function createRBACMeasureService(userContext: UserContext): RBACMeasureService {
  return new RBACMeasureService(userContext);
}
