#!/usr/bin/env node
/**
 * Debug Cache Script
 * 
 * Usage: node scripts/debug-cache.mjs
 * 
 * Shows what's in the Redis cache and helps diagnose issues
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

const client = new Redis({
  host: env.REDIS_HOST,
  port: parseInt(env.REDIS_PORT, 10),
  username: env.REDIS_USERNAME,
  password: env.REDIS_PASSWORD,
  tls: env.REDIS_TLS === 'true' ? {} : undefined,
  retryStrategy: () => null,
});

client.on('error', err => {
  console.error('❌ Redis error:', err);
  process.exit(1);
});

async function main() {
  try {
    await new Promise((resolve, reject) => {
      client.once('ready', resolve);
      client.once('error', reject);
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });
    
    console.log('✅ Connected to Redis\n');
    
    // Scan for datasource keys
    const keys = [];
    let cursor = '0';
    
    do {
      const result = await client.scan(cursor, 'MATCH', 'datasource:*', 'COUNT', 100);
      cursor = result[0];
      keys.push(...result[1]);
    } while (cursor !== '0');
    
    console.log(`📊 Found ${keys.length} cache keys\n`);
    
    if (keys.length === 0) {
      console.log('ℹ️  No cache keys found - cache is empty\n');
      console.log('💡 This means either:');
      console.log('   1. Cache hasn\'t been populated yet (first request)');
      console.log('   2. data_source_id is not being passed to queries');
      console.log('   3. Queries are bypassing the cache (nocache=true)\n');
    } else {
      console.log('🔍 Cache entries:\n');
      
      for (const key of keys.slice(0, 10)) { // Show first 10
        const value = await client.get(key);
        if (value) {
          const parsed = JSON.parse(value);
          console.log(`Key: ${key}`);
          console.log(`  Rows: ${parsed.rowCount}`);
          console.log(`  Size: ${Math.round(parsed.sizeBytes / 1024)} KB`);
          console.log(`  Cached: ${parsed.cachedAt}`);
          console.log(`  Expires: ${parsed.expiresAt}`);
          
          // Show a sample row
          if (parsed.rows && parsed.rows.length > 0) {
            const sampleRow = parsed.rows[0];
            console.log(`  Sample data:`, {
              measure: sampleRow.measure,
              practice_uid: sampleRow.practice_uid,
              provider_uid: sampleRow.provider_uid,
              frequency: sampleRow.frequency || sampleRow.time_period,
              date: sampleRow.date_index || sampleRow.date_value,
            });
          }
          console.log('');
        }
      }
      
      if (keys.length > 10) {
        console.log(`... and ${keys.length - 10} more keys\n`);
      }
    }
    
    client.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    client.disconnect();
    process.exit(1);
  }
}

main();

