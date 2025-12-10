import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

// Type alias for postgres.js raw parameters (external library requirement)
type PostgresRawParams = Parameters<postgres.Sql['unsafe']>[1];

import { getAnalyticsDatabaseConfig } from '@/lib/env';
import { log, SLOW_THRESHOLDS } from '@/lib/logger';

/**
 * Analytics Database Service
 * Provides connection and query capabilities for the external analytics database
 * containing the ih.gr_app_measures table
 */

let analyticsDb: ReturnType<typeof drizzle> | null = null;
let analyticsConnection: postgres.Sql | null = null;

/**
 * Initialize connection to the analytics database
 */
export const getAnalyticsDb = () => {
  if (!analyticsDb) {
    const config = getAnalyticsDatabaseConfig();

    if (!config.url) {
      throw new Error('ANALYTICS_DATABASE_URL is not configured');
    }

    // Create postgres connection with optimized settings for analytics
    analyticsConnection = postgres(config.url, {
      max: config.max || 5, // Smaller connection pool for analytics
      idle_timeout: config.idleTimeoutMillis ? config.idleTimeoutMillis / 1000 : 20,
      connect_timeout: config.connectionTimeoutMillis ? config.connectionTimeoutMillis / 1000 : 10,
      // Force SSL for analytics database (external database likely requires it)
      ssl: 'require',
    });

    // Disable Drizzle's built-in logger - it outputs full query results
    // which can be thousands of rows. Use our structured logging instead.
    analyticsDb = drizzle(analyticsConnection, {
      logger: false,
    });
  }

  return analyticsDb;
};

/**
 * Health check for analytics database connection
 */
export const checkAnalyticsDbHealth = async (): Promise<{
  isHealthy: boolean;
  latency?: number;
  error?: string;
}> => {
  // Use logger directly

  try {
    const config = getAnalyticsDatabaseConfig();

    // If no analytics database URL is configured, return unhealthy
    if (!config.url) {
      return {
        isHealthy: false,
        error: 'ANALYTICS_DATABASE_URL not configured',
      };
    }

    if (!analyticsConnection) {
      getAnalyticsDb(); // Initialize connection
    }

    if (!analyticsConnection) {
      throw new Error('Analytics connection not initialized');
    }

    const startTime = Date.now();
    await analyticsConnection`SELECT 1 as health_check`;
    const latency = Date.now() - startTime;

    log.info('Analytics database health check passed', { latency });

    return {
      isHealthy: true,
      latency,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error('Analytics database health check failed', { error: errorMessage });

    return {
      isHealthy: false,
      error: errorMessage,
    };
  }
};

/**
 * Execute a raw SQL query against the analytics database
 * Use with caution - prefer typed queries when possible
 */
export const executeAnalyticsQuery = async <T = Record<string, unknown>>(
  query: string,
  params: unknown[] = []
): Promise<T[]> => {
  // Use logger directly

  try {
    if (!analyticsConnection) {
      getAnalyticsDb(); // Initialize connection
    }

    // Log the full SQL query with parameters for debugging
    log.debug('Executing analytics SQL query', {
      operation: 'execute_query',
      sql: query,
      parameters: params,
      paramCount: params.length,
      component: 'analytics-db',
    });

    const startTime = Date.now();
    // Use postgres template literal syntax
    const result = await analyticsConnection?.unsafe(query, params as PostgresRawParams);

    if (!result) {
      throw new Error('Query execution returned undefined result');
    }

    const duration = Date.now() - startTime;

    log.debug('Analytics query completed', {
      operation: 'execute_query',
      duration,
      rowCount: result.length,
      slow: duration > SLOW_THRESHOLDS.DB_QUERY,
      component: 'analytics-db',
    });

    // Type Safety Note: This double assertion is necessary because raw SQL queries
    // return untyped results from the database. The generic type T is validated
    // by the caller and typically comes from chart definitions or query builders.
    // This is an acceptable use case for type assertion in database query utilities.
    return result as unknown as T[];
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error('Analytics query execution failed', {
      error: errorMessage,
      query: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
    });

    throw new Error(`Analytics query failed: ${errorMessage}`);
  }
};

/**
 * Get connection pool configuration for monitoring
 * 
 * Returns pool configuration to help diagnose potential connection exhaustion.
 * Note: postgres.js doesn't expose live connection counts - only configuration.
 * For active connection monitoring, consider adding query instrumentation.
 * 
 * @returns Pool config or null if connection not initialized
 */
export const getAnalyticsPoolConfig = (): {
  /** Maximum pool size configured */
  max: number;
  /** Idle timeout in seconds */
  idleTimeout: number;
  /** Connect timeout in seconds */
  connectTimeout: number;
  /** Whether connection is initialized */
  initialized: boolean;
} | null => {
  const config = getAnalyticsDatabaseConfig();
  
  if (!config.url) {
    return null;
  }

  return {
    max: config.max || 5,
    idleTimeout: config.idleTimeoutMillis ? config.idleTimeoutMillis / 1000 : 20,
    connectTimeout: config.connectionTimeoutMillis ? config.connectionTimeoutMillis / 1000 : 10,
    initialized: analyticsConnection !== null,
  };
};

/**
 * Graceful shutdown of analytics database connections
 */
export const closeAnalyticsDb = async () => {
  // Use logger directly

  try {
    if (analyticsConnection) {
      await analyticsConnection.end();
      analyticsConnection = null;
      analyticsDb = null;
      log.info('Analytics database connections closed');
    }
  } catch (error) {
    log.error('Error closing analytics database connections', { error });
  }
};

// Cleanup on process termination
// Note: Event handlers removed entirely - Next.js manages process lifecycle
// Database connections will be closed automatically by postgres.js when process exits
// Registering handlers here causes issues with Next.js worker processes

