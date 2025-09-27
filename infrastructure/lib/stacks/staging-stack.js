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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StagingStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const ecs = __importStar(require("aws-cdk-lib/aws-ecs"));
const elbv2 = __importStar(require("aws-cdk-lib/aws-elasticloadbalancingv2"));
const route53 = __importStar(require("aws-cdk-lib/aws-route53"));
const route53targets = __importStar(require("aws-cdk-lib/aws-route53-targets"));
const waf_protection_1 = require("../constructs/waf-protection");
const staging_json_1 = __importDefault(require("../../config/staging.json"));
class StagingStack extends cdk.Stack {
    ecsCluster;
    targetGroup;
    wafProtection;
    constructor(scope, id, props) {
        super(scope, id, props);
        const environment = 'staging';
        // Get VPC ID from context or environment variable
        const vpcId = this.node.tryGetContext('vpcId') || process.env.VPC_ID;
        if (!vpcId) {
            throw new Error('VPC_ID must be provided via context or environment variable');
        }
        // Look up VPC using context value
        const vpc = cdk.aws_ec2.Vpc.fromLookup(this, 'VPC', {
            vpcId: vpcId,
        });
        // Import values from other stacks using CloudFormation exports
        const kmsKeyArn = cdk.Fn.importValue('BCOS-KMS-Key-Arn');
        const ecrRepositoryArn = cdk.Fn.importValue('BCOS-ECRRepository-Arn');
        const ecsTaskExecutionRoleArn = cdk.Fn.importValue('BCOS-ECSTaskExecutionRole-Arn');
        const ecsTaskRoleArn = cdk.Fn.importValue('BCOS-ECSTaskRole-Arn');
        const stagingSecretArn = cdk.Fn.importValue('BCOS-StagingSecret-Arn');
        const albArn = cdk.Fn.importValue('BCOS-LoadBalancer-Arn');
        const albDnsName = cdk.Fn.importValue('BCOS-LoadBalancer-DnsName');
        const albCanonicalHostedZoneId = cdk.Fn.importValue('BCOS-LoadBalancer-CanonicalHostedZoneId');
        const httpsListenerArn = cdk.Fn.importValue('BCOS-HTTPSListener-Arn');
        const hostedZoneId = cdk.Fn.importValue('BCOS-HostedZone-Id');
        const ecsSecurityGroupId = cdk.Fn.importValue('BCOS-ECSSecurityGroup-Id');
        // Import KMS key
        const kmsKey = cdk.aws_kms.Key.fromKeyArn(this, 'KMSKey', kmsKeyArn);
        // Import ECR repository using attributes (required for tokens)
        const ecrRepository = cdk.aws_ecr.Repository.fromRepositoryAttributes(this, 'ECRRepository', {
            repositoryArn: ecrRepositoryArn,
            repositoryName: 'bcos',
        });
        // Import IAM roles
        const executionRole = cdk.aws_iam.Role.fromRoleArn(this, 'ExecutionRole', ecsTaskExecutionRoleArn);
        const taskRole = cdk.aws_iam.Role.fromRoleArn(this, 'TaskRole', ecsTaskRoleArn);
        // Import secret
        const secret = cdk.aws_secretsmanager.Secret.fromSecretCompleteArn(this, 'Secret', stagingSecretArn);
        // Import load balancer and listener
        const loadBalancer = cdk.aws_elasticloadbalancingv2.ApplicationLoadBalancer.fromApplicationLoadBalancerAttributes(this, 'LoadBalancer', {
            loadBalancerArn: albArn,
            loadBalancerDnsName: albDnsName,
            loadBalancerCanonicalHostedZoneId: albCanonicalHostedZoneId,
            securityGroupId: ecsSecurityGroupId,
        });
        const httpsListener = cdk.aws_elasticloadbalancingv2.ApplicationListener.fromApplicationListenerAttributes(this, 'HTTPSListener', {
            listenerArn: httpsListenerArn,
            securityGroup: cdk.aws_ec2.SecurityGroup.fromSecurityGroupId(this, 'ALBSecurityGroup', ecsSecurityGroupId),
        });
        // Import hosted zone using attributes (provides zoneName)
        const hostedZone = cdk.aws_route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
            hostedZoneId: hostedZoneId,
            zoneName: 'bendcare.com',
        });
        // Import ECS security group
        const ecsSecurityGroup = cdk.aws_ec2.SecurityGroup.fromSecurityGroupId(this, 'ECSSecurityGroup', ecsSecurityGroupId);
        // Create ECS Cluster
        this.ecsCluster = new ecs.Cluster(this, 'StagingCluster', {
            clusterName: staging_json_1.default.ecs.clusterName,
            vpc: vpc,
            containerInsights: staging_json_1.default.monitoring.detailedMonitoring,
            enableFargateCapacityProviders: true,
        });
        // Note: Task Definition and ECS Service are managed by GitHub Actions
        // CDK only creates infrastructure: cluster, target groups, security groups, DNS
        // Create target group for staging
        this.targetGroup = new elbv2.ApplicationTargetGroup(this, 'StagingTargetGroup', {
            targetGroupName: 'bcos-staging-tg',
            vpc: vpc,
            port: 3000,
            protocol: elbv2.ApplicationProtocol.HTTP,
            targetType: elbv2.TargetType.IP,
            healthCheck: {
                enabled: true,
                path: '/api/health',
                protocol: elbv2.Protocol.HTTP,
                port: '3000',
                interval: cdk.Duration.seconds(30),
                timeout: cdk.Duration.seconds(10),
                healthyThresholdCount: 2,
                unhealthyThresholdCount: 5,
                healthyHttpCodes: '200',
            },
        });
        // ECS Service will be created and managed by GitHub Actions deployment pipeline
        // Add listener rule for staging subdomain
        new elbv2.ApplicationListenerRule(this, 'StagingListenerRule', {
            listener: httpsListener,
            priority: 100,
            conditions: [elbv2.ListenerCondition.hostHeaders([staging_json_1.default.domain])],
            action: elbv2.ListenerAction.forward([this.targetGroup]),
        });
        // Create Route53 record for staging domain
        new route53.ARecord(this, 'StagingARecord', {
            zone: hostedZone,
            recordName: 'staging',
            target: route53.RecordTarget.fromAlias(new route53targets.LoadBalancerTarget(loadBalancer)),
        });
        // Create WAF protection
        this.wafProtection = new waf_protection_1.WafProtection(this, 'WAFProtection', {
            environment: environment,
            kmsKey: kmsKey,
            rateLimitPerIP: staging_json_1.default.waf.rateLimitPerIP,
            enableGeoBlocking: false,
            enableManagedRules: true,
        });
        // Associate WAF with load balancer
        this.wafProtection.associateWithLoadBalancer(albArn);
        // Create monitoring
        // Monitoring will be configured after ECS service is created by GitHub Actions
        // Auto scaling will be configured after ECS service is created by GitHub Actions
        // Apply tags
        Object.entries(staging_json_1.default.tags).forEach(([key, value]) => {
            cdk.Tags.of(this).add(key, value);
        });
        // Stack outputs
        new cdk.CfnOutput(this, 'StagingClusterName', {
            value: this.ecsCluster.clusterName,
            description: 'Staging ECS Cluster Name',
            exportName: 'BCOS-Staging-ClusterName',
        });
        new cdk.CfnOutput(this, 'StagingURL', {
            value: `https://${staging_json_1.default.domain}`,
            description: 'Staging Application URL',
            exportName: 'BCOS-Staging-URL',
        });
        new cdk.CfnOutput(this, 'StagingTargetGroupArn', {
            value: this.targetGroup.targetGroupArn,
            description: 'Staging Target Group ARN for GitHub Actions',
            exportName: 'BCOS-Staging-TargetGroupArn',
        });
    }
}
exports.StagingStack = StagingStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhZ2luZy1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInN0YWdpbmctc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLHlEQUEyQztBQUMzQyw4RUFBZ0U7QUFDaEUsaUVBQW1EO0FBQ25ELGdGQUFrRTtBQUtsRSxpRUFBNkQ7QUFDN0QsNkVBQXNEO0FBTXRELE1BQWEsWUFBYSxTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQ3pCLFVBQVUsQ0FBYztJQUN4QixXQUFXLENBQStCO0lBQzFDLGFBQWEsQ0FBZ0I7SUFFN0MsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUF3QjtRQUNoRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixNQUFNLFdBQVcsR0FBRyxTQUFTLENBQUM7UUFFOUIsa0RBQWtEO1FBQ2xELE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQyxJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDO1FBQ3JFLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNYLE1BQU0sSUFBSSxLQUFLLENBQUMsNkRBQTZELENBQUMsQ0FBQztRQUNqRixDQUFDO1FBRUQsa0NBQWtDO1FBQ2xDLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxJQUFJLEVBQUUsS0FBSyxFQUFFO1lBQ2xELEtBQUssRUFBRSxLQUFLO1NBQ2IsQ0FBQyxDQUFDO1FBRUgsK0RBQStEO1FBQy9ELE1BQU0sU0FBUyxHQUFHLEdBQUcsQ0FBQyxFQUFFLENBQUMsV0FBVyxDQUFDLGtCQUFrQixDQUFDLENBQUM7UUFDekQsTUFBTSxnQkFBZ0IsR0FBRyxHQUFHLENBQUMsRUFBRSxDQUFDLFdBQVcsQ0FBQyx3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QyxPQUFPLENBQUMsc0JBQWEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsRUFBRSxFQUFFO1lBQzFELEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDcEMsQ0FBQyxDQUFDLENBQUM7UUFFSCxnQkFBZ0I7UUFDaEIsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxvQkFBb0IsRUFBRTtZQUM1QyxLQUFLLEVBQUUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxXQUFXO1lBQ2xDLFdBQVcsRUFBRSwwQkFBMEI7WUFDdkMsVUFBVSxFQUFFLDBCQUEwQjtTQUN2QyxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLFlBQVksRUFBRTtZQUNwQyxLQUFLLEVBQUUsV0FBVyxzQkFBYSxDQUFDLE1BQU0sRUFBRTtZQUN4QyxXQUFXLEVBQUUseUJBQXlCO1lBQ3RDLFVBQVUsRUFBRSxrQkFBa0I7U0FDL0IsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSx1QkFBdUIsRUFBRTtZQUMvQyxLQUFLLEVBQUUsSUFBSSxDQUFDLFdBQVcsQ0FBQyxjQUFjO1lBQ3RDLFdBQVcsRUFBRSw2Q0FBNkM7WUFDMUQsVUFBVSxFQUFFLDZCQUE2QjtTQUMxQyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUFuS0Qsb0NBbUtDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIGVjcyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWNzJztcbmltcG9ydCAqIGFzIGVsYnYyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lbGFzdGljbG9hZGJhbGFuY2luZ3YyJztcbmltcG9ydCAqIGFzIHJvdXRlNTMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXJvdXRlNTMnO1xuaW1wb3J0ICogYXMgcm91dGU1M3RhcmdldHMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXJvdXRlNTMtdGFyZ2V0cyc7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCB7IFNlY3VyaXR5U3RhY2sgfSBmcm9tICcuL3NlY3VyaXR5LXN0YWNrJztcbmltcG9ydCB7IE5ldHdvcmtTdGFjayB9IGZyb20gJy4vbmV0d29yay1zdGFjayc7XG5pbXBvcnQgeyBTZWN1cmVDb250YWluZXIgfSBmcm9tICcuLi9jb25zdHJ1Y3RzL3NlY3VyZS1jb250YWluZXInO1xuaW1wb3J0IHsgV2FmUHJvdGVjdGlvbiB9IGZyb20gJy4uL2NvbnN0cnVjdHMvd2FmLXByb3RlY3Rpb24nO1xuaW1wb3J0IHN0YWdpbmdDb25maWcgZnJvbSAnLi4vLi4vY29uZmlnL3N0YWdpbmcuanNvbic7XG5cbmludGVyZmFjZSBTdGFnaW5nU3RhY2tQcm9wcyBleHRlbmRzIGNkay5TdGFja1Byb3BzIHtcbiAgLy8gTm8gZGlyZWN0IHJlZmVyZW5jZXMgLSB1c2UgQ0RLIG91dHB1dHMvaW1wb3J0cyBpbnN0ZWFkXG59XG5cbmV4cG9ydCBjbGFzcyBTdGFnaW5nU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBwdWJsaWMgcmVhZG9ubHkgZWNzQ2x1c3RlcjogZWNzLkNsdXN0ZXI7XG4gIHB1YmxpYyByZWFkb25seSB0YXJnZXRHcm91cDogZWxidjIuQXBwbGljYXRpb25UYXJnZXRHcm91cDtcbiAgcHVibGljIHJlYWRvbmx5IHdhZlByb3RlY3Rpb246IFdhZlByb3RlY3Rpb247XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IFN0YWdpbmdTdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICBjb25zdCBlbnZpcm9ubWVudCA9ICdzdGFnaW5nJztcblxuICAgIC8vIEdldCBWUEMgSUQgZnJvbSBjb250ZXh0IG9yIGVudmlyb25tZW50IHZhcmlhYmxlXG4gICAgY29uc3QgdnBjSWQgPSB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgndnBjSWQnKSB8fCBwcm9jZXNzLmVudi5WUENfSUQ7XG4gICAgaWYgKCF2cGNJZCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdWUENfSUQgbXVzdCBiZSBwcm92aWRlZCB2aWEgY29udGV4dCBvciBlbnZpcm9ubWVudCB2YXJpYWJsZScpO1xuICAgIH1cblxuICAgIC8vIExvb2sgdXAgVlBDIHVzaW5nIGNvbnRleHQgdmFsdWVcbiAgICBjb25zdCB2cGMgPSBjZGsuYXdzX2VjMi5WcGMuZnJvbUxvb2t1cCh0aGlzLCAnVlBDJywge1xuICAgICAgdnBjSWQ6IHZwY0lkLFxuICAgIH0pO1xuXG4gICAgLy8gSW1wb3J0IHZhbHVlcyBmcm9tIG90aGVyIHN0YWNrcyB1c2luZyBDbG91ZEZvcm1hdGlvbiBleHBvcnRzXG4gICAgY29uc3Qga21zS2V5QXJuID0gY2RrLkZuLmltcG9ydFZhbHVlKCdCQ09TLUtNUy1LZXktQXJuJyk7XG4gICAgY29uc3QgZWNyUmVwb3NpdG9yeUFybiA9IGNkay5Gbi5pbXBvcnRWYWx1ZSgnQkNPUy1FQ1JSZXBvc2l0b3J5LUFybicpO1xuICAgIGNvbnN0IGVjc1Rhc2tFeGVjdXRpb25Sb2xlQXJuID0gY2RrLkZuLmltcG9ydFZhbHVlKCdCQ09TLUVDU1Rhc2tFeGVjdXRpb25Sb2xlLUFybicpO1xuICAgIGNvbnN0IGVjc1Rhc2tSb2xlQXJuID0gY2RrLkZuLmltcG9ydFZhbHVlKCdCQ09TLUVDU1Rhc2tSb2xlLUFybicpO1xuICAgIGNvbnN0IHN0YWdpbmdTZWNyZXRBcm4gPSBjZGsuRm4uaW1wb3J0VmFsdWUoJ0JDT1MtU3RhZ2luZ1NlY3JldC1Bcm4nKTtcbiAgICBjb25zdCBhbGJBcm4gPSBjZGsuRm4uaW1wb3J0VmFsdWUoJ0JDT1MtTG9hZEJhbGFuY2VyLUFybicpO1xuICAgIGNvbnN0IGFsYkRuc05hbWUgPSBjZGsuRm4uaW1wb3J0VmFsdWUoJ0JDT1MtTG9hZEJhbGFuY2VyLURuc05hbWUnKTtcbiAgICBjb25zdCBhbGJDYW5vbmljYWxIb3N0ZWRab25lSWQgPSBjZGsuRm4uaW1wb3J0VmFsdWUoJ0JDT1MtTG9hZEJhbGFuY2VyLUNhbm9uaWNhbEhvc3RlZFpvbmVJZCcpO1xuICAgIGNvbnN0IGh0dHBzTGlzdGVuZXJBcm4gPSBjZGsuRm4uaW1wb3J0VmFsdWUoJ0JDT1MtSFRUUFNMaXN0ZW5lci1Bcm4nKTtcbiAgICBjb25zdCBob3N0ZWRab25lSWQgPSBjZGsuRm4uaW1wb3J0VmFsdWUoJ0JDT1MtSG9zdGVkWm9uZS1JZCcpO1xuICAgIGNvbnN0IGVjc1NlY3VyaXR5R3JvdXBJZCA9IGNkay5Gbi5pbXBvcnRWYWx1ZSgnQkNPUy1FQ1NTZWN1cml0eUdyb3VwLUlkJyk7XG5cbiAgICAvLyBJbXBvcnQgS01TIGtleVxuICAgIGNvbnN0IGttc0tleSA9IGNkay5hd3Nfa21zLktleS5mcm9tS2V5QXJuKHRoaXMsICdLTVNLZXknLCBrbXNLZXlBcm4pO1xuXG4gICAgLy8gSW1wb3J0IEVDUiByZXBvc2l0b3J5IHVzaW5nIGF0dHJpYnV0ZXMgKHJlcXVpcmVkIGZvciB0b2tlbnMpXG4gICAgY29uc3QgZWNyUmVwb3NpdG9yeSA9IGNkay5hd3NfZWNyLlJlcG9zaXRvcnkuZnJvbVJlcG9zaXRvcnlBdHRyaWJ1dGVzKHRoaXMsICdFQ1JSZXBvc2l0b3J5Jywge1xuICAgICAgcmVwb3NpdG9yeUFybjogZWNyUmVwb3NpdG9yeUFybixcbiAgICAgIHJlcG9zaXRvcnlOYW1lOiAnYmNvcycsXG4gICAgfSk7XG5cbiAgICAvLyBJbXBvcnQgSUFNIHJvbGVzXG4gICAgY29uc3QgZXhlY3V0aW9uUm9sZSA9IGNkay5hd3NfaWFtLlJvbGUuZnJvbVJvbGVBcm4odGhpcywgJ0V4ZWN1dGlvblJvbGUnLCBlY3NUYXNrRXhlY3V0aW9uUm9sZUFybik7XG4gICAgY29uc3QgdGFza1JvbGUgPSBjZGsuYXdzX2lhbS5Sb2xlLmZyb21Sb2xlQXJuKHRoaXMsICdUYXNrUm9sZScsIGVjc1Rhc2tSb2xlQXJuKTtcblxuICAgIC8vIEltcG9ydCBzZWNyZXRcbiAgICBjb25zdCBzZWNyZXQgPSBjZGsuYXdzX3NlY3JldHNtYW5hZ2VyLlNlY3JldC5mcm9tU2VjcmV0Q29tcGxldGVBcm4odGhpcywgJ1NlY3JldCcsIHN0YWdpbmdTZWNyZXRBcm4pO1xuXG4gICAgLy8gSW1wb3J0IGxvYWQgYmFsYW5jZXIgYW5kIGxpc3RlbmVyXG4gICAgY29uc3QgbG9hZEJhbGFuY2VyID0gY2RrLmF3c19lbGFzdGljbG9hZGJhbGFuY2luZ3YyLkFwcGxpY2F0aW9uTG9hZEJhbGFuY2VyLmZyb21BcHBsaWNhdGlvbkxvYWRCYWxhbmNlckF0dHJpYnV0ZXModGhpcywgJ0xvYWRCYWxhbmNlcicsIHtcbiAgICAgIGxvYWRCYWxhbmNlckFybjogYWxiQXJuLFxuICAgICAgbG9hZEJhbGFuY2VyRG5zTmFtZTogYWxiRG5zTmFtZSxcbiAgICAgIGxvYWRCYWxhbmNlckNhbm9uaWNhbEhvc3RlZFpvbmVJZDogYWxiQ2Fub25pY2FsSG9zdGVkWm9uZUlkLFxuICAgICAgc2VjdXJpdHlHcm91cElkOiBlY3NTZWN1cml0eUdyb3VwSWQsXG4gICAgfSk7XG5cbiAgICBjb25zdCBodHRwc0xpc3RlbmVyID0gY2RrLmF3c19lbGFzdGljbG9hZGJhbGFuY2luZ3YyLkFwcGxpY2F0aW9uTGlzdGVuZXIuZnJvbUFwcGxpY2F0aW9uTGlzdGVuZXJBdHRyaWJ1dGVzKHRoaXMsICdIVFRQU0xpc3RlbmVyJywge1xuICAgICAgbGlzdGVuZXJBcm46IGh0dHBzTGlzdGVuZXJBcm4sXG4gICAgICBzZWN1cml0eUdyb3VwOiBjZGsuYXdzX2VjMi5TZWN1cml0eUdyb3VwLmZyb21TZWN1cml0eUdyb3VwSWQodGhpcywgJ0FMQlNlY3VyaXR5R3JvdXAnLCBlY3NTZWN1cml0eUdyb3VwSWQpLFxuICAgIH0pO1xuXG4gICAgLy8gSW1wb3J0IGhvc3RlZCB6b25lIHVzaW5nIGF0dHJpYnV0ZXMgKHByb3ZpZGVzIHpvbmVOYW1lKVxuICAgIGNvbnN0IGhvc3RlZFpvbmUgPSBjZGsuYXdzX3JvdXRlNTMuSG9zdGVkWm9uZS5mcm9tSG9zdGVkWm9uZUF0dHJpYnV0ZXModGhpcywgJ0hvc3RlZFpvbmUnLCB7XG4gICAgICBob3N0ZWRab25lSWQ6IGhvc3RlZFpvbmVJZCxcbiAgICAgIHpvbmVOYW1lOiAnYmVuZGNhcmUuY29tJyxcbiAgICB9KTtcblxuICAgIC8vIEltcG9ydCBFQ1Mgc2VjdXJpdHkgZ3JvdXBcbiAgICBjb25zdCBlY3NTZWN1cml0eUdyb3VwID0gY2RrLmF3c19lYzIuU2VjdXJpdHlHcm91cC5mcm9tU2VjdXJpdHlHcm91cElkKHRoaXMsICdFQ1NTZWN1cml0eUdyb3VwJywgZWNzU2VjdXJpdHlHcm91cElkKTtcblxuICAgIC8vIENyZWF0ZSBFQ1MgQ2x1c3RlclxuICAgIHRoaXMuZWNzQ2x1c3RlciA9IG5ldyBlY3MuQ2x1c3Rlcih0aGlzLCAnU3RhZ2luZ0NsdXN0ZXInLCB7XG4gICAgICBjbHVzdGVyTmFtZTogc3RhZ2luZ0NvbmZpZy5lY3MuY2x1c3Rlck5hbWUsXG4gICAgICB2cGM6IHZwYyxcbiAgICAgIGNvbnRhaW5lckluc2lnaHRzOiBzdGFnaW5nQ29uZmlnLm1vbml0b3JpbmcuZGV0YWlsZWRNb25pdG9yaW5nLFxuICAgICAgZW5hYmxlRmFyZ2F0ZUNhcGFjaXR5UHJvdmlkZXJzOiB0cnVlLFxuICAgIH0pO1xuXG4gICAgLy8gTm90ZTogVGFzayBEZWZpbml0aW9uIGFuZCBFQ1MgU2VydmljZSBhcmUgbWFuYWdlZCBieSBHaXRIdWIgQWN0aW9uc1xuICAgIC8vIENESyBvbmx5IGNyZWF0ZXMgaW5mcmFzdHJ1Y3R1cmU6IGNsdXN0ZXIsIHRhcmdldCBncm91cHMsIHNlY3VyaXR5IGdyb3VwcywgRE5TXG5cbiAgICAvLyBDcmVhdGUgdGFyZ2V0IGdyb3VwIGZvciBzdGFnaW5nXG4gICAgdGhpcy50YXJnZXRHcm91cCA9IG5ldyBlbGJ2Mi5BcHBsaWNhdGlvblRhcmdldEdyb3VwKHRoaXMsICdTdGFnaW5nVGFyZ2V0R3JvdXAnLCB7XG4gICAgICB0YXJnZXRHcm91cE5hbWU6ICdiY29zLXN0YWdpbmctdGcnLFxuICAgICAgdnBjOiB2cGMsXG4gICAgICBwb3J0OiAzMDAwLFxuICAgICAgcHJvdG9jb2w6IGVsYnYyLkFwcGxpY2F0aW9uUHJvdG9jb2wuSFRUUCxcbiAgICAgIHRhcmdldFR5cGU6IGVsYnYyLlRhcmdldFR5cGUuSVAsXG4gICAgICBoZWFsdGhDaGVjazoge1xuICAgICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgICBwYXRoOiAnL2FwaS9oZWFsdGgnLFxuICAgICAgICBwcm90b2NvbDogZWxidjIuUHJvdG9jb2wuSFRUUCxcbiAgICAgICAgcG9ydDogJzMwMDAnLFxuICAgICAgICBpbnRlcnZhbDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygxMCksXG4gICAgICAgIGhlYWx0aHlUaHJlc2hvbGRDb3VudDogMixcbiAgICAgICAgdW5oZWFsdGh5VGhyZXNob2xkQ291bnQ6IDUsXG4gICAgICAgIGhlYWx0aHlIdHRwQ29kZXM6ICcyMDAnLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIEVDUyBTZXJ2aWNlIHdpbGwgYmUgY3JlYXRlZCBhbmQgbWFuYWdlZCBieSBHaXRIdWIgQWN0aW9ucyBkZXBsb3ltZW50IHBpcGVsaW5lXG5cbiAgICAvLyBBZGQgbGlzdGVuZXIgcnVsZSBmb3Igc3RhZ2luZyBzdWJkb21haW5cbiAgICBuZXcgZWxidjIuQXBwbGljYXRpb25MaXN0ZW5lclJ1bGUodGhpcywgJ1N0YWdpbmdMaXN0ZW5lclJ1bGUnLCB7XG4gICAgICBsaXN0ZW5lcjogaHR0cHNMaXN0ZW5lcixcbiAgICAgIHByaW9yaXR5OiAxMDAsXG4gICAgICBjb25kaXRpb25zOiBbZWxidjIuTGlzdGVuZXJDb25kaXRpb24uaG9zdEhlYWRlcnMoW3N0YWdpbmdDb25maWcuZG9tYWluXSldLFxuICAgICAgYWN0aW9uOiBlbGJ2Mi5MaXN0ZW5lckFjdGlvbi5mb3J3YXJkKFt0aGlzLnRhcmdldEdyb3VwXSksXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgUm91dGU1MyByZWNvcmQgZm9yIHN0YWdpbmcgZG9tYWluXG4gICAgbmV3IHJvdXRlNTMuQVJlY29yZCh0aGlzLCAnU3RhZ2luZ0FSZWNvcmQnLCB7XG4gICAgICB6b25lOiBob3N0ZWRab25lLFxuICAgICAgcmVjb3JkTmFtZTogJ3N0YWdpbmcnLFxuICAgICAgdGFyZ2V0OiByb3V0ZTUzLlJlY29yZFRhcmdldC5mcm9tQWxpYXMoXG4gICAgICAgIG5ldyByb3V0ZTUzdGFyZ2V0cy5Mb2FkQmFsYW5jZXJUYXJnZXQobG9hZEJhbGFuY2VyKVxuICAgICAgKSxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBXQUYgcHJvdGVjdGlvblxuICAgIHRoaXMud2FmUHJvdGVjdGlvbiA9IG5ldyBXYWZQcm90ZWN0aW9uKHRoaXMsICdXQUZQcm90ZWN0aW9uJywge1xuICAgICAgZW52aXJvbm1lbnQ6IGVudmlyb25tZW50LFxuICAgICAga21zS2V5OiBrbXNLZXksXG4gICAgICByYXRlTGltaXRQZXJJUDogc3RhZ2luZ0NvbmZpZy53YWYucmF0ZUxpbWl0UGVySVAsXG4gICAgICBlbmFibGVHZW9CbG9ja2luZzogZmFsc2UsXG4gICAgICBlbmFibGVNYW5hZ2VkUnVsZXM6IHRydWUsXG4gICAgfSk7XG5cbiAgICAvLyBBc3NvY2lhdGUgV0FGIHdpdGggbG9hZCBiYWxhbmNlclxuICAgIHRoaXMud2FmUHJvdGVjdGlvbi5hc3NvY2lhdGVXaXRoTG9hZEJhbGFuY2VyKGFsYkFybik7XG5cbiAgICAvLyBDcmVhdGUgbW9uaXRvcmluZ1xuICAgIC8vIE1vbml0b3Jpbmcgd2lsbCBiZSBjb25maWd1cmVkIGFmdGVyIEVDUyBzZXJ2aWNlIGlzIGNyZWF0ZWQgYnkgR2l0SHViIEFjdGlvbnNcblxuICAgIC8vIEF1dG8gc2NhbGluZyB3aWxsIGJlIGNvbmZpZ3VyZWQgYWZ0ZXIgRUNTIHNlcnZpY2UgaXMgY3JlYXRlZCBieSBHaXRIdWIgQWN0aW9uc1xuXG4gICAgLy8gQXBwbHkgdGFnc1xuICAgIE9iamVjdC5lbnRyaWVzKHN0YWdpbmdDb25maWcudGFncykuZm9yRWFjaCgoW2tleSwgdmFsdWVdKSA9PiB7XG4gICAgICBjZGsuVGFncy5vZih0aGlzKS5hZGQoa2V5LCB2YWx1ZSk7XG4gICAgfSk7XG5cbiAgICAvLyBTdGFjayBvdXRwdXRzXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1N0YWdpbmdDbHVzdGVyTmFtZScsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmVjc0NsdXN0ZXIuY2x1c3Rlck5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ1N0YWdpbmcgRUNTIENsdXN0ZXIgTmFtZScsXG4gICAgICBleHBvcnROYW1lOiAnQkNPUy1TdGFnaW5nLUNsdXN0ZXJOYW1lJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdTdGFnaW5nVVJMJywge1xuICAgICAgdmFsdWU6IGBodHRwczovLyR7c3RhZ2luZ0NvbmZpZy5kb21haW59YCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU3RhZ2luZyBBcHBsaWNhdGlvbiBVUkwnLFxuICAgICAgZXhwb3J0TmFtZTogJ0JDT1MtU3RhZ2luZy1VUkwnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1N0YWdpbmdUYXJnZXRHcm91cEFybicsIHtcbiAgICAgIHZhbHVlOiB0aGlzLnRhcmdldEdyb3VwLnRhcmdldEdyb3VwQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdTdGFnaW5nIFRhcmdldCBHcm91cCBBUk4gZm9yIEdpdEh1YiBBY3Rpb25zJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdCQ09TLVN0YWdpbmctVGFyZ2V0R3JvdXBBcm4nLFxuICAgIH0pO1xuICB9XG59XG4iXX0=