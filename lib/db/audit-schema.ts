import { index, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

/**
 * Audit logs table for compliance and security tracking
 */
export const audit_logs = pgTable(
  'audit_logs',
  {
    audit_log_id: varchar('audit_log_id', { length: 255 }).primaryKey(),
    event_type: varchar('event_type', { length: 50 }).notNull(), // auth, user_action, system, security, data_change
    action: varchar('action', { length: 100 }).notNull(), // specific action taken
    user_id: varchar('user_id', { length: 255 }), // nullable for system events
    ip_address: varchar('ip_address', { length: 45 }), // IPv4 or IPv6
    user_agent: text('user_agent'),
    resource_type: varchar('resource_type', { length: 50 }), // table/entity name
    resource_id: varchar('resource_id', { length: 255 }), // specific record ID
    old_values: text('old_values'), // JSON string of old values
    new_values: text('new_values'), // JSON string of new values
    metadata: text('metadata'), // JSON string for additional context
    severity: varchar('severity', { length: 20 }).notNull().default('low'), // low, medium, high, critical
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    eventTypeIdx: index('idx_audit_logs_event_type').on(table.event_type),
    userIdx: index('idx_audit_logs_user_id').on(table.user_id),
    severityIdx: index('idx_audit_logs_severity').on(table.severity),
    createdAtIdx: index('idx_audit_logs_created_at').on(table.created_at),
    resourceIdx: index('idx_audit_logs_resource').on(table.resource_type, table.resource_id),
  })
);
