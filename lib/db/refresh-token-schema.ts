import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/**
 * JWT + Refresh Token Database Schema
 * For enterprise-grade token management with sliding window expiration
 */

// Refresh tokens with rotation and sliding window expiration
export const refresh_tokens = pgTable(
  'refresh_tokens',
  {
    token_id: varchar('token_id', { length: 255 }).primaryKey(), // Unique token identifier
    user_id: uuid('user_id').notNull(), // References users.user_id
    token_hash: varchar('token_hash', { length: 64 }).notNull(), // SHA-256 hash of actual token
    device_fingerprint: varchar('device_fingerprint', { length: 255 }).notNull(), // IP + User-Agent hash
    ip_address: varchar('ip_address', { length: 45 }).notNull(), // IPv4 or IPv6
    user_agent: text('user_agent'),
    remember_me: boolean('remember_me').notNull().default(false), // 7-day vs 30-day policy
    issued_at: timestamp('issued_at', { withTimezone: true }).defaultNow().notNull(),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(), // Sliding window expiration
    last_used: timestamp('last_used', { withTimezone: true }).defaultNow().notNull(),
    is_active: boolean('is_active').notNull().default(true),
    revoked_at: timestamp('revoked_at', { withTimezone: true }),
    revoked_reason: varchar('revoked_reason', { length: 50 }), // 'logout', 'security', 'rotation', 'expired'
    rotation_count: integer('rotation_count').notNull().default(0), // Track token rotations
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index('idx_refresh_tokens_user_id').on(table.user_id),
    activeIdx: index('idx_refresh_tokens_active').on(table.is_active),
    expiresIdx: index('idx_refresh_tokens_expires_at').on(table.expires_at),
    deviceIdx: index('idx_refresh_tokens_device').on(table.device_fingerprint),
    hashIdx: index('idx_refresh_tokens_hash').on(table.token_hash), // Fast token lookup
  })
);

// Token blacklist for immediate revocation (access tokens + refresh tokens)
export const token_blacklist = pgTable(
  'token_blacklist',
  {
    jti: varchar('jti', { length: 255 }).primaryKey(), // JWT ID from access token or refresh token ID
    user_id: uuid('user_id').notNull(),
    token_type: varchar('token_type', { length: 20 }).notNull(), // 'access' or 'refresh'
    blacklisted_at: timestamp('blacklisted_at', { withTimezone: true }).defaultNow().notNull(),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(), // When to clean up this entry
    reason: varchar('reason', { length: 50 }).notNull(), // 'logout', 'security', 'user_disabled', 'admin_action'
    blacklisted_by: uuid('blacklisted_by'), // Admin user who blacklisted it, if applicable
    ip_address: varchar('ip_address', { length: 45 }),
    user_agent: text('user_agent'),
  },
  (table) => ({
    userIdx: index('idx_token_blacklist_user_id').on(table.user_id),
    expiresIdx: index('idx_token_blacklist_expires_at').on(table.expires_at),
    typeIdx: index('idx_token_blacklist_type').on(table.token_type),
    blacklistedAtIdx: index('idx_token_blacklist_blacklisted_at').on(table.blacklisted_at),
  })
);

// Session tracking for device management and security monitoring
export const user_sessions = pgTable(
  'user_sessions',
  {
    session_id: varchar('session_id', { length: 255 }).primaryKey(),
    user_id: uuid('user_id').notNull(),
    refresh_token_id: varchar('refresh_token_id', { length: 255 }), // Links to current refresh token
    device_fingerprint: varchar('device_fingerprint', { length: 255 }).notNull(),
    device_name: varchar('device_name', { length: 100 }), // "Chrome on Mac", "iPhone Safari"
    ip_address: varchar('ip_address', { length: 45 }).notNull(),
    user_agent: text('user_agent'),
    remember_me: boolean('remember_me').notNull().default(false),
    is_active: boolean('is_active').notNull().default(true),
    last_activity: timestamp('last_activity', { withTimezone: true }).defaultNow().notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    ended_at: timestamp('ended_at', { withTimezone: true }),
    end_reason: varchar('end_reason', { length: 50 }), // 'logout', 'timeout', 'revoked'
  },
  (table) => ({
    userIdx: index('idx_user_sessions_user_id').on(table.user_id),
    refreshTokenIdx: index('idx_user_sessions_refresh_token').on(table.refresh_token_id),
    activeIdx: index('idx_user_sessions_active').on(table.is_active),
    deviceIdx: index('idx_user_sessions_device').on(table.device_fingerprint),
    lastActivityIdx: index('idx_user_sessions_last_activity').on(table.last_activity),
  })
);

// Login attempts and security audit trail
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
    failure_reason: varchar('failure_reason', { length: 100 }), // 'invalid_password', 'account_locked', 'user_disabled'
    remember_me_requested: boolean('remember_me_requested').notNull().default(false),
    session_id: varchar('session_id', { length: 255 }), // If successful, link to created session
    attempted_at: timestamp('attempted_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    emailIdx: index('idx_login_attempts_email').on(table.email),
    ipIdx: index('idx_login_attempts_ip').on(table.ip_address),
    attemptedAtIdx: index('idx_login_attempts_attempted_at').on(table.attempted_at),
    successIdx: index('idx_login_attempts_success').on(table.success),
    userIdx: index('idx_login_attempts_user_id').on(table.user_id),
    sessionIdx: index('idx_login_attempts_session_id').on(table.session_id),
  })
);

// Account security state (persistent lockout, concurrent session limits)
export const account_security = pgTable(
  'account_security',
  {
    user_id: uuid('user_id').primaryKey(),
    failed_login_attempts: integer('failed_login_attempts').notNull().default(0),
    last_failed_attempt: timestamp('last_failed_attempt', { withTimezone: true }),
    locked_until: timestamp('locked_until', { withTimezone: true }),
    lockout_reason: varchar('lockout_reason', { length: 50 }),
    max_concurrent_sessions: integer('max_concurrent_sessions').notNull().default(3), // Conservative for HIPAA
    require_fresh_auth_minutes: integer('require_fresh_auth_minutes').notNull().default(5), // Step-up auth
    password_changed_at: timestamp('password_changed_at', { withTimezone: true }),
    last_password_reset: timestamp('last_password_reset', { withTimezone: true }),
    suspicious_activity_detected: boolean('suspicious_activity_detected').notNull().default(false),
    // MFA fields
    mfa_enabled: boolean('mfa_enabled').notNull().default(false),
    mfa_method: varchar('mfa_method', { length: 20 }), // 'webauthn' (future: 'totp')
    mfa_enforced_at: timestamp('mfa_enforced_at', { withTimezone: true }),
    // MFA skip tracking (graceful onboarding)
    mfa_skips_remaining: integer('mfa_skips_remaining').notNull().default(5),
    mfa_skip_count: integer('mfa_skip_count').notNull().default(0),
    mfa_first_skipped_at: timestamp('mfa_first_skipped_at', { withTimezone: true }),
    mfa_last_skipped_at: timestamp('mfa_last_skipped_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    lockedUntilIdx: index('idx_account_security_locked_until').on(table.locked_until),
    suspiciousIdx: index('idx_account_security_suspicious').on(table.suspicious_activity_detected),
    mfaEnabledIdx: index('idx_account_security_mfa_enabled').on(table.mfa_enabled),
    mfaSkipsIdx: index('idx_account_security_mfa_skips').on(table.mfa_skips_remaining),
  })
);
