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
exports.WafProtection = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const wafv2 = __importStar(require("aws-cdk-lib/aws-wafv2"));
const logs = __importStar(require("aws-cdk-lib/aws-logs"));
const constructs_1 = require("constructs");
/**
 * WAF protection construct that creates a Web ACL with security rules
 * to protect the application from common web attacks
 */
class WafProtection extends constructs_1.Construct {
    webAcl;
    logGroup;
    constructor(scope, id, props) {
        super(scope, id);
        const { environment, kmsKey, rateLimitPerIP = environment === 'production' ? 1000 : 2000, enableGeoBlocking = false, blockedCountries = [], enableManagedRules = environment === 'production', } = props;
        // Create CloudWatch log group for WAF logs (using AWS managed encryption)
        this.logGroup = new logs.LogGroup(this, 'WAFLogGroup', {
            logGroupName: `/aws/waf/bcos-${environment}-${Date.now()}`,
            retention: environment === 'production' ? logs.RetentionDays.THREE_MONTHS : logs.RetentionDays.ONE_MONTH,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
        });
        // Build WAF rules array
        const rules = [];
        let priority = 1;
        // AWS Managed Core Rule Set (OWASP Top 10)
        if (enableManagedRules) {
            rules.push({
                name: 'AWS-AWSManagedRulesCommonRuleSet',
                priority: priority++,
                overrideAction: { none: {} },
                statement: {
                    managedRuleGroupStatement: {
                        vendorName: 'AWS',
                        name: 'AWSManagedRulesCommonRuleSet',
                        // Exclude specific rules if needed
                        excludedRules: [],
                    },
                },
                visibilityConfig: {
                    sampledRequestsEnabled: true,
                    cloudWatchMetricsEnabled: true,
                    metricName: `CommonRuleSet-${environment}`,
                },
            });
            // AWS Managed Known Bad Inputs Rule Set
            rules.push({
                name: 'AWS-AWSManagedRulesKnownBadInputsRuleSet',
                priority: priority++,
                overrideAction: { none: {} },
                statement: {
                    managedRuleGroupStatement: {
                        vendorName: 'AWS',
                        name: 'AWSManagedRulesKnownBadInputsRuleSet',
                    },
                },
                visibilityConfig: {
                    sampledRequestsEnabled: true,
                    cloudWatchMetricsEnabled: true,
                    metricName: `KnownBadInputs-${environment}`,
                },
            });
            // AWS Managed OWASP Top 10 Rule Set (production only)
            if (environment === 'production') {
                rules.push({
                    name: 'AWS-AWSManagedRulesOWASPTopTenRuleSet',
                    priority: priority++,
                    overrideAction: { none: {} },
                    statement: {
                        managedRuleGroupStatement: {
                            vendorName: 'AWS',
                            name: 'AWSManagedRulesOWASPTopTenRuleSet',
                        },
                    },
                    visibilityConfig: {
                        sampledRequestsEnabled: true,
                        cloudWatchMetricsEnabled: true,
                        metricName: `OWASPTopTen-${environment}`,
                    },
                });
            }
        }
        // Rate limiting rule
        rules.push({
            name: `RateLimitRule-${environment}`,
            priority: priority++,
            action: { block: {} },
            statement: {
                rateBasedStatement: {
                    limit: rateLimitPerIP,
                    aggregateKeyType: 'IP',
                    scopeDownStatement: {
                        notStatement: {
                            statement: {
                                byteMatchStatement: {
                                    searchString: '/health',
                                    fieldToMatch: { uriPath: {} },
                                    textTransformations: [
                                        {
                                            priority: 0,
                                            type: 'LOWERCASE',
                                        },
                                    ],
                                    positionalConstraint: 'STARTS_WITH',
                                },
                            },
                        },
                    },
                },
            },
            visibilityConfig: {
                sampledRequestsEnabled: true,
                cloudWatchMetricsEnabled: true,
                metricName: `RateLimit-${environment}`,
            },
        });
        // Geographic blocking rule (if enabled)
        if (enableGeoBlocking && blockedCountries.length > 0) {
            rules.push({
                name: `GeoBlockRule-${environment}`,
                priority: priority++,
                action: { block: {} },
                statement: {
                    geoMatchStatement: {
                        countryCodes: blockedCountries,
                    },
                },
                visibilityConfig: {
                    sampledRequestsEnabled: true,
                    cloudWatchMetricsEnabled: true,
                    metricName: `GeoBlock-${environment}`,
                },
            });
        }
        // Custom rule for API abuse protection
        if (environment === 'production') {
            rules.push({
                name: `APIAbuseProtection-${environment}`,
                priority: priority++,
                action: { block: {} },
                statement: {
                    andStatement: {
                        statements: [
                            {
                                byteMatchStatement: {
                                    searchString: '/api/',
                                    fieldToMatch: { uriPath: {} },
                                    textTransformations: [
                                        {
                                            priority: 0,
                                            type: 'LOWERCASE',
                                        },
                                    ],
                                    positionalConstraint: 'STARTS_WITH',
                                },
                            },
                            {
                                rateBasedStatement: {
                                    limit: 500, // More restrictive for API endpoints
                                    aggregateKeyType: 'IP',
                                },
                            },
                        ],
                    },
                },
                visibilityConfig: {
                    sampledRequestsEnabled: true,
                    cloudWatchMetricsEnabled: true,
                    metricName: `APIAbuseProtection-${environment}`,
                },
            });
        }
        // Create the Web ACL
        this.webAcl = new wafv2.CfnWebACL(this, 'WebACL', {
            scope: 'REGIONAL',
            defaultAction: { allow: {} },
            name: `BCOS-${environment}-WebACL`,
            description: `WAF protection for BCOS ${environment} environment`,
            rules: rules,
            visibilityConfig: {
                sampledRequestsEnabled: true,
                cloudWatchMetricsEnabled: true,
                metricName: `BCOS-${environment}-WebACL`,
            },
            tags: [
                {
                    key: 'Environment',
                    value: environment,
                },
                {
                    key: 'Application',
                    value: 'BCOS',
                },
                {
                    key: 'ManagedBy',
                    value: 'CDK',
                },
            ],
        });
        // WAF logging configuration
        // Logs all WAF events to CloudWatch for security monitoring and compliance
        new wafv2.CfnLoggingConfiguration(this, 'WAFLoggingConfiguration', {
            resourceArn: this.webAcl.attrArn,
            logDestinationConfigs: [this.logGroup.logGroupArn],
            // Redact sensitive fields from logs to comply with data privacy requirements
            redactedFields: [
                { queryString: {} }, // Redact query parameters (may contain sensitive data)
                { singleHeader: { name: 'authorization' } }, // Redact auth headers
                { singleHeader: { name: 'cookie' } }, // Redact cookies
            ],
        });
        // Output the Web ACL ARN
        new cdk.CfnOutput(this, 'WebACLArn', {
            value: this.webAcl.attrArn,
            description: `WAF Web ACL ARN for ${environment}`,
            exportName: `BCOS-${environment}-WebACL-Arn`,
        });
        // Output the Web ACL ID
        new cdk.CfnOutput(this, 'WebACLId', {
            value: this.webAcl.attrId,
            description: `WAF Web ACL ID for ${environment}`,
            exportName: `BCOS-${environment}-WebACL-Id`,
        });
    }
    /**
     * Associate the Web ACL with an Application Load Balancer
     */
    associateWithLoadBalancer(loadBalancerArn) {
        return new wafv2.CfnWebACLAssociation(this, 'WebACLAssociation', {
            resourceArn: loadBalancerArn,
            webAclArn: this.webAcl.attrArn,
        });
    }
}
exports.WafProtection = WafProtection;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2FmLXByb3RlY3Rpb24uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ3YWYtcHJvdGVjdGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMsNkRBQStDO0FBQy9DLDJEQUE2QztBQUU3QywyQ0FBdUM7QUFtQ3ZDOzs7R0FHRztBQUNILE1BQWEsYUFBYyxTQUFRLHNCQUFTO0lBQzFCLE1BQU0sQ0FBa0I7SUFDeEIsUUFBUSxDQUFnQjtJQUV4QyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQXlCO1FBQ2pFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsTUFBTSxFQUNKLFdBQVcsRUFDWCxNQUFNLEVBQ04sY0FBYyxHQUFHLFdBQVcsS0FBSyxZQUFZLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUMzRCxpQkFBaUIsR0FBRyxLQUFLLEVBQ3pCLGdCQUFnQixHQUFHLEVBQUUsRUFDckIsa0JBQWtCLEdBQUcsV0FBVyxLQUFLLFlBQVksR0FDbEQsR0FBRyxLQUFLLENBQUM7UUFFViwwRUFBMEU7UUFDMUUsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLGFBQWEsRUFBRTtZQUNyRCxZQUFZLEVBQUUsaUJBQWlCLFdBQVcsSUFBSSxJQUFJLENBQUMsR0FBRyxFQUFFLEVBQUU7WUFDMUQsU0FBUyxFQUFFLFdBQVcsS0FBSyxZQUFZLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLFNBQVM7WUFDeEcsYUFBYSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsTUFBTTtTQUN4QyxDQUFDLENBQUM7UUFFSCx3QkFBd0I7UUFDeEIsTUFBTSxLQUFLLEdBQW1DLEVBQUUs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RTtZQUM3RSxjQUFjLEVBQUU7Z0JBQ2QsRUFBRSxXQUFXLEVBQUUsRUFBRSxFQUFFLEVBQUUsdURBQXVEO2dCQUM1RSxFQUFFLFlBQVksRUFBRSxFQUFFLElBQUksRUFBRSxlQUFlLEVBQUUsRUFBRSxFQUFFLHNCQUFzQjtnQkFDbkUsRUFBRSxZQUFZLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLEVBQUUsRUFBRSxpQkFBaUI7YUFDeEQ7U0FDRixDQUFDLENBQUM7UUFFSCx5QkFBeUI7UUFDekIsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxXQUFXLEVBQUU7WUFDbkMsS0FBSyxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTztZQUMxQixXQUFXLEVBQUUsdUJBQXVCLFdBQVcsRUFBRTtZQUNqRCxVQUFVLEVBQUUsUUFBUSxXQUFXLGFBQWE7U0FDN0MsQ0FBQyxDQUFDO1FBRUgsd0JBQXdCO1FBQ3hCLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsVUFBVSxFQUFFO1lBQ2xDLEtBQUssRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU07WUFDekIsV0FBVyxFQUFFLHNCQUFzQixXQUFXLEVBQUU7WUFDaEQsVUFBVSxFQUFFLFFBQVEsV0FBVyxZQUFZO1NBQzVDLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFRDs7T0FFRztJQUNJLHlCQUF5QixDQUFDLGVBQXVCO1FBQ3RELE9BQU8sSUFBSSxLQUFLLENBQUMsb0JBQW9CLENBQUMsSUFBSSxFQUFFLG1CQUFtQixFQUFFO1lBQy9ELFdBQVcsRUFBRSxlQUFlO1lBQzVCLFNBQVMsRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU87U0FDL0IsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBclBELHNDQXFQQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgKiBhcyB3YWZ2MiBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtd2FmdjInO1xuaW1wb3J0ICogYXMgbG9ncyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbG9ncyc7XG5pbXBvcnQgKiBhcyBrbXMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWttcyc7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcblxuZXhwb3J0IGludGVyZmFjZSBXYWZQcm90ZWN0aW9uUHJvcHMge1xuICAvKipcbiAgICogRW52aXJvbm1lbnQgbmFtZSAoc3RhZ2luZyBvciBwcm9kdWN0aW9uKVxuICAgKi9cbiAgZW52aXJvbm1lbnQ6IHN0cmluZztcblxuICAvKipcbiAgICogS01TIGtleSBmb3IgbG9nIGVuY3J5cHRpb25cbiAgICovXG4gIGttc0tleToga21zLklLZXk7XG5cbiAgLyoqXG4gICAqIFJhdGUgbGltaXQgcGVyIElQIGFkZHJlc3MgKHJlcXVlc3RzIHBlciA1IG1pbnV0ZXMpXG4gICAqIERlZmF1bHQ6IDEwMDAgZm9yIHByb2R1Y3Rpb24sIDIwMDAgZm9yIHN0YWdpbmdcbiAgICovXG4gIHJhdGVMaW1pdFBlcklQPzogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBFbmFibGUgZ2VvLWJsb2NraW5nIChkZWZhdWx0OiBmYWxzZSlcbiAgICovXG4gIGVuYWJsZUdlb0Jsb2NraW5nPzogYm9vbGVhbjtcblxuICAvKipcbiAgICogTGlzdCBvZiBjb3VudHJ5IGNvZGVzIHRvIGJsb2NrIChpZiBnZW8tYmxvY2tpbmcgZW5hYmxlZClcbiAgICovXG4gIGJsb2NrZWRDb3VudHJpZXM/OiBzdHJpbmdbXTtcblxuICAvKipcbiAgICogRW5hYmxlIGFkZGl0aW9uYWwgbWFuYWdlZCBydWxlcyAoZGVmYXVsdDogdHJ1ZSBmb3IgcHJvZHVjdGlvbilcbiAgICovXG4gIGVuYWJsZU1hbmFnZWRSdWxlcz86IGJvb2xlYW47XG59XG5cbi8qKlxuICogV0FGIHByb3RlY3Rpb24gY29uc3RydWN0IHRoYXQgY3JlYXRlcyBhIFdlYiBBQ0wgd2l0aCBzZWN1cml0eSBydWxlc1xuICogdG8gcHJvdGVjdCB0aGUgYXBwbGljYXRpb24gZnJvbSBjb21tb24gd2ViIGF0dGFja3NcbiAqL1xuZXhwb3J0IGNsYXNzIFdhZlByb3RlY3Rpb24gZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICBwdWJsaWMgcmVhZG9ubHkgd2ViQWNsOiB3YWZ2Mi5DZm5XZWJBQ0w7XG4gIHB1YmxpYyByZWFkb25seSBsb2dHcm91cDogbG9ncy5Mb2dHcm91cDtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogV2FmUHJvdGVjdGlvblByb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcblxuICAgIGNvbnN0IHtcbiAgICAgIGVudmlyb25tZW50LFxuICAgICAga21zS2V5LFxuICAgICAgcmF0ZUxpbWl0UGVySVAgPSBlbnZpcm9ubWVudCA9PT0gJ3Byb2R1Y3Rpb24nID8gMTAwMCA6IDIwMDAsXG4gICAgICBlbmFibGVHZW9CbG9ja2luZyA9IGZhbHNlLFxuICAgICAgYmxvY2tlZENvdW50cmllcyA9IFtdLFxuICAgICAgZW5hYmxlTWFuYWdlZFJ1bGVzID0gZW52aXJvbm1lbnQgPT09ICdwcm9kdWN0aW9uJyxcbiAgICB9ID0gcHJvcHM7XG5cbiAgICAvLyBDcmVhdGUgQ2xvdWRXYXRjaCBsb2cgZ3JvdXAgZm9yIFdBRiBsb2dzICh1c2luZyBBV1MgbWFuYWdlZCBlbmNyeXB0aW9uKVxuICAgIHRoaXMubG9nR3JvdXAgPSBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnV0FGTG9nR3JvdXAnLCB7XG4gICAgICBsb2dHcm91cE5hbWU6IGAvYXdzL3dhZi9iY29zLSR7ZW52aXJvbm1lbnR9LSR7RGF0ZS5ub3coKX1gLFxuICAgICAgcmV0ZW50aW9uOiBlbnZpcm9ubWVudCA9PT0gJ3Byb2R1Y3Rpb24nID8gbG9ncy5SZXRlbnRpb25EYXlzLlRIUkVFX01PTlRIUyA6IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfTU9OVEgsXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4sXG4gICAgfSk7XG5cbiAgICAvLyBCdWlsZCBXQUYgcnVsZXMgYXJyYXlcbiAgICBjb25zdCBydWxlczogd2FmdjIuQ2ZuV2ViQUNMLlJ1bGVQcm9wZXJ0eVtdID0gW107XG4gICAgbGV0IHByaW9yaXR5ID0gMTtcblxuICAgIC8vIEFXUyBNYW5hZ2VkIENvcmUgUnVsZSBTZXQgKE9XQVNQIFRvcCAxMClcbiAgICBpZiAoZW5hYmxlTWFuYWdlZFJ1bGVzKSB7XG4gICAgICBydWxlcy5wdXNoKHtcbiAgICAgICAgbmFtZTogJ0FXUy1BV1NNYW5hZ2VkUnVsZXNDb21tb25SdWxlU2V0JyxcbiAgICAgICAgcHJpb3JpdHk6IHByaW9yaXR5KyssXG4gICAgICAgIG92ZXJyaWRlQWN0aW9uOiB7IG5vbmU6IHt9IH0sXG4gICAgICAgIHN0YXRlbWVudDoge1xuICAgICAgICAgIG1hbmFnZWRSdWxlR3JvdXBTdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgIHZlbmRvck5hbWU6ICdBV1MnLFxuICAgICAgICAgICAgbmFtZTogJ0FXU01hbmFnZWRSdWxlc0NvbW1vblJ1bGVTZXQnLFxuICAgICAgICAgICAgLy8gRXhjbHVkZSBzcGVjaWZpYyBydWxlcyBpZiBuZWVkZWRcbiAgICAgICAgICAgIGV4Y2x1ZGVkUnVsZXM6IFtdLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIHZpc2liaWxpdHlDb25maWc6IHtcbiAgICAgICAgICBzYW1wbGVkUmVxdWVzdHNFbmFibGVkOiB0cnVlLFxuICAgICAgICAgIGNsb3VkV2F0Y2hNZXRyaWNzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICBtZXRyaWNOYW1lOiBgQ29tbW9uUnVsZVNldC0ke2Vudmlyb25tZW50fWAsXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgICAgLy8gQVdTIE1hbmFnZWQgS25vd24gQmFkIElucHV0cyBSdWxlIFNldFxuICAgICAgcnVsZXMucHVzaCh7XG4gICAgICAgIG5hbWU6ICdBV1MtQVdTTWFuYWdlZFJ1bGVzS25vd25CYWRJbnB1dHNSdWxlU2V0JyxcbiAgICAgICAgcHJpb3JpdHk6IHByaW9yaXR5KyssXG4gICAgICAgIG92ZXJyaWRlQWN0aW9uOiB7IG5vbmU6IHt9IH0sXG4gICAgICAgIHN0YXRlbWVudDoge1xuICAgICAgICAgIG1hbmFnZWRSdWxlR3JvdXBTdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgIHZlbmRvck5hbWU6ICdBV1MnLFxuICAgICAgICAgICAgbmFtZTogJ0FXU01hbmFnZWRSdWxlc0tub3duQmFkSW5wdXRzUnVsZVNldCcsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgdmlzaWJpbGl0eUNvbmZpZzoge1xuICAgICAgICAgIHNhbXBsZWRSZXF1ZXN0c0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgY2xvdWRXYXRjaE1ldHJpY3NFbmFibGVkOiB0cnVlLFxuICAgICAgICAgIG1ldHJpY05hbWU6IGBLbm93bkJhZElucHV0cy0ke2Vudmlyb25tZW50fWAsXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgICAgLy8gQVdTIE1hbmFnZWQgT1dBU1AgVG9wIDEwIFJ1bGUgU2V0IChwcm9kdWN0aW9uIG9ubHkpXG4gICAgICBpZiAoZW52aXJvbm1lbnQgPT09ICdwcm9kdWN0aW9uJykge1xuICAgICAgICBydWxlcy5wdXNoKHtcbiAgICAgICAgICBuYW1lOiAnQVdTLUFXU01hbmFnZWRSdWxlc09XQVNQVG9wVGVuUnVsZVNldCcsXG4gICAgICAgICAgcHJpb3JpdHk6IHByaW9yaXR5KyssXG4gICAgICAgICAgb3ZlcnJpZGVBY3Rpb246IHsgbm9uZToge30gfSxcbiAgICAgICAgICBzdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgIG1hbmFnZWRSdWxlR3JvdXBTdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgICAgdmVuZG9yTmFtZTogJ0FXUycsXG4gICAgICAgICAgICAgIG5hbWU6ICdBV1NNYW5hZ2VkUnVsZXNPV0FTUFRvcFRlblJ1bGVTZXQnLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIHZpc2liaWxpdHlDb25maWc6IHtcbiAgICAgICAgICAgIHNhbXBsZWRSZXF1ZXN0c0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgICBjbG91ZFdhdGNoTWV0cmljc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgICBtZXRyaWNOYW1lOiBgT1dBU1BUb3BUZW4tJHtlbnZpcm9ubWVudH1gLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFJhdGUgbGltaXRpbmcgcnVsZVxuICAgIHJ1bGVzLnB1c2goe1xuICAgICAgbmFtZTogYFJhdGVMaW1pdFJ1bGUtJHtlbnZpcm9ubWVudH1gLFxuICAgICAgcHJpb3JpdHk6IHByaW9yaXR5KyssXG4gICAgICBhY3Rpb246IHsgYmxvY2s6IHt9IH0sXG4gICAgICBzdGF0ZW1lbnQ6IHtcbiAgICAgICAgcmF0ZUJhc2VkU3RhdGVtZW50OiB7XG4gICAgICAgICAgbGltaXQ6IHJhdGVMaW1pdFBlcklQLFxuICAgICAgICAgIGFnZ3JlZ2F0ZUtleVR5cGU6ICdJUCcsXG4gICAgICAgICAgc2NvcGVEb3duU3RhdGVtZW50OiB7XG4gICAgICAgICAgICBub3RTdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgICAgc3RhdGVtZW50OiB7XG4gICAgICAgICAgICAgICAgYnl0ZU1hdGNoU3RhdGVtZW50OiB7XG4gICAgICAgICAgICAgICAgICBzZWFyY2hTdHJpbmc6ICcvaGVhbHRoJyxcbiAgICAgICAgICAgICAgICAgIGZpZWxkVG9NYXRjaDogeyB1cmlQYXRoOiB7fSB9LFxuICAgICAgICAgICAgICAgICAgdGV4dFRyYW5zZm9ybWF0aW9uczogW1xuICAgICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICAgcHJpb3JpdHk6IDAsXG4gICAgICAgICAgICAgICAgICAgICAgdHlwZTogJ0xPV0VSQ0FTRScsXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICAgICAgcG9zaXRpb25hbENvbnN0cmFpbnQ6ICdTVEFSVFNfV0lUSCcsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICB2aXNpYmlsaXR5Q29uZmlnOiB7XG4gICAgICAgIHNhbXBsZWRSZXF1ZXN0c0VuYWJsZWQ6IHRydWUsXG4gICAgICAgIGNsb3VkV2F0Y2hNZXRyaWNzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgbWV0cmljTmFtZTogYFJhdGVMaW1pdC0ke2Vudmlyb25tZW50fWAsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gR2VvZ3JhcGhpYyBibG9ja2luZyBydWxlIChpZiBlbmFibGVkKVxuICAgIGlmIChlbmFibGVHZW9CbG9ja2luZyAmJiBibG9ja2VkQ291bnRyaWVzLmxlbmd0aCA+IDApIHtcbiAgICAgIHJ1bGVzLnB1c2goe1xuICAgICAgICBuYW1lOiBgR2VvQmxvY2tSdWxlLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgICAgcHJpb3JpdHk6IHByaW9yaXR5KyssXG4gICAgICAgIGFjdGlvbjogeyBibG9jazoge30gfSxcbiAgICAgICAgc3RhdGVtZW50OiB7XG4gICAgICAgICAgZ2VvTWF0Y2hTdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgIGNvdW50cnlDb2RlczogYmxvY2tlZENvdW50cmllcyxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICB2aXNpYmlsaXR5Q29uZmlnOiB7XG4gICAgICAgICAgc2FtcGxlZFJlcXVlc3RzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICBjbG91ZFdhdGNoTWV0cmljc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgbWV0cmljTmFtZTogYEdlb0Jsb2NrLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIEN1c3RvbSBydWxlIGZvciBBUEkgYWJ1c2UgcHJvdGVjdGlvblxuICAgIGlmIChlbnZpcm9ubWVudCA9PT0gJ3Byb2R1Y3Rpb24nKSB7XG4gICAgICBydWxlcy5wdXNoKHtcbiAgICAgICAgbmFtZTogYEFQSUFidXNlUHJvdGVjdGlvbi0ke2Vudmlyb25tZW50fWAsXG4gICAgICAgIHByaW9yaXR5OiBwcmlvcml0eSsrLFxuICAgICAgICBhY3Rpb246IHsgYmxvY2s6IHt9IH0sXG4gICAgICAgIHN0YXRlbWVudDoge1xuICAgICAgICAgIGFuZFN0YXRlbWVudDoge1xuICAgICAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgYnl0ZU1hdGNoU3RhdGVtZW50OiB7XG4gICAgICAgICAgICAgICAgICBzZWFyY2hTdHJpbmc6ICcvYXBpLycsXG4gICAgICAgICAgICAgICAgICBmaWVsZFRvTWF0Y2g6IHsgdXJpUGF0aDoge30gfSxcbiAgICAgICAgICAgICAgICAgIHRleHRUcmFuc2Zvcm1hdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgIHByaW9yaXR5OiAwLFxuICAgICAgICAgICAgICAgICAgICAgIHR5cGU6ICdMT1dFUkNBU0UnLFxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgICAgIHBvc2l0aW9uYWxDb25zdHJhaW50OiAnU1RBUlRTX1dJVEgnLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICByYXRlQmFzZWRTdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgICAgICAgIGxpbWl0OiA1MDAsIC8vIE1vcmUgcmVzdHJpY3RpdmUgZm9yIEFQSSBlbmRwb2ludHNcbiAgICAgICAgICAgICAgICAgIGFnZ3JlZ2F0ZUtleVR5cGU6ICdJUCcsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgdmlzaWJpbGl0eUNvbmZpZzoge1xuICAgICAgICAgIHNhbXBsZWRSZXF1ZXN0c0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgY2xvdWRXYXRjaE1ldHJpY3NFbmFibGVkOiB0cnVlLFxuICAgICAgICAgIG1ldHJpY05hbWU6IGBBUElBYnVzZVByb3RlY3Rpb24tJHtlbnZpcm9ubWVudH1gLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gQ3JlYXRlIHRoZSBXZWIgQUNMXG4gICAgdGhpcy53ZWJBY2wgPSBuZXcgd2FmdjIuQ2ZuV2ViQUNMKHRoaXMsICdXZWJBQ0wnLCB7XG4gICAgICBzY29wZTogJ1JFR0lPTkFMJyxcbiAgICAgIGRlZmF1bHRBY3Rpb246IHsgYWxsb3c6IHt9IH0sXG4gICAgICBuYW1lOiBgQkNPUy0ke2Vudmlyb25tZW50fS1XZWJBQ0xgLFxuICAgICAgZGVzY3JpcHRpb246IGBXQUYgcHJvdGVjdGlvbiBmb3IgQkNPUyAke2Vudmlyb25tZW50fSBlbnZpcm9ubWVudGAsXG4gICAgICBydWxlczogcnVsZXMsXG4gICAgICB2aXNpYmlsaXR5Q29uZmlnOiB7XG4gICAgICAgIHNhbXBsZWRSZXF1ZXN0c0VuYWJsZWQ6IHRydWUsXG4gICAgICAgIGNsb3VkV2F0Y2hNZXRyaWNzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgbWV0cmljTmFtZTogYEJDT1MtJHtlbnZpcm9ubWVudH0tV2ViQUNMYCxcbiAgICAgIH0sXG4gICAgICB0YWdzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBrZXk6ICdFbnZpcm9ubWVudCcsXG4gICAgICAgICAgdmFsdWU6IGVudmlyb25tZW50LFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAga2V5OiAnQXBwbGljYXRpb24nLFxuICAgICAgICAgIHZhbHVlOiAnQkNPUycsXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBrZXk6ICdNYW5hZ2VkQnknLFxuICAgICAgICAgIHZhbHVlOiAnQ0RLJyxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyBXQUYgbG9nZ2luZyBjb25maWd1cmF0aW9uXG4gICAgLy8gTG9ncyBhbGwgV0FGIGV2ZW50cyB0byBDbG91ZFdhdGNoIGZvciBzZWN1cml0eSBtb25pdG9yaW5nIGFuZCBjb21wbGlhbmNlXG4gICAgbmV3IHdhZnYyLkNmbkxvZ2dpbmdDb25maWd1cmF0aW9uKHRoaXMsICdXQUZMb2dnaW5nQ29uZmlndXJhdGlvbicsIHtcbiAgICAgIHJlc291cmNlQXJuOiB0aGlzLndlYkFjbC5hdHRyQXJuLFxuICAgICAgbG9nRGVzdGluYXRpb25Db25maWdzOiBbdGhpcy5sb2dHcm91cC5sb2dHcm91cEFybl0sXG4gICAgICAvLyBSZWRhY3Qgc2Vuc2l0aXZlIGZpZWxkcyBmcm9tIGxvZ3MgdG8gY29tcGx5IHdpdGggZGF0YSBwcml2YWN5IHJlcXVpcmVtZW50c1xuICAgICAgcmVkYWN0ZWRGaWVsZHM6IFtcbiAgICAgICAgeyBxdWVyeVN0cmluZzoge30gfSwgLy8gUmVkYWN0IHF1ZXJ5IHBhcmFtZXRlcnMgKG1heSBjb250YWluIHNlbnNpdGl2ZSBkYXRhKVxuICAgICAgICB7IHNpbmdsZUhlYWRlcjogeyBuYW1lOiAnYXV0aG9yaXphdGlvbicgfSB9LCAvLyBSZWRhY3QgYXV0aCBoZWFkZXJzXG4gICAgICAgIHsgc2luZ2xlSGVhZGVyOiB7IG5hbWU6ICdjb29raWUnIH0gfSwgLy8gUmVkYWN0IGNvb2tpZXNcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyBPdXRwdXQgdGhlIFdlYiBBQ0wgQVJOXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1dlYkFDTEFybicsIHtcbiAgICAgIHZhbHVlOiB0aGlzLndlYkFjbC5hdHRyQXJuLFxuICAgICAgZGVzY3JpcHRpb246IGBXQUYgV2ViIEFDTCBBUk4gZm9yICR7ZW52aXJvbm1lbnR9YCxcbiAgICAgIGV4cG9ydE5hbWU6IGBCQ09TLSR7ZW52aXJvbm1lbnR9LVdlYkFDTC1Bcm5gLFxuICAgIH0pO1xuXG4gICAgLy8gT3V0cHV0IHRoZSBXZWIgQUNMIElEXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1dlYkFDTElkJywge1xuICAgICAgdmFsdWU6IHRoaXMud2ViQWNsLmF0dHJJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiBgV0FGIFdlYiBBQ0wgSUQgZm9yICR7ZW52aXJvbm1lbnR9YCxcbiAgICAgIGV4cG9ydE5hbWU6IGBCQ09TLSR7ZW52aXJvbm1lbnR9LVdlYkFDTC1JZGAsXG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogQXNzb2NpYXRlIHRoZSBXZWIgQUNMIHdpdGggYW4gQXBwbGljYXRpb24gTG9hZCBCYWxhbmNlclxuICAgKi9cbiAgcHVibGljIGFzc29jaWF0ZVdpdGhMb2FkQmFsYW5jZXIobG9hZEJhbGFuY2VyQXJuOiBzdHJpbmcpOiB3YWZ2Mi5DZm5XZWJBQ0xBc3NvY2lhdGlvbiB7XG4gICAgcmV0dXJuIG5ldyB3YWZ2Mi5DZm5XZWJBQ0xBc3NvY2lhdGlvbih0aGlzLCAnV2ViQUNMQXNzb2NpYXRpb24nLCB7XG4gICAgICByZXNvdXJjZUFybjogbG9hZEJhbGFuY2VyQXJuLFxuICAgICAgd2ViQWNsQXJuOiB0aGlzLndlYkFjbC5hdHRyQXJuLFxuICAgIH0pO1xuICB9XG59XG4iXX0=