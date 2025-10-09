import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users, work_item_watchers, work_items } from '@/lib/db/schema';
import { BaseRBACService } from '@/lib/rbac/base-service';
import { PermissionDeniedError } from '@/lib/types/rbac';
import type { UserContext } from '@/lib/types/rbac';
import { log } from '@/lib/logger';
import type { WatchType } from '@/lib/validations/work-item-watchers';

/**
 * Work Item Watchers Service with RBAC
 * Phase 7: Manages watchers and notification preferences for work items
 */

export interface AddWatcherData {
  work_item_id: string;
  user_id: string;
  watch_type?: WatchType;
  notify_status_changes?: boolean;
  notify_comments?: boolean;
  notify_assignments?: boolean;
  notify_due_date?: boolean;
}

export interface UpdateWatcherPreferencesData {
  notify_status_changes?: boolean;
  notify_comments?: boolean;
  notify_assignments?: boolean;
  notify_due_date?: boolean;
}

export interface WatcherWithDetails {
  work_item_watcher_id: string;
  work_item_id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  watch_type: string;
  notify_status_changes: boolean;
  notify_comments: boolean;
  notify_assignments: boolean;
  notify_due_date: boolean;
  created_at: Date;
}

export class RBACWorkItemWatchersService extends BaseRBACService {
  /**
   * Get all watchers for a work item
   */
  async getWatchersForWorkItem(workItemId: string): Promise<WatcherWithDetails[]> {
    const startTime = Date.now();

    log.info('Get watchers for work item initiated', {
      workItemId,
      requestingUserId: this.userContext.user_id,
    });

    // Verify user has permission to read the work item
    const canReadWorkItem = await this.canReadWorkItem(workItemId);
    if (!canReadWorkItem) {
      throw new PermissionDeniedError('work-items:read:*', workItemId);
    }

    // Fetch watchers with user details
    const results = await db
      .select({
        work_item_watcher_id: work_item_watchers.work_item_watcher_id,
        work_item_id: work_item_watchers.work_item_id,
        user_id: work_item_watchers.user_id,
        user_first_name: users.first_name,
        user_last_name: users.last_name,
        user_email: users.email,
        watch_type: work_item_watchers.watch_type,
        notify_status_changes: work_item_watchers.notify_status_changes,
        notify_comments: work_item_watchers.notify_comments,
        notify_assignments: work_item_watchers.notify_assignments,
        notify_due_date: work_item_watchers.notify_due_date,
        created_at: work_item_watchers.created_at,
      })
      .from(work_item_watchers)
      .leftJoin(users, eq(work_item_watchers.user_id, users.user_id))
      .where(eq(work_item_watchers.work_item_id, workItemId))
      .orderBy(work_item_watchers.created_at);

    const duration = Date.now() - startTime;
    log.info('Get watchers completed', {
      workItemId,
      watcherCount: results.length,
      duration,
    });

    return results.map((result) => ({
      work_item_watcher_id: result.work_item_watcher_id,
      work_item_id: result.work_item_id,
      user_id: result.user_id,
      user_name:
        result.user_first_name && result.user_last_name
          ? `${result.user_first_name} ${result.user_last_name}`
          : '',
      user_email: result.user_email ?? '',
      watch_type: result.watch_type ?? 'manual',
      notify_status_changes: result.notify_status_changes ?? true,
      notify_comments: result.notify_comments ?? true,
      notify_assignments: result.notify_assignments ?? true,
      notify_due_date: result.notify_due_date ?? true,
      created_at: result.created_at ?? new Date(),
    }));
  }

  /**
   * Get all work items watched by a specific user
   */
  async getWatchedWorkItemsForUser(userId: string): Promise<string[]> {
    const startTime = Date.now();

    log.info('Get watched work items for user initiated', {
      userId,
      requestingUserId: this.userContext.user_id,
    });

    // Verify user is requesting their own watched items or has appropriate permissions
    if (userId !== this.userContext.user_id && !this.checker.hasPermission('work-items:read:all')) {
      throw new PermissionDeniedError('work-items:read:all', userId);
    }

    const results = await db
      .select({
        work_item_id: work_item_watchers.work_item_id,
      })
      .from(work_item_watchers)
      .where(eq(work_item_watchers.user_id, userId));

    const duration = Date.now() - startTime;
    log.info('Get watched work items completed', {
      userId,
      workItemCount: results.length,
      duration,
    });

    return results.map((r) => r.work_item_id);
  }

