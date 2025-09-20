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
        const { environment, cluster, ecrRepository, kmsKey, executionRole, taskRole, secret, cpu, memory, containerPort = 80, environmentVariables = {}, } = props;
        // Create CloudWatch log group (using AWS managed encryption to avoid circular dependency)
        this.logGroup = new logs.LogGroup(this, 'LogGroup', {
            logGroupName: `/ecs/bcos-${environment}`,
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
            // Linux parameters for additional security
            linuxParameters: new ecs.LinuxParameters(this, 'LinuxParameters', {
                initProcessEnabled: true,
                sharedMemorySize: 64, // Minimal shared memory
            }),
            // Logging configuration
            logging: ecs.LogDrivers.awsLogs({
                streamPrefix: 'ecs',
                logGroup: this.logGroup,
                datetimeFormat: '%Y-%m-%d %H:%M:%S',
            }),
            // Health check
            healthCheck: {
                command: ['CMD-SHELL', `curl -f http://localhost:${containerPort}/health || exit 1`],
                interval: cdk.Duration.seconds(30),
                timeout: cdk.Duration.seconds(5),
                retries: 3,
                startPeriod: cdk.Duration.seconds(60),
            },
            // Environment variables (non-sensitive)
            environment: {
                NODE_ENV: environment,
                PORT: containerPort.toString(),
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
                RESEND_API_KEY: ecs.Secret.fromSecretsManager(secret, 'RESEND_API_KEY'),
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
        // Add tmpfs mounts for writable directories (since root filesystem is read-only)
        this.container.addMountPoints({
            containerPath: '/tmp',
            sourceVolume: 'tmp',
            readOnly: false,
        });
        // Add tmpfs volume
        this.taskDefinition.addVolume({
            name: 'tmp',
            host: {
                sourcePath: '/tmp',
            },
        });
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VjdXJlLWNvbnRhaW5lci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInNlY3VyZS1jb250YWluZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLHlEQUEyQztBQUMzQywyREFBNkM7QUFLN0MsMkNBQXVDO0FBMkR2Qzs7O0dBR0c7QUFDSCxNQUFhLGVBQWdCLFNBQVEsc0JBQVM7SUFDNUIsY0FBYyxDQUE0QjtJQUMxQyxTQUFTLENBQTBCO0lBQ25DLFFBQVEsQ0FBZ0I7SUFFeEMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUEyQjtRQUNuRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRWpCLE1BQU0sRUFDSixXQUFXLEVBQ1gsT0FBTyxFQUNQLGFBQWEsRUFDYixNQUFNLEVBQ04sYUFBYSxFQUNiLFFBQVEsRUFDUixNQUFNLEVBQ04sR0FBRyxFQUNILE1BQU0sRUFDTixhQUFhLEdBQUcsRUFBRSxFQUNsQixvQkFBb0IsR0FBRyxFQUFFLEdBQzFCLEdBQUcsS0FBSyxDQUFDO1FBRVYsMEZBQTBGO1FBQzFGLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxVQUFVLEVBQUU7WUFDbEQsWUFBWSxFQUFFLGFBQWEsV0FBVyxFQUFFO1lBQ3hDLFNBQVMsRUFBRSxXQUFXLEtBQUssWUFBWSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxTQUFTO1lBQ3hHLGFBQWEsRUFBRSxHQUFHLENBQUMsYUFBYSxDQUFDLE1BQU07U0FDeEMsQ0FBQyxDQUFDO1FBRUgsaUNBQWlDO1FBQ2pDLElBQUksQ0FBQyxjQUFjLEdBQUcsSUFBSSxHQUFHLENBQUMscUJBQXFCLENBQUMsSUFBSSxFQUFFLGdCQUFn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QUMsR0FBRyxDQUFDLGFBQWEsRUFBRSxXQUFXLENBQUMsQ0FBQztRQUNqRSxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUMsR0FBRyxDQUFDLGFBQWEsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUM1RCxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUMsR0FBRyxDQUFDLFdBQVcsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUMzRCxDQUFDO0lBRUQ7O09BRUc7SUFDSSxjQUFjLENBQUMsR0FBVztRQUMvQiwwRUFBMEU7UUFDMUUsb0VBQW9FO1FBQ3BFLE1BQU0sUUFBUSxHQUFHLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxTQUFTLEVBQUUsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBQ3JFLDJEQUEyRDtRQUMzRCwyRUFBMkU7SUFDN0UsQ0FBQztDQUNGO0FBM0pELDBDQTJKQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgKiBhcyBlY3MgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVjcyc7XG5pbXBvcnQgKiBhcyBsb2dzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sb2dzJztcbmltcG9ydCAqIGFzIGttcyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mta21zJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCAqIGFzIHNlY3JldHNtYW5hZ2VyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zZWNyZXRzbWFuYWdlcic7XG5pbXBvcnQgKiBhcyBlY3IgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVjcic7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcblxuZXhwb3J0IGludGVyZmFjZSBTZWN1cmVDb250YWluZXJQcm9wcyB7XG4gIC8qKlxuICAgKiBFbnZpcm9ubWVudCBuYW1lIChzdGFnaW5nIG9yIHByb2R1Y3Rpb24pXG4gICAqL1xuICBlbnZpcm9ubWVudDogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBFQ1MgY2x1c3RlciBmb3IgdGhlIHRhc2sgZGVmaW5pdGlvblxuICAgKi9cbiAgY2x1c3RlcjogZWNzLklDbHVzdGVyO1xuXG4gIC8qKlxuICAgKiBFQ1IgcmVwb3NpdG9yeSBmb3IgY29udGFpbmVyIGltYWdlc1xuICAgKi9cbiAgZWNyUmVwb3NpdG9yeTogZWNyLklSZXBvc2l0b3J5O1xuXG4gIC8qKlxuICAgKiBLTVMga2V5IGZvciBlbmNyeXB0aW9uXG4gICAqL1xuICBrbXNLZXk6IGttcy5JS2V5O1xuXG4gIC8qKlxuICAgKiBUYXNrIGV4ZWN1dGlvbiByb2xlXG4gICAqL1xuICBleGVjdXRpb25Sb2xlOiBpYW0uSVJvbGU7XG5cbiAgLyoqXG4gICAqIFRhc2sgcm9sZSBmb3IgYXBwbGljYXRpb24gcnVudGltZVxuICAgKi9cbiAgdGFza1JvbGU6IGlhbS5JUm9sZTtcblxuICAvKipcbiAgICogU2VjcmV0cyBNYW5hZ2VyIHNlY3JldCBjb250YWluaW5nIGFwcGxpY2F0aW9uIGNvbmZpZ3VyYXRpb25cbiAgICovXG4gIHNlY3JldDogc2VjcmV0c21hbmFnZXIuSVNlY3JldDtcblxuICAvKipcbiAgICogQ1BVIHVuaXRzIGZvciB0aGUgdGFzayAoMjU2LCA1MTIsIDEwMjQsIDIwNDgsIDQwOTYpXG4gICAqL1xuICBjcHU6IG51bWJlcjtcblxuICAvKipcbiAgICogTWVtb3J5IGluIE1CXG4gICAqL1xuICBtZW1vcnk6IG51bWJlcjtcblxuICAvKipcbiAgICogQ29udGFpbmVyIHBvcnQgKGRlZmF1bHQ6IDgwKVxuICAgKi9cbiAgY29udGFpbmVyUG9ydD86IG51bWJlcjtcblxuICAvKipcbiAgICogQWRkaXRpb25hbCBlbnZpcm9ubWVudCB2YXJpYWJsZXNcbiAgICovXG4gIGVudmlyb25tZW50VmFyaWFibGVzPzogeyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfTtcbn1cblxuLyoqXG4gKiBTZWN1cmUgY29udGFpbmVyIGNvbnN0cnVjdCB0aGF0IGNyZWF0ZXMgaGFyZGVuZWQgRUNTIHRhc2sgZGVmaW5pdGlvbnNcbiAqIHdpdGggc2VjdXJpdHkgYmVzdCBwcmFjdGljZXMgYXBwbGllZFxuICovXG5leHBvcnQgY2xhc3MgU2VjdXJlQ29udGFpbmVyIGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgcHVibGljIHJlYWRvbmx5IHRhc2tEZWZpbml0aW9uOiBlY3MuRmFyZ2F0ZVRhc2tEZWZpbml0aW9uO1xuICBwdWJsaWMgcmVhZG9ubHkgY29udGFpbmVyOiBlY3MuQ29udGFpbmVyRGVmaW5pdGlvbjtcbiAgcHVibGljIHJlYWRvbmx5IGxvZ0dyb3VwOiBsb2dzLkxvZ0dyb3VwO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBTZWN1cmVDb250YWluZXJQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICBjb25zdCB7XG4gICAgICBlbnZpcm9ubWVudCxcbiAgICAgIGNsdXN0ZXIsXG4gICAgICBlY3JSZXBvc2l0b3J5LFxuICAgICAga21zS2V5LFxuICAgICAgZXhlY3V0aW9uUm9sZSxcbiAgICAgIHRhc2tSb2xlLFxuICAgICAgc2VjcmV0LFxuICAgICAgY3B1LFxuICAgICAgbWVtb3J5LFxuICAgICAgY29udGFpbmVyUG9ydCA9IDgwLFxuICAgICAgZW52aXJvbm1lbnRWYXJpYWJsZXMgPSB7fSxcbiAgICB9ID0gcHJvcHM7XG5cbiAgICAvLyBDcmVhdGUgQ2xvdWRXYXRjaCBsb2cgZ3JvdXAgKHVzaW5nIEFXUyBtYW5hZ2VkIGVuY3J5cHRpb24gdG8gYXZvaWQgY2lyY3VsYXIgZGVwZW5kZW5jeSlcbiAgICB0aGlzLmxvZ0dyb3VwID0gbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ0xvZ0dyb3VwJywge1xuICAgICAgbG9nR3JvdXBOYW1lOiBgL2Vjcy9iY29zLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgIHJldGVudGlvbjogZW52aXJvbm1lbnQgPT09ICdwcm9kdWN0aW9uJyA/IGxvZ3MuUmV0ZW50aW9uRGF5cy5USFJFRV9NT05USFMgOiBsb2dzLlJldGVudGlvbkRheXMuT05FX01PTlRILFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIEZhcmdhdGUgdGFzayBkZWZpbml0aW9uXG4gICAgdGhpcy50YXNrRGVmaW5pdGlvbiA9IG5ldyBlY3MuRmFyZ2F0ZVRhc2tEZWZpbml0aW9uKHRoaXMsICdUYXNrRGVmaW5pdGlvbicsIHtcbiAgICAgIGZhbWlseTogYGJjb3MtJHtlbnZpcm9ubWVudH1gLFxuICAgICAgY3B1OiBjcHUsXG4gICAgICBtZW1vcnlMaW1pdE1pQjogbWVtb3J5LFxuICAgICAgZXhlY3V0aW9uUm9sZTogZXhlY3V0aW9uUm9sZSxcbiAgICAgIHRhc2tSb2xlOiB0YXNrUm9sZSxcbiAgICAgIHJ1bnRpbWVQbGF0Zm9ybToge1xuICAgICAgICBvcGVyYXRpbmdTeXN0ZW1GYW1pbHk6IGVjcy5PcGVyYXRpbmdTeXN0ZW1GYW1pbHkuTElOVVgsXG4gICAgICAgIGNwdUFyY2hpdGVjdHVyZTogZWNzLkNwdUFyY2hpdGVjdHVyZS5YODZfNjQsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQ29udGFpbmVyIGltYWdlIFVSSVxuICAgIGNvbnN0IGltYWdlVXJpID0gYCR7ZWNyUmVwb3NpdG9yeS5yZXBvc2l0b3J5VXJpfTpsYXRlc3RgO1xuXG4gICAgLy8gRGVmaW5lIGNvbnRhaW5lciB3aXRoIHNlY3VyaXR5IGhhcmRlbmluZ1xuICAgIHRoaXMuY29udGFpbmVyID0gdGhpcy50YXNrRGVmaW5pdGlvbi5hZGRDb250YWluZXIoJ2FwcCcsIHtcbiAgICAgIGNvbnRhaW5lck5hbWU6ICdiY29zJyxcbiAgICAgIGltYWdlOiBlY3MuQ29udGFpbmVySW1hZ2UuZnJvbVJlZ2lzdHJ5KGltYWdlVXJpKSxcbiAgICAgIFxuICAgICAgLy8gUmVzb3VyY2UgbGltaXRzXG4gICAgICBjcHU6IGNwdSxcbiAgICAgIG1lbW9yeUxpbWl0TWlCOiBtZW1vcnksXG4gICAgICBcbiAgICAgIC8vIFNlY3VyaXR5IHNldHRpbmdzXG4gICAgICB1c2VyOiAnMTAwMScsIC8vIE5vbi1yb290IHVzZXJcbiAgICAgIHJlYWRvbmx5Um9vdEZpbGVzeXN0ZW06IHRydWUsXG4gICAgICBcbiAgICAgIC8vIExpbnV4IHBhcmFtZXRlcnMgZm9yIGFkZGl0aW9uYWwgc2VjdXJpdHlcbiAgICAgIGxpbnV4UGFyYW1ldGVyczogbmV3IGVjcy5MaW51eFBhcmFtZXRlcnModGhpcywgJ0xpbnV4UGFyYW1ldGVycycsIHtcbiAgICAgICAgaW5pdFByb2Nlc3NFbmFibGVkOiB0cnVlLFxuICAgICAgICBzaGFyZWRNZW1vcnlTaXplOiA2NCwgLy8gTWluaW1hbCBzaGFyZWQgbWVtb3J5XG4gICAgICB9KSxcblxuICAgICAgLy8gTG9nZ2luZyBjb25maWd1cmF0aW9uXG4gICAgICBsb2dnaW5nOiBlY3MuTG9nRHJpdmVycy5hd3NMb2dzKHtcbiAgICAgICAgc3RyZWFtUHJlZml4OiAnZWNzJyxcbiAgICAgICAgbG9nR3JvdXA6IHRoaXMubG9nR3JvdXAsXG4gICAgICAgIGRhdGV0aW1lRm9ybWF0OiAnJVktJW0tJWQgJUg6JU06JVMnLFxuICAgICAgfSksXG5cbiAgICAgIC8vIEhlYWx0aCBjaGVja1xuICAgICAgaGVhbHRoQ2hlY2s6IHtcbiAgICAgICAgY29tbWFuZDogWydDTUQtU0hFTEwnLCBgY3VybCAtZiBodHRwOi8vbG9jYWxob3N0OiR7Y29udGFpbmVyUG9ydH0vaGVhbHRoIHx8IGV4aXQgMWBdLFxuICAgICAgICBpbnRlcnZhbDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcyg1KSxcbiAgICAgICAgcmV0cmllczogMyxcbiAgICAgICAgc3RhcnRQZXJpb2Q6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDYwKSxcbiAgICAgIH0sXG5cbiAgICAgIC8vIEVudmlyb25tZW50IHZhcmlhYmxlcyAobm9uLXNlbnNpdGl2ZSlcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIE5PREVfRU5WOiBlbnZpcm9ubWVudCxcbiAgICAgICAgUE9SVDogY29udGFpbmVyUG9ydC50b1N0cmluZygpLFxuICAgICAgICBBV1NfUkVHSU9OOiBjZGsuU3RhY2sub2YodGhpcykucmVnaW9uLFxuICAgICAgICAuLi5lbnZpcm9ubWVudFZhcmlhYmxlcyxcbiAgICAgIH0sXG5cbiAgICAgIC8vIFNlY3JldHMgZnJvbSBTZWNyZXRzIE1hbmFnZXJcbiAgICAgIHNlY3JldHM6IHtcbiAgICAgICAgREFUQUJBU0VfVVJMOiBlY3MuU2VjcmV0LmZyb21TZWNyZXRzTWFuYWdlcihzZWNyZXQsICdEQVRBQkFTRV9VUkwnKSxcbiAgICAgICAgQU5BTFlUSUNTX0RBVEFCQVNFX1VSTDogZWNzLlNlY3JldC5mcm9tU2VjcmV0c01hbmFnZXIoc2VjcmV0LCAnQU5BTFlUSUNTX0RBVEFCQVNFX1VSTCcpLFxuICAgICAgICBKV1RfU0VDUkVUOiBlY3MuU2VjcmV0LmZyb21TZWNyZXRzTWFuYWdlcihzZWNyZXQsICdKV1RfU0VDUkVUJyksXG4gICAgICAgIEpXVF9SRUZSRVNIX1NFQ1JFVDogZWNzLlNlY3JldC5mcm9tU2VjcmV0c01hbmFnZXIoc2VjcmV0LCAnSldUX1JFRlJFU0hfU0VDUkVUJyksXG4gICAgICAgIENTUkZfU0VDUkVUOiBlY3MuU2VjcmV0LmZyb21TZWNyZXRzTWFuYWdlcihzZWNyZXQsICdDU1JGX1NFQ1JFVCcpLFxuICAgICAgICBSRVNFTkRfQVBJX0tFWTogZWNzLlNlY3JldC5mcm9tU2VjcmV0c01hbmFnZXIoc2VjcmV0LCAnUkVTRU5EX0FQSV9LRVknKSxcbiAgICAgICAgRU1BSUxfRlJPTTogZWNzLlNlY3JldC5mcm9tU2VjcmV0c01hbmFnZXIoc2VjcmV0LCAnRU1BSUxfRlJPTScpLFxuICAgICAgICBBRE1JTl9OT1RJRklDQVRJT05fRU1BSUxTOiBlY3MuU2VjcmV0LmZyb21TZWNyZXRzTWFuYWdlcihzZWNyZXQsICdBRE1JTl9OT1RJRklDQVRJT05fRU1BSUxTJyksXG4gICAgICB9LFxuXG4gICAgICAvLyBFc3NlbnRpYWwgY29udGFpbmVyXG4gICAgICBlc3NlbnRpYWw6IHRydWUsXG5cbiAgICAgIC8vIFN0b3AgdGltZW91dCBmb3IgZ3JhY2VmdWwgc2h1dGRvd25cbiAgICAgIHN0b3BUaW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG5cbiAgICAgIC8vIERpc2FibGUgcHJpdmlsZWdlZCBtb2RlXG4gICAgICBwcml2aWxlZ2VkOiBmYWxzZSxcbiAgICB9KTtcblxuICAgIC8vIEFkZCBwb3J0IG1hcHBpbmdcbiAgICB0aGlzLmNvbnRhaW5lci5hZGRQb3J0TWFwcGluZ3Moe1xuICAgICAgY29udGFpbmVyUG9ydDogY29udGFpbmVyUG9ydCxcbiAgICAgIHByb3RvY29sOiBlY3MuUHJvdG9jb2wuVENQLFxuICAgICAgbmFtZTogJ2h0dHAnLFxuICAgIH0pO1xuXG4gICAgLy8gQWRkIHVsaW1pdHMgZm9yIHNlY3VyaXR5XG4gICAgdGhpcy5jb250YWluZXIuYWRkVWxpbWl0cyh7XG4gICAgICBuYW1lOiBlY3MuVWxpbWl0TmFtZS5OT0ZJTEUsXG4gICAgICBzb2Z0TGltaXQ6IDY1NTM2LFxuICAgICAgaGFyZExpbWl0OiA2NTUzNixcbiAgICB9KTtcblxuICAgIC8vIEFkZCB0bXBmcyBtb3VudHMgZm9yIHdyaXRhYmxlIGRpcmVjdG9yaWVzIChzaW5jZSByb290IGZpbGVzeXN0ZW0gaXMgcmVhZC1vbmx5KVxuICAgIHRoaXMuY29udGFpbmVyLmFkZE1vdW50UG9pbnRzKHtcbiAgICAgIGNvbnRhaW5lclBhdGg6ICcvdG1wJyxcbiAgICAgIHNvdXJjZVZvbHVtZTogJ3RtcCcsXG4gICAgICByZWFkT25seTogZmFsc2UsXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgdG1wZnMgdm9sdW1lXG4gICAgdGhpcy50YXNrRGVmaW5pdGlvbi5hZGRWb2x1bWUoe1xuICAgICAgbmFtZTogJ3RtcCcsXG4gICAgICBob3N0OiB7XG4gICAgICAgIHNvdXJjZVBhdGg6ICcvdG1wJyxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBUYWdzXG4gICAgY2RrLlRhZ3Mub2YodGhpcy50YXNrRGVmaW5pdGlvbikuYWRkKCdFbnZpcm9ubWVudCcsIGVudmlyb25tZW50KTtcbiAgICBjZGsuVGFncy5vZih0aGlzLnRhc2tEZWZpbml0aW9uKS5hZGQoJ0FwcGxpY2F0aW9uJywgJ0JDT1MnKTtcbiAgICBjZGsuVGFncy5vZih0aGlzLnRhc2tEZWZpbml0aW9uKS5hZGQoJ01hbmFnZWRCeScsICdDREsnKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBVcGRhdGUgdGhlIGNvbnRhaW5lciBpbWFnZSB0YWcgZm9yIGRlcGxveW1lbnRzXG4gICAqL1xuICBwdWJsaWMgdXBkYXRlSW1hZ2VUYWcodGFnOiBzdHJpbmcpOiB2b2lkIHtcbiAgICAvLyBUaGlzIG1ldGhvZCB3b3VsZCBiZSB1c2VkIGJ5IHRoZSBDSS9DRCBwaXBlbGluZSB0byB1cGRhdGUgdGhlIGltYWdlIHRhZ1xuICAgIC8vIFRoZSBhY3R1YWwgaW1wbGVtZW50YXRpb24gd291bGQgZGVwZW5kIG9uIHRoZSBkZXBsb3ltZW50IHN0cmF0ZWd5XG4gICAgY29uc3QgaW1hZ2VVcmkgPSBgJHt0aGlzLmNvbnRhaW5lci5pbWFnZU5hbWU/LnNwbGl0KCc6JylbMF19OiR7dGFnfWA7XG4gICAgLy8gTm90ZTogQ0RLIGRvZXNuJ3QgZGlyZWN0bHkgc3VwcG9ydCBydW50aW1lIGltYWdlIHVwZGF0ZXNcbiAgICAvLyBUaGlzIHdvdWxkIGJlIGhhbmRsZWQgYnkgdGhlIENJL0NEIHBpcGVsaW5lIHVwZGF0aW5nIHRoZSB0YXNrIGRlZmluaXRpb25cbiAgfVxufVxuIl19