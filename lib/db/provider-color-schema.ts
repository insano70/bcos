import {
  boolean,
  index,
  integer,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/**
 * Provider Color Assignments
 *
 * Stores persistent color assignments for providers in charts.
 * Uses Tableau's industry-standard 20-color palette for optimal visual distinction.
 *
 * ORGANIZATION SEGREGATION:
 * - Different organizations can assign different colors to the same provider
 * - Unique constraint on (organization_id, provider_uid)
 * - NULL organization_id = system-wide default (used as fallback)
 */
export const chart_provider_colors = pgTable(
  'chart_provider_colors',
  {
    provider_color_id: uuid('provider_color_id').primaryKey().defaultRandom(),

    // Organization segregation (NULL = system default)
    organization_id: uuid('organization_id'),

    // Provider identification
    provider_uid: integer('provider_uid').notNull(),
    provider_name: varchar('provider_name', { length: 255 }).notNull(),

    // Color assignment
    assigned_color: varchar('assigned_color', { length: 7 }).notNull(), // #RRGGBB format
    color_palette_id: varchar('color_palette_id', { length: 50 }).default('tableau20'),

    // Assignment type
    is_custom: boolean('is_custom').default(false), // true = manually overridden, false = auto-assigned

    // Audit fields
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    created_by: uuid('created_by'),
    updated_by: uuid('updated_by'),
  },
  (table) => ({
    // Unique constraint: one color per provider per organization
    uniqueOrgProvider: unique('unique_org_provider_color').on(
      table.organization_id,
      table.provider_uid
    ),

    // Indexes for fast lookups
    orgProviderIdx: index('idx_provider_colors_org_provider').on(
      table.organization_id,
      table.provider_uid
    ),
    providerUidIdx: index('idx_provider_colors_uid').on(table.provider_uid),
    organizationIdx: index('idx_provider_colors_org').on(table.organization_id),
    customIdx: index('idx_provider_colors_custom').on(table.is_custom),
  })
);