  /**
   * Add a watcher to a work item (manual watch)
   */
  async addWatcher(data: AddWatcherData): Promise<WatcherWithDetails> {
    const startTime = Date.now();

    log.info('Add watcher initiated', {
      workItemId: data.work_item_id,
      userId: data.user_id,
      watchType: data.watch_type || 'manual',
      requestingUserId: this.userContext.user_id,
    });

    // Verify user has permission to read the work item
    const canReadWorkItem = await this.canReadWorkItem(data.work_item_id);
    if (!canReadWorkItem) {
      throw new PermissionDeniedError('work-items:read:*', data.work_item_id);
    }

    // Check if watcher already exists
    const existingWatcher = await db
      .select()
      .from(work_item_watchers)
      .where(
        and(
          eq(work_item_watchers.work_item_id, data.work_item_id),
          eq(work_item_watchers.user_id, data.user_id)
        )
      )
      .limit(1);

    if (existingWatcher.length > 0) {
      log.info('Watcher already exists', {
        workItemId: data.work_item_id,
        userId: data.user_id,
      });
      const watcherId = existingWatcher[0]?.work_item_watcher_id;
      if (!watcherId) {
        throw new Error('Failed to retrieve existing watcher ID');
      }
      return this.getWatcherById(watcherId);
    }

    // Create new watcher
    const [newWatcher] = await db
      .insert(work_item_watchers)
      .values({
        work_item_id: data.work_item_id,
        user_id: data.user_id,
        watch_type: data.watch_type || 'manual',
        notify_status_changes: data.notify_status_changes ?? true,
        notify_comments: data.notify_comments ?? true,
        notify_assignments: data.notify_assignments ?? true,
        notify_due_date: data.notify_due_date ?? true,
      })
      .returning();

    if (!newWatcher) {
      throw new Error('Failed to create watcher');
    }

    const duration = Date.now() - startTime;
    log.info('Watcher added successfully', {
      watcherId: newWatcher.work_item_watcher_id,
      workItemId: data.work_item_id,
      userId: data.user_id,
      duration,
    });

    return this.getWatcherById(newWatcher.work_item_watcher_id);
  }

  /**
   * Auto-add a watcher (used by other services)
   * This is a helper method that silently adds watchers without permission checks
   * (permission checks happen at the action level - e.g., creating work item, commenting)
   */
  async autoAddWatcher(
    workItemId: string,
    userId: string,
    watchType: 'auto_creator' | 'auto_assignee' | 'auto_commenter'
  ): Promise<void> {
    const startTime = Date.now();

    log.info('Auto-add watcher initiated', {
      workItemId,
      userId,
      watchType,
      requestingUserId: this.userContext.user_id,
    });

    // Check if watcher already exists
    const existingWatcher = await db
      .select()
      .from(work_item_watchers)
      .where(
        and(eq(work_item_watchers.work_item_id, workItemId), eq(work_item_watchers.user_id, userId))
      )
      .limit(1);

    if (existingWatcher.length > 0) {
      log.info('Watcher already exists, skipping auto-add', {
        workItemId,
        userId,
      });
      return;
    }

    // Create new watcher
    await db.insert(work_item_watchers).values({
      work_item_id: workItemId,
      user_id: userId,
      watch_type: watchType,
      notify_status_changes: true,
      notify_comments: true,
      notify_assignments: true,
      notify_due_date: true,
    });

    const duration = Date.now() - startTime;
    log.info('Auto-watcher added successfully', {
      workItemId,
      userId,
      watchType,
      duration,
    });
  }

  /**
   * Remove a watcher from a work item
   */
  async removeWatcher(workItemId: string, userId: string): Promise<void> {
    const startTime = Date.now();

    log.info('Remove watcher initiated', {
      workItemId,
      userId,
      requestingUserId: this.userContext.user_id,
    });

    // Verify user has permission to read the work item
    const canReadWorkItem = await this.canReadWorkItem(workItemId);
    if (!canReadWorkItem) {
      throw new PermissionDeniedError('work-items:read:*', workItemId);
    }

    // Delete watcher
    await db
      .delete(work_item_watchers)
      .where(
        and(eq(work_item_watchers.work_item_id, workItemId), eq(work_item_watchers.user_id, userId))
      );

    const duration = Date.now() - startTime;
    log.info('Watcher removed successfully', {
      workItemId,
      userId,
      duration,
    });
  }

