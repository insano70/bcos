#!/usr/bin/env tsx
/**
 * Debug SINTERSTORE issue
 */

// Load environment variables from .env.local
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { getRedisClient } from '@/lib/redis';

async function debugIndexIntersection() {
  console.log('🔍 Debugging SINTERSTORE issue...\n');
  
  const redis = getRedisClient();
  
  if (!redis) {
    console.log('❌ Redis client not available');
    return;
  }
  
  try {
    const index1 = 'idx:{ds:3}:m:Cancellations:freq:Weekly';
    const index2 = 'idx:{ds:3}:m:Cancellations:p:114:freq:Weekly';
    
    console.log(`📋 Index 1: ${index1}`);
    const keys1 = await redis.smembers(index1);
    console.log(`   Members: ${keys1.length}`);
    if (keys1.length > 0) {
      console.log(`   Sample: ${keys1.slice(0, 3).join(', ')}`);
    }
    console.log('');
    
    console.log(`📋 Index 2: ${index2}`);
    const keys2 = await redis.smembers(index2);
    console.log(`   Members: ${keys2.length}`);
    if (keys2.length > 0) {
      console.log(`   Sample: ${keys2.slice(0, 3).join(', ')}`);
    }
    console.log('');
    
    // Try the intersection (temp key also needs hash tag)
    const tempKey = 'temp:{ds:3}:debug:intersection';
    console.log('🔄 Performing SINTERSTORE...');
    await redis.sinterstore(tempKey, index1, index2);
    
    const intersection = await redis.smembers(tempKey);
    console.log(`   Result: ${intersection.length} keys`);
    
    if (intersection.length > 0) {
      console.log('   ✅ Intersection successful!');
      console.log(`   Keys: ${intersection.join(', ')}`);
    } else {
      console.log('   ❌ Intersection returned 0 keys!');
      console.log('   This means the two index sets have NO common members.\n');
      
      // Check if keys2 are in keys1
      console.log('📊 Checking overlap:');
      const set1 = new Set(keys1);
      const overlap = keys2.filter(k => set1.has(k));
      console.log(`   Keys from index2 that are in index1: ${overlap.length}`);
      
      if (overlap.length === 0) {
        console.log('   ❌ NO OVERLAP - This is the problem!');
        console.log('   Index 1 and Index 2 contain completely different keys.');
      }
    }
    
    await redis.del(tempKey);
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

debugIndexIntersection()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });

