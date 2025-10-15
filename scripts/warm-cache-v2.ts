#!/usr/bin/env tsx
/**
 * Warm V2 Cache for All Data Sources
 * 
 * This script warms the Redis V2 cache by fetching all data from each
 * analytics data source and populating the cache with secondary index sets.
 * 
 * Usage:
 *   pnpm tsx scripts/warm-cache-v2.ts
 */

// Load environment variables from .env.local
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { dataSourceCache } from '@/lib/cache/data-source-cache';
import { chartConfigService } from '@/lib/services/chart-config-service';

async function warmAllCaches() {
  console.log('🔥 Starting V2 cache warming for all data sources...\n');
  
  const startTime = Date.now();
  
  try {
    // Get all active data sources
    const dataSources = await chartConfigService.getAllDataSources();
    
    if (dataSources.length === 0) {
      console.log('⚠️  No data sources found');
      return;
    }
    
    console.log(`Found ${dataSources.length} data source(s) to warm\n`);
    
    let totalEntriesCached = 0;
    let totalRows = 0;
    let successCount = 0;
    
    // Warm each data source
    for (const ds of dataSources) {
      console.log(`📊 Warming cache for: ${ds.name} (ID: ${ds.id})`);
      console.log(`   Schema: ${ds.schemaName}, Table: ${ds.tableName}`);
      
      try {
        const result = await dataSourceCache.warmDataSource(ds.id);
        
        if (result.skipped) {
          console.log(`   ⏭️  Skipped (already warming in progress)`);
        } else {
          console.log(`   ✅ Success!`);
          console.log(`      - Entries cached: ${result.entriesCached.toLocaleString()}`);
          console.log(`      - Total rows: ${result.totalRows.toLocaleString()}`);
          console.log(`      - Duration: ${result.duration}ms`);
          
          totalEntriesCached += result.entriesCached;
          totalRows += result.totalRows;
          successCount++;
        }
      } catch (error) {
        console.error(`   ❌ Failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      
      console.log('');
    }
    
    // Summary
    const totalDuration = Date.now() - startTime;
    
    console.log('━'.repeat(60));
    console.log('📈 Cache Warming Summary');
    console.log('━'.repeat(60));
    console.log(`✅ Data sources warmed:  ${successCount}/${dataSources.length}`);
    console.log(`📦 Cache entries created: ${totalEntriesCached.toLocaleString()}`);
    console.log(`📊 Total rows processed:  ${totalRows.toLocaleString()}`);
    console.log(`⏱️  Total duration:        ${(totalDuration / 1000).toFixed(2)}s`);
    console.log('━'.repeat(60));
    
    if (successCount === dataSources.length) {
      console.log('\n🎉 All caches warmed successfully!');
      console.log('   Your dashboards will now load from Redis cache.\n');
    } else {
      console.log('\n⚠️  Some caches failed to warm. Check errors above.\n');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run the script
warmAllCaches()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });

