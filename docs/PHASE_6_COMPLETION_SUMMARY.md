# Phase 6 Completion Summary: Environment Configuration

## Overview

Phase 6 (Environment Configuration) has been completed successfully. All required environment variables, documentation, and deployment scripts have been created.

## Deliverables

### ✅ 6.1 - Local Environment Configuration

**Status**: Complete

- `.env.local` already contains S3 configuration (lines 55-60):
  ```bash
  S3_PUBLIC_REGION=us-east-1
  S3_PUBLIC_ACCESS_KEY_ID=AKIA...
  S3_PUBLIC_SECRET_ACCESS_KEY=...
  S3_PUBLIC_BUCKET=bcos-public-2c2af3de-6771-4cf3-90ff-330d402c1058
  CDN_URL=https://cdn.bendcare.com
  ```

- **IAM User**: `bcos-iam-user-s3-public` (already created in Phase 0)
- **Credentials**: Active and tested

### ✅ 6.2 - Environment Template

**Status**: Complete

- **File**: [.env.s3.template](.env.s3.template)
- **Contents**:
  - Template for all three environments (dev/staging/prod)
  - Comprehensive setup instructions
  - Security best practices
  - Troubleshooting guide
  - Fallback behavior documentation

### ✅ 6.3 - AWS Credentials Setup Documentation

**Status**: Complete

- **File**: [docs/s3-iam-setup.md](./s3-iam-setup.md)
- **Contents**:
  - IAM policy JSON for S3 bucket access
  - Step-by-step IAM user creation (Console + CLI)
  - Environment-specific user recommendations
  - ECS task role configuration options
  - Security best practices
  - Credential rotation procedures
  - Testing and troubleshooting guides

**Key Sections**:
1. IAM Policy (with JSON)
2. IAM User Setup (Console + CLI methods)
3. Access Key Generation
4. Environment-Specific Users (dev/staging/prod)
5. ECS Task Role Options
6. Security Best Practices
7. Testing Procedures
8. Troubleshooting

### ✅ 6.4 - ECS Deployment Documentation

**Status**: Complete

- **File**: [docs/s3-ecs-deployment.md](./s3-ecs-deployment.md)
- **Contents**:
  - Required environment variables table
  - Option 1: IAM Task Role (recommended)
  - Option 2: AWS Secrets Manager (fallback)
  - Deployment process for staging and production
  - Verification checklist
  - Rollback plans
  - Monitoring guidance
  - Troubleshooting guide

**Key Sections**:
1. Required Environment Variables
2. Deployment Options (Task Role vs Secrets Manager)
3. Staging Deployment Process
4. Production Deployment Process
5. Verification Checklist
6. Rollback Plans
7. Monitoring (CloudWatch metrics and logs)
8. Troubleshooting Common Issues
9. Security Considerations

### ✅ 6.5 - ECS Task Definition Update Script

**Status**: Complete

- **File**: [scripts/update-ecs-task-def-s3.sh](../scripts/update-ecs-task-def-s3.sh)
- **Purpose**: Automated script to add S3 environment variables to ECS task definitions
- **Features**:
  - Updates both staging and production task definitions
  - Adds S3 environment variables (region, bucket, CDN URL)
  - Adds S3 credential secrets from Secrets Manager
  - Interactive confirmation prompts
  - Validates secrets exist before proceeding
  - Shows exactly what will be added
  - Provides next-step instructions
  - Cleans up temporary files

**Usage**:
```bash
# Run the script
./scripts/update-ecs-task-def-s3.sh

# Follow the interactive prompts:
# 1. Confirm you've added S3 credentials to Secrets Manager
# 2. Review staging changes and confirm
# 3. Review production changes and confirm
```

**What It Does**:
1. Fetches current task definitions from ECS
2. Adds S3 environment variables:
   - `S3_PUBLIC_REGION`
   - `S3_PUBLIC_BUCKET`
   - `CDN_URL`
3. Adds S3 credential secrets:
   - `S3_PUBLIC_ACCESS_KEY_ID` (from Secrets Manager)
   - `S3_PUBLIC_SECRET_ACCESS_KEY` (from Secrets Manager)
4. Registers new task definition revision
5. Provides commands to update running services

### ✅ 6.6 - ECS Task Role Permissions Analysis

**Status**: Verified

**Current State**:
- **Role Name**: `BCOS-ECSTaskRole`
- **Inline Policy**: `ECSTaskRoleDefaultPolicy82FC9293`
- **Current Permissions**: Secrets Manager only (no S3 permissions)

**Findings**:
The ECS task role currently does NOT have S3 permissions. However, this is **acceptable** because:

1. **Using IAM User Credentials (Option 2)**:
   - S3 credentials are stored in AWS Secrets Manager
   - Passed to container as environment variables
   - Task role has Secrets Manager access (already configured)
   - This is the fallback approach documented in Phase 6

2. **Future Improvement - IAM Task Role (Option 1)**:
   - Can be added later for better security
   - Would eliminate long-lived credentials
   - Requires updating CDK stack to add S3 permissions
   - Not required for Phase 6 completion

**Recommendation for Future**:
Add S3 permissions to `BCOS-ECSTaskRole` via CDK:
```typescript
// In CDK stack (infrastructure/lib/security-stack.ts)
taskRole.addToPolicy(new iam.PolicyStatement({
  effect: iam.Effect.ALLOW,
  actions: [
    's3:PutObject',
    's3:DeleteObject',
    's3:GetObject',
    's3:ListBucket'
  ],
  resources: [
    'arn:aws:s3:::bcos-public-2c2af3de-6771-4cf3-90ff-330d402c1058',
    'arn:aws:s3:::bcos-public-2c2af3de-6771-4cf3-90ff-330d402c1058/*'
  ]
}));
```

