/**
 * Clear Chart Configuration Cache
 *
 * Clears Redis cache for chart data source configurations.
 * Use this after updating data source columns (like adding expansion dimensions).
 *
 * Usage:
 *   pnpm tsx scripts/clear-chart-config-cache.ts [dataSourceId]
 *
 * Examples:
 *   pnpm tsx scripts/clear-chart-config-cache.ts        # Clear all chart config cache
 *   pnpm tsx scripts/clear-chart-config-cache.ts 2      # Clear only data source 2
 */

import { chartConfigCache } from '@/lib/cache/chart-config-cache';
import { log } from '@/lib/logger';
import { redisClient } from '@/lib/cache/redis-client';

async function clearChartConfigCache(dataSourceId?: number) {
  try {
    log.info('Starting chart config cache clear', {
      dataSourceId: dataSourceId || 'all',
      component: 'cache-clear-script',
    });

    if (dataSourceId) {
      // Clear specific data source
      const key = `chartconfig:datasource:${dataSourceId}`;
      await redisClient.del(key);

      log.info('Cleared data source cache', {
        dataSourceId,
        key,
        component: 'cache-clear-script',
      });

      console.log(`✅ Cleared cache for data source ${dataSourceId}`);
    } else {
      // Clear all chart config cache
      const pattern = 'chartconfig:*';
      const keys = await redisClient.keys(pattern);

      if (keys.length === 0) {
        log.info('No chart config cache keys found', {
          pattern,
          component: 'cache-clear-script',
        });
        console.log('ℹ️  No cache keys found to clear');
        return;
      }

      // Delete all keys
      await redisClient.del(...keys);

      log.info('Cleared all chart config cache', {
        keysCleared: keys.length,
        keys,
        component: 'cache-clear-script',
      });

      console.log(`✅ Cleared ${keys.length} chart config cache keys`);
      console.log('Keys cleared:', keys);
    }

    // Verify cache is empty
    const remainingKeys = dataSourceId
      ? await redisClient.keys(`chartconfig:datasource:${dataSourceId}`)
      : await redisClient.keys('chartconfig:*');

    if (remainingKeys.length > 0) {
      console.warn('⚠️  Some keys still remain:', remainingKeys);
    } else {
      console.log('✅ Cache cleared successfully, no keys remaining');
    }

  } catch (error) {
    log.error('Failed to clear chart config cache', error as Error, {
      dataSourceId,
      component: 'cache-clear-script',
    });
    console.error('❌ Error clearing cache:', error);
    throw error;
  } finally {
    // Close Redis connection
    await redisClient.quit();
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const dataSourceId = args[0] ? parseInt(args[0], 10) : undefined;

if (dataSourceId && Number.isNaN(dataSourceId)) {
  console.error('❌ Invalid data source ID. Must be a number.');
  process.exit(1);
}

// Run the script
clearChartConfigCache(dataSourceId)
  .then(() => {
    console.log('\n✅ Cache clear complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Cache clear failed:', error.message);
    process.exit(1);
  });
