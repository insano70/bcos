import { sql } from 'drizzle-orm';
import {
  boolean,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const practices = pgTable(
  'practices',
  {
    practiceId: uuid('practice_id').defaultRandom().primaryKey().notNull(),
    name: varchar({ length: 255 }).notNull(),
    domain: varchar({ length: 255 }).notNull(),
    templateId: uuid('template_id'),
    status: varchar({ length: 20 }).default('pending'),
    ownerUserId: uuid('owner_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
  },
  (table) => [
    index('idx_practices_domain').using('btree', table.domain.asc().nullsLast().op('text_ops')),
    index('idx_practices_owner').using('btree', table.ownerUserId.asc().nullsLast().op('uuid_ops')),
    index('idx_practices_status').using('btree', table.status.asc().nullsLast().op('text_ops')),
    index('idx_practices_template_id').using(
      'btree',
      table.templateId.asc().nullsLast().op('uuid_ops')
    ),
    foreignKey({
      columns: [table.templateId],
      foreignColumns: [templates.templateId],
      name: 'practices_template_id_templates_template_id_fk',
    }),
    foreignKey({
      columns: [table.ownerUserId],
      foreignColumns: [users.userId],
      name: 'practices_owner_user_id_users_user_id_fk',
    }),
    unique('practices_domain_unique').on(table.domain),
  ]
);

export const templates = pgTable(
  'templates',
  {
    templateId: uuid('template_id').defaultRandom().primaryKey().notNull(),
    name: varchar({ length: 255 }).notNull(),
    slug: varchar({ length: 100 }).notNull(),
    description: text(),
    previewImageUrl: varchar('preview_image_url', { length: 500 }),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
  },
  (table) => [
    index('idx_templates_active').using('btree', table.isActive.asc().nullsLast().op('bool_ops')),
    index('idx_templates_slug').using('btree', table.slug.asc().nullsLast().op('text_ops')),
    unique('templates_slug_unique').on(table.slug),
  ]
);

export const users = pgTable(
  'users',
  {
    userId: uuid('user_id').defaultRandom().primaryKey().notNull(),
    email: varchar({ length: 255 }).notNull(),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    emailVerified: boolean('email_verified').default(false),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
  },
  (table) => [
    index('idx_users_created_at').using(
      'btree',
      table.createdAt.asc().nullsLast().op('timestamptz_ops')
    ),
    index('idx_users_deleted_at').using(
      'btree',
      table.deletedAt.asc().nullsLast().op('timestamptz_ops')
    ),
    index('idx_users_email').using('btree', table.email.asc().nullsLast().op('text_ops')),
    unique('users_email_unique').on(table.email),
  ]
);

export const staffMembers = pgTable(
  'staff_members',
  {
    staffId: uuid('staff_id').defaultRandom().primaryKey().notNull(),
    practiceId: uuid('practice_id'),
    name: varchar({ length: 255 }).notNull(),
    title: varchar({ length: 255 }),
    credentials: varchar({ length: 255 }),
    bio: text(),
    photoUrl: varchar('photo_url', { length: 500 }),
    specialties: text(),
    education: text(),
    displayOrder: integer('display_order').default(0),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
  },
  (table) => [
    index('idx_staff_members_active').using(
      'btree',
      table.isActive.asc().nullsLast().op('bool_ops')
    ),
    index('idx_staff_members_display_order').using(
      'btree',
      table.practiceId.asc().nullsLast().op('int4_ops'),
      table.displayOrder.asc().nullsLast().op('int4_ops')
    ),
    index('idx_staff_members_practice_id').using(
      'btree',
      table.practiceId.asc().nullsLast().op('uuid_ops')
    ),
    foreignKey({
      columns: [table.practiceId],
      foreignColumns: [practices.practiceId],
      name: 'staff_members_practice_id_practices_practice_id_fk',
    }).onDelete('cascade'),
  ]
);

export const practiceAttributes = pgTable(
  'practice_attributes',
  {
    practiceAttributeId: uuid('practice_attribute_id').defaultRandom().primaryKey().notNull(),
    practiceId: uuid('practice_id'),
    phone: varchar({ length: 20 }),
    email: varchar({ length: 255 }),
    addressLine1: varchar('address_line1', { length: 255 }),
    addressLine2: varchar('address_line2', { length: 255 }),
    city: varchar({ length: 100 }),
    state: varchar({ length: 50 }),
    zipCode: varchar('zip_code', { length: 20 }),
    businessHours: text('business_hours'),
    services: text(),
    insuranceAccepted: text('insurance_accepted'),
    conditionsTreated: text('conditions_treated'),
    aboutText: text('about_text'),
    missionStatement: text('mission_statement'),
    welcomeMessage: text('welcome_message'),
    logoUrl: varchar('logo_url', { length: 500 }),
    heroImageUrl: varchar('hero_image_url', { length: 500 }),
    galleryImages: text('gallery_images'),
    metaTitle: varchar('meta_title', { length: 255 }),
    metaDescription: varchar('meta_description', { length: 500 }),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow(),
    primaryColor: varchar('primary_color', { length: 7 }),
    secondaryColor: varchar('secondary_color', { length: 7 }),
    accentColor: varchar('accent_color', { length: 7 }),
  },
  (table) => [
    index('idx_practice_attributes_practice_id').using(
      'btree',
      table.practiceId.asc().nullsLast().op('uuid_ops')
    ),
    foreignKey({
      columns: [table.practiceId],
      foreignColumns: [practices.practiceId],
      name: 'practice_attributes_practice_id_practices_practice_id_fk',
    }).onDelete('cascade'),
  ]
);

export const accountSecurity = pgTable(
  'account_security',
  {
    userId: uuid('user_id').primaryKey().notNull(),
    failedLoginAttempts: integer('failed_login_attempts').default(0).notNull(),
    lastFailedAttempt: timestamp('last_failed_attempt', { withTimezone: true, mode: 'string' }),
    lockedUntil: timestamp('locked_until', { withTimezone: true, mode: 'string' }),
    lockoutReason: varchar('lockout_reason', { length: 50 }),
    maxConcurrentSessions: integer('max_concurrent_sessions').default(3).notNull(),
    requireFreshAuthMinutes: integer('require_fresh_auth_minutes').default(5).notNull(),
    passwordChangedAt: timestamp('password_changed_at', { withTimezone: true, mode: 'string' }),
    lastPasswordReset: timestamp('last_password_reset', { withTimezone: true, mode: 'string' }),
    suspiciousActivityDetected: boolean('suspicious_activity_detected').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_account_security_locked_until').using(
      'btree',
      table.lockedUntil.asc().nullsLast().op('timestamptz_ops')
    ),
    index('idx_account_security_suspicious').using(
      'btree',
      table.suspiciousActivityDetected.asc().nullsLast().op('bool_ops')
    ),
  ]
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    auditLogId: varchar('audit_log_id', { length: 255 }).primaryKey().notNull(),
    eventType: varchar('event_type', { length: 50 }).notNull(),
    action: varchar({ length: 100 }).notNull(),
    userId: varchar('user_id', { length: 255 }),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    resourceType: varchar('resource_type', { length: 50 }),
    resourceId: varchar('resource_id', { length: 255 }),
    oldValues: text('old_values'),
    newValues: text('new_values'),
    metadata: text(),
    severity: varchar({ length: 20 }).default('low').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_audit_logs_created_at').using(
      'btree',
      table.createdAt.asc().nullsLast().op('timestamptz_ops')
    ),
    index('idx_audit_logs_event_type').using(
      'btree',
      table.eventType.asc().nullsLast().op('text_ops')
    ),
    index('idx_audit_logs_resource').using(
      'btree',
      table.resourceType.asc().nullsLast().op('text_ops'),
      table.resourceId.asc().nullsLast().op('text_ops')
    ),
    index('idx_audit_logs_severity').using(
      'btree',
      table.severity.asc().nullsLast().op('text_ops')
    ),
    index('idx_audit_logs_user_id').using('btree', table.userId.asc().nullsLast().op('text_ops')),
  ]
);

