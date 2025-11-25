/**
 * Work Items Query Builder
 * Provides reusable query patterns for work items operations
 */

import { aliasedTable, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  organizations,
  users,
  work_item_statuses,
  work_item_types,
  work_items,
} from '@/lib/db/schema';

/**
 * Aliased users table for creator (separate from assignee)
 * Required because work_items has two foreign keys to users table:
 * - assigned_to -> users (assignee)
 * - created_by -> users (creator)
 */
const creatorUsers = aliasedTable(users, 'creator_users');

/**
 * Raw database result from work items query
 * (Before mapping to WorkItemWithDetails)
 */
export interface WorkItemQueryResult {
  work_item_id: string;
  work_item_type_id: string;
  work_item_type_name: string | null;
  organization_id: string;
  organization_name: string | null;
  subject: string;
  description: string | null;
  status_id: string;
  status_name: string | null;
  status_category: string | null;
  priority: string;
  assigned_to: string | null;
  assigned_to_first_name: string | null;
  assigned_to_last_name: string | null;
  due_date: Date | null;
  started_at: Date | null;
  completed_at: Date | null;
  parent_work_item_id: string | null;
  root_work_item_id: string | null;
  depth: number;
  path: string | null;
  created_by: string;
  created_by_first_name: string | null;
  created_by_last_name: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Get the common SELECT fields for work items queries
 * This is used across getWorkItems, getWorkItemById, getWorkItemChildren, getWorkItemAncestors
 * Reduces duplication of 25+ field definitions
 *
 * Note: Uses two separate user table references:
 * - `users` for assigned_to (assignee)
 * - `creatorUsers` for created_by (creator)
 */
export function getWorkItemSelectFields() {
  return {
    work_item_id: work_items.work_item_id,
    work_item_type_id: work_items.work_item_type_id,
    work_item_type_name: work_item_types.name,
    organization_id: work_items.organization_id,
    organization_name: organizations.name,
    subject: work_items.subject,
    description: work_items.description,
    status_id: work_items.status_id,
    status_name: work_item_statuses.status_name,
    status_category: work_item_statuses.status_category,
    priority: work_items.priority,
    assigned_to: work_items.assigned_to,
    assigned_to_first_name: users.first_name,
    assigned_to_last_name: users.last_name,
    due_date: work_items.due_date,
    started_at: work_items.started_at,
    completed_at: work_items.completed_at,
    parent_work_item_id: work_items.parent_work_item_id,
    root_work_item_id: work_items.root_work_item_id,
    depth: work_items.depth,
    path: work_items.path,
    created_by: work_items.created_by,
    created_by_first_name: creatorUsers.first_name,
    created_by_last_name: creatorUsers.last_name,
    created_at: work_items.created_at,
    updated_at: work_items.updated_at,
  };
}

/**
 * Get the common query builder with all necessary joins
 * Returns a query builder that can be further filtered with .where()
 *
 * Joins:
 * - work_item_types: Get type name
 * - organizations: Get organization name
 * - work_item_statuses: Get status name and category
 * - users (as users): Get assignee name (assigned_to)
 * - users (as creatorUsers): Get creator name (created_by)
 */
export function getWorkItemQueryBuilder() {
  return db
    .select(getWorkItemSelectFields())
    .from(work_items)
    .leftJoin(work_item_types, eq(work_items.work_item_type_id, work_item_types.work_item_type_id))
    .leftJoin(organizations, eq(work_items.organization_id, organizations.organization_id))
    .leftJoin(work_item_statuses, eq(work_items.status_id, work_item_statuses.work_item_status_id))
    .leftJoin(users, eq(work_items.assigned_to, users.user_id))
    .leftJoin(creatorUsers, eq(work_items.created_by, creatorUsers.user_id));
}
