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
exports.Monitoring = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const cloudwatch = __importStar(require("aws-cdk-lib/aws-cloudwatch"));
const cloudwatchActions = __importStar(require("aws-cdk-lib/aws-cloudwatch-actions"));
const sns = __importStar(require("aws-cdk-lib/aws-sns"));
const snsSubscriptions = __importStar(require("aws-cdk-lib/aws-sns-subscriptions"));
const logs = __importStar(require("aws-cdk-lib/aws-logs"));
const constructs_1 = require("constructs");
/**
 * Monitoring construct that creates CloudWatch alarms, dashboards, and SNS notifications
 * for comprehensive application monitoring
 */
class Monitoring extends constructs_1.Construct {
    alertTopic;
    dashboard;
    constructor(scope, id, props) {
        super(scope, id);
        const { environment, kmsKey, ecsService, ecsCluster, loadBalancer, targetGroup, logGroup, alertEmails = [], enableDetailedMonitoring = environment === 'production', } = props;
        // Create SNS topic for alerts
        this.alertTopic = new sns.Topic(this, 'AlertTopic', {
            topicName: `bcos-${environment}-alerts`,
            displayName: `BCOS ${environment} Alerts`,
            masterKey: kmsKey,
        });
        // Add email subscriptions
        alertEmails.forEach((email, index) => {
            this.alertTopic.addSubscription(new snsSubscriptions.EmailSubscription(email, {
                json: false,
            }));
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
    createECSAlarms(service, cluster, environment) {
        // Helper function to create alarms with proper actions
        const createAlarm = (id, props) => {
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
    createALBAlarms(loadBalancer, targetGroup, environment) {
        // Helper function to create alarms with proper actions
        const createAlarmWithAction = (id, props) => {
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
    createApplicationLogAlarms(logGroup, environment) {
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
        const createLogAlarmWithAction = (id, props) => {
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
        // Health check failure metric filter
        const healthCheckMetricFilter = new logs.MetricFilter(this, 'HealthCheckFailureFilter', {
            logGroup: logGroup,
            metricNamespace: `BCOS/${environment}`,
            metricName: 'HealthCheckFailures',
            metricValue: '1',
            filterPattern: logs.FilterPattern.all(logs.FilterPattern.stringValue('path', '=', '/health'), logs.FilterPattern.numberValue('status', '>=', 400)),
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
    addDashboardWidgets(service, cluster, loadBalancer, targetGroup, environment) {
        // Get load balancer full name for metrics - handle tokens for synthesis
        const loadBalancerFullName = cdk.Token.isUnresolved(loadBalancer.loadBalancerArn)
            ? 'dummy-alb-name'
            : loadBalancer.loadBalancerArn.split('/').slice(1).join('/');
        // ECS Metrics Widget
        this.dashboard.addWidgets(new cloudwatch.GraphWidget({
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
        }));
        // ALB Metrics Widget
        this.dashboard.addWidgets(new cloudwatch.GraphWidget({
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
        }));
        // Application Error Widget
        this.dashboard.addWidgets(new cloudwatch.GraphWidget({
            title: `Application Errors - ${environment}`,
            left: [
                new cloudwatch.Metric({
                    namespace: `BCOS/${environment}`,
                    metricName: 'ErrorCount',
                    statistic: 'Sum',
                }),
            ],
            width: 12,
        }));
    }
    createCompositeAlarms(environment) {
        // Service health composite alarm (production only)
        const compositeAlarm = new cloudwatch.CompositeAlarm(this, 'ServiceHealth-Composite', {
            compositeAlarmName: `BCOS-${environment}-ServiceHealth`,
            alarmDescription: `Overall service health for ${environment}`,
            alarmRule: cloudwatch.AlarmRule.anyOf(cloudwatch.AlarmRule.fromAlarm(cloudwatch.Alarm.fromAlarmArn(this, 'RefECSTaskCount', `arn:aws:cloudwatch:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:alarm:BCOS-${environment}-ECS-LowTaskCount`), cloudwatch.AlarmState.ALARM), cloudwatch.AlarmRule.fromAlarm(cloudwatch.Alarm.fromAlarmArn(this, 'RefUnhealthyTargets', `arn:aws:cloudwatch:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:alarm:BCOS-${environment}-ALB-UnhealthyTargets`), cloudwatch.AlarmState.ALARM)),
        });
        compositeAlarm.addAlarmAction(new cloudwatchActions.SnsAction(this.alertTopic));
    }
}
exports.Monitoring = Monitoring;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9uaXRvcmluZy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIm1vbml0b3JpbmcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLHVFQUF5RDtBQUN6RCxzRkFBd0U7QUFDeEUseURBQTJDO0FBQzNDLG9GQUFzRTtBQUd0RSwyREFBNkM7QUFFN0MsMkNBQXVDO0FBaUR2Qzs7O0dBR0c7QUFDSCxNQUFhLFVBQVcsU0FBUSxzQkFBUztJQUN2QixVQUFVLENBQVk7SUFDdEIsU0FBUyxDQUF1QjtJQUVoRCxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQXNCO1FBQzlELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsTUFBTSxFQUNKLFdBQVcsRUFDWCxNQUFNLEVBQ04sVUFBVSxFQUNWLFVBQVUsRUFDVixZQUFZLEVBQ1osV0FBVyxFQUNYLFFBQVEsRUFDUixXQUFXLEdBQUcsRUFBRSxFQUNoQix3QkFBd0IsR0FBRyxXQUFXLEtBQUssWUFBWSxHQUN4RCxHQUFHLEtBQUssQ0FBQztRQUVWLDhCQUE4QjtRQUM5QixJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsWUFBWSxFQUFFO1lBQ2xELFNBQVMsRUFBRSxRQUFRLFdBQVcsU0FBUztZQUN2QyxXQUFXLEVBQUUsUUFBUSxXQUFXLFNBQVM7WUFDekMsU0FBUyxFQUFFLE1BQU07U0FDbEIsQ0FBQyxDQUFDO1FBRUgsMEJBQTBCO1FBQzFCLFdBQVcsQ0FBQyxPQUFPLENBQUMsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLEVBQUU7WUFDbkMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxlQUFlLENBQzdCLElBQUksZ0JBQWdCLENBQUMsaUJBQWlCLENBQUMsS0FBSyxFQUFFO2dCQUM1QyxJQUFJLEVBQUUsS0FBSzthQUNaLENBQUMsQ0FDSCxDQUFDO1FBQ0osQ0FBQyxDQUFDLENBQUM7UUFFSCw4QkFBOEI7UUFDOUIsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLFVBQVUsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLFdBQVcsRUFBRTtZQUMzRCxhQUFhLEVBQUUsUUFBUSxXQUFXLFlBQVk7U0FDL0MsQ0FBQyxDQUFDO1FBRUgscUJBQXFCO1FBQ3JCLElBQUksQ0FBQyxlQUFlLENBQUMsVUFBVSxFQUFFLFVBQVUsRUFBRSxXQUFXLENBQUMsQ0FBQztRQUUxRCxhQUFhO1FBQ2IsSUFBSSxDQUFDLGVBQWUsQ0FBQyxZQUFZLEVBQUUsV0FBVyxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBRTdELHlCQUF5QjtRQUN6QixJQUFJLENBQUMsMEJBQTBCLENBQUMsUUFBUSxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBRXZELDJCQUEyQjtRQUMzQixJQUFJLENBQUMsbUJBQW1CLENBQUMsVUFBVSxFQUFFLFVBQVUsRUFBRSxZQUFZLEVBQUUsV0FBVyxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBRXpGLDRDQUE0QztRQUM1QyxJQUFJLFdBQVcsS0FBSyxZQUFZLEVBQUUsQ0FBQztZQUNqQyxJQUFJLENBQUMscUJBQXFCLENBQUMsV0FBVyxDQUFDLENBQUM7UUFDMUMsQ0FBQztJQUNILENBQUM7SUFFTyxlQUFlLENBQUMsT0FBcUIsRUFBRSxPQUFxQixFQUFFLFdBQW1CO1FBQ3ZGLHVEQUF1RDtRQUN2RCxNQUFNLFdBQVcsR0FBRyxDQUFDLEVBQVUsRUFBRSxLQUE0QixFQUFFLEVBQUU7WUFDL0QsTUFBTSxLQUFLLEdBQUcsSUFBSSxVQUFVLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDcEQsS0FBSyxDQUFDLGNBQWMsQ0FBQyxJQUFJLGlCQUFpQixDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztZQUN2RSxPQUFPLEtBQUssQ0FBQztRQUNmLENBQUMsQ0FBQztRQUVGLG1DQUFtQztRQUNuQyxXQUFXLENBQUMsc0JBQXNCLEVBQUU7WUFDbEMsU0FBUyxFQUFFLFFBQVEsV0FBVyxtQkFBbUI7WUFDakQsZ0JBQWdCLEVBQUUsd0RBQXdELFdBQVcsRUFBRTtZQUN2RixNQUFNLEVBQUUsSUFBSSxVQUFVLENBQUMsTUFBTSxDQUFDO2dCQUM1QixTQUFTLEVBQUUsU0FBUztnQkFDcEIsVUFBVSxFQUFFLGtCQUFrQjtnQkFDOUIsYUFBYSxFQUFFO29CQUNiLFdBQVcsRUFBRSxPQUFPLENBQUMsV0FBVztvQkFDaEMsV0FBVyxFQUFFLE9BQU8sQ0FBQyxXQUFXO2lCQUNqQztnQkFDRCxTQUFTLEVBQUUsU0FBUztnQkFDcEIsTUFBTSxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQzthQUNoQyxDQUFDO1lBQ0YsU0FBUyxFQUFFLFdBQVcsS0FBSyxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRztZQUNqRCxrQkFBa0IsRUFBRSxVQUFVLENBQUMsa0JBQWtCLENBQUMsbUJBQW1CO1lBQ3JFLGlCQUFpQixFQUFFLENBQUM7U0FDckIsQ0FBQyxDQUFDO1FBRUgsd0JBQXdCO1FBQ3hCLFdBQVcsQ0FBQyxhQUFhLEVBQUU7WUFDekIsU0FBUyxFQUFFLFFBQVEsV0FBVyxjQUFjO1lBQzVDLGdCQUFnQixFQUFFLDJDQUEyQyxXQUFXLEVBQUU7WUFDMUUsTUFBTSxFQUFFLElBQUksVUFBVSxDQUFDLE1BQU0sQ0FBQztnQkFDNUIsU0FBUyxFQUFFLFNBQVM7Z0JBQ3BCLFVBQVUsRUFBRSxnQkFBZ0I7Z0JBQzVCLGFBQWEsRUFBRTtvQkFDYixXQUFXLEVBQUUsT0FBTyxDQUFDLFdBQVc7b0JBQ2hDLFdBQVcsRUFBRSxPQUFPLENBQUMsV0FBVztpQkFDakM7Z0JBQ0QsU0FBUyxFQUFFLFNBQVM7Z0JBQ3BCLE1BQU0sRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7YUFDaEMsQ0FBQztZQUNGLFNBQVMsRUFBRSxXQUFXLEtBQUssWUFBWSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUU7WUFDakQsa0JBQWtCLEVBQUUsVUFBVSxDQUFDLGtCQUFrQixDQUFDLHNCQUFzQjtZQUN4RSxpQkFBaUIsRUFBRSxDQUFDO1NBQ3JCLENBQUMsQ0FBQztRQUVILDJCQUEyQjtRQUMzQixXQUFXLENBQUMsZ0JBQWdCLEVBQUU7WUFDNUIsU0FBUyxFQUFFLFFBQVEsV0FBVyxpQkFBaUI7WUFDL0MsZ0JBQWdCLEVBQUUsOENBQThDLFdBQVcsRUFBRTtZQUM3RSxNQUFNLEVBQUUsSUFBSSxVQUFVLENBQUMsTUFBTSxDQUFDO2dCQUM1QixTQUFTLEVBQUUsU0FBUztnQkFDcEIsVUFBVSxFQUFFLG1CQUFtQjtnQkFDL0IsYUFBYSxFQUFFO29CQUNiLFdBQVcsRUFBRSxPQUFPLENBQUMsV0FBVztvQkFDaEMsV0FBVyxFQUFFLE9BQU8sQ0FBQyxXQUFXO2lCQUNqQztnQkFDRCxTQUFTLEVBQUUsU0FBUztnQkFDcEIsTUFBTSxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQzthQUNoQyxDQUFDO1lBQ0YsU0FBUyxFQUFFLFdBQVcsS0FBSyxZQUFZLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRTtZQUNqRCxrQkFBa0IsRUFBRSxVQUFVLENBQUMsa0JBQWtCLENBQUMsc0JBQXNCO1lBQ3hFLGlCQUFpQixFQUFFLENBQUM7U0FDckIsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVPLGVBQWUsQ0FDckIsWUFBNEMsRUFDNUMsV0FBMEMsRUFDMUMsV0FBbUI7UUFFbkIsdURBQXVEO1FBQ3ZELE1BQU0scUJBQXFCLEdBQUcsQ0FBQyxFQUFVLEVBQUUsS0FBNEIsRUFBRSxFQUFFO1lBQ3pFLE1BQU0sS0FBSyxHQUFHLElBQUksVUFBVSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQ3BELEtBQUssQ0FBQyxjQUFjLENBQUMsSUFBSSxpQkFBaUIsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7WUFDdkUsT0FBTyxLQUFLLENBQUM7UUFDZixDQUFDLENBQUM7UUFFRix3RUFBd0U7UUFDeEUsTUFBTSxvQkFBb0IsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FBQyxZQUFZLENBQUMsZUFBZSxDQUFDO1lBQy9FLENBQUMsQ0FBQyxnQkFBZ0I7WUFDbEIsQ0FBQyxDQUFDLFlBQVksQ0FBQyxlQUFlLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDL0QsTUFBTSxtQkFBbUIsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FBQyxXQUFXLENBQUMsY0FBYyxDQUFDO1lBQzVFLENBQUMsQ0FBQyxlQUFlO1lBQ2pCLENBQUMsQ0FBQyxXQUFXLENBQUMsY0FBYyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBRTdELHlCQUF5QjtRQUN6QixxQkFBcUIsQ0FBQyxzQkFBc0IsRUFBRTtZQUM1QyxTQUFTLEVBQUUsUUFBUSxXQUFXLHVCQUF1QjtZQUNyRCxnQkFBZ0IsRUFBRSxpQ0FBaUMsV0FBVyxFQUFFO1lBQ2hFLE1BQU0sRUFBRSxJQUFJLFVBQVUsQ0FBQyxNQUFNLENBQUM7Z0JBQzVCLFNBQVMsRUFBRSxvQkFBb0I7Z0JBQy9CLFVBQVUsRUFBRSxvQkFBb0I7Z0JBQ2hDLGFBQWEsRUFBRTtvQkFDYixZQUFZLEVBQUUsb0JBQW9CO29CQUNsQyxXQUFXLEVBQUUsbUJBQW1CO2lCQUNqQztnQkFDRCxTQUFTLEVBQUUsU0FBUztnQkFDcEIsTUFBTSxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQzthQUNoQyxDQUFDO1lBQ0YsU0FBUyxFQUFFLENBQUM7WUFDWixrQkFBa0IsRUFBRSxVQUFVLENBQUMsa0JBQWtCLENBQUMsc0JBQXNCO1lBQ3hFLGlCQUFpQixFQUFFLENBQUM7U0FDckIsQ0FBQyxDQUFDO1FBRUgsNEJBQTRCO1FBQzVCLHFCQUFxQixDQUFDLG1CQUFtQixFQUFFO1lBQ3pDLFNBQVMsRUFBRSxRQUFRLFdBQVcsb0JBQW9CO1lBQ2xELGdCQUFnQixFQUFFLHdDQUF3QyxXQUFXLEVBQUU7WUFDdkUsTUFBTSxFQUFFLElBQUksVUFBVSxDQUFDLE1BQU0sQ0FBQztnQkFDNUIsU0FBUyxFQUFFLG9CQUFvQjtnQkFDL0IsVUFBVSxFQUFFLHdCQUF3QjtnQkFDcEMsYUFBYSxFQUFFO29CQUNiLFlBQVksRUFBRSxvQkFBb0I7aUJBQ25DO2dCQUNELFNBQVMsRUFBRSxLQUFLO2dCQUNoQixNQUFNLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO2FBQ2hDLENBQUM7WUFDRixTQUFTLEVBQUUsV0FBVyxLQUFLLFlBQVksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFO1lBQ2pELGtCQUFrQixFQUFFLFVBQVUsQ0FBQyxrQkFBa0IsQ0FBQyxzQkFBc0I7WUFDeEUsaUJBQWlCLEVBQUUsQ0FBQztTQUNyQixDQUFDLENBQUM7UUFFSCwyQkFBMkI7UUFDM0IscUJBQXFCLENBQUMsc0JBQXNCLEVBQUU7WUFDNUMsU0FBUyxFQUFFLFFBQVEsV0FBVyx1QkFBdUI7WUFDckQsZ0JBQWdCLEVBQUUsaUNBQWlDLFdBQVcsRUFBRTtZQUNoRSxNQUFNLEVBQUUsSUFBSSxVQUFVLENBQUMsTUFBTSxDQUFDO2dCQUM1QixTQUFTLEVBQUUsb0JBQW9CO2dCQUMvQixVQUFVLEVBQUUsb0JBQW9CO2dCQUNoQyxhQUFhLEVBQUU7b0JBQ2IsWUFBWSxFQUFFLG9CQUFvQjtpQkFDbkM7Z0JBQ0QsU0FBUyxFQUFFLFNBQVM7Z0JBQ3BCLE1BQU0sRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7YUFDaEMsQ0FBQztZQUNGLFNBQVMsRUFBRSxXQUFXLEtBQUssWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDL0Msa0JBQWtCLEVBQUUsVUFBVSxDQUFDLGtCQUFrQixDQUFDLHNCQUFzQjtZQUN4RSxpQkFBaUIsRUFBRSxDQUFDO1NBQ3JCLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFTywwQkFBMEIsQ0FBQyxRQUF3QixFQUFFLFdBQW1CO1FBQzlFLDBCQUEwQjtRQUMxQixNQUFNLGlCQUFpQixHQUFHLElBQUksSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLEVBQUUsZ0JBQWdCLEVBQUU7WUFDdEUsUUFBUSxFQUFFLFFBQVE7WUFDbEIsZUFBZSxFQUFFLFFBQVEsV0FBVyxFQUFFO1lBQ3RDLFVBQVUsRUFBRSxZQUFZO1lBQ3hCLFdBQVcsRUFBRSxHQUFHO1lBQ2hCLGFBQWEsRUFBRSxJQUFJLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxXQUFXLENBQUM7WUFDakYsWUFBWSxFQUFFLENBQUM7U0FDaEIsQ0FBQyxDQUFDO1FBRUgsdURBQXVEO1FBQ3ZELE1BQU0sd0JBQXdCLEdBQUcsQ0FBQyxFQUFVLEVBQUUsS0FBNEIsRUFBRSxFQUFFO1lBQzVFLE1BQU0sS0FBSyxHQUFHLElBQUksVUFBVSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQ3BELEtBQUssQ0FBQyxjQUFjLENBQUMsSUFBSSxpQkFBaUIsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7WUFDdkUsT0FBTyxLQUFLLENBQUM7UUFDZixDQUFDLENBQUM7UUFFRixvQkFBb0I7UUFDcEIsd0JBQXdCLENBQUMsbUJBQW1CLEVBQUU7WUFDNUMsU0FBUyxFQUFFLFFBQVEsV0FBVyxvQkFBb0I7WUFDbEQsZ0JBQWdCLEVBQUUsK0NBQStDLFdBQVcsRUFBRTtZQUM5RSxNQUFNLEVBQUUsaUJBQWlCLENBQUMsTUFBTSxDQUFDO2dCQUMvQixTQUFTLEVBQUUsS0FBSztnQkFDaEIsTUFBTSxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQzthQUNoQyxDQUFDO1lBQ0YsU0FBUyxFQUFFLFdBQVcsS0FBSyxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRTtZQUNoRCxrQkFBa0IsRUFBRSxVQUFVLENBQUMsa0JBQWtCLENBQUMsc0JBQXNCO1lBQ3hFLGlCQUFpQixFQUFFLENBQUM7U0FDckIsQ0FBQyxDQUFDO1FBRUgscUNBQXFDO1FBQ3JDLE1BQU0sdUJBQXVCLEdBQUcsSUFBSSxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksRUFBRSwwQkFBMEIsRUFBRTtZQUN0RixRQUFRLEVBQUUsUUFBUTtZQUNsQixlQUFlLEVBQUUsUUFBUSxXQUFXLEVBQUU7WUFDdEMsVUFBVSxFQUFFLHFCQUFxQjtZQUNqQyxXQUFXLEVBQUUsR0FBRztZQUNoQixhQUFhLEVBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQ25DLElBQUksQ0FBQyxhQUFhLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxHQUFHLEVBQUUsU0FBUyxDQUFDLEVBQ3RELElBQUksQ0FBQyxhQUFhLENBQUMsV0FBVyxDQUFDLFFBQVEsRUFBRSxJQUFJLEVBQUUsR0FBRyxDQUFDLENBQ3BEO1lBQ0QsWUFBWSxFQUFFLENBQUM7U0FDaEIsQ0FBQyxDQUFDO1FBRUgsNkJBQTZCO1FBQzdCLHdCQUF3QixDQUFDLHlCQUF5QixFQUFFO1lBQ2xELFNBQVMsRUFBRSxRQUFRLFdBQVcsMEJBQTBCO1lBQ3hELGdCQUFnQixFQUFFLDZDQUE2QyxXQUFXLEVBQUU7WUFDNUUsTUFBTSxFQUFFLHVCQUF1QixDQUFDLE1BQU0sQ0FBQztnQkFDckMsU0FBUyxFQUFFLEtBQUs7Z0JBQ2hCLE1BQU0sRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7YUFDaEMsQ0FBQztZQUNGLFNBQVMsRUFBRSxDQUFDO1lBQ1osa0JBQWtCLEVBQUUsVUFBVSxDQUFDLGtCQUFrQixDQUFDLHNCQUFzQjtZQUN4RSxpQkFBaUIsRUFBRSxDQUFDO1NBQ3JCLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFTyxtQkFBbUIsQ0FDekIsT0FBcUIsRUFDckIsT0FBcUIsRUFDckIsWUFBNEMsRUFDNUMsV0FBMEMsRUFDMUMsV0FBbUI7UUFFbkIsd0VBQXdFO1FBQ3hFLE1BQU0sb0JBQW9CLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxZQUFZLENBQUMsWUFBWSxDQUFDLGVBQWUsQ0FBQztZQUMvRSxDQUFDLENBQUMsZ0JBQWdCO1lBQ2xCLENBQUMsQ0FBQyxZQUFZLENBQUMsZUFBZSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBRS9ELHFCQUFxQjtRQUNyQixJQUFJLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FDdkIsSUFBSSxVQUFVLENBQUMsV0FBVyxDQUFDO1lBQ3pCLEtBQUssRUFBRSx5QkFBeUIsV0FBVyxFQUFFO1lBQzdDLElBQUksRUFBRTtnQkFDSixJQUFJLFVBQVUsQ0FBQyxNQUFNLENBQUM7b0JBQ3BCLFNBQVMsRUFBRSxTQUFTO29CQUNwQixVQUFVLEVBQUUsZ0JBQWdCO29CQUM1QixhQUFhLEVBQUU7d0JBQ2IsV0FBVyxFQUFFLE9BQU8sQ0FBQyxXQUFXO3dCQUNoQyxXQUFXLEVBQUUsT0FBTyxDQUFDLFdBQVc7cUJBQ2pDO29CQUNELFNBQVMsRUFBRSxTQUFTO2lCQUNyQixDQUFDO2FBQ0g7WUFDRCxLQUFLLEVBQUU7Z0JBQ0wsSUFBSSxVQUFVLENBQUMsTUFBTSxDQUFDO29CQUNwQixTQUFTLEVBQUUsU0FBUztvQkFDcEIsVUFBVSxFQUFFLG1CQUFtQjtvQkFDL0IsYUFBYSxFQUFFO3dCQUNiLFdBQVcsRUFBRSxPQUFPLENBQUMsV0FBVzt3QkFDaEMsV0FBVyxFQUFFLE9BQU8sQ0FBQyxXQUFXO3FCQUNqQztvQkFDRCxTQUFTLEVBQUUsU0FBUztpQkFDckIsQ0FBQzthQUNIO1lBQ0QsS0FBSyxFQUFFLEVBQUU7U0FDVixDQUFDLENBQ0gsQ0FBQztRQUVGLHFCQUFxQjtRQUNyQixJQUFJLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FDdkIsSUFBSSxVQUFVLENBQUMsV0FBVyxDQUFDO1lBQ3pCLEtBQUssRUFBRSxpQkFBaUIsV0FBVyxFQUFFO1lBQ3JDLElBQUksRUFBRTtnQkFDSixJQUFJLFVBQVUsQ0FBQyxNQUFNLENBQUM7b0JBQ3BCLFNBQVMsRUFBRSxvQkFBb0I7b0JBQy9CLFVBQVUsRUFBRSxjQUFjO29CQUMxQixhQUFhLEVBQUU7d0JBQ2IsWUFBWSxFQUFFLG9CQUFvQjtxQkFDbkM7b0JBQ0QsU0FBUyxFQUFFLEtBQUs7aUJBQ2pCLENBQUM7YUFDSDtZQUNELEtBQUssRUFBRTtnQkFDTCxJQUFJLFVBQVUsQ0FBQyxNQUFNLENBQUM7b0JBQ3BCLFNBQVMsRUFBRSxvQkFBb0I7b0JBQy9CLFVBQVUsRUFBRSxvQkFBb0I7b0JBQ2hDLGFBQWEsRUFBRTt3QkFDYixZQUFZLEVBQUUsb0JBQW9CO3FCQUNuQztvQkFDRCxTQUFTLEVBQUUsU0FBUztpQkFDckIsQ0FBQzthQUNIO1lBQ0QsS0FBSyxFQUFFLEVBQUU7U0FDVixDQUFDLENBQ0gsQ0FBQztRQUVGLDJCQUEyQjtRQUMzQixJQUFJLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FDdkIsSUFBSSxVQUFVLENBQUMsV0FBVyxDQUFDO1lBQ3pCLEtBQUssRUFBRSx3QkFBd0IsV0FBVyxFQUFFO1lBQzVDLElBQUksRUFBRTtnQkFDSixJQUFJLFVBQVUsQ0FBQyxNQUFNLENBQUM7b0JBQ3BCLFNBQVMsRUFBRSxRQUFRLFdBQVcsRUFBRTtvQkFDaEMsVUFBVSxFQUFFLFlBQVk7b0JBQ3hCLFNBQVMsRUFBRSxLQUFLO2lCQUNqQixDQUFDO2FBQ0g7WUFDRCxLQUFLLEVBQUUsRUFBRTtTQUNWLENBQUMsQ0FDSCxDQUFDO0lBQ0osQ0FBQztJQUVPLHFCQUFxQixDQUFDLFdBQW1CO1FBQy9DLG1EQUFtRDtRQUNuRCxNQUFNLGNBQWMsR0FBRyxJQUFJLFVBQVUsQ0FBQyxjQUFjLENBQUMsSUFBSSxFQUFFLHlCQUF5QixFQUFFO1lBQ3BGLGtCQUFrQixFQUFFLFFBQVEsV0FBVyxnQkFBZ0I7WUFDdkQsZ0JBQWdCLEVBQUUsOEJBQThCLFdBQVcsRUFBRTtZQUM3RCxTQUFTLEVBQUUsVUFBVSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQ25DLFVBQVUsQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUM1QixVQUFVLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FDM0IsSUFBSSxFQUNKLGlCQUFpQixFQUNqQixzQkFBc0IsR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxJQUFJLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLE9BQU8sZUFBZSxXQUFXLG1CQUFtQixDQUMzSCxFQUNELFVBQVUsQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUM1QixFQUNELFVBQVUsQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUM1QixVQUFVLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FDM0IsSUFBSSxFQUNKLHFCQUFxQixFQUNyQixzQkFBc0IsR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxJQUFJLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLE9BQU8sZUFBZSxXQUFXLHVCQUF1QixDQUMvSCxFQUNELFVBQVUsQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUM1QixDQUNGO1NBQ0YsQ0FBQyxDQUFDO1FBQ0gsY0FBYyxDQUFDLGNBQWMsQ0FBQyxJQUFJLGlCQUFpQixDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztJQUNsRixDQUFDO0NBQ0Y7QUFsWEQsZ0NBa1hDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIGNsb3Vkd2F0Y2ggZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3Vkd2F0Y2gnO1xuaW1wb3J0ICogYXMgY2xvdWR3YXRjaEFjdGlvbnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3Vkd2F0Y2gtYWN0aW9ucyc7XG5pbXBvcnQgKiBhcyBzbnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXNucyc7XG5pbXBvcnQgKiBhcyBzbnNTdWJzY3JpcHRpb25zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zbnMtc3Vic2NyaXB0aW9ucyc7XG5pbXBvcnQgKiBhcyBlY3MgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVjcyc7XG5pbXBvcnQgKiBhcyBlbGJ2MiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWxhc3RpY2xvYWRiYWxhbmNpbmd2Mic7XG5pbXBvcnQgKiBhcyBsb2dzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sb2dzJztcbmltcG9ydCAqIGFzIGttcyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mta21zJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIE1vbml0b3JpbmdQcm9wcyB7XG4gIC8qKlxuICAgKiBFbnZpcm9ubWVudCBuYW1lIChzdGFnaW5nIG9yIHByb2R1Y3Rpb24pXG4gICAqL1xuICBlbnZpcm9ubWVudDogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBLTVMga2V5IGZvciBlbmNyeXB0aW9uXG4gICAqL1xuICBrbXNLZXk6IGttcy5JS2V5O1xuXG4gIC8qKlxuICAgKiBFQ1Mgc2VydmljZSB0byBtb25pdG9yXG4gICAqL1xuICBlY3NTZXJ2aWNlOiBlY3MuSVNlcnZpY2U7XG5cbiAgLyoqXG4gICAqIEVDUyBjbHVzdGVyXG4gICAqL1xuICBlY3NDbHVzdGVyOiBlY3MuSUNsdXN0ZXI7XG5cbiAgLyoqXG4gICAqIEFwcGxpY2F0aW9uIExvYWQgQmFsYW5jZXIgdG8gbW9uaXRvclxuICAgKi9cbiAgbG9hZEJhbGFuY2VyOiBlbGJ2Mi5JQXBwbGljYXRpb25Mb2FkQmFsYW5jZXI7XG5cbiAgLyoqXG4gICAqIFRhcmdldCBncm91cCB0byBtb25pdG9yXG4gICAqL1xuICB0YXJnZXRHcm91cDogZWxidjIuSUFwcGxpY2F0aW9uVGFyZ2V0R3JvdXA7XG5cbiAgLyoqXG4gICAqIExvZyBncm91cCB0byBjcmVhdGUgbWV0cmljIGZpbHRlcnMgZm9yXG4gICAqL1xuICBsb2dHcm91cDogbG9ncy5JTG9nR3JvdXA7XG5cbiAgLyoqXG4gICAqIEVtYWlsIGFkZHJlc3NlcyBmb3IgYWxlcnQgbm90aWZpY2F0aW9uc1xuICAgKi9cbiAgYWxlcnRFbWFpbHM/OiBzdHJpbmdbXTtcblxuICAvKipcbiAgICogRW5hYmxlIGRldGFpbGVkIG1vbml0b3JpbmcgKGRlZmF1bHQ6IHRydWUgZm9yIHByb2R1Y3Rpb24pXG4gICAqL1xuICBlbmFibGVEZXRhaWxlZE1vbml0b3Jpbmc/OiBib29sZWFuO1xufVxuXG4vKipcbiAqIE1vbml0b3JpbmcgY29uc3RydWN0IHRoYXQgY3JlYXRlcyBDbG91ZFdhdGNoIGFsYXJtcywgZGFzaGJvYXJkcywgYW5kIFNOUyBub3RpZmljYXRpb25zXG4gKiBmb3IgY29tcHJlaGVuc2l2ZSBhcHBsaWNhdGlvbiBtb25pdG9yaW5nXG4gKi9cbmV4cG9ydCBjbGFzcyBNb25pdG9yaW5nIGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgcHVibGljIHJlYWRvbmx5IGFsZXJ0VG9waWM6IHNucy5Ub3BpYztcbiAgcHVibGljIHJlYWRvbmx5IGRhc2hib2FyZDogY2xvdWR3YXRjaC5EYXNoYm9hcmQ7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IE1vbml0b3JpbmdQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICBjb25zdCB7XG4gICAgICBlbnZpcm9ubWVudCxcbiAgICAgIGttc0tleSxcbiAgICAgIGVjc1NlcnZpY2UsXG4gICAgICBlY3NDbHVzdGVyLFxuICAgICAgbG9hZEJhbGFuY2VyLFxuICAgICAgdGFyZ2V0R3JvdXAsXG4gICAgICBsb2dHcm91cCxcbiAgICAgIGFsZXJ0RW1haWxzID0gW10sXG4gICAgICBlbmFibGVEZXRhaWxlZE1vbml0b3JpbmcgPSBlbnZpcm9ubWVudCA9PT0gJ3Byb2R1Y3Rpb24nLFxuICAgIH0gPSBwcm9wcztcblxuICAgIC8vIENyZWF0ZSBTTlMgdG9waWMgZm9yIGFsZXJ0c1xuICAgIHRoaXMuYWxlcnRUb3BpYyA9IG5ldyBzbnMuVG9waWModGhpcywgJ0FsZXJ0VG9waWMnLCB7XG4gICAgICB0b3BpY05hbWU6IGBiY29zLSR7ZW52aXJvbm1lbnR9LWFsZXJ0c2AsXG4gICAgICBkaXNwbGF5TmFtZTogYEJDT1MgJHtlbnZpcm9ubWVudH0gQWxlcnRzYCxcbiAgICAgIG1hc3RlcktleToga21zS2V5LFxuICAgIH0pO1xuXG4gICAgLy8gQWRkIGVtYWlsIHN1YnNjcmlwdGlvbnNcbiAgICBhbGVydEVtYWlscy5mb3JFYWNoKChlbWFpbCwgaW5kZXgpID0+IHtcbiAgICAgIHRoaXMuYWxlcnRUb3BpYy5hZGRTdWJzY3JpcHRpb24oXG4gICAgICAgIG5ldyBzbnNTdWJzY3JpcHRpb25zLkVtYWlsU3Vic2NyaXB0aW9uKGVtYWlsLCB7XG4gICAgICAgICAganNvbjogZmFsc2UsXG4gICAgICAgIH0pXG4gICAgICApO1xuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIENsb3VkV2F0Y2ggRGFzaGJvYXJkXG4gICAgdGhpcy5kYXNoYm9hcmQgPSBuZXcgY2xvdWR3YXRjaC5EYXNoYm9hcmQodGhpcywgJ0Rhc2hib2FyZCcsIHtcbiAgICAgIGRhc2hib2FyZE5hbWU6IGBCQ09TLSR7ZW52aXJvbm1lbnR9LURhc2hib2FyZGAsXG4gICAgfSk7XG5cbiAgICAvLyBFQ1MgU2VydmljZSBBbGFybXNcbiAgICB0aGlzLmNyZWF0ZUVDU0FsYXJtcyhlY3NTZXJ2aWNlLCBlY3NDbHVzdGVyLCBlbnZpcm9ubWVudCk7XG5cbiAgICAvLyBBTEIgQWxhcm1zXG4gICAgdGhpcy5jcmVhdGVBTEJBbGFybXMobG9hZEJhbGFuY2VyLCB0YXJnZXRHcm91cCwgZW52aXJvbm1lbnQpO1xuXG4gICAgLy8gQXBwbGljYXRpb24gTG9nIEFsYXJtc1xuICAgIHRoaXMuY3JlYXRlQXBwbGljYXRpb25Mb2dBbGFybXMobG9nR3JvdXAsIGVudmlyb25tZW50KTtcblxuICAgIC8vIEFkZCB3aWRnZXRzIHRvIGRhc2hib2FyZFxuICAgIHRoaXMuYWRkRGFzaGJvYXJkV2lkZ2V0cyhlY3NTZXJ2aWNlLCBlY3NDbHVzdGVyLCBsb2FkQmFsYW5jZXIsIHRhcmdldEdyb3VwLCBlbnZpcm9ubWVudCk7XG5cbiAgICAvLyBDcmVhdGUgY29tcG9zaXRlIGFsYXJtIGZvciBzZXJ2aWNlIGhlYWx0aFxuICAgIGlmIChlbnZpcm9ubWVudCA9PT0gJ3Byb2R1Y3Rpb24nKSB7XG4gICAgICB0aGlzLmNyZWF0ZUNvbXBvc2l0ZUFsYXJtcyhlbnZpcm9ubWVudCk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBjcmVhdGVFQ1NBbGFybXMoc2VydmljZTogZWNzLklTZXJ2aWNlLCBjbHVzdGVyOiBlY3MuSUNsdXN0ZXIsIGVudmlyb25tZW50OiBzdHJpbmcpOiB2b2lkIHtcbiAgICAvLyBIZWxwZXIgZnVuY3Rpb24gdG8gY3JlYXRlIGFsYXJtcyB3aXRoIHByb3BlciBhY3Rpb25zXG4gICAgY29uc3QgY3JlYXRlQWxhcm0gPSAoaWQ6IHN0cmluZywgcHJvcHM6IGNsb3Vkd2F0Y2guQWxhcm1Qcm9wcykgPT4ge1xuICAgICAgY29uc3QgYWxhcm0gPSBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCBpZCwgcHJvcHMpO1xuICAgICAgYWxhcm0uYWRkQWxhcm1BY3Rpb24obmV3IGNsb3Vkd2F0Y2hBY3Rpb25zLlNuc0FjdGlvbih0aGlzLmFsZXJ0VG9waWMpKTtcbiAgICAgIHJldHVybiBhbGFybTtcbiAgICB9O1xuXG4gICAgLy8gU2VydmljZSBydW5uaW5nIHRhc2sgY291bnQgYWxhcm1cbiAgICBjcmVhdGVBbGFybSgnRUNTLVJ1bm5pbmdUYXNrQ291bnQnLCB7XG4gICAgICBhbGFybU5hbWU6IGBCQ09TLSR7ZW52aXJvbm1lbnR9LUVDUy1Mb3dUYXNrQ291bnRgLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjogYEVDUyBzZXJ2aWNlIGhhcyBmZXdlciBydW5uaW5nIHRhc2tzIHRoYW4gZGVzaXJlZCBmb3IgJHtlbnZpcm9ubWVudH1gLFxuICAgICAgbWV0cmljOiBuZXcgY2xvdWR3YXRjaC5NZXRyaWMoe1xuICAgICAgICBuYW1lc3BhY2U6ICdBV1MvRUNTJyxcbiAgICAgICAgbWV0cmljTmFtZTogJ1J1bm5pbmdUYXNrQ291bnQnLFxuICAgICAgICBkaW1lbnNpb25zTWFwOiB7XG4gICAgICAgICAgU2VydmljZU5hbWU6IHNlcnZpY2Uuc2VydmljZU5hbWUsXG4gICAgICAgICAgQ2x1c3Rlck5hbWU6IGNsdXN0ZXIuY2x1c3Rlck5hbWUsXG4gICAgICAgIH0sXG4gICAgICAgIHN0YXRpc3RpYzogJ0F2ZXJhZ2UnLFxuICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDEpLFxuICAgICAgfSksXG4gICAgICB0aHJlc2hvbGQ6IGVudmlyb25tZW50ID09PSAncHJvZHVjdGlvbicgPyAxIDogMC41LFxuICAgICAgY29tcGFyaXNvbk9wZXJhdG9yOiBjbG91ZHdhdGNoLkNvbXBhcmlzb25PcGVyYXRvci5MRVNTX1RIQU5fVEhSRVNIT0xELFxuICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDIsXG4gICAgfSk7XG5cbiAgICAvLyBDUFUgdXRpbGl6YXRpb24gYWxhcm1cbiAgICBjcmVhdGVBbGFybSgnRUNTLUhpZ2hDUFUnLCB7XG4gICAgICBhbGFybU5hbWU6IGBCQ09TLSR7ZW52aXJvbm1lbnR9LUVDUy1IaWdoQ1BVYCxcbiAgICAgIGFsYXJtRGVzY3JpcHRpb246IGBFQ1Mgc2VydmljZSBDUFUgdXRpbGl6YXRpb24gaXMgaGlnaCBmb3IgJHtlbnZpcm9ubWVudH1gLFxuICAgICAgbWV0cmljOiBuZXcgY2xvdWR3YXRjaC5NZXRyaWMoe1xuICAgICAgICBuYW1lc3BhY2U6ICdBV1MvRUNTJyxcbiAgICAgICAgbWV0cmljTmFtZTogJ0NQVVV0aWxpemF0aW9uJyxcbiAgICAgICAgZGltZW5zaW9uc01hcDoge1xuICAgICAgICAgIFNlcnZpY2VOYW1lOiBzZXJ2aWNlLnNlcnZpY2VOYW1lLFxuICAgICAgICAgIENsdXN0ZXJOYW1lOiBjbHVzdGVyLmNsdXN0ZXJOYW1lLFxuICAgICAgICB9LFxuICAgICAgICBzdGF0aXN0aWM6ICdBdmVyYWdlJyxcbiAgICAgICAgcGVyaW9kOiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiBlbnZpcm9ubWVudCA9PT0gJ3Byb2R1Y3Rpb24nID8gODAgOiA4NSxcbiAgICAgIGNvbXBhcmlzb25PcGVyYXRvcjogY2xvdWR3YXRjaC5Db21wYXJpc29uT3BlcmF0b3IuR1JFQVRFUl9USEFOX1RIUkVTSE9MRCxcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAzLFxuICAgIH0pO1xuXG4gICAgLy8gTWVtb3J5IHV0aWxpemF0aW9uIGFsYXJtXG4gICAgY3JlYXRlQWxhcm0oJ0VDUy1IaWdoTWVtb3J5Jywge1xuICAgICAgYWxhcm1OYW1lOiBgQkNPUy0ke2Vudmlyb25tZW50fS1FQ1MtSGlnaE1lbW9yeWAsXG4gICAgICBhbGFybURlc2NyaXB0aW9uOiBgRUNTIHNlcnZpY2UgbWVtb3J5IHV0aWxpemF0aW9uIGlzIGhpZ2ggZm9yICR7ZW52aXJvbm1lbnR9YCxcbiAgICAgIG1ldHJpYzogbmV3IGNsb3Vkd2F0Y2guTWV0cmljKHtcbiAgICAgICAgbmFtZXNwYWNlOiAnQVdTL0VDUycsXG4gICAgICAgIG1ldHJpY05hbWU6ICdNZW1vcnlVdGlsaXphdGlvbicsXG4gICAgICAgIGRpbWVuc2lvbnNNYXA6IHtcbiAgICAgICAgICBTZXJ2aWNlTmFtZTogc2VydmljZS5zZXJ2aWNlTmFtZSxcbiAgICAgICAgICBDbHVzdGVyTmFtZTogY2x1c3Rlci5jbHVzdGVyTmFtZSxcbiAgICAgICAgfSxcbiAgICAgICAgc3RhdGlzdGljOiAnQXZlcmFnZScsXG4gICAgICAgIHBlcmlvZDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICB9KSxcbiAgICAgIHRocmVzaG9sZDogZW52aXJvbm1lbnQgPT09ICdwcm9kdWN0aW9uJyA/IDg1IDogOTAsXG4gICAgICBjb21wYXJpc29uT3BlcmF0b3I6IGNsb3Vkd2F0Y2guQ29tcGFyaXNvbk9wZXJhdG9yLkdSRUFURVJfVEhBTl9USFJFU0hPTEQsXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMyxcbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgY3JlYXRlQUxCQWxhcm1zKFxuICAgIGxvYWRCYWxhbmNlcjogZWxidjIuSUFwcGxpY2F0aW9uTG9hZEJhbGFuY2VyLFxuICAgIHRhcmdldEdyb3VwOiBlbGJ2Mi5JQXBwbGljYXRpb25UYXJnZXRHcm91cCxcbiAgICBlbnZpcm9ubWVudDogc3RyaW5nXG4gICk6IHZvaWQge1xuICAgIC8vIEhlbHBlciBmdW5jdGlvbiB0byBjcmVhdGUgYWxhcm1zIHdpdGggcHJvcGVyIGFjdGlvbnNcbiAgICBjb25zdCBjcmVhdGVBbGFybVdpdGhBY3Rpb24gPSAoaWQ6IHN0cmluZywgcHJvcHM6IGNsb3Vkd2F0Y2guQWxhcm1Qcm9wcykgPT4ge1xuICAgICAgY29uc3QgYWxhcm0gPSBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCBpZCwgcHJvcHMpO1xuICAgICAgYWxhcm0uYWRkQWxhcm1BY3Rpb24obmV3IGNsb3Vkd2F0Y2hBY3Rpb25zLlNuc0FjdGlvbih0aGlzLmFsZXJ0VG9waWMpKTtcbiAgICAgIHJldHVybiBhbGFybTtcbiAgICB9O1xuXG4gICAgLy8gR2V0IGxvYWQgYmFsYW5jZXIgZnVsbCBuYW1lIGZvciBtZXRyaWNzIC0gaGFuZGxlIHRva2VucyBmb3Igc3ludGhlc2lzXG4gICAgY29uc3QgbG9hZEJhbGFuY2VyRnVsbE5hbWUgPSBjZGsuVG9rZW4uaXNVbnJlc29sdmVkKGxvYWRCYWxhbmNlci5sb2FkQmFsYW5jZXJBcm4pIFxuICAgICAgPyAnZHVtbXktYWxiLW5hbWUnIFxuICAgICAgOiBsb2FkQmFsYW5jZXIubG9hZEJhbGFuY2VyQXJuLnNwbGl0KCcvJykuc2xpY2UoMSkuam9pbignLycpO1xuICAgIGNvbnN0IHRhcmdldEdyb3VwRnVsbE5hbWUgPSBjZGsuVG9rZW4uaXNVbnJlc29sdmVkKHRhcmdldEdyb3VwLnRhcmdldEdyb3VwQXJuKSBcbiAgICAgID8gJ2R1bW15LXRnLW5hbWUnIFxuICAgICAgOiB0YXJnZXRHcm91cC50YXJnZXRHcm91cEFybi5zcGxpdCgnLycpLnNsaWNlKDEpLmpvaW4oJy8nKTtcblxuICAgIC8vIFVuaGVhbHRoeSB0YXJnZXQgYWxhcm1cbiAgICBjcmVhdGVBbGFybVdpdGhBY3Rpb24oJ0FMQi1VbmhlYWx0aHlUYXJnZXRzJywge1xuICAgICAgYWxhcm1OYW1lOiBgQkNPUy0ke2Vudmlyb25tZW50fS1BTEItVW5oZWFsdGh5VGFyZ2V0c2AsXG4gICAgICBhbGFybURlc2NyaXB0aW9uOiBgQUxCIGhhcyB1bmhlYWx0aHkgdGFyZ2V0cyBmb3IgJHtlbnZpcm9ubWVudH1gLFxuICAgICAgbWV0cmljOiBuZXcgY2xvdWR3YXRjaC5NZXRyaWMoe1xuICAgICAgICBuYW1lc3BhY2U6ICdBV1MvQXBwbGljYXRpb25FTEInLFxuICAgICAgICBtZXRyaWNOYW1lOiAnVW5IZWFsdGh5SG9zdENvdW50JyxcbiAgICAgICAgZGltZW5zaW9uc01hcDoge1xuICAgICAgICAgIExvYWRCYWxhbmNlcjogbG9hZEJhbGFuY2VyRnVsbE5hbWUsXG4gICAgICAgICAgVGFyZ2V0R3JvdXA6IHRhcmdldEdyb3VwRnVsbE5hbWUsXG4gICAgICAgIH0sXG4gICAgICAgIHN0YXRpc3RpYzogJ01heGltdW0nLFxuICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDEpLFxuICAgICAgfSksXG4gICAgICB0aHJlc2hvbGQ6IDAsXG4gICAgICBjb21wYXJpc29uT3BlcmF0b3I6IGNsb3Vkd2F0Y2guQ29tcGFyaXNvbk9wZXJhdG9yLkdSRUFURVJfVEhBTl9USFJFU0hPTEQsXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMixcbiAgICB9KTtcblxuICAgIC8vIEhpZ2ggNVhYIGVycm9yIHJhdGUgYWxhcm1cbiAgICBjcmVhdGVBbGFybVdpdGhBY3Rpb24oJ0FMQi1IaWdoNVhYRXJyb3JzJywge1xuICAgICAgYWxhcm1OYW1lOiBgQkNPUy0ke2Vudmlyb25tZW50fS1BTEItSGlnaDVYWEVycm9yc2AsXG4gICAgICBhbGFybURlc2NyaXB0aW9uOiBgQUxCIGlzIHJldHVybmluZyBoaWdoIDVYWCBlcnJvcnMgZm9yICR7ZW52aXJvbm1lbnR9YCxcbiAgICAgIG1ldHJpYzogbmV3IGNsb3Vkd2F0Y2guTWV0cmljKHtcbiAgICAgICAgbmFtZXNwYWNlOiAnQVdTL0FwcGxpY2F0aW9uRUxCJyxcbiAgICAgICAgbWV0cmljTmFtZTogJ0hUVFBDb2RlX0VMQl81WFhfQ291bnQnLFxuICAgICAgICBkaW1lbnNpb25zTWFwOiB7XG4gICAgICAgICAgTG9hZEJhbGFuY2VyOiBsb2FkQmFsYW5jZXJGdWxsTmFtZSxcbiAgICAgICAgfSxcbiAgICAgICAgc3RhdGlzdGljOiAnU3VtJyxcbiAgICAgICAgcGVyaW9kOiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiBlbnZpcm9ubWVudCA9PT0gJ3Byb2R1Y3Rpb24nID8gMTAgOiAyMCxcbiAgICAgIGNvbXBhcmlzb25PcGVyYXRvcjogY2xvdWR3YXRjaC5Db21wYXJpc29uT3BlcmF0b3IuR1JFQVRFUl9USEFOX1RIUkVTSE9MRCxcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAyLFxuICAgIH0pO1xuXG4gICAgLy8gSGlnaCByZXNwb25zZSB0aW1lIGFsYXJtXG4gICAgY3JlYXRlQWxhcm1XaXRoQWN0aW9uKCdBTEItSGlnaFJlc3BvbnNlVGltZScsIHtcbiAgICAgIGFsYXJtTmFtZTogYEJDT1MtJHtlbnZpcm9ubWVudH0tQUxCLUhpZ2hSZXNwb25zZVRpbWVgLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjogYEFMQiByZXNwb25zZSB0aW1lIGlzIGhpZ2ggZm9yICR7ZW52aXJvbm1lbnR9YCxcbiAgICAgIG1ldHJpYzogbmV3IGNsb3Vkd2F0Y2guTWV0cmljKHtcbiAgICAgICAgbmFtZXNwYWNlOiAnQVdTL0FwcGxpY2F0aW9uRUxCJyxcbiAgICAgICAgbWV0cmljTmFtZTogJ1RhcmdldFJlc3BvbnNlVGltZScsXG4gICAgICAgIGRpbWVuc2lvbnNNYXA6IHtcbiAgICAgICAgICBMb2FkQmFsYW5jZXI6IGxvYWRCYWxhbmNlckZ1bGxOYW1lLFxuICAgICAgICB9LFxuICAgICAgICBzdGF0aXN0aWM6ICdBdmVyYWdlJyxcbiAgICAgICAgcGVyaW9kOiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiBlbnZpcm9ubWVudCA9PT0gJ3Byb2R1Y3Rpb24nID8gMiA6IDUsXG4gICAgICBjb21wYXJpc29uT3BlcmF0b3I6IGNsb3Vkd2F0Y2guQ29tcGFyaXNvbk9wZXJhdG9yLkdSRUFURVJfVEhBTl9USFJFU0hPTEQsXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMyxcbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgY3JlYXRlQXBwbGljYXRpb25Mb2dBbGFybXMobG9nR3JvdXA6IGxvZ3MuSUxvZ0dyb3VwLCBlbnZpcm9ubWVudDogc3RyaW5nKTogdm9pZCB7XG4gICAgLy8gRXJyb3IgbG9nIG1ldHJpYyBmaWx0ZXJcbiAgICBjb25zdCBlcnJvck1ldHJpY0ZpbHRlciA9IG5ldyBsb2dzLk1ldHJpY0ZpbHRlcih0aGlzLCAnRXJyb3JMb2dGaWx0ZXInLCB7XG4gICAgICBsb2dHcm91cDogbG9nR3JvdXAsXG4gICAgICBtZXRyaWNOYW1lc3BhY2U6IGBCQ09TLyR7ZW52aXJvbm1lbnR9YCxcbiAgICAgIG1ldHJpY05hbWU6ICdFcnJvckNvdW50JyxcbiAgICAgIG1ldHJpY1ZhbHVlOiAnMScsXG4gICAgICBmaWx0ZXJQYXR0ZXJuOiBsb2dzLkZpbHRlclBhdHRlcm4uYW55VGVybSgnRVJST1InLCAnRkFUQUwnLCAncGFuaWMnLCAnZXhjZXB0aW9uJyksXG4gICAgICBkZWZhdWx0VmFsdWU6IDAsXG4gICAgfSk7XG5cbiAgICAvLyBIZWxwZXIgZnVuY3Rpb24gdG8gY3JlYXRlIGFsYXJtcyB3aXRoIHByb3BlciBhY3Rpb25zXG4gICAgY29uc3QgY3JlYXRlTG9nQWxhcm1XaXRoQWN0aW9uID0gKGlkOiBzdHJpbmcsIHByb3BzOiBjbG91ZHdhdGNoLkFsYXJtUHJvcHMpID0+IHtcbiAgICAgIGNvbnN0IGFsYXJtID0gbmV3IGNsb3Vkd2F0Y2guQWxhcm0odGhpcywgaWQsIHByb3BzKTtcbiAgICAgIGFsYXJtLmFkZEFsYXJtQWN0aW9uKG5ldyBjbG91ZHdhdGNoQWN0aW9ucy5TbnNBY3Rpb24odGhpcy5hbGVydFRvcGljKSk7XG4gICAgICByZXR1cm4gYWxhcm07XG4gICAgfTtcblxuICAgIC8vIEVycm9yIGNvdW50IGFsYXJtXG4gICAgY3JlYXRlTG9nQWxhcm1XaXRoQWN0aW9uKCdBcHAtSGlnaEVycm9yUmF0ZScsIHtcbiAgICAgIGFsYXJtTmFtZTogYEJDT1MtJHtlbnZpcm9ubWVudH0tQXBwLUhpZ2hFcnJvclJhdGVgLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjogYEFwcGxpY2F0aW9uIGlzIGxvZ2dpbmcgaGlnaCBlcnJvciByYXRlcyBmb3IgJHtlbnZpcm9ubWVudH1gLFxuICAgICAgbWV0cmljOiBlcnJvck1ldHJpY0ZpbHRlci5tZXRyaWMoe1xuICAgICAgICBzdGF0aXN0aWM6ICdTdW0nLFxuICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgfSksXG4gICAgICB0aHJlc2hvbGQ6IGVudmlyb25tZW50ID09PSAncHJvZHVjdGlvbicgPyA1IDogMTAsXG4gICAgICBjb21wYXJpc29uT3BlcmF0b3I6IGNsb3Vkd2F0Y2guQ29tcGFyaXNvbk9wZXJhdG9yLkdSRUFURVJfVEhBTl9USFJFU0hPTEQsXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMixcbiAgICB9KTtcblxuICAgIC8vIEhlYWx0aCBjaGVjayBmYWlsdXJlIG1ldHJpYyBmaWx0ZXJcbiAgICBjb25zdCBoZWFsdGhDaGVja01ldHJpY0ZpbHRlciA9IG5ldyBsb2dzLk1ldHJpY0ZpbHRlcih0aGlzLCAnSGVhbHRoQ2hlY2tGYWlsdXJlRmlsdGVyJywge1xuICAgICAgbG9nR3JvdXA6IGxvZ0dyb3VwLFxuICAgICAgbWV0cmljTmFtZXNwYWNlOiBgQkNPUy8ke2Vudmlyb25tZW50fWAsXG4gICAgICBtZXRyaWNOYW1lOiAnSGVhbHRoQ2hlY2tGYWlsdXJlcycsXG4gICAgICBtZXRyaWNWYWx1ZTogJzEnLFxuICAgICAgZmlsdGVyUGF0dGVybjogbG9ncy5GaWx0ZXJQYXR0ZXJuLmFsbChcbiAgICAgICAgbG9ncy5GaWx0ZXJQYXR0ZXJuLnN0cmluZ1ZhbHVlKCdwYXRoJywgJz0nLCAnL2hlYWx0aCcpLFxuICAgICAgICBsb2dzLkZpbHRlclBhdHRlcm4ubnVtYmVyVmFsdWUoJ3N0YXR1cycsICc+PScsIDQwMClcbiAgICAgICksXG4gICAgICBkZWZhdWx0VmFsdWU6IDAsXG4gICAgfSk7XG5cbiAgICAvLyBIZWFsdGggY2hlY2sgZmFpbHVyZSBhbGFybVxuICAgIGNyZWF0ZUxvZ0FsYXJtV2l0aEFjdGlvbignQXBwLUhlYWx0aENoZWNrRmFpbHVyZXMnLCB7XG4gICAgICBhbGFybU5hbWU6IGBCQ09TLSR7ZW52aXJvbm1lbnR9LUFwcC1IZWFsdGhDaGVja0ZhaWx1cmVzYCxcbiAgICAgIGFsYXJtRGVzY3JpcHRpb246IGBBcHBsaWNhdGlvbiBoZWFsdGggY2hlY2tzIGFyZSBmYWlsaW5nIGZvciAke2Vudmlyb25tZW50fWAsXG4gICAgICBtZXRyaWM6IGhlYWx0aENoZWNrTWV0cmljRmlsdGVyLm1ldHJpYyh7XG4gICAgICAgIHN0YXRpc3RpYzogJ1N1bScsXG4gICAgICAgIHBlcmlvZDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICB9KSxcbiAgICAgIHRocmVzaG9sZDogMyxcbiAgICAgIGNvbXBhcmlzb25PcGVyYXRvcjogY2xvdWR3YXRjaC5Db21wYXJpc29uT3BlcmF0b3IuR1JFQVRFUl9USEFOX1RIUkVTSE9MRCxcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAyLFxuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBhZGREYXNoYm9hcmRXaWRnZXRzKFxuICAgIHNlcnZpY2U6IGVjcy5JU2VydmljZSxcbiAgICBjbHVzdGVyOiBlY3MuSUNsdXN0ZXIsXG4gICAgbG9hZEJhbGFuY2VyOiBlbGJ2Mi5JQXBwbGljYXRpb25Mb2FkQmFsYW5jZXIsXG4gICAgdGFyZ2V0R3JvdXA6IGVsYnYyLklBcHBsaWNhdGlvblRhcmdldEdyb3VwLFxuICAgIGVudmlyb25tZW50OiBzdHJpbmdcbiAgKTogdm9pZCB7XG4gICAgLy8gR2V0IGxvYWQgYmFsYW5jZXIgZnVsbCBuYW1lIGZvciBtZXRyaWNzIC0gaGFuZGxlIHRva2VucyBmb3Igc3ludGhlc2lzXG4gICAgY29uc3QgbG9hZEJhbGFuY2VyRnVsbE5hbWUgPSBjZGsuVG9rZW4uaXNVbnJlc29sdmVkKGxvYWRCYWxhbmNlci5sb2FkQmFsYW5jZXJBcm4pIFxuICAgICAgPyAnZHVtbXktYWxiLW5hbWUnIFxuICAgICAgOiBsb2FkQmFsYW5jZXIubG9hZEJhbGFuY2VyQXJuLnNwbGl0KCcvJykuc2xpY2UoMSkuam9pbignLycpO1xuXG4gICAgLy8gRUNTIE1ldHJpY3MgV2lkZ2V0XG4gICAgdGhpcy5kYXNoYm9hcmQuYWRkV2lkZ2V0cyhcbiAgICAgIG5ldyBjbG91ZHdhdGNoLkdyYXBoV2lkZ2V0KHtcbiAgICAgICAgdGl0bGU6IGBFQ1MgU2VydmljZSBNZXRyaWNzIC0gJHtlbnZpcm9ubWVudH1gLFxuICAgICAgICBsZWZ0OiBbXG4gICAgICAgICAgbmV3IGNsb3Vkd2F0Y2guTWV0cmljKHtcbiAgICAgICAgICAgIG5hbWVzcGFjZTogJ0FXUy9FQ1MnLFxuICAgICAgICAgICAgbWV0cmljTmFtZTogJ0NQVVV0aWxpemF0aW9uJyxcbiAgICAgICAgICAgIGRpbWVuc2lvbnNNYXA6IHtcbiAgICAgICAgICAgICAgU2VydmljZU5hbWU6IHNlcnZpY2Uuc2VydmljZU5hbWUsXG4gICAgICAgICAgICAgIENsdXN0ZXJOYW1lOiBjbHVzdGVyLmNsdXN0ZXJOYW1lLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHN0YXRpc3RpYzogJ0F2ZXJhZ2UnLFxuICAgICAgICAgIH0pLFxuICAgICAgICBdLFxuICAgICAgICByaWdodDogW1xuICAgICAgICAgIG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgICAgICBuYW1lc3BhY2U6ICdBV1MvRUNTJyxcbiAgICAgICAgICAgIG1ldHJpY05hbWU6ICdNZW1vcnlVdGlsaXphdGlvbicsXG4gICAgICAgICAgICBkaW1lbnNpb25zTWFwOiB7XG4gICAgICAgICAgICAgIFNlcnZpY2VOYW1lOiBzZXJ2aWNlLnNlcnZpY2VOYW1lLFxuICAgICAgICAgICAgICBDbHVzdGVyTmFtZTogY2x1c3Rlci5jbHVzdGVyTmFtZSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBzdGF0aXN0aWM6ICdBdmVyYWdlJyxcbiAgICAgICAgICB9KSxcbiAgICAgICAgXSxcbiAgICAgICAgd2lkdGg6IDEyLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gQUxCIE1ldHJpY3MgV2lkZ2V0XG4gICAgdGhpcy5kYXNoYm9hcmQuYWRkV2lkZ2V0cyhcbiAgICAgIG5ldyBjbG91ZHdhdGNoLkdyYXBoV2lkZ2V0KHtcbiAgICAgICAgdGl0bGU6IGBBTEIgTWV0cmljcyAtICR7ZW52aXJvbm1lbnR9YCxcbiAgICAgICAgbGVmdDogW1xuICAgICAgICAgIG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgICAgICBuYW1lc3BhY2U6ICdBV1MvQXBwbGljYXRpb25FTEInLFxuICAgICAgICAgICAgbWV0cmljTmFtZTogJ1JlcXVlc3RDb3VudCcsXG4gICAgICAgICAgICBkaW1lbnNpb25zTWFwOiB7XG4gICAgICAgICAgICAgIExvYWRCYWxhbmNlcjogbG9hZEJhbGFuY2VyRnVsbE5hbWUsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgc3RhdGlzdGljOiAnU3VtJyxcbiAgICAgICAgICB9KSxcbiAgICAgICAgXSxcbiAgICAgICAgcmlnaHQ6IFtcbiAgICAgICAgICBuZXcgY2xvdWR3YXRjaC5NZXRyaWMoe1xuICAgICAgICAgICAgbmFtZXNwYWNlOiAnQVdTL0FwcGxpY2F0aW9uRUxCJyxcbiAgICAgICAgICAgIG1ldHJpY05hbWU6ICdUYXJnZXRSZXNwb25zZVRpbWUnLFxuICAgICAgICAgICAgZGltZW5zaW9uc01hcDoge1xuICAgICAgICAgICAgICBMb2FkQmFsYW5jZXI6IGxvYWRCYWxhbmNlckZ1bGxOYW1lLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHN0YXRpc3RpYzogJ0F2ZXJhZ2UnLFxuICAgICAgICAgIH0pLFxuICAgICAgICBdLFxuICAgICAgICB3aWR0aDogMTIsXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyBBcHBsaWNhdGlvbiBFcnJvciBXaWRnZXRcbiAgICB0aGlzLmRhc2hib2FyZC5hZGRXaWRnZXRzKFxuICAgICAgbmV3IGNsb3Vkd2F0Y2guR3JhcGhXaWRnZXQoe1xuICAgICAgICB0aXRsZTogYEFwcGxpY2F0aW9uIEVycm9ycyAtICR7ZW52aXJvbm1lbnR9YCxcbiAgICAgICAgbGVmdDogW1xuICAgICAgICAgIG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgICAgICBuYW1lc3BhY2U6IGBCQ09TLyR7ZW52aXJvbm1lbnR9YCxcbiAgICAgICAgICAgIG1ldHJpY05hbWU6ICdFcnJvckNvdW50JyxcbiAgICAgICAgICAgIHN0YXRpc3RpYzogJ1N1bScsXG4gICAgICAgICAgfSksXG4gICAgICAgIF0sXG4gICAgICAgIHdpZHRoOiAxMixcbiAgICAgIH0pXG4gICAgKTtcbiAgfVxuXG4gIHByaXZhdGUgY3JlYXRlQ29tcG9zaXRlQWxhcm1zKGVudmlyb25tZW50OiBzdHJpbmcpOiB2b2lkIHtcbiAgICAvLyBTZXJ2aWNlIGhlYWx0aCBjb21wb3NpdGUgYWxhcm0gKHByb2R1Y3Rpb24gb25seSlcbiAgICBjb25zdCBjb21wb3NpdGVBbGFybSA9IG5ldyBjbG91ZHdhdGNoLkNvbXBvc2l0ZUFsYXJtKHRoaXMsICdTZXJ2aWNlSGVhbHRoLUNvbXBvc2l0ZScsIHtcbiAgICAgIGNvbXBvc2l0ZUFsYXJtTmFtZTogYEJDT1MtJHtlbnZpcm9ubWVudH0tU2VydmljZUhlYWx0aGAsXG4gICAgICBhbGFybURlc2NyaXB0aW9uOiBgT3ZlcmFsbCBzZXJ2aWNlIGhlYWx0aCBmb3IgJHtlbnZpcm9ubWVudH1gLFxuICAgICAgYWxhcm1SdWxlOiBjbG91ZHdhdGNoLkFsYXJtUnVsZS5hbnlPZihcbiAgICAgICAgY2xvdWR3YXRjaC5BbGFybVJ1bGUuZnJvbUFsYXJtKFxuICAgICAgICAgIGNsb3Vkd2F0Y2guQWxhcm0uZnJvbUFsYXJtQXJuKFxuICAgICAgICAgICAgdGhpcyxcbiAgICAgICAgICAgICdSZWZFQ1NUYXNrQ291bnQnLFxuICAgICAgICAgICAgYGFybjphd3M6Y2xvdWR3YXRjaDoke2Nkay5TdGFjay5vZih0aGlzKS5yZWdpb259OiR7Y2RrLlN0YWNrLm9mKHRoaXMpLmFjY291bnR9OmFsYXJtOkJDT1MtJHtlbnZpcm9ubWVudH0tRUNTLUxvd1Rhc2tDb3VudGBcbiAgICAgICAgICApLFxuICAgICAgICAgIGNsb3Vkd2F0Y2guQWxhcm1TdGF0ZS5BTEFSTVxuICAgICAgICApLFxuICAgICAgICBjbG91ZHdhdGNoLkFsYXJtUnVsZS5mcm9tQWxhcm0oXG4gICAgICAgICAgY2xvdWR3YXRjaC5BbGFybS5mcm9tQWxhcm1Bcm4oXG4gICAgICAgICAgICB0aGlzLFxuICAgICAgICAgICAgJ1JlZlVuaGVhbHRoeVRhcmdldHMnLFxuICAgICAgICAgICAgYGFybjphd3M6Y2xvdWR3YXRjaDoke2Nkay5TdGFjay5vZih0aGlzKS5yZWdpb259OiR7Y2RrLlN0YWNrLm9mKHRoaXMpLmFjY291bnR9OmFsYXJtOkJDT1MtJHtlbnZpcm9ubWVudH0tQUxCLVVuaGVhbHRoeVRhcmdldHNgXG4gICAgICAgICAgKSxcbiAgICAgICAgICBjbG91ZHdhdGNoLkFsYXJtU3RhdGUuQUxBUk1cbiAgICAgICAgKVxuICAgICAgKSxcbiAgICB9KTtcbiAgICBjb21wb3NpdGVBbGFybS5hZGRBbGFybUFjdGlvbihuZXcgY2xvdWR3YXRjaEFjdGlvbnMuU25zQWN0aW9uKHRoaXMuYWxlcnRUb3BpYykpO1xuICB9XG59XG4iXX0=