import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { organizations } from './rbac-schema';
import { users } from './schema';

/**
 * Work Item Types - Configurable work item types per organization
 * Examples: Task, Bug, Feature, Epic, Story, etc.
 */
export const work_item_types = pgTable(
  'work_item_types',
  {
    work_item_type_id: uuid('work_item_type_id').primaryKey().defaultRandom(),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.organization_id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    icon: text('icon'),
    color: text('color'),
    is_active: boolean('is_active').default(true).notNull(),
    created_by: uuid('created_by').references(() => users.user_id),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    organizationIdx: index('idx_work_item_types_org').on(table.organization_id),
    activeIdx: index('idx_work_item_types_active').on(table.is_active),
    deletedAtIdx: index('idx_work_item_types_deleted_at').on(table.deleted_at),
  })
);

/**
 * Work Item Statuses - Configurable statuses per work item type
 * Examples: To Do, In Progress, Done, Blocked, etc.
 */
export const work_item_statuses = pgTable(
  'work_item_statuses',
  {
    work_item_status_id: uuid('work_item_status_id').primaryKey().defaultRandom(),
    work_item_type_id: uuid('work_item_type_id')
      .notNull()
      .references(() => work_item_types.work_item_type_id, { onDelete: 'cascade' }),
    status_name: text('status_name').notNull(),
    status_category: text('status_category').notNull(), // 'todo', 'in_progress', 'completed'
    is_initial: boolean('is_initial').default(false).notNull(),
    is_final: boolean('is_final').default(false).notNull(),
    color: text('color'),
    display_order: integer('display_order').default(0).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    typeIdx: index('idx_statuses_type').on(table.work_item_type_id),
    categoryIdx: index('idx_statuses_category').on(table.status_category),
  })
);

/**
 * Work Items - Main work item records
 * Phase 1: Core fields only (no hierarchy, comments, or custom fields yet)
 */
export const work_items = pgTable(
  'work_items',
  {
    work_item_id: uuid('work_item_id').primaryKey().defaultRandom(),
    work_item_type_id: uuid('work_item_type_id')
      .notNull()
      .references(() => work_item_types.work_item_type_id),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.organization_id, { onDelete: 'cascade' }),
    subject: text('subject').notNull(),
    description: text('description'),
    status_id: uuid('status_id')
      .notNull()
      .references(() => work_item_statuses.work_item_status_id),
    priority: text('priority').default('medium').notNull(), // 'critical', 'high', 'medium', 'low'
    assigned_to: uuid('assigned_to').references(() => users.user_id),
    due_date: timestamp('due_date', { withTimezone: true }),
    started_at: timestamp('started_at', { withTimezone: true }),
    completed_at: timestamp('completed_at', { withTimezone: true }),
    created_by: uuid('created_by')
      .notNull()
      .references(() => users.user_id),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    typeIdx: index('idx_work_items_type').on(table.work_item_type_id),
    orgIdx: index('idx_work_items_org').on(table.organization_id),
    statusIdx: index('idx_work_items_status').on(table.status_id),
    assignedIdx: index('idx_work_items_assigned').on(table.assigned_to),
    priorityIdx: index('idx_work_items_priority').on(table.priority),
    dueDateIdx: index('idx_work_items_due_date').on(table.due_date),
    createdAtIdx: index('idx_work_items_created_at').on(table.created_at),
    createdByIdx: index('idx_work_items_created_by').on(table.created_by),
    deletedAtIdx: index('idx_work_items_deleted_at').on(table.deleted_at),
  })
);

/**
 * Drizzle Relations
 */
export const workItemTypesRelations = relations(work_item_types, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [work_item_types.organization_id],
    references: [organizations.organization_id],
  }),
  creator: one(users, {
    fields: [work_item_types.created_by],
    references: [users.user_id],
  }),
  workItems: many(work_items),
  statuses: many(work_item_statuses),
}));

export const workItemStatusesRelations = relations(work_item_statuses, ({ one, many }) => ({
  workItemType: one(work_item_types, {
    fields: [work_item_statuses.work_item_type_id],
    references: [work_item_types.work_item_type_id],
  }),
  workItems: many(work_items),
}));

export const workItemsRelations = relations(work_items, ({ one }) => ({
  workItemType: one(work_item_types, {
    fields: [work_items.work_item_type_id],
    references: [work_item_types.work_item_type_id],
  }),
  organization: one(organizations, {
    fields: [work_items.organization_id],
    references: [organizations.organization_id],
  }),
  status: one(work_item_statuses, {
    fields: [work_items.status_id],
    references: [work_item_statuses.work_item_status_id],
  }),
  assignedToUser: one(users, {
    fields: [work_items.assigned_to],
    references: [users.user_id],
    relationName: 'assignedWorkItems',
  }),
  creator: one(users, {
    fields: [work_items.created_by],
    references: [users.user_id],
    relationName: 'createdWorkItems',
  }),
}));
