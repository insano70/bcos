import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { announcement_reads, announcement_recipients, announcements } from '@/lib/db/schema';
import { log } from '@/lib/logger';
import { BaseRBACService } from '@/lib/rbac/base-service';
import type { UserContext } from '@/lib/types/rbac';

export interface UnreadAnnouncement {
  announcement_id: string;
  subject: string;
  body: string;
  priority: string;
  created_at: Date;
}

export interface ReadAnnouncement extends UnreadAnnouncement {
  read_at: Date;
}

/**
 * User-Facing Announcements Service
 * Handles fetching unread announcements and marking as read
 * Uses users:read:own permission (all authenticated users have this)
 */
export class UserAnnouncementsService extends BaseRBACService {
  /**
   * Get all unread announcements for the current user
   * Returns a list for display in modal
   */
  async getUnreadAnnouncements(): Promise<UnreadAnnouncement[]> {
    this.requirePermission('users:read:own');

    const userId = this.userContext.user_id;

    // Subquery to check if user has read the announcement
    const hasRead = db
      .select({ announcement_id: announcement_reads.announcement_id })
      .from(announcement_reads)
      .where(
        and(
          eq(announcement_reads.announcement_id, announcements.announcement_id),
          eq(announcement_reads.user_id, userId)
        )
      );

    // Subquery to check if user is a recipient (for targeted announcements)
    const isRecipient = db
      .select({ announcement_id: announcement_recipients.announcement_id })
      .from(announcement_recipients)
      .where(
        and(
          eq(announcement_recipients.announcement_id, announcements.announcement_id),
          eq(announcement_recipients.user_id, userId)
        )
      );

    const result = await db
      .select({
        announcement_id: announcements.announcement_id,
        subject: announcements.subject,
        body: announcements.body,
        priority: announcements.priority,
        created_at: announcements.created_at,
      })
      .from(announcements)
      .where(
        and(
          eq(announcements.is_active, true),
          isNull(announcements.deleted_at),
          // Published (null = immediate, or publish_at <= now)
          or(isNull(announcements.publish_at), sql`${announcements.publish_at} <= NOW()`),
          // Not expired (null = never, or expires_at > now)
          or(isNull(announcements.expires_at), sql`${announcements.expires_at} > NOW()`),
          // User is target (all users OR specific recipient)
          or(eq(announcements.target_type, 'all'), sql`EXISTS (${isRecipient})`),
          // User has not read it yet
          sql`NOT EXISTS (${hasRead})`
        )
      )
      .orderBy(
        // Priority order: urgent > high > normal > low
        sql`CASE ${announcements.priority}
          WHEN 'urgent' THEN 1
          WHEN 'high' THEN 2
          WHEN 'normal' THEN 3
          WHEN 'low' THEN 4
        END`,
        desc(announcements.created_at)
      );

    return result;
  }

  /**
   * Get count of unread announcements (for header badge)
   * Uses optimized COUNT query instead of fetching all data
   */
  async getUnreadCount(): Promise<number> {
    this.requirePermission('users:read:own');

    const userId = this.userContext.user_id;

    // Subquery to check if user has read the announcement
    const hasRead = db
      .select({ announcement_id: announcement_reads.announcement_id })
      .from(announcement_reads)
      .where(
        and(
          eq(announcement_reads.announcement_id, announcements.announcement_id),
          eq(announcement_reads.user_id, userId)
        )
      );

    // Subquery to check if user is a recipient (for targeted announcements)
    const isRecipient = db
      .select({ announcement_id: announcement_recipients.announcement_id })
      .from(announcement_recipients)
      .where(
        and(
          eq(announcement_recipients.announcement_id, announcements.announcement_id),
          eq(announcement_recipients.user_id, userId)
        )
      );

    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(announcements)
      .where(
        and(
          eq(announcements.is_active, true),
          isNull(announcements.deleted_at),
          // Published (null = immediate, or publish_at <= now)
          or(isNull(announcements.publish_at), sql`${announcements.publish_at} <= NOW()`),
          // Not expired (null = never, or expires_at > now)
          or(isNull(announcements.expires_at), sql`${announcements.expires_at} > NOW()`),
          // User is target (all users OR specific recipient)
          or(eq(announcements.target_type, 'all'), sql`EXISTS (${isRecipient})`),
          // User has not read it yet
          sql`NOT EXISTS (${hasRead})`
        )
      );

    return Number(result[0]?.count ?? 0);
  }

  /**
   * Get previously read announcements for the current user (history view)
   * Returns announcements with read_at timestamp, ordered by most recently read
   * Limited to 50 items for reasonable history
   */
  async getReadAnnouncements(): Promise<ReadAnnouncement[]> {
    this.requirePermission('users:read:own');

    const userId = this.userContext.user_id;

    // Subquery to check if user is a recipient (for targeted announcements)
    const isRecipient = db
      .select({ announcement_id: announcement_recipients.announcement_id })
      .from(announcement_recipients)
      .where(
        and(
          eq(announcement_recipients.announcement_id, announcements.announcement_id),
          eq(announcement_recipients.user_id, userId)
        )
      );

    const result = await db
      .select({
        announcement_id: announcements.announcement_id,
        subject: announcements.subject,
        body: announcements.body,
        priority: announcements.priority,
        created_at: announcements.created_at,
        read_at: announcement_reads.read_at,
      })
      .from(announcements)
      .innerJoin(
        announcement_reads,
        and(
          eq(announcement_reads.announcement_id, announcements.announcement_id),
          eq(announcement_reads.user_id, userId)
        )
      )
      .where(
        and(
          isNull(announcements.deleted_at),
          // User was a valid target (all users OR specific recipient)
          or(eq(announcements.target_type, 'all'), sql`EXISTS (${isRecipient})`)
        )
      )
      .orderBy(desc(announcement_reads.read_at))
      .limit(50);

    return result;
  }

  /**
   * Mark a single announcement as read
   */
  async markAsRead(announcementId: string): Promise<void> {
    this.requirePermission('users:read:own');

    const userId = this.userContext.user_id;

    // Use INSERT ... ON CONFLICT to handle duplicate reads gracefully
    await db
      .insert(announcement_reads)
      .values({
        announcement_id: announcementId,
        user_id: userId,
      })
      .onConflictDoNothing();

    log.info('announcement acknowledged', {
      operation: 'acknowledge_announcement',
      resourceType: 'announcement',
      resourceId: announcementId,
      userId,
      component: 'announcements',
    });
  }

  /**
   * Mark all unread announcements as read
   */
  async markAllAsRead(): Promise<number> {
    this.requirePermission('users:read:own');

    const userId = this.userContext.user_id;
    const unread = await this.getUnreadAnnouncements();

    if (unread.length === 0) {
      return 0;
    }

    // Bulk insert read records
    await db
      .insert(announcement_reads)
      .values(
        unread.map((a) => ({
          announcement_id: a.announcement_id,
          user_id: userId,
        }))
      )
      .onConflictDoNothing();

    log.info('all announcements acknowledged', {
      operation: 'acknowledge_all_announcements',
      userId,
      count: unread.length,
      component: 'announcements',
    });

    return unread.length;
  }
}

export function createUserAnnouncementsService(userContext: UserContext): UserAnnouncementsService {
  return new UserAnnouncementsService(userContext);
}
