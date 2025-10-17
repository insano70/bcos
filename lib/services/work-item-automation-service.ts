/**
 * Work Item Automation Service
 *
 * Manages automated work item creation based on type relationships.
 * Handles template interpolation, field inheritance, and auto-creation logic.
 *
 * **Pattern**: Hybrid pattern with internal class + factory function
 * **Observability**: Full logging with SLOW_THRESHOLDS tracking
 * **Dependencies**: Template interpolation utilities, work item core service
 */

import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  work_item_field_values,
  work_item_fields,
  work_item_statuses,
  work_item_type_relationships,
  work_items,
} from '@/lib/db/schema';
import { log, SLOW_THRESHOLDS } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';
import {
  extractInheritFields,
  interpolateFieldValues,
  interpolateTemplate,
} from '@/lib/utils/template-interpolation';
import { createRBACWorkItemsService } from './work-items';

/**
 * Work Item Automation Service Interface
 *
 * Provides automated work item creation operations:
 * - autoCreateChildItems: Create child items based on type relationships
 */
export interface WorkItemAutomationServiceInterface {
  autoCreateChildItems(parentWorkItemId: string, parentTypeId: string): Promise<number>;
}

/**
 * Internal Work Item Automation Service Implementation
 *
 * Uses hybrid pattern: internal class with factory function.
 * Provides automation operations without RBAC (called from authorized context).
 */
class WorkItemAutomationService implements WorkItemAutomationServiceInterface {
  constructor(private readonly userContext: UserContext) {}