export const loginAttempts = pgTable(
  'login_attempts',
  {
    attemptId: varchar('attempt_id', { length: 255 }).primaryKey().notNull(),
    email: varchar({ length: 255 }).notNull(),
    userId: uuid('user_id'),
    ipAddress: varchar('ip_address', { length: 45 }).notNull(),
    userAgent: text('user_agent'),
    deviceFingerprint: varchar('device_fingerprint', { length: 255 }),
    success: boolean().notNull(),
    failureReason: varchar('failure_reason', { length: 100 }),
    rememberMeRequested: boolean('remember_me_requested').default(false).notNull(),
    sessionId: varchar('session_id', { length: 255 }),
    attemptedAt: timestamp('attempted_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_login_attempts_attempted_at').using(
      'btree',
      table.attemptedAt.asc().nullsLast().op('timestamptz_ops')
    ),
    index('idx_login_attempts_email').using('btree', table.email.asc().nullsLast().op('text_ops')),
    index('idx_login_attempts_ip').using('btree', table.ipAddress.asc().nullsLast().op('text_ops')),
    index('idx_login_attempts_session_id').using(
      'btree',
      table.sessionId.asc().nullsLast().op('text_ops')
    ),
    index('idx_login_attempts_success').using(
      'btree',
      table.success.asc().nullsLast().op('bool_ops')
    ),
    index('idx_login_attempts_user_id').using(
      'btree',
      table.userId.asc().nullsLast().op('uuid_ops')
    ),
  ]
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    tokenId: varchar('token_id', { length: 255 }).primaryKey().notNull(),
    userId: uuid('user_id').notNull(),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    deviceFingerprint: varchar('device_fingerprint', { length: 255 }).notNull(),
    ipAddress: varchar('ip_address', { length: 45 }).notNull(),
    userAgent: text('user_agent'),
    rememberMe: boolean('remember_me').default(false).notNull(),
    issuedAt: timestamp('issued_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
    lastUsed: timestamp('last_used', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'string' }),
    revokedReason: varchar('revoked_reason', { length: 50 }),
    rotationCount: integer('rotation_count').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_refresh_tokens_active').using(
      'btree',
      table.isActive.asc().nullsLast().op('bool_ops')
    ),
    index('idx_refresh_tokens_device').using(
      'btree',
      table.deviceFingerprint.asc().nullsLast().op('text_ops')
    ),
    index('idx_refresh_tokens_expires_at').using(
      'btree',
      table.expiresAt.asc().nullsLast().op('timestamptz_ops')
    ),
    index('idx_refresh_tokens_hash').using(
      'btree',
      table.tokenHash.asc().nullsLast().op('text_ops')
    ),
    index('idx_refresh_tokens_user_id').using(
      'btree',
      table.userId.asc().nullsLast().op('uuid_ops')
    ),
  ]
);

