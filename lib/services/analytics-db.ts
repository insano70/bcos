import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getAnalyticsDatabaseConfig } from '@/lib/env';
import { logger } from '@/lib/logger';

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

    analyticsDb = drizzle(analyticsConnection, {
      logger: process.env.NODE_ENV === 'development',
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
        error: 'ANALYTICS_DATABASE_URL not configured'
      };
    }

    if (!analyticsConnection) {
      getAnalyticsDb(); // Initialize connection
    }

    const startTime = Date.now();
    await analyticsConnection!`SELECT 1 as health_check`;
    const latency = Date.now() - startTime;

    logger.info('Analytics database health check passed', { latency });
    
    return {
      isHealthy: true,
      latency,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Analytics database health check failed', { error: errorMessage });
    
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
export const executeAnalyticsQuery = async <T = any>(
  query: string,
  params: any[] = []
): Promise<T[]> => {
  // Use logger directly
  
  try {
    if (!analyticsConnection) {
      getAnalyticsDb(); // Initialize connection
    }

    // Log the full SQL query with parameters for debugging
    logger.info('Executing analytics query', { 
      sql: query,
      parameters: params,
      paramCount: params.length 
    });

    const startTime = Date.now();
    // Use postgres template literal syntax
    const result = await analyticsConnection!.unsafe(query, params);
    const duration = Date.now() - startTime;

    logger.info('Analytics query executed successfully', { 
      duration,
      rowCount: result.length,
      sampleData: result.length > 0 ? result[0] : null
    });

    return result as T[];
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Analytics query execution failed', { 
      error: errorMessage,
      query: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
    });
    
    throw new Error(`Analytics query failed: ${errorMessage}`);
  }
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
      logger.info('Analytics database connections closed');
    }
  } catch (error) {
    logger.error('Error closing analytics database connections', { error });
  }
};

// Cleanup on process termination
if (typeof process !== 'undefined') {
  process.on('beforeExit', closeAnalyticsDb);
  process.on('SIGINT', closeAnalyticsDb);
  process.on('SIGTERM', closeAnalyticsDb);
}
