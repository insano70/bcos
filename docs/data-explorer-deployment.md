# Data Explorer Deployment Guide

## Overview

This document covers deployment requirements for the Data Explorer system, including AWS Bedrock configuration, VPC endpoint setup, IAM policies, and environment variables.

## Prerequisites

- AWS Account with Bedrock access enabled
- VPC with private subnets for ECS tasks
- PostgreSQL database (application DB + analytics DB)
- AWS Elasticache (Redis/Valkey) cluster
- ECS Fargate cluster for application

## AWS Bedrock Configuration

### Step 1: Enable Bedrock Model Access

1. Navigate to AWS Bedrock console
2. Go to **Model access** section
3. Request access to **Anthropic Claude 3.5 Sonnet v2**
4. Wait for approval (usually instant for supported regions)
5. Model ID: `anthropic.claude-3-5-sonnet-20241022-v2:0`

**Supported Regions**:
- `us-east-1` (Virginia) - Recommended
- `us-west-2` (Oregon)
- `eu-west-1` (Ireland)

### Step 2: Create VPC Endpoint for Bedrock

**CRITICAL**: Bedrock must be accessed via VPC endpoint (no public internet) to keep PHI data private.

```bash
# Create VPC endpoint for Bedrock Runtime
aws ec2 create-vpc-endpoint \
  --vpc-id vpc-xxxxx \
  --service-name com.amazonaws.us-east-1.bedrock-runtime \
  --route-table-ids rtb-xxxxx \
  --subnet-ids subnet-xxxxx subnet-yyyyy \
  --security-group-ids sg-xxxxx
```

**VPC Endpoint Configuration**:
- **Service Name**: `com.amazonaws.us-east-1.bedrock-runtime`
- **Type**: Interface
- **Private DNS**: Enabled
- **Security Group**: Allow HTTPS (443) from ECS tasks

**Security Group Rules**:
```
Type: HTTPS
Protocol: TCP
Port: 443
Source: ECS task security group
```

### Step 3: IAM Role for ECS Task

Create IAM role with minimal Bedrock permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "BedrockInvokeModel",
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel"
      ],
      "Resource": [
        "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-5-sonnet-*"
      ]
    }
  ]
}
```

**Attach to**: ECS Task Role (not Task Execution Role)

### Step 4: Network Flow Verification

```
ECS Task (10.0.1.x)
  ↓ HTTPS (443)
VPC Endpoint (com.amazonaws.us-east-1.bedrock-runtime)
  ↓ AWS PrivateLink
Bedrock Service (AWS Managed)
```

**Test connectivity** from ECS task:
```bash
# Inside ECS container
curl -I https://bedrock-runtime.us-east-1.amazonaws.com
# Should return 403 (Forbidden) without credentials - confirms connectivity
```

## Environment Variables

### Required Variables

Add to `.env.production` (or ECS Task Definition):

```bash
# AWS Bedrock Configuration
AWS_BEDROCK_REGION=us-east-1
# Note: Access keys NOT needed in production (use IAM role)
# AWS_BEDROCK_ACCESS_KEY_ID=     # Only for local development
# AWS_BEDROCK_SECRET_ACCESS_KEY= # Only for local development

# Data Explorer Settings
DATA_EXPLORER_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0
DATA_EXPLORER_MAX_TOKENS=4096
DATA_EXPLORER_TEMPERATURE=0.1
DATA_EXPLORER_QUERY_TIMEOUT_MS=30000
DATA_EXPLORER_MAX_ROWS=10000
```

### Local Development

For local development, create `.env.local`:

```bash
# AWS Bedrock (Local Dev Only)
AWS_BEDROCK_REGION=us-east-1
AWS_BEDROCK_ACCESS_KEY_ID=AKIA...your_key_here
AWS_BEDROCK_SECRET_ACCESS_KEY=your_secret_here

