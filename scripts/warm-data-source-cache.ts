/**
 * Cache Warming Script for Data Source Cache
 * 
 * Run via: pnpm tsx scripts/warm-data-source-cache.ts
 * Schedule: Every 4 hours (via cron or AWS EventBridge)
 * 
 * Purpose: Pre-populate Redis cache with fresh data from analytics tables
 * Timing: Runs after data updates (1-2x daily) to ensure fresh cache
 * 
 * Features:
 * - Warms all active data sources
 * - Distributed locking (prevents concurrent warming)
 * - Comprehensive logging
 * - Exit codes for monitoring
 */

import { dataSourceCache } from '@/lib/cache';
import { log } from '@/lib/logger';

async function main() {
  try {
    log.info('Cache warming job started');

    const result = await dataSourceCache.warmAllDataSources();

    log.info('Cache warming job completed successfully', result);

    console.log(JSON.stringify({
      success: true,
      ...result,
    }, null, 2));

    process.exit(0);
  } catch (error) {
    log.error('Cache warming job failed', error);

    console.error(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, null, 2));

    process.exit(1);
  }
}

main();

