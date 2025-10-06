# ECS Task Definition Update Plan - Add MFA Secrets

**Date**: 2025-10-06
**Objective**: Add `WEBAUTHN_RP_ID` and `MFA_TEMP_TOKEN_SECRET` to existing ECS task definitions

---

## CI/CD Process Analysis

### Application Deployment Pipeline ([.github/workflows/deploy-staging.yml](.github/workflows/deploy-staging.yml))

**How task definitions are managed**:

1. **Line 243-245**: Gets CURRENT task definition from ECS
   ```yaml
   - name: Get current task definition
     run: |
       aws ecs describe-task-definition --task-definition ${{ steps.vars.outputs.ECS_TASK_DEFINITION }} --query taskDefinition > task-definition.json
   ```

2. **Line 247-253**: Updates ONLY the container image (using GitHub Action)
   ```yaml
   - name: Update ECS task definition
     id: task-def
     uses: aws-actions/amazon-ecs-render-task-definition@4225e0b507142a2e432b018bc3ccb728559b437a
     with:
       task-definition: task-definition.json
       container-name: bcos
       image: ${{ steps.login-ecr.outputs.registry }}/${{ env.ECR_REPOSITORY }}:${{ steps.vars.outputs.IMAGE_TAG }}
   ```

3. **Line 306-313**: Deploys updated task definition to ECS service
   ```yaml
   - name: Deploy to ECS
     id: ecs-deploy
     uses: aws-actions/amazon-ecs-deploy-task-definition@df9643053eda01f169e64a0e60233aacca83799a
     with:
       task-definition: ${{ steps.task-def.outputs.task-definition }}
       service: ${{ steps.vars.outputs.ECS_SERVICE }}
       cluster: ${{ steps.vars.outputs.ECS_CLUSTER }}
       wait-for-service-stability: true
   ```

**Key Insight**: The pipeline fetches the existing task definition and only changes the image tag. All other configuration (secrets, environment variables, etc.) is **preserved from the current revision**.

### Infrastructure Deployment Pipeline ([.github/workflows/deploy-infrastructure.yml](.github/workflows/deploy-infrastructure.yml))

**Why infrastructure CDK can't be used**:

1. **Line 205-218**: CDK deployment checks if stacks exist
   ```yaml
   - name: Deploy staging infrastructure
     run: |
       # Deploy shared stacks first if they don't exist
       if ! aws cloudformation describe-stacks --stack-name BCOS-SecurityStack --region ${{ env.AWS_REGION }} 2>/dev/null; then
         npx cdk deploy BCOS-SecurityStack --require-approval never
       fi
       # ...
       # Deploy staging stack
       npx cdk deploy BCOS-StagingStack --require-approval never --context vpcId=${{ secrets.VPC_ID }}
   ```

