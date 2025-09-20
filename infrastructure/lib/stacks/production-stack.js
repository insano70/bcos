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
            repositoryName: cdk.Fn.select(1, cdk.Fn.split('/', cdk.Fn.select(5, cdk.Fn.split(':', ecrRepositoryUri)))),
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvZHVjdGlvbi1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInByb2R1Y3Rpb24tc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLHlEQUEyQztBQUMzQyw4RUFBZ0U7QUFDaEUsaUVBQW1EO0FBQ25ELGdGQUFrRTtBQUNsRSwrRkFBaUY7QUFDakYsMkRBQTZDO0FBSTdDLHFFQUFpRTtBQUNqRSxpRUFBNkQ7QUFDN0QseURBQXNEO0FBQ3RELG1GQUE0RDtBQU01RCxNQUFhLGVBQWdCLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFDNUIsVUFBVSxDQUFjO0lBQ3hCLFVBQVUsQ0FBcUI7SUFDL0IsV0FBVyxDQUErQjtJQUMxQyxhQUFhLENBQWdCO0lBQzdCLFVBQVUsQ0FBYTtJQUV2QyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQTJCO1FBQ25FLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLE1BQU0sV0FBVyxHQUFHLFlBQVksQ0FBQztRQUVqQyxrREFBa0Q7UUFDbEQsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDLElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUM7UUFDckUsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ1gsTUFBTSxJQUFJLEtBQUssQ0FBQyw2REFBNkQsQ0FBQyxDQUFDO1FBQ2pGLENBQUM7UUFFRCxrQ0FBa0M7UUFDbEMsTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLElBQUksRUFBRSxLQUFLLEVBQUU7WUFDbEQsS0FBSyxFQUFFLEtBQUs7U0FDYixDQUFDLENBQUM7UUFFSCwrREFBK0Q7UUFDL0QsTUFBTSxTQUFTLEdBQUcsR0FBRyxDQUFD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LGVBQWUsRUFBRTtZQUN2QyxLQUFLLEVBQUUsV0FBVyx5QkFBZ0IsQ0FBQyxNQUFNLEVBQUU7WUFDM0MsV0FBVyxFQUFFLDRCQUE0QjtZQUN6QyxVQUFVLEVBQUUscUJBQXFCO1NBQ2xDLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsMEJBQTBCLEVBQUU7WUFDbEQsS0FBSyxFQUFFLElBQUksQ0FBQyxXQUFXLENBQUMsY0FBYztZQUN0QyxXQUFXLEVBQUUsNkJBQTZCO1lBQzFDLFVBQVUsRUFBRSxnQ0FBZ0M7U0FDN0MsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSx3QkFBd0IsRUFBRTtZQUNoRCxLQUFLLEVBQUUseURBQXlELEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0seUJBQXlCLFdBQVcsWUFBWTtZQUN6SSxXQUFXLEVBQUUscUNBQXFDO1lBQ2xELFVBQVUsRUFBRSw4QkFBOEI7U0FDM0MsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBdFRELDBDQXNUQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgKiBhcyBlY3MgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVjcyc7XG5pbXBvcnQgKiBhcyBlbGJ2MiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWxhc3RpY2xvYWRiYWxhbmNpbmd2Mic7XG5pbXBvcnQgKiBhcyByb3V0ZTUzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1yb3V0ZTUzJztcbmltcG9ydCAqIGFzIHJvdXRlNTN0YXJnZXRzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1yb3V0ZTUzLXRhcmdldHMnO1xuaW1wb3J0ICogYXMgYXBwbGljYXRpb25hdXRvc2NhbGluZyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtYXBwbGljYXRpb25hdXRvc2NhbGluZyc7XG5pbXBvcnQgKiBhcyBsb2dzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sb2dzJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0IHsgU2VjdXJpdHlTdGFjayB9IGZyb20gJy4vc2VjdXJpdHktc3RhY2snO1xuaW1wb3J0IHsgTmV0d29ya1N0YWNrIH0gZnJvbSAnLi9uZXR3b3JrLXN0YWNrJztcbmltcG9ydCB7IFNlY3VyZUNvbnRhaW5lciB9IGZyb20gJy4uL2NvbnN0cnVjdHMvc2VjdXJlLWNvbnRhaW5lcic7XG5pbXBvcnQgeyBXYWZQcm90ZWN0aW9uIH0gZnJvbSAnLi4vY29uc3RydWN0cy93YWYtcHJvdGVjdGlvbic7XG5pbXBvcnQgeyBNb25pdG9yaW5nIH0gZnJvbSAnLi4vY29uc3RydWN0cy9tb25pdG9yaW5nJztcbmltcG9ydCBwcm9kdWN0aW9uQ29uZmlnIGZyb20gJy4uLy4uL2NvbmZpZy9wcm9kdWN0aW9uLmpzb24nO1xuXG5pbnRlcmZhY2UgUHJvZHVjdGlvblN0YWNrUHJvcHMgZXh0ZW5kcyBjZGsuU3RhY2tQcm9wcyB7XG4gIC8vIE5vIGRpcmVjdCByZWZlcmVuY2VzIC0gdXNlIENESyBvdXRwdXRzL2ltcG9ydHMgaW5zdGVhZFxufVxuXG5leHBvcnQgY2xhc3MgUHJvZHVjdGlvblN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgcHVibGljIHJlYWRvbmx5IGVjc0NsdXN0ZXI6IGVjcy5DbHVzdGVyO1xuICBwdWJsaWMgcmVhZG9ubHkgZWNzU2VydmljZTogZWNzLkZhcmdhdGVTZXJ2aWNlO1xuICBwdWJsaWMgcmVhZG9ubHkgdGFyZ2V0R3JvdXA6IGVsYnYyLkFwcGxpY2F0aW9uVGFyZ2V0R3JvdXA7XG4gIHB1YmxpYyByZWFkb25seSB3YWZQcm90ZWN0aW9uOiBXYWZQcm90ZWN0aW9uO1xuICBwdWJsaWMgcmVhZG9ubHkgbW9uaXRvcmluZzogTW9uaXRvcmluZztcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogUHJvZHVjdGlvblN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIGNvbnN0IGVudmlyb25tZW50ID0gJ3Byb2R1Y3Rpb24nO1xuXG4gICAgLy8gR2V0IFZQQyBJRCBmcm9tIGNvbnRleHQgb3IgZW52aXJvbm1lbnQgdmFyaWFibGVcbiAgICBjb25zdCB2cGNJZCA9IHRoaXMubm9kZS50cnlHZXRDb250ZXh0KCd2cGNJZCcpIHx8IHByb2Nlc3MuZW52LlZQQ19JRDtcbiAgICBpZiAoIXZwY0lkKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1ZQQ19JRCBtdXN0IGJlIHByb3ZpZGVkIHZpYSBjb250ZXh0IG9yIGVudmlyb25tZW50IHZhcmlhYmxlJyk7XG4gICAgfVxuXG4gICAgLy8gTG9vayB1cCBWUEMgdXNpbmcgY29udGV4dCB2YWx1ZVxuICAgIGNvbnN0IHZwYyA9IGNkay5hd3NfZWMyLlZwYy5mcm9tTG9va3VwKHRoaXMsICdWUEMnLCB7XG4gICAgICB2cGNJZDogdnBjSWQsXG4gICAgfSk7XG5cbiAgICAvLyBJbXBvcnQgdmFsdWVzIGZyb20gb3RoZXIgc3RhY2tzIHVzaW5nIENsb3VkRm9ybWF0aW9uIGltcG9ydHNcbiAgICBjb25zdCBrbXNLZXlBcm4gPSBjZGsuRm4uaW1wb3J0VmFsdWUoJ0JDT1MtS01TLUtleS1Bcm4nKTtcbiAgICBjb25zdCBlY3JSZXBvc2l0b3J5VXJpID0gY2RrLkZuLmltcG9ydFZhbHVlKCdCQ09TLUVDUlJlcG9zaXRvcnlVcmknKTtcbiAgICBjb25zdCBlY3NUYXNrRXhlY3V0aW9uUm9sZUFybiA9IGNkay5Gbi5pbXBvcnRWYWx1ZSgnQkNPUy1FQ1NUYXNrRXhlY3V0aW9uUm9sZS1Bcm4nKTtcbiAgICBjb25zdCBlY3NUYXNrUm9sZUFybiA9IGNkay5Gbi5pbXBvcnRWYWx1ZSgnQkNPUy1FQ1NUYXNrUm9sZS1Bcm4nKTtcbiAgICBjb25zdCBwcm9kdWN0aW9uU2VjcmV0QXJuID0gY2RrLkZuLmltcG9ydFZhbHVlKCdCQ09TLVByb2R1Y3Rpb25TZWNyZXQtQXJuJyk7XG4gICAgY29uc3QgYWxiQXJuID0gY2RrLkZuLmltcG9ydFZhbHVlKCdCQ09TLUxvYWRCYWxhbmNlci1Bcm4nKTtcbiAgICBjb25zdCBhbGJEbnNOYW1lID0gY2RrLkZuLmltcG9ydFZhbHVlKCdCQ09TLUxvYWRCYWxhbmNlci1EbnNOYW1lJyk7XG4gICAgY29uc3QgYWxiQ2Fub25pY2FsSG9zdGVkWm9uZUlkID0gY2RrLkZuLmltcG9ydFZhbHVlKCdCQ09TLUxvYWRCYWxhbmNlci1DYW5vbmljYWxIb3N0ZWRab25lSWQnKTtcbiAgICBjb25zdCBodHRwc0xpc3RlbmVyQXJuID0gY2RrLkZuLmltcG9ydFZhbHVlKCdCQ09TLUhUVFBTTGlzdGVuZXItQXJuJyk7XG4gICAgY29uc3QgaG9zdGVkWm9uZUlkID0gY2RrLkZuLmltcG9ydFZhbHVlKCdCQ09TLUhvc3RlZFpvbmUtSWQnKTtcbiAgICBjb25zdCBlY3NTZWN1cml0eUdyb3VwSWQgPSBjZGsuRm4uaW1wb3J0VmFsdWUoJ0JDT1MtRUNTU2VjdXJpdHlHcm91cC1JZCcpO1xuXG4gICAgLy8gSW1wb3J0IEtNUyBrZXlcbiAgICBjb25zdCBrbXNLZXkgPSBjZGsuYXdzX2ttcy5LZXkuZnJvbUtleUFybih0aGlzLCAnS01TS2V5Jywga21zS2V5QXJuKTtcblxuICAgIC8vIEltcG9ydCBFQ1IgcmVwb3NpdG9yeSB1c2luZyBhdHRyaWJ1dGVzIChyZXF1aXJlZCBmb3IgdG9rZW5zKVxuICAgIGNvbnN0IGVjclJlcG9zaXRvcnkgPSBjZGsuYXdzX2Vjci5SZXBvc2l0b3J5LmZyb21SZXBvc2l0b3J5QXR0cmlidXRlcyh0aGlzLCAnRUNSUmVwb3NpdG9yeScsIHtcbiAgICAgIHJlcG9zaXRvcnlBcm46IGVjclJlcG9zaXRvcnlVcmksXG4gICAgICByZXBvc2l0b3J5TmFtZTogY2RrLkZuLnNlbGVjdCgxLCBjZGsuRm4uc3BsaXQoJy8nLCBjZGsuRm4uc2VsZWN0KDUsIGNkay5Gbi5zcGxpdCgnOicsIGVjclJlcG9zaXRvcnlVcmkpKSkpLFxuICAgIH0pO1xuXG4gICAgLy8gSW1wb3J0IElBTSByb2xlc1xuICAgIGNvbnN0IGV4ZWN1dGlvblJvbGUgPSBjZGsuYXdzX2lhbS5Sb2xlLmZyb21Sb2xlQXJuKHRoaXMsICdFeGVjdXRpb25Sb2xlJywgZWNzVGFza0V4ZWN1dGlvblJvbGVBcm4pO1xuICAgIGNvbnN0IHRhc2tSb2xlID0gY2RrLmF3c19pYW0uUm9sZS5mcm9tUm9sZUFybih0aGlzLCAnVGFza1JvbGUnLCBlY3NUYXNrUm9sZUFybik7XG5cbiAgICAvLyBJbXBvcnQgc2VjcmV0XG4gICAgY29uc3Qgc2VjcmV0ID0gY2RrLmF3c19zZWNyZXRzbWFuYWdlci5TZWNyZXQuZnJvbVNlY3JldENvbXBsZXRlQXJuKHRoaXMsICdTZWNyZXQnLCBwcm9kdWN0aW9uU2VjcmV0QXJuKTtcblxuICAgIC8vIEltcG9ydCBsb2FkIGJhbGFuY2VyIGFuZCBsaXN0ZW5lclxuICAgIGNvbnN0IGxvYWRCYWxhbmNlciA9IGNkay5hd3NfZWxhc3RpY2xvYWRiYWxhbmNpbmd2Mi5BcHBsaWNhdGlvbkxvYWRCYWxhbmNlci5mcm9tQXBwbGljYXRpb25Mb2FkQmFsYW5jZXJBdHRyaWJ1dGVzKHRoaXMsICdMb2FkQmFsYW5jZXInLCB7XG4gICAgICBsb2FkQmFsYW5jZXJBcm46IGFsYkFybixcbiAgICAgIGxvYWRCYWxhbmNlckRuc05hbWU6IGFsYkRuc05hbWUsXG4gICAgICBsb2FkQmFsYW5jZXJDYW5vbmljYWxIb3N0ZWRab25lSWQ6IGFsYkNhbm9uaWNhbEhvc3RlZFpvbmVJZCxcbiAgICAgIHNlY3VyaXR5R3JvdXBJZDogZWNzU2VjdXJpdHlHcm91cElkLFxuICAgIH0pO1xuXG4gICAgY29uc3QgaHR0cHNMaXN0ZW5lciA9IGNkay5hd3NfZWxhc3RpY2xvYWRiYWxhbmNpbmd2Mi5BcHBsaWNhdGlvbkxpc3RlbmVyLmZyb21BcHBsaWNhdGlvbkxpc3RlbmVyQXR0cmlidXRlcyh0aGlzLCAnSFRUUFNMaXN0ZW5lcicsIHtcbiAgICAgIGxpc3RlbmVyQXJuOiBodHRwc0xpc3RlbmVyQXJuLFxuICAgICAgc2VjdXJpdHlHcm91cDogY2RrLmF3c19lYzIuU2VjdXJpdHlHcm91cC5mcm9tU2VjdXJpdHlHcm91cElkKHRoaXMsICdBTEJTZWN1cml0eUdyb3VwJywgZWNzU2VjdXJpdHlHcm91cElkKSxcbiAgICB9KTtcblxuICAgIC8vIEltcG9ydCBob3N0ZWQgem9uZSB1c2luZyBhdHRyaWJ1dGVzIChwcm92aWRlcyB6b25lTmFtZSlcbiAgICBjb25zdCBob3N0ZWRab25lID0gY2RrLmF3c19yb3V0ZTUzLkhvc3RlZFpvbmUuZnJvbUhvc3RlZFpvbmVBdHRyaWJ1dGVzKHRoaXMsICdIb3N0ZWRab25lJywge1xuICAgICAgaG9zdGVkWm9uZUlkOiBob3N0ZWRab25lSWQsXG4gICAgICB6b25lTmFtZTogJ2JlbmRjYXJlLmNvbScsXG4gICAgfSk7XG5cbiAgICAvLyBJbXBvcnQgRUNTIHNlY3VyaXR5IGdyb3VwXG4gICAgY29uc3QgZWNzU2VjdXJpdHlHcm91cCA9IGNkay5hd3NfZWMyLlNlY3VyaXR5R3JvdXAuZnJvbVNlY3VyaXR5R3JvdXBJZCh0aGlzLCAnRUNTU2VjdXJpdHlHcm91cCcsIGVjc1NlY3VyaXR5R3JvdXBJZCk7XG5cbiAgICAvLyBDcmVhdGUgRUNTIENsdXN0ZXIgd2l0aCBlbmhhbmNlZCBtb25pdG9yaW5nXG4gICAgdGhpcy5lY3NDbHVzdGVyID0gbmV3IGVjcy5DbHVzdGVyKHRoaXMsICdQcm9kdWN0aW9uQ2x1c3RlcicsIHtcbiAgICAgIGNsdXN0ZXJOYW1lOiBwcm9kdWN0aW9uQ29uZmlnLmVjcy5jbHVzdGVyTmFtZSxcbiAgICAgIHZwYzogdnBjLFxuICAgICAgY29udGFpbmVySW5zaWdodHM6IHByb2R1Y3Rpb25Db25maWcubW9uaXRvcmluZy5kZXRhaWxlZE1vbml0b3JpbmcsXG4gICAgICBlbmFibGVGYXJnYXRlQ2FwYWNpdHlQcm92aWRlcnM6IHRydWUsXG4gICAgICBleGVjdXRlQ29tbWFuZENvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgLy8gRW5hYmxlIGV4ZWN1dGUgY29tbWFuZCBmb3IgZGVidWdnaW5nICh3aXRoIGxvZ2dpbmcpXG4gICAgICAgIGxvZ2dpbmc6IGVjcy5FeGVjdXRlQ29tbWFuZExvZ2dpbmcuT1ZFUlJJREUsXG4gICAgICAgIGxvZ0NvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgICBjbG91ZFdhdGNoTG9nR3JvdXA6IG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsICdFeGVjdXRlQ29tbWFuZExvZ0dyb3VwJywge1xuICAgICAgICAgICAgbG9nR3JvdXBOYW1lOiAnL2Vjcy9leGVjdXRlLWNvbW1hbmQvYmNvcy1wcm9kdWN0aW9uJyxcbiAgICAgICAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9NT05USCxcbiAgICAgICAgICB9KSxcbiAgICAgICAgICBjbG91ZFdhdGNoRW5jcnlwdGlvbkVuYWJsZWQ6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIHNlY3VyZSBjb250YWluZXIgY29uc3RydWN0XG4gICAgY29uc3Qgc2VjdXJlQ29udGFpbmVyID0gbmV3IFNlY3VyZUNvbnRhaW5lcih0aGlzLCAnU2VjdXJlQ29udGFpbmVyJywge1xuICAgICAgZW52aXJvbm1lbnQ6IGVudmlyb25tZW50LFxuICAgICAgY2x1c3RlcjogdGhpcy5lY3NDbHVzdGVyLFxuICAgICAgZWNyUmVwb3NpdG9yeTogZWNyUmVwb3NpdG9yeSxcbiAgICAgIGttc0tleToga21zS2V5LFxuICAgICAgZXhlY3V0aW9uUm9sZTogZXhlY3V0aW9uUm9sZSxcbiAgICAgIHRhc2tSb2xlOiB0YXNrUm9sZSxcbiAgICAgIHNlY3JldDogc2VjcmV0LFxuICAgICAgY3B1OiBwcm9kdWN0aW9uQ29uZmlnLmVjcy5jcHUsXG4gICAgICBtZW1vcnk6IHByb2R1Y3Rpb25Db25maWcuZWNzLm1lbW9yeSxcbiAgICAgIGNvbnRhaW5lclBvcnQ6IDgwLFxuICAgICAgZW52aXJvbm1lbnRWYXJpYWJsZXM6IHtcbiAgICAgICAgRU5WSVJPTk1FTlQ6IGVudmlyb25tZW50LFxuICAgICAgICBORVhUX1BVQkxJQ19BUFBfVVJMOiBgaHR0cHM6Ly8ke3Byb2R1Y3Rpb25Db25maWcuZG9tYWlufWAsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIHRhcmdldCBncm91cCBmb3IgcHJvZHVjdGlvblxuICAgIHRoaXMudGFyZ2V0R3JvdXAgPSBuZXcgZWxidjIuQXBwbGljYXRpb25UYXJnZXRHcm91cCh0aGlzLCAnUHJvZHVjdGlvblRhcmdldEdyb3VwJywge1xuICAgICAgdGFyZ2V0R3JvdXBOYW1lOiAnYmNvcy1wcm9kdWN0aW9uLXRnJyxcbiAgICAgIHZwYzogdnBjLFxuICAgICAgcG9ydDogODAsXG4gICAgICBwcm90b2NvbDogZWxidjIuQXBwbGljYXRpb25Qcm90b2NvbC5IVFRQLFxuICAgICAgdGFyZ2V0VHlwZTogZWxidjIuVGFyZ2V0VHlwZS5JUCxcbiAgICAgIGhlYWx0aENoZWNrOiB7XG4gICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICAgIHBhdGg6ICcvaGVhbHRoJyxcbiAgICAgICAgcHJvdG9jb2w6IGVsYnYyLlByb3RvY29sLkhUVFAsXG4gICAgICAgIHBvcnQ6ICc4MCcsXG4gICAgICAgIGludGVydmFsOiBjZGsuRHVyYXRpb24uc2Vjb25kcygxNSksXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDUpLFxuICAgICAgICBoZWFsdGh5VGhyZXNob2xkQ291bnQ6IDIsXG4gICAgICAgIHVuaGVhbHRoeVRocmVzaG9sZENvdW50OiAzLFxuICAgICAgICBoZWFsdGh5SHR0cENvZGVzOiAnMjAwJyxcbiAgICAgIH0sXG4gICAgICAvLyBUYXJnZXQgZ3JvdXAgYXR0cmlidXRlcyBmb3IgcHJvZHVjdGlvblxuICAgICAgZGVyZWdpc3RyYXRpb25EZWxheTogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgc3RpY2tpbmVzc0Nvb2tpZUR1cmF0aW9uOiBjZGsuRHVyYXRpb24uaG91cnMoMSksXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgRUNTIEZhcmdhdGUgU2VydmljZSB3aXRoIGVuaGFuY2VkIGNvbmZpZ3VyYXRpb25cbiAgICB0aGlzLmVjc1NlcnZpY2UgPSBuZXcgZWNzLkZhcmdhdGVTZXJ2aWNlKHRoaXMsICdQcm9kdWN0aW9uU2VydmljZScsIHtcbiAgICAgIHNlcnZpY2VOYW1lOiBwcm9kdWN0aW9uQ29uZmlnLmVjcy5zZXJ2aWNlTmFtZSxcbiAgICAgIGNsdXN0ZXI6IHRoaXMuZWNzQ2x1c3RlcixcbiAgICAgIHRhc2tEZWZpbml0aW9uOiBzZWN1cmVDb250YWluZXIudGFza0RlZmluaXRpb24sXG4gICAgICBkZXNpcmVkQ291bnQ6IHByb2R1Y3Rpb25Db25maWcuZWNzLmRlc2lyZWRDb3VudCxcbiAgICAgIG1pbkhlYWx0aHlQZXJjZW50OiA1MCxcbiAgICAgIG1heEhlYWx0aHlQZXJjZW50OiAyMDAsXG4gICAgICB2cGNTdWJuZXRzOiB7XG4gICAgICAgIHN1Ym5ldFR5cGU6IGNkay5hd3NfZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9XSVRIX0VHUkVTUyxcbiAgICAgIH0sXG4gICAgICBzZWN1cml0eUdyb3VwczogW2Vjc1NlY3VyaXR5R3JvdXBdLFxuICAgICAgYXNzaWduUHVibGljSXA6IGZhbHNlLFxuICAgICAgaGVhbHRoQ2hlY2tHcmFjZVBlcmlvZDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMTIwKSxcbiAgICAgIGNpcmN1aXRCcmVha2VyOiB7XG4gICAgICAgIHJvbGxiYWNrOiB0cnVlLFxuICAgICAgfSxcbiAgICAgIGVuYWJsZUV4ZWN1dGVDb21tYW5kOiB0cnVlLCAvLyBGb3IgZGVidWdnaW5nIChyZXF1aXJlcyBwcm9wZXIgSUFNIHBlcm1pc3Npb25zKVxuICAgIH0pO1xuXG4gICAgLy8gQXNzb2NpYXRlIHNlcnZpY2Ugd2l0aCB0YXJnZXQgZ3JvdXBcbiAgICB0aGlzLmVjc1NlcnZpY2UuYXR0YWNoVG9BcHBsaWNhdGlvblRhcmdldEdyb3VwKHRoaXMudGFyZ2V0R3JvdXApO1xuXG4gICAgLy8gU2V0IHRhcmdldCBncm91cCBhcyBkZWZhdWx0IGFjdGlvbiBmb3IgSFRUUFMgbGlzdGVuZXJcbiAgICBuZXcgZWxidjIuQXBwbGljYXRpb25MaXN0ZW5lclJ1bGUodGhpcywgJ1Byb2R1Y3Rpb25MaXN0ZW5lclJ1bGUnLCB7XG4gICAgICBsaXN0ZW5lcjogaHR0cHNMaXN0ZW5lcixcbiAgICAgIHByaW9yaXR5OiAxMCwgLy8gSGlnaGVyIHByaW9yaXR5IHRoYW4gc3RhZ2luZ1xuICAgICAgY29uZGl0aW9uczogW2VsYnYyLkxpc3RlbmVyQ29uZGl0aW9uLmhvc3RIZWFkZXJzKFtwcm9kdWN0aW9uQ29uZmlnLmRvbWFpbl0pXSxcbiAgICAgIGFjdGlvbjogZWxidjIuTGlzdGVuZXJBY3Rpb24uZm9yd2FyZChbdGhpcy50YXJnZXRHcm91cF0pLFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIFJvdXRlNTMgcmVjb3JkIGZvciBwcm9kdWN0aW9uIGRvbWFpblxuICAgIG5ldyByb3V0ZTUzLkFSZWNvcmQodGhpcywgJ1Byb2R1Y3Rpb25BUmVjb3JkJywge1xuICAgICAgem9uZTogaG9zdGVkWm9uZSxcbiAgICAgIHJlY29yZE5hbWU6ICdhcHAnLFxuICAgICAgdGFyZ2V0OiByb3V0ZTUzLlJlY29yZFRhcmdldC5mcm9tQWxpYXMoXG4gICAgICAgIG5ldyByb3V0ZTUzdGFyZ2V0cy5Mb2FkQmFsYW5jZXJUYXJnZXQobG9hZEJhbGFuY2VyKVxuICAgICAgKSxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBXQUYgcHJvdGVjdGlvbiB3aXRoIGVuaGFuY2VkIHJ1bGVzXG4gICAgdGhpcy53YWZQcm90ZWN0aW9uID0gbmV3IFdhZlByb3RlY3Rpb24odGhpcywgJ1dBRlByb3RlY3Rpb24nLCB7XG4gICAgICBlbnZpcm9ubWVudDogZW52aXJvbm1lbnQsXG4gICAgICBrbXNLZXk6IGttc0tleSxcbiAgICAgIHJhdGVMaW1pdFBlcklQOiBwcm9kdWN0aW9uQ29uZmlnLndhZi5yYXRlTGltaXRQZXJJUCxcbiAgICAgIGVuYWJsZUdlb0Jsb2NraW5nOiBwcm9kdWN0aW9uQ29uZmlnLndhZi5nZW9CbG9ja2luZz8uZW5hYmxlZCB8fCBmYWxzZSxcbiAgICAgIGJsb2NrZWRDb3VudHJpZXM6IHByb2R1Y3Rpb25Db25maWcud2FmLmdlb0Jsb2NraW5nPy5ibG9ja2VkQ291bnRyaWVzIHx8IFtdLFxuICAgICAgZW5hYmxlTWFuYWdlZFJ1bGVzOiB0cnVlLFxuICAgIH0pO1xuXG4gICAgLy8gQXNzb2NpYXRlIFdBRiB3aXRoIGxvYWQgYmFsYW5jZXJcbiAgICB0aGlzLndhZlByb3RlY3Rpb24uYXNzb2NpYXRlV2l0aExvYWRCYWxhbmNlcihhbGJBcm4pO1xuXG4gICAgLy8gQ3JlYXRlIGNvbXByZWhlbnNpdmUgbW9uaXRvcmluZ1xuICAgIHRoaXMubW9uaXRvcmluZyA9IG5ldyBNb25pdG9yaW5nKHRoaXMsICdNb25pdG9yaW5nJywge1xuICAgICAgZW52aXJvbm1lbnQ6IGVudmlyb25tZW50LFxuICAgICAga21zS2V5OiBrbXNLZXksXG4gICAgICBlY3NTZXJ2aWNlOiB0aGlzLmVjc1NlcnZpY2UsXG4gICAgICBlY3NDbHVzdGVyOiB0aGlzLmVjc0NsdXN0ZXIsXG4gICAgICBsb2FkQmFsYW5jZXI6IGxvYWRCYWxhbmNlcixcbiAgICAgIHRhcmdldEdyb3VwOiB0aGlzLnRhcmdldEdyb3VwLFxuICAgICAgbG9nR3JvdXA6IHNlY3VyZUNvbnRhaW5lci5sb2dHcm91cCxcbiAgICAgIGFsZXJ0RW1haWxzOiBbJ3Byb2R1Y3Rpb24tYWxlcnRzQGJlbmRjYXJlLmNvbSddLCAvLyBSZXBsYWNlIHdpdGggYWN0dWFsIGVtYWlsXG4gICAgICBlbmFibGVEZXRhaWxlZE1vbml0b3Jpbmc6IHByb2R1Y3Rpb25Db25maWcubW9uaXRvcmluZy5kZXRhaWxlZE1vbml0b3JpbmcsXG4gICAgfSk7XG5cbiAgICAvLyBDb25maWd1cmUgYXV0byBzY2FsaW5nXG4gICAgaWYgKHByb2R1Y3Rpb25Db25maWcuZWNzLmF1dG9TY2FsaW5nLmVuYWJsZWQpIHtcbiAgICAgIGNvbnN0IHNjYWxhYmxlVGFyZ2V0ID0gbmV3IGFwcGxpY2F0aW9uYXV0b3NjYWxpbmcuU2NhbGFibGVUYXJnZXQodGhpcywgJ1Byb2R1Y3Rpb25TY2FsYWJsZVRhcmdldCcsIHtcbiAgICAgICAgc2VydmljZU5hbWVzcGFjZTogYXBwbGljYXRpb25hdXRvc2NhbGluZy5TZXJ2aWNlTmFtZXNwYWNlLkVDUyxcbiAgICAgICAgc2NhbGFibGVEaW1lbnNpb246ICdlY3M6c2VydmljZTpEZXNpcmVkQ291bnQnLFxuICAgICAgICByZXNvdXJjZUlkOiBgc2VydmljZS8ke3RoaXMuZWNzQ2x1c3Rlci5jbHVzdGVyTmFtZX0vJHt0aGlzLmVjc1NlcnZpY2Uuc2VydmljZU5hbWV9YCxcbiAgICAgICAgbWluQ2FwYWNpdHk6IHByb2R1Y3Rpb25Db25maWcuZWNzLmF1dG9TY2FsaW5nLm1pbkNhcGFjaXR5LFxuICAgICAgICBtYXhDYXBhY2l0eTogcHJvZHVjdGlvbkNvbmZpZy5lY3MuYXV0b1NjYWxpbmcubWF4Q2FwYWNpdHksXG4gICAgICB9KTtcblxuICAgICAgLy8gQ1BVLWJhc2VkIHNjYWxpbmdcbiAgICAgIHNjYWxhYmxlVGFyZ2V0LnNjYWxlVG9UcmFja01ldHJpYygnUHJvZHVjdGlvbkNQVVNjYWxpbmcnLCB7XG4gICAgICAgIHRhcmdldFZhbHVlOiBwcm9kdWN0aW9uQ29uZmlnLmVjcy5hdXRvU2NhbGluZy50YXJnZXRDcHVVdGlsaXphdGlvbixcbiAgICAgICAgcHJlZGVmaW5lZE1ldHJpYzogYXBwbGljYXRpb25hdXRvc2NhbGluZy5QcmVkZWZpbmVkTWV0cmljLkVDU19TRVJWSUNFX0FWRVJBR0VfQ1BVX1VUSUxJWkFUSU9OLFxuICAgICAgICBzY2FsZU91dENvb2xkb3duOiBjZGsuRHVyYXRpb24uc2Vjb25kcyhwcm9kdWN0aW9uQ29uZmlnLmVjcy5hdXRvU2NhbGluZy5zY2FsZU91dENvb2xkb3duKSxcbiAgICAgICAgc2NhbGVJbkNvb2xkb3duOiBjZGsuRHVyYXRpb24uc2Vjb25kcyhwcm9kdWN0aW9uQ29uZmlnLmVjcy5hdXRvU2NhbGluZy5zY2FsZUluQ29vbGRvd24pLFxuICAgICAgfSk7XG5cbiAgICAgIC8vIE1lbW9yeS1iYXNlZCBzY2FsaW5nXG4gICAgICBzY2FsYWJsZVRhcmdldC5zY2FsZVRvVHJhY2tNZXRyaWMoJ1Byb2R1Y3Rpb25NZW1vcnlTY2FsaW5nJywge1xuICAgICAgICB0YXJnZXRWYWx1ZTogcHJvZHVjdGlvbkNvbmZpZy5lY3MuYXV0b1NjYWxpbmcudGFyZ2V0TWVtb3J5VXRpbGl6YXRpb24sXG4gICAgICAgIHByZWRlZmluZWRNZXRyaWM6IGFwcGxpY2F0aW9uYXV0b3NjYWxpbmcuUHJlZGVmaW5lZE1ldHJpYy5FQ1NfU0VSVklDRV9BVkVSQUdFX01FTU9SWV9VVElMSVpBVElPTixcbiAgICAgICAgc2NhbGVPdXRDb29sZG93bjogY2RrLkR1cmF0aW9uLnNlY29uZHMocHJvZHVjdGlvbkNvbmZpZy5lY3MuYXV0b1NjYWxpbmcuc2NhbGVPdXRDb29sZG93biksXG4gICAgICAgIHNjYWxlSW5Db29sZG93bjogY2RrLkR1cmF0aW9uLnNlY29uZHMocHJvZHVjdGlvbkNvbmZpZy5lY3MuYXV0b1NjYWxpbmcuc2NhbGVJbkNvb2xkb3duKSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBSZXF1ZXN0IGNvdW50IGJhc2VkIHNjYWxpbmcgKEFMQilcbiAgICAgIGNvbnN0IGxvYWRCYWxhbmNlckZ1bGxOYW1lID0gY2RrLlRva2VuLmlzVW5yZXNvbHZlZChhbGJBcm4pIFxuICAgICAgICA/ICdkdW1teS1hbGItbmFtZScgXG4gICAgICAgIDogYWxiQXJuLnNwbGl0KCcvJykuc2xpY2UoMSkuam9pbignLycpO1xuICAgICAgY29uc3QgdGFyZ2V0R3JvdXBGdWxsTmFtZSA9IGNkay5Ub2tlbi5pc1VucmVzb2x2ZWQodGhpcy50YXJnZXRHcm91cC50YXJnZXRHcm91cEFybikgXG4gICAgICAgID8gJ2R1bW15LXRnLW5hbWUnIFxuICAgICAgICA6IHRoaXMudGFyZ2V0R3JvdXAudGFyZ2V0R3JvdXBBcm4uc3BsaXQoJy8nKS5zbGljZSgxKS5qb2luKCcvJyk7XG5cbiAgICAgIGNvbnN0IHJlcXVlc3RDb3VudE1ldHJpYyA9IG5ldyBjZGsuYXdzX2Nsb3Vkd2F0Y2guTWV0cmljKHtcbiAgICAgICAgbmFtZXNwYWNlOiAnQVdTL0FwcGxpY2F0aW9uRUxCJyxcbiAgICAgICAgbWV0cmljTmFtZTogJ1JlcXVlc3RDb3VudFBlclRhcmdldCcsXG4gICAgICAgIGRpbWVuc2lvbnNNYXA6IHtcbiAgICAgICAgICBMb2FkQmFsYW5jZXI6IGxvYWRCYWxhbmNlckZ1bGxOYW1lLFxuICAgICAgICAgIFRhcmdldEdyb3VwOiB0YXJnZXRHcm91cEZ1bGxOYW1lLFxuICAgICAgICB9LFxuICAgICAgICBzdGF0aXN0aWM6ICdTdW0nLFxuICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDEpLFxuICAgICAgfSk7XG5cbiAgICAgIHNjYWxhYmxlVGFyZ2V0LnNjYWxlVG9UcmFja01ldHJpYygnUHJvZHVjdGlvblJlcXVlc3RTY2FsaW5nJywge1xuICAgICAgICB0YXJnZXRWYWx1ZTogMTAwMCwgLy8gUmVxdWVzdHMgcGVyIHRhcmdldCBwZXIgbWludXRlXG4gICAgICAgIGN1c3RvbU1ldHJpYzogcmVxdWVzdENvdW50TWV0cmljLFxuICAgICAgICBzY2FsZU91dENvb2xkb3duOiBjZGsuRHVyYXRpb24uc2Vjb25kcyhwcm9kdWN0aW9uQ29uZmlnLmVjcy5hdXRvU2NhbGluZy5zY2FsZU91dENvb2xkb3duKSxcbiAgICAgICAgc2NhbGVJbkNvb2xkb3duOiBjZGsuRHVyYXRpb24uc2Vjb25kcyhwcm9kdWN0aW9uQ29uZmlnLmVjcy5hdXRvU2NhbGluZy5zY2FsZUluQ29vbGRvd24pLFxuICAgICAgfSk7XG5cbiAgICAgIC8vIFNjaGVkdWxlZCBzY2FsaW5nIGZvciBidXNpbmVzcyBob3Vyc1xuICAgICAgc2NhbGFibGVUYXJnZXQuc2NhbGVPblNjaGVkdWxlKCdQcm9kdWN0aW9uQnVzaW5lc3NIb3Vyc1NjYWxpbmcnLCB7XG4gICAgICAgIHNjaGVkdWxlOiBhcHBsaWNhdGlvbmF1dG9zY2FsaW5nLlNjaGVkdWxlLmNyb24oe1xuICAgICAgICAgIGhvdXI6ICc4JyxcbiAgICAgICAgICBtaW51dGU6ICcwJyxcbiAgICAgICAgICB3ZWVrRGF5OiAnMS01JywgLy8gTW9uZGF5IHRvIEZyaWRheVxuICAgICAgICB9KSxcbiAgICAgICAgbWluQ2FwYWNpdHk6IDQsXG4gICAgICAgIG1heENhcGFjaXR5OiBwcm9kdWN0aW9uQ29uZmlnLmVjcy5hdXRvU2NhbGluZy5tYXhDYXBhY2l0eSxcbiAgICAgIH0pO1xuXG4gICAgICBzY2FsYWJsZVRhcmdldC5zY2FsZU9uU2NoZWR1bGUoJ1Byb2R1Y3Rpb25PZmZIb3Vyc1NjYWxpbmcnLCB7XG4gICAgICAgIHNjaGVkdWxlOiBhcHBsaWNhdGlvbmF1dG9zY2FsaW5nLlNjaGVkdWxlLmNyb24oe1xuICAgICAgICAgIGhvdXI6ICcyMCcsXG4gICAgICAgICAgbWludXRlOiAnMCcsXG4gICAgICAgICAgd2Vla0RheTogJzEtNScsIC8vIE1vbmRheSB0byBGcmlkYXlcbiAgICAgICAgfSksXG4gICAgICAgIG1pbkNhcGFjaXR5OiBwcm9kdWN0aW9uQ29uZmlnLmVjcy5hdXRvU2NhbGluZy5taW5DYXBhY2l0eSxcbiAgICAgICAgbWF4Q2FwYWNpdHk6IDEwLFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gQXBwbHkgdGFnc1xuICAgIE9iamVjdC5lbnRyaWVzKHByb2R1Y3Rpb25Db25maWcudGFncykuZm9yRWFjaCgoW2tleSwgdmFsdWVdKSA9PiB7XG4gICAgICBjZGsuVGFncy5vZih0aGlzKS5hZGQoa2V5LCB2YWx1ZSk7XG4gICAgfSk7XG5cbiAgICAvLyBTdGFjayBvdXRwdXRzXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1Byb2R1Y3Rpb25DbHVzdGVyTmFtZScsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmVjc0NsdXN0ZXIuY2x1c3Rlck5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ1Byb2R1Y3Rpb24gRUNTIENsdXN0ZXIgTmFtZScsXG4gICAgICBleHBvcnROYW1lOiAnQkNPUy1Qcm9kdWN0aW9uLUNsdXN0ZXJOYW1lJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdQcm9kdWN0aW9uU2VydmljZU5hbWUnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5lY3NTZXJ2aWNlLnNlcnZpY2VOYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdQcm9kdWN0aW9uIEVDUyBTZXJ2aWNlIE5hbWUnLFxuICAgICAgZXhwb3J0TmFtZTogJ0JDT1MtUHJvZHVjdGlvbi1TZXJ2aWNlTmFtZScsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnUHJvZHVjdGlvblVSTCcsIHtcbiAgICAgIHZhbHVlOiBgaHR0cHM6Ly8ke3Byb2R1Y3Rpb25Db25maWcuZG9tYWlufWAsXG4gICAgICBkZXNjcmlwdGlvbjogJ1Byb2R1Y3Rpb24gQXBwbGljYXRpb24gVVJMJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdCQ09TLVByb2R1Y3Rpb24tVVJMJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdQcm9kdWN0aW9uVGFyZ2V0R3JvdXBBcm4nLCB7XG4gICAgICB2YWx1ZTogdGhpcy50YXJnZXRHcm91cC50YXJnZXRHcm91cEFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnUHJvZHVjdGlvbiBUYXJnZXQgR3JvdXAgQVJOJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdCQ09TLVByb2R1Y3Rpb24tVGFyZ2V0R3JvdXBBcm4nLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1Byb2R1Y3Rpb25EYXNoYm9hcmRVUkwnLCB7XG4gICAgICB2YWx1ZTogYGh0dHBzOi8vY29uc29sZS5hd3MuYW1hem9uLmNvbS9jbG91ZHdhdGNoL2hvbWU/cmVnaW9uPSR7Y2RrLlN0YWNrLm9mKHRoaXMpLnJlZ2lvbn0jZGFzaGJvYXJkczpuYW1lPUJDT1MtJHtlbnZpcm9ubWVudH0tRGFzaGJvYXJkYCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnUHJvZHVjdGlvbiBDbG91ZFdhdGNoIERhc2hib2FyZCBVUkwnLFxuICAgICAgZXhwb3J0TmFtZTogJ0JDT1MtUHJvZHVjdGlvbi1EYXNoYm9hcmRVUkwnLFxuICAgIH0pO1xuICB9XG59XG4iXX0=