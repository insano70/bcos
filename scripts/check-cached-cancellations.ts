#!/usr/bin/env tsx

/**
 * Check if Cancellations Weekly data was cached
 */

import path from 'node:path';
// Load environment variables from .env.local
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { getRedisClient } from '@/lib/redis';

async function checkCachedCancellations() {
  console.log('🔍 Checking cached Cancellations data...\n');

  const redis = getRedisClient();

  if (!redis) {
    console.log('❌ Redis client not available');
    return;
  }

  try {
    // Check index for Cancellations + Weekly
    console.log('📋 Checking index: idx:ds:3:m:Cancellations:freq:Weekly');
    const allKeys = await redis.smembers('idx:ds:3:m:Cancellations:freq:Weekly');
    console.log(`   Found ${allKeys.length} keys in index\n`);

    if (allKeys.length > 0) {
      console.log('📦 Sample cache keys:');
      for (const key of allKeys.slice(0, 5)) {
        console.log(`   - ${key}`);
      }
      console.log('');
    }

    // Check practice-specific index
    console.log('📋 Checking index: idx:ds:3:m:Cancellations:p:114:freq:Weekly');
    const practiceKeys = await redis.smembers('idx:ds:3:m:Cancellations:p:114:freq:Weekly');
    console.log(`   Found ${practiceKeys.length} keys in index\n`);

    if (practiceKeys.length > 0) {
      console.log('📦 Cache keys for practice 114:');
      for (const key of practiceKeys) {
        console.log(`   - ${key}`);

        // Fetch the actual data
        const data = await redis.get(key);
        if (data) {
          const parsed = JSON.parse(data);
          console.log(`      ✅ Contains ${parsed.length} rows`);
        }
      }
    } else {
      console.log('   ❌ NO KEYS FOUND!');
      console.log('   This explains why the cache query is failing.\n');

      // Check what IS cached for DS #3
      console.log('📋 Checking what measures ARE cached for DS #3...');
      const allDS3Indexes = await redis.scan(0, 'MATCH', 'idx:ds:3:m:*', 'COUNT', 100);
      const indexes = allDS3Indexes[1];

      const measures = new Set<string>();
      for (const idx of indexes.slice(0, 20)) {
        const match = idx.match(/idx:ds:3:m:([^:]+):/);
        if (match?.[1]) {
          measures.add(match[1]);
        }
      }

      console.log(`   Cached measures: ${Array.from(measures).join(', ')}`);
    }
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkCachedCancellations()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
