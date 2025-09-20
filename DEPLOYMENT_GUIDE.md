# BCOS Deployment Guide
## Complete AWS ECS/Fargate + CDK Infrastructure Setup

---

## 🎯 Overview

This guide provides step-by-step instructions for deploying the BCOS (BendCare OS) application using AWS CDK infrastructure-as-code with ECS Fargate and GitHub Actions CI/CD.

### Architecture Summary
- **Staging**: `staging.bendcare.com` 
- **Production**: `app.bendcare.com`
- **Infrastructure**: AWS CDK (TypeScript)
- **Container Platform**: ECS Fargate with Auto Scaling
- **Load Balancing**: Application Load Balancer with WAF
- **CI/CD**: GitHub Actions with OIDC authentication
- **Security**: KMS encryption, Secrets Manager, VPC endpoints

---

## 🚀 Quick Start Checklist

### Prerequisites
- [ ] AWS CLI configured with us-east-1 region
- [ ] Node.js 20+ and pnpm installed  
- [ ] Existing AWS VPC with public/private subnets
- [ ] Route53 hosted zone for `bendcare.com`
- [ ] GitHub repository with Actions enabled

### Required Information
```bash
# Set these values before starting
AWS_ACCOUNT_ID="your-aws-account-id"
VPC_ID="vpc-xxxxxxxxx"
PUBLIC_SUBNET_1="subnet-xxxxxxxxx"
PUBLIC_SUBNET_2="subnet-yyyyyyyyy"  
PRIVATE_SUBNET_1="subnet-zzzzzzzzz"
PRIVATE_SUBNET_2="subnet-aaaaaaaaa"
HOSTED_ZONE_ID="Z1234567890ABC"
```

---

## 📋 Phase 1: Initial Setup

### 1.1 Environment Preparation

```bash
# Clone repository and setup infrastructure
cd bcos/infrastructure
npm install

# Build and validate CDK
npm run build
npx cdk synth --all
```

### 1.2 GitHub Repository Secrets

Set these in your GitHub repository settings (`Settings > Secrets and variables > Actions`):

```
AWS_ACCOUNT_ID=your-aws-account-id
VPC_ID=vpc-xxxxxxxxx  
PUBLIC_SUBNET_IDS=subnet-xxx,subnet-yyy
PRIVATE_SUBNET_IDS=subnet-zzz,subnet-aaa
HOSTED_ZONE_ID=Z1234567890ABC
```

### 1.3 Application Environment Configuration

Update these files with your specific values:

**`infrastructure/config/staging.json`**
```json
{
  "domain": "staging.bendcare.com",
  "hostedZoneName": "bendcare.com",
  // ... other config
}
```

**`infrastructure/config/production.json`**  
```json
{
  "domain": "app.bendcare.com", 
  "hostedZoneName": "bendcare.com",
  // ... other config
}
```

---

## 🔧 Phase 2: Infrastructure Deployment

### 2.1 Bootstrap CDK (One-time setup)

```bash
cd infrastructure
npx cdk bootstrap aws://YOUR-ACCOUNT-ID/us-east-1
```

### 2.2 Deploy Core Infrastructure

Deploy in this specific order:

```bash
# 1. Security Stack (IAM roles, KMS, ECR, Secrets)
npx cdk deploy BCOS-SecurityStack

# 2. Network Stack (VPC lookup, ALB, Security Groups)
npx cdk deploy BCOS-NetworkStack

# 3. Staging Environment
npx cdk deploy BCOS-StagingStage

# 4. Production Environment  
npx cdk deploy BCOS-ProductionStage
```

### 2.3 Verify Infrastructure

```bash
# Check stack status
aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE

# Test load balancer
ALB_DNS=$(aws elbv2 describe-load-balancers --names bcos-alb --query 'LoadBalancers[0].DNSName' --output text)
curl -I http://$ALB_DNS
```

---

## 🔐 Phase 3: Application Secrets Setup

### 3.1 Configure Production Secrets

```bash
# Update production secrets
aws secretsmanager put-secret-value \
  --secret-id production/bcos-secrets \
  --secret-string '{
    "DATABASE_URL": "postgresql://user:pass@prod-host:5432/bcos_prod?sslmode=require",
    "ANALYTICS_DATABASE_URL": "postgresql://user:pass@analytics-host:5432/analytics_prod?sslmode=require", 
    "JWT_SECRET": "your-super-secure-64-char-production-jwt-secret-here",
    "JWT_REFRESH_SECRET": "your-different-64-char-refresh-secret-here",
    "CSRF_SECRET": "your-32-char-csrf-secret-here",
    "RESEND_API_KEY": "re_your_production_resend_key",
    "EMAIL_FROM": "noreply@bendcare.com",
    "ADMIN_NOTIFICATION_EMAILS": "alerts@bendcare.com,ops@bendcare.com",
    "NEXT_PUBLIC_APP_URL": "https://app.bendcare.com"
  }'
```

