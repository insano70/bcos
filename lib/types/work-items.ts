/**
 * Work Items Type Definitions
 * Shared across work items services
 *
 * Note: Field-related types (FieldConfig, FieldOption, ValidationRules, etc.)
 * are defined in lib/types/work-item-fields.ts
 */

export interface CreateWorkItemData {
  work_item_type_id: string;
  organization_id: string;
  subject: string;
  description?: string | null | undefined;
  priority?: string | undefined;
  assigned_to?: string | null | undefined;
  due_date?: Date | null | undefined;
  parent_work_item_id?: string | null | undefined;
}

export interface UpdateWorkItemData {
  subject?: string | undefined;
  description?: string | null | undefined;
  status_id?: string | undefined;
  priority?: string | undefined;
  assigned_to?: string | null | undefined;
  due_date?: Date | null | undefined;
  started_at?: Date | null | undefined;
  completed_at?: Date | null | undefined;
}

export interface WorkItemQueryOptions {
  work_item_type_id?: string | undefined;
  organization_id?: string | undefined;
  status_id?: string | undefined;
  status_category?: string | undefined;
  priority?: string | undefined;
  assigned_to?: string | undefined;
  created_by?: string | undefined;
  search?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
  sortBy?: string | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
  show_hierarchy?: 'root_only' | 'all' | undefined;
}

export interface WorkItemWithDetails {
  work_item_id: string;
  work_item_type_id: string;
  work_item_type_name: string;
  organization_id: string;
  organization_name: string;
  subject: string;
  description: string | null;
  status_id: string;
  status_name: string;
  status_category: string;
  priority: string;
  assigned_to: string | null;
  assigned_to_name: string | null;
  due_date: Date | null;
  started_at: Date | null;
  completed_at: Date | null;
  parent_work_item_id: string | null;
  root_work_item_id: string | null;
  depth: number;
  path: string | null;
  created_by: string;
  created_by_name: string;
  created_at: Date;
  updated_at: Date;
  custom_fields?: Record<string, unknown> | undefined;
  // Allow additional fields for template interpolation compatibility
  [key: string]: string | number | Date | boolean | Record<string, unknown> | null | undefined;
}
