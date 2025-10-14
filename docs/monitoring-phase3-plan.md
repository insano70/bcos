# Phase 3: Redis Cache Management Tools - Implementation Plan

**Status:** Ready for Implementation  
**Created:** 2025-10-14  
**Duration:** 1 week (estimated)  
**Dependencies:** Phase 1 ✅ Complete, Phase 2 ✅ Complete  

---

## Table of Contents

1. [Overview](#overview)
2. [Redis Operations](#redis-operations)
3. [API Endpoints](#api-endpoints)
4. [UI Components](#ui-components)
5. [Implementation Tasks](#implementation-tasks)
6. [Security & Safety](#security--safety)
7. [Testing Strategy](#testing-strategy)

---

## Overview

### Goals

Phase 3 adds comprehensive Redis cache management capabilities:
- **Cache Statistics** - Real-time metrics (hit rate, memory, ops/sec)
- **Key Management** - Search, inspect, and manage cache keys
- **Pattern Operations** - Bulk operations on key patterns
- **Memory Analysis** - Identify hot keys and memory hogs
- **Admin Tools** - Purge cache, update TTLs, warm cache
- **Health Monitoring** - Connection status and performance

### Current Redis Infrastructure

**Already in Place:**
- Redis client singleton (`lib/redis.ts`)
- Environment-based key prefixing (`bcos:dev:`, `bcos:staging:`, `bcos:prod:`)
- ChartDataCache service
- RateLimitCache service
- Graceful degradation

**What's Missing:**
- Admin visibility into cache contents
- Tools to manage and purge keys
- Memory usage monitoring
- Hot key identification

---

## Redis Operations

### 1. Statistics & Monitoring

**Redis INFO Command:**
```typescript
const redis = getRedisClient();
const info = await redis.info();

// Sections available:
// - Server: Redis version, uptime
// - Clients: Connected clients
// - Memory: Memory usage, fragmentation
// - Stats: Commands processed, keyspace hits/misses
// - Replication: Replication status
// - CPU: CPU usage
// - Keyspace: Database key counts
```

**Key Metrics to Track:**
```typescript
{
  memory: {
    used_memory: 245760000,        // bytes
    used_memory_human: "245.76M",
    used_memory_peak: 512000000,
    used_memory_peak_human: "512M",
    maxmemory: 1073741824,
    maxmemory_human: "1G",
    mem_fragmentation_ratio: 1.12,
  },
  stats: {
    total_commands_processed: 1234567,
    instantaneous_ops_per_sec: 156,
    keyspace_hits: 45231,
    keyspace_misses: 5389,
    evicted_keys: 0,
    expired_keys: 234,
  },
  clients: {
    connected_clients: 3,
  },
  keyspace: {
    db0: {
      keys: 4231,
      expires: 3890,
      avg_ttl: 289000, // milliseconds
    },
  },
}
```

### 2. Key Operations

**Search Keys:**
```typescript
// Search by pattern (use SCAN for production safety)
const iterator = redis.scanStream({
  match: 'bcos:prod:chart:*',
  count: 100,
});

const keys: string[] = [];
for await (const batch of iterator) {
  keys.push(...batch);
}
```

**Get Key Details:**
```typescript
// Get key type
const type = await redis.type(key);  // 'string', 'hash', 'list', 'set', 'zset'

// Get TTL (-1 = no expiry, -2 = doesn't exist)
const ttl = await redis.ttl(key);

// Get memory usage (bytes)
const memory = await redis.memory('USAGE', key);

// Get value (type-specific)
let value;
switch (type) {
  case 'string':
    value = await redis.get(key);
    break;
  case 'hash':
    value = await redis.hgetall(key);
    break;
  case 'list':
    value = await redis.lrange(key, 0, -1);
    break;
  // ... other types
}
```

**Delete Keys:**
```typescript
// Delete single key
await redis.del(key);

// Delete by pattern (DANGEROUS - use with caution)
const keys = await redis.keys(pattern);
if (keys.length > 0) {
  await redis.del(...keys);
}
```

**Update TTL:**
```typescript
// Set expiration in seconds
await redis.expire(key, 3600);  // 1 hour

// Remove expiration
await redis.persist(key);
```

### 3. Pattern-Based Operations

**Key Patterns in Use:**
```
bcos:{env}:chart:data:*           # Chart data cache
bcos:{env}:ratelimit:ip:*         # Rate limiting by IP
bcos:{env}:ratelimit:user:*       # Rate limiting by user
bcos:{env}:session:*              # User sessions (future)
bcos:{env}:user:*                 # User context cache (future)
bcos:{env}:role:*                 # Role permissions cache (future)
```

---

## API Endpoints

### 1. Redis Stats API

**Endpoint:** `GET /api/admin/redis/stats`

**RBAC:** `settings:read:all` (Super Admin only)

**Response:**
```typescript
{
  connected: boolean,
  uptime: number,  // seconds
  memory: {
    used: number,       // MB
    total: number,      // MB
    peak: number,       // MB
    percentage: number,
    fragmentation: number,
  },
  keys: {
    total: number,
    byPattern: {
      'chart:data:*': 1234,
      'ratelimit:*': 892,
      'session:*': 142,
      'other': 1963,
    },
  },
  stats: {
    hitRate: number,        // percentage
    totalHits: number,
    totalMisses: number,
    opsPerSec: number,
    connectedClients: number,
    evictedKeys: number,
    expiredKeys: number,
    totalCommands: number,
  },
  commandStats: {
    GET: number,
    SET: number,
    DEL: number,
    INCR: number,
    EXPIRE: number,
    // ... other commands
  },
}
```

### 2. Redis Keys API

**Endpoint:** `GET /api/admin/redis/keys`

**Query Parameters:**
```typescript
{
  pattern?: string,  // Default: '*'
  type?: string,     // Filter by key type ('string', 'hash', 'list', 'set', 'zset')
  page?: number,     // Default: 1
  limit?: number,    // Default: 50, Max: 500
}
```

**Response:**
```typescript
{
  keys: [
    {
      key: string,
      type: string,
      ttl: number,      // seconds, -1 = no expiry
      size: number,     // bytes
      lastAccessed?: string,  // timestamp (if available)
    }
  ],
  totalCount: number,
  page: number,
  limit: number,
  pattern: string,
}
```

### 3. Redis Inspect API

**Endpoint:** `GET /api/admin/redis/inspect?key={key}`

**Response:**
```typescript
{
  key: string,
  type: string,
  ttl: number,
  size: number,
  value: any,  // Formatted based on type
  metadata: {
    created?: string,
    lastAccessed?: string,
    encoding?: string,
  },
}
```

### 4. Redis Purge API

**Endpoint:** `POST /api/admin/redis/purge`

**Request Body:**
```typescript
{
  pattern: string,
  preview?: boolean,  // If true, only return count without deleting
  confirm?: boolean,  // Must be true to execute deletion
}
```

**Response:**
```typescript
{
  success: boolean,
  keysDeleted: number,
  pattern: string,
  preview: boolean,
  keys?: string[],  // If preview mode, return matching keys
}
```

### 5. Redis TTL Update API

**Endpoint:** `POST /api/admin/redis/ttl`

**Request Body:**
```typescript
{
  pattern: string,
  ttl: number,        // seconds, -1 to remove expiration
  preview?: boolean,
}
```

**Response:**
```typescript
{
  success: boolean,
  keysUpdated: number,
  pattern: string,
  ttl: number,
}
```

---

## UI Components

### 1. Redis Admin Panel Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  REDIS CACHE ADMINISTRATION                                       │
├──────────────────────────────────────────────────────────────────┤
│  [TAB: Overview] [TAB: Key Browser] [TAB: Admin Tools]           │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  TAB 1: OVERVIEW                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Connection Status: ● Connected                            │  │
│  │  Environment: bcos:prod:                                   │  │
│  │  Uptime: 14d 6h 23m                                       │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  Memory Usage:                                                    │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  ████████████████░░░░░░░░  245MB / 512MB (47.9%)          │  │
│  │  Peak: 512MB • Fragmentation: 1.12                        │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  Hit Rate:                                                        │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  ██████████████████████████░░░░  89.4%                     │  │
│  │  45,231 hits • 5,389 misses • 156 ops/sec                 │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  Key Distribution:                                                │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  chart:data:* ████████████████░  1,234 keys (29%) • 45MB │  │
│  │  ratelimit:*  █████████░░░░░░░░  892 keys (21%) • 2MB    │  │
│  │  session:*    ███░░░░░░░░░░░░░░  142 keys (3%) • 5MB     │  │
│  │  other        ████████████████░  1,963 keys (47%) • 193MB│  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### 2. Key Browser Tab

```
┌──────────────────────────────────────────────────────────────────┐
│  TAB 2: KEY BROWSER                                               │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Search: [bcos:prod:*_________________] [🔍 Search] [Clear]      │
│                                                                   │
│  Filter: [All Types ▼] [All TTLs ▼]                              │
│                                                                   │
│  Results (50 of 4,231):                                           │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ Key                           │ Type   │ TTL    │ Size      │  │
│  ├───────────────────────────────┼────────┼────────┼──────────┤  │
│  │ bcos:prod:chart:data:abc123   │ string │ 4m 23s │ 12KB    │  │
│  │ [👁 Inspect] [🗑 Delete] [⏰ TTL]                           │  │
│  ├───────────────────────────────┼────────┼────────┼──────────┤  │
│  │ bcos:prod:ratelimit:ip:1.2.3  │ string │ 2m 15s │ 256B    │  │
│  │ [👁 Inspect] [🗑 Delete] [⏰ TTL]                           │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  [← Prev] [Page 1 of 85] [Next →]                               │
└──────────────────────────────────────────────────────────────────┘
```

### 3. Admin Tools Tab

```
┌──────────────────────────────────────────────────────────────────┐
│  TAB 3: ADMIN TOOLS                                               │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ⚠️ DANGEROUS OPERATIONS - USE WITH CAUTION                       │
│                                                                   │
│  🧹 Purge Cache by Pattern                                        │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Pattern: [bcos:prod:chart:*________________]              │  │
│  │  ⚠️ This will delete all matching keys                     │  │
│  │  [Preview Matches (1,234 keys)] [Purge Keys]               │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ⏰ Update TTL for Pattern                                        │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Pattern: [bcos:prod:session:*________________]            │  │
│  │  New TTL: [3600_____] seconds (1 hour)                     │  │
│  │  [Preview Matches (142 keys)] [Update TTL]                 │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  🔥 Clear All Cache                                               │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  ⚠️ DANGER: This will delete ALL keys with prefix          │  │
│  │     bcos:prod: (4,231 keys total)                          │  │
│  │                                                             │  │
│  │  Type "CLEAR ALL CACHE" to confirm:                        │  │
│  │  [_______________________________]                          │  │
│  │  [Clear All Cache (Disabled)]                              │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  Recent Operations:                                               │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  14:32:15 • Purged chart:data:* (45 keys deleted)         │  │
│  │  14:28:03 • Extended TTL for session:* (12 keys updated)  │  │
│  │  14:15:42 • Inspected key ratelimit:ip:203.0.113.42       │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Implementation Tasks (20 Tasks)

### Backend Infrastructure (Tasks 1-7)

**1. Redis Admin Service** - `lib/monitoring/redis-admin.ts`
```typescript
export class RedisAdminService {
  async getStats(): Promise<RedisStats>
  async searchKeys(pattern: string, limit: number): Promise<RedisKey[]>
  async getKeyDetails(key: string): Promise<RedisKeyDetails>
  async deleteKeys(pattern: string, preview: boolean): Promise<PurgeResult>
  async updateTTL(pattern: string, ttl: number): Promise<TTLUpdateResult>
  async getKeysByPattern(pattern: string): Promise<string[]>
  async getMemoryUsage(key: string): Promise<number>
  async getHotKeys(): Promise<Array<{ key: string; accessCount: number }>>
}
```

**2-6. API Endpoints:**
- `/api/admin/redis/stats` - GET Redis INFO statistics
- `/api/admin/redis/keys` - GET searchable key list
- `/api/admin/redis/inspect` - GET key details
- `/api/admin/redis/purge` - POST delete by pattern
- `/api/admin/redis/ttl` - POST update TTL

**7. Type Definitions:**
```typescript
export interface RedisStats {
  connected: boolean;
  uptime: number;
  memory: RedisMemoryStats;
  keys: RedisKeyStats;
  stats: RedisPerformanceStats;
  commandStats: Record<string, number>;
}

export interface RedisKey {
  key: string;
  type: string;
  ttl: number;
  size: number;
}

export interface RedisKeyDetails extends RedisKey {
  value: unknown;
  encoding?: string;
}
```

### Frontend Components (Tasks 8-13)

**8. RedisCacheStats** - Enhanced statistics panel
- Memory usage gauge with warning thresholds
- Hit rate visualization
- Ops/sec real-time counter
- Key distribution pie chart (optional)

**9. RedisKeyBrowser** - Searchable key table
- Pattern-based search
- Type filter dropdown
- TTL filter (expiring soon, no expiry, etc.)
- Pagination
- Per-key actions (inspect, delete, update TTL)

**10. RedisKeyInspector** - Key detail modal
- Formatted value display (JSON, string, array)
- Syntax highlighting for JSON values
- TTL countdown
- Memory usage
- Delete/Update TTL actions

**11. RedisPurgeTools** - Dangerous operations panel
- Purge by pattern with preview
- Update TTL by pattern
- Clear all cache with confirmation
- Recent operations log

**12. RedisAdminTabs** - Tabbed interface
- Overview tab (stats)
- Key Browser tab (search)
- Admin Tools tab (dangerous operations)

**13. Dashboard Integration**
- Replace Row 3 cache placeholder
- Full Redis admin panel

### Advanced Features (Tasks 14-18)

**14. Memory Usage Chart**
- Line chart showing memory usage over last hour
- Trend indicator (increasing/stable/decreasing)
- Warning threshold visualization

**15. Hot Keys Identification**
- Track most frequently accessed keys
- Display in Overview tab
- Help identify caching opportunities

**16. Key Size Analysis**
- Identify largest keys
- Memory optimization opportunities
- Display in Overview tab

**17. Cache Warming Tools**
- Trigger cache warming for specific patterns
- Pre-populate cache after deployments
- Warm common user contexts

**18. Connection Health**
- Show connection events (connect, disconnect, error)
- Latency monitoring
- Reconnection attempts

### Testing & QA (Tasks 19-20)

**19. Test Redis Operations**
- Mock Redis for unit tests
- Integration tests for key operations
- Safety tests for dangerous operations

**20. Quality Checks**
- pnpm tsc --noEmit
- pnpm lint
- Fix all errors

---

## Security & Safety

### Dangerous Operations

**1. Purge Cache by Pattern**
- ⚠️ Risk: Accidentally delete production data
- ✅ Mitigation: Preview mode (shows count before deletion)
- ✅ Mitigation: Confirmation required
- ✅ Mitigation: Audit logging
- ✅ Mitigation: RBAC (Super Admin only)

**2. Clear All Cache**
- 🔴 Risk: Complete cache flush, performance impact
- ✅ Mitigation: Type "CLEAR ALL CACHE" to confirm
- ✅ Mitigation: Shows exact key count
- ✅ Mitigation: Logs to audit trail
- ✅ Mitigation: Rate limited

**3. Update TTL by Pattern**
- ⚠️ Risk: Extend session TTLs accidentally
- ✅ Mitigation: Preview mode
- ✅ Mitigation: Shows affected key count
- ✅ Mitigation: Audit logging

### Audit Logging

All dangerous operations must log:
```typescript
await AuditLogger.logUserAction({
  action: 'redis_cache_purged',
  userId: adminUserId,
  resourceType: 'cache',
  resourceId: pattern,
  metadata: {
    keysDeleted: count,
    pattern,
    environment: process.env.ENVIRONMENT,
  },
});
```

### RBAC Protection

- **Read Operations:** `settings:read:all`
  - View stats
  - Search keys
  - Inspect keys

- **Write Operations:** `settings:update:all`
  - Purge cache
  - Update TTLs
  - Clear all cache

---

## Component Specifications

### RedisCacheStats Component

```tsx
<div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
  <h3 className="text-lg font-semibold mb-4">Redis Cache Statistics</h3>
  
  {/* Connection Status */}
  <div className="mb-4">
    <div className="flex items-center gap-2">
      <div className="h-3 w-3 bg-green-500 rounded-full animate-pulse"></div>
      <span className="text-sm">Connected • {uptime}</span>
    </div>
  </div>
  
  {/* Hit Rate */}
  <div className="mb-6">
    <div className="flex justify-between mb-2">
      <span className="text-sm text-gray-600">Hit Rate</span>
      <span className="text-2xl font-bold">{hitRate}%</span>
    </div>
    <div className="w-full bg-gray-200 rounded-full h-2">
      <div className="bg-violet-500 h-2 rounded-full" style={{width: `${hitRate}%`}} />
    </div>
    <div className="flex justify-between mt-1 text-xs text-gray-500">
      <span>{hits.toLocaleString()} hits</span>
      <span>{misses.toLocaleString()} misses</span>
    </div>
  </div>
  
  {/* Memory */}
  <div className="mb-6">
    <div className="flex justify-between mb-2">
      <span className="text-sm text-gray-600">Memory</span>
      <span className="text-sm font-medium">{used}MB / {total}MB</span>
    </div>
    <div className="w-full bg-gray-200 rounded-full h-2">
      <div 
        className={`h-2 rounded-full ${getMemoryColor(percentage)}`}
        style={{width: `${percentage}%`}} 
      />
    </div>
  </div>
  
  {/* Stats Grid */}
  <div className="grid grid-cols-2 gap-4">
    <Stat label="Total Keys" value={keys.total.toLocaleString()} />
    <Stat label="Ops/sec" value={opsPerSec} />
    <Stat label="Clients" value={connectedClients} />
    <Stat label="Evicted" value={evictedKeys} />
  </div>
  
  {/* Actions */}
  <div className="mt-6 flex gap-2">
    <button onClick={() => setActiveTab('keys')}>
      Browse Keys
    </button>
    <button onClick={() => setActiveTab('admin')}>
      Admin Tools
    </button>
  </div>
</div>
```

### RedisKeyBrowser Component

```tsx
<div>
  {/* Search */}
  <div className="mb-4">
    <input
      type="text"
      value={pattern}
      onChange={(e) => setPattern(e.target.value)}
      placeholder="Search pattern (e.g., chart:data:*)"
      className="w-full px-4 py-2 border rounded-lg"
    />
  </div>
  
  {/* Filters */}
  <div className="flex gap-2 mb-4">
    <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
      <option value="all">All Types</option>
      <option value="string">String</option>
      <option value="hash">Hash</option>
      <option value="list">List</option>
      <option value="set">Set</option>
    </select>
  </div>
  
  {/* Keys Table */}
  <table className="min-w-full">
    <thead>
      <tr>
        <th>Key</th>
        <th>Type</th>
        <th>TTL</th>
        <th>Size</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      {keys.map((key) => (
        <tr key={key.key}>
          <td className="font-mono text-sm">{key.key}</td>
          <td><TypeBadge type={key.type} /></td>
          <td><TTLDisplay ttl={key.ttl} /></td>
          <td>{formatBytes(key.size)}</td>
          <td>
            <button onClick={() => inspectKey(key.key)}>👁 Inspect</button>
            <button onClick={() => deleteKey(key.key)}>🗑 Delete</button>
            <button onClick={() => updateTTL(key.key)}>⏰ TTL</button>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
  
  {/* Pagination */}
  <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
</div>
```

---

## Testing Strategy

### Unit Tests

**Redis Admin Service:**
```typescript
describe('RedisAdminService', () => {
  it('parses Redis INFO correctly', () => {
    const info = `# Server\r\nuptime_in_seconds:123456\r\n# Memory\r\nused_memory:256000000`;
    const stats = parseRedisInfo(info);
    expect(stats.uptime_in_seconds).toBe(123456);
    expect(stats.used_memory).toBe(256000000);
  });
  
  it('searches keys by pattern', async () => {
    // Mock Redis SCAN
    const keys = await service.searchKeys('chart:*', 50);
    expect(keys.length).toBeLessThanOrEqual(50);
  });
});
```

### Integration Tests

**Purge API:**
```typescript
describe('POST /api/admin/redis/purge', () => {
  it('requires super admin permission', async () => {
    const response = await request(app)
      .post('/api/admin/redis/purge')
      .set('Authorization', `Bearer ${normalUserToken}`)
      .send({ pattern: 'test:*' });
    
    expect(response.status).toBe(403);
  });
  
  it('requires confirmation for deletion', async () => {
    const response = await request(app)
      .post('/api/admin/redis/purge')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ pattern: 'test:*', confirm: false });
    
    expect(response.status).toBe(400);
  });
  
  it('returns preview when preview mode enabled', async () => {
    const response = await request(app)
      .post('/api/admin/redis/purge')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ pattern: 'test:*', preview: true });
    
    expect(response.status).toBe(200);
    expect(response.body.keysDeleted).toBe(0);
    expect(response.body.keys).toBeDefined();
  });
});
```

---

## Success Criteria

### Functional Requirements
- ✅ View Redis connection status and uptime
- ✅ View cache hit rate and memory usage
- ✅ Search keys by pattern
- ✅ Inspect individual key details and values
- ✅ Delete keys by pattern (with preview)
- ✅ Update TTL for multiple keys
- ✅ Clear all cache (with strict confirmation)
- ✅ View key distribution by pattern
- ✅ Export operations logged to audit trail

### Security Requirements
- ✅ All endpoints protected with RBAC
- ✅ Dangerous operations require confirmation
- ✅ All write operations logged
- ✅ Preview mode for bulk operations
- ✅ Rate limiting on all endpoints

### Performance Requirements
- ✅ Stats API responds in < 200ms
- ✅ Key search uses SCAN (not KEYS) for safety
- ✅ Pagination to prevent loading 10,000+ keys
- ✅ Key inspection lazy-loads values

---

## Estimated Timeline

**Day 1: Backend Foundation (6 hours)**
- Redis admin service (3 hours)
- Stats API endpoint (1 hour)
- Keys API endpoint (1 hour)
- Inspect API endpoint (1 hour)

**Day 2: Admin Operations (5 hours)**
- Purge API endpoint (2 hours)
- TTL update API endpoint (1 hour)
- Type definitions (1 hour)
- Testing (1 hour)

**Day 3: UI Components (6 hours)**
- RedisCacheStats component (2 hours)
- RedisKeyBrowser component (2 hours)
- RedisKeyInspector modal (2 hours)

**Day 4: Admin Tools & Integration (4 hours)**
- RedisPurgeTools component (2 hours)
- RedisAdminTabs wrapper (1 hour)
- Dashboard integration (1 hour)

**Day 5: Advanced Features & Polish (3 hours)**
- Hot keys tracking (1 hour)
- Memory charts (1 hour)
- Final testing and polish (1 hour)

**Total: 24 hours (5 days)**

---

## Dependencies

### NPM Packages
No additional packages required (using existing ioredis)

### Environment Variables
Already configured:
```bash
REDIS_HOST=xxx
REDIS_PORT=6379
REDIS_PASSWORD=xxx
REDIS_TLS=true
```

---

## Risk Mitigation

**Risk 1: Accidental cache flush in production**
- *Mitigation:* Type "CLEAR ALL CACHE" to confirm
- *Mitigation:* Show exact key count before deletion
- *Mitigation:* Preview mode for pattern operations
- *Audit:* Log all purge operations

**Risk 2: Performance impact from KEYS command**
- *Mitigation:* Use SCAN instead of KEYS
- *Mitigation:* Pagination to limit results
- *Mitigation:* Configurable batch size

**Risk 3: Viewing sensitive data in cache**
- *Mitigation:* Redact password/token fields
- *Mitigation:* Super Admin only access
- *Mitigation:* Audit log all inspections

---

**Ready to implement Phase 3!** This will complete the cache management tools and give admins full visibility and control over Redis.

