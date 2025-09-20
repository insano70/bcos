import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as certificatemanager from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
interface NetworkStackProps extends cdk.StackProps {
    kmsKey: kms.Key;
}
export declare class NetworkStack extends cdk.Stack {
    readonly vpc: ec2.IVpc;
    readonly albSecurityGroup: ec2.SecurityGroup;
    readonly ecsSecurityGroup: ec2.SecurityGroup;
    readonly loadBalancer: elbv2.ApplicationLoadBalancer;
    readonly httpsListener: elbv2.ApplicationListener;
    readonly certificate: certificatemanager.Certificate;
    readonly hostedZone: route53.IHostedZone;
    readonly accessLogsBucket: s3.Bucket;
    constructor(scope: Construct, id: string, props: NetworkStackProps);
}
export {};
