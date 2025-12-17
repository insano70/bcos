/**
 * Background Cache Warming Scheduler
 *
 * Runs inside the Node.js process on an interval, but spawns warming
 * in a separate worker thread to avoid blocking the main thread.
 *
 * MULTI-INSTANCE SAFETY:
 * Uses Redis distributed lock to ensure only one ECS instance
 * performs the warming check and spawns the worker at a time.
 *
 * TIMING:
 * - Checks every 30 minutes if cache is getting stale
 * - Warms proactively when cache is > 3 hours old
 * - This ensures cache never exceeds the 4-hour staleness threshold
 *
 * ISOLATION:
 * - Scheduler runs in main thread (lightweight, just checks age)
 * - Actual warming runs in worker thread (isolated V8)
 * - Main thread returns immediately after spawning worker
 */

import { log } from '@/lib/logger';
import { getRedisClient } from '@/lib/redis';
import { spawnWarmingWorker, isWorkerThreadsSupported } from './warming-worker-launcher';
import { CACHE_WARMING } from '@/lib/constants/cache-config';

/**
 * Configuration from centralized constants
 */
const CHECK_INTERVAL_MS = CACHE_WARMING.CHECK_INTERVAL_MS;
const WARM_IF_OLDER_THAN_HOURS = CACHE_WARMING.PROACTIVE_WARM_THRESHOLD_HOURS;
const SCHEDULER_LOCK_TTL_SECONDS = CACHE_WARMING.SCHEDULER_LOCK_TTL_SECONDS;
const WARMING_LOCK_TTL_SECONDS = CACHE_WARMING.WARMING_LOCK_TTL_SECONDS;
const INITIAL_DELAY_MS = CACHE_WARMING.INITIAL_DELAY_MS;

/**
 * Internal state
 */
let intervalId: NodeJS.Timeout | null = null;
let isCheckRunning = false;
let isWarmingInProgress = false;
let currentWarmingLockValue: string | null = null;

/**
 * Check if cache needs warming and spawn worker if necessary
 *
 * This function is lightweight - it only checks cache age metadata.
 * The heavy lifting happens in the worker thread.
 */
