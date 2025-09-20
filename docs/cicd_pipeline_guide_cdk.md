# BCOS CI/CD Pipeline - CDK Implementation Requirements
## Security-Hardened Infrastructure as Code Specification

**Project:** BCOS (BendcareOS)  
**AWS Account:** 854428944440  
**Region:** us-east-1  
**IaC Framework:** AWS CDK (TypeScript)
**Application:** Node.js web application with health endpoints

---

## 🎯 EXECUTIVE SUMMARY

This document specifies the implementation requirements for a production-ready, security-hardened CI/CD pipeline using AWS CDK as the Infrastructure as Code framework. All infrastructure components will be defined in CDK constructs to ensure repeatability, version control, and drift detection.

---

## 📚 CDK PROJECT STRUCTURE

### Repository Organization
**Requirement:** Monorepo structure supporting both application and infrastructure code.

**Directory Structure:**
```
bcos/
├── infrastructure/
│   ├── bin/
│   │   └── bcos-app.ts                 # CDK app entry point
│   ├── lib/
│   │   ├── constructs/
│   │   │   ├── secure-container.ts     # Custom container construct
│   │   │   ├── waf-protection.ts       # WAF configuration construct
│   │   │   └── monitoring.ts           # Monitoring and alerting construct
│   │   ├── stacks/
│   │   │   ├── network-stack.ts        # VPC, subnets, endpoints
│   │   │   ├── security-stack.ts       # IAM, KMS, secrets
│   │   │   ├── container-stack.ts      # ECR, ECS, ALB
│   │   │   └── pipeline-stack.ts       # CI/CD pipeline resources
│   │   └── stages/
│   │       ├── staging-stage.ts        # Staging environment
│   │       └── production-stage.ts     # Production environment
│   ├── test/
│   │   └── *.test.ts                   # CDK unit tests
│   ├── cdk.json                        # CDK configuration
│   ├── package.json                    # Dependencies
│   └── tsconfig.json                   # TypeScript config
├── application/
│   ├── src/
│   ├── Dockerfile
│   └── package.json
├── .github/
│   └── workflows/
│       ├── cdk-deploy.yml              # Infrastructure deployment
│       └── app-deploy.yml              # Application deployment
└── README.md
```

### CDK Application Configuration
**Requirement:** Type-safe infrastructure definition with proper construct organization.

**CDK App Setup (bin/bcos-app.ts):**
- Environment configuration with account ID 854428944440 and region us-east-1
- Stack dependency management for proper deployment order
- Cross-stack resource sharing using CDK outputs and imports
- Environment-specific parameter passing for staging and production
- Tagging strategy for resource identification and cost allocation

---

## 🔐 PHASE 1: SECURITY INFRASTRUCTURE STACK

### 1.1 IAM Roles and Policies (security-stack.ts)
**Requirement:** Define all IAM resources using CDK IAM constructs.

**GitHub OIDC Provider:**
- Use `iam.OpenIdConnectProvider` construct
- URL: `https://token.actions.githubusercontent.com`
- Client IDs: `['sts.amazonaws.com']`
- Thumbprints: `['6938fd4d98bab03faadb97b34396831e3780aea1']`

**GitHub Actions Role:**
- Use `iam.Role` construct with `iam.WebIdentityPrincipal`
- Trust policy conditions using `iam.Condition` for:
  - Repository validation: `token.actions.githubusercontent.com:repository`
  - Branch restrictions: `token.actions.githubusercontent.com:sub`
  - Environment validation: `token.actions.githubusercontent.com:environment`
- Attach managed policies using `iam.PolicyStatement` with specific resource ARNs
- Export role ARN as stack output for GitHub Actions configuration

**ECS Task Execution Role:**
- Extend default `ecs.TaskDefinition` execution role
- Add specific permissions for ECR, CloudWatch Logs, Secrets Manager
- Use least-privilege principle with resource-specific ARNs

**Application Task Role:**
- Create dedicated role for application runtime permissions
- Grant access only to required Secrets Manager secrets
- Use `secretsmanager.Secret.grantRead()` method for permissions

### 1.2 KMS Key Management
**Requirement:** Customer-managed encryption keys for all sensitive data.

**KMS Key Configuration:**
- Use `kms.Key` construct with automatic rotation enabled
- Key policy allowing CloudWatch Logs, Secrets Manager, and ECR services
- Create alias using `kms.Alias` construct: `alias/bcos-encryption`
- Grant decrypt permissions to ECS task roles
- Export key ARN for use in other stacks

### 1.3 Secrets Manager Setup
**Requirement:** Encrypted secret storage with rotation capabilities.

**Secret Configuration:**
- Use `secretsmanager.Secret` construct with KMS encryption
- Template-based secret structure for database credentials
- Automatic rotation configuration for database secrets
- Environment-specific secret naming: `prod/bcos-secrets`, `staging/bcos-secrets`
- Integration with RDS for automatic password rotation (if applicable)

---

## 🌐 PHASE 2: NETWORK INFRASTRUCTURE STACK

### 2.1 VPC and Subnets (network-stack.ts)
**Requirement:** Secure network architecture using existing VPC or creating new one.

**VPC Configuration:**
- Use `ec2.Vpc.fromLookup()` for existing VPC integration
- Alternative: Create new VPC with `ec2.Vpc` construct if needed
- Subnet configuration: 2 public, 2 private across different AZs
- Enable VPC Flow Logs with CloudWatch Logs destination
- Configure route tables for proper traffic routing

### 2.2 Security Groups
**Requirement:** Least-privilege network access controls.

