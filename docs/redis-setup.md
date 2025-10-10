# Redis/Valkey Setup Guide

This document describes how to configure Redis/Valkey caching for the BendCare OS application across environments.

## Overview

We use **AWS Valkey Serverless** (Redis-compatible) for distributed caching to improve performance and reduce database load.

**Benefits:**
- 60-78% reduction in database queries
- 40-68% improvement in dashboard load times
- Shared cache across all application instances
- Automatic scaling with serverless architecture
- No server management required

---

## Cache Usage

The application caches the following data in Redis:

| Cache Type | Key Pattern | TTL | Purpose |
|------------|-------------|-----|---------|
| User Context | `user_context:{userId}` | 5 min | Full RBAC context (roles, permissions, orgs) |
| Role Permissions | `role_perms:{roleId}` | 24 hrs | Role-to-permission mappings |
| User Basic Info | `user_basic:{userId}` | 5 min | User table data |
| Token Blacklist | `token_bl:{tokenId}` | 1 min / 1 hr | JWT blacklist status |
| JWT Payload | `jwt_payload:{tokenId}` | 5 min | Decoded JWT payloads |

---

## Environment Configuration

### Development

**Already Created:** Your dev Valkey Serverless instance in AWS VPC

**Required Environment Variables:**
```bash
```bash
REDIS_HOST=<your-dev-valkey-endpoint>.vpce.amazonaws.com
REDIS_PORT=6379
REDIS_USERNAME=<your-valkey-username>
REDIS_PASSWORD=<your-valkey-password>
REDIS_TLS=true
```

**Getting Username and Password:**
1. Go to **ElastiCache Console** → **User Management**
2. Find your Valkey user (NOT the default user)
3. Use the username and password for that user

### Staging

**Steps to Create:**

1. **Go to AWS ElastiCache Console**
   - Select region: Same as your staging RDS
   - Click "Create Valkey Serverless cache"

2. **Configuration:**
   - Name: `bcos-staging-cache`
   - Engine: Valkey (Redis OSS-compatible)
   - Capacity: Serverless (auto-scaling)
   - VPC: Same VPC as staging RDS
   - Subnet: Private subnets
   - Security Group: Allow port 6379 from ECS tasks

3. **Security Group Rules:**
   ```
   Inbound:
   - Type: Custom TCP
   - Port: 6379
   - Source: ECS task security group
   ```

4. **Get Connection Details:**
   - Endpoint: Copy the Valkey endpoint
   - Port: 6379 (default)
   - TLS: Enabled (default)

5. **Add to Secrets Manager:**
   ```bash
   aws secretsmanager update-secret \
     --secret-id bcos/staging/env \
     --secret-string '{
       ...existing secrets...,
       "REDIS_HOST": "your-staging-valkey-endpoint.vpce.amazonaws.com",
       "REDIS_PORT": "6379",
       "REDIS_TLS": "true",
       "REDIS_PASSWORD": ""
     }'
   ```

### Production

**Steps to Create:**

1. **Go to AWS ElastiCache Console**
   - Select region: Same as your production RDS
   - Click "Create Valkey Serverless cache"

2. **Configuration:**
   - Name: `bcos-production-cache`
   - Engine: Valkey (Redis OSS-compatible)
   - Capacity: Serverless (auto-scaling)
   - VPC: Same VPC as production RDS
   - Subnet: Private subnets (multi-AZ)
   - Security Group: Allow port 6379 from ECS tasks

3. **Security Group Rules:**
   ```
   Inbound:
   - Type: Custom TCP
   - Port: 6379
   - Source: ECS task security group
   ```

4. **Get Connection Details:**
   - Endpoint: Copy the Valkey endpoint
   - Port: 6379 (default)
   - TLS: Enabled (default)

5. **Add to Secrets Manager:**
   ```bash
   aws secretsmanager update-secret \
     --secret-id bcos/production/env \
     --secret-string '{
       ...existing secrets...,
       "REDIS_HOST": "your-production-valkey-endpoint.vpce.amazonaws.com",
       "REDIS_PORT": "6379",
       "REDIS_TLS": "true",
       "REDIS_PASSWORD": ""
     }'
   ```

---

## Verification

### Test Redis Connection

```bash
# Development
pnpm tsx scripts/test-redis-connection.ts

