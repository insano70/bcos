# CloudWatch Logs Insights Integration Guide

**Purpose:** Enable real-time security events, slow queries, and error monitoring in the Admin Command Center

---

## Quick Start

### 1. Install AWS SDK

```bash
pnpm add @aws-sdk/client-cloudwatch-logs
```

### 2. Configure Environment Variables

```bash
# Required
AWS_REGION=us-east-1  # or your AWS region
ENVIRONMENT=development  # or staging, production

# Optional (if not using IAM role)
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
```

### 3. Verify Log Group Exists

The integration expects logs in:
```
/aws/ecs/bcos-{ENVIRONMENT}
```

Examples:
- Development: `/aws/ecs/bcos-development`
- Staging: `/aws/ecs/bcos-staging`
- Production: `/aws/ecs/bcos-production`

---

## What Gets Enabled

Once configured, these features will show real data:

**Security Events Feed:**
- Failed login attempts
- Rate limiting violations
- CSRF attack attempts
- Permission denials
- Security threats

**Slow Queries Panel:**
- Database queries > 500ms
- Table and operation details
- Query filters and parameters
- Correlation IDs for tracing

**Error Log (if implemented):**
- Application errors by endpoint
- Error types and counts
- Stack traces
- Grouped by similarity

---

## IAM Permissions Required

The application needs these CloudWatch permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:StartQuery",
        "logs:GetQueryResults",
        "logs:DescribeLogGroups"
      ],
      "Resource": [
        "arn:aws:logs:us-east-1:ACCOUNT_ID:log-group:/aws/ecs/bcos-*"
      ]
    }
  ]
}
```

---

## Testing Integration

### Local Development

1. Set environment variables in `.env.local`:
```
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
ENVIRONMENT=development
```

2. Restart application:
```bash
pnpm dev
```

3. Check dashboard - events should populate

### Production (ECS)

Application automatically uses IAM role attached to ECS task.

**No credentials needed in environment** - just set:
```
AWS_REGION=us-east-1
ENVIRONMENT=production
```

---

## Graceful Degradation

If CloudWatch is not configured:
- ✅ Dashboard still works
- ✅ Returns empty arrays (no errors)
- ✅ Shows "No events" empty state
- ✅ Other features unaffected

The integration gracefully falls back if:
- AWS SDK not installed
- No AWS credentials
- Log group doesn't exist
- Query fails or times out

---

## Query Performance

**Typical response times:**
- Security events (50 results): 2-5 seconds
- Slow queries (50 results): 2-5 seconds  
- Errors (50 results): 2-5 seconds

**Optimization:**
- Results cached for 30 seconds
- Queries limited to reasonable time ranges
- Pagination support

---

## Cost Estimation

CloudWatch Logs Insights pricing:
- $0.005 per GB scanned

**Expected costs:**
- Security events query: ~0.1 GB → $0.0005
- Slow queries: ~0.05 GB → $0.00025
- With 30s caching and typical usage: **< $5/month**

---

## Troubleshooting

**No events showing:**
1. Check AWS SDK installed: `pnpm list @aws-sdk/client-cloudwatch-logs`
2. Check environment variables set
3. Check log group exists in AWS Console
4. Check IAM permissions
5. Check application logs for CloudWatch errors

**Query timeout:**
- Reduce time range (use 1h instead of 7d)
- Check CloudWatch service status
- Verify network connectivity to AWS

**Permission denied:**
- Verify IAM role has `logs:StartQuery` permission
- Check log group ARN in IAM policy

---

**Ready to enable CloudWatch integration!**

