#!/bin/bash
set -e

echo "🔧 ECS Task Definition Update - Add MFA Secrets"
echo "================================================"
echo ""

# ====================================
# PHASE 1: Get Secret ARNs
# ====================================
echo "📋 Phase 1: Getting Secret ARNs..."

STAGING_SECRET_ARN=$(aws cloudformation describe-stacks \
  --stack-name BCOS-SecurityStack \
  --query 'Stacks[0].Outputs[?OutputKey==`StagingSecretArn`].OutputValue' \
  --output text)

PRODUCTION_SECRET_ARN=$(aws cloudformation describe-stacks \
  --stack-name BCOS-SecurityStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ProductionSecretArn`].OutputValue' \
  --output text)

echo "  Staging Secret ARN: ${STAGING_SECRET_ARN}"
echo "  Production Secret ARN: ${PRODUCTION_SECRET_ARN}"
echo ""

# ====================================
# PHASE 2: STAGING - Get Current Task Definition
# ====================================
echo "📥 Phase 2: Retrieving current STAGING task definition..."

aws ecs describe-task-definition \
  --task-definition bcos-staging \
  --query 'taskDefinition' \
  > task-def-staging-current.json

STAGING_CURRENT_REVISION=$(jq -r '.revision' task-def-staging-current.json)
echo "  Current revision: ${STAGING_CURRENT_REVISION}"

jq 'del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities, .registeredAt, .registeredBy)' \
  task-def-staging-current.json \
  > task-def-staging-clean.json

echo "  Current secrets:"
jq -r '.containerDefinitions[0].secrets | map("    - " + .name) | join("\n")' task-def-staging-clean.json
echo ""

# ====================================
# PHASE 3: STAGING - Add MFA Secrets
# ====================================
echo "✏️  Phase 3: Adding MFA secrets to STAGING task definition..."

jq --arg secret_arn "$STAGING_SECRET_ARN" \
  '.containerDefinitions[0].secrets += [
    {
      "name": "WEBAUTHN_RP_ID",
      "valueFrom": ($secret_arn + ":WEBAUTHN_RP_ID::")
    },
    {
      "name": "MFA_TEMP_TOKEN_SECRET",
      "valueFrom": ($secret_arn + ":MFA_TEMP_TOKEN_SECRET::")
    }
  ]' \
  task-def-staging-clean.json \
  > task-def-staging-updated.json

echo "  Updated secrets:"
jq -r '.containerDefinitions[0].secrets | map("    - " + .name) | join("\n")' task-def-staging-updated.json
echo ""

# ====================================
# PHASE 4: STAGING - Register New Revision
# ====================================
echo "📝 Phase 4: Registering new STAGING task definition..."

STAGING_NEW_REVISION=$(aws ecs register-task-definition \
  --cli-input-json file://task-def-staging-updated.json \
  --query 'taskDefinition.revision' \
  --output text)

echo "  ✅ New revision: ${STAGING_NEW_REVISION}"
echo ""

# ====================================
# PHASE 5: STAGING - Update Service
# ====================================
echo "🚀 Phase 5: Updating STAGING ECS service..."

aws ecs update-service \
  --cluster bcos-staging-cluster \
  --service bcos-staging-service \
  --task-definition bcos-staging:${STAGING_NEW_REVISION} \
  --force-new-deployment \
  > /dev/null

echo "  ✅ Service update initiated"
echo "  ⏳ Waiting for service to stabilize (this may take 5-10 minutes)..."

aws ecs wait services-stable \
  --cluster bcos-staging-cluster \
  --services bcos-staging-service

echo "  ✅ STAGING service is stable"
echo ""

# ====================================
# PHASE 6: Verify Staging
# ====================================
echo "🔍 Phase 6: Verifying STAGING deployment..."

STAGING_CURRENT_TASK_DEF=$(aws ecs describe-services \
  --cluster bcos-staging-cluster \
  --services bcos-staging-service \
  --query 'services[0].taskDefinition' \
  --output text)

echo "  Service is using: ${STAGING_CURRENT_TASK_DEF}"

# Wait a bit for logs to appear
sleep 30

echo "  Checking logs for environment variables..."
aws logs tail /ecs/bcos-staging --since 1m --format short 2>/dev/null | head -20 || echo "  (No logs yet)"
echo ""

echo "  Testing health endpoint..."
HEALTH_RESPONSE=$(curl -s https://staging.bendcare.com/api/health)
if echo "$HEALTH_RESPONSE" | jq -e '.status == "healthy"' > /dev/null 2>&1; then
  echo "  ✅ Health check passed"
else
  echo "  ⚠️  Health check response: ${HEALTH_RESPONSE}"
fi
echo ""

# ====================================
# PHASE 7: Confirm Production Deployment
# ====================================
echo "⚠️  Phase 7: Production Deployment Confirmation"
echo "================================================"
echo ""
echo "Staging has been updated successfully."
echo ""
read -p "Proceed with PRODUCTION update? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
  echo "❌ Production update cancelled"
  exit 0
fi
echo ""

# ====================================
# PHASE 8: PRODUCTION - Get Current Task Definition
# ====================================
echo "📥 Phase 8: Retrieving current PRODUCTION task definition..."

aws ecs describe-task-definition \
  --task-definition bcos-production \
  --query 'taskDefinition' \
  > task-def-production-current.json

PRODUCTION_CURRENT_REVISION=$(jq -r '.revision' task-def-production-current.json)
echo "  Current revision: ${PRODUCTION_CURRENT_REVISION}"

jq 'del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities, .registeredAt, .registeredBy)' \
  task-def-production-current.json \
  > task-def-production-clean.json

echo "  Current secrets:"
jq -r '.containerDefinitions[0].secrets | map("    - " + .name) | join("\n")' task-def-production-clean.json
echo ""

# ====================================
# PHASE 9: PRODUCTION - Add MFA Secrets
# ====================================
echo "✏️  Phase 9: Adding MFA secrets to PRODUCTION task definition..."

jq --arg secret_arn "$PRODUCTION_SECRET_ARN" \
  '.containerDefinitions[0].secrets += [
    {
      "name": "WEBAUTHN_RP_ID",
      "valueFrom": ($secret_arn + ":WEBAUTHN_RP_ID::")
    },
    {
      "name": "MFA_TEMP_TOKEN_SECRET",
      "valueFrom": ($secret_arn + ":MFA_TEMP_TOKEN_SECRET::")
    }
  ]' \
  task-def-production-clean.json \
  > task-def-production-updated.json

echo "  Updated secrets:"
jq -r '.containerDefinitions[0].secrets | map("    - " + .name) | join("\n")' task-def-production-updated.json
echo ""

# ====================================
# PHASE 10: PRODUCTION - Register New Revision
# ====================================
echo "📝 Phase 10: Registering new PRODUCTION task definition..."

PRODUCTION_NEW_REVISION=$(aws ecs register-task-definition \
  --cli-input-json file://task-def-production-updated.json \
  --query 'taskDefinition.revision' \
  --output text)

echo "  ✅ New revision: ${PRODUCTION_NEW_REVISION}"
echo ""

# ====================================
# PHASE 11: PRODUCTION - Update Service
# ====================================
echo "🚀 Phase 11: Updating PRODUCTION ECS service..."

aws ecs update-service \
  --cluster bcos-production-cluster \
  --service bcos-production-service \
  --task-definition bcos-production:${PRODUCTION_NEW_REVISION} \
  --force-new-deployment \
  > /dev/null

echo "  ✅ Service update initiated"
echo "  ⏳ Waiting for service to stabilize (this may take 5-10 minutes)..."

aws ecs wait services-stable \
  --cluster bcos-production-cluster \
  --services bcos-production-service

echo "  ✅ PRODUCTION service is stable"
echo ""

# ====================================
# PHASE 12: Verify Production
# ====================================
echo "🔍 Phase 12: Verifying PRODUCTION deployment..."

PRODUCTION_CURRENT_TASK_DEF=$(aws ecs describe-services \
  --cluster bcos-production-cluster \
  --services bcos-production-service \
  --query 'services[0].taskDefinition' \
  --output text)

echo "  Service is using: ${PRODUCTION_CURRENT_TASK_DEF}"

# Wait a bit for logs to appear
sleep 30

echo "  Checking logs for environment variables..."
aws logs tail /ecs/bcos-production --since 1m --format short 2>/dev/null | head -20 || echo "  (No logs yet)"
echo ""

echo "  Testing health endpoint..."
HEALTH_RESPONSE=$(curl -s https://app.bendcare.com/api/health)
if echo "$HEALTH_RESPONSE" | jq -e '.status == "healthy"' > /dev/null 2>&1; then
  echo "  ✅ Health check passed"
else
  echo "  ⚠️  Health check response: ${HEALTH_RESPONSE}"
fi
echo ""

# ====================================
# COMPLETE
# ====================================
echo "=========================================="
echo "✅ All updates completed successfully!"
echo "=========================================="
echo ""
echo "Summary:"
echo "  Staging: bcos-staging:${STAGING_NEW_REVISION}"
echo "  Production: bcos-production:${PRODUCTION_NEW_REVISION}"
echo ""
echo "Next steps:"
echo "  1. Test MFA setup in staging: https://staging.bendcare.com"
echo "  2. Test MFA setup in production: https://app.bendcare.com"
echo "  3. Monitor CloudWatch logs for any errors"
echo ""
echo "Cleanup:"
echo "  rm task-def-*.json"
