#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { SecurityStack } from '../lib/stacks/security-stack';
import { NetworkStack } from '../lib/stacks/network-stack';
import { StagingStage } from '../lib/stages/staging-stage';
import { ProductionStage } from '../lib/stages/production-stage';

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

// Staging Stage - Complete staging environment
const stagingStage = new StagingStage(app, 'BCOS-StagingStage', {
  env,
  securityStack,
  networkStack,
});

// Production Stage - Complete production environment
const productionStage = new ProductionStage(app, 'BCOS-ProductionStage', {
  env,
  securityStack,
  networkStack,
});

// Apply tags to stages
cdk.Tags.of(stagingStage).add('Environment', 'Staging');
cdk.Tags.of(stagingStage).add('StackType', 'Application');
cdk.Tags.of(productionStage).add('Environment', 'Production');  
cdk.Tags.of(productionStage).add('StackType', 'Application');

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

// Synthesis configuration
app.synth();
