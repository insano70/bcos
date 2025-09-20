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
            logGroupName: `/aws/waf/bcos-${environment}`,
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
        // Enable logging
        new wafv2.CfnLoggingConfiguration(this, 'WAFLoggingConfiguration', {
            resourceArn: this.webAcl.attrArn,
            logDestinationConfigs: [this.logGroup.logGroupArn],
            redactedFields: [
                {
                    singleHeader: {
                        name: 'authorization',
                    },
                },
                {
                    singleHeader: {
                        name: 'cookie',
                    },
                },
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2FmLXByb3RlY3Rpb24uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ3YWYtcHJvdGVjdGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMsNkRBQStDO0FBQy9DLDJEQUE2QztBQUU3QywyQ0FBdUM7QUFtQ3ZDOzs7R0FHRztBQUNILE1BQWEsYUFBYyxTQUFRLHNCQUFTO0lBQzFCLE1BQU0sQ0FBa0I7SUFDeEIsUUFBUSxDQUFnQjtJQUV4QyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQXlCO1FBQ2pFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsTUFBTSxFQUNKLFdBQVcsRUFDWCxNQUFNLEVBQ04sY0FBYyxHQUFHLFdBQVcsS0FBSyxZQUFZLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUMzRCxpQkFBaUIsR0FBRyxLQUFLLEVBQ3pCLGdCQUFnQixHQUFHLEVBQUUsRUFDckIsa0JBQWtCLEdBQUcsV0FBVyxLQUFLLFlBQVksR0FDbEQsR0FBRyxLQUFLLENBQUM7UUFFViwwRUFBMEU7UUFDMUUsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLGFBQWEsRUFBRTtZQUNyRCxZQUFZLEVBQUUsaUJBQWlCLFdBQVcsRUFBRTtZQUM1QyxTQUFTLEVBQUUsV0FBVyxLQUFLLFlBQVksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsU0FBUztZQUN4RyxhQUFhLEVBQUUsR0FBRyxDQUFDLGFBQWEsQ0FBQyxNQUFNO1NBQ3hDLENBQUMsQ0FBQztRQUVILHdCQUF3QjtRQUN4QixNQUFNLEtBQUssR0FBbUMsRUFBRSxDQUFDO1FBQ2pELElBQUksUUFBUSxHQUFH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RUFBRSxlQUFlO3FCQUN0QjtpQkFDRjtnQkFDRDtvQkFDRSxZQUFZLEVBQUU7d0JBQ1osSUFBSSxFQUFFLFFBQVE7cUJBQ2Y7aUJBQ0Y7YUFDRjtTQUNGLENBQUMsQ0FBQztRQUVILHlCQUF5QjtRQUN6QixJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLFdBQVcsRUFBRTtZQUNuQyxLQUFLLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPO1lBQzFCLFdBQVcsRUFBRSx1QkFBdUIsV0FBVyxFQUFFO1lBQ2pELFVBQVUsRUFBRSxRQUFRLFdBQVcsYUFBYTtTQUM3QyxDQUFDLENBQUM7UUFFSCx3QkFBd0I7UUFDeEIsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxVQUFVLEVBQUU7WUFDbEMsS0FBSyxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTTtZQUN6QixXQUFXLEVBQUUsc0JBQXNCLFdBQVcsRUFBRTtZQUNoRCxVQUFVLEVBQUUsUUFBUSxXQUFXLFlBQVk7U0FDNUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVEOztPQUVHO0lBQ0kseUJBQXlCLENBQUMsZUFBdUI7UUFDdEQsT0FBTyxJQUFJLEtBQUssQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLEVBQUUsbUJBQW1CLEVBQUU7WUFDL0QsV0FBVyxFQUFFLGVBQWU7WUFDNUIsU0FBUyxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTztTQUMvQixDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUExUEQsc0NBMFBDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIHdhZnYyIGZyb20gJ2F3cy1jZGstbGliL2F3cy13YWZ2Mic7XG5pbXBvcnQgKiBhcyBsb2dzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sb2dzJztcbmltcG9ydCAqIGFzIGttcyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mta21zJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFdhZlByb3RlY3Rpb25Qcm9wcyB7XG4gIC8qKlxuICAgKiBFbnZpcm9ubWVudCBuYW1lIChzdGFnaW5nIG9yIHByb2R1Y3Rpb24pXG4gICAqL1xuICBlbnZpcm9ubWVudDogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBLTVMga2V5IGZvciBsb2cgZW5jcnlwdGlvblxuICAgKi9cbiAga21zS2V5OiBrbXMuSUtleTtcblxuICAvKipcbiAgICogUmF0ZSBsaW1pdCBwZXIgSVAgYWRkcmVzcyAocmVxdWVzdHMgcGVyIDUgbWludXRlcylcbiAgICogRGVmYXVsdDogMTAwMCBmb3IgcHJvZHVjdGlvbiwgMjAwMCBmb3Igc3RhZ2luZ1xuICAgKi9cbiAgcmF0ZUxpbWl0UGVySVA/OiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIEVuYWJsZSBnZW8tYmxvY2tpbmcgKGRlZmF1bHQ6IGZhbHNlKVxuICAgKi9cbiAgZW5hYmxlR2VvQmxvY2tpbmc/OiBib29sZWFuO1xuXG4gIC8qKlxuICAgKiBMaXN0IG9mIGNvdW50cnkgY29kZXMgdG8gYmxvY2sgKGlmIGdlby1ibG9ja2luZyBlbmFibGVkKVxuICAgKi9cbiAgYmxvY2tlZENvdW50cmllcz86IHN0cmluZ1tdO1xuXG4gIC8qKlxuICAgKiBFbmFibGUgYWRkaXRpb25hbCBtYW5hZ2VkIHJ1bGVzIChkZWZhdWx0OiB0cnVlIGZvciBwcm9kdWN0aW9uKVxuICAgKi9cbiAgZW5hYmxlTWFuYWdlZFJ1bGVzPzogYm9vbGVhbjtcbn1cblxuLyoqXG4gKiBXQUYgcHJvdGVjdGlvbiBjb25zdHJ1Y3QgdGhhdCBjcmVhdGVzIGEgV2ViIEFDTCB3aXRoIHNlY3VyaXR5IHJ1bGVzXG4gKiB0byBwcm90ZWN0IHRoZSBhcHBsaWNhdGlvbiBmcm9tIGNvbW1vbiB3ZWIgYXR0YWNrc1xuICovXG5leHBvcnQgY2xhc3MgV2FmUHJvdGVjdGlvbiBleHRlbmRzIENvbnN0cnVjdCB7XG4gIHB1YmxpYyByZWFkb25seSB3ZWJBY2w6IHdhZnYyLkNmbldlYkFDTDtcbiAgcHVibGljIHJlYWRvbmx5IGxvZ0dyb3VwOiBsb2dzLkxvZ0dyb3VwO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBXYWZQcm90ZWN0aW9uUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgY29uc3Qge1xuICAgICAgZW52aXJvbm1lbnQsXG4gICAgICBrbXNLZXksXG4gICAgICByYXRlTGltaXRQZXJJUCA9IGVudmlyb25tZW50ID09PSAncHJvZHVjdGlvbicgPyAxMDAwIDogMjAwMCxcbiAgICAgIGVuYWJsZUdlb0Jsb2NraW5nID0gZmFsc2UsXG4gICAgICBibG9ja2VkQ291bnRyaWVzID0gW10sXG4gICAgICBlbmFibGVNYW5hZ2VkUnVsZXMgPSBlbnZpcm9ubWVudCA9PT0gJ3Byb2R1Y3Rpb24nLFxuICAgIH0gPSBwcm9wcztcblxuICAgIC8vIENyZWF0ZSBDbG91ZFdhdGNoIGxvZyBncm91cCBmb3IgV0FGIGxvZ3MgKHVzaW5nIEFXUyBtYW5hZ2VkIGVuY3J5cHRpb24pXG4gICAgdGhpcy5sb2dHcm91cCA9IG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsICdXQUZMb2dHcm91cCcsIHtcbiAgICAgIGxvZ0dyb3VwTmFtZTogYC9hd3Mvd2FmL2Jjb3MtJHtlbnZpcm9ubWVudH1gLFxuICAgICAgcmV0ZW50aW9uOiBlbnZpcm9ubWVudCA9PT0gJ3Byb2R1Y3Rpb24nID8gbG9ncy5SZXRlbnRpb25EYXlzLlRIUkVFX01PTlRIUyA6IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfTU9OVEgsXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4sXG4gICAgfSk7XG5cbiAgICAvLyBCdWlsZCBXQUYgcnVsZXMgYXJyYXlcbiAgICBjb25zdCBydWxlczogd2FmdjIuQ2ZuV2ViQUNMLlJ1bGVQcm9wZXJ0eVtdID0gW107XG4gICAgbGV0IHByaW9yaXR5ID0gMTtcblxuICAgIC8vIEFXUyBNYW5hZ2VkIENvcmUgUnVsZSBTZXQgKE9XQVNQIFRvcCAxMClcbiAgICBpZiAoZW5hYmxlTWFuYWdlZFJ1bGVzKSB7XG4gICAgICBydWxlcy5wdXNoKHtcbiAgICAgICAgbmFtZTogJ0FXUy1BV1NNYW5hZ2VkUnVsZXNDb21tb25SdWxlU2V0JyxcbiAgICAgICAgcHJpb3JpdHk6IHByaW9yaXR5KyssXG4gICAgICAgIG92ZXJyaWRlQWN0aW9uOiB7IG5vbmU6IHt9IH0sXG4gICAgICAgIHN0YXRlbWVudDoge1xuICAgICAgICAgIG1hbmFnZWRSdWxlR3JvdXBTdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgIHZlbmRvck5hbWU6ICdBV1MnLFxuICAgICAgICAgICAgbmFtZTogJ0FXU01hbmFnZWRSdWxlc0NvbW1vblJ1bGVTZXQnLFxuICAgICAgICAgICAgLy8gRXhjbHVkZSBzcGVjaWZpYyBydWxlcyBpZiBuZWVkZWRcbiAgICAgICAgICAgIGV4Y2x1ZGVkUnVsZXM6IFtdLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIHZpc2liaWxpdHlDb25maWc6IHtcbiAgICAgICAgICBzYW1wbGVkUmVxdWVzdHNFbmFibGVkOiB0cnVlLFxuICAgICAgICAgIGNsb3VkV2F0Y2hNZXRyaWNzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICBtZXRyaWNOYW1lOiBgQ29tbW9uUnVsZVNldC0ke2Vudmlyb25tZW50fWAsXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgICAgLy8gQVdTIE1hbmFnZWQgS25vd24gQmFkIElucHV0cyBSdWxlIFNldFxuICAgICAgcnVsZXMucHVzaCh7XG4gICAgICAgIG5hbWU6ICdBV1MtQVdTTWFuYWdlZFJ1bGVzS25vd25CYWRJbnB1dHNSdWxlU2V0JyxcbiAgICAgICAgcHJpb3JpdHk6IHByaW9yaXR5KyssXG4gICAgICAgIG92ZXJyaWRlQWN0aW9uOiB7IG5vbmU6IHt9IH0sXG4gICAgICAgIHN0YXRlbWVudDoge1xuICAgICAgICAgIG1hbmFnZWRSdWxlR3JvdXBTdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgIHZlbmRvck5hbWU6ICdBV1MnLFxuICAgICAgICAgICAgbmFtZTogJ0FXU01hbmFnZWRSdWxlc0tub3duQmFkSW5wdXRzUnVsZVNldCcsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgdmlzaWJpbGl0eUNvbmZpZzoge1xuICAgICAgICAgIHNhbXBsZWRSZXF1ZXN0c0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgY2xvdWRXYXRjaE1ldHJpY3NFbmFibGVkOiB0cnVlLFxuICAgICAgICAgIG1ldHJpY05hbWU6IGBLbm93bkJhZElucHV0cy0ke2Vudmlyb25tZW50fWAsXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgICAgLy8gQVdTIE1hbmFnZWQgT1dBU1AgVG9wIDEwIFJ1bGUgU2V0IChwcm9kdWN0aW9uIG9ubHkpXG4gICAgICBpZiAoZW52aXJvbm1lbnQgPT09ICdwcm9kdWN0aW9uJykge1xuICAgICAgICBydWxlcy5wdXNoKHtcbiAgICAgICAgICBuYW1lOiAnQVdTLUFXU01hbmFnZWRSdWxlc09XQVNQVG9wVGVuUnVsZVNldCcsXG4gICAgICAgICAgcHJpb3JpdHk6IHByaW9yaXR5KyssXG4gICAgICAgICAgb3ZlcnJpZGVBY3Rpb246IHsgbm9uZToge30gfSxcbiAgICAgICAgICBzdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgIG1hbmFnZWRSdWxlR3JvdXBTdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgICAgdmVuZG9yTmFtZTogJ0FXUycsXG4gICAgICAgICAgICAgIG5hbWU6ICdBV1NNYW5hZ2VkUnVsZXNPV0FTUFRvcFRlblJ1bGVTZXQnLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIHZpc2liaWxpdHlDb25maWc6IHtcbiAgICAgICAgICAgIHNhbXBsZWRSZXF1ZXN0c0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgICBjbG91ZFdhdGNoTWV0cmljc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgICBtZXRyaWNOYW1lOiBgT1dBU1BUb3BUZW4tJHtlbnZpcm9ubWVudH1gLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFJhdGUgbGltaXRpbmcgcnVsZVxuICAgIHJ1bGVzLnB1c2goe1xuICAgICAgbmFtZTogYFJhdGVMaW1pdFJ1bGUtJHtlbnZpcm9ubWVudH1gLFxuICAgICAgcHJpb3JpdHk6IHByaW9yaXR5KyssXG4gICAgICBhY3Rpb246IHsgYmxvY2s6IHt9IH0sXG4gICAgICBzdGF0ZW1lbnQ6IHtcbiAgICAgICAgcmF0ZUJhc2VkU3RhdGVtZW50OiB7XG4gICAgICAgICAgbGltaXQ6IHJhdGVMaW1pdFBlcklQLFxuICAgICAgICAgIGFnZ3JlZ2F0ZUtleVR5cGU6ICdJUCcsXG4gICAgICAgICAgc2NvcGVEb3duU3RhdGVtZW50OiB7XG4gICAgICAgICAgICBub3RTdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgICAgc3RhdGVtZW50OiB7XG4gICAgICAgICAgICAgICAgYnl0ZU1hdGNoU3RhdGVtZW50OiB7XG4gICAgICAgICAgICAgICAgICBzZWFyY2hTdHJpbmc6ICcvaGVhbHRoJyxcbiAgICAgICAgICAgICAgICAgIGZpZWxkVG9NYXRjaDogeyB1cmlQYXRoOiB7fSB9LFxuICAgICAgICAgICAgICAgICAgdGV4dFRyYW5zZm9ybWF0aW9uczogW1xuICAgICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICAgcHJpb3JpdHk6IDAsXG4gICAgICAgICAgICAgICAgICAgICAgdHlwZTogJ0xPV0VSQ0FTRScsXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICAgICAgcG9zaXRpb25hbENvbnN0cmFpbnQ6ICdTVEFSVFNfV0lUSCcsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICB2aXNpYmlsaXR5Q29uZmlnOiB7XG4gICAgICAgIHNhbXBsZWRSZXF1ZXN0c0VuYWJsZWQ6IHRydWUsXG4gICAgICAgIGNsb3VkV2F0Y2hNZXRyaWNzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgbWV0cmljTmFtZTogYFJhdGVMaW1pdC0ke2Vudmlyb25tZW50fWAsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gR2VvZ3JhcGhpYyBibG9ja2luZyBydWxlIChpZiBlbmFibGVkKVxuICAgIGlmIChlbmFibGVHZW9CbG9ja2luZyAmJiBibG9ja2VkQ291bnRyaWVzLmxlbmd0aCA+IDApIHtcbiAgICAgIHJ1bGVzLnB1c2goe1xuICAgICAgICBuYW1lOiBgR2VvQmxvY2tSdWxlLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgICAgcHJpb3JpdHk6IHByaW9yaXR5KyssXG4gICAgICAgIGFjdGlvbjogeyBibG9jazoge30gfSxcbiAgICAgICAgc3RhdGVtZW50OiB7XG4gICAgICAgICAgZ2VvTWF0Y2hTdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgIGNvdW50cnlDb2RlczogYmxvY2tlZENvdW50cmllcyxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICB2aXNpYmlsaXR5Q29uZmlnOiB7XG4gICAgICAgICAgc2FtcGxlZFJlcXVlc3RzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICBjbG91ZFdhdGNoTWV0cmljc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgbWV0cmljTmFtZTogYEdlb0Jsb2NrLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIEN1c3RvbSBydWxlIGZvciBBUEkgYWJ1c2UgcHJvdGVjdGlvblxuICAgIGlmIChlbnZpcm9ubWVudCA9PT0gJ3Byb2R1Y3Rpb24nKSB7XG4gICAgICBydWxlcy5wdXNoKHtcbiAgICAgICAgbmFtZTogYEFQSUFidXNlUHJvdGVjdGlvbi0ke2Vudmlyb25tZW50fWAsXG4gICAgICAgIHByaW9yaXR5OiBwcmlvcml0eSsrLFxuICAgICAgICBhY3Rpb246IHsgYmxvY2s6IHt9IH0sXG4gICAgICAgIHN0YXRlbWVudDoge1xuICAgICAgICAgIGFuZFN0YXRlbWVudDoge1xuICAgICAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgYnl0ZU1hdGNoU3RhdGVtZW50OiB7XG4gICAgICAgICAgICAgICAgICBzZWFyY2hTdHJpbmc6ICcvYXBpLycsXG4gICAgICAgICAgICAgICAgICBmaWVsZFRvTWF0Y2g6IHsgdXJpUGF0aDoge30gfSxcbiAgICAgICAgICAgICAgICAgIHRleHRUcmFuc2Zvcm1hdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgIHByaW9yaXR5OiAwLFxuICAgICAgICAgICAgICAgICAgICAgIHR5cGU6ICdMT1dFUkNBU0UnLFxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgICAgIHBvc2l0aW9uYWxDb25zdHJhaW50OiAnU1RBUlRTX1dJVEgnLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICByYXRlQmFzZWRTdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgICAgICAgIGxpbWl0OiA1MDAsIC8vIE1vcmUgcmVzdHJpY3RpdmUgZm9yIEFQSSBlbmRwb2ludHNcbiAgICAgICAgICAgICAgICAgIGFnZ3JlZ2F0ZUtleVR5cGU6ICdJUCcsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgdmlzaWJpbGl0eUNvbmZpZzoge1xuICAgICAgICAgIHNhbXBsZWRSZXF1ZXN0c0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgY2xvdWRXYXRjaE1ldHJpY3NFbmFibGVkOiB0cnVlLFxuICAgICAgICAgIG1ldHJpY05hbWU6IGBBUElBYnVzZVByb3RlY3Rpb24tJHtlbnZpcm9ubWVudH1gLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gQ3JlYXRlIHRoZSBXZWIgQUNMXG4gICAgdGhpcy53ZWJBY2wgPSBuZXcgd2FmdjIuQ2ZuV2ViQUNMKHRoaXMsICdXZWJBQ0wnLCB7XG4gICAgICBzY29wZTogJ1JFR0lPTkFMJyxcbiAgICAgIGRlZmF1bHRBY3Rpb246IHsgYWxsb3c6IHt9IH0sXG4gICAgICBuYW1lOiBgQkNPUy0ke2Vudmlyb25tZW50fS1XZWJBQ0xgLFxuICAgICAgZGVzY3JpcHRpb246IGBXQUYgcHJvdGVjdGlvbiBmb3IgQkNPUyAke2Vudmlyb25tZW50fSBlbnZpcm9ubWVudGAsXG4gICAgICBydWxlczogcnVsZXMsXG4gICAgICB2aXNpYmlsaXR5Q29uZmlnOiB7XG4gICAgICAgIHNhbXBsZWRSZXF1ZXN0c0VuYWJsZWQ6IHRydWUsXG4gICAgICAgIGNsb3VkV2F0Y2hNZXRyaWNzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgbWV0cmljTmFtZTogYEJDT1MtJHtlbnZpcm9ubWVudH0tV2ViQUNMYCxcbiAgICAgIH0sXG4gICAgICB0YWdzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBrZXk6ICdFbnZpcm9ubWVudCcsXG4gICAgICAgICAgdmFsdWU6IGVudmlyb25tZW50LFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAga2V5OiAnQXBwbGljYXRpb24nLFxuICAgICAgICAgIHZhbHVlOiAnQkNPUycsXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBrZXk6ICdNYW5hZ2VkQnknLFxuICAgICAgICAgIHZhbHVlOiAnQ0RLJyxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyBFbmFibGUgbG9nZ2luZ1xuICAgIG5ldyB3YWZ2Mi5DZm5Mb2dnaW5nQ29uZmlndXJhdGlvbih0aGlzLCAnV0FGTG9nZ2luZ0NvbmZpZ3VyYXRpb24nLCB7XG4gICAgICByZXNvdXJjZUFybjogdGhpcy53ZWJBY2wuYXR0ckFybixcbiAgICAgIGxvZ0Rlc3RpbmF0aW9uQ29uZmlnczogW3RoaXMubG9nR3JvdXAubG9nR3JvdXBBcm5dLFxuICAgICAgcmVkYWN0ZWRGaWVsZHM6IFtcbiAgICAgICAge1xuICAgICAgICAgIHNpbmdsZUhlYWRlcjoge1xuICAgICAgICAgICAgbmFtZTogJ2F1dGhvcml6YXRpb24nLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBzaW5nbGVIZWFkZXI6IHtcbiAgICAgICAgICAgIG5hbWU6ICdjb29raWUnLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gT3V0cHV0IHRoZSBXZWIgQUNMIEFSTlxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdXZWJBQ0xBcm4nLCB7XG4gICAgICB2YWx1ZTogdGhpcy53ZWJBY2wuYXR0ckFybixcbiAgICAgIGRlc2NyaXB0aW9uOiBgV0FGIFdlYiBBQ0wgQVJOIGZvciAke2Vudmlyb25tZW50fWAsXG4gICAgICBleHBvcnROYW1lOiBgQkNPUy0ke2Vudmlyb25tZW50fS1XZWJBQ0wtQXJuYCxcbiAgICB9KTtcblxuICAgIC8vIE91dHB1dCB0aGUgV2ViIEFDTCBJRFxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdXZWJBQ0xJZCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLndlYkFjbC5hdHRySWQsXG4gICAgICBkZXNjcmlwdGlvbjogYFdBRiBXZWIgQUNMIElEIGZvciAke2Vudmlyb25tZW50fWAsXG4gICAgICBleHBvcnROYW1lOiBgQkNPUy0ke2Vudmlyb25tZW50fS1XZWJBQ0wtSWRgLFxuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIEFzc29jaWF0ZSB0aGUgV2ViIEFDTCB3aXRoIGFuIEFwcGxpY2F0aW9uIExvYWQgQmFsYW5jZXJcbiAgICovXG4gIHB1YmxpYyBhc3NvY2lhdGVXaXRoTG9hZEJhbGFuY2VyKGxvYWRCYWxhbmNlckFybjogc3RyaW5nKTogd2FmdjIuQ2ZuV2ViQUNMQXNzb2NpYXRpb24ge1xuICAgIHJldHVybiBuZXcgd2FmdjIuQ2ZuV2ViQUNMQXNzb2NpYXRpb24odGhpcywgJ1dlYkFDTEFzc29jaWF0aW9uJywge1xuICAgICAgcmVzb3VyY2VBcm46IGxvYWRCYWxhbmNlckFybixcbiAgICAgIHdlYkFjbEFybjogdGhpcy53ZWJBY2wuYXR0ckFybixcbiAgICB9KTtcbiAgfVxufVxuIl19