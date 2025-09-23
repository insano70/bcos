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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VjdXJpdHktc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJzZWN1cml0eS1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMseURBQTJDO0FBQzNDLHlEQUEyQztBQUMzQyx5REFBMkM7QUFDM0MsK0VBQWlFO0FBR2pFLE1BQWEsYUFBYyxTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQzFCLE1BQU0sQ0FBVTtJQUNoQixpQkFBaUIsQ0FBVztJQUM1QixvQkFBb0IsQ0FBVztJQUMvQixXQUFXLENBQVc7SUFDdEIsYUFBYSxDQUFpQjtJQUM5QixnQkFBZ0IsQ0FBd0I7SUFDeEMsYUFBYSxDQUF3QjtJQUVyRCxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQXNCO1FBQzlELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLGdDQUFnQztRQUNoQyxJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsbUJBQW1CLEVBQUU7WUFDbkQsV0FBVyxFQUFFLGdEQUFnRDtZQUM3RCxpQkFBaUIsRUFBRSxJQUFJO1lBQ3ZCLEtBQUssRUFBRSxpQkFBaUI7WUFDeEIsYUFBYSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsTUFBTTtZQUN2QyxNQUFNLEVBQUUsSUFBSSxHQUFHLENBQUMsY0FBYyxDQUFDO2dCQUM3QixVQUFVLEVBQUU7b0JBQ1YsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDO3dCQUN0QixHQUFHLEVBQUUsNkJBQTZCO3dCQUNsQyxNQUFNLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxLQUFLO3dCQUN4QixVQUFVLEVBQUUsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO3dCQUM1QyxPQUFPLEVBQUUsQ0FBQyxPQUFPLENBQUM7d0JBQ2xC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Y0FBYztZQUN4QyxXQUFXLEVBQUUsK0NBQStDO1NBQzdELENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUseUJBQXlCLEVBQUU7WUFDakQsS0FBSyxFQUFFLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxPQUFPO1lBQ3hDLFdBQVcsRUFBRSw2QkFBNkI7WUFDMUMsVUFBVSxFQUFFLCtCQUErQjtTQUM1QyxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGdCQUFnQixFQUFFO1lBQ3hDLEtBQUssRUFBRSxJQUFJLENBQUMsV0FBVyxDQUFDLE9BQU87WUFDL0IsV0FBVyxFQUFFLG1CQUFtQjtZQUNoQyxVQUFVLEVBQUUsc0JBQXNCO1NBQ25DLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUscUJBQXFCLEVBQUU7WUFDN0MsS0FBSyxFQUFFLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxTQUFTO1lBQ3RDLFdBQVcsRUFBRSx1QkFBdUI7WUFDcEMsVUFBVSxFQUFFLDJCQUEyQjtTQUN4QyxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGtCQUFrQixFQUFFO1lBQzFDLEtBQUssRUFBRSxJQUFJLENBQUMsYUFBYSxDQUFDLFNBQVM7WUFDbkMsV0FBVyxFQUFFLG9CQUFvQjtZQUNqQyxVQUFVLEVBQUUsd0JBQXdCO1NBQ3JDLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUseUJBQXlCLEVBQUU7WUFDakQsS0FBSyxFQUFFLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxPQUFPO1lBQ3JDLFdBQVcsRUFBRSxtQ0FBbUM7U0FDakQsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBelNELHNDQXlTQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgKiBhcyBrbXMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWttcyc7XG5pbXBvcnQgKiBhcyBlY3IgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVjcic7XG5pbXBvcnQgKiBhcyBzZWNyZXRzbWFuYWdlciBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc2VjcmV0c21hbmFnZXInO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5cbmV4cG9ydCBjbGFzcyBTZWN1cml0eVN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgcHVibGljIHJlYWRvbmx5IGttc0tleToga21zLktleTtcbiAgcHVibGljIHJlYWRvbmx5IGdpdGh1YkFjdGlvbnNSb2xlOiBpYW0uUm9sZTtcbiAgcHVibGljIHJlYWRvbmx5IGVjc1Rhc2tFeGVjdXRpb25Sb2xlOiBpYW0uUm9sZTtcbiAgcHVibGljIHJlYWRvbmx5IGVjc1Rhc2tSb2xlOiBpYW0uUm9sZTtcbiAgcHVibGljIHJlYWRvbmx5IGVjclJlcG9zaXRvcnk6IGVjci5SZXBvc2l0b3J5O1xuICBwdWJsaWMgcmVhZG9ubHkgcHJvZHVjdGlvblNlY3JldDogc2VjcmV0c21hbmFnZXIuU2VjcmV0O1xuICBwdWJsaWMgcmVhZG9ubHkgc3RhZ2luZ1NlY3JldDogc2VjcmV0c21hbmFnZXIuU2VjcmV0O1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzPzogY2RrLlN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIC8vIENyZWF0ZSBLTVMga2V5IGZvciBlbmNyeXB0aW9uXG4gICAgdGhpcy5rbXNLZXkgPSBuZXcga21zLktleSh0aGlzLCAnQkNPU0VuY3J5cHRpb25LZXknLCB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0JDT1MgZW5jcnlwdGlvbiBrZXkgZm9yIGxvZ3MsIHNlY3JldHMsIGFuZCBFQ1InLFxuICAgICAgZW5hYmxlS2V5Um90YXRpb246IHRydWUsXG4gICAgICBhbGlhczogJ2Jjb3MtZW5jcnlwdGlvbicsXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4sXG4gICAgICBwb2xpY3k6IG5ldyBpYW0uUG9saWN5RG9jdW1lbnQoe1xuICAgICAgICBzdGF0ZW1lbnRzOiBbXG4gICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgc2lkOiAnRW5hYmxlIElBTSBVc2VyIFBlcm1pc3Npb25zJyxcbiAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgIHByaW5jaXBhbHM6IFtuZXcgaWFtLkFjY291bnRSb290UHJpbmNpcGFsKCldLFxuICAgICAgICAgICAgYWN0aW9uczogWydrbXM6KiddLFxuICAgICAgICAgICAgcmVzb3VyY2VzOiBbJyonXSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICBzaWQ6ICdBbGxvdyBDbG91ZFdhdGNoIExvZ3MnLFxuICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgcHJpbmNpcGFsczogW1xuICAgICAgICAgICAgICBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2xvZ3MuYW1hem9uYXdzLmNvbScpLFxuICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgJ2ttczpFbmNyeXB0JyxcbiAgICAgICAgICAgICAgJ2ttczpEZWNyeXB0JyxcbiAgICAgICAgICAgICAgJ2ttczpSZUVuY3J5cHQqJyxcbiAgICAgICAgICAgICAgJ2ttczpHZW5lcmF0ZURhdGFLZXkqJyxcbiAgICAgICAgICAgICAgJ2ttczpEZXNjcmliZUtleScsXG4gICAgICAgICAgICBdLFxuICAgICAgICAgICAgcmVzb3VyY2VzOiBbJyonXSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICBzaWQ6ICdBbGxvdyBFQ1IgU2VydmljZScsXG4gICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICBwcmluY2lwYWxzOiBbbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdlY3IuYW1hem9uYXdzLmNvbScpXSxcbiAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgJ2ttczpEZWNyeXB0JyxcbiAgICAgICAgICAgICAgJ2ttczpEZXNjcmliZUtleScsXG4gICAgICAgICAgICAgICdrbXM6R2VuZXJhdGVEYXRhS2V5JyxcbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgICByZXNvdXJjZXM6IFsnKiddLFxuICAgICAgICAgIH0pLFxuICAgICAgICBdLFxuICAgICAgfSksXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgRUNSIHJlcG9zaXRvcnlcbiAgICB0aGlzLmVjclJlcG9zaXRvcnkgPSBuZXcgZWNyLlJlcG9zaXRvcnkodGhpcywgJ0JDT1NSZXBvc2l0b3J5Jywge1xuICAgICAgcmVwb3NpdG9yeU5hbWU6ICdiY29zJyxcbiAgICAgIGltYWdlU2Nhbk9uUHVzaDogdHJ1ZSxcbiAgICAgIGltYWdlVGFnTXV0YWJpbGl0eTogZWNyLlRhZ011dGFiaWxpdHkuTVVUQUJMRSxcbiAgICAgIGVuY3J5cHRpb25LZXk6IHRoaXMua21zS2V5LFxuICAgICAgbGlmZWN5Y2xlUnVsZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnS2VlcCBsYXN0IDEwIHByb2R1Y3Rpb24gaW1hZ2VzJyxcbiAgICAgICAgICBtYXhJbWFnZUNvdW50OiAxMCxcbiAgICAgICAgICB0YWdQcmVmaXhMaXN0OiBbJ3YnLCAncmVsZWFzZSddLFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgZGVzY3JpcHRpb246ICdLZWVwIGxhc3QgNSBzdGFnaW5nIGltYWdlcycsXG4gICAgICAgICAgbWF4SW1hZ2VDb3VudDogNSxcbiAgICAgICAgICB0YWdQcmVmaXhMaXN0OiBbJ3N0YWdpbmcnXSxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnRGVsZXRlIHVudGFnZ2VkIGltYWdlcyBhZnRlciA3IGRheXMnLFxuICAgICAgICAgIG1heEltYWdlQWdlOiBjZGsuRHVyYXRpb24uZGF5cyg3KSxcbiAgICAgICAgICB0YWdTdGF0dXM6IGVjci5UYWdTdGF0dXMuVU5UQUdHRUQsXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gR2l0SHViIE9JREMgUHJvdmlkZXJcbiAgICBjb25zdCBnaXRodWJPaWRjUHJvdmlkZXIgPSBuZXcgaWFtLk9wZW5JZENvbm5lY3RQcm92aWRlcih0aGlzLCAnR2l0SHViT2lkY1Byb3ZpZGVyJywge1xuICAgICAgdXJsOiAnaHR0cHM6Ly90b2tlbi5hY3Rpb25zLmdpdGh1YnVzZXJjb250ZW50LmNvbScsXG4gICAgICBjbGllbnRJZHM6IFsnc3RzLmFtYXpvbmF3cy5jb20nXSxcbiAgICAgIHRodW1icHJpbnRzOiBbJzY5MzhmZDRkOThiYWIwM2ZhYWRiOTdiMzQzOTY4MzFlMzc4MGFlYTEnXSxcbiAgICB9KTtcblxuICAgIC8vIEdpdEh1YiBBY3Rpb25zIFJvbGVcbiAgICB0aGlzLmdpdGh1YkFjdGlvbnNSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdHaXRIdWJBY3Rpb25zUm9sZScsIHtcbiAgICAgIHJvbGVOYW1lOiAnQkNPUy1HaXRIdWJBY3Rpb25zRGVwbG95bWVudFJvbGUnLFxuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLldlYklkZW50aXR5UHJpbmNpcGFsKFxuICAgICAgICBnaXRodWJPaWRjUHJvdmlkZXIub3BlbklkQ29ubmVjdFByb3ZpZGVyQXJuLFxuICAgICAgICB7XG4gICAgICAgICAgU3RyaW5nRXF1YWxzOiB7XG4gICAgICAgICAgICAndG9rZW4uYWN0aW9ucy5naXRodWJ1c2VyY29udGVudC5jb206YXVkJzogJ3N0cy5hbWF6b25hd3MuY29tJyxcbiAgICAgICAgICAgICd0b2tlbi5hY3Rpb25zLmdpdGh1YnVzZXJjb250ZW50LmNvbTppc3MnOiAnaHR0cHM6Ly90b2tlbi5hY3Rpb25zLmdpdGh1YnVzZXJjb250ZW50LmNvbScsXG4gICAgICAgICAgfSxcbiAgICAgICAgICBTdHJpbmdMaWtlOiB7XG4gICAgICAgICAgICAndG9rZW4uYWN0aW9ucy5naXRodWJ1c2VyY29udGVudC5jb206c3ViJzogW1xuICAgICAgICAgICAgICAncmVwbzpwc3Rld2FydC9iY29zOnJlZjpyZWZzL2hlYWRzL21haW4nLFxuICAgICAgICAgICAgICAncmVwbzpwc3Rld2FydC9iY29zOnJlZjpyZWZzL2hlYWRzL3N0YWdpbmcnLFxuICAgICAgICAgICAgXSxcbiAgICAgICAgICB9LFxuICAgICAgICB9XG4gICAgICApLFxuICAgICAgZGVzY3JpcHRpb246ICdSb2xlIGZvciBHaXRIdWIgQWN0aW9ucyB0byBkZXBsb3kgQkNPUyBhcHBsaWNhdGlvbicsXG4gICAgICBtYXhTZXNzaW9uRHVyYXRpb246IGNkay5EdXJhdGlvbi5ob3VycygxKSxcbiAgICB9KTtcblxuICAgIC8vIEdpdEh1YiBBY3Rpb25zIERlcGxveW1lbnQgUG9saWN5XG4gICAgdGhpcy5naXRodWJBY3Rpb25zUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgc2lkOiAnRUNSQWNjZXNzJyxcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbJ2VjcjpHZXRBdXRob3JpemF0aW9uVG9rZW4nXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbJyonXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIHRoaXMuZ2l0aHViQWN0aW9uc1JvbGUuYWRkVG9Qb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIHNpZDogJ0VDUlJlcG9zaXRvcnknLFxuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAnZWNyOkJhdGNoQ2hlY2tMYXllckF2YWlsYWJpbGl0eScsXG4gICAgICAgICAgJ2VjcjpHZXREb3dubG9hZFVybEZvckxheWVyJyxcbiAgICAgICAgICAnZWNyOkJhdGNoR2V0SW1hZ2UnLFxuICAgICAgICAgICdlY3I6SW5pdGlhdGVMYXllclVwbG9hZCcsXG4gICAgICAgICAgJ2VjcjpVcGxvYWRMYXllclBhcnQnLFxuICAgICAgICAgICdlY3I6Q29tcGxldGVMYXllclVwbG9hZCcsXG4gICAgICAgICAgJ2VjcjpQdXRJbWFnZScsXG4gICAgICAgICAgJ2VjcjpEZXNjcmliZUltYWdlcycsXG4gICAgICAgIF0sXG4gICAgICAgIHJlc291cmNlczogW3RoaXMuZWNyUmVwb3NpdG9yeS5yZXBvc2l0b3J5QXJuXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIHRoaXMuZ2l0aHViQWN0aW9uc1JvbGUuYWRkVG9Qb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIHNpZDogJ0VDU0FjY2VzcycsXG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICdlY3M6VXBkYXRlU2VydmljZScsXG4gICAgICAgICAgJ2VjczpEZXNjcmliZVNlcnZpY2VzJyxcbiAgICAgICAgICAnZWNzOlJlZ2lzdGVyVGFza0RlZmluaXRpb24nLFxuICAgICAgICBdLFxuICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICBgYXJuOmF3czplY3M6dXMtZWFzdC0xOiR7dGhpcy5hY2NvdW50fTpjbHVzdGVyL2Jjb3MtKi1jbHVzdGVyYCxcbiAgICAgICAgICBgYXJuOmF3czplY3M6dXMtZWFzdC0xOiR7dGhpcy5hY2NvdW50fTpzZXJ2aWNlL2Jjb3MtKi1jbHVzdGVyL2Jjb3MtKi1zZXJ2aWNlYCxcbiAgICAgICAgICBgYXJuOmF3czplY3M6dXMtZWFzdC0xOiR7dGhpcy5hY2NvdW50fTp0YXNrLWRlZmluaXRpb24vYmNvcy0qYCxcbiAgICAgICAgXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIERlc2NyaWJlVGFza0RlZmluaXRpb24gcmVxdWlyZXMgKiByZXNvdXJjZVxuICAgIHRoaXMuZ2l0aHViQWN0aW9uc1JvbGUuYWRkVG9Qb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIHNpZDogJ0VDU0Rlc2NyaWJlVGFza0RlZmluaXRpb24nLFxuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFsnZWNzOkRlc2NyaWJlVGFza0RlZmluaXRpb24nXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbJyonXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIEVDUyBUYXNrIEV4ZWN1dGlvbiBSb2xlIChmb3IgQVdTIHNlcnZpY2UgY2FsbHMpXG4gICAgdGhpcy5lY3NUYXNrRXhlY3V0aW9uUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnRUNTVGFza0V4ZWN1dGlvblJvbGUnLCB7XG4gICAgICByb2xlTmFtZTogJ0JDT1MtRUNTVGFza0V4ZWN1dGlvblJvbGUnLFxuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2Vjcy10YXNrcy5hbWF6b25hd3MuY29tJyksXG4gICAgICBtYW5hZ2VkUG9saWNpZXM6IFtcbiAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdzZXJ2aWNlLXJvbGUvQW1hem9uRUNTVGFza0V4ZWN1dGlvblJvbGVQb2xpY3knKSxcbiAgICAgIF0sXG4gICAgICBkZXNjcmlwdGlvbjogJ0VDUyBUYXNrIEV4ZWN1dGlvbiBSb2xlIGZvciBCQ09TIGFwcGxpY2F0aW9uJyxcbiAgICB9KTtcblxuICAgIC8vIEFkZCBLTVMgcGVybWlzc2lvbnMgdG8gZXhlY3V0aW9uIHJvbGVcbiAgICB0aGlzLmVjc1Rhc2tFeGVjdXRpb25Sb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFsna21zOkRlY3J5cHQnLCAna21zOkRlc2NyaWJlS2V5J10sXG4gICAgICAgIHJlc291cmNlczogW3RoaXMua21zS2V5LmtleUFybl0sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyBFQ1MgVGFzayBSb2xlIChmb3IgYXBwbGljYXRpb24gcnVudGltZSBwZXJtaXNzaW9ucylcbiAgICB0aGlzLmVjc1Rhc2tSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdFQ1NUYXNrUm9sZScsIHtcbiAgICAgIHJvbGVOYW1lOiAnQkNPUy1FQ1NUYXNrUm9sZScsXG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnZWNzLXRhc2tzLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRUNTIFRhc2sgUm9sZSBmb3IgQkNPUyBhcHBsaWNhdGlvbiBydW50aW1lIHBlcm1pc3Npb25zJyxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBTZWNyZXRzIE1hbmFnZXIgc2VjcmV0c1xuICAgIHRoaXMucHJvZHVjdGlvblNlY3JldCA9IG5ldyBzZWNyZXRzbWFuYWdlci5TZWNyZXQodGhpcywgJ1Byb2R1Y3Rpb25TZWNyZXRzJywge1xuICAgICAgc2VjcmV0TmFtZTogJ3Byb2R1Y3Rpb24vYmNvcy1zZWNyZXRzJyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnUHJvZHVjdGlvbiBzZWNyZXRzIGZvciBCQ09TIGFwcGxpY2F0aW9uJyxcbiAgICAgIGVuY3J5cHRpb25LZXk6IHRoaXMua21zS2V5LFxuICAgICAgZ2VuZXJhdGVTZWNyZXRTdHJpbmc6IHtcbiAgICAgICAgc2VjcmV0U3RyaW5nVGVtcGxhdGU6IEpTT04uc3RyaW5naWZ5KHsgXG4gICAgICAgICAgTk9ERV9FTlY6ICdwcm9kdWN0aW9uJyxcbiAgICAgICAgICBQT1JUOiAnNDAwMSdcbiAgICAgICAgfSksXG4gICAgICAgIGdlbmVyYXRlU3RyaW5nS2V5OiAnSldUX1NFQ1JFVCcsXG4gICAgICAgIGV4Y2x1ZGVDaGFyYWN0ZXJzOiAnXCJAL1xcXFwnLFxuICAgICAgICBpbmNsdWRlU3BhY2U6IGZhbHNlLFxuICAgICAgICBwYXNzd29yZExlbmd0aDogNjQsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgdGhpcy5zdGFnaW5nU2VjcmV0ID0gbmV3IHNlY3JldHNtYW5hZ2VyLlNlY3JldCh0aGlzLCAnU3RhZ2luZ1NlY3JldHMnLCB7XG4gICAgICBzZWNyZXROYW1lOiAnc3RhZ2luZy9iY29zLXNlY3JldHMnLFxuICAgICAgZGVzY3JpcHRpb246ICdTdGFnaW5nIHNlY3JldHMgZm9yIEJDT1MgYXBwbGljYXRpb24nLFxuICAgICAgZW5jcnlwdGlvbktleTogdGhpcy5rbXNLZXksXG4gICAgICBnZW5lcmF0ZVNlY3JldFN0cmluZzoge1xuICAgICAgICBzZWNyZXRTdHJpbmdUZW1wbGF0ZTogSlNPTi5zdHJpbmdpZnkoeyBcbiAgICAgICAgICBOT0RFX0VOVjogJ3N0YWdpbmcnLFxuICAgICAgICAgIFBPUlQ6ICc0MDAxJ1xuICAgICAgICB9KSxcbiAgICAgICAgZ2VuZXJhdGVTdHJpbmdLZXk6ICdKV1RfU0VDUkVUJyxcbiAgICAgICAgZXhjbHVkZUNoYXJhY3RlcnM6ICdcIkAvXFxcXCcsXG4gICAgICAgIGluY2x1ZGVTcGFjZTogZmFsc2UsXG4gICAgICAgIHBhc3N3b3JkTGVuZ3RoOiA2NCxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBHcmFudCBzZWNyZXRzIGFjY2VzcyB0byB0YXNrIHJvbGVcbiAgICB0aGlzLnByb2R1Y3Rpb25TZWNyZXQuZ3JhbnRSZWFkKHRoaXMuZWNzVGFza1JvbGUpO1xuICAgIHRoaXMuc3RhZ2luZ1NlY3JldC5ncmFudFJlYWQodGhpcy5lY3NUYXNrUm9sZSk7XG5cbiAgICAvLyBHcmFudCBzZWNyZXRzIGFjY2VzcyB0byB0YXNrIGV4ZWN1dGlvbiByb2xlIChmb3IgcHVsbGluZyBzZWNyZXRzKVxuICAgIHRoaXMucHJvZHVjdGlvblNlY3JldC5ncmFudFJlYWQodGhpcy5lY3NUYXNrRXhlY3V0aW9uUm9sZSk7XG4gICAgdGhpcy5zdGFnaW5nU2VjcmV0LmdyYW50UmVhZCh0aGlzLmVjc1Rhc2tFeGVjdXRpb25Sb2xlKTtcblxuICAgIC8vIEFsbG93IEdpdEh1YiBBY3Rpb25zIHRvIHBhc3MgRUNTIHJvbGVzXG4gICAgdGhpcy5naXRodWJBY3Rpb25zUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgc2lkOiAnUGFzc1JvbGUnLFxuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFsnaWFtOlBhc3NSb2xlJ10sXG4gICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgIHRoaXMuZWNzVGFza0V4ZWN1dGlvblJvbGUucm9sZUFybixcbiAgICAgICAgICB0aGlzLmVjc1Rhc2tSb2xlLnJvbGVBcm4sXG4gICAgICAgIF0sXG4gICAgICAgIGNvbmRpdGlvbnM6IHtcbiAgICAgICAgICBTdHJpbmdFcXVhbHM6IHtcbiAgICAgICAgICAgICdpYW06UGFzc2VkVG9TZXJ2aWNlJzogJ2Vjcy10YXNrcy5hbWF6b25hd3MuY29tJyxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gU3RhY2sgb3V0cHV0cyBmb3IgY3Jvc3Mtc3RhY2sgcmVmZXJlbmNlc1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdLTVNLZXlJZCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmttc0tleS5rZXlJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnS01TIEtleSBJRCBmb3IgQkNPUyBlbmNyeXB0aW9uJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdLTVNLZXlBcm4nLCB7XG4gICAgICB2YWx1ZTogdGhpcy5rbXNLZXkua2V5QXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdLTVMgS2V5IEFSTiBmb3IgQkNPUyBlbmNyeXB0aW9uJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdCQ09TLUtNUy1LZXktQXJuJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdFQ1JSZXBvc2l0b3J5TmFtZScsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmVjclJlcG9zaXRvcnkucmVwb3NpdG9yeU5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ0VDUiBSZXBvc2l0b3J5IG5hbWUgZm9yIEJDT1MgY29udGFpbmVyIGltYWdlcycsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRUNTVGFza0V4ZWN1dGlvblJvbGVBcm4nLCB7XG4gICAgICB2YWx1ZTogdGhpcy5lY3NUYXNrRXhlY3V0aW9uUm9sZS5yb2xlQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdFQ1MgVGFzayBFeGVjdXRpb24gUm9sZSBBUk4nLFxuICAgICAgZXhwb3J0TmFtZTogJ0JDT1MtRUNTVGFza0V4ZWN1dGlvblJvbGUtQXJuJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdFQ1NUYXNrUm9sZUFybicsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmVjc1Rhc2tSb2xlLnJvbGVBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ0VDUyBUYXNrIFJvbGUgQVJOJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdCQ09TLUVDU1Rhc2tSb2xlLUFybicsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnUHJvZHVjdGlvblNlY3JldEFybicsIHtcbiAgICAgIHZhbHVlOiB0aGlzLnByb2R1Y3Rpb25TZWNyZXQuc2VjcmV0QXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdQcm9kdWN0aW9uIFNlY3JldCBBUk4nLFxuICAgICAgZXhwb3J0TmFtZTogJ0JDT1MtUHJvZHVjdGlvblNlY3JldC1Bcm4nLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1N0YWdpbmdTZWNyZXRBcm4nLCB7XG4gICAgICB2YWx1ZTogdGhpcy5zdGFnaW5nU2VjcmV0LnNlY3JldEFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnU3RhZ2luZyBTZWNyZXQgQVJOJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdCQ09TLVN0YWdpbmdTZWNyZXQtQXJuJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdHaXRIdWJBY3Rpb25zUm9sZU91dHB1dCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmdpdGh1YkFjdGlvbnNSb2xlLnJvbGVBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ0dpdEh1YiBBY3Rpb25zIFJvbGUgQVJOIGZvciBDSS9DRCcsXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==