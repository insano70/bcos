import { pgTable, varchar, text, timestamp, boolean, integer, index, uuid } from 'drizzle-orm/pg-core'

/**
 * Enhanced Session Management Tables
 * For enterprise-grade session tracking, device management, and security
 */

// Active user sessions with device tracking
export const user_sessions = pgTable(
  'user_sessions',
  {
    session_id: varchar('session_id', { length: 255 }).primaryKey(),
    user_id: uuid('user_id').notNull(), // References users.user_id
    device_fingerprint: varchar('device_fingerprint', { length: 255 }).notNull(),
    device_name: varchar('device_name', { length: 100 }), // "Chrome on Mac", "iPhone Safari"
    ip_address: varchar('ip_address', { length: 45 }).notNull(), // IPv4 or IPv6
    user_agent: text('user_agent'),
    location: varchar('location', { length: 100 }), // "San Francisco, CA"
    is_active: boolean('is_active').notNull().default(true),
    last_activity: timestamp('last_activity', { withTimezone: true }).notNull().defaultNow(),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    revoked_at: timestamp('revoked_at', { withTimezone: true }),
    revoked_reason: varchar('revoked_reason', { length: 50 }), // manual, timeout, security, concurrent_limit
  },
  (table) => ({
    userIdx: index('idx_user_sessions_user_id').on(table.user_id),
    activeIdx: index('idx_user_sessions_active').on(table.is_active),
    expiresIdx: index('idx_user_sessions_expires').on(table.expires_at),
    deviceIdx: index('idx_user_sessions_device').on(table.device_fingerprint),
    lastActivityIdx: index('idx_user_sessions_last_activity').on(table.last_activity),
  })
)

// Login attempts and security events
export const login_attempts = pgTable(
  'login_attempts',
  {
    attempt_id: varchar('attempt_id', { length: 255 }).primaryKey(),
    email: varchar('email', { length: 255 }).notNull(),
    user_id: uuid('user_id'), // null if user doesn't exist
    ip_address: varchar('ip_address', { length: 45 }).notNull(),
    user_agent: text('user_agent'),
    device_fingerprint: varchar('device_fingerprint', { length: 255 }),
    success: boolean('success').notNull(),
    failure_reason: varchar('failure_reason', { length: 100 }), // invalid_password, account_locked, etc.
    location: varchar('location', { length: 100 }),
    attempted_at: timestamp('attempted_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    emailIdx: index('idx_login_attempts_email').on(table.email),
    ipIdx: index('idx_login_attempts_ip').on(table.ip_address),
    attemptedAtIdx: index('idx_login_attempts_attempted_at').on(table.attempted_at),
    successIdx: index('idx_login_attempts_success').on(table.success),
    userIdx: index('idx_login_attempts_user_id').on(table.user_id),
  })
)

// Account security settings and lockout state
export const account_security = pgTable(
  'account_security',
  {
    user_id: uuid('user_id').primaryKey(), // References users.user_id
    failed_login_attempts: integer('failed_login_attempts').notNull().default(0),
    last_failed_attempt: timestamp('last_failed_attempt', { withTimezone: true }),
    locked_until: timestamp('locked_until', { withTimezone: true }),
    lockout_reason: varchar('lockout_reason', { length: 50 }),
    max_concurrent_sessions: integer('max_concurrent_sessions').notNull().default(5),
    require_2fa: boolean('require_2fa').notNull().default(false),
    password_changed_at: timestamp('password_changed_at', { withTimezone: true }),
    suspicious_activity_detected: boolean('suspicious_activity_detected').notNull().default(false),
    last_password_reset: timestamp('last_password_reset', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    lockedUntilIdx: index('idx_account_security_locked_until').on(table.locked_until),
    suspiciousActivityIdx: index('idx_account_security_suspicious').on(table.suspicious_activity_detected),
  })
)

// Device trust and recognition
export const trusted_devices = pgTable(
  'trusted_devices',
  {
    device_id: varchar('device_id', { length: 255 }).primaryKey(),
    user_id: uuid('user_id').notNull(), // References users.user_id
    device_fingerprint: varchar('device_fingerprint', { length: 255 }).notNull(),
    device_name: varchar('device_name', { length: 100 }).notNull(),
    trusted: boolean('trusted').notNull().default(false),
    first_seen: timestamp('first_seen', { withTimezone: true }).defaultNow().notNull(),
    last_seen: timestamp('last_seen', { withTimezone: true }).defaultNow().notNull(),
    trust_granted_at: timestamp('trust_granted_at', { withTimezone: true }),
    revoked_at: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => ({
    userIdx: index('idx_trusted_devices_user_id').on(table.user_id),
    fingerprintIdx: index('idx_trusted_devices_fingerprint').on(table.device_fingerprint),
    trustedIdx: index('idx_trusted_devices_trusted').on(table.trusted),
  })
)

// Session configuration per user
export const user_session_preferences = pgTable(
  'user_session_preferences',
  {
    user_id: uuid('user_id').primaryKey(), // References users.user_id
    remember_me_duration: integer('remember_me_duration').notNull().default(2592000), // 30 days in seconds
    session_timeout: integer('session_timeout').notNull().default(86400), // 24 hours in seconds
    require_fresh_auth_for_sensitive: boolean('require_fresh_auth_for_sensitive').notNull().default(true),
    auto_logout_inactive: boolean('auto_logout_inactive').notNull().default(true),
    notify_new_device_login: boolean('notify_new_device_login').notNull().default(true),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  }
)
