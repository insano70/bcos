# CloudFront CDN Setup for BCOS Public Assets

This directory contains scripts to set up a CloudFront distribution for serving public assets (practice images, user avatars, etc.) from a private S3 bucket.

## Architecture

```
User Request
    ↓
https://cdn.bendcare.com/practices/123/logo.jpg
    ↓
CloudFront Distribution (cached, fast)
    ↓
Origin Access Identity (OAI)
    ↓
S3 Bucket (private - only CloudFront can read)
bcos-public-2c2af3de-6771-4cf3-90ff-330d402c1058
```

**Key Security Features**:
- S3 bucket is **private** (no public access)
- Only CloudFront can read from bucket via Origin Access Identity
- ECS task role can write to bucket (PutObject, DeleteObject)
- Public access via CloudFront URLs only

## Prerequisites

1. **AWS CLI** installed and configured
   ```bash
   aws --version
   aws sts get-caller-identity
   ```

2. **S3 Bucket** exists: `bcos-public-2c2af3de-6771-4cf3-90ff-330d402c1058`

3. **ACM Certificate** for `*.bendcare.com` in us-east-1

4. **Route53 Hosted Zone** for `bendcare.com`

5. **jq** installed (for JSON parsing)
   ```bash
   brew install jq  # macOS
   ```

## Usage

### One-Time Setup

Run the setup script to create all infrastructure:

```bash
cd scripts/cloudfront
./setup-cdn.sh
```

This script will:
1. ✅ Create Origin Access Identity (OAI)
2. ✅ Update S3 bucket policy (allow CloudFront OAI + ECS task role)
3. ✅ Create CloudFront distribution
4. ✅ Create Route53 DNS record for `cdn.bendcare.com`

**Note**: CloudFront deployment takes **15-20 minutes** to complete.

### What Gets Created

**Origin Access Identity**:
- ID saved to `oai-details.json`
- Used by CloudFront to access private S3 bucket

**S3 Bucket Policy**:
- Allows CloudFront OAI to read (`s3:GetObject`)
- Allows ECS task role to write (`s3:PutObject`, `s3:DeleteObject`)
- Policy saved to `bucket-policy.json`

**CloudFront Distribution**:
- ID and details saved to `distribution-details.json`
- Custom domain: `cdn.bendcare.com`
- SSL certificate: Wildcard `*.bendcare.com`
- Cache optimized for images (1 year max TTL)
- HTTP/2 and HTTP/3 enabled
- Compression enabled

**Route53 Record**:
- A record: `cdn.bendcare.com` → CloudFront distribution
- Alias record (no charge for queries)

## Environment Variables

After setup completes, add these to your environment:

### Local Development (`.env.local`)
```bash
# S3 Public Assets Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
S3_PUBLIC_BUCKET=bcos-public-2c2af3de-6771-4cf3-90ff-330d402c1058
CDN_URL=https://cdn.bendcare.com
```

### Staging/Production (ECS Task Definition)
Add to AWS Secrets Manager and reference in task definition:
- `AWS_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `S3_PUBLIC_BUCKET`
- `CDN_URL`

## Testing

### 1. Upload Test File to S3

```bash
echo "Hello from CloudFront!" > test.txt
aws s3 cp test.txt s3://bcos-public-2c2af3de-6771-4cf3-90ff-330d402c1058/test.txt
```

### 2. Test Direct S3 Access (Should Fail)

```bash
curl -I https://bcos-public-2c2af3de-6771-4cf3-90ff-330d402c1058.s3.amazonaws.com/test.txt
# Expected: 403 Forbidden (bucket is private)
```

### 3. Test CloudFront Access (Should Work)

```bash
curl -I https://cdn.bendcare.com/test.txt
# Expected: 200 OK (CloudFront has OAI access)
```

### 4. Verify HTTPS Redirect

```bash
curl -I http://cdn.bendcare.com/test.txt
# Expected: 301 or 302 redirect to HTTPS
```

### 5. Check CloudFront Deployment Status

```bash
DISTRIBUTION_ID=$(cat distribution-details.json | jq -r '.Distribution.Id')
aws cloudfront get-distribution --id $DISTRIBUTION_ID | jq -r '.Distribution.Status'
# Expected: "Deployed" (after 15-20 minutes)
```

## Troubleshooting

### CloudFront returns 403 Forbidden

**Cause**: OAI not properly configured in bucket policy

**Fix**:
```bash
# Verify OAI ID in bucket policy matches distribution
OAI_ID=$(cat oai-details.json | jq -r '.CloudFrontOriginAccessIdentity.Id')
aws s3api get-bucket-policy --bucket bcos-public-2c2af3de-6771-4cf3-90ff-330d402c1058 | jq -r '.Policy' | grep $OAI_ID
```

### DNS not resolving

**Cause**: Route53 record not created or DNS propagation delay

**Fix**:
```bash
# Check DNS record
dig cdn.bendcare.com
nslookup cdn.bendcare.com

