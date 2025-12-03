/**
 * Work Item Statuses Type Definitions
 * Shared across work item statuses services and hooks
 */

/**
 * Status categories for work item workflow states
 */
export type StatusCategory = 'new' | 'in_progress' | 'done' | 'cancelled';

/**
 * Work item status with all details
 */
export interface WorkItemStatusWithDetails {
  work_item_status_id: string;
  work_item_type_id: string;
  status_name: string;
  status_category: string;
  is_initial: boolean;
  is_final: boolean;
  color: string | null;
  display_order: number;
  created_at: Date;
  updated_at: Date;
}

/**
 * Query options for fetching work item statuses
 */
export interface WorkItemStatusQueryOptions {
  work_item_type_id: string;
  limit?: number | undefined;
  offset?: number | undefined;
}

/**
 * Data required to create a new work item status
 */
export interface CreateWorkItemStatusData {
  work_item_type_id: string;
  status_name: string;
  status_category: StatusCategory;
  is_initial?: boolean;
  is_final?: boolean;
  color?: string;
  display_order?: number;
}

/**
 * Data for updating an existing work item status
 */
export interface UpdateWorkItemStatusData {
  status_name?: string;
  status_category?: StatusCategory;
  is_initial?: boolean;
  is_final?: boolean;
  color?: string | null;
  display_order?: number;
}