  /**
   * Update watcher notification preferences
   */
  async updateWatcherPreferences(
    watcherId: string,
    preferences: UpdateWatcherPreferencesData
  ): Promise<WatcherWithDetails> {
    const startTime = Date.now();

    log.info('Update watcher preferences initiated', {
      watcherId,
      requestingUserId: this.userContext.user_id,
    });

    // Get watcher to verify ownership
    const watcher = await this.getWatcherById(watcherId);

    // Only allow users to update their own preferences
    if (watcher.user_id !== this.userContext.user_id && !this.checker.hasPermission('work-items:manage:all')) {
      throw new PermissionDeniedError('work-items:manage:all', watcherId);
    }

    // Update preferences
    await db
      .update(work_item_watchers)
      .set({
        notify_status_changes: preferences.notify_status_changes,
        notify_comments: preferences.notify_comments,
        notify_assignments: preferences.notify_assignments,
        notify_due_date: preferences.notify_due_date,
      })
      .where(eq(work_item_watchers.work_item_watcher_id, watcherId));

    const duration = Date.now() - startTime;
    log.info('Watcher preferences updated successfully', {
      watcherId,
      duration,
    });

    return this.getWatcherById(watcherId);
  }

  /**
   * Get a specific watcher by ID
   */
  private async getWatcherById(watcherId: string): Promise<WatcherWithDetails> {
    const results = await db
      .select({
        work_item_watcher_id: work_item_watchers.work_item_watcher_id,
        work_item_id: work_item_watchers.work_item_id,
        user_id: work_item_watchers.user_id,
        user_first_name: users.first_name,
        user_last_name: users.last_name,
        user_email: users.email,
        watch_type: work_item_watchers.watch_type,
        notify_status_changes: work_item_watchers.notify_status_changes,
        notify_comments: work_item_watchers.notify_comments,
        notify_assignments: work_item_watchers.notify_assignments,
        notify_due_date: work_item_watchers.notify_due_date,
        created_at: work_item_watchers.created_at,
      })
      .from(work_item_watchers)
      .leftJoin(users, eq(work_item_watchers.user_id, users.user_id))
      .where(eq(work_item_watchers.work_item_watcher_id, watcherId))
      .limit(1);

    if (results.length === 0) {
      throw new Error('Watcher not found');
    }

    const result = results[0];
    if (!result) {
      throw new Error('Watcher not found');
    }

    return {
      work_item_watcher_id: result.work_item_watcher_id,
      work_item_id: result.work_item_id,
      user_id: result.user_id,
      user_name:
        result.user_first_name && result.user_last_name
          ? `${result.user_first_name} ${result.user_last_name}`
          : '',
      user_email: result.user_email ?? '',
      watch_type: result.watch_type ?? 'manual',
      notify_status_changes: result.notify_status_changes ?? true,
      notify_comments: result.notify_comments ?? true,
      notify_assignments: result.notify_assignments ?? true,
      notify_due_date: result.notify_due_date ?? true,
      created_at: result.created_at ?? new Date(),
    };
  }

  /**
   * Helper method to check if user can read a work item
   */
  private async canReadWorkItem(workItemId: string): Promise<boolean> {
    const canReadOwn = this.checker.hasPermission('work-items:read:own', workItemId);
    const canReadOrg = this.checker.hasPermission('work-items:read:organization');
    const canReadAll = this.checker.hasPermission('work-items:read:all');

    if (canReadAll) {
      return true;
    }

    if (canReadOwn || canReadOrg) {
      // Verify work item exists and user has access
      const workItem = await db
        .select({
          work_item_id: work_items.work_item_id,
          organization_id: work_items.organization_id,
          created_by: work_items.created_by,
        })
        .from(work_items)
        .where(eq(work_items.work_item_id, workItemId))
        .limit(1);

      if (workItem.length === 0 || !workItem[0]) {
        return false;
      }

      if (canReadOwn && workItem[0].created_by === this.userContext.user_id) {
        return true;
      }

      if (canReadOrg && this.canAccessOrganization(workItem[0].organization_id)) {
        return true;
      }
    }

    return false;
  }
}

/**
 * Factory function to create RBAC Work Item Watchers Service
 */
export function createRBACWorkItemWatchersService(
  userContext: UserContext
): RBACWorkItemWatchersService {
  return new RBACWorkItemWatchersService(userContext);
}
