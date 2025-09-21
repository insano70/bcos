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
            containerPort: 80,
            environmentVariables: {
                ENVIRONMENT: environment,
                NEXT_PUBLIC_APP_URL: `https://${staging_json_1.default.domain}`,
            },
        });
        // Create target group for staging
        this.targetGroup = new elbv2.ApplicationTargetGroup(this.stack, 'StagingTargetGroup', {
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
        this.ecsService = new ecs.FargateService(this.stack, 'StagingService', {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhZ2luZy1zdGFnZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInN0YWdpbmctc3RhZ2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLHlEQUEyQztBQUMzQyw4RUFBZ0U7QUFDaEUsaUVBQW1EO0FBQ25ELGdGQUFrRTtBQUNsRSwrRkFBaUY7QUFJakYscUVBQWlFO0FBQ2pFLGlFQUE2RDtBQUM3RCx5REFBc0Q7QUFDdEQsNkVBQXNEO0FBT3RELE1BQWEsWUFBYSxTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQ3pCLEtBQUssQ0FBWTtJQUNqQixVQUFVLENBQWM7SUFDeEIsVUFBVSxDQUFxQjtJQUMvQixXQUFXLENBQStCO0lBQzFDLGFBQWEsQ0FBZ0I7SUFDN0IsVUFBVSxDQUFhO0lBRXZDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBd0I7UUFDaEUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxFQUFFLGFBQWEsRUFBRSxZQUFZLEVBQUUsR0FBRyxLQUFLLENBQUM7UUFDOUMsTUFBTSxXQUFXLEdBQUcsU0FBUyxDQUFDO1FBRTlCLGtDQUFrQztRQUNsQyxJQUFJLENBQUMsS0FBSyxHQUFHLElBQUksR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsY0FBYyxFQUFFO1lBQy9DLEdBQUcsRUFBRSxLQUFLLENBQUMsR0FBRztTQUNmLENBQUMsQ0FBQztRQUVILHFCQUFxQjtRQUNyQixJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksR0FBRyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLGdCQUFnQixFQUFFO1lBQzlELFdBQVcsRUFBRSxzQkFBYSxDQUFDLEdBQUcsQ0FBQyxXQUFXO1lBQzFDLEdBQUcsRUFBRSxZQUFZLENBQUMsR0FBRztZQUNyQixpQkFBaUIsRUFBRSxz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Qy9CLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLHVCQUF1QixFQUFFO1lBQ3JELEtBQUssRUFBRSxJQUFJLENBQUMsV0FBVyxDQUFDLGNBQWM7WUFDdEMsV0FBVyxFQUFFLDBCQUEwQjtZQUN2QyxVQUFVLEVBQUUsNkJBQTZCO1NBQzFDLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQW5MRCxvQ0FtTEMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0ICogYXMgZWNzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lY3MnO1xuaW1wb3J0ICogYXMgZWxidjIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVsYXN0aWNsb2FkYmFsYW5jaW5ndjInO1xuaW1wb3J0ICogYXMgcm91dGU1MyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtcm91dGU1Myc7XG5pbXBvcnQgKiBhcyByb3V0ZTUzdGFyZ2V0cyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtcm91dGU1My10YXJnZXRzJztcbmltcG9ydCAqIGFzIGFwcGxpY2F0aW9uYXV0b3NjYWxpbmcgZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwcGxpY2F0aW9uYXV0b3NjYWxpbmcnO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgeyBTZWN1cml0eVN0YWNrIH0gZnJvbSAnLi4vc3RhY2tzL3NlY3VyaXR5LXN0YWNrJztcbmltcG9ydCB7IE5ldHdvcmtTdGFjayB9IGZyb20gJy4uL3N0YWNrcy9uZXR3b3JrLXN0YWNrJztcbmltcG9ydCB7IFNlY3VyZUNvbnRhaW5lciB9IGZyb20gJy4uL2NvbnN0cnVjdHMvc2VjdXJlLWNvbnRhaW5lcic7XG5pbXBvcnQgeyBXYWZQcm90ZWN0aW9uIH0gZnJvbSAnLi4vY29uc3RydWN0cy93YWYtcHJvdGVjdGlvbic7XG5pbXBvcnQgeyBNb25pdG9yaW5nIH0gZnJvbSAnLi4vY29uc3RydWN0cy9tb25pdG9yaW5nJztcbmltcG9ydCBzdGFnaW5nQ29uZmlnIGZyb20gJy4uLy4uL2NvbmZpZy9zdGFnaW5nLmpzb24nO1xuXG5pbnRlcmZhY2UgU3RhZ2luZ1N0YWdlUHJvcHMgZXh0ZW5kcyBjZGsuU3RhZ2VQcm9wcyB7XG4gIHNlY3VyaXR5U3RhY2s6IFNlY3VyaXR5U3RhY2s7XG4gIG5ldHdvcmtTdGFjazogTmV0d29ya1N0YWNrO1xufVxuXG5leHBvcnQgY2xhc3MgU3RhZ2luZ1N0YWdlIGV4dGVuZHMgY2RrLlN0YWdlIHtcbiAgcHVibGljIHJlYWRvbmx5IHN0YWNrOiBjZGsuU3RhY2s7XG4gIHB1YmxpYyByZWFkb25seSBlY3NDbHVzdGVyOiBlY3MuQ2x1c3RlcjtcbiAgcHVibGljIHJlYWRvbmx5IGVjc1NlcnZpY2U6IGVjcy5GYXJnYXRlU2VydmljZTtcbiAgcHVibGljIHJlYWRvbmx5IHRhcmdldEdyb3VwOiBlbGJ2Mi5BcHBsaWNhdGlvblRhcmdldEdyb3VwO1xuICBwdWJsaWMgcmVhZG9ubHkgd2FmUHJvdGVjdGlvbjogV2FmUHJvdGVjdGlvbjtcbiAgcHVibGljIHJlYWRvbmx5IG1vbml0b3Jpbmc6IE1vbml0b3Jpbmc7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IFN0YWdpbmdTdGFnZVByb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICBjb25zdCB7IHNlY3VyaXR5U3RhY2ssIG5ldHdvcmtTdGFjayB9ID0gcHJvcHM7XG4gICAgY29uc3QgZW52aXJvbm1lbnQgPSAnc3RhZ2luZyc7XG5cbiAgICAvLyBDcmVhdGUgYSBzdGFjayB3aXRoaW4gdGhlIHN0YWdlXG4gICAgdGhpcy5zdGFjayA9IG5ldyBjZGsuU3RhY2sodGhpcywgJ1N0YWdpbmdTdGFjaycsIHtcbiAgICAgIGVudjogcHJvcHMuZW52LFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIEVDUyBDbHVzdGVyXG4gICAgdGhpcy5lY3NDbHVzdGVyID0gbmV3IGVjcy5DbHVzdGVyKHRoaXMuc3RhY2ssICdTdGFnaW5nQ2x1c3RlcicsIHtcbiAgICAgIGNsdXN0ZXJOYW1lOiBzdGFnaW5nQ29uZmlnLmVjcy5jbHVzdGVyTmFtZSxcbiAgICAgIHZwYzogbmV0d29ya1N0YWNrLnZwYyxcbiAgICAgIGNvbnRhaW5lckluc2lnaHRzOiBzdGFnaW5nQ29uZmlnLm1vbml0b3JpbmcuZGV0YWlsZWRNb25pdG9yaW5nLFxuICAgICAgZW5hYmxlRmFyZ2F0ZUNhcGFjaXR5UHJvdmlkZXJzOiB0cnVlLFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIHNlY3VyZSBjb250YWluZXIgY29uc3RydWN0XG4gICAgY29uc3Qgc2VjdXJlQ29udGFpbmVyID0gbmV3IFNlY3VyZUNvbnRhaW5lcih0aGlzLnN0YWNrLCAnU2VjdXJlQ29udGFpbmVyJywge1xuICAgICAgZW52aXJvbm1lbnQ6IGVudmlyb25tZW50LFxuICAgICAgY2x1c3RlcjogdGhpcy5lY3NDbHVzdGVyLFxuICAgICAgZWNyUmVwb3NpdG9yeTogc2VjdXJpdHlTdGFjay5lY3JSZXBvc2l0b3J5LFxuICAgICAga21zS2V5OiBzZWN1cml0eVN0YWNrLmttc0tleSxcbiAgICAgIGV4ZWN1dGlvblJvbGU6IHNlY3VyaXR5U3RhY2suZWNzVGFza0V4ZWN1dGlvblJvbGUsXG4gICAgICB0YXNrUm9sZTogc2VjdXJpdHlTdGFjay5lY3NUYXNrUm9sZSxcbiAgICAgIHNlY3JldDogc2VjdXJpdHlTdGFjay5zdGFnaW5nU2VjcmV0LFxuICAgICAgY3B1OiBzdGFnaW5nQ29uZmlnLmVjcy5jcHUsXG4gICAgICBtZW1vcnk6IHN0YWdpbmdDb25maWcuZWNzLm1lbW9yeSxcbiAgICAgIGNvbnRhaW5lclBvcnQ6IDgwLFxuICAgICAgZW52aXJvbm1lbnRWYXJpYWJsZXM6IHtcbiAgICAgICAgRU5WSVJPTk1FTlQ6IGVudmlyb25tZW50LFxuICAgICAgICBORVhUX1BVQkxJQ19BUFBfVVJMOiBgaHR0cHM6Ly8ke3N0YWdpbmdDb25maWcuZG9tYWlufWAsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIHRhcmdldCBncm91cCBmb3Igc3RhZ2luZ1xuICAgIHRoaXMudGFyZ2V0R3JvdXAgPSBuZXcgZWxidjIuQXBwbGljYXRpb25UYXJnZXRHcm91cCh0aGlzLnN0YWNrLCAnU3RhZ2luZ1RhcmdldEdyb3VwJywge1xuICAgICAgdGFyZ2V0R3JvdXBOYW1lOiAnYmNvcy1zdGFnaW5nLXRnJyxcbiAgICAgIHZwYzogbmV0d29ya1N0YWNrLnZwYyxcbiAgICAgIHBvcnQ6IDgwLFxuICAgICAgcHJvdG9jb2w6IGVsYnYyLkFwcGxpY2F0aW9uUHJvdG9jb2wuSFRUUCxcbiAgICAgIHRhcmdldFR5cGU6IGVsYnYyLlRhcmdldFR5cGUuSVAsXG4gICAgICBoZWFsdGhDaGVjazoge1xuICAgICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgICBwYXRoOiAnL2hlYWx0aCcsXG4gICAgICAgIHByb3RvY29sOiBlbGJ2Mi5Qcm90b2NvbC5IVFRQLFxuICAgICAgICBwb3J0OiAnODAnLFxuICAgICAgICBpbnRlcnZhbDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygxMCksXG4gICAgICAgIGhlYWx0aHlUaHJlc2hvbGRDb3VudDogMixcbiAgICAgICAgdW5oZWFsdGh5VGhyZXNob2xkQ291bnQ6IDUsXG4gICAgICAgIGhlYWx0aHlIdHRwQ29kZXM6ICcyMDAnLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBFQ1MgRmFyZ2F0ZSBTZXJ2aWNlXG4gICAgdGhpcy5lY3NTZXJ2aWNlID0gbmV3IGVjcy5GYXJnYXRlU2VydmljZSh0aGlzLnN0YWNrLCAnU3RhZ2luZ1NlcnZpY2UnLCB7XG4gICAgICBzZXJ2aWNlTmFtZTogc3RhZ2luZ0NvbmZpZy5lY3Muc2VydmljZU5hbWUsXG4gICAgICBjbHVzdGVyOiB0aGlzLmVjc0NsdXN0ZXIsXG4gICAgICB0YXNrRGVmaW5pdGlvbjogc2VjdXJlQ29udGFpbmVyLnRhc2tEZWZpbml0aW9uLFxuICAgICAgZGVzaXJlZENvdW50OiBzdGFnaW5nQ29uZmlnLmVjcy5kZXNpcmVkQ291bnQsXG4gICAgICBtaW5IZWFsdGh5UGVyY2VudDogNTAsXG4gICAgICBtYXhIZWFsdGh5UGVyY2VudDogMjAwLFxuICAgICAgdnBjU3VibmV0czoge1xuICAgICAgICBzdWJuZXRUeXBlOiBjZGsuYXdzX2VjMi5TdWJuZXRUeXBlLlBSSVZBVEVfV0lUSF9FR1JFU1MsXG4gICAgICB9LFxuICAgICAgc2VjdXJpdHlHcm91cHM6IFtuZXR3b3JrU3RhY2suZWNzU2VjdXJpdHlHcm91cF0sXG4gICAgICBhc3NpZ25QdWJsaWNJcDogZmFsc2UsXG4vLyBMb2dnaW5nIGVuYWJsZWQgYnkgZGVmYXVsdFxuICAgICAgaGVhbHRoQ2hlY2tHcmFjZVBlcmlvZDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMTIwKSxcbiAgICAgIGNpcmN1aXRCcmVha2VyOiB7XG4gICAgICAgIHJvbGxiYWNrOiB0cnVlLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIEFzc29jaWF0ZSBzZXJ2aWNlIHdpdGggdGFyZ2V0IGdyb3VwXG4gICAgdGhpcy5lY3NTZXJ2aWNlLmF0dGFjaFRvQXBwbGljYXRpb25UYXJnZXRHcm91cCh0aGlzLnRhcmdldEdyb3VwKTtcblxuICAgIC8vIEFkZCBsaXN0ZW5lciBydWxlIGZvciBzdGFnaW5nIHN1YmRvbWFpblxuICAgIG5ldyBlbGJ2Mi5BcHBsaWNhdGlvbkxpc3RlbmVyUnVsZSh0aGlzLnN0YWNrLCAnU3RhZ2luZ0xpc3RlbmVyUnVsZScsIHtcbiAgICAgIGxpc3RlbmVyOiBuZXR3b3JrU3RhY2suaHR0cHNMaXN0ZW5lcixcbiAgICAgIHByaW9yaXR5OiAxMDAsXG4gICAgICBjb25kaXRpb25zOiBbZWxidjIuTGlzdGVuZXJDb25kaXRpb24uaG9zdEhlYWRlcnMoW3N0YWdpbmdDb25maWcuZG9tYWluXSldLFxuICAgICAgYWN0aW9uOiBlbGJ2Mi5MaXN0ZW5lckFjdGlvbi5mb3J3YXJkKFt0aGlzLnRhcmdldEdyb3VwXSksXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgUm91dGU1MyByZWNvcmQgZm9yIHN0YWdpbmcgZG9tYWluXG4gICAgbmV3IHJvdXRlNTMuQVJlY29yZCh0aGlzLnN0YWNrLCAnU3RhZ2luZ0FSZWNvcmQnLCB7XG4gICAgICB6b25lOiBuZXR3b3JrU3RhY2suaG9zdGVkWm9uZSxcbiAgICAgIHJlY29yZE5hbWU6ICdzdGFnaW5nJyxcbiAgICAgIHRhcmdldDogcm91dGU1My5SZWNvcmRUYXJnZXQuZnJvbUFsaWFzKFxuICAgICAgICBuZXcgcm91dGU1M3RhcmdldHMuTG9hZEJhbGFuY2VyVGFyZ2V0KG5ldHdvcmtTdGFjay5sb2FkQmFsYW5jZXIpXG4gICAgICApLFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIFdBRiBwcm90ZWN0aW9uXG4gICAgdGhpcy53YWZQcm90ZWN0aW9uID0gbmV3IFdhZlByb3RlY3Rpb24odGhpcy5zdGFjaywgJ1dBRlByb3RlY3Rpb24nLCB7XG4gICAgICBlbnZpcm9ubWVudDogZW52aXJvbm1lbnQsXG4gICAgICBrbXNLZXk6IHNlY3VyaXR5U3RhY2sua21zS2V5LFxuICAgICAgcmF0ZUxpbWl0UGVySVA6IHN0YWdpbmdDb25maWcud2FmLnJhdGVMaW1pdFBlcklQLFxuICAgICAgZW5hYmxlR2VvQmxvY2tpbmc6IGZhbHNlLFxuICAgICAgZW5hYmxlTWFuYWdlZFJ1bGVzOiB0cnVlLFxuICAgIH0pO1xuXG4gICAgLy8gQXNzb2NpYXRlIFdBRiB3aXRoIGxvYWQgYmFsYW5jZXJcbiAgICB0aGlzLndhZlByb3RlY3Rpb24uYXNzb2NpYXRlV2l0aExvYWRCYWxhbmNlcihuZXR3b3JrU3RhY2subG9hZEJhbGFuY2VyLmxvYWRCYWxhbmNlckFybik7XG5cbiAgICAvLyBDcmVhdGUgbW9uaXRvcmluZ1xuICAgIHRoaXMubW9uaXRvcmluZyA9IG5ldyBNb25pdG9yaW5nKHRoaXMuc3RhY2ssICdNb25pdG9yaW5nJywge1xuICAgICAgZW52aXJvbm1lbnQ6IGVudmlyb25tZW50LFxuICAgICAga21zS2V5OiBzZWN1cml0eVN0YWNrLmttc0tleSxcbiAgICAgIGVjc1NlcnZpY2U6IHRoaXMuZWNzU2VydmljZSxcbiAgICAgIGVjc0NsdXN0ZXI6IHRoaXMuZWNzQ2x1c3RlcixcbiAgICAgIGxvYWRCYWxhbmNlcjogbmV0d29ya1N0YWNrLmxvYWRCYWxhbmNlcixcbiAgICAgIHRhcmdldEdyb3VwOiB0aGlzLnRhcmdldEdyb3VwLFxuICAgICAgbG9nR3JvdXA6IHNlY3VyZUNvbnRhaW5lci5sb2dHcm91cCxcbiAgICAgIGFsZXJ0RW1haWxzOiBbJ2Rldm9wc0BiZW5kY2FyZS5jb20nXSwgLy8gUmVwbGFjZSB3aXRoIGFjdHVhbCBlbWFpbFxuICAgICAgZW5hYmxlRGV0YWlsZWRNb25pdG9yaW5nOiBzdGFnaW5nQ29uZmlnLm1vbml0b3JpbmcuZGV0YWlsZWRNb25pdG9yaW5nLFxuICAgIH0pO1xuXG4gICAgLy8gQ29uZmlndXJlIGF1dG8gc2NhbGluZyAoaWYgZW5hYmxlZClcbiAgICBpZiAoc3RhZ2luZ0NvbmZpZy5lY3MuYXV0b1NjYWxpbmcuZW5hYmxlZCkge1xuICAgICAgY29uc3Qgc2NhbGFibGVUYXJnZXQgPSBuZXcgYXBwbGljYXRpb25hdXRvc2NhbGluZy5TY2FsYWJsZVRhcmdldCh0aGlzLnN0YWNrLCAnU3RhZ2luZ1NjYWxhYmxlVGFyZ2V0Jywge1xuICAgICAgICBzZXJ2aWNlTmFtZXNwYWNlOiBhcHBsaWNhdGlvbmF1dG9zY2FsaW5nLlNlcnZpY2VOYW1lc3BhY2UuRUNTLFxuICAgICAgICBzY2FsYWJsZURpbWVuc2lvbjogJ2VjczpzZXJ2aWNlOkRlc2lyZWRDb3VudCcsXG4gICAgICAgIHJlc291cmNlSWQ6IGBzZXJ2aWNlLyR7dGhpcy5lY3NDbHVzdGVyLmNsdXN0ZXJOYW1lfS8ke3RoaXMuZWNzU2VydmljZS5zZXJ2aWNlTmFtZX1gLFxuICAgICAgICBtaW5DYXBhY2l0eTogc3RhZ2luZ0NvbmZpZy5lY3MuYXV0b1NjYWxpbmcubWluQ2FwYWNpdHksXG4gICAgICAgIG1heENhcGFjaXR5OiBzdGFnaW5nQ29uZmlnLmVjcy5hdXRvU2NhbGluZy5tYXhDYXBhY2l0eSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBDUFUtYmFzZWQgc2NhbGluZ1xuICAgICAgc2NhbGFibGVUYXJnZXQuc2NhbGVUb1RyYWNrTWV0cmljKCdTdGFnaW5nQ1BVU2NhbGluZycsIHtcbiAgICAgICAgdGFyZ2V0VmFsdWU6IHN0YWdpbmdDb25maWcuZWNzLmF1dG9TY2FsaW5nLnRhcmdldENwdVV0aWxpemF0aW9uLFxuICAgICAgICBwcmVkZWZpbmVkTWV0cmljOiBhcHBsaWNhdGlvbmF1dG9zY2FsaW5nLlByZWRlZmluZWRNZXRyaWMuRUNTX1NFUlZJQ0VfQVZFUkFHRV9DUFVfVVRJTElaQVRJT04sXG4gICAgICAgIHNjYWxlT3V0Q29vbGRvd246IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwMCksXG4gICAgICAgIHNjYWxlSW5Db29sZG93bjogY2RrLkR1cmF0aW9uLnNlY29uZHMoNjAwKSxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIEFwcGx5IHRhZ3NcbiAgICBPYmplY3QuZW50cmllcyhzdGFnaW5nQ29uZmlnLnRhZ3MpLmZvckVhY2goKFtrZXksIHZhbHVlXSkgPT4ge1xuICAgICAgY2RrLlRhZ3Mub2YodGhpcy5zdGFjaykuYWRkKGtleSwgdmFsdWUpO1xuICAgIH0pO1xuXG4gICAgLy8gU3RhY2sgb3V0cHV0c1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMuc3RhY2ssICdTdGFnaW5nQ2x1c3Rlck5hbWUnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5lY3NDbHVzdGVyLmNsdXN0ZXJOYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdTdGFnaW5nIEVDUyBDbHVzdGVyIE5hbWUnLFxuICAgICAgZXhwb3J0TmFtZTogJ0JDT1MtU3RhZ2luZy1DbHVzdGVyTmFtZScsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLnN0YWNrLCAnU3RhZ2luZ1NlcnZpY2VOYW1lJywge1xuICAgICAgdmFsdWU6IHRoaXMuZWNzU2VydmljZS5zZXJ2aWNlTmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU3RhZ2luZyBFQ1MgU2VydmljZSBOYW1lJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdCQ09TLVN0YWdpbmctU2VydmljZU5hbWUnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcy5zdGFjaywgJ1N0YWdpbmdVUkwnLCB7XG4gICAgICB2YWx1ZTogYGh0dHBzOi8vJHtzdGFnaW5nQ29uZmlnLmRvbWFpbn1gLFxuICAgICAgZGVzY3JpcHRpb246ICdTdGFnaW5nIEFwcGxpY2F0aW9uIFVSTCcsXG4gICAgICBleHBvcnROYW1lOiAnQkNPUy1TdGFnaW5nLVVSTCcsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLnN0YWNrLCAnU3RhZ2luZ1RhcmdldEdyb3VwQXJuJywge1xuICAgICAgdmFsdWU6IHRoaXMudGFyZ2V0R3JvdXAudGFyZ2V0R3JvdXBBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ1N0YWdpbmcgVGFyZ2V0IEdyb3VwIEFSTicsXG4gICAgICBleHBvcnROYW1lOiAnQkNPUy1TdGFnaW5nLVRhcmdldEdyb3VwQXJuJyxcbiAgICB9KTtcbiAgfVxufVxuIl19