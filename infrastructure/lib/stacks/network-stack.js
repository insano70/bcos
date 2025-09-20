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
            encryption: s3.BucketEncryption.KMS,
            encryptionKey: kmsKey,
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
        // Stack outputs
        new cdk.CfnOutput(this, 'VPCId', {
            value: this.vpc.vpcId,
            description: 'VPC ID',
        });
        new cdk.CfnOutput(this, 'LoadBalancerDNSOutput', {
            value: this.loadBalancer.loadBalancerDnsName,
            description: 'Load Balancer DNS Name',
        });
        new cdk.CfnOutput(this, 'LoadBalancerArn', {
            value: this.loadBalancer.loadBalancerArn,
            description: 'Load Balancer ARN',
        });
        new cdk.CfnOutput(this, 'CertificateArn', {
            value: this.certificate.certificateArn,
            description: 'SSL Certificate ARN',
        });
        new cdk.CfnOutput(this, 'ALBSecurityGroupId', {
            value: this.albSecurityGroup.securityGroupId,
            description: 'ALB Security Group ID',
        });
        new cdk.CfnOutput(this, 'ECSSecurityGroupId', {
            value: this.ecsSecurityGroup.securityGroupId,
            description: 'ECS Security Group ID',
        });
    }
}
exports.NetworkStack = NetworkStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmV0d29yay1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIm5ldHdvcmstc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLHlEQUEyQztBQUMzQyw4RUFBZ0U7QUFDaEUsdUZBQXlFO0FBQ3pFLGlFQUFtRDtBQUVuRCx1REFBeUM7QUFPekMsTUFBYSxZQUFhLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFDekIsR0FBRyxDQUFXO0lBQ2QsZ0JBQWdCLENBQW9CO0lBQ3BDLGdCQUFnQixDQUFvQjtJQUNwQyxZQUFZLENBQWdDO0lBQzVDLGFBQWEsQ0FBNEI7SUFDekMsV0FBVyxDQUFpQztJQUM1QyxVQUFVLENBQXNCO0lBQ2hDLGdCQUFnQixDQUFZO0lBRTVDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBd0I7UUFDaEUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxFQUFFLE1BQU0sRUFBRSxHQUFHLEtBQUssQ0FBQztRQUV6Qix1QkFBdUI7UUFDdkIsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDLElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUM7UUFDckUsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ1gsTUFBTSxJQUFJLEtBQUssQ0FBQyw2REFBNkQsQ0FBQyxDQUFDO1FBQ2pGLENBQUM7UUFFRCxJQUFJLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLElBQUksRUFBRSxhQUFhLEVBQUU7WUFDakQsS0FBSyxFQUFFLEtBQUs7U0FDYixDQUFDLENBQUM7UUFFSCwrQkFBK0I7UUFDL0IsSUFBSSxDQUFDLFVBQVUsR0FBRyxPQUFPLENBQUMsVUFBVSxDQUFDLFVBQVUsQ0FBQyxJ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RUFBRSxtQkFBbUI7U0FDakMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxnQkFBZ0IsRUFBRTtZQUN4QyxLQUFLLEVBQUUsSUFBSSxDQUFDLFdBQVcsQ0FBQyxjQUFjO1lBQ3RDLFdBQVcsRUFBRSxxQkFBcUI7U0FDbkMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxvQkFBb0IsRUFBRTtZQUM1QyxLQUFLLEVBQUUsSUFBSSxDQUFDLGdCQUFnQixDQUFDLGVBQWU7WUFDNUMsV0FBVyxFQUFFLHVCQUF1QjtTQUNyQyxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLG9CQUFvQixFQUFFO1lBQzVDLEtBQUssRUFBRSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsZUFBZTtZQUM1QyxXQUFXLEVBQUUsdUJBQXVCO1NBQ3JDLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQS9ORCxvQ0ErTkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0ICogYXMgZWMyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lYzInO1xuaW1wb3J0ICogYXMgZWxidjIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVsYXN0aWNsb2FkYmFsYW5jaW5ndjInO1xuaW1wb3J0ICogYXMgY2VydGlmaWNhdGVtYW5hZ2VyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jZXJ0aWZpY2F0ZW1hbmFnZXInO1xuaW1wb3J0ICogYXMgcm91dGU1MyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtcm91dGU1Myc7XG5pbXBvcnQgKiBhcyBrbXMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWttcyc7XG5pbXBvcnQgKiBhcyBzMyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMnO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5cbmludGVyZmFjZSBOZXR3b3JrU3RhY2tQcm9wcyBleHRlbmRzIGNkay5TdGFja1Byb3BzIHtcbiAga21zS2V5OiBrbXMuS2V5O1xufVxuXG5leHBvcnQgY2xhc3MgTmV0d29ya1N0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgcHVibGljIHJlYWRvbmx5IHZwYzogZWMyLklWcGM7XG4gIHB1YmxpYyByZWFkb25seSBhbGJTZWN1cml0eUdyb3VwOiBlYzIuU2VjdXJpdHlHcm91cDtcbiAgcHVibGljIHJlYWRvbmx5IGVjc1NlY3VyaXR5R3JvdXA6IGVjMi5TZWN1cml0eUdyb3VwO1xuICBwdWJsaWMgcmVhZG9ubHkgbG9hZEJhbGFuY2VyOiBlbGJ2Mi5BcHBsaWNhdGlvbkxvYWRCYWxhbmNlcjtcbiAgcHVibGljIHJlYWRvbmx5IGh0dHBzTGlzdGVuZXI6IGVsYnYyLkFwcGxpY2F0aW9uTGlzdGVuZXI7XG4gIHB1YmxpYyByZWFkb25seSBjZXJ0aWZpY2F0ZTogY2VydGlmaWNhdGVtYW5hZ2VyLkNlcnRpZmljYXRlO1xuICBwdWJsaWMgcmVhZG9ubHkgaG9zdGVkWm9uZTogcm91dGU1My5JSG9zdGVkWm9uZTtcbiAgcHVibGljIHJlYWRvbmx5IGFjY2Vzc0xvZ3NCdWNrZXQ6IHMzLkJ1Y2tldDtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogTmV0d29ya1N0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIGNvbnN0IHsga21zS2V5IH0gPSBwcm9wcztcblxuICAgIC8vIExvb2sgdXAgZXhpc3RpbmcgVlBDXG4gICAgY29uc3QgdnBjSWQgPSB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgndnBjSWQnKSB8fCBwcm9jZXNzLmVudi5WUENfSUQ7XG4gICAgaWYgKCF2cGNJZCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdWUENfSUQgbXVzdCBiZSBwcm92aWRlZCB2aWEgY29udGV4dCBvciBlbnZpcm9ubWVudCB2YXJpYWJsZScpO1xuICAgIH1cblxuICAgIHRoaXMudnBjID0gZWMyLlZwYy5mcm9tTG9va3VwKHRoaXMsICdFeGlzdGluZ1ZQQycsIHtcbiAgICAgIHZwY0lkOiB2cGNJZCxcbiAgICB9KTtcblxuICAgIC8vIExvb2sgdXAgZXhpc3RpbmcgaG9zdGVkIHpvbmVcbiAgICB0aGlzLmhvc3RlZFpvbmUgPSByb3V0ZTUzLkhvc3RlZFpvbmUuZnJvbUxvb2t1cCh0aGlzLCAnSG9zdGVkWm9uZScsIHtcbiAgICAgIGRvbWFpbk5hbWU6ICdiZW5kY2FyZS5jb20nLFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIFMzIGJ1Y2tldCBmb3IgQUxCIGFjY2VzcyBsb2dzXG4gICAgdGhpcy5hY2Nlc3NMb2dzQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCAnQUxCQWNjZXNzTG9nc0J1Y2tldCcsIHtcbiAgICAgIGJ1Y2tldE5hbWU6IGBiY29zLWFsYi1hY2Nlc3MtbG9ncy0ke3RoaXMuYWNjb3VudH0tJHt0aGlzLnJlZ2lvbn1gLFxuICAgICAgZW5jcnlwdGlvbjogczMuQnVja2V0RW5jcnlwdGlvbi5LTVMsXG4gICAgICBlbmNyeXB0aW9uS2V5OiBrbXNLZXksXG4gICAgICBibG9ja1B1YmxpY0FjY2VzczogczMuQmxvY2tQdWJsaWNBY2Nlc3MuQkxPQ0tfQUxMLFxuICAgICAgdmVyc2lvbmVkOiB0cnVlLFxuICAgICAgbGlmZWN5Y2xlUnVsZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGlkOiAnRGVsZXRlT2xkQWNjZXNzTG9ncycsXG4gICAgICAgICAgZXhwaXJhdGlvbjogY2RrLkR1cmF0aW9uLmRheXMoOTApLFxuICAgICAgICAgIGFib3J0SW5jb21wbGV0ZU11bHRpcGFydFVwbG9hZEFmdGVyOiBjZGsuRHVyYXRpb24uZGF5cyg3KSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4sXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgU1NMIGNlcnRpZmljYXRlIGZvciBib3RoIGRvbWFpbnNcbiAgICB0aGlzLmNlcnRpZmljYXRlID0gbmV3IGNlcnRpZmljYXRlbWFuYWdlci5DZXJ0aWZpY2F0ZSh0aGlzLCAnU1NMQ2VydGlmaWNhdGUnLCB7XG4gICAgICBkb21haW5OYW1lOiAnYXBwLmJlbmRjYXJlLmNvbScsXG4gICAgICBzdWJqZWN0QWx0ZXJuYXRpdmVOYW1lczogWydzdGFnaW5nLmJlbmRjYXJlLmNvbSddLFxuICAgICAgdmFsaWRhdGlvbjogY2VydGlmaWNhdGVtYW5hZ2VyLkNlcnRpZmljYXRlVmFsaWRhdGlvbi5mcm9tRG5zKHRoaXMuaG9zdGVkWm9uZSksXG4gICAgICBrZXlBbGdvcml0aG06IGNlcnRpZmljYXRlbWFuYWdlci5LZXlBbGdvcml0aG0uUlNBXzIwNDgsXG4gICAgfSk7XG5cbiAgICAvLyBBTEIgU2VjdXJpdHkgR3JvdXAgLSBBbGxvdyBIVFRQUyBhbmQgSFRUUCBmcm9tIGludGVybmV0XG4gICAgdGhpcy5hbGJTZWN1cml0eUdyb3VwID0gbmV3IGVjMi5TZWN1cml0eUdyb3VwKHRoaXMsICdBTEJTZWN1cml0eUdyb3VwJywge1xuICAgICAgdnBjOiB0aGlzLnZwYyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU2VjdXJpdHkgZ3JvdXAgZm9yIEJDT1MgQXBwbGljYXRpb24gTG9hZCBCYWxhbmNlcicsXG4gICAgICBhbGxvd0FsbE91dGJvdW5kOiB0cnVlLFxuICAgIH0pO1xuXG4gICAgdGhpcy5hbGJTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgZWMyLlBlZXIuYW55SXB2NCgpLFxuICAgICAgZWMyLlBvcnQudGNwKDQ0MyksXG4gICAgICAnQWxsb3cgSFRUUFMgdHJhZmZpYyBmcm9tIGludGVybmV0J1xuICAgICk7XG5cbiAgICB0aGlzLmFsYlNlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICBlYzIuUGVlci5hbnlJcHY0KCksXG4gICAgICBlYzIuUG9ydC50Y3AoODApLFxuICAgICAgJ0FsbG93IEhUVFAgdHJhZmZpYyBmcm9tIGludGVybmV0IChmb3IgcmVkaXJlY3QpJ1xuICAgICk7XG5cbiAgICAvLyBFQ1MgU2VjdXJpdHkgR3JvdXAgLSBBbGxvdyB0cmFmZmljIG9ubHkgZnJvbSBBTEJcbiAgICB0aGlzLmVjc1NlY3VyaXR5R3JvdXAgPSBuZXcgZWMyLlNlY3VyaXR5R3JvdXAodGhpcywgJ0VDU1NlY3VyaXR5R3JvdXAnLCB7XG4gICAgICB2cGM6IHRoaXMudnBjLFxuICAgICAgZGVzY3JpcHRpb246ICdTZWN1cml0eSBncm91cCBmb3IgQkNPUyBFQ1MgdGFza3MnLFxuICAgICAgYWxsb3dBbGxPdXRib3VuZDogZmFsc2UsIC8vIEV4cGxpY2l0bHkgY29udHJvbCBvdXRib3VuZCB0cmFmZmljXG4gICAgfSk7XG5cbiAgICB0aGlzLmVjc1NlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICBlYzIuUGVlci5zZWN1cml0eUdyb3VwSWQodGhpcy5hbGJTZWN1cml0eUdyb3VwLnNlY3VyaXR5R3JvdXBJZCksXG4gICAgICBlYzIuUG9ydC50Y3AoODApLFxuICAgICAgJ0FsbG93IEhUVFAgdHJhZmZpYyBmcm9tIEFMQidcbiAgICApO1xuXG4gICAgLy8gQWxsb3cgb3V0Ym91bmQgSFRUUFMgdG8gVlBDIENJRFIgZm9yIFZQQyBlbmRwb2ludHNcbiAgICB0aGlzLmVjc1NlY3VyaXR5R3JvdXAuYWRkRWdyZXNzUnVsZShcbiAgICAgIGVjMi5QZWVyLmlwdjQodGhpcy52cGMudnBjQ2lkckJsb2NrKSxcbiAgICAgIGVjMi5Qb3J0LnRjcCg0NDMpLFxuICAgICAgJ0FsbG93IEhUVFBTIHRvIFZQQyBlbmRwb2ludHMnXG4gICAgKTtcblxuICAgIC8vIEFsbG93IG91dGJvdW5kIEROU1xuICAgIHRoaXMuZWNzU2VjdXJpdHlHcm91cC5hZGRFZ3Jlc3NSdWxlKFxuICAgICAgZWMyLlBlZXIuYW55SXB2NCgpLFxuICAgICAgZWMyLlBvcnQudGNwKDUzKSxcbiAgICAgICdBbGxvdyBETlMgVENQJ1xuICAgICk7XG5cbiAgICB0aGlzLmVjc1NlY3VyaXR5R3JvdXAuYWRkRWdyZXNzUnVsZShcbiAgICAgIGVjMi5QZWVyLmFueUlwdjQoKSxcbiAgICAgIGVjMi5Qb3J0LnVkcCg1MyksXG4gICAgICAnQWxsb3cgRE5TIFVEUCdcbiAgICApO1xuXG4gICAgLy8gQ3JlYXRlIFZQQyBFbmRwb2ludHMgZm9yIEVDUyB0YXNrcyBpbiBwcml2YXRlIHN1Ym5ldHNcbiAgICBjb25zdCB2cGNFbmRwb2ludHMgPSBbXG4gICAgICB7XG4gICAgICAgIG5hbWU6ICdFQ1ItQVBJJyxcbiAgICAgICAgc2VydmljZTogZWMyLkludGVyZmFjZVZwY0VuZHBvaW50QXdzU2VydmljZS5FQ1IsXG4gICAgICB9LFxuICAgICAge1xuICAgICAgICBuYW1lOiAnRUNSLURLUicsXG4gICAgICAgIHNlcnZpY2U6IGVjMi5JbnRlcmZhY2VWcGNFbmRwb2ludEF3c1NlcnZpY2UuRUNSX0RPQ0tFUixcbiAgICAgIH0sXG4gICAgICB7XG4gICAgICAgIG5hbWU6ICdDbG91ZFdhdGNoLUxvZ3MnLFxuICAgICAgICBzZXJ2aWNlOiBlYzIuSW50ZXJmYWNlVnBjRW5kcG9pbnRBd3NTZXJ2aWNlLkNMT1VEV0FUQ0hfTE9HUyxcbiAgICAgIH0sXG4gICAgICB7XG4gICAgICAgIG5hbWU6ICdTZWNyZXRzLU1hbmFnZXInLFxuICAgICAgICBzZXJ2aWNlOiBlYzIuSW50ZXJmYWNlVnBjRW5kcG9pbnRBd3NTZXJ2aWNlLlNFQ1JFVFNfTUFOQUdFUixcbiAgICAgIH0sXG4gICAgICB7XG4gICAgICAgIG5hbWU6ICdTVFMnLFxuICAgICAgICBzZXJ2aWNlOiBlYzIuSW50ZXJmYWNlVnBjRW5kcG9pbnRBd3NTZXJ2aWNlLlNUUyxcbiAgICAgIH0sXG4gICAgXTtcblxuICAgIHZwY0VuZHBvaW50cy5mb3JFYWNoKChlbmRwb2ludCkgPT4ge1xuICAgICAgbmV3IGVjMi5JbnRlcmZhY2VWcGNFbmRwb2ludCh0aGlzLCBgJHtlbmRwb2ludC5uYW1lfS1FbmRwb2ludGAsIHtcbiAgICAgICAgdnBjOiB0aGlzLnZwYyxcbiAgICAgICAgc2VydmljZTogZW5kcG9pbnQuc2VydmljZSxcbiAgICAgICAgc3VibmV0czoge1xuICAgICAgICAgIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfV0lUSF9FR1JFU1MsXG4gICAgICAgIH0sXG4gICAgICAgIHNlY3VyaXR5R3JvdXBzOiBbdGhpcy5lY3NTZWN1cml0eUdyb3VwXSxcbiAgICAgICAgcHJpdmF0ZURuc0VuYWJsZWQ6IHRydWUsXG4vLyBQb2xpY3kgbWFuYWdlZCBzZXBhcmF0ZWx5XG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIC8vIFMzIEdhdGV3YXkgRW5kcG9pbnQgZm9yIEVDUiBpbWFnZSBsYXllcnNcbiAgICBuZXcgZWMyLkdhdGV3YXlWcGNFbmRwb2ludCh0aGlzLCAnUzMtR2F0ZXdheS1FbmRwb2ludCcsIHtcbiAgICAgIHZwYzogdGhpcy52cGMsXG4gICAgICBzZXJ2aWNlOiBlYzIuR2F0ZXdheVZwY0VuZHBvaW50QXdzU2VydmljZS5TMyxcbiAgICAgIHN1Ym5ldHM6IFtcbiAgICAgICAge1xuICAgICAgICAgIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfV0lUSF9FR1JFU1MsXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gQXBwbGljYXRpb24gTG9hZCBCYWxhbmNlclxuICAgIHRoaXMubG9hZEJhbGFuY2VyID0gbmV3IGVsYnYyLkFwcGxpY2F0aW9uTG9hZEJhbGFuY2VyKHRoaXMsICdBcHBsaWNhdGlvbkxvYWRCYWxhbmNlcicsIHtcbiAgICAgIHZwYzogdGhpcy52cGMsXG4gICAgICBpbnRlcm5ldEZhY2luZzogdHJ1ZSxcbiAgICAgIHNlY3VyaXR5R3JvdXA6IHRoaXMuYWxiU2VjdXJpdHlHcm91cCxcbiAgICAgIHZwY1N1Ym5ldHM6IHtcbiAgICAgICAgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFVCTElDLFxuICAgICAgfSxcbiAgICAgIGRlbGV0aW9uUHJvdGVjdGlvbjogdHJ1ZSwgLy8gRW5hYmxlIGRlbGV0aW9uIHByb3RlY3Rpb24gZm9yIHByb2R1Y3Rpb25cbiAgICB9KTtcblxuICAgIC8vIEVuYWJsZSBhY2Nlc3MgbG9nZ2luZ1xuICAgIHRoaXMubG9hZEJhbGFuY2VyLmxvZ0FjY2Vzc0xvZ3ModGhpcy5hY2Nlc3NMb2dzQnVja2V0LCAnYWxiLWFjY2Vzcy1sb2dzJyk7XG5cbiAgICAvLyBIVFRQIExpc3RlbmVyIC0gUmVkaXJlY3QgdG8gSFRUUFNcbiAgICB0aGlzLmxvYWRCYWxhbmNlci5hZGRMaXN0ZW5lcignSFRUUExpc3RlbmVyJywge1xuICAgICAgcG9ydDogODAsXG4gICAgICBwcm90b2NvbDogZWxidjIuQXBwbGljYXRpb25Qcm90b2NvbC5IVFRQLFxuICAgICAgZGVmYXVsdEFjdGlvbjogZWxidjIuTGlzdGVuZXJBY3Rpb24ucmVkaXJlY3Qoe1xuICAgICAgICBwcm90b2NvbDogJ0hUVFBTJyxcbiAgICAgICAgcG9ydDogJzQ0MycsXG4gICAgICAgIHBlcm1hbmVudDogdHJ1ZSxcbiAgICAgIH0pLFxuICAgIH0pO1xuXG4gICAgLy8gSFRUUFMgTGlzdGVuZXJcbiAgICB0aGlzLmh0dHBzTGlzdGVuZXIgPSB0aGlzLmxvYWRCYWxhbmNlci5hZGRMaXN0ZW5lcignSFRUUFNMaXN0ZW5lcicsIHtcbiAgICAgIHBvcnQ6IDQ0MyxcbiAgICAgIHByb3RvY29sOiBlbGJ2Mi5BcHBsaWNhdGlvblByb3RvY29sLkhUVFBTLFxuICAgICAgY2VydGlmaWNhdGVzOiBbdGhpcy5jZXJ0aWZpY2F0ZV0sXG4gICAgICBzc2xQb2xpY3k6IGVsYnYyLlNzbFBvbGljeS5UTFMxMixcbiAgICAgIGRlZmF1bHRBY3Rpb246IGVsYnYyLkxpc3RlbmVyQWN0aW9uLmZpeGVkUmVzcG9uc2UoNDA0LCB7XG4gICAgICAgIGNvbnRlbnRUeXBlOiAndGV4dC9wbGFpbicsXG4gICAgICAgIG1lc3NhZ2VCb2R5OiAnTm90IEZvdW5kJyxcbiAgICAgIH0pLFxuICAgIH0pO1xuXG4gICAgLy8gU3RhY2sgb3V0cHV0c1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdWUENJZCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLnZwYy52cGNJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnVlBDIElEJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdMb2FkQmFsYW5jZXJETlNPdXRwdXQnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5sb2FkQmFsYW5jZXIubG9hZEJhbGFuY2VyRG5zTmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnTG9hZCBCYWxhbmNlciBETlMgTmFtZScsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnTG9hZEJhbGFuY2VyQXJuJywge1xuICAgICAgdmFsdWU6IHRoaXMubG9hZEJhbGFuY2VyLmxvYWRCYWxhbmNlckFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnTG9hZCBCYWxhbmNlciBBUk4nLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0NlcnRpZmljYXRlQXJuJywge1xuICAgICAgdmFsdWU6IHRoaXMuY2VydGlmaWNhdGUuY2VydGlmaWNhdGVBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ1NTTCBDZXJ0aWZpY2F0ZSBBUk4nLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0FMQlNlY3VyaXR5R3JvdXBJZCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmFsYlNlY3VyaXR5R3JvdXAuc2VjdXJpdHlHcm91cElkLFxuICAgICAgZGVzY3JpcHRpb246ICdBTEIgU2VjdXJpdHkgR3JvdXAgSUQnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0VDU1NlY3VyaXR5R3JvdXBJZCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmVjc1NlY3VyaXR5R3JvdXAuc2VjdXJpdHlHcm91cElkLFxuICAgICAgZGVzY3JpcHRpb246ICdFQ1MgU2VjdXJpdHkgR3JvdXAgSUQnLFxuICAgIH0pO1xuICB9XG59XG4iXX0=