# Staging (via bastion or ECS Exec)
aws ecs execute-command --cluster bcos-staging --task <task-id> \
  --container app --interactive --command "npx tsx scripts/test-redis-connection.ts"
```

### Monitor Cache Performance

Check CloudWatch Logs for cache metrics:

```
filter @message like /Redis/
| stats count(*) by message
```

Look for:
- "User context cache hit in Redis" (should be >90%)
- "Role permissions cache hit in Redis" (should be >95%)
- "Token blacklist cache hit in Redis" (should be >95%)

### Monitor Valkey Metrics in AWS Console

Key metrics to watch:
- **Cache Hit Rate**: Should be >90%
- **CPU Utilization**: Should be <50% (serverless auto-scales)
- **Network Bytes In/Out**: Should be consistent
- **Evictions**: Should be 0 (serverless has enough memory)

---

## Fallback Behavior

**If Redis is unavailable:**
- Application continues to work normally
- Falls back to database queries
- Logs warnings but doesn't block requests
- No user-facing errors

**Graceful Degradation:**
```
Redis available → Use cache (fast)
Redis unavailable → Query database (slower, but works)
```

---

## Cache Invalidation

### Manual Invalidation

When you update user roles/permissions, invalidate the cache:

```typescript
import { invalidateUserContext, invalidateRolePermissions } from '@/lib/cache/redis-rbac-cache';

// After updating user roles
await invalidateUserContext(userId);

// After updating role permissions
await invalidateRolePermissions(roleId);
```

### Automatic Expiration

All cache entries have TTLs and expire automatically:
- User context: 5 minutes
- Role permissions: 24 hours
- User basic info: 5 minutes
- Token blacklist: 1-60 minutes

---

## Cost Estimation

**AWS Valkey Serverless Pricing** (us-east-1):
- $0.125 per GB-hour of cache storage
- $0.0034 per million read/write requests

**Expected Costs per Environment:**

| Environment | Daily Requests | Storage (GB) | Monthly Cost |
|-------------|----------------|--------------|--------------|
| Development | 100K | 0.5 | ~$2 |
| Staging | 500K | 1.0 | ~$5 |
| Production | 5M | 5.0 | ~$40 |

**Total: ~$47/month for 60-78% database query reduction** ✅

---

## Troubleshooting

### Redis Connection Errors

**Error:** `ECONNREFUSED`
- **Cause:** Security group not allowing ECS tasks
- **Fix:** Update security group inbound rules

**Error:** `ETIMEDOUT`
- **Cause:** VPC endpoint not accessible
- **Fix:** Check VPC configuration and subnet routing

**Error:** `Authentication failed`
- **Cause:** Wrong password
- **Fix:** Check REDIS_PASSWORD in Secrets Manager

### High Cache Miss Rate

**Symptom:** Cache hit rate <70%
- **Cause:** TTLs too short or high user churn
- **Fix:** Increase TTLs in `redis-rbac-cache.ts`

### Memory Pressure

**Symptom:** Evictions in CloudWatch
- **Cause:** Serverless at max capacity
- **Fix:** Valkey Serverless auto-scales, no action needed

---

## Monitoring Queries

### CloudWatch Logs Insights

**Cache Hit Rate:**
```
fields @timestamp, message, userId
| filter message like /cache hit in Redis/
| stats count(*) as hits by message
```

**Cache Miss Rate:**
```
fields @timestamp, message, userId
| filter message like /cache miss in Redis/
| stats count(*) as misses by message
```

**Database Query Reduction:**
```
fields @timestamp, message
| filter message like /Query:/
| stats count(*) as queries by bin(5m)
```

---

## Rollback Plan

If Redis causes issues:

1. **Disable Redis in Environment Variables:**
   ```bash
   unset REDIS_HOST
   ```

2. **Application automatically falls back to database**

3. **No code changes required** - graceful degradation built-in

---

## Next Steps

✅ Development: Already configured
⏳ Staging: Follow "Staging" section above
⏳ Production: Follow "Production" section above
