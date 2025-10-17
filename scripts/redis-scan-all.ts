#!/usr/bin/env tsx

/**
 * Scan ALL Redis Keys to See What Exists
 */

import path from 'node:path';
// Load environment variables from .env.local
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { getRedisClient } from '@/lib/redis';

async function scanAllKeys() {
  console.log('🔍 Scanning ALL Redis Keys...\n');

  const redis = getRedisClient();

  if (!redis) {
    console.log('❌ Redis client not available');
    return;
  }

  try {
    // Count keys by pattern (with hash tags)
    const patterns = [
      '*cache:{ds:1}:*',
      '*cache:{ds:3}:*',
      '*idx:{ds:1}:*',
      '*idx:{ds:3}:*',
      '*cache:meta:*',
    ];

    for (const pattern of patterns) {
      console.log(`📦 Scanning for "${pattern}"...`);
      let cursor = '0';
      let count = 0;
      const samples: string[] = [];

      do {
        const result = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 1000);
        cursor = result[0];
        const keys = result[1];
        count += keys.length;

        if (samples.length < 3) {
          samples.push(...keys.slice(0, 3 - samples.length));
        }

        if (cursor === '0') break;
      } while (cursor !== '0');

      console.log(`   Found ${count} keys`);
      if (samples.length > 0) {
        console.log(`   Samples:`);
        for (const key of samples) {
          console.log(`     - ${key}`);
        }
      }
      console.log('');
    }
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

scanAllKeys()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
