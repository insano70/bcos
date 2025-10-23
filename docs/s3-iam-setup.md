# S3 IAM Setup Guide

This guide explains how to create and configure IAM users and permissions for the S3 public assets service.

## Overview

The S3 public assets service requires AWS credentials with specific permissions to upload, delete, and manage files in the S3 bucket. This guide covers creating IAM users, policies, and access keys for development, staging, and production environments.

## Architecture

- **S3 Bucket**: `bcos-public-2c2af3de-6771-4cf3-90ff-330d402c1058`
- **Region**: `us-east-1`
- **CloudFront Distribution**: `cdn.bendcare.com`
- **Access Pattern**: Private S3 bucket accessible via CloudFront OAI
- **Upload Access**: IAM users with write permissions

## IAM Policy

### Required Permissions

The IAM user needs the following permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "S3PublicBucketWrite",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::bcos-public-2c2af3de-6771-4cf3-90ff-330d402c1058",
        "arn:aws:s3:::bcos-public-2c2af3de-6771-4cf3-90ff-330d402c1058/*"
      ]
    }
  ]
}
```

### Permission Breakdown

| Permission | Purpose | Required |
|------------|---------|----------|
| `s3:PutObject` | Upload new files | ✅ Yes |
| `s3:DeleteObject` | Delete old files | ✅ Yes |
| `s3:GetObject` | Read files for verification | ⚠️ Recommended |
| `s3:ListBucket` | List bucket contents | ⚠️ Recommended |

## Setup Instructions

### Option 1: AWS Management Console

#### Step 1: Create IAM Policy

1. Navigate to IAM → Policies → Create Policy
2. Select JSON tab
3. Paste the policy JSON above
4. Click "Next: Tags"
5. (Optional) Add tags for organization
6. Click "Next: Review"
7. Name: `bcos-s3-public-bucket-write`
8. Description: `Write access to BCOS public assets S3 bucket`
9. Click "Create Policy"

#### Step 2: Create IAM User

1. Navigate to IAM → Users → Add User
2. User name: `bcos-s3-public-uploads-dev` (or `-staging`, `-prod`)
3. Select "Access key - Programmatic access"
4. Click "Next: Permissions"
5. Select "Attach existing policies directly"
6. Search for `bcos-s3-public-bucket-write`
7. Check the policy checkbox
8. Click "Next: Tags"
9. (Optional) Add tags:
   - `Environment`: `development` (or `staging`, `production`)
   - `Application`: `bcos`
   - `Purpose`: `s3-public-uploads`
10. Click "Next: Review"
11. Click "Create User"

#### Step 3: Generate Access Keys

1. On the success page, click "Download .csv" to save credentials
2. **IMPORTANT**: Store credentials securely (password manager, AWS Secrets Manager)
3. Copy Access Key ID to `.env.local` as `S3_PUBLIC_ACCESS_KEY_ID`
4. Copy Secret Access Key to `.env.local` as `S3_PUBLIC_SECRET_ACCESS_KEY`

### Option 2: AWS CLI

#### Step 1: Create IAM Policy

```bash
# Save policy JSON to file
cat > s3-public-bucket-write-policy.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "S3PublicBucketWrite",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::bcos-public-2c2af3de-6771-4cf3-90ff-330d402c1058",
        "arn:aws:s3:::bcos-public-2c2af3de-6771-4cf3-90ff-330d402c1058/*"
      ]
    }
  ]
}
EOF

# Create policy
aws iam create-policy \
  --policy-name bcos-s3-public-bucket-write \
  --policy-document file://s3-public-bucket-write-policy.json \
  --description "Write access to BCOS public assets S3 bucket"

# Capture ARN for next step
POLICY_ARN=$(aws iam list-policies --query 'Policies[?PolicyName==`bcos-s3-public-bucket-write`].Arn' --output text)
echo "Policy ARN: $POLICY_ARN"
```

#### Step 2: Create IAM User

```bash
# Create IAM user
aws iam create-user \
  --user-name bcos-s3-public-uploads-dev \
  --tags Key=Environment,Value=development Key=Application,Value=bcos Key=Purpose,Value=s3-public-uploads

# Attach policy
aws iam attach-user-policy \
  --user-name bcos-s3-public-uploads-dev \
  --policy-arn "$POLICY_ARN"
```

#### Step 3: Generate Access Keys

```bash
# Create access key
aws iam create-access-key \
  --user-name bcos-s3-public-uploads-dev \
  --output json > access-key.json

# Display credentials (save these immediately)
cat access-key.json

# Extract values for .env.local
ACCESS_KEY_ID=$(jq -r '.AccessKey.AccessKeyId' access-key.json)
SECRET_ACCESS_KEY=$(jq -r '.AccessKey.SecretAccessKey' access-key.json)

echo "S3_PUBLIC_ACCESS_KEY_ID=$ACCESS_KEY_ID"
echo "S3_PUBLIC_SECRET_ACCESS_KEY=$SECRET_ACCESS_KEY"

