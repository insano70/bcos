import { index, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './schema';

/**
 * CSRF Security Monitoring Schema
 * Tracks CSRF validation failures for security monitoring, alerting, and threat detection
 */

// CSRF failure events for security monitoring
export const csrf_failure_events = pgTable(
  'csrf_failure_events',
  {
    // Primary key
    event_id: uuid('event_id').defaultRandom().primaryKey(),

    // Event details
    timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
    ip_address: varchar('ip_address', { length: 45 }).notNull(), // IPv4 or IPv6
    user_agent: text('user_agent').notNull(), // Full user agent string
    pathname: varchar('pathname', { length: 500 }).notNull(), // Request path
    reason: varchar('reason', { length: 200 }).notNull(), // Failure reason code
    severity: varchar('severity', { length: 20 }).notNull(), // 'low', 'medium', 'high', 'critical'

    // Optional user association
    user_id: uuid('user_id').references(() => users.user_id, { onDelete: 'set null' }),

    // Metadata
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    // Primary lookup: Get recent failures by IP (most common query pattern)
    ipTimestampIdx: index('idx_csrf_failures_ip_timestamp').on(table.ip_address, table.timestamp),

    // Time-based cleanup: Delete old events efficiently
    timestampIdx: index('idx_csrf_failures_timestamp').on(table.timestamp),

    // Endpoint analysis: Pattern detection by path
    pathnameTimestampIdx: index('idx_csrf_failures_pathname_timestamp').on(
      table.pathname,
      table.timestamp
    ),

    // High-severity filtering: Partial index for critical events only
    severityTimestampIdx: index('idx_csrf_failures_severity_timestamp').on(
      table.severity,
      table.timestamp
    ),

    // User tracking: For authenticated failure patterns
    userIdIdx: index('idx_csrf_failures_user_id').on(table.user_id),

    // Alert detection: Composite index for threat detection queries
    alertDetectionIdx: index('idx_csrf_failures_alert_detection').on(
      table.ip_address,
      table.severity,
      table.timestamp
    ),
  })
);

// Type exports for TypeScript
export type CSRFFailureEvent = typeof csrf_failure_events.$inferSelect;
export type NewCSRFFailureEvent = typeof csrf_failure_events.$inferInsert;
