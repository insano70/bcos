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
const production_json_1 = __importDefault(require("../../config/production.json"));
class ProductionStack extends cdk.Stack {
    ecsCluster;
    targetGroup;
    // WAF protection handled by staging WAF on shared ALB
    // ECS service and monitoring created by application deployment
    constructor(scope, id, props) {
        super(scope, id, props);
        const environment = 'production';
        // Ready for deployment with all CloudFormation token issues resolved
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
        // Create ECS Cluster
        this.ecsCluster = new ecs.Cluster(this, 'ProductionCluster', {
            clusterName: production_json_1.default.ecs.clusterName,
            vpc: vpc,
            containerInsights: production_json_1.default.monitoring.detailedMonitoring,
            enableFargateCapacityProviders: true,
        });
        // SecureContainer (task definition) not created in infrastructure - matches actual BCOS-StagingStack behavior
        // Create target group for production
        this.targetGroup = new elbv2.ApplicationTargetGroup(this, 'ProductionTargetGroup', {
            targetGroupName: 'bcos-production-tg',
            vpc: vpc,
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
        // ECS Service not created in infrastructure - matches actual BCOS-StagingStack behavior
        // Set target group as default action for HTTPS listener
        new elbv2.ApplicationListenerRule(this, 'ProductionListenerRule', {
            listener: httpsListener,
            priority: 10, // Higher priority than staging
            conditions: [elbv2.ListenerCondition.hostHeaders([production_json_1.default.domain])],
            action: elbv2.ListenerAction.forward([this.targetGroup]),
        });
        // Skip Route53 A record - app.bendcare.com already exists
        // Skip WAF creation - shared ALB already has staging WAF
        // AWS only allows one WAF Web ACL per load balancer
        // Monitoring not created in infrastructure - matches actual BCOS-StagingStack behavior
        // Auto scaling not created in infrastructure - matches actual BCOS-StagingStack behavior
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
        // ECS Service name will be created by application deployment
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
        // Dashboard will be created by application deployment
    }
}
exports.ProductionStack = ProductionStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvZHVjdGlvbi1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInByb2R1Y3Rpb24tc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLHlEQUEyQztBQUMzQyw4RUFBZ0U7QUFFaEUsbUZBQTREO0FBTTVELE1BQWEsZUFBZ0IsU0FBUSxHQUFHLENBQUMsS0FBSztJQUM1QixVQUFVLENBQWM7SUFDeEIsV0FBVyxDQUErQjtJQUMxRCxzREFBc0Q7SUFDdEQsK0RBQStEO0lBRS9ELFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBMkI7UUFDbkUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxXQUFXLEdBQUcsWUFBWSxDQUFDO1FBQ2pDLHFFQUFxRTtRQUVyRSxrREFBa0Q7UUFDbEQsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDLElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUM7UUFDckUsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ1gsTUFBTSxJQUFJLEtBQUssQ0FBQyw2REFBNkQsQ0FBQyxDQUFDO1FBQ2pGLENBQUM7UUFFRCxrQ0FBa0M7UUFDbEMsTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLElBQUksRUFBRSxLQUFLLEVBQUU7WUFDbEQsS0FBSyxFQUFFLEtBQUs7U0FDYixDQUFDLENBQUM7UUFFSCwrREFBK0Q7UUFDL0QsTUFBTSxTQUFTLEdBQUcsR0FBRyxDQUFDLEVBQUUsQ0FBQyxXQUFXLENBQUMsa0JBQWtCLENBQUMsQ0FBQztRQUN6RCxNQUFNLGdCQUFnQixHQUFHLEdBQUcsQ0FBQyxFQUFFLENBQUMsV0FBVyxDQUFDLHVCQUF1QixDQUFD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QUFFO1lBQzNDLFdBQVcsRUFBRSw0QkFBNEI7WUFDekMsVUFBVSxFQUFFLHFCQUFxQjtTQUNsQyxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLDBCQUEwQixFQUFFO1lBQ2xELEtBQUssRUFBRSxJQUFJLENBQUMsV0FBVyxDQUFDLGNBQWM7WUFDdEMsV0FBVyxFQUFFLDZCQUE2QjtZQUMxQyxVQUFVLEVBQUUsZ0NBQWdDO1NBQzdDLENBQUMsQ0FBQztRQUVILHNEQUFzRDtJQUN4RCxDQUFDO0NBQ0Y7QUF2SkQsMENBdUpDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIGVjcyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWNzJztcbmltcG9ydCAqIGFzIGVsYnYyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lbGFzdGljbG9hZGJhbGFuY2luZ3YyJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0IHByb2R1Y3Rpb25Db25maWcgZnJvbSAnLi4vLi4vY29uZmlnL3Byb2R1Y3Rpb24uanNvbic7XG5cbmludGVyZmFjZSBQcm9kdWN0aW9uU3RhY2tQcm9wcyBleHRlbmRzIGNkay5TdGFja1Byb3BzIHtcbiAgLy8gTm8gZGlyZWN0IHJlZmVyZW5jZXMgLSB1c2UgQ0RLIG91dHB1dHMvaW1wb3J0cyBpbnN0ZWFkXG59XG5cbmV4cG9ydCBjbGFzcyBQcm9kdWN0aW9uU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBwdWJsaWMgcmVhZG9ubHkgZWNzQ2x1c3RlcjogZWNzLkNsdXN0ZXI7XG4gIHB1YmxpYyByZWFkb25seSB0YXJnZXRHcm91cDogZWxidjIuQXBwbGljYXRpb25UYXJnZXRHcm91cDtcbiAgLy8gV0FGIHByb3RlY3Rpb24gaGFuZGxlZCBieSBzdGFnaW5nIFdBRiBvbiBzaGFyZWQgQUxCXG4gIC8vIEVDUyBzZXJ2aWNlIGFuZCBtb25pdG9yaW5nIGNyZWF0ZWQgYnkgYXBwbGljYXRpb24gZGVwbG95bWVudFxuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBQcm9kdWN0aW9uU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgY29uc3QgZW52aXJvbm1lbnQgPSAncHJvZHVjdGlvbic7XG4gICAgLy8gUmVhZHkgZm9yIGRlcGxveW1lbnQgd2l0aCBhbGwgQ2xvdWRGb3JtYXRpb24gdG9rZW4gaXNzdWVzIHJlc29sdmVkXG5cbiAgICAvLyBHZXQgVlBDIElEIGZyb20gY29udGV4dCBvciBlbnZpcm9ubWVudCB2YXJpYWJsZVxuICAgIGNvbnN0IHZwY0lkID0gdGhpcy5ub2RlLnRyeUdldENvbnRleHQoJ3ZwY0lkJykgfHwgcHJvY2Vzcy5lbnYuVlBDX0lEO1xuICAgIGlmICghdnBjSWQpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignVlBDX0lEIG11c3QgYmUgcHJvdmlkZWQgdmlhIGNvbnRleHQgb3IgZW52aXJvbm1lbnQgdmFyaWFibGUnKTtcbiAgICB9XG5cbiAgICAvLyBMb29rIHVwIFZQQyB1c2luZyBjb250ZXh0IHZhbHVlXG4gICAgY29uc3QgdnBjID0gY2RrLmF3c19lYzIuVnBjLmZyb21Mb29rdXAodGhpcywgJ1ZQQycsIHtcbiAgICAgIHZwY0lkOiB2cGNJZCxcbiAgICB9KTtcblxuICAgIC8vIEltcG9ydCB2YWx1ZXMgZnJvbSBvdGhlciBzdGFja3MgdXNpbmcgQ2xvdWRGb3JtYXRpb24gaW1wb3J0c1xuICAgIGNvbnN0IGttc0tleUFybiA9IGNkay5Gbi5pbXBvcnRWYWx1ZSgnQkNPUy1LTVMtS2V5LUFybicpO1xuICAgIGNvbnN0IGVjclJlcG9zaXRvcnlVcmkgPSBjZGsuRm4uaW1wb3J0VmFsdWUoJ0JDT1MtRUNSUmVwb3NpdG9yeVVyaScpO1xuICAgIGNvbnN0IGVjc1Rhc2tFeGVjdXRpb25Sb2xlQXJuID0gY2RrLkZuLmltcG9ydFZhbHVlKCdCQ09TLUVDU1Rhc2tFeGVjdXRpb25Sb2xlLUFybicpO1xuICAgIGNvbnN0IGVjc1Rhc2tSb2xlQXJuID0gY2RrLkZuLmltcG9ydFZhbHVlKCdCQ09TLUVDU1Rhc2tSb2xlLUFybicpO1xuICAgIGNvbnN0IHByb2R1Y3Rpb25TZWNyZXRBcm4gPSBjZGsuRm4uaW1wb3J0VmFsdWUoJ0JDT1MtUHJvZHVjdGlvblNlY3JldC1Bcm4nKTtcbiAgICBjb25zdCBhbGJBcm4gPSBjZGsuRm4uaW1wb3J0VmFsdWUoJ0JDT1MtTG9hZEJhbGFuY2VyLUFybicpO1xuICAgIGNvbnN0IGFsYkRuc05hbWUgPSBjZGsuRm4uaW1wb3J0VmFsdWUoJ0JDT1MtTG9hZEJhbGFuY2VyLURuc05hbWUnKTtcbiAgICBjb25zdCBhbGJDYW5vbmljYWxIb3N0ZWRab25lSWQgPSBjZGsuRm4uaW1wb3J0VmFsdWUoJ0JDT1MtTG9hZEJhbGFuY2VyLUNhbm9uaWNhbEhvc3RlZFpvbmVJZCcpO1xuICAgIGNvbnN0IGh0dHBzTGlzdGVuZXJBcm4gPSBjZGsuRm4uaW1wb3J0VmFsdWUoJ0JDT1MtSFRUUFNMaXN0ZW5lci1Bcm4nKTtcbiAgICBjb25zdCBob3N0ZWRab25lSWQgPSBjZGsuRm4uaW1wb3J0VmFsdWUoJ0JDT1MtSG9zdGVkWm9uZS1JZCcpO1xuICAgIGNvbnN0IGVjc1NlY3VyaXR5R3JvdXBJZCA9IGNkay5Gbi5pbXBvcnRWYWx1ZSgnQkNPUy1FQ1NTZWN1cml0eUdyb3VwLUlkJyk7XG5cbiAgICAvLyBJbXBvcnQgS01TIGtleVxuICAgIGNvbnN0IGttc0tleSA9IGNkay5hd3Nfa21zLktleS5mcm9tS2V5QXJuKHRoaXMsICdLTVNLZXknLCBrbXNLZXlBcm4pO1xuXG4gICAgLy8gSW1wb3J0IEVDUiByZXBvc2l0b3J5IHVzaW5nIGF0dHJpYnV0ZXMgKHJlcXVpcmVkIGZvciB0b2tlbnMpXG4gICAgY29uc3QgZWNyUmVwb3NpdG9yeSA9IGNkay5hd3NfZWNyLlJlcG9zaXRvcnkuZnJvbVJlcG9zaXRvcnlBdHRyaWJ1dGVzKHRoaXMsICdFQ1JSZXBvc2l0b3J5Jywge1xuICAgICAgcmVwb3NpdG9yeUFybjogZWNyUmVwb3NpdG9yeVVyaSxcbiAgICAgIHJlcG9zaXRvcnlOYW1lOiAnYmNvcycsIC8vIFVzZSBzdGF0aWMgbmFtZSBzaW5jZSB3ZSBrbm93IGl0XG4gICAgfSk7XG5cbiAgICAvLyBJbXBvcnQgSUFNIHJvbGVzXG4gICAgY29uc3QgZXhlY3V0aW9uUm9sZSA9IGNkay5hd3NfaWFtLlJvbGUuZnJvbVJvbGVBcm4odGhpcywgJ0V4ZWN1dGlvblJvbGUnLCBlY3NUYXNrRXhlY3V0aW9uUm9sZUFybik7XG4gICAgY29uc3QgdGFza1JvbGUgPSBjZGsuYXdzX2lhbS5Sb2xlLmZyb21Sb2xlQXJuKHRoaXMsICdUYXNrUm9sZScsIGVjc1Rhc2tSb2xlQXJuKTtcblxuICAgIC8vIEltcG9ydCBzZWNyZXRcbiAgICBjb25zdCBzZWNyZXQgPSBjZGsuYXdzX3NlY3JldHNtYW5hZ2VyLlNlY3JldC5mcm9tU2VjcmV0Q29tcGxldGVBcm4odGhpcywgJ1NlY3JldCcsIHByb2R1Y3Rpb25TZWNyZXRBcm4pO1xuXG4gICAgLy8gSW1wb3J0IGxvYWQgYmFsYW5jZXIgYW5kIGxpc3RlbmVyXG4gICAgY29uc3QgbG9hZEJhbGFuY2VyID0gY2RrLmF3c19lbGFzdGljbG9hZGJhbGFuY2luZ3YyLkFwcGxpY2F0aW9uTG9hZEJhbGFuY2VyLmZyb21BcHBsaWNhdGlvbkxvYWRCYWxhbmNlckF0dHJpYnV0ZXModGhpcywgJ0xvYWRCYWxhbmNlcicsIHtcbiAgICAgIGxvYWRCYWxhbmNlckFybjogYWxiQXJuLFxuICAgICAgbG9hZEJhbGFuY2VyRG5zTmFtZTogYWxiRG5zTmFtZSxcbiAgICAgIGxvYWRCYWxhbmNlckNhbm9uaWNhbEhvc3RlZFpvbmVJZDogYWxiQ2Fub25pY2FsSG9zdGVkWm9uZUlkLFxuICAgICAgc2VjdXJpdHlHcm91cElkOiBlY3NTZWN1cml0eUdyb3VwSWQsXG4gICAgfSk7XG5cbiAgICBjb25zdCBodHRwc0xpc3RlbmVyID0gY2RrLmF3c19lbGFzdGljbG9hZGJhbGFuY2luZ3YyLkFwcGxpY2F0aW9uTGlzdGVuZXIuZnJvbUFwcGxpY2F0aW9uTGlzdGVuZXJBdHRyaWJ1dGVzKHRoaXMsICdIVFRQU0xpc3RlbmVyJywge1xuICAgICAgbGlzdGVuZXJBcm46IGh0dHBzTGlzdGVuZXJBcm4sXG4gICAgICBzZWN1cml0eUdyb3VwOiBjZGsuYXdzX2VjMi5TZWN1cml0eUdyb3VwLmZyb21TZWN1cml0eUdyb3VwSWQodGhpcywgJ0FMQlNlY3VyaXR5R3JvdXAnLCBlY3NTZWN1cml0eUdyb3VwSWQpLFxuICAgIH0pO1xuXG4gICAgLy8gSW1wb3J0IGhvc3RlZCB6b25lIHVzaW5nIGF0dHJpYnV0ZXMgKHByb3ZpZGVzIHpvbmVOYW1lKVxuICAgIGNvbnN0IGhvc3RlZFpvbmUgPSBjZGsuYXdzX3JvdXRlNTMuSG9zdGVkWm9uZS5mcm9tSG9zdGVkWm9uZUF0dHJpYnV0ZXModGhpcywgJ0hvc3RlZFpvbmUnLCB7XG4gICAgICBob3N0ZWRab25lSWQ6IGhvc3RlZFpvbmVJZCxcbiAgICAgIHpvbmVOYW1lOiAnYmVuZGNhcmUuY29tJyxcbiAgICB9KTtcblxuICAgIC8vIEltcG9ydCBFQ1Mgc2VjdXJpdHkgZ3JvdXBcbiAgICBjb25zdCBlY3NTZWN1cml0eUdyb3VwID0gY2RrLmF3c19lYzIuU2VjdXJpdHlHcm91cC5mcm9tU2VjdXJpdHlHcm91cElkKHRoaXMsICdFQ1NTZWN1cml0eUdyb3VwJywgZWNzU2VjdXJpdHlHcm91cElkKTtcblxuICAgIC8vIENyZWF0ZSBFQ1MgQ2x1c3RlclxuICAgIHRoaXMuZWNzQ2x1c3RlciA9IG5ldyBlY3MuQ2x1c3Rlcih0aGlzLCAnUHJvZHVjdGlvbkNsdXN0ZXInLCB7XG4gICAgICBjbHVzdGVyTmFtZTogcHJvZHVjdGlvbkNvbmZpZy5lY3MuY2x1c3Rlck5hbWUsXG4gICAgICB2cGM6IHZwYyxcbiAgICAgIGNvbnRhaW5lckluc2lnaHRzOiBwcm9kdWN0aW9uQ29uZmlnLm1vbml0b3JpbmcuZGV0YWlsZWRNb25pdG9yaW5nLFxuICAgICAgZW5hYmxlRmFyZ2F0ZUNhcGFjaXR5UHJvdmlkZXJzOiB0cnVlLFxuICAgIH0pO1xuXG4gICAgLy8gU2VjdXJlQ29udGFpbmVyICh0YXNrIGRlZmluaXRpb24pIG5vdCBjcmVhdGVkIGluIGluZnJhc3RydWN0dXJlIC0gbWF0Y2hlcyBhY3R1YWwgQkNPUy1TdGFnaW5nU3RhY2sgYmVoYXZpb3JcblxuICAgIC8vIENyZWF0ZSB0YXJnZXQgZ3JvdXAgZm9yIHByb2R1Y3Rpb25cbiAgICB0aGlzLnRhcmdldEdyb3VwID0gbmV3IGVsYnYyLkFwcGxpY2F0aW9uVGFyZ2V0R3JvdXAodGhpcywgJ1Byb2R1Y3Rpb25UYXJnZXRHcm91cCcsIHtcbiAgICAgIHRhcmdldEdyb3VwTmFtZTogJ2Jjb3MtcHJvZHVjdGlvbi10ZycsXG4gICAgICB2cGM6IHZwYyxcbiAgICAgIHBvcnQ6IDMwMDAsXG4gICAgICBwcm90b2NvbDogZWxidjIuQXBwbGljYXRpb25Qcm90b2NvbC5IVFRQLFxuICAgICAgdGFyZ2V0VHlwZTogZWxidjIuVGFyZ2V0VHlwZS5JUCxcbiAgICAgIGhlYWx0aENoZWNrOiB7XG4gICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICAgIHBhdGg6ICcvYXBpL2hlYWx0aCcsXG4gICAgICAgIHByb3RvY29sOiBlbGJ2Mi5Qcm90b2NvbC5IVFRQLFxuICAgICAgICBwb3J0OiAnMzAwMCcsXG4gICAgICAgIGludGVydmFsOiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDEwKSxcbiAgICAgICAgaGVhbHRoeVRocmVzaG9sZENvdW50OiAyLFxuICAgICAgICB1bmhlYWx0aHlUaHJlc2hvbGRDb3VudDogNSxcbiAgICAgICAgaGVhbHRoeUh0dHBDb2RlczogJzIwMCcsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gRUNTIFNlcnZpY2Ugbm90IGNyZWF0ZWQgaW4gaW5mcmFzdHJ1Y3R1cmUgLSBtYXRjaGVzIGFjdHVhbCBCQ09TLVN0YWdpbmdTdGFjayBiZWhhdmlvclxuXG4gICAgLy8gU2V0IHRhcmdldCBncm91cCBhcyBkZWZhdWx0IGFjdGlvbiBmb3IgSFRUUFMgbGlzdGVuZXJcbiAgICBuZXcgZWxidjIuQXBwbGljYXRpb25MaXN0ZW5lclJ1bGUodGhpcywgJ1Byb2R1Y3Rpb25MaXN0ZW5lclJ1bGUnLCB7XG4gICAgICBsaXN0ZW5lcjogaHR0cHNMaXN0ZW5lcixcbiAgICAgIHByaW9yaXR5OiAxMCwgLy8gSGlnaGVyIHByaW9yaXR5IHRoYW4gc3RhZ2luZ1xuICAgICAgY29uZGl0aW9uczogW2VsYnYyLkxpc3RlbmVyQ29uZGl0aW9uLmhvc3RIZWFkZXJzKFtwcm9kdWN0aW9uQ29uZmlnLmRvbWFpbl0pXSxcbiAgICAgIGFjdGlvbjogZWxidjIuTGlzdGVuZXJBY3Rpb24uZm9yd2FyZChbdGhpcy50YXJnZXRHcm91cF0pLFxuICAgIH0pO1xuXG4gICAgLy8gU2tpcCBSb3V0ZTUzIEEgcmVjb3JkIC0gYXBwLmJlbmRjYXJlLmNvbSBhbHJlYWR5IGV4aXN0c1xuXG4gICAgLy8gU2tpcCBXQUYgY3JlYXRpb24gLSBzaGFyZWQgQUxCIGFscmVhZHkgaGFzIHN0YWdpbmcgV0FGXG4gICAgLy8gQVdTIG9ubHkgYWxsb3dzIG9uZSBXQUYgV2ViIEFDTCBwZXIgbG9hZCBiYWxhbmNlclxuXG4gICAgLy8gTW9uaXRvcmluZyBub3QgY3JlYXRlZCBpbiBpbmZyYXN0cnVjdHVyZSAtIG1hdGNoZXMgYWN0dWFsIEJDT1MtU3RhZ2luZ1N0YWNrIGJlaGF2aW9yXG5cbiAgICAvLyBBdXRvIHNjYWxpbmcgbm90IGNyZWF0ZWQgaW4gaW5mcmFzdHJ1Y3R1cmUgLSBtYXRjaGVzIGFjdHVhbCBCQ09TLVN0YWdpbmdTdGFjayBiZWhhdmlvclxuXG4gICAgLy8gQXBwbHkgdGFnc1xuICAgIE9iamVjdC5lbnRyaWVzKHByb2R1Y3Rpb25Db25maWcudGFncykuZm9yRWFjaCgoW2tleSwgdmFsdWVdKSA9PiB7XG4gICAgICBjZGsuVGFncy5vZih0aGlzKS5hZGQoa2V5LCB2YWx1ZSk7XG4gICAgfSk7XG5cbiAgICAvLyBTdGFjayBvdXRwdXRzXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1Byb2R1Y3Rpb25DbHVzdGVyTmFtZScsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmVjc0NsdXN0ZXIuY2x1c3Rlck5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ1Byb2R1Y3Rpb24gRUNTIENsdXN0ZXIgTmFtZScsXG4gICAgICBleHBvcnROYW1lOiAnQkNPUy1Qcm9kdWN0aW9uLUNsdXN0ZXJOYW1lJyxcbiAgICB9KTtcblxuICAgIC8vIEVDUyBTZXJ2aWNlIG5hbWUgd2lsbCBiZSBjcmVhdGVkIGJ5IGFwcGxpY2F0aW9uIGRlcGxveW1lbnRcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdQcm9kdWN0aW9uVVJMJywge1xuICAgICAgdmFsdWU6IGBodHRwczovLyR7cHJvZHVjdGlvbkNvbmZpZy5kb21haW59YCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnUHJvZHVjdGlvbiBBcHBsaWNhdGlvbiBVUkwnLFxuICAgICAgZXhwb3J0TmFtZTogJ0JDT1MtUHJvZHVjdGlvbi1VUkwnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1Byb2R1Y3Rpb25UYXJnZXRHcm91cEFybicsIHtcbiAgICAgIHZhbHVlOiB0aGlzLnRhcmdldEdyb3VwLnRhcmdldEdyb3VwQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdQcm9kdWN0aW9uIFRhcmdldCBHcm91cCBBUk4nLFxuICAgICAgZXhwb3J0TmFtZTogJ0JDT1MtUHJvZHVjdGlvbi1UYXJnZXRHcm91cEFybicsXG4gICAgfSk7XG5cbiAgICAvLyBEYXNoYm9hcmQgd2lsbCBiZSBjcmVhdGVkIGJ5IGFwcGxpY2F0aW9uIGRlcGxveW1lbnRcbiAgfVxufVxuIl19