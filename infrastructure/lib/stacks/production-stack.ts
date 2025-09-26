import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53targets from 'aws-cdk-lib/aws-route53-targets';
import * as applicationautoscaling from 'aws-cdk-lib/aws-applicationautoscaling';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { SecureContainer } from '../constructs/secure-container';
import { Monitoring } from '../constructs/monitoring';
import productionConfig from '../../config/production.json';

interface ProductionStackProps extends cdk.StackProps {
  // No direct references - use CDK outputs/imports instead
}

export class ProductionStack extends cdk.Stack {
  public readonly ecsCluster: ecs.Cluster;
  public readonly ecsService: ecs.FargateService;
  public readonly targetGroup: elbv2.ApplicationTargetGroup;
  // WAF protection handled by staging WAF on shared ALB
  public readonly monitoring: Monitoring;

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

    // Create ECS Cluster
    this.ecsCluster = new ecs.Cluster(this, 'ProductionCluster', {
      clusterName: productionConfig.ecs.clusterName,
      vpc: vpc,
      containerInsights: productionConfig.monitoring.detailedMonitoring,
      enableFargateCapacityProviders: true,
    });

    // Create secure container construct
    const secureContainer = new SecureContainer(this, 'SecureContainer', {
      environment: environment,
      cluster: this.ecsCluster as ecs.ICluster,
      ecrRepository: ecrRepository,
      kmsKey: kmsKey,
      executionRole: executionRole,
      taskRole: taskRole,
      secret: secret,
      cpu: productionConfig.ecs.cpu,
      memory: productionConfig.ecs.memory,
      containerPort: 3000,
      environmentVariables: {
        ENVIRONMENT: environment,
        NEXT_PUBLIC_APP_URL: `https://${productionConfig.domain}`,
      },
    });

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

    // Create ECS Fargate Service
    this.ecsService = new ecs.FargateService(this, 'ProductionService', {
      serviceName: productionConfig.ecs.serviceName,
      cluster: this.ecsCluster as ecs.ICluster,
      taskDefinition: secureContainer.taskDefinition,
      desiredCount: productionConfig.ecs.desiredCount,
      minHealthyPercent: 50,
      maxHealthyPercent: 200,
      vpcSubnets: {
        subnetType: cdk.aws_ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [ecsSecurityGroup],
      assignPublicIp: false,
      healthCheckGracePeriod: cdk.Duration.seconds(300),
      // circuitBreaker: {
      //   rollback: true,
      // }, // Disabled temporarily for initial deployment
    });

    // Associate service with target group
    this.ecsService.attachToApplicationTargetGroup(this.targetGroup);

    // Set target group as default action for HTTPS listener
    new elbv2.ApplicationListenerRule(this, 'ProductionListenerRule', {
      listener: httpsListener,
      priority: 10, // Higher priority than staging
      conditions: [elbv2.ListenerCondition.hostHeaders([productionConfig.domain])],
      action: elbv2.ListenerAction.forward([this.targetGroup]),
    });

    // Skip Route53 A record - app.bendcare.com already exists

    // Skip WAF creation - shared ALB already has staging WAF
    // AWS only allows one WAF Web ACL per load balancer

    // Create monitoring
    this.monitoring = new Monitoring(this, 'Monitoring', {
      environment: environment,
      kmsKey: kmsKey,
      ecsService: this.ecsService,
      ecsCluster: this.ecsCluster as ecs.ICluster,
      loadBalancer: loadBalancer,
      targetGroup: this.targetGroup,
      logGroup: secureContainer.logGroup,
      alertEmails: ['production-alerts@bendcare.com'],
      enableDetailedMonitoring: productionConfig.monitoring.detailedMonitoring,
    });

    // Configure auto scaling (if enabled)
    if (productionConfig.ecs.autoScaling.enabled) {
      const scalableTarget = new applicationautoscaling.ScalableTarget(this, 'ProductionScalableTarget', {
        serviceNamespace: applicationautoscaling.ServiceNamespace.ECS,
        scalableDimension: 'ecs:service:DesiredCount',
        resourceId: `service/${this.ecsCluster.clusterName}/${this.ecsService.serviceName}`,
        minCapacity: productionConfig.ecs.autoScaling.minCapacity,
        maxCapacity: productionConfig.ecs.autoScaling.maxCapacity,
      });

      // CPU-based scaling
      scalableTarget.scaleToTrackMetric('ProductionCPUScaling', {
        targetValue: productionConfig.ecs.autoScaling.targetCpuUtilization,
        predefinedMetric: applicationautoscaling.PredefinedMetric.ECS_SERVICE_AVERAGE_CPU_UTILIZATION,
        scaleOutCooldown: cdk.Duration.seconds(productionConfig.ecs.autoScaling.scaleOutCooldown),
        scaleInCooldown: cdk.Duration.seconds(productionConfig.ecs.autoScaling.scaleInCooldown),
      });

      // Memory-based scaling
      scalableTarget.scaleToTrackMetric('ProductionMemoryScaling', {
        targetValue: productionConfig.ecs.autoScaling.targetMemoryUtilization,
        predefinedMetric: applicationautoscaling.PredefinedMetric.ECS_SERVICE_AVERAGE_MEMORY_UTILIZATION,
        scaleOutCooldown: cdk.Duration.seconds(productionConfig.ecs.autoScaling.scaleOutCooldown),
        scaleInCooldown: cdk.Duration.seconds(productionConfig.ecs.autoScaling.scaleInCooldown),
      });
    }

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

    new cdk.CfnOutput(this, 'ProductionServiceName', {
      value: this.ecsService.serviceName,
      description: 'Production ECS Service Name',
      exportName: 'BCOS-Production-ServiceName',
    });

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

    new cdk.CfnOutput(this, 'ProductionDashboardURL', {
      value: `https://console.aws.amazon.com/cloudwatch/home?region=${cdk.Stack.of(this).region}#dashboards:name=BCOS-${environment}-Dashboard`,
      description: 'Production CloudWatch Dashboard URL',
      exportName: 'BCOS-Production-DashboardURL',
    });
  }
}
