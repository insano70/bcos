# Complete CloudFront Custom Domain Setup

## Current Status

✅ CloudFront Distribution: `E2DXGE5UITHREC`
✅ CloudFront Domain: `d1gwoukwng91sf.cloudfront.net`
✅ S3 Bucket Policy: Configured with OAI
✅ Route53 CNAME: `cdn.bendcare.com` → CloudFront
⏳ New RSA Certificate: `arn:aws:acm:us-east-1:854428944440:certificate/09ccdc35-55d8-4ccc-9db1-c5c714b523df`
⏳ Certificate Status: PENDING_VALIDATION

## Issue Identified

The original wildcard certificate (`*.bendcare.com`) uses **EC (Elliptic Curve)** algorithm which CloudFront rejected.

**Solution**: Created new RSA-2048 certificate specifically for `cdn.bendcare.com`.

## Next Steps

### 1. Wait for Certificate Validation (5-10 minutes)

Check status with:
```bash
aws acm describe-certificate \
  --certificate-arn arn:aws:acm:us-east-1:854428944440:certificate/09ccdc35-55d8-4ccc-9db1-c5c714b523df \
  --region us-east-1 \
  --output json | grep '"Status"'
```

Wait for status to change from `PENDING_VALIDATION` to `ISSUED`.

### 2. Update CloudFront Distribution

Once certificate is ISSUED, run this command:

```bash
# Get current distribution config and ETag
aws cloudfront get-distribution-config \
  --id E2DXGE5UITHREC \
  --output json > /tmp/current-config.json

ETAG=$(cat /tmp/current-config.json | jq -r '.ETag')

# Update config with alias and new certificate
cat /tmp/current-config.json | jq --arg cert "arn:aws:acm:us-east-1:854428944440:certificate/09ccdc35-55d8-4ccc-9db1-c5c714b523df" '.DistributionConfig | .Aliases = {"Quantity": 1, "Items": ["cdn.bendcare.com"]} | .ViewerCertificate = {"CloudFrontDefaultCertificate": false, "ACMCertificateArn": $cert, "SSLSupportMethod": "sni-only", "MinimumProtocolVersion": "TLSv1.2_2021", "Certificate": $cert, "CertificateSource": "acm"}' > /tmp/updated-config.json

# Apply update
aws cloudfront update-distribution \
  --id E2DXGE5UITHREC \
  --distribution-config file:///tmp/updated-config.json \
  --if-match "$ETAG" \
  --output json
```

### 3. Wait for CloudFront Deployment (15-20 minutes)

Check deployment status:
```bash
aws cloudfront get-distribution --id E2DXGE5UITHREC | jq -r '.Distribution.Status'
```

Wait for status to change from `InProgress` to `Deployed`.

### 4. Test Custom Domain

Once deployed, test access:
```bash
# Test file should return 200 OK
curl -I https://cdn.bendcare.com/test.txt

# Should see:
# HTTP/2 200
# server: CloudFront
```

## Certificate Details

**New Certificate ARN**: `arn:aws:acm:us-east-1:854428944440:certificate/09ccdc35-55d8-4ccc-9db1-c5c714b523df`
**Domain**: `cdn.bendcare.com`
**Key Algorithm**: RSA-2048 (CloudFront compatible)
**Validation Method**: DNS
**Validation Record**: Already exists in Route53

## Files Created

- `new-cert-request.json` - Certificate request details
- `cert-validation-record.json` - DNS validation record
- `COMPLETE_SETUP.md` - This file

## Troubleshooting

**If certificate validation stalls**:
- Check Route53 for validation CNAME record: `_a7e827076ed07db729c5e05b75982d2e.cdn.bendcare.com`
- Verify it points to: `_e429cffded0b3b201dfc6ca0fa51ffc9.xlfgrmvvlj.acm-validations.aws.`

**If CloudFront update fails**:
- Ensure certificate status is ISSUED (not PENDING_VALIDATION)
- Verify using correct ETag for distribution update
- Check certificate is in us-east-1 region

**If custom domain returns 403**:
- Wait for CloudFront deployment to complete (can take 15-20 minutes)
- Verify Aliases includes cdn.bendcare.com
- Check ViewerCertificate points to correct ARN

## When Setup is Complete

Update your environment variables:

```bash
# .env.local
S3_PUBLIC_REGION=us-east-1
S3_PUBLIC_ACCESS_KEY_ID=<your-access-key>
S3_PUBLIC_SECRET_ACCESS_KEY=<your-secret-key>
S3_PUBLIC_BUCKET=bcos-public-2c2af3de-6771-4cf3-90ff-330d402c1058
CDN_URL=https://cdn.bendcare.com
```

Then proceed to **Phase 1**: Create S3 service layer (`lib/s3/public-assets.ts`)

---

**Quick Status Check**:
```bash
# Certificate status
aws acm describe-certificate --certificate-arn arn:aws:acm:us-east-1:854428944440:certificate/09ccdc35-55d8-4ccc-9db1-c5c714b523df --region us-east-1 --output json | grep '"Status"' | head -1

# Distribution status
aws cloudfront get-distribution --id E2DXGE5UITHREC | jq -r '.Distribution.Status'

# Test access
curl -I https://cdn.bendcare.com/test.txt
```
