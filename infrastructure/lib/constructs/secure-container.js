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
exports.SecureContainer = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const ecs = __importStar(require("aws-cdk-lib/aws-ecs"));
const logs = __importStar(require("aws-cdk-lib/aws-logs"));
const constructs_1 = require("constructs");
/**
 * Secure container construct that creates hardened ECS task definitions
 * with security best practices applied
 */
class SecureContainer extends constructs_1.Construct {
    taskDefinition;
    container;
    logGroup;
    constructor(scope, id, props) {
        super(scope, id);
        const { environment, cluster, ecrRepository, kmsKey, executionRole, taskRole, secret, cpu, memory, containerPort = 3000, environmentVariables = {}, } = props;
        // Create CloudWatch log group (using AWS managed encryption to avoid circular dependency)
        this.logGroup = new logs.LogGroup(this, 'LogGroup', {
            logGroupName: `/ecs/bcos-${environment}-${Date.now()}`,
            retention: environment === 'production' ? logs.RetentionDays.THREE_MONTHS : logs.RetentionDays.ONE_MONTH,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
        });
        // Create Fargate task definition
        this.taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDefinition', {
            family: `bcos-${environment}`,
            cpu: cpu,
            memoryLimitMiB: memory,
            executionRole: executionRole,
            taskRole: taskRole,
            runtimePlatform: {
                operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
                cpuArchitecture: ecs.CpuArchitecture.X86_64,
            },
        });
        // Container image URI
        const imageUri = `${ecrRepository.repositoryUri}:latest`;
        // Define container with security hardening
        this.container = this.taskDefinition.addContainer('app', {
            containerName: 'bcos',
            image: ecs.ContainerImage.fromRegistry(imageUri),
            // Resource limits
            cpu: cpu,
            memoryLimitMiB: memory,
            // Security settings
            user: '1001', // Non-root user
            readonlyRootFilesystem: true,
            // Linux parameters for additional security (Fargate compatible)
            linuxParameters: new ecs.LinuxParameters(this, 'LinuxParameters', {
                initProcessEnabled: true,
                // Note: sharedMemorySize not supported in Fargate
            }),
            // Logging configuration
            logging: ecs.LogDrivers.awsLogs({
                streamPrefix: 'ecs',
                logGroup: this.logGroup,
                datetimeFormat: '%Y-%m-%d %H:%M:%S',
            }),
            // Health check
            healthCheck: {
                command: ['CMD-SHELL', `curl -f http://localhost:${containerPort}/api/health || exit 1`],
                interval: cdk.Duration.seconds(30),
                timeout: cdk.Duration.seconds(5),
                retries: 3,
                startPeriod: cdk.Duration.seconds(60),
            },
            // Environment variables (non-sensitive)
            environment: {
                NODE_ENV: environment,
                PORT: containerPort.toString(), // Use configurable containerPort (3000 for non-privileged)
                AWS_REGION: cdk.Stack.of(this).region,
                ...environmentVariables,
            },
            // Secrets from Secrets Manager
            secrets: {
                DATABASE_URL: ecs.Secret.fromSecretsManager(secret, 'DATABASE_URL'),
                ANALYTICS_DATABASE_URL: ecs.Secret.fromSecretsManager(secret, 'ANALYTICS_DATABASE_URL'),
                JWT_SECRET: ecs.Secret.fromSecretsManager(secret, 'JWT_SECRET'),
                JWT_REFRESH_SECRET: ecs.Secret.fromSecretsManager(secret, 'JWT_REFRESH_SECRET'),
                CSRF_SECRET: ecs.Secret.fromSecretsManager(secret, 'CSRF_SECRET'),
                EMAIL_FROM: ecs.Secret.fromSecretsManager(secret, 'EMAIL_FROM'),
                ADMIN_NOTIFICATION_EMAILS: ecs.Secret.fromSecretsManager(secret, 'ADMIN_NOTIFICATION_EMAILS'),
            },
            // Essential container
            essential: true,
            // Stop timeout for graceful shutdown
            stopTimeout: cdk.Duration.seconds(30),
            // Disable privileged mode
            privileged: false,
        });
        // Add port mapping
        this.container.addPortMappings({
            containerPort: containerPort,
            protocol: ecs.Protocol.TCP,
            name: 'http',
        });
        // Add ulimits for security
        this.container.addUlimits({
            name: ecs.UlimitName.NOFILE,
            softLimit: 65536,
            hardLimit: 65536,
        });
        // Note: Fargate provides writable /tmp by default, no need for custom volumes
        // Tags
        cdk.Tags.of(this.taskDefinition).add('Environment', environment);
        cdk.Tags.of(this.taskDefinition).add('Application', 'BCOS');
        cdk.Tags.of(this.taskDefinition).add('ManagedBy', 'CDK');
    }
    /**
     * Update the container image tag for deployments
     */
    updateImageTag(tag) {
        // This method would be used by the CI/CD pipeline to update the image tag
        // The actual implementation would depend on the deployment strategy
        const imageUri = `${this.container.imageName?.split(':')[0]}:${tag}`;
        // Note: CDK doesn't directly support runtime image updates
        // This would be handled by the CI/CD pipeline updating the task definition
    }
}
exports.SecureContainer = SecureContainer;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VjdXJlLWNvbnRhaW5lci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInNlY3VyZS1jb250YWluZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLHlEQUEyQztBQUMzQywyREFBNkM7QUFLN0MsMkNBQXVDO0FBMkR2Qzs7O0dBR0c7QUFDSCxNQUFhLGVBQWdCLFNBQVEsc0JBQVM7SUFDNUIsY0FBYyxDQUE0QjtJQUMxQyxTQUFTLENBQTBCO0lBQ25DLFFBQVEsQ0FBZ0I7SUFFeEMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUEyQjtRQUNuRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRWpCLE1BQU0sRUFDSixXQUFXLEVBQ1gsT0FBTyxFQUNQLGFBQWEsRUFDYixNQUFNLEVBQ04sYUFBYSxFQUNiLFFBQVEsRUFDUixNQUFNLEVBQ04sR0FBRyxFQUNILE1BQU0sRUFDTixhQUFhLEdBQUcsSUFBSSxFQUNwQixvQkFBb0IsR0FBRyxFQUFFLEdBQzFCLEdBQUcsS0FBSyxDQUFDO1FBRVYsMEZBQTBGO1FBQzFGLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxVQUFVLEVBQUU7WUFDbEQsWUFBWSxFQUFFLGFBQWEsV0FBVyxJQUFJLElBQUksQ0FBQyxHQUFHLEVBQUUsRUFBRTtZQUN0RCxTQUFTLEVBQUUsV0FBVyxLQUFLLFlBQVksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsU0FBUztZQUN4RyxhQUFhLEVBQUUsR0FBRyxDQUFDLGFBQWEsQ0FBQyxNQUFNO1NBQ3hDLENBQUMsQ0FBQztRQUVILGlDQUFpQztRQUNqQyxJQUFJLENBQUMsY0FBYyxHQUFHLElBQUksR0FBRyxDQUFDLHFC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RTtRQUNwRSxNQUFNLFFBQVEsR0FBRyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsU0FBUyxFQUFFLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxHQUFHLEVBQUUsQ0FBQztRQUNyRSwyREFBMkQ7UUFDM0QsMkVBQTJFO0lBQzdFLENBQUM7Q0FDRjtBQTdJRCwwQ0E2SUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0ICogYXMgZWNzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lY3MnO1xuaW1wb3J0ICogYXMgbG9ncyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbG9ncyc7XG5pbXBvcnQgKiBhcyBrbXMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWttcyc7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgKiBhcyBzZWNyZXRzbWFuYWdlciBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc2VjcmV0c21hbmFnZXInO1xuaW1wb3J0ICogYXMgZWNyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lY3InO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2VjdXJlQ29udGFpbmVyUHJvcHMge1xuICAvKipcbiAgICogRW52aXJvbm1lbnQgbmFtZSAoc3RhZ2luZyBvciBwcm9kdWN0aW9uKVxuICAgKi9cbiAgZW52aXJvbm1lbnQ6IHN0cmluZztcblxuICAvKipcbiAgICogRUNTIGNsdXN0ZXIgZm9yIHRoZSB0YXNrIGRlZmluaXRpb25cbiAgICovXG4gIGNsdXN0ZXI6IGVjcy5JQ2x1c3RlcjtcblxuICAvKipcbiAgICogRUNSIHJlcG9zaXRvcnkgZm9yIGNvbnRhaW5lciBpbWFnZXNcbiAgICovXG4gIGVjclJlcG9zaXRvcnk6IGVjci5JUmVwb3NpdG9yeTtcblxuICAvKipcbiAgICogS01TIGtleSBmb3IgZW5jcnlwdGlvblxuICAgKi9cbiAga21zS2V5OiBrbXMuSUtleTtcblxuICAvKipcbiAgICogVGFzayBleGVjdXRpb24gcm9sZVxuICAgKi9cbiAgZXhlY3V0aW9uUm9sZTogaWFtLklSb2xlO1xuXG4gIC8qKlxuICAgKiBUYXNrIHJvbGUgZm9yIGFwcGxpY2F0aW9uIHJ1bnRpbWVcbiAgICovXG4gIHRhc2tSb2xlOiBpYW0uSVJvbGU7XG5cbiAgLyoqXG4gICAqIFNlY3JldHMgTWFuYWdlciBzZWNyZXQgY29udGFpbmluZyBhcHBsaWNhdGlvbiBjb25maWd1cmF0aW9uXG4gICAqL1xuICBzZWNyZXQ6IHNlY3JldHNtYW5hZ2VyLklTZWNyZXQ7XG5cbiAgLyoqXG4gICAqIENQVSB1bml0cyBmb3IgdGhlIHRhc2sgKDI1NiwgNTEyLCAxMDI0LCAyMDQ4LCA0MDk2KVxuICAgKi9cbiAgY3B1OiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIE1lbW9yeSBpbiBNQlxuICAgKi9cbiAgbWVtb3J5OiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIENvbnRhaW5lciBwb3J0IChkZWZhdWx0OiAzMDAwKVxuICAgKi9cbiAgY29udGFpbmVyUG9ydD86IG51bWJlcjtcblxuICAvKipcbiAgICogQWRkaXRpb25hbCBlbnZpcm9ubWVudCB2YXJpYWJsZXNcbiAgICovXG4gIGVudmlyb25tZW50VmFyaWFibGVzPzogeyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfTtcbn1cblxuLyoqXG4gKiBTZWN1cmUgY29udGFpbmVyIGNvbnN0cnVjdCB0aGF0IGNyZWF0ZXMgaGFyZGVuZWQgRUNTIHRhc2sgZGVmaW5pdGlvbnNcbiAqIHdpdGggc2VjdXJpdHkgYmVzdCBwcmFjdGljZXMgYXBwbGllZFxuICovXG5leHBvcnQgY2xhc3MgU2VjdXJlQ29udGFpbmVyIGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgcHVibGljIHJlYWRvbmx5IHRhc2tEZWZpbml0aW9uOiBlY3MuRmFyZ2F0ZVRhc2tEZWZpbml0aW9uO1xuICBwdWJsaWMgcmVhZG9ubHkgY29udGFpbmVyOiBlY3MuQ29udGFpbmVyRGVmaW5pdGlvbjtcbiAgcHVibGljIHJlYWRvbmx5IGxvZ0dyb3VwOiBsb2dzLkxvZ0dyb3VwO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBTZWN1cmVDb250YWluZXJQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICBjb25zdCB7XG4gICAgICBlbnZpcm9ubWVudCxcbiAgICAgIGNsdXN0ZXIsXG4gICAgICBlY3JSZXBvc2l0b3J5LFxuICAgICAga21zS2V5LFxuICAgICAgZXhlY3V0aW9uUm9sZSxcbiAgICAgIHRhc2tSb2xlLFxuICAgICAgc2VjcmV0LFxuICAgICAgY3B1LFxuICAgICAgbWVtb3J5LFxuICAgICAgY29udGFpbmVyUG9ydCA9IDMwMDAsXG4gICAgICBlbnZpcm9ubWVudFZhcmlhYmxlcyA9IHt9LFxuICAgIH0gPSBwcm9wcztcblxuICAgIC8vIENyZWF0ZSBDbG91ZFdhdGNoIGxvZyBncm91cCAodXNpbmcgQVdTIG1hbmFnZWQgZW5jcnlwdGlvbiB0byBhdm9pZCBjaXJjdWxhciBkZXBlbmRlbmN5KVxuICAgIHRoaXMubG9nR3JvdXAgPSBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnTG9nR3JvdXAnLCB7XG4gICAgICBsb2dHcm91cE5hbWU6IGAvZWNzL2Jjb3MtJHtlbnZpcm9ubWVudH0tJHtEYXRlLm5vdygpfWAsXG4gICAgICByZXRlbnRpb246IGVudmlyb25tZW50ID09PSAncHJvZHVjdGlvbicgPyBsb2dzLlJldGVudGlvbkRheXMuVEhSRUVfTU9OVEhTIDogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9NT05USCxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTixcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBGYXJnYXRlIHRhc2sgZGVmaW5pdGlvblxuICAgIHRoaXMudGFza0RlZmluaXRpb24gPSBuZXcgZWNzLkZhcmdhdGVUYXNrRGVmaW5pdGlvbih0aGlzLCAnVGFza0RlZmluaXRpb24nLCB7XG4gICAgICBmYW1pbHk6IGBiY29zLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgIGNwdTogY3B1LFxuICAgICAgbWVtb3J5TGltaXRNaUI6IG1lbW9yeSxcbiAgICAgIGV4ZWN1dGlvblJvbGU6IGV4ZWN1dGlvblJvbGUsXG4gICAgICB0YXNrUm9sZTogdGFza1JvbGUsXG4gICAgICBydW50aW1lUGxhdGZvcm06IHtcbiAgICAgICAgb3BlcmF0aW5nU3lzdGVtRmFtaWx5OiBlY3MuT3BlcmF0aW5nU3lzdGVtRmFtaWx5LkxJTlVYLFxuICAgICAgICBjcHVBcmNoaXRlY3R1cmU6IGVjcy5DcHVBcmNoaXRlY3R1cmUuWDg2XzY0LFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIENvbnRhaW5lciBpbWFnZSBVUklcbiAgICBjb25zdCBpbWFnZVVyaSA9IGAke2VjclJlcG9zaXRvcnkucmVwb3NpdG9yeVVyaX06bGF0ZXN0YDtcblxuICAgIC8vIERlZmluZSBjb250YWluZXIgd2l0aCBzZWN1cml0eSBoYXJkZW5pbmdcbiAgICB0aGlzLmNvbnRhaW5lciA9IHRoaXMudGFza0RlZmluaXRpb24uYWRkQ29udGFpbmVyKCdhcHAnLCB7XG4gICAgICBjb250YWluZXJOYW1lOiAnYmNvcycsXG4gICAgICBpbWFnZTogZWNzLkNvbnRhaW5lckltYWdlLmZyb21SZWdpc3RyeShpbWFnZVVyaSksXG4gICAgICBcbiAgICAgIC8vIFJlc291cmNlIGxpbWl0c1xuICAgICAgY3B1OiBjcHUsXG4gICAgICBtZW1vcnlMaW1pdE1pQjogbWVtb3J5LFxuICAgICAgXG4gICAgICAvLyBTZWN1cml0eSBzZXR0aW5nc1xuICAgICAgdXNlcjogJzEwMDEnLCAvLyBOb24tcm9vdCB1c2VyXG4gICAgICByZWFkb25seVJvb3RGaWxlc3lzdGVtOiB0cnVlLFxuICAgICAgXG4gICAgICAvLyBMaW51eCBwYXJhbWV0ZXJzIGZvciBhZGRpdGlvbmFsIHNlY3VyaXR5IChGYXJnYXRlIGNvbXBhdGlibGUpXG4gICAgICBsaW51eFBhcmFtZXRlcnM6IG5ldyBlY3MuTGludXhQYXJhbWV0ZXJzKHRoaXMsICdMaW51eFBhcmFtZXRlcnMnLCB7XG4gICAgICAgIGluaXRQcm9jZXNzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgLy8gTm90ZTogc2hhcmVkTWVtb3J5U2l6ZSBub3Qgc3VwcG9ydGVkIGluIEZhcmdhdGVcbiAgICAgIH0pLFxuXG4gICAgICAvLyBMb2dnaW5nIGNvbmZpZ3VyYXRpb25cbiAgICAgIGxvZ2dpbmc6IGVjcy5Mb2dEcml2ZXJzLmF3c0xvZ3Moe1xuICAgICAgICBzdHJlYW1QcmVmaXg6ICdlY3MnLFxuICAgICAgICBsb2dHcm91cDogdGhpcy5sb2dHcm91cCxcbiAgICAgICAgZGF0ZXRpbWVGb3JtYXQ6ICclWS0lbS0lZCAlSDolTTolUycsXG4gICAgICB9KSxcblxuICAgICAgLy8gSGVhbHRoIGNoZWNrXG4gICAgICBoZWFsdGhDaGVjazoge1xuICAgICAgICBjb21tYW5kOiBbJ0NNRC1TSEVMTCcsIGBjdXJsIC1mIGh0dHA6Ly9sb2NhbGhvc3Q6JHtjb250YWluZXJQb3J0fS9oZWFsdGggfHwgZXhpdCAxYF0sXG4gICAgICAgIGludGVydmFsOiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDUpLFxuICAgICAgICByZXRyaWVzOiAzLFxuICAgICAgICBzdGFydFBlcmlvZDogY2RrLkR1cmF0aW9uLnNlY29uZHMoNjApLFxuICAgICAgfSxcblxuICAgICAgLy8gRW52aXJvbm1lbnQgdmFyaWFibGVzIChub24tc2Vuc2l0aXZlKVxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgTk9ERV9FTlY6IGVudmlyb25tZW50LFxuICAgICAgICBQT1JUOiBjb250YWluZXJQb3J0LnRvU3RyaW5nKCksIC8vIFVzZSBjb25maWd1cmFibGUgY29udGFpbmVyUG9ydCAoMzAwMCBmb3Igbm9uLXByaXZpbGVnZWQpXG4gICAgICAgIEFXU19SRUdJT046IGNkay5TdGFjay5vZih0aGlzKS5yZWdpb24sXG4gICAgICAgIC4uLmVudmlyb25tZW50VmFyaWFibGVzLFxuICAgICAgfSxcblxuICAgICAgLy8gU2VjcmV0cyBmcm9tIFNlY3JldHMgTWFuYWdlclxuICAgICAgc2VjcmV0czoge1xuICAgICAgICBEQVRBQkFTRV9VUkw6IGVjcy5TZWNyZXQuZnJvbVNlY3JldHNNYW5hZ2VyKHNlY3JldCwgJ0RBVEFCQVNFX1VSTCcpLFxuICAgICAgICBBTkFMWVRJQ1NfREFUQUJBU0VfVVJMOiBlY3MuU2VjcmV0LmZyb21TZWNyZXRzTWFuYWdlcihzZWNyZXQsICdBTkFMWVRJQ1NfREFUQUJBU0VfVVJMJyksXG4gICAgICAgIEpXVF9TRUNSRVQ6IGVjcy5TZWNyZXQuZnJvbVNlY3JldHNNYW5hZ2VyKHNlY3JldCwgJ0pXVF9TRUNSRVQnKSxcbiAgICAgICAgSldUX1JFRlJFU0hfU0VDUkVUOiBlY3MuU2VjcmV0LmZyb21TZWNyZXRzTWFuYWdlcihzZWNyZXQsICdKV1RfUkVGUkVTSF9TRUNSRVQnKSxcbiAgICAgICAgQ1NSRl9TRUNSRVQ6IGVjcy5TZWNyZXQuZnJvbVNlY3JldHNNYW5hZ2VyKHNlY3JldCwgJ0NTUkZfU0VDUkVUJyksXG4gICAgICAgIEVNQUlMX0ZST006IGVjcy5TZWNyZXQuZnJvbVNlY3JldHNNYW5hZ2VyKHNlY3JldCwgJ0VNQUlMX0ZST00nKSxcbiAgICAgICAgQURNSU5fTk9USUZJQ0FUSU9OX0VNQUlMUzogZWNzLlNlY3JldC5mcm9tU2VjcmV0c01hbmFnZXIoc2VjcmV0LCAnQURNSU5fTk9USUZJQ0FUSU9OX0VNQUlMUycpLFxuICAgICAgfSxcblxuICAgICAgLy8gRXNzZW50aWFsIGNvbnRhaW5lclxuICAgICAgZXNzZW50aWFsOiB0cnVlLFxuXG4gICAgICAvLyBTdG9wIHRpbWVvdXQgZm9yIGdyYWNlZnVsIHNodXRkb3duXG4gICAgICBzdG9wVGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuXG4gICAgICAvLyBEaXNhYmxlIHByaXZpbGVnZWQgbW9kZVxuICAgICAgcHJpdmlsZWdlZDogZmFsc2UsXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgcG9ydCBtYXBwaW5nXG4gICAgdGhpcy5jb250YWluZXIuYWRkUG9ydE1hcHBpbmdzKHtcbiAgICAgIGNvbnRhaW5lclBvcnQ6IGNvbnRhaW5lclBvcnQsXG4gICAgICBwcm90b2NvbDogZWNzLlByb3RvY29sLlRDUCxcbiAgICAgIG5hbWU6ICdodHRwJyxcbiAgICB9KTtcblxuICAgIC8vIEFkZCB1bGltaXRzIGZvciBzZWN1cml0eVxuICAgIHRoaXMuY29udGFpbmVyLmFkZFVsaW1pdHMoe1xuICAgICAgbmFtZTogZWNzLlVsaW1pdE5hbWUuTk9GSUxFLFxuICAgICAgc29mdExpbWl0OiA2NTUzNixcbiAgICAgIGhhcmRMaW1pdDogNjU1MzYsXG4gICAgfSk7XG5cbiAgICAvLyBOb3RlOiBGYXJnYXRlIHByb3ZpZGVzIHdyaXRhYmxlIC90bXAgYnkgZGVmYXVsdCwgbm8gbmVlZCBmb3IgY3VzdG9tIHZvbHVtZXNcblxuICAgIC8vIFRhZ3NcbiAgICBjZGsuVGFncy5vZih0aGlzLnRhc2tEZWZpbml0aW9uKS5hZGQoJ0Vudmlyb25tZW50JywgZW52aXJvbm1lbnQpO1xuICAgIGNkay5UYWdzLm9mKHRoaXMudGFza0RlZmluaXRpb24pLmFkZCgnQXBwbGljYXRpb24nLCAnQkNPUycpO1xuICAgIGNkay5UYWdzLm9mKHRoaXMudGFza0RlZmluaXRpb24pLmFkZCgnTWFuYWdlZEJ5JywgJ0NESycpO1xuICB9XG5cbiAgLyoqXG4gICAqIFVwZGF0ZSB0aGUgY29udGFpbmVyIGltYWdlIHRhZyBmb3IgZGVwbG95bWVudHNcbiAgICovXG4gIHB1YmxpYyB1cGRhdGVJbWFnZVRhZyh0YWc6IHN0cmluZyk6IHZvaWQge1xuICAgIC8vIFRoaXMgbWV0aG9kIHdvdWxkIGJlIHVzZWQgYnkgdGhlIENJL0NEIHBpcGVsaW5lIHRvIHVwZGF0ZSB0aGUgaW1hZ2UgdGFnXG4gICAgLy8gVGhlIGFjdHVhbCBpbXBsZW1lbnRhdGlvbiB3b3VsZCBkZXBlbmQgb24gdGhlIGRlcGxveW1lbnQgc3RyYXRlZ3lcbiAgICBjb25zdCBpbWFnZVVyaSA9IGAke3RoaXMuY29udGFpbmVyLmltYWdlTmFtZT8uc3BsaXQoJzonKVswXX06JHt0YWd9YDtcbiAgICAvLyBOb3RlOiBDREsgZG9lc24ndCBkaXJlY3RseSBzdXBwb3J0IHJ1bnRpbWUgaW1hZ2UgdXBkYXRlc1xuICAgIC8vIFRoaXMgd291bGQgYmUgaGFuZGxlZCBieSB0aGUgQ0kvQ0QgcGlwZWxpbmUgdXBkYXRpbmcgdGhlIHRhc2sgZGVmaW5pdGlvblxuICB9XG59XG4iXX0=