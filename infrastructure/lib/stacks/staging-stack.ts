import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53targets from 'aws-cdk-lib/aws-route53-targets';
import { Construct } from 'constructs';
import { SecurityStack } from './security-stack';
import { NetworkStack } from './network-stack';
import { SecureContainer } from '../constructs/secure-container';
import { WafProtection } from '../constructs/waf-protection';
import stagingConfig from '../../config/staging.json';

interface StagingStackProps extends cdk.StackProps {
  // No direct references - use CDK outputs/imports instead
}

export class StagingStack extends cdk.Stack {
  public readonly ecsCluster: ecs.Cluster;
  public readonly targetGroup: elbv2.ApplicationTargetGroup;
  public readonly wafProtection: WafProtection;

  constructor(scope: Construct, id: string, props: StagingStackProps) {
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
      clusterName: stagingConfig.ecs.clusterName,
      vpc: vpc,
      containerInsights: stagingConfig.monitoring.detailedMonitoring,
      enableFargateCapacityProviders: true,
    });

    // Note: Task Definition and ECS Service are managed by GitHub Actions
    // CDK only creates infrastructure: cluster, target groups, security groups, DNS

    // Create target group for staging
    this.targetGroup = new elbv2.ApplicationTargetGroup(this, 'StagingTargetGroup', {
      targetGroupName: 'bcos-staging-tg',
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

    // ECS Service will be created and managed by GitHub Actions deployment pipeline

    // Add listener rule for staging subdomain
    new elbv2.ApplicationListenerRule(this, 'StagingListenerRule', {
      listener: httpsListener,
      priority: 100,
      conditions: [elbv2.ListenerCondition.hostHeaders([stagingConfig.domain])],
      action: elbv2.ListenerAction.forward([this.targetGroup]),
    });

    // Create Route53 record for staging domain
    new route53.ARecord(this, 'StagingARecord', {
      zone: hostedZone,
      recordName: 'staging',
      target: route53.RecordTarget.fromAlias(
        new route53targets.LoadBalancerTarget(loadBalancer)
      ),
    });

    // Create WAF protection
    this.wafProtection = new WafProtection(this, 'WAFProtection', {
      environment: environment,
      kmsKey: kmsKey,
      rateLimitPerIP: stagingConfig.waf.rateLimitPerIP,
      enableGeoBlocking: false,
      enableManagedRules: true,
    });

    // Associate WAF with load balancer
    this.wafProtection.associateWithLoadBalancer(albArn);

    // Create monitoring
    // Monitoring will be configured after ECS service is created by GitHub Actions

    // Auto scaling will be configured after ECS service is created by GitHub Actions

    // Apply tags
    Object.entries(stagingConfig.tags).forEach(([key, value]) => {
      cdk.Tags.of(this).add(key, value);
    });

    // Stack outputs
    new cdk.CfnOutput(this, 'StagingClusterName', {
      value: this.ecsCluster.clusterName,
      description: 'Staging ECS Cluster Name',
      exportName: 'BCOS-Staging-ClusterName',
    });

    new cdk.CfnOutput(this, 'StagingURL', {
      value: `https://${stagingConfig.domain}`,
      description: 'Staging Application URL',
      exportName: 'BCOS-Staging-URL',
    });

    new cdk.CfnOutput(this, 'StagingTargetGroupArn', {
      value: this.targetGroup.targetGroupArn,
      description: 'Staging Target Group ARN for GitHub Actions',
      exportName: 'BCOS-Staging-TargetGroupArn',
    });
  }
}