**ALB Security Group:**
- Use `ec2.SecurityGroup` construct
- Inbound rules: ports 80 and 443 from `ec2.Peer.anyIpv4()`
- Descriptive rule descriptions for audit purposes
- Export security group for ALB association

**ECS Security Group:**
- Inbound rule: port 80 from ALB security group only
- Outbound rules: restricted to VPC CIDR and specific endpoints
- Use `ec2.Peer.securityGroupId()` for ALB reference
- No direct internet access (remove default egress rule)

### 2.3 VPC Endpoints
**Requirement:** Interface endpoints for AWS service access without internet routing.

**Required VPC Endpoints:**
- ECR API and DKR endpoints using `ec2.InterfaceVpcEndpoint`
- S3 Gateway endpoint using `ec2.GatewayVpcEndpoint`
- CloudWatch Logs interface endpoint
- Secrets Manager interface endpoint
- STS interface endpoint for IAM operations
- Associate endpoints with private subnets and ECS security group
- Enable private DNS resolution for seamless service integration

---

## 🏗️ PHASE 3: CONTAINER INFRASTRUCTURE STACK

### 3.1 ECR Repository (container-stack.ts)
**Requirement:** Secure container registry with scanning and lifecycle management.

**ECR Configuration:**
- Use `ecr.Repository` construct with repository name 'bcos'
- Enable `imageScanOnPush` for automatic vulnerability scanning
- Set `imageTagMutability` to IMMUTABLE for security
- Configure `lifecycleRules` for image cleanup:
  - Keep 10 production images (tags starting with 'v' or 'release')
  - Keep 5 staging images (tags starting with 'staging')
  - Remove untagged images after 7 days
- Apply repository policy to prevent public access
- Grant pull/push permissions to GitHub Actions role

### 3.2 ECS Cluster Configuration
**Requirement:** Managed container orchestration with monitoring.

**Cluster Setup:**
- Use `ecs.Cluster` construct with Fargate capacity providers
- Enable container insights using `containerInsights: true`
- Configure execute command logging for debugging
- Set cluster tags for resource identification
- Export cluster ARN for service deployment

### 3.3 Application Load Balancer
**Requirement:** SSL-terminated load balancer with WAF integration.

**ALB Configuration:**
- Use `elbv2.ApplicationLoadBalancer` construct
- Deploy in public subnets with internet-facing scheme
- Associate with ALB security group
- Enable deletion protection for production
- Configure access logging to S3 bucket

**SSL Certificate:**
- Use `certificatemanager.Certificate` construct
- DNS validation method with hosted zone integration
- Include both primary and staging domain names
- Export certificate ARN for listener configuration

**Listeners and Target Groups:**
- HTTP listener with redirect to HTTPS action
- HTTPS listener with SSL certificate
- Create target groups using `elbv2.ApplicationTargetGroup`
- Configure health checks with optimized parameters
- Set up routing rules for staging environment

### 3.4 WAF Protection
**Requirement:** Web Application Firewall for security protection.

**WAF Configuration:**
- Use `wafv2.CfnWebACL` construct for WAF v2
- Implement AWS Managed Rules for OWASP protection
- Configure rate limiting rules (2000 requests per 5 minutes)
- Set up geographic blocking if required
- Associate WAF with ALB using `wafv2.CfnWebACLAssociation`
- Enable logging to CloudWatch for analysis

---

## 🐳 PHASE 4: ECS SERVICE AND TASK DEFINITIONS

### 4.1 Custom Secure Container Construct
**Requirement:** Reusable construct for security-hardened container definitions.

**Construct Features (constructs/secure-container.ts):**
- Extend `ecs.TaskDefinition` with security defaults
- Enforce read-only root filesystem
- Drop all Linux capabilities
- Set non-root user (UID 1001)
- Configure resource limits and ulimits
- Standard logging configuration with encryption
- Health check implementation with curl
- Environment variable and secrets management

### 4.2 Task Definition Configuration
**Requirement:** Security-hardened task definitions for both environments.

**Task Definition Properties:**
- Use Fargate compatibility with specific CPU and memory allocation
- Reference custom KMS key for log encryption
- Configure secrets using `ecs.Secret.fromSecretsManager()`
- Set up proper IAM roles (execution and task roles)
- Enable logging to encrypted CloudWatch log groups
- Configure health checks and stop timeout

### 4.3 ECS Service Configuration
**Requirement:** Resilient service deployment with circuit breakers.

**Service Properties:**
- Use `ecs.FargateService` construct
- Deploy in private subnets with ECS security group
- Configure ALB target group integration
- Enable circuit breaker with rollback capability
- Set deployment configuration (maximum/minimum percent)
- Configure service auto scaling with multiple metrics
- Health check grace period optimization

---

## 📊 PHASE 5: MONITORING AND ALERTING STACK

### 5.1 CloudWatch Alarms (constructs/monitoring.ts)
**Requirement:** Comprehensive monitoring construct for all critical metrics.

**Alarm Categories:**
- ECS service alarms: deployment failures, task count, resource utilization
- ALB alarms: target health, response time, error rates
- Application alarms: error logs, custom metrics
- Use `cloudwatch.Alarm` construct with SNS integration
- Configure alarm actions and OK actions
- Set appropriate thresholds and evaluation periods

### 5.2 Log Metric Filters
**Requirement:** Automated log analysis for application monitoring.

**Metric Filter Configuration:**
- Use `logs.MetricFilter` construct for error pattern detection
- Filter patterns for ERROR, FATAL, panic, and unhandled exceptions
- Custom metrics namespace: `BCOS/Application`
- Integration with CloudWatch alarms for alerting
- Metric transformation for count and rate calculations

### 5.3 SNS Topics and Subscriptions
**Requirement:** Multi-channel notification system.

