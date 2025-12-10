import type { SQL } from 'drizzle-orm';
import { eq } from 'drizzle-orm';

import { db, work_item_fields, work_item_types } from '@/lib/db';
import { NotFoundError } from '@/lib/errors/domain-errors';
import { BaseCrudService, type BaseQueryOptions, type CrudServiceConfig } from '@/lib/services/crud';
import type { UserContext } from '@/lib/types/rbac';
import type {
  CreateWorkItemFieldData,
  FieldConfig,
  FieldOption,
  FieldType,
  UpdateWorkItemFieldData,
  ValidationRules,
  WorkItemField,
} from '@/lib/types/work-item-fields';

/**
 * RBAC Work Item Fields Service
 * Manages custom field definitions for work item types with permission checking
 *
 * Migrated to use BaseCrudService infrastructure.
 */

export interface WorkItemFieldQueryOptions extends BaseQueryOptions {
  work_item_type_id?: string;
  is_visible?: boolean;
}

/**
 * RBAC Work Item Fields Service
 * Provides secure field management with automatic permission checking
 */
export class RBACWorkItemFieldsService extends BaseCrudService<
  typeof work_item_fields,
  WorkItemField,
  CreateWorkItemFieldData,
  UpdateWorkItemFieldData,
  WorkItemFieldQueryOptions
