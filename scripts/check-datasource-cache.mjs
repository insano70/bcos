#!/usr/bin/env node
/**
 * Check cache for specific data source
 */

import Redis from 'ioredis';
import { readFileSync } from 'fs';

const dataSourceId = process.argv[2] ? parseInt(process.argv[2], 10) : null;

if (!dataSourceId) {
  console.error('Usage: node scripts/check-datasource-cache.mjs <data_source_id>');
  process.exit(1);
}

const envFile = readFileSync('.env.local', 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    env[match[1]] = match[2];
  }
});

const client = new Redis({
  host: env.REDIS_HOST,
  port: parseInt(env.REDIS_PORT, 10),
  username: env.REDIS_USERNAME,
  password: env.REDIS_PASSWORD,
  tls: env.REDIS_TLS === 'true' ? {} : undefined,
  retryStrategy: () => null,
});

async function main() {
  try {
    await new Promise((resolve, reject) => {
      client.once('ready', resolve);
      client.once('error', reject);
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });
    
    console.log(`🔍 Checking cache for data source ${dataSourceId}...\n`);
    
    const pattern = `datasource:${dataSourceId}:*`;
    const keys = [];
    let cursor = '0';
    
    do {
      const result = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = result[0];
      keys.push(...result[1]);
    } while (cursor !== '0');
    
    console.log(`📊 Found ${keys.length} cache keys\n`);
    
    if (keys.length === 0) {
      console.log('ℹ️  No cache entries found for this data source');
      console.log('💡 This means queries either:');
      console.log('   1. Haven\'t been executed yet');
      console.log('   2. Are failing before reaching the cache');
      console.log('   3. Are bypassing the cache (nocache=true)\n');
    } else {
      for (const key of keys) {
        const value = await client.get(key);
        if (value) {
          const parsed = JSON.parse(value);
          console.log(`Key: ${key}`);
          console.log(`  Rows: ${parsed.rowCount}`);
          console.log(`  Cached: ${parsed.cachedAt}`);
          if (parsed.rows && parsed.rows.length > 0) {
            const sample = parsed.rows[0];
            console.log(`  Sample:`, {
              measure: sample.measure,
              date: sample.date_value || sample.date_index,
              value: sample.numeric_value || sample.measure_value,
            });
          }
          console.log('');
        }
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