# Wait for DNS propagation (up to 5 minutes)
```

### CloudFront deployment stuck

**Cause**: Normal - deployment takes 15-20 minutes

**Fix**: Wait and check status periodically:
```bash
watch -n 60 'aws cloudfront get-distribution --id DISTRIBUTION_ID | jq -r ".Distribution.Status"'
```

### Upload fails from ECS

**Cause**: ECS task role not in bucket policy

**Fix**: Verify ECS task role ARN in `bucket-policy.json`:
```bash
aws iam get-role --role-name BCOS-ECSTaskRole | jq -r '.Role.Arn'
# Should match ARN in bucket-policy.json
```

## Cost Estimation

Based on typical usage:
- **S3 Storage**: ~$0.01/month (500MB at $0.023/GB)
- **CloudFront**: ~$0.43/month (5GB transfer at $0.085/GB)
- **Requests**: ~$0.01/month (10,000 requests)

**Total**: ~$0.45/month (scales with usage)

## Maintenance

### Invalidate CloudFront Cache

To force CloudFront to fetch new versions of files:

```bash
DISTRIBUTION_ID=$(cat distribution-details.json | jq -r '.Distribution.Id')
aws cloudfront create-invalidation \
  --distribution-id $DISTRIBUTION_ID \
  --paths "/*"
```

**Note**: First 1,000 invalidations per month are free, then $0.005 per path.

### Update Bucket Policy

If you need to modify permissions:

1. Edit `bucket-policy.json`
2. Apply updated policy:
```bash
aws s3api put-bucket-policy \
  --bucket bcos-public-2c2af3de-6771-4cf3-90ff-330d402c1058 \
  --policy file://bucket-policy.json
```

### Monitor CloudFront

View CloudFront metrics in AWS Console:
- Requests
- Data transfer
- Error rates (4xx, 5xx)
- Cache hit ratio

Or via CLI:
```bash
DISTRIBUTION_ID=$(cat distribution-details.json | jq -r '.Distribution.Id')
aws cloudfront get-distribution-config --id $DISTRIBUTION_ID
```

## Files Created

After running setup script:

- **`oai-details.json`** - Origin Access Identity details
- **`distribution-details.json`** - CloudFront distribution details
- **`bucket-policy.json`** - S3 bucket policy

**Important**: These files contain AWS resource IDs needed for troubleshooting. Do not delete them.

## Security Notes

1. **Private Bucket**: Direct S3 URLs will not work (403 Forbidden)
2. **OAI Access**: Only CloudFront can read from bucket
3. **ECS Write Access**: Only ECS task role can write/delete objects
4. **HTTPS Only**: CloudFront redirects HTTP to HTTPS
5. **ACM Certificate**: Free SSL/TLS certificate from AWS

## Next Steps

After CloudFront setup completes:

1. ✅ Wait for distribution deployment (~15-20 minutes)
2. ✅ Test CloudFront access with test file
3. ✅ Add environment variables to `.env.local`
4. ✅ Proceed to Phase 1: Create S3 service layer (`lib/s3/public-assets.ts`)
5. ✅ Update upload service to use S3
6. ✅ Test uploads in development
7. ✅ Deploy to staging
8. ✅ Migrate existing files to S3

See `/docs/s3_public_files.md` for complete implementation plan.

## Support

If you encounter issues:

1. Check CloudWatch Logs for errors
2. Review bucket policy configuration
3. Verify ECS task role permissions
4. Check CloudFront distribution status
5. Test with sample file upload

For additional help, see:
- [CloudFront Documentation](https://docs.aws.amazon.com/cloudfront/)
- [S3 Bucket Policies](https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucket-policies.html)
- [Origin Access Identity](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html)
