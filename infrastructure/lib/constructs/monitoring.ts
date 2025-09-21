import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';

export interface MonitoringProps {
  /**
   * Environment name (staging or production)
   */
  environment: string;

  /**
   * KMS key for encryption
   */
  kmsKey: kms.IKey;

  /**
   * ECS service to monitor
   */
  ecsService: ecs.IService;

  /**
   * ECS cluster
   */
  ecsCluster: ecs.ICluster;

  /**
   * Application Load Balancer to monitor
   */
  loadBalancer: elbv2.IApplicationLoadBalancer;

  /**
   * Target group to monitor
   */
  targetGroup: elbv2.IApplicationTargetGroup;

  /**
   * Log group to create metric filters for
   */
  logGroup: logs.ILogGroup;

  /**
   * Email addresses for alert notifications
   */
  alertEmails?: string[];

  /**
   * Enable detailed monitoring (default: true for production)
   */
  enableDetailedMonitoring?: boolean;
}

/**
 * Monitoring construct that creates CloudWatch alarms, dashboards, and SNS notifications
 * for comprehensive application monitoring
 */
export class Monitoring extends Construct {
  public readonly alertTopic: sns.Topic;
  public readonly dashboard: cloudwatch.Dashboard;

  constructor(scope: Construct, id: string, props: MonitoringProps) {
    super(scope, id);

    const {
      environment,
      kmsKey,
      ecsService,
      ecsCluster,
      loadBalancer,
      targetGroup,
      logGroup,
      alertEmails = [],
      enableDetailedMonitoring = environment === 'production',
    } = props;

    // Create SNS topic for alerts
    this.alertTopic = new sns.Topic(this, 'AlertTopic', {
      topicName: `bcos-${environment}-alerts`,
      displayName: `BCOS ${environment} Alerts`,
      masterKey: kmsKey,
    });

    // Add email subscriptions
    alertEmails.forEach((email, index) => {
      this.alertTopic.addSubscription(
        new snsSubscriptions.EmailSubscription(email, {
          json: false,
        })
      );
    });

    // Create CloudWatch Dashboard
    this.dashboard = new cloudwatch.Dashboard(this, 'Dashboard', {
      dashboardName: `BCOS-${environment}-Dashboard`,
    });

    // ECS Service Alarms
    this.createECSAlarms(ecsService, ecsCluster, environment);

    // ALB Alarms
    this.createALBAlarms(loadBalancer, targetGroup, environment);

    // Application Log Alarms
    this.createApplicationLogAlarms(logGroup, environment);

    // Add widgets to dashboard
    this.addDashboardWidgets(ecsService, ecsCluster, loadBalancer, targetGroup, environment);

    // Create composite alarm for service health
    if (environment === 'production') {
      this.createCompositeAlarms(environment);
    }
  }

