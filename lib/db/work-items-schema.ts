import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { organizations } from './rbac-schema';
import { users } from './schema';

/**
 * Work Item Types - Configurable work item types (global or per organization)
 * Examples: Task, Bug, Feature, Epic, Story, etc.
 * organization_id = null means global type available to all organizations
 * organization_id = <uuid> means organization-specific type
 */
export const work_item_types = pgTable(
  'work_item_types',
  {
    work_item_type_id: uuid('work_item_type_id').primaryKey().defaultRandom(),
    organization_id: uuid('organization_id').references(() => organizations.organization_id, {
      onDelete: 'cascade',
    }),
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
 * Phase 2: Added hierarchy fields (parent, root, depth, path)
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

    // Phase 2: Hierarchy fields
    parent_work_item_id: uuid('parent_work_item_id'),
    root_work_item_id: uuid('root_work_item_id'),
    depth: integer('depth').default(0).notNull(), // 0 for root, 1 for first level, etc.
    path: text('path'), // Materialized path: '/root_id/parent_id/this_id'

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

    // Phase 2: Hierarchy indexes
    parentIdx: index('idx_work_items_parent').on(table.parent_work_item_id),
    rootIdx: index('idx_work_items_root').on(table.root_work_item_id),
    depthIdx: index('idx_work_items_depth').on(table.depth),
    pathIdx: index('idx_work_items_path').on(table.path),
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
  // Phase 6: Type relationships
  parentTypeRelationships: many(work_item_type_relationships, {
    relationName: 'parentTypeRelationships',
  }),
  childTypeRelationships: many(work_item_type_relationships, {
    relationName: 'childTypeRelationships',
  }),
}));

export const workItemStatusesRelations = relations(work_item_statuses, ({ one, many }) => ({
  workItemType: one(work_item_types, {
    fields: [work_item_statuses.work_item_type_id],
    references: [work_item_types.work_item_type_id],
  }),
  workItems: many(work_items),
}));

export const workItemsRelations = relations(work_items, ({ one, many }) => ({
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

  // Phase 2: Hierarchy relations
  parent: one(work_items, {
    fields: [work_items.parent_work_item_id],
    references: [work_items.work_item_id],
    relationName: 'parentChild',
  }),
  children: many(work_items, {
    relationName: 'parentChild',
  }),
  root: one(work_items, {
    fields: [work_items.root_work_item_id],
    references: [work_items.work_item_id],
    relationName: 'rootDescendants',
  }),
  descendants: many(work_items, {
    relationName: 'rootDescendants',
  }),

  // Phase 2: Comments and attachments relations
  comments: many(work_item_comments),
  attachments: many(work_item_attachments),
  activities: many(work_item_activity),

  // Phase 7: Watchers relation
  watchers: many(work_item_watchers),
}));

/**
 * Work Item Comments - Discussion and collaboration on work items
 * Phase 2: Comments system
 */
export const work_item_comments = pgTable(
  'work_item_comments',
  {
    work_item_comment_id: uuid('work_item_comment_id').primaryKey().defaultRandom(),
    work_item_id: uuid('work_item_id')
      .notNull()
      .references(() => work_items.work_item_id, { onDelete: 'cascade' }),
    parent_comment_id: uuid('parent_comment_id'),
    comment_text: text('comment_text').notNull(),
    created_by: uuid('created_by')
      .notNull()
      .references(() => users.user_id),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    workItemIdx: index('idx_comments_work_item').on(table.work_item_id),
    parentIdx: index('idx_comments_parent').on(table.parent_comment_id),
    createdByIdx: index('idx_comments_created_by').on(table.created_by),
    createdAtIdx: index('idx_comments_created_at').on(table.created_at),
    deletedAtIdx: index('idx_comments_deleted_at').on(table.deleted_at),
  })
);

export const workItemCommentsRelations = relations(work_item_comments, ({ one, many }) => ({
  workItem: one(work_items, {
    fields: [work_item_comments.work_item_id],
    references: [work_items.work_item_id],
  }),
  creator: one(users, {
    fields: [work_item_comments.created_by],
    references: [users.user_id],
  }),
  parentComment: one(work_item_comments, {
    fields: [work_item_comments.parent_comment_id],
    references: [work_item_comments.work_item_comment_id],
    relationName: 'commentReplies',
  }),
  replies: many(work_item_comments, {
    relationName: 'commentReplies',
  }),
}));

/**
 * Work Item Activity - Audit log of all changes to work items
 * Phase 2: Activity tracking for compliance and history
 */
