# S3 ECS Deployment Guide

This guide covers deploying the S3 public assets service to ECS environments (staging and production).

## Overview

The S3 public assets service requires environment variables to be configured in ECS task definitions. This guide covers adding S3 configuration to staging and production ECS tasks.

## Prerequisites

- ✅ S3 bucket created: `bcos-public-2c2af3de-6771-4cf3-90ff-330d402c1058`
- ✅ CloudFront distribution operational: `cdn.bendcare.com`
- ✅ IAM credentials created (see [s3-iam-setup.md](./s3-iam-setup.md))
- ✅ Code deployed with S3 service (Phases 1-5 complete)

## Required Environment Variables

The following environment variables must be added to ECS task definitions:

| Variable | Value | Required | Description |
|----------|-------|----------|-------------|
| `S3_PUBLIC_REGION` | `us-east-1` | Yes | AWS region for S3 bucket |
| `S3_PUBLIC_ACCESS_KEY_ID` | IAM access key | Yes* | IAM user access key ID |
| `S3_PUBLIC_SECRET_ACCESS_KEY` | IAM secret | Yes* | IAM user secret access key |
| `S3_PUBLIC_BUCKET` | `bcos-public-2c2af3de-6771-4cf3-90ff-330d402c1058` | Yes | S3 bucket name |
| `CDN_URL` | `https://cdn.bendcare.com` | Yes | CloudFront distribution URL |

*If using IAM task role, credentials are not required.

## Deployment Options

### Option 1: IAM Task Role (Recommended)

**Pros**:
- No long-lived credentials
- Automatic credential rotation
- Better security posture
- Easier compliance

**Cons**:
- Requires ECS task role configuration
- Requires updating IAM policies

#### Steps:

