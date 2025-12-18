/**
 * Warming Worker Shared Types
 *
 * Types shared between the worker launcher (main thread) and
 * the worker script (worker thread).
 *
 * These are kept in a separate file to avoid pulling in dependencies
 * that may not work in the worker thread context.
 */

/**
 * Configuration passed to the warming worker thread via workerData
 *
 * Contains all necessary configuration to initialize independent
 * database and Redis connections in the worker.
 *
 * SECURITY: This object contains sensitive credentials.
 * Never log this object directly.
 */
export interface WorkerConfig {
  /** Main database connection URL (Drizzle/PostgreSQL) */
  databaseUrl: string;
  
  /** Analytics database connection URL (PostgreSQL) */
  analyticsDatabaseUrl: string;
  
  /** Redis host */
  redisHost: string;
  
  /** Redis port */
  redisPort: number;
  
  /** Whether to use TLS for Redis connection */
  redisTls: boolean;
  
  /** Redis username (optional, for ACL-enabled Redis) */
  redisUsername?: string;
  
  /** Redis password (optional) */
  redisPassword?: string;
  
  /** Environment name (development, staging, production) */
  environment: string;
}

/**
 * Result returned from the warming worker via postMessage
 */
export interface WarmingWorkerResult {
  /** Whether warming completed successfully */
  success: boolean;
  
  /** Number of data sources that were warmed */
  dataSourcesWarmed: number;
  
  /** Total number of cache entries created */
  totalEntriesCached: number;
  
  /** Total rows processed across all data sources */
  totalRows: number;
  
  /** Duration of the warming operation in milliseconds */
  duration: number;
  
  /** Error message if success is false */
  error?: string;
}





