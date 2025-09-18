# Complete CI/CD Pipeline Setup Guide
## Cursor → GitHub → AWS ECS/Fargate + CloudFront

This guide covers the complete setup for a production-ready CI/CD pipeline with staging and production environments.

## Architecture Overview

- **Source**: Cursor IDE → GitHub Repository
- **CI/CD**: GitHub Actions
- **Staging**: `staging` branch → Staging ECS Service + CloudFront
- **Production**: `main` branch → Production ECS Service + CloudFront
- **Secrets**: AWS Secrets Manager
- **Infrastructure**: AWS ECS Fargate + CloudFront + ECR

---

## Phase 1: AWS Infrastructure Setup

### 1.1 Create IAM Role for GitHub Actions

```bash
# Create trust policy for GitHub Actions
cat > github-actions-trust-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::YOUR_ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:YOUR_GITHUB_USERNAME/YOUR_REPO_NAME:*"
        }
      }
    }
  ]
}
EOF

# Create the role
aws iam create-role \
  --role-name GitHubActionsRole \
  --assume-role-policy-document file://github-actions-trust-policy.json
```

### 1.2 Create IAM Policy for Deployment Permissions

```bash
cat > github-actions-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload",
        "ecr:PutImage"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ecs:UpdateService",
        "ecs:DescribeServices",
        "ecs:DescribeTaskDefinition",
        "ecs:RegisterTaskDefinition"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "cloudfront:CreateInvalidation"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": "arn:aws:secretsmanager:*:*:secret:*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "iam:PassRole"
      ],
      "Resource": "arn:aws:iam::*:role/ecsTaskExecutionRole"
    }
  ]
}
EOF

# Create and attach the policy
aws iam create-policy \
  --policy-name GitHubActionsDeploymentPolicy \
  --policy-document file://github-actions-policy.json

aws iam attach-role-policy \
  --role-name GitHubActionsRole \
  --policy-arn arn:aws:iam::YOUR_ACCOUNT_ID:policy/GitHubActionsDeploymentPolicy
```

### 1.3 Set up GitHub OIDC Provider (if not exists)

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

### 1.4 Create ECR Repositories

```bash
# Create ECR repository
aws ecr create-repository --repository-name your-app-name --region us-east-1

# Note the repository URI for later use
aws ecr describe-repositories --repository-names your-app-name --region us-east-1
```

### 1.5 Create ECS Cluster

```bash
aws ecs create-cluster --cluster-name production-cluster --region us-east-1
aws ecs create-cluster --cluster-name staging-cluster --region us-east-1
```

### 1.6 Create VPC and Security Groups (if needed)

```bash
# Create VPC (skip if using default VPC)
aws ec2 create-vpc --cidr-block 10.0.0.0/16 --tag-specifications 'ResourceType=vpc,Tags=[{Key=Name,Value=ecs-vpc}]'

# Create security group for ECS tasks
aws ec2 create-security-group \
  --group-name ecs-tasks-sg \
  --description "Security group for ECS tasks" \
  --vpc-id vpc-xxxxxxxxx

# Add inbound rule for HTTP traffic
aws ec2 authorize-security-group-ingress \
  --group-id sg-xxxxxxxxx \
  --protocol tcp \
  --port 80 \
  --cidr 0.0.0.0/0
```

### 1.7 Store Secrets in AWS Secrets Manager

```bash
# Store application secrets
aws secretsmanager create-secret \
  --name "prod/app-secrets" \
  --description "Production application secrets" \
  --secret-string '{
    "DATABASE_URL": "your-prod-db-url",
    "API_KEY": "your-api-key",
    "JWT_SECRET": "your-jwt-secret"
  }'

aws secretsmanager create-secret \
  --name "staging/app-secrets" \
  --description "Staging application secrets" \
  --secret-string '{
    "DATABASE_URL": "your-staging-db-url",
    "API_KEY": "your-staging-api-key",
    "JWT_SECRET": "your-staging-jwt-secret"
  }'
```

---

## Phase 2: Create ECS Task Definitions

### 2.1 Production Task Definition

Create `task-definition-prod.json`:

```json
{
  "family": "your-app-prod",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "arn:aws:iam::YOUR_ACCOUNT_ID:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::YOUR_ACCOUNT_ID:role/ecsTaskExecutionRole",
  "containerDefinitions": [
    {
      "name": "your-app",
      "image": "YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/your-app-name:latest",
      "portMappings": [
        {
          "containerPort": 80,
          "protocol": "tcp"
        }
      ],
      "essential": true,
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/your-app-prod",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "secrets": [
        {
          "name": "DATABASE_URL",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:YOUR_ACCOUNT_ID:secret:prod/app-secrets:DATABASE_URL::"
        },
        {
          "name": "API_KEY",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:YOUR_ACCOUNT_ID:secret:prod/app-secrets:API_KEY::"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        }
      ]
    }
  ]
}
```

