import { pgTable, uuid, varchar, boolean, timestamp, index, text, integer, numeric } from 'drizzle-orm/pg-core';

// Import audit logs table
export { audit_logs } from './audit-schema';

// Import JWT + Refresh Token tables and Session tables
export { 
  refresh_tokens,
  token_blacklist,
  user_sessions,
  login_attempts,
  account_security
} from './refresh-token-schema';

// Import RBAC tables
export {
  organizations,
  permissions,
  roles,
  role_permissions,
  user_roles,
  user_organizations,
  organizationsRelations,
  rolesRelations,
  permissionsRelations,
  rolePermissionsRelations,
  userRolesRelations,
  userOrganizationsRelations
} from './rbac-schema';

// Import Analytics tables
export {
  chart_categories,
  chart_definitions,
  user_chart_favorites,
  data_sources,
  dashboards,
  dashboard_charts,
  chart_permissions
} from './analytics-schema';

// Import Chart Configuration tables
export {
  chart_data_sources,
  chart_data_source_columns,
  chart_display_configurations,
  color_palettes
} from './chart-config-schema';

// System users (admins who manage the platform)
export const users = pgTable(
  'users',
  {
    user_id: uuid('user_id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 255 }).unique().notNull(),
    first_name: varchar('first_name', { length: 100 }).notNull(),
    last_name: varchar('last_name', { length: 100 }).notNull(),
    // password_hash is nullable for SSO-only users
    // NULL = SSO-only user (SAML authentication required)
    // NOT NULL = Hybrid user (can use password OR SAML)
    password_hash: varchar('password_hash', { length: 255 }),
    email_verified: boolean('email_verified').default(false),
    is_active: boolean('is_active').default(true),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    emailIdx: index('idx_users_email').on(table.email),
    createdAtIdx: index('idx_users_created_at').on(table.created_at),
    deletedAtIdx: index('idx_users_deleted_at').on(table.deleted_at),
  })
);

// Website templates for rheumatology practices
export const templates = pgTable(
  'templates',
  {
    template_id: uuid('template_id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 100 }).unique().notNull(),
    description: text('description'),
    preview_image_url: varchar('preview_image_url', { length: 500 }),
    is_active: boolean('is_active').default(true),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    slugIdx: index('idx_templates_slug').on(table.slug),
    activeIdx: index('idx_templates_active').on(table.is_active),
  })
);

// Rheumatology practices using the platform
export const practices = pgTable(
  'practices',
  {
    practice_id: uuid('practice_id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    domain: varchar('domain', { length: 255 }).unique().notNull(),
    template_id: uuid('template_id').references(() => templates.template_id),
    status: varchar('status', { length: 20 }).default('pending'), // 'active', 'inactive', 'pending'
    owner_user_id: uuid('owner_user_id').references(() => users.user_id),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    domainIdx: index('idx_practices_domain').on(table.domain),
    templateIdx: index('idx_practices_template_id').on(table.template_id),
    ownerIdx: index('idx_practices_owner').on(table.owner_user_id),
    statusIdx: index('idx_practices_status').on(table.status),
  })
);

// Practice configuration and customizable content
export const practice_attributes = pgTable(
  'practice_attributes',
  {
    practice_attribute_id: uuid('practice_attribute_id').primaryKey().defaultRandom(),
    practice_id: uuid('practice_id').references(() => practices.practice_id, { onDelete: 'cascade' }),
    
    // Contact Information
    phone: varchar('phone', { length: 20 }),
    email: varchar('email', { length: 255 }),
    address_line1: varchar('address_line1', { length: 255 }),
    address_line2: varchar('address_line2', { length: 255 }),
    city: varchar('city', { length: 100 }),
    state: varchar('state', { length: 50 }),
    zip_code: varchar('zip_code', { length: 20 }),
    
    // Business Details (JSON fields for flexibility)
    business_hours: text('business_hours'), // JSON string
    services: text('services'), // JSON array of services
    insurance_accepted: text('insurance_accepted'), // JSON array
    conditions_treated: text('conditions_treated'), // JSON array
    
    // Customizable Content
    about_text: text('about_text'),
    mission_statement: text('mission_statement'),
    welcome_message: text('welcome_message'),
    
    // Media URLs (local for dev, S3 for prod)
    logo_url: varchar('logo_url', { length: 500 }),
    hero_image_url: varchar('hero_image_url', { length: 500 }),
    gallery_images: text('gallery_images'), // JSON array of URLs
    
    // SEO
    meta_title: varchar('meta_title', { length: 255 }),
    meta_description: varchar('meta_description', { length: 500 }),
    
    // Brand Colors
    primary_color: varchar('primary_color', { length: 7 }), // Hex color #RRGGBB
    secondary_color: varchar('secondary_color', { length: 7 }), // Hex color #RRGGBB
    accent_color: varchar('accent_color', { length: 7 }), // Hex color #RRGGBB
    
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    practiceIdx: index('idx_practice_attributes_practice_id').on(table.practice_id),
  })
);

// Staff/Provider profiles for practices
export const staff_members = pgTable(
  'staff_members',
  {
    staff_id: uuid('staff_id').primaryKey().defaultRandom(),
    practice_id: uuid('practice_id').references(() => practices.practice_id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    title: varchar('title', { length: 255 }), // "MD", "Rheumatologist", "Nurse Practitioner"
    credentials: varchar('credentials', { length: 255 }), // "MD, FACR", "RN, BSN"
    bio: text('bio'),
    photo_url: varchar('photo_url', { length: 500 }),
    specialties: text('specialties'), // JSON array
    education: text('education'), // JSON array of education objects
    display_order: integer('display_order').default(0),
    is_active: boolean('is_active').default(true),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    practiceIdx: index('idx_staff_members_practice_id').on(table.practice_id),
    displayOrderIdx: index('idx_staff_members_display_order').on(table.practice_id, table.display_order),
    activeIdx: index('idx_staff_members_active').on(table.is_active),
  })
);

// Customer comments/reviews for practices
export const practice_comments = pgTable(
  'practice_comments',
  {
    comment_id: uuid('comment_id').primaryKey().defaultRandom(),
    practice_id: uuid('practice_id').references(() => practices.practice_id, { onDelete: 'cascade' }).notNull(),
    commenter_name: varchar('commenter_name', { length: 255 }),
    commenter_location: varchar('commenter_location', { length: 255 }),
    comment: text('comment').notNull(),
    rating: numeric('rating').notNull(),
    display_order: integer('display_order').default(0),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    practiceIdx: index('idx_practice_comments_practice_id').on(table.practice_id),
    displayOrderIdx: index('idx_practice_comments_display_order').on(table.practice_id, table.display_order),
  })
);
