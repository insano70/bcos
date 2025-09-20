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
exports.StagingStage = void 0;
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
class StagingStage extends cdk.Stage {
    ecsCluster;
    ecsService;
    targetGroup;
    wafProtection;
    monitoring;
    constructor(scope, id, props) {
        super(scope, id, props);
        const { securityStack, networkStack } = props;
        const environment = 'staging';
        // Create ECS Cluster
        this.ecsCluster = new ecs.Cluster(this, 'StagingCluster', {
            clusterName: staging_json_1.default.ecs.clusterName,
            vpc: networkStack.vpc,
            containerInsights: staging_json_1.default.monitoring.detailedMonitoring,
            enableFargateCapacityProviders: true,
        });
        // Create secure container construct
        const secureContainer = new secure_container_1.SecureContainer(this, 'SecureContainer', {
            environment: environment,
            cluster: this.ecsCluster,
            ecrRepository: securityStack.ecrRepository,
            kmsKey: securityStack.kmsKey,
            executionRole: securityStack.ecsTaskExecutionRole,
            taskRole: securityStack.ecsTaskRole,
            secret: securityStack.stagingSecret,
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
            vpc: networkStack.vpc,
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
            securityGroups: [networkStack.ecsSecurityGroup],
            assignPublicIp: false,
            // Logging enabled by default
            healthCheckGracePeriod: cdk.Duration.seconds(120),
            circuitBreaker: {
                rollback: true,
            },
        });
        // Associate service with target group
        this.ecsService.attachToApplicationTargetGroup(this.targetGroup);
        // Add listener rule for staging subdomain
        new elbv2.ApplicationListenerRule(this, 'StagingListenerRule', {
            listener: networkStack.httpsListener,
            priority: 100,
            conditions: [elbv2.ListenerCondition.hostHeaders([staging_json_1.default.domain])],
            action: elbv2.ListenerAction.forward([this.targetGroup]),
        });
        // Create Route53 record for staging domain
        new route53.ARecord(this, 'StagingARecord', {
            zone: networkStack.hostedZone,
            recordName: 'staging',
            target: route53.RecordTarget.fromAlias(new route53targets.LoadBalancerTarget(networkStack.loadBalancer)),
        });
        // Create WAF protection
        this.wafProtection = new waf_protection_1.WafProtection(this, 'WAFProtection', {
            environment: environment,
            kmsKey: securityStack.kmsKey,
            rateLimitPerIP: staging_json_1.default.waf.rateLimitPerIP,
            enableGeoBlocking: false,
            enableManagedRules: true,
        });
        // Associate WAF with load balancer
        this.wafProtection.associateWithLoadBalancer(networkStack.loadBalancer.loadBalancerArn);
        // Create monitoring
        this.monitoring = new monitoring_1.Monitoring(this, 'Monitoring', {
            environment: environment,
            kmsKey: securityStack.kmsKey,
            ecsService: this.ecsService,
            ecsCluster: this.ecsCluster,
            loadBalancer: networkStack.loadBalancer,
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
exports.StagingStage = StagingStage;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhZ2luZy1zdGFnZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInN0YWdpbmctc3RhZ2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLHlEQUEyQztBQUMzQyw4RUFBZ0U7QUFDaEUsaUVBQW1EO0FBQ25ELGdGQUFrRTtBQUNsRSwrRkFBaUY7QUFJakYscUVBQWlFO0FBQ2pFLGlFQUE2RDtBQUM3RCx5REFBc0Q7QUFDdEQsNkVBQXNEO0FBT3RELE1BQWEsWUFBYSxTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQ3pCLFVBQVUsQ0FBYztJQUN4QixVQUFVLENBQXFCO0lBQy9CLFdBQVcsQ0FBK0I7SUFDMUMsYUFBYSxDQUFnQjtJQUM3QixVQUFVLENBQWE7SUFFdkMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUF3QjtRQUNoRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixNQUFNLEVBQUUsYUFBYSxFQUFFLFlBQVksRUFBRSxHQUFHLEtBQUssQ0FBQztRQUM5QyxNQUFNLFdBQVcsR0FBRyxTQUFTLENBQUM7UUFFOUIscUJBQXFCO1FBQ3JCLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxHQUFHLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxnQkFBZ0IsRUFBRTtZQUN4RCxXQUFXLEVBQUUsc0JBQWEsQ0FBQyxHQUFHLENBQUMsV0FBVztZQUMxQyxHQUFHLEVBQUUsWUFBWSxDQUFDLEdBQUc7WUFDckIsaUJBQWlCLEVBQUUsc0JBQWEsQ0FBQyxVQUFVLENBQUMsa0JBQWtCO1lBQzlELDhCQUE4QixFQUFFLElBQUk7U0FDckMsQ0FBQyxDQUFDO1FBRUgsb0NBQW9DO1FBQ3BDLE1BQU0sZUFBZSxHQUFHLElBQUksa0NBQWUsQ0FBQyxJQUFJLEVBQUUsaUJBQWlCLEVBQUU7WUFDbkUsV0FBVyxFQUFFLFdB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Q0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsRUFBRSxFQUFFO1lBQzFELEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDcEMsQ0FBQyxDQUFDLENBQUM7UUFFSCxnQkFBZ0I7UUFDaEIsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxvQkFBb0IsRUFBRTtZQUM1QyxLQUFLLEVBQUUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxXQUFXO1lBQ2xDLFdBQVcsRUFBRSwwQkFBMEI7WUFDdkMsVUFBVSxFQUFFLDBCQUEwQjtTQUN2QyxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLG9CQUFvQixFQUFFO1lBQzVDLEtBQUssRUFBRSxJQUFJLENBQUMsVUFBVSxDQUFDLFdBQVc7WUFDbEMsV0FBVyxFQUFFLDBCQUEwQjtZQUN2QyxVQUFVLEVBQUUsMEJBQTBCO1NBQ3ZDLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsWUFBWSxFQUFFO1lBQ3BDLEtBQUssRUFBRSxXQUFXLHNCQUFhLENBQUMsTUFBTSxFQUFFO1lBQ3hDLFdBQVcsRUFBRSx5QkFBeUI7WUFDdEMsVUFBVSxFQUFFLGtCQUFrQjtTQUMvQixDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLHVCQUF1QixFQUFFO1lBQy9DLEtBQUssRUFBRSxJQUFJLENBQUMsV0FBVyxDQUFDLGNBQWM7WUFDdEMsV0FBVyxFQUFFLDBCQUEwQjtZQUN2QyxVQUFVLEVBQUUsNkJBQTZCO1NBQzFDLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQTdLRCxvQ0E2S0MiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0ICogYXMgZWNzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lY3MnO1xuaW1wb3J0ICogYXMgZWxidjIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVsYXN0aWNsb2FkYmFsYW5jaW5ndjInO1xuaW1wb3J0ICogYXMgcm91dGU1MyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtcm91dGU1Myc7XG5pbXBvcnQgKiBhcyByb3V0ZTUzdGFyZ2V0cyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtcm91dGU1My10YXJnZXRzJztcbmltcG9ydCAqIGFzIGFwcGxpY2F0aW9uYXV0b3NjYWxpbmcgZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwcGxpY2F0aW9uYXV0b3NjYWxpbmcnO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgeyBTZWN1cml0eVN0YWNrIH0gZnJvbSAnLi4vc3RhY2tzL3NlY3VyaXR5LXN0YWNrJztcbmltcG9ydCB7IE5ldHdvcmtTdGFjayB9IGZyb20gJy4uL3N0YWNrcy9uZXR3b3JrLXN0YWNrJztcbmltcG9ydCB7IFNlY3VyZUNvbnRhaW5lciB9IGZyb20gJy4uL2NvbnN0cnVjdHMvc2VjdXJlLWNvbnRhaW5lcic7XG5pbXBvcnQgeyBXYWZQcm90ZWN0aW9uIH0gZnJvbSAnLi4vY29uc3RydWN0cy93YWYtcHJvdGVjdGlvbic7XG5pbXBvcnQgeyBNb25pdG9yaW5nIH0gZnJvbSAnLi4vY29uc3RydWN0cy9tb25pdG9yaW5nJztcbmltcG9ydCBzdGFnaW5nQ29uZmlnIGZyb20gJy4uLy4uL2NvbmZpZy9zdGFnaW5nLmpzb24nO1xuXG5pbnRlcmZhY2UgU3RhZ2luZ1N0YWdlUHJvcHMgZXh0ZW5kcyBjZGsuU3RhZ2VQcm9wcyB7XG4gIHNlY3VyaXR5U3RhY2s6IFNlY3VyaXR5U3RhY2s7XG4gIG5ldHdvcmtTdGFjazogTmV0d29ya1N0YWNrO1xufVxuXG5leHBvcnQgY2xhc3MgU3RhZ2luZ1N0YWdlIGV4dGVuZHMgY2RrLlN0YWdlIHtcbiAgcHVibGljIHJlYWRvbmx5IGVjc0NsdXN0ZXI6IGVjcy5DbHVzdGVyO1xuICBwdWJsaWMgcmVhZG9ubHkgZWNzU2VydmljZTogZWNzLkZhcmdhdGVTZXJ2aWNlO1xuICBwdWJsaWMgcmVhZG9ubHkgdGFyZ2V0R3JvdXA6IGVsYnYyLkFwcGxpY2F0aW9uVGFyZ2V0R3JvdXA7XG4gIHB1YmxpYyByZWFkb25seSB3YWZQcm90ZWN0aW9uOiBXYWZQcm90ZWN0aW9uO1xuICBwdWJsaWMgcmVhZG9ubHkgbW9uaXRvcmluZzogTW9uaXRvcmluZztcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogU3RhZ2luZ1N0YWdlUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIGNvbnN0IHsgc2VjdXJpdHlTdGFjaywgbmV0d29ya1N0YWNrIH0gPSBwcm9wcztcbiAgICBjb25zdCBlbnZpcm9ubWVudCA9ICdzdGFnaW5nJztcblxuICAgIC8vIENyZWF0ZSBFQ1MgQ2x1c3RlclxuICAgIHRoaXMuZWNzQ2x1c3RlciA9IG5ldyBlY3MuQ2x1c3Rlcih0aGlzLCAnU3RhZ2luZ0NsdXN0ZXInLCB7XG4gICAgICBjbHVzdGVyTmFtZTogc3RhZ2luZ0NvbmZpZy5lY3MuY2x1c3Rlck5hbWUsXG4gICAgICB2cGM6IG5ldHdvcmtTdGFjay52cGMsXG4gICAgICBjb250YWluZXJJbnNpZ2h0czogc3RhZ2luZ0NvbmZpZy5tb25pdG9yaW5nLmRldGFpbGVkTW9uaXRvcmluZyxcbiAgICAgIGVuYWJsZUZhcmdhdGVDYXBhY2l0eVByb3ZpZGVyczogdHJ1ZSxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBzZWN1cmUgY29udGFpbmVyIGNvbnN0cnVjdFxuICAgIGNvbnN0IHNlY3VyZUNvbnRhaW5lciA9IG5ldyBTZWN1cmVDb250YWluZXIodGhpcywgJ1NlY3VyZUNvbnRhaW5lcicsIHtcbiAgICAgIGVudmlyb25tZW50OiBlbnZpcm9ubWVudCxcbiAgICAgIGNsdXN0ZXI6IHRoaXMuZWNzQ2x1c3RlcixcbiAgICAgIGVjclJlcG9zaXRvcnk6IHNlY3VyaXR5U3RhY2suZWNyUmVwb3NpdG9yeSxcbiAgICAgIGttc0tleTogc2VjdXJpdHlTdGFjay5rbXNLZXksXG4gICAgICBleGVjdXRpb25Sb2xlOiBzZWN1cml0eVN0YWNrLmVjc1Rhc2tFeGVjdXRpb25Sb2xlLFxuICAgICAgdGFza1JvbGU6IHNlY3VyaXR5U3RhY2suZWNzVGFza1JvbGUsXG4gICAgICBzZWNyZXQ6IHNlY3VyaXR5U3RhY2suc3RhZ2luZ1NlY3JldCxcbiAgICAgIGNwdTogc3RhZ2luZ0NvbmZpZy5lY3MuY3B1LFxuICAgICAgbWVtb3J5OiBzdGFnaW5nQ29uZmlnLmVjcy5tZW1vcnksXG4gICAgICBjb250YWluZXJQb3J0OiA4MCxcbiAgICAgIGVudmlyb25tZW50VmFyaWFibGVzOiB7XG4gICAgICAgIEVOVklST05NRU5UOiBlbnZpcm9ubWVudCxcbiAgICAgICAgTkVYVF9QVUJMSUNfQVBQX1VSTDogYGh0dHBzOi8vJHtzdGFnaW5nQ29uZmlnLmRvbWFpbn1gLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSB0YXJnZXQgZ3JvdXAgZm9yIHN0YWdpbmdcbiAgICB0aGlzLnRhcmdldEdyb3VwID0gbmV3IGVsYnYyLkFwcGxpY2F0aW9uVGFyZ2V0R3JvdXAodGhpcywgJ1N0YWdpbmdUYXJnZXRHcm91cCcsIHtcbiAgICAgIHRhcmdldEdyb3VwTmFtZTogJ2Jjb3Mtc3RhZ2luZy10ZycsXG4gICAgICB2cGM6IG5ldHdvcmtTdGFjay52cGMsXG4gICAgICBwb3J0OiA4MCxcbiAgICAgIHByb3RvY29sOiBlbGJ2Mi5BcHBsaWNhdGlvblByb3RvY29sLkhUVFAsXG4gICAgICB0YXJnZXRUeXBlOiBlbGJ2Mi5UYXJnZXRUeXBlLklQLFxuICAgICAgaGVhbHRoQ2hlY2s6IHtcbiAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgcGF0aDogJy9oZWFsdGgnLFxuICAgICAgICBwcm90b2NvbDogZWxidjIuUHJvdG9jb2wuSFRUUCxcbiAgICAgICAgcG9ydDogJzgwJyxcbiAgICAgICAgaW50ZXJ2YWw6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMTApLFxuICAgICAgICBoZWFsdGh5VGhyZXNob2xkQ291bnQ6IDIsXG4gICAgICAgIHVuaGVhbHRoeVRocmVzaG9sZENvdW50OiA1LFxuICAgICAgICBoZWFsdGh5SHR0cENvZGVzOiAnMjAwJyxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgRUNTIEZhcmdhdGUgU2VydmljZVxuICAgIHRoaXMuZWNzU2VydmljZSA9IG5ldyBlY3MuRmFyZ2F0ZVNlcnZpY2UodGhpcywgJ1N0YWdpbmdTZXJ2aWNlJywge1xuICAgICAgc2VydmljZU5hbWU6IHN0YWdpbmdDb25maWcuZWNzLnNlcnZpY2VOYW1lLFxuICAgICAgY2x1c3RlcjogdGhpcy5lY3NDbHVzdGVyLFxuICAgICAgdGFza0RlZmluaXRpb246IHNlY3VyZUNvbnRhaW5lci50YXNrRGVmaW5pdGlvbixcbiAgICAgIGRlc2lyZWRDb3VudDogc3RhZ2luZ0NvbmZpZy5lY3MuZGVzaXJlZENvdW50LFxuICAgICAgbWluSGVhbHRoeVBlcmNlbnQ6IDUwLFxuICAgICAgbWF4SGVhbHRoeVBlcmNlbnQ6IDIwMCxcbiAgICAgIHZwY1N1Ym5ldHM6IHtcbiAgICAgICAgc3VibmV0VHlwZTogY2RrLmF3c19lYzIuU3VibmV0VHlwZS5QUklWQVRFX1dJVEhfRUdSRVNTLFxuICAgICAgfSxcbiAgICAgIHNlY3VyaXR5R3JvdXBzOiBbbmV0d29ya1N0YWNrLmVjc1NlY3VyaXR5R3JvdXBdLFxuICAgICAgYXNzaWduUHVibGljSXA6IGZhbHNlLFxuLy8gTG9nZ2luZyBlbmFibGVkIGJ5IGRlZmF1bHRcbiAgICAgIGhlYWx0aENoZWNrR3JhY2VQZXJpb2Q6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDEyMCksXG4gICAgICBjaXJjdWl0QnJlYWtlcjoge1xuICAgICAgICByb2xsYmFjazogdHJ1ZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBBc3NvY2lhdGUgc2VydmljZSB3aXRoIHRhcmdldCBncm91cFxuICAgIHRoaXMuZWNzU2VydmljZS5hdHRhY2hUb0FwcGxpY2F0aW9uVGFyZ2V0R3JvdXAodGhpcy50YXJnZXRHcm91cCk7XG5cbiAgICAvLyBBZGQgbGlzdGVuZXIgcnVsZSBmb3Igc3RhZ2luZyBzdWJkb21haW5cbiAgICBuZXcgZWxidjIuQXBwbGljYXRpb25MaXN0ZW5lclJ1bGUodGhpcywgJ1N0YWdpbmdMaXN0ZW5lclJ1bGUnLCB7XG4gICAgICBsaXN0ZW5lcjogbmV0d29ya1N0YWNrLmh0dHBzTGlzdGVuZXIsXG4gICAgICBwcmlvcml0eTogMTAwLFxuICAgICAgY29uZGl0aW9uczogW2VsYnYyLkxpc3RlbmVyQ29uZGl0aW9uLmhvc3RIZWFkZXJzKFtzdGFnaW5nQ29uZmlnLmRvbWFpbl0pXSxcbiAgICAgIGFjdGlvbjogZWxidjIuTGlzdGVuZXJBY3Rpb24uZm9yd2FyZChbdGhpcy50YXJnZXRHcm91cF0pLFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIFJvdXRlNTMgcmVjb3JkIGZvciBzdGFnaW5nIGRvbWFpblxuICAgIG5ldyByb3V0ZTUzLkFSZWNvcmQodGhpcywgJ1N0YWdpbmdBUmVjb3JkJywge1xuICAgICAgem9uZTogbmV0d29ya1N0YWNrLmhvc3RlZFpvbmUsXG4gICAgICByZWNvcmROYW1lOiAnc3RhZ2luZycsXG4gICAgICB0YXJnZXQ6IHJvdXRlNTMuUmVjb3JkVGFyZ2V0LmZyb21BbGlhcyhcbiAgICAgICAgbmV3IHJvdXRlNTN0YXJnZXRzLkxvYWRCYWxhbmNlclRhcmdldChuZXR3b3JrU3RhY2subG9hZEJhbGFuY2VyKVxuICAgICAgKSxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBXQUYgcHJvdGVjdGlvblxuICAgIHRoaXMud2FmUHJvdGVjdGlvbiA9IG5ldyBXYWZQcm90ZWN0aW9uKHRoaXMsICdXQUZQcm90ZWN0aW9uJywge1xuICAgICAgZW52aXJvbm1lbnQ6IGVudmlyb25tZW50LFxuICAgICAga21zS2V5OiBzZWN1cml0eVN0YWNrLmttc0tleSxcbiAgICAgIHJhdGVMaW1pdFBlcklQOiBzdGFnaW5nQ29uZmlnLndhZi5yYXRlTGltaXRQZXJJUCxcbiAgICAgIGVuYWJsZUdlb0Jsb2NraW5nOiBmYWxzZSxcbiAgICAgIGVuYWJsZU1hbmFnZWRSdWxlczogdHJ1ZSxcbiAgICB9KTtcblxuICAgIC8vIEFzc29jaWF0ZSBXQUYgd2l0aCBsb2FkIGJhbGFuY2VyXG4gICAgdGhpcy53YWZQcm90ZWN0aW9uLmFzc29jaWF0ZVdpdGhMb2FkQmFsYW5jZXIobmV0d29ya1N0YWNrLmxvYWRCYWxhbmNlci5sb2FkQmFsYW5jZXJBcm4pO1xuXG4gICAgLy8gQ3JlYXRlIG1vbml0b3JpbmdcbiAgICB0aGlzLm1vbml0b3JpbmcgPSBuZXcgTW9uaXRvcmluZyh0aGlzLCAnTW9uaXRvcmluZycsIHtcbiAgICAgIGVudmlyb25tZW50OiBlbnZpcm9ubWVudCxcbiAgICAgIGttc0tleTogc2VjdXJpdHlTdGFjay5rbXNLZXksXG4gICAgICBlY3NTZXJ2aWNlOiB0aGlzLmVjc1NlcnZpY2UsXG4gICAgICBlY3NDbHVzdGVyOiB0aGlzLmVjc0NsdXN0ZXIsXG4gICAgICBsb2FkQmFsYW5jZXI6IG5ldHdvcmtTdGFjay5sb2FkQmFsYW5jZXIsXG4gICAgICB0YXJnZXRHcm91cDogdGhpcy50YXJnZXRHcm91cCxcbiAgICAgIGxvZ0dyb3VwOiBzZWN1cmVDb250YWluZXIubG9nR3JvdXAsXG4gICAgICBhbGVydEVtYWlsczogWydkZXZvcHNAYmVuZGNhcmUuY29tJ10sIC8vIFJlcGxhY2Ugd2l0aCBhY3R1YWwgZW1haWxcbiAgICAgIGVuYWJsZURldGFpbGVkTW9uaXRvcmluZzogc3RhZ2luZ0NvbmZpZy5tb25pdG9yaW5nLmRldGFpbGVkTW9uaXRvcmluZyxcbiAgICB9KTtcblxuICAgIC8vIENvbmZpZ3VyZSBhdXRvIHNjYWxpbmcgKGlmIGVuYWJsZWQpXG4gICAgaWYgKHN0YWdpbmdDb25maWcuZWNzLmF1dG9TY2FsaW5nLmVuYWJsZWQpIHtcbiAgICAgIGNvbnN0IHNjYWxhYmxlVGFyZ2V0ID0gbmV3IGFwcGxpY2F0aW9uYXV0b3NjYWxpbmcuU2NhbGFibGVUYXJnZXQodGhpcywgJ1N0YWdpbmdTY2FsYWJsZVRhcmdldCcsIHtcbiAgICAgICAgc2VydmljZU5hbWVzcGFjZTogYXBwbGljYXRpb25hdXRvc2NhbGluZy5TZXJ2aWNlTmFtZXNwYWNlLkVDUyxcbiAgICAgICAgc2NhbGFibGVEaW1lbnNpb246ICdlY3M6c2VydmljZTpEZXNpcmVkQ291bnQnLFxuICAgICAgICByZXNvdXJjZUlkOiBgc2VydmljZS8ke3RoaXMuZWNzQ2x1c3Rlci5jbHVzdGVyTmFtZX0vJHt0aGlzLmVjc1NlcnZpY2Uuc2VydmljZU5hbWV9YCxcbiAgICAgICAgbWluQ2FwYWNpdHk6IHN0YWdpbmdDb25maWcuZWNzLmF1dG9TY2FsaW5nLm1pbkNhcGFjaXR5LFxuICAgICAgICBtYXhDYXBhY2l0eTogc3RhZ2luZ0NvbmZpZy5lY3MuYXV0b1NjYWxpbmcubWF4Q2FwYWNpdHksXG4gICAgICB9KTtcblxuICAgICAgLy8gQ1BVLWJhc2VkIHNjYWxpbmdcbiAgICAgIHNjYWxhYmxlVGFyZ2V0LnNjYWxlVG9UcmFja01ldHJpYygnU3RhZ2luZ0NQVVNjYWxpbmcnLCB7XG4gICAgICAgIHRhcmdldFZhbHVlOiBzdGFnaW5nQ29uZmlnLmVjcy5hdXRvU2NhbGluZy50YXJnZXRDcHVVdGlsaXphdGlvbixcbiAgICAgICAgcHJlZGVmaW5lZE1ldHJpYzogYXBwbGljYXRpb25hdXRvc2NhbGluZy5QcmVkZWZpbmVkTWV0cmljLkVDU19TRVJWSUNFX0FWRVJBR0VfQ1BVX1VUSUxJWkFUSU9OLFxuICAgICAgICBzY2FsZU91dENvb2xkb3duOiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMDApLFxuICAgICAgICBzY2FsZUluQ29vbGRvd246IGNkay5EdXJhdGlvbi5zZWNvbmRzKDYwMCksXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBBcHBseSB0YWdzXG4gICAgT2JqZWN0LmVudHJpZXMoc3RhZ2luZ0NvbmZpZy50YWdzKS5mb3JFYWNoKChba2V5LCB2YWx1ZV0pID0+IHtcbiAgICAgIGNkay5UYWdzLm9mKHRoaXMpLmFkZChrZXksIHZhbHVlKTtcbiAgICB9KTtcblxuICAgIC8vIFN0YWNrIG91dHB1dHNcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnU3RhZ2luZ0NsdXN0ZXJOYW1lJywge1xuICAgICAgdmFsdWU6IHRoaXMuZWNzQ2x1c3Rlci5jbHVzdGVyTmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU3RhZ2luZyBFQ1MgQ2x1c3RlciBOYW1lJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdCQ09TLVN0YWdpbmctQ2x1c3Rlck5hbWUnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1N0YWdpbmdTZXJ2aWNlTmFtZScsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmVjc1NlcnZpY2Uuc2VydmljZU5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ1N0YWdpbmcgRUNTIFNlcnZpY2UgTmFtZScsXG4gICAgICBleHBvcnROYW1lOiAnQkNPUy1TdGFnaW5nLVNlcnZpY2VOYW1lJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdTdGFnaW5nVVJMJywge1xuICAgICAgdmFsdWU6IGBodHRwczovLyR7c3RhZ2luZ0NvbmZpZy5kb21haW59YCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU3RhZ2luZyBBcHBsaWNhdGlvbiBVUkwnLFxuICAgICAgZXhwb3J0TmFtZTogJ0JDT1MtU3RhZ2luZy1VUkwnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1N0YWdpbmdUYXJnZXRHcm91cEFybicsIHtcbiAgICAgIHZhbHVlOiB0aGlzLnRhcmdldEdyb3VwLnRhcmdldEdyb3VwQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdTdGFnaW5nIFRhcmdldCBHcm91cCBBUk4nLFxuICAgICAgZXhwb3J0TmFtZTogJ0JDT1MtU3RhZ2luZy1UYXJnZXRHcm91cEFybicsXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==