> {
  protected config: CrudServiceConfig<
    typeof work_item_fields,
    WorkItemField,
    CreateWorkItemFieldData,
    UpdateWorkItemFieldData,
    WorkItemFieldQueryOptions
  > = {
    table: work_item_fields,
    resourceName: 'work-item-fields',
    displayName: 'work item field',
    primaryKeyName: 'work_item_field_id',
    deletedAtColumnName: 'deleted_at',
    updatedAtColumnName: 'updated_at',
    permissions: {
      read: 'work-items:read:organization',
      create: 'work-items:create:organization',
      update: 'work-items:update:organization',
      delete: 'work-items:delete:organization',
    },
    parentResource: {
      table: work_item_types,
      foreignKeyColumnName: 'work_item_type_id',
      parentPrimaryKeyName: 'work_item_type_id',
      parentOrgColumnName: 'organization_id',
    },
    transformers: {
      toEntity: (row: Record<string, unknown>): WorkItemField => this.transformRowToField(row),
      toCreateValues: (data, ctx) => ({
        work_item_type_id: data.work_item_type_id,
        field_name: data.field_name,
        field_label: data.field_label,
        field_type: data.field_type,
        field_description: data.field_description ?? null,
        field_options: data.field_options ? JSON.parse(JSON.stringify(data.field_options)) : null,
        field_config: data.field_config ? JSON.parse(JSON.stringify(data.field_config)) : null,
        is_required_on_creation: data.is_required_on_creation ?? false,
        is_required_to_complete: data.is_required_to_complete ?? false,
        validation_rules: data.validation_rules
          ? JSON.parse(JSON.stringify(data.validation_rules))
          : null,
        default_value: data.default_value ?? null,
        display_order: data.display_order ?? 0,
        is_visible: data.is_visible ?? true,
        created_by: ctx.user_id,
      }),
      toUpdateValues: (data) => {
        const values: Record<string, unknown> = {};

        if (data.field_label !== undefined) values.field_label = data.field_label;
        if (data.field_description !== undefined) values.field_description = data.field_description;
        if (data.field_options !== undefined) {
          values.field_options = data.field_options
            ? JSON.parse(JSON.stringify(data.field_options))
            : null;
        }
        if (data.field_config !== undefined) {
          values.field_config = data.field_config
            ? JSON.parse(JSON.stringify(data.field_config))
            : null;
        }
        if (data.is_required_on_creation !== undefined)
          values.is_required_on_creation = data.is_required_on_creation;
        if (data.is_required_to_complete !== undefined)
          values.is_required_to_complete = data.is_required_to_complete;
        if (data.validation_rules !== undefined) {
          values.validation_rules = data.validation_rules
            ? JSON.parse(JSON.stringify(data.validation_rules))
            : null;
        }
        if (data.default_value !== undefined) values.default_value = data.default_value;
        if (data.display_order !== undefined) values.display_order = data.display_order;
        if (data.is_visible !== undefined) values.is_visible = data.is_visible;

        return values;
      },
    },
    validators: {
      beforeCreate: async (data) => {
        // Verify work item type exists
        const [workItemType] = await db
          .select()
          .from(work_item_types)
          .where(eq(work_item_types.work_item_type_id, data.work_item_type_id))
          .limit(1);

        if (!workItemType) {
          throw new NotFoundError('Work item type', data.work_item_type_id);
        }
      },
    },
  };

  /**
   * Build custom filter conditions for type and visibility.
   */
  protected buildCustomConditions(options: WorkItemFieldQueryOptions): SQL[] {
    const conditions: SQL[] = [];

    if (options.work_item_type_id) {
      conditions.push(eq(work_item_fields.work_item_type_id, options.work_item_type_id));
    }

    if (options.is_visible !== undefined) {
      conditions.push(eq(work_item_fields.is_visible, options.is_visible));
    }

    return conditions;
  }

  /**
   * Transform database row to WorkItemField entity.
   * Handles JSON parsing and type casting.
   */
  private transformRowToField(row: Record<string, unknown>): WorkItemField {
    return {
      work_item_field_id: row.work_item_field_id as string,
      work_item_type_id: row.work_item_type_id as string,
      field_name: row.field_name as string,
      field_label: row.field_label as string,
      field_type: row.field_type as FieldType,
      field_description: (row.field_description as string | null) ?? null,
      field_options: (row.field_options as FieldOption[] | null) ?? null,
      field_config: (row.field_config as FieldConfig | null) ?? null,
      is_required_on_creation: (row.is_required_on_creation as boolean | null) ?? false,
      is_required_to_complete: (row.is_required_to_complete as boolean | null) ?? false,
      validation_rules: (row.validation_rules as ValidationRules | null) ?? null,
      default_value: (row.default_value as string | null) ?? null,
      display_order: (row.display_order as number | null) ?? 0,
      is_visible: (row.is_visible as boolean | null) ?? true,
      created_by: row.created_by as string,
      created_at: (row.created_at as Date | null) ?? new Date(),
      updated_at: (row.updated_at as Date | null) ?? new Date(),
      deleted_at: (row.deleted_at as Date | null) ?? null,
    };
  }

  // ===========================================================================
  // Legacy Methods - Maintained for backward compatibility
  // ===========================================================================

  /**
   * Get work item fields with automatic permission-based filtering (legacy method)
   * @deprecated Use getList() instead
   */
  async getWorkItemFields(options: WorkItemFieldQueryOptions = {}): Promise<WorkItemField[]> {
    const result = await this.getList(options);
    return result.items;
  }

  /**
   * Get a specific work item field by ID (legacy method)
   * @deprecated Use getById() instead
   */
  async getWorkItemFieldById(fieldId: string): Promise<WorkItemField | null> {
    return this.getById(fieldId);
  }

  /**
   * Create a new work item field (legacy method)
   * @deprecated Use create() instead
   */
  async createWorkItemField(fieldData: CreateWorkItemFieldData): Promise<WorkItemField> {
    return this.create(fieldData);
  }

  /**
   * Update a work item field (legacy method)
   * @deprecated Use update() instead
   */
  async updateWorkItemField(
    fieldId: string,
    updateData: UpdateWorkItemFieldData
  ): Promise<WorkItemField> {
    return this.update(fieldId, updateData);
  }

  /**
   * Delete a work item field (soft delete) (legacy method)
   * @deprecated Use delete() instead
   */
  async deleteWorkItemField(fieldId: string): Promise<void> {
    return this.delete(fieldId);
  }

  /**
   * Get count of work item fields (legacy method)
   * @deprecated Use getCount() instead
   */
  async getWorkItemFieldCount(workItemTypeId?: string): Promise<number> {
    const options: WorkItemFieldQueryOptions = {};
    if (workItemTypeId) {
      options.work_item_type_id = workItemTypeId;
    }
    return this.getCount(options);
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