  private createECSAlarms(service: ecs.IService, cluster: ecs.ICluster, environment: string): void {
    // Helper function to create alarms with proper actions
    const createAlarm = (id: string, props: cloudwatch.AlarmProps) => {
      const alarm = new cloudwatch.Alarm(this, id, props);
      alarm.addAlarmAction(new cloudwatchActions.SnsAction(this.alertTopic));
      return alarm;
    };

    // Service running task count alarm
    createAlarm('ECS-RunningTaskCount', {
      alarmName: `BCOS-${environment}-ECS-LowTaskCount`,
      alarmDescription: `ECS service has fewer running tasks than desired for ${environment}`,
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ECS',
        metricName: 'RunningTaskCount',
        dimensionsMap: {
          ServiceName: service.serviceName,
          ClusterName: cluster.clusterName,
        },
        statistic: 'Average',
        period: cdk.Duration.minutes(1),
      }),
      threshold: environment === 'production' ? 1 : 0.5,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      evaluationPeriods: 2,
    });

    // CPU utilization alarm
    createAlarm('ECS-HighCPU', {
      alarmName: `BCOS-${environment}-ECS-HighCPU`,
      alarmDescription: `ECS service CPU utilization is high for ${environment}`,
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ECS',
        metricName: 'CPUUtilization',
        dimensionsMap: {
          ServiceName: service.serviceName,
          ClusterName: cluster.clusterName,
        },
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: environment === 'production' ? 80 : 85,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 3,
    });

    // Memory utilization alarm
    createAlarm('ECS-HighMemory', {
      alarmName: `BCOS-${environment}-ECS-HighMemory`,
      alarmDescription: `ECS service memory utilization is high for ${environment}`,
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ECS',
        metricName: 'MemoryUtilization',
        dimensionsMap: {
          ServiceName: service.serviceName,
          ClusterName: cluster.clusterName,
        },
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: environment === 'production' ? 85 : 90,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 3,
    });
  }

  private createALBAlarms(
    loadBalancer: elbv2.IApplicationLoadBalancer,
    targetGroup: elbv2.IApplicationTargetGroup,
    environment: string
  ): void {
    // Helper function to create alarms with proper actions
    const createAlarmWithAction = (id: string, props: cloudwatch.AlarmProps) => {
      const alarm = new cloudwatch.Alarm(this, id, props);
      alarm.addAlarmAction(new cloudwatchActions.SnsAction(this.alertTopic));
      return alarm;
    };

    // Get load balancer full name for metrics - handle tokens for synthesis
    const loadBalancerFullName = cdk.Token.isUnresolved(loadBalancer.loadBalancerArn) 
      ? 'dummy-alb-name' 
      : loadBalancer.loadBalancerArn.split('/').slice(1).join('/');
    const targetGroupFullName = cdk.Token.isUnresolved(targetGroup.targetGroupArn) 
      ? 'dummy-tg-name' 
      : targetGroup.targetGroupArn.split('/').slice(1).join('/');

    // Unhealthy target alarm
    createAlarmWithAction('ALB-UnhealthyTargets', {
      alarmName: `BCOS-${environment}-ALB-UnhealthyTargets`,
      alarmDescription: `ALB has unhealthy targets for ${environment}`,
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApplicationELB',
        metricName: 'UnHealthyHostCount',
        dimensionsMap: {
          LoadBalancer: loadBalancerFullName,
          TargetGroup: targetGroupFullName,
        },
        statistic: 'Maximum',
        period: cdk.Duration.minutes(1),
      }),
      threshold: 0,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 2,
    });

    // High 5XX error rate alarm
    createAlarmWithAction('ALB-High5XXErrors', {
      alarmName: `BCOS-${environment}-ALB-High5XXErrors`,
      alarmDescription: `ALB is returning high 5XX errors for ${environment}`,
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApplicationELB',
        metricName: 'HTTPCode_ELB_5XX_Count',
        dimensionsMap: {
          LoadBalancer: loadBalancerFullName,
        },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: environment === 'production' ? 10 : 20,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 2,
    });

    // High response time alarm
    createAlarmWithAction('ALB-HighResponseTime', {
      alarmName: `BCOS-${environment}-ALB-HighResponseTime`,
      alarmDescription: `ALB response time is high for ${environment}`,
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApplicationELB',
        metricName: 'TargetResponseTime',
        dimensionsMap: {
          LoadBalancer: loadBalancerFullName,
        },
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: environment === 'production' ? 2 : 5,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 3,
    });
  }

  private createApplicationLogAlarms(logGroup: logs.ILogGroup, environment: string): void {
    // Error log metric filter
    const errorMetricFilter = new logs.MetricFilter(this, 'ErrorLogFilter', {
      logGroup: logGroup,
      metricNamespace: `BCOS/${environment}`,
      metricName: 'ErrorCount',
      metricValue: '1',
      filterPattern: logs.FilterPattern.anyTerm('ERROR', 'FATAL', 'panic', 'exception'),
      defaultValue: 0,
    });

    // Helper function to create alarms with proper actions
    const createLogAlarmWithAction = (id: string, props: cloudwatch.AlarmProps) => {
      const alarm = new cloudwatch.Alarm(this, id, props);
      alarm.addAlarmAction(new cloudwatchActions.SnsAction(this.alertTopic));
      return alarm;
    };

    // Error count alarm
    createLogAlarmWithAction('App-HighErrorRate', {
      alarmName: `BCOS-${environment}-App-HighErrorRate`,
      alarmDescription: `Application is logging high error rates for ${environment}`,
      metric: errorMetricFilter.metric({
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: environment === 'production' ? 5 : 10,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 2,
    });

    // Health check failure metric filter (simplified pattern)
    const healthCheckMetricFilter = new logs.MetricFilter(this, 'HealthCheckFailureFilter', {
      logGroup: logGroup,
      metricNamespace: `BCOS/${environment}`,
      metricName: 'HealthCheckFailures',
      metricValue: '1',
      filterPattern: logs.FilterPattern.literal('[timestamp, level="ERROR", message="*health*"]'),
      defaultValue: 0,
    });

    // Health check failure alarm
    createLogAlarmWithAction('App-HealthCheckFailures', {
      alarmName: `BCOS-${environment}-App-HealthCheckFailures`,
      alarmDescription: `Application health checks are failing for ${environment}`,
      metric: healthCheckMetricFilter.metric({
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 2,
    });
  }

  private addDashboardWidgets(
    service: ecs.IService,
    cluster: ecs.ICluster,
    loadBalancer: elbv2.IApplicationLoadBalancer,
    targetGroup: elbv2.IApplicationTargetGroup,
    environment: string
  ): void {
    // Get load balancer full name for metrics - handle tokens for synthesis
    const loadBalancerFullName = cdk.Token.isUnresolved(loadBalancer.loadBalancerArn) 
      ? 'dummy-alb-name' 
      : loadBalancer.loadBalancerArn.split('/').slice(1).join('/');

    // ECS Metrics Widget
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        warnings: undefined,
        title: `ECS Service Metrics - ${environment}`,
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/ECS',
            metricName: 'CPUUtilization',
            dimensionsMap: {
              ServiceName: service.serviceName,
              ClusterName: cluster.clusterName,
            },
            statistic: 'Average',
          }),
        ],
        right: [
          new cloudwatch.Metric({
            namespace: 'AWS/ECS',
            metricName: 'MemoryUtilization',
            dimensionsMap: {
              ServiceName: service.serviceName,
              ClusterName: cluster.clusterName,
            },
            statistic: 'Average',
          }),
        ],
        width: 12,
      })
    );

    // ALB Metrics Widget
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        warnings: undefined,
        title: `ALB Metrics - ${environment}`,
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/ApplicationELB',
            metricName: 'RequestCount',
            dimensionsMap: {
              LoadBalancer: loadBalancerFullName,
            },
            statistic: 'Sum',
          }),
        ],
        right: [
          new cloudwatch.Metric({
            namespace: 'AWS/ApplicationELB',
            metricName: 'TargetResponseTime',
            dimensionsMap: {
              LoadBalancer: loadBalancerFullName,
            },
            statistic: 'Average',
          }),
        ],
        width: 12,
      })
    );

    // Application Error Widget
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        warnings: undefined,
        title: `Application Errors - ${environment}`,
        left: [
          new cloudwatch.Metric({
            namespace: `BCOS/${environment}`,
            metricName: 'ErrorCount',
            statistic: 'Sum',
          }),
        ],
        width: 12,
      })
    );
  }

  private createCompositeAlarms(environment: string): void {
    // Service health composite alarm (production only)
    const compositeAlarm = new cloudwatch.CompositeAlarm(this, 'ServiceHealth-Composite', {
      compositeAlarmName: `BCOS-${environment}-ServiceHealth`,
      alarmDescription: `Overall service health for ${environment}`,
      alarmRule: cloudwatch.AlarmRule.anyOf(
        cloudwatch.AlarmRule.fromAlarm(
          cloudwatch.Alarm.fromAlarmArn(
            this,
            'RefECSTaskCount',
            `arn:aws:cloudwatch:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:alarm:BCOS-${environment}-ECS-LowTaskCount`
          ),
          cloudwatch.AlarmState.ALARM
        ),
        cloudwatch.AlarmRule.fromAlarm(
          cloudwatch.Alarm.fromAlarmArn(
            this,
            'RefUnhealthyTargets',
            `arn:aws:cloudwatch:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:alarm:BCOS-${environment}-ALB-UnhealthyTargets`
          ),
          cloudwatch.AlarmState.ALARM
        )
      ),
    });
    compositeAlarm.addAlarmAction(new cloudwatchActions.SnsAction(this.alertTopic));
  }
}