**Notification Setup:**
- Use `sns.Topic` construct for alert distribution
- Configure email, SMS, and webhook subscriptions
- Set up topic policies for cross-account access if needed
- Create separate topics for different alert severities
- Integration with external systems (PagerDuty, Slack)

---

## ⚡ PHASE 6: CI/CD PIPELINE STACK

### 6.1 CodePipeline for Infrastructure
**Requirement:** Automated CDK deployment pipeline with approval gates.

**Pipeline Configuration (pipeline-stack.ts):**
- Use `codepipeline.Pipeline` construct
- Source stage: GitHub repository integration
- Build stage: CDK synthesis and testing
- Deploy stages: staging and production with manual approval
- Cross-region replication for disaster recovery
- Pipeline notifications for deployment status

### 6.2 CodeBuild Projects
**Requirement:** Secure build environment for CDK operations.

**Build Project Setup:**
- Use `codebuild.Project` construct
- Environment: Ubuntu with CDK CLI pre-installed
- Build specification for CDK commands (synth, diff, deploy)
- Artifact storage in S3 with encryption
- VPC configuration for private resource access
- IAM role with CDK deployment permissions

### 6.3 GitHub Actions Integration
**Requirement:** Enhanced GitHub Actions for application deployment.

**Workflow Requirements:**
- CDK deployment workflow triggered by infrastructure changes
- Application deployment workflow triggered by application changes
- Use CDK outputs for dynamic configuration in GitHub Actions
- Secrets management using GitHub OIDC and AWS IAM roles
- Deployment status reporting back to GitHub

---

## 🔄 PHASE 7: AUTO SCALING CONFIGURATION

### 7.1 Application Auto Scaling
**Requirement:** Multi-metric auto scaling using CDK constructs.

**Scaling Configuration:**
- Use `applicationautoscaling.ScalableTarget` construct
- Configure target tracking policies for CPU, memory, and requests
- Set min/max capacity and scaling cooldowns
- Create scheduled scaling actions for predictable load patterns
- Integration with CloudWatch metrics for custom scaling triggers

### 7.2 Predictive Scaling
**Requirement:** Scheduled scaling for known traffic patterns.

**Schedule Configuration:**
- Use `applicationautoscaling.Schedule` construct
- Define business hours, off-hours, and weekend scaling
- Special event scaling for high-traffic periods
- Integration with calendar systems for dynamic scheduling
- Cost optimization through right-sizing during low traffic

---

## 🧪 PHASE 8: TESTING AND VALIDATION

### 8.1 CDK Testing Strategy
**Requirement:** Comprehensive testing for infrastructure code.

**Test Types:**
- Unit tests using CDK assertions framework
- Integration tests for stack interactions
- Security tests for IAM policy validation
- Compliance tests for organizational standards
- Performance tests for resource optimization

**Test Implementation:**
- Use `@aws-cdk/assertions` for fine-grained testing
- Mock external dependencies for isolated testing
- Snapshot testing for template validation
- Security scanning of generated CloudFormation templates
- Cost estimation validation for resource sizing

### 8.2 Deployment Validation
**Requirement:** Automated validation of deployed infrastructure.

**Validation Steps:**
- Health check endpoints verification
- Security group rule validation
- SSL certificate validation
- Load balancer functionality testing
- Auto scaling trigger validation
- Monitoring and alerting verification

---

## 📋 PHASE 9: ENVIRONMENT MANAGEMENT

### 9.1 Multi-Environment Strategy
**Requirement:** Consistent environment deployment using CDK stages.

**Stage Configuration:**
- Use `cdk.Stage` construct for environment isolation
- Environment-specific parameter files
- Resource naming conventions per environment
- Cross-environment resource sharing restrictions
- Environment-specific scaling and monitoring configurations

### 9.2 Configuration Management
**Requirement:** Centralized configuration management for all environments.

**Configuration Strategy:**
- Use CDK context for environment-specific values
- Parameter Store integration for runtime configuration
- Secrets Manager for sensitive configuration
- Environment variable injection through CDK
- Configuration validation and type safety

---

## 🔧 PHASE 10: OPERATIONAL PROCEDURES

### 10.1 Deployment Procedures
**Requirement:** Standardized CDK deployment workflows.

**Deployment Process:**
1. CDK diff generation for change review
2. Security and compliance validation
3. Staging environment deployment
4. Automated testing in staging
5. Production deployment approval
6. Production deployment with monitoring
7. Post-deployment validation
8. Rollback procedures if needed

### 10.2 Maintenance and Updates
**Requirement:** Regular maintenance activities for CDK infrastructure.

**Maintenance Activities:**
- CDK and construct library updates
- Security patch deployment through CDK
- Cost optimization through resource right-sizing
- Performance tuning based on monitoring data
- Documentation updates for infrastructure changes

### 10.3 Disaster Recovery
**Requirement:** CDK-based disaster recovery procedures.

**Recovery Strategy:**
- Infrastructure recreation using CDK templates
- Cross-region deployment capabilities
- Backup and restore procedures for stateful resources
- Recovery time objectives and testing procedures
- Documentation for emergency procedures

---

## ✅ CDK-SPECIFIC ACCEPTANCE CRITERIA

### Infrastructure as Code Validation
- [ ] All infrastructure defined in CDK TypeScript constructs
- [ ] No manual AWS console changes allowed in production
- [ ] CDK diff output reviewed and approved for all changes
- [ ] CloudFormation templates pass security scanning
- [ ] Stack dependencies properly defined and managed
- [ ] Resource tagging strategy consistently applied
- [ ] Cross-stack references use CDK outputs/imports only

