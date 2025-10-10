# Redis Maxmemory Configuration for AWS Valkey

**Document:** Production Infrastructure Configuration
**Service:** AWS Valkey Serverless (Redis-compatible cache)
**Priority:** HIGH (Required before production deployment)
**Estimated Time:** 30 minutes

---

## Overview

This document describes the required memory management configuration for AWS Valkey to prevent unbounded cache growth, ensure performance, and control costs.

---

## Why This is Critical

Without proper memory limits and eviction policies:

❌ **Security Risk:** Unbounded cache growth could exhaust memory
❌ **Performance Risk:** Redis becomes slow when memory is full
❌ **Cost Risk:** AWS charges for memory usage - could escalate
❌ **Availability Risk:** Redis could crash from OOM (Out of Memory)

---

## Required Configuration

### 1. Set Maximum Memory Limit

Configure Valkey to limit memory usage based on your workload:

**Recommended Settings by Environment:**

```
Development:   1 GB  (light usage, testing)
Staging:       2 GB  (production-like testing)
Production:    4 GB  (full application load)
```

### 2. Set Eviction Policy

Configure how Redis handles memory pressure when the limit is reached:

**Recommended Policy:** `allkeys-lru` (Least Recently Used)

This policy:
- ✅ Evicts least recently used keys across ALL keys
- ✅ Works well for general caching (our use case)
- ✅ Automatically removes stale cached data
- ✅ No manual intervention needed

**Alternative Policies:**
- `volatile-lru`: Only evicts keys with TTL set (not recommended - all our keys have TTL)
- `allkeys-lfu`: Evicts least frequently used (good for hotspot detection, more complex)
- `noeviction`: Returns errors when memory full (NOT recommended for caching)

---

## Configuration Methods

### Method 1: AWS Valkey Console (Recommended for Quick Setup)

1. **Open AWS Console** → Navigate to ElastiCache → Serverless Caches
2. **Select your Valkey cache** (e.g., `bcos-dev-valkey`)
3. **Click "Modify"**
4. **Find "Parameter Group"** or **"Advanced Settings"**
5. **Set the following parameters:**
   ```
   maxmemory: 2gb
   maxmemory-policy: allkeys-lru
   ```
6. **Click "Modify"**
7. **Note:** Changes may require cache restart (plan accordingly)

### Method 2: AWS CDK Infrastructure Code (Recommended for Production)

Update your CDK infrastructure to include these settings:

```typescript
// infrastructure/lib/valkey-stack.ts

import * as cdk from 'aws-cdk-lib';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';

export class ValkeyStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const environment = process.env.ENVIRONMENT || 'dev';

    // Memory limits by environment
    const memoryLimits = {
      dev: '1gb',
      staging: '2gb',
      production: '4gb',
    };

    const maxmemory = memoryLimits[environment as keyof typeof memoryLimits] || '1gb';

    // Create parameter group for Valkey configuration
    const parameterGroup = new elasticache.CfnParameterGroup(this, 'ValkeyParameterGroup', {
      cacheParameterGroupFamily: 'valkey7',
      description: `Valkey parameter group for ${environment}`,
      properties: {
        'maxmemory': maxmemory,
        'maxmemory-policy': 'allkeys-lru',
      },
    });

    // Create Valkey Serverless cache
    const valkeyCache = new elasticache.CfnServerlessCache(this, 'ValkeyCache', {
      engine: 'valkey',
      serverlessCacheName: `bcos-${environment}-valkey`,
      description: `BendCare OS ${environment} Redis-compatible cache`,

      // Apply parameter group
      cacheUsageLimits: {
        dataStorage: {
          maximum: maxmemory === '1gb' ? 1 : maxmemory === '2gb' ? 2 : 4,
          unit: 'GB',
        },
      },

      // Security
      securityGroupIds: [securityGroup.securityGroupId],
      subnetIds: vpc.privateSubnets.map(subnet => subnet.subnetId),

      // Encryption
      userGroupId: userGroup.userGroupId,
    });

    // Output connection details
    new cdk.CfnOutput(this, 'ValkeyEndpoint', {
      value: valkeyCache.attrEndpointAddress,
      description: 'Valkey connection endpoint',
    });
  }
}
```

### Method 3: AWS CLI (One-Time Configuration)

```bash
# For existing cache, modify parameter group
aws elasticache modify-serverless-cache \
  --serverless-cache-name bcos-dev-valkey \
  --cache-usage-limits DataStorage='{Maximum=2,Unit=GB}' \
  --region us-east-1

# Note: maxmemory-policy is typically set via parameter group
```

---

## Verification

After applying configuration, verify settings:

### Using Redis CLI

```bash
# Connect to Valkey
redis-cli -h your-valkey-endpoint.amazonaws.com -p 6379 \
  --tls --user your-username -a your-password

# Check maxmemory
CONFIG GET maxmemory
# Expected: "maxmemory" "2147483648" (2GB in bytes)

# Check eviction policy
CONFIG GET maxmemory-policy
# Expected: "maxmemory-policy" "allkeys-lru"

# Check current memory usage
INFO memory
# Look for: used_memory_human, maxmemory_human
```

