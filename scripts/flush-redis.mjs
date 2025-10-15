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
    const keys = [];
    let cursor = '0';
    
    console.log('\n🔍 Scanning for datasource:* keys...');
    do {
      const result = await client.scan(cursor, 'MATCH', 'datasource:*', 'COUNT', 100);
      cursor = result[0];
      keys.push(...result[1]);
    } while (cursor !== '0');
    
    console.log(`📊 Found ${keys.length} cache keys to delete`);
    
    if (keys.length > 0) {
      // Delete all datasource keys (in batches to avoid command too large)
      const batchSize = 100;
      let deleted = 0;
      
      for (let i = 0; i < keys.length; i += batchSize) {
        const batch = keys.slice(i, i + batchSize);
        const result = await client.del(...batch);
        deleted += result;
      }
      
      console.log(`✅ Deleted ${deleted} cache keys`);
    } else {
      console.log('ℹ️  No cache keys found');
    }
    
    // Verify deletion
    cursor = '0';
    const remainingKeys = [];
    do {
      const result = await client.scan(cursor, 'MATCH', 'datasource:*', 'COUNT', 100);
      cursor = result[0];
      remainingKeys.push(...result[1]);
    } while (cursor !== '0');
    
    console.log(`\n✅ Cache cleared! Remaining keys: ${remainingKeys.length}`);
    
    client.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    client.disconnect();
    process.exit(1);
  }
}

main();