### CDK Best Practices Compliance
- [ ] Custom constructs follow CDK construct design patterns
- [ ] Proper separation of concerns across stacks
- [ ] Environment-specific configuration externalized
- [ ] Unit tests cover all custom constructs and stacks
- [ ] Integration tests validate stack interactions
- [ ] Documentation includes CDK architecture decisions
- [ ] Version pinning for CDK and construct dependencies

### Deployment Pipeline Validation
- [ ] CDK deployment pipeline includes approval gates
- [ ] Infrastructure changes trigger appropriate notifications
- [ ] Rollback procedures tested and documented
- [ ] Drift detection configured and monitored
- [ ] Cost impact analysis included in deployment process
- [ ] Security compliance validated in pipeline
- [ ] Performance impact assessed for changes

### Operational Excellence with CDK
- [ ] Monitoring and alerting defined in CDK constructs
- [ ] Log retention and encryption configured via CDK
- [ ] Auto scaling policies defined and tested
- [ ] Backup strategies implemented through CDK
- [ ] Disaster recovery procedures validated
- [ ] Cost optimization strategies implemented
- [ ] Security best practices enforced in code

---

## 📚 CDK IMPLEMENTATION GUIDELINES

### Development Standards
**Requirement:** Consistent CDK development practices across the team.

**Coding Standards:**
- TypeScript strict mode enabled for type safety
- ESLint and Prettier configuration for code consistency
- Custom construct documentation with examples
- Error handling and validation in constructs
- Proper resource naming conventions
- Cost-aware resource provisioning

### Security Considerations
**Requirement:** Security-first approach in CDK development.

**Security Practices:**
- IAM policies follow least privilege principle
- Secrets never hardcoded in CDK code
- Security groups follow default deny approach
- Encryption enabled for all applicable resources
- Network isolation enforced through CDK constructs
- Regular security reviews of CDK templates

### Performance Optimization
**Requirement:** Performance-conscious infrastructure design.

**Optimization Strategies:**
- Resource right-sizing based on monitoring data
- Auto scaling configuration for cost efficiency
- CDN and caching strategies implementation
- Database connection pooling and optimization
- Monitoring and alerting for performance metrics
- Regular performance reviews and optimizations

This CDK-focused specification ensures that all infrastructure is version-controlled, repeatable, and follows AWS best practices while maintaining the same security and operational excellence standards.# BCOS CI/CD Pipeline - Detailed Implementation Requirements
## Security-Hardened Production Deployment Specification

**Project:** BCOS (BendcareOS)  
**AWS Account:** 854428944440  
**Region:** us-east-1  
**Application:** Node.js web application with health endpoints

---

## 🎯 EXECUTIVE SUMMARY

This document specifies the exact implementation requirements for a production-ready, security-hardened CI/CD pipeline for the BCOS application. Every security control, configuration parameter, and operational procedure is defined to ensure enterprise-grade deployment standards.

---

## 🔐 PHASE 1: IDENTITY & ACCESS MANAGEMENT

### 1.1 GitHub OIDC Provider Setup
**Requirement:** Establish secure authentication between GitHub Actions and AWS without long-lived credentials.

**Implementation Details:**
- Create OIDC identity provider in AWS IAM with URL `https://token.actions.githubusercontent.com`
- Configure client ID list containing `sts.amazonaws.com`
- Set thumbprint to `6938fd4d98bab03faadb97b34396831e3780aea1`
- Enable the provider for use by GitHub Actions workflows

### 1.2 GitHub Actions IAM Role Configuration
**Requirement:** Create least-privilege IAM role with branch and repository restrictions.

**Trust Policy Specifications:**
- Principal: GitHub OIDC provider ARN for account 854428944440
- Conditions must include:
  - `token.actions.githubusercontent.com:aud` equals `sts.amazonaws.com`
  - `token.actions.githubusercontent.com:iss` equals `https://token.actions.githubusercontent.com`
  - `token.actions.githubusercontent.com:repository_owner` equals the GitHub organization name
  - `token.actions.githubusercontent.com:repository` equals `org/bcos`
  - `token.actions.githubusercontent.com:sub` matches only `repo:org/bcos:ref:refs/heads/main` and `repo:org/bcos:ref:refs/heads/staging`
  - `token.actions.githubusercontent.com:environment` if exists must be `production` or `staging`

### 1.3 Deployment Policy Permissions
**Requirement:** Define scoped permissions policy with zero wildcard access.

**ECR Permissions:**
- `ecr:GetAuthorizationToken` on all resources (required for Docker login)
- `ecr:BatchCheckLayerAvailability`, `ecr:GetDownloadUrlForLayer`, `ecr:BatchGetImage`, `ecr:InitiateLayerUpload`, `ecr:UploadLayerPart`, `ecr:CompleteLayerUpload`, `ecr:PutImage` restricted to `arn:aws:ecr:us-east-1:854428944440:repository/bcos`

**ECS Permissions:**
- `ecs:UpdateService`, `ecs:DescribeServices` on service ARNs: `arn:aws:ecs:us-east-1:854428944440:service/production-cluster/bcos-prod-service` and `arn:aws:ecs:us-east-1:854428944440:service/staging-cluster/bcos-staging-service`
- `ecs:DescribeTaskDefinition`, `ecs:RegisterTaskDefinition` on task definition families: `arn:aws:ecs:us-east-1:854428944440:task-definition/bcos-prod*` and `arn:aws:ecs:us-east-1:854428944440:task-definition/bcos-staging*`