export const tokenBlacklist = pgTable(
  'token_blacklist',
  {
    jti: varchar({ length: 255 }).primaryKey().notNull(),
    userId: uuid('user_id').notNull(),
    tokenType: varchar('token_type', { length: 20 }).notNull(),
    blacklistedAt: timestamp('blacklisted_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
    reason: varchar({ length: 50 }).notNull(),
    blacklistedBy: uuid('blacklisted_by'),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
  },
  (table) => [
    index('idx_token_blacklist_blacklisted_at').using(
      'btree',
      table.blacklistedAt.asc().nullsLast().op('timestamptz_ops')
    ),
    index('idx_token_blacklist_expires_at').using(
      'btree',
      table.expiresAt.asc().nullsLast().op('timestamptz_ops')
    ),
    index('idx_token_blacklist_type').using(
      'btree',
      table.tokenType.asc().nullsLast().op('text_ops')
    ),
    index('idx_token_blacklist_user_id').using(
      'btree',
      table.userId.asc().nullsLast().op('uuid_ops')
    ),
  ]
);

export const userSessions = pgTable(
  'user_sessions',
  {
    sessionId: varchar('session_id', { length: 255 }).primaryKey().notNull(),
    userId: uuid('user_id').notNull(),
    refreshTokenId: varchar('refresh_token_id', { length: 255 }),
    deviceFingerprint: varchar('device_fingerprint', { length: 255 }).notNull(),
    deviceName: varchar('device_name', { length: 100 }),
    ipAddress: varchar('ip_address', { length: 45 }).notNull(),
    userAgent: text('user_agent'),
    rememberMe: boolean('remember_me').default(false).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    lastActivity: timestamp('last_activity', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true, mode: 'string' }),
    endReason: varchar('end_reason', { length: 50 }),
  },
  (table) => [
    index('idx_user_sessions_active').using(
      'btree',
      table.isActive.asc().nullsLast().op('bool_ops')
    ),
    index('idx_user_sessions_device').using(
      'btree',
      table.deviceFingerprint.asc().nullsLast().op('text_ops')
    ),
    index('idx_user_sessions_last_activity').using(
      'btree',
      table.lastActivity.asc().nullsLast().op('timestamptz_ops')
    ),
    index('idx_user_sessions_refresh_token').using(
      'btree',
      table.refreshTokenId.asc().nullsLast().op('text_ops')
    ),
    index('idx_user_sessions_user_id').using(
      'btree',
      table.userId.asc().nullsLast().op('uuid_ops')
    ),
  ]
);