### 3.2 Configure Staging Secrets

```bash
# Update staging secrets
aws secretsmanager put-secret-value \
  --secret-id staging/bcos-secrets \
  --secret-string '{
    "DATABASE_URL": "postgresql://user:pass@staging-host:5432/bcos_staging?sslmode=require",
    "ANALYTICS_DATABASE_URL": "postgresql://user:pass@analytics-staging:5432/analytics_staging?sslmode=require",
    "JWT_SECRET": "your-staging-jwt-secret-64-chars",
    "JWT_REFRESH_SECRET": "your-staging-refresh-secret-64-chars", 
    "CSRF_SECRET": "your-staging-csrf-secret-32-chars",
    "RESEND_API_KEY": "re_your_staging_resend_key",
    "EMAIL_FROM": "staging@bendcare.com",
    "ADMIN_NOTIFICATION_EMAILS": "dev@bendcare.com",
    "NEXT_PUBLIC_APP_URL": "https://staging.bendcare.com"
  }'
```

---

## 🚢 Phase 4: Application Deployment

### 4.1 Initial Container Image

Build and push your first container image:

```bash
# Get ECR login
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin YOUR-ACCOUNT-ID.dkr.ecr.us-east-1.amazonaws.com

# Build and tag
docker build -t bcos:staging-latest .
docker tag bcos:staging-latest YOUR-ACCOUNT-ID.dkr.ecr.us-east-1.amazonaws.com/bcos:staging-latest

# Push
docker push YOUR-ACCOUNT-ID.dkr.ecr.us-east-1.amazonaws.com/bcos:staging-latest
```

### 4.2 Automated Deployments

Once the infrastructure is deployed, GitHub Actions will handle automatic deployments:

- **Staging**: Push to `staging` branch → Automatic deployment
- **Production**: Push to `main` branch → Automatic deployment with approval

### 4.3 Manual Deployment Triggers

```bash
# Trigger staging deployment
gh workflow run deploy-staging.yml

# Trigger production deployment  
gh workflow run deploy-production.yml --field version=v1.0.0
```

---

## 🔍 Phase 5: Verification & Testing

### 5.1 Health Checks

```bash
# Staging health check
curl https://staging.bendcare.com/health

# Production health check
curl https://app.bendcare.com/health

# Expected response:
# {
#   "status": "healthy",
#   "timestamp": "2024-01-01T00:00:00.000Z",
#   "version": "v1.0.0"
# }
```

### 5.2 Load Testing

```bash
# Simple load test with curl
for i in {1..10}; do
  curl -s -w "%{http_code} %{time_total}s\n" -o /dev/null https://staging.bendcare.com
done
```

### 5.3 Monitor Deployments

Access these URLs to monitor your deployment:

- **CloudWatch Dashboard**: https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=BCOS-production-Dashboard
- **ECS Service**: https://console.aws.amazon.com/ecs/home?region=us-east-1#/clusters/bcos-production-cluster/services
- **ALB Metrics**: https://console.aws.amazon.com/ec2/v2/home?region=us-east-1#LoadBalancers:

---

## 🔧 Phase 6: Operational Procedures

### 6.1 Scaling Operations

```bash
# Scale production service
aws ecs update-service \
  --cluster bcos-production-cluster \
  --service bcos-production-service \
  --desired-count 4

# Check scaling status
aws ecs describe-services \
  --cluster bcos-production-cluster \
  --services bcos-production-service \
  --query 'services[0].{Status:status,Running:runningCount,Desired:desiredCount}'
```

### 6.2 Rollback Procedures

```bash
# List recent task definitions
aws ecs list-task-definitions --family-prefix bcos-production --sort DESC --max-items 5

# Rollback to previous version
PREVIOUS_TASK_DEF=$(aws ecs list-task-definitions --family-prefix bcos-production --sort DESC --max-items 5 --query 'taskDefinitionArns[1]' --output text)

aws ecs update-service \
  --cluster bcos-production-cluster \
  --service bcos-production-service \
  --task-definition $PREVIOUS_TASK_DEF
```

### 6.3 Debugging

```bash
# View recent logs
aws logs tail /ecs/bcos-production --follow

# Execute into running container (if needed)
TASK_ARN=$(aws ecs list-tasks --cluster bcos-production-cluster --service-name bcos-production-service --query 'taskArns[0]' --output text)

aws ecs execute-command \
  --cluster bcos-production-cluster \
  --task $TASK_ARN \
  --container bcos \
  --interactive \
  --command "/bin/sh"
```

---

## 🚨 Phase 7: Monitoring & Alerting

### 7.1 CloudWatch Alarms

The infrastructure automatically creates these alarms:
- ECS service health and task count
- ALB response time and error rates  
- Application error log patterns
- Resource utilization (CPU/memory)

### 7.2 SNS Notifications

Update SNS subscriptions with your team emails:

