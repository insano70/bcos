import { boolean, index, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

/**
 * OIDC State Management Schema
 *
 * Database-backed state storage for OIDC authentication flows.
 * Replaces in-memory state manager to support horizontal scaling.
 *
 * Security Features:
 * - Atomic one-time use enforcement via PostgreSQL row locking
 * - Automatic expiration tracking (5 minutes + 30s clock skew)
 * - Replay attack prevention
 * - Works across multiple application instances
 *
 * @security CRITICAL - Prevents CSRF and replay attacks during OIDC flow
 */

export const oidc_states = pgTable(
  'oidc_states',
  {
    // State token (primary key, unique per OIDC flow)
    state: varchar('state', { length: 255 }).primaryKey(),

    // Nonce for ID token validation (binds token to session)
    nonce: varchar('nonce', { length: 255 }).notNull(),

    // Device fingerprint for session hijacking prevention
    user_fingerprint: varchar('user_fingerprint', { length: 64 }),

    // One-time use flag (enforced via SELECT FOR UPDATE)
    is_used: boolean('is_used').notNull().default(false),

    // Timestamps
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),

    // Optional: track when state was used (audit)
    used_at: timestamp('used_at', { withTimezone: true }),
  },
  (table) => ({
    // Index for efficient cleanup of expired states
    expiresIdx: index('idx_oidc_states_expires').on(table.expires_at),

    // Index for one-time use queries
    isUsedIdx: index('idx_oidc_states_is_used').on(table.is_used),
  })
);

/**
 * OIDC Nonces Table (Optional)
 *
 * Separate nonce tracking for additional security.
 * Nonces are already validated in the state flow, but this provides
 * an additional layer of defense-in-depth.
 *
 * @security OPTIONAL - Defense-in-depth for nonce validation
 */
export const oidc_nonces = pgTable(
  'oidc_nonces',
  {
    // Nonce value (primary key)
    nonce: varchar('nonce', { length: 255 }).primaryKey(),

    // Reference to state token
    state: varchar('state', { length: 255 })
      .notNull()
      .references(() => oidc_states.state, { onDelete: 'cascade' }),

    // Timestamps
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => ({
    // Index for efficient cleanup
    expiresIdx: index('idx_oidc_nonces_expires').on(table.expires_at),

    // Index for state lookups
    stateIdx: index('idx_oidc_nonces_state').on(table.state),
  })
);
