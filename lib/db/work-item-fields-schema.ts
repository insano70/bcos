import { relations } from 'drizzle-orm';
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { work_item_types, work_items, users } from './schema';

/**
 * Work Item Fields Schema
 * Defines custom field configurations for work item types
 */
export const work_item_fields = pgTable(
  'work_item_fields',
  {
    // Primary Key
    work_item_field_id: uuid('work_item_field_id').primaryKey().defaultRandom(),

    // Foreign Keys
    work_item_type_id: uuid('work_item_type_id')
      .notNull()
      .references(() => work_item_types.work_item_type_id, { onDelete: 'cascade' }),

    // Field Configuration
    field_name: varchar('field_name', { length: 100 }).notNull(),
    field_label: varchar('field_label', { length: 255 }).notNull(),
    field_type: varchar('field_type', { length: 50 }).notNull(), // text, number, date, dropdown, checkbox, user_picker
    field_description: text('field_description'),

    // Field Options (for dropdown, multi_select)
    field_options: jsonb('field_options'), // Array of options: [{value: string, label: string}]

    // Validation Rules
    is_required: boolean('is_required').default(false),
    validation_rules: jsonb('validation_rules'), // {min, max, pattern, etc}
    default_value: text('default_value'),

    // Display Configuration
    display_order: integer('display_order').notNull().default(0),
    is_visible: boolean('is_visible').default(true),

    // Metadata
    created_by: uuid('created_by')
      .notNull()
      .references(() => users.user_id, { onDelete: 'cascade' }),

    // Standard timestamps
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    // Indexes for foreign keys
    typeIdx: index('idx_work_item_fields_type').on(table.work_item_type_id),
    createdByIdx: index('idx_work_item_fields_created_by').on(table.created_by),

    // Indexes for commonly queried fields
    deletedAtIdx: index('idx_work_item_fields_deleted_at').on(table.deleted_at),
    displayOrderIdx: index('idx_work_item_fields_display_order').on(table.display_order),

    // Composite indexes for common queries
    typeVisibleIdx: index('idx_work_item_fields_type_visible').on(table.work_item_type_id, table.is_visible),
    typeOrderIdx: index('idx_work_item_fields_type_order').on(table.work_item_type_id, table.display_order),
  })
);

/**
 * Work Item Field Values Schema
 * Stores custom field values for work items
 */
export const work_item_field_values = pgTable(
  'work_item_field_values',
  {
    // Primary Key
    work_item_field_value_id: uuid('work_item_field_value_id').primaryKey().defaultRandom(),

    // Foreign Keys
    work_item_id: uuid('work_item_id')
      .notNull()
      .references(() => work_items.work_item_id, { onDelete: 'cascade' }),

    work_item_field_id: uuid('work_item_field_id')
      .notNull()
      .references(() => work_item_fields.work_item_field_id, { onDelete: 'cascade' }),

    // Field Value (stored as JSONB to support all types)
    field_value: jsonb('field_value').notNull(),

    // Standard timestamps
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    // Indexes for foreign keys
    workItemIdx: index('idx_work_item_field_values_work_item').on(table.work_item_id),
    fieldIdx: index('idx_work_item_field_values_field').on(table.work_item_field_id),

    // Composite index for common queries
    workItemFieldIdx: index('idx_work_item_field_values_work_item_field').on(
      table.work_item_id,
      table.work_item_field_id
    ),
  })
);

// Relations definitions
export const workItemFieldsRelations = relations(work_item_fields, ({ one, many }) => ({
  work_item_type: one(work_item_types, {
    fields: [work_item_fields.work_item_type_id],
    references: [work_item_types.work_item_type_id],
  }),
  created_by_user: one(users, {
    fields: [work_item_fields.created_by],
    references: [users.user_id],
  }),
  field_values: many(work_item_field_values),
}));

export const workItemFieldValuesRelations = relations(work_item_field_values, ({ one }) => ({
  work_item: one(work_items, {
    fields: [work_item_field_values.work_item_id],
    references: [work_items.work_item_id],
  }),
  work_item_field: one(work_item_fields, {
    fields: [work_item_field_values.work_item_field_id],
    references: [work_item_fields.work_item_field_id],
  }),
}));
