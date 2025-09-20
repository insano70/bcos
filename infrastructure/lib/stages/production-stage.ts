import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53targets from 'aws-cdk-lib/aws-route53-targets';
import * as applicationautoscaling from 'aws-cdk-lib/aws-applicationautoscaling';
import * as backup from 'aws-cdk-lib/aws-backup';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { SecurityStack } from '../stacks/security-stack';
import { NetworkStack } from '../stacks/network-stack';
import { SecureContainer } from '../constructs/secure-container';
import { WafProtection } from '../constructs/waf-protection';
import { Monitoring } from '../constructs/monitoring';
import productionConfig from '../../config/production.json';

interface ProductionStageProps extends cdk.StageProps {
  securityStack: SecurityStack;
  networkStack: NetworkStack;
}

export class ProductionStage extends cdk.Stage {
  public readonly ecsCluster: ecs.Cluster;
  public readonly ecsService: ecs.FargateService;
  public readonly targetGroup: elbv2.ApplicationTargetGroup;
  public readonly wafProtection: WafProtection;
  public readonly monitoring: Monitoring;
  public readonly backupPlan?: backup.BackupPlan;

  constructor(scope: Construct, id: string, props: ProductionStageProps) {
    super(scope, id, props);

    const { securityStack, networkStack } = props;
    const environment = 'production';

    // Create ECS Cluster with enhanced monitoring
    this.ecsCluster = new ecs.Cluster(this, 'ProductionCluster', {
      clusterName: productionConfig.ecs.clusterName,
      vpc: networkStack.vpc,
      containerInsights: productionConfig.monitoring.detailedMonitoring,
      enableFargateCapacityProviders: true,
      executeCommandConfiguration: {
        // Enable execute command for debugging (with logging)
        logging: ecs.ExecuteCommandLogging.OVERRIDE,
        logConfiguration: {
          cloudWatchLogGroup: new cdk.aws_logs.LogGroup(this, 'ExecuteCommandLogGroup', {
            logGroupName: '/ecs/execute-command/bcos-production',
            retention: cdk.aws_logs.RetentionDays.ONE_MONTH,
            encryptionKey: securityStack.kmsKey,
          }),
          cloudWatchEncryptionEnabled: true,
        },
      },
    });

    // Create secure container construct
    const secureContainer = new SecureContainer(this, 'SecureContainer', {
      environment: environment,
      cluster: this.ecsCluster,
      ecrRepository: securityStack.ecrRepository,
      kmsKey: securityStack.kmsKey,
      executionRole: securityStack.ecsTaskExecutionRole,
      taskRole: securityStack.ecsTaskRole,
      secret: securityStack.productionSecret,
      cpu: productionConfig.ecs.cpu,
      memory: productionConfig.ecs.memory,
      containerPort: 80,
      environmentVariables: {
        ENVIRONMENT: environment,
        NEXT_PUBLIC_APP_URL: `https://${productionConfig.domain}`,
      },
    });

    // Create target group for production
    this.targetGroup = new elbv2.ApplicationTargetGroup(this, 'ProductionTargetGroup', {
      targetGroupName: 'bcos-production-tg',
      vpc: networkStack.vpc,
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        enabled: true,
        path: '/health',
        protocol: elbv2.Protocol.HTTP,
        port: '80',
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

    // Create ECS Fargate Service with enhanced configuration
    this.ecsService = new ecs.FargateService(this, 'ProductionService', {
      serviceName: productionConfig.ecs.serviceName,
      cluster: this.ecsCluster,
      taskDefinition: secureContainer.taskDefinition,
      desiredCount: productionConfig.ecs.desiredCount,
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
      // Production-specific settings
      enableExecuteCommand: true, // For debugging (requires proper IAM permissions)
    });

    // Associate service with target group
    this.ecsService.attachToApplicationTargetGroup(this.targetGroup);

    // Set target group as default action for HTTPS listener
    networkStack.httpsListener.addAction('ProductionDefault', {
      action: elbv2.ListenerAction.forward([this.targetGroup]),
      conditions: [
        elbv2.ListenerCondition.hostHeaders([productionConfig.domain]),
      ],
      priority: 10, // Higher priority than staging
    });

    // Create Route53 record for production domain
    new route53.ARecord(this, 'ProductionARecord', {
      zone: networkStack.hostedZone,
      recordName: 'app',
      target: route53.RecordTarget.fromAlias(
        new route53targets.LoadBalancerTarget(networkStack.loadBalancer)
      ),
    });

    // Create WAF protection with enhanced rules
    this.wafProtection = new WafProtection(this, 'WAFProtection', {
      environment: environment,
      kmsKey: securityStack.kmsKey,
      rateLimitPerIP: productionConfig.waf.rateLimitPerIP,
      enableGeoBlocking: productionConfig.waf.geoBlocking?.enabled || false,
      blockedCountries: productionConfig.waf.geoBlocking?.blockedCountries || [],
      enableManagedRules: true,
    });

    // Associate WAF with load balancer
    this.wafProtection.associateWithLoadBalancer(networkStack.loadBalancer.loadBalancerArn);

    // Create comprehensive monitoring
    this.monitoring = new Monitoring(this, 'Monitoring', {
      environment: environment,
      kmsKey: securityStack.kmsKey,
      ecsService: this.ecsService,
      ecsCluster: this.ecsCluster,
      loadBalancer: networkStack.loadBalancer,
      targetGroup: this.targetGroup,
      logGroup: secureContainer.logGroup,
      alertEmails: ['production-alerts@bendcare.com'], // Replace with actual email
      enableDetailedMonitoring: productionConfig.monitoring.detailedMonitoring,
    });

    // Configure auto scaling
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

      // Request count based scaling (ALB)
      const requestCountMetric = new cdk.aws_cloudwatch.Metric({
        namespace: 'AWS/ApplicationELB',
        metricName: 'RequestCountPerTarget',
        dimensionsMap: {
          LoadBalancer: networkStack.loadBalancer.loadBalancerFullName,
          TargetGroup: this.targetGroup.targetGroupFullName,
        },
        statistic: 'Sum',
        period: cdk.Duration.minutes(1),
      });

      scalableTarget.scaleToTrackMetric('ProductionRequestScaling', {
        targetValue: 1000, // Requests per target per minute
        customMetric: requestCountMetric,
        scaleOutCooldown: cdk.Duration.seconds(productionConfig.ecs.autoScaling.scaleOutCooldown),
        scaleInCooldown: cdk.Duration.seconds(productionConfig.ecs.autoScaling.scaleInCooldown),
      });

      // Scheduled scaling for business hours
      scalableTarget.scaleOnSchedule('ProductionBusinessHoursScaling', {
        schedule: applicationautoscaling.Schedule.cron({
          hour: '8',
          minute: '0',
          weekDay: '1-5', // Monday to Friday
        }),
        minCapacity: 4,
        maxCapacity: productionConfig.ecs.autoScaling.maxCapacity,
      });

      scalableTarget.scaleOnSchedule('ProductionOffHoursScaling', {
        schedule: applicationautoscaling.Schedule.cron({
          hour: '20',
          minute: '0',
          weekDay: '1-5', // Monday to Friday
        }),
        minCapacity: productionConfig.ecs.autoScaling.minCapacity,
        maxCapacity: 10,
      });
    }

    // Create backup plan for production (if enabled)
    if (productionConfig.backup?.enabled) {
      // Create backup role
      const backupRole = new iam.Role(this, 'BackupRole', {
        assumedBy: new iam.ServicePrincipal('backup.amazonaws.com'),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSBackupServiceRolePolicyForBackup'),
        ],
      });

      // Create backup vault
      const backupVault = new backup.BackupVault(this, 'BackupVault', {
        backupVaultName: `bcos-${environment}-backup-vault`,
        encryptionKey: securityStack.kmsKey,
      });

      // Create backup plan
      this.backupPlan = new backup.BackupPlan(this, 'BackupPlan', {
        backupPlanName: `bcos-${environment}-backup-plan`,
        backupVault: backupVault,
        backupPlanRules: [
          // Backup rule configuration would go here
          // Note: BackupPlan API has changed in newer CDK versions
        ],
      });

      // Note: ECS tasks don't have persistent storage to back up
      // This would be used for backing up databases or persistent volumes if added
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
