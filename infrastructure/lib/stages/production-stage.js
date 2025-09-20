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
exports.ProductionStage = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const ecs = __importStar(require("aws-cdk-lib/aws-ecs"));
const elbv2 = __importStar(require("aws-cdk-lib/aws-elasticloadbalancingv2"));
const route53 = __importStar(require("aws-cdk-lib/aws-route53"));
const route53targets = __importStar(require("aws-cdk-lib/aws-route53-targets"));
const applicationautoscaling = __importStar(require("aws-cdk-lib/aws-applicationautoscaling"));
const backup = __importStar(require("aws-cdk-lib/aws-backup"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const secure_container_1 = require("../constructs/secure-container");
const waf_protection_1 = require("../constructs/waf-protection");
const monitoring_1 = require("../constructs/monitoring");
const production_json_1 = __importDefault(require("../../config/production.json"));
class ProductionStage extends cdk.Stage {
    stack;
    ecsCluster;
    ecsService;
    targetGroup;
    wafProtection;
    monitoring;
    backupPlan;
    constructor(scope, id, props) {
        super(scope, id, props);
        const { securityStack, networkStack } = props;
        const environment = 'production';
        // Create a stack within the stage
        this.stack = new cdk.Stack(this, 'ProductionStack', {
            env: props.env,
        });
        // Create ECS Cluster with enhanced monitoring
        this.ecsCluster = new ecs.Cluster(this.stack, 'ProductionCluster', {
            clusterName: production_json_1.default.ecs.clusterName,
            vpc: networkStack.vpc,
            containerInsights: production_json_1.default.monitoring.detailedMonitoring,
            enableFargateCapacityProviders: true,
            executeCommandConfiguration: {
                // Enable execute command for debugging (with logging)
                logging: ecs.ExecuteCommandLogging.OVERRIDE,
                logConfiguration: {
                    cloudWatchLogGroup: new cdk.aws_logs.LogGroup(this.stack, 'ExecuteCommandLogGroup', {
                        logGroupName: '/ecs/execute-command/bcos-production',
                        retention: cdk.aws_logs.RetentionDays.ONE_MONTH,
                        encryptionKey: securityStack.kmsKey,
                    }),
                    cloudWatchEncryptionEnabled: true,
                },
            },
        });
        // Create secure container construct
        const secureContainer = new secure_container_1.SecureContainer(this.stack, 'SecureContainer', {
            environment: environment,
            cluster: this.ecsCluster,
            ecrRepository: securityStack.ecrRepository,
            kmsKey: securityStack.kmsKey,
            executionRole: securityStack.ecsTaskExecutionRole,
            taskRole: securityStack.ecsTaskRole,
            secret: securityStack.productionSecret,
            cpu: production_json_1.default.ecs.cpu,
            memory: production_json_1.default.ecs.memory,
            containerPort: 80,
            environmentVariables: {
                ENVIRONMENT: environment,
                NEXT_PUBLIC_APP_URL: `https://${production_json_1.default.domain}`,
            },
        });
        // Create target group for production
        this.targetGroup = new elbv2.ApplicationTargetGroup(this.stack, 'ProductionTargetGroup', {
            targetGroupName: 'bcos-production-tg',
            vpc: networkStack.vpc,
            port: 80,
            protocol: elbv2.ApplicationProtocol.HTTP,
            targetType: elbv2.TargetType.IP,
            healthCheck: {
                enabled: true,
                path: '/health',
                protocol: elbv2.Protocol.HTTP,
                port: '80',
                interval: cdk.Duration.seconds(15),
                timeout: cdk.Duration.seconds(5),
                healthyThresholdCount: 2,
                unhealthyThresholdCount: 3,
                healthyHttpCodes: '200',
            },
            // Target group attributes for production
            deregistrationDelay: cdk.Duration.seconds(30),
            stickinessCookieDuration: cdk.Duration.hours(1),
        });
        // Create ECS Fargate Service with enhanced configuration
        this.ecsService = new ecs.FargateService(this.stack, 'ProductionService', {
            serviceName: production_json_1.default.ecs.serviceName,
            cluster: this.ecsCluster,
            taskDefinition: secureContainer.taskDefinition,
            desiredCount: production_json_1.default.ecs.desiredCount,
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
            // Production-specific settings
            enableExecuteCommand: true, // For debugging (requires proper IAM permissions)
        });
        // Associate service with target group
        this.ecsService.attachToApplicationTargetGroup(this.targetGroup);
        // Set target group as default action for HTTPS listener
        networkStack.httpsListener.addAction('ProductionDefault', {
            action: elbv2.ListenerAction.forward([this.targetGroup]),
            conditions: [
                elbv2.ListenerCondition.hostHeaders([production_json_1.default.domain]),
            ],
            priority: 10, // Higher priority than staging
        });
        // Create Route53 record for production domain
        new route53.ARecord(this.stack, 'ProductionARecord', {
            zone: networkStack.hostedZone,
            recordName: 'app',
            target: route53.RecordTarget.fromAlias(new route53targets.LoadBalancerTarget(networkStack.loadBalancer)),
        });
        // Create WAF protection with enhanced rules
        this.wafProtection = new waf_protection_1.WafProtection(this.stack, 'WAFProtection', {
            environment: environment,
            kmsKey: securityStack.kmsKey,
            rateLimitPerIP: production_json_1.default.waf.rateLimitPerIP,
            enableGeoBlocking: production_json_1.default.waf.geoBlocking?.enabled || false,
            blockedCountries: production_json_1.default.waf.geoBlocking?.blockedCountries || [],
            enableManagedRules: true,
        });
        // Associate WAF with load balancer
        this.wafProtection.associateWithLoadBalancer(networkStack.loadBalancer.loadBalancerArn);
        // Create comprehensive monitoring
        this.monitoring = new monitoring_1.Monitoring(this.stack, 'Monitoring', {
            environment: environment,
            kmsKey: securityStack.kmsKey,
            ecsService: this.ecsService,
            ecsCluster: this.ecsCluster,
            loadBalancer: networkStack.loadBalancer,
            targetGroup: this.targetGroup,
            logGroup: secureContainer.logGroup,
            alertEmails: ['production-alerts@bendcare.com'], // Replace with actual email
            enableDetailedMonitoring: production_json_1.default.monitoring.detailedMonitoring,
        });
        // Configure auto scaling
        if (production_json_1.default.ecs.autoScaling.enabled) {
            const scalableTarget = new applicationautoscaling.ScalableTarget(this.stack, 'ProductionScalableTarget', {
                serviceNamespace: applicationautoscaling.ServiceNamespace.ECS,
                scalableDimension: 'ecs:service:DesiredCount',
                resourceId: `service/${this.ecsCluster.clusterName}/${this.ecsService.serviceName}`,
                minCapacity: production_json_1.default.ecs.autoScaling.minCapacity,
                maxCapacity: production_json_1.default.ecs.autoScaling.maxCapacity,
            });
            // CPU-based scaling
            scalableTarget.scaleToTrackMetric('ProductionCPUScaling', {
                targetValue: production_json_1.default.ecs.autoScaling.targetCpuUtilization,
                predefinedMetric: applicationautoscaling.PredefinedMetric.ECS_SERVICE_AVERAGE_CPU_UTILIZATION,
                scaleOutCooldown: cdk.Duration.seconds(production_json_1.default.ecs.autoScaling.scaleOutCooldown),
                scaleInCooldown: cdk.Duration.seconds(production_json_1.default.ecs.autoScaling.scaleInCooldown),
            });
            // Memory-based scaling
            scalableTarget.scaleToTrackMetric('ProductionMemoryScaling', {
                targetValue: production_json_1.default.ecs.autoScaling.targetMemoryUtilization,
                predefinedMetric: applicationautoscaling.PredefinedMetric.ECS_SERVICE_AVERAGE_MEMORY_UTILIZATION,
                scaleOutCooldown: cdk.Duration.seconds(production_json_1.default.ecs.autoScaling.scaleOutCooldown),
                scaleInCooldown: cdk.Duration.seconds(production_json_1.default.ecs.autoScaling.scaleInCooldown),
            });
            // Request count based scaling (ALB)
            const loadBalancerFullName = cdk.Token.isUnresolved(networkStack.loadBalancer.loadBalancerArn)
                ? 'dummy-alb-name'
                : networkStack.loadBalancer.loadBalancerArn.split('/').slice(1).join('/');
            const targetGroupFullName = cdk.Token.isUnresolved(this.targetGroup.targetGroupArn)
                ? 'dummy-tg-name'
                : this.targetGroup.targetGroupArn.split('/').slice(1).join('/');
            const requestCountMetric = new cdk.aws_cloudwatch.Metric({
                namespace: 'AWS/ApplicationELB',
                metricName: 'RequestCountPerTarget',
                dimensionsMap: {
                    LoadBalancer: loadBalancerFullName,
                    TargetGroup: targetGroupFullName,
                },
                statistic: 'Sum',
                period: cdk.Duration.minutes(1),
            });
            scalableTarget.scaleToTrackMetric('ProductionRequestScaling', {
                targetValue: 1000, // Requests per target per minute
                customMetric: requestCountMetric,
                scaleOutCooldown: cdk.Duration.seconds(production_json_1.default.ecs.autoScaling.scaleOutCooldown),
                scaleInCooldown: cdk.Duration.seconds(production_json_1.default.ecs.autoScaling.scaleInCooldown),
            });
            // Scheduled scaling for business hours
            scalableTarget.scaleOnSchedule('ProductionBusinessHoursScaling', {
                schedule: applicationautoscaling.Schedule.cron({
                    hour: '8',
                    minute: '0',
                    weekDay: '1-5', // Monday to Friday
                }),
                minCapacity: 4,
                maxCapacity: production_json_1.default.ecs.autoScaling.maxCapacity,
            });
            scalableTarget.scaleOnSchedule('ProductionOffHoursScaling', {
                schedule: applicationautoscaling.Schedule.cron({
                    hour: '20',
                    minute: '0',
                    weekDay: '1-5', // Monday to Friday
                }),
                minCapacity: production_json_1.default.ecs.autoScaling.minCapacity,
                maxCapacity: 10,
            });
        }
        // Create backup plan for production (if enabled)
        if (production_json_1.default.backup?.enabled) {
            // Create backup role
            const backupRole = new iam.Role(this.stack, 'BackupRole', {
                assumedBy: new iam.ServicePrincipal('backup.amazonaws.com'),
                managedPolicies: [
                    iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSBackupServiceRolePolicyForBackup'),
                ],
            });
            // Create backup vault
            const backupVault = new backup.BackupVault(this.stack, 'BackupVault', {
                backupVaultName: `bcos-${environment}-backup-vault`,
                encryptionKey: securityStack.kmsKey,
            });
            // Create backup plan
            this.backupPlan = new backup.BackupPlan(this.stack, 'BackupPlan', {
                backupPlanName: `bcos-${environment}-backup-plan`,
                backupVault: backupVault,
                backupPlanRules: [
                // Backup rule configuration would go here
                // Note: BackupPlan API has changed in newer CDK versions
                ],
            });
            // Note: ECS tasks don't have persistent storage to back up
            // This would be used for backing up databases or persistent volumes if added
        }
        // Apply tags
        Object.entries(production_json_1.default.tags).forEach(([key, value]) => {
            cdk.Tags.of(this.stack).add(key, value);
        });
        // Stack outputs
        new cdk.CfnOutput(this.stack, 'ProductionClusterName', {
            value: this.ecsCluster.clusterName,
            description: 'Production ECS Cluster Name',
            exportName: 'BCOS-Production-ClusterName',
        });
        new cdk.CfnOutput(this.stack, 'ProductionServiceName', {
            value: this.ecsService.serviceName,
            description: 'Production ECS Service Name',
            exportName: 'BCOS-Production-ServiceName',
        });
        new cdk.CfnOutput(this.stack, 'ProductionURL', {
            value: `https://${production_json_1.default.domain}`,
            description: 'Production Application URL',
            exportName: 'BCOS-Production-URL',
        });
        new cdk.CfnOutput(this.stack, 'ProductionTargetGroupArn', {
            value: this.targetGroup.targetGroupArn,
            description: 'Production Target Group ARN',
            exportName: 'BCOS-Production-TargetGroupArn',
        });
        new cdk.CfnOutput(this.stack, 'ProductionDashboardURL', {
            value: `https://console.aws.amazon.com/cloudwatch/home?region=${cdk.Stack.of(this).region}#dashboards:name=BCOS-${environment}-Dashboard`,
            description: 'Production CloudWatch Dashboard URL',
            exportName: 'BCOS-Production-DashboardURL',
        });
    }
}
exports.ProductionStage = ProductionStage;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvZHVjdGlvbi1zdGFnZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInByb2R1Y3Rpb24tc3RhZ2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLHlEQUEyQztBQUMzQyw4RUFBZ0U7QUFDaEUsaUVBQW1EO0FBQ25ELGdGQUFrRTtBQUNsRSwrRkFBaUY7QUFDakYsK0RBQWlEO0FBQ2pELHlEQUEyQztBQUkzQyxxRUFBaUU7QUFDakUsaUVBQTZEO0FBQzdELHlEQUFzRDtBQUN0RCxtRkFBNEQ7QUFPNUQsTUFBYSxlQUFnQixTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQzVCLEtBQUssQ0FBWTtJQUNqQixVQUFVLENBQWM7SUFDeEIsVUFBVSxDQUFxQjtJQUMvQixXQUFXLENBQStCO0lBQzFDLGFBQWEsQ0FBZ0I7SUFDN0IsVUFBVSxDQUFhO0lBQ3ZCLFVBQVUsQ0FBcUI7SUFFL0MsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUEyQjtRQUNuRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixNQUFNLEVBQUUsYUFBYSxFQUFFLFlBQVksRUFBRSxHQUFHLEtBQUssQ0FBQztRQUM5QyxNQUFNLFdBQVcsR0FBRyxZQUFZLENBQUM7UUFFakMsa0NBQWtDO1FBQ2xDLElBQUksQ0FBQyxLQUFLLEdBQUcsSUFBSSxHQUFHLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxpQkFBaUIsRUFBRTtZQUNsRCxHQUFHLEVBQUUsS0FBSyxDQUFDLEdBQUc7U0FDZixDQUFDLENBQUM7UUFFSCw4Q0FBOEM7UUFDOUMsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxtQkFBbUIsRUFBRTtZQUNqRSxXQUFXLEVBQUUseUJBQWdCLENBQUMsR0FBRyxDQUFDLFdB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QixFQUFFO1lBQ3RELEtBQUssRUFBRSx5REFBeUQsR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSx5QkFBeUIsV0FBVyxZQUFZO1lBQ3pJLFdBQVcsRUFBRSxxQ0FBcUM7WUFDbEQsVUFBVSxFQUFFLDhCQUE4QjtTQUMzQyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUFsU0QsMENBa1NDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIGVjcyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWNzJztcbmltcG9ydCAqIGFzIGVsYnYyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lbGFzdGljbG9hZGJhbGFuY2luZ3YyJztcbmltcG9ydCAqIGFzIHJvdXRlNTMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXJvdXRlNTMnO1xuaW1wb3J0ICogYXMgcm91dGU1M3RhcmdldHMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXJvdXRlNTMtdGFyZ2V0cyc7XG5pbXBvcnQgKiBhcyBhcHBsaWNhdGlvbmF1dG9zY2FsaW5nIGZyb20gJ2F3cy1jZGstbGliL2F3cy1hcHBsaWNhdGlvbmF1dG9zY2FsaW5nJztcbmltcG9ydCAqIGFzIGJhY2t1cCBmcm9tICdhd3MtY2RrLWxpYi9hd3MtYmFja3VwJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0IHsgU2VjdXJpdHlTdGFjayB9IGZyb20gJy4uL3N0YWNrcy9zZWN1cml0eS1zdGFjayc7XG5pbXBvcnQgeyBOZXR3b3JrU3RhY2sgfSBmcm9tICcuLi9zdGFja3MvbmV0d29yay1zdGFjayc7XG5pbXBvcnQgeyBTZWN1cmVDb250YWluZXIgfSBmcm9tICcuLi9jb25zdHJ1Y3RzL3NlY3VyZS1jb250YWluZXInO1xuaW1wb3J0IHsgV2FmUHJvdGVjdGlvbiB9IGZyb20gJy4uL2NvbnN0cnVjdHMvd2FmLXByb3RlY3Rpb24nO1xuaW1wb3J0IHsgTW9uaXRvcmluZyB9IGZyb20gJy4uL2NvbnN0cnVjdHMvbW9uaXRvcmluZyc7XG5pbXBvcnQgcHJvZHVjdGlvbkNvbmZpZyBmcm9tICcuLi8uLi9jb25maWcvcHJvZHVjdGlvbi5qc29uJztcblxuaW50ZXJmYWNlIFByb2R1Y3Rpb25TdGFnZVByb3BzIGV4dGVuZHMgY2RrLlN0YWdlUHJvcHMge1xuICBzZWN1cml0eVN0YWNrOiBTZWN1cml0eVN0YWNrO1xuICBuZXR3b3JrU3RhY2s6IE5ldHdvcmtTdGFjaztcbn1cblxuZXhwb3J0IGNsYXNzIFByb2R1Y3Rpb25TdGFnZSBleHRlbmRzIGNkay5TdGFnZSB7XG4gIHB1YmxpYyByZWFkb25seSBzdGFjazogY2RrLlN0YWNrO1xuICBwdWJsaWMgcmVhZG9ubHkgZWNzQ2x1c3RlcjogZWNzLkNsdXN0ZXI7XG4gIHB1YmxpYyByZWFkb25seSBlY3NTZXJ2aWNlOiBlY3MuRmFyZ2F0ZVNlcnZpY2U7XG4gIHB1YmxpYyByZWFkb25seSB0YXJnZXRHcm91cDogZWxidjIuQXBwbGljYXRpb25UYXJnZXRHcm91cDtcbiAgcHVibGljIHJlYWRvbmx5IHdhZlByb3RlY3Rpb246IFdhZlByb3RlY3Rpb247XG4gIHB1YmxpYyByZWFkb25seSBtb25pdG9yaW5nOiBNb25pdG9yaW5nO1xuICBwdWJsaWMgcmVhZG9ubHkgYmFja3VwUGxhbj86IGJhY2t1cC5CYWNrdXBQbGFuO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBQcm9kdWN0aW9uU3RhZ2VQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgY29uc3QgeyBzZWN1cml0eVN0YWNrLCBuZXR3b3JrU3RhY2sgfSA9IHByb3BzO1xuICAgIGNvbnN0IGVudmlyb25tZW50ID0gJ3Byb2R1Y3Rpb24nO1xuXG4gICAgLy8gQ3JlYXRlIGEgc3RhY2sgd2l0aGluIHRoZSBzdGFnZVxuICAgIHRoaXMuc3RhY2sgPSBuZXcgY2RrLlN0YWNrKHRoaXMsICdQcm9kdWN0aW9uU3RhY2snLCB7XG4gICAgICBlbnY6IHByb3BzLmVudixcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBFQ1MgQ2x1c3RlciB3aXRoIGVuaGFuY2VkIG1vbml0b3JpbmdcbiAgICB0aGlzLmVjc0NsdXN0ZXIgPSBuZXcgZWNzLkNsdXN0ZXIodGhpcy5zdGFjaywgJ1Byb2R1Y3Rpb25DbHVzdGVyJywge1xuICAgICAgY2x1c3Rlck5hbWU6IHByb2R1Y3Rpb25Db25maWcuZWNzLmNsdXN0ZXJOYW1lLFxuICAgICAgdnBjOiBuZXR3b3JrU3RhY2sudnBjLFxuICAgICAgY29udGFpbmVySW5zaWdodHM6IHByb2R1Y3Rpb25Db25maWcubW9uaXRvcmluZy5kZXRhaWxlZE1vbml0b3JpbmcsXG4gICAgICBlbmFibGVGYXJnYXRlQ2FwYWNpdHlQcm92aWRlcnM6IHRydWUsXG4gICAgICBleGVjdXRlQ29tbWFuZENvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgLy8gRW5hYmxlIGV4ZWN1dGUgY29tbWFuZCBmb3IgZGVidWdnaW5nICh3aXRoIGxvZ2dpbmcpXG4gICAgICAgIGxvZ2dpbmc6IGVjcy5FeGVjdXRlQ29tbWFuZExvZ2dpbmcuT1ZFUlJJREUsXG4gICAgICAgIGxvZ0NvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgICBjbG91ZFdhdGNoTG9nR3JvdXA6IG5ldyBjZGsuYXdzX2xvZ3MuTG9nR3JvdXAodGhpcy5zdGFjaywgJ0V4ZWN1dGVDb21tYW5kTG9nR3JvdXAnLCB7XG4gICAgICAgICAgICBsb2dHcm91cE5hbWU6ICcvZWNzL2V4ZWN1dGUtY29tbWFuZC9iY29zLXByb2R1Y3Rpb24nLFxuICAgICAgICAgICAgcmV0ZW50aW9uOiBjZGsuYXdzX2xvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfTU9OVEgsXG4gICAgICAgICAgICBlbmNyeXB0aW9uS2V5OiBzZWN1cml0eVN0YWNrLmttc0tleSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgICBjbG91ZFdhdGNoRW5jcnlwdGlvbkVuYWJsZWQ6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIHNlY3VyZSBjb250YWluZXIgY29uc3RydWN0XG4gICAgY29uc3Qgc2VjdXJlQ29udGFpbmVyID0gbmV3IFNlY3VyZUNvbnRhaW5lcih0aGlzLnN0YWNrLCAnU2VjdXJlQ29udGFpbmVyJywge1xuICAgICAgZW52aXJvbm1lbnQ6IGVudmlyb25tZW50LFxuICAgICAgY2x1c3RlcjogdGhpcy5lY3NDbHVzdGVyLFxuICAgICAgZWNyUmVwb3NpdG9yeTogc2VjdXJpdHlTdGFjay5lY3JSZXBvc2l0b3J5LFxuICAgICAga21zS2V5OiBzZWN1cml0eVN0YWNrLmttc0tleSxcbiAgICAgIGV4ZWN1dGlvblJvbGU6IHNlY3VyaXR5U3RhY2suZWNzVGFza0V4ZWN1dGlvblJvbGUsXG4gICAgICB0YXNrUm9sZTogc2VjdXJpdHlTdGFjay5lY3NUYXNrUm9sZSxcbiAgICAgIHNlY3JldDogc2VjdXJpdHlTdGFjay5wcm9kdWN0aW9uU2VjcmV0LFxuICAgICAgY3B1OiBwcm9kdWN0aW9uQ29uZmlnLmVjcy5jcHUsXG4gICAgICBtZW1vcnk6IHByb2R1Y3Rpb25Db25maWcuZWNzLm1lbW9yeSxcbiAgICAgIGNvbnRhaW5lclBvcnQ6IDgwLFxuICAgICAgZW52aXJvbm1lbnRWYXJpYWJsZXM6IHtcbiAgICAgICAgRU5WSVJPTk1FTlQ6IGVudmlyb25tZW50LFxuICAgICAgICBORVhUX1BVQkxJQ19BUFBfVVJMOiBgaHR0cHM6Ly8ke3Byb2R1Y3Rpb25Db25maWcuZG9tYWlufWAsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIHRhcmdldCBncm91cCBmb3IgcHJvZHVjdGlvblxuICAgIHRoaXMudGFyZ2V0R3JvdXAgPSBuZXcgZWxidjIuQXBwbGljYXRpb25UYXJnZXRHcm91cCh0aGlzLnN0YWNrLCAnUHJvZHVjdGlvblRhcmdldEdyb3VwJywge1xuICAgICAgdGFyZ2V0R3JvdXBOYW1lOiAnYmNvcy1wcm9kdWN0aW9uLXRnJyxcbiAgICAgIHZwYzogbmV0d29ya1N0YWNrLnZwYyxcbiAgICAgIHBvcnQ6IDgwLFxuICAgICAgcHJvdG9jb2w6IGVsYnYyLkFwcGxpY2F0aW9uUHJvdG9jb2wuSFRUUCxcbiAgICAgIHRhcmdldFR5cGU6IGVsYnYyLlRhcmdldFR5cGUuSVAsXG4gICAgICBoZWFsdGhDaGVjazoge1xuICAgICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgICBwYXRoOiAnL2hlYWx0aCcsXG4gICAgICAgIHByb3RvY29sOiBlbGJ2Mi5Qcm90b2NvbC5IVFRQLFxuICAgICAgICBwb3J0OiAnODAnLFxuICAgICAgICBpbnRlcnZhbDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMTUpLFxuICAgICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcyg1KSxcbiAgICAgICAgaGVhbHRoeVRocmVzaG9sZENvdW50OiAyLFxuICAgICAgICB1bmhlYWx0aHlUaHJlc2hvbGRDb3VudDogMyxcbiAgICAgICAgaGVhbHRoeUh0dHBDb2RlczogJzIwMCcsXG4gICAgICB9LFxuICAgICAgLy8gVGFyZ2V0IGdyb3VwIGF0dHJpYnV0ZXMgZm9yIHByb2R1Y3Rpb25cbiAgICAgIGRlcmVnaXN0cmF0aW9uRGVsYXk6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgIHN0aWNraW5lc3NDb29raWVEdXJhdGlvbjogY2RrLkR1cmF0aW9uLmhvdXJzKDEpLFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIEVDUyBGYXJnYXRlIFNlcnZpY2Ugd2l0aCBlbmhhbmNlZCBjb25maWd1cmF0aW9uXG4gICAgdGhpcy5lY3NTZXJ2aWNlID0gbmV3IGVjcy5GYXJnYXRlU2VydmljZSh0aGlzLnN0YWNrLCAnUHJvZHVjdGlvblNlcnZpY2UnLCB7XG4gICAgICBzZXJ2aWNlTmFtZTogcHJvZHVjdGlvbkNvbmZpZy5lY3Muc2VydmljZU5hbWUsXG4gICAgICBjbHVzdGVyOiB0aGlzLmVjc0NsdXN0ZXIsXG4gICAgICB0YXNrRGVmaW5pdGlvbjogc2VjdXJlQ29udGFpbmVyLnRhc2tEZWZpbml0aW9uLFxuICAgICAgZGVzaXJlZENvdW50OiBwcm9kdWN0aW9uQ29uZmlnLmVjcy5kZXNpcmVkQ291bnQsXG4gICAgICBtaW5IZWFsdGh5UGVyY2VudDogNTAsXG4gICAgICBtYXhIZWFsdGh5UGVyY2VudDogMjAwLFxuICAgICAgdnBjU3VibmV0czoge1xuICAgICAgICBzdWJuZXRUeXBlOiBjZGsuYXdzX2VjMi5TdWJuZXRUeXBlLlBSSVZBVEVfV0lUSF9FR1JFU1MsXG4gICAgICB9LFxuICAgICAgc2VjdXJpdHlHcm91cHM6IFtuZXR3b3JrU3RhY2suZWNzU2VjdXJpdHlHcm91cF0sXG4gICAgICBhc3NpZ25QdWJsaWNJcDogZmFsc2UsXG4vLyBMb2dnaW5nIGVuYWJsZWQgYnkgZGVmYXVsdFxuICAgICAgaGVhbHRoQ2hlY2tHcmFjZVBlcmlvZDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMTIwKSxcbiAgICAgIGNpcmN1aXRCcmVha2VyOiB7XG4gICAgICAgIHJvbGxiYWNrOiB0cnVlLFxuICAgICAgfSxcbiAgICAgIC8vIFByb2R1Y3Rpb24tc3BlY2lmaWMgc2V0dGluZ3NcbiAgICAgIGVuYWJsZUV4ZWN1dGVDb21tYW5kOiB0cnVlLCAvLyBGb3IgZGVidWdnaW5nIChyZXF1aXJlcyBwcm9wZXIgSUFNIHBlcm1pc3Npb25zKVxuICAgIH0pO1xuXG4gICAgLy8gQXNzb2NpYXRlIHNlcnZpY2Ugd2l0aCB0YXJnZXQgZ3JvdXBcbiAgICB0aGlzLmVjc1NlcnZpY2UuYXR0YWNoVG9BcHBsaWNhdGlvblRhcmdldEdyb3VwKHRoaXMudGFyZ2V0R3JvdXApO1xuXG4gICAgLy8gU2V0IHRhcmdldCBncm91cCBhcyBkZWZhdWx0IGFjdGlvbiBmb3IgSFRUUFMgbGlzdGVuZXJcbiAgICBuZXR3b3JrU3RhY2suaHR0cHNMaXN0ZW5lci5hZGRBY3Rpb24oJ1Byb2R1Y3Rpb25EZWZhdWx0Jywge1xuICAgICAgYWN0aW9uOiBlbGJ2Mi5MaXN0ZW5lckFjdGlvbi5mb3J3YXJkKFt0aGlzLnRhcmdldEdyb3VwXSksXG4gICAgICBjb25kaXRpb25zOiBbXG4gICAgICAgIGVsYnYyLkxpc3RlbmVyQ29uZGl0aW9uLmhvc3RIZWFkZXJzKFtwcm9kdWN0aW9uQ29uZmlnLmRvbWFpbl0pLFxuICAgICAgXSxcbiAgICAgIHByaW9yaXR5OiAxMCwgLy8gSGlnaGVyIHByaW9yaXR5IHRoYW4gc3RhZ2luZ1xuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIFJvdXRlNTMgcmVjb3JkIGZvciBwcm9kdWN0aW9uIGRvbWFpblxuICAgIG5ldyByb3V0ZTUzLkFSZWNvcmQodGhpcy5zdGFjaywgJ1Byb2R1Y3Rpb25BUmVjb3JkJywge1xuICAgICAgem9uZTogbmV0d29ya1N0YWNrLmhvc3RlZFpvbmUsXG4gICAgICByZWNvcmROYW1lOiAnYXBwJyxcbiAgICAgIHRhcmdldDogcm91dGU1My5SZWNvcmRUYXJnZXQuZnJvbUFsaWFzKFxuICAgICAgICBuZXcgcm91dGU1M3RhcmdldHMuTG9hZEJhbGFuY2VyVGFyZ2V0KG5ldHdvcmtTdGFjay5sb2FkQmFsYW5jZXIpXG4gICAgICApLFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIFdBRiBwcm90ZWN0aW9uIHdpdGggZW5oYW5jZWQgcnVsZXNcbiAgICB0aGlzLndhZlByb3RlY3Rpb24gPSBuZXcgV2FmUHJvdGVjdGlvbih0aGlzLnN0YWNrLCAnV0FGUHJvdGVjdGlvbicsIHtcbiAgICAgIGVudmlyb25tZW50OiBlbnZpcm9ubWVudCxcbiAgICAgIGttc0tleTogc2VjdXJpdHlTdGFjay5rbXNLZXksXG4gICAgICByYXRlTGltaXRQZXJJUDogcHJvZHVjdGlvbkNvbmZpZy53YWYucmF0ZUxpbWl0UGVySVAsXG4gICAgICBlbmFibGVHZW9CbG9ja2luZzogcHJvZHVjdGlvbkNvbmZpZy53YWYuZ2VvQmxvY2tpbmc/LmVuYWJsZWQgfHwgZmFsc2UsXG4gICAgICBibG9ja2VkQ291bnRyaWVzOiBwcm9kdWN0aW9uQ29uZmlnLndhZi5nZW9CbG9ja2luZz8uYmxvY2tlZENvdW50cmllcyB8fCBbXSxcbiAgICAgIGVuYWJsZU1hbmFnZWRSdWxlczogdHJ1ZSxcbiAgICB9KTtcblxuICAgIC8vIEFzc29jaWF0ZSBXQUYgd2l0aCBsb2FkIGJhbGFuY2VyXG4gICAgdGhpcy53YWZQcm90ZWN0aW9uLmFzc29jaWF0ZVdpdGhMb2FkQmFsYW5jZXIobmV0d29ya1N0YWNrLmxvYWRCYWxhbmNlci5sb2FkQmFsYW5jZXJBcm4pO1xuXG4gICAgLy8gQ3JlYXRlIGNvbXByZWhlbnNpdmUgbW9uaXRvcmluZ1xuICAgIHRoaXMubW9uaXRvcmluZyA9IG5ldyBNb25pdG9yaW5nKHRoaXMuc3RhY2ssICdNb25pdG9yaW5nJywge1xuICAgICAgZW52aXJvbm1lbnQ6IGVudmlyb25tZW50LFxuICAgICAga21zS2V5OiBzZWN1cml0eVN0YWNrLmttc0tleSxcbiAgICAgIGVjc1NlcnZpY2U6IHRoaXMuZWNzU2VydmljZSxcbiAgICAgIGVjc0NsdXN0ZXI6IHRoaXMuZWNzQ2x1c3RlcixcbiAgICAgIGxvYWRCYWxhbmNlcjogbmV0d29ya1N0YWNrLmxvYWRCYWxhbmNlcixcbiAgICAgIHRhcmdldEdyb3VwOiB0aGlzLnRhcmdldEdyb3VwLFxuICAgICAgbG9nR3JvdXA6IHNlY3VyZUNvbnRhaW5lci5sb2dHcm91cCxcbiAgICAgIGFsZXJ0RW1haWxzOiBbJ3Byb2R1Y3Rpb24tYWxlcnRzQGJlbmRjYXJlLmNvbSddLCAvLyBSZXBsYWNlIHdpdGggYWN0dWFsIGVtYWlsXG4gICAgICBlbmFibGVEZXRhaWxlZE1vbml0b3Jpbmc6IHByb2R1Y3Rpb25Db25maWcubW9uaXRvcmluZy5kZXRhaWxlZE1vbml0b3JpbmcsXG4gICAgfSk7XG5cbiAgICAvLyBDb25maWd1cmUgYXV0byBzY2FsaW5nXG4gICAgaWYgKHByb2R1Y3Rpb25Db25maWcuZWNzLmF1dG9TY2FsaW5nLmVuYWJsZWQpIHtcbiAgICAgIGNvbnN0IHNjYWxhYmxlVGFyZ2V0ID0gbmV3IGFwcGxpY2F0aW9uYXV0b3NjYWxpbmcuU2NhbGFibGVUYXJnZXQodGhpcy5zdGFjaywgJ1Byb2R1Y3Rpb25TY2FsYWJsZVRhcmdldCcsIHtcbiAgICAgICAgc2VydmljZU5hbWVzcGFjZTogYXBwbGljYXRpb25hdXRvc2NhbGluZy5TZXJ2aWNlTmFtZXNwYWNlLkVDUyxcbiAgICAgICAgc2NhbGFibGVEaW1lbnNpb246ICdlY3M6c2VydmljZTpEZXNpcmVkQ291bnQnLFxuICAgICAgICByZXNvdXJjZUlkOiBgc2VydmljZS8ke3RoaXMuZWNzQ2x1c3Rlci5jbHVzdGVyTmFtZX0vJHt0aGlzLmVjc1NlcnZpY2Uuc2VydmljZU5hbWV9YCxcbiAgICAgICAgbWluQ2FwYWNpdHk6IHByb2R1Y3Rpb25Db25maWcuZWNzLmF1dG9TY2FsaW5nLm1pbkNhcGFjaXR5LFxuICAgICAgICBtYXhDYXBhY2l0eTogcHJvZHVjdGlvbkNvbmZpZy5lY3MuYXV0b1NjYWxpbmcubWF4Q2FwYWNpdHksXG4gICAgICB9KTtcblxuICAgICAgLy8gQ1BVLWJhc2VkIHNjYWxpbmdcbiAgICAgIHNjYWxhYmxlVGFyZ2V0LnNjYWxlVG9UcmFja01ldHJpYygnUHJvZHVjdGlvbkNQVVNjYWxpbmcnLCB7XG4gICAgICAgIHRhcmdldFZhbHVlOiBwcm9kdWN0aW9uQ29uZmlnLmVjcy5hdXRvU2NhbGluZy50YXJnZXRDcHVVdGlsaXphdGlvbixcbiAgICAgICAgcHJlZGVmaW5lZE1ldHJpYzogYXBwbGljYXRpb25hdXRvc2NhbGluZy5QcmVkZWZpbmVkTWV0cmljLkVDU19TRVJWSUNFX0FWRVJBR0VfQ1BVX1VUSUxJWkFUSU9OLFxuICAgICAgICBzY2FsZU91dENvb2xkb3duOiBjZGsuRHVyYXRpb24uc2Vjb25kcyhwcm9kdWN0aW9uQ29uZmlnLmVjcy5hdXRvU2NhbGluZy5zY2FsZU91dENvb2xkb3duKSxcbiAgICAgICAgc2NhbGVJbkNvb2xkb3duOiBjZGsuRHVyYXRpb24uc2Vjb25kcyhwcm9kdWN0aW9uQ29uZmlnLmVjcy5hdXRvU2NhbGluZy5zY2FsZUluQ29vbGRvd24pLFxuICAgICAgfSk7XG5cbiAgICAgIC8vIE1lbW9yeS1iYXNlZCBzY2FsaW5nXG4gICAgICBzY2FsYWJsZVRhcmdldC5zY2FsZVRvVHJhY2tNZXRyaWMoJ1Byb2R1Y3Rpb25NZW1vcnlTY2FsaW5nJywge1xuICAgICAgICB0YXJnZXRWYWx1ZTogcHJvZHVjdGlvbkNvbmZpZy5lY3MuYXV0b1NjYWxpbmcudGFyZ2V0TWVtb3J5VXRpbGl6YXRpb24sXG4gICAgICAgIHByZWRlZmluZWRNZXRyaWM6IGFwcGxpY2F0aW9uYXV0b3NjYWxpbmcuUHJlZGVmaW5lZE1ldHJpYy5FQ1NfU0VSVklDRV9BVkVSQUdFX01FTU9SWV9VVElMSVpBVElPTixcbiAgICAgICAgc2NhbGVPdXRDb29sZG93bjogY2RrLkR1cmF0aW9uLnNlY29uZHMocHJvZHVjdGlvbkNvbmZpZy5lY3MuYXV0b1NjYWxpbmcuc2NhbGVPdXRDb29sZG93biksXG4gICAgICAgIHNjYWxlSW5Db29sZG93bjogY2RrLkR1cmF0aW9uLnNlY29uZHMocHJvZHVjdGlvbkNvbmZpZy5lY3MuYXV0b1NjYWxpbmcuc2NhbGVJbkNvb2xkb3duKSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBSZXF1ZXN0IGNvdW50IGJhc2VkIHNjYWxpbmcgKEFMQilcbiAgICAgIGNvbnN0IGxvYWRCYWxhbmNlckZ1bGxOYW1lID0gY2RrLlRva2VuLmlzVW5yZXNvbHZlZChuZXR3b3JrU3RhY2subG9hZEJhbGFuY2VyLmxvYWRCYWxhbmNlckFybikgXG4gICAgICAgID8gJ2R1bW15LWFsYi1uYW1lJyBcbiAgICAgICAgOiBuZXR3b3JrU3RhY2subG9hZEJhbGFuY2VyLmxvYWRCYWxhbmNlckFybi5zcGxpdCgnLycpLnNsaWNlKDEpLmpvaW4oJy8nKTtcbiAgICAgIGNvbnN0IHRhcmdldEdyb3VwRnVsbE5hbWUgPSBjZGsuVG9rZW4uaXNVbnJlc29sdmVkKHRoaXMudGFyZ2V0R3JvdXAudGFyZ2V0R3JvdXBBcm4pIFxuICAgICAgICA/ICdkdW1teS10Zy1uYW1lJyBcbiAgICAgICAgOiB0aGlzLnRhcmdldEdyb3VwLnRhcmdldEdyb3VwQXJuLnNwbGl0KCcvJykuc2xpY2UoMSkuam9pbignLycpO1xuXG4gICAgICBjb25zdCByZXF1ZXN0Q291bnRNZXRyaWMgPSBuZXcgY2RrLmF3c19jbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgIG5hbWVzcGFjZTogJ0FXUy9BcHBsaWNhdGlvbkVMQicsXG4gICAgICAgIG1ldHJpY05hbWU6ICdSZXF1ZXN0Q291bnRQZXJUYXJnZXQnLFxuICAgICAgICBkaW1lbnNpb25zTWFwOiB7XG4gICAgICAgICAgTG9hZEJhbGFuY2VyOiBsb2FkQmFsYW5jZXJGdWxsTmFtZSxcbiAgICAgICAgICBUYXJnZXRHcm91cDogdGFyZ2V0R3JvdXBGdWxsTmFtZSxcbiAgICAgICAgfSxcbiAgICAgICAgc3RhdGlzdGljOiAnU3VtJyxcbiAgICAgICAgcGVyaW9kOiBjZGsuRHVyYXRpb24ubWludXRlcygxKSxcbiAgICAgIH0pO1xuXG4gICAgICBzY2FsYWJsZVRhcmdldC5zY2FsZVRvVHJhY2tNZXRyaWMoJ1Byb2R1Y3Rpb25SZXF1ZXN0U2NhbGluZycsIHtcbiAgICAgICAgdGFyZ2V0VmFsdWU6IDEwMDAsIC8vIFJlcXVlc3RzIHBlciB0YXJnZXQgcGVyIG1pbnV0ZVxuICAgICAgICBjdXN0b21NZXRyaWM6IHJlcXVlc3RDb3VudE1ldHJpYyxcbiAgICAgICAgc2NhbGVPdXRDb29sZG93bjogY2RrLkR1cmF0aW9uLnNlY29uZHMocHJvZHVjdGlvbkNvbmZpZy5lY3MuYXV0b1NjYWxpbmcuc2NhbGVPdXRDb29sZG93biksXG4gICAgICAgIHNjYWxlSW5Db29sZG93bjogY2RrLkR1cmF0aW9uLnNlY29uZHMocHJvZHVjdGlvbkNvbmZpZy5lY3MuYXV0b1NjYWxpbmcuc2NhbGVJbkNvb2xkb3duKSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBTY2hlZHVsZWQgc2NhbGluZyBmb3IgYnVzaW5lc3MgaG91cnNcbiAgICAgIHNjYWxhYmxlVGFyZ2V0LnNjYWxlT25TY2hlZHVsZSgnUHJvZHVjdGlvbkJ1c2luZXNzSG91cnNTY2FsaW5nJywge1xuICAgICAgICBzY2hlZHVsZTogYXBwbGljYXRpb25hdXRvc2NhbGluZy5TY2hlZHVsZS5jcm9uKHtcbiAgICAgICAgICBob3VyOiAnOCcsXG4gICAgICAgICAgbWludXRlOiAnMCcsXG4gICAgICAgICAgd2Vla0RheTogJzEtNScsIC8vIE1vbmRheSB0byBGcmlkYXlcbiAgICAgICAgfSksXG4gICAgICAgIG1pbkNhcGFjaXR5OiA0LFxuICAgICAgICBtYXhDYXBhY2l0eTogcHJvZHVjdGlvbkNvbmZpZy5lY3MuYXV0b1NjYWxpbmcubWF4Q2FwYWNpdHksXG4gICAgICB9KTtcblxuICAgICAgc2NhbGFibGVUYXJnZXQuc2NhbGVPblNjaGVkdWxlKCdQcm9kdWN0aW9uT2ZmSG91cnNTY2FsaW5nJywge1xuICAgICAgICBzY2hlZHVsZTogYXBwbGljYXRpb25hdXRvc2NhbGluZy5TY2hlZHVsZS5jcm9uKHtcbiAgICAgICAgICBob3VyOiAnMjAnLFxuICAgICAgICAgIG1pbnV0ZTogJzAnLFxuICAgICAgICAgIHdlZWtEYXk6ICcxLTUnLCAvLyBNb25kYXkgdG8gRnJpZGF5XG4gICAgICAgIH0pLFxuICAgICAgICBtaW5DYXBhY2l0eTogcHJvZHVjdGlvbkNvbmZpZy5lY3MuYXV0b1NjYWxpbmcubWluQ2FwYWNpdHksXG4gICAgICAgIG1heENhcGFjaXR5OiAxMCxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIENyZWF0ZSBiYWNrdXAgcGxhbiBmb3IgcHJvZHVjdGlvbiAoaWYgZW5hYmxlZClcbiAgICBpZiAocHJvZHVjdGlvbkNvbmZpZy5iYWNrdXA/LmVuYWJsZWQpIHtcbiAgICAgIC8vIENyZWF0ZSBiYWNrdXAgcm9sZVxuICAgICAgY29uc3QgYmFja3VwUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLnN0YWNrLCAnQmFja3VwUm9sZScsIHtcbiAgICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2JhY2t1cC5hbWF6b25hd3MuY29tJyksXG4gICAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnc2VydmljZS1yb2xlL0FXU0JhY2t1cFNlcnZpY2VSb2xlUG9saWN5Rm9yQmFja3VwJyksXG4gICAgICAgIF0sXG4gICAgICB9KTtcblxuICAgICAgLy8gQ3JlYXRlIGJhY2t1cCB2YXVsdFxuICAgICAgY29uc3QgYmFja3VwVmF1bHQgPSBuZXcgYmFja3VwLkJhY2t1cFZhdWx0KHRoaXMuc3RhY2ssICdCYWNrdXBWYXVsdCcsIHtcbiAgICAgICAgYmFja3VwVmF1bHROYW1lOiBgYmNvcy0ke2Vudmlyb25tZW50fS1iYWNrdXAtdmF1bHRgLFxuICAgICAgICBlbmNyeXB0aW9uS2V5OiBzZWN1cml0eVN0YWNrLmttc0tleSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBDcmVhdGUgYmFja3VwIHBsYW5cbiAgICAgIHRoaXMuYmFja3VwUGxhbiA9IG5ldyBiYWNrdXAuQmFja3VwUGxhbih0aGlzLnN0YWNrLCAnQmFja3VwUGxhbicsIHtcbiAgICAgICAgYmFja3VwUGxhbk5hbWU6IGBiY29zLSR7ZW52aXJvbm1lbnR9LWJhY2t1cC1wbGFuYCxcbiAgICAgICAgYmFja3VwVmF1bHQ6IGJhY2t1cFZhdWx0LFxuICAgICAgICBiYWNrdXBQbGFuUnVsZXM6IFtcbiAgICAgICAgICAvLyBCYWNrdXAgcnVsZSBjb25maWd1cmF0aW9uIHdvdWxkIGdvIGhlcmVcbiAgICAgICAgICAvLyBOb3RlOiBCYWNrdXBQbGFuIEFQSSBoYXMgY2hhbmdlZCBpbiBuZXdlciBDREsgdmVyc2lvbnNcbiAgICAgICAgXSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBOb3RlOiBFQ1MgdGFza3MgZG9uJ3QgaGF2ZSBwZXJzaXN0ZW50IHN0b3JhZ2UgdG8gYmFjayB1cFxuICAgICAgLy8gVGhpcyB3b3VsZCBiZSB1c2VkIGZvciBiYWNraW5nIHVwIGRhdGFiYXNlcyBvciBwZXJzaXN0ZW50IHZvbHVtZXMgaWYgYWRkZWRcbiAgICB9XG5cbiAgICAvLyBBcHBseSB0YWdzXG4gICAgT2JqZWN0LmVudHJpZXMocHJvZHVjdGlvbkNvbmZpZy50YWdzKS5mb3JFYWNoKChba2V5LCB2YWx1ZV0pID0+IHtcbiAgICAgIGNkay5UYWdzLm9mKHRoaXMuc3RhY2spLmFkZChrZXksIHZhbHVlKTtcbiAgICB9KTtcblxuICAgIC8vIFN0YWNrIG91dHB1dHNcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLnN0YWNrLCAnUHJvZHVjdGlvbkNsdXN0ZXJOYW1lJywge1xuICAgICAgdmFsdWU6IHRoaXMuZWNzQ2x1c3Rlci5jbHVzdGVyTmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnUHJvZHVjdGlvbiBFQ1MgQ2x1c3RlciBOYW1lJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdCQ09TLVByb2R1Y3Rpb24tQ2x1c3Rlck5hbWUnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcy5zdGFjaywgJ1Byb2R1Y3Rpb25TZXJ2aWNlTmFtZScsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmVjc1NlcnZpY2Uuc2VydmljZU5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ1Byb2R1Y3Rpb24gRUNTIFNlcnZpY2UgTmFtZScsXG4gICAgICBleHBvcnROYW1lOiAnQkNPUy1Qcm9kdWN0aW9uLVNlcnZpY2VOYW1lJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMuc3RhY2ssICdQcm9kdWN0aW9uVVJMJywge1xuICAgICAgdmFsdWU6IGBodHRwczovLyR7cHJvZHVjdGlvbkNvbmZpZy5kb21haW59YCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnUHJvZHVjdGlvbiBBcHBsaWNhdGlvbiBVUkwnLFxuICAgICAgZXhwb3J0TmFtZTogJ0JDT1MtUHJvZHVjdGlvbi1VUkwnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcy5zdGFjaywgJ1Byb2R1Y3Rpb25UYXJnZXRHcm91cEFybicsIHtcbiAgICAgIHZhbHVlOiB0aGlzLnRhcmdldEdyb3VwLnRhcmdldEdyb3VwQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdQcm9kdWN0aW9uIFRhcmdldCBHcm91cCBBUk4nLFxuICAgICAgZXhwb3J0TmFtZTogJ0JDT1MtUHJvZHVjdGlvbi1UYXJnZXRHcm91cEFybicsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLnN0YWNrLCAnUHJvZHVjdGlvbkRhc2hib2FyZFVSTCcsIHtcbiAgICAgIHZhbHVlOiBgaHR0cHM6Ly9jb25zb2xlLmF3cy5hbWF6b24uY29tL2Nsb3Vkd2F0Y2gvaG9tZT9yZWdpb249JHtjZGsuU3RhY2sub2YodGhpcykucmVnaW9ufSNkYXNoYm9hcmRzOm5hbWU9QkNPUy0ke2Vudmlyb25tZW50fS1EYXNoYm9hcmRgLFxuICAgICAgZGVzY3JpcHRpb246ICdQcm9kdWN0aW9uIENsb3VkV2F0Y2ggRGFzaGJvYXJkIFVSTCcsXG4gICAgICBleHBvcnROYW1lOiAnQkNPUy1Qcm9kdWN0aW9uLURhc2hib2FyZFVSTCcsXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==