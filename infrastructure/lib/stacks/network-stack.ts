import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as certificatemanager from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

interface NetworkStackProps extends cdk.StackProps {
  kmsKey: kms.Key;
}

export class NetworkStack extends cdk.Stack {
  public readonly vpc: ec2.IVpc;
  public readonly albSecurityGroup: ec2.SecurityGroup;
  public readonly ecsSecurityGroup: ec2.SecurityGroup;
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer;
  public readonly httpsListener: elbv2.ApplicationListener;
  public readonly certificate: certificatemanager.Certificate;
  public readonly hostedZone: route53.IHostedZone;
  public readonly accessLogsBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: NetworkStackProps) {
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

    this.albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'Allow HTTPS traffic from internet'
    );

    this.albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'Allow HTTP traffic from internet (for redirect)'
    );

    // ECS Security Group - Allow traffic only from ALB
    this.ecsSecurityGroup = new ec2.SecurityGroup(this, 'ECSSecurityGroup', {
      vpc: this.vpc,
      description: 'Security group for BCOS ECS tasks',
      allowAllOutbound: false, // Explicitly control outbound traffic
    });

    this.ecsSecurityGroup.addIngressRule(
      ec2.Peer.securityGroupId(this.albSecurityGroup.securityGroupId),
      ec2.Port.tcp(80),
      'Allow HTTP traffic from ALB'
    );

    // Allow outbound HTTPS to VPC CIDR for VPC endpoints
    this.ecsSecurityGroup.addEgressRule(
      ec2.Peer.ipv4(this.vpc.vpcCidrBlock),
      ec2.Port.tcp(443),
      'Allow HTTPS to VPC endpoints'
    );

    // Allow outbound DNS
    this.ecsSecurityGroup.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(53),
      'Allow DNS TCP'
    );

    this.ecsSecurityGroup.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.udp(53),
      'Allow DNS UDP'
    );

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