**PassRole Permissions:**
- `iam:PassRole` restricted to `arn:aws:iam::854428944440:role/ecsTaskExecutionRole` and `arn:aws:iam::854428944440:role/bcos-task-role`
- Additional condition: `iam:PassedToService` must equal `ecs-tasks.amazonaws.com`

### 1.4 Application Task Role
**Requirement:** Separate IAM role for runtime application permissions.

**Trust Policy:** Allow `ecs-tasks.amazonaws.com` service to assume role
**Permissions:** 
- `secretsmanager:GetSecretValue` restricted to specific secret ARNs:
  - `arn:aws:secretsmanager:us-east-1:854428944440:secret:prod/bcos-secrets*`
  - `arn:aws:secretsmanager:us-east-1:854428944440:secret:staging/bcos-secrets*`

---

## 🏗️ PHASE 2: CONTAINER REGISTRY & IMAGE SECURITY

### 2.1 ECR Repository Configuration
**Requirement:** Secure container registry with vulnerability scanning and lifecycle management.

**Repository Settings:**
- Repository name: `bcos`
- Image scanning: Enable scan on push
- Image tag mutability: IMMUTABLE (prevents tag overwrites)
- Enhanced scanning: Enable if available in us-east-1
- Encryption: Use KMS encryption with customer-managed key

### 2.2 ECR Lifecycle Policies
**Requirement:** Automated image cleanup to control storage costs and maintain security.

**Lifecycle Rules:**
- Rule 1: Keep maximum 10 images with tags starting with `v` or `release` (production releases)
- Rule 2: Keep maximum 5 images with tags starting with `staging`
- Rule 3: Delete untagged images after 7 days
- Rule 4: Keep maximum 3 images for any other tag pattern

### 2.3 ECR Security Policies
**Requirement:** Prevent unauthorized access to container images.

**Registry Policy:**
- Deny all ECR actions for principals not from account 854428944440
- Block public repository access
- Require authentication for all pull operations
- Enable cross-account access only for approved accounts (if needed)

---

## 🌐 PHASE 3: NETWORK ARCHITECTURE & SECURITY

### 3.1 VPC and Subnet Requirements
**Requirement:** Deploy into existing VPC with proper subnet segregation.

**Prerequisites Validation:**
- Existing VPC must have CIDR range defined
- Minimum 2 public subnets in different availability zones for ALB
- Minimum 2 private subnets in different availability zones for ECS tasks
- Internet Gateway attached to VPC for public subnet routing
- Route tables properly configured for public/private subnet access

### 3.2 Security Group Configuration
**Requirement:** Implement least-privilege network access controls.

**ALB Security Group:**
- Name: `bcos-alb-sg`
- Inbound rules:
  - Port 443 (HTTPS) from 0.0.0.0/0
  - Port 80 (HTTP) from 0.0.0.0/0 (for redirect only)
- Outbound rules: Default (all traffic to 0.0.0.0/0)

**ECS Security Group:**
- Name: `bcos-ecs-sg`
- Inbound rules: Port 80 from ALB security group only
- Outbound rules: Remove default rule, add specific rules:
  - Port 443 to VPC CIDR range (for VPC endpoints)
  - No direct internet access (0.0.0.0/0 prohibited)

### 3.3 VPC Endpoints Implementation
**Requirement:** Replace NAT Gateway with VPC Interface Endpoints for cost optimization and security.

**Required Endpoints:**
- ECR API endpoint: `com.amazonaws.us-east-1.ecr.api`
- ECR DKR endpoint: `com.amazonaws.us-east-1.ecr.dkr`
- S3 Gateway endpoint: `com.amazonaws.us-east-1.s3` (for ECR image layers)
- CloudWatch Logs endpoint: `com.amazonaws.us-east-1.logs`
- Secrets Manager endpoint: `com.amazonaws.us-east-1.secretsmanager`
- STS endpoint: `com.amazonaws.us-east-1.sts` (for IAM role assumptions)

**Endpoint Configuration:**
- Deploy Interface endpoints in private subnets
- Associate with ECS security group
- Enable private DNS resolution
- Apply endpoint policies restricting access to account 854428944440

---

## 🔒 PHASE 4: SSL/TLS AND LOAD BALANCER SETUP

### 4.1 SSL Certificate Management
**Requirement:** Automated SSL certificate provisioning and renewal.

**Certificate Configuration:**
- Primary domain: `bcos.yourdomain.com`
- Subject Alternative Name: `staging.bcos.yourdomain.com`
- Validation method: DNS validation (automated)
- Certificate authority: AWS Certificate Manager
- Auto-renewal: Enabled (AWS managed)

### 4.2 Application Load Balancer
**Requirement:** Internet-facing load balancer with SSL termination.

**ALB Configuration:**
- Scheme: Internet-facing
- IP address type: IPv4
- Subnets: Deploy in public subnets across multiple AZs
- Security groups: Attach ALB security group
- Deletion protection: Enable for production
- Access logs: Enable with S3 bucket storage

### 4.3 ALB Listener Configuration
**Requirement:** Enforce HTTPS traffic with proper redirects.

**HTTP Listener (Port 80):**
- Action: Redirect to HTTPS
- Status code: HTTP 301 (permanent redirect)
- Protocol: HTTPS
- Port: 443

**HTTPS Listener (Port 443):**
- SSL certificate: Use ACM certificate
- SSL policy: ELBSecurityPolicy-TLS-1-2-2017-01 (minimum TLS 1.2)
- Default action: Forward to production target group
- Additional rules for staging environment routing

### 4.4 Target Group Configuration
**Requirement:** Health check optimization for containerized applications.

