import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
export declare class SecurityStack extends cdk.Stack {
    readonly kmsKey: kms.Key;
    readonly githubActionsRole: iam.Role;
    readonly ecsTaskExecutionRole: iam.Role;
    readonly ecsTaskRole: iam.Role;
    readonly ecrRepository: ecr.Repository;
    readonly productionSecret: secretsmanager.Secret;
    readonly stagingSecret: secretsmanager.Secret;
    constructor(scope: Construct, id: string, props?: cdk.StackProps);
}