export const work_item_activity = pgTable(
  'work_item_activity',
  {
    work_item_activity_id: uuid('work_item_activity_id').primaryKey().defaultRandom(),
    work_item_id: uuid('work_item_id')
      .notNull()
      .references(() => work_items.work_item_id, { onDelete: 'cascade' }),
    activity_type: text('activity_type').notNull(), // 'created', 'updated', 'deleted', 'status_changed', 'assigned', 'commented', etc.
    field_name: text('field_name'), // Field that was changed (for update events)
    old_value: text('old_value'), // Previous value (JSON if complex)
    new_value: text('new_value'), // New value (JSON if complex)
    description: text('description'), // Human-readable description of the change
    created_by: uuid('created_by')
      .notNull()
      .references(() => users.user_id),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    workItemIdx: index('idx_activity_work_item').on(table.work_item_id),
    activityTypeIdx: index('idx_activity_type').on(table.activity_type),
    createdByIdx: index('idx_activity_created_by').on(table.created_by),
    createdAtIdx: index('idx_activity_created_at').on(table.created_at),
  })
);

export const workItemActivityRelations = relations(work_item_activity, ({ one }) => ({
  workItem: one(work_items, {
    fields: [work_item_activity.work_item_id],
    references: [work_items.work_item_id],
  }),
  creator: one(users, {
    fields: [work_item_activity.created_by],
    references: [users.user_id],
  }),
}));

/**
 * Work Item Attachments - File attachments on work items
 * Phase 2: File management (moved from Phase 5 per product decision)
 */
export const work_item_attachments = pgTable(
  'work_item_attachments',
  {
    work_item_attachment_id: uuid('work_item_attachment_id').primaryKey().defaultRandom(),
    work_item_id: uuid('work_item_id')
      .notNull()
      .references(() => work_items.work_item_id, { onDelete: 'cascade' }),
    file_name: text('file_name').notNull(),
    file_size: integer('file_size').notNull(), // Size in bytes
    file_type: text('file_type').notNull(), // MIME type
    s3_key: text('s3_key').notNull(), // S3 object key
    s3_bucket: text('s3_bucket').notNull(), // S3 bucket name
    uploaded_by: uuid('uploaded_by')
      .notNull()
      .references(() => users.user_id),
    uploaded_at: timestamp('uploaded_at', { withTimezone: true }).defaultNow().notNull(),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    workItemIdx: index('idx_attachments_work_item').on(table.work_item_id),
    uploadedByIdx: index('idx_attachments_uploaded_by').on(table.uploaded_by),
    uploadedAtIdx: index('idx_attachments_uploaded_at').on(table.uploaded_at),
    deletedAtIdx: index('idx_attachments_deleted_at').on(table.deleted_at),
  })
);

export const workItemAttachmentsRelations = relations(work_item_attachments, ({ one }) => ({
  workItem: one(work_items, {
    fields: [work_item_attachments.work_item_id],
    references: [work_items.work_item_id],
  }),
  uploader: one(users, {
    fields: [work_item_attachments.uploaded_by],
    references: [users.user_id],
  }),
}));

/**
 * Work Item Status Transitions - Define allowed status transitions per work item type
 * Phase 4: Multiple work item types with configurable workflows
 * Phase 7: Added validation_config and action_config for workflow automation
 */
export const work_item_status_transitions = pgTable(
  'work_item_status_transitions',
  {
    work_item_status_transition_id: uuid('work_item_status_transition_id')
      .primaryKey()
      .defaultRandom(),
    work_item_type_id: uuid('work_item_type_id')
      .notNull()
      .references(() => work_item_types.work_item_type_id, { onDelete: 'cascade' }),
    from_status_id: uuid('from_status_id')
      .notNull()
      .references(() => work_item_statuses.work_item_status_id, { onDelete: 'cascade' }),
    to_status_id: uuid('to_status_id')
      .notNull()
      .references(() => work_item_statuses.work_item_status_id, { onDelete: 'cascade' }),
    is_allowed: boolean('is_allowed').default(true).notNull(),
    validation_config: jsonb('validation_config'),
    action_config: jsonb('action_config'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    typeIdx: index('idx_transitions_type').on(table.work_item_type_id),
    fromStatusIdx: index('idx_transitions_from').on(table.from_status_id),
    toStatusIdx: index('idx_transitions_to').on(table.to_status_id),
    // Unique constraint: one transition rule per type + from_status + to_status combination
    uniqueTransitionIdx: index('idx_unique_transition').on(
      table.work_item_type_id,
      table.from_status_id,
      table.to_status_id
    ),
  })
);

export const workItemStatusTransitionsRelations = relations(
  work_item_status_transitions,
  ({ one }) => ({
    workItemType: one(work_item_types, {
      fields: [work_item_status_transitions.work_item_type_id],
      references: [work_item_types.work_item_type_id],
    }),
    fromStatus: one(work_item_statuses, {
      fields: [work_item_status_transitions.from_status_id],
      references: [work_item_statuses.work_item_status_id],
      relationName: 'transitionsFrom',
    }),
    toStatus: one(work_item_statuses, {
      fields: [work_item_status_transitions.to_status_id],
      references: [work_item_statuses.work_item_status_id],
      relationName: 'transitionsTo',
    }),
  })
);