# Data Explorer Configuration
DATA_EXPLORER_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0
DATA_EXPLORER_MAX_TOKENS=4096
DATA_EXPLORER_TEMPERATURE=0.1
DATA_EXPLORER_QUERY_TIMEOUT_MS=30000
DATA_EXPLORER_MAX_ROWS=10000
```

### ECS Task Definition

**Production**: Use IAM role credentials (no access keys in env vars):

```json
{
  "family": "bendcare-app",
  "taskRoleArn": "arn:aws:iam::123456789012:role/BendcareECSTaskRole",
  "containerDefinitions": [
    {
      "name": "app",
      "environment": [
        {
          "name": "AWS_BEDROCK_REGION",
          "value": "us-east-1"
        },
        {
          "name": "DATA_EXPLORER_MODEL_ID",
          "value": "anthropic.claude-3-5-sonnet-20241022-v2:0"
        },
        {
          "name": "DATA_EXPLORER_MAX_TOKENS",
          "value": "4096"
        },
        {
          "name": "DATA_EXPLORER_TEMPERATURE",
          "value": "0.1"
        },
        {
          "name": "DATA_EXPLORER_QUERY_TIMEOUT_MS",
          "value": "30000"
        },
        {
          "name": "DATA_EXPLORER_MAX_ROWS",
          "value": "10000"
        }
      ]
    }
  ]
}
```

## Database Setup

### Step 1: Apply Migrations

```bash
# Production deployment
pnpm db:migrate

# Local development (if migrations fail)
pnpm db:push
```

### Step 2: Seed Metadata

Run metadata seeding script to populate Tier 1 tables:

```bash
pnpm exec tsx --env-file=.env.local scripts/seed-explorer-metadata.ts
```

This creates metadata for:
- patients
- encounters
- diagnoses
- procedures
- claims
- payments
- providers
- organizations
- medications
- lab_results

### Step 3: Seed RBAC Permissions

Ensure Data Explorer permissions are seeded:

```bash
pnpm db:seed
```

This adds 16 Data Explorer permissions:
- `data-explorer:query:*`
- `data-explorer:execute:*`
- `data-explorer:metadata:*`
- `data-explorer:history:*`
- `data-explorer:templates:*`
- `data-explorer:discovery:*`

## Security Configuration

### Practice UID Filtering

Data Explorer automatically filters queries by `practice_uid` based on user's organization:

**UserContext Integration**:
- `accessible_practices: number[]` - Array of practice_uid values user can access
- Empty array = fail-closed security (no data access)
- Super admins bypass filtering

**SQL Injection**:
- Uses parameterized queries
- Validates SQL before execution
- Blocks destructive operations (DROP, DELETE, UPDATE, INSERT)

### Analytics Database Access

**Read-Only Connection**:
```typescript
// Separate database connection for analytics
ANALYTICS_DATABASE_URL=postgresql://readonly_user:password@analytics-db:5432/analytics
```

**User Permissions**:
```sql
GRANT SELECT ON SCHEMA ih TO readonly_user;
GRANT SELECT ON ALL TABLES IN SCHEMA ih TO readonly_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA ih GRANT SELECT ON TABLES TO readonly_user;
```

## Monitoring & Alerts

### CloudWatch Logs

**Filter Pattern** for Data Explorer operations:
```
fields @timestamp, operation, duration, userId
| filter component = "ai" or component = "analytics-db"
| filter operation like /data_explorer|bedrock|explorer/
| stats count(), avg(duration), max(duration) by operation
```

**Slow Query Detection**:
```
fields @timestamp, operation, duration, sql
| filter operation = "explorer_execute_query"
| filter slow = true
| sort duration desc
```

**Security Events**:
```
fields @timestamp, userId, operation, reason
| filter component = "security"
| filter operation = "explorer_security_filter"
| filter blocked = true
```

### Cost Tracking

**Bedrock Token Usage**:
```
fields @timestamp, tokensUsed, model
| filter operation = "bedrock_generate_sql"
| stats sum(tokensUsed) as totalTokens by bin(1h)
```

**Cost Estimation** (Claude 3.5 Sonnet v2):
- Input: $3.00 / 1M tokens
- Output: $15.00 / 1M tokens
- Average query: ~500 input + ~200 output tokens = $0.004/query

## Testing Deployment

### Health Check

```bash
curl https://your-app.bendcare.com/api/data/explorer/health
```

Expected response:
```json
{
  "status": "healthy",
  "analytics_db": true,
  "latency": 45,
  "error": null,
  "timestamp": "2025-10-28T21:00:00.000Z"
}
```

### Test Query Generation

```bash
curl -X POST https://your-app.bendcare.com/api/data/explorer/generate-sql \
  -H "Content-Type: application/json" \
  -H "Cookie: access_token=..." \
  -d '{
    "natural_language_query": "How many patients do we have?",
    "model": "anthropic.claude-3-5-sonnet-20241022-v2:0",
    "temperature": 0.1
  }'
