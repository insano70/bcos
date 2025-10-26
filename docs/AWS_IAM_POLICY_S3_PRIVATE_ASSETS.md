# AWS IAM Policy for S3 Private Assets - Least Privilege

**Policy Name**: `BCOS-S3-PrivateAssets`  
**Policy ARN**: `arn:aws:iam::854428944440:policy/BCOS-S3-PrivateAssets`  
**User Group**: `arn:aws:iam::854428944440:group/BCOS-S3-PrivateAssets`  
**User**: `arn:aws:iam::854428944440:user/bcos-s3-private-assets`  
**Bucket**: `bcos-private-assets` (staging) / `bcos-private-assets-prod` (production)

---

## Recommended Least-Privilege Policy

### Analysis of Required Permissions

Based on code analysis of `lib/s3/private-assets/`, the system uses:

| S3 Command | Used In | Purpose |
|------------|---------|---------|
| `PutObjectCommand` | presigned-urls.ts, image-processing.ts | Upload files, thumbnails |
| `GetObjectCommand` | presigned-urls.ts, image-processing.ts | Download files, generate thumbnails |
| `DeleteObjectCommand` | operations.ts | Delete attachments |
| `HeadObjectCommand` | operations.ts | Check existence, get metadata |
| `CopyObjectCommand` | operations.ts | Copy files (archiving, versioning) |

**No other S3 operations are used** - This allows for minimal permissions.

---

## Recommended IAM Policy (Least Privilege)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowObjectOperations",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:GetObjectAttributes",
        "s3:GetObjectMetadata"
      ],
      "Resource": "arn:aws:s3:::bcos-private-assets/*",
      "Condition": {
        "StringEquals": {
          "s3:x-amz-server-side-encryption": "AES256"
        }
      }
    },
    {
      "Sid": "AllowBucketLevelOperations",
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket",
        "s3:GetBucketLocation"
      ],
      "Resource": "arn:aws:s3:::bcos-private-assets"
    }
  ]
}
```

### For Production (separate bucket)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowObjectOperations",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:GetObjectAttributes",
        "s3:GetObjectMetadata"
      ],
      "Resource": "arn:aws:s3:::bcos-private-assets-prod/*",
      "Condition": {
        "StringEquals": {
          "s3:x-amz-server-side-encryption": "AES256"
        }
      }
    },
    {
      "Sid": "AllowBucketLevelOperations",
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket",
        "s3:GetBucketLocation"
      ],
      "Resource": "arn:aws:s3:::bcos-private-assets-prod"
    }
  ]
}
```

---

## Policy Explanation

### Statement 1: Object Operations
**Actions Granted**:
- ✅ `s3:PutObject` - **Required** for uploads and presigned upload URLs
- ✅ `s3:GetObject` - **Required** for downloads and presigned download URLs
- ✅ `s3:DeleteObject` - **Required** for deleting attachments
- ✅ `s3:GetObjectAttributes` - **Required** for `HeadObjectCommand` (file existence)
- ✅ `s3:GetObjectMetadata` - **Required** for `getFileMetadata()`

**Resource**: 
- `arn:aws:s3:::bcos-private-assets/*` - All objects in bucket (not bucket itself)

**Condition**: 
- Requires server-side encryption (SSE-S3) for all uploads
- Enforces encryption at rest

### Statement 2: Bucket Operations
**Actions Granted**:
- ✅ `s3:ListBucket` - **Helpful** for debugging, listing objects
- ✅ `s3:GetBucketLocation` - **Helpful** for SDK operations

