#!/bin/bash

#
# Update ECS Task Definitions with S3 Environment Variables
# This script adds S3 public assets configuration to staging and production task definitions
#

set -e

AWS_REGION="us-east-1"
BUCKET_NAME="bcos-public-2c2af3de-6771-4cf3-90ff-330d402c1058"
CDN_URL="https://cdn.bendcare.com"

echo "========================================="
echo "S3 ECS Task Definition Update Script"
echo "========================================="
echo ""

# Function to update task definition for a given environment
update_task_definition() {
  local ENVIRONMENT=$1
  local TASK_DEF_NAME="bcos-${ENVIRONMENT}"
  local SECRET_ARN=$2

  echo "🔄 Processing ${ENVIRONMENT} environment..."
  echo "   Task Definition: ${TASK_DEF_NAME}"

  # Get current task definition
  echo "   📥 Fetching current task definition..."
  aws ecs describe-task-definition \
    --task-definition "${TASK_DEF_NAME}" \
    --query 'taskDefinition' \
    --region "${AWS_REGION}" \
    > "/tmp/${TASK_DEF_NAME}-current.json"

  # Check if S3 environment variables already exist
  EXISTING_S3_VARS=$(cat "/tmp/${TASK_DEF_NAME}-current.json" | \
    jq -r '.containerDefinitions[0].environment | map(select(.name | startswith("S3_PUBLIC_") or . == "CDN_URL")) | length')

  if [ "${EXISTING_S3_VARS}" -gt "0" ]; then
    echo "   ℹ️  S3 environment variables already exist (${EXISTING_S3_VARS} variables)"
    echo "   ⏭️  Skipping ${ENVIRONMENT} - already configured"
    echo ""
    return 0
  fi

  # Add S3 environment variables
  echo "   ➕ Adding S3 environment variables..."

  cat "/tmp/${TASK_DEF_NAME}-current.json" | \
    jq --arg bucket "${BUCKET_NAME}" \
       --arg cdn "${CDN_URL}" \
       --arg region "${AWS_REGION}" \
       '.containerDefinitions[0].environment += [
         {"name": "S3_PUBLIC_REGION", "value": $region},
         {"name": "S3_PUBLIC_BUCKET", "value": $bucket},
         {"name": "CDN_URL", "value": $cdn}
       ]' \
    > "/tmp/${TASK_DEF_NAME}-updated-env.json"

  # Add S3 secrets (credentials from Secrets Manager)
  echo "   🔐 Adding S3 credential secrets..."

  cat "/tmp/${TASK_DEF_NAME}-updated-env.json" | \
    jq --arg secret_arn "${SECRET_ARN}" \
       '.containerDefinitions[0].secrets += [
         {"name": "S3_PUBLIC_ACCESS_KEY_ID", "valueFrom": ($secret_arn + ":S3_PUBLIC_ACCESS_KEY_ID::")},
         {"name": "S3_PUBLIC_SECRET_ACCESS_KEY", "valueFrom": ($secret_arn + ":S3_PUBLIC_SECRET_ACCESS_KEY::")}
       ]' \
    > "/tmp/${TASK_DEF_NAME}-updated.json"

  # Clean up task definition (remove fields that can't be registered)
  echo "   🧹 Cleaning up task definition..."

  cat "/tmp/${TASK_DEF_NAME}-updated.json" | \
    jq 'del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities, .registeredAt, .registeredBy)' \
    > "/tmp/${TASK_DEF_NAME}-final.json"

  # Show what will be added
  echo "   📋 New environment variables:"
  cat "/tmp/${TASK_DEF_NAME}-final.json" | \
    jq -r '.containerDefinitions[0].environment | map(select(.name | startswith("S3_PUBLIC_") or . == "CDN_URL")) | .[] | "      - \(.name) = \(.value)"'

  echo "   🔐 New secrets:"
  cat "/tmp/${TASK_DEF_NAME}-final.json" | \
    jq -r '.containerDefinitions[0].secrets | map(select(.name | startswith("S3_PUBLIC_"))) | .[] | "      - \(.name) -> \(.valueFrom | split(":")[0:6] | join(":"))"'

  # Ask for confirmation
  echo ""
  read -p "   ❓ Register this updated task definition for ${ENVIRONMENT}? (y/n) " -n 1 -r
  echo ""

  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "   ⏭️  Skipping ${ENVIRONMENT}"
    echo ""
    return 0
  fi

  # Register new task definition
  echo "   📝 Registering new task definition..."

  NEW_REVISION=$(aws ecs register-task-definition \
    --cli-input-json file:///tmp/${TASK_DEF_NAME}-final.json \
    --region "${AWS_REGION}" \
    --query 'taskDefinition.revision' \
    --output text)

  echo "   ✅ Registered ${TASK_DEF_NAME}:${NEW_REVISION}"
  echo ""
  echo "   ⚠️  IMPORTANT: This does NOT update the running service."
  echo "   The new task definition will be used on the next deployment."
  echo "   To use it immediately, run:"
  echo ""
  echo "   aws ecs update-service \\"
  echo "     --cluster bcos-${ENVIRONMENT}-cluster \\"
  echo "     --service bcos-${ENVIRONMENT}-service \\"
  echo "     --task-definition ${TASK_DEF_NAME}:${NEW_REVISION} \\"
  echo "     --force-new-deployment"
  echo ""

  # Clean up temporary files
  rm -f "/tmp/${TASK_DEF_NAME}-"*.json
}

