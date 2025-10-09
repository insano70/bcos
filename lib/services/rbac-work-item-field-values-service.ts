import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { work_item_field_values, work_item_fields } from '@/lib/db/schema';
import { log } from '@/lib/logger';
import { BaseRBACService } from '@/lib/rbac/base-service';
import type { UserContext } from '@/lib/types/rbac';
import { getFieldValueValidator } from '@/lib/validations/field-value-validators';

/**
 * RBAC Work Item Field Values Service
 * Manages custom field values for work items with permission checking
 */

export interface WorkItemFieldValue {
  work_item_field_value_id: string;
  work_item_id: string;
  work_item_field_id: string;
  field_value: unknown;
  created_at: Date;
  updated_at: Date;
}

export interface FieldValueData {
  [field_id: string]: unknown;
}

export class RBACWorkItemFieldValuesService extends BaseRBACService {
  /**
   * Get all field values for a work item
   */
  async getFieldValues(workItemId: string): Promise<WorkItemFieldValue[]> {
    const startTime = Date.now();

    log.info('Work item field values query initiated', {
      workItemId,
      requestingUserId: this.userContext.user_id,
    });

    // Check read permissions
    this.getAccessScope('work-items', 'read');

    const results = await db
      .select({
        work_item_field_value_id: work_item_field_values.work_item_field_value_id,
        work_item_id: work_item_field_values.work_item_id,
        work_item_field_id: work_item_field_values.work_item_field_id,
        field_value: work_item_field_values.field_value,
        created_at: work_item_field_values.created_at,
        updated_at: work_item_field_values.updated_at,
      })
      .from(work_item_field_values)
      .where(eq(work_item_field_values.work_item_id, workItemId));

    log.info('Work item field values retrieved successfully', {
      workItemId,
      count: results.length,
      duration: Date.now() - startTime,
    });

    return results.map((row) => ({
      work_item_field_value_id: row.work_item_field_value_id,
      work_item_id: row.work_item_id,
      work_item_field_id: row.work_item_field_id,
      field_value: row.field_value,
      created_at: row.created_at ?? new Date(),
      updated_at: row.updated_at ?? new Date(),
    }));
  }

  /**
   * Set field values for a work item (create or update)
   */
  async setFieldValues(
    workItemId: string,
    workItemTypeId: string,
    fieldValues: FieldValueData
  ): Promise<void> {
    const startTime = Date.now();

    log.info('Work item field values update initiated', {
      workItemId,
      workItemTypeId,
      fieldCount: Object.keys(fieldValues).length,
      requestingUserId: this.userContext.user_id,
    });

    // Get all fields for this work item type to validate
    const validFields = await db
      .select({
        work_item_field_id: work_item_fields.work_item_field_id,
        field_name: work_item_fields.field_name,
        field_type: work_item_fields.field_type,
        is_required: work_item_fields.is_required,
      })
      .from(work_item_fields)
      .where(
        and(
          eq(work_item_fields.work_item_type_id, workItemTypeId),
          isNull(work_item_fields.deleted_at)
        )
      );

    const validFieldMap = new Map(validFields.map((f) => [f.work_item_field_id, f]));

    // Validate that all provided field IDs are valid for this work item type
    for (const fieldId of Object.keys(fieldValues)) {
      if (!validFieldMap.has(fieldId)) {
        throw new Error(`Invalid field ID: ${fieldId} for work item type ${workItemTypeId}`);
      }

      // Validate field value format
      const field = validFieldMap.get(fieldId);
      if (field) {
        const validator = getFieldValueValidator(field.field_type);
        try {
          validator.parse(fieldValues[fieldId]);
        } catch (error) {
          throw new Error(
            `Invalid value for field ${field.field_name}: ${error instanceof Error ? error.message : 'Validation failed'}`
          );
        }
      }
    }

    // Check for required fields
    for (const field of validFields) {
      if (field.is_required && !(field.work_item_field_id in fieldValues)) {
        throw new Error(`Required field missing: ${field.field_name}`);
      }
    }

    // Get existing values
    const existingValues = await db
      .select({
        work_item_field_value_id: work_item_field_values.work_item_field_value_id,
        work_item_field_id: work_item_field_values.work_item_field_id,
      })
      .from(work_item_field_values)
      .where(eq(work_item_field_values.work_item_id, workItemId));

    const existingMap = new Map(
      existingValues.map((v) => [v.work_item_field_id, v.work_item_field_value_id])
    );

    // Update or insert field values
    for (const [fieldId, value] of Object.entries(fieldValues)) {
      if (existingMap.has(fieldId)) {
        // Update existing value
        await db
          .update(work_item_field_values)
          .set({
            field_value: value,
            updated_at: new Date(),
          })
          .where(eq(work_item_field_values.work_item_field_value_id, existingMap.get(fieldId) ?? ''));

        log.info('Work item field value updated', {
          workItemId,
          fieldId,
        });
      } else {
        // Insert new value
        await db.insert(work_item_field_values).values({
          work_item_id: workItemId,
          work_item_field_id: fieldId,
          field_value: value,
        });

        log.info('Work item field value created', {
          workItemId,
          fieldId,
        });
      }
    }

    log.info('Work item field values updated successfully', {
      workItemId,
      fieldCount: Object.keys(fieldValues).length,
      duration: Date.now() - startTime,
    });
  }

  /**
   * Delete all field values for a work item
   */
  async deleteFieldValues(workItemId: string): Promise<void> {
    const startTime = Date.now();

    log.info('Work item field values deletion initiated', {
      workItemId,
      requestingUserId: this.userContext.user_id,
    });

    await db
      .delete(work_item_field_values)
      .where(eq(work_item_field_values.work_item_id, workItemId));

    log.info('Work item field values deleted successfully', {
      workItemId,
      duration: Date.now() - startTime,
    });
  }
}

/**
 * Factory function to create RBAC Work Item Field Values Service
 */
export function createRBACWorkItemFieldValuesService(
  userContext: UserContext
): RBACWorkItemFieldValuesService {
  return new RBACWorkItemFieldValuesService(userContext);
}
