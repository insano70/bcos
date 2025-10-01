/**
 * Database exports
 * Central exports for all database schemas and connection
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getDatabaseConfig } from '@/lib/env';
import { logger } from '@/lib/logger';

// Initialize database connection with connection pooling
let dbInstance: ReturnType<typeof drizzle> | null = null;
let client: postgres.Sql | null = null;

/**
 * Get database connection with connection pooling
 */
export const getDb = () => {
  if (!dbInstance) {
    const config = getDatabaseConfig();

    if (!config.url) {
      throw new Error('DATABASE_URL is not configured');
    }

    // Create postgres connection with pooling settings
    client = postgres(config.url, {
      prepare: false,
      max: config.max || 10, // Connection pool size
      idle_timeout: config.idleTimeoutMillis ? config.idleTimeoutMillis / 1000 : 20,
      connect_timeout: config.connectionTimeoutMillis ? config.connectionTimeoutMillis / 1000 : 10,
      // Production optimizations
      ...(process.env.NODE_ENV === 'production' && {
        ssl: 'require',
        keep_alive: 30,
      }),
    });

    dbInstance = drizzle(client, {
      logger: process.env.NODE_ENV === 'development',
    });
  }

  return dbInstance;
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
    if (!client) {
      getDb(); // Initialize connection
    }

    const startTime = Date.now();
    if (!client) {
      throw new Error('Database client not initialized');
    }
    await client`SELECT 1 as health_check`;
    const latency = Date.now() - startTime;

    logger.info('Main database health check passed', { latency });

    return {
      isHealthy: true,
      latency,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Main database health check failed', { error: errorMessage });

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
    if (client) {
      await client.end();
      client = null;
      dbInstance = null;
      logger.info('Main database connections closed');
    }
  } catch (error) {
    logger.error('Error closing main database connections', { error });
  }
};

// Cleanup on process termination
if (typeof process !== 'undefined') {
  process.on('beforeExit', closeDb);
  process.on('SIGINT', closeDb);
  process.on('SIGTERM', closeDb);
}

export * from './analytics-schema';
export * from './audit-schema';
export * from './chart-config-schema';
export * from './rbac-schema';
export * from './refresh-token-schema';
// Re-export all schemas
export * from './schema';
