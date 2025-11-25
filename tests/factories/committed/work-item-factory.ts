/**
 * Committed Work Item Factory
 *
 * Creates work items and related entities in committed transactions.
 * Supports creating work item types, statuses, and work items for testing.
 *
 * This factory:
 * - Creates work item types with initial statuses
 * - Creates work items with proper relationships
 * - Tracks all created entities for automatic cleanup
 * - Handles dependencies (org, user, type, status)
 */

import type { InferSelectModel } from 'drizzle-orm';
import { inArray } from 'drizzle-orm';
import {
  work_item_statuses,
  work_item_types,
  work_items,
} from '@/lib/db/schema';
import {
  BaseFactory,
  type BaseFactoryOptions,
  defaultCleanupTracker,
  defaultIDGenerator,
} from '../base';

/**
 * Work item data type from database schema
 */
export type CommittedWorkItem = InferSelectModel<typeof work_items>;
export type CommittedWorkItemType = InferSelectModel<typeof work_item_types>;
export type CommittedWorkItemStatus = InferSelectModel<typeof work_item_statuses>;

/**
 * Options for creating a test work item type
 */
export interface CreateWorkItemTypeOptions extends BaseFactoryOptions {
  /**
   * Organization ID for the type (null = global)
   */
  organizationId?: string | null;

  /**
   * Name of the type
   */
  name?: string;

  /**
   * Description of the type
   */
  description?: string;

  /**
   * Icon for the type
   */
  icon?: string;

  /**
   * Color for the type
   */
  color?: string;

  /**
   * Whether the type is active
   */
  isActive?: boolean;

  /**
   * User ID who created the type
   */
  createdBy?: string;
}

/**
 * Options for creating a test work item status
 */
export interface CreateWorkItemStatusOptions extends BaseFactoryOptions {
  /**
   * Work item type ID this status belongs to
   */
  workItemTypeId: string;

  /**
   * Name of the status
   */
  statusName?: string;

  /**
   * Category of the status
   */
  statusCategory?: 'backlog' | 'in_progress' | 'completed' | 'cancelled';

  /**
   * Whether this is the initial status
   */
  isInitial?: boolean;

  /**
   * Whether this is a final status
   */
  isFinal?: boolean;

  /**
   * Display order
   */
  displayOrder?: number;

  /**
   * Color for the status
   */
  color?: string;
}

/**
 * Options for creating a test work item
 */
export interface CreateWorkItemOptions extends BaseFactoryOptions {
  /**
   * Work item type ID
   */
  workItemTypeId: string;

  /**
   * Organization ID
   */
  organizationId: string;

  /**
   * Subject/title of the work item
   */
  subject?: string;

  /**
   * Description of the work item
   */
  description?: string;

  /**
   * Status ID (required - get from createCommittedWorkItemType's initialStatus)
   */
  statusId: string;

  /**
   * Priority level
   */
  priority?: 'critical' | 'high' | 'medium' | 'low';

  /**
   * User ID who is assigned
   */
  assignedTo?: string;

  /**
   * Due date
   */
  dueDate?: Date;

  /**
   * Parent work item ID (for hierarchy)
   */
  parentWorkItemId?: string;

  /**
   * User ID who created the work item
   */
  createdBy: string;
}

/**
 * Work Item Type Factory
 */
export class CommittedWorkItemTypeFactory extends BaseFactory<
  CommittedWorkItemType,
  CreateWorkItemTypeOptions
> {
  protected readonly entityType = 'work_item_type' as const;

  protected async createInDatabase(
    options: CreateWorkItemTypeOptions
  ): Promise<CommittedWorkItemType> {
    const name = options.name || this.generateTestName('type');

    const typeData = {
      organization_id: options.organizationId ?? null,
      name,
      description: options.description ?? `Test work item type: ${name}`,
      icon: options.icon ?? null,
      color: options.color ?? '#3B82F6',
      is_active: options.isActive ?? true,
      created_by: options.createdBy ?? null,
    };

    const [workItemType] = await this.db
      .insert(work_item_types)
      .values(typeData)
      .returning();

    if (!workItemType) {
      throw new Error('Failed to create test work item type');
    }

    return workItemType;
  }

  protected async cleanupFromDatabase(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.db
      .delete(work_item_types)
      .where(inArray(work_item_types.work_item_type_id, ids));
  }
}

/**
 * Work Item Status Factory
 */
export class CommittedWorkItemStatusFactory extends BaseFactory<
  CommittedWorkItemStatus,
  CreateWorkItemStatusOptions
