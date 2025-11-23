/**
 * Check Expansion Dimensions Configuration
 *
 * Diagnostic script to verify expansion dimensions are configured correctly
 * in both database and Redis cache.
 *
 * Usage:
 *   pnpm tsx scripts/check-expansion-dimensions.ts [dataSourceId]
 *
 * Examples:
 *   pnpm tsx scripts/check-expansion-dimensions.ts        # Check all data sources
 *   pnpm tsx scripts/check-expansion-dimensions.ts 2      # Check data source 2
 */

import { db } from '@/lib/db';
import { chart_data_sources, chart_data_source_columns } from '@/lib/db/schema';
import { chartConfigCache } from '@/lib/cache/chart-config-cache';
import { redisClient } from '@/lib/cache/redis-client';
import { eq, and } from 'drizzle-orm';
import { log } from '@/lib/logger';

async function checkExpansionDimensions(dataSourceId?: number) {
  try {
    console.log('🔍 Checking Expansion Dimensions Configuration\n');

    // Get data sources to check
    const dataSources = await db
      .select({
        id: chart_data_sources.data_source_id,
        name: chart_data_sources.data_source_name,
        tableName: chart_data_sources.table_name,
      })
      .from(chart_data_sources)
      .where(
        dataSourceId
          ? eq(chart_data_sources.data_source_id, dataSourceId)
          : eq(chart_data_sources.is_active, true)
      );

    if (dataSources.length === 0) {
      console.log('❌ No data sources found');
      return;
    }

    for (const ds of dataSources) {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`Data Source: ${ds.name} (ID: ${ds.id})`);
      console.log(`Table: ${ds.tableName}`);
      console.log(`${'='.repeat(80)}\n`);

      // 1. Check database columns
      console.log('📊 DATABASE COLUMNS:');
      const dbColumns = await db
        .select({
          columnName: chart_data_source_columns.column_name,
          displayName: chart_data_source_columns.display_name,
          isExpansionDimension: chart_data_source_columns.is_expansion_dimension,
          expansionDisplayName: chart_data_source_columns.expansion_display_name,
          sortOrder: chart_data_source_columns.sort_order,
        })
        .from(chart_data_source_columns)
        .where(
          and(
            eq(chart_data_source_columns.data_source_id, ds.id),
            eq(chart_data_source_columns.is_active, true)
          )
        )
        .orderBy(chart_data_source_columns.sort_order);

      const expansionDims = dbColumns.filter((col) => col.isExpansionDimension);

      if (expansionDims.length === 0) {
        console.log('  ❌ No expansion dimensions configured in database');
      } else {
        console.log(`  ✅ Found ${expansionDims.length} expansion dimension(s):`);
        for (const dim of expansionDims) {
          console.log(
            `     - ${dim.columnName} (display: "${dim.expansionDisplayName || dim.displayName}", sort_order: ${dim.sortOrder})`
          );
        }
      }

      // 2. Check Redis cache
      console.log('\n💾 REDIS CACHE:');
      const cacheKey = `chartconfig:datasource:${ds.id}`;
      const cacheExists = (await redisClient.exists(cacheKey)) === 1;

      if (!cacheExists) {
        console.log(`  ℹ️  No cache entry found (key: ${cacheKey})`);
        console.log('     Cache will be populated on first request');
      } else {
        console.log(`  ✅ Cache entry exists (key: ${cacheKey})`);

        // Get cached data
        const cachedConfig = await chartConfigCache.getDataSourceConfig(ds.id);

        if (!cachedConfig) {
          console.log('  ❌ Failed to read cache data');
        } else {
          const cachedExpansionDims = cachedConfig.columns.filter((col) => col.isExpansionDimension);

          if (cachedExpansionDims.length === 0) {
            console.log('  ❌ No expansion dimensions in cache (STALE DATA!)');
            console.log('     🔧 Run: pnpm tsx scripts/clear-chart-config-cache.ts');
          } else {
            console.log(`  ✅ Found ${cachedExpansionDims.length} expansion dimension(s) in cache:`);
            for (const dim of cachedExpansionDims) {
              console.log(
                `     - ${dim.columnName} (display: "${dim.expansionDisplayName || dim.displayName}", sort_order: ${dim.sortOrder})`
              );
            }

            // Compare database vs cache
            const dbDimNames = new Set(expansionDims.map((d) => d.columnName));
            const cacheDimNames = new Set(cachedExpansionDims.map((d) => d.columnName));

            const missingInCache = expansionDims.filter((d) => !cacheDimNames.has(d.columnName));
            const extraInCache = cachedExpansionDims.filter((d) => !dbDimNames.has(d.columnName));

            if (missingInCache.length > 0 || extraInCache.length > 0) {
              console.log('\n  ⚠️  MISMATCH between database and cache:');
              if (missingInCache.length > 0) {
                console.log('     Missing in cache:', missingInCache.map((d) => d.columnName).join(', '));
              }
              if (extraInCache.length > 0) {
                console.log('     Extra in cache:', extraInCache.map((d) => d.columnName).join(', '));
              }
              console.log('     🔧 Run: pnpm tsx scripts/clear-chart-config-cache.ts');
            } else {
              console.log('\n  ✅ Database and cache are in sync');
            }
          }

          // Show cache age
          if (cachedConfig.cachedAt) {
            const ageMinutes = Math.floor((Date.now() - cachedConfig.cachedAt) / 1000 / 60);
            console.log(`\n  📅 Cache age: ${ageMinutes} minutes`);
          }
        }
      }
    }

    console.log(`\n${'='.repeat(80)}\n`);

  } catch (error) {
    log.error('Failed to check expansion dimensions', error as Error, {
      dataSourceId,
      component: 'check-dimensions-script',
    });
    console.error('❌ Error:', error);
    throw error;
  } finally {
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
checkExpansionDimensions(dataSourceId)
  .then(() => {
    console.log('✅ Check complete\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Check failed:', error.message);
    process.exit(1);
  });
