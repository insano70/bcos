/**
 * Database exports
 * Central exports for all database schemas and connection
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getDatabaseConfig } from '@/lib/env';
import { log } from '@/lib/logger';

/**
 * Database context type - can be either the main db instance or a transaction
 * Use this type when a function needs to accept either db or tx
 *
 * Uses Pick to extract only the query methods we need, which are common
 * to both the database instance and transaction objects.
 */
export type DbContext = Pick<ReturnType<typeof drizzle>, 'select' | 'insert' | 'update' | 'delete'>;

// Extend globalThis to include our database connection
declare global {
  // eslint-disable-next-line no-var
  var dbInstance: ReturnType<typeof drizzle> | undefined;
  // eslint-disable-next-line no-var
  var dbClient: postgres.Sql | undefined;
}

/**
 * Get database connection with connection pooling
 * Uses globalThis to ensure single instance across hot reloads in development
 */
export const getDb = () => {
  if (!globalThis.dbInstance) {
    const config = getDatabaseConfig();

    if (!config.url) {
      throw new Error('DATABASE_URL is not configured');
    }

    // Create postgres connection with pooling settings
    globalThis.dbClient = postgres(config.url, {
      prepare: false,
      max: config.max || 10, // Connection pool size
      idle_timeout: config.idleTimeoutMillis ? config.idleTimeoutMillis / 1000 : 30,
      connect_timeout: config.connectionTimeoutMillis ? config.connectionTimeoutMillis / 1000 : 10,
      max_lifetime: 60 * 30, // 30 minutes - recycle connections to prevent stale connections
      // Production optimizations
      ...(process.env.NODE_ENV === 'production' && {
        ssl: 'require',
        keep_alive: 30,
      }),
      // Development optimizations
      ...(process.env.NODE_ENV === 'development' && {
        onnotice: () => {}, // Suppress PostgreSQL notices in development
        debug: false, // Disable debug logging
      }),
    });

    // Disable Drizzle's built-in logger - it outputs every query to console
    // which is too verbose. Use our structured logging system instead.
    globalThis.dbInstance = drizzle(globalThis.dbClient, {
      logger: false,
    });
  }

  return globalThis.dbInstance;
};

// Export the database instance (backwards compatibility)
export const db = getDb();

/**
 * Health check for main database connection
 */
export const checkDbHealth = async (): Promise<{
  isHealthy: boolean;
  latency?: number;
  error?: string;
}> => {
  try {
    if (!globalThis.dbClient) {
      getDb(); // Initialize connection
    }

    const startTime = Date.now();
    if (!globalThis.dbClient) {
      throw new Error('Database client not initialized');
    }
    await globalThis.dbClient`SELECT 1 as health_check`;
    const latency = Date.now() - startTime;

    log.info('Main database health check passed', { latency });

    return {
      isHealthy: true,
      latency,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error('Main database health check failed', { error: errorMessage });

    return {
      isHealthy: false,
      error: errorMessage,
    };
  }
};

/**
 * Graceful shutdown of main database connections
 */
export const closeDb = async () => {
  try {
    if (globalThis.dbClient) {
      await globalThis.dbClient.end();
      globalThis.dbClient = undefined;
      globalThis.dbInstance = undefined;
      log.info('Main database connections closed');
    }
  } catch (error) {
    log.error('Error closing main database connections', { error });
  }
};

// Cleanup on process termination (only in Node.js runtime, not Edge)
// Note: Event handlers removed entirely - Next.js manages process lifecycle
// Database connections will be closed automatically by postgres.js when process exits
// Registering handlers here causes issues with Next.js worker processes

export * from './analytics-schema';
export * from './audit-schema';
export * from './chart-config-schema';
export * from './csrf-schema';
export * from './rbac-schema';
export * from './refresh-token-schema';
// Re-export all schemas
export * from './schema';

// Registering handlers here causes issues with Next.js worker processes

export * from './analytics-schema';
export * from './audit-schema';
export * from './chart-config-schema';
export * from './csrf-schema';
export * from './rbac-schema';
export * from './refresh-token-schema';
// Re-export all schemas
export * from './schema';
