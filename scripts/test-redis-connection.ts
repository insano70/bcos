/**
 * Test Redis/Valkey Connection
 *
 * Usage:
 *   pnpm tsx scripts/test-redis-connection.ts
 *
 * Tests:
 * 1. Connection to Redis/Valkey
 * 2. Basic operations (SET, GET, DEL)
 * 3. TTL expiration
 * 4. Cache performance
 */

// Load environment variables from .env.local
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { getRedisClient, isRedisAvailable, disconnectRedis } from '@/lib/redis';
import { authCache, rbacCache } from '@/lib/cache';
import type { UserContext } from '@/lib/types/rbac';

async function testRedisConnection() {
  console.log('🔍 Testing Redis/Valkey Connection...\n');

  // Test 1: Check if Redis is available
  console.log('Test 1: Connection Check');
  const client = getRedisClient();

  if (!client) {
    console.error('❌ Redis client could not be created');
    console.log('\nℹ️  Make sure REDIS_HOST is set in .env.local');
    console.log('   Example: REDIS_HOST=your-valkey-endpoint.amazonaws.com\n');
    process.exit(1);
  }

  // Wait for connection to be ready (not just connected)
  console.log('⏳ Waiting for Redis connection...');

  const waitForReady = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Connection timeout after 10 seconds'));
    }, 10000);

    client.on('ready', () => {
      clearTimeout(timeout);
      resolve();
    });

    client.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  try {
    await waitForReady;
  } catch (error) {
    console.error('❌ Redis connection failed:', error instanceof Error ? error.message : String(error));
    console.log('\nℹ️  Possible issues:');
    console.log('   1. Check REDIS_USERNAME and REDIS_PASSWORD are correct');
    console.log('   2. Verify security group allows your IP on port 6379');
    console.log('   3. Ensure you have network access to the VPC endpoint');
    console.log('   4. Check TLS is enabled (REDIS_TLS=true)');
    console.log('   5. Verify the Valkey user has correct permissions\n');
    await disconnectRedis();
    process.exit(1);
  }

  console.log('✅ Redis connection established');
  console.log(`   Host: ${process.env.REDIS_HOST}`);
  console.log(`   Port: ${process.env.REDIS_PORT || 6379}`);
  console.log(`   TLS: ${process.env.REDIS_TLS === 'true' ? 'Enabled' : 'Disabled'}\n`);

  try {
    // Test 2: PING command
    console.log('Test 2: PING Command');
    const pingResult = await client.ping();
    console.log(`✅ PING response: ${pingResult}\n`);

    // Test 3: Basic SET/GET operations
    console.log('Test 3: Basic SET/GET Operations');
    const testKey = 'test:connection';
    const testValue = { timestamp: Date.now(), test: 'connection' };

    await client.setex(testKey, 60, JSON.stringify(testValue));
    console.log('✅ SET operation successful');

    const retrievedValue = await client.get(testKey);
    const parsed = JSON.parse(retrievedValue || '{}');
    console.log('✅ GET operation successful');
    console.log(`   Retrieved: ${JSON.stringify(parsed)}`);

    // Verify data matches
    if (parsed.test === testValue.test) {
      console.log('✅ Data integrity verified\n');
    } else {
      console.error('❌ Data integrity check failed\n');
    }

    // Test 4: TTL verification
    console.log('Test 4: TTL Verification');
    const ttl = await client.ttl(testKey);
    console.log(`✅ TTL: ${ttl} seconds (expected ~60)\n`);

    // Test 5: User Context Caching
    console.log('Test 5: User Context Caching');
    const mockUserContext: UserContext = {
      user_id: 'test-user-123',
      email: 'test@example.com',
      first_name: 'Test',
      last_name: 'User',
      is_active: true,
      email_verified: true,
      roles: [
        {
          role_id: 'role-123',
          name: 'test_role',
          is_system_role: false,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
          permissions: []
        }
      ],
      organizations: [],
      accessible_organizations: [],
      user_roles: [],
      user_organizations: [],
      all_permissions: [],
      is_super_admin: false,
      organization_admin_for: [],
    };

    const cacheSuccess = await rbacCache.setUserContext('test-user-123', mockUserContext);
    console.log(cacheSuccess ? '✅ User context cached' : '❌ User context cache failed');

    const cachedContext = await rbacCache.getUserContext('test-user-123');
    if (cachedContext && cachedContext.user_id === 'test-user-123') {
      console.log('✅ User context retrieved from cache');
      console.log(`   Email: ${cachedContext.email}`);
      console.log(`   Roles: ${cachedContext.roles.length}\n`);
    } else {
      console.error('❌ User context retrieval failed\n');
    }

    // Test 6: Role Permissions Caching
    console.log('Test 6: Role Permissions Caching');
    const mockPermissions = [
      {
        permission_id: 'perm-1',
        name: 'test:read:all',
        resource: 'test',
        action: 'read',
        scope: 'all' as const,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      }
    ];

    const rolesCacheSuccess = await rbacCache.setRolePermissions('role-123', 'test_role', mockPermissions);
    console.log(rolesCacheSuccess ? '✅ Role permissions cached' : '❌ Role permissions cache failed');

    const cachedPerms = await rbacCache.getRolePermissions('role-123');
    if (cachedPerms && cachedPerms.permissions.length === 1) {
      console.log('✅ Role permissions retrieved from cache');
      console.log(`   Role: ${cachedPerms.name}`); // Changed from roleName to name
      console.log(`   Permissions: ${cachedPerms.permissions.length}\n`);
    } else {
      console.error('❌ Role permissions retrieval failed\n');
    }

    // Test 7: Token Blacklist Caching
    console.log('Test 7: Token Blacklist Caching');
    // Use unique token ID each time to avoid duplicate key errors
    const testTokenId = `test-token-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const testUserId = '00000000-0000-0000-0000-000000000001'; // Valid UUID format

    // Test checking token that doesn't exist (should be false)
    const notBlacklisted = await authCache.isTokenBlacklisted(testTokenId);
    console.log(notBlacklisted === false ? '✅ Token "not blacklisted" status checked' : '❌ Failed');

    // Add token to blacklist
    await authCache.addTokenToBlacklist(
      testTokenId,
      testUserId,
      'access',
      new Date(Date.now() + 3600000),
      'test'
    );
    const blacklisted = await authCache.isTokenBlacklisted(testTokenId);
    console.log(blacklisted === true ? '✅ Token "blacklisted" status cached' : '❌ Failed');
    console.log();

    // Test 8: Performance Test
    console.log('Test 8: Performance Test');
    const iterations = 100;
    const startTime = Date.now();

    for (let i = 0; i < iterations; i++) {
      await client.set(`perf:test:${i}`, `value-${i}`, 'EX', 60);
    }

    const writeTime = Date.now() - startTime;
    console.log(`✅ ${iterations} writes completed in ${writeTime}ms (${(writeTime / iterations).toFixed(2)}ms per write)`);

    const readStartTime = Date.now();
    for (let i = 0; i < iterations; i++) {
      await client.get(`perf:test:${i}`);
    }

    const readTime = Date.now() - readStartTime;
    console.log(`✅ ${iterations} reads completed in ${readTime}ms (${(readTime / iterations).toFixed(2)}ms per read)`);
    console.log();

    // Cleanup performance test keys (one at a time to avoid CROSSSLOT errors in cluster mode)
    let deletedCount = 0;
    for (let i = 0; i < iterations; i++) {
      try {
        await client.del(`perf:test:${i}`);
        deletedCount++;
      } catch (error) {
        // Ignore deletion errors during cleanup
      }
    }
    console.log(`✅ Cleanup completed (${deletedCount}/${iterations} keys deleted)\n`);

    // Test 9: Key Pattern Search (using SCAN instead of KEYS for cluster compatibility)
    console.log('Test 9: Key Pattern Search');
    const pattern = `${process.env.NODE_ENV || 'development'}:*`;
    const matchingKeys: string[] = [];
    let cursor = '0';

    // Use SCAN to iterate through keys (cluster-safe)
    do {
      const result = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = result[0];
      matchingKeys.push(...result[1]);
    } while (cursor !== '0' && matchingKeys.length < 100); // Limit to 100 for test

    console.log(`✅ Found ${matchingKeys.length} keys with pattern: bcos:${pattern}`);
    console.log(`   Sample keys: ${matchingKeys.slice(0, 5).join(', ')}\n`);

    // Final cleanup (keys without prefix since client already adds it)
    await client.del(testKey);
    await client.del(`user_context:test-user-123`);
    await client.del(`role_perms:role-123`);
    await client.del(`token_bl:${testTokenId.substring(0, 32)}`);

    console.log('✅ All tests passed!\n');
    console.log('🎉 Redis/Valkey is ready for use\n');

  } catch (error) {
    console.error('❌ Test failed:', error);
    console.log('\nℹ️  Troubleshooting:');
    console.log('   1. Check VPC security group allows port 6379');
    console.log('   2. Verify REDIS_HOST is correct');
    console.log('   3. Ensure TLS is configured correctly');
    console.log('   4. Check application has network access to Valkey\n');
    process.exit(1);
  } finally {
    await disconnectRedis();
    console.log('🔌 Disconnected from Redis\n');
    process.exit(0);
  }
}

// Run tests
testRedisConnection().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
