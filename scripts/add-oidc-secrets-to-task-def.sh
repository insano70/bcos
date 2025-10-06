#!/bin/bash
# Add OIDC secrets to existing ECS task definition
# Usage: ./scripts/add-oidc-secrets-to-task-def.sh <environment>

set -e

ENVIRONMENT=${1:-staging}
TASK_FAMILY="bcos-${ENVIRONMENT}"

echo "Adding OIDC secrets to ${TASK_FAMILY} task definition..."

# Get secret ARN
if [ "$ENVIRONMENT" = "production" ]; then
  SECRET_ARN=$(aws cloudformation describe-stacks --stack-name BCOS-SecurityStack --query 'Stacks[0].Outputs[?OutputKey==`ProductionSecretArn`].OutputValue' --output text)
else
  SECRET_ARN=$(aws cloudformation describe-stacks --stack-name BCOS-SecurityStack --query 'Stacks[0].Outputs[?OutputKey==`StagingSecretArn`].OutputValue' --output text)
fi

echo "Secret ARN: ${SECRET_ARN}"

# Get current task definition
aws ecs describe-task-definition --task-definition "${TASK_FAMILY}" --query 'taskDefinition' > task-def-temp.json

# Use jq to add OIDC secrets to the secrets array
jq --arg secret_arn "${SECRET_ARN}" '
  # Remove fields that cannot be used in register-task-definition
  del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities, .registeredAt, .registeredBy) |

  # Add OIDC secrets to the first container
  .containerDefinitions[0].secrets += [
    {"name": "ENTRA_TENANT_ID", "valueFrom": ($secret_arn + ":ENTRA_TENANT_ID::")},
    {"name": "ENTRA_APP_ID", "valueFrom": ($secret_arn + ":ENTRA_APP_ID::")},
    {"name": "ENTRA_CLIENT_SECRET", "valueFrom": ($secret_arn + ":ENTRA_CLIENT_SECRET::")},
    {"name": "OIDC_REDIRECT_URI", "valueFrom": ($secret_arn + ":OIDC_REDIRECT_URI::")},
    {"name": "OIDC_SESSION_SECRET", "valueFrom": ($secret_arn + ":OIDC_SESSION_SECRET::")},
    {"name": "OIDC_SCOPES", "valueFrom": ($secret_arn + ":OIDC_SCOPES::")},
    {"name": "OIDC_ALLOWED_DOMAINS", "valueFrom": ($secret_arn + ":OIDC_ALLOWED_DOMAINS::")},
    {"name": "OIDC_SUCCESS_REDIRECT", "valueFrom": ($secret_arn + ":OIDC_SUCCESS_REDIRECT::")},
    {"name": "OIDC_STRICT_FINGERPRINT", "valueFrom": ($secret_arn + ":OIDC_STRICT_FINGERPRINT::")}
  ]
' task-def-temp.json > task-def-with-oidc.json

echo "✅ Updated task definition created: task-def-with-oidc.json"
echo ""
echo "Registering new task definition..."
NEW_REVISION=$(aws ecs register-task-definition --cli-input-json file://task-def-with-oidc.json --query 'taskDefinition.revision' --output text)

echo "✅ Registered new task definition: ${TASK_FAMILY}:${NEW_REVISION}"
echo ""
echo "To deploy this new task definition, update your ECS service:"
echo "aws ecs update-service --cluster bcos-${ENVIRONMENT}-cluster --service bcos-${ENVIRONMENT}-service --task-definition ${TASK_FAMILY}:${NEW_REVISION} --force-new-deployment"
echo ""
echo "Cleaning up temp files..."
rm -f task-def-temp.json task-def-with-oidc.json
