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
        // Create CloudWatch log group with encryption
        this.logGroup = new logs.LogGroup(this, 'LogGroup', {
            logGroupName: `/ecs/bcos-${environment}`,
            retention: environment === 'production' ? logs.RetentionDays.THREE_MONTHS : logs.RetentionDays.ONE_MONTH,
            encryptionKey: kmsKey,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VjdXJlLWNvbnRhaW5lci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInNlY3VyZS1jb250YWluZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLHlEQUEyQztBQUMzQywyREFBNkM7QUFLN0MsMkNBQXVDO0FBMkR2Qzs7O0dBR0c7QUFDSCxNQUFhLGVBQWdCLFNBQVEsc0JBQVM7SUFDNUIsY0FBYyxDQUE0QjtJQUMxQyxTQUFTLENBQTBCO0lBQ25DLFFBQVEsQ0FBZ0I7SUFFeEMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUEyQjtRQUNuRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRWpCLE1BQU0sRUFDSixXQUFXLEVBQ1gsT0FBTyxFQUNQLGFBQWEsRUFDYixNQUFNLEVBQ04sYUFBYSxFQUNiLFFBQVEsRUFDUixNQUFNLEVBQ04sR0FBRyxFQUNILE1BQU0sRUFDTixhQUFhLEdBQUcsRUFBRSxFQUNsQixvQkFBb0IsR0FBRyxFQUFFLEdBQzFCLEdBQUcsS0FBSyxDQUFDO1FBRVYsOENBQThDO1FBQzlDLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxVQUFVLEVBQUU7WUFDbEQsWUFBWSxFQUFFLGFBQWEsV0FBVyxFQUFFO1lBQ3hDLFNBQVMsRUFBRSxXQUFXLEtBQUssWUFBWSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxTQUFTO1lBQ3hHLGFBQWEsRUFBRSxNQUFNO1lBQ3JCLGFBQWEsRUFBRSxHQUFHLENBQUMsYUFBYSxDQUFDLE1BQU07U0FDeEMsQ0FBQyxDQUFDO1FBRUgsaUNBQWlDO1FBQ2pDLElBQUksQ0FBQyxjQUFjLEdBQUcsSUFBSSxHQUFHLENBQUMscUJBQXFC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QUFJLENBQUMsY0FBYyxDQUFDLENBQUMsR0FBRyxDQUFDLGFBQWEsRUFBRSxXQUFXLENBQUMsQ0FBQztRQUNqRSxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUMsR0FBRyxDQUFDLGFBQWEsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUM1RCxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUMsR0FBRyxDQUFDLFdBQVcsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUMzRCxDQUFDO0lBRUQ7O09BRUc7SUFDSSxjQUFjLENBQUMsR0FBVztRQUMvQiwwRUFBMEU7UUFDMUUsb0VBQW9FO1FBQ3BFLE1BQU0sUUFBUSxHQUFHLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxTQUFTLEVBQUUsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBQ3JFLDJEQUEyRDtRQUMzRCwyRUFBMkU7SUFDN0UsQ0FBQztDQUNGO0FBNUpELDBDQTRKQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgKiBhcyBlY3MgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVjcyc7XG5pbXBvcnQgKiBhcyBsb2dzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sb2dzJztcbmltcG9ydCAqIGFzIGttcyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mta21zJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCAqIGFzIHNlY3JldHNtYW5hZ2VyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zZWNyZXRzbWFuYWdlcic7XG5pbXBvcnQgKiBhcyBlY3IgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVjcic7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcblxuZXhwb3J0IGludGVyZmFjZSBTZWN1cmVDb250YWluZXJQcm9wcyB7XG4gIC8qKlxuICAgKiBFbnZpcm9ubWVudCBuYW1lIChzdGFnaW5nIG9yIHByb2R1Y3Rpb24pXG4gICAqL1xuICBlbnZpcm9ubWVudDogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBFQ1MgY2x1c3RlciBmb3IgdGhlIHRhc2sgZGVmaW5pdGlvblxuICAgKi9cbiAgY2x1c3RlcjogZWNzLklDbHVzdGVyO1xuXG4gIC8qKlxuICAgKiBFQ1IgcmVwb3NpdG9yeSBmb3IgY29udGFpbmVyIGltYWdlc1xuICAgKi9cbiAgZWNyUmVwb3NpdG9yeTogZWNyLklSZXBvc2l0b3J5O1xuXG4gIC8qKlxuICAgKiBLTVMga2V5IGZvciBlbmNyeXB0aW9uXG4gICAqL1xuICBrbXNLZXk6IGttcy5JS2V5O1xuXG4gIC8qKlxuICAgKiBUYXNrIGV4ZWN1dGlvbiByb2xlXG4gICAqL1xuICBleGVjdXRpb25Sb2xlOiBpYW0uSVJvbGU7XG5cbiAgLyoqXG4gICAqIFRhc2sgcm9sZSBmb3IgYXBwbGljYXRpb24gcnVudGltZVxuICAgKi9cbiAgdGFza1JvbGU6IGlhbS5JUm9sZTtcblxuICAvKipcbiAgICogU2VjcmV0cyBNYW5hZ2VyIHNlY3JldCBjb250YWluaW5nIGFwcGxpY2F0aW9uIGNvbmZpZ3VyYXRpb25cbiAgICovXG4gIHNlY3JldDogc2VjcmV0c21hbmFnZXIuSVNlY3JldDtcblxuICAvKipcbiAgICogQ1BVIHVuaXRzIGZvciB0aGUgdGFzayAoMjU2LCA1MTIsIDEwMjQsIDIwNDgsIDQwOTYpXG4gICAqL1xuICBjcHU6IG51bWJlcjtcblxuICAvKipcbiAgICogTWVtb3J5IGluIE1CXG4gICAqL1xuICBtZW1vcnk6IG51bWJlcjtcblxuICAvKipcbiAgICogQ29udGFpbmVyIHBvcnQgKGRlZmF1bHQ6IDgwKVxuICAgKi9cbiAgY29udGFpbmVyUG9ydD86IG51bWJlcjtcblxuICAvKipcbiAgICogQWRkaXRpb25hbCBlbnZpcm9ubWVudCB2YXJpYWJsZXNcbiAgICovXG4gIGVudmlyb25tZW50VmFyaWFibGVzPzogeyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfTtcbn1cblxuLyoqXG4gKiBTZWN1cmUgY29udGFpbmVyIGNvbnN0cnVjdCB0aGF0IGNyZWF0ZXMgaGFyZGVuZWQgRUNTIHRhc2sgZGVmaW5pdGlvbnNcbiAqIHdpdGggc2VjdXJpdHkgYmVzdCBwcmFjdGljZXMgYXBwbGllZFxuICovXG5leHBvcnQgY2xhc3MgU2VjdXJlQ29udGFpbmVyIGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgcHVibGljIHJlYWRvbmx5IHRhc2tEZWZpbml0aW9uOiBlY3MuRmFyZ2F0ZVRhc2tEZWZpbml0aW9uO1xuICBwdWJsaWMgcmVhZG9ubHkgY29udGFpbmVyOiBlY3MuQ29udGFpbmVyRGVmaW5pdGlvbjtcbiAgcHVibGljIHJlYWRvbmx5IGxvZ0dyb3VwOiBsb2dzLkxvZ0dyb3VwO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBTZWN1cmVDb250YWluZXJQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICBjb25zdCB7XG4gICAgICBlbnZpcm9ubWVudCxcbiAgICAgIGNsdXN0ZXIsXG4gICAgICBlY3JSZXBvc2l0b3J5LFxuICAgICAga21zS2V5LFxuICAgICAgZXhlY3V0aW9uUm9sZSxcbiAgICAgIHRhc2tSb2xlLFxuICAgICAgc2VjcmV0LFxuICAgICAgY3B1LFxuICAgICAgbWVtb3J5LFxuICAgICAgY29udGFpbmVyUG9ydCA9IDgwLFxuICAgICAgZW52aXJvbm1lbnRWYXJpYWJsZXMgPSB7fSxcbiAgICB9ID0gcHJvcHM7XG5cbiAgICAvLyBDcmVhdGUgQ2xvdWRXYXRjaCBsb2cgZ3JvdXAgd2l0aCBlbmNyeXB0aW9uXG4gICAgdGhpcy5sb2dHcm91cCA9IG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsICdMb2dHcm91cCcsIHtcbiAgICAgIGxvZ0dyb3VwTmFtZTogYC9lY3MvYmNvcy0ke2Vudmlyb25tZW50fWAsXG4gICAgICByZXRlbnRpb246IGVudmlyb25tZW50ID09PSAncHJvZHVjdGlvbicgPyBsb2dzLlJldGVudGlvbkRheXMuVEhSRUVfTU9OVEhTIDogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9NT05USCxcbiAgICAgIGVuY3J5cHRpb25LZXk6IGttc0tleSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTixcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBGYXJnYXRlIHRhc2sgZGVmaW5pdGlvblxuICAgIHRoaXMudGFza0RlZmluaXRpb24gPSBuZXcgZWNzLkZhcmdhdGVUYXNrRGVmaW5pdGlvbih0aGlzLCAnVGFza0RlZmluaXRpb24nLCB7XG4gICAgICBmYW1pbHk6IGBiY29zLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgIGNwdTogY3B1LFxuICAgICAgbWVtb3J5TGltaXRNaUI6IG1lbW9yeSxcbiAgICAgIGV4ZWN1dGlvblJvbGU6IGV4ZWN1dGlvblJvbGUsXG4gICAgICB0YXNrUm9sZTogdGFza1JvbGUsXG4gICAgICBydW50aW1lUGxhdGZvcm06IHtcbiAgICAgICAgb3BlcmF0aW5nU3lzdGVtRmFtaWx5OiBlY3MuT3BlcmF0aW5nU3lzdGVtRmFtaWx5LkxJTlVYLFxuICAgICAgICBjcHVBcmNoaXRlY3R1cmU6IGVjcy5DcHVBcmNoaXRlY3R1cmUuWDg2XzY0LFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIENvbnRhaW5lciBpbWFnZSBVUklcbiAgICBjb25zdCBpbWFnZVVyaSA9IGAke2VjclJlcG9zaXRvcnkucmVwb3NpdG9yeVVyaX06bGF0ZXN0YDtcblxuICAgIC8vIERlZmluZSBjb250YWluZXIgd2l0aCBzZWN1cml0eSBoYXJkZW5pbmdcbiAgICB0aGlzLmNvbnRhaW5lciA9IHRoaXMudGFza0RlZmluaXRpb24uYWRkQ29udGFpbmVyKCdhcHAnLCB7XG4gICAgICBjb250YWluZXJOYW1lOiAnYmNvcycsXG4gICAgICBpbWFnZTogZWNzLkNvbnRhaW5lckltYWdlLmZyb21SZWdpc3RyeShpbWFnZVVyaSksXG4gICAgICBcbiAgICAgIC8vIFJlc291cmNlIGxpbWl0c1xuICAgICAgY3B1OiBjcHUsXG4gICAgICBtZW1vcnlMaW1pdE1pQjogbWVtb3J5LFxuICAgICAgXG4gICAgICAvLyBTZWN1cml0eSBzZXR0aW5nc1xuICAgICAgdXNlcjogJzEwMDEnLCAvLyBOb24tcm9vdCB1c2VyXG4gICAgICByZWFkb25seVJvb3RGaWxlc3lzdGVtOiB0cnVlLFxuICAgICAgXG4gICAgICAvLyBMaW51eCBwYXJhbWV0ZXJzIGZvciBhZGRpdGlvbmFsIHNlY3VyaXR5XG4gICAgICBsaW51eFBhcmFtZXRlcnM6IG5ldyBlY3MuTGludXhQYXJhbWV0ZXJzKHRoaXMsICdMaW51eFBhcmFtZXRlcnMnLCB7XG4gICAgICAgIGluaXRQcm9jZXNzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgc2hhcmVkTWVtb3J5U2l6ZTogNjQsIC8vIE1pbmltYWwgc2hhcmVkIG1lbW9yeVxuICAgICAgfSksXG5cbiAgICAgIC8vIExvZ2dpbmcgY29uZmlndXJhdGlvblxuICAgICAgbG9nZ2luZzogZWNzLkxvZ0RyaXZlcnMuYXdzTG9ncyh7XG4gICAgICAgIHN0cmVhbVByZWZpeDogJ2VjcycsXG4gICAgICAgIGxvZ0dyb3VwOiB0aGlzLmxvZ0dyb3VwLFxuICAgICAgICBkYXRldGltZUZvcm1hdDogJyVZLSVtLSVkICVIOiVNOiVTJyxcbiAgICAgIH0pLFxuXG4gICAgICAvLyBIZWFsdGggY2hlY2tcbiAgICAgIGhlYWx0aENoZWNrOiB7XG4gICAgICAgIGNvbW1hbmQ6IFsnQ01ELVNIRUxMJywgYGN1cmwgLWYgaHR0cDovL2xvY2FsaG9zdDoke2NvbnRhaW5lclBvcnR9L2hlYWx0aCB8fCBleGl0IDFgXSxcbiAgICAgICAgaW50ZXJ2YWw6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoNSksXG4gICAgICAgIHJldHJpZXM6IDMsXG4gICAgICAgIHN0YXJ0UGVyaW9kOiBjZGsuRHVyYXRpb24uc2Vjb25kcyg2MCksXG4gICAgICB9LFxuXG4gICAgICAvLyBFbnZpcm9ubWVudCB2YXJpYWJsZXMgKG5vbi1zZW5zaXRpdmUpXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBOT0RFX0VOVjogZW52aXJvbm1lbnQsXG4gICAgICAgIFBPUlQ6IGNvbnRhaW5lclBvcnQudG9TdHJpbmcoKSxcbiAgICAgICAgQVdTX1JFR0lPTjogY2RrLlN0YWNrLm9mKHRoaXMpLnJlZ2lvbixcbiAgICAgICAgLi4uZW52aXJvbm1lbnRWYXJpYWJsZXMsXG4gICAgICB9LFxuXG4gICAgICAvLyBTZWNyZXRzIGZyb20gU2VjcmV0cyBNYW5hZ2VyXG4gICAgICBzZWNyZXRzOiB7XG4gICAgICAgIERBVEFCQVNFX1VSTDogZWNzLlNlY3JldC5mcm9tU2VjcmV0c01hbmFnZXIoc2VjcmV0LCAnREFUQUJBU0VfVVJMJyksXG4gICAgICAgIEFOQUxZVElDU19EQVRBQkFTRV9VUkw6IGVjcy5TZWNyZXQuZnJvbVNlY3JldHNNYW5hZ2VyKHNlY3JldCwgJ0FOQUxZVElDU19EQVRBQkFTRV9VUkwnKSxcbiAgICAgICAgSldUX1NFQ1JFVDogZWNzLlNlY3JldC5mcm9tU2VjcmV0c01hbmFnZXIoc2VjcmV0LCAnSldUX1NFQ1JFVCcpLFxuICAgICAgICBKV1RfUkVGUkVTSF9TRUNSRVQ6IGVjcy5TZWNyZXQuZnJvbVNlY3JldHNNYW5hZ2VyKHNlY3JldCwgJ0pXVF9SRUZSRVNIX1NFQ1JFVCcpLFxuICAgICAgICBDU1JGX1NFQ1JFVDogZWNzLlNlY3JldC5mcm9tU2VjcmV0c01hbmFnZXIoc2VjcmV0LCAnQ1NSRl9TRUNSRVQnKSxcbiAgICAgICAgUkVTRU5EX0FQSV9LRVk6IGVjcy5TZWNyZXQuZnJvbVNlY3JldHNNYW5hZ2VyKHNlY3JldCwgJ1JFU0VORF9BUElfS0VZJyksXG4gICAgICAgIEVNQUlMX0ZST006IGVjcy5TZWNyZXQuZnJvbVNlY3JldHNNYW5hZ2VyKHNlY3JldCwgJ0VNQUlMX0ZST00nKSxcbiAgICAgICAgQURNSU5fTk9USUZJQ0FUSU9OX0VNQUlMUzogZWNzLlNlY3JldC5mcm9tU2VjcmV0c01hbmFnZXIoc2VjcmV0LCAnQURNSU5fTk9USUZJQ0FUSU9OX0VNQUlMUycpLFxuICAgICAgfSxcblxuICAgICAgLy8gRXNzZW50aWFsIGNvbnRhaW5lclxuICAgICAgZXNzZW50aWFsOiB0cnVlLFxuXG4gICAgICAvLyBTdG9wIHRpbWVvdXQgZm9yIGdyYWNlZnVsIHNodXRkb3duXG4gICAgICBzdG9wVGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuXG4gICAgICAvLyBEaXNhYmxlIHByaXZpbGVnZWQgbW9kZVxuICAgICAgcHJpdmlsZWdlZDogZmFsc2UsXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgcG9ydCBtYXBwaW5nXG4gICAgdGhpcy5jb250YWluZXIuYWRkUG9ydE1hcHBpbmdzKHtcbiAgICAgIGNvbnRhaW5lclBvcnQ6IGNvbnRhaW5lclBvcnQsXG4gICAgICBwcm90b2NvbDogZWNzLlByb3RvY29sLlRDUCxcbiAgICAgIG5hbWU6ICdodHRwJyxcbiAgICB9KTtcblxuICAgIC8vIEFkZCB1bGltaXRzIGZvciBzZWN1cml0eVxuICAgIHRoaXMuY29udGFpbmVyLmFkZFVsaW1pdHMoe1xuICAgICAgbmFtZTogZWNzLlVsaW1pdE5hbWUuTk9GSUxFLFxuICAgICAgc29mdExpbWl0OiA2NTUzNixcbiAgICAgIGhhcmRMaW1pdDogNjU1MzYsXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgdG1wZnMgbW91bnRzIGZvciB3cml0YWJsZSBkaXJlY3RvcmllcyAoc2luY2Ugcm9vdCBmaWxlc3lzdGVtIGlzIHJlYWQtb25seSlcbiAgICB0aGlzLmNvbnRhaW5lci5hZGRNb3VudFBvaW50cyh7XG4gICAgICBjb250YWluZXJQYXRoOiAnL3RtcCcsXG4gICAgICBzb3VyY2VWb2x1bWU6ICd0bXAnLFxuICAgICAgcmVhZE9ubHk6IGZhbHNlLFxuICAgIH0pO1xuXG4gICAgLy8gQWRkIHRtcGZzIHZvbHVtZVxuICAgIHRoaXMudGFza0RlZmluaXRpb24uYWRkVm9sdW1lKHtcbiAgICAgIG5hbWU6ICd0bXAnLFxuICAgICAgaG9zdDoge1xuICAgICAgICBzb3VyY2VQYXRoOiAnL3RtcCcsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gVGFnc1xuICAgIGNkay5UYWdzLm9mKHRoaXMudGFza0RlZmluaXRpb24pLmFkZCgnRW52aXJvbm1lbnQnLCBlbnZpcm9ubWVudCk7XG4gICAgY2RrLlRhZ3Mub2YodGhpcy50YXNrRGVmaW5pdGlvbikuYWRkKCdBcHBsaWNhdGlvbicsICdCQ09TJyk7XG4gICAgY2RrLlRhZ3Mub2YodGhpcy50YXNrRGVmaW5pdGlvbikuYWRkKCdNYW5hZ2VkQnknLCAnQ0RLJyk7XG4gIH1cblxuICAvKipcbiAgICogVXBkYXRlIHRoZSBjb250YWluZXIgaW1hZ2UgdGFnIGZvciBkZXBsb3ltZW50c1xuICAgKi9cbiAgcHVibGljIHVwZGF0ZUltYWdlVGFnKHRhZzogc3RyaW5nKTogdm9pZCB7XG4gICAgLy8gVGhpcyBtZXRob2Qgd291bGQgYmUgdXNlZCBieSB0aGUgQ0kvQ0QgcGlwZWxpbmUgdG8gdXBkYXRlIHRoZSBpbWFnZSB0YWdcbiAgICAvLyBUaGUgYWN0dWFsIGltcGxlbWVudGF0aW9uIHdvdWxkIGRlcGVuZCBvbiB0aGUgZGVwbG95bWVudCBzdHJhdGVneVxuICAgIGNvbnN0IGltYWdlVXJpID0gYCR7dGhpcy5jb250YWluZXIuaW1hZ2VOYW1lPy5zcGxpdCgnOicpWzBdfToke3RhZ31gO1xuICAgIC8vIE5vdGU6IENESyBkb2Vzbid0IGRpcmVjdGx5IHN1cHBvcnQgcnVudGltZSBpbWFnZSB1cGRhdGVzXG4gICAgLy8gVGhpcyB3b3VsZCBiZSBoYW5kbGVkIGJ5IHRoZSBDSS9DRCBwaXBlbGluZSB1cGRhdGluZyB0aGUgdGFzayBkZWZpbml0aW9uXG4gIH1cbn1cbiJdfQ==