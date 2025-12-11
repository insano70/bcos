import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './schema';

/**
 * Announcements Database Schema
 * System for delivering announcements to users with read tracking
 */

/**
 * Announcements table - stores announcement content and targeting
 */
export const announcements = pgTable(
  'announcements',
  {
    announcement_id: uuid('announcement_id').primaryKey().defaultRandom(),

    // Content
    subject: text('subject').notNull(),
    body: text('body').notNull(), // Markdown content

    // Targeting: 'all' = all users, 'specific' = only users in announcement_recipients
    target_type: text('target_type').notNull().default('all'),

    // Scheduling
    publish_at: timestamp('publish_at', { withTimezone: true }), // null = immediate
    expires_at: timestamp('expires_at', { withTimezone: true }), // null = never expires

    // Status
    is_active: boolean('is_active').default(true).notNull(),

    // Priority: 'low', 'normal', 'high', 'urgent'
    priority: text('priority').notNull().default('normal'),

    // Audit
    created_by: uuid('created_by')
      .references(() => users.user_id)
      .notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deleted_at: timestamp('deleted_at', { withTimezone: true }), // Soft delete
  },
  (table) => [
    index('idx_announcements_publish_at').on(table.publish_at),
    index('idx_announcements_target_type').on(table.target_type),
    index('idx_announcements_is_active').on(table.is_active),
    index('idx_announcements_created_at').on(table.created_at),
    index('idx_announcements_deleted_at').on(table.deleted_at),
  ]
);

/**
 * Announcement recipients - for targeted announcements
 * Only populated when target_type = 'specific'
 */
export const announcement_recipients = pgTable(
  'announcement_recipients',
  {
    announcement_recipient_id: uuid('announcement_recipient_id').primaryKey().defaultRandom(),
    announcement_id: uuid('announcement_id')
      .references(() => announcements.announcement_id, { onDelete: 'cascade' })
      .notNull(),
    user_id: uuid('user_id')
      .references(() => users.user_id, { onDelete: 'cascade' })
      .notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_announcement_recipients_announcement').on(table.announcement_id),
    index('idx_announcement_recipients_user').on(table.user_id),
    unique('uq_announcement_recipients').on(table.announcement_id, table.user_id),
  ]
);

/**
 * Announcement reads - tracks which users have acknowledged which announcements
 */
export const announcement_reads = pgTable(
  'announcement_reads',
  {
    announcement_read_id: uuid('announcement_read_id').primaryKey().defaultRandom(),
    announcement_id: uuid('announcement_id')
      .references(() => announcements.announcement_id, { onDelete: 'cascade' })
      .notNull(),
    user_id: uuid('user_id')
      .references(() => users.user_id, { onDelete: 'cascade' })
      .notNull(),
    read_at: timestamp('read_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_announcement_reads_announcement').on(table.announcement_id),
    index('idx_announcement_reads_user').on(table.user_id),
    unique('uq_announcement_reads').on(table.announcement_id, table.user_id),
  ]
);

// Relations
export const announcementsRelations = relations(announcements, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [announcements.created_by],
    references: [users.user_id],
  }),
  recipients: many(announcement_recipients),
  reads: many(announcement_reads),
}));

export const announcementRecipientsRelations = relations(announcement_recipients, ({ one }) => ({
  announcement: one(announcements, {
    fields: [announcement_recipients.announcement_id],
    references: [announcements.announcement_id],
  }),
  user: one(users, {
    fields: [announcement_recipients.user_id],
    references: [users.user_id],
  }),
}));

export const announcementReadsRelations = relations(announcement_reads, ({ one }) => ({
  announcement: one(announcements, {
    fields: [announcement_reads.announcement_id],
    references: [announcements.announcement_id],
  }),
  user: one(users, {
    fields: [announcement_reads.user_id],
    references: [users.user_id],
  }),
}));
