import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
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
export declare class Monitoring extends Construct {
    readonly alertTopic: sns.Topic;
    readonly dashboard: cloudwatch.Dashboard;
    private readonly alarms;
    constructor(scope: Construct, id: string, props: MonitoringProps);
    private createECSAlarms;
    private createALBAlarms;
    private createApplicationLogAlarms;
    private addDashboardWidgets;
    private createCompositeAlarmsFixed;
}