**Production Target Group:**
- Name: `bcos-prod-tg`
- Target type: IP (required for Fargate)
- Protocol: HTTP, Port: 80
- Health check path: `/health`
- Health check interval: 15 seconds
- Health check timeout: 5 seconds
- Healthy threshold: 2 consecutive successes
- Unhealthy threshold: 3 consecutive failures
- Matcher: HTTP 200 status code

**Staging Target Group:**
- Similar configuration with name `bcos-staging-tg`
- Routing rule: Host header `staging.bcos.yourdomain.com`

---

## 🛡️ PHASE 5: WEB APPLICATION FIREWALL

### 5.1 WAF v2 Configuration
**Requirement:** Comprehensive web application protection.

**Web ACL Settings:**
- Name: `BCOS-Protection`
- Scope: Regional (for ALB association)
- Default action: Allow
- CloudWatch metrics: Enabled
- Sampled requests: Enabled

**Rule Configuration:**
- Rule 1: AWS Managed Common Rule Set (OWASP protection)
  - Priority: 1
  - Action: Block on rule match
  - Override action: None (use rule group defaults)
- Rule 2: Rate limiting rule
  - Priority: 2
  - Limit: 2000 requests per 5-minute window per IP
  - Action: Block
  - Aggregation: IP address
- Rule 3: AWS Managed Known Bad Inputs
  - Priority: 3
  - Action: Block
- Rule 4: Geographic blocking (if required)
  - Priority: 4
  - Block specific countries if needed

### 5.2 WAF Integration
**Requirement:** Associate WAF with ALB for traffic filtering.

**Association Configuration:**
- Associate Web ACL with ALB ARN
- Enable logging to CloudWatch Logs or S3
- Configure metric filters for blocked requests
- Set up alerting for high block rates

---

## 🔑 PHASE 6: SECRETS MANAGEMENT & ENCRYPTION

### 6.1 KMS Key Management
**Requirement:** Customer-managed encryption keys for enhanced security.

**KMS Key Configuration:**
- Description: "BCOS encryption key for logs, secrets, and ECR"
- Key usage: ENCRYPT_DECRYPT
- Key spec: SYMMETRIC_DEFAULT
- Key rotation: Enable automatic rotation (annual)
- Alias: `alias/bcos-encryption`

**Key Policy:**
- Allow root account full access
- Allow CloudWatch Logs service encrypt/decrypt permissions
- Allow ECS task role decrypt permissions for secrets
- Allow ECR service permissions for repository encryption

### 6.2 Secrets Manager Setup
**Requirement:** Secure storage of application secrets with rotation.

**Production Secrets:**
- Secret name: `prod/bcos-secrets`
- KMS encryption: Use customer-managed key
- Secret structure:
  - `DATABASE_URL`: PostgreSQL connection with `sslmode=require`
  - `API_KEY`: External service API key
  - `JWT_SECRET`: JSON Web Token signing secret
- Automatic rotation: Configure for database credentials (30-day cycle)
- Version management: Use AWSCURRENT label for task definitions

**Staging Secrets:**
- Secret name: `staging/bcos-secrets`
- Similar structure with staging-specific values
- No automatic rotation required for staging

### 6.3 CloudWatch Logs Encryption
**Requirement:** Encrypt all application logs at rest.

**Log Group Configuration:**
- Production: `/ecs/bcos-prod`
- Staging: `/ecs/bcos-staging`
- KMS encryption: Use customer-managed key
- Retention period: 90 days minimum for compliance
- Log stream prefix: `ecs` for container identification

---

## 🐳 PHASE 7: CONTAINER SECURITY & ECS SETUP

### 7.1 Container Image Requirements
**Requirement:** Secure, minimal container images with current software.

**Base Image Standards:**
- Primary option: Node.js 22 LTS Alpine Linux
- Alternative: Distroless Node.js 22 for minimal attack surface
- Prohibited: Any Node.js version below 20 (EOL versions)
- Multi-stage build: Separate build and runtime stages

**Security Hardening:**
- Non-root user: Create user with UID 1001
- Minimal packages: Only essential runtime dependencies
- No shell access in production containers (if using distroless)
- Health check: Implement container-level health verification

### 7.2 ECS Cluster Configuration
**Requirement:** Managed container orchestration with monitoring.

**Cluster Settings:**
- Production cluster: `production-cluster`
- Staging cluster: `staging-cluster`
- Capacity providers: Fargate only
- Container insights: Enable for enhanced monitoring
- Execute command: Enable for debugging (with IAM restrictions)

### 7.3 Task Definition Security
**Requirement:** Maximum security constraints for container runtime.

**Security Parameters:**
- Network mode: `awsvpc` (required for Fargate)
- CPU: 256 units (0.25 vCPU)
- Memory: 512 MB
- Execution role: `ecsTaskExecutionRole` (for AWS service access)
- Task role: `bcos-task-role` (for application runtime permissions)

**Container Security:**
- Read-only root filesystem: `true`
- User: `1001` (non-root)
- Linux parameters:
  - Drop all capabilities: `["ALL"]`
  - Init process enabled: `true`
- Resource limits:
  - File descriptors: 65536 soft/hard limit
- Stop timeout: 30 seconds for graceful shutdown

### 7.4 ECS Service Configuration
**Requirement:** Resilient service deployment with circuit breakers.

**Service Parameters:**
- Desired count: 2 (production), 1 (staging)
- Launch type: Fargate
- Platform version: Latest
- Network configuration:
  - Subnets: Private subnets only
  - Security groups: ECS security group
  - Public IP: Disabled
- Load balancer integration:
  - Target group: Associate with appropriate target group
  - Container port: 80
  - Health check grace period: 120 seconds

