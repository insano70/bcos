import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Construct } from 'constructs';
interface ProductionStackProps extends cdk.StackProps {
}
export declare class ProductionStack extends cdk.Stack {
    readonly ecsCluster: ecs.Cluster;
    readonly targetGroup: elbv2.ApplicationTargetGroup;
    constructor(scope: Construct, id: string, props: ProductionStackProps);
}
export {};
