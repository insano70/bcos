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
    stack;
    ecsCluster;
    ecsService;
    targetGroup;
    wafProtection;
    monitoring;
    constructor(scope, id, props) {
        super(scope, id, props);
        const { securityStack, networkStack } = props;
        const environment = 'staging';
        // Create a stack within the stage
        this.stack = new cdk.Stack(this, 'StagingStack', {
            env: props.env,
        });
        // Create ECS Cluster
        this.ecsCluster = new ecs.Cluster(this.stack, 'StagingCluster', {
            clusterName: staging_json_1.default.ecs.clusterName,
            vpc: networkStack.vpc,
            containerInsights: staging_json_1.default.monitoring.detailedMonitoring,
            enableFargateCapacityProviders: true,
        });
        // Create secure container construct
        const secureContainer = new secure_container_1.SecureContainer(this.stack, 'SecureContainer', {
            environment: environment,
            cluster: this.ecsCluster,
            ecrRepository: securityStack.ecrRepository,
            kmsKey: securityStack.kmsKey,
            executionRole: securityStack.ecsTaskExecutionRole,
            taskRole: securityStack.ecsTaskRole,
            secret: securityStack.stagingSecret,
            cpu: staging_json_1.default.ecs.cpu,
            memory: staging_json_1.default.ecs.memory,
            containerPort: 3000,
            environmentVariables: {
                ENVIRONMENT: environment,
                NEXT_PUBLIC_APP_URL: `https://${staging_json_1.default.domain}`,
            },
        });
        // Create target group for staging
        this.targetGroup = new elbv2.ApplicationTargetGroup(this.stack, 'StagingTargetGroup', {
            targetGroupName: 'bcos-staging-tg',
            vpc: networkStack.vpc,
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
        // Create ECS Fargate Service
        this.ecsService = new ecs.FargateService(this.stack, 'StagingService', {
            serviceName: staging_json_1.default.ecs.serviceName,
            cluster: this.ecsCluster,
            taskDefinition: secureContainer.taskDefinition,
            desiredCount: staging_json_1.default.ecs.desiredCount,
            minHealthyPercent: 50,
            maxHealthyPercent: 200,
            vpcSubnets: {
                subnetFilters: [
                    cdk.aws_ec2.SubnetFilter.byIds([
                        'subnet-1d132031', // us-east-1c
                        'subnet-6f277e63', // us-east-1f  
                        'subnet-2563a41a', // us-east-1e
                        // Exclude subnet-095fa406c94abb01f (us-east-1a) - no ALB subnet in this AZ
                    ])
                ]
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
        new elbv2.ApplicationListenerRule(this.stack, 'StagingListenerRule', {
            listener: networkStack.httpsListener,
            priority: 100,
            conditions: [elbv2.ListenerCondition.hostHeaders([staging_json_1.default.domain])],
            action: elbv2.ListenerAction.forward([this.targetGroup]),
        });
        // Create Route53 record for staging domain
        new route53.ARecord(this.stack, 'StagingARecord', {
            zone: networkStack.hostedZone,
            recordName: 'staging',
            target: route53.RecordTarget.fromAlias(new route53targets.LoadBalancerTarget(networkStack.loadBalancer)),
        });
        // Create WAF protection
        this.wafProtection = new waf_protection_1.WafProtection(this.stack, 'WAFProtection', {
            environment: environment,
            kmsKey: securityStack.kmsKey,
            rateLimitPerIP: staging_json_1.default.waf.rateLimitPerIP,
            enableGeoBlocking: false,
            enableManagedRules: true,
        });
        // Associate WAF with load balancer
        this.wafProtection.associateWithLoadBalancer(networkStack.loadBalancer.loadBalancerArn);
        // Create monitoring
        this.monitoring = new monitoring_1.Monitoring(this.stack, 'Monitoring', {
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
            const scalableTarget = new applicationautoscaling.ScalableTarget(this.stack, 'StagingScalableTarget', {
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
            cdk.Tags.of(this.stack).add(key, value);
        });
        // Stack outputs
        new cdk.CfnOutput(this.stack, 'StagingClusterName', {
            value: this.ecsCluster.clusterName,
            description: 'Staging ECS Cluster Name',
            exportName: 'BCOS-Staging-ClusterName',
        });
        new cdk.CfnOutput(this.stack, 'StagingServiceName', {
            value: this.ecsService.serviceName,
            description: 'Staging ECS Service Name',
            exportName: 'BCOS-Staging-ServiceName',
        });
        new cdk.CfnOutput(this.stack, 'StagingURL', {
            value: `https://${staging_json_1.default.domain}`,
            description: 'Staging Application URL',
            exportName: 'BCOS-Staging-URL',
        });
        new cdk.CfnOutput(this.stack, 'StagingTargetGroupArn', {
            value: this.targetGroup.targetGroupArn,
            description: 'Staging Target Group ARN',
            exportName: 'BCOS-Staging-TargetGroupArn',
        });
    }
}
exports.StagingStage = StagingStage;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhZ2luZy1zdGFnZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInN0YWdpbmctc3RhZ2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLHlEQUEyQztBQUMzQyw4RUFBZ0U7QUFDaEUsaUVBQW1EO0FBQ25ELGdGQUFrRTtBQUNsRSwrRkFBaUY7QUFJakYscUVBQWlFO0FBQ2pFLGlFQUE2RDtBQUM3RCx5REFBc0Q7QUFDdEQsNkVBQXNEO0FBT3RELE1BQWEsWUFBYSxTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQ3pCLEtBQUssQ0FBWTtJQUNqQixVQUFVLENBQWM7SUFDeEIsVUFBVSxDQUFxQjtJQUMvQixXQUFXLENBQStCO0lBQzFDLGFBQWEsQ0FBZ0I7SUFDN0IsVUFBVSxDQUFhO0lBRXZDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBd0I7UUFDaEUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxFQUFFLGFBQWEsRUFBRSxZQUFZLEVBQUUsR0FBRyxLQUFLLENBQUM7UUFDOUMsTUFBTSxXQUFXLEdBQUcsU0FBUyxDQUFDO1FBRTlCLGtDQUFrQztRQUNsQyxJQUFJLENBQUMsS0FBSyxHQUFHLElBQUksR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsY0FBYyxFQUFFO1lBQy9DLEdBQUcsRUFBRSxLQUFLLENBQUMsR0FBRztTQUNmLENBQUMsQ0FBQztRQUVILHFCQUFxQjtRQUNyQixJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksR0FBRyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLGdCQUFnQixFQUFFO1lBQzlELFdBQVcsRUFBRSxzQkFBYSxDQUFDLEdBQUcsQ0FBQyxXQUFXO1lBQzFDLEdBQUcsRUFBRSxZQUFZLENBQUMsR0FBRztZQUNyQixpQkFBaUIsRUFBRSxz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QUMsS0FBSyxFQUFFLFlBQVksRUFBRTtZQUMxQyxLQUFLLEVBQUUsV0FBVyxzQkFBYSxDQUFDLE1BQU0sRUFBRTtZQUN4QyxXQUFXLEVBQUUseUJBQXlCO1lBQ3RDLFVBQVUsRUFBRSxrQkFBa0I7U0FDL0IsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsdUJBQXVCLEVBQUU7WUFDckQsS0FBSyxFQUFFLElBQUksQ0FBQyxXQUFXLENBQUMsY0FBYztZQUN0QyxXQUFXLEVBQUUsMEJBQTBCO1lBQ3ZDLFVBQVUsRUFBRSw2QkFBNkI7U0FDMUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBMUxELG9DQTBMQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgKiBhcyBlY3MgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVjcyc7XG5pbXBvcnQgKiBhcyBlbGJ2MiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWxhc3RpY2xvYWRiYWxhbmNpbmd2Mic7XG5pbXBvcnQgKiBhcyByb3V0ZTUzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1yb3V0ZTUzJztcbmltcG9ydCAqIGFzIHJvdXRlNTN0YXJnZXRzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1yb3V0ZTUzLXRhcmdldHMnO1xuaW1wb3J0ICogYXMgYXBwbGljYXRpb25hdXRvc2NhbGluZyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtYXBwbGljYXRpb25hdXRvc2NhbGluZyc7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCB7IFNlY3VyaXR5U3RhY2sgfSBmcm9tICcuLi9zdGFja3Mvc2VjdXJpdHktc3RhY2snO1xuaW1wb3J0IHsgTmV0d29ya1N0YWNrIH0gZnJvbSAnLi4vc3RhY2tzL25ldHdvcmstc3RhY2snO1xuaW1wb3J0IHsgU2VjdXJlQ29udGFpbmVyIH0gZnJvbSAnLi4vY29uc3RydWN0cy9zZWN1cmUtY29udGFpbmVyJztcbmltcG9ydCB7IFdhZlByb3RlY3Rpb24gfSBmcm9tICcuLi9jb25zdHJ1Y3RzL3dhZi1wcm90ZWN0aW9uJztcbmltcG9ydCB7IE1vbml0b3JpbmcgfSBmcm9tICcuLi9jb25zdHJ1Y3RzL21vbml0b3JpbmcnO1xuaW1wb3J0IHN0YWdpbmdDb25maWcgZnJvbSAnLi4vLi4vY29uZmlnL3N0YWdpbmcuanNvbic7XG5cbmludGVyZmFjZSBTdGFnaW5nU3RhZ2VQcm9wcyBleHRlbmRzIGNkay5TdGFnZVByb3BzIHtcbiAgc2VjdXJpdHlTdGFjazogU2VjdXJpdHlTdGFjaztcbiAgbmV0d29ya1N0YWNrOiBOZXR3b3JrU3RhY2s7XG59XG5cbmV4cG9ydCBjbGFzcyBTdGFnaW5nU3RhZ2UgZXh0ZW5kcyBjZGsuU3RhZ2Uge1xuICBwdWJsaWMgcmVhZG9ubHkgc3RhY2s6IGNkay5TdGFjaztcbiAgcHVibGljIHJlYWRvbmx5IGVjc0NsdXN0ZXI6IGVjcy5DbHVzdGVyO1xuICBwdWJsaWMgcmVhZG9ubHkgZWNzU2VydmljZTogZWNzLkZhcmdhdGVTZXJ2aWNlO1xuICBwdWJsaWMgcmVhZG9ubHkgdGFyZ2V0R3JvdXA6IGVsYnYyLkFwcGxpY2F0aW9uVGFyZ2V0R3JvdXA7XG4gIHB1YmxpYyByZWFkb25seSB3YWZQcm90ZWN0aW9uOiBXYWZQcm90ZWN0aW9uO1xuICBwdWJsaWMgcmVhZG9ubHkgbW9uaXRvcmluZzogTW9uaXRvcmluZztcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogU3RhZ2luZ1N0YWdlUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIGNvbnN0IHsgc2VjdXJpdHlTdGFjaywgbmV0d29ya1N0YWNrIH0gPSBwcm9wcztcbiAgICBjb25zdCBlbnZpcm9ubWVudCA9ICdzdGFnaW5nJztcblxuICAgIC8vIENyZWF0ZSBhIHN0YWNrIHdpdGhpbiB0aGUgc3RhZ2VcbiAgICB0aGlzLnN0YWNrID0gbmV3IGNkay5TdGFjayh0aGlzLCAnU3RhZ2luZ1N0YWNrJywge1xuICAgICAgZW52OiBwcm9wcy5lbnYsXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgRUNTIENsdXN0ZXJcbiAgICB0aGlzLmVjc0NsdXN0ZXIgPSBuZXcgZWNzLkNsdXN0ZXIodGhpcy5zdGFjaywgJ1N0YWdpbmdDbHVzdGVyJywge1xuICAgICAgY2x1c3Rlck5hbWU6IHN0YWdpbmdDb25maWcuZWNzLmNsdXN0ZXJOYW1lLFxuICAgICAgdnBjOiBuZXR3b3JrU3RhY2sudnBjLFxuICAgICAgY29udGFpbmVySW5zaWdodHM6IHN0YWdpbmdDb25maWcubW9uaXRvcmluZy5kZXRhaWxlZE1vbml0b3JpbmcsXG4gICAgICBlbmFibGVGYXJnYXRlQ2FwYWNpdHlQcm92aWRlcnM6IHRydWUsXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgc2VjdXJlIGNvbnRhaW5lciBjb25zdHJ1Y3RcbiAgICBjb25zdCBzZWN1cmVDb250YWluZXIgPSBuZXcgU2VjdXJlQ29udGFpbmVyKHRoaXMuc3RhY2ssICdTZWN1cmVDb250YWluZXInLCB7XG4gICAgICBlbnZpcm9ubWVudDogZW52aXJvbm1lbnQsXG4gICAgICBjbHVzdGVyOiB0aGlzLmVjc0NsdXN0ZXIsXG4gICAgICBlY3JSZXBvc2l0b3J5OiBzZWN1cml0eVN0YWNrLmVjclJlcG9zaXRvcnksXG4gICAgICBrbXNLZXk6IHNlY3VyaXR5U3RhY2sua21zS2V5LFxuICAgICAgZXhlY3V0aW9uUm9sZTogc2VjdXJpdHlTdGFjay5lY3NUYXNrRXhlY3V0aW9uUm9sZSxcbiAgICAgIHRhc2tSb2xlOiBzZWN1cml0eVN0YWNrLmVjc1Rhc2tSb2xlLFxuICAgICAgc2VjcmV0OiBzZWN1cml0eVN0YWNrLnN0YWdpbmdTZWNyZXQsXG4gICAgICBjcHU6IHN0YWdpbmdDb25maWcuZWNzLmNwdSxcbiAgICAgIG1lbW9yeTogc3RhZ2luZ0NvbmZpZy5lY3MubWVtb3J5LFxuICAgICAgY29udGFpbmVyUG9ydDogMzAwMCxcbiAgICAgIGVudmlyb25tZW50VmFyaWFibGVzOiB7XG4gICAgICAgIEVOVklST05NRU5UOiBlbnZpcm9ubWVudCxcbiAgICAgICAgTkVYVF9QVUJMSUNfQVBQX1VSTDogYGh0dHBzOi8vJHtzdGFnaW5nQ29uZmlnLmRvbWFpbn1gLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSB0YXJnZXQgZ3JvdXAgZm9yIHN0YWdpbmdcbiAgICB0aGlzLnRhcmdldEdyb3VwID0gbmV3IGVsYnYyLkFwcGxpY2F0aW9uVGFyZ2V0R3JvdXAodGhpcy5zdGFjaywgJ1N0YWdpbmdUYXJnZXRHcm91cCcsIHtcbiAgICAgIHRhcmdldEdyb3VwTmFtZTogJ2Jjb3Mtc3RhZ2luZy10ZycsXG4gICAgICB2cGM6IG5ldHdvcmtTdGFjay52cGMsXG4gICAgICBwb3J0OiAzMDAwLFxuICAgICAgcHJvdG9jb2w6IGVsYnYyLkFwcGxpY2F0aW9uUHJvdG9jb2wuSFRUUCxcbiAgICAgIHRhcmdldFR5cGU6IGVsYnYyLlRhcmdldFR5cGUuSVAsXG4gICAgICBoZWFsdGhDaGVjazoge1xuICAgICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgICBwYXRoOiAnL2FwaS9oZWFsdGgnLFxuICAgICAgICBwcm90b2NvbDogZWxidjIuUHJvdG9jb2wuSFRUUCxcbiAgICAgICAgcG9ydDogJzMwMDAnLFxuICAgICAgICBpbnRlcnZhbDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygxMCksXG4gICAgICAgIGhlYWx0aHlUaHJlc2hvbGRDb3VudDogMixcbiAgICAgICAgdW5oZWFsdGh5VGhyZXNob2xkQ291bnQ6IDUsXG4gICAgICAgIGhlYWx0aHlIdHRwQ29kZXM6ICcyMDAnLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBFQ1MgRmFyZ2F0ZSBTZXJ2aWNlXG4gICAgdGhpcy5lY3NTZXJ2aWNlID0gbmV3IGVjcy5GYXJnYXRlU2VydmljZSh0aGlzLnN0YWNrLCAnU3RhZ2luZ1NlcnZpY2UnLCB7XG4gICAgICBzZXJ2aWNlTmFtZTogc3RhZ2luZ0NvbmZpZy5lY3Muc2VydmljZU5hbWUsXG4gICAgICBjbHVzdGVyOiB0aGlzLmVjc0NsdXN0ZXIsXG4gICAgICB0YXNrRGVmaW5pdGlvbjogc2VjdXJlQ29udGFpbmVyLnRhc2tEZWZpbml0aW9uLFxuICAgICAgZGVzaXJlZENvdW50OiBzdGFnaW5nQ29uZmlnLmVjcy5kZXNpcmVkQ291bnQsXG4gICAgICBtaW5IZWFsdGh5UGVyY2VudDogNTAsXG4gICAgICBtYXhIZWFsdGh5UGVyY2VudDogMjAwLFxuICAgICAgdnBjU3VibmV0czoge1xuICAgICAgICBzdWJuZXRGaWx0ZXJzOiBbXG4gICAgICAgICAgY2RrLmF3c19lYzIuU3VibmV0RmlsdGVyLmJ5SWRzKFtcbiAgICAgICAgICAgICdzdWJuZXQtMWQxMzIwMzEnLCAvLyB1cy1lYXN0LTFjXG4gICAgICAgICAgICAnc3VibmV0LTZmMjc3ZTYzJywgLy8gdXMtZWFzdC0xZiAgXG4gICAgICAgICAgICAnc3VibmV0LTI1NjNhNDFhJywgLy8gdXMtZWFzdC0xZVxuICAgICAgICAgICAgLy8gRXhjbHVkZSBzdWJuZXQtMDk1ZmE0MDZjOTRhYmIwMWYgKHVzLWVhc3QtMWEpIC0gbm8gQUxCIHN1Ym5ldCBpbiB0aGlzIEFaXG4gICAgICAgICAgXSlcbiAgICAgICAgXVxuICAgICAgfSxcbiAgICAgIHNlY3VyaXR5R3JvdXBzOiBbbmV0d29ya1N0YWNrLmVjc1NlY3VyaXR5R3JvdXBdLFxuICAgICAgYXNzaWduUHVibGljSXA6IGZhbHNlLFxuLy8gTG9nZ2luZyBlbmFibGVkIGJ5IGRlZmF1bHRcbiAgICAgIGhlYWx0aENoZWNrR3JhY2VQZXJpb2Q6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDEyMCksXG4gICAgICBjaXJjdWl0QnJlYWtlcjoge1xuICAgICAgICByb2xsYmFjazogdHJ1ZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBBc3NvY2lhdGUgc2VydmljZSB3aXRoIHRhcmdldCBncm91cFxuICAgIHRoaXMuZWNzU2VydmljZS5hdHRhY2hUb0FwcGxpY2F0aW9uVGFyZ2V0R3JvdXAodGhpcy50YXJnZXRHcm91cCk7XG5cbiAgICAvLyBBZGQgbGlzdGVuZXIgcnVsZSBmb3Igc3RhZ2luZyBzdWJkb21haW5cbiAgICBuZXcgZWxidjIuQXBwbGljYXRpb25MaXN0ZW5lclJ1bGUodGhpcy5zdGFjaywgJ1N0YWdpbmdMaXN0ZW5lclJ1bGUnLCB7XG4gICAgICBsaXN0ZW5lcjogbmV0d29ya1N0YWNrLmh0dHBzTGlzdGVuZXIsXG4gICAgICBwcmlvcml0eTogMTAwLFxuICAgICAgY29uZGl0aW9uczogW2VsYnYyLkxpc3RlbmVyQ29uZGl0aW9uLmhvc3RIZWFkZXJzKFtzdGFnaW5nQ29uZmlnLmRvbWFpbl0pXSxcbiAgICAgIGFjdGlvbjogZWxidjIuTGlzdGVuZXJBY3Rpb24uZm9yd2FyZChbdGhpcy50YXJnZXRHcm91cF0pLFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIFJvdXRlNTMgcmVjb3JkIGZvciBzdGFnaW5nIGRvbWFpblxuICAgIG5ldyByb3V0ZTUzLkFSZWNvcmQodGhpcy5zdGFjaywgJ1N0YWdpbmdBUmVjb3JkJywge1xuICAgICAgem9uZTogbmV0d29ya1N0YWNrLmhvc3RlZFpvbmUsXG4gICAgICByZWNvcmROYW1lOiAnc3RhZ2luZycsXG4gICAgICB0YXJnZXQ6IHJvdXRlNTMuUmVjb3JkVGFyZ2V0LmZyb21BbGlhcyhcbiAgICAgICAgbmV3IHJvdXRlNTN0YXJnZXRzLkxvYWRCYWxhbmNlclRhcmdldChuZXR3b3JrU3RhY2subG9hZEJhbGFuY2VyKVxuICAgICAgKSxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBXQUYgcHJvdGVjdGlvblxuICAgIHRoaXMud2FmUHJvdGVjdGlvbiA9IG5ldyBXYWZQcm90ZWN0aW9uKHRoaXMuc3RhY2ssICdXQUZQcm90ZWN0aW9uJywge1xuICAgICAgZW52aXJvbm1lbnQ6IGVudmlyb25tZW50LFxuICAgICAga21zS2V5OiBzZWN1cml0eVN0YWNrLmttc0tleSxcbiAgICAgIHJhdGVMaW1pdFBlcklQOiBzdGFnaW5nQ29uZmlnLndhZi5yYXRlTGltaXRQZXJJUCxcbiAgICAgIGVuYWJsZUdlb0Jsb2NraW5nOiBmYWxzZSxcbiAgICAgIGVuYWJsZU1hbmFnZWRSdWxlczogdHJ1ZSxcbiAgICB9KTtcblxuICAgIC8vIEFzc29jaWF0ZSBXQUYgd2l0aCBsb2FkIGJhbGFuY2VyXG4gICAgdGhpcy53YWZQcm90ZWN0aW9uLmFzc29jaWF0ZVdpdGhMb2FkQmFsYW5jZXIobmV0d29ya1N0YWNrLmxvYWRCYWxhbmNlci5sb2FkQmFsYW5jZXJBcm4pO1xuXG4gICAgLy8gQ3JlYXRlIG1vbml0b3JpbmdcbiAgICB0aGlzLm1vbml0b3JpbmcgPSBuZXcgTW9uaXRvcmluZyh0aGlzLnN0YWNrLCAnTW9uaXRvcmluZycsIHtcbiAgICAgIGVudmlyb25tZW50OiBlbnZpcm9ubWVudCxcbiAgICAgIGttc0tleTogc2VjdXJpdHlTdGFjay5rbXNLZXksXG4gICAgICBlY3NTZXJ2aWNlOiB0aGlzLmVjc1NlcnZpY2UsXG4gICAgICBlY3NDbHVzdGVyOiB0aGlzLmVjc0NsdXN0ZXIsXG4gICAgICBsb2FkQmFsYW5jZXI6IG5ldHdvcmtTdGFjay5sb2FkQmFsYW5jZXIsXG4gICAgICB0YXJnZXRHcm91cDogdGhpcy50YXJnZXRHcm91cCxcbiAgICAgIGxvZ0dyb3VwOiBzZWN1cmVDb250YWluZXIubG9nR3JvdXAsXG4gICAgICBhbGVydEVtYWlsczogWydkZXZvcHNAYmVuZGNhcmUuY29tJ10sIC8vIFJlcGxhY2Ugd2l0aCBhY3R1YWwgZW1haWxcbiAgICAgIGVuYWJsZURldGFpbGVkTW9uaXRvcmluZzogc3RhZ2luZ0NvbmZpZy5tb25pdG9yaW5nLmRldGFpbGVkTW9uaXRvcmluZyxcbiAgICB9KTtcblxuICAgIC8vIENvbmZpZ3VyZSBhdXRvIHNjYWxpbmcgKGlmIGVuYWJsZWQpXG4gICAgaWYgKHN0YWdpbmdDb25maWcuZWNzLmF1dG9TY2FsaW5nLmVuYWJsZWQpIHtcbiAgICAgIGNvbnN0IHNjYWxhYmxlVGFyZ2V0ID0gbmV3IGFwcGxpY2F0aW9uYXV0b3NjYWxpbmcuU2NhbGFibGVUYXJnZXQodGhpcy5zdGFjaywgJ1N0YWdpbmdTY2FsYWJsZVRhcmdldCcsIHtcbiAgICAgICAgc2VydmljZU5hbWVzcGFjZTogYXBwbGljYXRpb25hdXRvc2NhbGluZy5TZXJ2aWNlTmFtZXNwYWNlLkVDUyxcbiAgICAgICAgc2NhbGFibGVEaW1lbnNpb246ICdlY3M6c2VydmljZTpEZXNpcmVkQ291bnQnLFxuICAgICAgICByZXNvdXJjZUlkOiBgc2VydmljZS8ke3RoaXMuZWNzQ2x1c3Rlci5jbHVzdGVyTmFtZX0vJHt0aGlzLmVjc1NlcnZpY2Uuc2VydmljZU5hbWV9YCxcbiAgICAgICAgbWluQ2FwYWNpdHk6IHN0YWdpbmdDb25maWcuZWNzLmF1dG9TY2FsaW5nLm1pbkNhcGFjaXR5LFxuICAgICAgICBtYXhDYXBhY2l0eTogc3RhZ2luZ0NvbmZpZy5lY3MuYXV0b1NjYWxpbmcubWF4Q2FwYWNpdHksXG4gICAgICB9KTtcblxuICAgICAgLy8gQ1BVLWJhc2VkIHNjYWxpbmdcbiAgICAgIHNjYWxhYmxlVGFyZ2V0LnNjYWxlVG9UcmFja01ldHJpYygnU3RhZ2luZ0NQVVNjYWxpbmcnLCB7XG4gICAgICAgIHRhcmdldFZhbHVlOiBzdGFnaW5nQ29uZmlnLmVjcy5hdXRvU2NhbGluZy50YXJnZXRDcHVVdGlsaXphdGlvbixcbiAgICAgICAgcHJlZGVmaW5lZE1ldHJpYzogYXBwbGljYXRpb25hdXRvc2NhbGluZy5QcmVkZWZpbmVkTWV0cmljLkVDU19TRVJWSUNFX0FWRVJBR0VfQ1BVX1VUSUxJWkFUSU9OLFxuICAgICAgICBzY2FsZU91dENvb2xkb3duOiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMDApLFxuICAgICAgICBzY2FsZUluQ29vbGRvd246IGNkay5EdXJhdGlvbi5zZWNvbmRzKDYwMCksXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBBcHBseSB0YWdzXG4gICAgT2JqZWN0LmVudHJpZXMoc3RhZ2luZ0NvbmZpZy50YWdzKS5mb3JFYWNoKChba2V5LCB2YWx1ZV0pID0+IHtcbiAgICAgIGNkay5UYWdzLm9mKHRoaXMuc3RhY2spLmFkZChrZXksIHZhbHVlKTtcbiAgICB9KTtcblxuICAgIC8vIFN0YWNrIG91dHB1dHNcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLnN0YWNrLCAnU3RhZ2luZ0NsdXN0ZXJOYW1lJywge1xuICAgICAgdmFsdWU6IHRoaXMuZWNzQ2x1c3Rlci5jbHVzdGVyTmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU3RhZ2luZyBFQ1MgQ2x1c3RlciBOYW1lJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdCQ09TLVN0YWdpbmctQ2x1c3Rlck5hbWUnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcy5zdGFjaywgJ1N0YWdpbmdTZXJ2aWNlTmFtZScsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmVjc1NlcnZpY2Uuc2VydmljZU5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ1N0YWdpbmcgRUNTIFNlcnZpY2UgTmFtZScsXG4gICAgICBleHBvcnROYW1lOiAnQkNPUy1TdGFnaW5nLVNlcnZpY2VOYW1lJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMuc3RhY2ssICdTdGFnaW5nVVJMJywge1xuICAgICAgdmFsdWU6IGBodHRwczovLyR7c3RhZ2luZ0NvbmZpZy5kb21haW59YCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU3RhZ2luZyBBcHBsaWNhdGlvbiBVUkwnLFxuICAgICAgZXhwb3J0TmFtZTogJ0JDT1MtU3RhZ2luZy1VUkwnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcy5zdGFjaywgJ1N0YWdpbmdUYXJnZXRHcm91cEFybicsIHtcbiAgICAgIHZhbHVlOiB0aGlzLnRhcmdldEdyb3VwLnRhcmdldEdyb3VwQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdTdGFnaW5nIFRhcmdldCBHcm91cCBBUk4nLFxuICAgICAgZXhwb3J0TmFtZTogJ0JDT1MtU3RhZ2luZy1UYXJnZXRHcm91cEFybicsXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==