**Deployment Configuration:**
- Maximum percent: 200% (allows full replacement)
- Minimum healthy percent: 50% (production), 0% (staging)
- Circuit breaker: Enable with rollback
- Deployment timeout: 15 minutes
- Auto rollback: Enable on deployment failure

---

## 📊 PHASE 8: AUTO SCALING & PERFORMANCE

### 8.1 Auto Scaling Configuration
**Requirement:** Multi-metric scaling for optimal performance and cost.

**Scalable Target:**
- Service namespace: `ecs`
- Scalable dimension: `ecs:service:DesiredCount`
- Resource ID: `service/production-cluster/bcos-prod-service`
- Min capacity: 2 tasks
- Max capacity: 20 tasks

**Scaling Policies:**
- CPU-based scaling:
  - Target value: 70%
  - Scale-out cooldown: 300 seconds
  - Scale-in cooldown: 600 seconds
- Memory-based scaling:
  - Target value: 80%
  - Scale-out cooldown: 300 seconds
  - Scale-in cooldown: 600 seconds
- Request-based scaling:
  - Target value: 1000 requests per target per minute
  - Scale-out cooldown: 300 seconds
  - Scale-in cooldown: 600 seconds

### 8.2 Scheduled Scaling
**Requirement:** Predictive scaling for known traffic patterns.

**Schedule Configuration:**
- Peak hours: Monday-Friday 8:00 AM (min: 4, max: 20)
- Off hours: Monday-Friday 8:00 PM (min: 2, max: 10)
- Weekend scaling: Maintain minimum capacity
- Holiday schedules: Define specific scaling for high-traffic events

---

## ⚡ PHASE 9: CI/CD PIPELINE SECURITY

### 9.1 GitHub Repository Security
**Requirement:** Secure source code management with branch protection.

**Branch Protection Rules:**
- Protected branches: `main`, `staging`
- Required reviews: 1 reviewer for main branch
- Dismiss stale reviews: Enable
- Require review from code owners: Enable
- Required status checks: All tests and security scans must pass
- Require up-to-date branches: Enable before merge
- Include administrators: Apply rules to all users

**Security Features:**
- Secret scanning: Enable for credential detection
- Dependency scanning: Enable Dependabot alerts
- Code scanning: Enable CodeQL for vulnerability detection
- Private repository: Ensure repository is not public

### 9.2 GitHub Actions Workflow Security
**Requirement:** Secure CI/CD execution with minimal permissions.

**Workflow Permissions:**
- id-token: write (for OIDC authentication)
- contents: read (for code checkout)
- All other permissions: explicitly deny

**Action Security:**
- Pin all actions to commit SHAs, not version tags
- Use only actions from verified publishers
- Avoid composite actions that download external content
- Implement action approval process for new actions

### 9.3 Build Process Security
**Requirement:** Secure container build and deployment pipeline.

**Image Build Steps:**
1. Code checkout with verified action
2. Node.js setup with LTS version
3. Dependency installation with `npm ci` (not `npm install`)
4. Unit test execution with coverage requirements
5. Security testing with SAST tools
6. Container image build with build arguments
7. Vulnerability scanning before push (fail on HIGH/CRITICAL)
8. Image signing with Cosign (keyless signing)
9. Push to ECR with SHA-based tags
10. Signature verification before deployment

**Deployment Validation:**
- ECS task definition update with new image digest
- Health check validation post-deployment
- Rollback trigger on health check failures
- Deployment notification to monitoring systems

---

## 📈 PHASE 10: MONITORING & ALERTING

### 10.1 CloudWatch Metrics & Alarms
**Requirement:** Comprehensive monitoring coverage for all critical components.

**ECS Service Alarms:**
- Service deployment failure: Alert on any deployment failure
- Running task count: Alert when below desired capacity
- CPU utilization: Alert when >80% for 3 consecutive periods
- Memory utilization: Alert when >85% for 3 consecutive periods
- Task stop reasons: Alert on abnormal task terminations

**ALB Alarms:**
- Unhealthy targets: Alert immediately when any target unhealthy
- High 5XX errors: Alert when >10 errors in 5 minutes
- High response time: Alert when average >2 seconds for 3 periods
- Low healthy host count: Alert when <50% of targets healthy

**Application Alarms:**
- Error log patterns: Alert on ERROR, FATAL, or panic log entries
- Failed health checks: Alert on repeated health check failures
- Database connection failures: Alert on database connectivity issues
- External API failures: Alert on upstream service failures

### 10.2 Log Aggregation & Analysis
**Requirement:** Centralized logging with searchable, structured data.

**Log Structure:**
- JSON format for all application logs
- Required fields: timestamp, level, message, request_id, user_id
- Correlation IDs for request tracing
- No sensitive data in logs (PII, passwords, tokens)

**Log Metric Filters:**
- Error count: Count of ERROR and FATAL log entries
- Response time: Average response time from access logs
- Request count: Total requests per minute
- User activity: Active user sessions and authentication events

### 10.3 Notification System
**Requirement:** Multi-channel alerting for different severity levels.

**SNS Topic Configuration:**
- Topic name: `bcos-alerts`
- Subscription protocols:
  - Email: Operations team distribution list
  - SMS: On-call engineer (critical alerts only)
  - Slack: Development team channel (if integrated)
  - PagerDuty: Incident management integration

**Alert Severity Levels:**
- Critical: Service down, security breach, data loss
- High: Performance degradation, partial service disruption
- Medium: Resource utilization warnings, minor errors
- Low: Information notices, scheduled maintenance

---

## 🧪 PHASE 11: TESTING & VALIDATION

### 11.1 Security Testing Requirements
**Requirement:** Automated security validation throughout pipeline.

