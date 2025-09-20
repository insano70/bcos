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
        // Unhealthy target alarm
        new cloudwatch.Alarm(this, 'ALB-UnhealthyTargets', {
            alarmName: `BCOS-${environment}-ALB-UnhealthyTargets`,
            alarmDescription: `ALB has unhealthy targets for ${environment}`,
            metric: new cloudwatch.Metric({
                namespace: 'AWS/ApplicationELB',
                metricName: 'UnHealthyHostCount',
                dimensionsMap: {
                    LoadBalancer: loadBalancer.loadBalancerArn.split('/').slice(1).join('/'),
                    TargetGroup: targetGroup.targetGroupArn.split('/').slice(1).join('/'),
                },
                statistic: 'Maximum',
                period: cdk.Duration.minutes(1),
            }),
            threshold: 0,
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
            evaluationPeriods: 2,
            actionsEnabled: true,
        });
        // High 5XX error rate alarm
        new cloudwatch.Alarm(this, 'ALB-High5XXErrors', {
            alarmName: `BCOS-${environment}-ALB-High5XXErrors`,
            alarmDescription: `ALB is returning high 5XX errors for ${environment}`,
            metric: new cloudwatch.Metric({
                namespace: 'AWS/ApplicationELB',
                metricName: 'HTTPCode_ELB_5XX_Count',
                dimensionsMap: {
                    LoadBalancer: loadBalancer.loadBalancerArn.split('/').slice(1).join('/'),
                },
                statistic: 'Sum',
                period: cdk.Duration.minutes(5),
            }),
            threshold: environment === 'production' ? 10 : 20,
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
            evaluationPeriods: 2,
            actionsEnabled: true,
        });
        // High response time alarm
        new cloudwatch.Alarm(this, 'ALB-HighResponseTime', {
            alarmName: `BCOS-${environment}-ALB-HighResponseTime`,
            alarmDescription: `ALB response time is high for ${environment}`,
            metric: new cloudwatch.Metric({
                namespace: 'AWS/ApplicationELB',
                metricName: 'TargetResponseTime',
                dimensionsMap: {
                    LoadBalancer: loadBalancer.loadBalancerArn.split('/').slice(1).join('/'),
                },
                statistic: 'Average',
                period: cdk.Duration.minutes(5),
            }),
            threshold: environment === 'production' ? 2 : 5,
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
            evaluationPeriods: 3,
            actionsEnabled: true,
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
        // Error count alarm
        new cloudwatch.Alarm(this, 'App-HighErrorRate', {
            alarmName: `BCOS-${environment}-App-HighErrorRate`,
            alarmDescription: `Application is logging high error rates for ${environment}`,
            metric: errorMetricFilter.metric({
                statistic: 'Sum',
                period: cdk.Duration.minutes(5),
            }),
            threshold: environment === 'production' ? 5 : 10,
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
            evaluationPeriods: 2,
            actionsEnabled: true,
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
        new cloudwatch.Alarm(this, 'App-HealthCheckFailures', {
            alarmName: `BCOS-${environment}-App-HealthCheckFailures`,
            alarmDescription: `Application health checks are failing for ${environment}`,
            metric: healthCheckMetricFilter.metric({
                statistic: 'Sum',
                period: cdk.Duration.minutes(5),
            }),
            threshold: 3,
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
            evaluationPeriods: 2,
            actionsEnabled: true,
        });
    }
    addDashboardWidgets(service, cluster, loadBalancer, targetGroup, environment) {
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
                        LoadBalancer: loadBalancer.loadBalancerArn.split('/').slice(1).join('/'),
                    },
                    statistic: 'Sum',
                }),
            ],
            right: [
                new cloudwatch.Metric({
                    namespace: 'AWS/ApplicationELB',
                    metricName: 'TargetResponseTime',
                    dimensionsMap: {
                        LoadBalancer: loadBalancer.loadBalancerArn.split('/').slice(1).join('/'),
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
        new cloudwatch.CompositeAlarm(this, 'ServiceHealth-Composite', {
            compositeAlarmName: `BCOS-${environment}-ServiceHealth`,
            alarmDescription: `Overall service health for ${environment}`,
            alarmRule: cloudwatch.AlarmRule.anyOf(cloudwatch.AlarmRule.fromAlarm(cloudwatch.Alarm.fromAlarmArn(this, 'RefECSTaskCount', `arn:aws:cloudwatch:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:alarm:BCOS-${environment}-ECS-LowTaskCount`), cloudwatch.AlarmState.ALARM), cloudwatch.AlarmRule.fromAlarm(cloudwatch.Alarm.fromAlarmArn(this, 'RefUnhealthyTargets', `arn:aws:cloudwatch:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:alarm:BCOS-${environment}-ALB-UnhealthyTargets`), cloudwatch.AlarmState.ALARM)),
            actionsEnabled: true,
        });
    }
}
exports.Monitoring = Monitoring;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9uaXRvcmluZy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIm1vbml0b3JpbmcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLHVFQUF5RDtBQUN6RCxzRkFBd0U7QUFDeEUseURBQTJDO0FBQzNDLG9GQUFzRTtBQUd0RSwyREFBNkM7QUFFN0MsMkNBQXVDO0FBaUR2Qzs7O0dBR0c7QUFDSCxNQUFhLFVBQVcsU0FBUSxzQkFBUztJQUN2QixVQUFVLENBQVk7SUFDdEIsU0FBUyxDQUF1QjtJQUVoRCxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQXNCO1FBQzlELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsTUFBTSxFQUNKLFdBQVcsRUFDWCxNQUFNLEVBQ04sVUFBVSxFQUNWLFVBQVUsRUFDVixZQUFZLEVBQ1osV0FBVyxFQUNYLFFBQVEsRUFDUixXQUFXLEdBQUcsRUFBRSxFQUNoQix3QkFBd0IsR0FBRyxXQUFXLEtBQUssWUFBWSxHQUN4RCxHQUFHLEtBQUssQ0FBQztRQUVWLDhCQUE4QjtRQUM5QixJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsWUFBWSxFQUFFO1lBQ2xELFNBQVMsRUFBRSxRQUFRLFdBQVcsU0FBUztZQUN2QyxXQUFXLEVBQUUsUUFBUSxXQUFXLFNBQVM7WUFDekMsU0FBUyxFQUFFLE1BQU07U0FDbEIsQ0FBQyxDQUFDO1FBRUgsMEJBQTBCO1FBQzFCLFdBQVcsQ0FBQyxPQUFPLENBQUMsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLEVBQUU7WUFDbkMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxlQUFlLENBQzdCLElBQUksZ0JBQWdCLENBQUMsaUJBQWlCLENBQUMsS0FBSyxFQUFFO2dCQUM1QyxJQUFJLEVBQUUsS0FBSzthQUNaLENBQUMsQ0FDSCxD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LENBQUMsU0FBUyxDQUM1QixVQUFVLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FDM0IsSUFBSSxFQUNKLHFCQUFxQixFQUNyQixzQkFBc0IsR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxJQUFJLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLE9BQU8sZUFBZSxXQUFXLHVCQUF1QixDQUMvSCxFQUNELFVBQVUsQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUM1QixDQUNGO1lBQ0QsY0FBYyxFQUFFLElBQUk7U0FDckIsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBNVZELGdDQTRWQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgKiBhcyBjbG91ZHdhdGNoIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jbG91ZHdhdGNoJztcbmltcG9ydCAqIGFzIGNsb3Vkd2F0Y2hBY3Rpb25zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jbG91ZHdhdGNoLWFjdGlvbnMnO1xuaW1wb3J0ICogYXMgc25zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zbnMnO1xuaW1wb3J0ICogYXMgc25zU3Vic2NyaXB0aW9ucyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc25zLXN1YnNjcmlwdGlvbnMnO1xuaW1wb3J0ICogYXMgZWNzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lY3MnO1xuaW1wb3J0ICogYXMgZWxidjIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVsYXN0aWNsb2FkYmFsYW5jaW5ndjInO1xuaW1wb3J0ICogYXMgbG9ncyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbG9ncyc7XG5pbXBvcnQgKiBhcyBrbXMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWttcyc7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcblxuZXhwb3J0IGludGVyZmFjZSBNb25pdG9yaW5nUHJvcHMge1xuICAvKipcbiAgICogRW52aXJvbm1lbnQgbmFtZSAoc3RhZ2luZyBvciBwcm9kdWN0aW9uKVxuICAgKi9cbiAgZW52aXJvbm1lbnQ6IHN0cmluZztcblxuICAvKipcbiAgICogS01TIGtleSBmb3IgZW5jcnlwdGlvblxuICAgKi9cbiAga21zS2V5OiBrbXMuSUtleTtcblxuICAvKipcbiAgICogRUNTIHNlcnZpY2UgdG8gbW9uaXRvclxuICAgKi9cbiAgZWNzU2VydmljZTogZWNzLklTZXJ2aWNlO1xuXG4gIC8qKlxuICAgKiBFQ1MgY2x1c3RlclxuICAgKi9cbiAgZWNzQ2x1c3RlcjogZWNzLklDbHVzdGVyO1xuXG4gIC8qKlxuICAgKiBBcHBsaWNhdGlvbiBMb2FkIEJhbGFuY2VyIHRvIG1vbml0b3JcbiAgICovXG4gIGxvYWRCYWxhbmNlcjogZWxidjIuSUFwcGxpY2F0aW9uTG9hZEJhbGFuY2VyO1xuXG4gIC8qKlxuICAgKiBUYXJnZXQgZ3JvdXAgdG8gbW9uaXRvclxuICAgKi9cbiAgdGFyZ2V0R3JvdXA6IGVsYnYyLklBcHBsaWNhdGlvblRhcmdldEdyb3VwO1xuXG4gIC8qKlxuICAgKiBMb2cgZ3JvdXAgdG8gY3JlYXRlIG1ldHJpYyBmaWx0ZXJzIGZvclxuICAgKi9cbiAgbG9nR3JvdXA6IGxvZ3MuSUxvZ0dyb3VwO1xuXG4gIC8qKlxuICAgKiBFbWFpbCBhZGRyZXNzZXMgZm9yIGFsZXJ0IG5vdGlmaWNhdGlvbnNcbiAgICovXG4gIGFsZXJ0RW1haWxzPzogc3RyaW5nW107XG5cbiAgLyoqXG4gICAqIEVuYWJsZSBkZXRhaWxlZCBtb25pdG9yaW5nIChkZWZhdWx0OiB0cnVlIGZvciBwcm9kdWN0aW9uKVxuICAgKi9cbiAgZW5hYmxlRGV0YWlsZWRNb25pdG9yaW5nPzogYm9vbGVhbjtcbn1cblxuLyoqXG4gKiBNb25pdG9yaW5nIGNvbnN0cnVjdCB0aGF0IGNyZWF0ZXMgQ2xvdWRXYXRjaCBhbGFybXMsIGRhc2hib2FyZHMsIGFuZCBTTlMgbm90aWZpY2F0aW9uc1xuICogZm9yIGNvbXByZWhlbnNpdmUgYXBwbGljYXRpb24gbW9uaXRvcmluZ1xuICovXG5leHBvcnQgY2xhc3MgTW9uaXRvcmluZyBleHRlbmRzIENvbnN0cnVjdCB7XG4gIHB1YmxpYyByZWFkb25seSBhbGVydFRvcGljOiBzbnMuVG9waWM7XG4gIHB1YmxpYyByZWFkb25seSBkYXNoYm9hcmQ6IGNsb3Vkd2F0Y2guRGFzaGJvYXJkO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBNb25pdG9yaW5nUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgY29uc3Qge1xuICAgICAgZW52aXJvbm1lbnQsXG4gICAgICBrbXNLZXksXG4gICAgICBlY3NTZXJ2aWNlLFxuICAgICAgZWNzQ2x1c3RlcixcbiAgICAgIGxvYWRCYWxhbmNlcixcbiAgICAgIHRhcmdldEdyb3VwLFxuICAgICAgbG9nR3JvdXAsXG4gICAgICBhbGVydEVtYWlscyA9IFtdLFxuICAgICAgZW5hYmxlRGV0YWlsZWRNb25pdG9yaW5nID0gZW52aXJvbm1lbnQgPT09ICdwcm9kdWN0aW9uJyxcbiAgICB9ID0gcHJvcHM7XG5cbiAgICAvLyBDcmVhdGUgU05TIHRvcGljIGZvciBhbGVydHNcbiAgICB0aGlzLmFsZXJ0VG9waWMgPSBuZXcgc25zLlRvcGljKHRoaXMsICdBbGVydFRvcGljJywge1xuICAgICAgdG9waWNOYW1lOiBgYmNvcy0ke2Vudmlyb25tZW50fS1hbGVydHNgLFxuICAgICAgZGlzcGxheU5hbWU6IGBCQ09TICR7ZW52aXJvbm1lbnR9IEFsZXJ0c2AsXG4gICAgICBtYXN0ZXJLZXk6IGttc0tleSxcbiAgICB9KTtcblxuICAgIC8vIEFkZCBlbWFpbCBzdWJzY3JpcHRpb25zXG4gICAgYWxlcnRFbWFpbHMuZm9yRWFjaCgoZW1haWwsIGluZGV4KSA9PiB7XG4gICAgICB0aGlzLmFsZXJ0VG9waWMuYWRkU3Vic2NyaXB0aW9uKFxuICAgICAgICBuZXcgc25zU3Vic2NyaXB0aW9ucy5FbWFpbFN1YnNjcmlwdGlvbihlbWFpbCwge1xuICAgICAgICAgIGpzb246IGZhbHNlLFxuICAgICAgICB9KVxuICAgICAgKTtcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBDbG91ZFdhdGNoIERhc2hib2FyZFxuICAgIHRoaXMuZGFzaGJvYXJkID0gbmV3IGNsb3Vkd2F0Y2guRGFzaGJvYXJkKHRoaXMsICdEYXNoYm9hcmQnLCB7XG4gICAgICBkYXNoYm9hcmROYW1lOiBgQkNPUy0ke2Vudmlyb25tZW50fS1EYXNoYm9hcmRgLFxuICAgIH0pO1xuXG4gICAgLy8gRUNTIFNlcnZpY2UgQWxhcm1zXG4gICAgdGhpcy5jcmVhdGVFQ1NBbGFybXMoZWNzU2VydmljZSwgZWNzQ2x1c3RlciwgZW52aXJvbm1lbnQpO1xuXG4gICAgLy8gQUxCIEFsYXJtc1xuICAgIHRoaXMuY3JlYXRlQUxCQWxhcm1zKGxvYWRCYWxhbmNlciwgdGFyZ2V0R3JvdXAsIGVudmlyb25tZW50KTtcblxuICAgIC8vIEFwcGxpY2F0aW9uIExvZyBBbGFybXNcbiAgICB0aGlzLmNyZWF0ZUFwcGxpY2F0aW9uTG9nQWxhcm1zKGxvZ0dyb3VwLCBlbnZpcm9ubWVudCk7XG5cbiAgICAvLyBBZGQgd2lkZ2V0cyB0byBkYXNoYm9hcmRcbiAgICB0aGlzLmFkZERhc2hib2FyZFdpZGdldHMoZWNzU2VydmljZSwgZWNzQ2x1c3RlciwgbG9hZEJhbGFuY2VyLCB0YXJnZXRHcm91cCwgZW52aXJvbm1lbnQpO1xuXG4gICAgLy8gQ3JlYXRlIGNvbXBvc2l0ZSBhbGFybSBmb3Igc2VydmljZSBoZWFsdGhcbiAgICBpZiAoZW52aXJvbm1lbnQgPT09ICdwcm9kdWN0aW9uJykge1xuICAgICAgdGhpcy5jcmVhdGVDb21wb3NpdGVBbGFybXMoZW52aXJvbm1lbnQpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgY3JlYXRlRUNTQWxhcm1zKHNlcnZpY2U6IGVjcy5JU2VydmljZSwgY2x1c3RlcjogZWNzLklDbHVzdGVyLCBlbnZpcm9ubWVudDogc3RyaW5nKTogdm9pZCB7XG4gICAgLy8gSGVscGVyIGZ1bmN0aW9uIHRvIGNyZWF0ZSBhbGFybXMgd2l0aCBwcm9wZXIgYWN0aW9uc1xuICAgIGNvbnN0IGNyZWF0ZUFsYXJtID0gKGlkOiBzdHJpbmcsIHByb3BzOiBjbG91ZHdhdGNoLkFsYXJtUHJvcHMpID0+IHtcbiAgICAgIGNvbnN0IGFsYXJtID0gbmV3IGNsb3Vkd2F0Y2guQWxhcm0odGhpcywgaWQsIHByb3BzKTtcbiAgICAgIGFsYXJtLmFkZEFsYXJtQWN0aW9uKG5ldyBjbG91ZHdhdGNoQWN0aW9ucy5TbnNBY3Rpb24odGhpcy5hbGVydFRvcGljKSk7XG4gICAgICByZXR1cm4gYWxhcm07XG4gICAgfTtcblxuICAgIC8vIFNlcnZpY2UgcnVubmluZyB0YXNrIGNvdW50IGFsYXJtXG4gICAgY3JlYXRlQWxhcm0oJ0VDUy1SdW5uaW5nVGFza0NvdW50Jywge1xuICAgICAgYWxhcm1OYW1lOiBgQkNPUy0ke2Vudmlyb25tZW50fS1FQ1MtTG93VGFza0NvdW50YCxcbiAgICAgIGFsYXJtRGVzY3JpcHRpb246IGBFQ1Mgc2VydmljZSBoYXMgZmV3ZXIgcnVubmluZyB0YXNrcyB0aGFuIGRlc2lyZWQgZm9yICR7ZW52aXJvbm1lbnR9YCxcbiAgICAgIG1ldHJpYzogbmV3IGNsb3Vkd2F0Y2guTWV0cmljKHtcbiAgICAgICAgbmFtZXNwYWNlOiAnQVdTL0VDUycsXG4gICAgICAgIG1ldHJpY05hbWU6ICdSdW5uaW5nVGFza0NvdW50JyxcbiAgICAgICAgZGltZW5zaW9uc01hcDoge1xuICAgICAgICAgIFNlcnZpY2VOYW1lOiBzZXJ2aWNlLnNlcnZpY2VOYW1lLFxuICAgICAgICAgIENsdXN0ZXJOYW1lOiBjbHVzdGVyLmNsdXN0ZXJOYW1lLFxuICAgICAgICB9LFxuICAgICAgICBzdGF0aXN0aWM6ICdBdmVyYWdlJyxcbiAgICAgICAgcGVyaW9kOiBjZGsuRHVyYXRpb24ubWludXRlcygxKSxcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiBlbnZpcm9ubWVudCA9PT0gJ3Byb2R1Y3Rpb24nID8gMSA6IDAuNSxcbiAgICAgIGNvbXBhcmlzb25PcGVyYXRvcjogY2xvdWR3YXRjaC5Db21wYXJpc29uT3BlcmF0b3IuTEVTU19USEFOX1RIUkVTSE9MRCxcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAyLFxuICAgIH0pO1xuXG4gICAgLy8gQ1BVIHV0aWxpemF0aW9uIGFsYXJtXG4gICAgY3JlYXRlQWxhcm0oJ0VDUy1IaWdoQ1BVJywge1xuICAgICAgYWxhcm1OYW1lOiBgQkNPUy0ke2Vudmlyb25tZW50fS1FQ1MtSGlnaENQVWAsXG4gICAgICBhbGFybURlc2NyaXB0aW9uOiBgRUNTIHNlcnZpY2UgQ1BVIHV0aWxpemF0aW9uIGlzIGhpZ2ggZm9yICR7ZW52aXJvbm1lbnR9YCxcbiAgICAgIG1ldHJpYzogbmV3IGNsb3Vkd2F0Y2guTWV0cmljKHtcbiAgICAgICAgbmFtZXNwYWNlOiAnQVdTL0VDUycsXG4gICAgICAgIG1ldHJpY05hbWU6ICdDUFVVdGlsaXphdGlvbicsXG4gICAgICAgIGRpbWVuc2lvbnNNYXA6IHtcbiAgICAgICAgICBTZXJ2aWNlTmFtZTogc2VydmljZS5zZXJ2aWNlTmFtZSxcbiAgICAgICAgICBDbHVzdGVyTmFtZTogY2x1c3Rlci5jbHVzdGVyTmFtZSxcbiAgICAgICAgfSxcbiAgICAgICAgc3RhdGlzdGljOiAnQXZlcmFnZScsXG4gICAgICAgIHBlcmlvZDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICB9KSxcbiAgICAgIHRocmVzaG9sZDogZW52aXJvbm1lbnQgPT09ICdwcm9kdWN0aW9uJyA/IDgwIDogODUsXG4gICAgICBjb21wYXJpc29uT3BlcmF0b3I6IGNsb3Vkd2F0Y2guQ29tcGFyaXNvbk9wZXJhdG9yLkdSRUFURVJfVEhBTl9USFJFU0hPTEQsXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMyxcbiAgICB9KTtcblxuICAgIC8vIE1lbW9yeSB1dGlsaXphdGlvbiBhbGFybVxuICAgIGNyZWF0ZUFsYXJtKCdFQ1MtSGlnaE1lbW9yeScsIHtcbiAgICAgIGFsYXJtTmFtZTogYEJDT1MtJHtlbnZpcm9ubWVudH0tRUNTLUhpZ2hNZW1vcnlgLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjogYEVDUyBzZXJ2aWNlIG1lbW9yeSB1dGlsaXphdGlvbiBpcyBoaWdoIGZvciAke2Vudmlyb25tZW50fWAsXG4gICAgICBtZXRyaWM6IG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgIG5hbWVzcGFjZTogJ0FXUy9FQ1MnLFxuICAgICAgICBtZXRyaWNOYW1lOiAnTWVtb3J5VXRpbGl6YXRpb24nLFxuICAgICAgICBkaW1lbnNpb25zTWFwOiB7XG4gICAgICAgICAgU2VydmljZU5hbWU6IHNlcnZpY2Uuc2VydmljZU5hbWUsXG4gICAgICAgICAgQ2x1c3Rlck5hbWU6IGNsdXN0ZXIuY2x1c3Rlck5hbWUsXG4gICAgICAgIH0sXG4gICAgICAgIHN0YXRpc3RpYzogJ0F2ZXJhZ2UnLFxuICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgfSksXG4gICAgICB0aHJlc2hvbGQ6IGVudmlyb25tZW50ID09PSAncHJvZHVjdGlvbicgPyA4NSA6IDkwLFxuICAgICAgY29tcGFyaXNvbk9wZXJhdG9yOiBjbG91ZHdhdGNoLkNvbXBhcmlzb25PcGVyYXRvci5HUkVBVEVSX1RIQU5fVEhSRVNIT0xELFxuICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDMsXG4gICAgfSk7XG4gIH1cblxuICBwcml2YXRlIGNyZWF0ZUFMQkFsYXJtcyhcbiAgICBsb2FkQmFsYW5jZXI6IGVsYnYyLklBcHBsaWNhdGlvbkxvYWRCYWxhbmNlcixcbiAgICB0YXJnZXRHcm91cDogZWxidjIuSUFwcGxpY2F0aW9uVGFyZ2V0R3JvdXAsXG4gICAgZW52aXJvbm1lbnQ6IHN0cmluZ1xuICApOiB2b2lkIHtcbiAgICAvLyBVbmhlYWx0aHkgdGFyZ2V0IGFsYXJtXG4gICAgbmV3IGNsb3Vkd2F0Y2guQWxhcm0odGhpcywgJ0FMQi1VbmhlYWx0aHlUYXJnZXRzJywge1xuICAgICAgYWxhcm1OYW1lOiBgQkNPUy0ke2Vudmlyb25tZW50fS1BTEItVW5oZWFsdGh5VGFyZ2V0c2AsXG4gICAgICBhbGFybURlc2NyaXB0aW9uOiBgQUxCIGhhcyB1bmhlYWx0aHkgdGFyZ2V0cyBmb3IgJHtlbnZpcm9ubWVudH1gLFxuICAgICAgbWV0cmljOiBuZXcgY2xvdWR3YXRjaC5NZXRyaWMoe1xuICAgICAgICBuYW1lc3BhY2U6ICdBV1MvQXBwbGljYXRpb25FTEInLFxuICAgICAgICBtZXRyaWNOYW1lOiAnVW5IZWFsdGh5SG9zdENvdW50JyxcbiAgICAgICAgZGltZW5zaW9uc01hcDoge1xuICAgICAgICAgIExvYWRCYWxhbmNlcjogbG9hZEJhbGFuY2VyLmxvYWRCYWxhbmNlckFybi5zcGxpdCgnLycpLnNsaWNlKDEpLmpvaW4oJy8nKSxcbiAgICAgICAgICBUYXJnZXRHcm91cDogdGFyZ2V0R3JvdXAudGFyZ2V0R3JvdXBBcm4uc3BsaXQoJy8nKS5zbGljZSgxKS5qb2luKCcvJyksXG4gICAgICAgIH0sXG4gICAgICAgIHN0YXRpc3RpYzogJ01heGltdW0nLFxuICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDEpLFxuICAgICAgfSksXG4gICAgICB0aHJlc2hvbGQ6IDAsXG4gICAgICBjb21wYXJpc29uT3BlcmF0b3I6IGNsb3Vkd2F0Y2guQ29tcGFyaXNvbk9wZXJhdG9yLkdSRUFURVJfVEhBTl9USFJFU0hPTEQsXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMixcbiAgICAgIGFjdGlvbnNFbmFibGVkOiB0cnVlLFxuICAgIH0pO1xuXG4gICAgLy8gSGlnaCA1WFggZXJyb3IgcmF0ZSBhbGFybVxuICAgIG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsICdBTEItSGlnaDVYWEVycm9ycycsIHtcbiAgICAgIGFsYXJtTmFtZTogYEJDT1MtJHtlbnZpcm9ubWVudH0tQUxCLUhpZ2g1WFhFcnJvcnNgLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjogYEFMQiBpcyByZXR1cm5pbmcgaGlnaCA1WFggZXJyb3JzIGZvciAke2Vudmlyb25tZW50fWAsXG4gICAgICBtZXRyaWM6IG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgIG5hbWVzcGFjZTogJ0FXUy9BcHBsaWNhdGlvbkVMQicsXG4gICAgICAgIG1ldHJpY05hbWU6ICdIVFRQQ29kZV9FTEJfNVhYX0NvdW50JyxcbiAgICAgICAgZGltZW5zaW9uc01hcDoge1xuICAgICAgICAgIExvYWRCYWxhbmNlcjogbG9hZEJhbGFuY2VyLmxvYWRCYWxhbmNlckFybi5zcGxpdCgnLycpLnNsaWNlKDEpLmpvaW4oJy8nKSxcbiAgICAgICAgfSxcbiAgICAgICAgc3RhdGlzdGljOiAnU3VtJyxcbiAgICAgICAgcGVyaW9kOiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiBlbnZpcm9ubWVudCA9PT0gJ3Byb2R1Y3Rpb24nID8gMTAgOiAyMCxcbiAgICAgIGNvbXBhcmlzb25PcGVyYXRvcjogY2xvdWR3YXRjaC5Db21wYXJpc29uT3BlcmF0b3IuR1JFQVRFUl9USEFOX1RIUkVTSE9MRCxcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAyLFxuICAgICAgYWN0aW9uc0VuYWJsZWQ6IHRydWUsXG4gICAgfSk7XG5cbiAgICAvLyBIaWdoIHJlc3BvbnNlIHRpbWUgYWxhcm1cbiAgICBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCAnQUxCLUhpZ2hSZXNwb25zZVRpbWUnLCB7XG4gICAgICBhbGFybU5hbWU6IGBCQ09TLSR7ZW52aXJvbm1lbnR9LUFMQi1IaWdoUmVzcG9uc2VUaW1lYCxcbiAgICAgIGFsYXJtRGVzY3JpcHRpb246IGBBTEIgcmVzcG9uc2UgdGltZSBpcyBoaWdoIGZvciAke2Vudmlyb25tZW50fWAsXG4gICAgICBtZXRyaWM6IG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgIG5hbWVzcGFjZTogJ0FXUy9BcHBsaWNhdGlvbkVMQicsXG4gICAgICAgIG1ldHJpY05hbWU6ICdUYXJnZXRSZXNwb25zZVRpbWUnLFxuICAgICAgICBkaW1lbnNpb25zTWFwOiB7XG4gICAgICAgICAgTG9hZEJhbGFuY2VyOiBsb2FkQmFsYW5jZXIubG9hZEJhbGFuY2VyQXJuLnNwbGl0KCcvJykuc2xpY2UoMSkuam9pbignLycpLFxuICAgICAgICB9LFxuICAgICAgICBzdGF0aXN0aWM6ICdBdmVyYWdlJyxcbiAgICAgICAgcGVyaW9kOiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiBlbnZpcm9ubWVudCA9PT0gJ3Byb2R1Y3Rpb24nID8gMiA6IDUsXG4gICAgICBjb21wYXJpc29uT3BlcmF0b3I6IGNsb3Vkd2F0Y2guQ29tcGFyaXNvbk9wZXJhdG9yLkdSRUFURVJfVEhBTl9USFJFU0hPTEQsXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMyxcbiAgICAgIGFjdGlvbnNFbmFibGVkOiB0cnVlLFxuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBjcmVhdGVBcHBsaWNhdGlvbkxvZ0FsYXJtcyhsb2dHcm91cDogbG9ncy5JTG9nR3JvdXAsIGVudmlyb25tZW50OiBzdHJpbmcpOiB2b2lkIHtcbiAgICAvLyBFcnJvciBsb2cgbWV0cmljIGZpbHRlclxuICAgIGNvbnN0IGVycm9yTWV0cmljRmlsdGVyID0gbmV3IGxvZ3MuTWV0cmljRmlsdGVyKHRoaXMsICdFcnJvckxvZ0ZpbHRlcicsIHtcbiAgICAgIGxvZ0dyb3VwOiBsb2dHcm91cCxcbiAgICAgIG1ldHJpY05hbWVzcGFjZTogYEJDT1MvJHtlbnZpcm9ubWVudH1gLFxuICAgICAgbWV0cmljTmFtZTogJ0Vycm9yQ291bnQnLFxuICAgICAgbWV0cmljVmFsdWU6ICcxJyxcbiAgICAgIGZpbHRlclBhdHRlcm46IGxvZ3MuRmlsdGVyUGF0dGVybi5hbnlUZXJtKCdFUlJPUicsICdGQVRBTCcsICdwYW5pYycsICdleGNlcHRpb24nKSxcbiAgICAgIGRlZmF1bHRWYWx1ZTogMCxcbiAgICB9KTtcblxuICAgIC8vIEVycm9yIGNvdW50IGFsYXJtXG4gICAgbmV3IGNsb3Vkd2F0Y2guQWxhcm0odGhpcywgJ0FwcC1IaWdoRXJyb3JSYXRlJywge1xuICAgICAgYWxhcm1OYW1lOiBgQkNPUy0ke2Vudmlyb25tZW50fS1BcHAtSGlnaEVycm9yUmF0ZWAsXG4gICAgICBhbGFybURlc2NyaXB0aW9uOiBgQXBwbGljYXRpb24gaXMgbG9nZ2luZyBoaWdoIGVycm9yIHJhdGVzIGZvciAke2Vudmlyb25tZW50fWAsXG4gICAgICBtZXRyaWM6IGVycm9yTWV0cmljRmlsdGVyLm1ldHJpYyh7XG4gICAgICAgIHN0YXRpc3RpYzogJ1N1bScsXG4gICAgICAgIHBlcmlvZDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICB9KSxcbiAgICAgIHRocmVzaG9sZDogZW52aXJvbm1lbnQgPT09ICdwcm9kdWN0aW9uJyA/IDUgOiAxMCxcbiAgICAgIGNvbXBhcmlzb25PcGVyYXRvcjogY2xvdWR3YXRjaC5Db21wYXJpc29uT3BlcmF0b3IuR1JFQVRFUl9USEFOX1RIUkVTSE9MRCxcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAyLFxuICAgICAgYWN0aW9uc0VuYWJsZWQ6IHRydWUsXG4gICAgfSk7XG5cbiAgICAvLyBIZWFsdGggY2hlY2sgZmFpbHVyZSBtZXRyaWMgZmlsdGVyXG4gICAgY29uc3QgaGVhbHRoQ2hlY2tNZXRyaWNGaWx0ZXIgPSBuZXcgbG9ncy5NZXRyaWNGaWx0ZXIodGhpcywgJ0hlYWx0aENoZWNrRmFpbHVyZUZpbHRlcicsIHtcbiAgICAgIGxvZ0dyb3VwOiBsb2dHcm91cCxcbiAgICAgIG1ldHJpY05hbWVzcGFjZTogYEJDT1MvJHtlbnZpcm9ubWVudH1gLFxuICAgICAgbWV0cmljTmFtZTogJ0hlYWx0aENoZWNrRmFpbHVyZXMnLFxuICAgICAgbWV0cmljVmFsdWU6ICcxJyxcbiAgICAgIGZpbHRlclBhdHRlcm46IGxvZ3MuRmlsdGVyUGF0dGVybi5hbGwoXG4gICAgICAgIGxvZ3MuRmlsdGVyUGF0dGVybi5zdHJpbmdWYWx1ZSgncGF0aCcsICc9JywgJy9oZWFsdGgnKSxcbiAgICAgICAgbG9ncy5GaWx0ZXJQYXR0ZXJuLm51bWJlclZhbHVlKCdzdGF0dXMnLCAnPj0nLCA0MDApXG4gICAgICApLFxuICAgICAgZGVmYXVsdFZhbHVlOiAwLFxuICAgIH0pO1xuXG4gICAgLy8gSGVhbHRoIGNoZWNrIGZhaWx1cmUgYWxhcm1cbiAgICBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCAnQXBwLUhlYWx0aENoZWNrRmFpbHVyZXMnLCB7XG4gICAgICBhbGFybU5hbWU6IGBCQ09TLSR7ZW52aXJvbm1lbnR9LUFwcC1IZWFsdGhDaGVja0ZhaWx1cmVzYCxcbiAgICAgIGFsYXJtRGVzY3JpcHRpb246IGBBcHBsaWNhdGlvbiBoZWFsdGggY2hlY2tzIGFyZSBmYWlsaW5nIGZvciAke2Vudmlyb25tZW50fWAsXG4gICAgICBtZXRyaWM6IGhlYWx0aENoZWNrTWV0cmljRmlsdGVyLm1ldHJpYyh7XG4gICAgICAgIHN0YXRpc3RpYzogJ1N1bScsXG4gICAgICAgIHBlcmlvZDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICB9KSxcbiAgICAgIHRocmVzaG9sZDogMyxcbiAgICAgIGNvbXBhcmlzb25PcGVyYXRvcjogY2xvdWR3YXRjaC5Db21wYXJpc29uT3BlcmF0b3IuR1JFQVRFUl9USEFOX1RIUkVTSE9MRCxcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAyLFxuICAgICAgYWN0aW9uc0VuYWJsZWQ6IHRydWUsXG4gICAgfSk7XG4gIH1cblxuICBwcml2YXRlIGFkZERhc2hib2FyZFdpZGdldHMoXG4gICAgc2VydmljZTogZWNzLklTZXJ2aWNlLFxuICAgIGNsdXN0ZXI6IGVjcy5JQ2x1c3RlcixcbiAgICBsb2FkQmFsYW5jZXI6IGVsYnYyLklBcHBsaWNhdGlvbkxvYWRCYWxhbmNlcixcbiAgICB0YXJnZXRHcm91cDogZWxidjIuSUFwcGxpY2F0aW9uVGFyZ2V0R3JvdXAsXG4gICAgZW52aXJvbm1lbnQ6IHN0cmluZ1xuICApOiB2b2lkIHtcbiAgICAvLyBFQ1MgTWV0cmljcyBXaWRnZXRcbiAgICB0aGlzLmRhc2hib2FyZC5hZGRXaWRnZXRzKFxuICAgICAgbmV3IGNsb3Vkd2F0Y2guR3JhcGhXaWRnZXQoe1xuICAgICAgICB0aXRsZTogYEVDUyBTZXJ2aWNlIE1ldHJpY3MgLSAke2Vudmlyb25tZW50fWAsXG4gICAgICAgIGxlZnQ6IFtcbiAgICAgICAgICBuZXcgY2xvdWR3YXRjaC5NZXRyaWMoe1xuICAgICAgICAgICAgbmFtZXNwYWNlOiAnQVdTL0VDUycsXG4gICAgICAgICAgICBtZXRyaWNOYW1lOiAnQ1BVVXRpbGl6YXRpb24nLFxuICAgICAgICAgICAgZGltZW5zaW9uc01hcDoge1xuICAgICAgICAgICAgICBTZXJ2aWNlTmFtZTogc2VydmljZS5zZXJ2aWNlTmFtZSxcbiAgICAgICAgICAgICAgQ2x1c3Rlck5hbWU6IGNsdXN0ZXIuY2x1c3Rlck5hbWUsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgc3RhdGlzdGljOiAnQXZlcmFnZScsXG4gICAgICAgICAgfSksXG4gICAgICAgIF0sXG4gICAgICAgIHJpZ2h0OiBbXG4gICAgICAgICAgbmV3IGNsb3Vkd2F0Y2guTWV0cmljKHtcbiAgICAgICAgICAgIG5hbWVzcGFjZTogJ0FXUy9FQ1MnLFxuICAgICAgICAgICAgbWV0cmljTmFtZTogJ01lbW9yeVV0aWxpemF0aW9uJyxcbiAgICAgICAgICAgIGRpbWVuc2lvbnNNYXA6IHtcbiAgICAgICAgICAgICAgU2VydmljZU5hbWU6IHNlcnZpY2Uuc2VydmljZU5hbWUsXG4gICAgICAgICAgICAgIENsdXN0ZXJOYW1lOiBjbHVzdGVyLmNsdXN0ZXJOYW1lLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHN0YXRpc3RpYzogJ0F2ZXJhZ2UnLFxuICAgICAgICAgIH0pLFxuICAgICAgICBdLFxuICAgICAgICB3aWR0aDogMTIsXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyBBTEIgTWV0cmljcyBXaWRnZXRcbiAgICB0aGlzLmRhc2hib2FyZC5hZGRXaWRnZXRzKFxuICAgICAgbmV3IGNsb3Vkd2F0Y2guR3JhcGhXaWRnZXQoe1xuICAgICAgICB0aXRsZTogYEFMQiBNZXRyaWNzIC0gJHtlbnZpcm9ubWVudH1gLFxuICAgICAgICBsZWZ0OiBbXG4gICAgICAgICAgbmV3IGNsb3Vkd2F0Y2guTWV0cmljKHtcbiAgICAgICAgICAgIG5hbWVzcGFjZTogJ0FXUy9BcHBsaWNhdGlvbkVMQicsXG4gICAgICAgICAgICBtZXRyaWNOYW1lOiAnUmVxdWVzdENvdW50JyxcbiAgICAgICAgICAgIGRpbWVuc2lvbnNNYXA6IHtcbiAgICAgICAgICAgICAgTG9hZEJhbGFuY2VyOiBsb2FkQmFsYW5jZXIubG9hZEJhbGFuY2VyQXJuLnNwbGl0KCcvJykuc2xpY2UoMSkuam9pbignLycpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHN0YXRpc3RpYzogJ1N1bScsXG4gICAgICAgICAgfSksXG4gICAgICAgIF0sXG4gICAgICAgIHJpZ2h0OiBbXG4gICAgICAgICAgbmV3IGNsb3Vkd2F0Y2guTWV0cmljKHtcbiAgICAgICAgICAgIG5hbWVzcGFjZTogJ0FXUy9BcHBsaWNhdGlvbkVMQicsXG4gICAgICAgICAgICBtZXRyaWNOYW1lOiAnVGFyZ2V0UmVzcG9uc2VUaW1lJyxcbiAgICAgICAgICAgIGRpbWVuc2lvbnNNYXA6IHtcbiAgICAgICAgICAgICAgTG9hZEJhbGFuY2VyOiBsb2FkQmFsYW5jZXIubG9hZEJhbGFuY2VyQXJuLnNwbGl0KCcvJykuc2xpY2UoMSkuam9pbignLycpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHN0YXRpc3RpYzogJ0F2ZXJhZ2UnLFxuICAgICAgICAgIH0pLFxuICAgICAgICBdLFxuICAgICAgICB3aWR0aDogMTIsXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyBBcHBsaWNhdGlvbiBFcnJvciBXaWRnZXRcbiAgICB0aGlzLmRhc2hib2FyZC5hZGRXaWRnZXRzKFxuICAgICAgbmV3IGNsb3Vkd2F0Y2guR3JhcGhXaWRnZXQoe1xuICAgICAgICB0aXRsZTogYEFwcGxpY2F0aW9uIEVycm9ycyAtICR7ZW52aXJvbm1lbnR9YCxcbiAgICAgICAgbGVmdDogW1xuICAgICAgICAgIG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgICAgICBuYW1lc3BhY2U6IGBCQ09TLyR7ZW52aXJvbm1lbnR9YCxcbiAgICAgICAgICAgIG1ldHJpY05hbWU6ICdFcnJvckNvdW50JyxcbiAgICAgICAgICAgIHN0YXRpc3RpYzogJ1N1bScsXG4gICAgICAgICAgfSksXG4gICAgICAgIF0sXG4gICAgICAgIHdpZHRoOiAxMixcbiAgICAgIH0pXG4gICAgKTtcbiAgfVxuXG4gIHByaXZhdGUgY3JlYXRlQ29tcG9zaXRlQWxhcm1zKGVudmlyb25tZW50OiBzdHJpbmcpOiB2b2lkIHtcbiAgICAvLyBTZXJ2aWNlIGhlYWx0aCBjb21wb3NpdGUgYWxhcm0gKHByb2R1Y3Rpb24gb25seSlcbiAgICBuZXcgY2xvdWR3YXRjaC5Db21wb3NpdGVBbGFybSh0aGlzLCAnU2VydmljZUhlYWx0aC1Db21wb3NpdGUnLCB7XG4gICAgICBjb21wb3NpdGVBbGFybU5hbWU6IGBCQ09TLSR7ZW52aXJvbm1lbnR9LVNlcnZpY2VIZWFsdGhgLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjogYE92ZXJhbGwgc2VydmljZSBoZWFsdGggZm9yICR7ZW52aXJvbm1lbnR9YCxcbiAgICAgIGFsYXJtUnVsZTogY2xvdWR3YXRjaC5BbGFybVJ1bGUuYW55T2YoXG4gICAgICAgIGNsb3Vkd2F0Y2guQWxhcm1SdWxlLmZyb21BbGFybShcbiAgICAgICAgICBjbG91ZHdhdGNoLkFsYXJtLmZyb21BbGFybUFybihcbiAgICAgICAgICAgIHRoaXMsXG4gICAgICAgICAgICAnUmVmRUNTVGFza0NvdW50JyxcbiAgICAgICAgICAgIGBhcm46YXdzOmNsb3Vkd2F0Y2g6JHtjZGsuU3RhY2sub2YodGhpcykucmVnaW9ufToke2Nkay5TdGFjay5vZih0aGlzKS5hY2NvdW50fTphbGFybTpCQ09TLSR7ZW52aXJvbm1lbnR9LUVDUy1Mb3dUYXNrQ291bnRgXG4gICAgICAgICAgKSxcbiAgICAgICAgICBjbG91ZHdhdGNoLkFsYXJtU3RhdGUuQUxBUk1cbiAgICAgICAgKSxcbiAgICAgICAgY2xvdWR3YXRjaC5BbGFybVJ1bGUuZnJvbUFsYXJtKFxuICAgICAgICAgIGNsb3Vkd2F0Y2guQWxhcm0uZnJvbUFsYXJtQXJuKFxuICAgICAgICAgICAgdGhpcyxcbiAgICAgICAgICAgICdSZWZVbmhlYWx0aHlUYXJnZXRzJyxcbiAgICAgICAgICAgIGBhcm46YXdzOmNsb3Vkd2F0Y2g6JHtjZGsuU3RhY2sub2YodGhpcykucmVnaW9ufToke2Nkay5TdGFjay5vZih0aGlzKS5hY2NvdW50fTphbGFybTpCQ09TLSR7ZW52aXJvbm1lbnR9LUFMQi1VbmhlYWx0aHlUYXJnZXRzYFxuICAgICAgICAgICksXG4gICAgICAgICAgY2xvdWR3YXRjaC5BbGFybVN0YXRlLkFMQVJNXG4gICAgICAgIClcbiAgICAgICksXG4gICAgICBhY3Rpb25zRW5hYmxlZDogdHJ1ZSxcbiAgICB9KTtcbiAgfVxufVxuIl19