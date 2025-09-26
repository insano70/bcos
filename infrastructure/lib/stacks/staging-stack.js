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
        // Use hardcoded values from the deployed stacks for now (to avoid CloudFormation function issues)
        const kmsKeyArn = 'arn:aws:kms:us-east-1:854428944440:key/1d56416b-b0da-4f9a-8bf3-7517b7d066c2';
        const ecrRepositoryArn = 'arn:aws:ecr:us-east-1:854428944440:repository/bcos';
        const ecsTaskExecutionRoleArn = 'arn:aws:iam::854428944440:role/BCOS-ECSTaskExecutionRole';
        const ecsTaskRoleArn = 'arn:aws:iam::854428944440:role/BCOS-ECSTaskRole';
        const stagingSecretArn = 'arn:aws:secretsmanager:us-east-1:854428944440:secret:staging/bcos-secrets-vDmCm7';
        const albArn = 'arn:aws:elasticloadbalancing:us-east-1:854428944440:loadbalancer/app/BCOS-N-Appli-rIo4btfCQRZj/ac6744264a6b1239';
        const albDnsName = 'BCOS-N-Appli-rIo4btfCQRZj-401564420.us-east-1.elb.amazonaws.com';
        const albCanonicalHostedZoneId = 'Z35SXDOTRQ7X7K';
        const httpsListenerArn = 'arn:aws:elasticloadbalancing:us-east-1:854428944440:listener/app/BCOS-N-Appli-rIo4btfCQRZj/ac6744264a6b1239/93962089e0bad510';
        const hostedZoneId = 'Z05961102TVIVESKQ4GAL';
        const ecsSecurityGroupId = 'sg-01fa0ee93963bd614';
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
            containerPort: 3000,
            environmentVariables: {
                ENVIRONMENT: environment,
                NEXT_PUBLIC_APP_URL: `https://${staging_json_1.default.domain}`,
            },
        });
        // Create target group for staging
        this.targetGroup = new elbv2.ApplicationTargetGroup(this, 'StagingTargetGroup', {
            targetGroupName: 'bcos-staging-tg',
            vpc: vpc,
            port: 3000,
            protocol: elbv2.ApplicationProtocol.HTTP,
            targetType: elbv2.TargetType.IP,
            healthCheck: {
                enabled: true,
                path: '/health',
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
            healthCheckGracePeriod: cdk.Duration.seconds(300), // Longer grace period
            // circuitBreaker: {
            //   rollback: true,
            // }, // Disabled temporarily for initial deployment
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhZ2luZy1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInN0YWdpbmctc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLHlEQUEyQztBQUMzQyw4RUFBZ0U7QUFDaEUsaUVBQW1EO0FBQ25ELGdGQUFrRTtBQUNsRSwrRkFBaUY7QUFJakYscUVBQWlFO0FBQ2pFLGlFQUE2RDtBQUM3RCx5REFBc0Q7QUFDdEQsNkVBQXNEO0FBTXRELE1BQWEsWUFBYSxTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQ3pCLFVBQVUsQ0FBYztJQUN4QixVQUFVLENBQXFCO0lBQy9CLFdBQVcsQ0FBK0I7SUFDMUMsYUFBYSxDQUFnQjtJQUM3QixVQUFVLENBQWE7SUFFdkMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUF3QjtRQUNoRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixNQUFNLFdBQVcsR0FBRyxTQUFTLENBQUM7UUFFOUIsa0RBQWtEO1FBQ2xELE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQyxJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDO1FBQ3JFLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNYLE1BQU0sSUFBSSxLQUFLLENBQUMsNkRBQTZELENBQUMsQ0FBQztRQUNqRixDQUFDO1FBRUQsa0NBQWtDO1FBQ2xDLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxJQUFJLEVBQUUsS0FBSyxFQUFFO1lBQ2xELEtBQUssRUFBRSxLQUFLO1NBQ2IsQ0FBQyxDQUFDO1FBRUgsa0dBQWtHO1FBQ2xHLE1BQU0sU0FBUyxHQUFHLDZFQUE2RSxDQUFDO1FBQ2hHLE1BQU0sZ0JBQWdC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RUFBRSxLQUFLLENBQUMsRUFBRSxFQUFFO1lBQzFELEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDcEMsQ0FBQyxDQUFDLENBQUM7UUFFSCxnQkFBZ0I7UUFDaEIsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxvQkFBb0IsRUFBRTtZQUM1QyxLQUFLLEVBQUUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxXQUFXO1lBQ2xDLFdBQVcsRUFBRSwwQkFBMEI7WUFDdkMsVUFBVSxFQUFFLDBCQUEwQjtTQUN2QyxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLG9CQUFvQixFQUFFO1lBQzVDLEtBQUssRUFBRSxJQUFJLENBQUMsVUFBVSxDQUFDLFdBQVc7WUFDbEMsV0FBVyxFQUFFLDBCQUEwQjtZQUN2QyxVQUFVLEVBQUUsMEJBQTBCO1NBQ3ZDLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsWUFBWSxFQUFFO1lBQ3BDLEtBQUssRUFBRSxXQUFXLHNCQUFhLENBQUMsTUFBTSxFQUFFO1lBQ3hDLFdBQVcsRUFBRSx5QkFBeUI7WUFDdEMsVUFBVSxFQUFFLGtCQUFrQjtTQUMvQixDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLHVCQUF1QixFQUFFO1lBQy9DLEtBQUssRUFBRSxJQUFJLENBQUMsV0FBVyxDQUFDLGNBQWM7WUFDdEMsV0FBVyxFQUFFLDBCQUEwQjtZQUN2QyxVQUFVLEVBQUUsNkJBQTZCO1NBQzFDLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQXpPRCxvQ0F5T0MiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0ICogYXMgZWNzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lY3MnO1xuaW1wb3J0ICogYXMgZWxidjIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVsYXN0aWNsb2FkYmFsYW5jaW5ndjInO1xuaW1wb3J0ICogYXMgcm91dGU1MyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtcm91dGU1Myc7XG5pbXBvcnQgKiBhcyByb3V0ZTUzdGFyZ2V0cyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtcm91dGU1My10YXJnZXRzJztcbmltcG9ydCAqIGFzIGFwcGxpY2F0aW9uYXV0b3NjYWxpbmcgZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwcGxpY2F0aW9uYXV0b3NjYWxpbmcnO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgeyBTZWN1cml0eVN0YWNrIH0gZnJvbSAnLi9zZWN1cml0eS1zdGFjayc7XG5pbXBvcnQgeyBOZXR3b3JrU3RhY2sgfSBmcm9tICcuL25ldHdvcmstc3RhY2snO1xuaW1wb3J0IHsgU2VjdXJlQ29udGFpbmVyIH0gZnJvbSAnLi4vY29uc3RydWN0cy9zZWN1cmUtY29udGFpbmVyJztcbmltcG9ydCB7IFdhZlByb3RlY3Rpb24gfSBmcm9tICcuLi9jb25zdHJ1Y3RzL3dhZi1wcm90ZWN0aW9uJztcbmltcG9ydCB7IE1vbml0b3JpbmcgfSBmcm9tICcuLi9jb25zdHJ1Y3RzL21vbml0b3JpbmcnO1xuaW1wb3J0IHN0YWdpbmdDb25maWcgZnJvbSAnLi4vLi4vY29uZmlnL3N0YWdpbmcuanNvbic7XG5cbmludGVyZmFjZSBTdGFnaW5nU3RhY2tQcm9wcyBleHRlbmRzIGNkay5TdGFja1Byb3BzIHtcbiAgLy8gTm8gZGlyZWN0IHJlZmVyZW5jZXMgLSB1c2UgQ0RLIG91dHB1dHMvaW1wb3J0cyBpbnN0ZWFkXG59XG5cbmV4cG9ydCBjbGFzcyBTdGFnaW5nU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBwdWJsaWMgcmVhZG9ubHkgZWNzQ2x1c3RlcjogZWNzLkNsdXN0ZXI7XG4gIHB1YmxpYyByZWFkb25seSBlY3NTZXJ2aWNlOiBlY3MuRmFyZ2F0ZVNlcnZpY2U7XG4gIHB1YmxpYyByZWFkb25seSB0YXJnZXRHcm91cDogZWxidjIuQXBwbGljYXRpb25UYXJnZXRHcm91cDtcbiAgcHVibGljIHJlYWRvbmx5IHdhZlByb3RlY3Rpb246IFdhZlByb3RlY3Rpb247XG4gIHB1YmxpYyByZWFkb25seSBtb25pdG9yaW5nOiBNb25pdG9yaW5nO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBTdGFnaW5nU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgY29uc3QgZW52aXJvbm1lbnQgPSAnc3RhZ2luZyc7XG5cbiAgICAvLyBHZXQgVlBDIElEIGZyb20gY29udGV4dCBvciBlbnZpcm9ubWVudCB2YXJpYWJsZVxuICAgIGNvbnN0IHZwY0lkID0gdGhpcy5ub2RlLnRyeUdldENvbnRleHQoJ3ZwY0lkJykgfHwgcHJvY2Vzcy5lbnYuVlBDX0lEO1xuICAgIGlmICghdnBjSWQpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignVlBDX0lEIG11c3QgYmUgcHJvdmlkZWQgdmlhIGNvbnRleHQgb3IgZW52aXJvbm1lbnQgdmFyaWFibGUnKTtcbiAgICB9XG5cbiAgICAvLyBMb29rIHVwIFZQQyB1c2luZyBjb250ZXh0IHZhbHVlXG4gICAgY29uc3QgdnBjID0gY2RrLmF3c19lYzIuVnBjLmZyb21Mb29rdXAodGhpcywgJ1ZQQycsIHtcbiAgICAgIHZwY0lkOiB2cGNJZCxcbiAgICB9KTtcblxuICAgIC8vIFVzZSBoYXJkY29kZWQgdmFsdWVzIGZyb20gdGhlIGRlcGxveWVkIHN0YWNrcyBmb3Igbm93ICh0byBhdm9pZCBDbG91ZEZvcm1hdGlvbiBmdW5jdGlvbiBpc3N1ZXMpXG4gICAgY29uc3Qga21zS2V5QXJuID0gJ2Fybjphd3M6a21zOnVzLWVhc3QtMTo4NTQ0Mjg5NDQ0NDA6a2V5LzFkNTY0MTZiLWIwZGEtNGY5YS04YmYzLTc1MTdiN2QwNjZjMic7XG4gICAgY29uc3QgZWNyUmVwb3NpdG9yeUFybiA9ICdhcm46YXdzOmVjcjp1cy1lYXN0LTE6ODU0NDI4OTQ0NDQwOnJlcG9zaXRvcnkvYmNvcyc7XG4gICAgY29uc3QgZWNzVGFza0V4ZWN1dGlvblJvbGVBcm4gPSAnYXJuOmF3czppYW06Ojg1NDQyODk0NDQ0MDpyb2xlL0JDT1MtRUNTVGFza0V4ZWN1dGlvblJvbGUnO1xuICAgIGNvbnN0IGVjc1Rhc2tSb2xlQXJuID0gJ2Fybjphd3M6aWFtOjo4NTQ0Mjg5NDQ0NDA6cm9sZS9CQ09TLUVDU1Rhc2tSb2xlJztcbiAgICBjb25zdCBzdGFnaW5nU2VjcmV0QXJuID0gJ2Fybjphd3M6c2VjcmV0c21hbmFnZXI6dXMtZWFzdC0xOjg1NDQyODk0NDQ0MDpzZWNyZXQ6c3RhZ2luZy9iY29zLXNlY3JldHMtdkRtQ203JztcbiAgICBjb25zdCBhbGJBcm4gPSAnYXJuOmF3czplbGFzdGljbG9hZGJhbGFuY2luZzp1cy1lYXN0LTE6ODU0NDI4OTQ0NDQwOmxvYWRiYWxhbmNlci9hcHAvQkNPUy1OLUFwcGxpLXJJbzRidGZDUVJaai9hYzY3NDQyNjRhNmIxMjM5JztcbiAgICBjb25zdCBhbGJEbnNOYW1lID0gJ0JDT1MtTi1BcHBsaS1ySW80YnRmQ1FSWmotNDAxNTY0NDIwLnVzLWVhc3QtMS5lbGIuYW1hem9uYXdzLmNvbSc7XG4gICAgY29uc3QgYWxiQ2Fub25pY2FsSG9zdGVkWm9uZUlkID0gJ1ozNVNYRE9UUlE3WDdLJztcbiAgICBjb25zdCBodHRwc0xpc3RlbmVyQXJuID0gJ2Fybjphd3M6ZWxhc3RpY2xvYWRiYWxhbmNpbmc6dXMtZWFzdC0xOjg1NDQyODk0NDQ0MDpsaXN0ZW5lci9hcHAvQkNPUy1OLUFwcGxpLXJJbzRidGZDUVJaai9hYzY3NDQyNjRhNmIxMjM5LzkzOTYyMDg5ZTBiYWQ1MTAnO1xuICAgIGNvbnN0IGhvc3RlZFpvbmVJZCA9ICdaMDU5NjExMDJUVklWRVNLUTRHQUwnO1xuICAgIGNvbnN0IGVjc1NlY3VyaXR5R3JvdXBJZCA9ICdzZy0wMWZhMGVlOTM5NjNiZDYxNCc7XG5cbiAgICAvLyBJbXBvcnQgS01TIGtleVxuICAgIGNvbnN0IGttc0tleSA9IGNkay5hd3Nfa21zLktleS5mcm9tS2V5QXJuKHRoaXMsICdLTVNLZXknLCBrbXNLZXlBcm4pO1xuXG4gICAgLy8gSW1wb3J0IEVDUiByZXBvc2l0b3J5IHVzaW5nIGF0dHJpYnV0ZXMgKHJlcXVpcmVkIGZvciB0b2tlbnMpXG4gICAgY29uc3QgZWNyUmVwb3NpdG9yeSA9IGNkay5hd3NfZWNyLlJlcG9zaXRvcnkuZnJvbVJlcG9zaXRvcnlBdHRyaWJ1dGVzKHRoaXMsICdFQ1JSZXBvc2l0b3J5Jywge1xuICAgICAgcmVwb3NpdG9yeUFybjogZWNyUmVwb3NpdG9yeUFybixcbiAgICAgIHJlcG9zaXRvcnlOYW1lOiAnYmNvcycsXG4gICAgfSk7XG5cbiAgICAvLyBJbXBvcnQgSUFNIHJvbGVzXG4gICAgY29uc3QgZXhlY3V0aW9uUm9sZSA9IGNkay5hd3NfaWFtLlJvbGUuZnJvbVJvbGVBcm4odGhpcywgJ0V4ZWN1dGlvblJvbGUnLCBlY3NUYXNrRXhlY3V0aW9uUm9sZUFybik7XG4gICAgY29uc3QgdGFza1JvbGUgPSBjZGsuYXdzX2lhbS5Sb2xlLmZyb21Sb2xlQXJuKHRoaXMsICdUYXNrUm9sZScsIGVjc1Rhc2tSb2xlQXJuKTtcblxuICAgIC8vIEltcG9ydCBzZWNyZXRcbiAgICBjb25zdCBzZWNyZXQgPSBjZGsuYXdzX3NlY3JldHNtYW5hZ2VyLlNlY3JldC5mcm9tU2VjcmV0Q29tcGxldGVBcm4odGhpcywgJ1NlY3JldCcsIHN0YWdpbmdTZWNyZXRBcm4pO1xuXG4gICAgLy8gSW1wb3J0IGxvYWQgYmFsYW5jZXIgYW5kIGxpc3RlbmVyXG4gICAgY29uc3QgbG9hZEJhbGFuY2VyID0gY2RrLmF3c19lbGFzdGljbG9hZGJhbGFuY2luZ3YyLkFwcGxpY2F0aW9uTG9hZEJhbGFuY2VyLmZyb21BcHBsaWNhdGlvbkxvYWRCYWxhbmNlckF0dHJpYnV0ZXModGhpcywgJ0xvYWRCYWxhbmNlcicsIHtcbiAgICAgIGxvYWRCYWxhbmNlckFybjogYWxiQXJuLFxuICAgICAgbG9hZEJhbGFuY2VyRG5zTmFtZTogYWxiRG5zTmFtZSxcbiAgICAgIGxvYWRCYWxhbmNlckNhbm9uaWNhbEhvc3RlZFpvbmVJZDogYWxiQ2Fub25pY2FsSG9zdGVkWm9uZUlkLFxuICAgICAgc2VjdXJpdHlHcm91cElkOiBlY3NTZWN1cml0eUdyb3VwSWQsXG4gICAgfSk7XG5cbiAgICBjb25zdCBodHRwc0xpc3RlbmVyID0gY2RrLmF3c19lbGFzdGljbG9hZGJhbGFuY2luZ3YyLkFwcGxpY2F0aW9uTGlzdGVuZXIuZnJvbUFwcGxpY2F0aW9uTGlzdGVuZXJBdHRyaWJ1dGVzKHRoaXMsICdIVFRQU0xpc3RlbmVyJywge1xuICAgICAgbGlzdGVuZXJBcm46IGh0dHBzTGlzdGVuZXJBcm4sXG4gICAgICBzZWN1cml0eUdyb3VwOiBjZGsuYXdzX2VjMi5TZWN1cml0eUdyb3VwLmZyb21TZWN1cml0eUdyb3VwSWQodGhpcywgJ0FMQlNlY3VyaXR5R3JvdXAnLCBlY3NTZWN1cml0eUdyb3VwSWQpLFxuICAgIH0pO1xuXG4gICAgLy8gSW1wb3J0IGhvc3RlZCB6b25lIHVzaW5nIGF0dHJpYnV0ZXMgKHByb3ZpZGVzIHpvbmVOYW1lKVxuICAgIGNvbnN0IGhvc3RlZFpvbmUgPSBjZGsuYXdzX3JvdXRlNTMuSG9zdGVkWm9uZS5mcm9tSG9zdGVkWm9uZUF0dHJpYnV0ZXModGhpcywgJ0hvc3RlZFpvbmUnLCB7XG4gICAgICBob3N0ZWRab25lSWQ6IGhvc3RlZFpvbmVJZCxcbiAgICAgIHpvbmVOYW1lOiAnYmVuZGNhcmUuY29tJyxcbiAgICB9KTtcblxuICAgIC8vIEltcG9ydCBFQ1Mgc2VjdXJpdHkgZ3JvdXBcbiAgICBjb25zdCBlY3NTZWN1cml0eUdyb3VwID0gY2RrLmF3c19lYzIuU2VjdXJpdHlHcm91cC5mcm9tU2VjdXJpdHlHcm91cElkKHRoaXMsICdFQ1NTZWN1cml0eUdyb3VwJywgZWNzU2VjdXJpdHlHcm91cElkKTtcblxuICAgIC8vIENyZWF0ZSBFQ1MgQ2x1c3RlclxuICAgIHRoaXMuZWNzQ2x1c3RlciA9IG5ldyBlY3MuQ2x1c3Rlcih0aGlzLCAnU3RhZ2luZ0NsdXN0ZXInLCB7XG4gICAgICBjbHVzdGVyTmFtZTogc3RhZ2luZ0NvbmZpZy5lY3MuY2x1c3Rlck5hbWUsXG4gICAgICB2cGM6IHZwYyxcbiAgICAgIGNvbnRhaW5lckluc2lnaHRzOiBzdGFnaW5nQ29uZmlnLm1vbml0b3JpbmcuZGV0YWlsZWRNb25pdG9yaW5nLFxuICAgICAgZW5hYmxlRmFyZ2F0ZUNhcGFjaXR5UHJvdmlkZXJzOiB0cnVlLFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIHNlY3VyZSBjb250YWluZXIgY29uc3RydWN0XG4gICAgY29uc3Qgc2VjdXJlQ29udGFpbmVyID0gbmV3IFNlY3VyZUNvbnRhaW5lcih0aGlzLCAnU2VjdXJlQ29udGFpbmVyJywge1xuICAgICAgZW52aXJvbm1lbnQ6IGVudmlyb25tZW50LFxuICAgICAgY2x1c3RlcjogdGhpcy5lY3NDbHVzdGVyIGFzIGVjcy5JQ2x1c3RlcixcbiAgICAgIGVjclJlcG9zaXRvcnk6IGVjclJlcG9zaXRvcnksXG4gICAgICBrbXNLZXk6IGttc0tleSxcbiAgICAgIGV4ZWN1dGlvblJvbGU6IGV4ZWN1dGlvblJvbGUsXG4gICAgICB0YXNrUm9sZTogdGFza1JvbGUsXG4gICAgICBzZWNyZXQ6IHNlY3JldCxcbiAgICAgIGNwdTogc3RhZ2luZ0NvbmZpZy5lY3MuY3B1LFxuICAgICAgbWVtb3J5OiBzdGFnaW5nQ29uZmlnLmVjcy5tZW1vcnksXG4gICAgICBjb250YWluZXJQb3J0OiAzMDAwLFxuICAgICAgZW52aXJvbm1lbnRWYXJpYWJsZXM6IHtcbiAgICAgICAgRU5WSVJPTk1FTlQ6IGVudmlyb25tZW50LFxuICAgICAgICBORVhUX1BVQkxJQ19BUFBfVVJMOiBgaHR0cHM6Ly8ke3N0YWdpbmdDb25maWcuZG9tYWlufWAsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIHRhcmdldCBncm91cCBmb3Igc3RhZ2luZ1xuICAgIHRoaXMudGFyZ2V0R3JvdXAgPSBuZXcgZWxidjIuQXBwbGljYXRpb25UYXJnZXRHcm91cCh0aGlzLCAnU3RhZ2luZ1RhcmdldEdyb3VwJywge1xuICAgICAgdGFyZ2V0R3JvdXBOYW1lOiAnYmNvcy1zdGFnaW5nLXRnJyxcbiAgICAgIHZwYzogdnBjLFxuICAgICAgcG9ydDogMzAwMCxcbiAgICAgIHByb3RvY29sOiBlbGJ2Mi5BcHBsaWNhdGlvblByb3RvY29sLkhUVFAsXG4gICAgICB0YXJnZXRUeXBlOiBlbGJ2Mi5UYXJnZXRUeXBlLklQLFxuICAgICAgaGVhbHRoQ2hlY2s6IHtcbiAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgcGF0aDogJy9oZWFsdGgnLFxuICAgICAgICBwcm90b2NvbDogZWxidjIuUHJvdG9jb2wuSFRUUCxcbiAgICAgICAgcG9ydDogJzMwMDAnLFxuICAgICAgICBpbnRlcnZhbDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygxMCksXG4gICAgICAgIGhlYWx0aHlUaHJlc2hvbGRDb3VudDogMixcbiAgICAgICAgdW5oZWFsdGh5VGhyZXNob2xkQ291bnQ6IDUsXG4gICAgICAgIGhlYWx0aHlIdHRwQ29kZXM6ICcyMDAnLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBFQ1MgRmFyZ2F0ZSBTZXJ2aWNlXG4gICAgdGhpcy5lY3NTZXJ2aWNlID0gbmV3IGVjcy5GYXJnYXRlU2VydmljZSh0aGlzLCAnU3RhZ2luZ1NlcnZpY2UnLCB7XG4gICAgICBzZXJ2aWNlTmFtZTogc3RhZ2luZ0NvbmZpZy5lY3Muc2VydmljZU5hbWUsXG4gICAgICBjbHVzdGVyOiB0aGlzLmVjc0NsdXN0ZXIgYXMgZWNzLklDbHVzdGVyLFxuICAgICAgdGFza0RlZmluaXRpb246IHNlY3VyZUNvbnRhaW5lci50YXNrRGVmaW5pdGlvbixcbiAgICAgIGRlc2lyZWRDb3VudDogc3RhZ2luZ0NvbmZpZy5lY3MuZGVzaXJlZENvdW50LFxuICAgICAgbWluSGVhbHRoeVBlcmNlbnQ6IDUwLFxuICAgICAgbWF4SGVhbHRoeVBlcmNlbnQ6IDIwMCxcbiAgICAgIHZwY1N1Ym5ldHM6IHtcbiAgICAgICAgc3VibmV0VHlwZTogY2RrLmF3c19lYzIuU3VibmV0VHlwZS5QUklWQVRFX1dJVEhfRUdSRVNTLFxuICAgICAgfSxcbiAgICAgIHNlY3VyaXR5R3JvdXBzOiBbZWNzU2VjdXJpdHlHcm91cF0sXG4gICAgICBhc3NpZ25QdWJsaWNJcDogZmFsc2UsXG4gICAgICBoZWFsdGhDaGVja0dyYWNlUGVyaW9kOiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMDApLCAvLyBMb25nZXIgZ3JhY2UgcGVyaW9kXG4gICAgICAvLyBjaXJjdWl0QnJlYWtlcjoge1xuICAgICAgLy8gICByb2xsYmFjazogdHJ1ZSxcbiAgICAgIC8vIH0sIC8vIERpc2FibGVkIHRlbXBvcmFyaWx5IGZvciBpbml0aWFsIGRlcGxveW1lbnRcbiAgICB9KTtcblxuICAgIC8vIEFzc29jaWF0ZSBzZXJ2aWNlIHdpdGggdGFyZ2V0IGdyb3VwXG4gICAgdGhpcy5lY3NTZXJ2aWNlLmF0dGFjaFRvQXBwbGljYXRpb25UYXJnZXRHcm91cCh0aGlzLnRhcmdldEdyb3VwKTtcblxuICAgIC8vIEFkZCBsaXN0ZW5lciBydWxlIGZvciBzdGFnaW5nIHN1YmRvbWFpblxuICAgIG5ldyBlbGJ2Mi5BcHBsaWNhdGlvbkxpc3RlbmVyUnVsZSh0aGlzLCAnU3RhZ2luZ0xpc3RlbmVyUnVsZScsIHtcbiAgICAgIGxpc3RlbmVyOiBodHRwc0xpc3RlbmVyLFxuICAgICAgcHJpb3JpdHk6IDEwMCxcbiAgICAgIGNvbmRpdGlvbnM6IFtlbGJ2Mi5MaXN0ZW5lckNvbmRpdGlvbi5ob3N0SGVhZGVycyhbc3RhZ2luZ0NvbmZpZy5kb21haW5dKV0sXG4gICAgICBhY3Rpb246IGVsYnYyLkxpc3RlbmVyQWN0aW9uLmZvcndhcmQoW3RoaXMudGFyZ2V0R3JvdXBdKSxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBSb3V0ZTUzIHJlY29yZCBmb3Igc3RhZ2luZyBkb21haW5cbiAgICBuZXcgcm91dGU1My5BUmVjb3JkKHRoaXMsICdTdGFnaW5nQVJlY29yZCcsIHtcbiAgICAgIHpvbmU6IGhvc3RlZFpvbmUsXG4gICAgICByZWNvcmROYW1lOiAnc3RhZ2luZycsXG4gICAgICB0YXJnZXQ6IHJvdXRlNTMuUmVjb3JkVGFyZ2V0LmZyb21BbGlhcyhcbiAgICAgICAgbmV3IHJvdXRlNTN0YXJnZXRzLkxvYWRCYWxhbmNlclRhcmdldChsb2FkQmFsYW5jZXIpXG4gICAgICApLFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIFdBRiBwcm90ZWN0aW9uXG4gICAgdGhpcy53YWZQcm90ZWN0aW9uID0gbmV3IFdhZlByb3RlY3Rpb24odGhpcywgJ1dBRlByb3RlY3Rpb24nLCB7XG4gICAgICBlbnZpcm9ubWVudDogZW52aXJvbm1lbnQsXG4gICAgICBrbXNLZXk6IGttc0tleSxcbiAgICAgIHJhdGVMaW1pdFBlcklQOiBzdGFnaW5nQ29uZmlnLndhZi5yYXRlTGltaXRQZXJJUCxcbiAgICAgIGVuYWJsZUdlb0Jsb2NraW5nOiBmYWxzZSxcbiAgICAgIGVuYWJsZU1hbmFnZWRSdWxlczogdHJ1ZSxcbiAgICB9KTtcblxuICAgIC8vIEFzc29jaWF0ZSBXQUYgd2l0aCBsb2FkIGJhbGFuY2VyXG4gICAgdGhpcy53YWZQcm90ZWN0aW9uLmFzc29jaWF0ZVdpdGhMb2FkQmFsYW5jZXIoYWxiQXJuKTtcblxuICAgIC8vIENyZWF0ZSBtb25pdG9yaW5nXG4gICAgdGhpcy5tb25pdG9yaW5nID0gbmV3IE1vbml0b3JpbmcodGhpcywgJ01vbml0b3JpbmcnLCB7XG4gICAgICBlbnZpcm9ubWVudDogZW52aXJvbm1lbnQsXG4gICAgICBrbXNLZXk6IGttc0tleSxcbiAgICAgIGVjc1NlcnZpY2U6IHRoaXMuZWNzU2VydmljZSxcbiAgICAgIGVjc0NsdXN0ZXI6IHRoaXMuZWNzQ2x1c3RlciBhcyBlY3MuSUNsdXN0ZXIsXG4gICAgICBsb2FkQmFsYW5jZXI6IGxvYWRCYWxhbmNlcixcbiAgICAgIHRhcmdldEdyb3VwOiB0aGlzLnRhcmdldEdyb3VwLFxuICAgICAgbG9nR3JvdXA6IHNlY3VyZUNvbnRhaW5lci5sb2dHcm91cCxcbiAgICAgIGFsZXJ0RW1haWxzOiBbJ2Rldm9wc0BiZW5kY2FyZS5jb20nXSwgLy8gUmVwbGFjZSB3aXRoIGFjdHVhbCBlbWFpbFxuICAgICAgZW5hYmxlRGV0YWlsZWRNb25pdG9yaW5nOiBzdGFnaW5nQ29uZmlnLm1vbml0b3JpbmcuZGV0YWlsZWRNb25pdG9yaW5nLFxuICAgIH0pO1xuXG4gICAgLy8gQ29uZmlndXJlIGF1dG8gc2NhbGluZyAoaWYgZW5hYmxlZClcbiAgICBpZiAoc3RhZ2luZ0NvbmZpZy5lY3MuYXV0b1NjYWxpbmcuZW5hYmxlZCkge1xuICAgICAgY29uc3Qgc2NhbGFibGVUYXJnZXQgPSBuZXcgYXBwbGljYXRpb25hdXRvc2NhbGluZy5TY2FsYWJsZVRhcmdldCh0aGlzLCAnU3RhZ2luZ1NjYWxhYmxlVGFyZ2V0Jywge1xuICAgICAgICBzZXJ2aWNlTmFtZXNwYWNlOiBhcHBsaWNhdGlvbmF1dG9zY2FsaW5nLlNlcnZpY2VOYW1lc3BhY2UuRUNTLFxuICAgICAgICBzY2FsYWJsZURpbWVuc2lvbjogJ2VjczpzZXJ2aWNlOkRlc2lyZWRDb3VudCcsXG4gICAgICAgIHJlc291cmNlSWQ6IGBzZXJ2aWNlLyR7dGhpcy5lY3NDbHVzdGVyLmNsdXN0ZXJOYW1lfS8ke3RoaXMuZWNzU2VydmljZS5zZXJ2aWNlTmFtZX1gLFxuICAgICAgICBtaW5DYXBhY2l0eTogc3RhZ2luZ0NvbmZpZy5lY3MuYXV0b1NjYWxpbmcubWluQ2FwYWNpdHksXG4gICAgICAgIG1heENhcGFjaXR5OiBzdGFnaW5nQ29uZmlnLmVjcy5hdXRvU2NhbGluZy5tYXhDYXBhY2l0eSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBDUFUtYmFzZWQgc2NhbGluZ1xuICAgICAgc2NhbGFibGVUYXJnZXQuc2NhbGVUb1RyYWNrTWV0cmljKCdTdGFnaW5nQ1BVU2NhbGluZycsIHtcbiAgICAgICAgdGFyZ2V0VmFsdWU6IHN0YWdpbmdDb25maWcuZWNzLmF1dG9TY2FsaW5nLnRhcmdldENwdVV0aWxpemF0aW9uLFxuICAgICAgICBwcmVkZWZpbmVkTWV0cmljOiBhcHBsaWNhdGlvbmF1dG9zY2FsaW5nLlByZWRlZmluZWRNZXRyaWMuRUNTX1NFUlZJQ0VfQVZFUkFHRV9DUFVfVVRJTElaQVRJT04sXG4gICAgICAgIHNjYWxlT3V0Q29vbGRvd246IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwMCksXG4gICAgICAgIHNjYWxlSW5Db29sZG93bjogY2RrLkR1cmF0aW9uLnNlY29uZHMoNjAwKSxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIEFwcGx5IHRhZ3NcbiAgICBPYmplY3QuZW50cmllcyhzdGFnaW5nQ29uZmlnLnRhZ3MpLmZvckVhY2goKFtrZXksIHZhbHVlXSkgPT4ge1xuICAgICAgY2RrLlRhZ3Mub2YodGhpcykuYWRkKGtleSwgdmFsdWUpO1xuICAgIH0pO1xuXG4gICAgLy8gU3RhY2sgb3V0cHV0c1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdTdGFnaW5nQ2x1c3Rlck5hbWUnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5lY3NDbHVzdGVyLmNsdXN0ZXJOYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdTdGFnaW5nIEVDUyBDbHVzdGVyIE5hbWUnLFxuICAgICAgZXhwb3J0TmFtZTogJ0JDT1MtU3RhZ2luZy1DbHVzdGVyTmFtZScsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnU3RhZ2luZ1NlcnZpY2VOYW1lJywge1xuICAgICAgdmFsdWU6IHRoaXMuZWNzU2VydmljZS5zZXJ2aWNlTmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU3RhZ2luZyBFQ1MgU2VydmljZSBOYW1lJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdCQ09TLVN0YWdpbmctU2VydmljZU5hbWUnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1N0YWdpbmdVUkwnLCB7XG4gICAgICB2YWx1ZTogYGh0dHBzOi8vJHtzdGFnaW5nQ29uZmlnLmRvbWFpbn1gLFxuICAgICAgZGVzY3JpcHRpb246ICdTdGFnaW5nIEFwcGxpY2F0aW9uIFVSTCcsXG4gICAgICBleHBvcnROYW1lOiAnQkNPUy1TdGFnaW5nLVVSTCcsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnU3RhZ2luZ1RhcmdldEdyb3VwQXJuJywge1xuICAgICAgdmFsdWU6IHRoaXMudGFyZ2V0R3JvdXAudGFyZ2V0R3JvdXBBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ1N0YWdpbmcgVGFyZ2V0IEdyb3VwIEFSTicsXG4gICAgICBleHBvcnROYW1lOiAnQkNPUy1TdGFnaW5nLVRhcmdldEdyb3VwQXJuJyxcbiAgICB9KTtcbiAgfVxufVxuIl19