2. **Problem**: The CDK stacks (StagingStack, ProductionStack) **create** ECS services initially but don't manage ongoing task definition updates
3. **Evidence**: CDK creates task definition via SecureContainer construct ([secure-container.ts:100-111](infrastructure/lib/constructs/secure-container.ts#L100)), but ECS services already exist from previous deployments
4. **Risk**: Running CDK deploy would attempt to recreate or modify existing ECS services, potentially causing downtime

**Conclusion**: User is correct - CDK infrastructure pipeline cannot be used for this update. Must use AWS CLI to modify existing task definitions directly.

---

## Current Task Definition Structure

Based on [secure-container.ts:159-171](infrastructure/lib/constructs/secure-container.ts#L159), task definitions have:

**Secrets** (from AWS Secrets Manager):
- `SKIP_ENV_VALIDATION`
- `DATABASE_URL`
- `ANALYTICS_DATABASE_URL`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `CSRF_SECRET`
- `EMAIL_FROM`
- `ADMIN_NOTIFICATION_EMAILS`

**Environment Variables**:
- `NODE_ENV`
- `PORT`
- `AWS_REGION`
- `ENVIRONMENT`
- `NEXT_PUBLIC_APP_URL`

**What we need to add** (secrets):
- ✅ `WEBAUTHN_RP_ID` (already in AWS Secrets Manager)
- ✅ `MFA_TEMP_TOKEN_SECRET` (already in AWS Secrets Manager)

---

## Step-by-Step Update Plan

### Phase 1: Retrieve Current Task Definitions

#### Staging Task Definition

```bash
# Get the latest ACTIVE task definition
aws ecs describe-task-definition \
  --task-definition bcos-staging \
  --query 'taskDefinition' \
  > task-def-staging-current.json

# Extract just the parts we need (remove metadata)
jq 'del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities, .registeredAt, .registeredBy)' \
  task-def-staging-current.json \
  > task-def-staging-clean.json

# Show current revision number
aws ecs describe-task-definition \
  --task-definition bcos-staging \
  --query 'taskDefinition.revision'
```

#### Production Task Definition

```bash
# Get the latest ACTIVE task definition
aws ecs describe-task-definition \
  --task-definition bcos-production \
  --query 'taskDefinition' \
  > task-def-production-current.json

# Extract just the parts we need (remove metadata)
jq 'del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities, .registeredAt, .registeredBy)' \
  task-def-production-current.json \
  > task-def-production-clean.json

# Show current revision number
aws ecs describe-task-definition \
  --task-definition bcos-production \
  --query 'taskDefinition.revision'
```

---

### Phase 2: Analyze Current Task Definitions

**What to look for**:

1. **Container name**: Should be `bcos` (needed for jq updates)
2. **Current secrets array**: Verify all existing secrets
3. **Secret ARN format**: Should be `${SECRET_ARN}:KEY_NAME::`
4. **Current image**: Note the current image tag for verification

```bash
# Staging - Show container name
jq '.containerDefinitions[0].name' task-def-staging-clean.json

# Staging - Show all current secrets
jq '.containerDefinitions[0].secrets' task-def-staging-clean.json

# Staging - Get secret ARN pattern
jq -r '.containerDefinitions[0].secrets[0].valueFrom' task-def-staging-clean.json | \
  sed 's/:.*$//'  # Extract just the ARN prefix

# Production - Show container name
jq '.containerDefinitions[0].name' task-def-production-clean.json

# Production - Show all current secrets
jq '.containerDefinitions[0].secrets' task-def-production-clean.json

# Production - Get secret ARN pattern
jq -r '.containerDefinitions[0].secrets[0].valueFrom' task-def-production-clean.json | \
  sed 's/:.*$//'  # Extract just the ARN prefix
```

---

### Phase 3: Add MFA Secrets to Task Definitions

#### Get Secret ARNs

```bash
# Get staging secret ARN
STAGING_SECRET_ARN=$(aws cloudformation describe-stacks \
  --stack-name BCOS-SecurityStack \
  --query 'Stacks[0].Outputs[?OutputKey==`StagingSecretArn`].OutputValue' \
  --output text)

echo "Staging Secret ARN: ${STAGING_SECRET_ARN}"

# Get production secret ARN
PRODUCTION_SECRET_ARN=$(aws cloudformation describe-stacks \
  --stack-name BCOS-SecurityStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ProductionSecretArn`].OutputValue' \
  --output text)

echo "Production Secret ARN: ${PRODUCTION_SECRET_ARN}"
```

#### Update Staging Task Definition

```bash
# Add WEBAUTHN_RP_ID and MFA_TEMP_TOKEN_SECRET to secrets array
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

# Verify the update
echo "=== Updated Staging Secrets ==="
jq '.containerDefinitions[0].secrets | map(.name)' task-def-staging-updated.json
```

#### Update Production Task Definition

```bash
# Add WEBAUTHN_RP_ID and MFA_TEMP_TOKEN_SECRET to secrets array
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

# Verify the update
echo "=== Updated Production Secrets ==="
jq '.containerDefinitions[0].secrets | map(.name)' task-def-production-updated.json
```

---

### Phase 4: Register New Task Definition Revisions

#### Register Staging

```bash
# Register new task definition revision
STAGING_NEW_REVISION=$(aws ecs register-task-definition \
  --cli-input-json file://task-def-staging-updated.json \
  --query 'taskDefinition.revision' \
  --output text)

echo "✅ Staging - New revision registered: ${STAGING_NEW_REVISION}"

# Verify the new revision
aws ecs describe-task-definition \
  --task-definition bcos-staging:${STAGING_NEW_REVISION} \
  --query 'taskDefinition.containerDefinitions[0].secrets | map(.name)'
```

#### Register Production

```bash
# Register new task definition revision
PRODUCTION_NEW_REVISION=$(aws ecs register-task-definition \
  --cli-input-json file://task-def-production-updated.json \
  --query 'taskDefinition.revision' \
  --output text)

echo "✅ Production - New revision registered: ${PRODUCTION_NEW_REVISION}"

# Verify the new revision
aws ecs describe-task-definition \
  --task-definition bcos-production:${PRODUCTION_NEW_REVISION} \
  --query 'taskDefinition.containerDefinitions[0].secrets | map(.name)'
```

---

### Phase 5: Update ECS Services to Use New Revisions

#### Update Staging Service

```bash
# Update ECS service to use new task definition
aws ecs update-service \
  --cluster bcos-staging-cluster \
  --service bcos-staging-service \
  --task-definition bcos-staging:${STAGING_NEW_REVISION} \
  --force-new-deployment

echo "✅ Staging service update initiated"

# Monitor deployment
aws ecs wait services-stable \
  --cluster bcos-staging-cluster \
  --services bcos-staging-service

echo "✅ Staging service is stable"
```

#### Update Production Service

```bash
# Update ECS service to use new task definition
aws ecs update-service \
  --cluster bcos-production-cluster \
  --service bcos-production-service \
  --task-definition bcos-production:${PRODUCTION_NEW_REVISION} \
  --force-new-deployment

echo "✅ Production service update initiated"

# Monitor deployment
aws ecs wait services-stable \
  --cluster bcos-production-cluster \
  --services bcos-production-service

echo "✅ Production service is stable"
```

---

### Phase 6: Verification

#### Verify Staging

```bash
# Check that service is using new task definition
STAGING_CURRENT_TASK_DEF=$(aws ecs describe-services \
  --cluster bcos-staging-cluster \
  --services bcos-staging-service \
  --query 'services[0].taskDefinition' \
  --output text)

echo "Staging service is using: ${STAGING_CURRENT_TASK_DEF}"

# Verify running tasks have new environment
aws ecs list-tasks \
  --cluster bcos-staging-cluster \
  --service-name bcos-staging-service \
  --query 'taskArns[0]' \
  --output text

# Check application logs for MFA variables
aws logs tail /ecs/bcos-staging --follow --since 2m | grep -E 'WEBAUTHN|MFA|bendcare.com'

# Test health endpoint
curl -s https://staging.bendcare.com/api/health | jq
```

#### Verify Production

```bash
# Check that service is using new task definition
PRODUCTION_CURRENT_TASK_DEF=$(aws ecs describe-services \
  --cluster bcos-production-cluster \
  --services bcos-production-service \
  --query 'services[0].taskDefinition' \
  --output text)

echo "Production service is using: ${PRODUCTION_CURRENT_TASK_DEF}"

# Verify running tasks have new environment
aws ecs list-tasks \
  --cluster bcos-production-cluster \
  --service-name bcos-production-service \
  --query 'taskArns[0]' \
  --output text

# Check application logs for MFA variables
aws logs tail /ecs/bcos-production --follow --since 2m | grep -E 'WEBAUTHN|MFA|bendcare.com'

# Test health endpoint
curl -s https://app.bendcare.com/api/health | jq
```

---

### Phase 7: Test MFA Functionality

#### Staging Tests

```bash
# Open staging in browser
open https://staging.bendcare.com

# Manual test checklist:
# [ ] Can initiate MFA setup
# [ ] Can register passkey
# [ ] Can logout and login with passkey
# [ ] No errors in browser console
# [ ] No errors in CloudWatch logs

# Check for MFA-related errors
aws logs filter-log-events \
  --log-group-name /ecs/bcos-staging \
  --start-time $(date -u -v-5M +%s)000 \
  --filter-pattern "MFA_TEMP_TOKEN_SECRET"

aws logs filter-log-events \
  --log-group-name /ecs/bcos-staging \
  --start-time $(date -u -v-5M +%s)000 \
  --filter-pattern "WEBAUTHN_RP_ID"
```

#### Production Tests (After Staging Success)

```bash
# Open production in browser
open https://app.bendcare.com

# Manual test checklist:
# [ ] Can initiate MFA setup
# [ ] Can register passkey
# [ ] Can logout and login with passkey
# [ ] No errors in browser console
# [ ] No errors in CloudWatch logs

# Check for MFA-related errors
aws logs filter-log-events \
  --log-group-name /ecs/bcos-production \
  --start-time $(date -u -v-5M +%s)000 \
  --filter-pattern "MFA_TEMP_TOKEN_SECRET"

aws logs filter-log-events \
  --log-group-name /ecs/bcos-production \
  --start-time $(date -u -v-5M +%s)000 \
  --filter-pattern "WEBAUTHN_RP_ID"
```

---

## Complete Update Script

Here's a combined script that does everything (staging first, then production after confirmation):

```bash
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
```

---

## Rollback Plan

If issues occur, revert to previous task definition revision:

### Staging Rollback

```bash
# Get previous revision number
PREVIOUS_REVISION=$((STAGING_NEW_REVISION - 1))

# Rollback service
aws ecs update-service \
  --cluster bcos-staging-cluster \
  --service bcos-staging-service \
  --task-definition bcos-staging:${PREVIOUS_REVISION}

# Wait for stability
aws ecs wait services-stable \
  --cluster bcos-staging-cluster \
  --services bcos-staging-service

echo "✅ Rolled back to revision ${PREVIOUS_REVISION}"
```

### Production Rollback

```bash
# Get previous revision number
PREVIOUS_REVISION=$((PRODUCTION_NEW_REVISION - 1))

# Rollback service
aws ecs update-service \
  --cluster bcos-production-cluster \
  --service bcos-production-service \
  --task-definition bcos-production:${PREVIOUS_REVISION}

# Wait for stability
aws ecs wait services-stable \
  --cluster bcos-production-cluster \
  --services bcos-production-service

echo "✅ Rolled back to revision ${PREVIOUS_REVISION}"
```

---

## Future Deployments

**Important**: Future deployments via GitHub Actions will automatically preserve the MFA secrets because:

1. The pipeline fetches the CURRENT task definition (Line 243-245 of deploy-staging.yml)
2. It only updates the container image, preserving all other settings
3. The new secrets will be included in all future revisions

**No further action required** for ongoing deployments.

---

## Estimated Timeline

| Phase | Duration | Notes |
|-------|----------|-------|
| Get current task definitions | 1 min | Fast API calls |
| Analyze and modify JSON | 2 min | Using jq commands |
| Register new revisions | 1 min | Fast API calls |
| Update staging service | 5-10 min | ECS rolling deployment |
| Verify staging | 5 min | Logs, health checks, manual testing |
| Update production service | 5-10 min | ECS rolling deployment |
| Verify production | 5 min | Logs, health checks, manual testing |
| **Total** | **25-35 minutes** | Including verification |

---

## Prerequisites Checklist

- [x] AWS CLI installed and configured
- [x] `jq` installed for JSON manipulation
- [x] AWS credentials with ECS permissions
- [x] `WEBAUTHN_RP_ID` added to AWS Secrets Manager (staging & production)
- [x] `MFA_TEMP_TOKEN_SECRET` added to AWS Secrets Manager (staging & production)
- [ ] Ready to execute script

---

## Success Criteria

✅ **Task Definition Updated**: New revisions registered with MFA secrets
✅ **Services Updated**: ECS services using new task definitions
✅ **No Downtime**: Rolling deployment maintains availability
✅ **Health Checks Pass**: Applications respond on /api/health
✅ **MFA Works**: Users can register and use passkeys
✅ **No Errors**: CloudWatch logs show no MFA-related errors

---

**Ready to execute**: Save the complete script as `update-task-definitions.sh`, make it executable with `chmod +x update-task-definitions.sh`, and run it.
