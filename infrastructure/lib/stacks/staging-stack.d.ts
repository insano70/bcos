import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Construct } from 'constructs';
import { WafProtection } from '../constructs/waf-protection';
interface StagingStackProps extends cdk.StackProps {
}
export declare class StagingStack extends cdk.Stack {
    readonly ecsCluster: ecs.Cluster;
    readonly targetGroup: elbv2.ApplicationTargetGroup;
    readonly wafProtection: WafProtection;
    constructor(scope: Construct, id: string, props: StagingStackProps);
}
export {};
