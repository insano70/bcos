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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhZ2luZy1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInN0YWdpbmctc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLHlEQUEyQztBQUMzQyw4RUFBZ0U7QUFDaEUsaUVBQW1EO0FBQ25ELGdGQUFrRTtBQUNsRSwrRkFBaUY7QUFJakYscUVBQWlFO0FBQ2pFLGlFQUE2RDtBQUM3RCx5REFBc0Q7QUFDdEQsNkVBQXNEO0FBTXRELE1BQWEsWUFBYSxTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQ3pCLFVBQVUsQ0FBYztJQUN4QixVQUFVLENBQXFCO0lBQy9CLFdBQVcsQ0FBK0I7SUFDMUMsYUFBYSxDQUFnQjtJQUM3QixVQUFVLENBQWE7SUFFdkMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUF3QjtRQUNoRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixNQUFNLFdBQVcsR0FBRyxTQUFTLENBQUM7UUFFOUIsa0RBQWtEO1FBQ2xELE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQyxJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDO1FBQ3JFLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNYLE1BQU0sSUFBSSxLQUFLLENBQUMsNkRBQTZELENBQUMsQ0FBQztRQUNqRixDQUFDO1FBRUQsa0NBQWtDO1FBQ2xDLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxJQUFJLEVBQUUsS0FBSyxFQUFFO1lBQ2xELEtBQUssRUFBRSxLQUFLO1NBQ2IsQ0FBQyxDQUFDO1FBRUgsa0dBQWtHO1FBQ2xHLE1BQU0sU0FBUyxHQUFHLDZFQUE2RSxDQUFDO1FBQ2hHLE1BQU0sZ0JBQWdC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RSxLQUFLLENBQUMsRUFBRSxFQUFFO1lBQzFELEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDcEMsQ0FBQyxDQUFDLENBQUM7UUFFSCxnQkFBZ0I7UUFDaEIsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxvQkFBb0IsRUFBRTtZQUM1QyxLQUFLLEVBQUUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxXQUFXO1lBQ2xDLFdBQVcsRUFBRSwwQkFBMEI7WUFDdkMsVUFBVSxFQUFFLDBCQUEwQjtTQUN2QyxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLG9CQUFvQixFQUFFO1lBQzVDLEtBQUssRUFBRSxJQUFJLENBQUMsVUFBVSxDQUFDLFdBQVc7WUFDbEMsV0FBVyxFQUFFLDBCQUEwQjtZQUN2QyxVQUFVLEVBQUUsMEJBQTBCO1NBQ3ZDLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsWUFBWSxFQUFFO1lBQ3BDLEtBQUssRUFBRSxXQUFXLHNCQUFhLENBQUMsTUFBTSxFQUFFO1lBQ3hDLFdBQVcsRUFBRSx5QkFBeUI7WUFDdEMsVUFBVSxFQUFFLGtCQUFrQjtTQUMvQixDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLHVCQUF1QixFQUFFO1lBQy9DLEtBQUssRUFBRSxJQUFJLENBQUMsV0FBVyxDQUFDLGNBQWM7WUFDdEMsV0FBVyxFQUFFLDBCQUEwQjtZQUN2QyxVQUFVLEVBQUUsNkJBQTZCO1NBQzFDLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQXpPRCxvQ0F5T0MiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0ICogYXMgZWNzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lY3MnO1xuaW1wb3J0ICogYXMgZWxidjIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVsYXN0aWNsb2FkYmFsYW5jaW5ndjInO1xuaW1wb3J0ICogYXMgcm91dGU1MyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtcm91dGU1Myc7XG5pbXBvcnQgKiBhcyByb3V0ZTUzdGFyZ2V0cyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtcm91dGU1My10YXJnZXRzJztcbmltcG9ydCAqIGFzIGFwcGxpY2F0aW9uYXV0b3NjYWxpbmcgZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwcGxpY2F0aW9uYXV0b3NjYWxpbmcnO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgeyBTZWN1cml0eVN0YWNrIH0gZnJvbSAnLi9zZWN1cml0eS1zdGFjayc7XG5pbXBvcnQgeyBOZXR3b3JrU3RhY2sgfSBmcm9tICcuL25ldHdvcmstc3RhY2snO1xuaW1wb3J0IHsgU2VjdXJlQ29udGFpbmVyIH0gZnJvbSAnLi4vY29uc3RydWN0cy9zZWN1cmUtY29udGFpbmVyJztcbmltcG9ydCB7IFdhZlByb3RlY3Rpb24gfSBmcm9tICcuLi9jb25zdHJ1Y3RzL3dhZi1wcm90ZWN0aW9uJztcbmltcG9ydCB7IE1vbml0b3JpbmcgfSBmcm9tICcuLi9jb25zdHJ1Y3RzL21vbml0b3JpbmcnO1xuaW1wb3J0IHN0YWdpbmdDb25maWcgZnJvbSAnLi4vLi4vY29uZmlnL3N0YWdpbmcuanNvbic7XG5cbmludGVyZmFjZSBTdGFnaW5nU3RhY2tQcm9wcyBleHRlbmRzIGNkay5TdGFja1Byb3BzIHtcbiAgLy8gTm8gZGlyZWN0IHJlZmVyZW5jZXMgLSB1c2UgQ0RLIG91dHB1dHMvaW1wb3J0cyBpbnN0ZWFkXG59XG5cbmV4cG9ydCBjbGFzcyBTdGFnaW5nU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBwdWJsaWMgcmVhZG9ubHkgZWNzQ2x1c3RlcjogZWNzLkNsdXN0ZXI7XG4gIHB1YmxpYyByZWFkb25seSBlY3NTZXJ2aWNlOiBlY3MuRmFyZ2F0ZVNlcnZpY2U7XG4gIHB1YmxpYyByZWFkb25seSB0YXJnZXRHcm91cDogZWxidjIuQXBwbGljYXRpb25UYXJnZXRHcm91cDtcbiAgcHVibGljIHJlYWRvbmx5IHdhZlByb3RlY3Rpb246IFdhZlByb3RlY3Rpb247XG4gIHB1YmxpYyByZWFkb25seSBtb25pdG9yaW5nOiBNb25pdG9yaW5nO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBTdGFnaW5nU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgY29uc3QgZW52aXJvbm1lbnQgPSAnc3RhZ2luZyc7XG5cbiAgICAvLyBHZXQgVlBDIElEIGZyb20gY29udGV4dCBvciBlbnZpcm9ubWVudCB2YXJpYWJsZVxuICAgIGNvbnN0IHZwY0lkID0gdGhpcy5ub2RlLnRyeUdldENvbnRleHQoJ3ZwY0lkJykgfHwgcHJvY2Vzcy5lbnYuVlBDX0lEO1xuICAgIGlmICghdnBjSWQpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignVlBDX0lEIG11c3QgYmUgcHJvdmlkZWQgdmlhIGNvbnRleHQgb3IgZW52aXJvbm1lbnQgdmFyaWFibGUnKTtcbiAgICB9XG5cbiAgICAvLyBMb29rIHVwIFZQQyB1c2luZyBjb250ZXh0IHZhbHVlXG4gICAgY29uc3QgdnBjID0gY2RrLmF3c19lYzIuVnBjLmZyb21Mb29rdXAodGhpcywgJ1ZQQycsIHtcbiAgICAgIHZwY0lkOiB2cGNJZCxcbiAgICB9KTtcblxuICAgIC8vIFVzZSBoYXJkY29kZWQgdmFsdWVzIGZyb20gdGhlIGRlcGxveWVkIHN0YWNrcyBmb3Igbm93ICh0byBhdm9pZCBDbG91ZEZvcm1hdGlvbiBmdW5jdGlvbiBpc3N1ZXMpXG4gICAgY29uc3Qga21zS2V5QXJuID0gJ2Fybjphd3M6a21zOnVzLWVhc3QtMTo4NTQ0Mjg5NDQ0NDA6a2V5LzFkNTY0MTZiLWIwZGEtNGY5YS04YmYzLTc1MTdiN2QwNjZjMic7XG4gICAgY29uc3QgZWNyUmVwb3NpdG9yeUFybiA9ICdhcm46YXdzOmVjcjp1cy1lYXN0LTE6ODU0NDI4OTQ0NDQwOnJlcG9zaXRvcnkvYmNvcyc7XG4gICAgY29uc3QgZWNzVGFza0V4ZWN1dGlvblJvbGVBcm4gPSAnYXJuOmF3czppYW06Ojg1NDQyODk0NDQ0MDpyb2xlL0JDT1MtRUNTVGFza0V4ZWN1dGlvblJvbGUnO1xuICAgIGNvbnN0IGVjc1Rhc2tSb2xlQXJuID0gJ2Fybjphd3M6aWFtOjo4NTQ0Mjg5NDQ0NDA6cm9sZS9CQ09TLUVDU1Rhc2tSb2xlJztcbiAgICBjb25zdCBzdGFnaW5nU2VjcmV0QXJuID0gJ2Fybjphd3M6c2VjcmV0c21hbmFnZXI6dXMtZWFzdC0xOjg1NDQyODk0NDQ0MDpzZWNyZXQ6c3RhZ2luZy9iY29zLXNlY3JldHMtdkRtQ203JztcbiAgICBjb25zdCBhbGJBcm4gPSAnYXJuOmF3czplbGFzdGljbG9hZGJhbGFuY2luZzp1cy1lYXN0LTE6ODU0NDI4OTQ0NDQwOmxvYWRiYWxhbmNlci9hcHAvQkNPUy1OLUFwcGxpLXJJbzRidGZDUVJaai9hYzY3NDQyNjRhNmIxMjM5JztcbiAgICBjb25zdCBhbGJEbnNOYW1lID0gJ0JDT1MtTi1BcHBsaS1ySW80YnRmQ1FSWmotNDAxNTY0NDIwLnVzLWVhc3QtMS5lbGIuYW1hem9uYXdzLmNvbSc7XG4gICAgY29uc3QgYWxiQ2Fub25pY2FsSG9zdGVkWm9uZUlkID0gJ1ozNVNYRE9UUlE3WDdLJztcbiAgICBjb25zdCBodHRwc0xpc3RlbmVyQXJuID0gJ2Fybjphd3M6ZWxhc3RpY2xvYWRiYWxhbmNpbmc6dXMtZWFzdC0xOjg1NDQyODk0NDQ0MDpsaXN0ZW5lci9hcHAvQkNPUy1OLUFwcGxpLXJJbzRidGZDUVJaai9hYzY3NDQyNjRhNmIxMjM5LzkzOTYyMDg5ZTBiYWQ1MTAnO1xuICAgIGNvbnN0IGhvc3RlZFpvbmVJZCA9ICdaMDU5NjExMDJUVklWRVNLUTRHQUwnO1xuICAgIGNvbnN0IGVjc1NlY3VyaXR5R3JvdXBJZCA9ICdzZy0wMWZhMGVlOTM5NjNiZDYxNCc7XG5cbiAgICAvLyBJbXBvcnQgS01TIGtleVxuICAgIGNvbnN0IGttc0tleSA9IGNkay5hd3Nfa21zLktleS5mcm9tS2V5QXJuKHRoaXMsICdLTVNLZXknLCBrbXNLZXlBcm4pO1xuXG4gICAgLy8gSW1wb3J0IEVDUiByZXBvc2l0b3J5IHVzaW5nIGF0dHJpYnV0ZXMgKHJlcXVpcmVkIGZvciB0b2tlbnMpXG4gICAgY29uc3QgZWNyUmVwb3NpdG9yeSA9IGNkay5hd3NfZWNyLlJlcG9zaXRvcnkuZnJvbVJlcG9zaXRvcnlBdHRyaWJ1dGVzKHRoaXMsICdFQ1JSZXBvc2l0b3J5Jywge1xuICAgICAgcmVwb3NpdG9yeUFybjogZWNyUmVwb3NpdG9yeUFybixcbiAgICAgIHJlcG9zaXRvcnlOYW1lOiAnYmNvcycsXG4gICAgfSk7XG5cbiAgICAvLyBJbXBvcnQgSUFNIHJvbGVzXG4gICAgY29uc3QgZXhlY3V0aW9uUm9sZSA9IGNkay5hd3NfaWFtLlJvbGUuZnJvbVJvbGVBcm4odGhpcywgJ0V4ZWN1dGlvblJvbGUnLCBlY3NUYXNrRXhlY3V0aW9uUm9sZUFybik7XG4gICAgY29uc3QgdGFza1JvbGUgPSBjZGsuYXdzX2lhbS5Sb2xlLmZyb21Sb2xlQXJuKHRoaXMsICdUYXNrUm9sZScsIGVjc1Rhc2tSb2xlQXJuKTtcblxuICAgIC8vIEltcG9ydCBzZWNyZXRcbiAgICBjb25zdCBzZWNyZXQgPSBjZGsuYXdzX3NlY3JldHNtYW5hZ2VyLlNlY3JldC5mcm9tU2VjcmV0Q29tcGxldGVBcm4odGhpcywgJ1NlY3JldCcsIHN0YWdpbmdTZWNyZXRBcm4pO1xuXG4gICAgLy8gSW1wb3J0IGxvYWQgYmFsYW5jZXIgYW5kIGxpc3RlbmVyXG4gICAgY29uc3QgbG9hZEJhbGFuY2VyID0gY2RrLmF3c19lbGFzdGljbG9hZGJhbGFuY2luZ3YyLkFwcGxpY2F0aW9uTG9hZEJhbGFuY2VyLmZyb21BcHBsaWNhdGlvbkxvYWRCYWxhbmNlckF0dHJpYnV0ZXModGhpcywgJ0xvYWRCYWxhbmNlcicsIHtcbiAgICAgIGxvYWRCYWxhbmNlckFybjogYWxiQXJuLFxuICAgICAgbG9hZEJhbGFuY2VyRG5zTmFtZTogYWxiRG5zTmFtZSxcbiAgICAgIGxvYWRCYWxhbmNlckNhbm9uaWNhbEhvc3RlZFpvbmVJZDogYWxiQ2Fub25pY2FsSG9zdGVkWm9uZUlkLFxuICAgICAgc2VjdXJpdHlHcm91cElkOiBlY3NTZWN1cml0eUdyb3VwSWQsXG4gICAgfSk7XG5cbiAgICBjb25zdCBodHRwc0xpc3RlbmVyID0gY2RrLmF3c19lbGFzdGljbG9hZGJhbGFuY2luZ3YyLkFwcGxpY2F0aW9uTGlzdGVuZXIuZnJvbUFwcGxpY2F0aW9uTGlzdGVuZXJBdHRyaWJ1dGVzKHRoaXMsICdIVFRQU0xpc3RlbmVyJywge1xuICAgICAgbGlzdGVuZXJBcm46IGh0dHBzTGlzdGVuZXJBcm4sXG4gICAgICBzZWN1cml0eUdyb3VwOiBjZGsuYXdzX2VjMi5TZWN1cml0eUdyb3VwLmZyb21TZWN1cml0eUdyb3VwSWQodGhpcywgJ0FMQlNlY3VyaXR5R3JvdXAnLCBlY3NTZWN1cml0eUdyb3VwSWQpLFxuICAgIH0pO1xuXG4gICAgLy8gSW1wb3J0IGhvc3RlZCB6b25lIHVzaW5nIGF0dHJpYnV0ZXMgKHByb3ZpZGVzIHpvbmVOYW1lKVxuICAgIGNvbnN0IGhvc3RlZFpvbmUgPSBjZGsuYXdzX3JvdXRlNTMuSG9zdGVkWm9uZS5mcm9tSG9zdGVkWm9uZUF0dHJpYnV0ZXModGhpcywgJ0hvc3RlZFpvbmUnLCB7XG4gICAgICBob3N0ZWRab25lSWQ6IGhvc3RlZFpvbmVJZCxcbiAgICAgIHpvbmVOYW1lOiAnYmVuZGNhcmUuY29tJyxcbiAgICB9KTtcblxuICAgIC8vIEltcG9ydCBFQ1Mgc2VjdXJpdHkgZ3JvdXBcbiAgICBjb25zdCBlY3NTZWN1cml0eUdyb3VwID0gY2RrLmF3c19lYzIuU2VjdXJpdHlHcm91cC5mcm9tU2VjdXJpdHlHcm91cElkKHRoaXMsICdFQ1NTZWN1cml0eUdyb3VwJywgZWNzU2VjdXJpdHlHcm91cElkKTtcblxuICAgIC8vIENyZWF0ZSBFQ1MgQ2x1c3RlclxuICAgIHRoaXMuZWNzQ2x1c3RlciA9IG5ldyBlY3MuQ2x1c3Rlcih0aGlzLCAnU3RhZ2luZ0NsdXN0ZXInLCB7XG4gICAgICBjbHVzdGVyTmFtZTogc3RhZ2luZ0NvbmZpZy5lY3MuY2x1c3Rlck5hbWUsXG4gICAgICB2cGM6IHZwYyxcbiAgICAgIGNvbnRhaW5lckluc2lnaHRzOiBzdGFnaW5nQ29uZmlnLm1vbml0b3JpbmcuZGV0YWlsZWRNb25pdG9yaW5nLFxuICAgICAgZW5hYmxlRmFyZ2F0ZUNhcGFjaXR5UHJvdmlkZXJzOiB0cnVlLFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIHNlY3VyZSBjb250YWluZXIgY29uc3RydWN0XG4gICAgY29uc3Qgc2VjdXJlQ29udGFpbmVyID0gbmV3IFNlY3VyZUNvbnRhaW5lcih0aGlzLCAnU2VjdXJlQ29udGFpbmVyJywge1xuICAgICAgZW52aXJvbm1lbnQ6IGVudmlyb25tZW50LFxuICAgICAgY2x1c3RlcjogdGhpcy5lY3NDbHVzdGVyLFxuICAgICAgZWNyUmVwb3NpdG9yeTogZWNyUmVwb3NpdG9yeSxcbiAgICAgIGttc0tleToga21zS2V5LFxuICAgICAgZXhlY3V0aW9uUm9sZTogZXhlY3V0aW9uUm9sZSxcbiAgICAgIHRhc2tSb2xlOiB0YXNrUm9sZSxcbiAgICAgIHNlY3JldDogc2VjcmV0LFxuICAgICAgY3B1OiBzdGFnaW5nQ29uZmlnLmVjcy5jcHUsXG4gICAgICBtZW1vcnk6IHN0YWdpbmdDb25maWcuZWNzLm1lbW9yeSxcbiAgICAgIGNvbnRhaW5lclBvcnQ6IDgwLFxuICAgICAgZW52aXJvbm1lbnRWYXJpYWJsZXM6IHtcbiAgICAgICAgRU5WSVJPTk1FTlQ6IGVudmlyb25tZW50LFxuICAgICAgICBORVhUX1BVQkxJQ19BUFBfVVJMOiBgaHR0cHM6Ly8ke3N0YWdpbmdDb25maWcuZG9tYWlufWAsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIHRhcmdldCBncm91cCBmb3Igc3RhZ2luZ1xuICAgIHRoaXMudGFyZ2V0R3JvdXAgPSBuZXcgZWxidjIuQXBwbGljYXRpb25UYXJnZXRHcm91cCh0aGlzLCAnU3RhZ2luZ1RhcmdldEdyb3VwJywge1xuICAgICAgdGFyZ2V0R3JvdXBOYW1lOiAnYmNvcy1zdGFnaW5nLXRnJyxcbiAgICAgIHZwYzogdnBjLFxuICAgICAgcG9ydDogODAsXG4gICAgICBwcm90b2NvbDogZWxidjIuQXBwbGljYXRpb25Qcm90b2NvbC5IVFRQLFxuICAgICAgdGFyZ2V0VHlwZTogZWxidjIuVGFyZ2V0VHlwZS5JUCxcbiAgICAgIGhlYWx0aENoZWNrOiB7XG4gICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICAgIHBhdGg6ICcvaGVhbHRoJyxcbiAgICAgICAgcHJvdG9jb2w6IGVsYnYyLlByb3RvY29sLkhUVFAsXG4gICAgICAgIHBvcnQ6ICc4MCcsXG4gICAgICAgIGludGVydmFsOiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDEwKSxcbiAgICAgICAgaGVhbHRoeVRocmVzaG9sZENvdW50OiAyLFxuICAgICAgICB1bmhlYWx0aHlUaHJlc2hvbGRDb3VudDogNSxcbiAgICAgICAgaGVhbHRoeUh0dHBDb2RlczogJzIwMCcsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIEVDUyBGYXJnYXRlIFNlcnZpY2VcbiAgICB0aGlzLmVjc1NlcnZpY2UgPSBuZXcgZWNzLkZhcmdhdGVTZXJ2aWNlKHRoaXMsICdTdGFnaW5nU2VydmljZScsIHtcbiAgICAgIHNlcnZpY2VOYW1lOiBzdGFnaW5nQ29uZmlnLmVjcy5zZXJ2aWNlTmFtZSxcbiAgICAgIGNsdXN0ZXI6IHRoaXMuZWNzQ2x1c3RlcixcbiAgICAgIHRhc2tEZWZpbml0aW9uOiBzZWN1cmVDb250YWluZXIudGFza0RlZmluaXRpb24sXG4gICAgICBkZXNpcmVkQ291bnQ6IHN0YWdpbmdDb25maWcuZWNzLmRlc2lyZWRDb3VudCxcbiAgICAgIG1pbkhlYWx0aHlQZXJjZW50OiA1MCxcbiAgICAgIG1heEhlYWx0aHlQZXJjZW50OiAyMDAsXG4gICAgICB2cGNTdWJuZXRzOiB7XG4gICAgICAgIHN1Ym5ldFR5cGU6IGNkay5hd3NfZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9XSVRIX0VHUkVTUyxcbiAgICAgIH0sXG4gICAgICBzZWN1cml0eUdyb3VwczogW2Vjc1NlY3VyaXR5R3JvdXBdLFxuICAgICAgYXNzaWduUHVibGljSXA6IGZhbHNlLFxuICAgICAgaGVhbHRoQ2hlY2tHcmFjZVBlcmlvZDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzAwKSwgLy8gTG9uZ2VyIGdyYWNlIHBlcmlvZFxuICAgICAgLy8gY2lyY3VpdEJyZWFrZXI6IHtcbiAgICAgIC8vICAgcm9sbGJhY2s6IHRydWUsXG4gICAgICAvLyB9LCAvLyBEaXNhYmxlZCB0ZW1wb3JhcmlseSBmb3IgaW5pdGlhbCBkZXBsb3ltZW50XG4gICAgfSk7XG5cbiAgICAvLyBBc3NvY2lhdGUgc2VydmljZSB3aXRoIHRhcmdldCBncm91cFxuICAgIHRoaXMuZWNzU2VydmljZS5hdHRhY2hUb0FwcGxpY2F0aW9uVGFyZ2V0R3JvdXAodGhpcy50YXJnZXRHcm91cCk7XG5cbiAgICAvLyBBZGQgbGlzdGVuZXIgcnVsZSBmb3Igc3RhZ2luZyBzdWJkb21haW5cbiAgICBuZXcgZWxidjIuQXBwbGljYXRpb25MaXN0ZW5lclJ1bGUodGhpcywgJ1N0YWdpbmdMaXN0ZW5lclJ1bGUnLCB7XG4gICAgICBsaXN0ZW5lcjogaHR0cHNMaXN0ZW5lcixcbiAgICAgIHByaW9yaXR5OiAxMDAsXG4gICAgICBjb25kaXRpb25zOiBbZWxidjIuTGlzdGVuZXJDb25kaXRpb24uaG9zdEhlYWRlcnMoW3N0YWdpbmdDb25maWcuZG9tYWluXSldLFxuICAgICAgYWN0aW9uOiBlbGJ2Mi5MaXN0ZW5lckFjdGlvbi5mb3J3YXJkKFt0aGlzLnRhcmdldEdyb3VwXSksXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgUm91dGU1MyByZWNvcmQgZm9yIHN0YWdpbmcgZG9tYWluXG4gICAgbmV3IHJvdXRlNTMuQVJlY29yZCh0aGlzLCAnU3RhZ2luZ0FSZWNvcmQnLCB7XG4gICAgICB6b25lOiBob3N0ZWRab25lLFxuICAgICAgcmVjb3JkTmFtZTogJ3N0YWdpbmcnLFxuICAgICAgdGFyZ2V0OiByb3V0ZTUzLlJlY29yZFRhcmdldC5mcm9tQWxpYXMoXG4gICAgICAgIG5ldyByb3V0ZTUzdGFyZ2V0cy5Mb2FkQmFsYW5jZXJUYXJnZXQobG9hZEJhbGFuY2VyKVxuICAgICAgKSxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBXQUYgcHJvdGVjdGlvblxuICAgIHRoaXMud2FmUHJvdGVjdGlvbiA9IG5ldyBXYWZQcm90ZWN0aW9uKHRoaXMsICdXQUZQcm90ZWN0aW9uJywge1xuICAgICAgZW52aXJvbm1lbnQ6IGVudmlyb25tZW50LFxuICAgICAga21zS2V5OiBrbXNLZXksXG4gICAgICByYXRlTGltaXRQZXJJUDogc3RhZ2luZ0NvbmZpZy53YWYucmF0ZUxpbWl0UGVySVAsXG4gICAgICBlbmFibGVHZW9CbG9ja2luZzogZmFsc2UsXG4gICAgICBlbmFibGVNYW5hZ2VkUnVsZXM6IHRydWUsXG4gICAgfSk7XG5cbiAgICAvLyBBc3NvY2lhdGUgV0FGIHdpdGggbG9hZCBiYWxhbmNlclxuICAgIHRoaXMud2FmUHJvdGVjdGlvbi5hc3NvY2lhdGVXaXRoTG9hZEJhbGFuY2VyKGFsYkFybik7XG5cbiAgICAvLyBDcmVhdGUgbW9uaXRvcmluZ1xuICAgIHRoaXMubW9uaXRvcmluZyA9IG5ldyBNb25pdG9yaW5nKHRoaXMsICdNb25pdG9yaW5nJywge1xuICAgICAgZW52aXJvbm1lbnQ6IGVudmlyb25tZW50LFxuICAgICAga21zS2V5OiBrbXNLZXksXG4gICAgICBlY3NTZXJ2aWNlOiB0aGlzLmVjc1NlcnZpY2UsXG4gICAgICBlY3NDbHVzdGVyOiB0aGlzLmVjc0NsdXN0ZXIsXG4gICAgICBsb2FkQmFsYW5jZXI6IGxvYWRCYWxhbmNlcixcbiAgICAgIHRhcmdldEdyb3VwOiB0aGlzLnRhcmdldEdyb3VwLFxuICAgICAgbG9nR3JvdXA6IHNlY3VyZUNvbnRhaW5lci5sb2dHcm91cCxcbiAgICAgIGFsZXJ0RW1haWxzOiBbJ2Rldm9wc0BiZW5kY2FyZS5jb20nXSwgLy8gUmVwbGFjZSB3aXRoIGFjdHVhbCBlbWFpbFxuICAgICAgZW5hYmxlRGV0YWlsZWRNb25pdG9yaW5nOiBzdGFnaW5nQ29uZmlnLm1vbml0b3JpbmcuZGV0YWlsZWRNb25pdG9yaW5nLFxuICAgIH0pO1xuXG4gICAgLy8gQ29uZmlndXJlIGF1dG8gc2NhbGluZyAoaWYgZW5hYmxlZClcbiAgICBpZiAoc3RhZ2luZ0NvbmZpZy5lY3MuYXV0b1NjYWxpbmcuZW5hYmxlZCkge1xuICAgICAgY29uc3Qgc2NhbGFibGVUYXJnZXQgPSBuZXcgYXBwbGljYXRpb25hdXRvc2NhbGluZy5TY2FsYWJsZVRhcmdldCh0aGlzLCAnU3RhZ2luZ1NjYWxhYmxlVGFyZ2V0Jywge1xuICAgICAgICBzZXJ2aWNlTmFtZXNwYWNlOiBhcHBsaWNhdGlvbmF1dG9zY2FsaW5nLlNlcnZpY2VOYW1lc3BhY2UuRUNTLFxuICAgICAgICBzY2FsYWJsZURpbWVuc2lvbjogJ2VjczpzZXJ2aWNlOkRlc2lyZWRDb3VudCcsXG4gICAgICAgIHJlc291cmNlSWQ6IGBzZXJ2aWNlLyR7dGhpcy5lY3NDbHVzdGVyLmNsdXN0ZXJOYW1lfS8ke3RoaXMuZWNzU2VydmljZS5zZXJ2aWNlTmFtZX1gLFxuICAgICAgICBtaW5DYXBhY2l0eTogc3RhZ2luZ0NvbmZpZy5lY3MuYXV0b1NjYWxpbmcubWluQ2FwYWNpdHksXG4gICAgICAgIG1heENhcGFjaXR5OiBzdGFnaW5nQ29uZmlnLmVjcy5hdXRvU2NhbGluZy5tYXhDYXBhY2l0eSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBDUFUtYmFzZWQgc2NhbGluZ1xuICAgICAgc2NhbGFibGVUYXJnZXQuc2NhbGVUb1RyYWNrTWV0cmljKCdTdGFnaW5nQ1BVU2NhbGluZycsIHtcbiAgICAgICAgdGFyZ2V0VmFsdWU6IHN0YWdpbmdDb25maWcuZWNzLmF1dG9TY2FsaW5nLnRhcmdldENwdVV0aWxpemF0aW9uLFxuICAgICAgICBwcmVkZWZpbmVkTWV0cmljOiBhcHBsaWNhdGlvbmF1dG9zY2FsaW5nLlByZWRlZmluZWRNZXRyaWMuRUNTX1NFUlZJQ0VfQVZFUkFHRV9DUFVfVVRJTElaQVRJT04sXG4gICAgICAgIHNjYWxlT3V0Q29vbGRvd246IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwMCksXG4gICAgICAgIHNjYWxlSW5Db29sZG93bjogY2RrLkR1cmF0aW9uLnNlY29uZHMoNjAwKSxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIEFwcGx5IHRhZ3NcbiAgICBPYmplY3QuZW50cmllcyhzdGFnaW5nQ29uZmlnLnRhZ3MpLmZvckVhY2goKFtrZXksIHZhbHVlXSkgPT4ge1xuICAgICAgY2RrLlRhZ3Mub2YodGhpcykuYWRkKGtleSwgdmFsdWUpO1xuICAgIH0pO1xuXG4gICAgLy8gU3RhY2sgb3V0cHV0c1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdTdGFnaW5nQ2x1c3Rlck5hbWUnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5lY3NDbHVzdGVyLmNsdXN0ZXJOYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdTdGFnaW5nIEVDUyBDbHVzdGVyIE5hbWUnLFxuICAgICAgZXhwb3J0TmFtZTogJ0JDT1MtU3RhZ2luZy1DbHVzdGVyTmFtZScsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnU3RhZ2luZ1NlcnZpY2VOYW1lJywge1xuICAgICAgdmFsdWU6IHRoaXMuZWNzU2VydmljZS5zZXJ2aWNlTmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU3RhZ2luZyBFQ1MgU2VydmljZSBOYW1lJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdCQ09TLVN0YWdpbmctU2VydmljZU5hbWUnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1N0YWdpbmdVUkwnLCB7XG4gICAgICB2YWx1ZTogYGh0dHBzOi8vJHtzdGFnaW5nQ29uZmlnLmRvbWFpbn1gLFxuICAgICAgZGVzY3JpcHRpb246ICdTdGFnaW5nIEFwcGxpY2F0aW9uIFVSTCcsXG4gICAgICBleHBvcnROYW1lOiAnQkNPUy1TdGFnaW5nLVVSTCcsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnU3RhZ2luZ1RhcmdldEdyb3VwQXJuJywge1xuICAgICAgdmFsdWU6IHRoaXMudGFyZ2V0R3JvdXAudGFyZ2V0R3JvdXBBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ1N0YWdpbmcgVGFyZ2V0IEdyb3VwIEFSTicsXG4gICAgICBleHBvcnROYW1lOiAnQkNPUy1TdGFnaW5nLVRhcmdldEdyb3VwQXJuJyxcbiAgICB9KTtcbiAgfVxufVxuIl19