export const permissions = pgTable(
  'permissions',
  {
    permissionId: uuid('permission_id').defaultRandom().primaryKey().notNull(),
    name: varchar({ length: 100 }).notNull(),
    description: text(),
    resource: varchar({ length: 50 }).notNull(),
    action: varchar({ length: 50 }).notNull(),
    scope: varchar({ length: 50 }).default('own'),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    index('idx_permissions_action').using('btree', table.action.asc().nullsLast().op('text_ops')),
    index('idx_permissions_active').using('btree', table.isActive.asc().nullsLast().op('bool_ops')),
    index('idx_permissions_name').using('btree', table.name.asc().nullsLast().op('text_ops')),
    index('idx_permissions_resource').using(
      'btree',
      table.resource.asc().nullsLast().op('text_ops')
    ),
    index('idx_permissions_resource_action').using(
      'btree',
      table.resource.asc().nullsLast().op('text_ops'),
      table.action.asc().nullsLast().op('text_ops')
    ),
    index('idx_permissions_scope').using('btree', table.scope.asc().nullsLast().op('text_ops')),
    unique('permissions_name_unique').on(table.name),
  ]
);

export const organizations = pgTable(
  'organizations',
  {
    organizationId: uuid('organization_id').defaultRandom().primaryKey().notNull(),
    name: varchar({ length: 255 }).notNull(),
    slug: varchar({ length: 100 }).notNull(),
    parentOrganizationId: uuid('parent_organization_id'),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
  },
  (table) => [
    index('idx_organizations_active').using(
      'btree',
      table.isActive.asc().nullsLast().op('bool_ops')
    ),
    index('idx_organizations_created_at').using(
      'btree',
      table.createdAt.asc().nullsLast().op('timestamptz_ops')
    ),
    index('idx_organizations_deleted_at').using(
      'btree',
      table.deletedAt.asc().nullsLast().op('timestamptz_ops')
    ),
    index('idx_organizations_parent').using(
      'btree',
      table.parentOrganizationId.asc().nullsLast().op('uuid_ops')
    ),
    index('idx_organizations_slug').using('btree', table.slug.asc().nullsLast().op('text_ops')),
    unique('organizations_slug_unique').on(table.slug),
  ]
);

export const roles = pgTable(
  'roles',
  {
    roleId: uuid('role_id').defaultRandom().primaryKey().notNull(),
    name: varchar({ length: 100 }).notNull(),
    description: text(),
    organizationId: uuid('organization_id'),
    isSystemRole: boolean('is_system_role').default(false),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
  },
  (table) => [
    index('idx_roles_active').using('btree', table.isActive.asc().nullsLast().op('bool_ops')),
    index('idx_roles_created_at').using(
      'btree',
      table.createdAt.asc().nullsLast().op('timestamptz_ops')
    ),
    index('idx_roles_deleted_at').using(
      'btree',
      table.deletedAt.asc().nullsLast().op('timestamptz_ops')
    ),
    index('idx_roles_name').using('btree', table.name.asc().nullsLast().op('text_ops')),
    index('idx_roles_organization').using(
      'btree',
      table.organizationId.asc().nullsLast().op('uuid_ops')
    ),
    index('idx_roles_system').using('btree', table.isSystemRole.asc().nullsLast().op('bool_ops')),
    index('idx_unique_role_per_org').using(
      'btree',
      table.name.asc().nullsLast().op('text_ops'),
      table.organizationId.asc().nullsLast().op('uuid_ops')
    ),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organizations.organizationId],
      name: 'roles_organization_id_organizations_organization_id_fk',
    }).onDelete('cascade'),
  ]
);

