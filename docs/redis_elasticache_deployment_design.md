# AWS ElastiCache Redis Deployment Design

**Purpose:** Replace in-memory storage for OIDC state management and rate limiting to support horizontal scaling

**Date:** 2025-10-04
**Status:** Design Phase
**Target Environments:** Staging, Production

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current Architecture Problems](#current-architecture-problems)
3. [Redis Architecture Design](#redis-architecture-design)
4. [AWS ElastiCache Configuration](#aws-elasticache-configuration)
5. [Network Architecture](#network-architecture)
6. [Application Changes Required](#application-changes-required)
7. [Deployment Steps](#deployment-steps)
8. [Migration Strategy](#migration-strategy)
9. [Monitoring & Alerting](#monitoring--alerting)
10. [Cost Estimation](#cost-estimation)
11. [Disaster Recovery](#disaster-recovery)

---

## Executive Summary

### Problem Statement

Current implementation uses **in-memory storage** for two critical components:
1. **OIDC State Manager** - Prevents CSRF/replay attacks during authentication
2. **Rate Limiter** - Prevents DoS and brute force attacks

**Impact of horizontal scaling without Redis:**
- OIDC authentication fails when callback hits different ECS task than login
- Rate limits multiply by number of instances (3 tasks = 3x allowed requests)

### Solution

Deploy **AWS ElastiCache for Redis** with:
- **Cluster Mode Enabled** for high availability (production)
- **Automatic failover** with Multi-AZ replication
- **Encryption** in transit and at rest
- **Shared state** across all ECS tasks

### Benefits

✅ **Horizontal Scaling:** Add/remove ECS tasks without breaking authentication
✅ **True Rate Limiting:** Accurate limits across all instances
✅ **High Availability:** Automatic failover, no single point of failure
✅ **Zero Downtime Deploys:** Rolling deployments don't lose active sessions
✅ **Session Persistence:** OIDC flows survive instance restarts

---

## Current Architecture Problems

### Problem 1: OIDC State Manager (In-Memory Map)

**Current Implementation:**
```typescript
// lib/oidc/state-manager.ts
class StateManager {
  private states: Map<string, StateData>; // In-memory, per-instance
}
```

**Failure Scenario:**
```
User flow with 3 ECS tasks:

1. User clicks "Sign in with Microsoft"
   → Load balancer routes to ECS Task 1
   → Task 1 stores state in local Map
   → Redirects to Microsoft

2. Microsoft redirects back to /callback
   → Load balancer routes to ECS Task 2  ❌
   → Task 2 checks its local Map
   → State not found → "State token not found (expired or never registered)"
   → Authentication FAILS
```

**Current Mitigation:** `globalThis` persistence (dev only, doesn't help production)

### Problem 2: Rate Limiter (In-Memory Map)

**Current Implementation:**
```typescript
// lib/api/middleware/rate-limit.ts
class InMemoryRateLimiter {
  private store = new Map<string, RateLimitEntry>(); // Per-instance
}

export const authRateLimiter = new InMemoryRateLimiter(15 * 60 * 1000, 5);
// Intended: 5 requests per 15 minutes
```

**Failure Scenario:**
```
Attacker with 3 ECS tasks:

Task 1: 5 requests (allowed)
Task 2: 5 requests (allowed)  ❌ Should be blocked
Task 3: 5 requests (allowed)  ❌ Should be blocked

Total: 15 requests instead of 5 (3x bypass)
```

**Impact:** Rate limiting is effectively disabled with multiple instances

### Problem 3: Zero-Downtime Deployments

**Current Behavior:**
```
During rolling deployment:

Old Task (being terminated):
  - In-memory Map with active OIDC states
  - Task terminated
  - Map destroyed
  - Active login flows FAIL ❌
```

**User Experience:** Random authentication failures during deployments

---

## Redis Architecture Design

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Application Layer                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ECS Task 1│  │ECS Task 2│  │ECS Task 3│  │ECS Task N│   │
│  │  (App)   │  │  (App)   │  │  (App)   │  │  (App)   │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘   │
│       │             │             │             │          │
│       └─────────────┴─────────────┴─────────────┘          │
│                          │                                  │
└──────────────────────────┼──────────────────────────────────┘
                           │ ioredis client
                           │ (TLS encrypted)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              AWS ElastiCache for Redis                      │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │              Redis Cluster (Cluster Mode)           │    │
│  │                                                      │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐│    │
│  │  │   Shard 1   │  │   Shard 2   │  │   Shard 3   ││    │
│  │  │             │  │             │  │             ││    │
│  │  │  Primary    │  │  Primary    │  │  Primary    ││    │
│  │  │  (AZ-1)     │  │  (AZ-2)     │  │  (AZ-1)     ││    │
│  │  │             │  │             │  │             ││    │
│  │  │  Replica    │  │  Replica    │  │  Replica    ││    │
│  │  │  (AZ-2)     │  │  (AZ-1)     │  │  (AZ-2)     ││    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘│    │
│  │                                                      │    │
│  │  Auto-sharding across 3 shards                      │    │
│  │  Multi-AZ replication for HA                        │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  Encryption: TLS in-transit + KMS at-rest                   │
│  Backup: Daily snapshots to S3                              │
└─────────────────────────────────────────────────────────────┘
```

### Data Structure Design

**1. OIDC State Tokens**
```
Key Pattern:   oidc:state:{stateToken}
Value:         JSON string
TTL:           300 seconds (5 minutes)

Example:
Key:   oidc:state:AiGaLQuQn7D81Y_rEQwkggZILcb3p2QG
Value: {
  "timestamp": 1728039036298,
  "used": false,
  "nonce": "NFH_2k1qnR...",
  "returnUrl": "/dashboard",
  "fingerprint": "509e1380d10c32b4..."
}
TTL:   300
```

**2. Rate Limiting**
```
Key Pattern:   ratelimit:{type}:{ip}
Value:         Integer (request count)
TTL:           Based on window (60s for API, 900s for auth)

Examples:
Key:   ratelimit:auth:192.168.1.100
Value: 3
TTL:   900  (15 minutes)

Key:   ratelimit:api:192.168.1.100
Value: 45
TTL:   60   (1 minute)
```

**3. Optional: Session Blacklist (Future Enhancement)**
```
Key Pattern:   blacklist:access:{jti}
Value:         "1" (presence check only)
TTL:           Token expiration time

Key:   blacklist:access:gBI1VzDg7_4X97dTrrA3w
Value: "1"
TTL:   900  (15 minutes, matches access token expiry)
```

### Key Design Principles

**1. TTL-Based Expiration (No Manual Cleanup)**
- Redis automatically removes expired keys
- No background cleanup jobs needed
- Memory efficient

**2. Atomic Operations**
- Use Lua scripts for check-and-set operations
- Prevents race conditions in distributed environment
- OIDC state check-and-mark-used is atomic

**3. Key Namespacing**
- Prefix all keys (`oidc:`, `ratelimit:`, etc.)
- Enables selective flushing by pattern
- Easier monitoring and debugging

**4. Minimal Data Storage**
- Store only essential data
- OIDC: Don't store code_verifier (still in encrypted cookie)
- Rate limit: Store count only, not request details

---

## AWS ElastiCache Configuration

### Production Configuration

**Redis Version:** 7.1 (latest stable)

**Node Type Selection:**
```
cache.t4g.micro    → Dev/Test only (< 1GB memory)
cache.t4g.small    → Staging (2GB memory)
cache.r7g.large    → Production (13.07GB memory)  ✅ RECOMMENDED
cache.r7g.xlarge   → High-traffic production (26.32GB)
```

**Cluster Configuration:**
```yaml
ClusterMode: Enabled
Shards: 3
ReplicasPerShard: 1  # Multi-AZ: Primary + 1 replica
TotalNodes: 6        # 3 shards × 2 nodes (primary + replica)

MultiAZ: Enabled
AutomaticFailover: Enabled
```

**Parameter Group (Custom):**
```yaml
# /aws/elasticache/parameter-group/bendcare-redis-prod
maxmemory-policy: allkeys-lru  # Evict least recently used when full
timeout: 300                    # Close idle connections after 5 min
tcp-keepalive: 300             # TCP keepalive every 5 min
maxmemory-samples: 5           # LRU precision
notify-keyspace-events: "Ex"   # Notify on expiration events (optional)
```

**Subnet Group:**
```yaml
SubnetGroup: bendcare-redis-subnet-group
Subnets:
  - subnet-xxxxxx (us-east-1a) - Private
  - subnet-yyyyyy (us-east-1b) - Private
  - subnet-zzzzzz (us-east-1c) - Private
```

**Security Group:**
```yaml
SecurityGroup: sg-bendcare-redis
InboundRules:
  - Protocol: TCP
    Port: 6379
    Source: sg-bendcare-ecs-tasks  # ECS task security group
    Description: "ECS tasks to Redis"

OutboundRules:
  - Protocol: All
    Destination: 0.0.0.0/0
    Description: "Allow all outbound"
```

**Encryption:**
```yaml
TransitEncryption: Enabled      # TLS 1.2+
AtRestEncryption: Enabled        # AWS KMS
KmsKeyId: alias/bendcare-redis   # Custom KMS key
AuthToken: Enabled               # Redis AUTH password
```

**Backup Configuration:**
```yaml
SnapshotRetentionLimit: 7        # Keep 7 days of backups
SnapshotWindow: "03:00-05:00"    # Daily backup 3-5 AM UTC
FinalSnapshotName: bendcare-redis-final-{timestamp}
```

**Maintenance Window:**
```yaml
PreferredMaintenanceWindow: "sun:05:00-sun:07:00"  # Sunday 5-7 AM UTC
AutoMinorVersionUpgrade: true
```

**CloudWatch Alarms:**
```yaml
Alarms:
  - CPUUtilization > 75% for 5 minutes
  - FreeableMemory < 1GB
  - NetworkBytesIn > 100MB/s
  - NetworkBytesOut > 100MB/s
  - CurrConnections > 5000
  - Evictions > 0 (memory pressure)
  - ReplicationLag > 5 seconds
```

### Staging Configuration

**Node Type:** `cache.t4g.small` (2 vCPU, 2GB RAM)

**Cluster Configuration:**
```yaml
ClusterMode: Enabled
Shards: 1                # Single shard for cost savings
ReplicasPerShard: 1      # Still Multi-AZ for reliability
TotalNodes: 2            # 1 primary + 1 replica

MultiAZ: Enabled
AutomaticFailover: Enabled
```

**Cost Optimization:**
- Single shard (vs 3 in production)
- Smaller instance type
- Same reliability (Multi-AZ failover)

### Development/Local Configuration

**Option 1: Redis Container (Docker Compose)**
```yaml
# docker-compose.yml
services:
  redis:
    image: redis:7.1-alpine
    container_name: bendcare-redis-dev
    ports:
      - "6379:6379"
    command: >
      redis-server
      --maxmemory 256mb
      --maxmemory-policy allkeys-lru
      --appendonly yes
    volumes:
      - redis-data:/data
    networks:
      - bendcare-network

volumes:
  redis-data:
```

**Option 2: Local Redis Installation**
```bash
# macOS
brew install redis
brew services start redis

# Linux
sudo apt-get install redis-server
sudo systemctl start redis
```

**Environment Variable:**
```bash
REDIS_URL=redis://localhost:6379
```

---

## Network Architecture

### VPC Layout

```
┌─────────────────────────────────────────────────────────────┐
│                    VPC: bendcare-vpc                         │
│                    CIDR: 10.0.0.0/16                         │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Public Subnets (ALB)                    │   │
│  │  10.0.1.0/24 (AZ-1)  10.0.2.0/24 (AZ-2)            │   │
│  └────────────────────┬────────────────────────────────┘   │
│                       │                                      │
│                       ▼                                      │
│  ┌─────────────────────────────────────────────────────┐   │
│  │         Private Subnets (ECS Tasks)                  │   │
│  │  10.0.10.0/24 (AZ-1)  10.0.11.0/24 (AZ-2)          │   │
│  │                                                      │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐         │   │
│  │  │ECS Task 1│  │ECS Task 2│  │ECS Task 3│         │   │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘         │   │
│  │       │             │             │                │   │
│  └───────┼─────────────┼─────────────┼────────────────┘   │
│          │             │             │                     │
│          └─────────────┴─────────────┘                     │
│                        │                                    │
│                        ▼                                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │      Private Subnets (ElastiCache Redis)            │   │
│  │  10.0.20.0/24 (AZ-1)  10.0.21.0/24 (AZ-2)          │   │
│  │                                                      │   │
│  │  ┌────────────────┐    ┌────────────────┐          │   │
│  │  │ Redis Primary  │    │ Redis Replica  │          │   │
│  │  │    (AZ-1)      │    │    (AZ-2)      │          │   │
│  │  └────────────────┘    └────────────────┘          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │       Private Subnets (RDS PostgreSQL)              │   │
│  │  10.0.30.0/24 (AZ-1)  10.0.31.0/24 (AZ-2)          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Security Group Rules

**ECS Task Security Group (sg-bendcare-ecs-tasks):**
```yaml
Outbound:
  - Protocol: TCP
    Port: 6379
    Destination: sg-bendcare-redis
    Description: "Connect to Redis"

  - Protocol: TCP
    Port: 5432
    Destination: sg-bendcare-rds
    Description: "Connect to PostgreSQL"
```

**Redis Security Group (sg-bendcare-redis):**
```yaml
Inbound:
  - Protocol: TCP
    Port: 6379
    Source: sg-bendcare-ecs-tasks
    Description: "Allow ECS tasks"

Outbound:
  - Protocol: All
    Destination: 0.0.0.0/0
    Description: "Allow all outbound"
```

### Connection String Format

**Production (ElastiCache Cluster Mode):**
```
redis://username:auth-token@clustercfg.bendcare-redis-prod.xxxxx.use1.cache.amazonaws.com:6379?tls=true
```

**Staging:**
```
redis://username:auth-token@bendcare-redis-staging.xxxxx.use1.cache.amazonaws.com:6379?tls=true
```

**Development:**
```
redis://localhost:6379
```

---

## Application Changes Required

### 1. Install Redis Client

```bash
pnpm add ioredis
pnpm add -D @types/ioredis
```

### 2. Create Redis Client Singleton

**File:** `lib/redis/client.ts`

```typescript
import Redis, { RedisOptions } from 'ioredis';
import { log } from '@/lib/logger';

declare global {
  // eslint-disable-next-line no-var
  var __redisClient: Redis | undefined;
}

/**
 * Redis Client Singleton
 *
 * Uses globalThis to prevent connection pool exhaustion during
 * Next.js hot module reloading in development.
 */
function createRedisClient(): Redis {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    throw new Error('REDIS_URL environment variable not configured');
  }

  const options: RedisOptions = {
    // Connection
    connectTimeout: 10000,
    maxRetriesPerRequest: 3,

    // Reconnection strategy
    retryStrategy(times: number) {
      const delay = Math.min(times * 50, 2000);
      log.warn('Redis connection retry', { attempt: times, delay });
      return delay;
    },

    // TLS for production (ElastiCache)
    tls: process.env.NODE_ENV === 'production' ? {} : undefined,

    // Connection pooling
    lazyConnect: false, // Connect immediately
    enableReadyCheck: true,

    // Timeouts
    commandTimeout: 5000,
  };

  const client = new Redis(redisUrl, options);

  // Event handlers
  client.on('connect', () => {
    log.info('Redis client connected', {
      host: client.options.host,
      port: client.options.port,
    });
  });

  client.on('ready', () => {
    log.info('Redis client ready');
  });

  client.on('error', (error) => {
    log.error('Redis client error', {
      error: error.message,
      code: (error as any).code,
    });
  });

  client.on('close', () => {
    log.warn('Redis connection closed');
  });

  client.on('reconnecting', (delay: number) => {
    log.warn('Redis reconnecting', { delayMs: delay });
  });

  return client;
}

export function getRedisClient(): Redis {
  if (!globalThis.__redisClient) {
    globalThis.__redisClient = createRedisClient();
  }
  return globalThis.__redisClient;
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  if (globalThis.__redisClient) {
    await globalThis.__redisClient.quit();
    log.info('Redis connection closed gracefully');
  }
});
```

### 3. Redis-Backed State Manager

**File:** `lib/oidc/state-manager-redis.ts`

```typescript
import { getRedisClient } from '@/lib/redis/client';
import { log } from '@/lib/logger';
import type { StateData } from './types';

/**
 * Redis State Manager
 *
 * Distributed OIDC state token validation with one-time use enforcement.
 * Uses Redis for shared state across multiple ECS tasks.
 */
class RedisStateManager {
  private readonly STATE_TTL = 5 * 60; // 5 minutes in seconds
  private readonly KEY_PREFIX = 'oidc:state:';

  /**
   * Register State Token
   */
  async registerState(state: string, data: Omit<StateData, 'used'>): Promise<void> {
    const redis = getRedisClient();
    const key = `${this.KEY_PREFIX}${state}`;

    const value = JSON.stringify({
      ...data,
      used: false,
    });

    await redis.setex(key, this.STATE_TTL, value);

    log.debug('State token registered in Redis', {
      state: `${state.substring(0, 8)}...`,
      ttl: this.STATE_TTL,
    });
  }

  /**
   * Validate and Mark Used (Atomic Operation)
   *
   * Uses Lua script to ensure atomic check-and-set.
   * Returns true if valid and unused, false otherwise.
   */
  async validateAndMarkUsed(state: string): Promise<boolean> {
    const redis = getRedisClient();
    const key = `${this.KEY_PREFIX}${state}`;

    // Lua script for atomic check-and-set
    const luaScript = `
      local key = KEYS[1]
      local data = redis.call('GET', key)

      -- Key not found
      if not data then
        return 0
      end

      -- Parse JSON
      local obj = cjson.decode(data)

      -- Already used (replay attack)
      if obj.used then
        return -1
      end

      -- Check age (defense-in-depth, Redis TTL handles this too)
      local age = redis.call('TIME')[1] * 1000 - obj.timestamp
      if age > 330000 then  -- 5.5 minutes (TTL + buffer)
        redis.call('DEL', key)
        return -2
      end

      -- Mark as used
      obj.used = true
      redis.call('SET', key, cjson.encode(obj), 'KEEPTTL')

      return 1
    `;

    const result = await redis.eval(luaScript, 1, key) as number;

    if (result === 1) {
      log.info('State token validated and marked as used (Redis)', {
        state: `${state.substring(0, 8)}...`,
      });
      return true;
    }

    if (result === 0) {
      log.warn('State token not found in Redis (expired or never registered)', {
        state: `${state.substring(0, 8)}...`,
      });
    } else if (result === -1) {
      log.error('State token replay attempt detected (Redis)', {
        state: `${state.substring(0, 8)}...`,
      });
    } else if (result === -2) {
      log.warn('State token expired (Redis)', {
        state: `${state.substring(0, 8)}...`,
      });
    }

    return false;
  }

  /**
   * Get State Count (Monitoring)
   */
  async getStateCount(): Promise<number> {
    const redis = getRedisClient();
    const keys = await redis.keys(`${this.KEY_PREFIX}*`);
    return keys.length;
  }

  /**
   * Clear All States (Testing Only)
   */
  async clearAll(): Promise<void> {
    const redis = getRedisClient();
    const keys = await redis.keys(`${this.KEY_PREFIX}*`);

    if (keys.length > 0) {
      await redis.del(...keys);
    }

    log.warn('All state tokens cleared from Redis', { count: keys.length });
  }
}

export const redisStateManager = new RedisStateManager();
```

### 4. Redis-Backed Rate Limiter

**File:** `lib/api/middleware/rate-limit-redis.ts`

```typescript
import { getRedisClient } from '@/lib/redis/client';
import { log } from '@/lib/logger';

interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetTime: number;
}

/**
 * Redis Rate Limiter
 *
 * Distributed rate limiting with atomic counter increments.
 */
class RedisRateLimiter {
  private windowSeconds: number;
  private maxRequests: number;
  private keyPrefix: string;

  constructor(windowSeconds: number, maxRequests: number, keyPrefix: string) {
    this.windowSeconds = windowSeconds;
    this.maxRequests = maxRequests;
    this.keyPrefix = keyPrefix;
  }

  async checkLimit(identifier: string): Promise<RateLimitResult> {
    const redis = getRedisClient();
    const key = `${this.keyPrefix}:${identifier}`;

    // Lua script for atomic increment with TTL
    const luaScript = `
      local key = KEYS[1]
      local max = tonumber(ARGV[1])
      local ttl = tonumber(ARGV[2])

      local current = redis.call('INCR', key)

      if current == 1 then
        redis.call('EXPIRE', key, ttl)
      end

      local remaining = math.max(0, max - current)
      local keyTtl = redis.call('TTL', key)

      return {current, remaining, keyTtl}
    `;

    const result = await redis.eval(
      luaScript,
      1,
      key,
      this.maxRequests.toString(),
      this.windowSeconds.toString()
    ) as [number, number, number];

    const [current, remaining, ttl] = result;
    const resetTime = Date.now() + (ttl * 1000);

    const success = current <= this.maxRequests;

    if (!success) {
      log.warn('Rate limit exceeded (Redis)', {
        key,
        current,
        max: this.maxRequests,
        remaining,
        resetTime,
      });
    }

    return {
      success,
      remaining,
      resetTime,
    };
  }
}

// Rate limiter instances
export const globalRateLimiter = new RedisRateLimiter(
  15 * 60,  // 15 minutes
  100,      // 100 requests
  'ratelimit:global'
);

export const authRateLimiter = new RedisRateLimiter(
  15 * 60,  // 15 minutes
  5,        // 5 requests (strict auth limit)
  'ratelimit:auth'
);

export const apiRateLimiter = new RedisRateLimiter(
  60,       // 1 minute
  200,      // 200 requests
  'ratelimit:api'
);

export function getRateLimitKey(request: Request, prefix = ''): string {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'anonymous';
  return prefix ? `${prefix}:${ip}` : ip;
}

export async function applyRateLimit(
  request: Request,
  type: 'auth' | 'api' | 'upload' = 'api'
): Promise<{
  success: boolean;
  remaining: number;
  resetTime: number;
  limit: number;
  windowMs: number;
}> {
  const rateLimitKey = getRateLimitKey(request, type);
  let limiter = apiRateLimiter;
  let limit = 200;
  let windowMs = 60 * 1000;

  switch (type) {
    case 'auth':
      limiter = authRateLimiter;
      limit = 5;
      windowMs = 15 * 60 * 1000;
      break;
    case 'upload':
      limiter = new RedisRateLimiter(60, 10, 'ratelimit:upload');
      limit = 10;
      windowMs = 60 * 1000;
      break;
    case 'api':
      limit = 200;
      windowMs = 60 * 1000;
      break;
  }

  const result = await limiter.checkLimit(rateLimitKey);

  return {
    ...result,
    limit,
    windowMs,
  };
}
```

### 5. Environment Variables

**Add to `.env.local` (development):**
```bash
REDIS_URL=redis://localhost:6379
```

**Add to AWS Parameter Store (staging/production):**
```bash
# Staging
/bendcare/staging/redis-url

# Production
/bendcare/production/redis-url

# Value format (ElastiCache with AUTH):
redis://username:AUTH_TOKEN@clustercfg.bendcare-redis-prod.xxxxx.use1.cache.amazonaws.com:6379?tls=true
```

### 6. Update Imports

**Replace in-memory state manager:**
```typescript
// Before
import { stateManager } from '@/lib/oidc/state-manager';

// After
import { redisStateManager as stateManager } from '@/lib/oidc/state-manager-redis';
```

**Replace in-memory rate limiter:**
```typescript
// Before
import { applyRateLimit } from '@/lib/api/middleware/rate-limit';

// After
import { applyRateLimit } from '@/lib/api/middleware/rate-limit-redis';
```

### 7. OIDC State Manager Updates

**File:** `app/api/auth/oidc/login/route.ts`

```typescript
// Register state in Redis (async)
await stateManager.registerState(state, {
  timestamp: Date.now(),
  nonce,
  returnUrl,
  fingerprint,
});
```

**File:** `app/api/auth/oidc/callback/route.ts`

```typescript
// Validate state from Redis (async)
const isValid = await stateManager.validateAndMarkUsed(state);
if (!isValid) {
  throw new StateValidationError('State token invalid');
}
```

---

## Deployment Steps

### Phase 1: AWS Infrastructure Setup

**Step 1: Create ElastiCache Subnet Group**
```bash
aws elasticache create-cache-subnet-group \
  --cache-subnet-group-name bendcare-redis-subnet-group \
  --cache-subnet-group-description "BendCare Redis subnet group" \
  --subnet-ids subnet-xxxxxx subnet-yyyyyy subnet-zzzzzz \
  --region us-east-1
```

**Step 2: Create ElastiCache Parameter Group**
```bash
aws elasticache create-cache-parameter-group \
  --cache-parameter-group-name bendcare-redis-7-1 \
  --cache-parameter-group-family redis7 \
  --description "BendCare Redis 7.1 parameters"

aws elasticache modify-cache-parameter-group \
  --cache-parameter-group-name bendcare-redis-7-1 \
  --parameter-name-values \
    "ParameterName=maxmemory-policy,ParameterValue=allkeys-lru" \
    "ParameterName=timeout,ParameterValue=300"
```

**Step 3: Create Security Group**
```bash
aws ec2 create-security-group \
  --group-name sg-bendcare-redis \
  --description "BendCare ElastiCache Redis" \
  --vpc-id vpc-xxxxxx

# Add ingress rule
aws ec2 authorize-security-group-ingress \
  --group-id sg-redis-id \
  --protocol tcp \
  --port 6379 \
  --source-group sg-ecs-tasks-id
```

**Step 4: Create Redis Cluster (Production)**
```bash
aws elasticache create-replication-group \
  --replication-group-id bendcare-redis-prod \
  --replication-group-description "BendCare Production Redis" \
  --engine redis \
  --engine-version 7.1 \
  --cache-node-type cache.r7g.large \
  --num-node-groups 3 \
  --replicas-per-node-group 1 \
  --cache-parameter-group-name bendcare-redis-7-1 \
  --cache-subnet-group-name bendcare-redis-subnet-group \
  --security-group-ids sg-bendcare-redis \
  --auth-token "GENERATE_STRONG_PASSWORD_HERE" \
  --transit-encryption-enabled \
  --at-rest-encryption-enabled \
  --kms-key-id alias/bendcare-redis \
  --automatic-failover-enabled \
  --multi-az-enabled \
  --snapshot-retention-limit 7 \
  --snapshot-window "03:00-05:00" \
  --preferred-maintenance-window "sun:05:00-sun:07:00" \
  --auto-minor-version-upgrade \
  --region us-east-1
```

**Step 5: Get Connection Endpoint**
```bash
aws elasticache describe-replication-groups \
  --replication-group-id bendcare-redis-prod \
  --query 'ReplicationGroups[0].ConfigurationEndpoint' \
  --output text
```

**Step 6: Store Credentials in Parameter Store**
```bash
# Auth token
aws ssm put-parameter \
  --name /bendcare/production/redis-auth-token \
  --type SecureString \
  --value "YOUR_AUTH_TOKEN" \
  --description "Redis AUTH token for production"

# Full connection URL
aws ssm put-parameter \
  --name /bendcare/production/redis-url \
  --type SecureString \
  --value "redis://:AUTH_TOKEN@endpoint:6379?tls=true" \
  --description "Redis connection URL for production"
```

### Phase 2: Application Deployment

**Step 1: Update ECS Task Definition**
```json
{
  "family": "bendcare-app-prod",
  "containerDefinitions": [
    {
      "name": "app",
      "secrets": [
        {
          "name": "REDIS_URL",
          "valueFrom": "/bendcare/production/redis-url"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        }
      ]
    }
  ]
}
```

**Step 2: Update IAM Task Role**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameter",
        "ssm:GetParameters"
      ],
      "Resource": [
        "arn:aws:ssm:us-east-1:*:parameter/bendcare/production/redis-url"
      ]
    }
  ]
}
```

**Step 3: Deploy New Code**
```bash
# Build and push Docker image
docker build -t bendcare-app:latest .
docker tag bendcare-app:latest 123456789.dkr.ecr.us-east-1.amazonaws.com/bendcare-app:latest
docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/bendcare-app:latest

# Update ECS service
aws ecs update-service \
  --cluster bendcare-prod \
  --service bendcare-app \
  --task-definition bendcare-app-prod:LATEST \
  --force-new-deployment
```

**Step 4: Monitor Deployment**
```bash
# Watch service events
aws ecs describe-services \
  --cluster bendcare-prod \
  --services bendcare-app \
  --query 'services[0].events[0:5]'

# Check task logs
aws logs tail /ecs/bendcare-app --follow
```

**Step 5: Verify Redis Connectivity**
```bash
# Connect to Redis via bastion/ECS task
redis-cli -h clustercfg.bendcare-redis-prod.xxxxx.use1.cache.amazonaws.com \
  -p 6379 \
  --tls \
  -a YOUR_AUTH_TOKEN \
  ping
# Expected: PONG

# Check keys
redis-cli -h ... --tls -a ... --scan --pattern "oidc:state:*" | wc -l
redis-cli -h ... --tls -a ... --scan --pattern "ratelimit:*" | wc -l
```

---

## Migration Strategy

### Zero-Downtime Migration Plan

**Current State:**
- In-memory state manager
- In-memory rate limiter
- Single ECS task or limited horizontal scaling

**Target State:**
- Redis-backed state manager
- Redis-backed rate limiter
- Full horizontal scaling capability

### Migration Steps

**Step 1: Deploy Redis Infrastructure (No Impact)**
- Create ElastiCache cluster
- Configure security groups
- Store credentials in Parameter Store
- **Impact:** None, not yet connected

**Step 2: Deploy Dual-Mode Application (Backward Compatible)**
```typescript
// Feature flag approach
const USE_REDIS = process.env.REDIS_URL !== undefined;

export const stateManager = USE_REDIS
  ? redisStateManager
  : inMemoryStateManager;

export const rateLimiter = USE_REDIS
  ? redisRateLimiter
  : inMemoryRateLimiter;
```

**Deploy:** Application works with or without Redis
**Impact:** None, still using in-memory

**Step 3: Enable Redis (Rolling Deployment)**
- Add `REDIS_URL` to ECS task definition
- Deploy with rolling update strategy
- **Impact:** Minimal, some OIDC flows may fail during transition (users retry)

**Step 4: Scale Out (Validate Horizontal Scaling)**
- Increase ECS desired count from 1 to 3
- Test OIDC login flow across multiple tasks
- Verify rate limiting works globally
- **Impact:** None, Redis handles distribution

**Step 5: Remove In-Memory Fallback (Cleanup)**
- Remove feature flag code
- Delete in-memory implementations
- **Impact:** None, fully on Redis

### Rollback Plan

**If Redis Fails:**
1. Remove `REDIS_URL` from task definition
2. Deploy previous task definition
3. Application falls back to in-memory (if dual-mode)
4. Scale ECS to 1 task (limit blast radius)

**Rollback Time:** < 5 minutes

---

## Monitoring & Alerting

### CloudWatch Metrics

**ElastiCache Metrics:**
```yaml
CPUUtilization:
  Threshold: > 75% for 5 minutes
  Action: Alert + scale up node type

FreeableMemory:
  Threshold: < 1GB
  Action: Critical alert + scale up

DatabaseMemoryUsagePercentage:
  Threshold: > 80%
  Action: Warning alert

CurrConnections:
  Threshold: > 5000
  Action: Alert (possible connection leak)

Evictions:
  Threshold: > 0
  Action: Alert (memory pressure, increase node size)

ReplicationLag:
  Threshold: > 5 seconds
  Action: Alert (failover may be slow)

NetworkBytesIn/Out:
  Threshold: > 100MB/s
  Action: Monitor for traffic spike

CacheHits / CacheMisses:
  Ratio: < 0.8 (80% hit rate)
  Action: Review key TTLs
```

**Application Metrics (Custom):**
```typescript
// Emit CloudWatch custom metrics
import { CloudWatch } from '@aws-sdk/client-cloudwatch';

const cloudwatch = new CloudWatch({ region: 'us-east-1' });

// Track OIDC state operations
await cloudwatch.putMetricData({
  Namespace: 'BendCare/OIDC',
  MetricData: [
    {
      MetricName: 'StateRegistered',
      Value: 1,
      Unit: 'Count',
      Timestamp: new Date(),
    },
    {
      MetricName: 'StateValidationSuccess',
      Value: isValid ? 1 : 0,
      Unit: 'Count',
    },
    {
      MetricName: 'StateReplayAttempt',
      Value: isReplay ? 1 : 0,
      Unit: 'Count',
    },
  ],
});

// Track rate limit hits
await cloudwatch.putMetricData({
  Namespace: 'BendCare/RateLimit',
  MetricData: [
    {
      MetricName: 'RateLimitExceeded',
      Value: 1,
      Unit: 'Count',
      Dimensions: [
        { Name: 'LimitType', Value: 'auth' },
      ],
    },
  ],
});
```

### CloudWatch Alarms

**Production Alarms:**
```bash
# High CPU
aws cloudwatch put-metric-alarm \
  --alarm-name bendcare-redis-high-cpu \
  --alarm-description "Redis CPU > 75%" \
  --metric-name CPUUtilization \
  --namespace AWS/ElastiCache \
  --statistic Average \
  --period 300 \
  --threshold 75 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 1 \
  --dimensions Name=CacheClusterId,Value=bendcare-redis-prod-0001-001 \
  --alarm-actions arn:aws:sns:us-east-1:123456789:ops-alerts

# Low Memory
aws cloudwatch put-metric-alarm \
  --alarm-name bendcare-redis-low-memory \
  --alarm-description "Redis free memory < 1GB" \
  --metric-name FreeableMemory \
  --namespace AWS/ElastiCache \
  --statistic Average \
  --period 300 \
  --threshold 1073741824 \
  --comparison-operator LessThanThreshold \
  --evaluation-periods 2 \
  --dimensions Name=CacheClusterId,Value=bendcare-redis-prod-0001-001 \
  --alarm-actions arn:aws:sns:us-east-1:123456789:ops-alerts-critical

# Evictions (memory pressure)
aws cloudwatch put-metric-alarm \
  --alarm-name bendcare-redis-evictions \
  --alarm-description "Redis evicting keys (memory full)" \
  --metric-name Evictions \
  --namespace AWS/ElastiCache \
  --statistic Sum \
  --period 300 \
  --threshold 0 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 1 \
  --dimensions Name=CacheClusterId,Value=bendcare-redis-prod-0001-001 \
  --alarm-actions arn:aws:sns:us-east-1:123456789:ops-alerts
```

### Dashboard

**CloudWatch Dashboard JSON:**
```json
{
  "widgets": [
    {
      "type": "metric",
      "properties": {
        "title": "Redis CPU Utilization",
        "metrics": [
          [ "AWS/ElastiCache", "CPUUtilization", { "stat": "Average" } ]
        ],
        "period": 300,
        "region": "us-east-1",
        "yAxis": { "left": { "min": 0, "max": 100 } }
      }
    },
    {
      "type": "metric",
      "properties": {
        "title": "Redis Memory",
        "metrics": [
          [ "AWS/ElastiCache", "DatabaseMemoryUsagePercentage" ],
          [ ".", "FreeableMemory", { "yAxis": "right" } ]
        ]
      }
    },
    {
      "type": "metric",
      "properties": {
        "title": "OIDC State Operations",
        "metrics": [
          [ "BendCare/OIDC", "StateRegistered", { "stat": "Sum" } ],
          [ ".", "StateValidationSuccess", { "stat": "Sum" } ],
          [ ".", "StateReplayAttempt", { "stat": "Sum", "color": "#d62728" } ]
        ]
      }
    },
    {
      "type": "metric",
      "properties": {
        "title": "Rate Limit Exceeded",
        "metrics": [
          [ "BendCare/RateLimit", "RateLimitExceeded", { "stat": "Sum" } ]
        ]
      }
    }
  ]
}
```

---

## Cost Estimation

### Production Environment

**ElastiCache Redis:**
```
Node Type: cache.r7g.large
Nodes: 6 (3 shards × 2 replicas)
Price: $0.218/hour per node

Monthly Cost:
6 nodes × $0.218/hour × 730 hours = $955.08/month

Data Transfer (estimated):
IN:  Free
OUT: 10GB × $0.09/GB = $0.90/month

Backup Storage:
7 snapshots × 50GB × $0.095/GB = $33.25/month

Total ElastiCache: ~$990/month
```

**Data Transfer (Application to Redis):**
```
Estimated traffic:
- 1000 OIDC logins/day × 1KB = 1MB/day = 30MB/month
- 1M API requests/day × 0.1KB rate limit check = 100MB/day = 3GB/month

Total: ~3GB/month (negligible, same VPC = free)
```

**Total Production Cost: ~$990/month**

### Staging Environment

**ElastiCache Redis:**
```
Node Type: cache.t4g.small
Nodes: 2 (1 shard × 2 replicas)
Price: $0.044/hour per node

Monthly Cost:
2 nodes × $0.044/hour × 730 hours = $64.24/month

Backup: 1 snapshot × 10GB × $0.095 = $0.95/month

Total Staging: ~$65/month
```

### Development Environment

**Local Redis (Docker):**
- Cost: $0 (runs on developer machines)

### Cost Optimization Strategies

**1. Reserved Instances (Production):**
```
Standard RI (1-year, All Upfront):
6 nodes × $0.130/hour (vs $0.218)
Monthly: 6 × $0.130 × 730 = $569.40
Savings: $385.68/month (40% reduction)
```

**2. Right-Sizing:**
- Start with `cache.r7g.large` (13GB)
- Monitor memory usage for 30 days
- Downsize if usage < 50% consistently

**3. Snapshot Optimization:**
- Reduce retention from 7 days to 3 days (save ~$14/month)
- Use final snapshot only (manual backups for major releases)

**4. Staging Cost Reduction:**
- Use single replica (1 node instead of 2) for dev-like staging
- Cost: $32/month (50% savings)
- Trade-off: No automatic failover in staging

---

## Disaster Recovery

### Backup Strategy

**Automated Snapshots:**
- Frequency: Daily at 3:00 AM UTC
- Retention: 7 days (production), 3 days (staging)
- Storage: S3 (automatically managed by ElastiCache)

**Manual Snapshots:**
- Before major releases
- Before Redis version upgrades
- Before configuration changes
- Retention: 30 days

**Snapshot Management:**
```bash
# Create manual snapshot
aws elasticache create-snapshot \
  --replication-group-id bendcare-redis-prod \
  --snapshot-name bendcare-redis-pre-upgrade-2025-10-04

# List snapshots
aws elasticache describe-snapshots \
  --replication-group-id bendcare-redis-prod

# Restore from snapshot
aws elasticache create-replication-group \
  --replication-group-id bendcare-redis-restored \
  --snapshot-name bendcare-redis-pre-upgrade-2025-10-04 \
  ...
```

### Failover Scenarios

**Scenario 1: Primary Node Failure**
```
Detection: ElastiCache health checks fail
Action: Automatic failover to replica (< 30 seconds)
Impact:
  - Minimal (writes blocked during failover)
  - OIDC logins may fail briefly (users retry)
  - Rate limits reset to 0 during failover window
Recovery: Automatic, no intervention needed
```

**Scenario 2: Availability Zone Failure**
```
Detection: All nodes in AZ-1 unreachable
Action:
  - Replicas in AZ-2 promoted to primary
  - New replicas launched in AZ-3
Impact:
  - 30-60 seconds of degraded service
  - Some OIDC flows fail (users retry)
Recovery: Automatic with Multi-AZ
```

**Scenario 3: Complete Redis Cluster Failure**
```
Detection: All nodes unreachable
Fallback Plan:
  1. Deploy application with REDIS_URL removed
  2. Falls back to in-memory (if dual-mode code exists)
  3. Scale ECS to 1 task (limit blast radius)
  4. Restore Redis from latest snapshot
  5. Re-enable REDIS_URL when Redis healthy

Impact:
  - Authentication works (limited to single ECS task)
  - Rate limiting works (per-task, less accurate)
  - No horizontal scaling during incident

Recovery Time: 15-30 minutes
```

**Scenario 4: Data Corruption**
```
Detection: Application errors, invalid data in Redis
Action:
  1. Create emergency snapshot
  2. Flush corrupted keys (or FLUSHDB if severe)
  3. Application regenerates keys on-demand

Impact:
  - All active OIDC flows fail (users must restart login)
  - Rate limits reset (temporary over-limit possible)

Recovery: Immediate (Redis empty but functional)
```

### RTO/RPO Targets

**Production:**
- RTO (Recovery Time Objective): 5 minutes
- RPO (Recovery Point Objective): 0 seconds (no data loss, replicated)

**Staging:**
- RTO: 15 minutes
- RPO: 24 hours (daily snapshots acceptable)

### Disaster Recovery Runbook

**1. Redis Completely Down:**
```bash
# Step 1: Check cluster health
aws elasticache describe-replication-groups \
  --replication-group-id bendcare-redis-prod

# Step 2: If all nodes down, restore from snapshot
aws elasticache create-replication-group \
  --replication-group-id bendcare-redis-prod-dr \
  --snapshot-name bendcare-redis-daily-2025-10-04

# Step 3: Update DNS or connection string (if using custom DNS)
# Update Parameter Store with new endpoint
aws ssm put-parameter \
  --name /bendcare/production/redis-url \
  --value "redis://:AUTH@new-endpoint:6379?tls=true" \
  --overwrite

# Step 4: Restart ECS tasks to pick up new connection
aws ecs update-service \
  --cluster bendcare-prod \
  --service bendcare-app \
  --force-new-deployment
```

**2. Data Corruption:**
```bash
# Step 1: Emergency snapshot
aws elasticache create-snapshot \
  --replication-group-id bendcare-redis-prod \
  --snapshot-name emergency-$(date +%s)

# Step 2: Connect to Redis
redis-cli -h ... --tls -a ...

# Step 3: Flush corrupted namespace only
redis-cli --scan --pattern "oidc:state:*" | xargs redis-cli DEL
# Or full flush if severe
FLUSHDB

# Step 4: Monitor application recovery
aws logs tail /ecs/bendcare-app --follow --filter "Redis"
```

**3. Replication Lag:**
```bash
# Check replication status
redis-cli -h primary --tls -a ... INFO replication

# If lag > 60 seconds, investigate
# Possible causes:
# - Network issues
# - Heavy write load
# - Undersized instance type

# Consider scaling up node type
aws elasticache modify-replication-group \
  --replication-group-id bendcare-redis-prod \
  --cache-node-type cache.r7g.xlarge \
  --apply-immediately
```

---

## Summary Checklist

### Pre-Deployment

- [ ] ElastiCache cluster created (staging & production)
- [ ] Security groups configured
- [ ] Subnet groups created
- [ ] Parameter groups customized
- [ ] AUTH token generated and stored in Parameter Store
- [ ] KMS key created for encryption at-rest
- [ ] CloudWatch alarms configured
- [ ] SNS topics for alerts created
- [ ] IAM roles updated (ECS task role has SSM access)

### Application Changes

- [ ] `ioredis` package installed
- [ ] Redis client singleton created (`lib/redis/client.ts`)
- [ ] Redis state manager implemented (`lib/oidc/state-manager-redis.ts`)
- [ ] Redis rate limiter implemented (`lib/api/middleware/rate-limit-redis.ts`)
- [ ] Environment variable `REDIS_URL` added to task definition
- [ ] OIDC routes updated to use async state manager
- [ ] Rate limit routes updated to use Redis limiter
- [ ] Error handling added for Redis connection failures
- [ ] Graceful degradation implemented (optional)

### Testing

- [ ] Local Redis running (Docker or installed)
- [ ] OIDC login flow tested locally with Redis
- [ ] Rate limiting tested with multiple requests
- [ ] State token replay prevention tested
- [ ] Horizontal scaling tested (multiple ECS tasks)
- [ ] Failover tested (kill primary Redis node)
- [ ] Backup/restore tested
- [ ] Performance tested (latency < 5ms for Redis ops)

### Deployment

- [ ] Deploy to staging first
- [ ] Smoke test in staging (OIDC login, API calls)
- [ ] Monitor staging for 24 hours
- [ ] Deploy to production (rolling deployment)
- [ ] Verify Redis connectivity from ECS tasks
- [ ] Scale ECS to 3+ tasks
- [ ] Test OIDC login across multiple tasks
- [ ] Monitor CloudWatch metrics for 48 hours

### Post-Deployment

- [ ] Remove in-memory fallback code (cleanup)
- [ ] Update documentation
- [ ] Train team on Redis monitoring
- [ ] Document disaster recovery procedures
- [ ] Schedule first Redis upgrade window
- [ ] Review costs after 30 days
- [ ] Consider Reserved Instances if usage stable

---

## Conclusion

This Redis ElastiCache deployment enables:

✅ **True Horizontal Scaling:** Add ECS tasks without breaking authentication
✅ **Reliable Rate Limiting:** Accurate limits across all instances
✅ **High Availability:** Multi-AZ failover, 99.9% uptime SLA
✅ **Zero Downtime Deploys:** OIDC flows survive rolling deployments
✅ **Production Ready:** Encryption, backups, monitoring, alerts

**Next Steps:**
1. Review this design document
2. Get approval for ~$1000/month ElastiCache cost
3. Schedule staging deployment
4. Execute deployment checklist
5. Monitor and optimize

---

**Document Control:**
- Version: 1.0
- Author: Claude AI Assistant
- Date: 2025-10-04
- Review Date: 2025-11-04
- Status: Design Phase - Pending Approval
