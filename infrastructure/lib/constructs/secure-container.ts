import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import { Construct } from 'constructs';

export interface SecureContainerProps {
  /**
   * Environment name (staging or production)
   */
  environment: string;

  /**
   * ECS cluster for the task definition
   */
  cluster: ecs.ICluster;

  /**
   * ECR repository for container images
   */
  ecrRepository: ecr.IRepository;

  /**
   * KMS key for encryption
   */
  kmsKey: kms.IKey;

  /**
   * Task execution role
   */
  executionRole: iam.IRole;

  /**
   * Task role for application runtime
   */
  taskRole: iam.IRole;

  /**
   * Secrets Manager secret containing application configuration
   */
  secret: secretsmanager.ISecret;

  /**
   * CPU units for the task (256, 512, 1024, 2048, 4096)
   */
  cpu: number;

  /**
   * Memory in MB
   */
  memory: number;

  /**
   * Container port (default: 3000)
   */
  containerPort?: number;

  /**
   * Additional environment variables
   */
  environmentVariables?: { [key: string]: string };
}

/**
 * Secure container construct that creates hardened ECS task definitions
 * with security best practices applied
 */
export class SecureContainer extends Construct {
  public readonly taskDefinition: ecs.FargateTaskDefinition;
  public readonly container: ecs.ContainerDefinition;
  public readonly logGroup: logs.LogGroup;

  constructor(scope: Construct, id: string, props: SecureContainerProps) {
    super(scope, id);

    const {
      environment,
      cluster,
      ecrRepository,
      kmsKey,
      executionRole,
      taskRole,
      secret,
      cpu,
      memory,
      containerPort = 3000,
      environmentVariables = {},
    } = props;

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
  public updateImageTag(tag: string): void {
    // This method would be used by the CI/CD pipeline to update the image tag
    // The actual implementation would depend on the deployment strategy
    const imageUri = `${this.container.imageName?.split(':')[0]}:${tag}`;
    // Note: CDK doesn't directly support runtime image updates
    // This would be handled by the CI/CD pipeline updating the task definition
  }
}
