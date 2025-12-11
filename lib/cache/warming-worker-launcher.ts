/**
 * Cache Warming Worker Launcher
 *
 * Spawns the warming worker thread and handles communication.
 * The worker runs in a separate V8 isolate, ensuring the main thread
 * is never blocked by CPU-intensive warming operations.
 *
 * USAGE:
 * ```typescript
 * import { spawnWarmingWorker } from './warming-worker-launcher';
 *
 * const result = await spawnWarmingWorker();
 * if (result.success) {
 *   console.log(`Warmed ${result.dataSourcesWarmed} data sources`);
 * }
 * ```
 */

import { Worker } from 'node:worker_threads';
import path from 'node:path';
import fs from 'node:fs';
import {
  env,
  getDatabaseConfig,
  getAnalyticsDatabaseConfig,
  getRedisConfig,
  isRedisEnabled,
} from '@/lib/env';
import { log } from '@/lib/logger';
import { CACHE_WARMING } from '@/lib/constants/cache-config';
import type { WorkerConfig, WarmingWorkerResult } from './warming-worker-types';

// Re-export WarmingWorkerResult for consumers of this module
export type { WarmingWorkerResult } from './warming-worker-types';

/**
 * Default timeout for worker execution
 * Uses centralized configuration from cache-config.ts
 */
const WORKER_TIMEOUT_MS = CACHE_WARMING.WORKER_TIMEOUT_MS;

/**
 * Patterns that might indicate credentials in error messages
 * Used to sanitize errors before logging
 */
const CREDENTIAL_PATTERNS = [
  /postgres:\/\/[^@]+@/gi,   // PostgreSQL connection strings with credentials
  /password=[^&\s]+/gi,       // Password query params
  /secret=[^&\s]+/gi,         // Secret query params
  /key=[^&\s]+/gi,            // API key params
  /token=[^&\s]+/gi,          // Token params
];

/**
 * Sanitize error messages to prevent credential exposure in logs
 *
 * SECURITY: Database connection strings and other credentials may appear
 * in error messages when connection fails. This function redacts them.
 */
function sanitizeErrorMessage(message: string): string {
  let sanitized = message;
  for (const pattern of CREDENTIAL_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }
  return sanitized;
}

/**
 * Spawn a cache warming worker thread
 *
 * The worker runs in a separate V8 isolate with its own event loop,
 * database connections, and Redis client. This ensures warming
 * operations don't block the main thread.
 *
 * @param timeoutMs - Maximum time to wait for worker (default: 10 minutes)
 * @returns Promise resolving to warming result
 */
