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
 * JWT Token Tracking Tables
 * For enterprise-grade token management, revocation, and security
 */

// Active JWT tokens tracking
export const jwt_tokens = pgTable(
  'jwt_tokens',
  {
    jti: varchar('jti', { length: 255 }).primaryKey(), // JWT ID from token
    user_id: uuid('user_id').notNull(), // References users.user_id
    session_id: varchar('session_id', { length: 255 }), // Links to user_sessions if using hybrid approach
    token_type: varchar('token_type', { length: 20 }).notNull(), // 'access', 'refresh'
    token_hash: varchar('token_hash', { length: 64 }).notNull(), // SHA-256 hash of token for verification
    device_fingerprint: varchar('device_fingerprint', { length: 255 }),
    ip_address: varchar('ip_address', { length: 45 }),
    user_agent: text('user_agent'),
    issued_at: timestamp('issued_at', { withTimezone: true }).notNull(),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
    last_used: timestamp('last_used', { withTimezone: true }).defaultNow(),
    is_active: boolean('is_active').notNull().default(true),
    revoked_at: timestamp('revoked_at', { withTimezone: true }),
    revoked_reason: varchar('revoked_reason', { length: 50 }), // 'manual', 'security', 'refresh', 'logout'
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index('idx_jwt_tokens_user_id').on(table.user_id),
    sessionIdx: index('idx_jwt_tokens_session_id').on(table.session_id),
    activeIdx: index('idx_jwt_tokens_active').on(table.is_active),
    expiresIdx: index('idx_jwt_tokens_expires_at').on(table.expires_at),
    typeIdx: index('idx_jwt_tokens_type').on(table.token_type),
    deviceIdx: index('idx_jwt_tokens_device').on(table.device_fingerprint),
    lastUsedIdx: index('idx_jwt_tokens_last_used').on(table.last_used),
  })
);

// Token blacklist for revoked tokens (faster lookup)
export const token_blacklist = pgTable(
  'token_blacklist',
  {
    jti: varchar('jti', { length: 255 }).primaryKey(),
    user_id: uuid('user_id').notNull(),
    revoked_at: timestamp('revoked_at', { withTimezone: true }).defaultNow().notNull(),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(), // When to clean up this blacklist entry
    reason: varchar('reason', { length: 50 }).notNull(),
    revoked_by: uuid('revoked_by'), // Admin user who revoked it, if applicable
  },
  (table) => ({
    userIdx: index('idx_token_blacklist_user_id').on(table.user_id),
    expiresIdx: index('idx_token_blacklist_expires_at').on(table.expires_at),
    revokedAtIdx: index('idx_token_blacklist_revoked_at').on(table.revoked_at),
  })
);

// Refresh token management (if using refresh token pattern)
export const refresh_tokens = pgTable(
  'refresh_tokens',
  {
    refresh_token_id: varchar('refresh_token_id', { length: 255 }).primaryKey(),
    user_id: uuid('user_id').notNull(),
    session_id: varchar('session_id', { length: 255 }),
    token_hash: varchar('token_hash', { length: 64 }).notNull(),
    device_fingerprint: varchar('device_fingerprint', { length: 255 }),
    ip_address: varchar('ip_address', { length: 45 }),
    issued_at: timestamp('issued_at', { withTimezone: true }).defaultNow().notNull(),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
    last_used: timestamp('last_used', { withTimezone: true }),
    uses_remaining: integer('uses_remaining').default(1), // Single use or limited use
    is_active: boolean('is_active').notNull().default(true),
    revoked_at: timestamp('revoked_at', { withTimezone: true }),
    revoked_reason: varchar('revoked_reason', { length: 50 }),
  },
  (table) => ({
    userIdx: index('idx_refresh_tokens_user_id').on(table.user_id),
    sessionIdx: index('idx_refresh_tokens_session_id').on(table.session_id),
    activeIdx: index('idx_refresh_tokens_active').on(table.is_active),
    expiresIdx: index('idx_refresh_tokens_expires_at').on(table.expires_at),
  })
);
