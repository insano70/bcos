#!/usr/bin/env tsx
/**
 * Check DS #3 Cache Keys Directly
 */

// Load environment variables from .env.local
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { getRedisClient } from '@/lib/redis';

async function checkDS3CacheKeys() {
  console.log('🔍 Checking DS #3 Cache Keys...\n');
  
  const redis = getRedisClient();
  
  if (!redis) {
    console.log('❌ Redis client not available');
    return;
  }
  
  try {
    // Scan for actual cache data keys (not indexes)
    console.log('📦 Scanning for cache:ds:3:* keys...');
    let cursor = '0';
    let totalKeys = 0;
    const sampleKeys: string[] = [];
    
    do {
      const result = await redis.scan(cursor, 'MATCH', 'cache:ds:3:*', 'COUNT', 1000);
      cursor = result[0];
      const keys = result[1];
      totalKeys += keys.length;
      
      if (sampleKeys.length < 10) {
        sampleKeys.push(...keys.slice(0, 10 - sampleKeys.length));
      }
      
      if (cursor === '0') break;
    } while (cursor !== '0');
    
    console.log(`   Found ${totalKeys} cache data keys`);
    console.log('');
    
    if (sampleKeys.length > 0) {
      console.log('📄 Sample Keys:');
      for (const key of sampleKeys.slice(0, 5)) {
        console.log(`   ${key}`);
      }
      console.log('');
    }
    
    // Scan for index keys
    console.log('🔑 Scanning for idx:ds:3:* keys...');
    cursor = '0';
    let totalIndexKeys = 0;
    const sampleIndexKeys: string[] = [];
    
    do {
      const result = await redis.scan(cursor, 'MATCH', 'idx:ds:3:*', 'COUNT', 1000);
      cursor = result[0];
      const keys = result[1];
      totalIndexKeys += keys.length;
      
      if (sampleIndexKeys.length < 10) {
        sampleIndexKeys.push(...keys.slice(0, 10 - sampleIndexKeys.length));
      }
      
      if (cursor === '0') break;
    } while (cursor !== '0');
    
    console.log(`   Found ${totalIndexKeys} index keys`);
    console.log('');
    
    if (sampleIndexKeys.length > 0) {
      console.log('📄 Sample Index Keys:');
      for (const key of sampleIndexKeys.slice(0, 10)) {
        console.log(`   ${key}`);
      }
      console.log('');
    }
    
    // Check what measures exist
    if (totalKeys > 0) {
      console.log('📊 Extracting Measures from Cache Keys:');
      const measures = new Set<string>();
      
      for (const key of sampleKeys) {
        const match = key.match(/cache:ds:3:m:([^:]+):/);
        if (match && match[1]) {
          measures.add(match[1]);
        }
      }
      
      console.log(`   Unique measures found: ${Array.from(measures).join(', ')}`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkDS3CacheKeys()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });

