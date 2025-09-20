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
const applicationautoscaling = __importStar(require("aws-cdk-lib/aws-applicationautoscaling"));
const secure_container_1 = require("../constructs/secure-container");
const waf_protection_1 = require("../constructs/waf-protection");
const monitoring_1 = require("../constructs/monitoring");
const staging_json_1 = __importDefault(require("../../config/staging.json"));
class StagingStack extends cdk.Stack {
    ecsCluster;
    ecsService;
    targetGroup;
    wafProtection;
    monitoring;
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
        // Import values from other stacks using CloudFormation imports
        const kmsKeyArn = cdk.Fn.importValue('BCOS-KMS-Key-Arn');
        const ecrRepositoryUri = cdk.Fn.importValue('BCOS-ECRRepositoryUri');
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
            repositoryArn: ecrRepositoryUri,
            repositoryName: cdk.Fn.select(1, cdk.Fn.split('/', cdk.Fn.select(5, cdk.Fn.split(':', ecrRepositoryUri)))),
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
        // Create secure container construct
        const secureContainer = new secure_container_1.SecureContainer(this, 'SecureContainer', {
            environment: environment,
            cluster: this.ecsCluster,
            ecrRepository: ecrRepository,
            kmsKey: kmsKey,
            executionRole: executionRole,
            taskRole: taskRole,
            secret: secret,
            cpu: staging_json_1.default.ecs.cpu,
            memory: staging_json_1.default.ecs.memory,
            containerPort: 80,
            environmentVariables: {
                ENVIRONMENT: environment,
                NEXT_PUBLIC_APP_URL: `https://${staging_json_1.default.domain}`,
            },
        });
        // Create target group for staging
        this.targetGroup = new elbv2.ApplicationTargetGroup(this, 'StagingTargetGroup', {
            targetGroupName: 'bcos-staging-tg',
            vpc: vpc,
            port: 80,
            protocol: elbv2.ApplicationProtocol.HTTP,
            targetType: elbv2.TargetType.IP,
            healthCheck: {
                enabled: true,
                path: '/health',
                protocol: elbv2.Protocol.HTTP,
                port: '80',
                interval: cdk.Duration.seconds(30),
                timeout: cdk.Duration.seconds(10),
                healthyThresholdCount: 2,
                unhealthyThresholdCount: 5,
                healthyHttpCodes: '200',
            },
        });
        // Create ECS Fargate Service
        this.ecsService = new ecs.FargateService(this, 'StagingService', {
            serviceName: staging_json_1.default.ecs.serviceName,
            cluster: this.ecsCluster,
            taskDefinition: secureContainer.taskDefinition,
            desiredCount: staging_json_1.default.ecs.desiredCount,
            minHealthyPercent: 50,
            maxHealthyPercent: 200,
            vpcSubnets: {
                subnetType: cdk.aws_ec2.SubnetType.PRIVATE_WITH_EGRESS,
            },
            securityGroups: [ecsSecurityGroup],
            assignPublicIp: false,
            healthCheckGracePeriod: cdk.Duration.seconds(120),
            circuitBreaker: {
                rollback: true,
            },
        });
        // Associate service with target group
        this.ecsService.attachToApplicationTargetGroup(this.targetGroup);
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
        this.monitoring = new monitoring_1.Monitoring(this, 'Monitoring', {
            environment: environment,
            kmsKey: kmsKey,
            ecsService: this.ecsService,
            ecsCluster: this.ecsCluster,
            loadBalancer: loadBalancer,
            targetGroup: this.targetGroup,
            logGroup: secureContainer.logGroup,
            alertEmails: ['devops@bendcare.com'], // Replace with actual email
            enableDetailedMonitoring: staging_json_1.default.monitoring.detailedMonitoring,
        });
        // Configure auto scaling (if enabled)
        if (staging_json_1.default.ecs.autoScaling.enabled) {
            const scalableTarget = new applicationautoscaling.ScalableTarget(this, 'StagingScalableTarget', {
                serviceNamespace: applicationautoscaling.ServiceNamespace.ECS,
                scalableDimension: 'ecs:service:DesiredCount',
                resourceId: `service/${this.ecsCluster.clusterName}/${this.ecsService.serviceName}`,
                minCapacity: staging_json_1.default.ecs.autoScaling.minCapacity,
                maxCapacity: staging_json_1.default.ecs.autoScaling.maxCapacity,
            });
            // CPU-based scaling
            scalableTarget.scaleToTrackMetric('StagingCPUScaling', {
                targetValue: staging_json_1.default.ecs.autoScaling.targetCpuUtilization,
                predefinedMetric: applicationautoscaling.PredefinedMetric.ECS_SERVICE_AVERAGE_CPU_UTILIZATION,
                scaleOutCooldown: cdk.Duration.seconds(300),
                scaleInCooldown: cdk.Duration.seconds(600),
            });
        }
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
        new cdk.CfnOutput(this, 'StagingServiceName', {
            value: this.ecsService.serviceName,
            description: 'Staging ECS Service Name',
            exportName: 'BCOS-Staging-ServiceName',
        });
        new cdk.CfnOutput(this, 'StagingURL', {
            value: `https://${staging_json_1.default.domain}`,
            description: 'Staging Application URL',
            exportName: 'BCOS-Staging-URL',
        });
        new cdk.CfnOutput(this, 'StagingTargetGroupArn', {
            value: this.targetGroup.targetGroupArn,
            description: 'Staging Target Group ARN',
            exportName: 'BCOS-Staging-TargetGroupArn',
        });
    }
}
exports.StagingStack = StagingStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhZ2luZy1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInN0YWdpbmctc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLHlEQUEyQztBQUMzQyw4RUFBZ0U7QUFDaEUsaUVBQW1EO0FBQ25ELGdGQUFrRTtBQUNsRSwrRkFBaUY7QUFJakYscUVBQWlFO0FBQ2pFLGlFQUE2RDtBQUM3RCx5REFBc0Q7QUFDdEQsNkVBQXNEO0FBTXRELE1BQWEsWUFBYSxTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQ3pCLFVBQVUsQ0FBYztJQUN4QixVQUFVLENBQXFCO0lBQy9CLFdBQVcsQ0FBK0I7SUFDMUMsYUFBYSxDQUFnQjtJQUM3QixVQUFVLENBQWE7SUFFdkMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUF3QjtRQUNoRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixNQUFNLFdBQVcsR0FBRyxTQUFTLENBQUM7UUFFOUIsa0RBQWtEO1FBQ2xELE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQyxJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDO1FBQ3JFLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNYLE1BQU0sSUFBSSxLQUFLLENBQUMsNkRBQTZELENBQUMsQ0FBQztRQUNqRixDQUFDO1FBRUQsa0NBQWtDO1FBQ2xDLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxJQUFJLEVBQUUsS0FBSyxFQUFFO1lBQ2xELEtBQUssRUFBRSxLQUFLO1NBQ2IsQ0FBQyxDQUFDO1FBRUgsK0RBQStEO1FBQy9ELE1BQU0sU0FBUyxHQUFHLEdBQUcsQ0FBQyxFQUFFLENBQUMsV0FBVyxDQUFD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LEVBQUU7WUFDNUMsS0FBSyxFQUFFLElBQUksQ0FBQyxVQUFVLENBQUMsV0FBVztZQUNsQyxXQUFXLEVBQUUsMEJBQTBCO1lBQ3ZDLFVBQVUsRUFBRSwwQkFBMEI7U0FDdkMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxZQUFZLEVBQUU7WUFDcEMsS0FBSyxFQUFFLFdBQVcsc0JBQWEsQ0FBQyxNQUFNLEVBQUU7WUFDeEMsV0FBVyxFQUFFLHlCQUF5QjtZQUN0QyxVQUFVLEVBQUUsa0JBQWtCO1NBQy9CLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsdUJBQXVCLEVBQUU7WUFDL0MsS0FBSyxFQUFFLElBQUksQ0FBQyxXQUFXLENBQUMsY0FBYztZQUN0QyxXQUFXLEVBQUUsMEJBQTBCO1lBQ3ZDLFVBQVUsRUFBRSw2QkFBNkI7U0FDMUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBek9ELG9DQXlPQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgKiBhcyBlY3MgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVjcyc7XG5pbXBvcnQgKiBhcyBlbGJ2MiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWxhc3RpY2xvYWRiYWxhbmNpbmd2Mic7XG5pbXBvcnQgKiBhcyByb3V0ZTUzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1yb3V0ZTUzJztcbmltcG9ydCAqIGFzIHJvdXRlNTN0YXJnZXRzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1yb3V0ZTUzLXRhcmdldHMnO1xuaW1wb3J0ICogYXMgYXBwbGljYXRpb25hdXRvc2NhbGluZyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtYXBwbGljYXRpb25hdXRvc2NhbGluZyc7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCB7IFNlY3VyaXR5U3RhY2sgfSBmcm9tICcuL3NlY3VyaXR5LXN0YWNrJztcbmltcG9ydCB7IE5ldHdvcmtTdGFjayB9IGZyb20gJy4vbmV0d29yay1zdGFjayc7XG5pbXBvcnQgeyBTZWN1cmVDb250YWluZXIgfSBmcm9tICcuLi9jb25zdHJ1Y3RzL3NlY3VyZS1jb250YWluZXInO1xuaW1wb3J0IHsgV2FmUHJvdGVjdGlvbiB9IGZyb20gJy4uL2NvbnN0cnVjdHMvd2FmLXByb3RlY3Rpb24nO1xuaW1wb3J0IHsgTW9uaXRvcmluZyB9IGZyb20gJy4uL2NvbnN0cnVjdHMvbW9uaXRvcmluZyc7XG5pbXBvcnQgc3RhZ2luZ0NvbmZpZyBmcm9tICcuLi8uLi9jb25maWcvc3RhZ2luZy5qc29uJztcblxuaW50ZXJmYWNlIFN0YWdpbmdTdGFja1Byb3BzIGV4dGVuZHMgY2RrLlN0YWNrUHJvcHMge1xuICAvLyBObyBkaXJlY3QgcmVmZXJlbmNlcyAtIHVzZSBDREsgb3V0cHV0cy9pbXBvcnRzIGluc3RlYWRcbn1cblxuZXhwb3J0IGNsYXNzIFN0YWdpbmdTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIHB1YmxpYyByZWFkb25seSBlY3NDbHVzdGVyOiBlY3MuQ2x1c3RlcjtcbiAgcHVibGljIHJlYWRvbmx5IGVjc1NlcnZpY2U6IGVjcy5GYXJnYXRlU2VydmljZTtcbiAgcHVibGljIHJlYWRvbmx5IHRhcmdldEdyb3VwOiBlbGJ2Mi5BcHBsaWNhdGlvblRhcmdldEdyb3VwO1xuICBwdWJsaWMgcmVhZG9ubHkgd2FmUHJvdGVjdGlvbjogV2FmUHJvdGVjdGlvbjtcbiAgcHVibGljIHJlYWRvbmx5IG1vbml0b3Jpbmc6IE1vbml0b3Jpbmc7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IFN0YWdpbmdTdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICBjb25zdCBlbnZpcm9ubWVudCA9ICdzdGFnaW5nJztcblxuICAgIC8vIEdldCBWUEMgSUQgZnJvbSBjb250ZXh0IG9yIGVudmlyb25tZW50IHZhcmlhYmxlXG4gICAgY29uc3QgdnBjSWQgPSB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgndnBjSWQnKSB8fCBwcm9jZXNzLmVudi5WUENfSUQ7XG4gICAgaWYgKCF2cGNJZCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdWUENfSUQgbXVzdCBiZSBwcm92aWRlZCB2aWEgY29udGV4dCBvciBlbnZpcm9ubWVudCB2YXJpYWJsZScpO1xuICAgIH1cblxuICAgIC8vIExvb2sgdXAgVlBDIHVzaW5nIGNvbnRleHQgdmFsdWVcbiAgICBjb25zdCB2cGMgPSBjZGsuYXdzX2VjMi5WcGMuZnJvbUxvb2t1cCh0aGlzLCAnVlBDJywge1xuICAgICAgdnBjSWQ6IHZwY0lkLFxuICAgIH0pO1xuXG4gICAgLy8gSW1wb3J0IHZhbHVlcyBmcm9tIG90aGVyIHN0YWNrcyB1c2luZyBDbG91ZEZvcm1hdGlvbiBpbXBvcnRzXG4gICAgY29uc3Qga21zS2V5QXJuID0gY2RrLkZuLmltcG9ydFZhbHVlKCdCQ09TLUtNUy1LZXktQXJuJyk7XG4gICAgY29uc3QgZWNyUmVwb3NpdG9yeVVyaSA9IGNkay5Gbi5pbXBvcnRWYWx1ZSgnQkNPUy1FQ1JSZXBvc2l0b3J5VXJpJyk7XG4gICAgY29uc3QgZWNzVGFza0V4ZWN1dGlvblJvbGVBcm4gPSBjZGsuRm4uaW1wb3J0VmFsdWUoJ0JDT1MtRUNTVGFza0V4ZWN1dGlvblJvbGUtQXJuJyk7XG4gICAgY29uc3QgZWNzVGFza1JvbGVBcm4gPSBjZGsuRm4uaW1wb3J0VmFsdWUoJ0JDT1MtRUNTVGFza1JvbGUtQXJuJyk7XG4gICAgY29uc3Qgc3RhZ2luZ1NlY3JldEFybiA9IGNkay5Gbi5pbXBvcnRWYWx1ZSgnQkNPUy1TdGFnaW5nU2VjcmV0LUFybicpO1xuICAgIGNvbnN0IGFsYkFybiA9IGNkay5Gbi5pbXBvcnRWYWx1ZSgnQkNPUy1Mb2FkQmFsYW5jZXItQXJuJyk7XG4gICAgY29uc3QgYWxiRG5zTmFtZSA9IGNkay5Gbi5pbXBvcnRWYWx1ZSgnQkNPUy1Mb2FkQmFsYW5jZXItRG5zTmFtZScpO1xuICAgIGNvbnN0IGFsYkNhbm9uaWNhbEhvc3RlZFpvbmVJZCA9IGNkay5Gbi5pbXBvcnRWYWx1ZSgnQkNPUy1Mb2FkQmFsYW5jZXItQ2Fub25pY2FsSG9zdGVkWm9uZUlkJyk7XG4gICAgY29uc3QgaHR0cHNMaXN0ZW5lckFybiA9IGNkay5Gbi5pbXBvcnRWYWx1ZSgnQkNPUy1IVFRQU0xpc3RlbmVyLUFybicpO1xuICAgIGNvbnN0IGhvc3RlZFpvbmVJZCA9IGNkay5Gbi5pbXBvcnRWYWx1ZSgnQkNPUy1Ib3N0ZWRab25lLUlkJyk7XG4gICAgY29uc3QgZWNzU2VjdXJpdHlHcm91cElkID0gY2RrLkZuLmltcG9ydFZhbHVlKCdCQ09TLUVDU1NlY3VyaXR5R3JvdXAtSWQnKTtcblxuICAgIC8vIEltcG9ydCBLTVMga2V5XG4gICAgY29uc3Qga21zS2V5ID0gY2RrLmF3c19rbXMuS2V5LmZyb21LZXlBcm4odGhpcywgJ0tNU0tleScsIGttc0tleUFybik7XG5cbiAgICAvLyBJbXBvcnQgRUNSIHJlcG9zaXRvcnkgdXNpbmcgYXR0cmlidXRlcyAocmVxdWlyZWQgZm9yIHRva2VucylcbiAgICBjb25zdCBlY3JSZXBvc2l0b3J5ID0gY2RrLmF3c19lY3IuUmVwb3NpdG9yeS5mcm9tUmVwb3NpdG9yeUF0dHJpYnV0ZXModGhpcywgJ0VDUlJlcG9zaXRvcnknLCB7XG4gICAgICByZXBvc2l0b3J5QXJuOiBlY3JSZXBvc2l0b3J5VXJpLFxuICAgICAgcmVwb3NpdG9yeU5hbWU6IGNkay5Gbi5zZWxlY3QoMSwgY2RrLkZuLnNwbGl0KCcvJywgY2RrLkZuLnNlbGVjdCg1LCBjZGsuRm4uc3BsaXQoJzonLCBlY3JSZXBvc2l0b3J5VXJpKSkpKSxcbiAgICB9KTtcblxuICAgIC8vIEltcG9ydCBJQU0gcm9sZXNcbiAgICBjb25zdCBleGVjdXRpb25Sb2xlID0gY2RrLmF3c19pYW0uUm9sZS5mcm9tUm9sZUFybih0aGlzLCAnRXhlY3V0aW9uUm9sZScsIGVjc1Rhc2tFeGVjdXRpb25Sb2xlQXJuKTtcbiAgICBjb25zdCB0YXNrUm9sZSA9IGNkay5hd3NfaWFtLlJvbGUuZnJvbVJvbGVBcm4odGhpcywgJ1Rhc2tSb2xlJywgZWNzVGFza1JvbGVBcm4pO1xuXG4gICAgLy8gSW1wb3J0IHNlY3JldFxuICAgIGNvbnN0IHNlY3JldCA9IGNkay5hd3Nfc2VjcmV0c21hbmFnZXIuU2VjcmV0LmZyb21TZWNyZXRDb21wbGV0ZUFybih0aGlzLCAnU2VjcmV0Jywgc3RhZ2luZ1NlY3JldEFybik7XG5cbiAgICAvLyBJbXBvcnQgbG9hZCBiYWxhbmNlciBhbmQgbGlzdGVuZXJcbiAgICBjb25zdCBsb2FkQmFsYW5jZXIgPSBjZGsuYXdzX2VsYXN0aWNsb2FkYmFsYW5jaW5ndjIuQXBwbGljYXRpb25Mb2FkQmFsYW5jZXIuZnJvbUFwcGxpY2F0aW9uTG9hZEJhbGFuY2VyQXR0cmlidXRlcyh0aGlzLCAnTG9hZEJhbGFuY2VyJywge1xuICAgICAgbG9hZEJhbGFuY2VyQXJuOiBhbGJBcm4sXG4gICAgICBsb2FkQmFsYW5jZXJEbnNOYW1lOiBhbGJEbnNOYW1lLFxuICAgICAgbG9hZEJhbGFuY2VyQ2Fub25pY2FsSG9zdGVkWm9uZUlkOiBhbGJDYW5vbmljYWxIb3N0ZWRab25lSWQsXG4gICAgICBzZWN1cml0eUdyb3VwSWQ6IGVjc1NlY3VyaXR5R3JvdXBJZCxcbiAgICB9KTtcblxuICAgIGNvbnN0IGh0dHBzTGlzdGVuZXIgPSBjZGsuYXdzX2VsYXN0aWNsb2FkYmFsYW5jaW5ndjIuQXBwbGljYXRpb25MaXN0ZW5lci5mcm9tQXBwbGljYXRpb25MaXN0ZW5lckF0dHJpYnV0ZXModGhpcywgJ0hUVFBTTGlzdGVuZXInLCB7XG4gICAgICBsaXN0ZW5lckFybjogaHR0cHNMaXN0ZW5lckFybixcbiAgICAgIHNlY3VyaXR5R3JvdXA6IGNkay5hd3NfZWMyLlNlY3VyaXR5R3JvdXAuZnJvbVNlY3VyaXR5R3JvdXBJZCh0aGlzLCAnQUxCU2VjdXJpdHlHcm91cCcsIGVjc1NlY3VyaXR5R3JvdXBJZCksXG4gICAgfSk7XG5cbiAgICAvLyBJbXBvcnQgaG9zdGVkIHpvbmUgdXNpbmcgYXR0cmlidXRlcyAocHJvdmlkZXMgem9uZU5hbWUpXG4gICAgY29uc3QgaG9zdGVkWm9uZSA9IGNkay5hd3Nfcm91dGU1My5Ib3N0ZWRab25lLmZyb21Ib3N0ZWRab25lQXR0cmlidXRlcyh0aGlzLCAnSG9zdGVkWm9uZScsIHtcbiAgICAgIGhvc3RlZFpvbmVJZDogaG9zdGVkWm9uZUlkLFxuICAgICAgem9uZU5hbWU6ICdiZW5kY2FyZS5jb20nLFxuICAgIH0pO1xuXG4gICAgLy8gSW1wb3J0IEVDUyBzZWN1cml0eSBncm91cFxuICAgIGNvbnN0IGVjc1NlY3VyaXR5R3JvdXAgPSBjZGsuYXdzX2VjMi5TZWN1cml0eUdyb3VwLmZyb21TZWN1cml0eUdyb3VwSWQodGhpcywgJ0VDU1NlY3VyaXR5R3JvdXAnLCBlY3NTZWN1cml0eUdyb3VwSWQpO1xuXG4gICAgLy8gQ3JlYXRlIEVDUyBDbHVzdGVyXG4gICAgdGhpcy5lY3NDbHVzdGVyID0gbmV3IGVjcy5DbHVzdGVyKHRoaXMsICdTdGFnaW5nQ2x1c3RlcicsIHtcbiAgICAgIGNsdXN0ZXJOYW1lOiBzdGFnaW5nQ29uZmlnLmVjcy5jbHVzdGVyTmFtZSxcbiAgICAgIHZwYzogdnBjLFxuICAgICAgY29udGFpbmVySW5zaWdodHM6IHN0YWdpbmdDb25maWcubW9uaXRvcmluZy5kZXRhaWxlZE1vbml0b3JpbmcsXG4gICAgICBlbmFibGVGYXJnYXRlQ2FwYWNpdHlQcm92aWRlcnM6IHRydWUsXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgc2VjdXJlIGNvbnRhaW5lciBjb25zdHJ1Y3RcbiAgICBjb25zdCBzZWN1cmVDb250YWluZXIgPSBuZXcgU2VjdXJlQ29udGFpbmVyKHRoaXMsICdTZWN1cmVDb250YWluZXInLCB7XG4gICAgICBlbnZpcm9ubWVudDogZW52aXJvbm1lbnQsXG4gICAgICBjbHVzdGVyOiB0aGlzLmVjc0NsdXN0ZXIsXG4gICAgICBlY3JSZXBvc2l0b3J5OiBlY3JSZXBvc2l0b3J5LFxuICAgICAga21zS2V5OiBrbXNLZXksXG4gICAgICBleGVjdXRpb25Sb2xlOiBleGVjdXRpb25Sb2xlLFxuICAgICAgdGFza1JvbGU6IHRhc2tSb2xlLFxuICAgICAgc2VjcmV0OiBzZWNyZXQsXG4gICAgICBjcHU6IHN0YWdpbmdDb25maWcuZWNzLmNwdSxcbiAgICAgIG1lbW9yeTogc3RhZ2luZ0NvbmZpZy5lY3MubWVtb3J5LFxuICAgICAgY29udGFpbmVyUG9ydDogODAsXG4gICAgICBlbnZpcm9ubWVudFZhcmlhYmxlczoge1xuICAgICAgICBFTlZJUk9OTUVOVDogZW52aXJvbm1lbnQsXG4gICAgICAgIE5FWFRfUFVCTElDX0FQUF9VUkw6IGBodHRwczovLyR7c3RhZ2luZ0NvbmZpZy5kb21haW59YCxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgdGFyZ2V0IGdyb3VwIGZvciBzdGFnaW5nXG4gICAgdGhpcy50YXJnZXRHcm91cCA9IG5ldyBlbGJ2Mi5BcHBsaWNhdGlvblRhcmdldEdyb3VwKHRoaXMsICdTdGFnaW5nVGFyZ2V0R3JvdXAnLCB7XG4gICAgICB0YXJnZXRHcm91cE5hbWU6ICdiY29zLXN0YWdpbmctdGcnLFxuICAgICAgdnBjOiB2cGMsXG4gICAgICBwb3J0OiA4MCxcbiAgICAgIHByb3RvY29sOiBlbGJ2Mi5BcHBsaWNhdGlvblByb3RvY29sLkhUVFAsXG4gICAgICB0YXJnZXRUeXBlOiBlbGJ2Mi5UYXJnZXRUeXBlLklQLFxuICAgICAgaGVhbHRoQ2hlY2s6IHtcbiAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgcGF0aDogJy9oZWFsdGgnLFxuICAgICAgICBwcm90b2NvbDogZWxidjIuUHJvdG9jb2wuSFRUUCxcbiAgICAgICAgcG9ydDogJzgwJyxcbiAgICAgICAgaW50ZXJ2YWw6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMTApLFxuICAgICAgICBoZWFsdGh5VGhyZXNob2xkQ291bnQ6IDIsXG4gICAgICAgIHVuaGVhbHRoeVRocmVzaG9sZENvdW50OiA1LFxuICAgICAgICBoZWFsdGh5SHR0cENvZGVzOiAnMjAwJyxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgRUNTIEZhcmdhdGUgU2VydmljZVxuICAgIHRoaXMuZWNzU2VydmljZSA9IG5ldyBlY3MuRmFyZ2F0ZVNlcnZpY2UodGhpcywgJ1N0YWdpbmdTZXJ2aWNlJywge1xuICAgICAgc2VydmljZU5hbWU6IHN0YWdpbmdDb25maWcuZWNzLnNlcnZpY2VOYW1lLFxuICAgICAgY2x1c3RlcjogdGhpcy5lY3NDbHVzdGVyLFxuICAgICAgdGFza0RlZmluaXRpb246IHNlY3VyZUNvbnRhaW5lci50YXNrRGVmaW5pdGlvbixcbiAgICAgIGRlc2lyZWRDb3VudDogc3RhZ2luZ0NvbmZpZy5lY3MuZGVzaXJlZENvdW50LFxuICAgICAgbWluSGVhbHRoeVBlcmNlbnQ6IDUwLFxuICAgICAgbWF4SGVhbHRoeVBlcmNlbnQ6IDIwMCxcbiAgICAgIHZwY1N1Ym5ldHM6IHtcbiAgICAgICAgc3VibmV0VHlwZTogY2RrLmF3c19lYzIuU3VibmV0VHlwZS5QUklWQVRFX1dJVEhfRUdSRVNTLFxuICAgICAgfSxcbiAgICAgIHNlY3VyaXR5R3JvdXBzOiBbZWNzU2VjdXJpdHlHcm91cF0sXG4gICAgICBhc3NpZ25QdWJsaWNJcDogZmFsc2UsXG4gICAgICBoZWFsdGhDaGVja0dyYWNlUGVyaW9kOiBjZGsuRHVyYXRpb24uc2Vjb25kcygxMjApLFxuICAgICAgY2lyY3VpdEJyZWFrZXI6IHtcbiAgICAgICAgcm9sbGJhY2s6IHRydWUsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQXNzb2NpYXRlIHNlcnZpY2Ugd2l0aCB0YXJnZXQgZ3JvdXBcbiAgICB0aGlzLmVjc1NlcnZpY2UuYXR0YWNoVG9BcHBsaWNhdGlvblRhcmdldEdyb3VwKHRoaXMudGFyZ2V0R3JvdXApO1xuXG4gICAgLy8gQWRkIGxpc3RlbmVyIHJ1bGUgZm9yIHN0YWdpbmcgc3ViZG9tYWluXG4gICAgbmV3IGVsYnYyLkFwcGxpY2F0aW9uTGlzdGVuZXJSdWxlKHRoaXMsICdTdGFnaW5nTGlzdGVuZXJSdWxlJywge1xuICAgICAgbGlzdGVuZXI6IGh0dHBzTGlzdGVuZXIsXG4gICAgICBwcmlvcml0eTogMTAwLFxuICAgICAgY29uZGl0aW9uczogW2VsYnYyLkxpc3RlbmVyQ29uZGl0aW9uLmhvc3RIZWFkZXJzKFtzdGFnaW5nQ29uZmlnLmRvbWFpbl0pXSxcbiAgICAgIGFjdGlvbjogZWxidjIuTGlzdGVuZXJBY3Rpb24uZm9yd2FyZChbdGhpcy50YXJnZXRHcm91cF0pLFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIFJvdXRlNTMgcmVjb3JkIGZvciBzdGFnaW5nIGRvbWFpblxuICAgIG5ldyByb3V0ZTUzLkFSZWNvcmQodGhpcywgJ1N0YWdpbmdBUmVjb3JkJywge1xuICAgICAgem9uZTogaG9zdGVkWm9uZSxcbiAgICAgIHJlY29yZE5hbWU6ICdzdGFnaW5nJyxcbiAgICAgIHRhcmdldDogcm91dGU1My5SZWNvcmRUYXJnZXQuZnJvbUFsaWFzKFxuICAgICAgICBuZXcgcm91dGU1M3RhcmdldHMuTG9hZEJhbGFuY2VyVGFyZ2V0KGxvYWRCYWxhbmNlcilcbiAgICAgICksXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgV0FGIHByb3RlY3Rpb25cbiAgICB0aGlzLndhZlByb3RlY3Rpb24gPSBuZXcgV2FmUHJvdGVjdGlvbih0aGlzLCAnV0FGUHJvdGVjdGlvbicsIHtcbiAgICAgIGVudmlyb25tZW50OiBlbnZpcm9ubWVudCxcbiAgICAgIGttc0tleToga21zS2V5LFxuICAgICAgcmF0ZUxpbWl0UGVySVA6IHN0YWdpbmdDb25maWcud2FmLnJhdGVMaW1pdFBlcklQLFxuICAgICAgZW5hYmxlR2VvQmxvY2tpbmc6IGZhbHNlLFxuICAgICAgZW5hYmxlTWFuYWdlZFJ1bGVzOiB0cnVlLFxuICAgIH0pO1xuXG4gICAgLy8gQXNzb2NpYXRlIFdBRiB3aXRoIGxvYWQgYmFsYW5jZXJcbiAgICB0aGlzLndhZlByb3RlY3Rpb24uYXNzb2NpYXRlV2l0aExvYWRCYWxhbmNlcihhbGJBcm4pO1xuXG4gICAgLy8gQ3JlYXRlIG1vbml0b3JpbmdcbiAgICB0aGlzLm1vbml0b3JpbmcgPSBuZXcgTW9uaXRvcmluZyh0aGlzLCAnTW9uaXRvcmluZycsIHtcbiAgICAgIGVudmlyb25tZW50OiBlbnZpcm9ubWVudCxcbiAgICAgIGttc0tleToga21zS2V5LFxuICAgICAgZWNzU2VydmljZTogdGhpcy5lY3NTZXJ2aWNlLFxuICAgICAgZWNzQ2x1c3RlcjogdGhpcy5lY3NDbHVzdGVyLFxuICAgICAgbG9hZEJhbGFuY2VyOiBsb2FkQmFsYW5jZXIsXG4gICAgICB0YXJnZXRHcm91cDogdGhpcy50YXJnZXRHcm91cCxcbiAgICAgIGxvZ0dyb3VwOiBzZWN1cmVDb250YWluZXIubG9nR3JvdXAsXG4gICAgICBhbGVydEVtYWlsczogWydkZXZvcHNAYmVuZGNhcmUuY29tJ10sIC8vIFJlcGxhY2Ugd2l0aCBhY3R1YWwgZW1haWxcbiAgICAgIGVuYWJsZURldGFpbGVkTW9uaXRvcmluZzogc3RhZ2luZ0NvbmZpZy5tb25pdG9yaW5nLmRldGFpbGVkTW9uaXRvcmluZyxcbiAgICB9KTtcblxuICAgIC8vIENvbmZpZ3VyZSBhdXRvIHNjYWxpbmcgKGlmIGVuYWJsZWQpXG4gICAgaWYgKHN0YWdpbmdDb25maWcuZWNzLmF1dG9TY2FsaW5nLmVuYWJsZWQpIHtcbiAgICAgIGNvbnN0IHNjYWxhYmxlVGFyZ2V0ID0gbmV3IGFwcGxpY2F0aW9uYXV0b3NjYWxpbmcuU2NhbGFibGVUYXJnZXQodGhpcywgJ1N0YWdpbmdTY2FsYWJsZVRhcmdldCcsIHtcbiAgICAgICAgc2VydmljZU5hbWVzcGFjZTogYXBwbGljYXRpb25hdXRvc2NhbGluZy5TZXJ2aWNlTmFtZXNwYWNlLkVDUyxcbiAgICAgICAgc2NhbGFibGVEaW1lbnNpb246ICdlY3M6c2VydmljZTpEZXNpcmVkQ291bnQnLFxuICAgICAgICByZXNvdXJjZUlkOiBgc2VydmljZS8ke3RoaXMuZWNzQ2x1c3Rlci5jbHVzdGVyTmFtZX0vJHt0aGlzLmVjc1NlcnZpY2Uuc2VydmljZU5hbWV9YCxcbiAgICAgICAgbWluQ2FwYWNpdHk6IHN0YWdpbmdDb25maWcuZWNzLmF1dG9TY2FsaW5nLm1pbkNhcGFjaXR5LFxuICAgICAgICBtYXhDYXBhY2l0eTogc3RhZ2luZ0NvbmZpZy5lY3MuYXV0b1NjYWxpbmcubWF4Q2FwYWNpdHksXG4gICAgICB9KTtcblxuICAgICAgLy8gQ1BVLWJhc2VkIHNjYWxpbmdcbiAgICAgIHNjYWxhYmxlVGFyZ2V0LnNjYWxlVG9UcmFja01ldHJpYygnU3RhZ2luZ0NQVVNjYWxpbmcnLCB7XG4gICAgICAgIHRhcmdldFZhbHVlOiBzdGFnaW5nQ29uZmlnLmVjcy5hdXRvU2NhbGluZy50YXJnZXRDcHVVdGlsaXphdGlvbixcbiAgICAgICAgcHJlZGVmaW5lZE1ldHJpYzogYXBwbGljYXRpb25hdXRvc2NhbGluZy5QcmVkZWZpbmVkTWV0cmljLkVDU19TRVJWSUNFX0FWRVJBR0VfQ1BVX1VUSUxJWkFUSU9OLFxuICAgICAgICBzY2FsZU91dENvb2xkb3duOiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMDApLFxuICAgICAgICBzY2FsZUluQ29vbGRvd246IGNkay5EdXJhdGlvbi5zZWNvbmRzKDYwMCksXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBBcHBseSB0YWdzXG4gICAgT2JqZWN0LmVudHJpZXMoc3RhZ2luZ0NvbmZpZy50YWdzKS5mb3JFYWNoKChba2V5LCB2YWx1ZV0pID0+IHtcbiAgICAgIGNkay5UYWdzLm9mKHRoaXMpLmFkZChrZXksIHZhbHVlKTtcbiAgICB9KTtcblxuICAgIC8vIFN0YWNrIG91dHB1dHNcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnU3RhZ2luZ0NsdXN0ZXJOYW1lJywge1xuICAgICAgdmFsdWU6IHRoaXMuZWNzQ2x1c3Rlci5jbHVzdGVyTmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU3RhZ2luZyBFQ1MgQ2x1c3RlciBOYW1lJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdCQ09TLVN0YWdpbmctQ2x1c3Rlck5hbWUnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1N0YWdpbmdTZXJ2aWNlTmFtZScsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmVjc1NlcnZpY2Uuc2VydmljZU5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ1N0YWdpbmcgRUNTIFNlcnZpY2UgTmFtZScsXG4gICAgICBleHBvcnROYW1lOiAnQkNPUy1TdGFnaW5nLVNlcnZpY2VOYW1lJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdTdGFnaW5nVVJMJywge1xuICAgICAgdmFsdWU6IGBodHRwczovLyR7c3RhZ2luZ0NvbmZpZy5kb21haW59YCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU3RhZ2luZyBBcHBsaWNhdGlvbiBVUkwnLFxuICAgICAgZXhwb3J0TmFtZTogJ0JDT1MtU3RhZ2luZy1VUkwnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1N0YWdpbmdUYXJnZXRHcm91cEFybicsIHtcbiAgICAgIHZhbHVlOiB0aGlzLnRhcmdldEdyb3VwLnRhcmdldEdyb3VwQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdTdGFnaW5nIFRhcmdldCBHcm91cCBBUk4nLFxuICAgICAgZXhwb3J0TmFtZTogJ0JDT1MtU3RhZ2luZy1UYXJnZXRHcm91cEFybicsXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==