async function checkAndWarm(): Promise<void> {
  // Prevent overlapping checks
  if (isCheckRunning) {
    log.debug('Background warming check skipped - check already running', {
      component: 'background-warming-scheduler',
    });
    return;
  }

  // Prevent spawning new worker if one is already running
  if (isWarmingInProgress) {
    log.debug('Background warming check skipped - warming already in progress', {
      component: 'background-warming-scheduler',
    });
    return;
  }

  isCheckRunning = true;
  const checkStartTime = Date.now();

  try {
    const client = getRedisClient();
    if (!client) {
      log.debug('Redis not available, skipping background warming check', {
        component: 'background-warming-scheduler',
      });
      return;
    }

    // Try to acquire scheduler lock (prevents multiple instances from checking)
    const schedulerLockKey = 'cache:background-warming:scheduler-lock';
    const lockAcquired = await client.set(
      schedulerLockKey,
      new Date().toISOString(),
      'EX',
      SCHEDULER_LOCK_TTL_SECONDS,
      'NX'
    );

    if (lockAcquired !== 'OK') {
      log.debug('Another instance is handling background warming check', {
        component: 'background-warming-scheduler',
      });
      return;
    }

    log.info('Background warming check started', {
      component: 'background-warming-scheduler',
    });

    // Check if any data source cache needs warming
    const shouldWarm = await shouldWarmCache(client);

    if (!shouldWarm) {
      log.debug('Background warming check complete - all caches are fresh', {
        checkDuration: Date.now() - checkStartTime,
        component: 'background-warming-scheduler',
      });
      return;
    }

    // Try to acquire warming lock (prevents overlapping warming operations)
    // Use unique value to enable safe lock release (only release if we own it)
    const warmingLockKey = 'cache:background-warming:warming-lock';
    const lockValue = `${process.pid}:${Date.now()}:${Math.random().toString(36).substring(2, 8)}`;
    const warmingLockAcquired = await client.set(
      warmingLockKey,
      lockValue,
      'EX',
      WARMING_LOCK_TTL_SECONDS,
      'NX'
    );

    if (warmingLockAcquired !== 'OK') {
      log.info('Warming already in progress on another instance', {
        component: 'background-warming-scheduler',
      });
      return;
    }
    
    // Store lock value for safe release
    currentWarmingLockValue = lockValue;

    log.info('Cache needs warming - spawning worker thread', {
      threshold: `${WARM_IF_OLDER_THAN_HOURS} hours`,
      component: 'background-warming-scheduler',
    });

    // Mark warming as in progress
    isWarmingInProgress = true;

    // Spawn worker thread - this returns immediately
    // The worker runs in isolation and sends results via message
    spawnWarmingWorker()
      .then((result) => {
        if (result.success) {
          log.info('Background warming completed successfully', {
            dataSourcesWarmed: result.dataSourcesWarmed,
            totalEntriesCached: result.totalEntriesCached,
            totalRows: result.totalRows,
            duration: result.duration,
            component: 'background-warming-scheduler',
          });
        } else {
          // Note: result.error is already a string from the worker, no need to wrap in Error
          log.warn('Background warming failed', {
            error: result.error || 'Unknown error',
            duration: result.duration,
            component: 'background-warming-scheduler',
          });
        }
      })
      .catch((error) => {
        log.error('Background warming worker error', error, {
          component: 'background-warming-scheduler',
        });
      })
      .finally(async () => {
        isWarmingInProgress = false;

        // Release warming lock - only if we still own it
        // This prevents accidentally releasing a lock that was taken over after TTL expiry
        try {
          const releaseClient = getRedisClient();
          if (releaseClient && currentWarmingLockValue) {
            // Check if we still own the lock before releasing
            const currentValue = await releaseClient.get(warmingLockKey);
            if (currentValue === currentWarmingLockValue) {
              await releaseClient.del(warmingLockKey);
              log.debug('Warming lock released successfully', {
                component: 'background-warming-scheduler',
              });
            } else {
              log.warn('Lock ownership changed - skipping release', {
                expectedValue: currentWarmingLockValue,
                actualValue: currentValue ? '[different]' : '[null]',
                component: 'background-warming-scheduler',
              });
            }
          }
        } catch (releaseError) {
          log.warn('Error releasing warming lock', {
            error: releaseError instanceof Error ? releaseError.message : String(releaseError),
            component: 'background-warming-scheduler',
          });
        } finally {
          currentWarmingLockValue = null;
        }
      });

    log.info('Worker thread spawned - main thread continues', {
      checkDuration: Date.now() - checkStartTime,
      component: 'background-warming-scheduler',
    });
  } catch (error) {
    log.error('Background warming check failed', error instanceof Error ? error : new Error(String(error)), {
      checkDuration: Date.now() - checkStartTime,
      component: 'background-warming-scheduler',
    });
  } finally {
    isCheckRunning = false;
  }
}

/**
 * Check if any data source cache needs warming
 *
 * @param client - Redis client
 * @returns true if any cache is stale
 */
