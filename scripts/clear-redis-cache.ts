#!/usr/bin/env tsx
/**
 * Clear Redis Cache Script
 * 
 * Usage: pnpm tsx scripts/clear-redis-cache.ts
 * 
 * This script clears all data source cache entries from Redis
 */

// Load environment variables first
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { dataSourceCache } from '@/lib/cache';
import { log } from '@/lib/logger';

async function main() {
  try {
    console.log('🗑️  Clearing Redis data source cache...');
    
    // Get stats before clearing
    const statsBefore = await dataSourceCache.getStats();
    console.log(`📊 Cache stats before clear:`);
    console.log(`   - Total keys: ${statsBefore.totalKeys}`);
    console.log(`   - Total memory: ${statsBefore.totalMemoryMB} MB`);
    
    // Clear the cache
    await dataSourceCache.invalidate();
    
    // Get stats after clearing
    const statsAfter = await dataSourceCache.getStats();
    console.log(`✅ Cache cleared successfully!`);
    console.log(`📊 Cache stats after clear:`);
    console.log(`   - Total keys: ${statsAfter.totalKeys}`);
    console.log(`   - Total memory: ${statsAfter.totalMemoryMB} MB`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to clear cache:', error);
    log.error('Cache clear failed', error);
    process.exit(1);
  }
}

main();

