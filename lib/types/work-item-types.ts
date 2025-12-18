/**
 * Work Item Types Type Definitions
 * Shared across work item types services and hooks
 */

import type { BaseQueryOptions } from '@/lib/services/crud';

/**
 * Query options for fetching work item types
 * Extends BaseQueryOptions for compatibility with BaseCrudService
 */
export interface WorkItemTypeQueryOptions extends BaseQueryOptions {
  organization_id?: string | undefined;
  is_active?: boolean | undefined;
}

/**
 * Work item type with all details including organization and creator info
 */
export interface WorkItemTypeWithDetails {
  work_item_type_id: string;
  organization_id: string | null;
  organization_name: string | null;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  is_active: boolean;
  created_by: string | null;
  created_by_name: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Data required to create a new work item type
 */
export interface CreateWorkItemTypeData {
  organization_id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  is_active?: boolean;
}

/**
 * Data for updating an existing work item type
 */
export interface UpdateWorkItemTypeData {
  name?: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  is_active?: boolean;
}