```

### Verify Practice UID Filtering

1. Log in as org user (not super admin)
2. Generate SQL: "Show me all patients"
3. Verify generated/secured SQL contains: `WHERE practice_uid IN (1,2,3)`
4. Execute query
5. Verify results only include accessible practices

## Troubleshooting

### Bedrock Connection Issues

**Problem**: `Unable to connect to Bedrock`

**Solutions**:
1. Verify VPC endpoint exists: `aws ec2 describe-vpc-endpoints`
2. Check security group allows HTTPS from ECS
3. Verify IAM role attached to task
4. Check CloudWatch Logs for detailed errors

### Permission Errors

**Problem**: `Permission denied: data-explorer:query:organization`

**Solutions**:
1. Verify user has required role
2. Run RBAC seed: `pnpm db:seed`
3. Check user's `all_permissions` array in session

### No Accessible Practices

**Problem**: `No accessible practices found for user`

**Solutions**:
1. Verify organization has `practice_uids` array populated
2. Check user belongs to organization
3. Confirm `accessible_practices` in UserContext

### Analytics DB Unavailable

**Problem**: `Analytics database unavailable`

**Solutions**:
1. Verify `ANALYTICS_DATABASE_URL` environment variable
2. Check database connection from ECS task
3. Test with health endpoint: `/api/data/explorer/health`

## Rollback Plan

If Data Explorer needs to be disabled:

```bash
# 1. Remove sidebar navigation
# Comment out DataExplorerMenuSection in components/ui/sidebar.tsx

# 2. Disable API routes (optional)
# Comment out route exports in app/api/data/explorer/*/route.ts

# 3. DO NOT drop tables (keep data for debugging)
# Tables can remain in database without affecting other systems
```

## Performance Optimization

### Query Result Caching

Data Explorer uses Redis for caching:
- Query results: 15 minute TTL
- Metadata: 1 hour TTL
- Patterns: 30 minute TTL

**Cache Warming** (optional):
```typescript
// Warm cache with common queries
import { dataExplorerCache } from '@/lib/cache/data-explorer-cache';

const commonQueries = [
  'How many patients?',
  'Show encounters from last month',
];

for (const query of commonQueries) {
  // Generate and cache
}
```

### Connection Pooling

Analytics DB should have separate connection pool:

```typescript
// Already configured in lib/services/analytics-db.ts
const poolSettings = {
  max: 10,  // Smaller pool for analytics
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};
```

## Success Metrics

Track these metrics after deployment:

- **Usage**: Daily active users, queries generated per day
- **Performance**: Average SQL generation time (<3s target)
- **Quality**: User rating (target 4+ stars), query success rate (>70%)
- **Cost**: Bedrock token usage, cost per query
- **Security**: Practice UID filtering success rate (must be 100%)

## Support Contact

For deployment issues, contact:
- **Infrastructure**: infrastructure@bendcare.com
- **Application**: dev@bendcare.com
- **Security**: security@bendcare.com

---

**Document Version**: 1.0
**Last Updated**: October 28, 2025
**Author**: Patrick @ Bendcare

