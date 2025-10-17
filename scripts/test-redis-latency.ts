#!/usr/bin/env tsx

/**
 * Detailed Redis latency analysis
 * Tests individual operations to identify performance bottlenecks
 */

import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { disconnectRedis, getRedisClient } from '@/lib/redis';

async function testLatency() {
  console.log('🔍 Redis Latency Analysis\n');

  const client = getRedisClient();
  if (!client) {
    console.error('❌ Redis client not available');
    process.exit(1);
  }

  // Wait for connection
  await new Promise<void>((resolve) => {
    client.on('ready', resolve);
  });

  const results: {
    operation: string;
    min: number;
    max: number;
    avg: number;
    p50: number;
    p95: number;
    p99: number;
  }[] = [];

  // Test 1: PING latency
  console.log('Test 1: PING Latency (100 operations)');
  const pingLatencies: number[] = [];
  for (let i = 0; i < 100; i++) {
    const start = Date.now();
    await client.ping();
    pingLatencies.push(Date.now() - start);
  }
  console.log(`  Min: ${Math.min(...pingLatencies)}ms`);
  console.log(`  Max: ${Math.max(...pingLatencies)}ms`);
  console.log(
    `  Avg: ${(pingLatencies.reduce((a, b) => a + b, 0) / pingLatencies.length).toFixed(2)}ms`
  );
  console.log(`  P95: ${percentile(pingLatencies, 95)}ms`);
  console.log(`  P99: ${percentile(pingLatencies, 99)}ms\n`);

  results.push({
    operation: 'PING',
    min: Math.min(...pingLatencies),
    max: Math.max(...pingLatencies),
    avg: pingLatencies.reduce((a, b) => a + b, 0) / pingLatencies.length,
    p50: percentile(pingLatencies, 50),
    p95: percentile(pingLatencies, 95),
    p99: percentile(pingLatencies, 99),
  });

  // Test 2: GET latency (small value)
  console.log('Test 2: GET Latency - Small Value (100 operations)');
  await client.set('latency:test:small', 'test-value', 'EX', 60);
  const getSmallLatencies: number[] = [];
  for (let i = 0; i < 100; i++) {
    const start = Date.now();
    await client.get('latency:test:small');
    getSmallLatencies.push(Date.now() - start);
  }
  console.log(`  Min: ${Math.min(...getSmallLatencies)}ms`);
  console.log(`  Max: ${Math.max(...getSmallLatencies)}ms`);
  console.log(
    `  Avg: ${(getSmallLatencies.reduce((a, b) => a + b, 0) / getSmallLatencies.length).toFixed(2)}ms`
  );
  console.log(`  P95: ${percentile(getSmallLatencies, 95)}ms`);
  console.log(`  P99: ${percentile(getSmallLatencies, 99)}ms\n`);

  results.push({
    operation: 'GET (small)',
    min: Math.min(...getSmallLatencies),
    max: Math.max(...getSmallLatencies),
    avg: getSmallLatencies.reduce((a, b) => a + b, 0) / getSmallLatencies.length,
    p50: percentile(getSmallLatencies, 50),
    p95: percentile(getSmallLatencies, 95),
    p99: percentile(getSmallLatencies, 99),
  });

  // Test 3: GET latency (large value - typical user context)
  console.log('Test 3: GET Latency - Large Value ~5KB (100 operations)');
  const largeValue = JSON.stringify({
    user_id: 'test-user',
    email: 'test@example.com',
    roles: Array.from({ length: 5 }, (_, i) => ({
      role_id: `role-${i}`,
      name: `role_${i}`,
      permissions: Array.from({ length: 20 }, (_, j) => ({
        permission_id: `perm-${j}`,
        name: `permission:action:scope_${j}`,
        resource: 'resource',
        action: 'action',
        scope: 'all',
      })),
    })),
    organizations: Array.from({ length: 3 }, (_, i) => ({ org_id: `org-${i}`, name: `Org ${i}` })),
  });
  await client.set('latency:test:large', largeValue, 'EX', 60);
  const getLargeLatencies: number[] = [];
  for (let i = 0; i < 100; i++) {
    const start = Date.now();
    await client.get('latency:test:large');
    getLargeLatencies.push(Date.now() - start);
  }
  console.log(`  Value size: ${largeValue.length} bytes`);
  console.log(`  Min: ${Math.min(...getLargeLatencies)}ms`);
  console.log(`  Max: ${Math.max(...getLargeLatencies)}ms`);
  console.log(
    `  Avg: ${(getLargeLatencies.reduce((a, b) => a + b, 0) / getLargeLatencies.length).toFixed(2)}ms`
  );
  console.log(`  P95: ${percentile(getLargeLatencies, 95)}ms`);
  console.log(`  P99: ${percentile(getLargeLatencies, 99)}ms\n`);

  results.push({
    operation: 'GET (5KB)',
    min: Math.min(...getLargeLatencies),
    max: Math.max(...getLargeLatencies),
    avg: getLargeLatencies.reduce((a, b) => a + b, 0) / getLargeLatencies.length,
    p50: percentile(getLargeLatencies, 50),
    p95: percentile(getLargeLatencies, 95),
    p99: percentile(getLargeLatencies, 99),
  });

  // Test 4: SET latency
  console.log('Test 4: SET Latency (100 operations)');
  const setLatencies: number[] = [];
  for (let i = 0; i < 100; i++) {
    const start = Date.now();
    await client.set(`latency:test:set:${i}`, `value-${i}`, 'EX', 60);
    setLatencies.push(Date.now() - start);
  }
  console.log(`  Min: ${Math.min(...setLatencies)}ms`);
  console.log(`  Max: ${Math.max(...setLatencies)}ms`);
  console.log(
    `  Avg: ${(setLatencies.reduce((a, b) => a + b, 0) / setLatencies.length).toFixed(2)}ms`
  );
  console.log(`  P95: ${percentile(setLatencies, 95)}ms`);
  console.log(`  P99: ${percentile(setLatencies, 99)}ms\n`);

  results.push({
    operation: 'SET',
    min: Math.min(...setLatencies),
    max: Math.max(...setLatencies),
    avg: setLatencies.reduce((a, b) => a + b, 0) / setLatencies.length,
    p50: percentile(setLatencies, 50),
    p95: percentile(setLatencies, 95),
    p99: percentile(setLatencies, 99),
  });

  // Test 5: Pipeline latency (10 commands)
  console.log('Test 5: Pipeline Latency - 10 commands (50 operations)');
  const pipelineLatencies: number[] = [];
  for (let i = 0; i < 50; i++) {
    const start = Date.now();
    const pipeline = client.pipeline();
    for (let j = 0; j < 10; j++) {
      pipeline.get('latency:test:small');
    }
    await pipeline.exec();
    pipelineLatencies.push(Date.now() - start);
  }
  console.log(`  Min: ${Math.min(...pipelineLatencies)}ms`);
  console.log(`  Max: ${Math.max(...pipelineLatencies)}ms`);
  console.log(
    `  Avg: ${(pipelineLatencies.reduce((a, b) => a + b, 0) / pipelineLatencies.length).toFixed(2)}ms`
  );
  console.log(
    `  Avg per command: ${(pipelineLatencies.reduce((a, b) => a + b, 0) / pipelineLatencies.length / 10).toFixed(2)}ms\n`
  );

  // Cleanup
  await client.del('latency:test:small', 'latency:test:large');
  for (let i = 0; i < 100; i++) {
    await client.del(`latency:test:set:${i}`);
  }

  // Summary
  console.log('='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(
    'Operation'.padEnd(20) +
      'Min'.padStart(8) +
      'Avg'.padStart(8) +
      'P50'.padStart(8) +
      'P95'.padStart(8) +
      'P99'.padStart(8) +
      'Max'.padStart(8)
  );
  console.log('-'.repeat(80));
  for (const result of results) {
    console.log(
      result.operation.padEnd(20) +
        `${result.min}ms`.padStart(8) +
        `${result.avg.toFixed(1)}ms`.padStart(8) +
        `${result.p50}ms`.padStart(8) +
        `${result.p95}ms`.padStart(8) +
        `${result.p99}ms`.padStart(8) +
        `${result.max}ms`.padStart(8)
    );
  }
  console.log('='.repeat(80));

  // Analysis
  console.log('\n📊 Analysis:');
  const avgPing = results.find((r) => r.operation === 'PING')?.avg;
  if (avgPing < 5) {
    console.log('✅ Excellent latency (<5ms) - typical for same-region direct connection');
  } else if (avgPing < 20) {
    console.log('⚠️  Moderate latency (5-20ms) - acceptable for VPN or cross-AZ');
  } else if (avgPing < 50) {
    console.log('⚠️  High latency (20-50ms) - VPN overhead or network issues');
  } else {
    console.log('❌ Very high latency (>50ms) - investigate network path');
  }

  console.log(`\n💡 Your baseline network latency: ~${avgPing.toFixed(1)}ms`);
  console.log('   This is the overhead added to every Redis operation.');

  await disconnectRedis();
}

function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  const value = sorted[index];
  return value ?? 0;
}

testLatency().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