**Static Application Security Testing (SAST):**
- Tool: GitHub CodeQL or equivalent
- Scan frequency: Every commit and PR
- Fail conditions: Any high or critical vulnerability
- Exemption process: Security team approval required

**Dynamic Application Security Testing (DAST):**
- Tool: OWASP ZAP or equivalent
- Scan frequency: Staging deployment validation
- Scope: All public endpoints and authentication flows
- Fail conditions: Any exploitable vulnerability

**Container Security:**
- Vulnerability scanning: Trivy or equivalent
- Base image validation: Only approved base images
- Dependency scanning: Check for known vulnerabilities
- Configuration scanning: CIS benchmarks compliance

### 11.2 Performance Testing
**Requirement:** Validate application performance under load.

**Load Testing:**
- Tool: Artillery, JMeter, or equivalent
- Test scenarios: Normal load, peak load, stress testing
- Success criteria: <2s response time at 95th percentile
- Concurrent users: 1000 users minimum

**Health Check Validation:**
- Endpoint: `/health`
- Response time: <200ms
- Response format: JSON with status, timestamp, version
- Dependencies: Database connectivity, external service status

### 11.3 Disaster Recovery Testing
**Requirement:** Validate recovery procedures and failover capabilities.

**Failover Testing:**
- Multi-AZ failure simulation
- Database failover validation
- DNS failover (if using Route 53)
- Recovery time measurement (target: <1 hour)

**Backup Validation:**
- Database backup restoration
- Configuration backup verification
- Documentation accuracy validation
- Recovery procedure testing

---

## 📋 PHASE 12: OPERATIONAL PROCEDURES

### 12.1 Deployment Procedures
**Requirement:** Standardized deployment process with rollback capabilities.

**Standard Deployment Flow:**
1. Feature development in feature branch
2. Pull request with required reviews
3. Automated testing and security scans
4. Merge to staging branch
5. Automatic staging deployment
6. Staging validation testing
7. Merge to main branch with approval
8. Production deployment with monitoring
9. Post-deployment validation
10. Deployment notification and documentation

**Emergency Deployment:**
- Hotfix branch creation from main
- Expedited review process (1 reviewer)
- Direct deployment with full monitoring
- Post-deployment security scan
- Incident documentation requirement

### 12.2 Rollback Procedures
**Requirement:** Quick recovery from failed deployments.

**Automatic Rollback:**
- Circuit breaker triggers on health check failures
- ECS service automatically reverts to previous task definition
- Maximum rollback time: 5 minutes
- Notification to operations team

**Manual Rollback:**
- AWS CLI commands for emergency rollback
- Previous task definition identification
- Database migration rollback (if applicable)
- Cache invalidation procedures
- User communication templates

### 12.3 Maintenance Procedures
**Requirement:** Regular maintenance activities to ensure security and performance.

**Weekly Maintenance:**
- Security patch review and deployment
- Performance metrics analysis
- Cost optimization review
- Backup verification
- Access review for temporary permissions

**Monthly Maintenance:**
- Dependency update review
- SSL certificate renewal check
- Log retention cleanup
- Resource utilization analysis
- Documentation updates

**Quarterly Maintenance:**
- Security assessment and penetration testing
- Disaster recovery testing
- Access review and cleanup
- Architecture review for optimization
- Training updates for operations team

---

## ✅ ACCEPTANCE CRITERIA & TESTING

### Security Validation Checklist
- [ ] All traffic encrypted in transit (TLS 1.2+)
- [ ] No wildcard permissions in IAM policies
- [ ] Container images signed and verified
- [ ] Vulnerability scans pass with no HIGH/CRITICAL findings
- [ ] WAF blocking malicious requests (test with OWASP test cases)
- [ ] Secrets properly encrypted and rotated
- [ ] Network traffic isolated to private subnets
- [ ] Audit logging enabled for all components

### Performance Validation Checklist
- [ ] Health check response time <200ms
- [ ] Application response time <2s at 95th percentile
- [ ] Auto-scaling triggers within 5 minutes
- [ ] Load balancer handles 10,000 concurrent connections
- [ ] Deployment completes within 10 minutes
- [ ] Rollback completes within 5 minutes

### Operational Validation Checklist
- [ ] Monitoring alerts fire within SLA (15 minutes for critical)
- [ ] Log aggregation capturing all application events
- [ ] Backup and restore procedures validated
- [ ] Documentation complete and accurate
- [ ] Team training completed with hands-on validation
- [ ] Incident response procedures tested

### Compliance Validation Checklist
- [ ] CloudTrail logging enabled and encrypted
- [ ] Data encryption at rest for all components
- [ ] Access controls follow least privilege principle
- [ ] Audit logs retained per compliance requirements
- [ ] Change management process documented
- [ ] Business continuity plan validated

---

## 📞 STAKEHOLDER RESPONSIBILITIES

### Security Team
- Review and approve all IAM policies and security configurations
- Conduct security testing and penetration testing
- Validate compliance with organizational security standards
- Approve vulnerability exemptions and remediation plans

### DevOps Team
- Implement infrastructure and CI/CD pipeline
- Configure monitoring and alerting systems
- Develop operational procedures and runbooks
- Provide technical training to operations team

### Application Team
- Develop secure application code with health endpoints
- Implement structured logging and error handling
- Participate in security testing and remediation
- Maintain application documentation

### Operations Team
- Execute deployment and maintenance procedures
- Monitor system health and respond to alerts
- Perform regular maintenance activities
- Coordinate incident response activities

---

This comprehensive specification provides the detailed implementation guidance needed to build a production-ready, security-hardened CI/CD pipeline while maintaining the clarity and organization necessary for successful project execution.