> {
  protected readonly entityType = 'work_item_status' as const;

  protected async createInDatabase(
    options: CreateWorkItemStatusOptions
  ): Promise<CommittedWorkItemStatus> {
    const statusName = options.statusName || this.generateTestName('status');

    const statusData = {
      work_item_type_id: options.workItemTypeId,
      status_name: statusName,
      status_category: options.statusCategory ?? 'backlog',
      is_initial: options.isInitial ?? false,
      is_final: options.isFinal ?? false,
      color: options.color ?? '#6B7280',
      display_order: options.displayOrder ?? 0,
    };

    const [status] = await this.db
      .insert(work_item_statuses)
      .values(statusData)
      .returning();

    if (!status) {
      throw new Error('Failed to create test work item status');
    }

    return status;
  }

  protected async cleanupFromDatabase(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.db
      .delete(work_item_statuses)
      .where(inArray(work_item_statuses.work_item_status_id, ids));
  }
}

/**
 * Work Item Factory
 */
export class CommittedWorkItemFactory extends BaseFactory<
  CommittedWorkItem,
  CreateWorkItemOptions
> {
  protected readonly entityType = 'work_item' as const;

  protected async createInDatabase(options: CreateWorkItemOptions): Promise<CommittedWorkItem> {
    const subject = options.subject || this.generateTestName('item');

    const workItemData = {
      work_item_type_id: options.workItemTypeId,
      organization_id: options.organizationId,
      subject,
      description: options.description ?? null,
      status_id: options.statusId,
      priority: options.priority ?? 'medium',
      assigned_to: options.assignedTo ?? null,
      due_date: options.dueDate ?? null,
      parent_work_item_id: options.parentWorkItemId ?? null,
      root_work_item_id: null,
      depth: options.parentWorkItemId ? 1 : 0,
      path: null,
      created_by: options.createdBy,
    };

    const [workItem] = await this.db.insert(work_items).values(workItemData).returning();

    if (!workItem) {
      throw new Error('Failed to create test work item');
    }

    // Update path and root_work_item_id
    const path = options.parentWorkItemId
      ? `/${options.parentWorkItemId}/${workItem.work_item_id}`
      : `/${workItem.work_item_id}`;
    const rootWorkItemId = options.parentWorkItemId ?? workItem.work_item_id;

    const [updatedWorkItem] = await this.db
      .update(work_items)
      .set({ path, root_work_item_id: rootWorkItemId })
      .where(inArray(work_items.work_item_id, [workItem.work_item_id]))
      .returning();

    return updatedWorkItem ?? workItem;
  }

  protected async cleanupFromDatabase(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.db.delete(work_items).where(inArray(work_items.work_item_id, ids));
  }
}

/**
 * Create singleton instances
 */
export const committedWorkItemTypeFactory = new CommittedWorkItemTypeFactory(
  defaultIDGenerator,
  defaultCleanupTracker
);

export const committedWorkItemStatusFactory = new CommittedWorkItemStatusFactory(
  defaultIDGenerator,
  defaultCleanupTracker
);

export const committedWorkItemFactory = new CommittedWorkItemFactory(
  defaultIDGenerator,
  defaultCleanupTracker
);

/**
 * Convenience function to create a work item type with initial status
 */
export async function createCommittedWorkItemType(
  options: CreateWorkItemTypeOptions = {}
): Promise<{ type: CommittedWorkItemType; initialStatus: CommittedWorkItemStatus }> {
  const typeResult = await committedWorkItemTypeFactory.create(options);

  // Build status options, only including scope if defined
  const statusOptions: CreateWorkItemStatusOptions = {
    workItemTypeId: typeResult.data.work_item_type_id,
    statusName: 'To Do',
    statusCategory: 'backlog',
    isInitial: true,
  };

  // Only add scope if it's defined (exactOptionalPropertyTypes compatibility)
  if (options.scope !== undefined) {
    statusOptions.scope = options.scope;
  }

  // Create initial status for the type
  const statusResult = await committedWorkItemStatusFactory.create(statusOptions);

  return {
    type: typeResult.data,
    initialStatus: statusResult.data,
  };
}

/**
 * Convenience function to create a work item
 */
export async function createCommittedWorkItem(
  options: CreateWorkItemOptions
): Promise<CommittedWorkItem> {
  const result = await committedWorkItemFactory.create(options);
  return result.data;
}

/**
 * Convenience function to create multiple work items
 */
export async function createCommittedWorkItems(
  count: number,
  options: CreateWorkItemOptions
): Promise<CommittedWorkItem[]> {
  const results = await committedWorkItemFactory.createMany(count, options);
  return results.map((r) => r.data);
}

/**
 * Cleanup work items (cleans types and statuses too via cascade)
 */
export async function cleanupCommittedWorkItems(scope?: string): Promise<number> {
  // Clean work items first (they depend on statuses)
  const workItemCount = await committedWorkItemFactory.cleanup(scope);
  // Clean statuses (they depend on types)
  const statusCount = await committedWorkItemStatusFactory.cleanup(scope);
  // Clean types last
  const typeCount = await committedWorkItemTypeFactory.cleanup(scope);

  return workItemCount + statusCount + typeCount;
}

