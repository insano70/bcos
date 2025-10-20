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
            readonlyRootFilesystem: false, // Next.js requires write access to .next/cache
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
            // Health check (optimized /api/health endpoint should respond quickly now)
            healthCheck: {
                command: ['CMD-SHELL', `curl -f http://localhost:${containerPort}/api/health || exit 1`],
                interval: cdk.Duration.seconds(30),
                timeout: cdk.Duration.seconds(10),
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
                SKIP_ENV_VALIDATION: ecs.Secret.fromSecretsManager(secret, 'SKIP_ENV_VALIDATION'),
                DATABASE_URL: ecs.Secret.fromSecretsManager(secret, 'DATABASE_URL'),
                ANALYTICS_DATABASE_URL: ecs.Secret.fromSecretsManager(secret, 'ANALYTICS_DATABASE_URL'),
                JWT_SECRET: ecs.Secret.fromSecretsManager(secret, 'JWT_SECRET'),
                JWT_REFRESH_SECRET: ecs.Secret.fromSecretsManager(secret, 'JWT_REFRESH_SECRET'),
                CSRF_SECRET: ecs.Secret.fromSecretsManager(secret, 'CSRF_SECRET'),
                WEBAUTHN_RP_ID: ecs.Secret.fromSecretsManager(secret, 'WEBAUTHN_RP_ID'),
                MFA_TEMP_TOKEN_SECRET: ecs.Secret.fromSecretsManager(secret, 'MFA_TEMP_TOKEN_SECRET'),
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VjdXJlLWNvbnRhaW5lci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInNlY3VyZS1jb250YWluZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLHlEQUEyQztBQUMzQywyREFBNkM7QUFLN0MsMkNBQXVDO0FBMkR2Qzs7O0dBR0c7QUFDSCxNQUFhLGVBQWdCLFNBQVEsc0JBQVM7SUFDNUIsY0FBYyxDQUE0QjtJQUMxQyxTQUFTLENBQTBCO0lBQ25DLFFBQVEsQ0FBZ0I7SUFFeEMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUEyQjtRQUNuRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRWpCLE1BQU0sRUFDSixXQUFXLEVBQ1gsT0FBTyxFQUNQLGFBQWEsRUFDYixNQUFNLEVBQ04sYUFBYSxFQUNiLFFBQVEsRUFDUixNQUFNLEVBQ04sR0FBRyxFQUNILE1BQU0sRUFDTixhQUFhLEdBQUcsSUFBSSxFQUNwQixvQkFBb0IsR0FBRyxFQUFFLEdBQzFCLEdBQUcsS0FBSyxDQUFDO1FBRVYsMEZBQTBGO1FBQzFGLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxVQUFVLEVBQUU7WUFDbEQsWUFBWSxFQUFFLGFBQWEsV0FBVyxFQUFFO1lBQ3hDLFNBQVMsRUFBRSxXQUFXLEtBQUssWUFBWSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxTQUFTO1lBQ3hHLGFBQWEsRUFBRSxHQUFHLENBQUMsYUFBYSxDQUFDLE1BQU07U0FDeEMsQ0FBQyxDQUFDO1FBRUgsaUNBQWlDO1FBQ2pDLElBQUksQ0FBQyxjQUFjLEdBQUcsSUFBSSxHQUFHLENBQUMscUJBQXFCLENBQUMsSUFBSSxFQUFFLGdCQUFn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Q0FBQyxDQUFDLEdBQUcsQ0FBQyxhQUFhLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFDNUQsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxXQUFXLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDM0QsQ0FBQztJQUVEOztPQUVHO0lBQ0ksY0FBYyxDQUFDLEdBQVc7UUFDL0IsMEVBQTBFO1FBQzFFLG9FQUFvRTtRQUNwRSxNQUFNLFFBQVEsR0FBRyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsU0FBUyxFQUFFLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxHQUFHLEVBQUUsQ0FBQztRQUNyRSwyREFBMkQ7UUFDM0QsMkVBQTJFO0lBQzdFLENBQUM7Q0FDRjtBQWhKRCwwQ0FnSkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0ICogYXMgZWNzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lY3MnO1xuaW1wb3J0ICogYXMgbG9ncyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbG9ncyc7XG5pbXBvcnQgKiBhcyBrbXMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWttcyc7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgKiBhcyBzZWNyZXRzbWFuYWdlciBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc2VjcmV0c21hbmFnZXInO1xuaW1wb3J0ICogYXMgZWNyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lY3InO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2VjdXJlQ29udGFpbmVyUHJvcHMge1xuICAvKipcbiAgICogRW52aXJvbm1lbnQgbmFtZSAoc3RhZ2luZyBvciBwcm9kdWN0aW9uKVxuICAgKi9cbiAgZW52aXJvbm1lbnQ6IHN0cmluZztcblxuICAvKipcbiAgICogRUNTIGNsdXN0ZXIgZm9yIHRoZSB0YXNrIGRlZmluaXRpb25cbiAgICovXG4gIGNsdXN0ZXI6IGVjcy5JQ2x1c3RlcjtcblxuICAvKipcbiAgICogRUNSIHJlcG9zaXRvcnkgZm9yIGNvbnRhaW5lciBpbWFnZXNcbiAgICovXG4gIGVjclJlcG9zaXRvcnk6IGVjci5JUmVwb3NpdG9yeTtcblxuICAvKipcbiAgICogS01TIGtleSBmb3IgZW5jcnlwdGlvblxuICAgKi9cbiAga21zS2V5OiBrbXMuSUtleTtcblxuICAvKipcbiAgICogVGFzayBleGVjdXRpb24gcm9sZVxuICAgKi9cbiAgZXhlY3V0aW9uUm9sZTogaWFtLklSb2xlO1xuXG4gIC8qKlxuICAgKiBUYXNrIHJvbGUgZm9yIGFwcGxpY2F0aW9uIHJ1bnRpbWVcbiAgICovXG4gIHRhc2tSb2xlOiBpYW0uSVJvbGU7XG5cbiAgLyoqXG4gICAqIFNlY3JldHMgTWFuYWdlciBzZWNyZXQgY29udGFpbmluZyBhcHBsaWNhdGlvbiBjb25maWd1cmF0aW9uXG4gICAqL1xuICBzZWNyZXQ6IHNlY3JldHNtYW5hZ2VyLklTZWNyZXQ7XG5cbiAgLyoqXG4gICAqIENQVSB1bml0cyBmb3IgdGhlIHRhc2sgKDI1NiwgNTEyLCAxMDI0LCAyMDQ4LCA0MDk2KVxuICAgKi9cbiAgY3B1OiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIE1lbW9yeSBpbiBNQlxuICAgKi9cbiAgbWVtb3J5OiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIENvbnRhaW5lciBwb3J0IChkZWZhdWx0OiAzMDAwKVxuICAgKi9cbiAgY29udGFpbmVyUG9ydD86IG51bWJlcjtcblxuICAvKipcbiAgICogQWRkaXRpb25hbCBlbnZpcm9ubWVudCB2YXJpYWJsZXNcbiAgICovXG4gIGVudmlyb25tZW50VmFyaWFibGVzPzogeyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfTtcbn1cblxuLyoqXG4gKiBTZWN1cmUgY29udGFpbmVyIGNvbnN0cnVjdCB0aGF0IGNyZWF0ZXMgaGFyZGVuZWQgRUNTIHRhc2sgZGVmaW5pdGlvbnNcbiAqIHdpdGggc2VjdXJpdHkgYmVzdCBwcmFjdGljZXMgYXBwbGllZFxuICovXG5leHBvcnQgY2xhc3MgU2VjdXJlQ29udGFpbmVyIGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgcHVibGljIHJlYWRvbmx5IHRhc2tEZWZpbml0aW9uOiBlY3MuRmFyZ2F0ZVRhc2tEZWZpbml0aW9uO1xuICBwdWJsaWMgcmVhZG9ubHkgY29udGFpbmVyOiBlY3MuQ29udGFpbmVyRGVmaW5pdGlvbjtcbiAgcHVibGljIHJlYWRvbmx5IGxvZ0dyb3VwOiBsb2dzLkxvZ0dyb3VwO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBTZWN1cmVDb250YWluZXJQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICBjb25zdCB7XG4gICAgICBlbnZpcm9ubWVudCxcbiAgICAgIGNsdXN0ZXIsXG4gICAgICBlY3JSZXBvc2l0b3J5LFxuICAgICAga21zS2V5LFxuICAgICAgZXhlY3V0aW9uUm9sZSxcbiAgICAgIHRhc2tSb2xlLFxuICAgICAgc2VjcmV0LFxuICAgICAgY3B1LFxuICAgICAgbWVtb3J5LFxuICAgICAgY29udGFpbmVyUG9ydCA9IDMwMDAsXG4gICAgICBlbnZpcm9ubWVudFZhcmlhYmxlcyA9IHt9LFxuICAgIH0gPSBwcm9wcztcblxuICAgIC8vIENyZWF0ZSBDbG91ZFdhdGNoIGxvZyBncm91cCAodXNpbmcgQVdTIG1hbmFnZWQgZW5jcnlwdGlvbiB0byBhdm9pZCBjaXJjdWxhciBkZXBlbmRlbmN5KVxuICAgIHRoaXMubG9nR3JvdXAgPSBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnTG9nR3JvdXAnLCB7XG4gICAgICBsb2dHcm91cE5hbWU6IGAvZWNzL2Jjb3MtJHtlbnZpcm9ubWVudH1gLFxuICAgICAgcmV0ZW50aW9uOiBlbnZpcm9ubWVudCA9PT0gJ3Byb2R1Y3Rpb24nID8gbG9ncy5SZXRlbnRpb25EYXlzLlRIUkVFX01PTlRIUyA6IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfTU9OVEgsXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4sXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgRmFyZ2F0ZSB0YXNrIGRlZmluaXRpb25cbiAgICB0aGlzLnRhc2tEZWZpbml0aW9uID0gbmV3IGVjcy5GYXJnYXRlVGFza0RlZmluaXRpb24odGhpcywgJ1Rhc2tEZWZpbml0aW9uJywge1xuICAgICAgZmFtaWx5OiBgYmNvcy0ke2Vudmlyb25tZW50fWAsXG4gICAgICBjcHU6IGNwdSxcbiAgICAgIG1lbW9yeUxpbWl0TWlCOiBtZW1vcnksXG4gICAgICBleGVjdXRpb25Sb2xlOiBleGVjdXRpb25Sb2xlLFxuICAgICAgdGFza1JvbGU6IHRhc2tSb2xlLFxuICAgICAgcnVudGltZVBsYXRmb3JtOiB7XG4gICAgICAgIG9wZXJhdGluZ1N5c3RlbUZhbWlseTogZWNzLk9wZXJhdGluZ1N5c3RlbUZhbWlseS5MSU5VWCxcbiAgICAgICAgY3B1QXJjaGl0ZWN0dXJlOiBlY3MuQ3B1QXJjaGl0ZWN0dXJlLlg4Nl82NCxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBDb250YWluZXIgaW1hZ2UgVVJJXG4gICAgY29uc3QgaW1hZ2VVcmkgPSBgJHtlY3JSZXBvc2l0b3J5LnJlcG9zaXRvcnlVcml9OmxhdGVzdGA7XG5cbiAgICAvLyBEZWZpbmUgY29udGFpbmVyIHdpdGggc2VjdXJpdHkgaGFyZGVuaW5nXG4gICAgdGhpcy5jb250YWluZXIgPSB0aGlzLnRhc2tEZWZpbml0aW9uLmFkZENvbnRhaW5lcignYXBwJywge1xuICAgICAgY29udGFpbmVyTmFtZTogJ2Jjb3MnLFxuICAgICAgaW1hZ2U6IGVjcy5Db250YWluZXJJbWFnZS5mcm9tUmVnaXN0cnkoaW1hZ2VVcmkpLFxuICAgICAgXG4gICAgICAvLyBSZXNvdXJjZSBsaW1pdHNcbiAgICAgIGNwdTogY3B1LFxuICAgICAgbWVtb3J5TGltaXRNaUI6IG1lbW9yeSxcbiAgICAgIFxuICAgICAgLy8gU2VjdXJpdHkgc2V0dGluZ3NcbiAgICAgIHVzZXI6ICcxMDAxJywgLy8gTm9uLXJvb3QgdXNlclxuICAgICAgcmVhZG9ubHlSb290RmlsZXN5c3RlbTogZmFsc2UsIC8vIE5leHQuanMgcmVxdWlyZXMgd3JpdGUgYWNjZXNzIHRvIC5uZXh0L2NhY2hlXG4gICAgICBcbiAgICAgIC8vIExpbnV4IHBhcmFtZXRlcnMgZm9yIGFkZGl0aW9uYWwgc2VjdXJpdHkgKEZhcmdhdGUgY29tcGF0aWJsZSlcbiAgICAgIGxpbnV4UGFyYW1ldGVyczogbmV3IGVjcy5MaW51eFBhcmFtZXRlcnModGhpcywgJ0xpbnV4UGFyYW1ldGVycycsIHtcbiAgICAgICAgaW5pdFByb2Nlc3NFbmFibGVkOiB0cnVlLFxuICAgICAgICAvLyBOb3RlOiBzaGFyZWRNZW1vcnlTaXplIG5vdCBzdXBwb3J0ZWQgaW4gRmFyZ2F0ZVxuICAgICAgfSksXG5cbiAgICAgIC8vIExvZ2dpbmcgY29uZmlndXJhdGlvblxuICAgICAgbG9nZ2luZzogZWNzLkxvZ0RyaXZlcnMuYXdzTG9ncyh7XG4gICAgICAgIHN0cmVhbVByZWZpeDogJ2VjcycsXG4gICAgICAgIGxvZ0dyb3VwOiB0aGlzLmxvZ0dyb3VwLFxuICAgICAgICBkYXRldGltZUZvcm1hdDogJyVZLSVtLSVkICVIOiVNOiVTJyxcbiAgICAgIH0pLFxuXG4gICAgICAvLyBIZWFsdGggY2hlY2sgKG9wdGltaXplZCAvYXBpL2hlYWx0aCBlbmRwb2ludCBzaG91bGQgcmVzcG9uZCBxdWlja2x5IG5vdylcbiAgICAgIGhlYWx0aENoZWNrOiB7XG4gICAgICAgIGNvbW1hbmQ6IFsnQ01ELVNIRUxMJywgYGN1cmwgLWYgaHR0cDovL2xvY2FsaG9zdDoke2NvbnRhaW5lclBvcnR9L2FwaS9oZWFsdGggfHwgZXhpdCAxYF0sXG4gICAgICAgIGludGVydmFsOiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDEwKSxcbiAgICAgICAgcmV0cmllczogMyxcbiAgICAgICAgc3RhcnRQZXJpb2Q6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDYwKSxcbiAgICAgIH0sXG5cbiAgICAgIC8vIEVudmlyb25tZW50IHZhcmlhYmxlcyAobm9uLXNlbnNpdGl2ZSlcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIE5PREVfRU5WOiBlbnZpcm9ubWVudCxcbiAgICAgICAgUE9SVDogY29udGFpbmVyUG9ydC50b1N0cmluZygpLCAvLyBVc2UgY29uZmlndXJhYmxlIGNvbnRhaW5lclBvcnQgKDMwMDAgZm9yIG5vbi1wcml2aWxlZ2VkKVxuICAgICAgICBBV1NfUkVHSU9OOiBjZGsuU3RhY2sub2YodGhpcykucmVnaW9uLFxuICAgICAgICAuLi5lbnZpcm9ubWVudFZhcmlhYmxlcyxcbiAgICAgIH0sXG5cbiAgICAgIC8vIFNlY3JldHMgZnJvbSBTZWNyZXRzIE1hbmFnZXJcbiAgICAgIHNlY3JldHM6IHtcbiAgICAgICAgU0tJUF9FTlZfVkFMSURBVElPTjogZWNzLlNlY3JldC5mcm9tU2VjcmV0c01hbmFnZXIoc2VjcmV0LCAnU0tJUF9FTlZfVkFMSURBVElPTicpLFxuICAgICAgICBEQVRBQkFTRV9VUkw6IGVjcy5TZWNyZXQuZnJvbVNlY3JldHNNYW5hZ2VyKHNlY3JldCwgJ0RBVEFCQVNFX1VSTCcpLFxuICAgICAgICBBTkFMWVRJQ1NfREFUQUJBU0VfVVJMOiBlY3MuU2VjcmV0LmZyb21TZWNyZXRzTWFuYWdlcihzZWNyZXQsICdBTkFMWVRJQ1NfREFUQUJBU0VfVVJMJyksXG4gICAgICAgIEpXVF9TRUNSRVQ6IGVjcy5TZWNyZXQuZnJvbVNlY3JldHNNYW5hZ2VyKHNlY3JldCwgJ0pXVF9TRUNSRVQnKSxcbiAgICAgICAgSldUX1JFRlJFU0hfU0VDUkVUOiBlY3MuU2VjcmV0LmZyb21TZWNyZXRzTWFuYWdlcihzZWNyZXQsICdKV1RfUkVGUkVTSF9TRUNSRVQnKSxcbiAgICAgICAgQ1NSRl9TRUNSRVQ6IGVjcy5TZWNyZXQuZnJvbVNlY3JldHNNYW5hZ2VyKHNlY3JldCwgJ0NTUkZfU0VDUkVUJyksXG4gICAgICAgIFdFQkFVVEhOX1JQX0lEOiBlY3MuU2VjcmV0LmZyb21TZWNyZXRzTWFuYWdlcihzZWNyZXQsICdXRUJBVVRITl9SUF9JRCcpLFxuICAgICAgICBNRkFfVEVNUF9UT0tFTl9TRUNSRVQ6IGVjcy5TZWNyZXQuZnJvbVNlY3JldHNNYW5hZ2VyKHNlY3JldCwgJ01GQV9URU1QX1RPS0VOX1NFQ1JFVCcpLFxuICAgICAgICBFTUFJTF9GUk9NOiBlY3MuU2VjcmV0LmZyb21TZWNyZXRzTWFuYWdlcihzZWNyZXQsICdFTUFJTF9GUk9NJyksXG4gICAgICAgIEFETUlOX05PVElGSUNBVElPTl9FTUFJTFM6IGVjcy5TZWNyZXQuZnJvbVNlY3JldHNNYW5hZ2VyKHNlY3JldCwgJ0FETUlOX05PVElGSUNBVElPTl9FTUFJTFMnKSxcbiAgICAgIH0sXG5cbiAgICAgIC8vIEVzc2VudGlhbCBjb250YWluZXJcbiAgICAgIGVzc2VudGlhbDogdHJ1ZSxcblxuICAgICAgLy8gU3RvcCB0aW1lb3V0IGZvciBncmFjZWZ1bCBzaHV0ZG93blxuICAgICAgc3RvcFRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcblxuICAgICAgLy8gRGlzYWJsZSBwcml2aWxlZ2VkIG1vZGVcbiAgICAgIHByaXZpbGVnZWQ6IGZhbHNlLFxuICAgIH0pO1xuXG4gICAgLy8gQWRkIHBvcnQgbWFwcGluZ1xuICAgIHRoaXMuY29udGFpbmVyLmFkZFBvcnRNYXBwaW5ncyh7XG4gICAgICBjb250YWluZXJQb3J0OiBjb250YWluZXJQb3J0LFxuICAgICAgcHJvdG9jb2w6IGVjcy5Qcm90b2NvbC5UQ1AsXG4gICAgICBuYW1lOiAnaHR0cCcsXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgdWxpbWl0cyBmb3Igc2VjdXJpdHlcbiAgICB0aGlzLmNvbnRhaW5lci5hZGRVbGltaXRzKHtcbiAgICAgIG5hbWU6IGVjcy5VbGltaXROYW1lLk5PRklMRSxcbiAgICAgIHNvZnRMaW1pdDogNjU1MzYsXG4gICAgICBoYXJkTGltaXQ6IDY1NTM2LFxuICAgIH0pO1xuXG4gICAgLy8gTm90ZTogRmFyZ2F0ZSBwcm92aWRlcyB3cml0YWJsZSAvdG1wIGJ5IGRlZmF1bHQsIG5vIG5lZWQgZm9yIGN1c3RvbSB2b2x1bWVzXG5cbiAgICAvLyBUYWdzXG4gICAgY2RrLlRhZ3Mub2YodGhpcy50YXNrRGVmaW5pdGlvbikuYWRkKCdFbnZpcm9ubWVudCcsIGVudmlyb25tZW50KTtcbiAgICBjZGsuVGFncy5vZih0aGlzLnRhc2tEZWZpbml0aW9uKS5hZGQoJ0FwcGxpY2F0aW9uJywgJ0JDT1MnKTtcbiAgICBjZGsuVGFncy5vZih0aGlzLnRhc2tEZWZpbml0aW9uKS5hZGQoJ01hbmFnZWRCeScsICdDREsnKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBVcGRhdGUgdGhlIGNvbnRhaW5lciBpbWFnZSB0YWcgZm9yIGRlcGxveW1lbnRzXG4gICAqL1xuICBwdWJsaWMgdXBkYXRlSW1hZ2VUYWcodGFnOiBzdHJpbmcpOiB2b2lkIHtcbiAgICAvLyBUaGlzIG1ldGhvZCB3b3VsZCBiZSB1c2VkIGJ5IHRoZSBDSS9DRCBwaXBlbGluZSB0byB1cGRhdGUgdGhlIGltYWdlIHRhZ1xuICAgIC8vIFRoZSBhY3R1YWwgaW1wbGVtZW50YXRpb24gd291bGQgZGVwZW5kIG9uIHRoZSBkZXBsb3ltZW50IHN0cmF0ZWd5XG4gICAgY29uc3QgaW1hZ2VVcmkgPSBgJHt0aGlzLmNvbnRhaW5lci5pbWFnZU5hbWU/LnNwbGl0KCc6JylbMF19OiR7dGFnfWA7XG4gICAgLy8gTm90ZTogQ0RLIGRvZXNuJ3QgZGlyZWN0bHkgc3VwcG9ydCBydW50aW1lIGltYWdlIHVwZGF0ZXNcbiAgICAvLyBUaGlzIHdvdWxkIGJlIGhhbmRsZWQgYnkgdGhlIENJL0NEIHBpcGVsaW5lIHVwZGF0aW5nIHRoZSB0YXNrIGRlZmluaXRpb25cbiAgfVxufVxuIl19