export async function spawnWarmingWorker(
  timeoutMs: number = WORKER_TIMEOUT_MS
): Promise<WarmingWorkerResult> {
  const startTime = Date.now();

  log.info('Spawning cache warming worker thread', {
    timeoutMs,
    component: 'warming-worker-launcher',
  });

  // Build worker configuration from environment
  const workerConfig = buildWorkerConfig();

  if (!workerConfig) {
    log.error('Cannot spawn worker - missing required configuration', new Error('Missing config'), {
      component: 'warming-worker-launcher',
    });
    return {
      success: false,
      dataSourcesWarmed: 0,
      totalEntriesCached: 0,
      totalRows: 0,
      duration: Date.now() - startTime,
      error: 'Missing required environment configuration',
    };
  }

  return new Promise<WarmingWorkerResult>((resolve) => {
    let resolved = false;
    let timeoutHandle: NodeJS.Timeout | null = null;

    // Resolve helper to prevent double resolution
    const safeResolve = (result: WarmingWorkerResult) => {
      if (resolved) return;
      resolved = true;
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
      resolve(result);
    };

    try {
      // Determine worker file path based on environment
      // In development: use tsx to run TypeScript directly
      // In production: use the compiled JavaScript file
      const isDevelopment = env.NODE_ENV !== 'production';
      
      let workerPath: string;
      let execArgv: string[];
      
      if (isDevelopment) {
        // Development: Run TypeScript directly with tsx
        workerPath = path.resolve(process.cwd(), 'lib/cache/warming-worker.ts');
        execArgv = ['--import', 'tsx'];
      } else {
        // Production: Use compiled JavaScript
        // Next.js compiles server files to .next/server/
        workerPath = path.resolve(process.cwd(), '.next/server/lib/cache/warming-worker.js');
        execArgv = [];
      }

      // Verify worker file exists before attempting to spawn
      if (!fs.existsSync(workerPath)) {
        const errorMessage = `Worker script not found at: ${workerPath}`;
        log.error('Worker script not found', new Error(errorMessage), {
          workerPath,
          isDevelopment,
          cwd: process.cwd(),
          component: 'warming-worker-launcher',
        });
        
        safeResolve({
          success: false,
          dataSourcesWarmed: 0,
          totalEntriesCached: 0,
          totalRows: 0,
          duration: Date.now() - startTime,
          error: errorMessage,
        });
        return;
      }

      log.debug('Spawning worker thread', {
        workerPath,
        isDevelopment,
        component: 'warming-worker-launcher',
      });

      // Spawn worker with appropriate configuration
      const worker = new Worker(workerPath, {
        workerData: workerConfig,
        execArgv,
      });

      // Set up timeout
      timeoutHandle = setTimeout(() => {
        log.error('Cache warming worker timed out', new Error('Worker timeout'), {
          timeoutMs,
          component: 'warming-worker-launcher',
        });

        worker.terminate().catch((err) => {
          log.warn('Error terminating timed-out worker', {
            error: err instanceof Error ? err.message : String(err),
            component: 'warming-worker-launcher',
          });
        });

        safeResolve({
          success: false,
          dataSourcesWarmed: 0,
          totalEntriesCached: 0,
          totalRows: 0,
          duration: Date.now() - startTime,
          error: `Worker timed out after ${timeoutMs}ms`,
        });
      }, timeoutMs);

      // Handle worker messages (results)
      worker.on('message', (result: WarmingWorkerResult) => {
        const duration = Date.now() - startTime;

        if (result.success) {
          log.info('Cache warming worker completed successfully', {
            dataSourcesWarmed: result.dataSourcesWarmed,
            totalEntriesCached: result.totalEntriesCached,
            totalRows: result.totalRows,
            workerDuration: result.duration,
            totalDuration: duration,
            component: 'warming-worker-launcher',
          });
        } else {
          // SECURITY: Sanitize error message to prevent credential exposure
          const sanitizedError = sanitizeErrorMessage(result.error || 'Unknown error');
          log.error('Cache warming worker reported failure', new Error(sanitizedError), {
            workerDuration: result.duration,
            totalDuration: duration,
            component: 'warming-worker-launcher',
          });
        }

        // Build result with sanitized error
        const sanitizedResult: WarmingWorkerResult = {
          success: result.success,
          dataSourcesWarmed: result.dataSourcesWarmed,
          totalEntriesCached: result.totalEntriesCached,
          totalRows: result.totalRows,
          duration,
        };
        // Only add error if present (SECURITY: sanitize to prevent credential exposure)
        if (result.error) {
          sanitizedResult.error = sanitizeErrorMessage(result.error);
        }
        safeResolve(sanitizedResult);
      });

      // Handle worker errors
      worker.on('error', (error) => {
        const duration = Date.now() - startTime;

        // SECURITY: Sanitize error message to prevent credential exposure
        const sanitizedMessage = sanitizeErrorMessage(error.message);
        log.error('Cache warming worker threw an error', new Error(sanitizedMessage), {
          duration,
          component: 'warming-worker-launcher',
        });

        safeResolve({
          success: false,
          dataSourcesWarmed: 0,
          totalEntriesCached: 0,
          totalRows: 0,
          duration,
          error: sanitizedMessage,
        });
      });

      // Handle worker exit
      worker.on('exit', (code) => {
        const duration = Date.now() - startTime;

        if (code !== 0 && !resolved) {
          log.error('Cache warming worker exited with non-zero code', new Error(`Exit code: ${code}`), {
            exitCode: code,
            duration,
            component: 'warming-worker-launcher',
          });

          safeResolve({
            success: false,
            dataSourcesWarmed: 0,
            totalEntriesCached: 0,
            totalRows: 0,
            duration,
            error: `Worker exited with code ${code}`,
          });
        }
      });
    } catch (error) {
      const duration = Date.now() - startTime;

      // SECURITY: Sanitize error message to prevent credential exposure
      const rawMessage = error instanceof Error ? error.message : String(error);
      const sanitizedMessage = sanitizeErrorMessage(rawMessage);
      
      log.error('Failed to spawn cache warming worker', new Error(sanitizedMessage), {
        duration,
        component: 'warming-worker-launcher',
      });

      safeResolve({
        success: false,
        dataSourcesWarmed: 0,
        totalEntriesCached: 0,
        totalRows: 0,
        duration,
        error: sanitizedMessage,
      });
    }
  });
}

/**
 * Build worker configuration from environment variables
 *
 * Creates the configuration object passed to the worker thread via workerData.
 * The worker uses this to initialize its own database and Redis connections.
 *
 * REQUIRED ENVIRONMENT VARIABLES:
 * - DATABASE_URL: Main PostgreSQL connection string (for reading data source config)
 * - ANALYTICS_DATABASE_URL: Analytics PostgreSQL connection string (for reading source data)
 * - REDIS_HOST: Redis server hostname
 *
 * OPTIONAL ENVIRONMENT VARIABLES:
 * - REDIS_PORT: Redis port (default: 6379)
 * - REDIS_TLS: Enable TLS for Redis (default: false)
 * - REDIS_USERNAME: Redis ACL username
 * - REDIS_PASSWORD: Redis password
 * - ENVIRONMENT: Environment name for cache key prefixing (default: NODE_ENV)
 *
 * SECURITY: The returned config contains sensitive credentials.
 * Never log this object directly.
 *
 * @returns WorkerConfig object if all required env vars are present, null otherwise
 */
function buildWorkerConfig(): WorkerConfig | null {
  const dbConfig = getDatabaseConfig();
  const analyticsDbConfig = getAnalyticsDatabaseConfig();
  const redisConfig = getRedisConfig();

  if (!dbConfig.url || !analyticsDbConfig.url || !isRedisEnabled()) {
    log.warn('Missing required environment variables for worker', {
      hasDatabaseUrl: !!dbConfig.url,
      hasAnalyticsDatabaseUrl: !!analyticsDbConfig.url,
      hasRedisHost: isRedisEnabled(),
      component: 'warming-worker-launcher',
    });
    return null;
  }

  const config: WorkerConfig = {
    databaseUrl: dbConfig.url,
    analyticsDatabaseUrl: analyticsDbConfig.url,
    redisHost: redisConfig.host,
    redisPort: redisConfig.port,
    redisTls: redisConfig.tls,
    environment: env.NODE_ENV || 'development',
  };

  // Only add optional properties if they have values
  if (redisConfig.username) {
    config.redisUsername = redisConfig.username;
  }
  if (redisConfig.password) {
    config.redisPassword = redisConfig.password;
  }

  return config;
}

/**
 * Check if worker threads are supported
 */
export function isWorkerThreadsSupported(): boolean {
  try {
    require('node:worker_threads');
    return true;
  } catch {
    return false;
  }
}

