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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VjdXJpdHktc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJzZWN1cml0eS1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMseURBQTJDO0FBQzNDLHlEQUEyQztBQUMzQyx5REFBMkM7QUFDM0MsK0VBQWlFO0FBR2pFLE1BQWEsYUFBYyxTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQzFCLE1BQU0sQ0FBVTtJQUNoQixpQkFBaUIsQ0FBVztJQUM1QixvQkFBb0IsQ0FBVztJQUMvQixXQUFXLENBQVc7SUFDdEIsYUFBYSxDQUFpQjtJQUM5QixnQkFBZ0IsQ0FBd0I7SUFDeEMsYUFBYSxDQUF3QjtJQUVyRCxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQXNCO1FBQzlELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLDBEQUEwRDtRQUMxRCxNQUFNLHFCQUFxQixHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLG9CQUFvQixDQUFDLElBQUksV0FBVyxDQUFDO1FBRTNGLGdDQUFnQztRQUNoQyxJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsbUJBQW1CLEVBQUU7WUFDbkQsV0FBVyxFQUFFLGdEQUFnRDtZQUM3RCxpQkFBaUIsRUFBRSxJQUFJO1lBQ3ZCLEtBQUssRUFBRSxpQkFBaUI7WUFDeEIsYUFBYSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsTUFBTTtZQUN2QyxNQUFNLEVBQUUsSUFBSSxHQUFHLENBQUMsY0FBYyxDQUFDO2dCQUM3QixVQUFVLEVBQUU7b0JBQ1YsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDO3dCQUN0QixHQUFHLEVBQUUsNkJBQTZCO3dCQUNsQyxNQUFNLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxLQUFL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QUFJLEVBQUUscUJBQXFCLEVBQUU7WUFDN0MsS0FBSyxFQUFFLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxTQUFTO1lBQ3RDLFdBQVcsRUFBRSx1QkFBdUI7WUFDcEMsVUFBVSxFQUFFLDJCQUEyQjtTQUN4QyxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGtCQUFrQixFQUFFO1lBQzFDLEtBQUssRUFBRSxJQUFJLENBQUMsYUFBYSxDQUFDLFNBQVM7WUFDbkMsV0FBVyxFQUFFLG9CQUFvQjtZQUNqQyxVQUFVLEVBQUUsd0JBQXdCO1NBQ3JDLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUseUJBQXlCLEVBQUU7WUFDakQsS0FBSyxFQUFFLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxPQUFPO1lBQ3JDLFdBQVcsRUFBRSxtQ0FBbUM7U0FDakQsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBOVpELHNDQThaQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgKiBhcyBrbXMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWttcyc7XG5pbXBvcnQgKiBhcyBlY3IgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVjcic7XG5pbXBvcnQgKiBhcyBzZWNyZXRzbWFuYWdlciBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc2VjcmV0c21hbmFnZXInO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5cbmV4cG9ydCBjbGFzcyBTZWN1cml0eVN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgcHVibGljIHJlYWRvbmx5IGttc0tleToga21zLktleTtcbiAgcHVibGljIHJlYWRvbmx5IGdpdGh1YkFjdGlvbnNSb2xlOiBpYW0uUm9sZTtcbiAgcHVibGljIHJlYWRvbmx5IGVjc1Rhc2tFeGVjdXRpb25Sb2xlOiBpYW0uUm9sZTtcbiAgcHVibGljIHJlYWRvbmx5IGVjc1Rhc2tSb2xlOiBpYW0uUm9sZTtcbiAgcHVibGljIHJlYWRvbmx5IGVjclJlcG9zaXRvcnk6IGVjci5SZXBvc2l0b3J5O1xuICBwdWJsaWMgcmVhZG9ubHkgcHJvZHVjdGlvblNlY3JldDogc2VjcmV0c21hbmFnZXIuU2VjcmV0O1xuICBwdWJsaWMgcmVhZG9ubHkgc3RhZ2luZ1NlY3JldDogc2VjcmV0c21hbmFnZXIuU2VjcmV0O1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzPzogY2RrLlN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIC8vIEdldCBDREsgYm9vdHN0cmFwIHF1YWxpZmllciBmcm9tIGNvbnRleHQgb3IgdXNlIGRlZmF1bHRcbiAgICBjb25zdCBjZGtCb290c3RyYXBRdWFsaWZpZXIgPSB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgnYm9vdHN0cmFwUXVhbGlmaWVyJykgfHwgJ2huYjY1OWZkcyc7XG5cbiAgICAvLyBDcmVhdGUgS01TIGtleSBmb3IgZW5jcnlwdGlvblxuICAgIHRoaXMua21zS2V5ID0gbmV3IGttcy5LZXkodGhpcywgJ0JDT1NFbmNyeXB0aW9uS2V5Jywge1xuICAgICAgZGVzY3JpcHRpb246ICdCQ09TIGVuY3J5cHRpb24ga2V5IGZvciBsb2dzLCBzZWNyZXRzLCBhbmQgRUNSJyxcbiAgICAgIGVuYWJsZUtleVJvdGF0aW9uOiB0cnVlLFxuICAgICAgYWxpYXM6ICdiY29zLWVuY3J5cHRpb24nLFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxuICAgICAgcG9saWN5OiBuZXcgaWFtLlBvbGljeURvY3VtZW50KHtcbiAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgIHNpZDogJ0VuYWJsZSBJQU0gVXNlciBQZXJtaXNzaW9ucycsXG4gICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICBwcmluY2lwYWxzOiBbbmV3IGlhbS5BY2NvdW50Um9vdFByaW5jaXBhbCgpXSxcbiAgICAgICAgICAgIGFjdGlvbnM6IFsna21zOionXSxcbiAgICAgICAgICAgIHJlc291cmNlczogWycqJ10sXG4gICAgICAgICAgfSksXG4gICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgc2lkOiAnQWxsb3cgQ2xvdWRXYXRjaCBMb2dzJyxcbiAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgIHByaW5jaXBhbHM6IFtcbiAgICAgICAgICAgICAgbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdsb2dzLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICdrbXM6RW5jcnlwdCcsXG4gICAgICAgICAgICAgICdrbXM6RGVjcnlwdCcsXG4gICAgICAgICAgICAgICdrbXM6UmVFbmNyeXB0KicsXG4gICAgICAgICAgICAgICdrbXM6R2VuZXJhdGVEYXRhS2V5KicsXG4gICAgICAgICAgICAgICdrbXM6RGVzY3JpYmVLZXknLFxuICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIHJlc291cmNlczogWycqJ10sXG4gICAgICAgICAgfSksXG4gICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgc2lkOiAnQWxsb3cgRUNSIFNlcnZpY2UnLFxuICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgcHJpbmNpcGFsczogW25ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnZWNyLmFtYXpvbmF3cy5jb20nKV0sXG4gICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICdrbXM6RGVjcnlwdCcsXG4gICAgICAgICAgICAgICdrbXM6RGVzY3JpYmVLZXknLFxuICAgICAgICAgICAgICAna21zOkdlbmVyYXRlRGF0YUtleScsXG4gICAgICAgICAgICBdLFxuICAgICAgICAgICAgcmVzb3VyY2VzOiBbJyonXSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgXSxcbiAgICAgIH0pLFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIEVDUiByZXBvc2l0b3J5XG4gICAgdGhpcy5lY3JSZXBvc2l0b3J5ID0gbmV3IGVjci5SZXBvc2l0b3J5KHRoaXMsICdCQ09TUmVwb3NpdG9yeScsIHtcbiAgICAgIHJlcG9zaXRvcnlOYW1lOiAnYmNvcycsXG4gICAgICBpbWFnZVNjYW5PblB1c2g6IHRydWUsXG4gICAgICBpbWFnZVRhZ011dGFiaWxpdHk6IGVjci5UYWdNdXRhYmlsaXR5Lk1VVEFCTEUsXG4gICAgICBlbmNyeXB0aW9uS2V5OiB0aGlzLmttc0tleSxcbiAgICAgIGxpZmVjeWNsZVJ1bGVzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogJ0tlZXAgbGFzdCAxMCBwcm9kdWN0aW9uIGltYWdlcycsXG4gICAgICAgICAgbWF4SW1hZ2VDb3VudDogMTAsXG4gICAgICAgICAgdGFnUHJlZml4TGlzdDogWyd2JywgJ3JlbGVhc2UnXSxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnS2VlcCBsYXN0IDUgc3RhZ2luZyBpbWFnZXMnLFxuICAgICAgICAgIG1heEltYWdlQ291bnQ6IDUsXG4gICAgICAgICAgdGFnUHJlZml4TGlzdDogWydzdGFnaW5nJ10sXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogJ0RlbGV0ZSB1bnRhZ2dlZCBpbWFnZXMgYWZ0ZXIgNyBkYXlzJyxcbiAgICAgICAgICBtYXhJbWFnZUFnZTogY2RrLkR1cmF0aW9uLmRheXMoNyksXG4gICAgICAgICAgdGFnU3RhdHVzOiBlY3IuVGFnU3RhdHVzLlVOVEFHR0VELFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vIEdpdEh1YiBPSURDIFByb3ZpZGVyXG4gICAgY29uc3QgZ2l0aHViT2lkY1Byb3ZpZGVyID0gbmV3IGlhbS5PcGVuSWRDb25uZWN0UHJvdmlkZXIodGhpcywgJ0dpdEh1Yk9pZGNQcm92aWRlcicsIHtcbiAgICAgIHVybDogJ2h0dHBzOi8vdG9rZW4uYWN0aW9ucy5naXRodWJ1c2VyY29udGVudC5jb20nLFxuICAgICAgY2xpZW50SWRzOiBbJ3N0cy5hbWF6b25hd3MuY29tJ10sXG4gICAgICB0aHVtYnByaW50czogWyc2OTM4ZmQ0ZDk4YmFiMDNmYWFkYjk3YjM0Mzk2ODMxZTM3ODBhZWExJ10sXG4gICAgfSk7XG5cbiAgICAvLyBHaXRIdWIgQWN0aW9ucyBSb2xlXG4gICAgdGhpcy5naXRodWJBY3Rpb25zUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnR2l0SHViQWN0aW9uc1JvbGUnLCB7XG4gICAgICByb2xlTmFtZTogJ0JDT1MtR2l0SHViQWN0aW9uc0RlcGxveW1lbnRSb2xlJyxcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5XZWJJZGVudGl0eVByaW5jaXBhbChcbiAgICAgICAgZ2l0aHViT2lkY1Byb3ZpZGVyLm9wZW5JZENvbm5lY3RQcm92aWRlckFybixcbiAgICAgICAge1xuICAgICAgICAgIFN0cmluZ0VxdWFsczoge1xuICAgICAgICAgICAgJ3Rva2VuLmFjdGlvbnMuZ2l0aHVidXNlcmNvbnRlbnQuY29tOmF1ZCc6ICdzdHMuYW1hem9uYXdzLmNvbScsXG4gICAgICAgICAgICAndG9rZW4uYWN0aW9ucy5naXRodWJ1c2VyY29udGVudC5jb206aXNzJzogJ2h0dHBzOi8vdG9rZW4uYWN0aW9ucy5naXRodWJ1c2VyY29udGVudC5jb20nLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgU3RyaW5nTGlrZToge1xuICAgICAgICAgICAgJ3Rva2VuLmFjdGlvbnMuZ2l0aHVidXNlcmNvbnRlbnQuY29tOnN1Yic6IFtcbiAgICAgICAgICAgICdyZXBvOmluc2FubzcwL2Jjb3M6ZW52aXJvbm1lbnQ6c3RhZ2luZycsXG4gICAgICAgICAgICAncmVwbzppbnNhbm83MC9iY29zOmVudmlyb25tZW50OnByb2R1Y3Rpb24nLFxuICAgICAgICAgICAgJ3JlcG86aW5zYW5vNzAvYmNvczpyZWY6cmVmcy9oZWFkcy9tYWluJyxcbiAgICAgICAgICAgICdyZXBvOmluc2FubzcwL2Jjb3M6cmVmOnJlZnMvaGVhZHMvc3RhZ2luZycsXG4gICAgICAgICAgICBdLFxuICAgICAgICAgIH0sXG4gICAgICAgIH1cbiAgICAgICksXG4gICAgICBkZXNjcmlwdGlvbjogJ1JvbGUgZm9yIEdpdEh1YiBBY3Rpb25zIHRvIGRlcGxveSBCQ09TIGFwcGxpY2F0aW9uJyxcbiAgICAgIG1heFNlc3Npb25EdXJhdGlvbjogY2RrLkR1cmF0aW9uLmhvdXJzKDEpLFxuICAgIH0pO1xuXG4gICAgLy8gR2l0SHViIEFjdGlvbnMgRGVwbG95bWVudCBQb2xpY3lcbiAgICB0aGlzLmdpdGh1YkFjdGlvbnNSb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBzaWQ6ICdFQ1JBY2Nlc3MnLFxuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFsnZWNyOkdldEF1dGhvcml6YXRpb25Ub2tlbiddLFxuICAgICAgICByZXNvdXJjZXM6IFsnKiddLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgdGhpcy5naXRodWJBY3Rpb25zUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgc2lkOiAnRUNSUmVwb3NpdG9yeScsXG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICdlY3I6QmF0Y2hDaGVja0xheWVyQXZhaWxhYmlsaXR5JyxcbiAgICAgICAgICAnZWNyOkdldERvd25sb2FkVXJsRm9yTGF5ZXInLFxuICAgICAgICAgICdlY3I6QmF0Y2hHZXRJbWFnZScsXG4gICAgICAgICAgJ2VjcjpJbml0aWF0ZUxheWVyVXBsb2FkJyxcbiAgICAgICAgICAnZWNyOlVwbG9hZExheWVyUGFydCcsXG4gICAgICAgICAgJ2VjcjpDb21wbGV0ZUxheWVyVXBsb2FkJyxcbiAgICAgICAgICAnZWNyOlB1dEltYWdlJyxcbiAgICAgICAgICAnZWNyOkRlc2NyaWJlSW1hZ2VzJyxcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbdGhpcy5lY3JSZXBvc2l0b3J5LnJlcG9zaXRvcnlBcm5dLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgdGhpcy5naXRodWJBY3Rpb25zUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgc2lkOiAnRUNTQWNjZXNzJyxcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgJ2VjczpDcmVhdGVTZXJ2aWNlJyxcbiAgICAgICAgICAnZWNzOlVwZGF0ZVNlcnZpY2UnLFxuICAgICAgICAgICdlY3M6RGVzY3JpYmVTZXJ2aWNlcycsXG4gICAgICAgICAgJ2VjczpSZWdpc3RlclRhc2tEZWZpbml0aW9uJyxcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgYGFybjphd3M6ZWNzOnVzLWVhc3QtMToke3RoaXMuYWNjb3VudH06Y2x1c3Rlci9iY29zLSotY2x1c3RlcmAsXG4gICAgICAgICAgYGFybjphd3M6ZWNzOnVzLWVhc3QtMToke3RoaXMuYWNjb3VudH06c2VydmljZS9iY29zLSotY2x1c3Rlci9iY29zLSotc2VydmljZWAsXG4gICAgICAgICAgYGFybjphd3M6ZWNzOnVzLWVhc3QtMToke3RoaXMuYWNjb3VudH06dGFzay1kZWZpbml0aW9uL2Jjb3MtKmAsXG4gICAgICAgIF0sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyBEZXNjcmliZVRhc2tEZWZpbml0aW9uIHJlcXVpcmVzICogcmVzb3VyY2VcbiAgICB0aGlzLmdpdGh1YkFjdGlvbnNSb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBzaWQ6ICdFQ1NEZXNjcmliZVRhc2tEZWZpbml0aW9uJyxcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbJ2VjczpEZXNjcmliZVRhc2tEZWZpbml0aW9uJ10sXG4gICAgICAgIHJlc291cmNlczogWycqJ10sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyBDbG91ZFdhdGNoIExvZ3MgYWNjZXNzIGZvciBFQ1Mgc2VydmljZSBjcmVhdGlvbiBhbmQgbWFuYWdlbWVudFxuICAgIHRoaXMuZ2l0aHViQWN0aW9uc1JvbGUuYWRkVG9Qb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIHNpZDogJ0Nsb3VkV2F0Y2hMb2dzQWNjZXNzJyxcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgJ2xvZ3M6Q3JlYXRlTG9nR3JvdXAnLFxuICAgICAgICAgICdsb2dzOlB1dFJldGVudGlvblBvbGljeScsXG4gICAgICAgICAgJ2xvZ3M6VGFnTG9nR3JvdXAnLFxuICAgICAgICBdLFxuICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICBgYXJuOmF3czpsb2dzOnVzLWVhc3QtMToke3RoaXMuYWNjb3VudH06bG9nLWdyb3VwOi9lY3MvYmNvcy0qYCxcbiAgICAgICAgICBgYXJuOmF3czpsb2dzOnVzLWVhc3QtMToke3RoaXMuYWNjb3VudH06bG9nLWdyb3VwOi9lY3MvYmNvcy0qOipgLFxuICAgICAgICBdLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gRGVzY3JpYmVMb2dHcm91cHMgcmVxdWlyZXMgYnJvYWRlciBwZXJtaXNzaW9uc1xuICAgIHRoaXMuZ2l0aHViQWN0aW9uc1JvbGUuYWRkVG9Qb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIHNpZDogJ0Nsb3VkV2F0Y2hMb2dzRGVzY3JpYmUnLFxuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAnbG9nczpEZXNjcmliZUxvZ0dyb3VwcycsXG4gICAgICAgIF0sXG4gICAgICAgIHJlc291cmNlczogWycqJ10sIC8vIERlc2NyaWJlTG9nR3JvdXBzIHJlcXVpcmVzICogcmVzb3VyY2VcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIFNTTSBwZXJtaXNzaW9ucyBmb3IgQ0RLIGJvb3RzdHJhcCB2ZXJzaW9uIGNoZWNraW5nXG4gICAgdGhpcy5naXRodWJBY3Rpb25zUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgc2lkOiAnU1NNQm9vdHN0cmFwQWNjZXNzJyxcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgJ3NzbTpHZXRQYXJhbWV0ZXInLFxuICAgICAgICAgICdzc206R2V0UGFyYW1ldGVycycsXG4gICAgICAgIF0sXG4gICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgIGBhcm46YXdzOnNzbTp1cy1lYXN0LTE6JHt0aGlzLmFjY291bnR9OnBhcmFtZXRlci9jZGstYm9vdHN0cmFwLyR7Y2RrQm9vdHN0cmFwUXVhbGlmaWVyfS8qYCxcbiAgICAgICAgXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIENESyBib290c3RyYXAgcGVybWlzc2lvbnMgZm9yIGFzc2V0IHB1Ymxpc2hpbmcgYW5kIGRlcGxveW1lbnRcbiAgICB0aGlzLmdpdGh1YkFjdGlvbnNSb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBzaWQ6ICdDREtCb290c3RyYXBBc3N1bWVSb2xlcycsXG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICdzdHM6QXNzdW1lUm9sZScsXG4gICAgICAgIF0sXG4gICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgIGBhcm46YXdzOmlhbTo6JHt0aGlzLmFjY291bnR9OnJvbGUvY2RrLSR7Y2RrQm9vdHN0cmFwUXVhbGlmaWVyfS1kZXBsb3ktcm9sZS0ke3RoaXMuYWNjb3VudH0tdXMtZWFzdC0xYCxcbiAgICAgICAgICBgYXJuOmF3czppYW06OiR7dGhpcy5hY2NvdW50fTpyb2xlL2Nkay0ke2Nka0Jvb3RzdHJhcFF1YWxpZmllcn0tZmlsZS1wdWJsaXNoaW5nLXJvbGUtJHt0aGlzLmFjY291bnR9LXVzLWVhc3QtMWAsXG4gICAgICAgICAgYGFybjphd3M6aWFtOjoke3RoaXMuYWNjb3VudH06cm9sZS9jZGstJHtjZGtCb290c3RyYXBRdWFsaWZpZXJ9LWxvb2t1cC1yb2xlLSR7dGhpcy5hY2NvdW50fS11cy1lYXN0LTFgLFxuICAgICAgICBdLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gQ0RLIGFzc2V0cyBidWNrZXQgYWNjZXNzXG4gICAgdGhpcy5naXRodWJBY3Rpb25zUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgc2lkOiAnQ0RLQXNzZXRzQnVja2V0QWNjZXNzJyxcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgJ3MzOkdldE9iamVjdCcsXG4gICAgICAgICAgJ3MzOlB1dE9iamVjdCcsXG4gICAgICAgICAgJ3MzOkdldEJ1Y2tldExvY2F0aW9uJyxcbiAgICAgICAgICAnczM6TGlzdEJ1Y2tldCcsXG4gICAgICAgIF0sXG4gICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgIGBhcm46YXdzOnMzOjo6Y2RrLSR7Y2RrQm9vdHN0cmFwUXVhbGlmaWVyfS1hc3NldHMtJHt0aGlzLmFjY291bnR9LXVzLWVhc3QtMWAsXG4gICAgICAgICAgYGFybjphd3M6czM6OjpjZGstJHtjZGtCb290c3RyYXBRdWFsaWZpZXJ9LWFzc2V0cy0ke3RoaXMuYWNjb3VudH0tdXMtZWFzdC0xLypgLFxuICAgICAgICBdLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gQ2xvdWRGb3JtYXRpb24gcGVybWlzc2lvbnMgZm9yIENESyBzdGFjayBvcGVyYXRpb25zXG4gICAgdGhpcy5naXRodWJBY3Rpb25zUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgc2lkOiAnQ2xvdWRGb3JtYXRpb25BY2Nlc3MnLFxuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAnY2xvdWRmb3JtYXRpb246Q3JlYXRlU3RhY2snLFxuICAgICAgICAgICdjbG91ZGZvcm1hdGlvbjpVcGRhdGVTdGFjaycsXG4gICAgICAgICAgJ2Nsb3VkZm9ybWF0aW9uOkRlbGV0ZVN0YWNrJyxcbiAgICAgICAgICAnY2xvdWRmb3JtYXRpb246RGVzY3JpYmVTdGFja3MnLFxuICAgICAgICAgICdjbG91ZGZvcm1hdGlvbjpEZXNjcmliZVN0YWNrRXZlbnRzJyxcbiAgICAgICAgICAnY2xvdWRmb3JtYXRpb246RGVzY3JpYmVTdGFja1Jlc291cmNlcycsXG4gICAgICAgICAgJ2Nsb3VkZm9ybWF0aW9uOkdldFRlbXBsYXRlJyxcbiAgICAgICAgICAnY2xvdWRmb3JtYXRpb246TGlzdFN0YWNrUmVzb3VyY2VzJyxcbiAgICAgICAgICAnY2xvdWRmb3JtYXRpb246Q3JlYXRlQ2hhbmdlU2V0JyxcbiAgICAgICAgICAnY2xvdWRmb3JtYXRpb246RXhlY3V0ZUNoYW5nZVNldCcsXG4gICAgICAgICAgJ2Nsb3VkZm9ybWF0aW9uOkRlc2NyaWJlQ2hhbmdlU2V0JyxcbiAgICAgICAgICAnY2xvdWRmb3JtYXRpb246RGVsZXRlQ2hhbmdlU2V0JyxcbiAgICAgICAgICAnY2xvdWRmb3JtYXRpb246TGlzdENoYW5nZVNldHMnLFxuICAgICAgICAgICdjbG91ZGZvcm1hdGlvbjpHZXRTdGFja1BvbGljeScsXG4gICAgICAgIF0sXG4gICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgIGBhcm46YXdzOmNsb3VkZm9ybWF0aW9uOnVzLWVhc3QtMToke3RoaXMuYWNjb3VudH06c3RhY2svQkNPUy0qLypgLFxuICAgICAgICBdLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gRUNTIFRhc2sgRXhlY3V0aW9uIFJvbGUgKGZvciBBV1Mgc2VydmljZSBjYWxscylcbiAgICB0aGlzLmVjc1Rhc2tFeGVjdXRpb25Sb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdFQ1NUYXNrRXhlY3V0aW9uUm9sZScsIHtcbiAgICAgIHJvbGVOYW1lOiAnQkNPUy1FQ1NUYXNrRXhlY3V0aW9uUm9sZScsXG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnZWNzLXRhc2tzLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ3NlcnZpY2Utcm9sZS9BbWF6b25FQ1NUYXNrRXhlY3V0aW9uUm9sZVBvbGljeScpLFxuICAgICAgXSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRUNTIFRhc2sgRXhlY3V0aW9uIFJvbGUgZm9yIEJDT1MgYXBwbGljYXRpb24nLFxuICAgIH0pO1xuXG4gICAgLy8gQWRkIEtNUyBwZXJtaXNzaW9ucyB0byBleGVjdXRpb24gcm9sZVxuICAgIHRoaXMuZWNzVGFza0V4ZWN1dGlvblJvbGUuYWRkVG9Qb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogWydrbXM6RGVjcnlwdCcsICdrbXM6RGVzY3JpYmVLZXknXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbdGhpcy5rbXNLZXkua2V5QXJuXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIEVDUyBUYXNrIFJvbGUgKGZvciBhcHBsaWNhdGlvbiBydW50aW1lIHBlcm1pc3Npb25zKVxuICAgIHRoaXMuZWNzVGFza1JvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ0VDU1Rhc2tSb2xlJywge1xuICAgICAgcm9sZU5hbWU6ICdCQ09TLUVDU1Rhc2tSb2xlJyxcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdlY3MtdGFza3MuYW1hem9uYXdzLmNvbScpLFxuICAgICAgZGVzY3JpcHRpb246ICdFQ1MgVGFzayBSb2xlIGZvciBCQ09TIGFwcGxpY2F0aW9uIHJ1bnRpbWUgcGVybWlzc2lvbnMnLFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIFNlY3JldHMgTWFuYWdlciBzZWNyZXRzXG4gICAgdGhpcy5wcm9kdWN0aW9uU2VjcmV0ID0gbmV3IHNlY3JldHNtYW5hZ2VyLlNlY3JldCh0aGlzLCAnUHJvZHVjdGlvblNlY3JldHMnLCB7XG4gICAgICBzZWNyZXROYW1lOiAncHJvZHVjdGlvbi9iY29zLXNlY3JldHMnLFxuICAgICAgZGVzY3JpcHRpb246ICdQcm9kdWN0aW9uIHNlY3JldHMgZm9yIEJDT1MgYXBwbGljYXRpb24nLFxuICAgICAgZW5jcnlwdGlvbktleTogdGhpcy5rbXNLZXksXG4gICAgICBnZW5lcmF0ZVNlY3JldFN0cmluZzoge1xuICAgICAgICBzZWNyZXRTdHJpbmdUZW1wbGF0ZTogSlNPTi5zdHJpbmdpZnkoeyBcbiAgICAgICAgICBOT0RFX0VOVjogJ3Byb2R1Y3Rpb24nLFxuICAgICAgICAgIFBPUlQ6ICczMDAwJ1xuICAgICAgICB9KSxcbiAgICAgICAgZ2VuZXJhdGVTdHJpbmdLZXk6ICdKV1RfU0VDUkVUJyxcbiAgICAgICAgZXhjbHVkZUNoYXJhY3RlcnM6ICdcIkAvXFxcXCcsXG4gICAgICAgIGluY2x1ZGVTcGFjZTogZmFsc2UsXG4gICAgICAgIHBhc3N3b3JkTGVuZ3RoOiA2NCxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICB0aGlzLnN0YWdpbmdTZWNyZXQgPSBuZXcgc2VjcmV0c21hbmFnZXIuU2VjcmV0KHRoaXMsICdTdGFnaW5nU2VjcmV0cycsIHtcbiAgICAgIHNlY3JldE5hbWU6ICdzdGFnaW5nL2Jjb3Mtc2VjcmV0cycsXG4gICAgICBkZXNjcmlwdGlvbjogJ1N0YWdpbmcgc2VjcmV0cyBmb3IgQkNPUyBhcHBsaWNhdGlvbicsXG4gICAgICBlbmNyeXB0aW9uS2V5OiB0aGlzLmttc0tleSxcbiAgICAgIGdlbmVyYXRlU2VjcmV0U3RyaW5nOiB7XG4gICAgICAgIHNlY3JldFN0cmluZ1RlbXBsYXRlOiBKU09OLnN0cmluZ2lmeSh7IFxuICAgICAgICAgIE5PREVfRU5WOiAncHJvZHVjdGlvbicsXG4gICAgICAgICAgUE9SVDogJzMwMDAnXG4gICAgICAgIH0pLFxuICAgICAgICBnZW5lcmF0ZVN0cmluZ0tleTogJ0pXVF9TRUNSRVQnLFxuICAgICAgICBleGNsdWRlQ2hhcmFjdGVyczogJ1wiQC9cXFxcJyxcbiAgICAgICAgaW5jbHVkZVNwYWNlOiBmYWxzZSxcbiAgICAgICAgcGFzc3dvcmRMZW5ndGg6IDY0LFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIEdyYW50IHNlY3JldHMgYWNjZXNzIHRvIHRhc2sgcm9sZVxuICAgIHRoaXMucHJvZHVjdGlvblNlY3JldC5ncmFudFJlYWQodGhpcy5lY3NUYXNrUm9sZSk7XG4gICAgdGhpcy5zdGFnaW5nU2VjcmV0LmdyYW50UmVhZCh0aGlzLmVjc1Rhc2tSb2xlKTtcblxuICAgIC8vIEdyYW50IHNlY3JldHMgYWNjZXNzIHRvIHRhc2sgZXhlY3V0aW9uIHJvbGUgKGZvciBwdWxsaW5nIHNlY3JldHMpXG4gICAgdGhpcy5wcm9kdWN0aW9uU2VjcmV0LmdyYW50UmVhZCh0aGlzLmVjc1Rhc2tFeGVjdXRpb25Sb2xlKTtcbiAgICB0aGlzLnN0YWdpbmdTZWNyZXQuZ3JhbnRSZWFkKHRoaXMuZWNzVGFza0V4ZWN1dGlvblJvbGUpO1xuXG4gICAgLy8gQWxsb3cgR2l0SHViIEFjdGlvbnMgdG8gcGFzcyBFQ1Mgcm9sZXNcbiAgICB0aGlzLmdpdGh1YkFjdGlvbnNSb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBzaWQ6ICdQYXNzUm9sZScsXG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogWydpYW06UGFzc1JvbGUnXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgdGhpcy5lY3NUYXNrRXhlY3V0aW9uUm9sZS5yb2xlQXJuLFxuICAgICAgICAgIHRoaXMuZWNzVGFza1JvbGUucm9sZUFybixcbiAgICAgICAgXSxcbiAgICAgICAgY29uZGl0aW9uczoge1xuICAgICAgICAgIFN0cmluZ0VxdWFsczoge1xuICAgICAgICAgICAgJ2lhbTpQYXNzZWRUb1NlcnZpY2UnOiAnZWNzLXRhc2tzLmFtYXpvbmF3cy5jb20nLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyBTdGFjayBvdXRwdXRzIGZvciBjcm9zcy1zdGFjayByZWZlcmVuY2VzXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0tNU0tleUlkJywge1xuICAgICAgdmFsdWU6IHRoaXMua21zS2V5LmtleUlkLFxuICAgICAgZGVzY3JpcHRpb246ICdLTVMgS2V5IElEIGZvciBCQ09TIGVuY3J5cHRpb24nLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0tNU0tleUFybicsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmttc0tleS5rZXlBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ0tNUyBLZXkgQVJOIGZvciBCQ09TIGVuY3J5cHRpb24nLFxuICAgICAgZXhwb3J0TmFtZTogJ0JDT1MtS01TLUtleS1Bcm4nLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0VDUlJlcG9zaXRvcnlOYW1lJywge1xuICAgICAgdmFsdWU6IHRoaXMuZWNyUmVwb3NpdG9yeS5yZXBvc2l0b3J5TmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRUNSIFJlcG9zaXRvcnkgbmFtZSBmb3IgQkNPUyBjb250YWluZXIgaW1hZ2VzJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdFQ1JSZXBvc2l0b3J5QXJuJywge1xuICAgICAgdmFsdWU6IHRoaXMuZWNyUmVwb3NpdG9yeS5yZXBvc2l0b3J5QXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdFQ1IgUmVwb3NpdG9yeSBBUk4gZm9yIEJDT1MgY29udGFpbmVyIGltYWdlcycsXG4gICAgICBleHBvcnROYW1lOiAnQkNPUy1FQ1JSZXBvc2l0b3J5LUFybicsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRUNTVGFza0V4ZWN1dGlvblJvbGVBcm4nLCB7XG4gICAgICB2YWx1ZTogdGhpcy5lY3NUYXNrRXhlY3V0aW9uUm9sZS5yb2xlQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdFQ1MgVGFzayBFeGVjdXRpb24gUm9sZSBBUk4nLFxuICAgICAgZXhwb3J0TmFtZTogJ0JDT1MtRUNTVGFza0V4ZWN1dGlvblJvbGUtQXJuJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdFQ1NUYXNrUm9sZUFybicsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmVjc1Rhc2tSb2xlLnJvbGVBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ0VDUyBUYXNrIFJvbGUgQVJOJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdCQ09TLUVDU1Rhc2tSb2xlLUFybicsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnUHJvZHVjdGlvblNlY3JldEFybicsIHtcbiAgICAgIHZhbHVlOiB0aGlzLnByb2R1Y3Rpb25TZWNyZXQuc2VjcmV0QXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdQcm9kdWN0aW9uIFNlY3JldCBBUk4nLFxuICAgICAgZXhwb3J0TmFtZTogJ0JDT1MtUHJvZHVjdGlvblNlY3JldC1Bcm4nLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1N0YWdpbmdTZWNyZXRBcm4nLCB7XG4gICAgICB2YWx1ZTogdGhpcy5zdGFnaW5nU2VjcmV0LnNlY3JldEFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnU3RhZ2luZyBTZWNyZXQgQVJOJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdCQ09TLVN0YWdpbmdTZWNyZXQtQXJuJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdHaXRIdWJBY3Rpb25zUm9sZU91dHB1dCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmdpdGh1YkFjdGlvbnNSb2xlLnJvbGVBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ0dpdEh1YiBBY3Rpb25zIFJvbGUgQVJOIGZvciBDSS9DRCcsXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==