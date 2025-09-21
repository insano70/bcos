#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { SecurityStack } from '../lib/stacks/security-stack';
import { NetworkStack } from '../lib/stacks/network-stack';
import { StagingStack } from '../lib/stacks/staging-stack';
import { ProductionStack } from '../lib/stacks/production-stack';

// Environment configuration
const account = process.env.AWS_ACCOUNT_ID || process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.AWS_REGION || process.env.CDK_DEFAULT_REGION || 'us-east-1';

if (!account) {
  throw new Error('AWS_ACCOUNT_ID must be set');
}

const app = new cdk.App();

// Common environment config
const env = { account, region };

// Common tags applied to all resources
const commonTags = {
  Project: 'BCOS',
  Environment: 'Multi',
  ManagedBy: 'CDK',
  Owner: 'DevOps',
  CostCenter: 'Engineering'
};

// Security Stack - Contains IAM roles, KMS keys, and secrets
const securityStack = new SecurityStack(app, 'BCOS-SecurityStack', {
  env,
  description: 'BCOS Security infrastructure - IAM roles, KMS keys, and secrets management',
  tags: {
    ...commonTags,
    StackType: 'Security'
  }
});

// Network Stack - Contains VPC lookup, security groups, and load balancer
const networkStack = new NetworkStack(app, 'BCOS-NetworkStack', {
  env,
  description: 'BCOS Network infrastructure - VPC, security groups, and load balancer',
  kmsKey: securityStack.kmsKey,
  tags: {
    ...commonTags,
    StackType: 'Network'
  }
});

// Add dependency to ensure security stack deploys first
networkStack.addDependency(securityStack);

// Application stacks (using CDK imports/exports to avoid circular dependencies)
const stagingStack = new StagingStack(app, 'BCOS-StagingStack', {
  env,
  description: 'BCOS Staging environment - Complete staging deployment',
  tags: {
    ...commonTags,
    Environment: 'Staging',
    StackType: 'Application'
  }
});

const productionStack = new ProductionStack(app, 'BCOS-ProductionStack', {
  env,
  description: 'BCOS Production environment - Complete production deployment',
  tags: {
    ...commonTags,
    Environment: 'Production',
    StackType: 'Application'
  }
});

// Stack dependencies managed via CloudFormation imports (no direct dependencies)
// Deploy order: SecurityStack -> NetworkStack -> StagingStack -> ProductionStack

// Output important values for GitHub Actions
new cdk.CfnOutput(securityStack, 'GitHubActionsRoleArn', {
  value: securityStack.githubActionsRole.roleArn,
  description: 'GitHub Actions OIDC Role ARN for CI/CD authentication',
  exportName: 'BCOS-GitHubActionsRoleArn'
});

new cdk.CfnOutput(networkStack, 'LoadBalancerDNS', {
  value: networkStack.loadBalancer.loadBalancerDnsName,
  description: 'Application Load Balancer DNS name',
  exportName: 'BCOS-LoadBalancerDNS'
});

new cdk.CfnOutput(securityStack, 'ECRRepositoryUri', {
  value: securityStack.ecrRepository.repositoryUri,
  description: 'ECR repository URI for container images',
  exportName: 'BCOS-ECRRepositoryUri'
});

// Stack-specific outputs
new cdk.CfnOutput(stagingStack, 'StagingStackArn', {
  value: stagingStack.stackId,
  description: 'Staging Stack ARN',
  exportName: 'BCOS-StagingStackArn'
});

new cdk.CfnOutput(productionStack, 'ProductionStackArn', {
  value: productionStack.stackId,
  description: 'Production Stack ARN',
  exportName: 'BCOS-ProductionStackArn'
});

// Synthesis configuration
app.synth();