# Get Secret ARNs from CloudFormation
echo "🔍 Fetching Secret ARNs from CloudFormation..."

STAGING_SECRET_ARN=$(aws cloudformation describe-stacks \
  --stack-name BCOS-SecurityStack \
  --region "${AWS_REGION}" \
  --query 'Stacks[0].Outputs[?OutputKey==`StagingSecretArn`].OutputValue' \
  --output text)

PRODUCTION_SECRET_ARN=$(aws cloudformation describe-stacks \
  --stack-name BCOS-SecurityStack \
  --region "${AWS_REGION}" \
  --query 'Stacks[0].Outputs[?OutputKey==`ProductionSecretArn`].OutputValue' \
  --output text)

echo "   Staging Secret ARN: ${STAGING_SECRET_ARN}"
echo "   Production Secret ARN: ${PRODUCTION_SECRET_ARN}"
echo ""

# Check if secrets need to be updated with S3 credentials
echo "========================================="
echo "Step 1: Update Secrets Manager (if needed)"
echo "========================================="
echo ""
echo "⚠️  IMPORTANT: Before registering task definitions, you must add S3 credentials to Secrets Manager."
echo ""
echo "📋 Required secrets to add (if not already present):"
echo "   - S3_PUBLIC_ACCESS_KEY_ID"
echo "   - S3_PUBLIC_SECRET_ACCESS_KEY"
echo ""
echo "You can add them via AWS Console or CLI:"
echo ""
echo "aws secretsmanager update-secret \\"
echo "  --secret-id ${STAGING_SECRET_ARN} \\"
echo "  --secret-string '{\"S3_PUBLIC_ACCESS_KEY_ID\":\"AKIA...\",\"S3_PUBLIC_SECRET_ACCESS_KEY\":\"...\"}'"
echo ""
read -p "❓ Have you added S3 credentials to both staging and production secrets? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "❌ Please add S3 credentials to Secrets Manager first, then re-run this script."
  echo "   See docs/s3-iam-setup.md for instructions on creating IAM credentials."
  exit 1
fi

echo ""
echo "========================================="
echo "Step 2: Update Task Definitions"
echo "========================================="
echo ""

# Update staging
update_task_definition "staging" "${STAGING_SECRET_ARN}"

# Update production
update_task_definition "production" "${PRODUCTION_SECRET_ARN}"

echo "========================================="
echo "✅ Script Complete"
echo "========================================="
echo ""
echo "📋 Next Steps:"
echo ""
echo "1. Verify secrets in AWS Secrets Manager:"
echo "   https://console.aws.amazon.com/secretsmanager/home?region=${AWS_REGION}"
echo ""
echo "2. The new task definitions will be used automatically on the next deployment."
echo "   Push code to 'staging' or 'main' branch to trigger deployment."
echo ""
echo "3. Or manually update running services (see output above for commands)."
echo ""
echo "4. After deployment, verify S3 uploads work:"
echo "   - Upload a test practice logo via the UI"
echo "   - Check CloudWatch logs for 'File uploaded to S3'"
echo "   - Verify file appears in S3 bucket"
echo "   - Verify CloudFront URL works"
echo ""