**Resource**: 
- `arn:aws:s3:::bcos-private-assets` - Bucket itself (no /*)

---

## Enhanced Security Policy (Recommended for Production)

Add additional conditions for defense in depth:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowObjectOperations",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:GetObjectAttributes",
        "s3:GetObjectMetadata"
      ],
      "Resource": "arn:aws:s3:::bcos-private-assets-prod/*",
      "Condition": {
        "StringEquals": {
          "s3:x-amz-server-side-encryption": "AES256"
        },
        "NumericLessThanEquals": {
          "s3:content-length": 524288000
        }
      }
    },
    {
      "Sid": "AllowBucketLevelOperations",
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket",
        "s3:GetBucketLocation"
      ],
      "Resource": "arn:aws:s3:::bcos-private-assets-prod"
    },
    {
      "Sid": "DenyUnencryptedUploads",
      "Effect": "Deny",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::bcos-private-assets-prod/*",
      "Condition": {
        "StringNotEquals": {
          "s3:x-amz-server-side-encryption": "AES256"
        }
      }
    }
  ]
}
```

**Additional Conditions**:
- `s3:content-length`: 524288000 - Max 500MB (matches our application limit)
- Explicit deny for unencrypted uploads (defense in depth)

---

## Permissions NOT Required (Explicitly Excluded)

Our code does NOT use these operations, so they should NOT be granted:

❌ **Dangerous Permissions** (NEVER grant):
- `s3:*` - Wildcard (too broad)
- `s3:PutBucketPolicy` - Could grant public access
- `s3:PutBucketAcl` - Could grant public access
- `s3:DeleteBucket` - Could delete entire bucket
- `s3:PutLifecycleConfiguration` - Changes retention
- `s3:PutBucketVersioning` - Changes versioning
- `s3:PutBucketCors` - Could allow unauthorized origins

❌ **Unnecessary Permissions**:
- `s3:GetBucketAcl` - Not used by code
- `s3:GetBucketPolicy` - Not used by code
- `s3:ListAllMyBuckets` - Not needed (only one bucket)
- `s3:CreateBucket` - Bucket created via IaC
- `s3:PutObjectAcl` - Not used (bucket policy handles access)

---

## Comparison: Your Policy vs Recommended

### Potential Issues to Check

**Review your current policy for**:

1. **Overly Broad Actions**
   - ❌ Does it include `s3:*`? (Should be specific actions only)
   - ❌ Does it include `s3:Put*`? (Should be `s3:PutObject` only)
   - ❌ Does it include `s3:Delete*`? (Should be `s3:DeleteObject` only)

2. **Resource Scope**
   - ❌ Does it include `arn:aws:s3:::*`? (Should be specific bucket only)
   - ❌ Does it include other buckets? (Should be private-assets only)

3. **Missing Conditions**
   - ⚠️ Does it enforce encryption? (Should require SSE)
   - ⚠️ Does it have size limits? (Should limit to 500MB)

4. **Bucket-Level Operations**
   - ❌ Does it allow `PutBucketPolicy`? (Should NOT - security risk)
   - ❌ Does it allow `DeleteBucket`? (Should NOT - data loss risk)

---

## S3 Bucket Policy (Complementary)

In addition to IAM policy, add this **bucket policy** for defense in depth:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyInsecureConnections",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::bcos-private-assets",
        "arn:aws:s3:::bcos-private-assets/*"
      ],
      "Condition": {
        "Bool": {
          "aws:SecureTransport": "false"
        }
      }
    },
    {
      "Sid": "DenyPublicReadAccess",
      "Effect": "Deny",
      "Principal": "*",
      "Action": [
        "s3:GetObject",
        "s3:GetObjectVersion"
      ],
      "Resource": "arn:aws:s3:::bcos-private-assets/*",
      "Condition": {
        "StringNotEquals": {
          "aws:PrincipalAccount": "854428944440"
        }
      }
    },
    {
      "Sid": "AllowApplicationUserAccess",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::854428944440:user/bcos-s3-private-assets"
      },
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:GetObjectAttributes",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::bcos-private-assets",
        "arn:aws:s3:::bcos-private-assets/*"
      ],
      "Condition": {
        "StringEquals": {
          "s3:x-amz-server-side-encryption": "AES256"
        }
      }
    }
  ]
}
```

**Bucket Policy Features**:
1. **Deny insecure connections** - Requires HTTPS
2. **Deny public access** - Only account 854428944440 can access
3. **Allow specific user** - Explicit permissions for bcos-s3-private-assets user
4. **Enforce encryption** - All uploads must use SSE-S3

---

## Additional Security Recommendations

### 1. Enable S3 Block Public Access (Required)
```bash
aws s3api put-public-access-block \
  --bucket bcos-private-assets \
  --public-access-block-configuration \
  "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
```

### 2. Enable S3 Server-Side Encryption (Required)
```bash
aws s3api put-bucket-encryption \
  --bucket bcos-private-assets \
  --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"},"BucketKeyEnabled":true}]}'
```

### 3. Enable S3 Versioning (Optional but Recommended)
```bash
aws s3api put-bucket-versioning \
  --bucket bcos-private-assets \
  --versioning-configuration Status=Enabled
```

**Benefit**: Protects against accidental deletion, allows file recovery

### 4. Configure S3 Lifecycle Policy (Optional)
```json
{
  "Rules": [
    {
      "Id": "TransitionOldVersions",
      "Status": "Enabled",
      "NoncurrentVersionTransitions": [
        {
          "NoncurrentDays": 30,
          "StorageClass": "GLACIER_IR"
        }
      ],
      "NoncurrentVersionExpiration": {
        "NoncurrentDays": 90
      }
    }
  ]
}
```

**Benefit**: Reduces storage costs by archiving old versions

### 5. Enable S3 Access Logging (Recommended for Compliance)
```bash
aws s3api put-bucket-logging \
  --bucket bcos-private-assets \
  --bucket-logging-status \
  '{"LoggingEnabled":{"TargetBucket":"bcos-logs","TargetPrefix":"s3-private-assets/"}}'
```

**Benefit**: Audit trail for compliance (HIPAA, SOC 2)

### 6. Configure CORS (Required for Presigned URLs)

**For Staging**:
```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedOrigins": [
      "http://localhost:4001",
      "https://staging.bendcare.com"
    ],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

**For Production**:
```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedOrigins": [
      "https://app.bendcare.com",
      "https://www.bendcare.com"
    ],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Apply with:
```bash
aws s3api put-bucket-cors \
  --bucket bcos-private-assets \
  --cors-configuration file://cors-config.json
```

---

## IAM User Security Best Practices

### 1. Rotate Access Keys Regularly
```bash
# Create new access key
aws iam create-access-key --user-name bcos-s3-private-assets

# Update application env vars with new keys
# Test thoroughly

# Delete old access key (after confirming new one works)
aws iam delete-access-key \
  --user-name bcos-s3-private-assets \
  --access-key-id AKIA_OLD_KEY
```

**Recommendation**: Rotate every 90 days

### 2. Enable CloudTrail Logging
```bash
# Ensure CloudTrail is logging S3 data events
aws cloudtrail put-event-selectors \
  --trail-name bcos-trail \
  --event-selectors '[{
    "ReadWriteType": "All",
    "IncludeManagementEvents": true,
    "DataResources": [{
      "Type": "AWS::S3::Object",
      "Values": ["arn:aws:s3:::bcos-private-assets/*"]
    }]
  }]'
```

**Benefit**: Tracks all API calls for security investigations

### 3. Set Up CloudWatch Alarms
```bash
# Alarm for excessive DELETE operations (potential data loss)
aws cloudwatch put-metric-alarm \
  --alarm-name bcos-s3-private-excessive-deletes \
  --alarm-description "Alert on >100 deletes per hour" \
  --metric-name DeleteRequests \
  --namespace AWS/S3 \
  --statistic Sum \
  --period 3600 \
  --threshold 100 \
  --comparison-operator GreaterThanThreshold

# Alarm for 4xx errors (authentication/permission issues)
aws cloudwatch put-metric-alarm \
  --alarm-name bcos-s3-private-4xx-errors \
  --alarm-description "Alert on S3 4xx error rate >5%" \
  --metric-name 4xxErrors \
  --namespace AWS/S3 \
  --statistic Average \
  --period 300 \
  --threshold 5 \
  --comparison-operator GreaterThanThreshold
```

---

## Security Checklist

### ✅ IAM Policy Security
- [ ] Policy grants ONLY required actions (5 actions, not s3:*)
- [ ] Resource scoped to specific bucket only
- [ ] Encryption condition enforced (SSE-S3)
- [ ] File size limit condition added (500MB max)
- [ ] No bucket-level modification permissions (PutBucketPolicy, etc.)
- [ ] No wildcard resources (arn:aws:s3:::*)

### ✅ Bucket Security
- [ ] Block Public Access enabled (all 4 settings)
- [ ] Server-side encryption enabled (SSE-S3)
- [ ] Bucket policy denies insecure transport (HTTPS only)
- [ ] Bucket policy denies public read access
- [ ] CORS configured for specific origins only
- [ ] Versioning enabled (optional but recommended)

### ✅ Monitoring & Compliance
- [ ] CloudTrail logging enabled for S3 data events
- [ ] S3 access logging enabled
- [ ] CloudWatch alarms configured
- [ ] Access key rotation schedule (90 days)
- [ ] Regular IAM policy review (quarterly)

### ✅ Application Security
- [ ] Credentials stored in secrets manager (not .env files in production)
- [ ] Environment validation enabled (Zod schema)
- [ ] RBAC checks before URL generation
- [ ] MIME type whitelist enforced
- [ ] File size limits enforced

---

## Comparison: Minimal vs Enhanced Policy

### Minimal (Production-Ready)
```json
{
  "Action": [
    "s3:PutObject",
    "s3:GetObject", 
    "s3:DeleteObject",
    "s3:GetObjectAttributes",
    "s3:ListBucket"
  ],
  "Resource": [
    "arn:aws:s3:::bcos-private-assets",
    "arn:aws:s3:::bcos-private-assets/*"
  ]
}
```

**Pros**: Simple, sufficient  
**Cons**: No conditions, less defense in depth

### Enhanced (Recommended)
```json
{
  "Action": [...same...],
  "Resource": [...same...],
  "Condition": {
    "StringEquals": {
      "s3:x-amz-server-side-encryption": "AES256"
    },
    "NumericLessThanEquals": {
      "s3:content-length": 524288000
    }
  }
}
```

**Pros**: Defense in depth, encryption enforced, size limits  
**Cons**: Slightly more complex

**Recommendation**: Use Enhanced policy for production

---

## Validation Commands

### Test IAM Policy
```bash
# Simulate policy
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::854428944440:user/bcos-s3-private-assets \
  --action-names s3:PutObject s3:GetObject s3:DeleteObject \
  --resource-arns arn:aws:s3:::bcos-private-assets/test-file.pdf

# Expected output: "allowed" for all actions
```

### Test S3 Access
```bash
# Test upload (should succeed)
aws s3 cp test.txt s3://bcos-private-assets/test/test.txt \
  --profile bcos-s3-private

# Test list (should succeed)
aws s3 ls s3://bcos-private-assets/ --profile bcos-s3-private

# Test delete (should succeed)
aws s3 rm s3://bcos-private-assets/test/test.txt \
  --profile bcos-s3-private

# Test bucket policy change (should fail - permission denied)
aws s3api put-bucket-policy \
  --bucket bcos-private-assets \
  --policy '{}' \
  --profile bcos-s3-private
# Expected: AccessDenied ✅
```

---

## Policy Update Commands

### Update IAM Policy
```bash
# Save recommended policy to file
cat > bcos-s3-private-policy.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowObjectOperations",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:GetObjectAttributes",
        "s3:GetObjectMetadata"
      ],
      "Resource": "arn:aws:s3:::bcos-private-assets/*",
      "Condition": {
        "StringEquals": {
          "s3:x-amz-server-side-encryption": "AES256"
        },
        "NumericLessThanEquals": {
          "s3:content-length": 524288000
        }
      }
    },
    {
      "Sid": "AllowBucketLevelOperations",
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket",
        "s3:GetBucketLocation"
      ],
      "Resource": "arn:aws:s3:::bcos-private-assets"
    }
  ]
}
EOF

# Update the policy
aws iam put-user-policy \
  --user-name bcos-s3-private-assets \
  --policy-name BCOS-S3-PrivateAssets \
  --policy-document file://bcos-s3-private-policy.json

# Or update managed policy
aws iam create-policy-version \
  --policy-arn arn:aws:iam::854428944440:policy/BCOS-S3-PrivateAssets \
  --policy-document file://bcos-s3-private-policy.json \
  --set-as-default
```

---

## Summary & Recommendations

### ✅ Minimum Required Permissions (5 actions)
1. `s3:PutObject` - Upload files
2. `s3:GetObject` - Download files
3. `s3:DeleteObject` - Delete files
4. `s3:GetObjectAttributes` - Check existence/metadata
5. `s3:ListBucket` - List objects (helpful for debugging)

### ⚠️ Common Mistakes to Avoid
1. ❌ Granting `s3:*` (wildcard - too broad)
2. ❌ Including `s3:PutBucketPolicy` (security risk)
3. ❌ Using `Resource: "*"` (too broad)
4. ❌ No encryption conditions (unencrypted uploads allowed)
5. ❌ No size limit conditions (storage abuse possible)

### 🎯 Best Practice Policy
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PrivateAssetsAccess",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:GetObjectAttributes",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::bcos-private-assets",
        "arn:aws:s3:::bcos-private-assets/*"
      ],
      "Condition": {
        "StringEquals": {
          "s3:x-amz-server-side-encryption": "AES256"
        },
        "NumericLessThanEquals": {
          "s3:content-length": 524288000
        }
      }
    }
  ]
}
```

**This policy**:
- ✅ Grants only necessary permissions
- ✅ Scoped to specific bucket
- ✅ Enforces encryption
- ✅ Limits file size
- ✅ No dangerous permissions
- ✅ Follows principle of least privilege

---

**Action Required**: Review your current policy against these recommendations and update if needed.

