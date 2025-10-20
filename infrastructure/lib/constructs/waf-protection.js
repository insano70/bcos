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
        // WAF logging configuration using custom resource
        // This handles the AWS limitation where only one logging config per WebACL is allowed
        // by using PutLoggingConfiguration which creates OR updates the config
        const { WafLoggingConfig } = require('./waf-logging-config');
        new WafLoggingConfig(this, 'WAFLoggingConfiguration', {
            webAclArn: this.webAcl.attrArn,
            logGroupArn: this.logGroup.logGroupArn,
            redactedFields: [
                { queryString: {} }, // Redact query parameters (may contain sensitive data)
                { singleHeader: { Name: 'authorization' } }, // Redact auth headers
                { singleHeader: { Name: 'cookie' } }, // Redact cookies
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2FmLXByb3RlY3Rpb24uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ3YWYtcHJvdGVjdGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMsNkRBQStDO0FBQy9DLDJEQUE2QztBQUU3QywyQ0FBdUM7QUFtQ3ZDOzs7R0FHRztBQUNILE1BQWEsYUFBYyxTQUFRLHNCQUFTO0lBQzFCLE1BQU0sQ0FBa0I7SUFDeEIsUUFBUSxDQUFnQjtJQUV4QyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQXlCO1FBQ2pFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsTUFBTSxFQUNKLFdBQVcsRUFDWCxNQUFNLEVBQ04sY0FBYyxHQUFHLFdBQVcsS0FBSyxZQUFZLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUMzRCxpQkFBaUIsR0FBRyxLQUFLLEVBQ3pCLGdCQUFnQixHQUFHLEVBQUUsRUFDckIsa0JBQWtCLEdBQUcsV0FBVyxLQUFLLFlBQVksR0FDbEQsR0FBRyxLQUFLLENBQUM7UUFFViwwRUFBMEU7UUFDMUUsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLGFBQWEsRUFBRTtZQUNyRCxZQUFZLEVBQUUsaUJBQWlCLFdBQVcsSUFBSSxJQUFJLENBQUMsR0FBRyxFQUFFLEVBQUU7WUFDMUQsU0FBUyxFQUFFLFdBQVcsS0FBSyxZQUFZLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLFNBQVM7WUFDeEcsYUFBYSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsTUFBTTtTQUN4QyxDQUFDLENBQUM7UUFFSCx3QkFBd0I7UUFDeEIsTUFBTSxLQUFLLEdBQW1DLEVBQUUs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QUM5QixXQUFXLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxXQUFXO1lBQ3RDLGNBQWMsRUFBRTtnQkFDZCxFQUFFLFdBQVcsRUFBRSxFQUFFLEVBQUUsRUFBRSx1REFBdUQ7Z0JBQzVFLEVBQUUsWUFBWSxFQUFFLEVBQUUsSUFBSSxFQUFFLGVBQWUsRUFBRSxFQUFFLEVBQUUsc0JBQXNCO2dCQUNuRSxFQUFFLFlBQVksRUFBRSxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsRUFBRSxFQUFFLGlCQUFpQjthQUN4RDtTQUNGLENBQUMsQ0FBQztRQUVILHlCQUF5QjtRQUN6QixJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLFdBQVcsRUFBRTtZQUNuQyxLQUFLLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPO1lBQzFCLFdBQVcsRUFBRSx1QkFBdUIsV0FBVyxFQUFFO1lBQ2pELFVBQVUsRUFBRSxRQUFRLFdBQVcsYUFBYTtTQUM3QyxDQUFDLENBQUM7UUFFSCx3QkFBd0I7UUFDeEIsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxVQUFVLEVBQUU7WUFDbEMsS0FBSyxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTTtZQUN6QixXQUFXLEVBQUUsc0JBQXNCLFdBQVcsRUFBRTtZQUNoRCxVQUFVLEVBQUUsUUFBUSxXQUFXLFlBQVk7U0FDNUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVEOztPQUVHO0lBQ0kseUJBQXlCLENBQUMsZUFBdUI7UUFDdEQsT0FBTyxJQUFJLEtBQUssQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLEVBQUUsbUJBQW1CLEVBQUU7WUFDL0QsV0FBVyxFQUFFLGVBQWU7WUFDNUIsU0FBUyxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTztTQUMvQixDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUF2UEQsc0NBdVBDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIHdhZnYyIGZyb20gJ2F3cy1jZGstbGliL2F3cy13YWZ2Mic7XG5pbXBvcnQgKiBhcyBsb2dzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sb2dzJztcbmltcG9ydCAqIGFzIGttcyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mta21zJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFdhZlByb3RlY3Rpb25Qcm9wcyB7XG4gIC8qKlxuICAgKiBFbnZpcm9ubWVudCBuYW1lIChzdGFnaW5nIG9yIHByb2R1Y3Rpb24pXG4gICAqL1xuICBlbnZpcm9ubWVudDogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBLTVMga2V5IGZvciBsb2cgZW5jcnlwdGlvblxuICAgKi9cbiAga21zS2V5OiBrbXMuSUtleTtcblxuICAvKipcbiAgICogUmF0ZSBsaW1pdCBwZXIgSVAgYWRkcmVzcyAocmVxdWVzdHMgcGVyIDUgbWludXRlcylcbiAgICogRGVmYXVsdDogMTAwMCBmb3IgcHJvZHVjdGlvbiwgMjAwMCBmb3Igc3RhZ2luZ1xuICAgKi9cbiAgcmF0ZUxpbWl0UGVySVA/OiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIEVuYWJsZSBnZW8tYmxvY2tpbmcgKGRlZmF1bHQ6IGZhbHNlKVxuICAgKi9cbiAgZW5hYmxlR2VvQmxvY2tpbmc/OiBib29sZWFuO1xuXG4gIC8qKlxuICAgKiBMaXN0IG9mIGNvdW50cnkgY29kZXMgdG8gYmxvY2sgKGlmIGdlby1ibG9ja2luZyBlbmFibGVkKVxuICAgKi9cbiAgYmxvY2tlZENvdW50cmllcz86IHN0cmluZ1tdO1xuXG4gIC8qKlxuICAgKiBFbmFibGUgYWRkaXRpb25hbCBtYW5hZ2VkIHJ1bGVzIChkZWZhdWx0OiB0cnVlIGZvciBwcm9kdWN0aW9uKVxuICAgKi9cbiAgZW5hYmxlTWFuYWdlZFJ1bGVzPzogYm9vbGVhbjtcbn1cblxuLyoqXG4gKiBXQUYgcHJvdGVjdGlvbiBjb25zdHJ1Y3QgdGhhdCBjcmVhdGVzIGEgV2ViIEFDTCB3aXRoIHNlY3VyaXR5IHJ1bGVzXG4gKiB0byBwcm90ZWN0IHRoZSBhcHBsaWNhdGlvbiBmcm9tIGNvbW1vbiB3ZWIgYXR0YWNrc1xuICovXG5leHBvcnQgY2xhc3MgV2FmUHJvdGVjdGlvbiBleHRlbmRzIENvbnN0cnVjdCB7XG4gIHB1YmxpYyByZWFkb25seSB3ZWJBY2w6IHdhZnYyLkNmbldlYkFDTDtcbiAgcHVibGljIHJlYWRvbmx5IGxvZ0dyb3VwOiBsb2dzLkxvZ0dyb3VwO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBXYWZQcm90ZWN0aW9uUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgY29uc3Qge1xuICAgICAgZW52aXJvbm1lbnQsXG4gICAgICBrbXNLZXksXG4gICAgICByYXRlTGltaXRQZXJJUCA9IGVudmlyb25tZW50ID09PSAncHJvZHVjdGlvbicgPyAxMDAwIDogMjAwMCxcbiAgICAgIGVuYWJsZUdlb0Jsb2NraW5nID0gZmFsc2UsXG4gICAgICBibG9ja2VkQ291bnRyaWVzID0gW10sXG4gICAgICBlbmFibGVNYW5hZ2VkUnVsZXMgPSBlbnZpcm9ubWVudCA9PT0gJ3Byb2R1Y3Rpb24nLFxuICAgIH0gPSBwcm9wcztcblxuICAgIC8vIENyZWF0ZSBDbG91ZFdhdGNoIGxvZyBncm91cCBmb3IgV0FGIGxvZ3MgKHVzaW5nIEFXUyBtYW5hZ2VkIGVuY3J5cHRpb24pXG4gICAgdGhpcy5sb2dHcm91cCA9IG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsICdXQUZMb2dHcm91cCcsIHtcbiAgICAgIGxvZ0dyb3VwTmFtZTogYC9hd3Mvd2FmL2Jjb3MtJHtlbnZpcm9ubWVudH0tJHtEYXRlLm5vdygpfWAsXG4gICAgICByZXRlbnRpb246IGVudmlyb25tZW50ID09PSAncHJvZHVjdGlvbicgPyBsb2dzLlJldGVudGlvbkRheXMuVEhSRUVfTU9OVEhTIDogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9NT05USCxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTixcbiAgICB9KTtcblxuICAgIC8vIEJ1aWxkIFdBRiBydWxlcyBhcnJheVxuICAgIGNvbnN0IHJ1bGVzOiB3YWZ2Mi5DZm5XZWJBQ0wuUnVsZVByb3BlcnR5W10gPSBbXTtcbiAgICBsZXQgcHJpb3JpdHkgPSAxO1xuXG4gICAgLy8gQVdTIE1hbmFnZWQgQ29yZSBSdWxlIFNldCAoT1dBU1AgVG9wIDEwKVxuICAgIGlmIChlbmFibGVNYW5hZ2VkUnVsZXMpIHtcbiAgICAgIHJ1bGVzLnB1c2goe1xuICAgICAgICBuYW1lOiAnQVdTLUFXU01hbmFnZWRSdWxlc0NvbW1vblJ1bGVTZXQnLFxuICAgICAgICBwcmlvcml0eTogcHJpb3JpdHkrKyxcbiAgICAgICAgb3ZlcnJpZGVBY3Rpb246IHsgbm9uZToge30gfSxcbiAgICAgICAgc3RhdGVtZW50OiB7XG4gICAgICAgICAgbWFuYWdlZFJ1bGVHcm91cFN0YXRlbWVudDoge1xuICAgICAgICAgICAgdmVuZG9yTmFtZTogJ0FXUycsXG4gICAgICAgICAgICBuYW1lOiAnQVdTTWFuYWdlZFJ1bGVzQ29tbW9uUnVsZVNldCcsXG4gICAgICAgICAgICAvLyBFeGNsdWRlIHNwZWNpZmljIHJ1bGVzIGlmIG5lZWRlZFxuICAgICAgICAgICAgZXhjbHVkZWRSdWxlczogW10sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgdmlzaWJpbGl0eUNvbmZpZzoge1xuICAgICAgICAgIHNhbXBsZWRSZXF1ZXN0c0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgY2xvdWRXYXRjaE1ldHJpY3NFbmFibGVkOiB0cnVlLFxuICAgICAgICAgIG1ldHJpY05hbWU6IGBDb21tb25SdWxlU2V0LSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBBV1MgTWFuYWdlZCBLbm93biBCYWQgSW5wdXRzIFJ1bGUgU2V0XG4gICAgICBydWxlcy5wdXNoKHtcbiAgICAgICAgbmFtZTogJ0FXUy1BV1NNYW5hZ2VkUnVsZXNLbm93bkJhZElucHV0c1J1bGVTZXQnLFxuICAgICAgICBwcmlvcml0eTogcHJpb3JpdHkrKyxcbiAgICAgICAgb3ZlcnJpZGVBY3Rpb246IHsgbm9uZToge30gfSxcbiAgICAgICAgc3RhdGVtZW50OiB7XG4gICAgICAgICAgbWFuYWdlZFJ1bGVHcm91cFN0YXRlbWVudDoge1xuICAgICAgICAgICAgdmVuZG9yTmFtZTogJ0FXUycsXG4gICAgICAgICAgICBuYW1lOiAnQVdTTWFuYWdlZFJ1bGVzS25vd25CYWRJbnB1dHNSdWxlU2V0JyxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICB2aXNpYmlsaXR5Q29uZmlnOiB7XG4gICAgICAgICAgc2FtcGxlZFJlcXVlc3RzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICBjbG91ZFdhdGNoTWV0cmljc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgbWV0cmljTmFtZTogYEtub3duQmFkSW5wdXRzLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBBV1MgTWFuYWdlZCBPV0FTUCBUb3AgMTAgUnVsZSBTZXQgKHByb2R1Y3Rpb24gb25seSlcbiAgICAgIGlmIChlbnZpcm9ubWVudCA9PT0gJ3Byb2R1Y3Rpb24nKSB7XG4gICAgICAgIHJ1bGVzLnB1c2goe1xuICAgICAgICAgIG5hbWU6ICdBV1MtQVdTTWFuYWdlZFJ1bGVzT1dBU1BUb3BUZW5SdWxlU2V0JyxcbiAgICAgICAgICBwcmlvcml0eTogcHJpb3JpdHkrKyxcbiAgICAgICAgICBvdmVycmlkZUFjdGlvbjogeyBub25lOiB7fSB9LFxuICAgICAgICAgIHN0YXRlbWVudDoge1xuICAgICAgICAgICAgbWFuYWdlZFJ1bGVHcm91cFN0YXRlbWVudDoge1xuICAgICAgICAgICAgICB2ZW5kb3JOYW1lOiAnQVdTJyxcbiAgICAgICAgICAgICAgbmFtZTogJ0FXU01hbmFnZWRSdWxlc09XQVNQVG9wVGVuUnVsZVNldCcsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgICAgdmlzaWJpbGl0eUNvbmZpZzoge1xuICAgICAgICAgICAgc2FtcGxlZFJlcXVlc3RzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICAgIGNsb3VkV2F0Y2hNZXRyaWNzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICAgIG1ldHJpY05hbWU6IGBPV0FTUFRvcFRlbi0ke2Vudmlyb25tZW50fWAsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gUmF0ZSBsaW1pdGluZyBydWxlXG4gICAgcnVsZXMucHVzaCh7XG4gICAgICBuYW1lOiBgUmF0ZUxpbWl0UnVsZS0ke2Vudmlyb25tZW50fWAsXG4gICAgICBwcmlvcml0eTogcHJpb3JpdHkrKyxcbiAgICAgIGFjdGlvbjogeyBibG9jazoge30gfSxcbiAgICAgIHN0YXRlbWVudDoge1xuICAgICAgICByYXRlQmFzZWRTdGF0ZW1lbnQ6IHtcbiAgICAgICAgICBsaW1pdDogcmF0ZUxpbWl0UGVySVAsXG4gICAgICAgICAgYWdncmVnYXRlS2V5VHlwZTogJ0lQJyxcbiAgICAgICAgICBzY29wZURvd25TdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgIG5vdFN0YXRlbWVudDoge1xuICAgICAgICAgICAgICBzdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgICAgICBieXRlTWF0Y2hTdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgICAgICAgIHNlYXJjaFN0cmluZzogJy9oZWFsdGgnLFxuICAgICAgICAgICAgICAgICAgZmllbGRUb01hdGNoOiB7IHVyaVBhdGg6IHt9IH0sXG4gICAgICAgICAgICAgICAgICB0ZXh0VHJhbnNmb3JtYXRpb25zOiBbXG4gICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICBwcmlvcml0eTogMCxcbiAgICAgICAgICAgICAgICAgICAgICB0eXBlOiAnTE9XRVJDQVNFJyxcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgICAgICBwb3NpdGlvbmFsQ29uc3RyYWludDogJ1NUQVJUU19XSVRIJyxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIHZpc2liaWxpdHlDb25maWc6IHtcbiAgICAgICAgc2FtcGxlZFJlcXVlc3RzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgY2xvdWRXYXRjaE1ldHJpY3NFbmFibGVkOiB0cnVlLFxuICAgICAgICBtZXRyaWNOYW1lOiBgUmF0ZUxpbWl0LSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBHZW9ncmFwaGljIGJsb2NraW5nIHJ1bGUgKGlmIGVuYWJsZWQpXG4gICAgaWYgKGVuYWJsZUdlb0Jsb2NraW5nICYmIGJsb2NrZWRDb3VudHJpZXMubGVuZ3RoID4gMCkge1xuICAgICAgcnVsZXMucHVzaCh7XG4gICAgICAgIG5hbWU6IGBHZW9CbG9ja1J1bGUtJHtlbnZpcm9ubWVudH1gLFxuICAgICAgICBwcmlvcml0eTogcHJpb3JpdHkrKyxcbiAgICAgICAgYWN0aW9uOiB7IGJsb2NrOiB7fSB9LFxuICAgICAgICBzdGF0ZW1lbnQ6IHtcbiAgICAgICAgICBnZW9NYXRjaFN0YXRlbWVudDoge1xuICAgICAgICAgICAgY291bnRyeUNvZGVzOiBibG9ja2VkQ291bnRyaWVzLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIHZpc2liaWxpdHlDb25maWc6IHtcbiAgICAgICAgICBzYW1wbGVkUmVxdWVzdHNFbmFibGVkOiB0cnVlLFxuICAgICAgICAgIGNsb3VkV2F0Y2hNZXRyaWNzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICBtZXRyaWNOYW1lOiBgR2VvQmxvY2stJHtlbnZpcm9ubWVudH1gLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gQ3VzdG9tIHJ1bGUgZm9yIEFQSSBhYnVzZSBwcm90ZWN0aW9uXG4gICAgaWYgKGVudmlyb25tZW50ID09PSAncHJvZHVjdGlvbicpIHtcbiAgICAgIHJ1bGVzLnB1c2goe1xuICAgICAgICBuYW1lOiBgQVBJQWJ1c2VQcm90ZWN0aW9uLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgICAgcHJpb3JpdHk6IHByaW9yaXR5KyssXG4gICAgICAgIGFjdGlvbjogeyBibG9jazoge30gfSxcbiAgICAgICAgc3RhdGVtZW50OiB7XG4gICAgICAgICAgYW5kU3RhdGVtZW50OiB7XG4gICAgICAgICAgICBzdGF0ZW1lbnRzOiBbXG4gICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBieXRlTWF0Y2hTdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgICAgICAgIHNlYXJjaFN0cmluZzogJy9hcGkvJyxcbiAgICAgICAgICAgICAgICAgIGZpZWxkVG9NYXRjaDogeyB1cmlQYXRoOiB7fSB9LFxuICAgICAgICAgICAgICAgICAgdGV4dFRyYW5zZm9ybWF0aW9uczogW1xuICAgICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICAgcHJpb3JpdHk6IDAsXG4gICAgICAgICAgICAgICAgICAgICAgdHlwZTogJ0xPV0VSQ0FTRScsXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICAgICAgcG9zaXRpb25hbENvbnN0cmFpbnQ6ICdTVEFSVFNfV0lUSCcsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHJhdGVCYXNlZFN0YXRlbWVudDoge1xuICAgICAgICAgICAgICAgICAgbGltaXQ6IDUwMCwgLy8gTW9yZSByZXN0cmljdGl2ZSBmb3IgQVBJIGVuZHBvaW50c1xuICAgICAgICAgICAgICAgICAgYWdncmVnYXRlS2V5VHlwZTogJ0lQJyxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgXSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICB2aXNpYmlsaXR5Q29uZmlnOiB7XG4gICAgICAgICAgc2FtcGxlZFJlcXVlc3RzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICBjbG91ZFdhdGNoTWV0cmljc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgbWV0cmljTmFtZTogYEFQSUFidXNlUHJvdGVjdGlvbi0ke2Vudmlyb25tZW50fWAsXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBDcmVhdGUgdGhlIFdlYiBBQ0xcbiAgICB0aGlzLndlYkFjbCA9IG5ldyB3YWZ2Mi5DZm5XZWJBQ0wodGhpcywgJ1dlYkFDTCcsIHtcbiAgICAgIHNjb3BlOiAnUkVHSU9OQUwnLFxuICAgICAgZGVmYXVsdEFjdGlvbjogeyBhbGxvdzoge30gfSxcbiAgICAgIG5hbWU6IGBCQ09TLSR7ZW52aXJvbm1lbnR9LVdlYkFDTGAsXG4gICAgICBkZXNjcmlwdGlvbjogYFdBRiBwcm90ZWN0aW9uIGZvciBCQ09TICR7ZW52aXJvbm1lbnR9IGVudmlyb25tZW50YCxcbiAgICAgIHJ1bGVzOiBydWxlcyxcbiAgICAgIHZpc2liaWxpdHlDb25maWc6IHtcbiAgICAgICAgc2FtcGxlZFJlcXVlc3RzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgY2xvdWRXYXRjaE1ldHJpY3NFbmFibGVkOiB0cnVlLFxuICAgICAgICBtZXRyaWNOYW1lOiBgQkNPUy0ke2Vudmlyb25tZW50fS1XZWJBQ0xgLFxuICAgICAgfSxcbiAgICAgIHRhZ3M6IFtcbiAgICAgICAge1xuICAgICAgICAgIGtleTogJ0Vudmlyb25tZW50JyxcbiAgICAgICAgICB2YWx1ZTogZW52aXJvbm1lbnQsXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBrZXk6ICdBcHBsaWNhdGlvbicsXG4gICAgICAgICAgdmFsdWU6ICdCQ09TJyxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIGtleTogJ01hbmFnZWRCeScsXG4gICAgICAgICAgdmFsdWU6ICdDREsnLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vIFdBRiBsb2dnaW5nIGNvbmZpZ3VyYXRpb24gdXNpbmcgY3VzdG9tIHJlc291cmNlXG4gICAgLy8gVGhpcyBoYW5kbGVzIHRoZSBBV1MgbGltaXRhdGlvbiB3aGVyZSBvbmx5IG9uZSBsb2dnaW5nIGNvbmZpZyBwZXIgV2ViQUNMIGlzIGFsbG93ZWRcbiAgICAvLyBieSB1c2luZyBQdXRMb2dnaW5nQ29uZmlndXJhdGlvbiB3aGljaCBjcmVhdGVzIE9SIHVwZGF0ZXMgdGhlIGNvbmZpZ1xuICAgIGNvbnN0IHsgV2FmTG9nZ2luZ0NvbmZpZyB9ID0gcmVxdWlyZSgnLi93YWYtbG9nZ2luZy1jb25maWcnKTtcblxuICAgIG5ldyBXYWZMb2dnaW5nQ29uZmlnKHRoaXMsICdXQUZMb2dnaW5nQ29uZmlndXJhdGlvbicsIHtcbiAgICAgIHdlYkFjbEFybjogdGhpcy53ZWJBY2wuYXR0ckFybixcbiAgICAgIGxvZ0dyb3VwQXJuOiB0aGlzLmxvZ0dyb3VwLmxvZ0dyb3VwQXJuLFxuICAgICAgcmVkYWN0ZWRGaWVsZHM6IFtcbiAgICAgICAgeyBxdWVyeVN0cmluZzoge30gfSwgLy8gUmVkYWN0IHF1ZXJ5IHBhcmFtZXRlcnMgKG1heSBjb250YWluIHNlbnNpdGl2ZSBkYXRhKVxuICAgICAgICB7IHNpbmdsZUhlYWRlcjogeyBOYW1lOiAnYXV0aG9yaXphdGlvbicgfSB9LCAvLyBSZWRhY3QgYXV0aCBoZWFkZXJzXG4gICAgICAgIHsgc2luZ2xlSGVhZGVyOiB7IE5hbWU6ICdjb29raWUnIH0gfSwgLy8gUmVkYWN0IGNvb2tpZXNcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyBPdXRwdXQgdGhlIFdlYiBBQ0wgQVJOXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1dlYkFDTEFybicsIHtcbiAgICAgIHZhbHVlOiB0aGlzLndlYkFjbC5hdHRyQXJuLFxuICAgICAgZGVzY3JpcHRpb246IGBXQUYgV2ViIEFDTCBBUk4gZm9yICR7ZW52aXJvbm1lbnR9YCxcbiAgICAgIGV4cG9ydE5hbWU6IGBCQ09TLSR7ZW52aXJvbm1lbnR9LVdlYkFDTC1Bcm5gLFxuICAgIH0pO1xuXG4gICAgLy8gT3V0cHV0IHRoZSBXZWIgQUNMIElEXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1dlYkFDTElkJywge1xuICAgICAgdmFsdWU6IHRoaXMud2ViQWNsLmF0dHJJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiBgV0FGIFdlYiBBQ0wgSUQgZm9yICR7ZW52aXJvbm1lbnR9YCxcbiAgICAgIGV4cG9ydE5hbWU6IGBCQ09TLSR7ZW52aXJvbm1lbnR9LVdlYkFDTC1JZGAsXG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogQXNzb2NpYXRlIHRoZSBXZWIgQUNMIHdpdGggYW4gQXBwbGljYXRpb24gTG9hZCBCYWxhbmNlclxuICAgKi9cbiAgcHVibGljIGFzc29jaWF0ZVdpdGhMb2FkQmFsYW5jZXIobG9hZEJhbGFuY2VyQXJuOiBzdHJpbmcpOiB3YWZ2Mi5DZm5XZWJBQ0xBc3NvY2lhdGlvbiB7XG4gICAgcmV0dXJuIG5ldyB3YWZ2Mi5DZm5XZWJBQ0xBc3NvY2lhdGlvbih0aGlzLCAnV2ViQUNMQXNzb2NpYXRpb24nLCB7XG4gICAgICByZXNvdXJjZUFybjogbG9hZEJhbGFuY2VyQXJuLFxuICAgICAgd2ViQWNsQXJuOiB0aGlzLndlYkFjbC5hdHRyQXJuLFxuICAgIH0pO1xuICB9XG59XG4iXX0=