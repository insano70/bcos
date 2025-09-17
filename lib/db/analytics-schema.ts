import { pgTable, uuid, varchar, text, boolean, timestamp, integer, jsonb, index } from 'drizzle-orm/pg-core';
import { users } from './schema';

/**
 * Analytics Configuration Schema
 * Tables for storing chart definitions, categories, and user preferences
 * These tables live in the main application database, not the external analytics database
 * Based on the analytics design document
 */

// Chart categories for organization
export const chart_categories = pgTable(
  'chart_categories',
  {
    chart_category_id: integer('chart_category_id').primaryKey().generatedByDefaultAsIdentity(),
    category_name: varchar('category_name', { length: 100 }).notNull(),
    category_description: text('category_description'),
    parent_category_id: integer('parent_category_id'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    categoryNameIdx: index('idx_chart_categories_name').on(table.category_name),
    parentCategoryIdx: index('idx_chart_categories_parent').on(table.parent_category_id),
  })
);

// Chart definitions table - stores chart configurations as JSON
export const chart_definitions = pgTable(
  'chart_definitions',
  {
    chart_definition_id: uuid('chart_definition_id').primaryKey().defaultRandom(),
    chart_name: varchar('chart_name', { length: 255 }).notNull(),
    chart_description: text('chart_description'),
    chart_type: varchar('chart_type', { length: 50 }).notNull(), // 'line', 'bar', 'pie', 'doughnut', 'area'
    data_source: jsonb('data_source').notNull(), // DataSourceConfig as JSON
    chart_config: jsonb('chart_config').notNull(), // ChartConfig as JSON
    access_control: jsonb('access_control'), // ChartAccessControl as JSON
    chart_category_id: integer('chart_category_id').references(() => chart_categories.chart_category_id),
    created_by: uuid('created_by').references(() => users.user_id).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    is_active: boolean('is_active').default(true),
  },
  (table) => ({
    chartNameIdx: index('idx_chart_definitions_name').on(table.chart_name),
    chartTypeIdx: index('idx_chart_definitions_type').on(table.chart_type),
    createdByIdx: index('idx_chart_definitions_created_by').on(table.created_by),
    categoryIdx: index('idx_chart_definitions_category').on(table.chart_category_id),
    activeIdx: index('idx_chart_definitions_active').on(table.is_active),
    createdAtIdx: index('idx_chart_definitions_created_at').on(table.created_at),
  })
);

// User chart favorites/bookmarks
export const user_chart_favorites = pgTable(
  'user_chart_favorites',
  {
    user_id: uuid('user_id').references(() => users.user_id).notNull(),
    chart_definition_id: uuid('chart_definition_id').references(() => chart_definitions.chart_definition_id).notNull(),
    favorited_at: timestamp('favorited_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    pk: index('pk_user_chart_favorites').on(table.user_id, table.chart_definition_id),
    userIdx: index('idx_user_chart_favorites_user').on(table.user_id),
    chartIdx: index('idx_user_chart_favorites_chart').on(table.chart_definition_id),
  })
);

// Data source registry for available tables/views
export const data_sources = pgTable(
  'data_sources',
  {
    data_source_id: integer('data_source_id').primaryKey().generatedByDefaultAsIdentity(),
    data_source_name: varchar('data_source_name', { length: 100 }).notNull(),
    table_name: varchar('table_name', { length: 100 }).notNull(),
    schema_name: varchar('schema_name', { length: 50 }).notNull(),
    data_source_description: text('data_source_description'),
    available_fields: jsonb('available_fields'), // Array of field definitions
    sample_query: text('sample_query'),
    is_active: boolean('is_active').default(true),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    dataSourceNameIdx: index('idx_data_sources_name').on(table.data_source_name),
    tableNameIdx: index('idx_data_sources_table').on(table.table_name),
    activeIdx: index('idx_data_sources_active').on(table.is_active),
  })
);

// Dashboard definitions for multi-chart layouts
export const dashboards = pgTable(
  'dashboards',
  {
    dashboard_id: uuid('dashboard_id').primaryKey().defaultRandom(),
    dashboard_name: varchar('dashboard_name', { length: 255 }).notNull(),
    dashboard_description: text('dashboard_description'),
    layout_config: jsonb('layout_config').notNull(), // Dashboard layout as JSON
    dashboard_category_id: integer('dashboard_category_id').references(() => chart_categories.chart_category_id),
    created_by: uuid('created_by').references(() => users.user_id).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    is_active: boolean('is_active').default(true),
  },
  (table) => ({
    dashboardNameIdx: index('idx_dashboards_name').on(table.dashboard_name),
    createdByIdx: index('idx_dashboards_created_by').on(table.created_by),
    categoryIdx: index('idx_dashboards_category').on(table.dashboard_category_id),
    activeIdx: index('idx_dashboards_active').on(table.is_active),
  })
);

// Dashboard chart associations
export const dashboard_charts = pgTable(
  'dashboard_charts',
  {
    dashboard_chart_id: uuid('dashboard_chart_id').primaryKey().defaultRandom(),
    dashboard_id: uuid('dashboard_id').references(() => dashboards.dashboard_id).notNull(),
    chart_definition_id: uuid('chart_definition_id').references(() => chart_definitions.chart_definition_id).notNull(),
    position_config: jsonb('position_config'), // Chart position and size as JSON
    added_at: timestamp('added_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    dashboardIdx: index('idx_dashboard_charts_dashboard').on(table.dashboard_id),
    chartIdx: index('idx_dashboard_charts_chart').on(table.chart_definition_id),
  })
);

// Chart access permissions
export const chart_permissions = pgTable(
  'chart_permissions',
  {
    chart_permission_id: uuid('chart_permission_id').primaryKey().defaultRandom(),
    chart_definition_id: uuid('chart_definition_id').references(() => chart_definitions.chart_definition_id).notNull(),
    user_id: uuid('user_id').references(() => users.user_id).notNull(),
    permission_type: varchar('permission_type', { length: 20 }).notNull(), // 'view', 'edit', 'admin'
    granted_by_user_id: uuid('granted_by_user_id').references(() => users.user_id).notNull(),
    granted_at: timestamp('granted_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    chartIdx: index('idx_chart_permissions_chart').on(table.chart_definition_id),
    userIdx: index('idx_chart_permissions_user').on(table.user_id),
    permissionTypeIdx: index('idx_chart_permissions_type').on(table.permission_type),
  })
);
