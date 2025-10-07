import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// Import Analytics tables
export {
  chart_categories,
  chart_definitions,
  chart_permissions,
  dashboard_charts,
  dashboards,
  data_sources,
  user_chart_favorites,
} from './analytics-schema';
// Import audit logs table
export { audit_logs } from './audit-schema';
// Import Chart Configuration tables
export {
  chart_data_source_columns,
  chart_data_sources,
  chart_display_configurations,
  color_palettes,
} from './chart-config-schema';
// Import CSRF monitoring tables
export { csrf_failure_events } from './csrf-schema';
// Import OIDC tables
export { oidc_nonces, oidc_states } from './oidc-schema';
// Import RBAC tables
export {
  organizations,
  organizationsRelations,
  permissions,
  permissionsRelations,
  role_permissions,
  rolePermissionsRelations,
  roles,
  rolesRelations,
  user_organizations,
  user_roles,
  userOrganizationsRelations,
  userRolesRelations,
} from './rbac-schema';
// Import JWT + Refresh Token tables and Session tables
export {
  account_security,
  login_attempts,
  refresh_tokens,
  token_blacklist,
  user_sessions,
} from './refresh-token-schema';
// Import WebAuthn tables
export {
  webauthn_challenges,
  webauthn_credentials,
} from './webauthn-schema';
// Import Work Items tables
export {
  work_item_statuses,
  work_item_types,
  work_items,
  workItemsRelations,
  workItemStatusesRelations,
  workItemTypesRelations,
} from './work-items-schema';

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
    practice_id: uuid('practice_id').references(() => practices.practice_id, {
      onDelete: 'cascade',
    }),

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
    practice_id: uuid('practice_id').references(() => practices.practice_id, {
      onDelete: 'cascade',
    }),
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
    displayOrderIdx: index('idx_staff_members_display_order').on(
      table.practice_id,
      table.display_order
    ),
    activeIdx: index('idx_staff_members_active').on(table.is_active),
  })
);

// Customer comments/reviews for practices
export const practice_comments = pgTable(
  'practice_comments',
  {
    comment_id: uuid('comment_id').primaryKey().defaultRandom(),
    practice_id: uuid('practice_id')
      .references(() => practices.practice_id, { onDelete: 'cascade' })
      .notNull(),
    commenter_name: varchar('commenter_name', { length: 255 }),
    commenter_location: varchar('commenter_location', { length: 255 }),
    comment: text('comment').notNull(),
    rating: numeric('rating').notNull(),
    display_order: integer('display_order').default(0),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    practiceIdx: index('idx_practice_comments_practice_id').on(table.practice_id),
    displayOrderIdx: index('idx_practice_comments_display_order').on(
      table.practice_id,
      table.display_order
    ),
  })
);

// SAML Replay Attack Prevention
// Tracks used SAML assertion IDs to prevent replay attacks
// Each SAML response can only be used once (enforced by PRIMARY KEY constraint)
export const samlReplayPrevention = pgTable(
  'saml_replay_prevention',
  {
    // Primary key: SAML Assertion ID (unique identifier from IdP)
    replayId: text('replay_id').primaryKey(),

    // InResponseTo: Links SAML response back to original AuthnRequest
    inResponseTo: text('in_response_to').notNull(),

    // User context for security monitoring
    userEmail: text('user_email').notNull(),

    // Timestamp tracking
    usedAt: timestamp('used_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),

    // Expiry for automatic cleanup (set to assertion NotOnOrAfter + safety margin)
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),

    // Security context for audit trail
    ipAddress: text('ip_address').notNull(),
    userAgent: text('user_agent'),

    // Session ID for correlation (nullable as assertion might fail before session creation)
    sessionId: text('session_id'),
  },
  (table) => ({
    // Index for efficient cleanup of expired entries
    expiresAtIdx: index('idx_saml_replay_expires_at').on(table.expiresAt),

    // Index for InResponseTo lookups (request/response correlation)
    inResponseToIdx: index('idx_saml_replay_in_response_to').on(table.inResponseTo),

    // Index for user email lookups (security monitoring)
    userEmailIdx: index('idx_saml_replay_user_email').on(table.userEmail),
  })
);
