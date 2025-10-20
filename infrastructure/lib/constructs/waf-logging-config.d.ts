import { Construct } from 'constructs';
export interface WafLoggingConfigProps {
    webAclArn: string;
    logGroupArn: string;
    redactedFields?: Array<{
        queryString?: Record<string, never>;
        singleHeader?: {
            Name: string;
        };
    }>;
}
/**
 * Custom Resource for WAF Logging Configuration
 *
 * This handles the AWS limitation where only one logging config per WebACL is allowed.
 * Instead of failing when a config exists, it updates the existing one.
 */
export declare class WafLoggingConfig extends Construct {
    constructor(scope: Construct, id: string, props: WafLoggingConfigProps);
}
