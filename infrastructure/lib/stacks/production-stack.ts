import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53targets from 'aws-cdk-lib/aws-route53-targets';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import productionConfig from '../../config/production.json';

interface ProductionStackProps extends cdk.StackProps {
  // No direct references - use CDK outputs/imports instead
}

export class ProductionStack extends cdk.Stack {
  public readonly ecsCluster: ecs.Cluster;
  public readonly targetGroup: elbv2.ApplicationTargetGroup;
  // ECS service and monitoring created by application deployment workflow

  constructor(scope: Construct, id: string, props: ProductionStackProps) {
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

    // Create ECS Cluster with enhanced monitoring
    this.ecsCluster = new ecs.Cluster(this, 'ProductionCluster', {
      clusterName: productionConfig.ecs.clusterName,
      vpc: vpc,
      containerInsights: productionConfig.monitoring.detailedMonitoring,
      enableFargateCapacityProviders: true,
      executeCommandConfiguration: {
        // Enable execute command for debugging (with logging)
        logging: ecs.ExecuteCommandLogging.OVERRIDE,
        logConfiguration: {
          cloudWatchLogGroup: new logs.LogGroup(this, 'ExecuteCommandLogGroup', {
            logGroupName: `/ecs/execute-command/bcos-production-${Date.now()}`,
            retention: logs.RetentionDays.ONE_MONTH,
          }),
          cloudWatchEncryptionEnabled: true,
        },
      },
    });

    // Infrastructure creates cluster and target group only 
    // Task definitions and ECS service are created by application deployment workflow
    // This matches the staging architecture pattern exactly

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

    // ECS Service will be created by application deployment workflow
    // This matches staging architecture where deploy-staging.yml creates the service

    // Set target group as default action for HTTPS listener
    new elbv2.ApplicationListenerRule(this, 'ProductionListenerRule', {
      listener: httpsListener,
      priority: 10, // Higher priority than staging
      conditions: [elbv2.ListenerCondition.hostHeaders([productionConfig.domain])],
      action: elbv2.ListenerAction.forward([this.targetGroup]),
    });

    // Route53 A record for app.bendcare.com already exists, managed externally
    // The A record pointing app.bendcare.com to the load balancer is already configured
    // and should not be managed by this stack to avoid conflicts
    
    // new route53.ARecord(this, 'ProductionARecord', {
    //   zone: hostedZone,
    //   recordName: 'app',
    //   target: route53.RecordTarget.fromAlias(
    //     new route53targets.LoadBalancerTarget(loadBalancer)
    //   ),
    // });

    // WAF protection temporarily disabled - shared ALB already has staging WAF
    // The staging and production environments share the same ALB, and AWS only allows
    // one WAF Web ACL per load balancer. The existing staging WAF protects both environments.
    // TODO: Consider creating a unified WAF that handles both staging and production traffic
    
    // Placeholder for WAF protection (disabled)
    // this.wafProtection = new WafProtection(this, 'WAFProtection', {
    //   environment: environment,
    //   kmsKey: kmsKey,
    //   rateLimitPerIP: productionConfig.waf.rateLimitPerIP,
    //   enableGeoBlocking: productionConfig.waf.geoBlocking?.enabled || false,
    //   blockedCountries: productionConfig.waf.geoBlocking?.blockedCountries || [],
    //   enableManagedRules: true,
    // });

    // Associate WAF with load balancer (disabled - conflicts with staging WAF)
    // this.wafProtection.associateWithLoadBalancer(albArn);

    // Monitoring will be configured after ECS service is created by application deployment
    // This matches staging architecture pattern

    // Auto-scaling will be configured after ECS service is created by application deployment
    // This matches staging architecture pattern

    // Apply tags
    Object.entries(productionConfig.tags).forEach(([key, value]) => {
      cdk.Tags.of(this).add(key, value);
    });

    // Stack outputs
    new cdk.CfnOutput(this, 'ProductionClusterName', {
      value: this.ecsCluster.clusterName,
      description: 'Production ECS Cluster Name',
      exportName: 'BCOS-Production-ClusterName',
    });

    // ECS Service name will be available after application deployment creates it
    // Service name: bcos-production-service (from productionConfig)

    new cdk.CfnOutput(this, 'ProductionURL', {
      value: `https://${productionConfig.domain}`,
      description: 'Production Application URL',
      exportName: 'BCOS-Production-URL',
    });

    new cdk.CfnOutput(this, 'ProductionTargetGroupArn', {
      value: this.targetGroup.targetGroupArn,
      description: 'Production Target Group ARN',
      exportName: 'BCOS-Production-TargetGroupArn',
    });

    // CloudWatch Dashboard will be created by application deployment workflow
  }
}
