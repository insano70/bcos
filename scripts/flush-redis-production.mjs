#!/usr/bin/env node
/**
 * Flush Redis Cache - Production/Staging (Direct Connection)
 *
 * ⚠️  DANGEROUS: This deletes ALL keys from Redis
 *
 * Usage:
 *   REDIS_HOST=xxx REDIS_PASSWORD=xxx node scripts/flush-redis-production.mjs
 *
 * Or use environment variables from shell:
 *   export REDIS_HOST=your-production-redis-host.amazonaws.com
 *   export REDIS_PORT=6379
 *   export REDIS_PASSWORD=your-password
 *   export REDIS_TLS=true
 *   node scripts/flush-redis-production.mjs
 *
 * Connects directly to Redis and deletes ALL keys.
 * Use FLUSHALL for fastest deletion, or SCAN+DEL for selective patterns.
 */

import Redis from 'ioredis';

// Get Redis config from environment variables
const config = {
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  username: process.env.REDIS_USERNAME || undefined,
  password: process.env.REDIS_PASSWORD,
  tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
  retryStrategy: () => null, // Don't retry on error
};

// Validate required config
if (!config.host) {
  console.error('❌ Error: REDIS_HOST environment variable is required');
  console.error('');
  console.error('Usage:');
  console.error('  REDIS_HOST=xxx REDIS_PASSWORD=xxx node scripts/flush-redis-production.mjs');
  process.exit(1);
}

if (!config.password) {
  console.error('❌ Error: REDIS_PASSWORD environment variable is required');
  process.exit(1);
}

console.log('⚠️  WARNING: This will delete ALL keys from Redis!');
console.log('');
console.log('🔌 Connecting to Redis...');
console.log(`   Host: ${config.host}`);
console.log(`   Port: ${config.port}`);
console.log(`   TLS:  ${config.tls ? 'enabled' : 'disabled'}`);
console.log('');

const client = new Redis(config);

client.on('error', err => {
  console.error('❌ Redis error:', err);
  process.exit(1);
});

async function main() {
  try {
    // Wait for connection
    await new Promise((resolve, reject) => {
      client.once('ready', resolve);
      client.once('error', reject);
      setTimeout(() => reject(new Error('Connection timeout after 5 seconds')), 5000);
    });

    console.log('✅ Connected to Redis');
    console.log('');

    // Get current key count
    console.log('📊 Checking current key count...');
    const dbSize = await client.dbsize();
    console.log(`   Total keys: ${dbSize.toLocaleString()}`);
    console.log('');

    if (dbSize === 0) {
      console.log('ℹ️  No keys found. Nothing to delete.');
      client.disconnect();
      process.exit(0);
    }

    // Confirm deletion
    console.log('⚠️  You are about to delete ALL Redis keys!');
    console.log('');
    console.log('🗑️  Starting deletion in 3 seconds...');
    console.log('   Press Ctrl+C to cancel');
    console.log('');

    await new Promise(resolve => setTimeout(resolve, 3000));

    // Use FLUSHALL for fastest deletion
    console.log('🗑️  Executing FLUSHALL...');
    const startTime = Date.now();

    await client.flushall();

    const duration = Date.now() - startTime;
    console.log(`✅ All keys deleted in ${duration}ms`);
    console.log('');

    // Verify deletion
    console.log('🔍 Verifying deletion...');
    const finalCount = await client.dbsize();
    console.log(`   Remaining keys: ${finalCount}`);
    console.log('');

    if (finalCount === 0) {
      console.log('✅ Redis is now empty');
    } else {
      console.log(`⚠️  Warning: ${finalCount} keys still remain`);
    }

    client.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    client.disconnect();
    process.exit(1);
  }
}

main();
