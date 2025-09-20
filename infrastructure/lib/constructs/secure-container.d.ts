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
     * Container port (default: 80)
     */
    containerPort?: number;
    /**
     * Additional environment variables
     */
    environmentVariables?: {
        [key: string]: string;
    };
}
/**
 * Secure container construct that creates hardened ECS task definitions
 * with security best practices applied
 */
export declare class SecureContainer extends Construct {
    readonly taskDefinition: ecs.FargateTaskDefinition;
    readonly container: ecs.ContainerDefinition;
    readonly logGroup: logs.LogGroup;
    constructor(scope: Construct, id: string, props: SecureContainerProps);
    /**
     * Update the container image tag for deployments
     */
    updateImageTag(tag: string): void;
}