1. **Create/Update IAM Task Role** (see [s3-iam-setup.md](./s3-iam-setup.md#ecs-task-role-stagingproduction))

2. **Update ECS Task Definition** (only non-credential env vars needed):

```json
{
  "family": "bcos-staging",
  "taskRoleArn": "arn:aws:iam::854428944440:role/BCOS-ECSTaskRole",
  "containerDefinitions": [
    {
      "name": "bcos-app",
      "environment": [
        {
          "name": "S3_PUBLIC_REGION",
          "value": "us-east-1"
        },
        {
          "name": "S3_PUBLIC_BUCKET",
          "value": "bcos-public-2c2af3de-6771-4cf3-90ff-330d402c1058"
        },
        {
          "name": "CDN_URL",
          "value": "https://cdn.bendcare.com"
        }
      ]
    }
  ]
}
```

3. **Verify Task Role Has S3 Permissions**:

```bash
# Get task role ARN
TASK_ROLE_ARN=$(aws ecs describe-task-definition \
  --task-definition bcos-staging \
  --query 'taskDefinition.taskRoleArn' \
  --output text)

# List attached policies
aws iam list-attached-role-policies \
  --role-name $(echo $TASK_ROLE_ARN | awk -F/ '{print $NF}')
```

### Option 2: AWS Secrets Manager (Fallback)

**Pros**:
- Centralized secret management
- Encrypted at rest
- Audit trail for access
- Can be used if task roles unavailable

**Cons**:
- Long-lived credentials
- Manual rotation required
- Additional AWS service dependency

#### Steps:

1. **Create Secret in Secrets Manager**:

```bash
# Staging
aws secretsmanager create-secret \
  --name bcos/staging/s3-public-credentials \
  --description "S3 public upload credentials for staging" \
  --secret-string '{
    "S3_PUBLIC_ACCESS_KEY_ID": "AKIA...",
    "S3_PUBLIC_SECRET_ACCESS_KEY": "..."
  }' \
  --region us-east-1

# Production
aws secretsmanager create-secret \
  --name bcos/production/s3-public-credentials \
  --description "S3 public upload credentials for production" \
  --secret-string '{
    "S3_PUBLIC_ACCESS_KEY_ID": "AKIA...",
    "S3_PUBLIC_SECRET_ACCESS_KEY": "..."
  }' \
  --region us-east-1
```

2. **Update ECS Task Definition**:

```json
{
  "family": "bcos-staging",
  "executionRoleArn": "arn:aws:iam::854428944440:role/ecsTaskExecutionRole",
  "containerDefinitions": [
    {
      "name": "bcos-app",
      "environment": [
        {
          "name": "S3_PUBLIC_REGION",
          "value": "us-east-1"
        },
        {
          "name": "S3_PUBLIC_BUCKET",
          "value": "bcos-public-2c2af3de-6771-4cf3-90ff-330d402c1058"
        },
        {
          "name": "CDN_URL",
          "value": "https://cdn.bendcare.com"
        }
      ],
      "secrets": [
        {
          "name": "S3_PUBLIC_ACCESS_KEY_ID",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:854428944440:secret:bcos/staging/s3-public-credentials:S3_PUBLIC_ACCESS_KEY_ID::"
        },
        {
          "name": "S3_PUBLIC_SECRET_ACCESS_KEY",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:854428944440:secret:bcos/staging/s3-public-credentials:S3_PUBLIC_SECRET_ACCESS_KEY::"
        }
      ]
    }
  ]
}
```

3. **Grant ECS Execution Role Access to Secrets**:

```bash
# Get execution role name
EXEC_ROLE=$(aws ecs describe-task-definition \
  --task-definition bcos-staging \
  --query 'taskDefinition.executionRoleArn' \
  --output text | awk -F/ '{print $NF}')

# Attach policy (if not already attached)
cat > secretsmanager-policy.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": [
        "arn:aws:secretsmanager:us-east-1:854428944440:secret:bcos/staging/s3-public-credentials-*",
        "arn:aws:secretsmanager:us-east-1:854428944440:secret:bcos/production/s3-public-credentials-*"
      ]
    }
  ]
}
EOF

aws iam put-role-policy \
  --role-name "$EXEC_ROLE" \
  --policy-name SecretsManagerAccess \
  --policy-document file://secretsmanager-policy.json
```

## Deployment Process

### Staging Deployment

1. **Update Task Definition**:

```bash
# Register new task definition revision
aws ecs register-task-definition \
  --cli-input-json file://ecs-task-definition-staging.json

# Get new revision number
REVISION=$(aws ecs describe-task-definition \
  --task-definition bcos-staging \
  --query 'taskDefinition.revision' \
  --output text)

echo "New revision: $REVISION"
```

2. **Update ECS Service**:

```bash
# Update service to use new task definition
aws ecs update-service \
  --cluster bcos-staging-cluster \
  --service bcos-staging-service \
  --task-definition bcos-staging:$REVISION \
  --force-new-deployment
```

3. **Monitor Deployment**:

```bash
# Watch service events
aws ecs describe-services \
  --cluster bcos-staging-cluster \
  --services bcos-staging-service \
  --query 'services[0].events[0:5]'

# Check task health
aws ecs list-tasks \
  --cluster bcos-staging-cluster \
  --service-name bcos-staging-service

# View container logs
aws logs tail /ecs/bcos-staging --follow
```

4. **Verify S3 Configuration**:

```bash
# Check environment variables in running task
TASK_ARN=$(aws ecs list-tasks \
  --cluster bcos-staging-cluster \
  --service-name bcos-staging-service \
  --query 'taskArns[0]' \
  --output text)

aws ecs describe-tasks \
  --cluster bcos-staging-cluster \
  --tasks $TASK_ARN \
  --query 'tasks[0].containers[0].environment'
```

5. **Test Upload**:

- Login to staging: `https://staging.bendcare.com`
- Upload a test practice logo
- Verify file appears in S3: `aws s3 ls s3://bcos-public-2c2af3de-6771-4cf3-90ff-330d402c1058/practices/`
- Verify CloudFront URL works: `https://cdn.bendcare.com/practices/...`
- Check CloudWatch logs for S3 upload confirmation

### Production Deployment

**⚠️ IMPORTANT**: Test thoroughly in staging before production deployment.

Follow the same steps as staging, but:
- Use production task definition: `bcos-production`
- Use production cluster: `bcos-production-cluster`
- Use production service: `bcos-production-service`
- Use production secrets: `bcos/production/s3-public-credentials`
- Schedule deployment during low-traffic window
- Monitor closely for 1 hour post-deployment

## Verification Checklist

After deployment, verify:

- [ ] ECS task starts successfully
- [ ] No errors in CloudWatch logs
- [ ] Health check endpoint passes: `/api/health`
- [ ] Environment variables are set (check task logs)
- [ ] S3 upload works (test via UI)
- [ ] CloudFront URL works (test uploaded file)
- [ ] Database updated with CloudFront URLs
- [ ] Practice websites load images from CDN
- [ ] No increase in error rates (CloudWatch metrics)

## Rollback Plan

If issues occur after deployment:

### Option 1: Revert to Previous Task Definition

```bash
# Find previous revision
PREV_REVISION=$((REVISION - 1))

# Update service to use previous revision
aws ecs update-service \
  --cluster bcos-staging-cluster \
  --service bcos-staging-service \
  --task-definition bcos-staging:$PREV_REVISION \
  --force-new-deployment
```

### Option 2: Disable S3 Uploads (Fallback to Local)

```bash
# Remove S3 environment variables from task definition
# Service will automatically fall back to local filesystem

# OR remove credentials from Secrets Manager
aws secretsmanager delete-secret \
  --secret-id bcos/staging/s3-public-credentials \
  --force-delete-without-recovery
```

## Monitoring

### CloudWatch Metrics

Monitor these metrics post-deployment:

- **S3 Upload Success Rate**: `aws cloudwatch get-metric-statistics ...`
- **CloudFront Cache Hit Rate**: Check CloudFront distribution metrics
- **Application Error Rate**: Check ALB target group metrics
- **ECS Task Health**: Check ECS service health

### CloudWatch Logs

Monitor application logs for:
- S3 upload confirmations: `"File uploaded to S3"`
- S3 errors: `"S3 upload failed"`
- Fallback mode: `"S3 not configured, using local filesystem"`

Query examples:

```bash
# S3 upload logs
aws logs filter-log-events \
  --log-group-name /ecs/bcos-staging \
  --filter-pattern "\"File uploaded to S3\"" \
  --start-time $(date -u -d '1 hour ago' +%s)000

# S3 errors
aws logs filter-log-events \
  --log-group-name /ecs/bcos-staging \
  --filter-pattern "\"S3 upload failed\"" \
  --start-time $(date -u -d '1 hour ago' +%s)000
```

## Troubleshooting

### Issue: Tasks Fail to Start

**Symptoms**: ECS tasks transition to STOPPED state immediately

**Solutions**:
1. Check CloudWatch logs for error messages
2. Verify Secrets Manager ARNs are correct
3. Verify execution role has Secrets Manager permissions
4. Check task definition JSON is valid

### Issue: S3 Uploads Fail

**Symptoms**: Upload errors in CloudWatch logs

**Solutions**:
1. Verify IAM credentials are correct in Secrets Manager
2. Check IAM user/role has S3 permissions
3. Verify bucket name is correct
4. Test credentials with AWS CLI
5. Check CloudWatch logs for detailed error messages

### Issue: CloudFront URLs Return 403

**Symptoms**: Uploaded files return 403 Forbidden

**Solutions**:
1. Verify CloudFront distribution is deployed
2. Check bucket policy allows CloudFront OAI
3. Verify S3 bucket block public access is enabled
4. Wait for CloudFront distribution to fully deploy (15-20 minutes)

## Security Considerations

### 1. Secrets Rotation

If using Secrets Manager:
- Rotate credentials every 90 days
- Use AWS Secrets Manager rotation feature
- Test new credentials before deleting old ones

### 2. IAM Permissions Audit

- Review IAM policies quarterly
- Remove unused permissions
- Use least-privilege principle
- Enable CloudTrail logging

### 3. Network Security

- ECS tasks should run in private subnets
- Use VPC endpoints for AWS service access
- Restrict security group ingress
- Enable VPC Flow Logs

### 4. Compliance

- Enable S3 access logging
- Enable CloudTrail for S3 operations
- Monitor for unusual activity
- Document all IAM changes

## Additional Resources

- [ECS Task Definitions](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definitions.html)
- [ECS Secrets](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/specifying-sensitive-data-secrets.html)
- [ECS Task IAM Roles](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-iam-roles.html)
- [AWS Secrets Manager](https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html)
