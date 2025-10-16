#!/usr/bin/env tsx
/**
 * Diagnose Redis V2 Cache Keys
 */

// Load environment variables from .env.local
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { getRedisClient } from '@/lib/redis';

async function diagnoseCache() {
  console.log('🔍 Diagnosing Redis V2 Cache...\n');
  
  const redis = getRedisClient();
  
  if (!redis) {
    console.log('❌ Redis client not available');
    return;
  }
  
  try {
    // Check cache metadata
    console.log('📊 Checking Cache Metadata:');
    const ds1Meta = await redis.get('cache:meta:ds:1:last_warm');
    const ds3Meta = await redis.get('cache:meta:ds:3:last_warm');
    console.log(`   DS #1 (Practice Analytics): ${ds1Meta || 'NOT WARMED'}`);
    console.log(`   DS #3 (App Measures): ${ds3Meta || 'NOT WARMED'}`);
    console.log('');
    
    // Sample some index sets
    console.log('🔑 Checking Index Sets:');
    const idx1 = await redis.smembers('idx:ds:1:m:Charges by Provider:freq:Monthly');
    console.log(`   idx:ds:1:m:Charges by Provider:freq:Monthly: ${idx1.length} keys`);
    
    const idx3 = await redis.smembers('idx:ds:3:m:Cancellations:freq:Monthly');
    console.log(`   idx:ds:3:m:Cancellations:freq:Monthly: ${idx3.length} keys`);
    
    const idx3Weekly = await redis.smembers('idx:ds:3:m:Cancellations:freq:Weekly');
    console.log(`   idx:ds:3:m:Cancellations:freq:Weekly: ${idx3Weekly.length} keys`);
    console.log('');
    
    // Check a specific practice index
    const idx1Practice = await redis.smembers('idx:ds:1:m:Charges by Provider:p:114:freq:Monthly');
    console.log(`   idx:ds:1:m:Charges by Provider:p:114:freq:Monthly: ${idx1Practice.length} keys`);
    
    const idx3Practice = await redis.smembers('idx:ds:3:m:Cancellations:p:114:freq:Weekly');
    console.log(`   idx:ds:3:m:Cancellations:p:114:freq:Weekly: ${idx3Practice.length} keys`);
    console.log('');
    
    // Try to fetch a specific cache key
    console.log('💾 Checking Sample Cache Keys:');
    if (idx1Practice.length > 0) {
      const sampleKey = idx1Practice[0];
      if (!sampleKey) {
        console.log('   ⚠️  Sample key is undefined');
      } else {
        console.log(`   Sample key: ${sampleKey}`);
        const data = await redis.get(sampleKey);
        if (data) {
          const parsed = JSON.parse(data);
          console.log(`   ✅ Key exists, contains ${parsed.length} rows`);
          console.log(`   Sample data:`, JSON.stringify(parsed[0], null, 2).substring(0, 200) + '...');
        } else {
          console.log(`   ❌ Key not found (might have expired)`);
        }
      }
    } else {
      console.log('   ⚠️  No index keys found to sample');
    }
    
    console.log('\n');
    
    // Check for Weekly data in DS #3
    console.log('📅 Checking Frequency Values in DS #3:');
    const allDs3Keys = await redis.scan(0, 'MATCH', 'idx:ds:3:m:*:freq:*', 'COUNT', 100);
    const cursor = allDs3Keys[0];
    const keys = allDs3Keys[1];
    console.log(`   Found ${keys.length} index keys (cursor: ${cursor})`);
    
    const frequencies = new Set<string>();
    for (const key of keys) {
      const match = key.match(/:freq:([^:]+)$/);
      if (match && match[1]) {
        frequencies.add(match[1]);
      }
    }
    console.log(`   Unique frequencies: ${Array.from(frequencies).join(', ')}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

diagnoseCache()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });

