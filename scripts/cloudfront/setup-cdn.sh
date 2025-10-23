#!/bin/bash
set -e

# CloudFront CDN Setup Script for BCOS Public Assets
# This script creates a CloudFront distribution with Origin Access Identity
# for secure, private S3 bucket access with public CDN delivery.
#
# Usage: ./setup-cdn.sh

# Configuration
AWS_ACCOUNT_ID="854428944440"
S3_BUCKET="bcos-public-2c2af3de-6771-4cf3-90ff-330d402c1058"
CDN_DOMAIN="cdn.bendcare.com"
ACM_CERT_ARN="arn:aws:acm:us-east-1:854428944440:certificate/050ddf8e-cfd0-46a3-befc-baf335c8eb26"
HOSTED_ZONE_ID="Z05961102TVIVESKQ4GAL"
AWS_REGION="us-east-1"

# Output files
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OAI_OUTPUT="$SCRIPT_DIR/oai-details.json"
DISTRIBUTION_OUTPUT="$SCRIPT_DIR/distribution-details.json"
BUCKET_POLICY_FILE="$SCRIPT_DIR/bucket-policy.json"

echo "========================================="
echo "BCOS CloudFront CDN Setup"
echo "========================================="
echo ""
echo "Configuration:"
echo "  AWS Account: $AWS_ACCOUNT_ID"
echo "  S3 Bucket: $S3_BUCKET"
echo "  CDN Domain: $CDN_DOMAIN"
echo "  ACM Certificate: $ACM_CERT_ARN"
echo "  Route53 Zone: $HOSTED_ZONE_ID"
echo ""

# Check prerequisites
echo "Checking prerequisites..."

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    echo "❌ ERROR: AWS CLI not found. Please install AWS CLI."
    exit 1
fi

# Check AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    echo "❌ ERROR: AWS credentials not configured. Please run 'aws configure'."
    exit 1
fi

# Check S3 bucket exists
if ! aws s3 ls "s3://$S3_BUCKET" &> /dev/null; then
    echo "❌ ERROR: S3 bucket '$S3_BUCKET' not found."
    exit 1
fi

echo "✅ Prerequisites check passed"
echo ""

# Step 1: Create Origin Access Identity
echo "========================================="
echo "Step 1: Creating Origin Access Identity"
echo "========================================="

CALLER_REF="bcos-public-assets-$(date +%s)"
OAI_RESULT=$(aws cloudfront create-cloud-front-origin-access-identity \
    --cloud-front-origin-access-identity-config \
    CallerReference="$CALLER_REF",Comment="OAI for BCOS public assets bucket" \
    --output json)

echo "$OAI_RESULT" > "$OAI_OUTPUT"

OAI_ID=$(echo "$OAI_RESULT" | jq -r '.CloudFrontOriginAccessIdentity.Id')
OAI_CANONICAL_USER=$(echo "$OAI_RESULT" | jq -r '.CloudFrontOriginAccessIdentity.S3CanonicalUserId')

echo "✅ Created Origin Access Identity"
echo "   OAI ID: $OAI_ID"
echo "   Canonical User: $OAI_CANONICAL_USER"
echo "   Saved to: $OAI_OUTPUT"
echo ""

# Step 2: Update S3 Bucket Policy
echo "========================================="
echo "Step 2: Updating S3 Bucket Policy"
echo "========================================="

# Get ECS task role ARN (try to find it)
ECS_TASK_ROLE_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:role/BCOS-ECSTaskRole"

# Create bucket policy
cat > "$BUCKET_POLICY_FILE" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "CloudFrontReadAccess",
      "Effect": "Allow",
      "Principal": {
        "CanonicalUser": "$OAI_CANONICAL_USER"
      },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::${S3_BUCKET}/*"
    },
    {
      "Sid": "ECSWriteAccess",
      "Effect": "Allow",
      "Principal": {
        "AWS": "${ECS_TASK_ROLE_ARN}"
      },
      "Action": [
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::${S3_BUCKET}/*"
    }
  ]
}
EOF

echo "Created bucket policy:"
cat "$BUCKET_POLICY_FILE"
echo ""

# Apply bucket policy
aws s3api put-bucket-policy \
    --bucket "$S3_BUCKET" \
    --policy file://"$BUCKET_POLICY_FILE"

echo "✅ Applied bucket policy to S3 bucket"
echo "   Policy saved to: $BUCKET_POLICY_FILE"
echo ""

# Step 3: Create CloudFront Distribution Config
echo "========================================="
echo "Step 3: Creating CloudFront Distribution"
echo "========================================="

DISTRIBUTION_CONFIG=$(cat <<EOF
{
  "CallerReference": "$CALLER_REF",
  "Comment": "BCOS Public Assets CDN",
  "Enabled": true,
  "Origins": {
    "Quantity": 1,
    "Items": [
      {
        "Id": "S3-${S3_BUCKET}",
        "DomainName": "${S3_BUCKET}.s3.amazonaws.com",
        "S3OriginConfig": {
          "OriginAccessIdentity": "origin-access-identity/cloudfront/${OAI_ID}"
        }
      }
    ]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "S3-${S3_BUCKET}",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": {
      "Quantity": 2,
      "Items": ["GET", "HEAD"],
      "CachedMethods": {
        "Quantity": 2,
        "Items": ["GET", "HEAD"]
      }
    },
    "Compress": true,
    "CachePolicyId": "658327ea-f89d-4fab-a63d-7e88639e58f6",
    "MinTTL": 0,
    "DefaultTTL": 86400,
    "MaxTTL": 31536000,
    "ForwardedValues": {
      "QueryString": false,
      "Cookies": {
        "Forward": "none"
      }
    },
    "TrustedSigners": {
      "Enabled": false,
      "Quantity": 0
    }
  },
  "Aliases": {
    "Quantity": 1,
    "Items": ["${CDN_DOMAIN}"]
  },
  "ViewerCertificate": {
    "ACMCertificateArn": "${ACM_CERT_ARN}",
    "SSLSupportMethod": "sni-only",
    "MinimumProtocolVersion": "TLSv1.2_2021"
  },
  "PriceClass": "PriceClass_100",
  "HttpVersion": "http2and3"
}
EOF
)

# Create distribution
DISTRIBUTION_RESULT=$(aws cloudfront create-distribution \
    --distribution-config "$DISTRIBUTION_CONFIG" \
    --output json)

echo "$DISTRIBUTION_RESULT" > "$DISTRIBUTION_OUTPUT"

DISTRIBUTION_ID=$(echo "$DISTRIBUTION_RESULT" | jq -r '.Distribution.Id')
DISTRIBUTION_DOMAIN=$(echo "$DISTRIBUTION_RESULT" | jq -r '.Distribution.DomainName')
DISTRIBUTION_STATUS=$(echo "$DISTRIBUTION_RESULT" | jq -r '.Distribution.Status')

echo "✅ Created CloudFront Distribution"
echo "   Distribution ID: $DISTRIBUTION_ID"
echo "   CloudFront Domain: $DISTRIBUTION_DOMAIN"
echo "   Status: $DISTRIBUTION_STATUS"
echo "   Saved to: $DISTRIBUTION_OUTPUT"
echo ""
echo "⏳ Note: Distribution deployment takes 15-20 minutes"
echo ""

# Step 4: Create Route53 DNS Record
echo "========================================="
echo "Step 4: Creating Route53 DNS Record"
echo "========================================="

ROUTE53_CHANGE=$(cat <<EOF
{
  "Changes": [
    {
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "${CDN_DOMAIN}",
        "Type": "A",
        "AliasTarget": {
          "HostedZoneId": "Z2FDTNDATAQYW2",
          "DNSName": "${DISTRIBUTION_DOMAIN}",
          "EvaluateTargetHealth": false
        }
      }
    }
  ]
}
EOF
)

ROUTE53_RESULT=$(aws route53 change-resource-record-sets \
    --hosted-zone-id "$HOSTED_ZONE_ID" \
    --change-batch "$ROUTE53_CHANGE" \
    --output json)

CHANGE_ID=$(echo "$ROUTE53_RESULT" | jq -r '.ChangeInfo.Id')

echo "✅ Created Route53 DNS record"
echo "   Record: ${CDN_DOMAIN} -> ${DISTRIBUTION_DOMAIN}"
echo "   Change ID: $CHANGE_ID"
echo ""

# Summary
echo "========================================="
echo "Setup Complete!"
echo "========================================="
echo ""
echo "Summary:"
echo "  ✅ Origin Access Identity: $OAI_ID"
echo "  ✅ S3 Bucket Policy: Updated"
echo "  ✅ CloudFront Distribution: $DISTRIBUTION_ID"
echo "  ✅ Route53 DNS Record: ${CDN_DOMAIN}"
echo ""
echo "⏳ CloudFront deployment in progress (15-20 minutes)"
echo ""
echo "Environment Variables:"
echo "  Add these to your .env.local and ECS task definition:"
echo ""
echo "  CDN_URL=https://${CDN_DOMAIN}"
echo "  S3_PUBLIC_BUCKET=${S3_BUCKET}"
echo "  AWS_REGION=${AWS_REGION}"
echo ""
echo "Next Steps:"
echo "  1. Wait for CloudFront deployment to complete"
echo "  2. Test access: https://${CDN_DOMAIN}/test.txt"
echo "  3. Add environment variables to .env.local"
echo "  4. Proceed to Phase 1: Create S3 service layer"
echo ""
echo "Files created:"
echo "  - $OAI_OUTPUT"
echo "  - $DISTRIBUTION_OUTPUT"
echo "  - $BUCKET_POLICY_FILE"
echo ""
