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
                            new iam.ServicePrincipal('logs.us-east-1.amazonaws.com'),
                        ],
                        actions: [
                            'kms:Encrypt',
                            'kms:Decrypt',
                            'kms:ReEncrypt*',
                            'kms:GenerateDataKey*',
                            'kms:DescribeKey',
                        ],
                        resources: ['*'],
                        conditions: {
                            ArnEquals: {
                                'kms:EncryptionContext:aws:logs:arn': `arn:aws:logs:us-east-1:${this.account}:log-group:/ecs/bcos-*`,
                            },
                        },
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
        // Stack outputs
        new cdk.CfnOutput(this, 'KMSKeyId', {
            value: this.kmsKey.keyId,
            description: 'KMS Key ID for BCOS encryption',
        });
        new cdk.CfnOutput(this, 'ECRRepositoryName', {
            value: this.ecrRepository.repositoryName,
            description: 'ECR Repository name for BCOS container images',
        });
        new cdk.CfnOutput(this, 'GitHubActionsRoleOutput', {
            value: this.githubActionsRole.roleArn,
            description: 'GitHub Actions Role ARN for CI/CD',
        });
    }
}
exports.SecurityStack = SecurityStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VjdXJpdHktc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJzZWN1cml0eS1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMseURBQTJDO0FBQzNDLHlEQUEyQztBQUMzQyx5REFBMkM7QUFDM0MsK0VBQWlFO0FBR2pFLE1BQWEsYUFBYyxTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQzFCLE1BQU0sQ0FBVTtJQUNoQixpQkFBaUIsQ0FBVztJQUM1QixvQkFBb0IsQ0FBVztJQUMvQixXQUFXLENBQVc7SUFDdEIsYUFBYSxDQUFpQjtJQUM5QixnQkFBZ0IsQ0FBd0I7SUFDeEMsYUFBYSxDQUF3QjtJQUVyRCxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQXNCO1FBQzlELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLGdDQUFnQztRQUNoQyxJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsbUJBQW1CLEVBQUU7WUFDbkQsV0FBVyxFQUFFLGdEQUFnRDtZQUM3RCxpQkFBaUIsRUFBRSxJQUFJO1lBQ3ZCLEtBQUssRUFBRSxpQkFBaUI7WUFDeEIsYUFBYSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsTUFBTTtZQUN2QyxNQUFNLEVBQUUsSUFBSSxHQUFHLENBQUMsY0FBYyxDQUFDO2dCQUM3QixVQUFVLEVBQUU7b0JBQ1YsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDO3dCQUN0QixHQUFHLEVBQUUsNkJBQTZCO3dCQUNsQyxNQUFNLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxLQUFLO3dCQUN4QixVQUFVLEVBQUUsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO3dCQUM1QyxPQUFPLEVBQUUsQ0FBQyxPQUFPLENBQUM7d0JBQ2xC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YXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuaW1wb3J0ICogYXMga21zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1rbXMnO1xuaW1wb3J0ICogYXMgZWNyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lY3InO1xuaW1wb3J0ICogYXMgc2VjcmV0c21hbmFnZXIgZnJvbSAnYXdzLWNkay1saWIvYXdzLXNlY3JldHNtYW5hZ2VyJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuXG5leHBvcnQgY2xhc3MgU2VjdXJpdHlTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIHB1YmxpYyByZWFkb25seSBrbXNLZXk6IGttcy5LZXk7XG4gIHB1YmxpYyByZWFkb25seSBnaXRodWJBY3Rpb25zUm9sZTogaWFtLlJvbGU7XG4gIHB1YmxpYyByZWFkb25seSBlY3NUYXNrRXhlY3V0aW9uUm9sZTogaWFtLlJvbGU7XG4gIHB1YmxpYyByZWFkb25seSBlY3NUYXNrUm9sZTogaWFtLlJvbGU7XG4gIHB1YmxpYyByZWFkb25seSBlY3JSZXBvc2l0b3J5OiBlY3IuUmVwb3NpdG9yeTtcbiAgcHVibGljIHJlYWRvbmx5IHByb2R1Y3Rpb25TZWNyZXQ6IHNlY3JldHNtYW5hZ2VyLlNlY3JldDtcbiAgcHVibGljIHJlYWRvbmx5IHN0YWdpbmdTZWNyZXQ6IHNlY3JldHNtYW5hZ2VyLlNlY3JldDtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wcz86IGNkay5TdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICAvLyBDcmVhdGUgS01TIGtleSBmb3IgZW5jcnlwdGlvblxuICAgIHRoaXMua21zS2V5ID0gbmV3IGttcy5LZXkodGhpcywgJ0JDT1NFbmNyeXB0aW9uS2V5Jywge1xuICAgICAgZGVzY3JpcHRpb246ICdCQ09TIGVuY3J5cHRpb24ga2V5IGZvciBsb2dzLCBzZWNyZXRzLCBhbmQgRUNSJyxcbiAgICAgIGVuYWJsZUtleVJvdGF0aW9uOiB0cnVlLFxuICAgICAgYWxpYXM6ICdiY29zLWVuY3J5cHRpb24nLFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxuICAgICAgcG9saWN5OiBuZXcgaWFtLlBvbGljeURvY3VtZW50KHtcbiAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgIHNpZDogJ0VuYWJsZSBJQU0gVXNlciBQZXJtaXNzaW9ucycsXG4gICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICBwcmluY2lwYWxzOiBbbmV3IGlhbS5BY2NvdW50Um9vdFByaW5jaXBhbCgpXSxcbiAgICAgICAgICAgIGFjdGlvbnM6IFsna21zOionXSxcbiAgICAgICAgICAgIHJlc291cmNlczogWycqJ10sXG4gICAgICAgICAgfSksXG4gICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgc2lkOiAnQWxsb3cgQ2xvdWRXYXRjaCBMb2dzJyxcbiAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgIHByaW5jaXBhbHM6IFtcbiAgICAgICAgICAgICAgbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdsb2dzLnVzLWVhc3QtMS5hbWF6b25hd3MuY29tJyksXG4gICAgICAgICAgICBdLFxuICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAna21zOkVuY3J5cHQnLFxuICAgICAgICAgICAgICAna21zOkRlY3J5cHQnLFxuICAgICAgICAgICAgICAna21zOlJlRW5jcnlwdConLFxuICAgICAgICAgICAgICAna21zOkdlbmVyYXRlRGF0YUtleSonLFxuICAgICAgICAgICAgICAna21zOkRlc2NyaWJlS2V5JyxcbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgICByZXNvdXJjZXM6IFsnKiddLFxuICAgICAgICAgICAgY29uZGl0aW9uczoge1xuICAgICAgICAgICAgICBBcm5FcXVhbHM6IHtcbiAgICAgICAgICAgICAgICAna21zOkVuY3J5cHRpb25Db250ZXh0OmF3czpsb2dzOmFybic6IGBhcm46YXdzOmxvZ3M6dXMtZWFzdC0xOiR7dGhpcy5hY2NvdW50fTpsb2ctZ3JvdXA6L2Vjcy9iY29zLSpgLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICBzaWQ6ICdBbGxvdyBFQ1IgU2VydmljZScsXG4gICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICBwcmluY2lwYWxzOiBbbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdlY3IuYW1hem9uYXdzLmNvbScpXSxcbiAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgJ2ttczpEZWNyeXB0JyxcbiAgICAgICAgICAgICAgJ2ttczpEZXNjcmliZUtleScsXG4gICAgICAgICAgICAgICdrbXM6R2VuZXJhdGVEYXRhS2V5JyxcbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgICByZXNvdXJjZXM6IFsnKiddLFxuICAgICAgICAgIH0pLFxuICAgICAgICBdLFxuICAgICAgfSksXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgRUNSIHJlcG9zaXRvcnlcbiAgICB0aGlzLmVjclJlcG9zaXRvcnkgPSBuZXcgZWNyLlJlcG9zaXRvcnkodGhpcywgJ0JDT1NSZXBvc2l0b3J5Jywge1xuICAgICAgcmVwb3NpdG9yeU5hbWU6ICdiY29zJyxcbiAgICAgIGltYWdlU2Nhbk9uUHVzaDogdHJ1ZSxcbiAgICAgIGltYWdlVGFnTXV0YWJpbGl0eTogZWNyLlRhZ011dGFiaWxpdHkuSU1NVVRBQkxFLFxuICAgICAgZW5jcnlwdGlvbktleTogdGhpcy5rbXNLZXksXG4gICAgICBsaWZlY3ljbGVSdWxlczogW1xuICAgICAgICB7XG4gICAgICAgICAgZGVzY3JpcHRpb246ICdLZWVwIGxhc3QgMTAgcHJvZHVjdGlvbiBpbWFnZXMnLFxuICAgICAgICAgIG1heEltYWdlQ291bnQ6IDEwLFxuICAgICAgICAgIHRhZ1ByZWZpeExpc3Q6IFsndicsICdyZWxlYXNlJ10sXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogJ0tlZXAgbGFzdCA1IHN0YWdpbmcgaW1hZ2VzJyxcbiAgICAgICAgICBtYXhJbWFnZUNvdW50OiA1LFxuICAgICAgICAgIHRhZ1ByZWZpeExpc3Q6IFsnc3RhZ2luZyddLFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgZGVzY3JpcHRpb246ICdEZWxldGUgdW50YWdnZWQgaW1hZ2VzIGFmdGVyIDcgZGF5cycsXG4gICAgICAgICAgbWF4SW1hZ2VBZ2U6IGNkay5EdXJhdGlvbi5kYXlzKDcpLFxuICAgICAgICAgIHRhZ1N0YXR1czogZWNyLlRhZ1N0YXR1cy5VTlRBR0dFRCxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyBHaXRIdWIgT0lEQyBQcm92aWRlclxuICAgIGNvbnN0IGdpdGh1Yk9pZGNQcm92aWRlciA9IG5ldyBpYW0uT3BlbklkQ29ubmVjdFByb3ZpZGVyKHRoaXMsICdHaXRIdWJPaWRjUHJvdmlkZXInLCB7XG4gICAgICB1cmw6ICdodHRwczovL3Rva2VuLmFjdGlvbnMuZ2l0aHVidXNlcmNvbnRlbnQuY29tJyxcbiAgICAgIGNsaWVudElkczogWydzdHMuYW1hem9uYXdzLmNvbSddLFxuICAgICAgdGh1bWJwcmludHM6IFsnNjkzOGZkNGQ5OGJhYjAzZmFhZGI5N2IzNDM5NjgzMWUzNzgwYWVhMSddLFxuICAgIH0pO1xuXG4gICAgLy8gR2l0SHViIEFjdGlvbnMgUm9sZVxuICAgIHRoaXMuZ2l0aHViQWN0aW9uc1JvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ0dpdEh1YkFjdGlvbnNSb2xlJywge1xuICAgICAgcm9sZU5hbWU6ICdCQ09TLUdpdEh1YkFjdGlvbnNEZXBsb3ltZW50Um9sZScsXG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uV2ViSWRlbnRpdHlQcmluY2lwYWwoXG4gICAgICAgIGdpdGh1Yk9pZGNQcm92aWRlci5vcGVuSWRDb25uZWN0UHJvdmlkZXJBcm4sXG4gICAgICAgIHtcbiAgICAgICAgICBTdHJpbmdFcXVhbHM6IHtcbiAgICAgICAgICAgICd0b2tlbi5hY3Rpb25zLmdpdGh1YnVzZXJjb250ZW50LmNvbTphdWQnOiAnc3RzLmFtYXpvbmF3cy5jb20nLFxuICAgICAgICAgICAgJ3Rva2VuLmFjdGlvbnMuZ2l0aHVidXNlcmNvbnRlbnQuY29tOmlzcyc6ICdodHRwczovL3Rva2VuLmFjdGlvbnMuZ2l0aHVidXNlcmNvbnRlbnQuY29tJyxcbiAgICAgICAgICB9LFxuICAgICAgICAgIFN0cmluZ0xpa2U6IHtcbiAgICAgICAgICAgICd0b2tlbi5hY3Rpb25zLmdpdGh1YnVzZXJjb250ZW50LmNvbTpzdWInOiBbXG4gICAgICAgICAgICAgICdyZXBvOnBzdGV3YXJ0L2Jjb3M6cmVmOnJlZnMvaGVhZHMvbWFpbicsXG4gICAgICAgICAgICAgICdyZXBvOnBzdGV3YXJ0L2Jjb3M6cmVmOnJlZnMvaGVhZHMvc3RhZ2luZycsXG4gICAgICAgICAgICBdLFxuICAgICAgICAgIH0sXG4gICAgICAgIH1cbiAgICAgICksXG4gICAgICBkZXNjcmlwdGlvbjogJ1JvbGUgZm9yIEdpdEh1YiBBY3Rpb25zIHRvIGRlcGxveSBCQ09TIGFwcGxpY2F0aW9uJyxcbiAgICAgIG1heFNlc3Npb25EdXJhdGlvbjogY2RrLkR1cmF0aW9uLmhvdXJzKDEpLFxuICAgIH0pO1xuXG4gICAgLy8gR2l0SHViIEFjdGlvbnMgRGVwbG95bWVudCBQb2xpY3lcbiAgICB0aGlzLmdpdGh1YkFjdGlvbnNSb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBzaWQ6ICdFQ1JBY2Nlc3MnLFxuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFsnZWNyOkdldEF1dGhvcml6YXRpb25Ub2tlbiddLFxuICAgICAgICByZXNvdXJjZXM6IFsnKiddLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgdGhpcy5naXRodWJBY3Rpb25zUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgc2lkOiAnRUNSUmVwb3NpdG9yeScsXG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICdlY3I6QmF0Y2hDaGVja0xheWVyQXZhaWxhYmlsaXR5JyxcbiAgICAgICAgICAnZWNyOkdldERvd25sb2FkVXJsRm9yTGF5ZXInLFxuICAgICAgICAgICdlY3I6QmF0Y2hHZXRJbWFnZScsXG4gICAgICAgICAgJ2VjcjpJbml0aWF0ZUxheWVyVXBsb2FkJyxcbiAgICAgICAgICAnZWNyOlVwbG9hZExheWVyUGFydCcsXG4gICAgICAgICAgJ2VjcjpDb21wbGV0ZUxheWVyVXBsb2FkJyxcbiAgICAgICAgICAnZWNyOlB1dEltYWdlJyxcbiAgICAgICAgICAnZWNyOkRlc2NyaWJlSW1hZ2VzJyxcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbdGhpcy5lY3JSZXBvc2l0b3J5LnJlcG9zaXRvcnlBcm5dLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgdGhpcy5naXRodWJBY3Rpb25zUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgc2lkOiAnRUNTQWNjZXNzJyxcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgJ2VjczpVcGRhdGVTZXJ2aWNlJyxcbiAgICAgICAgICAnZWNzOkRlc2NyaWJlU2VydmljZXMnLFxuICAgICAgICAgICdlY3M6RGVzY3JpYmVUYXNrRGVmaW5pdGlvbicsXG4gICAgICAgICAgJ2VjczpSZWdpc3RlclRhc2tEZWZpbml0aW9uJyxcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgYGFybjphd3M6ZWNzOnVzLWVhc3QtMToke3RoaXMuYWNjb3VudH06Y2x1c3Rlci9iY29zLSotY2x1c3RlcmAsXG4gICAgICAgICAgYGFybjphd3M6ZWNzOnVzLWVhc3QtMToke3RoaXMuYWNjb3VudH06c2VydmljZS9iY29zLSotY2x1c3Rlci9iY29zLSotc2VydmljZWAsXG4gICAgICAgICAgYGFybjphd3M6ZWNzOnVzLWVhc3QtMToke3RoaXMuYWNjb3VudH06dGFzay1kZWZpbml0aW9uL2Jjb3MtKmAsXG4gICAgICAgIF0sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyBFQ1MgVGFzayBFeGVjdXRpb24gUm9sZSAoZm9yIEFXUyBzZXJ2aWNlIGNhbGxzKVxuICAgIHRoaXMuZWNzVGFza0V4ZWN1dGlvblJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ0VDU1Rhc2tFeGVjdXRpb25Sb2xlJywge1xuICAgICAgcm9sZU5hbWU6ICdCQ09TLUVDU1Rhc2tFeGVjdXRpb25Sb2xlJyxcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdlY3MtdGFza3MuYW1hem9uYXdzLmNvbScpLFxuICAgICAgbWFuYWdlZFBvbGljaWVzOiBbXG4gICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnc2VydmljZS1yb2xlL0FtYXpvbkVDU1Rhc2tFeGVjdXRpb25Sb2xlUG9saWN5JyksXG4gICAgICBdLFxuICAgICAgZGVzY3JpcHRpb246ICdFQ1MgVGFzayBFeGVjdXRpb24gUm9sZSBmb3IgQkNPUyBhcHBsaWNhdGlvbicsXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgS01TIHBlcm1pc3Npb25zIHRvIGV4ZWN1dGlvbiByb2xlXG4gICAgdGhpcy5lY3NUYXNrRXhlY3V0aW9uUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbJ2ttczpEZWNyeXB0JywgJ2ttczpEZXNjcmliZUtleSddLFxuICAgICAgICByZXNvdXJjZXM6IFt0aGlzLmttc0tleS5rZXlBcm5dLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gRUNTIFRhc2sgUm9sZSAoZm9yIGFwcGxpY2F0aW9uIHJ1bnRpbWUgcGVybWlzc2lvbnMpXG4gICAgdGhpcy5lY3NUYXNrUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnRUNTVGFza1JvbGUnLCB7XG4gICAgICByb2xlTmFtZTogJ0JDT1MtRUNTVGFza1JvbGUnLFxuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2Vjcy10YXNrcy5hbWF6b25hd3MuY29tJyksXG4gICAgICBkZXNjcmlwdGlvbjogJ0VDUyBUYXNrIFJvbGUgZm9yIEJDT1MgYXBwbGljYXRpb24gcnVudGltZSBwZXJtaXNzaW9ucycsXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgU2VjcmV0cyBNYW5hZ2VyIHNlY3JldHNcbiAgICB0aGlzLnByb2R1Y3Rpb25TZWNyZXQgPSBuZXcgc2VjcmV0c21hbmFnZXIuU2VjcmV0KHRoaXMsICdQcm9kdWN0aW9uU2VjcmV0cycsIHtcbiAgICAgIHNlY3JldE5hbWU6ICdwcm9kdWN0aW9uL2Jjb3Mtc2VjcmV0cycsXG4gICAgICBkZXNjcmlwdGlvbjogJ1Byb2R1Y3Rpb24gc2VjcmV0cyBmb3IgQkNPUyBhcHBsaWNhdGlvbicsXG4gICAgICBlbmNyeXB0aW9uS2V5OiB0aGlzLmttc0tleSxcbiAgICAgIGdlbmVyYXRlU2VjcmV0U3RyaW5nOiB7XG4gICAgICAgIHNlY3JldFN0cmluZ1RlbXBsYXRlOiBKU09OLnN0cmluZ2lmeSh7IFxuICAgICAgICAgIE5PREVfRU5WOiAncHJvZHVjdGlvbicsXG4gICAgICAgICAgUE9SVDogJzQwMDEnXG4gICAgICAgIH0pLFxuICAgICAgICBnZW5lcmF0ZVN0cmluZ0tleTogJ0pXVF9TRUNSRVQnLFxuICAgICAgICBleGNsdWRlQ2hhcmFjdGVyczogJ1wiQC9cXFxcJyxcbiAgICAgICAgaW5jbHVkZVNwYWNlOiBmYWxzZSxcbiAgICAgICAgcGFzc3dvcmRMZW5ndGg6IDY0LFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIHRoaXMuc3RhZ2luZ1NlY3JldCA9IG5ldyBzZWNyZXRzbWFuYWdlci5TZWNyZXQodGhpcywgJ1N0YWdpbmdTZWNyZXRzJywge1xuICAgICAgc2VjcmV0TmFtZTogJ3N0YWdpbmcvYmNvcy1zZWNyZXRzJyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU3RhZ2luZyBzZWNyZXRzIGZvciBCQ09TIGFwcGxpY2F0aW9uJyxcbiAgICAgIGVuY3J5cHRpb25LZXk6IHRoaXMua21zS2V5LFxuICAgICAgZ2VuZXJhdGVTZWNyZXRTdHJpbmc6IHtcbiAgICAgICAgc2VjcmV0U3RyaW5nVGVtcGxhdGU6IEpTT04uc3RyaW5naWZ5KHsgXG4gICAgICAgICAgTk9ERV9FTlY6ICdzdGFnaW5nJyxcbiAgICAgICAgICBQT1JUOiAnNDAwMSdcbiAgICAgICAgfSksXG4gICAgICAgIGdlbmVyYXRlU3RyaW5nS2V5OiAnSldUX1NFQ1JFVCcsXG4gICAgICAgIGV4Y2x1ZGVDaGFyYWN0ZXJzOiAnXCJAL1xcXFwnLFxuICAgICAgICBpbmNsdWRlU3BhY2U6IGZhbHNlLFxuICAgICAgICBwYXNzd29yZExlbmd0aDogNjQsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gR3JhbnQgc2VjcmV0cyBhY2Nlc3MgdG8gdGFzayByb2xlXG4gICAgdGhpcy5wcm9kdWN0aW9uU2VjcmV0LmdyYW50UmVhZCh0aGlzLmVjc1Rhc2tSb2xlKTtcbiAgICB0aGlzLnN0YWdpbmdTZWNyZXQuZ3JhbnRSZWFkKHRoaXMuZWNzVGFza1JvbGUpO1xuXG4gICAgLy8gR3JhbnQgc2VjcmV0cyBhY2Nlc3MgdG8gdGFzayBleGVjdXRpb24gcm9sZSAoZm9yIHB1bGxpbmcgc2VjcmV0cylcbiAgICB0aGlzLnByb2R1Y3Rpb25TZWNyZXQuZ3JhbnRSZWFkKHRoaXMuZWNzVGFza0V4ZWN1dGlvblJvbGUpO1xuICAgIHRoaXMuc3RhZ2luZ1NlY3JldC5ncmFudFJlYWQodGhpcy5lY3NUYXNrRXhlY3V0aW9uUm9sZSk7XG5cbiAgICAvLyBBbGxvdyBHaXRIdWIgQWN0aW9ucyB0byBwYXNzIEVDUyByb2xlc1xuICAgIHRoaXMuZ2l0aHViQWN0aW9uc1JvbGUuYWRkVG9Qb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIHNpZDogJ1Bhc3NSb2xlJyxcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbJ2lhbTpQYXNzUm9sZSddLFxuICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICB0aGlzLmVjc1Rhc2tFeGVjdXRpb25Sb2xlLnJvbGVBcm4sXG4gICAgICAgICAgdGhpcy5lY3NUYXNrUm9sZS5yb2xlQXJuLFxuICAgICAgICBdLFxuICAgICAgICBjb25kaXRpb25zOiB7XG4gICAgICAgICAgU3RyaW5nRXF1YWxzOiB7XG4gICAgICAgICAgICAnaWFtOlBhc3NlZFRvU2VydmljZSc6ICdlY3MtdGFza3MuYW1hem9uYXdzLmNvbScsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIFN0YWNrIG91dHB1dHNcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnS01TS2V5SWQnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5rbXNLZXkua2V5SWQsXG4gICAgICBkZXNjcmlwdGlvbjogJ0tNUyBLZXkgSUQgZm9yIEJDT1MgZW5jcnlwdGlvbicsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRUNSUmVwb3NpdG9yeU5hbWUnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5lY3JSZXBvc2l0b3J5LnJlcG9zaXRvcnlOYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdFQ1IgUmVwb3NpdG9yeSBuYW1lIGZvciBCQ09TIGNvbnRhaW5lciBpbWFnZXMnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0dpdEh1YkFjdGlvbnNSb2xlT3V0cHV0Jywge1xuICAgICAgdmFsdWU6IHRoaXMuZ2l0aHViQWN0aW9uc1JvbGUucm9sZUFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnR2l0SHViIEFjdGlvbnMgUm9sZSBBUk4gZm9yIENJL0NEJyxcbiAgICB9KTtcbiAgfVxufVxuIl19