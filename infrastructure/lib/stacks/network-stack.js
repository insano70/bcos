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
            bucketName: `bcos-alb-access-logs-${this.account}-${this.region}`,
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
        this.ecsSecurityGroup.addIngressRule(ec2.Peer.securityGroupId(this.albSecurityGroup.securityGroupId), ec2.Port.tcp(80), 'Allow HTTP traffic from ALB');
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
            },
            deletionProtection: true, // Enable deletion protection for production
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmV0d29yay1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIm5ldHdvcmstc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLHlEQUEyQztBQUMzQyw4RUFBZ0U7QUFDaEUsdUZBQXlFO0FBQ3pFLGlFQUFtRDtBQUVuRCx1REFBeUM7QUFPekMsTUFBYSxZQUFhLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFDekIsR0FBRyxDQUFXO0lBQ2QsZ0JBQWdCLENBQW9CO0lBQ3BDLGdCQUFnQixDQUFvQjtJQUNwQyxZQUFZLENBQWdDO0lBQzVDLGFBQWEsQ0FBNEI7SUFDekMsV0FBVyxDQUFpQztJQUM1QyxVQUFVLENBQXNCO0lBQ2hDLGdCQUFnQixDQUFZO0lBRTVDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBd0I7UUFDaEUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxFQUFFLE1BQU0sRUFBRSxHQUFHLEtBQUssQ0FBQztRQUV6Qix1QkFBdUI7UUFDdkIsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDLElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUM7UUFDckUsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ1gsTUFBTSxJQUFJLEtBQUssQ0FBQyw2REFBNkQsQ0FBQyxDQUFDO1FBQ2pGLENBQUM7UUFFRCxJQUFJLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLElBQUksRUFBRSxhQUFhLEVBQUU7WUFDakQsS0FBSyxFQUFFLEtBQUs7U0FDYixDQUFDLENBQUM7UUFFSCwrQkFBK0I7UUFDL0IsSUFBSSxDQUFDLFVBQVUsR0FBRyxPQUFPLENBQUMsVUFBVSxDQUFDLFVBQVUsQ0FBQyxJ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LENBQUMsZ0JBQWdCLENBQUMsZUFBZTtZQUM1QyxXQUFXLEVBQUUsdUJBQXVCO1lBQ3BDLFVBQVUsRUFBRSwwQkFBMEI7U0FDdkMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBclBELG9DQXFQQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgKiBhcyBlYzIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVjMic7XG5pbXBvcnQgKiBhcyBlbGJ2MiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWxhc3RpY2xvYWRiYWxhbmNpbmd2Mic7XG5pbXBvcnQgKiBhcyBjZXJ0aWZpY2F0ZW1hbmFnZXIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNlcnRpZmljYXRlbWFuYWdlcic7XG5pbXBvcnQgKiBhcyByb3V0ZTUzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1yb3V0ZTUzJztcbmltcG9ydCAqIGFzIGttcyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mta21zJztcbmltcG9ydCAqIGFzIHMzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMyc7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcblxuaW50ZXJmYWNlIE5ldHdvcmtTdGFja1Byb3BzIGV4dGVuZHMgY2RrLlN0YWNrUHJvcHMge1xuICBrbXNLZXk6IGttcy5LZXk7XG59XG5cbmV4cG9ydCBjbGFzcyBOZXR3b3JrU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBwdWJsaWMgcmVhZG9ubHkgdnBjOiBlYzIuSVZwYztcbiAgcHVibGljIHJlYWRvbmx5IGFsYlNlY3VyaXR5R3JvdXA6IGVjMi5TZWN1cml0eUdyb3VwO1xuICBwdWJsaWMgcmVhZG9ubHkgZWNzU2VjdXJpdHlHcm91cDogZWMyLlNlY3VyaXR5R3JvdXA7XG4gIHB1YmxpYyByZWFkb25seSBsb2FkQmFsYW5jZXI6IGVsYnYyLkFwcGxpY2F0aW9uTG9hZEJhbGFuY2VyO1xuICBwdWJsaWMgcmVhZG9ubHkgaHR0cHNMaXN0ZW5lcjogZWxidjIuQXBwbGljYXRpb25MaXN0ZW5lcjtcbiAgcHVibGljIHJlYWRvbmx5IGNlcnRpZmljYXRlOiBjZXJ0aWZpY2F0ZW1hbmFnZXIuQ2VydGlmaWNhdGU7XG4gIHB1YmxpYyByZWFkb25seSBob3N0ZWRab25lOiByb3V0ZTUzLklIb3N0ZWRab25lO1xuICBwdWJsaWMgcmVhZG9ubHkgYWNjZXNzTG9nc0J1Y2tldDogczMuQnVja2V0O1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBOZXR3b3JrU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgY29uc3QgeyBrbXNLZXkgfSA9IHByb3BzO1xuXG4gICAgLy8gTG9vayB1cCBleGlzdGluZyBWUENcbiAgICBjb25zdCB2cGNJZCA9IHRoaXMubm9kZS50cnlHZXRDb250ZXh0KCd2cGNJZCcpIHx8IHByb2Nlc3MuZW52LlZQQ19JRDtcbiAgICBpZiAoIXZwY0lkKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1ZQQ19JRCBtdXN0IGJlIHByb3ZpZGVkIHZpYSBjb250ZXh0IG9yIGVudmlyb25tZW50IHZhcmlhYmxlJyk7XG4gICAgfVxuXG4gICAgdGhpcy52cGMgPSBlYzIuVnBjLmZyb21Mb29rdXAodGhpcywgJ0V4aXN0aW5nVlBDJywge1xuICAgICAgdnBjSWQ6IHZwY0lkLFxuICAgIH0pO1xuXG4gICAgLy8gTG9vayB1cCBleGlzdGluZyBob3N0ZWQgem9uZVxuICAgIHRoaXMuaG9zdGVkWm9uZSA9IHJvdXRlNTMuSG9zdGVkWm9uZS5mcm9tTG9va3VwKHRoaXMsICdIb3N0ZWRab25lJywge1xuICAgICAgZG9tYWluTmFtZTogJ2JlbmRjYXJlLmNvbScsXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgUzMgYnVja2V0IGZvciBBTEIgYWNjZXNzIGxvZ3NcbiAgICB0aGlzLmFjY2Vzc0xvZ3NCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsICdBTEJBY2Nlc3NMb2dzQnVja2V0Jywge1xuICAgICAgYnVja2V0TmFtZTogYGJjb3MtYWxiLWFjY2Vzcy1sb2dzLSR7dGhpcy5hY2NvdW50fS0ke3RoaXMucmVnaW9ufWAsXG4gICAgICBlbmNyeXB0aW9uOiBzMy5CdWNrZXRFbmNyeXB0aW9uLlMzX01BTkFHRUQsXG4gICAgICBibG9ja1B1YmxpY0FjY2VzczogczMuQmxvY2tQdWJsaWNBY2Nlc3MuQkxPQ0tfQUxMLFxuICAgICAgdmVyc2lvbmVkOiB0cnVlLFxuICAgICAgbGlmZWN5Y2xlUnVsZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGlkOiAnRGVsZXRlT2xkQWNjZXNzTG9ncycsXG4gICAgICAgICAgZXhwaXJhdGlvbjogY2RrLkR1cmF0aW9uLmRheXMoOTApLFxuICAgICAgICAgIGFib3J0SW5jb21wbGV0ZU11bHRpcGFydFVwbG9hZEFmdGVyOiBjZGsuRHVyYXRpb24uZGF5cyg3KSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4sXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgU1NMIGNlcnRpZmljYXRlIGZvciBib3RoIGRvbWFpbnNcbiAgICB0aGlzLmNlcnRpZmljYXRlID0gbmV3IGNlcnRpZmljYXRlbWFuYWdlci5DZXJ0aWZpY2F0ZSh0aGlzLCAnU1NMQ2VydGlmaWNhdGUnLCB7XG4gICAgICBkb21haW5OYW1lOiAnYXBwLmJlbmRjYXJlLmNvbScsXG4gICAgICBzdWJqZWN0QWx0ZXJuYXRpdmVOYW1lczogWydzdGFnaW5nLmJlbmRjYXJlLmNvbSddLFxuICAgICAgdmFsaWRhdGlvbjogY2VydGlmaWNhdGVtYW5hZ2VyLkNlcnRpZmljYXRlVmFsaWRhdGlvbi5mcm9tRG5zKHRoaXMuaG9zdGVkWm9uZSksXG4gICAgICBrZXlBbGdvcml0aG06IGNlcnRpZmljYXRlbWFuYWdlci5LZXlBbGdvcml0aG0uUlNBXzIwNDgsXG4gICAgfSk7XG5cbiAgICAvLyBBTEIgU2VjdXJpdHkgR3JvdXAgLSBBbGxvdyBIVFRQUyBhbmQgSFRUUCBmcm9tIGludGVybmV0XG4gICAgdGhpcy5hbGJTZWN1cml0eUdyb3VwID0gbmV3IGVjMi5TZWN1cml0eUdyb3VwKHRoaXMsICdBTEJTZWN1cml0eUdyb3VwJywge1xuICAgICAgdnBjOiB0aGlzLnZwYyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU2VjdXJpdHkgZ3JvdXAgZm9yIEJDT1MgQXBwbGljYXRpb24gTG9hZCBCYWxhbmNlcicsXG4gICAgICBhbGxvd0FsbE91dGJvdW5kOiB0cnVlLFxuICAgIH0pO1xuXG4gICAgdGhpcy5hbGJTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgZWMyLlBlZXIuYW55SXB2NCgpLFxuICAgICAgZWMyLlBvcnQudGNwKDQ0MyksXG4gICAgICAnQWxsb3cgSFRUUFMgdHJhZmZpYyBmcm9tIGludGVybmV0J1xuICAgICk7XG5cbiAgICB0aGlzLmFsYlNlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICBlYzIuUGVlci5hbnlJcHY0KCksXG4gICAgICBlYzIuUG9ydC50Y3AoODApLFxuICAgICAgJ0FsbG93IEhUVFAgdHJhZmZpYyBmcm9tIGludGVybmV0IChmb3IgcmVkaXJlY3QpJ1xuICAgICk7XG5cbiAgICAvLyBFQ1MgU2VjdXJpdHkgR3JvdXAgLSBBbGxvdyB0cmFmZmljIG9ubHkgZnJvbSBBTEJcbiAgICB0aGlzLmVjc1NlY3VyaXR5R3JvdXAgPSBuZXcgZWMyLlNlY3VyaXR5R3JvdXAodGhpcywgJ0VDU1NlY3VyaXR5R3JvdXAnLCB7XG4gICAgICB2cGM6IHRoaXMudnBjLFxuICAgICAgZGVzY3JpcHRpb246ICdTZWN1cml0eSBncm91cCBmb3IgQkNPUyBFQ1MgdGFza3MnLFxuICAgICAgYWxsb3dBbGxPdXRib3VuZDogZmFsc2UsIC8vIEV4cGxpY2l0bHkgY29udHJvbCBvdXRib3VuZCB0cmFmZmljXG4gICAgfSk7XG5cbiAgICB0aGlzLmVjc1NlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICBlYzIuUGVlci5zZWN1cml0eUdyb3VwSWQodGhpcy5hbGJTZWN1cml0eUdyb3VwLnNlY3VyaXR5R3JvdXBJZCksXG4gICAgICBlYzIuUG9ydC50Y3AoODApLFxuICAgICAgJ0FsbG93IEhUVFAgdHJhZmZpYyBmcm9tIEFMQidcbiAgICApO1xuXG4gICAgLy8gQWxsb3cgb3V0Ym91bmQgSFRUUFMgdG8gVlBDIENJRFIgZm9yIFZQQyBlbmRwb2ludHNcbiAgICB0aGlzLmVjc1NlY3VyaXR5R3JvdXAuYWRkRWdyZXNzUnVsZShcbiAgICAgIGVjMi5QZWVyLmlwdjQodGhpcy52cGMudnBjQ2lkckJsb2NrKSxcbiAgICAgIGVjMi5Qb3J0LnRjcCg0NDMpLFxuICAgICAgJ0FsbG93IEhUVFBTIHRvIFZQQyBlbmRwb2ludHMnXG4gICAgKTtcblxuICAgIC8vIEFsbG93IG91dGJvdW5kIEROU1xuICAgIHRoaXMuZWNzU2VjdXJpdHlHcm91cC5hZGRFZ3Jlc3NSdWxlKFxuICAgICAgZWMyLlBlZXIuYW55SXB2NCgpLFxuICAgICAgZWMyLlBvcnQudGNwKDUzKSxcbiAgICAgICdBbGxvdyBETlMgVENQJ1xuICAgICk7XG5cbiAgICB0aGlzLmVjc1NlY3VyaXR5R3JvdXAuYWRkRWdyZXNzUnVsZShcbiAgICAgIGVjMi5QZWVyLmFueUlwdjQoKSxcbiAgICAgIGVjMi5Qb3J0LnVkcCg1MyksXG4gICAgICAnQWxsb3cgRE5TIFVEUCdcbiAgICApO1xuXG4gICAgLy8gQ3JlYXRlIFZQQyBFbmRwb2ludHMgZm9yIEVDUyB0YXNrcyBpbiBwcml2YXRlIHN1Ym5ldHNcbiAgICBjb25zdCB2cGNFbmRwb2ludHMgPSBbXG4gICAgICB7XG4gICAgICAgIG5hbWU6ICdFQ1ItQVBJJyxcbiAgICAgICAgc2VydmljZTogZWMyLkludGVyZmFjZVZwY0VuZHBvaW50QXdzU2VydmljZS5FQ1IsXG4gICAgICB9LFxuICAgICAge1xuICAgICAgICBuYW1lOiAnRUNSLURLUicsXG4gICAgICAgIHNlcnZpY2U6IGVjMi5JbnRlcmZhY2VWcGNFbmRwb2ludEF3c1NlcnZpY2UuRUNSX0RPQ0tFUixcbiAgICAgIH0sXG4gICAgICB7XG4gICAgICAgIG5hbWU6ICdDbG91ZFdhdGNoLUxvZ3MnLFxuICAgICAgICBzZXJ2aWNlOiBlYzIuSW50ZXJmYWNlVnBjRW5kcG9pbnRBd3NTZXJ2aWNlLkNMT1VEV0FUQ0hfTE9HUyxcbiAgICAgIH0sXG4gICAgICB7XG4gICAgICAgIG5hbWU6ICdTZWNyZXRzLU1hbmFnZXInLFxuICAgICAgICBzZXJ2aWNlOiBlYzIuSW50ZXJmYWNlVnBjRW5kcG9pbnRBd3NTZXJ2aWNlLlNFQ1JFVFNfTUFOQUdFUixcbiAgICAgIH0sXG4gICAgICB7XG4gICAgICAgIG5hbWU6ICdTVFMnLFxuICAgICAgICBzZXJ2aWNlOiBlYzIuSW50ZXJmYWNlVnBjRW5kcG9pbnRBd3NTZXJ2aWNlLlNUUyxcbiAgICAgIH0sXG4gICAgXTtcblxuICAgIHZwY0VuZHBvaW50cy5mb3JFYWNoKChlbmRwb2ludCkgPT4ge1xuICAgICAgbmV3IGVjMi5JbnRlcmZhY2VWcGNFbmRwb2ludCh0aGlzLCBgJHtlbmRwb2ludC5uYW1lfS1FbmRwb2ludGAsIHtcbiAgICAgICAgdnBjOiB0aGlzLnZwYyxcbiAgICAgICAgc2VydmljZTogZW5kcG9pbnQuc2VydmljZSxcbiAgICAgICAgc3VibmV0czoge1xuICAgICAgICAgIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfV0lUSF9FR1JFU1MsXG4gICAgICAgIH0sXG4gICAgICAgIHNlY3VyaXR5R3JvdXBzOiBbdGhpcy5lY3NTZWN1cml0eUdyb3VwXSxcbiAgICAgICAgcHJpdmF0ZURuc0VuYWJsZWQ6IHRydWUsXG4vLyBQb2xpY3kgbWFuYWdlZCBzZXBhcmF0ZWx5XG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIC8vIFMzIEdhdGV3YXkgRW5kcG9pbnQgZm9yIEVDUiBpbWFnZSBsYXllcnNcbiAgICBuZXcgZWMyLkdhdGV3YXlWcGNFbmRwb2ludCh0aGlzLCAnUzMtR2F0ZXdheS1FbmRwb2ludCcsIHtcbiAgICAgIHZwYzogdGhpcy52cGMsXG4gICAgICBzZXJ2aWNlOiBlYzIuR2F0ZXdheVZwY0VuZHBvaW50QXdzU2VydmljZS5TMyxcbiAgICAgIHN1Ym5ldHM6IFtcbiAgICAgICAge1xuICAgICAgICAgIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfV0lUSF9FR1JFU1MsXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gQXBwbGljYXRpb24gTG9hZCBCYWxhbmNlclxuICAgIHRoaXMubG9hZEJhbGFuY2VyID0gbmV3IGVsYnYyLkFwcGxpY2F0aW9uTG9hZEJhbGFuY2VyKHRoaXMsICdBcHBsaWNhdGlvbkxvYWRCYWxhbmNlcicsIHtcbiAgICAgIHZwYzogdGhpcy52cGMsXG4gICAgICBpbnRlcm5ldEZhY2luZzogdHJ1ZSxcbiAgICAgIHNlY3VyaXR5R3JvdXA6IHRoaXMuYWxiU2VjdXJpdHlHcm91cCxcbiAgICAgIHZwY1N1Ym5ldHM6IHtcbiAgICAgICAgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFVCTElDLFxuICAgICAgfSxcbiAgICAgIGRlbGV0aW9uUHJvdGVjdGlvbjogdHJ1ZSwgLy8gRW5hYmxlIGRlbGV0aW9uIHByb3RlY3Rpb24gZm9yIHByb2R1Y3Rpb25cbiAgICB9KTtcblxuICAgIC8vIEVuYWJsZSBhY2Nlc3MgbG9nZ2luZ1xuICAgIHRoaXMubG9hZEJhbGFuY2VyLmxvZ0FjY2Vzc0xvZ3ModGhpcy5hY2Nlc3NMb2dzQnVja2V0LCAnYWxiLWFjY2Vzcy1sb2dzJyk7XG5cbiAgICAvLyBIVFRQIExpc3RlbmVyIC0gUmVkaXJlY3QgdG8gSFRUUFNcbiAgICB0aGlzLmxvYWRCYWxhbmNlci5hZGRMaXN0ZW5lcignSFRUUExpc3RlbmVyJywge1xuICAgICAgcG9ydDogODAsXG4gICAgICBwcm90b2NvbDogZWxidjIuQXBwbGljYXRpb25Qcm90b2NvbC5IVFRQLFxuICAgICAgZGVmYXVsdEFjdGlvbjogZWxidjIuTGlzdGVuZXJBY3Rpb24ucmVkaXJlY3Qoe1xuICAgICAgICBwcm90b2NvbDogJ0hUVFBTJyxcbiAgICAgICAgcG9ydDogJzQ0MycsXG4gICAgICAgIHBlcm1hbmVudDogdHJ1ZSxcbiAgICAgIH0pLFxuICAgIH0pO1xuXG4gICAgLy8gSFRUUFMgTGlzdGVuZXJcbiAgICB0aGlzLmh0dHBzTGlzdGVuZXIgPSB0aGlzLmxvYWRCYWxhbmNlci5hZGRMaXN0ZW5lcignSFRUUFNMaXN0ZW5lcicsIHtcbiAgICAgIHBvcnQ6IDQ0MyxcbiAgICAgIHByb3RvY29sOiBlbGJ2Mi5BcHBsaWNhdGlvblByb3RvY29sLkhUVFBTLFxuICAgICAgY2VydGlmaWNhdGVzOiBbdGhpcy5jZXJ0aWZpY2F0ZV0sXG4gICAgICBzc2xQb2xpY3k6IGVsYnYyLlNzbFBvbGljeS5UTFMxMixcbiAgICAgIGRlZmF1bHRBY3Rpb246IGVsYnYyLkxpc3RlbmVyQWN0aW9uLmZpeGVkUmVzcG9uc2UoNDA0LCB7XG4gICAgICAgIGNvbnRlbnRUeXBlOiAndGV4dC9wbGFpbicsXG4gICAgICAgIG1lc3NhZ2VCb2R5OiAnTm90IEZvdW5kJyxcbiAgICAgIH0pLFxuICAgIH0pO1xuXG4gICAgLy8gU3RhY2sgb3V0cHV0cyBmb3IgY3Jvc3Mtc3RhY2sgcmVmZXJlbmNlc1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdWUENJZCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLnZwYy52cGNJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnVlBDIElEJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdCQ09TLVZQQy1JZCcsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnTG9hZEJhbGFuY2VyRE5TT3V0cHV0Jywge1xuICAgICAgdmFsdWU6IHRoaXMubG9hZEJhbGFuY2VyLmxvYWRCYWxhbmNlckRuc05hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ0xvYWQgQmFsYW5jZXIgRE5TIE5hbWUnLFxuICAgICAgZXhwb3J0TmFtZTogJ0JDT1MtTG9hZEJhbGFuY2VyLURuc05hbWUnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0xvYWRCYWxhbmNlckFybicsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmxvYWRCYWxhbmNlci5sb2FkQmFsYW5jZXJBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ0xvYWQgQmFsYW5jZXIgQVJOJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdCQ09TLUxvYWRCYWxhbmNlci1Bcm4nLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0xvYWRCYWxhbmNlckNhbm9uaWNhbEhvc3RlZFpvbmVJZCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmxvYWRCYWxhbmNlci5sb2FkQmFsYW5jZXJDYW5vbmljYWxIb3N0ZWRab25lSWQsXG4gICAgICBkZXNjcmlwdGlvbjogJ0xvYWQgQmFsYW5jZXIgQ2Fub25pY2FsIEhvc3RlZCBab25lIElEJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdCQ09TLUxvYWRCYWxhbmNlci1DYW5vbmljYWxIb3N0ZWRab25lSWQnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0hUVFBTTGlzdGVuZXJBcm4nLCB7XG4gICAgICB2YWx1ZTogdGhpcy5odHRwc0xpc3RlbmVyLmxpc3RlbmVyQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdIVFRQUyBMaXN0ZW5lciBBUk4nLFxuICAgICAgZXhwb3J0TmFtZTogJ0JDT1MtSFRUUFNMaXN0ZW5lci1Bcm4nLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0hvc3RlZFpvbmVJZCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmhvc3RlZFpvbmUuaG9zdGVkWm9uZUlkLFxuICAgICAgZGVzY3JpcHRpb246ICdIb3N0ZWQgWm9uZSBJRCcsXG4gICAgICBleHBvcnROYW1lOiAnQkNPUy1Ib3N0ZWRab25lLUlkJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdDZXJ0aWZpY2F0ZUFybicsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmNlcnRpZmljYXRlLmNlcnRpZmljYXRlQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdTU0wgQ2VydGlmaWNhdGUgQVJOJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdBTEJTZWN1cml0eUdyb3VwSWQnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5hbGJTZWN1cml0eUdyb3VwLnNlY3VyaXR5R3JvdXBJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQUxCIFNlY3VyaXR5IEdyb3VwIElEJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdCQ09TLUFMQlNlY3VyaXR5R3JvdXAtSWQnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0VDU1NlY3VyaXR5R3JvdXBJZCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmVjc1NlY3VyaXR5R3JvdXAuc2VjdXJpdHlHcm91cElkLFxuICAgICAgZGVzY3JpcHRpb246ICdFQ1MgU2VjdXJpdHkgR3JvdXAgSUQnLFxuICAgICAgZXhwb3J0TmFtZTogJ0JDT1MtRUNTU2VjdXJpdHlHcm91cC1JZCcsXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==