```bash
# Subscribe to production alerts
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:YOUR-ACCOUNT:bcos-production-alerts \
  --protocol email \
  --notification-endpoint ops@bendcare.com
```

### 7.3 WAF Monitoring

```bash
# Check WAF blocked requests
aws wafv2 get-sampled-requests \
  --web-acl-arn $(aws wafv2 list-web-acls --scope REGIONAL --query 'WebACLs[?Name==`BCOS-production-WebACL`].ARN' --output text) \
  --rule-metric-name "RateLimit-production" \
  --scope REGIONAL \
  --time-window StartTime=2024-01-01T00:00:00Z,EndTime=2024-01-01T23:59:59Z \
  --max-items 100
```

---

## 💰 Cost Optimization Strategies

### 7.1 Auto Scaling Configuration
- **Staging**: Min 1, Max 3 tasks
- **Production**: Min 2, Max 20 tasks with scheduled scaling
- **Business Hours**: Scale up M-F 8AM-8PM
- **Off Hours**: Scale down to minimum capacity

### 7.2 Resource Right-Sizing
- **Staging**: 512 CPU, 1GB memory
- **Production**: 1024 CPU, 2GB memory
- Monitor CloudWatch metrics to adjust as needed

### 7.3 Cost Monitoring
```bash
# Enable cost anomaly detection
aws ce put-anomaly-detector \
  --anomaly-detector Type=DIMENSIONAL,DimensionKey=SERVICE,Dimensions='[{"Key":"SERVICE","Values":["Amazon Elastic Container Service"],"MatchOptions":["EQUALS"]}]'
```

---

## 🔒 Security Best Practices

### ✅ Implemented Security Features
- GitHub OIDC authentication (no long-lived credentials)
- Container image vulnerability scanning  
- WAF protection against OWASP attacks
- VPC endpoints (no internet egress for containers)
- KMS encryption for logs and secrets
- Non-root container execution
- Read-only root filesystem
- Network isolation with security groups
- Secrets Manager integration

### Security Checklist
- [ ] All secrets stored in AWS Secrets Manager
- [ ] Container images scanned for vulnerabilities
- [ ] WAF rules blocking malicious requests
- [ ] CloudTrail logging enabled
- [ ] Network traffic isolated to private subnets
- [ ] Regular security updates via automated deployments

---

## 🆘 Troubleshooting Guide

### Common Issues

| Problem | Quick Fix |
|---------|-----------|
| Task health check failures | Check `/health` endpoint, verify port 80 binding |
| Service not scaling | Verify CloudWatch metrics, check scaling policies |
| Deployment timeouts | Increase health check grace period |
| High 5XX errors | Check application logs, verify database connectivity |
| WAF blocking legitimate requests | Review WAF logs, adjust rate limits |

### Debug Commands

```bash
# Service events
aws ecs describe-services \
  --cluster bcos-production-cluster \
  --services bcos-production-service \
  --query 'services[0].events[0:5]'

# Task details  
TASK_ARN=$(aws ecs list-tasks --cluster bcos-production-cluster --service-name bcos-production-service --query 'taskArns[0]' --output text)
aws ecs describe-tasks --cluster bcos-production-cluster --tasks $TASK_ARN

# Recent logs
aws logs get-log-events \
  --log-group-name /ecs/bcos-production \
  --log-stream-name $(aws logs describe-log-streams --log-group-name /ecs/bcos-production --order-by LastEventTime --descending --max-items 1 --query 'logStreams[0].logStreamName' --output text) \
  --start-time $(date -d '10 minutes ago' +%s)000
```

---

## 📞 Support & Resources

### AWS Console Links
- **ECS Clusters**: https://console.aws.amazon.com/ecs/home?region=us-east-1#/clusters
- **CloudWatch Dashboards**: https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:
- **Secrets Manager**: https://console.aws.amazon.com/secretsmanager/home?region=us-east-1  
- **WAF**: https://console.aws.amazon.com/wafv2/homev2/web-acls?region=us-east-1

### Documentation
- [AWS CDK Reference](https://docs.aws.amazon.com/cdk/api/v2/)
- [ECS Fargate Guide](https://docs.aws.amazon.com/AmazonECS/latest/userguide/what-is-fargate.html)
- [GitHub Actions OIDC](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect)

---

## 🎉 Deployment Complete!

Your BCOS application is now deployed with enterprise-grade security and scalability:

- ✅ **Staging**: https://staging.bendcare.com
- ✅ **Production**: https://app.bendcare.com  
- ✅ **Monitoring**: CloudWatch dashboards and alerts
- ✅ **Security**: WAF, VPC isolation, encrypted secrets
- ✅ **CI/CD**: Automated GitHub Actions deployments
- ✅ **Scalability**: Auto scaling based on demand

**Next Steps**: Monitor your application, set up additional alerting, and iterate on your deployment process as needed.
