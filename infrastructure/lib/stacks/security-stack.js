"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecurityStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const kms = __importStar(require("aws-cdk-lib/aws-kms"));
const ecr = __importStar(require("aws-cdk-lib/aws-ecr"));
const secretsmanager = __importStar(require("aws-cdk-lib/aws-secretsmanager"));
class SecurityStack extends cdk.Stack {
    kmsKey;
    githubActionsRole;
    ecsTaskExecutionRole;
    ecsTaskRole;
    ecrRepository;
    productionSecret;
    stagingSecret;
    constructor(scope, id, props) {
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
            assumedBy: new iam.WebIdentityPrincipal(githubOidcProvider.openIdConnectProviderArn, {
                StringEquals: {
                    'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
                    'token.actions.githubusercontent.com:iss': 'https://token.actions.githubusercontent.com',
                },
                StringLike: {
                    'token.actions.githubusercontent.com:sub': [
                        'repo:insano70/bcos:environment:staging',
                        'repo:insano70/bcos:environment:production',
                        'repo:insano70/bcos:ref:refs/heads/main',
                        'repo:insano70/bcos:ref:refs/heads/staging',
                    ],
                },
            }),
            description: 'Role for GitHub Actions to deploy BCOS application',
            maxSessionDuration: cdk.Duration.hours(1),
        });
        // GitHub Actions Deployment Policy
        this.githubActionsRole.addToPolicy(new iam.PolicyStatement({
            sid: 'ECRAccess',
            effect: iam.Effect.ALLOW,
            actions: ['ecr:GetAuthorizationToken'],
            resources: ['*'],
        }));
        this.githubActionsRole.addToPolicy(new iam.PolicyStatement({
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
        }));
        this.githubActionsRole.addToPolicy(new iam.PolicyStatement({
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
        }));
        // DescribeTaskDefinition requires * resource
        this.githubActionsRole.addToPolicy(new iam.PolicyStatement({
            sid: 'ECSDescribeTaskDefinition',
            effect: iam.Effect.ALLOW,
            actions: ['ecs:DescribeTaskDefinition'],
            resources: ['*'],
        }));
        // CloudWatch Logs access for ECS service creation and management
        this.githubActionsRole.addToPolicy(new iam.PolicyStatement({
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
        }));
        // DescribeLogGroups requires broader permissions
        this.githubActionsRole.addToPolicy(new iam.PolicyStatement({
            sid: 'CloudWatchLogsDescribe',
            effect: iam.Effect.ALLOW,
            actions: [
                'logs:DescribeLogGroups',
            ],
            resources: ['*'], // DescribeLogGroups requires * resource
        }));
        // SSM permissions for CDK bootstrap version checking
        this.githubActionsRole.addToPolicy(new iam.PolicyStatement({
            sid: 'SSMBootstrapAccess',
            effect: iam.Effect.ALLOW,
            actions: [
                'ssm:GetParameter',
                'ssm:GetParameters',
            ],
            resources: [
                `arn:aws:ssm:us-east-1:${this.account}:parameter/cdk-bootstrap/${cdkBootstrapQualifier}/*`,
            ],
        }));
        // CDK bootstrap permissions for asset publishing and deployment
        this.githubActionsRole.addToPolicy(new iam.PolicyStatement({
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
        }));
        // CDK assets bucket access
        this.githubActionsRole.addToPolicy(new iam.PolicyStatement({
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
        }));
        // CloudFormation permissions for CDK stack operations
        this.githubActionsRole.addToPolicy(new iam.PolicyStatement({
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
        }));
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
        this.ecsTaskExecutionRole.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['kms:Decrypt', 'kms:DescribeKey'],
            resources: [this.kmsKey.keyArn],
        }));
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
                    NODE_ENV: 'production',
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
        // Grant GitHub Actions read access to secrets (for VPC endpoint warmup)
        this.githubActionsRole.addToPolicy(new iam.PolicyStatement({
            sid: 'SecretsManagerDescribe',
            effect: iam.Effect.ALLOW,
            actions: [
                'secretsmanager:DescribeSecret',
            ],
            resources: [
                this.productionSecret.secretArn,
                this.stagingSecret.secretArn,
            ],
        }));
        // Allow GitHub Actions to pass ECS roles
        this.githubActionsRole.addToPolicy(new iam.PolicyStatement({
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
        }));
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
exports.SecurityStack = SecurityStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VjdXJpdHktc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJzZWN1cml0eS1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMseURBQTJDO0FBQzNDLHlEQUEyQztBQUMzQyx5REFBMkM7QUFDM0MsK0VBQWlFO0FBR2pFLE1BQWEsYUFBYyxTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQzFCLE1BQU0sQ0FBVTtJQUNoQixpQkFBaUIsQ0FBVztJQUM1QixvQkFBb0IsQ0FBVztJQUMvQixXQUFXLENBQVc7SUFDdEIsYUFBYSxDQUFpQjtJQUM5QixnQkFBZ0IsQ0FBd0I7SUFDeEMsYUFBYSxDQUF3QjtJQUVyRCxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQXNCO1FBQzlELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLDBEQUEwRDtRQUMxRCxNQUFNLHFCQUFxQixHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLG9CQUFvQixDQUFDLElBQUksV0FBVyxDQUFDO1FBRTNGLGdDQUFnQztRQUNoQyxJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsbUJBQW1CLEVBQUU7WUFDbkQsV0FBVyxFQUFFLGdEQUFnRDtZQUM3RCxpQkFBaUIsRUFBRSxJQUFJO1lBQ3ZCLEtBQUssRUFBRSxpQkFBaUI7WUFDeEIsYUFBYSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsTUFBTTtZQUN2QyxNQUFNLEVBQUUsSUFBSSxHQUFHLENBQUMsY0FBYyxDQUFDO2dCQUM3QixVQUFVLEVBQUU7b0JBQ1YsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDO3dCQUN0QixHQUFHLEVBQUUsNkJBQTZCO3dCQUNsQyxNQUFNLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxLQUFL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LEVBQUUsSUFBSSxDQUFDLG9CQUFvQixDQUFDLE9BQU87WUFDeEMsV0FBVyxFQUFFLDZCQUE2QjtZQUMxQyxVQUFVLEVBQUUsK0JBQStCO1NBQzVDLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsZ0JBQWdCLEVBQUU7WUFDeEMsS0FBSyxFQUFFLElBQUksQ0FBQyxXQUFXLENBQUMsT0FBTztZQUMvQixXQUFXLEVBQUUsbUJBQW1CO1lBQ2hDLFVBQVUsRUFBRSxzQkFBc0I7U0FDbkMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxxQkFBcUIsRUFBRTtZQUM3QyxLQUFLLEVBQUUsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFNBQVM7WUFDdEMsV0FBVyxFQUFFLHVCQUF1QjtZQUNwQyxVQUFVLEVBQUUsMkJBQTJCO1NBQ3hDLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsa0JBQWtCLEVBQUU7WUFDMUMsS0FBSyxFQUFFLElBQUksQ0FBQyxhQUFhLENBQUMsU0FBUztZQUNuQyxXQUFXLEVBQUUsb0JBQW9CO1lBQ2pDLFVBQVUsRUFBRSx3QkFBd0I7U0FDckMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSx5QkFBeUIsRUFBRTtZQUNqRCxLQUFLLEVBQUUsSUFBSSxDQUFDLGlCQUFpQixDQUFDLE9BQU87WUFDckMsV0FBVyxFQUFFLG1DQUFtQztTQUNqRCxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUE3YUQsc0NBNmFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCAqIGFzIGttcyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mta21zJztcbmltcG9ydCAqIGFzIGVjciBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWNyJztcbmltcG9ydCAqIGFzIHNlY3JldHNtYW5hZ2VyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zZWNyZXRzbWFuYWdlcic7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcblxuZXhwb3J0IGNsYXNzIFNlY3VyaXR5U3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBwdWJsaWMgcmVhZG9ubHkga21zS2V5OiBrbXMuS2V5O1xuICBwdWJsaWMgcmVhZG9ubHkgZ2l0aHViQWN0aW9uc1JvbGU6IGlhbS5Sb2xlO1xuICBwdWJsaWMgcmVhZG9ubHkgZWNzVGFza0V4ZWN1dGlvblJvbGU6IGlhbS5Sb2xlO1xuICBwdWJsaWMgcmVhZG9ubHkgZWNzVGFza1JvbGU6IGlhbS5Sb2xlO1xuICBwdWJsaWMgcmVhZG9ubHkgZWNyUmVwb3NpdG9yeTogZWNyLlJlcG9zaXRvcnk7XG4gIHB1YmxpYyByZWFkb25seSBwcm9kdWN0aW9uU2VjcmV0OiBzZWNyZXRzbWFuYWdlci5TZWNyZXQ7XG4gIHB1YmxpYyByZWFkb25seSBzdGFnaW5nU2VjcmV0OiBzZWNyZXRzbWFuYWdlci5TZWNyZXQ7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM/OiBjZGsuU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgLy8gR2V0IENESyBib290c3RyYXAgcXVhbGlmaWVyIGZyb20gY29udGV4dCBvciB1c2UgZGVmYXVsdFxuICAgIGNvbnN0IGNka0Jvb3RzdHJhcFF1YWxpZmllciA9IHRoaXMubm9kZS50cnlHZXRDb250ZXh0KCdib290c3RyYXBRdWFsaWZpZXInKSB8fCAnaG5iNjU5ZmRzJztcblxuICAgIC8vIENyZWF0ZSBLTVMga2V5IGZvciBlbmNyeXB0aW9uXG4gICAgdGhpcy5rbXNLZXkgPSBuZXcga21zLktleSh0aGlzLCAnQkNPU0VuY3J5cHRpb25LZXknLCB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0JDT1MgZW5jcnlwdGlvbiBrZXkgZm9yIGxvZ3MsIHNlY3JldHMsIGFuZCBFQ1InLFxuICAgICAgZW5hYmxlS2V5Um90YXRpb246IHRydWUsXG4gICAgICBhbGlhczogJ2Jjb3MtZW5jcnlwdGlvbicsXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4sXG4gICAgICBwb2xpY3k6IG5ldyBpYW0uUG9saWN5RG9jdW1lbnQoe1xuICAgICAgICBzdGF0ZW1lbnRzOiBbXG4gICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgc2lkOiAnRW5hYmxlIElBTSBVc2VyIFBlcm1pc3Npb25zJyxcbiAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgIHByaW5jaXBhbHM6IFtuZXcgaWFtLkFjY291bnRSb290UHJpbmNpcGFsKCldLFxuICAgICAgICAgICAgYWN0aW9uczogWydrbXM6KiddLFxuICAgICAgICAgICAgcmVzb3VyY2VzOiBbJyonXSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICBzaWQ6ICdBbGxvdyBDbG91ZFdhdGNoIExvZ3MnLFxuICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgcHJpbmNpcGFsczogW1xuICAgICAgICAgICAgICBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2xvZ3MuYW1hem9uYXdzLmNvbScpLFxuICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgJ2ttczpFbmNyeXB0JyxcbiAgICAgICAgICAgICAgJ2ttczpEZWNyeXB0JyxcbiAgICAgICAgICAgICAgJ2ttczpSZUVuY3J5cHQqJyxcbiAgICAgICAgICAgICAgJ2ttczpHZW5lcmF0ZURhdGFLZXkqJyxcbiAgICAgICAgICAgICAgJ2ttczpEZXNjcmliZUtleScsXG4gICAgICAgICAgICBdLFxuICAgICAgICAgICAgcmVzb3VyY2VzOiBbJyonXSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICBzaWQ6ICdBbGxvdyBFQ1IgU2VydmljZScsXG4gICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICBwcmluY2lwYWxzOiBbbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdlY3IuYW1hem9uYXdzLmNvbScpXSxcbiAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgJ2ttczpEZWNyeXB0JyxcbiAgICAgICAgICAgICAgJ2ttczpEZXNjcmliZUtleScsXG4gICAgICAgICAgICAgICdrbXM6R2VuZXJhdGVEYXRhS2V5JyxcbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgICByZXNvdXJjZXM6IFsnKiddLFxuICAgICAgICAgIH0pLFxuICAgICAgICBdLFxuICAgICAgfSksXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgRUNSIHJlcG9zaXRvcnlcbiAgICB0aGlzLmVjclJlcG9zaXRvcnkgPSBuZXcgZWNyLlJlcG9zaXRvcnkodGhpcywgJ0JDT1NSZXBvc2l0b3J5Jywge1xuICAgICAgcmVwb3NpdG9yeU5hbWU6ICdiY29zJyxcbiAgICAgIGltYWdlU2Nhbk9uUHVzaDogdHJ1ZSxcbiAgICAgIGltYWdlVGFnTXV0YWJpbGl0eTogZWNyLlRhZ011dGFiaWxpdHkuTVVUQUJMRSxcbiAgICAgIGVuY3J5cHRpb25LZXk6IHRoaXMua21zS2V5LFxuICAgICAgbGlmZWN5Y2xlUnVsZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnS2VlcCBsYXN0IDEwIHByb2R1Y3Rpb24gaW1hZ2VzJyxcbiAgICAgICAgICBtYXhJbWFnZUNvdW50OiAxMCxcbiAgICAgICAgICB0YWdQcmVmaXhMaXN0OiBbJ3YnLCAncmVsZWFzZSddLFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgZGVzY3JpcHRpb246ICdLZWVwIGxhc3QgNSBzdGFnaW5nIGltYWdlcycsXG4gICAgICAgICAgbWF4SW1hZ2VDb3VudDogNSxcbiAgICAgICAgICB0YWdQcmVmaXhMaXN0OiBbJ3N0YWdpbmcnXSxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnRGVsZXRlIHVudGFnZ2VkIGltYWdlcyBhZnRlciA3IGRheXMnLFxuICAgICAgICAgIG1heEltYWdlQWdlOiBjZGsuRHVyYXRpb24uZGF5cyg3KSxcbiAgICAgICAgICB0YWdTdGF0dXM6IGVjci5UYWdTdGF0dXMuVU5UQUdHRUQsXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gR2l0SHViIE9JREMgUHJvdmlkZXJcbiAgICBjb25zdCBnaXRodWJPaWRjUHJvdmlkZXIgPSBuZXcgaWFtLk9wZW5JZENvbm5lY3RQcm92aWRlcih0aGlzLCAnR2l0SHViT2lkY1Byb3ZpZGVyJywge1xuICAgICAgdXJsOiAnaHR0cHM6Ly90b2tlbi5hY3Rpb25zLmdpdGh1YnVzZXJjb250ZW50LmNvbScsXG4gICAgICBjbGllbnRJZHM6IFsnc3RzLmFtYXpvbmF3cy5jb20nXSxcbiAgICAgIHRodW1icHJpbnRzOiBbJzY5MzhmZDRkOThiYWIwM2ZhYWRiOTdiMzQzOTY4MzFlMzc4MGFlYTEnXSxcbiAgICB9KTtcblxuICAgIC8vIEdpdEh1YiBBY3Rpb25zIFJvbGVcbiAgICB0aGlzLmdpdGh1YkFjdGlvbnNSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdHaXRIdWJBY3Rpb25zUm9sZScsIHtcbiAgICAgIHJvbGVOYW1lOiAnQkNPUy1HaXRIdWJBY3Rpb25zRGVwbG95bWVudFJvbGUnLFxuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLldlYklkZW50aXR5UHJpbmNpcGFsKFxuICAgICAgICBnaXRodWJPaWRjUHJvdmlkZXIub3BlbklkQ29ubmVjdFByb3ZpZGVyQXJuLFxuICAgICAgICB7XG4gICAgICAgICAgU3RyaW5nRXF1YWxzOiB7XG4gICAgICAgICAgICAndG9rZW4uYWN0aW9ucy5naXRodWJ1c2VyY29udGVudC5jb206YXVkJzogJ3N0cy5hbWF6b25hd3MuY29tJyxcbiAgICAgICAgICAgICd0b2tlbi5hY3Rpb25zLmdpdGh1YnVzZXJjb250ZW50LmNvbTppc3MnOiAnaHR0cHM6Ly90b2tlbi5hY3Rpb25zLmdpdGh1YnVzZXJjb250ZW50LmNvbScsXG4gICAgICAgICAgfSxcbiAgICAgICAgICBTdHJpbmdMaWtlOiB7XG4gICAgICAgICAgICAndG9rZW4uYWN0aW9ucy5naXRodWJ1c2VyY29udGVudC5jb206c3ViJzogW1xuICAgICAgICAgICAgJ3JlcG86aW5zYW5vNzAvYmNvczplbnZpcm9ubWVudDpzdGFnaW5nJyxcbiAgICAgICAgICAgICdyZXBvOmluc2FubzcwL2Jjb3M6ZW52aXJvbm1lbnQ6cHJvZHVjdGlvbicsXG4gICAgICAgICAgICAncmVwbzppbnNhbm83MC9iY29zOnJlZjpyZWZzL2hlYWRzL21haW4nLFxuICAgICAgICAgICAgJ3JlcG86aW5zYW5vNzAvYmNvczpyZWY6cmVmcy9oZWFkcy9zdGFnaW5nJyxcbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfVxuICAgICAgKSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnUm9sZSBmb3IgR2l0SHViIEFjdGlvbnMgdG8gZGVwbG95IEJDT1MgYXBwbGljYXRpb24nLFxuICAgICAgbWF4U2Vzc2lvbkR1cmF0aW9uOiBjZGsuRHVyYXRpb24uaG91cnMoMSksXG4gICAgfSk7XG5cbiAgICAvLyBHaXRIdWIgQWN0aW9ucyBEZXBsb3ltZW50IFBvbGljeVxuICAgIHRoaXMuZ2l0aHViQWN0aW9uc1JvbGUuYWRkVG9Qb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIHNpZDogJ0VDUkFjY2VzcycsXG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogWydlY3I6R2V0QXV0aG9yaXphdGlvblRva2VuJ10sXG4gICAgICAgIHJlc291cmNlczogWycqJ10sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICB0aGlzLmdpdGh1YkFjdGlvbnNSb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBzaWQ6ICdFQ1JSZXBvc2l0b3J5JyxcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgJ2VjcjpCYXRjaENoZWNrTGF5ZXJBdmFpbGFiaWxpdHknLFxuICAgICAgICAgICdlY3I6R2V0RG93bmxvYWRVcmxGb3JMYXllcicsXG4gICAgICAgICAgJ2VjcjpCYXRjaEdldEltYWdlJyxcbiAgICAgICAgICAnZWNyOkluaXRpYXRlTGF5ZXJVcGxvYWQnLFxuICAgICAgICAgICdlY3I6VXBsb2FkTGF5ZXJQYXJ0JyxcbiAgICAgICAgICAnZWNyOkNvbXBsZXRlTGF5ZXJVcGxvYWQnLFxuICAgICAgICAgICdlY3I6UHV0SW1hZ2UnLFxuICAgICAgICAgICdlY3I6RGVzY3JpYmVJbWFnZXMnLFxuICAgICAgICBdLFxuICAgICAgICByZXNvdXJjZXM6IFt0aGlzLmVjclJlcG9zaXRvcnkucmVwb3NpdG9yeUFybl0sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICB0aGlzLmdpdGh1YkFjdGlvbnNSb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBzaWQ6ICdFQ1NBY2Nlc3MnLFxuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAnZWNzOkNyZWF0ZVNlcnZpY2UnLFxuICAgICAgICAgICdlY3M6VXBkYXRlU2VydmljZScsXG4gICAgICAgICAgJ2VjczpEZXNjcmliZVNlcnZpY2VzJyxcbiAgICAgICAgICAnZWNzOlJlZ2lzdGVyVGFza0RlZmluaXRpb24nLFxuICAgICAgICBdLFxuICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICBgYXJuOmF3czplY3M6dXMtZWFzdC0xOiR7dGhpcy5hY2NvdW50fTpjbHVzdGVyL2Jjb3MtKi1jbHVzdGVyYCxcbiAgICAgICAgICBgYXJuOmF3czplY3M6dXMtZWFzdC0xOiR7dGhpcy5hY2NvdW50fTpzZXJ2aWNlL2Jjb3MtKi1jbHVzdGVyL2Jjb3MtKi1zZXJ2aWNlYCxcbiAgICAgICAgICBgYXJuOmF3czplY3M6dXMtZWFzdC0xOiR7dGhpcy5hY2NvdW50fTp0YXNrLWRlZmluaXRpb24vYmNvcy0qYCxcbiAgICAgICAgXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIERlc2NyaWJlVGFza0RlZmluaXRpb24gcmVxdWlyZXMgKiByZXNvdXJjZVxuICAgIHRoaXMuZ2l0aHViQWN0aW9uc1JvbGUuYWRkVG9Qb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIHNpZDogJ0VDU0Rlc2NyaWJlVGFza0RlZmluaXRpb24nLFxuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFsnZWNzOkRlc2NyaWJlVGFza0RlZmluaXRpb24nXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbJyonXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIENsb3VkV2F0Y2ggTG9ncyBhY2Nlc3MgZm9yIEVDUyBzZXJ2aWNlIGNyZWF0aW9uIGFuZCBtYW5hZ2VtZW50XG4gICAgdGhpcy5naXRodWJBY3Rpb25zUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgc2lkOiAnQ2xvdWRXYXRjaExvZ3NBY2Nlc3MnLFxuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAnbG9nczpDcmVhdGVMb2dHcm91cCcsXG4gICAgICAgICAgJ2xvZ3M6UHV0UmV0ZW50aW9uUG9saWN5JyxcbiAgICAgICAgICAnbG9nczpUYWdMb2dHcm91cCcsXG4gICAgICAgIF0sXG4gICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgIGBhcm46YXdzOmxvZ3M6dXMtZWFzdC0xOiR7dGhpcy5hY2NvdW50fTpsb2ctZ3JvdXA6L2Vjcy9iY29zLSpgLFxuICAgICAgICAgIGBhcm46YXdzOmxvZ3M6dXMtZWFzdC0xOiR7dGhpcy5hY2NvdW50fTpsb2ctZ3JvdXA6L2Vjcy9iY29zLSo6KmAsXG4gICAgICAgIF0sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyBEZXNjcmliZUxvZ0dyb3VwcyByZXF1aXJlcyBicm9hZGVyIHBlcm1pc3Npb25zXG4gICAgdGhpcy5naXRodWJBY3Rpb25zUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgc2lkOiAnQ2xvdWRXYXRjaExvZ3NEZXNjcmliZScsXG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICdsb2dzOkRlc2NyaWJlTG9nR3JvdXBzJyxcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbJyonXSwgLy8gRGVzY3JpYmVMb2dHcm91cHMgcmVxdWlyZXMgKiByZXNvdXJjZVxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gU1NNIHBlcm1pc3Npb25zIGZvciBDREsgYm9vdHN0cmFwIHZlcnNpb24gY2hlY2tpbmdcbiAgICB0aGlzLmdpdGh1YkFjdGlvbnNSb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBzaWQ6ICdTU01Cb290c3RyYXBBY2Nlc3MnLFxuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAnc3NtOkdldFBhcmFtZXRlcicsXG4gICAgICAgICAgJ3NzbTpHZXRQYXJhbWV0ZXJzJyxcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgYGFybjphd3M6c3NtOnVzLWVhc3QtMToke3RoaXMuYWNjb3VudH06cGFyYW1ldGVyL2Nkay1ib290c3RyYXAvJHtjZGtCb290c3RyYXBRdWFsaWZpZXJ9LypgLFxuICAgICAgICBdLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gQ0RLIGJvb3RzdHJhcCBwZXJtaXNzaW9ucyBmb3IgYXNzZXQgcHVibGlzaGluZyBhbmQgZGVwbG95bWVudFxuICAgIHRoaXMuZ2l0aHViQWN0aW9uc1JvbGUuYWRkVG9Qb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIHNpZDogJ0NES0Jvb3RzdHJhcEFzc3VtZVJvbGVzJyxcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgJ3N0czpBc3N1bWVSb2xlJyxcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgYGFybjphd3M6aWFtOjoke3RoaXMuYWNjb3VudH06cm9sZS9jZGstJHtjZGtCb290c3RyYXBRdWFsaWZpZXJ9LWRlcGxveS1yb2xlLSR7dGhpcy5hY2NvdW50fS11cy1lYXN0LTFgLFxuICAgICAgICAgIGBhcm46YXdzOmlhbTo6JHt0aGlzLmFjY291bnR9OnJvbGUvY2RrLSR7Y2RrQm9vdHN0cmFwUXVhbGlmaWVyfS1maWxlLXB1Ymxpc2hpbmctcm9sZS0ke3RoaXMuYWNjb3VudH0tdXMtZWFzdC0xYCxcbiAgICAgICAgICBgYXJuOmF3czppYW06OiR7dGhpcy5hY2NvdW50fTpyb2xlL2Nkay0ke2Nka0Jvb3RzdHJhcFF1YWxpZmllcn0tbG9va3VwLXJvbGUtJHt0aGlzLmFjY291bnR9LXVzLWVhc3QtMWAsXG4gICAgICAgIF0sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyBDREsgYXNzZXRzIGJ1Y2tldCBhY2Nlc3NcbiAgICB0aGlzLmdpdGh1YkFjdGlvbnNSb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBzaWQ6ICdDREtBc3NldHNCdWNrZXRBY2Nlc3MnLFxuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAnczM6R2V0T2JqZWN0JyxcbiAgICAgICAgICAnczM6UHV0T2JqZWN0JyxcbiAgICAgICAgICAnczM6R2V0QnVja2V0TG9jYXRpb24nLFxuICAgICAgICAgICdzMzpMaXN0QnVja2V0JyxcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgYGFybjphd3M6czM6OjpjZGstJHtjZGtCb290c3RyYXBRdWFsaWZpZXJ9LWFzc2V0cy0ke3RoaXMuYWNjb3VudH0tdXMtZWFzdC0xYCxcbiAgICAgICAgICBgYXJuOmF3czpzMzo6OmNkay0ke2Nka0Jvb3RzdHJhcFF1YWxpZmllcn0tYXNzZXRzLSR7dGhpcy5hY2NvdW50fS11cy1lYXN0LTEvKmAsXG4gICAgICAgIF0sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyBDbG91ZEZvcm1hdGlvbiBwZXJtaXNzaW9ucyBmb3IgQ0RLIHN0YWNrIG9wZXJhdGlvbnNcbiAgICB0aGlzLmdpdGh1YkFjdGlvbnNSb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBzaWQ6ICdDbG91ZEZvcm1hdGlvbkFjY2VzcycsXG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICdjbG91ZGZvcm1hdGlvbjpDcmVhdGVTdGFjaycsXG4gICAgICAgICAgJ2Nsb3VkZm9ybWF0aW9uOlVwZGF0ZVN0YWNrJyxcbiAgICAgICAgICAnY2xvdWRmb3JtYXRpb246RGVsZXRlU3RhY2snLFxuICAgICAgICAgICdjbG91ZGZvcm1hdGlvbjpEZXNjcmliZVN0YWNrcycsXG4gICAgICAgICAgJ2Nsb3VkZm9ybWF0aW9uOkRlc2NyaWJlU3RhY2tFdmVudHMnLFxuICAgICAgICAgICdjbG91ZGZvcm1hdGlvbjpEZXNjcmliZVN0YWNrUmVzb3VyY2VzJyxcbiAgICAgICAgICAnY2xvdWRmb3JtYXRpb246R2V0VGVtcGxhdGUnLFxuICAgICAgICAgICdjbG91ZGZvcm1hdGlvbjpMaXN0U3RhY2tSZXNvdXJjZXMnLFxuICAgICAgICAgICdjbG91ZGZvcm1hdGlvbjpDcmVhdGVDaGFuZ2VTZXQnLFxuICAgICAgICAgICdjbG91ZGZvcm1hdGlvbjpFeGVjdXRlQ2hhbmdlU2V0JyxcbiAgICAgICAgICAnY2xvdWRmb3JtYXRpb246RGVzY3JpYmVDaGFuZ2VTZXQnLFxuICAgICAgICAgICdjbG91ZGZvcm1hdGlvbjpEZWxldGVDaGFuZ2VTZXQnLFxuICAgICAgICAgICdjbG91ZGZvcm1hdGlvbjpMaXN0Q2hhbmdlU2V0cycsXG4gICAgICAgICAgJ2Nsb3VkZm9ybWF0aW9uOkdldFN0YWNrUG9saWN5JyxcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgYGFybjphd3M6Y2xvdWRmb3JtYXRpb246dXMtZWFzdC0xOiR7dGhpcy5hY2NvdW50fTpzdGFjay9CQ09TLSovKmAsXG4gICAgICAgIF0sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyBFQ1MgVGFzayBFeGVjdXRpb24gUm9sZSAoZm9yIEFXUyBzZXJ2aWNlIGNhbGxzKVxuICAgIHRoaXMuZWNzVGFza0V4ZWN1dGlvblJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ0VDU1Rhc2tFeGVjdXRpb25Sb2xlJywge1xuICAgICAgcm9sZU5hbWU6ICdCQ09TLUVDU1Rhc2tFeGVjdXRpb25Sb2xlJyxcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdlY3MtdGFza3MuYW1hem9uYXdzLmNvbScpLFxuICAgICAgbWFuYWdlZFBvbGljaWVzOiBbXG4gICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnc2VydmljZS1yb2xlL0FtYXpvbkVDU1Rhc2tFeGVjdXRpb25Sb2xlUG9saWN5JyksXG4gICAgICBdLFxuICAgICAgZGVzY3JpcHRpb246ICdFQ1MgVGFzayBFeGVjdXRpb24gUm9sZSBmb3IgQkNPUyBhcHBsaWNhdGlvbicsXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgS01TIHBlcm1pc3Npb25zIHRvIGV4ZWN1dGlvbiByb2xlXG4gICAgdGhpcy5lY3NUYXNrRXhlY3V0aW9uUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbJ2ttczpEZWNyeXB0JywgJ2ttczpEZXNjcmliZUtleSddLFxuICAgICAgICByZXNvdXJjZXM6IFt0aGlzLmttc0tleS5rZXlBcm5dLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gRUNTIFRhc2sgUm9sZSAoZm9yIGFwcGxpY2F0aW9uIHJ1bnRpbWUgcGVybWlzc2lvbnMpXG4gICAgdGhpcy5lY3NUYXNrUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnRUNTVGFza1JvbGUnLCB7XG4gICAgICByb2xlTmFtZTogJ0JDT1MtRUNTVGFza1JvbGUnLFxuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2Vjcy10YXNrcy5hbWF6b25hd3MuY29tJyksXG4gICAgICBkZXNjcmlwdGlvbjogJ0VDUyBUYXNrIFJvbGUgZm9yIEJDT1MgYXBwbGljYXRpb24gcnVudGltZSBwZXJtaXNzaW9ucycsXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgU2VjcmV0cyBNYW5hZ2VyIHNlY3JldHNcbiAgICB0aGlzLnByb2R1Y3Rpb25TZWNyZXQgPSBuZXcgc2VjcmV0c21hbmFnZXIuU2VjcmV0KHRoaXMsICdQcm9kdWN0aW9uU2VjcmV0cycsIHtcbiAgICAgIHNlY3JldE5hbWU6ICdwcm9kdWN0aW9uL2Jjb3Mtc2VjcmV0cycsXG4gICAgICBkZXNjcmlwdGlvbjogJ1Byb2R1Y3Rpb24gc2VjcmV0cyBmb3IgQkNPUyBhcHBsaWNhdGlvbicsXG4gICAgICBlbmNyeXB0aW9uS2V5OiB0aGlzLmttc0tleSxcbiAgICAgIGdlbmVyYXRlU2VjcmV0U3RyaW5nOiB7XG4gICAgICAgIHNlY3JldFN0cmluZ1RlbXBsYXRlOiBKU09OLnN0cmluZ2lmeSh7IFxuICAgICAgICAgIE5PREVfRU5WOiAncHJvZHVjdGlvbicsXG4gICAgICAgICAgUE9SVDogJzMwMDAnXG4gICAgICAgIH0pLFxuICAgICAgICBnZW5lcmF0ZVN0cmluZ0tleTogJ0pXVF9TRUNSRVQnLFxuICAgICAgICBleGNsdWRlQ2hhcmFjdGVyczogJ1wiQC9cXFxcJyxcbiAgICAgICAgaW5jbHVkZVNwYWNlOiBmYWxzZSxcbiAgICAgICAgcGFzc3dvcmRMZW5ndGg6IDY0LFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIHRoaXMuc3RhZ2luZ1NlY3JldCA9IG5ldyBzZWNyZXRzbWFuYWdlci5TZWNyZXQodGhpcywgJ1N0YWdpbmdTZWNyZXRzJywge1xuICAgICAgc2VjcmV0TmFtZTogJ3N0YWdpbmcvYmNvcy1zZWNyZXRzJyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU3RhZ2luZyBzZWNyZXRzIGZvciBCQ09TIGFwcGxpY2F0aW9uJyxcbiAgICAgIGVuY3J5cHRpb25LZXk6IHRoaXMua21zS2V5LFxuICAgICAgZ2VuZXJhdGVTZWNyZXRTdHJpbmc6IHtcbiAgICAgICAgc2VjcmV0U3RyaW5nVGVtcGxhdGU6IEpTT04uc3RyaW5naWZ5KHsgXG4gICAgICAgICAgTk9ERV9FTlY6ICdwcm9kdWN0aW9uJyxcbiAgICAgICAgICBQT1JUOiAnMzAwMCdcbiAgICAgICAgfSksXG4gICAgICAgIGdlbmVyYXRlU3RyaW5nS2V5OiAnSldUX1NFQ1JFVCcsXG4gICAgICAgIGV4Y2x1ZGVDaGFyYWN0ZXJzOiAnXCJAL1xcXFwnLFxuICAgICAgICBpbmNsdWRlU3BhY2U6IGZhbHNlLFxuICAgICAgICBwYXNzd29yZExlbmd0aDogNjQsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gR3JhbnQgc2VjcmV0cyBhY2Nlc3MgdG8gdGFzayByb2xlXG4gICAgdGhpcy5wcm9kdWN0aW9uU2VjcmV0LmdyYW50UmVhZCh0aGlzLmVjc1Rhc2tSb2xlKTtcbiAgICB0aGlzLnN0YWdpbmdTZWNyZXQuZ3JhbnRSZWFkKHRoaXMuZWNzVGFza1JvbGUpO1xuXG4gICAgLy8gR3JhbnQgc2VjcmV0cyBhY2Nlc3MgdG8gdGFzayBleGVjdXRpb24gcm9sZSAoZm9yIHB1bGxpbmcgc2VjcmV0cylcbiAgICB0aGlzLnByb2R1Y3Rpb25TZWNyZXQuZ3JhbnRSZWFkKHRoaXMuZWNzVGFza0V4ZWN1dGlvblJvbGUpO1xuICAgIHRoaXMuc3RhZ2luZ1NlY3JldC5ncmFudFJlYWQodGhpcy5lY3NUYXNrRXhlY3V0aW9uUm9sZSk7XG5cbiAgICAvLyBHcmFudCBHaXRIdWIgQWN0aW9ucyByZWFkIGFjY2VzcyB0byBzZWNyZXRzIChmb3IgVlBDIGVuZHBvaW50IHdhcm11cClcbiAgICB0aGlzLmdpdGh1YkFjdGlvbnNSb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBzaWQ6ICdTZWNyZXRzTWFuYWdlckRlc2NyaWJlJyxcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgJ3NlY3JldHNtYW5hZ2VyOkRlc2NyaWJlU2VjcmV0JyxcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgdGhpcy5wcm9kdWN0aW9uU2VjcmV0LnNlY3JldEFybixcbiAgICAgICAgICB0aGlzLnN0YWdpbmdTZWNyZXQuc2VjcmV0QXJuLFxuICAgICAgICBdLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gQWxsb3cgR2l0SHViIEFjdGlvbnMgdG8gcGFzcyBFQ1Mgcm9sZXNcbiAgICB0aGlzLmdpdGh1YkFjdGlvbnNSb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBzaWQ6ICdQYXNzUm9sZScsXG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogWydpYW06UGFzc1JvbGUnXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgdGhpcy5lY3NUYXNrRXhlY3V0aW9uUm9sZS5yb2xlQXJuLFxuICAgICAgICAgIHRoaXMuZWNzVGFza1JvbGUucm9sZUFybixcbiAgICAgICAgXSxcbiAgICAgICAgY29uZGl0aW9uczoge1xuICAgICAgICAgIFN0cmluZ0VxdWFsczoge1xuICAgICAgICAgICAgJ2lhbTpQYXNzZWRUb1NlcnZpY2UnOiAnZWNzLXRhc2tzLmFtYXpvbmF3cy5jb20nLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyBTdGFjayBvdXRwdXRzIGZvciBjcm9zcy1zdGFjayByZWZlcmVuY2VzXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0tNU0tleUlkJywge1xuICAgICAgdmFsdWU6IHRoaXMua21zS2V5LmtleUlkLFxuICAgICAgZGVzY3JpcHRpb246ICdLTVMgS2V5IElEIGZvciBCQ09TIGVuY3J5cHRpb24nLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0tNU0tleUFybicsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmttc0tleS5rZXlBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ0tNUyBLZXkgQVJOIGZvciBCQ09TIGVuY3J5cHRpb24nLFxuICAgICAgZXhwb3J0TmFtZTogJ0JDT1MtS01TLUtleS1Bcm4nLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0VDUlJlcG9zaXRvcnlOYW1lJywge1xuICAgICAgdmFsdWU6IHRoaXMuZWNyUmVwb3NpdG9yeS5yZXBvc2l0b3J5TmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRUNSIFJlcG9zaXRvcnkgbmFtZSBmb3IgQkNPUyBjb250YWluZXIgaW1hZ2VzJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdFQ1JSZXBvc2l0b3J5QXJuJywge1xuICAgICAgdmFsdWU6IHRoaXMuZWNyUmVwb3NpdG9yeS5yZXBvc2l0b3J5QXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdFQ1IgUmVwb3NpdG9yeSBBUk4gZm9yIEJDT1MgY29udGFpbmVyIGltYWdlcycsXG4gICAgICBleHBvcnROYW1lOiAnQkNPUy1FQ1JSZXBvc2l0b3J5LUFybicsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRUNTVGFza0V4ZWN1dGlvblJvbGVBcm4nLCB7XG4gICAgICB2YWx1ZTogdGhpcy5lY3NUYXNrRXhlY3V0aW9uUm9sZS5yb2xlQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdFQ1MgVGFzayBFeGVjdXRpb24gUm9sZSBBUk4nLFxuICAgICAgZXhwb3J0TmFtZTogJ0JDT1MtRUNTVGFza0V4ZWN1dGlvblJvbGUtQXJuJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdFQ1NUYXNrUm9sZUFybicsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmVjc1Rhc2tSb2xlLnJvbGVBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ0VDUyBUYXNrIFJvbGUgQVJOJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdCQ09TLUVDU1Rhc2tSb2xlLUFybicsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnUHJvZHVjdGlvblNlY3JldEFybicsIHtcbiAgICAgIHZhbHVlOiB0aGlzLnByb2R1Y3Rpb25TZWNyZXQuc2VjcmV0QXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdQcm9kdWN0aW9uIFNlY3JldCBBUk4nLFxuICAgICAgZXhwb3J0TmFtZTogJ0JDT1MtUHJvZHVjdGlvblNlY3JldC1Bcm4nLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1N0YWdpbmdTZWNyZXRBcm4nLCB7XG4gICAgICB2YWx1ZTogdGhpcy5zdGFnaW5nU2VjcmV0LnNlY3JldEFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnU3RhZ2luZyBTZWNyZXQgQVJOJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdCQ09TLVN0YWdpbmdTZWNyZXQtQXJuJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdHaXRIdWJBY3Rpb25zUm9sZU91dHB1dCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmdpdGh1YkFjdGlvbnNSb2xlLnJvbGVBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ0dpdEh1YiBBY3Rpb25zIFJvbGUgQVJOIGZvciBDSS9DRCcsXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==