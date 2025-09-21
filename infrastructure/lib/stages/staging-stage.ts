import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53targets from 'aws-cdk-lib/aws-route53-targets';
import * as applicationautoscaling from 'aws-cdk-lib/aws-applicationautoscaling';
import { Construct } from 'constructs';
import { SecurityStack } from '../stacks/security-stack';
import { NetworkStack } from '../stacks/network-stack';
import { SecureContainer } from '../constructs/secure-container';
import { WafProtection } from '../constructs/waf-protection';
import { Monitoring } from '../constructs/monitoring';
import stagingConfig from '../../config/staging.json';

interface StagingStageProps extends cdk.StageProps {
  securityStack: SecurityStack;
  networkStack: NetworkStack;
}

export class StagingStage extends cdk.Stage {
  public readonly stack: cdk.Stack;
  public readonly ecsCluster: ecs.Cluster;
  public readonly ecsService: ecs.FargateService;
  public readonly targetGroup: elbv2.ApplicationTargetGroup;
  public readonly wafProtection: WafProtection;
  public readonly monitoring: Monitoring;

  constructor(scope: Construct, id: string, props: StagingStageProps) {
    super(scope, id, props);

    const { securityStack, networkStack } = props;
    const environment = 'staging';

    // Create a stack within the stage
    this.stack = new cdk.Stack(this, 'StagingStack', {
      env: props.env,
    });

    // Create ECS Cluster
    this.ecsCluster = new ecs.Cluster(this.stack, 'StagingCluster', {
      clusterName: stagingConfig.ecs.clusterName,
      vpc: networkStack.vpc,
      containerInsights: stagingConfig.monitoring.detailedMonitoring,
      enableFargateCapacityProviders: true,
    });

    // Create secure container construct
    const secureContainer = new SecureContainer(this.stack, 'SecureContainer', {
      environment: environment,
      cluster: this.ecsCluster,
      ecrRepository: securityStack.ecrRepository,
      kmsKey: securityStack.kmsKey,
      executionRole: securityStack.ecsTaskExecutionRole,
      taskRole: securityStack.ecsTaskRole,
      secret: securityStack.stagingSecret,
      cpu: stagingConfig.ecs.cpu,
      memory: stagingConfig.ecs.memory,
      containerPort: 80,
      environmentVariables: {
        ENVIRONMENT: environment,
        NEXT_PUBLIC_APP_URL: `https://${stagingConfig.domain}`,
      },
    });

    // Create target group for staging
    this.targetGroup = new elbv2.ApplicationTargetGroup(this.stack, 'StagingTargetGroup', {
      targetGroupName: 'bcos-staging-tg',
      vpc: networkStack.vpc,
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
    this.ecsService = new ecs.FargateService(this.stack, 'StagingService', {
      serviceName: stagingConfig.ecs.serviceName,
      cluster: this.ecsCluster,
      taskDefinition: secureContainer.taskDefinition,
      desiredCount: stagingConfig.ecs.desiredCount,
      minHealthyPercent: 50,
      maxHealthyPercent: 200,
      vpcSubnets: {
        subnetType: cdk.aws_ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [networkStack.ecsSecurityGroup],
      assignPublicIp: false,
// Logging enabled by default
      healthCheckGracePeriod: cdk.Duration.seconds(120),
      circuitBreaker: {
        rollback: true,
      },
    });

    // Associate service with target group
    this.ecsService.attachToApplicationTargetGroup(this.targetGroup);

    // Add listener rule for staging subdomain
    new elbv2.ApplicationListenerRule(this.stack, 'StagingListenerRule', {
      listener: networkStack.httpsListener,
      priority: 100,
      conditions: [elbv2.ListenerCondition.hostHeaders([stagingConfig.domain])],
      action: elbv2.ListenerAction.forward([this.targetGroup]),
    });

    // Create Route53 record for staging domain
    new route53.ARecord(this.stack, 'StagingARecord', {
      zone: networkStack.hostedZone,
      recordName: 'staging',
      target: route53.RecordTarget.fromAlias(
        new route53targets.LoadBalancerTarget(networkStack.loadBalancer)
      ),
    });

    // Create WAF protection
    this.wafProtection = new WafProtection(this.stack, 'WAFProtection', {
      environment: environment,
      kmsKey: securityStack.kmsKey,
      rateLimitPerIP: stagingConfig.waf.rateLimitPerIP,
      enableGeoBlocking: false,
      enableManagedRules: true,
    });

    // Associate WAF with load balancer
    this.wafProtection.associateWithLoadBalancer(networkStack.loadBalancer.loadBalancerArn);

    // Create monitoring
    this.monitoring = new Monitoring(this.stack, 'Monitoring', {
      environment: environment,
      kmsKey: securityStack.kmsKey,
      ecsService: this.ecsService,
      ecsCluster: this.ecsCluster,
      loadBalancer: networkStack.loadBalancer,
      targetGroup: this.targetGroup,
      logGroup: secureContainer.logGroup,
      alertEmails: ['devops@bendcare.com'], // Replace with actual email
      enableDetailedMonitoring: stagingConfig.monitoring.detailedMonitoring,
    });

    // Configure auto scaling (if enabled)
    if (stagingConfig.ecs.autoScaling.enabled) {
      const scalableTarget = new applicationautoscaling.ScalableTarget(this.stack, 'StagingScalableTarget', {
        serviceNamespace: applicationautoscaling.ServiceNamespace.ECS,
        scalableDimension: 'ecs:service:DesiredCount',
        resourceId: `service/${this.ecsCluster.clusterName}/${this.ecsService.serviceName}`,
        minCapacity: stagingConfig.ecs.autoScaling.minCapacity,
        maxCapacity: stagingConfig.ecs.autoScaling.maxCapacity,
      });

      // CPU-based scaling
      scalableTarget.scaleToTrackMetric('StagingCPUScaling', {
        targetValue: stagingConfig.ecs.autoScaling.targetCpuUtilization,
        predefinedMetric: applicationautoscaling.PredefinedMetric.ECS_SERVICE_AVERAGE_CPU_UTILIZATION,
        scaleOutCooldown: cdk.Duration.seconds(300),
        scaleInCooldown: cdk.Duration.seconds(600),
      });
    }

    // Apply tags
    Object.entries(stagingConfig.tags).forEach(([key, value]) => {
      cdk.Tags.of(this.stack).add(key, value);
    });

    // Stack outputs
    new cdk.CfnOutput(this.stack, 'StagingClusterName', {
      value: this.ecsCluster.clusterName,
      description: 'Staging ECS Cluster Name',
      exportName: 'BCOS-Staging-ClusterName',
    });

    new cdk.CfnOutput(this.stack, 'StagingServiceName', {
      value: this.ecsService.serviceName,
      description: 'Staging ECS Service Name',
      exportName: 'BCOS-Staging-ServiceName',
    });

    new cdk.CfnOutput(this.stack, 'StagingURL', {
      value: `https://${stagingConfig.domain}`,
      description: 'Staging Application URL',
      exportName: 'BCOS-Staging-URL',
    });

    new cdk.CfnOutput(this.stack, 'StagingTargetGroupArn', {
      value: this.targetGroup.targetGroupArn,
      description: 'Staging Target Group ARN',
      exportName: 'BCOS-Staging-TargetGroupArn',
    });
  }
}