/**
 * Work Item Type Relationships - Define parent-child type relationships
 * Phase 6: Type relationships with auto-creation and field inheritance
 *
 * Features:
 * - Define which child types can be added to which parent types
 * - Set min/max counts for child items (e.g., "Patient must have 1-3 visits")
 * - Auto-create child items when parent is created
 * - Template interpolation for subject and field values
 * - Field inheritance from parent to child
 *
 * Example auto_create_config:
 * {
 *   "subject_template": "Patient Record for {parent.patient_name}",
 *   "field_values": {
 *     "patient_id": "{parent.patient_id}",
 *     "facility": "{parent.facility}"
 *   },
 *   "inherit_fields": ["patient_name", "due_date", "assigned_to"]
 * }
 */
export const work_item_type_relationships = pgTable(
  'work_item_type_relationships',
  {
    work_item_type_relationship_id: uuid('work_item_type_relationship_id')
      .primaryKey()
      .defaultRandom(),
    parent_type_id: uuid('parent_type_id')
      .notNull()
      .references(() => work_item_types.work_item_type_id, { onDelete: 'cascade' }),
    child_type_id: uuid('child_type_id')
      .notNull()
      .references(() => work_item_types.work_item_type_id, { onDelete: 'cascade' }),
    relationship_name: text('relationship_name').notNull(),
    is_required: boolean('is_required').default(false).notNull(),
    min_count: integer('min_count'),
    max_count: integer('max_count'),
    auto_create: boolean('auto_create').default(false).notNull(),
    auto_create_config: jsonb('auto_create_config').$type<{
      subject_template?: string | undefined;
      field_values?: Record<string, string> | undefined;
      inherit_fields?: string[] | undefined;
    }>(),
    display_order: integer('display_order').default(0).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    parentTypeIdx: index('idx_type_relationships_parent').on(table.parent_type_id),
    childTypeIdx: index('idx_type_relationships_child').on(table.child_type_id),
    deletedAtIdx: index('idx_type_relationships_deleted_at').on(table.deleted_at),
    // Unique constraint: one relationship per parent_type + child_type combination (when not deleted)
    uniqueRelationshipIdx: index('idx_unique_type_relationship').on(
      table.parent_type_id,
      table.child_type_id,
      table.deleted_at
    ),
  })
);

export const workItemTypeRelationshipsRelations = relations(
  work_item_type_relationships,
  ({ one }) => ({
    parentType: one(work_item_types, {
      fields: [work_item_type_relationships.parent_type_id],
      references: [work_item_types.work_item_type_id],
      relationName: 'parentTypeRelationships',
    }),
    childType: one(work_item_types, {
      fields: [work_item_type_relationships.child_type_id],
      references: [work_item_types.work_item_type_id],
      relationName: 'childTypeRelationships',
    }),
  })
);

/**
 * Work Item Watchers - Users subscribed to notifications for specific work items
 * Phase 7: Advanced Workflows & Automation
 *
 * Watch types:
 * - manual: User explicitly watched the work item
 * - auto_creator: Automatically added when user creates the work item
 * - auto_assignee: Automatically added when work item is assigned to user
 * - auto_commenter: Automatically added when user comments on the work item
 *
 * Notification preferences allow users to control which events trigger notifications
 */
export const work_item_watchers = pgTable(
  'work_item_watchers',
  {
    work_item_watcher_id: uuid('work_item_watcher_id').primaryKey().defaultRandom(),
    work_item_id: uuid('work_item_id')
      .notNull()
      .references(() => work_items.work_item_id, { onDelete: 'cascade' }),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.user_id, { onDelete: 'cascade' }),
    watch_type: text('watch_type').default('manual').notNull(), // 'manual', 'auto_creator', 'auto_assignee', 'auto_commenter'
    notify_status_changes: boolean('notify_status_changes').default(true).notNull(),
    notify_comments: boolean('notify_comments').default(true).notNull(),
    notify_assignments: boolean('notify_assignments').default(true).notNull(),
    notify_due_date: boolean('notify_due_date').default(true).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    workItemIdx: index('idx_watchers_work_item').on(table.work_item_id),
    userIdx: index('idx_watchers_user').on(table.user_id),
    watchTypeIdx: index('idx_watchers_type').on(table.watch_type),
    // Unique constraint: one watcher entry per work_item + user combination
    uniqueWatcherIdx: index('idx_unique_watcher').on(table.work_item_id, table.user_id),
  })
);

export const workItemWatchersRelations = relations(work_item_watchers, ({ one }) => ({
  workItem: one(work_items, {
    fields: [work_item_watchers.work_item_id],
    references: [work_items.work_item_id],
  }),
  user: one(users, {
    fields: [work_item_watchers.user_id],
    references: [users.user_id],
  }),
}));
