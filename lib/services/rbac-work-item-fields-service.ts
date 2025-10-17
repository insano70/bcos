import { and, count, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { work_item_fields, work_item_types } from '@/lib/db/schema';
import { log } from '@/lib/logger';
import { BaseRBACService } from '@/lib/rbac/base-service';
import type { UserContext } from '@/lib/types/rbac';
import type {
  CreateWorkItemFieldData,
  FieldOption,
  UpdateWorkItemFieldData,
  ValidationRules,
  WorkItemField,
} from '@/lib/types/work-item-fields';

/**
 * RBAC Work Item Fields Service
 * Manages custom field definitions for work item types with permission checking
 */

export interface WorkItemFieldQueryOptions {
  work_item_type_id?: string;
  is_visible?: boolean;
  limit?: number;
  offset?: number;
}

export class RBACWorkItemFieldsService extends BaseRBACService {
  /**
   * Get work item fields with automatic permission-based filtering
   */
  async getWorkItemFields(options: WorkItemFieldQueryOptions = {}): Promise<WorkItemField[]> {
    const startTime = Date.now();

    log.info('Work item fields query initiated', {
      requestingUserId: this.userContext.user_id,
      options,
    });

    // Check read permissions
    const _accessScope = this.getAccessScope('work-items', 'read');

    // Build where conditions
    const whereConditions = [isNull(work_item_fields.deleted_at)];

    // Filter by work item type if specified
    if (options.work_item_type_id) {
      whereConditions.push(eq(work_item_fields.work_item_type_id, options.work_item_type_id));
    }

    // Filter by visibility if specified
    if (options.is_visible !== undefined) {
      whereConditions.push(eq(work_item_fields.is_visible, options.is_visible));
    }

    // Execute query
    const results = await db
      .select({
        work_item_field_id: work_item_fields.work_item_field_id,
        work_item_type_id: work_item_fields.work_item_type_id,
        field_name: work_item_fields.field_name,
        field_label: work_item_fields.field_label,
        field_type: work_item_fields.field_type,
        field_description: work_item_fields.field_description,
        field_options: work_item_fields.field_options,
        field_config: work_item_fields.field_config,
        is_required: work_item_fields.is_required,
        validation_rules: work_item_fields.validation_rules,
        default_value: work_item_fields.default_value,
        display_order: work_item_fields.display_order,
        is_visible: work_item_fields.is_visible,
        created_by: work_item_fields.created_by,
        created_at: work_item_fields.created_at,
        updated_at: work_item_fields.updated_at,
        deleted_at: work_item_fields.deleted_at,
      })
      .from(work_item_fields)
      .where(and(...whereConditions))
      .orderBy(work_item_fields.display_order);

    log.info('Work item fields retrieved successfully', {
      count: results.length,
      duration: Date.now() - startTime,
    });

    return results.map((row) => ({
      work_item_field_id: row.work_item_field_id,
      work_item_type_id: row.work_item_type_id,
      field_name: row.field_name,
      field_label: row.field_label,
      field_type: row.field_type as WorkItemField['field_type'],
      field_description: row.field_description,
      field_options: row.field_options as FieldOption[] | null,
      field_config: row.field_config as WorkItemField['field_config'],
      is_required: row.is_required ?? false,
      validation_rules: row.validation_rules as ValidationRules | null,
      default_value: row.default_value,
      display_order: row.display_order ?? 0,
      is_visible: row.is_visible ?? true,
      created_by: row.created_by,
      created_at: row.created_at ?? new Date(),
      updated_at: row.updated_at ?? new Date(),
      deleted_at: row.deleted_at,
    }));
  }

  /**
   * Get a specific work item field by ID
   */
  async getWorkItemFieldById(fieldId: string): Promise<WorkItemField | null> {
    // Check read permissions
    this.getAccessScope('work-items', 'read');

    const [result] = await db
      .select()
      .from(work_item_fields)
      .where(
        and(eq(work_item_fields.work_item_field_id, fieldId), isNull(work_item_fields.deleted_at))
      );

    if (!result) {
      return null;
    }

    return {
      work_item_field_id: result.work_item_field_id,
      work_item_type_id: result.work_item_type_id,
      field_name: result.field_name,
      field_label: result.field_label,
      field_type: result.field_type as WorkItemField['field_type'],
      field_description: result.field_description,
      field_options: result.field_options as FieldOption[] | null,
      field_config: result.field_config as WorkItemField['field_config'],
      is_required: result.is_required ?? false,
      validation_rules: result.validation_rules as ValidationRules | null,
      default_value: result.default_value,
      display_order: result.display_order ?? 0,
      is_visible: result.is_visible ?? true,
      created_by: result.created_by,
      created_at: result.created_at ?? new Date(),
      updated_at: result.updated_at ?? new Date(),
      deleted_at: result.deleted_at,
    };
  }

  /**
   * Create a new work item field
   */
  async createWorkItemField(fieldData: CreateWorkItemFieldData): Promise<WorkItemField> {
    const startTime = Date.now();

    log.info('Work item field creation initiated', {
      requestingUserId: this.userContext.user_id,
      workItemTypeId: fieldData.work_item_type_id,
      fieldName: fieldData.field_name,
    });

    // Check create permissions
    this.requirePermission('work-items:create:organization', undefined, undefined);

    // Verify work item type exists
    const [workItemType] = await db
      .select()
      .from(work_item_types)
      .where(eq(work_item_types.work_item_type_id, fieldData.work_item_type_id))
      .limit(1);

    if (!workItemType) {
      throw new Error('Work item type not found');
    }

    // Create field
    const [newField] = await db
      .insert(work_item_fields)
      .values({
        work_item_type_id: fieldData.work_item_type_id,
        field_name: fieldData.field_name,
        field_label: fieldData.field_label,
        field_type: fieldData.field_type,
        field_description: fieldData.field_description,
        field_options: fieldData.field_options
          ? JSON.parse(JSON.stringify(fieldData.field_options))
          : null,
        is_required: fieldData.is_required ?? false,
        validation_rules: fieldData.validation_rules
          ? JSON.parse(JSON.stringify(fieldData.validation_rules))
          : null,
        default_value: fieldData.default_value,
        display_order: fieldData.display_order ?? 0,
        is_visible: fieldData.is_visible ?? true,
        created_by: this.userContext.user_id,
      })
      .returning();

    if (!newField) {
      throw new Error('Failed to create work item field');
    }

    log.info('Work item field created successfully', {
      fieldId: newField.work_item_field_id,
      duration: Date.now() - startTime,
    });

    await this.logPermissionCheck('work-items:create:organization', newField.work_item_field_id);

    const field = await this.getWorkItemFieldById(newField.work_item_field_id);
    if (!field) {
      throw new Error('Failed to retrieve created field');
    }

    return field;
  }

  /**
   * Update a work item field
   */
  async updateWorkItemField(
    fieldId: string,
    updateData: UpdateWorkItemFieldData
  ): Promise<WorkItemField> {
    const startTime = Date.now();

    log.info('Work item field update initiated', {
      requestingUserId: this.userContext.user_id,
      fieldId,
    });

    // Check update permissions
    this.requirePermission('work-items:update:organization', fieldId);

    // Verify field exists
    const existingField = await this.getWorkItemFieldById(fieldId);
    if (!existingField) {
      throw new Error('Work item field not found');
    }

    // Update field
    const [updatedField] = await db
      .update(work_item_fields)
      .set({
        ...updateData,
        field_options: updateData.field_options
          ? JSON.parse(JSON.stringify(updateData.field_options))
          : undefined,
        validation_rules: updateData.validation_rules
          ? JSON.parse(JSON.stringify(updateData.validation_rules))
          : undefined,
        updated_at: new Date(),
      })
      .where(eq(work_item_fields.work_item_field_id, fieldId))
      .returning();

    if (!updatedField) {
      throw new Error('Failed to update work item field');
    }

    log.info('Work item field updated successfully', {
      fieldId,
      duration: Date.now() - startTime,
    });

    await this.logPermissionCheck('work-items:update:organization', fieldId);

    const field = await this.getWorkItemFieldById(fieldId);
    if (!field) {
      throw new Error('Failed to retrieve updated field');
    }

    return field;
  }

  /**
   * Delete a work item field (soft delete)
   */
  async deleteWorkItemField(fieldId: string): Promise<void> {
    const startTime = Date.now();

    log.info('Work item field deletion initiated', {
      requestingUserId: this.userContext.user_id,
      fieldId,
    });

    // Check delete permissions
    this.requirePermission('work-items:delete:organization', fieldId);

    // Verify field exists
    const existingField = await this.getWorkItemFieldById(fieldId);
    if (!existingField) {
      throw new Error('Work item field not found');
    }

    // Soft delete
    await db
      .update(work_item_fields)
      .set({
        deleted_at: new Date(),
      })
      .where(eq(work_item_fields.work_item_field_id, fieldId));

    log.info('Work item field deleted successfully', {
      fieldId,
      duration: Date.now() - startTime,
    });

    await this.logPermissionCheck('work-items:delete:organization', fieldId);
  }

  /**
   * Get count of work item fields
   */
  async getWorkItemFieldCount(workItemTypeId?: string): Promise<number> {
    const whereConditions = [isNull(work_item_fields.deleted_at)];

    if (workItemTypeId) {
      whereConditions.push(eq(work_item_fields.work_item_type_id, workItemTypeId));
    }

    const [result] = await db
      .select({ count: count() })
      .from(work_item_fields)
      .where(and(...whereConditions));

    return result?.count || 0;
  }
}

/**
 * Factory function to create RBAC Work Item Fields Service
 */
export function createRBACWorkItemFieldsService(
  userContext: UserContext
): RBACWorkItemFieldsService {
  return new RBACWorkItemFieldsService(userContext);
}
