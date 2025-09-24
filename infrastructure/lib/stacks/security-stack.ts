import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export class SecurityStack extends cdk.Stack {
  public readonly kmsKey: kms.Key;
  public readonly githubActionsRole: iam.Role;
  public readonly ecsTaskExecutionRole: iam.Role;
  public readonly ecsTaskRole: iam.Role;
  public readonly ecrRepository: ecr.Repository;
  public readonly productionSecret: secretsmanager.Secret;
  public readonly stagingSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Get CDK bootstrap qualifier from context or use default
    const cdkBootstrapQualifier = this.node.tryGetContext('bootstrapQualifier') || 'hnb659fds';

    // Create KMS key for encryption
    this.kmsKey = new kms.Key(this, 'BCOSEncryptionKey', {
      description: 'BCOS encryption key for logs, secrets, and ECR',
      enableKeyRotation: true,
      alias: 'bcos-encryption',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      policy: new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            sid: 'Enable IAM User Permissions',
            effect: iam.Effect.ALLOW,
            principals: [new iam.AccountRootPrincipal()],
            actions: ['kms:*'],
            resources: ['*'],
          }),
          new iam.PolicyStatement({
            sid: 'Allow CloudWatch Logs',
            effect: iam.Effect.ALLOW,
            principals: [
              new iam.ServicePrincipal('logs.amazonaws.com'),
            ],
            actions: [
              'kms:Encrypt',
              'kms:Decrypt',
              'kms:ReEncrypt*',
              'kms:GenerateDataKey*',
              'kms:DescribeKey',
            ],
            resources: ['*'],
          }),
          new iam.PolicyStatement({
            sid: 'Allow ECR Service',
            effect: iam.Effect.ALLOW,
            principals: [new iam.ServicePrincipal('ecr.amazonaws.com')],
            actions: [
              'kms:Decrypt',
              'kms:DescribeKey',
              'kms:GenerateDataKey',
            ],
            resources: ['*'],
          }),
        ],
      }),
    });

    // Create ECR repository
    this.ecrRepository = new ecr.Repository(this, 'BCOSRepository', {
      repositoryName: 'bcos',
      imageScanOnPush: true,
      imageTagMutability: ecr.TagMutability.MUTABLE,
      encryptionKey: this.kmsKey,
      lifecycleRules: [
        {
          description: 'Keep last 10 production images',
          maxImageCount: 10,
          tagPrefixList: ['v', 'release'],
        },
        {
          description: 'Keep last 5 staging images',
          maxImageCount: 5,
          tagPrefixList: ['staging'],
        },
        {
          description: 'Delete untagged images after 7 days',
          maxImageAge: cdk.Duration.days(7),
          tagStatus: ecr.TagStatus.UNTAGGED,
        },
      ],
    });

    // GitHub OIDC Provider
    const githubOidcProvider = new iam.OpenIdConnectProvider(this, 'GitHubOidcProvider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
      thumbprints: ['6938fd4d98bab03faadb97b34396831e3780aea1'],
    });

    // GitHub Actions Role
    this.githubActionsRole = new iam.Role(this, 'GitHubActionsRole', {
      roleName: 'BCOS-GitHubActionsDeploymentRole',
      assumedBy: new iam.WebIdentityPrincipal(
        githubOidcProvider.openIdConnectProviderArn,
        {
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
            'token.actions.githubusercontent.com:iss': 'https://token.actions.githubusercontent.com',
          },
          StringLike: {
            'token.actions.githubusercontent.com:sub': [
            'repo:pstewart/bcos:ref:refs/heads/main',
            'repo:pstewart/bcos:ref:refs/heads/staging',
            ],
          },
        }
      ),
      description: 'Role for GitHub Actions to deploy BCOS application',
      maxSessionDuration: cdk.Duration.hours(1),
    });

    // GitHub Actions Deployment Policy
    this.githubActionsRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'ECRAccess',
        effect: iam.Effect.ALLOW,
        actions: ['ecr:GetAuthorizationToken'],
        resources: ['*'],
      })
    );

    this.githubActionsRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'ECRRepository',
        effect: iam.Effect.ALLOW,
        actions: [
          'ecr:BatchCheckLayerAvailability',
          'ecr:GetDownloadUrlForLayer',
          'ecr:BatchGetImage',
          'ecr:InitiateLayerUpload',
          'ecr:UploadLayerPart',
          'ecr:CompleteLayerUpload',
          'ecr:PutImage',
          'ecr:DescribeImages',
        ],
        resources: [this.ecrRepository.repositoryArn],
      })
    );

    this.githubActionsRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'ECSAccess',
        effect: iam.Effect.ALLOW,
        actions: [
          'ecs:CreateService',
          'ecs:UpdateService',
          'ecs:DescribeServices',
          'ecs:RegisterTaskDefinition',
        ],
        resources: [
          `arn:aws:ecs:us-east-1:${this.account}:cluster/bcos-*-cluster`,
          `arn:aws:ecs:us-east-1:${this.account}:service/bcos-*-cluster/bcos-*-service`,
          `arn:aws:ecs:us-east-1:${this.account}:task-definition/bcos-*`,
        ],
      })
    );

    // DescribeTaskDefinition requires * resource
    this.githubActionsRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'ECSDescribeTaskDefinition',
        effect: iam.Effect.ALLOW,
        actions: ['ecs:DescribeTaskDefinition'],
        resources: ['*'],
      })
    );

    // CloudWatch Logs access for ECS service creation and management
    this.githubActionsRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'CloudWatchLogsAccess',
        effect: iam.Effect.ALLOW,
        actions: [
          'logs:CreateLogGroup',
          'logs:PutRetentionPolicy',
          'logs:TagLogGroup',
        ],
        resources: [
          `arn:aws:logs:us-east-1:${this.account}:log-group:/ecs/bcos-*`,
          `arn:aws:logs:us-east-1:${this.account}:log-group:/ecs/bcos-*:*`,
        ],
      })
    );

    // DescribeLogGroups requires broader permissions
    this.githubActionsRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'CloudWatchLogsDescribe',
        effect: iam.Effect.ALLOW,
        actions: [
          'logs:DescribeLogGroups',
        ],
        resources: ['*'], // DescribeLogGroups requires * resource
      })
    );

    // SSM permissions for CDK bootstrap version checking
    this.githubActionsRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'SSMBootstrapAccess',
        effect: iam.Effect.ALLOW,
        actions: [
          'ssm:GetParameter',
          'ssm:GetParameters',
        ],
        resources: [
          `arn:aws:ssm:us-east-1:${this.account}:parameter/cdk-bootstrap/${cdkBootstrapQualifier}/*`,
        ],
      })
    );

    // CDK bootstrap permissions for asset publishing and deployment
    this.githubActionsRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'CDKBootstrapAssumeRoles',
        effect: iam.Effect.ALLOW,
        actions: [
          'sts:AssumeRole',
        ],
        resources: [
          `arn:aws:iam::${this.account}:role/cdk-${cdkBootstrapQualifier}-deploy-role-${this.account}-us-east-1`,
          `arn:aws:iam::${this.account}:role/cdk-${cdkBootstrapQualifier}-file-publishing-role-${this.account}-us-east-1`,
          `arn:aws:iam::${this.account}:role/cdk-${cdkBootstrapQualifier}-lookup-role-${this.account}-us-east-1`,
        ],
      })
    );

    // CDK assets bucket access
    this.githubActionsRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'CDKAssetsBucketAccess',
        effect: iam.Effect.ALLOW,
        actions: [
          's3:GetObject',
          's3:PutObject',
          's3:GetBucketLocation',
          's3:ListBucket',
        ],
        resources: [
          `arn:aws:s3:::cdk-${cdkBootstrapQualifier}-assets-${this.account}-us-east-1`,
          `arn:aws:s3:::cdk-${cdkBootstrapQualifier}-assets-${this.account}-us-east-1/*`,
        ],
      })
    );

    // CloudFormation permissions for CDK stack operations
    this.githubActionsRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'CloudFormationAccess',
        effect: iam.Effect.ALLOW,
        actions: [
          'cloudformation:CreateStack',
          'cloudformation:UpdateStack',
          'cloudformation:DeleteStack',
          'cloudformation:DescribeStacks',
          'cloudformation:DescribeStackEvents',
          'cloudformation:DescribeStackResources',
          'cloudformation:GetTemplate',
          'cloudformation:ListStackResources',
          'cloudformation:CreateChangeSet',
          'cloudformation:ExecuteChangeSet',
          'cloudformation:DescribeChangeSet',
          'cloudformation:DeleteChangeSet',
          'cloudformation:ListChangeSets',
          'cloudformation:GetStackPolicy',
        ],
        resources: [
          `arn:aws:cloudformation:us-east-1:${this.account}:stack/BCOS-*/*`,
        ],
      })
    );

    // ECS Task Execution Role (for AWS service calls)
    this.ecsTaskExecutionRole = new iam.Role(this, 'ECSTaskExecutionRole', {
      roleName: 'BCOS-ECSTaskExecutionRole',
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
      description: 'ECS Task Execution Role for BCOS application',
    });

    // Add KMS permissions to execution role
    this.ecsTaskExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['kms:Decrypt', 'kms:DescribeKey'],
        resources: [this.kmsKey.keyArn],
      })
    );

    // ECS Task Role (for application runtime permissions)
    this.ecsTaskRole = new iam.Role(this, 'ECSTaskRole', {
      roleName: 'BCOS-ECSTaskRole',
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'ECS Task Role for BCOS application runtime permissions',
    });

    // Create Secrets Manager secrets
    this.productionSecret = new secretsmanager.Secret(this, 'ProductionSecrets', {
      secretName: 'production/bcos-secrets',
      description: 'Production secrets for BCOS application',
      encryptionKey: this.kmsKey,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ 
          NODE_ENV: 'production',
          PORT: '3000'
        }),
        generateStringKey: 'JWT_SECRET',
        excludeCharacters: '"@/\\',
        includeSpace: false,
        passwordLength: 64,
      },
    });

    this.stagingSecret = new secretsmanager.Secret(this, 'StagingSecrets', {
      secretName: 'staging/bcos-secrets',
      description: 'Staging secrets for BCOS application',
      encryptionKey: this.kmsKey,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ 
          NODE_ENV: 'staging',
          PORT: '3000'
        }),
        generateStringKey: 'JWT_SECRET',
        excludeCharacters: '"@/\\',
        includeSpace: false,
        passwordLength: 64,
      },
    });

    // Grant secrets access to task role
    this.productionSecret.grantRead(this.ecsTaskRole);
    this.stagingSecret.grantRead(this.ecsTaskRole);

    // Grant secrets access to task execution role (for pulling secrets)
    this.productionSecret.grantRead(this.ecsTaskExecutionRole);
    this.stagingSecret.grantRead(this.ecsTaskExecutionRole);

    // Allow GitHub Actions to pass ECS roles
    this.githubActionsRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'PassRole',
        effect: iam.Effect.ALLOW,
        actions: ['iam:PassRole'],
        resources: [
          this.ecsTaskExecutionRole.roleArn,
          this.ecsTaskRole.roleArn,
        ],
        conditions: {
          StringEquals: {
            'iam:PassedToService': 'ecs-tasks.amazonaws.com',
          },
        },
      })
    );

    // Stack outputs for cross-stack references
    new cdk.CfnOutput(this, 'KMSKeyId', {
      value: this.kmsKey.keyId,
      description: 'KMS Key ID for BCOS encryption',
    });

    new cdk.CfnOutput(this, 'KMSKeyArn', {
      value: this.kmsKey.keyArn,
      description: 'KMS Key ARN for BCOS encryption',
      exportName: 'BCOS-KMS-Key-Arn',
    });

    new cdk.CfnOutput(this, 'ECRRepositoryName', {
      value: this.ecrRepository.repositoryName,
      description: 'ECR Repository name for BCOS container images',
    });

    new cdk.CfnOutput(this, 'ECRRepositoryArn', {
      value: this.ecrRepository.repositoryArn,
      description: 'ECR Repository ARN for BCOS container images',
      exportName: 'BCOS-ECRRepository-Arn',
    });

    new cdk.CfnOutput(this, 'ECSTaskExecutionRoleArn', {
      value: this.ecsTaskExecutionRole.roleArn,
      description: 'ECS Task Execution Role ARN',
      exportName: 'BCOS-ECSTaskExecutionRole-Arn',
    });

    new cdk.CfnOutput(this, 'ECSTaskRoleArn', {
      value: this.ecsTaskRole.roleArn,
      description: 'ECS Task Role ARN',
      exportName: 'BCOS-ECSTaskRole-Arn',
    });

    new cdk.CfnOutput(this, 'ProductionSecretArn', {
      value: this.productionSecret.secretArn,
      description: 'Production Secret ARN',
      exportName: 'BCOS-ProductionSecret-Arn',
    });

    new cdk.CfnOutput(this, 'StagingSecretArn', {
      value: this.stagingSecret.secretArn,
      description: 'Staging Secret ARN',
      exportName: 'BCOS-StagingSecret-Arn',
    });

    new cdk.CfnOutput(this, 'GitHubActionsRoleOutput', {
      value: this.githubActionsRole.roleArn,
      description: 'GitHub Actions Role ARN for CI/CD',
    });
  }
}
