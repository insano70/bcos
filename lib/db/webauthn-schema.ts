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
import { users } from './schema';

/**
 * WebAuthn/Passkey Database Schema
 * Implements FIDO2 WebAuthn authentication with passkey support
 */

/**
 * WebAuthn Credentials Table
 * Stores user passkeys with public keys, counters, and security metadata
 */
export const webauthn_credentials = pgTable(
  'webauthn_credentials',
  {
    // Primary key: Base64URL encoded credential ID from authenticator
    credential_id: varchar('credential_id', { length: 255 }).primaryKey(),

    // Foreign key to users table
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.user_id, { onDelete: 'cascade' }),

    // WebAuthn spec fields
    public_key: text('public_key').notNull(), // Base64URL encoded COSE public key
    counter: integer('counter').notNull().default(0), // Signature counter (clone detection)
    credential_device_type: varchar('credential_device_type', { length: 32 }).notNull(), // 'platform' or 'cross-platform'
    transports: text('transports'), // JSON array: ['usb', 'nfc', 'ble', 'internal']
    aaguid: text('aaguid'), // Authenticator AAGUID for device identification

    // User-facing metadata
    credential_name: varchar('credential_name', { length: 100 }).notNull(), // "MacBook Pro Touch ID"
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    last_used: timestamp('last_used', { withTimezone: true }),

    // Security tracking
    is_active: boolean('is_active').notNull().default(true),
    backed_up: boolean('backed_up').notNull().default(false), // Backup eligible flag (BE flag)
    registration_ip: varchar('registration_ip', { length: 45 }).notNull(),
    registration_user_agent: text('registration_user_agent'),
  },
  (table) => ({
    userIdx: index('idx_webauthn_credentials_user_id').on(table.user_id),
    activeIdx: index('idx_webauthn_credentials_active').on(table.is_active),
    lastUsedIdx: index('idx_webauthn_credentials_last_used').on(table.last_used),
  })
);

/**
 * WebAuthn Challenges Table
 * Temporary storage for registration and authentication challenges
 * Implements one-time use and expiration for replay attack prevention
 */
export const webauthn_challenges = pgTable(
  'webauthn_challenges',
  {
    // Primary key: Unique challenge identifier
    challenge_id: varchar('challenge_id', { length: 255 }).primaryKey(),

    // User performing the operation
    user_id: uuid('user_id').notNull(),

    // Challenge data
    challenge: varchar('challenge', { length: 255 }).notNull(), // Base64URL encoded random challenge
    challenge_type: varchar('challenge_type', { length: 20 }).notNull(), // 'registration' or 'authentication'

    // Security context
    ip_address: varchar('ip_address', { length: 45 }).notNull(),
    user_agent: text('user_agent'),

    // Expiration and one-time use enforcement
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(), // 5-minute TTL
    used_at: timestamp('used_at', { withTimezone: true }), // One-time use enforcement
  },
  (table) => ({
    userIdx: index('idx_webauthn_challenges_user_id').on(table.user_id),
    expiresIdx: index('idx_webauthn_challenges_expires_at').on(table.expires_at),
    challengeTypeIdx: index('idx_webauthn_challenges_challenge_type').on(table.challenge_type),
  })
);
