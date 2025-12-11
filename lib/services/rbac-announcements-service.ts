import type { InferSelectModel, SQL } from 'drizzle-orm';
import { eq, getTableColumns, isNull, like, or, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  announcement_reads,
  announcement_recipients,
  announcements,
  users,
} from '@/lib/db/schema';
import { log } from '@/lib/logger';
import {
  BaseCrudService,
  type BaseQueryOptions,
  type CrudServiceConfig,
  type JoinQueryConfig,
} from '@/lib/services/crud';
import type { UserContext } from '@/lib/types/rbac';

// Entity types
export type Announcement = InferSelectModel<typeof announcements>;

export interface AnnouncementWithDetails extends Announcement {
  created_by_name?: string;
  recipient_count?: number;
  read_count?: number;
}

export interface CreateAnnouncementData {
  subject: string;
  body: string;
  target_type: 'all' | 'specific';
  recipient_user_ids?: string[] | undefined;
  publish_at?: Date | null | undefined;
  expires_at?: Date | null | undefined;
  priority?: 'low' | 'normal' | 'high' | 'urgent' | undefined;
}

export interface UpdateAnnouncementData {
  subject?: string | undefined;
  body?: string | undefined;
  target_type?: 'all' | 'specific' | undefined;
  recipient_user_ids?: string[] | undefined;
  publish_at?: Date | null | undefined;
  expires_at?: Date | null | undefined;
  priority?: 'low' | 'normal' | 'high' | 'urgent' | undefined;
  is_active?: boolean | undefined;
}

export interface AnnouncementQueryOptions extends BaseQueryOptions {
  target_type?: 'all' | 'specific' | undefined;
  is_active?: boolean | undefined;
  include_expired?: boolean | undefined;
}

/**
 * Admin CRUD Service for Announcements
 * Uses settings:update:all permission for all operations (admin only)
 */
export class RBACAnnouncementsService extends BaseCrudService<
  typeof announcements,
  AnnouncementWithDetails,
  CreateAnnouncementData,
  UpdateAnnouncementData,
  AnnouncementQueryOptions
> {
  protected config: CrudServiceConfig<
    typeof announcements,
    AnnouncementWithDetails,
    CreateAnnouncementData,
    UpdateAnnouncementData,
    AnnouncementQueryOptions
  > = {
    table: announcements,
    resourceName: 'announcements',
    displayName: 'announcement',
    primaryKeyName: 'announcement_id',
    deletedAtColumnName: 'deleted_at',
    updatedAtColumnName: 'updated_at',
    permissions: {
      read: 'settings:update:all',
      create: 'settings:update:all',
      update: 'settings:update:all',
      delete: 'settings:update:all',
    },
    // No organization scoping - announcements are global
    transformers: {
      toCreateValues: (data, ctx) => ({
        subject: data.subject,
        body: data.body,
        target_type: data.target_type,
        publish_at: data.publish_at ?? null,
        expires_at: data.expires_at ?? null,
        priority: data.priority ?? 'normal',
        created_by: ctx.user_id,
      }),
      toEntity: (row) =>
        ({
          ...row,
          created_by_name: row.created_by_name as string | undefined,
          recipient_count: Number(row.recipient_count) || 0,
          read_count: Number(row.read_count) || 0,
        }) as AnnouncementWithDetails,
    },
  };

  protected buildSearchConditions(search: string): SQL[] {
    return [
      like(announcements.subject, `%${search}%`),
      like(announcements.body, `%${search}%`),
    ];
  }

  /**
   * Build JOIN query to include creator name and counts
   */
  protected buildJoinQuery(): JoinQueryConfig {
    return {
      selectFields: {
        ...getTableColumns(announcements),
        created_by_name: sql<string>`CONCAT(${users.first_name}, ' ', ${users.last_name})`,
        recipient_count: sql<number>`(
          SELECT COUNT(*) FROM announcement_recipients ar
          WHERE ar.announcement_id = ${announcements.announcement_id}
        )`,
        read_count: sql<number>`(
          SELECT COUNT(*) FROM announcement_reads ar
          WHERE ar.announcement_id = ${announcements.announcement_id}
        )`,
      },
      joins: [
        {
          table: users,
          on: eq(announcements.created_by, users.user_id),
          type: 'left',
        },
      ],
    };
  }

  protected buildCustomConditions(options: AnnouncementQueryOptions): SQL[] {
    const conditions: SQL[] = [];

    if (options.target_type) {
      conditions.push(eq(announcements.target_type, options.target_type));
    }

    if (options.is_active !== undefined) {
      conditions.push(eq(announcements.is_active, options.is_active));
    }

    if (!options.include_expired) {
      const expiredCondition = or(
        isNull(announcements.expires_at),
        sql`${announcements.expires_at} > NOW()`
      );
      if (expiredCondition) {
        conditions.push(expiredCondition);
      }
    }

    return conditions;
  }

  /**
   * Create announcement with recipients (wraps base create)
   */
  async createAnnouncement(data: CreateAnnouncementData): Promise<AnnouncementWithDetails> {
    const announcement = await this.create(data);

    // Add recipients if target_type is 'specific'
    if (data.target_type === 'specific' && data.recipient_user_ids?.length) {
      await this.setRecipients(announcement.announcement_id, data.recipient_user_ids);
    }

    return announcement;
  }

  /**
   * Update announcement with recipients (wraps base update)
   */
  async updateAnnouncement(
    id: string,
    data: UpdateAnnouncementData
  ): Promise<AnnouncementWithDetails> {
    const announcement = await this.update(id, data);

    // Update recipients if provided
    if (data.recipient_user_ids !== undefined) {
      await this.setRecipients(id, data.recipient_user_ids);
    }

    return announcement;
  }

  /**
   * Set recipients for an announcement (replaces existing)
   * Note: Also called from createAnnouncement/updateAnnouncement which already check permissions,
   * but we include an explicit check here for defense-in-depth.
   */
  async setRecipients(announcementId: string, userIds: string[]): Promise<void> {
    this.requirePermission('settings:update:all');

    // Delete existing recipients
    await db
      .delete(announcement_recipients)
      .where(eq(announcement_recipients.announcement_id, announcementId));

    // Insert new recipients
    if (userIds.length > 0) {
      await db.insert(announcement_recipients).values(
        userIds.map((userId) => ({
          announcement_id: announcementId,
          user_id: userId,
        }))
      );
    }
  }

  /**
   * Get recipients for an announcement
   */
  async getRecipients(
    announcementId: string
  ): Promise<{ user_id: string; email: string; name: string }[]> {
    const result = await db
      .select({
        user_id: users.user_id,
        email: users.email,
        name: sql<string>`CONCAT(${users.first_name}, ' ', ${users.last_name})`,
      })
      .from(announcement_recipients)
      .innerJoin(users, eq(announcement_recipients.user_id, users.user_id))
      .where(eq(announcement_recipients.announcement_id, announcementId));

    return result;
  }

  /**
   * Re-publish an announcement (clear read records so users see it again)
   */
  async republish(announcementId: string): Promise<void> {
    this.requirePermission('settings:update:all');

    await db.delete(announcement_reads).where(eq(announcement_reads.announcement_id, announcementId));

    // Log the re-publish action
    log.info('announcement republished', {
      operation: 'republish_announcement',
      resourceType: 'announcement',
      resourceId: announcementId,
      userId: this.userContext.user_id,
      component: 'announcements',
    });
  }
}

export function createRBACAnnouncementsService(userContext: UserContext): RBACAnnouncementsService {
  return new RBACAnnouncementsService(userContext);
}
