# BCOS Infrastructure as Code (CDK)

## Overview
This directory contains AWS CDK TypeScript code for deploying the BendCare OS application infrastructure on AWS.

## Architecture
- **Staging Environment**: `staging.bendcare.com`
- **Production Environment**: `app.bendcare.com` 
- **Existing Route53**: `bendcare.com` hosted zone (reused)
- **Existing VPC**: Reuses existing VPC and subnets
- **Deployment**: GitHub Actions CI/CD with OIDC authentication

## Infrastructure Components

### Core Stacks
- `NetworkStack`: VPC configuration and security groups (uses existing VPC)
- `SecurityStack`: IAM roles, KMS keys, and secrets management
- `ContainerStack`: ECR, ECS Fargate, ALB, and WAF
- `MonitoringStack`: CloudWatch alarms, log groups, and SNS notifications
- `PipelineStack`: CI/CD pipeline resources and GitHub OIDC integration

### Environments
- **Staging**: Single task, basic monitoring, development secrets
- **Production**: Multiple tasks, full monitoring, production secrets, enhanced security

## Directory Structure
```
infrastructure/
├── bin/
│   └── bcos-app.ts              # CDK app entry point
├── lib/
│   ├── constructs/              # Reusable constructs
│   │   ├── secure-container.ts  # Security-hardened ECS task
│   │   ├── waf-protection.ts    # WAF configuration
│   │   └── monitoring.ts        # Alarms and notifications
│   ├── stacks/                  # Infrastructure stacks
│   │   ├── network-stack.ts     # VPC and networking
│   │   ├── security-stack.ts    # IAM and encryption
│   │   ├── container-stack.ts   # ECS and load balancing
│   │   ├── monitoring-stack.ts  # Observability
│   │   └── pipeline-stack.ts    # CI/CD infrastructure
│   └── stages/                  # Environment stages
│       ├── staging-stage.ts     # Staging environment
│       └── production-stage.ts  # Production environment
├── test/                        # CDK unit tests
├── config/                      # Environment configurations
│   ├── staging.json
│   └── production.json
├── cdk.json                     # CDK configuration
├── package.json                 # Dependencies
└── tsconfig.json               # TypeScript configuration
```

## Prerequisites
- AWS CLI configured with us-east-1 region
- Node.js 24+ and npm installed
- Existing VPC with public and private subnets
- Route53 hosted zone for bendcare.com
- GitHub repository with Actions enabled

## Quick Start
```bash
cd infrastructure
npm install
npm run build
npx cdk bootstrap --profile your-profile
npx cdk deploy SecurityStack --profile your-profile
npx cdk deploy NetworkStack --profile your-profile
npx cdk deploy StagingStage --profile your-profile
npx cdk deploy ProductionStage --profile your-profile
```

## Environment Variables Required
Set these in GitHub repository secrets:
- `AWS_ACCOUNT_ID`: Your AWS account ID
- `AWS_REGION`: us-east-1
- `VPC_ID`: Existing VPC ID
- `PUBLIC_SUBNET_IDS`: Comma-separated public subnet IDs
- `PRIVATE_SUBNET_IDS`: Comma-separated private subnet IDs
- `HOSTED_ZONE_ID`: bendcare.com Route53 hosted zone ID

## Security Features
- ✅ GitHub OIDC authentication (no long-lived credentials)
- ✅ Least-privilege IAM policies
- ✅ Container image vulnerability scanning
- ✅ WAF protection against OWASP attacks
- ✅ Secrets Manager with encryption
- ✅ Private subnets with VPC endpoints
- ✅ ECS circuit breakers with auto-rollback
- ✅ Comprehensive monitoring and alerting

## Monitoring
- CloudWatch dashboards for each environment
- Automated alerting via SNS
- ECS Container Insights enabled
- Application and infrastructure metrics
- WAF and ALB access logs

## CI/CD Integration
The infrastructure supports automated deployments via GitHub Actions:
1. **Infrastructure Changes**: Deploy via CDK pipeline
2. **Application Changes**: Deploy containers via ECS service updates
3. **Rollback**: Automatic circuit breaker protection
4. **Security**: All deployments require security scanning