  /**
   * Auto-create child work items based on type relationships
   *
   * Finds all auto-create relationships for the parent type and creates
   * child work items with template interpolation and field inheritance.
   *
   * @param parentWorkItemId - Parent work item ID
   * @param parentTypeId - Parent work item type ID
   * @returns Number of child items created
   */
  async autoCreateChildItems(parentWorkItemId: string, parentTypeId: string): Promise<number> {
    const startTime = Date.now();

    try {
      // Get all auto-create relationships for this parent type
      const relationshipsStart = Date.now();
      const relationships = await db
        .select()
        .from(work_item_type_relationships)
        .where(
          and(
            eq(work_item_type_relationships.parent_type_id, parentTypeId),
            eq(work_item_type_relationships.auto_create, true),
            isNull(work_item_type_relationships.deleted_at)
          )
        );
      const relationshipsDuration = Date.now() - relationshipsStart;

      if (relationships.length === 0) {
        log.debug('no auto-create relationships found', {
          parentWorkItemId,
          parentTypeId,
          relationshipsDuration,
        });
        return 0;
      }

      // Fetch parent work item with details for interpolation
      const workItemsService = createRBACWorkItemsService(this.userContext);
      const parentFetchStart = Date.now();
      const parentWorkItem = await workItemsService.getWorkItemById(parentWorkItemId);
      const parentFetchDuration = Date.now() - parentFetchStart;

      if (!parentWorkItem) {
        log.error('parent work item not found for auto-creation', {
          parentWorkItemId,
          duration: Date.now() - startTime,
        });
        return 0;
      }

      let createdCount = 0;

      // Create child items for each auto-create relationship
      for (const relationship of relationships) {
        const childStartTime = Date.now();

        try {
          const config = relationship.auto_create_config as {
            subject_template?: string;
            field_values?: Record<string, string>;
            inherit_fields?: string[];
          } | null;

          if (!config) {
            log.warn('auto-create relationship missing configuration', {
              relationshipId: relationship.work_item_type_relationship_id,
              parentWorkItemId,
            });
            continue;
          }

          // Get initial status for child type
          const statusStart = Date.now();
          const [childInitialStatus] = await db
            .select()
            .from(work_item_statuses)
            .where(
              and(
                eq(work_item_statuses.work_item_type_id, relationship.child_type_id),
                eq(work_item_statuses.is_initial, true)
              )
            )
            .limit(1);
          const statusDuration = Date.now() - statusStart;

          if (!childInitialStatus) {
            log.error('no initial status found for child type', {
              childTypeId: relationship.child_type_id,
              parentWorkItemId,
            });
            continue;
          }

          // Interpolate subject template
          const subject = config.subject_template
            ? interpolateTemplate(
                config.subject_template,
                parentWorkItem,
                parentWorkItem.custom_fields
              )
            : `Child of ${parentWorkItem.subject}`;

          // Interpolate field values
          const interpolatedFieldValues = config.field_values
            ? interpolateFieldValues(
                config.field_values,
                parentWorkItem,
                parentWorkItem.custom_fields
              )
            : {};

          // Extract inherited fields
          const inheritedFields = config.inherit_fields
            ? extractInheritFields(
                config.inherit_fields,
                parentWorkItem,
                parentWorkItem.custom_fields
              )
            : {};

          // Create child work item
          const insertStart = Date.now();
          const [childWorkItem] = await db
            .insert(work_items)
            .values({
              work_item_type_id: relationship.child_type_id,
              organization_id: parentWorkItem.organization_id,
              subject,
              description: null,
              status_id: childInitialStatus.work_item_status_id,
              priority: (inheritedFields.priority as string) || parentWorkItem.priority || 'medium',
              assigned_to:
                (inheritedFields.assigned_to as string) || parentWorkItem.assigned_to || null,
              due_date: (inheritedFields.due_date as Date) || parentWorkItem.due_date || null,
              parent_work_item_id: parentWorkItemId,
              root_work_item_id: parentWorkItem.work_item_id, // Parent becomes root
              depth: 1, // Child is always depth 1 from parent
              created_by: this.userContext.user_id,
            })
            .returning();
          const insertDuration = Date.now() - insertStart;

          if (!childWorkItem) {
            log.error('failed to create child work item', {
              parentWorkItemId,
              childTypeId: relationship.child_type_id,
              relationshipId: relationship.work_item_type_relationship_id,
            });
            continue;
          }

          // Update path
          const pathStart = Date.now();
          const path = `/${parentWorkItemId}/${childWorkItem.work_item_id}`;
          await db
            .update(work_items)
            .set({ path })
            .where(eq(work_items.work_item_id, childWorkItem.work_item_id));
          const pathDuration = Date.now() - pathStart;

          // Create custom field values from interpolated field values
          let customFieldsCount = 0;
          if (Object.keys(interpolatedFieldValues).length > 0) {
            const fieldsStart = Date.now();

            // Get custom field definitions for child type
            const fieldDefinitions = await db
              .select()
              .from(work_item_fields)
              .where(
                and(
                  eq(work_item_fields.work_item_type_id, relationship.child_type_id),
                  isNull(work_item_fields.deleted_at)
                )
              );

            const fieldMap = new Map(
              fieldDefinitions.map((f) => [f.field_name, f.work_item_field_id])
            );

            // Insert field values
            for (const [fieldName, fieldValue] of Object.entries(interpolatedFieldValues)) {
              const fieldId = fieldMap.get(fieldName);
              if (fieldId) {
                await db.insert(work_item_field_values).values({
                  work_item_id: childWorkItem.work_item_id,
                  work_item_field_id: fieldId,
                  field_value: fieldValue,
                });
                customFieldsCount++;
              }
            }

            const fieldsDuration = Date.now() - fieldsStart;
            log.debug('custom fields created for child', {
              childWorkItemId: childWorkItem.work_item_id,
              customFieldsCount,
              fieldsDuration,
              slow: fieldsDuration > SLOW_THRESHOLDS.DB_QUERY,
            });
          }

          const childDuration = Date.now() - childStartTime;

          log.info('child work item auto-created', {
            operation: 'auto_create_child',
            childWorkItemId: childWorkItem.work_item_id,
            childSubject: childWorkItem.subject,
            parentWorkItemId,
            relationshipId: relationship.work_item_type_relationship_id,
            childTypeId: relationship.child_type_id,
            userId: this.userContext.user_id,
            organizationId: parentWorkItem.organization_id,
            duration: childDuration,
            component: 'service',
            metadata: {
              statusDuration,
              insertDuration,
              pathDuration,
              customFieldsCount,
              slowStatus: statusDuration > SLOW_THRESHOLDS.DB_QUERY,
              slowInsert: insertDuration > SLOW_THRESHOLDS.DB_QUERY,
              slowPath: pathDuration > SLOW_THRESHOLDS.DB_QUERY,
              hasTemplate: !!config.subject_template,
              hasFieldValues: Object.keys(interpolatedFieldValues).length > 0,
              hasInheritedFields: Object.keys(inheritedFields).length > 0,
            },
          });

          createdCount++;
        } catch (error) {
          // Log error but don't fail entire auto-creation process
          log.error('failed to auto-create individual child item', error, {
            parentWorkItemId,
            relationshipId: relationship.work_item_type_relationship_id,
            childTypeId: relationship.child_type_id,
            duration: Date.now() - childStartTime,
            component: 'service',
          });
        }
      }

      const totalDuration = Date.now() - startTime;

      log.info('auto-creation completed', {
        operation: 'auto_create_children',
        parentWorkItemId,
        parentTypeId,
        userId: this.userContext.user_id,
        organizationId: parentWorkItem.organization_id,
        relationshipsFound: relationships.length,
        childrenCreated: createdCount,
        duration: totalDuration,
        component: 'service',
        metadata: {
          relationshipsDuration,
          parentFetchDuration,
          slowRelationships: relationshipsDuration > SLOW_THRESHOLDS.DB_QUERY,
          slowParentFetch: parentFetchDuration > SLOW_THRESHOLDS.DB_QUERY,
        },
      });

      return createdCount;
    } catch (error) {
      log.error('auto-creation failed', error, {
        operation: 'auto_create_children',
        parentWorkItemId,
        parentTypeId,
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'service',
      });

      // Don't throw - auto-creation failure shouldn't fail parent creation
      return 0;
    }
  }
}

/**
 * Factory function to create Work Item Automation Service
 *
 * **Phase 4 Implementation**: Automation operations
 * - autoCreateChildItems: Auto-create child items based on type relationships
 *
 * @param userContext - User context for creating child items
 * @returns Work item automation service
 *
 * @example
 * ```typescript
 * const automationService = createWorkItemAutomationService(userContext);
 *
 * // Auto-create children after parent creation
 * const childCount = await automationService.autoCreateChildItems(
 *   'parent-uuid',
 *   'parent-type-uuid'
 * );
 * ```
 *
 * **Features**:
 * - Template interpolation for subject generation
 * - Field value interpolation from templates
 * - Field inheritance from parent
 * - Custom field values creation
 * - Comprehensive performance tracking
 * - Error isolation (one child failure doesn't fail all)
 *
 * **Template Syntax**:
 * - Subject: `{{field_name}}` for parent field interpolation
 * - Field values: Same template syntax in config
 * - Inherit fields: Array of field names to copy from parent
 */
export function createWorkItemAutomationService(
  userContext: UserContext
): WorkItemAutomationServiceInterface {
  return new WorkItemAutomationService(userContext);
}
