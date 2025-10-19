// 1. Drizzle ORM
import { inArray } from 'drizzle-orm';

// 2. Database
import { db } from '@/lib/db';
import { work_item_field_values } from '@/lib/db/schema';

// 3. Logging
import { log, SLOW_THRESHOLDS } from '@/lib/logger';

// 4. Types
import type { UserContext } from '@/lib/types/rbac';

/**
 * Work Item Custom Fields Service
 *
 * Handles custom field operations for work items.
 * Extracted from base-service.ts to separate custom field concerns
 * from core service logic.
 *
 * Features:
 * - Batch fetching of custom field values (performance optimized)
 * - Map-based storage for O(1) lookup during result mapping
 * - Slow query detection and logging
 *
 * @internal - Use factory function instead
 */
class WorkItemCustomFieldsService {
  constructor(private readonly userContext: UserContext) {}

  /**
   * Get custom field values for multiple work items (batched)
   *
   * Fetches and organizes custom field values for efficient batch retrieval.
   * Returns a map for O(1) lookup when mapping work items to results.
   *
   * Performance: Single query for all work items (N+1 query prevention)
   *
   * @param workItemIds - Array of work item IDs to fetch custom fields for
   * @returns Map of work item ID to custom field values (field_id -> value)
   */
  async getCustomFieldValues(
    workItemIds: string[]
  ): Promise<Map<string, Record<string, unknown>>> {
    if (workItemIds.length === 0) {
      return new Map();
    }

    const queryStart = Date.now();

    try {
      const fieldValues = await db
        .select()
        .from(work_item_field_values)
        .where(inArray(work_item_field_values.work_item_id, workItemIds));

      const queryDuration = Date.now() - queryStart;

      // Detect slow queries
      if (queryDuration > SLOW_THRESHOLDS.DB_QUERY) {
        log.warn('slow custom fields query', {
          operation: 'get_custom_field_values',
          workItemCount: workItemIds.length,
          fieldValueCount: fieldValues.length,
          queryDuration,
          userId: this.userContext.user_id,
          component: 'custom_fields_service',
        });
      }

      // Group by work_item_id for O(1) lookup
      const customFieldsMap = new Map<string, Record<string, unknown>>();

      for (const fieldValue of fieldValues) {
        if (!customFieldsMap.has(fieldValue.work_item_id)) {
          customFieldsMap.set(fieldValue.work_item_id, {});
        }
        const workItemFields = customFieldsMap.get(fieldValue.work_item_id);
        if (workItemFields) {
          workItemFields[fieldValue.work_item_field_id] = fieldValue.field_value;
        }
      }

      log.debug('custom field values fetched', {
        operation: 'get_custom_field_values',
        workItemCount: workItemIds.length,
        workItemsWithFields: customFieldsMap.size,
        totalFields: fieldValues.length,
        queryDuration,
      });

      return customFieldsMap;
    } catch (error) {
      const duration = Date.now() - queryStart;
      log.error('custom field values fetch failed', error, {
        operation: 'get_custom_field_values',
        workItemCount: workItemIds.length,
        userId: this.userContext.user_id,
        duration,
        component: 'custom_fields_service',
      });

      throw error;
    }
  }
}

// ============================================================
// FACTORY
// ============================================================

/**
 * Create Work Item Custom Fields Service
 *
 * Factory function to create a new work item custom fields service instance.
 * Provides custom field operations for work items.
 *
 * @param userContext - User context for logging and audit trail
 * @returns Custom fields service instance
 *
 * @example
 * ```typescript
 * const service = createWorkItemCustomFieldsService(userContext);
 *
 * // Fetch custom fields for multiple work items
 * const workItemIds = ['uuid1', 'uuid2', 'uuid3'];
 * const customFieldsMap = await service.getCustomFieldValues(workItemIds);
 *
 * // Lookup for specific work item (O(1))
 * const workItem1Fields = customFieldsMap.get('uuid1');
 * ```
 */
export function createWorkItemCustomFieldsService(
  userContext: UserContext
): WorkItemCustomFieldsService {
  return new WorkItemCustomFieldsService(userContext);
}
