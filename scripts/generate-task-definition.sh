#!/bin/bash
# Generate ECS Task Definition with all required secrets
# Usage: ./scripts/generate-task-definition.sh <environment> <image-uri>

set -e

ENVIRONMENT=$1
IMAGE_URI=$2

if [ -z "$ENVIRONMENT" ] || [ -z "$IMAGE_URI" ]; then
  echo "Usage: $0 <environment> <image-uri>"
  echo "Example: $0 staging 123456789.dkr.ecr.us-east-1.amazonaws.com/bcos:staging-abc123"
  exit 1
fi

# Get IAM role ARNs from CloudFormation
EXECUTION_ROLE_ARN=$(aws cloudformation describe-stacks --stack-name BCOS-SecurityStack --query 'Stacks[0].Outputs[?OutputKey==`ECSTaskExecutionRoleArn`].OutputValue' --output text)
TASK_ROLE_ARN=$(aws cloudformation describe-stacks --stack-name BCOS-SecurityStack --query 'Stacks[0].Outputs[?OutputKey==`ECSTaskRoleArn`].OutputValue' --output text)

# Determine secret ARN based on environment
if [ "$ENVIRONMENT" = "production" ]; then
  SECRET_ARN=$(aws cloudformation describe-stacks --stack-name BCOS-SecurityStack --query 'Stacks[0].Outputs[?OutputKey==`ProductionSecretArn`].OutputValue' --output text)
  CPU="512"
  MEMORY="1024"
else
  SECRET_ARN=$(aws cloudformation describe-stacks --stack-name BCOS-SecurityStack --query 'Stacks[0].Outputs[?OutputKey==`StagingSecretArn`].OutputValue' --output text)
  CPU="256"
  MEMORY="512"
fi

echo "Creating task definition for ${ENVIRONMENT}"
echo "  Image: ${IMAGE_URI}"
echo "  Secret ARN: ${SECRET_ARN}"

# Create task definition with ALL required secrets
cat > task-definition.json << EOF
{
  "family": "bcos-${ENVIRONMENT}",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "${CPU}",
  "memory": "${MEMORY}",
  "executionRoleArn": "${EXECUTION_ROLE_ARN}",
  "taskRoleArn": "${TASK_ROLE_ARN}",
  "containerDefinitions": [{
    "name": "bcos",
    "image": "${IMAGE_URI}",
    "essential": true,
    "portMappings": [{
      "containerPort": 3000,
      "protocol": "tcp"
    }],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/ecs/bcos-${ENVIRONMENT}",
        "awslogs-region": "us-east-1",
        "awslogs-stream-prefix": "app"
      }
    },
    "secrets": [
      {
        "name": "DATABASE_URL",
        "valueFrom": "${SECRET_ARN}:DATABASE_URL::"
      },
      {
        "name": "ANALYTICS_DATABASE_URL",
        "valueFrom": "${SECRET_ARN}:ANALYTICS_DATABASE_URL::"
      },
      {
        "name": "JWT_SECRET",
        "valueFrom": "${SECRET_ARN}:JWT_SECRET::"
      },
      {
        "name": "JWT_REFRESH_SECRET",
        "valueFrom": "${SECRET_ARN}:JWT_REFRESH_SECRET::"
      },
      {
        "name": "CSRF_SECRET",
        "valueFrom": "${SECRET_ARN}:CSRF_SECRET::"
      },
      {
        "name": "ENTRA_TENANT_ID",
        "valueFrom": "${SECRET_ARN}:ENTRA_TENANT_ID::"
      },
      {
        "name": "ENTRA_APP_ID",
        "valueFrom": "${SECRET_ARN}:ENTRA_APP_ID::"
      },
      {
        "name": "ENTRA_CLIENT_SECRET",
        "valueFrom": "${SECRET_ARN}:ENTRA_CLIENT_SECRET::"
      },
      {
        "name": "OIDC_REDIRECT_URI",
        "valueFrom": "${SECRET_ARN}:OIDC_REDIRECT_URI::"
      },
      {
        "name": "OIDC_SESSION_SECRET",
        "valueFrom": "${SECRET_ARN}:OIDC_SESSION_SECRET::"
      },
      {
        "name": "OIDC_SCOPES",
        "valueFrom": "${SECRET_ARN}:OIDC_SCOPES::"
      },
      {
        "name": "OIDC_ALLOWED_DOMAINS",
        "valueFrom": "${SECRET_ARN}:OIDC_ALLOWED_DOMAINS::"
      },
      {
        "name": "OIDC_SUCCESS_REDIRECT",
        "valueFrom": "${SECRET_ARN}:OIDC_SUCCESS_REDIRECT::"
      },
      {
        "name": "OIDC_STRICT_FINGERPRINT",
        "valueFrom": "${SECRET_ARN}:OIDC_STRICT_FINGERPRINT::"
      }
    ],
    "environment": [
      {
        "name": "NODE_ENV",
        "value": "${ENVIRONMENT}"
      },
      {
        "name": "PORT",
        "value": "3000"
      },
      {
        "name": "AWS_REGION",
        "value": "us-east-1"
      }
    ],
    "healthCheck": {
      "command": ["CMD-SHELL", "curl -f http://localhost:3000/api/health || exit 1"],
      "interval": 30,
      "timeout": 5,
      "retries": 3,
      "startPeriod": 60
    }
  }]
}
EOF

echo "✅ Task definition created: task-definition.json"
