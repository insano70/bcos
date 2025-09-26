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
Object.defineProperty(exports, "__esModule", { value: true });
exports.NetworkStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const ec2 = __importStar(require("aws-cdk-lib/aws-ec2"));
const elbv2 = __importStar(require("aws-cdk-lib/aws-elasticloadbalancingv2"));
const certificatemanager = __importStar(require("aws-cdk-lib/aws-certificatemanager"));
const route53 = __importStar(require("aws-cdk-lib/aws-route53"));
const s3 = __importStar(require("aws-cdk-lib/aws-s3"));
class NetworkStack extends cdk.Stack {
    vpc;
    albSecurityGroup;
    ecsSecurityGroup;
    loadBalancer;
    httpsListener;
    certificate;
    hostedZone;
    accessLogsBucket;
    constructor(scope, id, props) {
        super(scope, id, props);
        const { kmsKey } = props;
        // Look up existing VPC
        const vpcId = this.node.tryGetContext('vpcId') || process.env.VPC_ID;
        if (!vpcId) {
            throw new Error('VPC_ID must be provided via context or environment variable');
        }
        this.vpc = ec2.Vpc.fromLookup(this, 'ExistingVPC', {
            vpcId: vpcId,
        });
        // Look up existing hosted zone
        this.hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
            domainName: 'bendcare.com',
        });
        // Create S3 bucket for ALB access logs
        this.accessLogsBucket = new s3.Bucket(this, 'ALBAccessLogsBucket', {
            // Let CDK generate unique bucket name
            encryption: s3.BucketEncryption.S3_MANAGED,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            versioned: true,
            lifecycleRules: [
                {
                    id: 'DeleteOldAccessLogs',
                    expiration: cdk.Duration.days(90),
                    abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
                },
            ],
            removalPolicy: cdk.RemovalPolicy.RETAIN,
        });
        // Create SSL certificate for both domains
        this.certificate = new certificatemanager.Certificate(this, 'SSLCertificate', {
            domainName: 'app.bendcare.com',
            subjectAlternativeNames: ['staging.bendcare.com'],
            validation: certificatemanager.CertificateValidation.fromDns(this.hostedZone),
            keyAlgorithm: certificatemanager.KeyAlgorithm.RSA_2048,
        });
        // ALB Security Group - Allow HTTPS and HTTP from internet
        this.albSecurityGroup = new ec2.SecurityGroup(this, 'ALBSecurityGroup', {
            vpc: this.vpc,
            description: 'Security group for BCOS Application Load Balancer',
            allowAllOutbound: true,
        });
        this.albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'Allow HTTPS traffic from internet');
        this.albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Allow HTTP traffic from internet (for redirect)');
        // ECS Security Group - Allow traffic only from ALB
        this.ecsSecurityGroup = new ec2.SecurityGroup(this, 'ECSSecurityGroup', {
            vpc: this.vpc,
            description: 'Security group for BCOS ECS tasks',
            allowAllOutbound: false, // Explicitly control outbound traffic
        });
        this.ecsSecurityGroup.addIngressRule(ec2.Peer.securityGroupId(this.albSecurityGroup.securityGroupId), ec2.Port.tcp(3000), 'Allow HTTP traffic from ALB');
        // Allow outbound HTTPS to VPC CIDR for VPC endpoints
        this.ecsSecurityGroup.addEgressRule(ec2.Peer.ipv4(this.vpc.vpcCidrBlock), ec2.Port.tcp(443), 'Allow HTTPS to VPC endpoints');
        // Allow outbound DNS
        this.ecsSecurityGroup.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(53), 'Allow DNS TCP');
        this.ecsSecurityGroup.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.udp(53), 'Allow DNS UDP');
        // Create VPC Endpoints for ECS tasks in private subnets
        const vpcEndpoints = [
            {
                name: 'ECR-API',
                service: ec2.InterfaceVpcEndpointAwsService.ECR,
            },
            {
                name: 'ECR-DKR',
                service: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
            },
            {
                name: 'CloudWatch-Logs',
                service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
            },
            {
                name: 'Secrets-Manager',
                service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
            },
            {
                name: 'STS',
                service: ec2.InterfaceVpcEndpointAwsService.STS,
            },
        ];
        vpcEndpoints.forEach((endpoint) => {
            new ec2.InterfaceVpcEndpoint(this, `${endpoint.name}-Endpoint`, {
                vpc: this.vpc,
                service: endpoint.service,
                subnets: {
                    subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
                },
                securityGroups: [this.ecsSecurityGroup],
                privateDnsEnabled: true,
                // Policy managed separately
            });
        });
        // S3 Gateway Endpoint for ECR image layers
        new ec2.GatewayVpcEndpoint(this, 'S3-Gateway-Endpoint', {
            vpc: this.vpc,
            service: ec2.GatewayVpcEndpointAwsService.S3,
            subnets: [
                {
                    subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
                },
            ],
        });
        // Application Load Balancer
        this.loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'ApplicationLoadBalancer', {
            vpc: this.vpc,
            internetFacing: true,
            securityGroup: this.albSecurityGroup,
            vpcSubnets: {
                subnetType: ec2.SubnetType.PUBLIC,
                onePerAz: true, // Ensure only one subnet per AZ to avoid the error
            },
            deletionProtection: false, // Disable for easier cleanup during development
        });
        // Enable access logging
        this.loadBalancer.logAccessLogs(this.accessLogsBucket, 'alb-access-logs');
        // HTTP Listener - Redirect to HTTPS
        this.loadBalancer.addListener('HTTPListener', {
            port: 80,
            protocol: elbv2.ApplicationProtocol.HTTP,
            defaultAction: elbv2.ListenerAction.redirect({
                protocol: 'HTTPS',
                port: '443',
                permanent: true,
            }),
        });
        // HTTPS Listener
        this.httpsListener = this.loadBalancer.addListener('HTTPSListener', {
            port: 443,
            protocol: elbv2.ApplicationProtocol.HTTPS,
            certificates: [this.certificate],
            sslPolicy: elbv2.SslPolicy.TLS12,
            defaultAction: elbv2.ListenerAction.fixedResponse(404, {
                contentType: 'text/plain',
                messageBody: 'Not Found',
            }),
        });
        // Stack outputs for cross-stack references
        new cdk.CfnOutput(this, 'VPCId', {
            value: this.vpc.vpcId,
            description: 'VPC ID',
            exportName: 'BCOS-VPC-Id',
        });
        new cdk.CfnOutput(this, 'LoadBalancerDNSOutput', {
            value: this.loadBalancer.loadBalancerDnsName,
            description: 'Load Balancer DNS Name',
            exportName: 'BCOS-LoadBalancer-DnsName',
        });
        new cdk.CfnOutput(this, 'LoadBalancerArn', {
            value: this.loadBalancer.loadBalancerArn,
            description: 'Load Balancer ARN',
            exportName: 'BCOS-LoadBalancer-Arn',
        });
        new cdk.CfnOutput(this, 'LoadBalancerCanonicalHostedZoneId', {
            value: this.loadBalancer.loadBalancerCanonicalHostedZoneId,
            description: 'Load Balancer Canonical Hosted Zone ID',
            exportName: 'BCOS-LoadBalancer-CanonicalHostedZoneId',
        });
        new cdk.CfnOutput(this, 'HTTPSListenerArn', {
            value: this.httpsListener.listenerArn,
            description: 'HTTPS Listener ARN',
            exportName: 'BCOS-HTTPSListener-Arn',
        });
        new cdk.CfnOutput(this, 'HostedZoneId', {
            value: this.hostedZone.hostedZoneId,
            description: 'Hosted Zone ID',
            exportName: 'BCOS-HostedZone-Id',
        });
        new cdk.CfnOutput(this, 'CertificateArn', {
            value: this.certificate.certificateArn,
            description: 'SSL Certificate ARN',
        });
        new cdk.CfnOutput(this, 'ALBSecurityGroupId', {
            value: this.albSecurityGroup.securityGroupId,
            description: 'ALB Security Group ID',
            exportName: 'BCOS-ALBSecurityGroup-Id',
        });
        new cdk.CfnOutput(this, 'ECSSecurityGroupId', {
            value: this.ecsSecurityGroup.securityGroupId,
            description: 'ECS Security Group ID',
            exportName: 'BCOS-ECSSecurityGroup-Id',
        });
    }
}
exports.NetworkStack = NetworkStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmV0d29yay1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIm5ldHdvcmstc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLHlEQUEyQztBQUMzQyw4RUFBZ0U7QUFDaEUsdUZBQXlFO0FBQ3pFLGlFQUFtRDtBQUVuRCx1REFBeUM7QUFPekMsTUFBYSxZQUFhLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFDekIsR0FBRyxDQUFXO0lBQ2QsZ0JBQWdCLENBQW9CO0lBQ3BDLGdCQUFnQixDQUFvQjtJQUNwQyxZQUFZLENBQWdDO0lBQzVDLGFBQWEsQ0FBNEI7SUFDekMsV0FBVyxDQUFpQztJQUM1QyxVQUFVLENBQXNCO0lBQ2hDLGdCQUFnQixDQUFZO0lBRTVDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBd0I7UUFDaEUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxFQUFFLE1BQU0sRUFBRSxHQUFHLEtBQUssQ0FBQztRQUV6Qix1QkFBdUI7UUFDdkIsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDLElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUM7UUFDckUsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ1gsTUFBTSxJQUFJLEtBQUssQ0FBQyw2REFBNkQsQ0FBQyxDQUFDO1FBQ2pGLENBQUM7UUFFRCxJQUFJLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLElBQUksRUFBRSxhQUFhLEVBQUU7WUFDakQsS0FBSyxFQUFFLEtBQUs7U0FDYixDQUFDLENBQUM7UUFFSCwrQkFBK0I7UUFDL0IsSUFBSSxDQUFDLFVBQVUsR0FBRyxPQUFPLENBQUMsVUFBVSxDQUFDLFVBQVUsQ0FBQyxJ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QyxlQUFlO1lBQzVDLFdBQVcsRUFBRSx1QkFBdUI7WUFDcEMsVUFBVSxFQUFFLDBCQUEwQjtTQUN2QyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUF0UEQsb0NBc1BDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIGVjMiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWMyJztcbmltcG9ydCAqIGFzIGVsYnYyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lbGFzdGljbG9hZGJhbGFuY2luZ3YyJztcbmltcG9ydCAqIGFzIGNlcnRpZmljYXRlbWFuYWdlciBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2VydGlmaWNhdGVtYW5hZ2VyJztcbmltcG9ydCAqIGFzIHJvdXRlNTMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXJvdXRlNTMnO1xuaW1wb3J0ICogYXMga21zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1rbXMnO1xuaW1wb3J0ICogYXMgczMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuXG5pbnRlcmZhY2UgTmV0d29ya1N0YWNrUHJvcHMgZXh0ZW5kcyBjZGsuU3RhY2tQcm9wcyB7XG4gIGttc0tleToga21zLktleTtcbn1cblxuZXhwb3J0IGNsYXNzIE5ldHdvcmtTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIHB1YmxpYyByZWFkb25seSB2cGM6IGVjMi5JVnBjO1xuICBwdWJsaWMgcmVhZG9ubHkgYWxiU2VjdXJpdHlHcm91cDogZWMyLlNlY3VyaXR5R3JvdXA7XG4gIHB1YmxpYyByZWFkb25seSBlY3NTZWN1cml0eUdyb3VwOiBlYzIuU2VjdXJpdHlHcm91cDtcbiAgcHVibGljIHJlYWRvbmx5IGxvYWRCYWxhbmNlcjogZWxidjIuQXBwbGljYXRpb25Mb2FkQmFsYW5jZXI7XG4gIHB1YmxpYyByZWFkb25seSBodHRwc0xpc3RlbmVyOiBlbGJ2Mi5BcHBsaWNhdGlvbkxpc3RlbmVyO1xuICBwdWJsaWMgcmVhZG9ubHkgY2VydGlmaWNhdGU6IGNlcnRpZmljYXRlbWFuYWdlci5DZXJ0aWZpY2F0ZTtcbiAgcHVibGljIHJlYWRvbmx5IGhvc3RlZFpvbmU6IHJvdXRlNTMuSUhvc3RlZFpvbmU7XG4gIHB1YmxpYyByZWFkb25seSBhY2Nlc3NMb2dzQnVja2V0OiBzMy5CdWNrZXQ7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IE5ldHdvcmtTdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICBjb25zdCB7IGttc0tleSB9ID0gcHJvcHM7XG5cbiAgICAvLyBMb29rIHVwIGV4aXN0aW5nIFZQQ1xuICAgIGNvbnN0IHZwY0lkID0gdGhpcy5ub2RlLnRyeUdldENvbnRleHQoJ3ZwY0lkJykgfHwgcHJvY2Vzcy5lbnYuVlBDX0lEO1xuICAgIGlmICghdnBjSWQpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignVlBDX0lEIG11c3QgYmUgcHJvdmlkZWQgdmlhIGNvbnRleHQgb3IgZW52aXJvbm1lbnQgdmFyaWFibGUnKTtcbiAgICB9XG5cbiAgICB0aGlzLnZwYyA9IGVjMi5WcGMuZnJvbUxvb2t1cCh0aGlzLCAnRXhpc3RpbmdWUEMnLCB7XG4gICAgICB2cGNJZDogdnBjSWQsXG4gICAgfSk7XG5cbiAgICAvLyBMb29rIHVwIGV4aXN0aW5nIGhvc3RlZCB6b25lXG4gICAgdGhpcy5ob3N0ZWRab25lID0gcm91dGU1My5Ib3N0ZWRab25lLmZyb21Mb29rdXAodGhpcywgJ0hvc3RlZFpvbmUnLCB7XG4gICAgICBkb21haW5OYW1lOiAnYmVuZGNhcmUuY29tJyxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBTMyBidWNrZXQgZm9yIEFMQiBhY2Nlc3MgbG9nc1xuICAgIHRoaXMuYWNjZXNzTG9nc0J1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgJ0FMQkFjY2Vzc0xvZ3NCdWNrZXQnLCB7XG4gICAgICAvLyBMZXQgQ0RLIGdlbmVyYXRlIHVuaXF1ZSBidWNrZXQgbmFtZVxuICAgICAgZW5jcnlwdGlvbjogczMuQnVja2V0RW5jcnlwdGlvbi5TM19NQU5BR0VELFxuICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTCxcbiAgICAgIHZlcnNpb25lZDogdHJ1ZSxcbiAgICAgIGxpZmVjeWNsZVJ1bGVzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogJ0RlbGV0ZU9sZEFjY2Vzc0xvZ3MnLFxuICAgICAgICAgIGV4cGlyYXRpb246IGNkay5EdXJhdGlvbi5kYXlzKDkwKSxcbiAgICAgICAgICBhYm9ydEluY29tcGxldGVNdWx0aXBhcnRVcGxvYWRBZnRlcjogY2RrLkR1cmF0aW9uLmRheXMoNyksXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIFNTTCBjZXJ0aWZpY2F0ZSBmb3IgYm90aCBkb21haW5zXG4gICAgdGhpcy5jZXJ0aWZpY2F0ZSA9IG5ldyBjZXJ0aWZpY2F0ZW1hbmFnZXIuQ2VydGlmaWNhdGUodGhpcywgJ1NTTENlcnRpZmljYXRlJywge1xuICAgICAgZG9tYWluTmFtZTogJ2FwcC5iZW5kY2FyZS5jb20nLFxuICAgICAgc3ViamVjdEFsdGVybmF0aXZlTmFtZXM6IFsnc3RhZ2luZy5iZW5kY2FyZS5jb20nXSxcbiAgICAgIHZhbGlkYXRpb246IGNlcnRpZmljYXRlbWFuYWdlci5DZXJ0aWZpY2F0ZVZhbGlkYXRpb24uZnJvbURucyh0aGlzLmhvc3RlZFpvbmUpLFxuICAgICAga2V5QWxnb3JpdGhtOiBjZXJ0aWZpY2F0ZW1hbmFnZXIuS2V5QWxnb3JpdGhtLlJTQV8yMDQ4LFxuICAgIH0pO1xuXG4gICAgLy8gQUxCIFNlY3VyaXR5IEdyb3VwIC0gQWxsb3cgSFRUUFMgYW5kIEhUVFAgZnJvbSBpbnRlcm5ldFxuICAgIHRoaXMuYWxiU2VjdXJpdHlHcm91cCA9IG5ldyBlYzIuU2VjdXJpdHlHcm91cCh0aGlzLCAnQUxCU2VjdXJpdHlHcm91cCcsIHtcbiAgICAgIHZwYzogdGhpcy52cGMsXG4gICAgICBkZXNjcmlwdGlvbjogJ1NlY3VyaXR5IGdyb3VwIGZvciBCQ09TIEFwcGxpY2F0aW9uIExvYWQgQmFsYW5jZXInLFxuICAgICAgYWxsb3dBbGxPdXRib3VuZDogdHJ1ZSxcbiAgICB9KTtcblxuICAgIHRoaXMuYWxiU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcbiAgICAgIGVjMi5QZWVyLmFueUlwdjQoKSxcbiAgICAgIGVjMi5Qb3J0LnRjcCg0NDMpLFxuICAgICAgJ0FsbG93IEhUVFBTIHRyYWZmaWMgZnJvbSBpbnRlcm5ldCdcbiAgICApO1xuXG4gICAgdGhpcy5hbGJTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgZWMyLlBlZXIuYW55SXB2NCgpLFxuICAgICAgZWMyLlBvcnQudGNwKDgwKSxcbiAgICAgICdBbGxvdyBIVFRQIHRyYWZmaWMgZnJvbSBpbnRlcm5ldCAoZm9yIHJlZGlyZWN0KSdcbiAgICApO1xuXG4gICAgLy8gRUNTIFNlY3VyaXR5IEdyb3VwIC0gQWxsb3cgdHJhZmZpYyBvbmx5IGZyb20gQUxCXG4gICAgdGhpcy5lY3NTZWN1cml0eUdyb3VwID0gbmV3IGVjMi5TZWN1cml0eUdyb3VwKHRoaXMsICdFQ1NTZWN1cml0eUdyb3VwJywge1xuICAgICAgdnBjOiB0aGlzLnZwYyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU2VjdXJpdHkgZ3JvdXAgZm9yIEJDT1MgRUNTIHRhc2tzJyxcbiAgICAgIGFsbG93QWxsT3V0Ym91bmQ6IGZhbHNlLCAvLyBFeHBsaWNpdGx5IGNvbnRyb2wgb3V0Ym91bmQgdHJhZmZpY1xuICAgIH0pO1xuXG4gICAgdGhpcy5lY3NTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgZWMyLlBlZXIuc2VjdXJpdHlHcm91cElkKHRoaXMuYWxiU2VjdXJpdHlHcm91cC5zZWN1cml0eUdyb3VwSWQpLFxuICAgICAgZWMyLlBvcnQudGNwKDMwMDApLFxuICAgICAgJ0FsbG93IEhUVFAgdHJhZmZpYyBmcm9tIEFMQidcbiAgICApO1xuXG4gICAgLy8gQWxsb3cgb3V0Ym91bmQgSFRUUFMgdG8gVlBDIENJRFIgZm9yIFZQQyBlbmRwb2ludHNcbiAgICB0aGlzLmVjc1NlY3VyaXR5R3JvdXAuYWRkRWdyZXNzUnVsZShcbiAgICAgIGVjMi5QZWVyLmlwdjQodGhpcy52cGMudnBjQ2lkckJsb2NrKSxcbiAgICAgIGVjMi5Qb3J0LnRjcCg0NDMpLFxuICAgICAgJ0FsbG93IEhUVFBTIHRvIFZQQyBlbmRwb2ludHMnXG4gICAgKTtcblxuICAgIC8vIEFsbG93IG91dGJvdW5kIEROU1xuICAgIHRoaXMuZWNzU2VjdXJpdHlHcm91cC5hZGRFZ3Jlc3NSdWxlKFxuICAgICAgZWMyLlBlZXIuYW55SXB2NCgpLFxuICAgICAgZWMyLlBvcnQudGNwKDUzKSxcbiAgICAgICdBbGxvdyBETlMgVENQJ1xuICAgICk7XG5cbiAgICB0aGlzLmVjc1NlY3VyaXR5R3JvdXAuYWRkRWdyZXNzUnVsZShcbiAgICAgIGVjMi5QZWVyLmFueUlwdjQoKSxcbiAgICAgIGVjMi5Qb3J0LnVkcCg1MyksXG4gICAgICAnQWxsb3cgRE5TIFVEUCdcbiAgICApO1xuXG4gICAgLy8gQ3JlYXRlIFZQQyBFbmRwb2ludHMgZm9yIEVDUyB0YXNrcyBpbiBwcml2YXRlIHN1Ym5ldHNcbiAgICBjb25zdCB2cGNFbmRwb2ludHMgPSBbXG4gICAgICB7XG4gICAgICAgIG5hbWU6ICdFQ1ItQVBJJyxcbiAgICAgICAgc2VydmljZTogZWMyLkludGVyZmFjZVZwY0VuZHBvaW50QXdzU2VydmljZS5FQ1IsXG4gICAgICB9LFxuICAgICAge1xuICAgICAgICBuYW1lOiAnRUNSLURLUicsXG4gICAgICAgIHNlcnZpY2U6IGVjMi5JbnRlcmZhY2VWcGNFbmRwb2ludEF3c1NlcnZpY2UuRUNSX0RPQ0tFUixcbiAgICAgIH0sXG4gICAgICB7XG4gICAgICAgIG5hbWU6ICdDbG91ZFdhdGNoLUxvZ3MnLFxuICAgICAgICBzZXJ2aWNlOiBlYzIuSW50ZXJmYWNlVnBjRW5kcG9pbnRBd3NTZXJ2aWNlLkNMT1VEV0FUQ0hfTE9HUyxcbiAgICAgIH0sXG4gICAgICB7XG4gICAgICAgIG5hbWU6ICdTZWNyZXRzLU1hbmFnZXInLFxuICAgICAgICBzZXJ2aWNlOiBlYzIuSW50ZXJmYWNlVnBjRW5kcG9pbnRBd3NTZXJ2aWNlLlNFQ1JFVFNfTUFOQUdFUixcbiAgICAgIH0sXG4gICAgICB7XG4gICAgICAgIG5hbWU6ICdTVFMnLFxuICAgICAgICBzZXJ2aWNlOiBlYzIuSW50ZXJmYWNlVnBjRW5kcG9pbnRBd3NTZXJ2aWNlLlNUUyxcbiAgICAgIH0sXG4gICAgXTtcblxuICAgIHZwY0VuZHBvaW50cy5mb3JFYWNoKChlbmRwb2ludCkgPT4ge1xuICAgICAgbmV3IGVjMi5JbnRlcmZhY2VWcGNFbmRwb2ludCh0aGlzLCBgJHtlbmRwb2ludC5uYW1lfS1FbmRwb2ludGAsIHtcbiAgICAgICAgdnBjOiB0aGlzLnZwYyxcbiAgICAgICAgc2VydmljZTogZW5kcG9pbnQuc2VydmljZSxcbiAgICAgICAgc3VibmV0czoge1xuICAgICAgICAgIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfV0lUSF9FR1JFU1MsXG4gICAgICAgIH0sXG4gICAgICAgIHNlY3VyaXR5R3JvdXBzOiBbdGhpcy5lY3NTZWN1cml0eUdyb3VwXSxcbiAgICAgICAgcHJpdmF0ZURuc0VuYWJsZWQ6IHRydWUsXG4vLyBQb2xpY3kgbWFuYWdlZCBzZXBhcmF0ZWx5XG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIC8vIFMzIEdhdGV3YXkgRW5kcG9pbnQgZm9yIEVDUiBpbWFnZSBsYXllcnNcbiAgICBuZXcgZWMyLkdhdGV3YXlWcGNFbmRwb2ludCh0aGlzLCAnUzMtR2F0ZXdheS1FbmRwb2ludCcsIHtcbiAgICAgIHZwYzogdGhpcy52cGMsXG4gICAgICBzZXJ2aWNlOiBlYzIuR2F0ZXdheVZwY0VuZHBvaW50QXdzU2VydmljZS5TMyxcbiAgICAgIHN1Ym5ldHM6IFtcbiAgICAgICAge1xuICAgICAgICAgIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfV0lUSF9FR1JFU1MsXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gQXBwbGljYXRpb24gTG9hZCBCYWxhbmNlclxuICAgIHRoaXMubG9hZEJhbGFuY2VyID0gbmV3IGVsYnYyLkFwcGxpY2F0aW9uTG9hZEJhbGFuY2VyKHRoaXMsICdBcHBsaWNhdGlvbkxvYWRCYWxhbmNlcicsIHtcbiAgICAgIHZwYzogdGhpcy52cGMsXG4gICAgICBpbnRlcm5ldEZhY2luZzogdHJ1ZSxcbiAgICAgIHNlY3VyaXR5R3JvdXA6IHRoaXMuYWxiU2VjdXJpdHlHcm91cCxcbiAgICAgIHZwY1N1Ym5ldHM6IHtcbiAgICAgICAgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFVCTElDLFxuICAgICAgICBvbmVQZXJBejogdHJ1ZSwgLy8gRW5zdXJlIG9ubHkgb25lIHN1Ym5ldCBwZXIgQVogdG8gYXZvaWQgdGhlIGVycm9yXG4gICAgICB9LFxuICAgICAgZGVsZXRpb25Qcm90ZWN0aW9uOiBmYWxzZSwgLy8gRGlzYWJsZSBmb3IgZWFzaWVyIGNsZWFudXAgZHVyaW5nIGRldmVsb3BtZW50XG4gICAgfSk7XG5cbiAgICAvLyBFbmFibGUgYWNjZXNzIGxvZ2dpbmdcbiAgICB0aGlzLmxvYWRCYWxhbmNlci5sb2dBY2Nlc3NMb2dzKHRoaXMuYWNjZXNzTG9nc0J1Y2tldCwgJ2FsYi1hY2Nlc3MtbG9ncycpO1xuXG4gICAgLy8gSFRUUCBMaXN0ZW5lciAtIFJlZGlyZWN0IHRvIEhUVFBTXG4gICAgdGhpcy5sb2FkQmFsYW5jZXIuYWRkTGlzdGVuZXIoJ0hUVFBMaXN0ZW5lcicsIHtcbiAgICAgIHBvcnQ6IDgwLFxuICAgICAgcHJvdG9jb2w6IGVsYnYyLkFwcGxpY2F0aW9uUHJvdG9jb2wuSFRUUCxcbiAgICAgIGRlZmF1bHRBY3Rpb246IGVsYnYyLkxpc3RlbmVyQWN0aW9uLnJlZGlyZWN0KHtcbiAgICAgICAgcHJvdG9jb2w6ICdIVFRQUycsXG4gICAgICAgIHBvcnQ6ICc0NDMnLFxuICAgICAgICBwZXJtYW5lbnQ6IHRydWUsXG4gICAgICB9KSxcbiAgICB9KTtcblxuICAgIC8vIEhUVFBTIExpc3RlbmVyXG4gICAgdGhpcy5odHRwc0xpc3RlbmVyID0gdGhpcy5sb2FkQmFsYW5jZXIuYWRkTGlzdGVuZXIoJ0hUVFBTTGlzdGVuZXInLCB7XG4gICAgICBwb3J0OiA0NDMsXG4gICAgICBwcm90b2NvbDogZWxidjIuQXBwbGljYXRpb25Qcm90b2NvbC5IVFRQUyxcbiAgICAgIGNlcnRpZmljYXRlczogW3RoaXMuY2VydGlmaWNhdGVdLFxuICAgICAgc3NsUG9saWN5OiBlbGJ2Mi5Tc2xQb2xpY3kuVExTMTIsXG4gICAgICBkZWZhdWx0QWN0aW9uOiBlbGJ2Mi5MaXN0ZW5lckFjdGlvbi5maXhlZFJlc3BvbnNlKDQwNCwge1xuICAgICAgICBjb250ZW50VHlwZTogJ3RleHQvcGxhaW4nLFxuICAgICAgICBtZXNzYWdlQm9keTogJ05vdCBGb3VuZCcsXG4gICAgICB9KSxcbiAgICB9KTtcblxuICAgIC8vIFN0YWNrIG91dHB1dHMgZm9yIGNyb3NzLXN0YWNrIHJlZmVyZW5jZXNcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVlBDSWQnLCB7XG4gICAgICB2YWx1ZTogdGhpcy52cGMudnBjSWQsXG4gICAgICBkZXNjcmlwdGlvbjogJ1ZQQyBJRCcsXG4gICAgICBleHBvcnROYW1lOiAnQkNPUy1WUEMtSWQnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0xvYWRCYWxhbmNlckROU091dHB1dCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmxvYWRCYWxhbmNlci5sb2FkQmFsYW5jZXJEbnNOYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdMb2FkIEJhbGFuY2VyIEROUyBOYW1lJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdCQ09TLUxvYWRCYWxhbmNlci1EbnNOYW1lJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdMb2FkQmFsYW5jZXJBcm4nLCB7XG4gICAgICB2YWx1ZTogdGhpcy5sb2FkQmFsYW5jZXIubG9hZEJhbGFuY2VyQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdMb2FkIEJhbGFuY2VyIEFSTicsXG4gICAgICBleHBvcnROYW1lOiAnQkNPUy1Mb2FkQmFsYW5jZXItQXJuJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdMb2FkQmFsYW5jZXJDYW5vbmljYWxIb3N0ZWRab25lSWQnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5sb2FkQmFsYW5jZXIubG9hZEJhbGFuY2VyQ2Fub25pY2FsSG9zdGVkWm9uZUlkLFxuICAgICAgZGVzY3JpcHRpb246ICdMb2FkIEJhbGFuY2VyIENhbm9uaWNhbCBIb3N0ZWQgWm9uZSBJRCcsXG4gICAgICBleHBvcnROYW1lOiAnQkNPUy1Mb2FkQmFsYW5jZXItQ2Fub25pY2FsSG9zdGVkWm9uZUlkJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdIVFRQU0xpc3RlbmVyQXJuJywge1xuICAgICAgdmFsdWU6IHRoaXMuaHR0cHNMaXN0ZW5lci5saXN0ZW5lckFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnSFRUUFMgTGlzdGVuZXIgQVJOJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdCQ09TLUhUVFBTTGlzdGVuZXItQXJuJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdIb3N0ZWRab25lSWQnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5ob3N0ZWRab25lLmhvc3RlZFpvbmVJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnSG9zdGVkIFpvbmUgSUQnLFxuICAgICAgZXhwb3J0TmFtZTogJ0JDT1MtSG9zdGVkWm9uZS1JZCcsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQ2VydGlmaWNhdGVBcm4nLCB7XG4gICAgICB2YWx1ZTogdGhpcy5jZXJ0aWZpY2F0ZS5jZXJ0aWZpY2F0ZUFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnU1NMIENlcnRpZmljYXRlIEFSTicsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQUxCU2VjdXJpdHlHcm91cElkJywge1xuICAgICAgdmFsdWU6IHRoaXMuYWxiU2VjdXJpdHlHcm91cC5zZWN1cml0eUdyb3VwSWQsXG4gICAgICBkZXNjcmlwdGlvbjogJ0FMQiBTZWN1cml0eSBHcm91cCBJRCcsXG4gICAgICBleHBvcnROYW1lOiAnQkNPUy1BTEJTZWN1cml0eUdyb3VwLUlkJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdFQ1NTZWN1cml0eUdyb3VwSWQnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5lY3NTZWN1cml0eUdyb3VwLnNlY3VyaXR5R3JvdXBJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRUNTIFNlY3VyaXR5IEdyb3VwIElEJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdCQ09TLUVDU1NlY3VyaXR5R3JvdXAtSWQnLFxuICAgIH0pO1xuICB9XG59XG4iXX0=