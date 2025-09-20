import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Construct } from 'constructs';
import { SecurityStack } from '../stacks/security-stack';
import { NetworkStack } from '../stacks/network-stack';
import { WafProtection } from '../constructs/waf-protection';
import { Monitoring } from '../constructs/monitoring';
interface StagingStageProps extends cdk.StageProps {
    securityStack: SecurityStack;
    networkStack: NetworkStack;
}
export declare class StagingStage extends cdk.Stage {
    readonly ecsCluster: ecs.Cluster;
    readonly ecsService: ecs.FargateService;
    readonly targetGroup: elbv2.ApplicationTargetGroup;
    readonly wafProtection: WafProtection;
    readonly monitoring: Monitoring;
    constructor(scope: Construct, id: string, props: StagingStageProps);
}
export {};
