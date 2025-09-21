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
exports.ProductionStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const ecs = __importStar(require("aws-cdk-lib/aws-ecs"));
const elbv2 = __importStar(require("aws-cdk-lib/aws-elasticloadbalancingv2"));
const route53 = __importStar(require("aws-cdk-lib/aws-route53"));
const route53targets = __importStar(require("aws-cdk-lib/aws-route53-targets"));
const applicationautoscaling = __importStar(require("aws-cdk-lib/aws-applicationautoscaling"));
const logs = __importStar(require("aws-cdk-lib/aws-logs"));
const secure_container_1 = require("../constructs/secure-container");
const waf_protection_1 = require("../constructs/waf-protection");
const monitoring_1 = require("../constructs/monitoring");
const production_json_1 = __importDefault(require("../../config/production.json"));
class ProductionStack extends cdk.Stack {
    ecsCluster;
    ecsService;
    targetGroup;
    wafProtection;
    monitoring;
    constructor(scope, id, props) {
        super(scope, id, props);
        const environment = 'production';
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
        const productionSecretArn = cdk.Fn.importValue('BCOS-ProductionSecret-Arn');
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
            repositoryName: 'bcos', // Use static name since we know it
        });
        // Import IAM roles
        const executionRole = cdk.aws_iam.Role.fromRoleArn(this, 'ExecutionRole', ecsTaskExecutionRoleArn);
        const taskRole = cdk.aws_iam.Role.fromRoleArn(this, 'TaskRole', ecsTaskRoleArn);
        // Import secret
        const secret = cdk.aws_secretsmanager.Secret.fromSecretCompleteArn(this, 'Secret', productionSecretArn);
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
        // Create ECS Cluster with enhanced monitoring
        this.ecsCluster = new ecs.Cluster(this, 'ProductionCluster', {
            clusterName: production_json_1.default.ecs.clusterName,
            vpc: vpc,
            containerInsights: production_json_1.default.monitoring.detailedMonitoring,
            enableFargateCapacityProviders: true,
            executeCommandConfiguration: {
                // Enable execute command for debugging (with logging)
                logging: ecs.ExecuteCommandLogging.OVERRIDE,
                logConfiguration: {
                    cloudWatchLogGroup: new logs.LogGroup(this, 'ExecuteCommandLogGroup', {
                        logGroupName: '/ecs/execute-command/bcos-production',
                        retention: logs.RetentionDays.ONE_MONTH,
                    }),
                    cloudWatchEncryptionEnabled: true,
                },
            },
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
            vpc: vpc,
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
            securityGroups: [ecsSecurityGroup],
            assignPublicIp: false,
            healthCheckGracePeriod: cdk.Duration.seconds(120),
            circuitBreaker: {
                rollback: true,
            },
            enableExecuteCommand: true, // For debugging (requires proper IAM permissions)
        });
        // Associate service with target group
        this.ecsService.attachToApplicationTargetGroup(this.targetGroup);
        // Set target group as default action for HTTPS listener
        new elbv2.ApplicationListenerRule(this, 'ProductionListenerRule', {
            listener: httpsListener,
            priority: 10, // Higher priority than staging
            conditions: [elbv2.ListenerCondition.hostHeaders([production_json_1.default.domain])],
            action: elbv2.ListenerAction.forward([this.targetGroup]),
        });
        // Create Route53 record for production domain
        new route53.ARecord(this, 'ProductionARecord', {
            zone: hostedZone,
            recordName: 'app',
            target: route53.RecordTarget.fromAlias(new route53targets.LoadBalancerTarget(loadBalancer)),
        });
        // Create WAF protection with enhanced rules
        this.wafProtection = new waf_protection_1.WafProtection(this, 'WAFProtection', {
            environment: environment,
            kmsKey: kmsKey,
            rateLimitPerIP: production_json_1.default.waf.rateLimitPerIP,
            enableGeoBlocking: production_json_1.default.waf.geoBlocking?.enabled || false,
            blockedCountries: production_json_1.default.waf.geoBlocking?.blockedCountries || [],
            enableManagedRules: true,
        });
        // Associate WAF with load balancer
        this.wafProtection.associateWithLoadBalancer(albArn);
        // Create comprehensive monitoring
        this.monitoring = new monitoring_1.Monitoring(this, 'Monitoring', {
            environment: environment,
            kmsKey: kmsKey,
            ecsService: this.ecsService,
            ecsCluster: this.ecsCluster,
            loadBalancer: loadBalancer,
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
            const loadBalancerFullName = cdk.Token.isUnresolved(albArn)
                ? 'dummy-alb-name'
                : albArn.split('/').slice(1).join('/');
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
exports.ProductionStack = ProductionStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvZHVjdGlvbi1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInByb2R1Y3Rpb24tc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLHlEQUEyQztBQUMzQyw4RUFBZ0U7QUFDaEUsaUVBQW1EO0FBQ25ELGdGQUFrRTtBQUNsRSwrRkFBaUY7QUFDakYsMkRBQTZDO0FBSTdDLHFFQUFpRTtBQUNqRSxpRUFBNkQ7QUFDN0QseURBQXNEO0FBQ3RELG1GQUE0RDtBQU01RCxNQUFhLGVBQWdCLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFDNUIsVUFBVSxDQUFjO0lBQ3hCLFVBQVUsQ0FBcUI7SUFDL0IsV0FBVyxDQUErQjtJQUMxQyxhQUFhLENBQWdCO0lBQzdCLFVBQVUsQ0FBYTtJQUV2QyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQTJCO1FBQ25FLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLE1BQU0sV0FBVyxHQUFHLFlBQVksQ0FBQztRQUVqQyxrREFBa0Q7UUFDbEQsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDLElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUM7UUFDckUsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ1gsTUFBTSxJQUFJLEtBQUssQ0FBQyw2REFBNkQsQ0FBQyxDQUFDO1FBQ2pGLENBQUM7UUFFRCxrQ0FBa0M7UUFDbEMsTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLElBQUksRUFBRSxLQUFLLEVBQUU7WUFDbEQsS0FBSyxFQUFFLEtBQUs7U0FDYixDQUFDLENBQUM7UUFFSCwrREFBK0Q7UUFDL0QsTUFBTSxTQUFTLEdBQUcsR0FBRyxDQUFD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Q2xELEtBQUssRUFBRSxJQUFJLENBQUMsV0FBVyxDQUFDLGNBQWM7WUFDdEMsV0FBVyxFQUFFLDZCQUE2QjtZQUMxQyxVQUFVLEVBQUUsZ0NBQWdDO1NBQzdDLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsd0JBQXdCLEVBQUU7WUFDaEQsS0FBSyxFQUFFLHlEQUF5RCxHQUFHLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLHlCQUF5QixXQUFXLFlBQVk7WUFDekksV0FBVyxFQUFFLHFDQUFxQztZQUNsRCxVQUFVLEVBQUUsOEJBQThCO1NBQzNDLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQXRURCwwQ0FzVEMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0ICogYXMgZWNzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lY3MnO1xuaW1wb3J0ICogYXMgZWxidjIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVsYXN0aWNsb2FkYmFsYW5jaW5ndjInO1xuaW1wb3J0ICogYXMgcm91dGU1MyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtcm91dGU1Myc7XG5pbXBvcnQgKiBhcyByb3V0ZTUzdGFyZ2V0cyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtcm91dGU1My10YXJnZXRzJztcbmltcG9ydCAqIGFzIGFwcGxpY2F0aW9uYXV0b3NjYWxpbmcgZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwcGxpY2F0aW9uYXV0b3NjYWxpbmcnO1xuaW1wb3J0ICogYXMgbG9ncyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbG9ncyc7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCB7IFNlY3VyaXR5U3RhY2sgfSBmcm9tICcuL3NlY3VyaXR5LXN0YWNrJztcbmltcG9ydCB7IE5ldHdvcmtTdGFjayB9IGZyb20gJy4vbmV0d29yay1zdGFjayc7XG5pbXBvcnQgeyBTZWN1cmVDb250YWluZXIgfSBmcm9tICcuLi9jb25zdHJ1Y3RzL3NlY3VyZS1jb250YWluZXInO1xuaW1wb3J0IHsgV2FmUHJvdGVjdGlvbiB9IGZyb20gJy4uL2NvbnN0cnVjdHMvd2FmLXByb3RlY3Rpb24nO1xuaW1wb3J0IHsgTW9uaXRvcmluZyB9IGZyb20gJy4uL2NvbnN0cnVjdHMvbW9uaXRvcmluZyc7XG5pbXBvcnQgcHJvZHVjdGlvbkNvbmZpZyBmcm9tICcuLi8uLi9jb25maWcvcHJvZHVjdGlvbi5qc29uJztcblxuaW50ZXJmYWNlIFByb2R1Y3Rpb25TdGFja1Byb3BzIGV4dGVuZHMgY2RrLlN0YWNrUHJvcHMge1xuICAvLyBObyBkaXJlY3QgcmVmZXJlbmNlcyAtIHVzZSBDREsgb3V0cHV0cy9pbXBvcnRzIGluc3RlYWRcbn1cblxuZXhwb3J0IGNsYXNzIFByb2R1Y3Rpb25TdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIHB1YmxpYyByZWFkb25seSBlY3NDbHVzdGVyOiBlY3MuQ2x1c3RlcjtcbiAgcHVibGljIHJlYWRvbmx5IGVjc1NlcnZpY2U6IGVjcy5GYXJnYXRlU2VydmljZTtcbiAgcHVibGljIHJlYWRvbmx5IHRhcmdldEdyb3VwOiBlbGJ2Mi5BcHBsaWNhdGlvblRhcmdldEdyb3VwO1xuICBwdWJsaWMgcmVhZG9ubHkgd2FmUHJvdGVjdGlvbjogV2FmUHJvdGVjdGlvbjtcbiAgcHVibGljIHJlYWRvbmx5IG1vbml0b3Jpbmc6IE1vbml0b3Jpbmc7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IFByb2R1Y3Rpb25TdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICBjb25zdCBlbnZpcm9ubWVudCA9ICdwcm9kdWN0aW9uJztcblxuICAgIC8vIEdldCBWUEMgSUQgZnJvbSBjb250ZXh0IG9yIGVudmlyb25tZW50IHZhcmlhYmxlXG4gICAgY29uc3QgdnBjSWQgPSB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgndnBjSWQnKSB8fCBwcm9jZXNzLmVudi5WUENfSUQ7XG4gICAgaWYgKCF2cGNJZCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdWUENfSUQgbXVzdCBiZSBwcm92aWRlZCB2aWEgY29udGV4dCBvciBlbnZpcm9ubWVudCB2YXJpYWJsZScpO1xuICAgIH1cblxuICAgIC8vIExvb2sgdXAgVlBDIHVzaW5nIGNvbnRleHQgdmFsdWVcbiAgICBjb25zdCB2cGMgPSBjZGsuYXdzX2VjMi5WcGMuZnJvbUxvb2t1cCh0aGlzLCAnVlBDJywge1xuICAgICAgdnBjSWQ6IHZwY0lkLFxuICAgIH0pO1xuXG4gICAgLy8gSW1wb3J0IHZhbHVlcyBmcm9tIG90aGVyIHN0YWNrcyB1c2luZyBDbG91ZEZvcm1hdGlvbiBpbXBvcnRzXG4gICAgY29uc3Qga21zS2V5QXJuID0gY2RrLkZuLmltcG9ydFZhbHVlKCdCQ09TLUtNUy1LZXktQXJuJyk7XG4gICAgY29uc3QgZWNyUmVwb3NpdG9yeVVyaSA9IGNkay5Gbi5pbXBvcnRWYWx1ZSgnQkNPUy1FQ1JSZXBvc2l0b3J5VXJpJyk7XG4gICAgY29uc3QgZWNzVGFza0V4ZWN1dGlvblJvbGVBcm4gPSBjZGsuRm4uaW1wb3J0VmFsdWUoJ0JDT1MtRUNTVGFza0V4ZWN1dGlvblJvbGUtQXJuJyk7XG4gICAgY29uc3QgZWNzVGFza1JvbGVBcm4gPSBjZGsuRm4uaW1wb3J0VmFsdWUoJ0JDT1MtRUNTVGFza1JvbGUtQXJuJyk7XG4gICAgY29uc3QgcHJvZHVjdGlvblNlY3JldEFybiA9IGNkay5Gbi5pbXBvcnRWYWx1ZSgnQkNPUy1Qcm9kdWN0aW9uU2VjcmV0LUFybicpO1xuICAgIGNvbnN0IGFsYkFybiA9IGNkay5Gbi5pbXBvcnRWYWx1ZSgnQkNPUy1Mb2FkQmFsYW5jZXItQXJuJyk7XG4gICAgY29uc3QgYWxiRG5zTmFtZSA9IGNkay5Gbi5pbXBvcnRWYWx1ZSgnQkNPUy1Mb2FkQmFsYW5jZXItRG5zTmFtZScpO1xuICAgIGNvbnN0IGFsYkNhbm9uaWNhbEhvc3RlZFpvbmVJZCA9IGNkay5Gbi5pbXBvcnRWYWx1ZSgnQkNPUy1Mb2FkQmFsYW5jZXItQ2Fub25pY2FsSG9zdGVkWm9uZUlkJyk7XG4gICAgY29uc3QgaHR0cHNMaXN0ZW5lckFybiA9IGNkay5Gbi5pbXBvcnRWYWx1ZSgnQkNPUy1IVFRQU0xpc3RlbmVyLUFybicpO1xuICAgIGNvbnN0IGhvc3RlZFpvbmVJZCA9IGNkay5Gbi5pbXBvcnRWYWx1ZSgnQkNPUy1Ib3N0ZWRab25lLUlkJyk7XG4gICAgY29uc3QgZWNzU2VjdXJpdHlHcm91cElkID0gY2RrLkZuLmltcG9ydFZhbHVlKCdCQ09TLUVDU1NlY3VyaXR5R3JvdXAtSWQnKTtcblxuICAgIC8vIEltcG9ydCBLTVMga2V5XG4gICAgY29uc3Qga21zS2V5ID0gY2RrLmF3c19rbXMuS2V5LmZyb21LZXlBcm4odGhpcywgJ0tNU0tleScsIGttc0tleUFybik7XG5cbiAgICAvLyBJbXBvcnQgRUNSIHJlcG9zaXRvcnkgdXNpbmcgYXR0cmlidXRlcyAocmVxdWlyZWQgZm9yIHRva2VucylcbiAgICBjb25zdCBlY3JSZXBvc2l0b3J5ID0gY2RrLmF3c19lY3IuUmVwb3NpdG9yeS5mcm9tUmVwb3NpdG9yeUF0dHJpYnV0ZXModGhpcywgJ0VDUlJlcG9zaXRvcnknLCB7XG4gICAgICByZXBvc2l0b3J5QXJuOiBlY3JSZXBvc2l0b3J5VXJpLFxuICAgICAgcmVwb3NpdG9yeU5hbWU6ICdiY29zJywgLy8gVXNlIHN0YXRpYyBuYW1lIHNpbmNlIHdlIGtub3cgaXRcbiAgICB9KTtcblxuICAgIC8vIEltcG9ydCBJQU0gcm9sZXNcbiAgICBjb25zdCBleGVjdXRpb25Sb2xlID0gY2RrLmF3c19pYW0uUm9sZS5mcm9tUm9sZUFybih0aGlzLCAnRXhlY3V0aW9uUm9sZScsIGVjc1Rhc2tFeGVjdXRpb25Sb2xlQXJuKTtcbiAgICBjb25zdCB0YXNrUm9sZSA9IGNkay5hd3NfaWFtLlJvbGUuZnJvbVJvbGVBcm4odGhpcywgJ1Rhc2tSb2xlJywgZWNzVGFza1JvbGVBcm4pO1xuXG4gICAgLy8gSW1wb3J0IHNlY3JldFxuICAgIGNvbnN0IHNlY3JldCA9IGNkay5hd3Nfc2VjcmV0c21hbmFnZXIuU2VjcmV0LmZyb21TZWNyZXRDb21wbGV0ZUFybih0aGlzLCAnU2VjcmV0JywgcHJvZHVjdGlvblNlY3JldEFybik7XG5cbiAgICAvLyBJbXBvcnQgbG9hZCBiYWxhbmNlciBhbmQgbGlzdGVuZXJcbiAgICBjb25zdCBsb2FkQmFsYW5jZXIgPSBjZGsuYXdzX2VsYXN0aWNsb2FkYmFsYW5jaW5ndjIuQXBwbGljYXRpb25Mb2FkQmFsYW5jZXIuZnJvbUFwcGxpY2F0aW9uTG9hZEJhbGFuY2VyQXR0cmlidXRlcyh0aGlzLCAnTG9hZEJhbGFuY2VyJywge1xuICAgICAgbG9hZEJhbGFuY2VyQXJuOiBhbGJBcm4sXG4gICAgICBsb2FkQmFsYW5jZXJEbnNOYW1lOiBhbGJEbnNOYW1lLFxuICAgICAgbG9hZEJhbGFuY2VyQ2Fub25pY2FsSG9zdGVkWm9uZUlkOiBhbGJDYW5vbmljYWxIb3N0ZWRab25lSWQsXG4gICAgICBzZWN1cml0eUdyb3VwSWQ6IGVjc1NlY3VyaXR5R3JvdXBJZCxcbiAgICB9KTtcblxuICAgIGNvbnN0IGh0dHBzTGlzdGVuZXIgPSBjZGsuYXdzX2VsYXN0aWNsb2FkYmFsYW5jaW5ndjIuQXBwbGljYXRpb25MaXN0ZW5lci5mcm9tQXBwbGljYXRpb25MaXN0ZW5lckF0dHJpYnV0ZXModGhpcywgJ0hUVFBTTGlzdGVuZXInLCB7XG4gICAgICBsaXN0ZW5lckFybjogaHR0cHNMaXN0ZW5lckFybixcbiAgICAgIHNlY3VyaXR5R3JvdXA6IGNkay5hd3NfZWMyLlNlY3VyaXR5R3JvdXAuZnJvbVNlY3VyaXR5R3JvdXBJZCh0aGlzLCAnQUxCU2VjdXJpdHlHcm91cCcsIGVjc1NlY3VyaXR5R3JvdXBJZCksXG4gICAgfSk7XG5cbiAgICAvLyBJbXBvcnQgaG9zdGVkIHpvbmUgdXNpbmcgYXR0cmlidXRlcyAocHJvdmlkZXMgem9uZU5hbWUpXG4gICAgY29uc3QgaG9zdGVkWm9uZSA9IGNkay5hd3Nfcm91dGU1My5Ib3N0ZWRab25lLmZyb21Ib3N0ZWRab25lQXR0cmlidXRlcyh0aGlzLCAnSG9zdGVkWm9uZScsIHtcbiAgICAgIGhvc3RlZFpvbmVJZDogaG9zdGVkWm9uZUlkLFxuICAgICAgem9uZU5hbWU6ICdiZW5kY2FyZS5jb20nLFxuICAgIH0pO1xuXG4gICAgLy8gSW1wb3J0IEVDUyBzZWN1cml0eSBncm91cFxuICAgIGNvbnN0IGVjc1NlY3VyaXR5R3JvdXAgPSBjZGsuYXdzX2VjMi5TZWN1cml0eUdyb3VwLmZyb21TZWN1cml0eUdyb3VwSWQodGhpcywgJ0VDU1NlY3VyaXR5R3JvdXAnLCBlY3NTZWN1cml0eUdyb3VwSWQpO1xuXG4gICAgLy8gQ3JlYXRlIEVDUyBDbHVzdGVyIHdpdGggZW5oYW5jZWQgbW9uaXRvcmluZ1xuICAgIHRoaXMuZWNzQ2x1c3RlciA9IG5ldyBlY3MuQ2x1c3Rlcih0aGlzLCAnUHJvZHVjdGlvbkNsdXN0ZXInLCB7XG4gICAgICBjbHVzdGVyTmFtZTogcHJvZHVjdGlvbkNvbmZpZy5lY3MuY2x1c3Rlck5hbWUsXG4gICAgICB2cGM6IHZwYyxcbiAgICAgIGNvbnRhaW5lckluc2lnaHRzOiBwcm9kdWN0aW9uQ29uZmlnLm1vbml0b3JpbmcuZGV0YWlsZWRNb25pdG9yaW5nLFxuICAgICAgZW5hYmxlRmFyZ2F0ZUNhcGFjaXR5UHJvdmlkZXJzOiB0cnVlLFxuICAgICAgZXhlY3V0ZUNvbW1hbmRDb25maWd1cmF0aW9uOiB7XG4gICAgICAgIC8vIEVuYWJsZSBleGVjdXRlIGNvbW1hbmQgZm9yIGRlYnVnZ2luZyAod2l0aCBsb2dnaW5nKVxuICAgICAgICBsb2dnaW5nOiBlY3MuRXhlY3V0ZUNvbW1hbmRMb2dnaW5nLk9WRVJSSURFLFxuICAgICAgICBsb2dDb25maWd1cmF0aW9uOiB7XG4gICAgICAgICAgY2xvdWRXYXRjaExvZ0dyb3VwOiBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnRXhlY3V0ZUNvbW1hbmRMb2dHcm91cCcsIHtcbiAgICAgICAgICAgIGxvZ0dyb3VwTmFtZTogJy9lY3MvZXhlY3V0ZS1jb21tYW5kL2Jjb3MtcHJvZHVjdGlvbicsXG4gICAgICAgICAgICByZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfTU9OVEgsXG4gICAgICAgICAgfSksXG4gICAgICAgICAgY2xvdWRXYXRjaEVuY3J5cHRpb25FbmFibGVkOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBzZWN1cmUgY29udGFpbmVyIGNvbnN0cnVjdFxuICAgIGNvbnN0IHNlY3VyZUNvbnRhaW5lciA9IG5ldyBTZWN1cmVDb250YWluZXIodGhpcywgJ1NlY3VyZUNvbnRhaW5lcicsIHtcbiAgICAgIGVudmlyb25tZW50OiBlbnZpcm9ubWVudCxcbiAgICAgIGNsdXN0ZXI6IHRoaXMuZWNzQ2x1c3RlcixcbiAgICAgIGVjclJlcG9zaXRvcnk6IGVjclJlcG9zaXRvcnksXG4gICAgICBrbXNLZXk6IGttc0tleSxcbiAgICAgIGV4ZWN1dGlvblJvbGU6IGV4ZWN1dGlvblJvbGUsXG4gICAgICB0YXNrUm9sZTogdGFza1JvbGUsXG4gICAgICBzZWNyZXQ6IHNlY3JldCxcbiAgICAgIGNwdTogcHJvZHVjdGlvbkNvbmZpZy5lY3MuY3B1LFxuICAgICAgbWVtb3J5OiBwcm9kdWN0aW9uQ29uZmlnLmVjcy5tZW1vcnksXG4gICAgICBjb250YWluZXJQb3J0OiA4MCxcbiAgICAgIGVudmlyb25tZW50VmFyaWFibGVzOiB7XG4gICAgICAgIEVOVklST05NRU5UOiBlbnZpcm9ubWVudCxcbiAgICAgICAgTkVYVF9QVUJMSUNfQVBQX1VSTDogYGh0dHBzOi8vJHtwcm9kdWN0aW9uQ29uZmlnLmRvbWFpbn1gLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSB0YXJnZXQgZ3JvdXAgZm9yIHByb2R1Y3Rpb25cbiAgICB0aGlzLnRhcmdldEdyb3VwID0gbmV3IGVsYnYyLkFwcGxpY2F0aW9uVGFyZ2V0R3JvdXAodGhpcywgJ1Byb2R1Y3Rpb25UYXJnZXRHcm91cCcsIHtcbiAgICAgIHRhcmdldEdyb3VwTmFtZTogJ2Jjb3MtcHJvZHVjdGlvbi10ZycsXG4gICAgICB2cGM6IHZwYyxcbiAgICAgIHBvcnQ6IDgwLFxuICAgICAgcHJvdG9jb2w6IGVsYnYyLkFwcGxpY2F0aW9uUHJvdG9jb2wuSFRUUCxcbiAgICAgIHRhcmdldFR5cGU6IGVsYnYyLlRhcmdldFR5cGUuSVAsXG4gICAgICBoZWFsdGhDaGVjazoge1xuICAgICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgICBwYXRoOiAnL2hlYWx0aCcsXG4gICAgICAgIHByb3RvY29sOiBlbGJ2Mi5Qcm90b2NvbC5IVFRQLFxuICAgICAgICBwb3J0OiAnODAnLFxuICAgICAgICBpbnRlcnZhbDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMTUpLFxuICAgICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcyg1KSxcbiAgICAgICAgaGVhbHRoeVRocmVzaG9sZENvdW50OiAyLFxuICAgICAgICB1bmhlYWx0aHlUaHJlc2hvbGRDb3VudDogMyxcbiAgICAgICAgaGVhbHRoeUh0dHBDb2RlczogJzIwMCcsXG4gICAgICB9LFxuICAgICAgLy8gVGFyZ2V0IGdyb3VwIGF0dHJpYnV0ZXMgZm9yIHByb2R1Y3Rpb25cbiAgICAgIGRlcmVnaXN0cmF0aW9uRGVsYXk6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgIHN0aWNraW5lc3NDb29raWVEdXJhdGlvbjogY2RrLkR1cmF0aW9uLmhvdXJzKDEpLFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIEVDUyBGYXJnYXRlIFNlcnZpY2Ugd2l0aCBlbmhhbmNlZCBjb25maWd1cmF0aW9uXG4gICAgdGhpcy5lY3NTZXJ2aWNlID0gbmV3IGVjcy5GYXJnYXRlU2VydmljZSh0aGlzLCAnUHJvZHVjdGlvblNlcnZpY2UnLCB7XG4gICAgICBzZXJ2aWNlTmFtZTogcHJvZHVjdGlvbkNvbmZpZy5lY3Muc2VydmljZU5hbWUsXG4gICAgICBjbHVzdGVyOiB0aGlzLmVjc0NsdXN0ZXIsXG4gICAgICB0YXNrRGVmaW5pdGlvbjogc2VjdXJlQ29udGFpbmVyLnRhc2tEZWZpbml0aW9uLFxuICAgICAgZGVzaXJlZENvdW50OiBwcm9kdWN0aW9uQ29uZmlnLmVjcy5kZXNpcmVkQ291bnQsXG4gICAgICBtaW5IZWFsdGh5UGVyY2VudDogNTAsXG4gICAgICBtYXhIZWFsdGh5UGVyY2VudDogMjAwLFxuICAgICAgdnBjU3VibmV0czoge1xuICAgICAgICBzdWJuZXRUeXBlOiBjZGsuYXdzX2VjMi5TdWJuZXRUeXBlLlBSSVZBVEVfV0lUSF9FR1JFU1MsXG4gICAgICB9LFxuICAgICAgc2VjdXJpdHlHcm91cHM6IFtlY3NTZWN1cml0eUdyb3VwXSxcbiAgICAgIGFzc2lnblB1YmxpY0lwOiBmYWxzZSxcbiAgICAgIGhlYWx0aENoZWNrR3JhY2VQZXJpb2Q6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDEyMCksXG4gICAgICBjaXJjdWl0QnJlYWtlcjoge1xuICAgICAgICByb2xsYmFjazogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBlbmFibGVFeGVjdXRlQ29tbWFuZDogdHJ1ZSwgLy8gRm9yIGRlYnVnZ2luZyAocmVxdWlyZXMgcHJvcGVyIElBTSBwZXJtaXNzaW9ucylcbiAgICB9KTtcblxuICAgIC8vIEFzc29jaWF0ZSBzZXJ2aWNlIHdpdGggdGFyZ2V0IGdyb3VwXG4gICAgdGhpcy5lY3NTZXJ2aWNlLmF0dGFjaFRvQXBwbGljYXRpb25UYXJnZXRHcm91cCh0aGlzLnRhcmdldEdyb3VwKTtcblxuICAgIC8vIFNldCB0YXJnZXQgZ3JvdXAgYXMgZGVmYXVsdCBhY3Rpb24gZm9yIEhUVFBTIGxpc3RlbmVyXG4gICAgbmV3IGVsYnYyLkFwcGxpY2F0aW9uTGlzdGVuZXJSdWxlKHRoaXMsICdQcm9kdWN0aW9uTGlzdGVuZXJSdWxlJywge1xuICAgICAgbGlzdGVuZXI6IGh0dHBzTGlzdGVuZXIsXG4gICAgICBwcmlvcml0eTogMTAsIC8vIEhpZ2hlciBwcmlvcml0eSB0aGFuIHN0YWdpbmdcbiAgICAgIGNvbmRpdGlvbnM6IFtlbGJ2Mi5MaXN0ZW5lckNvbmRpdGlvbi5ob3N0SGVhZGVycyhbcHJvZHVjdGlvbkNvbmZpZy5kb21haW5dKV0sXG4gICAgICBhY3Rpb246IGVsYnYyLkxpc3RlbmVyQWN0aW9uLmZvcndhcmQoW3RoaXMudGFyZ2V0R3JvdXBdKSxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBSb3V0ZTUzIHJlY29yZCBmb3IgcHJvZHVjdGlvbiBkb21haW5cbiAgICBuZXcgcm91dGU1My5BUmVjb3JkKHRoaXMsICdQcm9kdWN0aW9uQVJlY29yZCcsIHtcbiAgICAgIHpvbmU6IGhvc3RlZFpvbmUsXG4gICAgICByZWNvcmROYW1lOiAnYXBwJyxcbiAgICAgIHRhcmdldDogcm91dGU1My5SZWNvcmRUYXJnZXQuZnJvbUFsaWFzKFxuICAgICAgICBuZXcgcm91dGU1M3RhcmdldHMuTG9hZEJhbGFuY2VyVGFyZ2V0KGxvYWRCYWxhbmNlcilcbiAgICAgICksXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgV0FGIHByb3RlY3Rpb24gd2l0aCBlbmhhbmNlZCBydWxlc1xuICAgIHRoaXMud2FmUHJvdGVjdGlvbiA9IG5ldyBXYWZQcm90ZWN0aW9uKHRoaXMsICdXQUZQcm90ZWN0aW9uJywge1xuICAgICAgZW52aXJvbm1lbnQ6IGVudmlyb25tZW50LFxuICAgICAga21zS2V5OiBrbXNLZXksXG4gICAgICByYXRlTGltaXRQZXJJUDogcHJvZHVjdGlvbkNvbmZpZy53YWYucmF0ZUxpbWl0UGVySVAsXG4gICAgICBlbmFibGVHZW9CbG9ja2luZzogcHJvZHVjdGlvbkNvbmZpZy53YWYuZ2VvQmxvY2tpbmc/LmVuYWJsZWQgfHwgZmFsc2UsXG4gICAgICBibG9ja2VkQ291bnRyaWVzOiBwcm9kdWN0aW9uQ29uZmlnLndhZi5nZW9CbG9ja2luZz8uYmxvY2tlZENvdW50cmllcyB8fCBbXSxcbiAgICAgIGVuYWJsZU1hbmFnZWRSdWxlczogdHJ1ZSxcbiAgICB9KTtcblxuICAgIC8vIEFzc29jaWF0ZSBXQUYgd2l0aCBsb2FkIGJhbGFuY2VyXG4gICAgdGhpcy53YWZQcm90ZWN0aW9uLmFzc29jaWF0ZVdpdGhMb2FkQmFsYW5jZXIoYWxiQXJuKTtcblxuICAgIC8vIENyZWF0ZSBjb21wcmVoZW5zaXZlIG1vbml0b3JpbmdcbiAgICB0aGlzLm1vbml0b3JpbmcgPSBuZXcgTW9uaXRvcmluZyh0aGlzLCAnTW9uaXRvcmluZycsIHtcbiAgICAgIGVudmlyb25tZW50OiBlbnZpcm9ubWVudCxcbiAgICAgIGttc0tleToga21zS2V5LFxuICAgICAgZWNzU2VydmljZTogdGhpcy5lY3NTZXJ2aWNlLFxuICAgICAgZWNzQ2x1c3RlcjogdGhpcy5lY3NDbHVzdGVyLFxuICAgICAgbG9hZEJhbGFuY2VyOiBsb2FkQmFsYW5jZXIsXG4gICAgICB0YXJnZXRHcm91cDogdGhpcy50YXJnZXRHcm91cCxcbiAgICAgIGxvZ0dyb3VwOiBzZWN1cmVDb250YWluZXIubG9nR3JvdXAsXG4gICAgICBhbGVydEVtYWlsczogWydwcm9kdWN0aW9uLWFsZXJ0c0BiZW5kY2FyZS5jb20nXSwgLy8gUmVwbGFjZSB3aXRoIGFjdHVhbCBlbWFpbFxuICAgICAgZW5hYmxlRGV0YWlsZWRNb25pdG9yaW5nOiBwcm9kdWN0aW9uQ29uZmlnLm1vbml0b3JpbmcuZGV0YWlsZWRNb25pdG9yaW5nLFxuICAgIH0pO1xuXG4gICAgLy8gQ29uZmlndXJlIGF1dG8gc2NhbGluZ1xuICAgIGlmIChwcm9kdWN0aW9uQ29uZmlnLmVjcy5hdXRvU2NhbGluZy5lbmFibGVkKSB7XG4gICAgICBjb25zdCBzY2FsYWJsZVRhcmdldCA9IG5ldyBhcHBsaWNhdGlvbmF1dG9zY2FsaW5nLlNjYWxhYmxlVGFyZ2V0KHRoaXMsICdQcm9kdWN0aW9uU2NhbGFibGVUYXJnZXQnLCB7XG4gICAgICAgIHNlcnZpY2VOYW1lc3BhY2U6IGFwcGxpY2F0aW9uYXV0b3NjYWxpbmcuU2VydmljZU5hbWVzcGFjZS5FQ1MsXG4gICAgICAgIHNjYWxhYmxlRGltZW5zaW9uOiAnZWNzOnNlcnZpY2U6RGVzaXJlZENvdW50JyxcbiAgICAgICAgcmVzb3VyY2VJZDogYHNlcnZpY2UvJHt0aGlzLmVjc0NsdXN0ZXIuY2x1c3Rlck5hbWV9LyR7dGhpcy5lY3NTZXJ2aWNlLnNlcnZpY2VOYW1lfWAsXG4gICAgICAgIG1pbkNhcGFjaXR5OiBwcm9kdWN0aW9uQ29uZmlnLmVjcy5hdXRvU2NhbGluZy5taW5DYXBhY2l0eSxcbiAgICAgICAgbWF4Q2FwYWNpdHk6IHByb2R1Y3Rpb25Db25maWcuZWNzLmF1dG9TY2FsaW5nLm1heENhcGFjaXR5LFxuICAgICAgfSk7XG5cbiAgICAgIC8vIENQVS1iYXNlZCBzY2FsaW5nXG4gICAgICBzY2FsYWJsZVRhcmdldC5zY2FsZVRvVHJhY2tNZXRyaWMoJ1Byb2R1Y3Rpb25DUFVTY2FsaW5nJywge1xuICAgICAgICB0YXJnZXRWYWx1ZTogcHJvZHVjdGlvbkNvbmZpZy5lY3MuYXV0b1NjYWxpbmcudGFyZ2V0Q3B1VXRpbGl6YXRpb24sXG4gICAgICAgIHByZWRlZmluZWRNZXRyaWM6IGFwcGxpY2F0aW9uYXV0b3NjYWxpbmcuUHJlZGVmaW5lZE1ldHJpYy5FQ1NfU0VSVklDRV9BVkVSQUdFX0NQVV9VVElMSVpBVElPTixcbiAgICAgICAgc2NhbGVPdXRDb29sZG93bjogY2RrLkR1cmF0aW9uLnNlY29uZHMocHJvZHVjdGlvbkNvbmZpZy5lY3MuYXV0b1NjYWxpbmcuc2NhbGVPdXRDb29sZG93biksXG4gICAgICAgIHNjYWxlSW5Db29sZG93bjogY2RrLkR1cmF0aW9uLnNlY29uZHMocHJvZHVjdGlvbkNvbmZpZy5lY3MuYXV0b1NjYWxpbmcuc2NhbGVJbkNvb2xkb3duKSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBNZW1vcnktYmFzZWQgc2NhbGluZ1xuICAgICAgc2NhbGFibGVUYXJnZXQuc2NhbGVUb1RyYWNrTWV0cmljKCdQcm9kdWN0aW9uTWVtb3J5U2NhbGluZycsIHtcbiAgICAgICAgdGFyZ2V0VmFsdWU6IHByb2R1Y3Rpb25Db25maWcuZWNzLmF1dG9TY2FsaW5nLnRhcmdldE1lbW9yeVV0aWxpemF0aW9uLFxuICAgICAgICBwcmVkZWZpbmVkTWV0cmljOiBhcHBsaWNhdGlvbmF1dG9zY2FsaW5nLlByZWRlZmluZWRNZXRyaWMuRUNTX1NFUlZJQ0VfQVZFUkFHRV9NRU1PUllfVVRJTElaQVRJT04sXG4gICAgICAgIHNjYWxlT3V0Q29vbGRvd246IGNkay5EdXJhdGlvbi5zZWNvbmRzKHByb2R1Y3Rpb25Db25maWcuZWNzLmF1dG9TY2FsaW5nLnNjYWxlT3V0Q29vbGRvd24pLFxuICAgICAgICBzY2FsZUluQ29vbGRvd246IGNkay5EdXJhdGlvbi5zZWNvbmRzKHByb2R1Y3Rpb25Db25maWcuZWNzLmF1dG9TY2FsaW5nLnNjYWxlSW5Db29sZG93biksXG4gICAgICB9KTtcblxuICAgICAgLy8gUmVxdWVzdCBjb3VudCBiYXNlZCBzY2FsaW5nIChBTEIpXG4gICAgICBjb25zdCBsb2FkQmFsYW5jZXJGdWxsTmFtZSA9IGNkay5Ub2tlbi5pc1VucmVzb2x2ZWQoYWxiQXJuKSBcbiAgICAgICAgPyAnZHVtbXktYWxiLW5hbWUnIFxuICAgICAgICA6IGFsYkFybi5zcGxpdCgnLycpLnNsaWNlKDEpLmpvaW4oJy8nKTtcbiAgICAgIGNvbnN0IHRhcmdldEdyb3VwRnVsbE5hbWUgPSBjZGsuVG9rZW4uaXNVbnJlc29sdmVkKHRoaXMudGFyZ2V0R3JvdXAudGFyZ2V0R3JvdXBBcm4pIFxuICAgICAgICA/ICdkdW1teS10Zy1uYW1lJyBcbiAgICAgICAgOiB0aGlzLnRhcmdldEdyb3VwLnRhcmdldEdyb3VwQXJuLnNwbGl0KCcvJykuc2xpY2UoMSkuam9pbignLycpO1xuXG4gICAgICBjb25zdCByZXF1ZXN0Q291bnRNZXRyaWMgPSBuZXcgY2RrLmF3c19jbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgIG5hbWVzcGFjZTogJ0FXUy9BcHBsaWNhdGlvbkVMQicsXG4gICAgICAgIG1ldHJpY05hbWU6ICdSZXF1ZXN0Q291bnRQZXJUYXJnZXQnLFxuICAgICAgICBkaW1lbnNpb25zTWFwOiB7XG4gICAgICAgICAgTG9hZEJhbGFuY2VyOiBsb2FkQmFsYW5jZXJGdWxsTmFtZSxcbiAgICAgICAgICBUYXJnZXRHcm91cDogdGFyZ2V0R3JvdXBGdWxsTmFtZSxcbiAgICAgICAgfSxcbiAgICAgICAgc3RhdGlzdGljOiAnU3VtJyxcbiAgICAgICAgcGVyaW9kOiBjZGsuRHVyYXRpb24ubWludXRlcygxKSxcbiAgICAgIH0pO1xuXG4gICAgICBzY2FsYWJsZVRhcmdldC5zY2FsZVRvVHJhY2tNZXRyaWMoJ1Byb2R1Y3Rpb25SZXF1ZXN0U2NhbGluZycsIHtcbiAgICAgICAgdGFyZ2V0VmFsdWU6IDEwMDAsIC8vIFJlcXVlc3RzIHBlciB0YXJnZXQgcGVyIG1pbnV0ZVxuICAgICAgICBjdXN0b21NZXRyaWM6IHJlcXVlc3RDb3VudE1ldHJpYyxcbiAgICAgICAgc2NhbGVPdXRDb29sZG93bjogY2RrLkR1cmF0aW9uLnNlY29uZHMocHJvZHVjdGlvbkNvbmZpZy5lY3MuYXV0b1NjYWxpbmcuc2NhbGVPdXRDb29sZG93biksXG4gICAgICAgIHNjYWxlSW5Db29sZG93bjogY2RrLkR1cmF0aW9uLnNlY29uZHMocHJvZHVjdGlvbkNvbmZpZy5lY3MuYXV0b1NjYWxpbmcuc2NhbGVJbkNvb2xkb3duKSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBTY2hlZHVsZWQgc2NhbGluZyBmb3IgYnVzaW5lc3MgaG91cnNcbiAgICAgIHNjYWxhYmxlVGFyZ2V0LnNjYWxlT25TY2hlZHVsZSgnUHJvZHVjdGlvbkJ1c2luZXNzSG91cnNTY2FsaW5nJywge1xuICAgICAgICBzY2hlZHVsZTogYXBwbGljYXRpb25hdXRvc2NhbGluZy5TY2hlZHVsZS5jcm9uKHtcbiAgICAgICAgICBob3VyOiAnOCcsXG4gICAgICAgICAgbWludXRlOiAnMCcsXG4gICAgICAgICAgd2Vla0RheTogJzEtNScsIC8vIE1vbmRheSB0byBGcmlkYXlcbiAgICAgICAgfSksXG4gICAgICAgIG1pbkNhcGFjaXR5OiA0LFxuICAgICAgICBtYXhDYXBhY2l0eTogcHJvZHVjdGlvbkNvbmZpZy5lY3MuYXV0b1NjYWxpbmcubWF4Q2FwYWNpdHksXG4gICAgICB9KTtcblxuICAgICAgc2NhbGFibGVUYXJnZXQuc2NhbGVPblNjaGVkdWxlKCdQcm9kdWN0aW9uT2ZmSG91cnNTY2FsaW5nJywge1xuICAgICAgICBzY2hlZHVsZTogYXBwbGljYXRpb25hdXRvc2NhbGluZy5TY2hlZHVsZS5jcm9uKHtcbiAgICAgICAgICBob3VyOiAnMjAnLFxuICAgICAgICAgIG1pbnV0ZTogJzAnLFxuICAgICAgICAgIHdlZWtEYXk6ICcxLTUnLCAvLyBNb25kYXkgdG8gRnJpZGF5XG4gICAgICAgIH0pLFxuICAgICAgICBtaW5DYXBhY2l0eTogcHJvZHVjdGlvbkNvbmZpZy5lY3MuYXV0b1NjYWxpbmcubWluQ2FwYWNpdHksXG4gICAgICAgIG1heENhcGFjaXR5OiAxMCxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIEFwcGx5IHRhZ3NcbiAgICBPYmplY3QuZW50cmllcyhwcm9kdWN0aW9uQ29uZmlnLnRhZ3MpLmZvckVhY2goKFtrZXksIHZhbHVlXSkgPT4ge1xuICAgICAgY2RrLlRhZ3Mub2YodGhpcykuYWRkKGtleSwgdmFsdWUpO1xuICAgIH0pO1xuXG4gICAgLy8gU3RhY2sgb3V0cHV0c1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdQcm9kdWN0aW9uQ2x1c3Rlck5hbWUnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5lY3NDbHVzdGVyLmNsdXN0ZXJOYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdQcm9kdWN0aW9uIEVDUyBDbHVzdGVyIE5hbWUnLFxuICAgICAgZXhwb3J0TmFtZTogJ0JDT1MtUHJvZHVjdGlvbi1DbHVzdGVyTmFtZScsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnUHJvZHVjdGlvblNlcnZpY2VOYW1lJywge1xuICAgICAgdmFsdWU6IHRoaXMuZWNzU2VydmljZS5zZXJ2aWNlTmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnUHJvZHVjdGlvbiBFQ1MgU2VydmljZSBOYW1lJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdCQ09TLVByb2R1Y3Rpb24tU2VydmljZU5hbWUnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1Byb2R1Y3Rpb25VUkwnLCB7XG4gICAgICB2YWx1ZTogYGh0dHBzOi8vJHtwcm9kdWN0aW9uQ29uZmlnLmRvbWFpbn1gLFxuICAgICAgZGVzY3JpcHRpb246ICdQcm9kdWN0aW9uIEFwcGxpY2F0aW9uIFVSTCcsXG4gICAgICBleHBvcnROYW1lOiAnQkNPUy1Qcm9kdWN0aW9uLVVSTCcsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnUHJvZHVjdGlvblRhcmdldEdyb3VwQXJuJywge1xuICAgICAgdmFsdWU6IHRoaXMudGFyZ2V0R3JvdXAudGFyZ2V0R3JvdXBBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ1Byb2R1Y3Rpb24gVGFyZ2V0IEdyb3VwIEFSTicsXG4gICAgICBleHBvcnROYW1lOiAnQkNPUy1Qcm9kdWN0aW9uLVRhcmdldEdyb3VwQXJuJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdQcm9kdWN0aW9uRGFzaGJvYXJkVVJMJywge1xuICAgICAgdmFsdWU6IGBodHRwczovL2NvbnNvbGUuYXdzLmFtYXpvbi5jb20vY2xvdWR3YXRjaC9ob21lP3JlZ2lvbj0ke2Nkay5TdGFjay5vZih0aGlzKS5yZWdpb259I2Rhc2hib2FyZHM6bmFtZT1CQ09TLSR7ZW52aXJvbm1lbnR9LURhc2hib2FyZGAsXG4gICAgICBkZXNjcmlwdGlvbjogJ1Byb2R1Y3Rpb24gQ2xvdWRXYXRjaCBEYXNoYm9hcmQgVVJMJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdCQ09TLVByb2R1Y3Rpb24tRGFzaGJvYXJkVVJMJyxcbiAgICB9KTtcbiAgfVxufVxuIl19