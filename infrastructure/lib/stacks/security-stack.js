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
            imageTagMutability: ecr.TagMutability.IMMUTABLE,
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
                        'repo:pstewart/bcos:ref:refs/heads/main',
                        'repo:pstewart/bcos:ref:refs/heads/staging',
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
                'ecs:UpdateService',
                'ecs:DescribeServices',
                'ecs:DescribeTaskDefinition',
                'ecs:RegisterTaskDefinition',
            ],
            resources: [
                `arn:aws:ecs:us-east-1:${this.account}:cluster/bcos-*-cluster`,
                `arn:aws:ecs:us-east-1:${this.account}:service/bcos-*-cluster/bcos-*-service`,
                `arn:aws:ecs:us-east-1:${this.account}:task-definition/bcos-*`,
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
                    PORT: '4001'
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
                    PORT: '4001'
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VjdXJpdHktc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJzZWN1cml0eS1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMseURBQTJDO0FBQzNDLHlEQUEyQztBQUMzQyx5REFBMkM7QUFDM0MsK0VBQWlFO0FBR2pFLE1BQWEsYUFBYyxTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQzFCLE1BQU0sQ0FBVTtJQUNoQixpQkFBaUIsQ0FBVztJQUM1QixvQkFBb0IsQ0FBVztJQUMvQixXQUFXLENBQVc7SUFDdEIsYUFBYSxDQUFpQjtJQUM5QixnQkFBZ0IsQ0FBd0I7SUFDeEMsYUFBYSxDQUF3QjtJQUVyRCxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQXNCO1FBQzlELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLGdDQUFnQztRQUNoQyxJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsbUJBQW1CLEVBQUU7WUFDbkQsV0FBVyxFQUFFLGdEQUFnRDtZQUM3RCxpQkFBaUIsRUFBRSxJQUFJO1lBQ3ZCLEtBQUssRUFBRSxpQkFBaUI7WUFDeEIsYUFBYSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsTUFBTTtZQUN2QyxNQUFNLEVBQUUsSUFBSSxHQUFHLENBQUMsY0FBYyxDQUFDO2dCQUM3QixVQUFVLEVBQUU7b0JBQ1YsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDO3dCQUN0QixHQUFHLEVBQUUsNkJBQTZCO3dCQUNsQyxNQUFNLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxLQUFLO3dCQUN4QixVQUFVLEVBQUUsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO3dCQUM1QyxPQUFPLEVBQUUsQ0FBQyxPQUFPLENBQUM7d0JBQ2xC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R0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsZ0JBQWdCLEVBQUU7WUFDeEMsS0FBSyxFQUFFLElBQUksQ0FBQyxXQUFXLENBQUMsT0FBTztZQUMvQixXQUFXLEVBQUUsbUJBQW1CO1lBQ2hDLFVBQVUsRUFBRSxzQkFBc0I7U0FDbkMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxxQkFBcUIsRUFBRTtZQUM3QyxLQUFLLEVBQUUsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFNBQVM7WUFDdEMsV0FBVyxFQUFFLHVCQUF1QjtZQUNwQyxVQUFVLEVBQUUsMkJBQTJCO1NBQ3hDLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsa0JBQWtCLEVBQUU7WUFDMUMsS0FBSyxFQUFFLElBQUksQ0FBQyxhQUFhLENBQUMsU0FBUztZQUNuQyxXQUFXLEVBQUUsb0JBQW9CO1lBQ2pDLFVBQVUsRUFBRSx3QkFBd0I7U0FDckMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSx5QkFBeUIsRUFBRTtZQUNqRCxLQUFLLEVBQUUsSUFBSSxDQUFDLGlCQUFpQixDQUFDLE9BQU87WUFDckMsV0FBVyxFQUFFLG1DQUFtQztTQUNqRCxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUFoU0Qsc0NBZ1NDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCAqIGFzIGttcyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mta21zJztcbmltcG9ydCAqIGFzIGVjciBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWNyJztcbmltcG9ydCAqIGFzIHNlY3JldHNtYW5hZ2VyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zZWNyZXRzbWFuYWdlcic7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcblxuZXhwb3J0IGNsYXNzIFNlY3VyaXR5U3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBwdWJsaWMgcmVhZG9ubHkga21zS2V5OiBrbXMuS2V5O1xuICBwdWJsaWMgcmVhZG9ubHkgZ2l0aHViQWN0aW9uc1JvbGU6IGlhbS5Sb2xlO1xuICBwdWJsaWMgcmVhZG9ubHkgZWNzVGFza0V4ZWN1dGlvblJvbGU6IGlhbS5Sb2xlO1xuICBwdWJsaWMgcmVhZG9ubHkgZWNzVGFza1JvbGU6IGlhbS5Sb2xlO1xuICBwdWJsaWMgcmVhZG9ubHkgZWNyUmVwb3NpdG9yeTogZWNyLlJlcG9zaXRvcnk7XG4gIHB1YmxpYyByZWFkb25seSBwcm9kdWN0aW9uU2VjcmV0OiBzZWNyZXRzbWFuYWdlci5TZWNyZXQ7XG4gIHB1YmxpYyByZWFkb25seSBzdGFnaW5nU2VjcmV0OiBzZWNyZXRzbWFuYWdlci5TZWNyZXQ7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM/OiBjZGsuU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgLy8gQ3JlYXRlIEtNUyBrZXkgZm9yIGVuY3J5cHRpb25cbiAgICB0aGlzLmttc0tleSA9IG5ldyBrbXMuS2V5KHRoaXMsICdCQ09TRW5jcnlwdGlvbktleScsIHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnQkNPUyBlbmNyeXB0aW9uIGtleSBmb3IgbG9ncywgc2VjcmV0cywgYW5kIEVDUicsXG4gICAgICBlbmFibGVLZXlSb3RhdGlvbjogdHJ1ZSxcbiAgICAgIGFsaWFzOiAnYmNvcy1lbmNyeXB0aW9uJyxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTixcbiAgICAgIHBvbGljeTogbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICAgIHN0YXRlbWVudHM6IFtcbiAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICBzaWQ6ICdFbmFibGUgSUFNIFVzZXIgUGVybWlzc2lvbnMnLFxuICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgcHJpbmNpcGFsczogW25ldyBpYW0uQWNjb3VudFJvb3RQcmluY2lwYWwoKV0sXG4gICAgICAgICAgICBhY3Rpb25zOiBbJ2ttczoqJ10sXG4gICAgICAgICAgICByZXNvdXJjZXM6IFsnKiddLFxuICAgICAgICAgIH0pLFxuICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgIHNpZDogJ0FsbG93IENsb3VkV2F0Y2ggTG9ncycsXG4gICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICBwcmluY2lwYWxzOiBbXG4gICAgICAgICAgICAgIG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnbG9ncy5hbWF6b25hd3MuY29tJyksXG4gICAgICAgICAgICBdLFxuICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAna21zOkVuY3J5cHQnLFxuICAgICAgICAgICAgICAna21zOkRlY3J5cHQnLFxuICAgICAgICAgICAgICAna21zOlJlRW5jcnlwdConLFxuICAgICAgICAgICAgICAna21zOkdlbmVyYXRlRGF0YUtleSonLFxuICAgICAgICAgICAgICAna21zOkRlc2NyaWJlS2V5JyxcbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgICByZXNvdXJjZXM6IFsnKiddLFxuICAgICAgICAgIH0pLFxuICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgIHNpZDogJ0FsbG93IEVDUiBTZXJ2aWNlJyxcbiAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgIHByaW5jaXBhbHM6IFtuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2Vjci5hbWF6b25hd3MuY29tJyldLFxuICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAna21zOkRlY3J5cHQnLFxuICAgICAgICAgICAgICAna21zOkRlc2NyaWJlS2V5JyxcbiAgICAgICAgICAgICAgJ2ttczpHZW5lcmF0ZURhdGFLZXknLFxuICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIHJlc291cmNlczogWycqJ10sXG4gICAgICAgICAgfSksXG4gICAgICAgIF0sXG4gICAgICB9KSxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBFQ1IgcmVwb3NpdG9yeVxuICAgIHRoaXMuZWNyUmVwb3NpdG9yeSA9IG5ldyBlY3IuUmVwb3NpdG9yeSh0aGlzLCAnQkNPU1JlcG9zaXRvcnknLCB7XG4gICAgICByZXBvc2l0b3J5TmFtZTogJ2Jjb3MnLFxuICAgICAgaW1hZ2VTY2FuT25QdXNoOiB0cnVlLFxuICAgICAgaW1hZ2VUYWdNdXRhYmlsaXR5OiBlY3IuVGFnTXV0YWJpbGl0eS5JTU1VVEFCTEUsXG4gICAgICBlbmNyeXB0aW9uS2V5OiB0aGlzLmttc0tleSxcbiAgICAgIGxpZmVjeWNsZVJ1bGVzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogJ0tlZXAgbGFzdCAxMCBwcm9kdWN0aW9uIGltYWdlcycsXG4gICAgICAgICAgbWF4SW1hZ2VDb3VudDogMTAsXG4gICAgICAgICAgdGFnUHJlZml4TGlzdDogWyd2JywgJ3JlbGVhc2UnXSxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnS2VlcCBsYXN0IDUgc3RhZ2luZyBpbWFnZXMnLFxuICAgICAgICAgIG1heEltYWdlQ291bnQ6IDUsXG4gICAgICAgICAgdGFnUHJlZml4TGlzdDogWydzdGFnaW5nJ10sXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogJ0RlbGV0ZSB1bnRhZ2dlZCBpbWFnZXMgYWZ0ZXIgNyBkYXlzJyxcbiAgICAgICAgICBtYXhJbWFnZUFnZTogY2RrLkR1cmF0aW9uLmRheXMoNyksXG4gICAgICAgICAgdGFnU3RhdHVzOiBlY3IuVGFnU3RhdHVzLlVOVEFHR0VELFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vIEdpdEh1YiBPSURDIFByb3ZpZGVyXG4gICAgY29uc3QgZ2l0aHViT2lkY1Byb3ZpZGVyID0gbmV3IGlhbS5PcGVuSWRDb25uZWN0UHJvdmlkZXIodGhpcywgJ0dpdEh1Yk9pZGNQcm92aWRlcicsIHtcbiAgICAgIHVybDogJ2h0dHBzOi8vdG9rZW4uYWN0aW9ucy5naXRodWJ1c2VyY29udGVudC5jb20nLFxuICAgICAgY2xpZW50SWRzOiBbJ3N0cy5hbWF6b25hd3MuY29tJ10sXG4gICAgICB0aHVtYnByaW50czogWyc2OTM4ZmQ0ZDk4YmFiMDNmYWFkYjk3YjM0Mzk2ODMxZTM3ODBhZWExJ10sXG4gICAgfSk7XG5cbiAgICAvLyBHaXRIdWIgQWN0aW9ucyBSb2xlXG4gICAgdGhpcy5naXRodWJBY3Rpb25zUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnR2l0SHViQWN0aW9uc1JvbGUnLCB7XG4gICAgICByb2xlTmFtZTogJ0JDT1MtR2l0SHViQWN0aW9uc0RlcGxveW1lbnRSb2xlJyxcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5XZWJJZGVudGl0eVByaW5jaXBhbChcbiAgICAgICAgZ2l0aHViT2lkY1Byb3ZpZGVyLm9wZW5JZENvbm5lY3RQcm92aWRlckFybixcbiAgICAgICAge1xuICAgICAgICAgIFN0cmluZ0VxdWFsczoge1xuICAgICAgICAgICAgJ3Rva2VuLmFjdGlvbnMuZ2l0aHVidXNlcmNvbnRlbnQuY29tOmF1ZCc6ICdzdHMuYW1hem9uYXdzLmNvbScsXG4gICAgICAgICAgICAndG9rZW4uYWN0aW9ucy5naXRodWJ1c2VyY29udGVudC5jb206aXNzJzogJ2h0dHBzOi8vdG9rZW4uYWN0aW9ucy5naXRodWJ1c2VyY29udGVudC5jb20nLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgU3RyaW5nTGlrZToge1xuICAgICAgICAgICAgJ3Rva2VuLmFjdGlvbnMuZ2l0aHVidXNlcmNvbnRlbnQuY29tOnN1Yic6IFtcbiAgICAgICAgICAgICAgJ3JlcG86cHN0ZXdhcnQvYmNvczpyZWY6cmVmcy9oZWFkcy9tYWluJyxcbiAgICAgICAgICAgICAgJ3JlcG86cHN0ZXdhcnQvYmNvczpyZWY6cmVmcy9oZWFkcy9zdGFnaW5nJyxcbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfVxuICAgICAgKSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnUm9sZSBmb3IgR2l0SHViIEFjdGlvbnMgdG8gZGVwbG95IEJDT1MgYXBwbGljYXRpb24nLFxuICAgICAgbWF4U2Vzc2lvbkR1cmF0aW9uOiBjZGsuRHVyYXRpb24uaG91cnMoMSksXG4gICAgfSk7XG5cbiAgICAvLyBHaXRIdWIgQWN0aW9ucyBEZXBsb3ltZW50IFBvbGljeVxuICAgIHRoaXMuZ2l0aHViQWN0aW9uc1JvbGUuYWRkVG9Qb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIHNpZDogJ0VDUkFjY2VzcycsXG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogWydlY3I6R2V0QXV0aG9yaXphdGlvblRva2VuJ10sXG4gICAgICAgIHJlc291cmNlczogWycqJ10sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICB0aGlzLmdpdGh1YkFjdGlvbnNSb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBzaWQ6ICdFQ1JSZXBvc2l0b3J5JyxcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgJ2VjcjpCYXRjaENoZWNrTGF5ZXJBdmFpbGFiaWxpdHknLFxuICAgICAgICAgICdlY3I6R2V0RG93bmxvYWRVcmxGb3JMYXllcicsXG4gICAgICAgICAgJ2VjcjpCYXRjaEdldEltYWdlJyxcbiAgICAgICAgICAnZWNyOkluaXRpYXRlTGF5ZXJVcGxvYWQnLFxuICAgICAgICAgICdlY3I6VXBsb2FkTGF5ZXJQYXJ0JyxcbiAgICAgICAgICAnZWNyOkNvbXBsZXRlTGF5ZXJVcGxvYWQnLFxuICAgICAgICAgICdlY3I6UHV0SW1hZ2UnLFxuICAgICAgICAgICdlY3I6RGVzY3JpYmVJbWFnZXMnLFxuICAgICAgICBdLFxuICAgICAgICByZXNvdXJjZXM6IFt0aGlzLmVjclJlcG9zaXRvcnkucmVwb3NpdG9yeUFybl0sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICB0aGlzLmdpdGh1YkFjdGlvbnNSb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBzaWQ6ICdFQ1NBY2Nlc3MnLFxuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAnZWNzOlVwZGF0ZVNlcnZpY2UnLFxuICAgICAgICAgICdlY3M6RGVzY3JpYmVTZXJ2aWNlcycsXG4gICAgICAgICAgJ2VjczpEZXNjcmliZVRhc2tEZWZpbml0aW9uJyxcbiAgICAgICAgICAnZWNzOlJlZ2lzdGVyVGFza0RlZmluaXRpb24nLFxuICAgICAgICBdLFxuICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICBgYXJuOmF3czplY3M6dXMtZWFzdC0xOiR7dGhpcy5hY2NvdW50fTpjbHVzdGVyL2Jjb3MtKi1jbHVzdGVyYCxcbiAgICAgICAgICBgYXJuOmF3czplY3M6dXMtZWFzdC0xOiR7dGhpcy5hY2NvdW50fTpzZXJ2aWNlL2Jjb3MtKi1jbHVzdGVyL2Jjb3MtKi1zZXJ2aWNlYCxcbiAgICAgICAgICBgYXJuOmF3czplY3M6dXMtZWFzdC0xOiR7dGhpcy5hY2NvdW50fTp0YXNrLWRlZmluaXRpb24vYmNvcy0qYCxcbiAgICAgICAgXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIEVDUyBUYXNrIEV4ZWN1dGlvbiBSb2xlIChmb3IgQVdTIHNlcnZpY2UgY2FsbHMpXG4gICAgdGhpcy5lY3NUYXNrRXhlY3V0aW9uUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnRUNTVGFza0V4ZWN1dGlvblJvbGUnLCB7XG4gICAgICByb2xlTmFtZTogJ0JDT1MtRUNTVGFza0V4ZWN1dGlvblJvbGUnLFxuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2Vjcy10YXNrcy5hbWF6b25hd3MuY29tJyksXG4gICAgICBtYW5hZ2VkUG9saWNpZXM6IFtcbiAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdzZXJ2aWNlLXJvbGUvQW1hem9uRUNTVGFza0V4ZWN1dGlvblJvbGVQb2xpY3knKSxcbiAgICAgIF0sXG4gICAgICBkZXNjcmlwdGlvbjogJ0VDUyBUYXNrIEV4ZWN1dGlvbiBSb2xlIGZvciBCQ09TIGFwcGxpY2F0aW9uJyxcbiAgICB9KTtcblxuICAgIC8vIEFkZCBLTVMgcGVybWlzc2lvbnMgdG8gZXhlY3V0aW9uIHJvbGVcbiAgICB0aGlzLmVjc1Rhc2tFeGVjdXRpb25Sb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFsna21zOkRlY3J5cHQnLCAna21zOkRlc2NyaWJlS2V5J10sXG4gICAgICAgIHJlc291cmNlczogW3RoaXMua21zS2V5LmtleUFybl0sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyBFQ1MgVGFzayBSb2xlIChmb3IgYXBwbGljYXRpb24gcnVudGltZSBwZXJtaXNzaW9ucylcbiAgICB0aGlzLmVjc1Rhc2tSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdFQ1NUYXNrUm9sZScsIHtcbiAgICAgIHJvbGVOYW1lOiAnQkNPUy1FQ1NUYXNrUm9sZScsXG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnZWNzLXRhc2tzLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRUNTIFRhc2sgUm9sZSBmb3IgQkNPUyBhcHBsaWNhdGlvbiBydW50aW1lIHBlcm1pc3Npb25zJyxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBTZWNyZXRzIE1hbmFnZXIgc2VjcmV0c1xuICAgIHRoaXMucHJvZHVjdGlvblNlY3JldCA9IG5ldyBzZWNyZXRzbWFuYWdlci5TZWNyZXQodGhpcywgJ1Byb2R1Y3Rpb25TZWNyZXRzJywge1xuICAgICAgc2VjcmV0TmFtZTogJ3Byb2R1Y3Rpb24vYmNvcy1zZWNyZXRzJyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnUHJvZHVjdGlvbiBzZWNyZXRzIGZvciBCQ09TIGFwcGxpY2F0aW9uJyxcbiAgICAgIGVuY3J5cHRpb25LZXk6IHRoaXMua21zS2V5LFxuICAgICAgZ2VuZXJhdGVTZWNyZXRTdHJpbmc6IHtcbiAgICAgICAgc2VjcmV0U3RyaW5nVGVtcGxhdGU6IEpTT04uc3RyaW5naWZ5KHsgXG4gICAgICAgICAgTk9ERV9FTlY6ICdwcm9kdWN0aW9uJyxcbiAgICAgICAgICBQT1JUOiAnNDAwMSdcbiAgICAgICAgfSksXG4gICAgICAgIGdlbmVyYXRlU3RyaW5nS2V5OiAnSldUX1NFQ1JFVCcsXG4gICAgICAgIGV4Y2x1ZGVDaGFyYWN0ZXJzOiAnXCJAL1xcXFwnLFxuICAgICAgICBpbmNsdWRlU3BhY2U6IGZhbHNlLFxuICAgICAgICBwYXNzd29yZExlbmd0aDogNjQsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgdGhpcy5zdGFnaW5nU2VjcmV0ID0gbmV3IHNlY3JldHNtYW5hZ2VyLlNlY3JldCh0aGlzLCAnU3RhZ2luZ1NlY3JldHMnLCB7XG4gICAgICBzZWNyZXROYW1lOiAnc3RhZ2luZy9iY29zLXNlY3JldHMnLFxuICAgICAgZGVzY3JpcHRpb246ICdTdGFnaW5nIHNlY3JldHMgZm9yIEJDT1MgYXBwbGljYXRpb24nLFxuICAgICAgZW5jcnlwdGlvbktleTogdGhpcy5rbXNLZXksXG4gICAgICBnZW5lcmF0ZVNlY3JldFN0cmluZzoge1xuICAgICAgICBzZWNyZXRTdHJpbmdUZW1wbGF0ZTogSlNPTi5zdHJpbmdpZnkoeyBcbiAgICAgICAgICBOT0RFX0VOVjogJ3N0YWdpbmcnLFxuICAgICAgICAgIFBPUlQ6ICc0MDAxJ1xuICAgICAgICB9KSxcbiAgICAgICAgZ2VuZXJhdGVTdHJpbmdLZXk6ICdKV1RfU0VDUkVUJyxcbiAgICAgICAgZXhjbHVkZUNoYXJhY3RlcnM6ICdcIkAvXFxcXCcsXG4gICAgICAgIGluY2x1ZGVTcGFjZTogZmFsc2UsXG4gICAgICAgIHBhc3N3b3JkTGVuZ3RoOiA2NCxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBHcmFudCBzZWNyZXRzIGFjY2VzcyB0byB0YXNrIHJvbGVcbiAgICB0aGlzLnByb2R1Y3Rpb25TZWNyZXQuZ3JhbnRSZWFkKHRoaXMuZWNzVGFza1JvbGUpO1xuICAgIHRoaXMuc3RhZ2luZ1NlY3JldC5ncmFudFJlYWQodGhpcy5lY3NUYXNrUm9sZSk7XG5cbiAgICAvLyBHcmFudCBzZWNyZXRzIGFjY2VzcyB0byB0YXNrIGV4ZWN1dGlvbiByb2xlIChmb3IgcHVsbGluZyBzZWNyZXRzKVxuICAgIHRoaXMucHJvZHVjdGlvblNlY3JldC5ncmFudFJlYWQodGhpcy5lY3NUYXNrRXhlY3V0aW9uUm9sZSk7XG4gICAgdGhpcy5zdGFnaW5nU2VjcmV0LmdyYW50UmVhZCh0aGlzLmVjc1Rhc2tFeGVjdXRpb25Sb2xlKTtcblxuICAgIC8vIEFsbG93IEdpdEh1YiBBY3Rpb25zIHRvIHBhc3MgRUNTIHJvbGVzXG4gICAgdGhpcy5naXRodWJBY3Rpb25zUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgc2lkOiAnUGFzc1JvbGUnLFxuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFsnaWFtOlBhc3NSb2xlJ10sXG4gICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgIHRoaXMuZWNzVGFza0V4ZWN1dGlvblJvbGUucm9sZUFybixcbiAgICAgICAgICB0aGlzLmVjc1Rhc2tSb2xlLnJvbGVBcm4sXG4gICAgICAgIF0sXG4gICAgICAgIGNvbmRpdGlvbnM6IHtcbiAgICAgICAgICBTdHJpbmdFcXVhbHM6IHtcbiAgICAgICAgICAgICdpYW06UGFzc2VkVG9TZXJ2aWNlJzogJ2Vjcy10YXNrcy5hbWF6b25hd3MuY29tJyxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gU3RhY2sgb3V0cHV0cyBmb3IgY3Jvc3Mtc3RhY2sgcmVmZXJlbmNlc1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdLTVNLZXlJZCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmttc0tleS5rZXlJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnS01TIEtleSBJRCBmb3IgQkNPUyBlbmNyeXB0aW9uJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdLTVNLZXlBcm4nLCB7XG4gICAgICB2YWx1ZTogdGhpcy5rbXNLZXkua2V5QXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdLTVMgS2V5IEFSTiBmb3IgQkNPUyBlbmNyeXB0aW9uJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdCQ09TLUtNUy1LZXktQXJuJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdFQ1JSZXBvc2l0b3J5TmFtZScsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmVjclJlcG9zaXRvcnkucmVwb3NpdG9yeU5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ0VDUiBSZXBvc2l0b3J5IG5hbWUgZm9yIEJDT1MgY29udGFpbmVyIGltYWdlcycsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRUNTVGFza0V4ZWN1dGlvblJvbGVBcm4nLCB7XG4gICAgICB2YWx1ZTogdGhpcy5lY3NUYXNrRXhlY3V0aW9uUm9sZS5yb2xlQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdFQ1MgVGFzayBFeGVjdXRpb24gUm9sZSBBUk4nLFxuICAgICAgZXhwb3J0TmFtZTogJ0JDT1MtRUNTVGFza0V4ZWN1dGlvblJvbGUtQXJuJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdFQ1NUYXNrUm9sZUFybicsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmVjc1Rhc2tSb2xlLnJvbGVBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ0VDUyBUYXNrIFJvbGUgQVJOJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdCQ09TLUVDU1Rhc2tSb2xlLUFybicsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnUHJvZHVjdGlvblNlY3JldEFybicsIHtcbiAgICAgIHZhbHVlOiB0aGlzLnByb2R1Y3Rpb25TZWNyZXQuc2VjcmV0QXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdQcm9kdWN0aW9uIFNlY3JldCBBUk4nLFxuICAgICAgZXhwb3J0TmFtZTogJ0JDT1MtUHJvZHVjdGlvblNlY3JldC1Bcm4nLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1N0YWdpbmdTZWNyZXRBcm4nLCB7XG4gICAgICB2YWx1ZTogdGhpcy5zdGFnaW5nU2VjcmV0LnNlY3JldEFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnU3RhZ2luZyBTZWNyZXQgQVJOJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdCQ09TLVN0YWdpbmdTZWNyZXQtQXJuJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdHaXRIdWJBY3Rpb25zUm9sZU91dHB1dCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmdpdGh1YkFjdGlvbnNSb2xlLnJvbGVBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ0dpdEh1YiBBY3Rpb25zIFJvbGUgQVJOIGZvciBDSS9DRCcsXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==