### 2.2 Staging Task Definition

Create `task-definition-staging.json`:

```json
{
  "family": "your-app-staging",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "arn:aws:iam::YOUR_ACCOUNT_ID:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::YOUR_ACCOUNT_ID:role/ecsTaskExecutionRole",
  "containerDefinitions": [
    {
      "name": "your-app",
      "image": "YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/your-app-name:staging",
      "portMappings": [
        {
          "containerPort": 80,
          "protocol": "tcp"
        }
      ],
      "essential": true,
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/your-app-staging",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "secrets": [
        {
          "name": "DATABASE_URL",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:YOUR_ACCOUNT_ID:secret:staging/app-secrets:DATABASE_URL::"
        },
        {
          "name": "API_KEY",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:YOUR_ACCOUNT_ID:secret:staging/app-secrets:API_KEY::"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "staging"
        }
      ]
    }
  ]
}
```

### 2.3 Register Task Definitions

```bash
aws ecs register-task-definition --cli-input-json file://task-definition-prod.json
aws ecs register-task-definition --cli-input-json file://task-definition-staging.json
```

### 2.4 Create ECS Services

```bash
# Production service
aws ecs create-service \
  --cluster production-cluster \
  --service-name your-app-prod-service \
  --task-definition your-app-prod \
  --desired-count 2 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxxxxxxxx],securityGroups=[sg-xxxxxxxxx],assignPublicIp=ENABLED}"

# Staging service
aws ecs create-service \
  --cluster staging-cluster \
  --service-name your-app-staging-service \
  --task-definition your-app-staging \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxxxxxxxx],securityGroups=[sg-xxxxxxxxx],assignPublicIp=ENABLED}"
```

---

## Phase 3: CloudFront Setup

### 3.1 Create CloudFront Distributions

You'll need to create CloudFront distributions for both staging and production. This can be done via AWS Console or CLI. Key configurations:

- Origin: Your ALB or ECS service endpoint
- Cache behaviors for static assets
- Custom error pages
- SSL certificate (recommended)

---

## Phase 4: GitHub Repository Setup

### 4.1 Repository Structure

```
your-repo/
├── .github/
│   └── workflows/
│       ├── deploy-production.yml
│       └── deploy-staging.yml
├── Dockerfile
├── docker-compose.yml (optional)
├── src/
│   └── your-application-code/
└── README.md
```

### 4.2 Sample Dockerfile

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 80

CMD ["npm", "start"]
```

---

## Phase 5: GitHub Actions Workflows

### 5.1 Production Deployment Workflow

Create `.github/workflows/deploy-production.yml`:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

env:
  AWS_REGION: us-east-1
  ECR_REPOSITORY: your-app-name
  ECS_SERVICE: your-app-prod-service
  ECS_CLUSTER: production-cluster
  ECS_TASK_DEFINITION: your-app-prod
  CLOUDFRONT_DISTRIBUTION_ID: E1234567890123

permissions:
  id-token: write
  contents: read

jobs:
  deploy:
    name: Deploy to Production
    runs-on: ubuntu-latest
    environment: production

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::${{ secrets.AWS_ACCOUNT_ID }}:role/GitHubActionsRole
          role-session-name: GitHubActions
          aws-region: ${{ env.AWS_REGION }}

      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build, tag, and push image to Amazon ECR
        id: build-image
        env:
          ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
          IMAGE_TAG: ${{ github.sha }}
        run: |
          docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG .
          docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:latest .
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:latest
          echo "image=$ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG" >> $GITHUB_OUTPUT

      - name: Download task definition
        run: |
          aws ecs describe-task-definition \
            --task-definition $ECS_TASK_DEFINITION \
            --query taskDefinition > task-definition.json

      - name: Fill in the new image ID in the Amazon ECS task definition
        id: task-def
        uses: aws-actions/amazon-ecs-render-task-definition@v1
        with:
          task-definition: task-definition.json
          container-name: your-app
          image: ${{ steps.build-image.outputs.image }}

      - name: Deploy Amazon ECS task definition
        uses: aws-actions/amazon-ecs-deploy-task-definition@v1
        with:
          task-definition: ${{ steps.task-def.outputs.task-definition }}
          service: ${{ env.ECS_SERVICE }}
          cluster: ${{ env.ECS_CLUSTER }}
          wait-for-service-stability: true

      - name: Invalidate CloudFront
        run: |
          aws cloudfront create-invalidation \
            --distribution-id $CLOUDFRONT_DISTRIBUTION_ID \
            --paths "/*"

      - name: Deployment Success Notification
        run: |
          echo "🚀 Production deployment completed successfully!"
          echo "Commit: ${{ github.sha }}"
          echo "Image: ${{ steps.build-image.outputs.image }}"
```

### 5.2 Staging Deployment Workflow

