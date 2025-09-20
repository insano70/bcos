import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';
export interface WafProtectionProps {
    /**
     * Environment name (staging or production)
     */
    environment: string;
    /**
     * KMS key for log encryption
     */
    kmsKey: kms.IKey;
    /**
     * Rate limit per IP address (requests per 5 minutes)
     * Default: 1000 for production, 2000 for staging
     */
    rateLimitPerIP?: number;
    /**
     * Enable geo-blocking (default: false)
     */
    enableGeoBlocking?: boolean;
    /**
     * List of country codes to block (if geo-blocking enabled)
     */
    blockedCountries?: string[];
    /**
     * Enable additional managed rules (default: true for production)
     */
    enableManagedRules?: boolean;
}
/**
 * WAF protection construct that creates a Web ACL with security rules
 * to protect the application from common web attacks
 */
export declare class WafProtection extends Construct {
    readonly webAcl: wafv2.CfnWebACL;
    readonly logGroup: logs.LogGroup;
    constructor(scope: Construct, id: string, props: WafProtectionProps);
    /**
     * Associate the Web ACL with an Application Load Balancer
     */
    associateWithLoadBalancer(loadBalancerArn: string): wafv2.CfnWebACLAssociation;
}