# IMPORTANT: Delete access-key.json after copying credentials
rm access-key.json
```

## Environment-Specific Users

Create separate IAM users for each environment:

| Environment | IAM User Name | Purpose |
|-------------|---------------|---------|
| Development | `bcos-s3-public-uploads-dev` | Local development |
| Staging | `bcos-s3-public-uploads-staging` | Staging environment |
| Production | `bcos-s3-public-uploads-prod` | Production environment |

**Why separate users?**
- Easier credential rotation
- Audit trail per environment
- Can revoke access to specific environment without affecting others
- Better security isolation

## ECS Task Role (Staging/Production)

For staging and production ECS tasks, use IAM task roles instead of access keys when possible.

### Option 1: IAM Task Role (Recommended)

1. Navigate to IAM → Roles → Create Role
2. Select "AWS service" → "Elastic Container Service"
3. Select "Elastic Container Service Task"
4. Click "Next: Permissions"
5. Attach policy: `bcos-s3-public-bucket-write`
6. Click "Next: Tags"
7. Add tags (Environment, Application)
8. Click "Next: Review"
9. Name: `BCOS-ECSTaskRole-S3Public`
10. Click "Create Role"

Update ECS task definition:
```json
{
  "taskRoleArn": "arn:aws:iam::854428944440:role/BCOS-ECSTaskRole-S3Public"
}
```

**Benefits**:
- No long-lived credentials
- Automatic credential rotation
- Better security posture
- Easier audit trail

### Option 2: Environment Variables (Fallback)

If task roles cannot be used, store credentials in AWS Secrets Manager:

```bash
# Create secret
aws secretsmanager create-secret \
  --name bcos/staging/s3-public-credentials \
  --description "S3 public upload credentials for staging" \
  --secret-string '{
    "S3_PUBLIC_ACCESS_KEY_ID": "AKIA...",
    "S3_PUBLIC_SECRET_ACCESS_KEY": "..."
  }'

# Reference in ECS task definition
{
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
```

## Security Best Practices

### 1. Credential Rotation

Rotate access keys every 90 days:

```bash
# Create new access key
aws iam create-access-key --user-name bcos-s3-public-uploads-dev

# Update .env.local with new credentials

# Test new credentials work

# Delete old access key
aws iam delete-access-key \
  --user-name bcos-s3-public-uploads-dev \
  --access-key-id AKIA_OLD_KEY_ID
```

### 2. Least Privilege

- Only grant permissions actually needed
- Don't use root account credentials
- Don't use admin IAM users for application access
- Review permissions quarterly

### 3. Monitoring

Enable CloudTrail logging for S3 bucket:

```bash
# Check CloudTrail logs for S3 operations
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=ResourceName,AttributeValue=bcos-public-2c2af3de-6771-4cf3-90ff-330d402c1058 \
  --max-results 50
```

### 4. MFA Delete (Optional)

Enable MFA delete for production bucket:

```bash
aws s3api put-bucket-versioning \
  --bucket bcos-public-2c2af3de-6771-4cf3-90ff-330d402c1058 \
  --versioning-configuration Status=Enabled,MFADelete=Enabled \
  --mfa "arn:aws:iam::854428944440:mfa/root-account-mfa-device XXXXXX"
```

## Testing IAM Credentials

### Test 1: List Bucket

```bash
# Set credentials
export AWS_ACCESS_KEY_ID=AKIA...
export AWS_SECRET_ACCESS_KEY=...
export AWS_REGION=us-east-1

# Test list bucket
aws s3 ls s3://bcos-public-2c2af3de-6771-4cf3-90ff-330d402c1058/

# Expected: Success (lists contents or empty)
```

### Test 2: Upload File

```bash
# Create test file
echo "Test upload" > test-upload.txt

# Upload to S3
aws s3 cp test-upload.txt s3://bcos-public-2c2af3de-6771-4cf3-90ff-330d402c1058/test/test-upload.txt

# Expected: Success message
```

### Test 3: Delete File

```bash
# Delete test file
aws s3 rm s3://bcos-public-2c2af3de-6771-4cf3-90ff-330d402c1058/test/test-upload.txt

# Expected: Success message
```

### Test 4: Verify CloudFront Access Denied

```bash
# Try to access via S3 direct URL (should fail)
curl https://s3.amazonaws.com/bcos-public-2c2af3de-6771-4cf3-90ff-330d402c1058/test/test.jpg

# Expected: 403 Forbidden (bucket is private)
```

## Troubleshooting

### Error: Access Denied

**Symptom**: `An error occurred (AccessDenied) when calling the PutObject operation`

**Solutions**:
1. Verify IAM policy is attached to user
2. Check bucket name is correct
3. Verify credentials are current (not rotated)
4. Check bucket policy doesn't deny access

### Error: Invalid Access Key

**Symptom**: `The AWS Access Key Id you provided does not exist in our records`

**Solutions**:
1. Verify access key is copied correctly (no extra spaces)
2. Check access key hasn't been deleted
3. Verify using correct AWS account

### Error: Signature Does Not Match

**Symptom**: `The request signature we calculated does not match the signature you provided`

**Solutions**:
1. Verify secret access key is copied correctly
2. Check for invisible characters in .env.local
3. Regenerate access keys if needed

## Additional Resources

- [AWS IAM Best Practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)
- [S3 Bucket Policies](https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucket-policies.html)
- [CloudFront OAI](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html)
- [ECS Task IAM Roles](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-iam-roles.html)