async function shouldWarmCache(client: ReturnType<typeof getRedisClient>): Promise<boolean> {
  if (!client) return false;

  try {
    // Get all data source metadata keys
    // IMPORTANT: ioredis keyPrefix is NOT automatically applied to SCAN patterns,
    // so we must include the prefix in the pattern. SCAN returns full keys (with prefix),
    // but single-key operations like GET auto-prepend the prefix, so we must strip it
    // from SCAN results before using them.
    const keyPrefix = client.options.keyPrefix || '';
    const pattern = `${keyPrefix}cache:meta:{ds:*}:last_warm`;
    const keys: string[] = [];
    let cursor = '0';

    // SCAN for metadata keys (efficient, non-blocking)
    do {
      const [newCursor, foundKeys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = newCursor;
      keys.push(...foundKeys);
    } while (cursor !== '0');

    if (keys.length === 0) {
      // No cache metadata = cold cache, needs warming
      log.info('No cache metadata found - cache is cold', {
        component: 'background-warming-scheduler',
      });
      return true;
    }

    // Check age of each data source's cache
    for (const key of keys) {
      // Strip prefix from SCAN result - GET will add it automatically
      const keyWithoutPrefix = keyPrefix ? key.replace(keyPrefix, '') : key;
      const cached = await client.get(keyWithoutPrefix);
      if (!cached) {
        log.info('Missing cache metadata for key', {
          key,
          component: 'background-warming-scheduler',
        });
        return true;
      }

      try {
        const metadata = JSON.parse(cached);
        const timestamp = Array.isArray(metadata) ? metadata[0]?.timestamp : metadata.timestamp;

        if (!timestamp) {
          log.info('Invalid cache metadata - missing timestamp', {
            key,
            component: 'background-warming-scheduler',
          });
          return true;
        }

        const ageHours = (Date.now() - new Date(timestamp).getTime()) / (1000 * 60 * 60);

        if (ageHours > WARM_IF_OLDER_THAN_HOURS) {
          log.info('Cache is getting stale - needs proactive warming', {
            key,
            ageHours: Math.round(ageHours * 10) / 10,
            threshold: WARM_IF_OLDER_THAN_HOURS,
            component: 'background-warming-scheduler',
          });
          return true;
        }
      } catch {
        log.info('Failed to parse cache metadata', {
          key,
          component: 'background-warming-scheduler',
        });
        return true;
      }
    }

    return false;
  } catch (error) {
    log.error('Failed to check cache age', error instanceof Error ? error : new Error(String(error)), {
      component: 'background-warming-scheduler',
    });
    return false; // Don't warm on error - safer to skip
  }
}

/**
 * Start the background warming scheduler
 *
 * Call this once during app initialization.
 * The scheduler will:
 * 1. Run an initial check after a short delay
 * 2. Continue checking every 30 minutes
 * 3. Spawn worker threads for warming (never blocks main thread)
 */
export function startBackgroundWarmingScheduler(): void {
  // Check if worker threads are supported
  if (!isWorkerThreadsSupported()) {
    log.error('Worker threads not supported - background warming disabled', new Error('Worker threads unavailable'), {
      component: 'background-warming-scheduler',
    });
    return;
  }

  if (intervalId) {
    log.warn('Background warming scheduler already running', {
      component: 'background-warming-scheduler',
    });
    return;
  }

  log.info('Starting background warming scheduler', {
    checkIntervalMinutes: CHECK_INTERVAL_MS / 60000,
    warmIfOlderThanHours: WARM_IF_OLDER_THAN_HOURS,
    component: 'background-warming-scheduler',
  });

  // Run initial check after a short delay (let app fully start)
  setTimeout(() => {
    checkAndWarm().catch((error) => {
      log.error('Initial warming check failed', error, {
        component: 'background-warming-scheduler',
      });
    });
  }, INITIAL_DELAY_MS);

  // Then run on interval
  intervalId = setInterval(() => {
    checkAndWarm().catch((error) => {
      log.error('Scheduled warming check failed', error, {
        component: 'background-warming-scheduler',
      });
    });
  }, CHECK_INTERVAL_MS);

  // Prevent interval from keeping the process alive during shutdown
  intervalId.unref();
}

/**
 * Stop the background warming scheduler
 *
 * Call this during graceful shutdown.
 */
export function stopBackgroundWarmingScheduler(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    log.info('Background warming scheduler stopped', {
      component: 'background-warming-scheduler',
    });
  }
}

/**
 * Check if the scheduler is currently running
 */
export function isSchedulerRunning(): boolean {
  return intervalId !== null;
}

/**
 * Check if a warming operation is currently in progress
 */
export function isWarmingCurrentlyInProgress(): boolean {
  return isWarmingInProgress;
}

