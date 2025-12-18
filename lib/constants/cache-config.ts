/**
 * Cache Configuration Constants
 *
 * Centralized configuration for the caching system.
 * All timing, sizing, and threshold constants are defined here
 * to ensure consistency across all cache services.
 */

/**
 * Cache TTL (Time To Live) Configuration
 */
export const CACHE_TTL = {
  /** Default cache TTL in seconds (48 hours) */
  DEFAULT_SECONDS: 172800,
  
  /** Default cache TTL in hours */
  DEFAULT_HOURS: 48,
} as const;

/**
 * Cache Warming Configuration
 */
export const CACHE_WARMING = {
  /** 
   * Staleness threshold in hours
   * Cache is considered stale if older than this
   */
  STALE_THRESHOLD_HOURS: 4,
  
  /**
   * Proactive warming threshold in hours
   * Background scheduler warms when cache is older than this
   * to stay ahead of staleness threshold
   */
  PROACTIVE_WARM_THRESHOLD_HOURS: 3,
  
  /**
   * Background scheduler check interval in milliseconds
   * How often to check if cache needs warming
   */
  CHECK_INTERVAL_MS: 30 * 60 * 1000, // 30 minutes
  
  /**
   * Initial delay before first warming check in milliseconds
   * Allows app to fully start before checking
   */
  INITIAL_DELAY_MS: 15000, // 15 seconds
  
  /**
   * Rate limit cooldown in seconds
   * Minimum time between auto-warming triggers per datasource
   */
  RATE_LIMIT_SECONDS: 6 * 60, // 6 minutes
  
  /**
   * Distributed lock TTL for warming operations in seconds
   */
  LOCK_TTL_SECONDS: 300, // 5 minutes
  
  /**
   * Scheduler lock TTL in seconds
   * Prevents multiple instances from checking simultaneously
   */
  SCHEDULER_LOCK_TTL_SECONDS: 120, // 2 minutes
  
  /**
   * Warming lock TTL in seconds
   * Prevents overlapping warming operations
   */
  WARMING_LOCK_TTL_SECONDS: 900, // 15 minutes
  
  /**
   * Worker thread timeout in milliseconds
   */
  WORKER_TIMEOUT_MS: 10 * 60 * 1000, // 10 minutes
} as const;

/**
 * Cache Size Limits
 */
export const CACHE_LIMITS = {
  /**
   * Maximum rows for table-based data source queries
   */
  MAX_TABLE_ROWS: 100000,
  
  /**
   * Maximum size for a single cache entry in bytes (100MB)
   * Prevents memory issues with very large entries
   */
  MAX_ENTRY_SIZE_BYTES: 100 * 1024 * 1024,
  
  /**
   * Maximum cache size per entry in bytes (1GB)
   * For table-based datasets
   */
  MAX_CACHE_SIZE_BYTES: 1024 * 1024 * 1024,
  
  /**
   * Maximum rows per cache entry
   */
  MAX_ROWS_PER_ENTRY: 1000000,
  
  /**
   * Maximum SCAN iterations to prevent infinite loops
   */
  MAX_SCAN_ITERATIONS: 10000,
} as const;

/**
 * Pipeline and Batch Configuration
 */
export const CACHE_BATCHING = {
  /**
   * Batch size for Redis pipeline writes
   * Reduced from 5000 to prevent RangeError: Invalid string length
   */
  PIPELINE_BATCH_SIZE: 500,
  
  /**
   * Maximum keys for MGET operations
   */
  QUERY_BATCH_SIZE: 10000,
  
  /**
   * SCAN count per iteration
   */
  SCAN_COUNT: 1000,
} as const;

/**
 * Redis Connection Configuration
 */
export const REDIS_CONFIG = {
  /**
   * Maximum retries per request
   */
  MAX_RETRIES_PER_REQUEST: 3,
  
  /**
   * Idle connection timeout in seconds
   */
  IDLE_TIMEOUT_SECONDS: 30,
  
  /**
   * Connection timeout in seconds
   */
  CONNECT_TIMEOUT_SECONDS: 10,
  
  /**
   * Maximum retry attempts before giving up
   */
  MAX_RETRY_ATTEMPTS: 10,
} as const;

/**
 * Database Connection Pool Configuration for Worker Threads
 */
export const WORKER_DB_CONFIG = {
  /**
   * Maximum connections for main database in worker
   */
  MAIN_DB_MAX_CONNECTIONS: 2,
  
  /**
   * Maximum connections for analytics database in worker
   */
  ANALYTICS_DB_MAX_CONNECTIONS: 3,
} as const;






