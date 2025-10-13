# CloudWatch Debugging Runbook

**Version:** 1.0
**Date:** 2025-10-12
**Status:** Production-Ready

---

## Quick Reference

### Access CloudWatch Logs

```bash
# Via AWS Console
https://console.aws.amazon.com/cloudwatch/home#logsV2:log-groups

# Via AWS CLI
aws logs tail /ecs/bcos-production --follow --format short
```

### Common Query Patterns

| Scenario | Query Pattern |
|----------|---------------|
| Find errors in last hour | `filter level = "ERROR" \| sort @timestamp desc` |
| Trace specific request | `filter correlationId = "cor_xyz123"` |
| Find slow operations | `filter component = "api" and duration > 1000` |
| User activity timeline | `filter userId = "user-id-here"` |
| Authentication failures | `filter component = "auth" and success = false` |

---

## Table of Contents

1. [Emergency Scenarios](#emergency-scenarios)
2. [Common Debugging Tasks](#common-debugging-tasks)
3. [CloudWatch Insights Queries](#cloudwatch-insights-queries)
4. [Performance Investigation](#performance-investigation)
5. [Security Incident Response](#security-incident-response)
6. [Production Issues](#production-issues)
7. [Tips & Tricks](#tips--tricks)

---

## Emergency Scenarios

### 🚨 Production Error Spike

**Symptoms:** Error rate suddenly increases, alarms firing

**Steps:**

1. **Quick Assessment** (< 2 minutes)
   ```sql
   # Last 15 minutes of errors
   fields @timestamp, message, error.message, file, line, operation, userId
   | filter level = "ERROR"
   | filter @timestamp > ago(15m)
   | sort @timestamp desc
   | limit 50
   ```

2. **Identify Pattern** (< 3 minutes)
   ```sql
   # Group errors by message
   fields message, error.message
   | filter level = "ERROR"
   | filter @timestamp > ago(15m)
   | stats count() as error_count by message
   | sort error_count desc
   | limit 10
   ```

3. **Find First Occurrence**
   ```sql
   # When did it start?
   fields @timestamp, message, correlationId
   | filter level = "ERROR"
   | filter message like /specific error message/
   | sort @timestamp asc
   | limit 1
   ```

4. **Trace Full Request**
   ```sql
   # Get correlation ID from first error, then:
   fields @timestamp, level, message, operation, duration
   | filter correlationId = "cor_FROM_ABOVE"
   | sort @timestamp asc
   ```

5. **Check Related Operations**
   ```sql
   # What else was happening at that time?
   fields @timestamp, operation, userId, duration
   | filter @timestamp > ago(15m)
   | filter operation = "OPERATION_FROM_ERROR"
   | stats count() as attempts,
           avg(duration) as avg_duration,
           sum(case level = "ERROR" when 1 else 0 end) as errors
     by bin(1m)
   ```

**Escalation:** If error rate > 10% for 5+ minutes, page oncall lead.

---

### 🐌 Slow Response Times

**Symptoms:** Users reporting slowness, high response times

**Steps:**

1. **Identify Slow Operations** (< 2 minutes)
   ```sql
   fields @timestamp, operation, duration, slow, userId, path
   | filter component = "api"
   | filter slow = true OR duration > 2000
   | filter @timestamp > ago(15m)
   | sort duration desc
   | limit 20
   ```

2. **Find Performance Trend**
   ```sql
   # Performance over time
   fields operation, duration
   | filter component = "api"
   | filter @timestamp > ago(1h)
   | stats avg(duration) as avg_ms,
           max(duration) as max_ms,
           pct(duration, 95) as p95_ms,
           count() as requests
     by operation, bin(5m)
   | sort bin(5m) desc
   ```

3. **Check Database Performance**
   ```sql
   fields @timestamp, operation, duration, table, recordCount
   | filter component = "database"
   | filter duration > 500
   | filter @timestamp > ago(15m)
   | sort duration desc
   | limit 20
   ```

4. **Identify Root Cause**
   - If DB queries slow → Check [Database Performance](#database-performance-issues)
   - If specific operation slow → Check code for that operation
   - If all operations slow → Check infrastructure (CPU, memory, network)

**Escalation:** If p95 latency > 3000ms for 10+ minutes, engage infrastructure team.

---

## Common Debugging Tasks

### Find Logs for Specific User

```sql
fields @timestamp, message, operation, component
| filter userId = "550e8400-e29b-41d4-a716-446655440000"
| sort @timestamp desc
| limit 100
```

**Use Cases:**
- User reports bug → Find their recent activity
- Security incident → Audit user actions
- Performance issue → See what user was doing

---

### Trace Complete Request Flow

**Step 1:** Find correlation ID (from error log, user report, or application response header)

**Step 2:** Query all logs for that correlation ID
```sql
fields @timestamp, level, message, file, line, function, operation, duration
| filter correlationId = "cor_1728750000_abc12345"
| sort @timestamp asc
```

**What You'll See:**
1. Request initiation (correlation.withContext)
2. Authentication/authorization checks
3. Database queries
4. Business logic execution
5. Response generation
6. Final timing/metrics

**Example Output:**
```
10:00:00.000  INFO  User login request started                    (auth/login/route.ts:42)
10:00:00.050  INFO  SAML authentication successful                 (saml-handler.ts:123)
10:00:00.100  INFO  Database query: SELECT users WHERE...          (db-client.ts:89)
10:00:00.150  INFO  User context retrieved                         (rbac-middleware.ts:67)
10:00:00.200  INFO  Login successful - session created             (auth/login/route.ts:156)
```

---

### Find All Errors in Time Range

```sql
fields @timestamp, level, message, error.message, file, line, operation, userId
| filter level = "ERROR"
| filter @timestamp >= fromMillis(1728748800000)  # Unix timestamp in ms
| filter @timestamp <= fromMillis(1728752400000)
| sort @timestamp desc
| limit 100
```

**Alternative (relative time):**
```sql
fields @timestamp, message, error.message, operation
| filter level = "ERROR"
| filter @timestamp > ago(2h)
| sort @timestamp desc
```

---

### Check API Endpoint Health

```sql
fields @timestamp, statusCode, duration, userId
| filter path = "/api/users"
| filter method = "GET"
| filter @timestamp > ago(1h)
| stats count() as requests,
        avg(duration) as avg_ms,
        sum(case statusCode >= 400 when 1 else 0 end) as errors,
        sum(case statusCode >= 200 and statusCode < 300 when 1 else 0 end) as success
  by bin(5m)
| sort bin(5m) desc
```

---

## CloudWatch Insights Queries

### Authentication & Security

#### Failed Login Attempts
```sql
fields @timestamp, action, userId, ipAddress, reason
| filter component = "auth"
| filter action = "login"
| filter success = false
| filter @timestamp > ago(24h)
| stats count() as attempts by ipAddress, reason
| sort attempts desc
```

#### Suspicious Activity Detection
```sql
fields @timestamp, event, severity, userId, ipAddress, blocked
| filter component = "security"
| filter severity in ["high", "critical"]
| filter @timestamp > ago(24h)
| sort @timestamp desc
```

#### MFA Registration Activity
```sql
fields @timestamp, action, userId, method
| filter operation like /mfa/
| filter @timestamp > ago(7d)
| stats count() as registrations by action, method
```

#### RBAC Permission Denials
```sql
fields @timestamp, userId, permission, resource, reason
| filter operation = "permission_denied"
| filter @timestamp > ago(24h)
| stats count() as denials by permission, reason
| sort denials desc
```

---

### Database Performance

#### Slow Database Queries
```sql
fields @timestamp, operation, table, duration, recordCount
| filter component = "database"
| filter duration > 500
| filter @timestamp > ago(1h)
| stats avg(duration) as avg_ms,
        max(duration) as max_ms,
        count() as query_count
  by table, operation
| sort avg_ms desc
```

#### Database Query Volume
```sql
fields table, operation
| filter component = "database"
| filter @timestamp > ago(1h)
| stats count() as queries by table, operation
| sort queries desc
```

#### Failed Database Operations
```sql
fields @timestamp, operation, table, error.message
| filter component = "database"
| filter level = "ERROR"
| filter @timestamp > ago(1h)
| sort @timestamp desc
```

---

### API Performance

#### Slowest Endpoints
```sql
fields operation, path, method
| filter component = "api"
| filter @timestamp > ago(1h)
| stats avg(duration) as avg_ms,
        pct(duration, 50) as p50_ms,
        pct(duration, 95) as p95_ms,
        pct(duration, 99) as p99_ms,
        max(duration) as max_ms,
        count() as requests
  by operation, path
| sort p95_ms desc
| limit 20
```

#### Error Rate by Endpoint
```sql
fields operation
| filter component = "api"
| filter @timestamp > ago(1h)
| stats count() as total,
        sum(case level = "ERROR" when 1 else 0 end) as errors,
        (errors / total * 100) as error_rate_pct
  by operation
| filter errors > 0
| sort error_rate_pct desc
```

#### Request Volume Over Time
```sql
fields operation
| filter component = "api"
| filter @timestamp > ago(24h)
| stats count() as requests by operation, bin(1h)
| sort bin(1h) desc
```

---

### Business Logic

#### User Activity Timeline
```sql
fields @timestamp, operation, component, message, duration
| filter userId = "USER_ID_HERE"
| filter @timestamp > ago(7d)
| sort @timestamp desc
| limit 100
```

#### Work Item Operations
```sql
fields @timestamp, operation, resourceId, userId
| filter operation like /work_item/
| filter @timestamp > ago(24h)
| stats count() as operations by operation
| sort operations desc
```

#### CRUD Operations Summary
```sql
fields operation
| filter operation like /create_|update_|delete_/
| filter @timestamp > ago(24h)
| stats count() as operations by operation
| sort operations desc
```

---

## Performance Investigation

### Database Performance Issues

**Scenario:** Slow database queries detected

**Investigation Steps:**

1. **Identify Slow Tables**
   ```sql
   fields table
   | filter component = "database"
   | filter duration > 500
   | filter @timestamp > ago(1h)
   | stats avg(duration) as avg_ms,
           count() as slow_queries
     by table
   | sort avg_ms desc
   ```

2. **Find Specific Slow Queries**
   ```sql
   fields @timestamp, operation, table, duration, recordCount, correlationId
   | filter component = "database"
   | filter table = "SLOW_TABLE_FROM_ABOVE"
   | filter duration > 500
   | filter @timestamp > ago(1h)
   | sort duration desc
   | limit 20
   ```

3. **Trace Full Request**
   ```sql
   # Use correlationId from above
   fields @timestamp, component, operation, duration, message
   | filter correlationId = "cor_xyz123"
   | sort @timestamp asc
   ```

**Common Causes:**
- Missing index → Check query patterns, add indexes
- Large result sets → Check recordCount, add pagination
- Lock contention → Check concurrent operations
- Connection pool exhaustion → Check pool size

---

### Memory Leak Detection

**Scenario:** Gradual memory increase over time

**Investigation Steps:**

1. **Check Request Volume**
   ```sql
   fields @timestamp
   | filter component = "api"
   | filter @timestamp > ago(6h)
   | stats count() as requests by bin(5m)
   | sort bin(5m) desc
   ```

2. **Look for Unusual Patterns**
   ```sql
   # Large payloads or data processing
   fields operation, duration, recordCount
   | filter component = "api"
   | filter @timestamp > ago(6h)
   | filter recordCount > 1000 OR duration > 5000
   | sort @timestamp desc
   ```

3. **Check for Connection Leaks**
   ```sql
   fields operation, component
   | filter message like /connection|pool|timeout/
   | filter @timestamp > ago(6h)
   | sort @timestamp desc
   ```

**Escalation:** If memory grows > 85%, restart container and investigate with heap dump.

---

## Security Incident Response

### Potential Breach Investigation

**Scenario:** Security alarm fired, possible unauthorized access

**Immediate Actions (< 5 minutes):**

1. **Identify Security Events**
   ```sql
   fields @timestamp, event, severity, userId, ipAddress, blocked, reason
   | filter component = "security"
   | filter @timestamp > ago(1h)
   | sort severity desc, @timestamp desc
   ```

2. **Check Authentication Failures**
   ```sql
   fields @timestamp, userId, ipAddress, reason
   | filter component = "auth"
   | filter success = false
   | filter @timestamp > ago(1h)
   | stats count() as attempts by ipAddress, userId
   | sort attempts desc
   ```

3. **Look for Privilege Escalation**
   ```sql
   fields @timestamp, userId, permission, resource, granted
   | filter operation like /permission|rbac|authorization/
   | filter @timestamp > ago(1h)
   | sort @timestamp desc
   ```

4. **Audit Affected User Activity**
   ```sql
   fields @timestamp, operation, component, ipAddress
   | filter userId = "SUSPECTED_USER_ID"
   | filter @timestamp > ago(24h)
   | sort @timestamp desc
   | limit 500
   ```

**Escalation:** Immediately notify security team if:
- Multiple failed auth attempts from same IP (> 10)
- Successful login after multiple failures
- Permission denied events > 20 in 5 minutes
- Any `severity = "critical"` events

---

### Rate Limiting Investigation

**Scenario:** User or IP is being rate limited

**Investigation:**

```sql
fields @timestamp, userId, ipAddress, operation, reason
| filter message like /rate.limit/
| filter @timestamp > ago(1h)
| stats count() as violations by userId, ipAddress, operation
| sort violations desc
```

**Legitimate User vs. Attack:**
- Legitimate: Single user, specific operation, reasonable rate
- Attack: Multiple IPs, broad operations, very high rate

---

## Production Issues

### User Reports "Something Broke"

**Scenario:** User reports generic error, no specific details

**Investigation Steps:**

1. **Find User's Recent Activity**
   ```sql
   fields @timestamp, level, operation, message, error.message
   | filter userId = "USER_ID" OR email = "user@example.com"
   | filter @timestamp > ago(1h)
   | sort @timestamp desc
   | limit 50
   ```

2. **Look for Errors in Timeframe**
   ```sql
   fields @timestamp, operation, error.message, correlationId
   | filter userId = "USER_ID"
   | filter level = "ERROR"
   | filter @timestamp > ago(1h)
   | sort @timestamp desc
   ```

3. **Trace the Failed Request**
   ```sql
   # Use correlationId from error above
   fields @timestamp, level, message, operation, duration
   | filter correlationId = "cor_xyz123"
   | sort @timestamp asc
   ```

---

### Feature Not Working as Expected

**Scenario:** Specific feature broken, need to understand why

**Investigation:**

1. **Find Related Operations**
   ```sql
   fields @timestamp, operation, level, message
   | filter operation like /FEATURE_NAME/
   | filter @timestamp > ago(30m)
   | sort @timestamp desc
   | limit 100
   ```

2. **Check for Recent Errors**
   ```sql
   fields @timestamp, error.message, file, line
   | filter operation like /FEATURE_NAME/
   | filter level = "ERROR"
   | filter @timestamp > ago(1h)
   | sort @timestamp desc
   ```

3. **Compare Working vs. Broken**
   ```sql
   # Find successful operations
   fields correlationId, duration
   | filter operation = "SPECIFIC_OPERATION"
   | filter level != "ERROR"
   | filter @timestamp > ago(1h)
   | limit 5

   # Then trace one of each (success vs. failure)
   ```

---

## Tips & Tricks

### Use Saved Queries

Create saved queries in CloudWatch Console for common patterns:

1. Go to CloudWatch → Logs → Insights
2. Write query
3. Click "Save" → Give it a name
4. Access from "Saved queries" dropdown

**Recommended Saved Queries:**
- "Errors in last hour"
- "Trace by correlation ID"
- "Slow operations"
- "User activity"
- "Auth failures by IP"

---

### Use Query Variables

```sql
# Define a variable
fields @timestamp, message
| filter @timestamp > ago(1h)
| fields myVariable = duration * 2
| filter myVariable > 2000
```

---

### Export Results

1. Run query
2. Click "Export results" → Choose format (CSV, JSON)
3. Share with team or import to spreadsheet

---

### Set Up Alarms

Create CloudWatch alarms for critical patterns:

```bash
# Example: Alert on error spike
aws cloudwatch put-metric-alarm \
  --alarm-name high-error-rate \
  --alarm-description "Alert when error rate exceeds 10 in 5 minutes" \
  --metric-name ErrorCount \
  --namespace BCOS/production \
  --statistic Sum \
  --period 300 \
  --evaluation-periods 1 \
  --threshold 10 \
  --comparison-operator GreaterThanThreshold
```

---

### Quick Time References

```sql
# Last hour
| filter @timestamp > ago(1h)

# Specific time range (Unix timestamps in milliseconds)
| filter @timestamp >= fromMillis(1728748800000)
| filter @timestamp <= fromMillis(1728752400000)

# Between dates
| filter @timestamp >= "2025-10-12T10:00:00Z"
| filter @timestamp <= "2025-10-12T11:00:00Z"
```

---

### Performance Tips

**Query Optimization:**
1. Always filter by time first (`@timestamp`)
2. Add component filter early (`component = "api"`)
3. Use `limit` to reduce result set
4. Avoid `fields @message` - it's slow
5. Use `stats` for aggregations instead of returning all rows

**Good Query:**
```sql
fields operation, duration
| filter @timestamp > ago(1h)
| filter component = "api"
| filter duration > 1000
| stats avg(duration) by operation
| limit 20
```

**Bad Query:**
```sql
# Missing time filter, returning all fields, no limit
fields @message
| filter duration > 1000
```

---

## Troubleshooting CloudWatch Issues

### No Logs Appearing

**Possible Causes:**
1. Container not running
2. Log group wrong
3. IAM permissions missing
4. Log stream not created

**Check:**
```bash
# Verify log group exists
aws logs describe-log-groups --log-group-name-prefix /ecs/bcos

# Check recent log streams
aws logs describe-log-streams \
  --log-group-name /ecs/bcos-production \
  --order-by LastEventTime \
  --descending \
  --max-items 5
```

---

### Query Timeout

**Causes:**
- Too broad time range
- No time filter
- Returning too many fields
- Complex aggregations

**Solution:**
- Reduce time range
- Add more specific filters
- Use `limit`
- Simplify query

---

### Can't Find Correlation ID

**Solution:**
1. Check application response headers (`X-Correlation-ID`)
2. Look in error logs (correlation ID always included)
3. Find by userId/timestamp instead:
   ```sql
   fields correlationId
   | filter userId = "USER_ID"
   | filter @timestamp > ago(5m)
   | limit 1
   ```

---

## Additional Resources

- [CloudWatch Logs Insights Query Syntax](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CWL_QuerySyntax.html)
- [BendCare OS Logging Strategy](/docs/logging_strategy.md)
- [CLAUDE.md Logging Patterns](/CLAUDE.md#logging-standards)

---

**Last Updated:** 2025-10-12
**Maintainer:** Engineering Team
**Feedback:** #logging-migration Slack channel