Create `.github/workflows/deploy-staging.yml`:

```yaml
name: Deploy to Staging

on:
  push:
    branches: [staging]

env:
  AWS_REGION: us-east-1
  ECR_REPOSITORY: your-app-name
  ECS_SERVICE: your-app-staging-service
  ECS_CLUSTER: staging-cluster
  ECS_TASK_DEFINITION: your-app-staging
  CLOUDFRONT_DISTRIBUTION_ID: E0987654321098

permissions:
  id-token: write
  contents: read

jobs:
  deploy:
    name: Deploy to Staging
    runs-on: ubuntu-latest
    environment: staging

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::${{ secrets.AWS_ACCOUNT_ID }}:role/GitHubActionsRole
          role-session-name: GitHubActions
          aws-region: ${{ env.AWS_REGION }}

      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build, tag, and push image to Amazon ECR
        id: build-image
        env:
          ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
          IMAGE_TAG: staging-${{ github.sha }}
        run: |
          docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG .
          docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:staging .
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:staging
          echo "image=$ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG" >> $GITHUB_OUTPUT

      - name: Download task definition
        run: |
          aws ecs describe-task-definition \
            --task-definition $ECS_TASK_DEFINITION \
            --query taskDefinition > task-definition.json

      - name: Fill in the new image ID in the Amazon ECS task definition
        id: task-def
        uses: aws-actions/amazon-ecs-render-task-definition@v1
        with:
          task-definition: task-definition.json
          container-name: your-app
          image: ${{ steps.build-image.outputs.image }}

      - name: Deploy Amazon ECS task definition
        uses: aws-actions/amazon-ecs-deploy-task-definition@v1
        with:
          task-definition: ${{ steps.task-def.outputs.task-definition }}
          service: ${{ env.ECS_SERVICE }}
          cluster: ${{ env.ECS_CLUSTER }}
          wait-for-service-stability: true

      - name: Invalidate CloudFront
        run: |
          aws cloudfront create-invalidation \
            --distribution-id $CLOUDFRONT_DISTRIBUTION_ID \
            --paths "/*"

      - name: Deployment Success Notification
        run: |
          echo "🚀 Staging deployment completed successfully!"
          echo "Commit: ${{ github.sha }}"
          echo "Image: ${{ steps.build-image.outputs.image }}"
```

---

## Phase 6: GitHub Repository Secrets

### 6.1 Required Repository Secrets

In your GitHub repository, go to Settings → Secrets and variables → Actions, and add:

```
AWS_ACCOUNT_ID: your-aws-account-id
```

### 6.2 Environment Secrets (Optional)

Create environments in GitHub (Settings → Environments) for `production` and `staging` with additional protection rules if needed.

---

## Phase 7: Complete Setup Checklist

### AWS Setup
- [ ] Create GitHub Actions IAM role with OIDC
- [ ] Create and attach deployment policy
- [ ] Set up ECR repositories
- [ ] Create ECS clusters (staging & production)
- [ ] Create VPC and security groups (if needed)
- [ ] Store application secrets in Secrets Manager
- [ ] Create CloudWatch log groups
- [ ] Register ECS task definitions
- [ ] Create ECS services
- [ ] Set up CloudFront distributions
- [ ] Configure ALB (if using Load Balancer)

### GitHub Setup
- [ ] Create repository with proper structure
- [ ] Add GitHub Actions workflows
- [ ] Configure repository secrets
- [ ] Set up environments (optional)
- [ ] Create staging branch
- [ ] Test deployment workflows

### Testing
- [ ] Test staging deployment (push to staging branch)
- [ ] Test production deployment (push to main branch)
- [ ] Verify secrets are properly injected
- [ ] Check CloudFront invalidation works
- [ ] Monitor ECS service health
- [ ] Test rollback procedures

---

## Phase 8: Monitoring and Maintenance

### 8.1 CloudWatch Alarms
Set up CloudWatch alarms for:
- ECS service health
- Application errors
- High CPU/Memory usage
- Failed deployments

### 8.2 Log Monitoring
- Monitor ECS task logs
- Set up log aggregation
- Create alerts for error patterns

### 8.3 Backup and Recovery
- Database backup strategies
- Container image versioning
- Rollback procedures

---

## Troubleshooting Common Issues

1. **IAM Permission Errors**: Ensure all required permissions are attached to the GitHub Actions role
2. **ECR Push Failures**: Verify ECR repository exists and permissions are correct
3. **ECS Deployment Failures**: Check task definition syntax and resource allocation
4. **Secret Access Issues**: Verify secret ARNs and IAM permissions for Secrets Manager
5. **CloudFront Invalidation**: Ensure distribution ID is correct and permissions exist

This setup provides a robust, production-ready CI/CD pipeline with proper security practices using AWS Secrets Manager and GitHub Actions OIDC authentication.