export const userRoles = pgTable(
  'user_roles',
  {
    userRoleId: uuid('user_role_id').defaultRandom().primaryKey().notNull(),
    userId: uuid('user_id').notNull(),
    roleId: uuid('role_id').notNull(),
    organizationId: uuid('organization_id'),
    grantedBy: uuid('granted_by'),
    grantedAt: timestamp('granted_at', { withTimezone: true, mode: 'string' }).defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    index('idx_unique_user_role_org').using(
      'btree',
      table.userId.asc().nullsLast().op('uuid_ops'),
      table.roleId.asc().nullsLast().op('uuid_ops'),
      table.organizationId.asc().nullsLast().op('uuid_ops')
    ),
    index('idx_user_roles_active').using('btree', table.isActive.asc().nullsLast().op('bool_ops')),
    index('idx_user_roles_expires_at').using(
      'btree',
      table.expiresAt.asc().nullsLast().op('timestamptz_ops')
    ),
    index('idx_user_roles_granted_by').using(
      'btree',
      table.grantedBy.asc().nullsLast().op('uuid_ops')
    ),
    index('idx_user_roles_organization').using(
      'btree',
      table.organizationId.asc().nullsLast().op('uuid_ops')
    ),
    index('idx_user_roles_role').using('btree', table.roleId.asc().nullsLast().op('uuid_ops')),
    index('idx_user_roles_user').using('btree', table.userId.asc().nullsLast().op('uuid_ops')),
    foreignKey({
      columns: [table.roleId],
      foreignColumns: [roles.roleId],
      name: 'user_roles_role_id_roles_role_id_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organizations.organizationId],
      name: 'user_roles_organization_id_organizations_organization_id_fk',
    }).onDelete('cascade'),
  ]
);

export const userOrganizations = pgTable(
  'user_organizations',
  {
    userOrganizationId: uuid('user_organization_id').defaultRandom().primaryKey().notNull(),
    userId: uuid('user_id').notNull(),
    organizationId: uuid('organization_id').notNull(),
    isActive: boolean('is_active').default(true),
    joinedAt: timestamp('joined_at', { withTimezone: true, mode: 'string' }).defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    index('idx_unique_user_organization').using(
      'btree',
      table.userId.asc().nullsLast().op('uuid_ops'),
      table.organizationId.asc().nullsLast().op('uuid_ops')
    ),
    index('idx_user_organizations_active').using(
      'btree',
      table.isActive.asc().nullsLast().op('bool_ops')
    ),
    index('idx_user_organizations_joined_at').using(
      'btree',
      table.joinedAt.asc().nullsLast().op('timestamptz_ops')
    ),
    index('idx_user_organizations_org').using(
      'btree',
      table.organizationId.asc().nullsLast().op('uuid_ops')
    ),
    index('idx_user_organizations_user').using(
      'btree',
      table.userId.asc().nullsLast().op('uuid_ops')
    ),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organizations.organizationId],
      name: 'user_organizations_organization_id_organizations_organization_i',
    }).onDelete('cascade'),
  ]
);

export const rolePermissions = pgTable(
  'role_permissions',
  {
    rolePermissionId: uuid('role_permission_id').defaultRandom().primaryKey().notNull(),
    roleId: uuid('role_id').notNull(),
    permissionId: uuid('permission_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    index('idx_role_permissions_permission').using(
      'btree',
      table.permissionId.asc().nullsLast().op('uuid_ops')
    ),
    index('idx_role_permissions_role').using(
      'btree',
      table.roleId.asc().nullsLast().op('uuid_ops')
    ),
    index('idx_unique_role_permission').using(
      'btree',
      table.roleId.asc().nullsLast().op('uuid_ops'),
      table.permissionId.asc().nullsLast().op('uuid_ops')
    ),
    foreignKey({
      columns: [table.roleId],
      foreignColumns: [roles.roleId],
      name: 'role_permissions_role_id_roles_role_id_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.permissionId],
      foreignColumns: [permissions.permissionId],
      name: 'role_permissions_permission_id_permissions_permission_id_fk',
    }).onDelete('cascade'),
  ]
);