**Current Secrets Manager Access**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Action": [
        "secretsmanager:DescribeSecret",
        "secretsmanager:GetSecretValue"
      ],
      "Resource": [
        "arn:aws:secretsmanager:us-east-1:854428944440:secret:production/bcos-secrets-*",
        "arn:aws:secretsmanager:us-east-1:854428944440:secret:staging/bcos-secrets-*"
      ],
      "Effect": "Allow"
    }
  ]
}
```

This policy allows the ECS task to retrieve S3 credentials from Secrets Manager, which is sufficient for Phase 6.

## Phase 6 Checklist

| Task | Status | Location |
|------|--------|----------|
| 6.1 Update .env.local | ✅ Complete | `.env.local` (already had S3 config) |
| 6.2 Create .env template | ✅ Complete | `.env.s3.template` |
| 6.3 IAM credentials documentation | ✅ Complete | `docs/s3-iam-setup.md` |
| 6.4 ECS deployment documentation | ✅ Complete | `docs/s3-ecs-deployment.md` |
| 6.5 ECS task definition update script | ✅ Complete | `scripts/update-ecs-task-def-s3.sh` |
| 6.6 Verify ECS task role permissions | ✅ Complete | Secrets Manager access verified |

## Files Created in Phase 6

1. `.env.s3.template` - Environment variable template with instructions
2. `docs/s3-iam-setup.md` - Comprehensive IAM setup guide (33KB, 624 lines)
3. `docs/s3-ecs-deployment.md` - ECS deployment guide (21KB, 415 lines)
4. `scripts/update-ecs-task-def-s3.sh` - Automated task definition update script (207 lines)
5. `docs/PHASE_6_COMPLETION_SUMMARY.md` - This summary document

## Next Steps

Ready to proceed to **Phase 7: Migration Script**:

### Prerequisites for Phase 7:
- ✅ S3 service layer implemented (Phase 1)
- ✅ Unit tests passing (Phase 2)
- ✅ Upload service integrated (Phase 3)
- ✅ API route updated (Phase 4)
- ✅ Integration tests passing (Phase 5)
- ✅ Environment configured (Phase 6)

### Phase 7 Tasks:
1. Create `scripts/migrate-uploads-to-s3.ts`
2. Implement practice images migration
3. Implement staff photos migration
4. Add error handling and logging
5. Add dry-run mode
6. Add file existence checks
7. Add database transaction handling
8. Create migration verification script

### Before Starting Phase 7:
- No action required - all Phase 6 deliverables complete
- ECS task definitions will be updated when deploying to staging/production
- Local development environment fully configured

## Security Notes

1. **Credential Management**:
   - IAM user credentials stored in AWS Secrets Manager
   - ECS tasks retrieve credentials at runtime
   - No credentials in git repository
   - Separate IAM users recommended for dev/staging/prod

2. **Permissions**:
   - Least-privilege IAM policy (only bucket access)
   - S3 bucket remains private
   - CloudFront OAI is the only public access method
   - ECS task role has Secrets Manager read access

3. **Rotation**:
   - Credentials should be rotated every 90 days
   - See `docs/s3-iam-setup.md` for rotation procedures
   - AWS Secrets Manager can automate rotation

## Deployment Strategy

When deploying to staging/production:

### Option A: Use Update Script (Before Deployment)
```bash
# 1. Add S3 credentials to Secrets Manager
aws secretsmanager update-secret \
  --secret-id arn:aws:secretsmanager:us-east-1:854428944440:secret:staging/bcos-secrets-vDmCm7 \
  --secret-string '{"S3_PUBLIC_ACCESS_KEY_ID":"AKIA...","S3_PUBLIC_SECRET_ACCESS_KEY":"..."}'

# 2. Run update script
./scripts/update-ecs-task-def-s3.sh

# 3. Push code to trigger deployment
git push origin staging
```

### Option B: Manual Update (After Deployment)
```bash
# 1. Add S3 credentials to Secrets Manager (same as above)

# 2. Get current task definition
aws ecs describe-task-definition --task-definition bcos-staging --query taskDefinition > task-def.json

# 3. Edit task-def.json to add S3 environment variables and secrets

# 4. Register new task definition
aws ecs register-task-definition --cli-input-json file://task-def.json

# 5. Update service
aws ecs update-service \
  --cluster bcos-staging-cluster \
  --service bcos-staging-service \
  --task-definition bcos-staging:NEW_REVISION \
  --force-new-deployment
```

## Verification Steps

After deployment to staging/production:

1. **Check Task Environment**:
   ```bash
   # List running tasks
   aws ecs list-tasks --cluster bcos-staging-cluster --service-name bcos-staging-service

   # Describe task to see environment variables
   aws ecs describe-tasks --cluster bcos-staging-cluster --tasks TASK_ARN
   ```

2. **Test Upload**:
   - Login to staging: https://staging.bendcare.com
   - Upload a practice logo
   - Check CloudWatch logs for "File uploaded to S3"
   - Verify file in S3 bucket
   - Verify CloudFront URL works

3. **Monitor**:
   - CloudWatch logs: `/ecs/bcos-staging`
   - S3 bucket: `bcos-public-2c2af3de-6771-4cf3-90ff-330d402c1058`
   - CloudFront distribution metrics

## Summary

Phase 6 is **100% complete**. All environment configuration tasks have been finished:

- ✅ Local development environment configured
- ✅ Environment templates created
- ✅ Comprehensive documentation written
- ✅ Automated deployment scripts created
- ✅ ECS task role permissions verified
- ✅ Security best practices documented

**Ready to proceed to Phase 7: Migration Script**
