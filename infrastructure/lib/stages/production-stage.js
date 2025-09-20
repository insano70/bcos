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
        // Create ECS Cluster with enhanced monitoring
        this.ecsCluster = new ecs.Cluster(this, 'ProductionCluster', {
            clusterName: production_json_1.default.ecs.clusterName,
            vpc: networkStack.vpc,
            containerInsights: production_json_1.default.monitoring.detailedMonitoring,
            enableFargateCapacityProviders: true,
            executeCommandConfiguration: {
                // Enable execute command for debugging (with logging)
                logging: ecs.ExecuteCommandLogging.OVERRIDE,
                logConfiguration: {
                    cloudWatchLogGroup: new cdk.aws_logs.LogGroup(this, 'ExecuteCommandLogGroup', {
                        logGroupName: '/ecs/execute-command/bcos-production',
                        retention: cdk.aws_logs.RetentionDays.ONE_MONTH,
                        encryptionKey: securityStack.kmsKey,
                    }),
                    cloudWatchEncryptionEnabled: true,
                },
            },
        });
        // Create secure container construct
        const secureContainer = new secure_container_1.SecureContainer(this, 'SecureContainer', {
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
        this.targetGroup = new elbv2.ApplicationTargetGroup(this, 'ProductionTargetGroup', {
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
        this.ecsService = new ecs.FargateService(this, 'ProductionService', {
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
        new route53.ARecord(this, 'ProductionARecord', {
            zone: networkStack.hostedZone,
            recordName: 'app',
            target: route53.RecordTarget.fromAlias(new route53targets.LoadBalancerTarget(networkStack.loadBalancer)),
        });
        // Create WAF protection with enhanced rules
        this.wafProtection = new waf_protection_1.WafProtection(this, 'WAFProtection', {
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
        this.monitoring = new monitoring_1.Monitoring(this, 'Monitoring', {
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
            const scalableTarget = new applicationautoscaling.ScalableTarget(this, 'ProductionScalableTarget', {
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
            const requestCountMetric = new cdk.aws_cloudwatch.Metric({
                namespace: 'AWS/ApplicationELB',
                metricName: 'RequestCountPerTarget',
                dimensionsMap: {
                    LoadBalancer: networkStack.loadBalancer.loadBalancerFullName,
                    TargetGroup: this.targetGroup.targetGroupFullName,
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
            const backupRole = new iam.Role(this, 'BackupRole', {
                assumedBy: new iam.ServicePrincipal('backup.amazonaws.com'),
                managedPolicies: [
                    iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSBackupServiceRolePolicyForBackup'),
                ],
            });
            // Create backup vault
            const backupVault = new backup.BackupVault(this, 'BackupVault', {
                backupVaultName: `bcos-${environment}-backup-vault`,
                encryptionKey: securityStack.kmsKey,
            });
            // Create backup plan
            this.backupPlan = new backup.BackupPlan(this, 'BackupPlan', {
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
            cdk.Tags.of(this).add(key, value);
        });
        // Stack outputs
        new cdk.CfnOutput(this, 'ProductionClusterName', {
            value: this.ecsCluster.clusterName,
            description: 'Production ECS Cluster Name',
            exportName: 'BCOS-Production-ClusterName',
        });
        new cdk.CfnOutput(this, 'ProductionServiceName', {
            value: this.ecsService.serviceName,
            description: 'Production ECS Service Name',
            exportName: 'BCOS-Production-ServiceName',
        });
        new cdk.CfnOutput(this, 'ProductionURL', {
            value: `https://${production_json_1.default.domain}`,
            description: 'Production Application URL',
            exportName: 'BCOS-Production-URL',
        });
        new cdk.CfnOutput(this, 'ProductionTargetGroupArn', {
            value: this.targetGroup.targetGroupArn,
            description: 'Production Target Group ARN',
            exportName: 'BCOS-Production-TargetGroupArn',
        });
        new cdk.CfnOutput(this, 'ProductionDashboardURL', {
            value: `https://console.aws.amazon.com/cloudwatch/home?region=${cdk.Stack.of(this).region}#dashboards:name=BCOS-${environment}-Dashboard`,
            description: 'Production CloudWatch Dashboard URL',
            exportName: 'BCOS-Production-DashboardURL',
        });
    }
}
exports.ProductionStage = ProductionStage;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvZHVjdGlvbi1zdGFnZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInByb2R1Y3Rpb24tc3RhZ2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLHlEQUEyQztBQUMzQyw4RUFBZ0U7QUFDaEUsaUVBQW1EO0FBQ25ELGdGQUFrRTtBQUNsRSwrRkFBaUY7QUFDakYsK0RBQWlEO0FBQ2pELHlEQUEyQztBQUkzQyxxRUFBaUU7QUFDakUsaUVBQTZEO0FBQzdELHlEQUFzRDtBQUN0RCxtRkFBNEQ7QUFPNUQsTUFBYSxlQUFnQixTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQzVCLFVBQVUsQ0FBYztJQUN4QixVQUFVLENBQXFCO0lBQy9CLFdBQVcsQ0FBK0I7SUFDMUMsYUFBYSxDQUFnQjtJQUM3QixVQUFVLENBQWE7SUFDdkIsVUFBVSxDQUFxQjtJQUUvQyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQTJCO1FBQ25FLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLE1BQU0sRUFBRSxhQUFhLEVBQUUsWUFBWSxFQUFFLEdBQUcsS0FBSyxDQUFDO1FBQzlDLE1BQU0sV0FBVyxHQUFHLFlBQVksQ0FBQztRQUVqQyw4Q0FBOEM7UUFDOUMsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLG1CQUFtQixFQUFFO1lBQzNELFdBQVcsRUFBRSx5QkFBZ0IsQ0FBQyxHQUFHLENBQUMsV0FBVztZQUM3QyxHQUFHLEVBQUUsWUFBWSxDQUFDLEdBQUc7WUFDckIsaUJBQWlCLEVBQUUseUJBQWdCLENBQUMsVUFBVSxDQUFDLGtCQUFrQjtZQUNqRSw4QkFBOEIsRUFBRSxJQUFJO1lBQ3BDLDJCQUEyQixFQUFFO2dCQUMzQixzREFBc0Q7Z0JBQ3RELE9BQU8sRUFBRSxHQUFH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QTBCLEVBQUU7WUFDbEQsS0FBSyxFQUFFLElBQUksQ0FBQyxXQUFXLENBQUMsY0FBYztZQUN0QyxXQUFXLEVBQUUsNkJBQTZCO1lBQzFDLFVBQVUsRUFBRSxnQ0FBZ0M7U0FDN0MsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSx3QkFBd0IsRUFBRTtZQUNoRCxLQUFLLEVBQUUseURBQXlELEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0seUJBQXlCLFdBQVcsWUFBWTtZQUN6SSxXQUFXLEVBQUUscUNBQXFDO1lBQ2xELFVBQVUsRUFBRSw4QkFBOEI7U0FDM0MsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBclJELDBDQXFSQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgKiBhcyBlY3MgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVjcyc7XG5pbXBvcnQgKiBhcyBlbGJ2MiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWxhc3RpY2xvYWRiYWxhbmNpbmd2Mic7XG5pbXBvcnQgKiBhcyByb3V0ZTUzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1yb3V0ZTUzJztcbmltcG9ydCAqIGFzIHJvdXRlNTN0YXJnZXRzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1yb3V0ZTUzLXRhcmdldHMnO1xuaW1wb3J0ICogYXMgYXBwbGljYXRpb25hdXRvc2NhbGluZyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtYXBwbGljYXRpb25hdXRvc2NhbGluZyc7XG5pbXBvcnQgKiBhcyBiYWNrdXAgZnJvbSAnYXdzLWNkay1saWIvYXdzLWJhY2t1cCc7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCB7IFNlY3VyaXR5U3RhY2sgfSBmcm9tICcuLi9zdGFja3Mvc2VjdXJpdHktc3RhY2snO1xuaW1wb3J0IHsgTmV0d29ya1N0YWNrIH0gZnJvbSAnLi4vc3RhY2tzL25ldHdvcmstc3RhY2snO1xuaW1wb3J0IHsgU2VjdXJlQ29udGFpbmVyIH0gZnJvbSAnLi4vY29uc3RydWN0cy9zZWN1cmUtY29udGFpbmVyJztcbmltcG9ydCB7IFdhZlByb3RlY3Rpb24gfSBmcm9tICcuLi9jb25zdHJ1Y3RzL3dhZi1wcm90ZWN0aW9uJztcbmltcG9ydCB7IE1vbml0b3JpbmcgfSBmcm9tICcuLi9jb25zdHJ1Y3RzL21vbml0b3JpbmcnO1xuaW1wb3J0IHByb2R1Y3Rpb25Db25maWcgZnJvbSAnLi4vLi4vY29uZmlnL3Byb2R1Y3Rpb24uanNvbic7XG5cbmludGVyZmFjZSBQcm9kdWN0aW9uU3RhZ2VQcm9wcyBleHRlbmRzIGNkay5TdGFnZVByb3BzIHtcbiAgc2VjdXJpdHlTdGFjazogU2VjdXJpdHlTdGFjaztcbiAgbmV0d29ya1N0YWNrOiBOZXR3b3JrU3RhY2s7XG59XG5cbmV4cG9ydCBjbGFzcyBQcm9kdWN0aW9uU3RhZ2UgZXh0ZW5kcyBjZGsuU3RhZ2Uge1xuICBwdWJsaWMgcmVhZG9ubHkgZWNzQ2x1c3RlcjogZWNzLkNsdXN0ZXI7XG4gIHB1YmxpYyByZWFkb25seSBlY3NTZXJ2aWNlOiBlY3MuRmFyZ2F0ZVNlcnZpY2U7XG4gIHB1YmxpYyByZWFkb25seSB0YXJnZXRHcm91cDogZWxidjIuQXBwbGljYXRpb25UYXJnZXRHcm91cDtcbiAgcHVibGljIHJlYWRvbmx5IHdhZlByb3RlY3Rpb246IFdhZlByb3RlY3Rpb247XG4gIHB1YmxpYyByZWFkb25seSBtb25pdG9yaW5nOiBNb25pdG9yaW5nO1xuICBwdWJsaWMgcmVhZG9ubHkgYmFja3VwUGxhbj86IGJhY2t1cC5CYWNrdXBQbGFuO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBQcm9kdWN0aW9uU3RhZ2VQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgY29uc3QgeyBzZWN1cml0eVN0YWNrLCBuZXR3b3JrU3RhY2sgfSA9IHByb3BzO1xuICAgIGNvbnN0IGVudmlyb25tZW50ID0gJ3Byb2R1Y3Rpb24nO1xuXG4gICAgLy8gQ3JlYXRlIEVDUyBDbHVzdGVyIHdpdGggZW5oYW5jZWQgbW9uaXRvcmluZ1xuICAgIHRoaXMuZWNzQ2x1c3RlciA9IG5ldyBlY3MuQ2x1c3Rlcih0aGlzLCAnUHJvZHVjdGlvbkNsdXN0ZXInLCB7XG4gICAgICBjbHVzdGVyTmFtZTogcHJvZHVjdGlvbkNvbmZpZy5lY3MuY2x1c3Rlck5hbWUsXG4gICAgICB2cGM6IG5ldHdvcmtTdGFjay52cGMsXG4gICAgICBjb250YWluZXJJbnNpZ2h0czogcHJvZHVjdGlvbkNvbmZpZy5tb25pdG9yaW5nLmRldGFpbGVkTW9uaXRvcmluZyxcbiAgICAgIGVuYWJsZUZhcmdhdGVDYXBhY2l0eVByb3ZpZGVyczogdHJ1ZSxcbiAgICAgIGV4ZWN1dGVDb21tYW5kQ29uZmlndXJhdGlvbjoge1xuICAgICAgICAvLyBFbmFibGUgZXhlY3V0ZSBjb21tYW5kIGZvciBkZWJ1Z2dpbmcgKHdpdGggbG9nZ2luZylcbiAgICAgICAgbG9nZ2luZzogZWNzLkV4ZWN1dGVDb21tYW5kTG9nZ2luZy5PVkVSUklERSxcbiAgICAgICAgbG9nQ29uZmlndXJhdGlvbjoge1xuICAgICAgICAgIGNsb3VkV2F0Y2hMb2dHcm91cDogbmV3IGNkay5hd3NfbG9ncy5Mb2dHcm91cCh0aGlzLCAnRXhlY3V0ZUNvbW1hbmRMb2dHcm91cCcsIHtcbiAgICAgICAgICAgIGxvZ0dyb3VwTmFtZTogJy9lY3MvZXhlY3V0ZS1jb21tYW5kL2Jjb3MtcHJvZHVjdGlvbicsXG4gICAgICAgICAgICByZXRlbnRpb246IGNkay5hd3NfbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9NT05USCxcbiAgICAgICAgICAgIGVuY3J5cHRpb25LZXk6IHNlY3VyaXR5U3RhY2sua21zS2V5LFxuICAgICAgICAgIH0pLFxuICAgICAgICAgIGNsb3VkV2F0Y2hFbmNyeXB0aW9uRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgc2VjdXJlIGNvbnRhaW5lciBjb25zdHJ1Y3RcbiAgICBjb25zdCBzZWN1cmVDb250YWluZXIgPSBuZXcgU2VjdXJlQ29udGFpbmVyKHRoaXMsICdTZWN1cmVDb250YWluZXInLCB7XG4gICAgICBlbnZpcm9ubWVudDogZW52aXJvbm1lbnQsXG4gICAgICBjbHVzdGVyOiB0aGlzLmVjc0NsdXN0ZXIsXG4gICAgICBlY3JSZXBvc2l0b3J5OiBzZWN1cml0eVN0YWNrLmVjclJlcG9zaXRvcnksXG4gICAgICBrbXNLZXk6IHNlY3VyaXR5U3RhY2sua21zS2V5LFxuICAgICAgZXhlY3V0aW9uUm9sZTogc2VjdXJpdHlTdGFjay5lY3NUYXNrRXhlY3V0aW9uUm9sZSxcbiAgICAgIHRhc2tSb2xlOiBzZWN1cml0eVN0YWNrLmVjc1Rhc2tSb2xlLFxuICAgICAgc2VjcmV0OiBzZWN1cml0eVN0YWNrLnByb2R1Y3Rpb25TZWNyZXQsXG4gICAgICBjcHU6IHByb2R1Y3Rpb25Db25maWcuZWNzLmNwdSxcbiAgICAgIG1lbW9yeTogcHJvZHVjdGlvbkNvbmZpZy5lY3MubWVtb3J5LFxuICAgICAgY29udGFpbmVyUG9ydDogODAsXG4gICAgICBlbnZpcm9ubWVudFZhcmlhYmxlczoge1xuICAgICAgICBFTlZJUk9OTUVOVDogZW52aXJvbm1lbnQsXG4gICAgICAgIE5FWFRfUFVCTElDX0FQUF9VUkw6IGBodHRwczovLyR7cHJvZHVjdGlvbkNvbmZpZy5kb21haW59YCxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgdGFyZ2V0IGdyb3VwIGZvciBwcm9kdWN0aW9uXG4gICAgdGhpcy50YXJnZXRHcm91cCA9IG5ldyBlbGJ2Mi5BcHBsaWNhdGlvblRhcmdldEdyb3VwKHRoaXMsICdQcm9kdWN0aW9uVGFyZ2V0R3JvdXAnLCB7XG4gICAgICB0YXJnZXRHcm91cE5hbWU6ICdiY29zLXByb2R1Y3Rpb24tdGcnLFxuICAgICAgdnBjOiBuZXR3b3JrU3RhY2sudnBjLFxuICAgICAgcG9ydDogODAsXG4gICAgICBwcm90b2NvbDogZWxidjIuQXBwbGljYXRpb25Qcm90b2NvbC5IVFRQLFxuICAgICAgdGFyZ2V0VHlwZTogZWxidjIuVGFyZ2V0VHlwZS5JUCxcbiAgICAgIGhlYWx0aENoZWNrOiB7XG4gICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICAgIHBhdGg6ICcvaGVhbHRoJyxcbiAgICAgICAgcHJvdG9jb2w6IGVsYnYyLlByb3RvY29sLkhUVFAsXG4gICAgICAgIHBvcnQ6ICc4MCcsXG4gICAgICAgIGludGVydmFsOiBjZGsuRHVyYXRpb24uc2Vjb25kcygxNSksXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDUpLFxuICAgICAgICBoZWFsdGh5VGhyZXNob2xkQ291bnQ6IDIsXG4gICAgICAgIHVuaGVhbHRoeVRocmVzaG9sZENvdW50OiAzLFxuICAgICAgICBoZWFsdGh5SHR0cENvZGVzOiAnMjAwJyxcbiAgICAgIH0sXG4gICAgICAvLyBUYXJnZXQgZ3JvdXAgYXR0cmlidXRlcyBmb3IgcHJvZHVjdGlvblxuICAgICAgZGVyZWdpc3RyYXRpb25EZWxheTogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgc3RpY2tpbmVzc0Nvb2tpZUR1cmF0aW9uOiBjZGsuRHVyYXRpb24uaG91cnMoMSksXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgRUNTIEZhcmdhdGUgU2VydmljZSB3aXRoIGVuaGFuY2VkIGNvbmZpZ3VyYXRpb25cbiAgICB0aGlzLmVjc1NlcnZpY2UgPSBuZXcgZWNzLkZhcmdhdGVTZXJ2aWNlKHRoaXMsICdQcm9kdWN0aW9uU2VydmljZScsIHtcbiAgICAgIHNlcnZpY2VOYW1lOiBwcm9kdWN0aW9uQ29uZmlnLmVjcy5zZXJ2aWNlTmFtZSxcbiAgICAgIGNsdXN0ZXI6IHRoaXMuZWNzQ2x1c3RlcixcbiAgICAgIHRhc2tEZWZpbml0aW9uOiBzZWN1cmVDb250YWluZXIudGFza0RlZmluaXRpb24sXG4gICAgICBkZXNpcmVkQ291bnQ6IHByb2R1Y3Rpb25Db25maWcuZWNzLmRlc2lyZWRDb3VudCxcbiAgICAgIG1pbkhlYWx0aHlQZXJjZW50OiA1MCxcbiAgICAgIG1heEhlYWx0aHlQZXJjZW50OiAyMDAsXG4gICAgICB2cGNTdWJuZXRzOiB7XG4gICAgICAgIHN1Ym5ldFR5cGU6IGNkay5hd3NfZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9XSVRIX0VHUkVTUyxcbiAgICAgIH0sXG4gICAgICBzZWN1cml0eUdyb3VwczogW25ldHdvcmtTdGFjay5lY3NTZWN1cml0eUdyb3VwXSxcbiAgICAgIGFzc2lnblB1YmxpY0lwOiBmYWxzZSxcbi8vIExvZ2dpbmcgZW5hYmxlZCBieSBkZWZhdWx0XG4gICAgICBoZWFsdGhDaGVja0dyYWNlUGVyaW9kOiBjZGsuRHVyYXRpb24uc2Vjb25kcygxMjApLFxuICAgICAgY2lyY3VpdEJyZWFrZXI6IHtcbiAgICAgICAgcm9sbGJhY2s6IHRydWUsXG4gICAgICB9LFxuICAgICAgLy8gUHJvZHVjdGlvbi1zcGVjaWZpYyBzZXR0aW5nc1xuICAgICAgZW5hYmxlRXhlY3V0ZUNvbW1hbmQ6IHRydWUsIC8vIEZvciBkZWJ1Z2dpbmcgKHJlcXVpcmVzIHByb3BlciBJQU0gcGVybWlzc2lvbnMpXG4gICAgfSk7XG5cbiAgICAvLyBBc3NvY2lhdGUgc2VydmljZSB3aXRoIHRhcmdldCBncm91cFxuICAgIHRoaXMuZWNzU2VydmljZS5hdHRhY2hUb0FwcGxpY2F0aW9uVGFyZ2V0R3JvdXAodGhpcy50YXJnZXRHcm91cCk7XG5cbiAgICAvLyBTZXQgdGFyZ2V0IGdyb3VwIGFzIGRlZmF1bHQgYWN0aW9uIGZvciBIVFRQUyBsaXN0ZW5lclxuICAgIG5ldHdvcmtTdGFjay5odHRwc0xpc3RlbmVyLmFkZEFjdGlvbignUHJvZHVjdGlvbkRlZmF1bHQnLCB7XG4gICAgICBhY3Rpb246IGVsYnYyLkxpc3RlbmVyQWN0aW9uLmZvcndhcmQoW3RoaXMudGFyZ2V0R3JvdXBdKSxcbiAgICAgIGNvbmRpdGlvbnM6IFtcbiAgICAgICAgZWxidjIuTGlzdGVuZXJDb25kaXRpb24uaG9zdEhlYWRlcnMoW3Byb2R1Y3Rpb25Db25maWcuZG9tYWluXSksXG4gICAgICBdLFxuICAgICAgcHJpb3JpdHk6IDEwLCAvLyBIaWdoZXIgcHJpb3JpdHkgdGhhbiBzdGFnaW5nXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgUm91dGU1MyByZWNvcmQgZm9yIHByb2R1Y3Rpb24gZG9tYWluXG4gICAgbmV3IHJvdXRlNTMuQVJlY29yZCh0aGlzLCAnUHJvZHVjdGlvbkFSZWNvcmQnLCB7XG4gICAgICB6b25lOiBuZXR3b3JrU3RhY2suaG9zdGVkWm9uZSxcbiAgICAgIHJlY29yZE5hbWU6ICdhcHAnLFxuICAgICAgdGFyZ2V0OiByb3V0ZTUzLlJlY29yZFRhcmdldC5mcm9tQWxpYXMoXG4gICAgICAgIG5ldyByb3V0ZTUzdGFyZ2V0cy5Mb2FkQmFsYW5jZXJUYXJnZXQobmV0d29ya1N0YWNrLmxvYWRCYWxhbmNlcilcbiAgICAgICksXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgV0FGIHByb3RlY3Rpb24gd2l0aCBlbmhhbmNlZCBydWxlc1xuICAgIHRoaXMud2FmUHJvdGVjdGlvbiA9IG5ldyBXYWZQcm90ZWN0aW9uKHRoaXMsICdXQUZQcm90ZWN0aW9uJywge1xuICAgICAgZW52aXJvbm1lbnQ6IGVudmlyb25tZW50LFxuICAgICAga21zS2V5OiBzZWN1cml0eVN0YWNrLmttc0tleSxcbiAgICAgIHJhdGVMaW1pdFBlcklQOiBwcm9kdWN0aW9uQ29uZmlnLndhZi5yYXRlTGltaXRQZXJJUCxcbiAgICAgIGVuYWJsZUdlb0Jsb2NraW5nOiBwcm9kdWN0aW9uQ29uZmlnLndhZi5nZW9CbG9ja2luZz8uZW5hYmxlZCB8fCBmYWxzZSxcbiAgICAgIGJsb2NrZWRDb3VudHJpZXM6IHByb2R1Y3Rpb25Db25maWcud2FmLmdlb0Jsb2NraW5nPy5ibG9ja2VkQ291bnRyaWVzIHx8IFtdLFxuICAgICAgZW5hYmxlTWFuYWdlZFJ1bGVzOiB0cnVlLFxuICAgIH0pO1xuXG4gICAgLy8gQXNzb2NpYXRlIFdBRiB3aXRoIGxvYWQgYmFsYW5jZXJcbiAgICB0aGlzLndhZlByb3RlY3Rpb24uYXNzb2NpYXRlV2l0aExvYWRCYWxhbmNlcihuZXR3b3JrU3RhY2subG9hZEJhbGFuY2VyLmxvYWRCYWxhbmNlckFybik7XG5cbiAgICAvLyBDcmVhdGUgY29tcHJlaGVuc2l2ZSBtb25pdG9yaW5nXG4gICAgdGhpcy5tb25pdG9yaW5nID0gbmV3IE1vbml0b3JpbmcodGhpcywgJ01vbml0b3JpbmcnLCB7XG4gICAgICBlbnZpcm9ubWVudDogZW52aXJvbm1lbnQsXG4gICAgICBrbXNLZXk6IHNlY3VyaXR5U3RhY2sua21zS2V5LFxuICAgICAgZWNzU2VydmljZTogdGhpcy5lY3NTZXJ2aWNlLFxuICAgICAgZWNzQ2x1c3RlcjogdGhpcy5lY3NDbHVzdGVyLFxuICAgICAgbG9hZEJhbGFuY2VyOiBuZXR3b3JrU3RhY2subG9hZEJhbGFuY2VyLFxuICAgICAgdGFyZ2V0R3JvdXA6IHRoaXMudGFyZ2V0R3JvdXAsXG4gICAgICBsb2dHcm91cDogc2VjdXJlQ29udGFpbmVyLmxvZ0dyb3VwLFxuICAgICAgYWxlcnRFbWFpbHM6IFsncHJvZHVjdGlvbi1hbGVydHNAYmVuZGNhcmUuY29tJ10sIC8vIFJlcGxhY2Ugd2l0aCBhY3R1YWwgZW1haWxcbiAgICAgIGVuYWJsZURldGFpbGVkTW9uaXRvcmluZzogcHJvZHVjdGlvbkNvbmZpZy5tb25pdG9yaW5nLmRldGFpbGVkTW9uaXRvcmluZyxcbiAgICB9KTtcblxuICAgIC8vIENvbmZpZ3VyZSBhdXRvIHNjYWxpbmdcbiAgICBpZiAocHJvZHVjdGlvbkNvbmZpZy5lY3MuYXV0b1NjYWxpbmcuZW5hYmxlZCkge1xuICAgICAgY29uc3Qgc2NhbGFibGVUYXJnZXQgPSBuZXcgYXBwbGljYXRpb25hdXRvc2NhbGluZy5TY2FsYWJsZVRhcmdldCh0aGlzLCAnUHJvZHVjdGlvblNjYWxhYmxlVGFyZ2V0Jywge1xuICAgICAgICBzZXJ2aWNlTmFtZXNwYWNlOiBhcHBsaWNhdGlvbmF1dG9zY2FsaW5nLlNlcnZpY2VOYW1lc3BhY2UuRUNTLFxuICAgICAgICBzY2FsYWJsZURpbWVuc2lvbjogJ2VjczpzZXJ2aWNlOkRlc2lyZWRDb3VudCcsXG4gICAgICAgIHJlc291cmNlSWQ6IGBzZXJ2aWNlLyR7dGhpcy5lY3NDbHVzdGVyLmNsdXN0ZXJOYW1lfS8ke3RoaXMuZWNzU2VydmljZS5zZXJ2aWNlTmFtZX1gLFxuICAgICAgICBtaW5DYXBhY2l0eTogcHJvZHVjdGlvbkNvbmZpZy5lY3MuYXV0b1NjYWxpbmcubWluQ2FwYWNpdHksXG4gICAgICAgIG1heENhcGFjaXR5OiBwcm9kdWN0aW9uQ29uZmlnLmVjcy5hdXRvU2NhbGluZy5tYXhDYXBhY2l0eSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBDUFUtYmFzZWQgc2NhbGluZ1xuICAgICAgc2NhbGFibGVUYXJnZXQuc2NhbGVUb1RyYWNrTWV0cmljKCdQcm9kdWN0aW9uQ1BVU2NhbGluZycsIHtcbiAgICAgICAgdGFyZ2V0VmFsdWU6IHByb2R1Y3Rpb25Db25maWcuZWNzLmF1dG9TY2FsaW5nLnRhcmdldENwdVV0aWxpemF0aW9uLFxuICAgICAgICBwcmVkZWZpbmVkTWV0cmljOiBhcHBsaWNhdGlvbmF1dG9zY2FsaW5nLlByZWRlZmluZWRNZXRyaWMuRUNTX1NFUlZJQ0VfQVZFUkFHRV9DUFVfVVRJTElaQVRJT04sXG4gICAgICAgIHNjYWxlT3V0Q29vbGRvd246IGNkay5EdXJhdGlvbi5zZWNvbmRzKHByb2R1Y3Rpb25Db25maWcuZWNzLmF1dG9TY2FsaW5nLnNjYWxlT3V0Q29vbGRvd24pLFxuICAgICAgICBzY2FsZUluQ29vbGRvd246IGNkay5EdXJhdGlvbi5zZWNvbmRzKHByb2R1Y3Rpb25Db25maWcuZWNzLmF1dG9TY2FsaW5nLnNjYWxlSW5Db29sZG93biksXG4gICAgICB9KTtcblxuICAgICAgLy8gTWVtb3J5LWJhc2VkIHNjYWxpbmdcbiAgICAgIHNjYWxhYmxlVGFyZ2V0LnNjYWxlVG9UcmFja01ldHJpYygnUHJvZHVjdGlvbk1lbW9yeVNjYWxpbmcnLCB7XG4gICAgICAgIHRhcmdldFZhbHVlOiBwcm9kdWN0aW9uQ29uZmlnLmVjcy5hdXRvU2NhbGluZy50YXJnZXRNZW1vcnlVdGlsaXphdGlvbixcbiAgICAgICAgcHJlZGVmaW5lZE1ldHJpYzogYXBwbGljYXRpb25hdXRvc2NhbGluZy5QcmVkZWZpbmVkTWV0cmljLkVDU19TRVJWSUNFX0FWRVJBR0VfTUVNT1JZX1VUSUxJWkFUSU9OLFxuICAgICAgICBzY2FsZU91dENvb2xkb3duOiBjZGsuRHVyYXRpb24uc2Vjb25kcyhwcm9kdWN0aW9uQ29uZmlnLmVjcy5hdXRvU2NhbGluZy5zY2FsZU91dENvb2xkb3duKSxcbiAgICAgICAgc2NhbGVJbkNvb2xkb3duOiBjZGsuRHVyYXRpb24uc2Vjb25kcyhwcm9kdWN0aW9uQ29uZmlnLmVjcy5hdXRvU2NhbGluZy5zY2FsZUluQ29vbGRvd24pLFxuICAgICAgfSk7XG5cbiAgICAgIC8vIFJlcXVlc3QgY291bnQgYmFzZWQgc2NhbGluZyAoQUxCKVxuICAgICAgY29uc3QgcmVxdWVzdENvdW50TWV0cmljID0gbmV3IGNkay5hd3NfY2xvdWR3YXRjaC5NZXRyaWMoe1xuICAgICAgICBuYW1lc3BhY2U6ICdBV1MvQXBwbGljYXRpb25FTEInLFxuICAgICAgICBtZXRyaWNOYW1lOiAnUmVxdWVzdENvdW50UGVyVGFyZ2V0JyxcbiAgICAgICAgZGltZW5zaW9uc01hcDoge1xuICAgICAgICAgIExvYWRCYWxhbmNlcjogbmV0d29ya1N0YWNrLmxvYWRCYWxhbmNlci5sb2FkQmFsYW5jZXJGdWxsTmFtZSxcbiAgICAgICAgICBUYXJnZXRHcm91cDogdGhpcy50YXJnZXRHcm91cC50YXJnZXRHcm91cEZ1bGxOYW1lLFxuICAgICAgICB9LFxuICAgICAgICBzdGF0aXN0aWM6ICdTdW0nLFxuICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDEpLFxuICAgICAgfSk7XG5cbiAgICAgIHNjYWxhYmxlVGFyZ2V0LnNjYWxlVG9UcmFja01ldHJpYygnUHJvZHVjdGlvblJlcXVlc3RTY2FsaW5nJywge1xuICAgICAgICB0YXJnZXRWYWx1ZTogMTAwMCwgLy8gUmVxdWVzdHMgcGVyIHRhcmdldCBwZXIgbWludXRlXG4gICAgICAgIGN1c3RvbU1ldHJpYzogcmVxdWVzdENvdW50TWV0cmljLFxuICAgICAgICBzY2FsZU91dENvb2xkb3duOiBjZGsuRHVyYXRpb24uc2Vjb25kcyhwcm9kdWN0aW9uQ29uZmlnLmVjcy5hdXRvU2NhbGluZy5zY2FsZU91dENvb2xkb3duKSxcbiAgICAgICAgc2NhbGVJbkNvb2xkb3duOiBjZGsuRHVyYXRpb24uc2Vjb25kcyhwcm9kdWN0aW9uQ29uZmlnLmVjcy5hdXRvU2NhbGluZy5zY2FsZUluQ29vbGRvd24pLFxuICAgICAgfSk7XG5cbiAgICAgIC8vIFNjaGVkdWxlZCBzY2FsaW5nIGZvciBidXNpbmVzcyBob3Vyc1xuICAgICAgc2NhbGFibGVUYXJnZXQuc2NhbGVPblNjaGVkdWxlKCdQcm9kdWN0aW9uQnVzaW5lc3NIb3Vyc1NjYWxpbmcnLCB7XG4gICAgICAgIHNjaGVkdWxlOiBhcHBsaWNhdGlvbmF1dG9zY2FsaW5nLlNjaGVkdWxlLmNyb24oe1xuICAgICAgICAgIGhvdXI6ICc4JyxcbiAgICAgICAgICBtaW51dGU6ICcwJyxcbiAgICAgICAgICB3ZWVrRGF5OiAnMS01JywgLy8gTW9uZGF5IHRvIEZyaWRheVxuICAgICAgICB9KSxcbiAgICAgICAgbWluQ2FwYWNpdHk6IDQsXG4gICAgICAgIG1heENhcGFjaXR5OiBwcm9kdWN0aW9uQ29uZmlnLmVjcy5hdXRvU2NhbGluZy5tYXhDYXBhY2l0eSxcbiAgICAgIH0pO1xuXG4gICAgICBzY2FsYWJsZVRhcmdldC5zY2FsZU9uU2NoZWR1bGUoJ1Byb2R1Y3Rpb25PZmZIb3Vyc1NjYWxpbmcnLCB7XG4gICAgICAgIHNjaGVkdWxlOiBhcHBsaWNhdGlvbmF1dG9zY2FsaW5nLlNjaGVkdWxlLmNyb24oe1xuICAgICAgICAgIGhvdXI6ICcyMCcsXG4gICAgICAgICAgbWludXRlOiAnMCcsXG4gICAgICAgICAgd2Vla0RheTogJzEtNScsIC8vIE1vbmRheSB0byBGcmlkYXlcbiAgICAgICAgfSksXG4gICAgICAgIG1pbkNhcGFjaXR5OiBwcm9kdWN0aW9uQ29uZmlnLmVjcy5hdXRvU2NhbGluZy5taW5DYXBhY2l0eSxcbiAgICAgICAgbWF4Q2FwYWNpdHk6IDEwLFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gQ3JlYXRlIGJhY2t1cCBwbGFuIGZvciBwcm9kdWN0aW9uIChpZiBlbmFibGVkKVxuICAgIGlmIChwcm9kdWN0aW9uQ29uZmlnLmJhY2t1cD8uZW5hYmxlZCkge1xuICAgICAgLy8gQ3JlYXRlIGJhY2t1cCByb2xlXG4gICAgICBjb25zdCBiYWNrdXBSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdCYWNrdXBSb2xlJywge1xuICAgICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnYmFja3VwLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgICAgbWFuYWdlZFBvbGljaWVzOiBbXG4gICAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdzZXJ2aWNlLXJvbGUvQVdTQmFja3VwU2VydmljZVJvbGVQb2xpY3lGb3JCYWNrdXAnKSxcbiAgICAgICAgXSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBDcmVhdGUgYmFja3VwIHZhdWx0XG4gICAgICBjb25zdCBiYWNrdXBWYXVsdCA9IG5ldyBiYWNrdXAuQmFja3VwVmF1bHQodGhpcywgJ0JhY2t1cFZhdWx0Jywge1xuICAgICAgICBiYWNrdXBWYXVsdE5hbWU6IGBiY29zLSR7ZW52aXJvbm1lbnR9LWJhY2t1cC12YXVsdGAsXG4gICAgICAgIGVuY3J5cHRpb25LZXk6IHNlY3VyaXR5U3RhY2sua21zS2V5LFxuICAgICAgfSk7XG5cbiAgICAgIC8vIENyZWF0ZSBiYWNrdXAgcGxhblxuICAgICAgdGhpcy5iYWNrdXBQbGFuID0gbmV3IGJhY2t1cC5CYWNrdXBQbGFuKHRoaXMsICdCYWNrdXBQbGFuJywge1xuICAgICAgICBiYWNrdXBQbGFuTmFtZTogYGJjb3MtJHtlbnZpcm9ubWVudH0tYmFja3VwLXBsYW5gLFxuICAgICAgICBiYWNrdXBWYXVsdDogYmFja3VwVmF1bHQsXG4gICAgICAgIGJhY2t1cFBsYW5SdWxlczogW1xuICAgICAgICAgIC8vIEJhY2t1cCBydWxlIGNvbmZpZ3VyYXRpb24gd291bGQgZ28gaGVyZVxuICAgICAgICAgIC8vIE5vdGU6IEJhY2t1cFBsYW4gQVBJIGhhcyBjaGFuZ2VkIGluIG5ld2VyIENESyB2ZXJzaW9uc1xuICAgICAgICBdLFxuICAgICAgfSk7XG5cbiAgICAgIC8vIE5vdGU6IEVDUyB0YXNrcyBkb24ndCBoYXZlIHBlcnNpc3RlbnQgc3RvcmFnZSB0byBiYWNrIHVwXG4gICAgICAvLyBUaGlzIHdvdWxkIGJlIHVzZWQgZm9yIGJhY2tpbmcgdXAgZGF0YWJhc2VzIG9yIHBlcnNpc3RlbnQgdm9sdW1lcyBpZiBhZGRlZFxuICAgIH1cblxuICAgIC8vIEFwcGx5IHRhZ3NcbiAgICBPYmplY3QuZW50cmllcyhwcm9kdWN0aW9uQ29uZmlnLnRhZ3MpLmZvckVhY2goKFtrZXksIHZhbHVlXSkgPT4ge1xuICAgICAgY2RrLlRhZ3Mub2YodGhpcykuYWRkKGtleSwgdmFsdWUpO1xuICAgIH0pO1xuXG4gICAgLy8gU3RhY2sgb3V0cHV0c1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdQcm9kdWN0aW9uQ2x1c3Rlck5hbWUnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5lY3NDbHVzdGVyLmNsdXN0ZXJOYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdQcm9kdWN0aW9uIEVDUyBDbHVzdGVyIE5hbWUnLFxuICAgICAgZXhwb3J0TmFtZTogJ0JDT1MtUHJvZHVjdGlvbi1DbHVzdGVyTmFtZScsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnUHJvZHVjdGlvblNlcnZpY2VOYW1lJywge1xuICAgICAgdmFsdWU6IHRoaXMuZWNzU2VydmljZS5zZXJ2aWNlTmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnUHJvZHVjdGlvbiBFQ1MgU2VydmljZSBOYW1lJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdCQ09TLVByb2R1Y3Rpb24tU2VydmljZU5hbWUnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1Byb2R1Y3Rpb25VUkwnLCB7XG4gICAgICB2YWx1ZTogYGh0dHBzOi8vJHtwcm9kdWN0aW9uQ29uZmlnLmRvbWFpbn1gLFxuICAgICAgZGVzY3JpcHRpb246ICdQcm9kdWN0aW9uIEFwcGxpY2F0aW9uIFVSTCcsXG4gICAgICBleHBvcnROYW1lOiAnQkNPUy1Qcm9kdWN0aW9uLVVSTCcsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnUHJvZHVjdGlvblRhcmdldEdyb3VwQXJuJywge1xuICAgICAgdmFsdWU6IHRoaXMudGFyZ2V0R3JvdXAudGFyZ2V0R3JvdXBBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ1Byb2R1Y3Rpb24gVGFyZ2V0IEdyb3VwIEFSTicsXG4gICAgICBleHBvcnROYW1lOiAnQkNPUy1Qcm9kdWN0aW9uLVRhcmdldEdyb3VwQXJuJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdQcm9kdWN0aW9uRGFzaGJvYXJkVVJMJywge1xuICAgICAgdmFsdWU6IGBodHRwczovL2NvbnNvbGUuYXdzLmFtYXpvbi5jb20vY2xvdWR3YXRjaC9ob21lP3JlZ2lvbj0ke2Nkay5TdGFjay5vZih0aGlzKS5yZWdpb259I2Rhc2hib2FyZHM6bmFtZT1CQ09TLSR7ZW52aXJvbm1lbnR9LURhc2hib2FyZGAsXG4gICAgICBkZXNjcmlwdGlvbjogJ1Byb2R1Y3Rpb24gQ2xvdWRXYXRjaCBEYXNoYm9hcmQgVVJMJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdCQ09TLVByb2R1Y3Rpb24tRGFzaGJvYXJkVVJMJyxcbiAgICB9KTtcbiAgfVxufVxuIl19