### Using Monitoring Script

Add this to your test script:

```typescript
// scripts/verify-redis-config.ts
import { getRedisClient } from '@/lib/cache/redis-client';

async function verifyConfig() {
  const client = getRedisClient();
  if (!client) {
    console.error('Redis not available');
    return;
  }

  const maxmemory = await client.config('GET', 'maxmemory');
  const policy = await client.config('GET', 'maxmemory-policy');
  const info = await client.info('memory');

  console.log('✅ Redis Configuration:');
  console.log(`   Max Memory: ${maxmemory[1]} bytes (${formatBytes(Number(maxmemory[1]))})`);
  console.log(`   Eviction Policy: ${policy[1]}`);
  console.log(`\n📊 Memory Usage:`);
  console.log(info);
}

function formatBytes(bytes: number): string {
  const gb = bytes / (1024 ** 3);
  return `${gb.toFixed(2)} GB`;
}

verifyConfig();
```

---

## Monitoring & Alerts

### CloudWatch Metrics to Monitor

Set up alerts for these metrics:

```
1. DatabaseMemoryUsagePercentage > 80%
   Alert: Warning - approaching memory limit

2. DatabaseMemoryUsagePercentage > 90%
   Alert: Critical - need to increase limit or investigate cache usage

3. Evictions > 100/minute
   Alert: Warning - cache is actively evicting data (may need more memory)

4. CacheHitRate < 80%
   Alert: Warning - poor cache efficiency (investigate TTL settings)
```

### CloudWatch Logs Insights Query

```
# Find cache eviction events
fields @timestamp, @message
| filter @message like /evict/i
| sort @timestamp desc
| limit 100
```

---

## Testing the Configuration

### Test 1: Verify Memory Limit Works

```typescript
// Fill cache to test eviction
const client = getRedisClient();
const largeValue = 'x'.repeat(1024 * 1024); // 1MB string

for (let i = 0; i < 3000; i++) {
  await client.set(`test:${i}`, largeValue, 'EX', 3600);

  if (i % 100 === 0) {
    const info = await client.info('memory');
    console.log(`Iteration ${i}: ${info}`);
  }
}

// Verify old keys were evicted
const key0Exists = await client.exists('test:0');
console.log(`First key still exists: ${key0Exists === 1}`);
// Expected: false (evicted by LRU)
```

---

## Troubleshooting

### Problem: "OOM command not allowed when used memory > 'maxmemory'"

**Cause:** Memory limit reached and eviction policy prevents writes

**Solution:**
1. Check if policy is set to `noeviction` (wrong)
2. Increase maxmemory limit
3. Reduce TTL values to expire data faster
4. Investigate what's consuming memory

### Problem: High eviction rate

**Symptoms:** CloudWatch shows constant evictions

**Solutions:**
1. **Increase memory limit** (most common solution)
2. **Reduce cache TTL** for less critical data
3. **Review cache key patterns** (ensure no memory leaks)
4. **Implement cache size monitoring** in application

### Problem: Cache performance degraded

**Symptoms:** Slow response times, high CPU

**Check:**
1. Memory usage approaching limit
2. Eviction rate too high
3. Too many keys in cache (millions+)

**Solutions:**
1. Increase memory
2. Implement key expiration more aggressively
3. Use cache key prefixes to segment data

---

## Cost Impact

AWS Valkey Serverless pricing is based on memory used:

```
Development (1GB):   ~$23/month
Staging (2GB):       ~$47/month
Production (4GB):    ~$94/month
```

**Cost vs. Savings:**
- Redis cost: ~$94/month (production)
- RDS savings: ~$200-300/month (reduced load)
- ECS savings: ~$150/month (fewer instances needed)
- **Net savings: ~$256-356/month**

---

## Implementation Checklist

Before production deployment:

- [ ] Configure maxmemory for dev environment (1GB)
- [ ] Configure maxmemory for staging environment (2GB)
- [ ] Configure maxmemory for production environment (4GB)
- [ ] Set eviction policy to `allkeys-lru` (all environments)
- [ ] Verify configuration using Redis CLI
- [ ] Set up CloudWatch alarms for memory usage
- [ ] Run eviction test to ensure it works
- [ ] Document configuration in infrastructure code
- [ ] Add memory monitoring to health check endpoint

---

## References

- [AWS Valkey Documentation](https://docs.aws.amazon.com/memorydb/latest/devguide/what-is.html)
- [Redis maxmemory Policy](https://redis.io/docs/manual/eviction/)
- [AWS ElastiCache Best Practices](https://docs.aws.amazon.com/AmazonElastiCache/latest/red-ug/BestPractices.html)

---

## Contact

For questions about this configuration:
- **Infrastructure:** See infrastructure team
- **Application:** See backend team
- **Security:** Ensure all credentials are properly managed

---

**Last Updated:** 2025-10-10
**Status:** Required before production deployment
**Priority:** HIGH
