#!/usr/bin/env node
/**
 * Flush Redis Cache (Direct Connection)
 * 
 * Usage: node scripts/flush-redis.mjs
 * 
 * Connects directly to Redis and flushes datasource cache keys
 */

import Redis from 'ioredis';
import { readFileSync } from 'fs';

// Parse .env.local manually
const envFile = readFileSync('.env.local', 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    env[match[1]] = match[2];
  }
});

console.log('🔌 Connecting to Redis...');
console.log(`   Host: ${env.REDIS_HOST}`);

const client = new Redis({
  host: env.REDIS_HOST,
  port: parseInt(env.REDIS_PORT, 10),
  username: env.REDIS_USERNAME,
  password: env.REDIS_PASSWORD,
  tls: env.REDIS_TLS === 'true' ? {} : undefined,
  retryStrategy: () => null, // Don't retry on error
});

client.on('error', err => {
  console.error('❌ Redis error:', err);
  process.exit(1);
});

async function main() {
  try {
    // ioredis auto-connects, just wait for ready
    await new Promise((resolve, reject) => {
      client.once('ready', resolve);
      client.once('error', reject);
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });
    
    console.log('✅ Connected to Redis');
    
    // Use SCAN instead of KEYS (required for AWS ElastiCache Serverless)
    // Flush all V2 cache keys (both old format and new with hash tags)
    const patterns = [
      '*cache:ds:*',      // Old format
      '*cache:{ds:*',     // New format with hash tags
      '*idx:ds:*',        // Old format
      '*idx:{ds:*',       // New format with hash tags
      '*cache:meta:ds:*', // Old format
      '*cache:meta:{ds:*',// New format with hash tags
      '*temp:*',          // Temp keys (all formats)
      '*rate*',   //rate limiters
      '*', //everything
    ];
    const allKeys = new Set();
    
    for (const pattern of patterns) {
      console.log(`\n🔍 Scanning for ${pattern} keys...`);
      let cursor = '0';
      let count = 0;
      
      do {
        const result = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 1000);
        cursor = result[0];
        result[1].forEach(k => allKeys.add(k));
        count += result[1].length;
      } while (cursor !== '0');
      
      console.log(`   Found ${count} keys`);
    }
    
    const keys = Array.from(allKeys);
    console.log(`\n📊 Total cache keys to delete: ${keys.length}`);
    
    if (keys.length > 0) {
      // Delete all keys using pipeline (Redis cluster compatible)
      console.log('\n🗑️  Deleting keys...');
      const pipeline = client.pipeline();
      
      keys.forEach(key => {
        pipeline.del(key);
      });
      
      const results = await pipeline.exec();
      const deleted = results.filter(([err, result]) => err === null && result === 1).length;
      
      console.log(`✅ Deleted ${deleted} cache keys`);
    } else {
      console.log('ℹ️  No cache keys found');
    }
    
    // Verify deletion
    console.log('\n🔍 Verifying deletion...');
    const remainingKeys = [];
    for (const pattern of patterns) {
      let cursor = '0';
      do {
        const result = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 1000);
        cursor = result[0];
        remainingKeys.push(...result[1]);
      } while (cursor !== '0');
    }
    
    console.log(`✅ Cache cleared! Remaining keys: ${remainingKeys.length}`);
    
    client.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    client.disconnect();
    process.exit(1);
  }
}

main();

