/**
 * Database exports
 * Central exports for all database schemas and connection
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL || 'postgresql://localhost:5432/bcos_d';
const client = postgres(connectionString, { prepare: false });

export const db = drizzle(client);

// Re-export all schemas
export * from './schema';
export * from './rbac-schema';
export * from './audit-schema';
export * from './analytics-schema';
export * from './chart-config-schema';
export * from './refresh-token-schema';