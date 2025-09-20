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
        // Create CloudWatch log group for WAF logs
        this.logGroup = new logs.LogGroup(this, 'WAFLogGroup', {
            logGroupName: `/aws/waf/bcos-${environment}`,
            retention: environment === 'production' ? logs.RetentionDays.THREE_MONTHS : logs.RetentionDays.ONE_MONTH,
            encryptionKey: kmsKey,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2FmLXByb3RlY3Rpb24uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ3YWYtcHJvdGVjdGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMsNkRBQStDO0FBQy9DLDJEQUE2QztBQUU3QywyQ0FBdUM7QUFtQ3ZDOzs7R0FHRztBQUNILE1BQWEsYUFBYyxTQUFRLHNCQUFTO0lBQzFCLE1BQU0sQ0FBa0I7SUFDeEIsUUFBUSxDQUFnQjtJQUV4QyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQXlCO1FBQ2pFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsTUFBTSxFQUNKLFdBQVcsRUFDWCxNQUFNLEVBQ04sY0FBYyxHQUFHLFdBQVcsS0FBSyxZQUFZLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUMzRCxpQkFBaUIsR0FBRyxLQUFLLEVBQ3pCLGdCQUFnQixHQUFHLEVBQUUsRUFDckIsa0JBQWtCLEdBQUcsV0FBVyxLQUFLLFlBQVksR0FDbEQsR0FBRyxLQUFLLENBQUM7UUFFViwyQ0FBMkM7UUFDM0MsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLGFBQWEsRUFBRTtZQUNyRCxZQUFZLEVBQUUsaUJBQWlCLFdBQVcsRUFBRTtZQUM1QyxTQUFTLEVBQUUsV0FBVyxLQUFLLFlBQVksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsU0FBUztZQUN4RyxhQUFhLEVBQUUsTUFBTTtZQUNyQixhQUFhLEVBQUUsR0FBRyxDQUFDLGFBQWEsQ0FBQyxNQUFNO1NBQ3hDLENBQUMsQ0FBQztRQUVILHdCQUF3QjtRQUN4QixNQUFNLEtBQUssR0FBbUMsRUFBRSxDQUFD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WUFBWSxFQUFFO3dCQUNaLElBQUksRUFBRSxlQUFlO3FCQUN0QjtpQkFDRjtnQkFDRDtvQkFDRSxZQUFZLEVBQUU7d0JBQ1osSUFBSSxFQUFFLFFBQVE7cUJBQ2Y7aUJBQ0Y7YUFDRjtTQUNGLENBQUMsQ0FBQztRQUVILHlCQUF5QjtRQUN6QixJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLFdBQVcsRUFBRTtZQUNuQyxLQUFLLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPO1lBQzFCLFdBQVcsRUFBRSx1QkFBdUIsV0FBVyxFQUFFO1lBQ2pELFVBQVUsRUFBRSxRQUFRLFdBQVcsYUFBYTtTQUM3QyxDQUFDLENBQUM7UUFFSCx3QkFBd0I7UUFDeEIsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxVQUFVLEVBQUU7WUFDbEMsS0FBSyxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTTtZQUN6QixXQUFXLEVBQUUsc0JBQXNCLFdBQVcsRUFBRTtZQUNoRCxVQUFVLEVBQUUsUUFBUSxXQUFXLFlBQVk7U0FDNUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVEOztPQUVHO0lBQ0kseUJBQXlCLENBQUMsZUFBdUI7UUFDdEQsT0FBTyxJQUFJLEtBQUssQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLEVBQUUsbUJBQW1CLEVBQUU7WUFDL0QsV0FBVyxFQUFFLGVBQWU7WUFDNUIsU0FBUyxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTztTQUMvQixDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUEzUEQsc0NBMlBDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIHdhZnYyIGZyb20gJ2F3cy1jZGstbGliL2F3cy13YWZ2Mic7XG5pbXBvcnQgKiBhcyBsb2dzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sb2dzJztcbmltcG9ydCAqIGFzIGttcyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mta21zJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFdhZlByb3RlY3Rpb25Qcm9wcyB7XG4gIC8qKlxuICAgKiBFbnZpcm9ubWVudCBuYW1lIChzdGFnaW5nIG9yIHByb2R1Y3Rpb24pXG4gICAqL1xuICBlbnZpcm9ubWVudDogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBLTVMga2V5IGZvciBsb2cgZW5jcnlwdGlvblxuICAgKi9cbiAga21zS2V5OiBrbXMuSUtleTtcblxuICAvKipcbiAgICogUmF0ZSBsaW1pdCBwZXIgSVAgYWRkcmVzcyAocmVxdWVzdHMgcGVyIDUgbWludXRlcylcbiAgICogRGVmYXVsdDogMTAwMCBmb3IgcHJvZHVjdGlvbiwgMjAwMCBmb3Igc3RhZ2luZ1xuICAgKi9cbiAgcmF0ZUxpbWl0UGVySVA/OiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIEVuYWJsZSBnZW8tYmxvY2tpbmcgKGRlZmF1bHQ6IGZhbHNlKVxuICAgKi9cbiAgZW5hYmxlR2VvQmxvY2tpbmc/OiBib29sZWFuO1xuXG4gIC8qKlxuICAgKiBMaXN0IG9mIGNvdW50cnkgY29kZXMgdG8gYmxvY2sgKGlmIGdlby1ibG9ja2luZyBlbmFibGVkKVxuICAgKi9cbiAgYmxvY2tlZENvdW50cmllcz86IHN0cmluZ1tdO1xuXG4gIC8qKlxuICAgKiBFbmFibGUgYWRkaXRpb25hbCBtYW5hZ2VkIHJ1bGVzIChkZWZhdWx0OiB0cnVlIGZvciBwcm9kdWN0aW9uKVxuICAgKi9cbiAgZW5hYmxlTWFuYWdlZFJ1bGVzPzogYm9vbGVhbjtcbn1cblxuLyoqXG4gKiBXQUYgcHJvdGVjdGlvbiBjb25zdHJ1Y3QgdGhhdCBjcmVhdGVzIGEgV2ViIEFDTCB3aXRoIHNlY3VyaXR5IHJ1bGVzXG4gKiB0byBwcm90ZWN0IHRoZSBhcHBsaWNhdGlvbiBmcm9tIGNvbW1vbiB3ZWIgYXR0YWNrc1xuICovXG5leHBvcnQgY2xhc3MgV2FmUHJvdGVjdGlvbiBleHRlbmRzIENvbnN0cnVjdCB7XG4gIHB1YmxpYyByZWFkb25seSB3ZWJBY2w6IHdhZnYyLkNmbldlYkFDTDtcbiAgcHVibGljIHJlYWRvbmx5IGxvZ0dyb3VwOiBsb2dzLkxvZ0dyb3VwO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBXYWZQcm90ZWN0aW9uUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgY29uc3Qge1xuICAgICAgZW52aXJvbm1lbnQsXG4gICAgICBrbXNLZXksXG4gICAgICByYXRlTGltaXRQZXJJUCA9IGVudmlyb25tZW50ID09PSAncHJvZHVjdGlvbicgPyAxMDAwIDogMjAwMCxcbiAgICAgIGVuYWJsZUdlb0Jsb2NraW5nID0gZmFsc2UsXG4gICAgICBibG9ja2VkQ291bnRyaWVzID0gW10sXG4gICAgICBlbmFibGVNYW5hZ2VkUnVsZXMgPSBlbnZpcm9ubWVudCA9PT0gJ3Byb2R1Y3Rpb24nLFxuICAgIH0gPSBwcm9wcztcblxuICAgIC8vIENyZWF0ZSBDbG91ZFdhdGNoIGxvZyBncm91cCBmb3IgV0FGIGxvZ3NcbiAgICB0aGlzLmxvZ0dyb3VwID0gbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ1dBRkxvZ0dyb3VwJywge1xuICAgICAgbG9nR3JvdXBOYW1lOiBgL2F3cy93YWYvYmNvcy0ke2Vudmlyb25tZW50fWAsXG4gICAgICByZXRlbnRpb246IGVudmlyb25tZW50ID09PSAncHJvZHVjdGlvbicgPyBsb2dzLlJldGVudGlvbkRheXMuVEhSRUVfTU9OVEhTIDogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9NT05USCxcbiAgICAgIGVuY3J5cHRpb25LZXk6IGttc0tleSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTixcbiAgICB9KTtcblxuICAgIC8vIEJ1aWxkIFdBRiBydWxlcyBhcnJheVxuICAgIGNvbnN0IHJ1bGVzOiB3YWZ2Mi5DZm5XZWJBQ0wuUnVsZVByb3BlcnR5W10gPSBbXTtcbiAgICBsZXQgcHJpb3JpdHkgPSAxO1xuXG4gICAgLy8gQVdTIE1hbmFnZWQgQ29yZSBSdWxlIFNldCAoT1dBU1AgVG9wIDEwKVxuICAgIGlmIChlbmFibGVNYW5hZ2VkUnVsZXMpIHtcbiAgICAgIHJ1bGVzLnB1c2goe1xuICAgICAgICBuYW1lOiAnQVdTLUFXU01hbmFnZWRSdWxlc0NvbW1vblJ1bGVTZXQnLFxuICAgICAgICBwcmlvcml0eTogcHJpb3JpdHkrKyxcbiAgICAgICAgb3ZlcnJpZGVBY3Rpb246IHsgbm9uZToge30gfSxcbiAgICAgICAgc3RhdGVtZW50OiB7XG4gICAgICAgICAgbWFuYWdlZFJ1bGVHcm91cFN0YXRlbWVudDoge1xuICAgICAgICAgICAgdmVuZG9yTmFtZTogJ0FXUycsXG4gICAgICAgICAgICBuYW1lOiAnQVdTTWFuYWdlZFJ1bGVzQ29tbW9uUnVsZVNldCcsXG4gICAgICAgICAgICAvLyBFeGNsdWRlIHNwZWNpZmljIHJ1bGVzIGlmIG5lZWRlZFxuICAgICAgICAgICAgZXhjbHVkZWRSdWxlczogW10sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgdmlzaWJpbGl0eUNvbmZpZzoge1xuICAgICAgICAgIHNhbXBsZWRSZXF1ZXN0c0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgY2xvdWRXYXRjaE1ldHJpY3NFbmFibGVkOiB0cnVlLFxuICAgICAgICAgIG1ldHJpY05hbWU6IGBDb21tb25SdWxlU2V0LSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBBV1MgTWFuYWdlZCBLbm93biBCYWQgSW5wdXRzIFJ1bGUgU2V0XG4gICAgICBydWxlcy5wdXNoKHtcbiAgICAgICAgbmFtZTogJ0FXUy1BV1NNYW5hZ2VkUnVsZXNLbm93bkJhZElucHV0c1J1bGVTZXQnLFxuICAgICAgICBwcmlvcml0eTogcHJpb3JpdHkrKyxcbiAgICAgICAgb3ZlcnJpZGVBY3Rpb246IHsgbm9uZToge30gfSxcbiAgICAgICAgc3RhdGVtZW50OiB7XG4gICAgICAgICAgbWFuYWdlZFJ1bGVHcm91cFN0YXRlbWVudDoge1xuICAgICAgICAgICAgdmVuZG9yTmFtZTogJ0FXUycsXG4gICAgICAgICAgICBuYW1lOiAnQVdTTWFuYWdlZFJ1bGVzS25vd25CYWRJbnB1dHNSdWxlU2V0JyxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICB2aXNpYmlsaXR5Q29uZmlnOiB7XG4gICAgICAgICAgc2FtcGxlZFJlcXVlc3RzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICBjbG91ZFdhdGNoTWV0cmljc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgbWV0cmljTmFtZTogYEtub3duQmFkSW5wdXRzLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBBV1MgTWFuYWdlZCBPV0FTUCBUb3AgMTAgUnVsZSBTZXQgKHByb2R1Y3Rpb24gb25seSlcbiAgICAgIGlmIChlbnZpcm9ubWVudCA9PT0gJ3Byb2R1Y3Rpb24nKSB7XG4gICAgICAgIHJ1bGVzLnB1c2goe1xuICAgICAgICAgIG5hbWU6ICdBV1MtQVdTTWFuYWdlZFJ1bGVzT1dBU1BUb3BUZW5SdWxlU2V0JyxcbiAgICAgICAgICBwcmlvcml0eTogcHJpb3JpdHkrKyxcbiAgICAgICAgICBvdmVycmlkZUFjdGlvbjogeyBub25lOiB7fSB9LFxuICAgICAgICAgIHN0YXRlbWVudDoge1xuICAgICAgICAgICAgbWFuYWdlZFJ1bGVHcm91cFN0YXRlbWVudDoge1xuICAgICAgICAgICAgICB2ZW5kb3JOYW1lOiAnQVdTJyxcbiAgICAgICAgICAgICAgbmFtZTogJ0FXU01hbmFnZWRSdWxlc09XQVNQVG9wVGVuUnVsZVNldCcsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgICAgdmlzaWJpbGl0eUNvbmZpZzoge1xuICAgICAgICAgICAgc2FtcGxlZFJlcXVlc3RzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICAgIGNsb3VkV2F0Y2hNZXRyaWNzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICAgIG1ldHJpY05hbWU6IGBPV0FTUFRvcFRlbi0ke2Vudmlyb25tZW50fWAsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gUmF0ZSBsaW1pdGluZyBydWxlXG4gICAgcnVsZXMucHVzaCh7XG4gICAgICBuYW1lOiBgUmF0ZUxpbWl0UnVsZS0ke2Vudmlyb25tZW50fWAsXG4gICAgICBwcmlvcml0eTogcHJpb3JpdHkrKyxcbiAgICAgIGFjdGlvbjogeyBibG9jazoge30gfSxcbiAgICAgIHN0YXRlbWVudDoge1xuICAgICAgICByYXRlQmFzZWRTdGF0ZW1lbnQ6IHtcbiAgICAgICAgICBsaW1pdDogcmF0ZUxpbWl0UGVySVAsXG4gICAgICAgICAgYWdncmVnYXRlS2V5VHlwZTogJ0lQJyxcbiAgICAgICAgICBzY29wZURvd25TdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgIG5vdFN0YXRlbWVudDoge1xuICAgICAgICAgICAgICBzdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgICAgICBieXRlTWF0Y2hTdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgICAgICAgIHNlYXJjaFN0cmluZzogJy9oZWFsdGgnLFxuICAgICAgICAgICAgICAgICAgZmllbGRUb01hdGNoOiB7IHVyaVBhdGg6IHt9IH0sXG4gICAgICAgICAgICAgICAgICB0ZXh0VHJhbnNmb3JtYXRpb25zOiBbXG4gICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICBwcmlvcml0eTogMCxcbiAgICAgICAgICAgICAgICAgICAgICB0eXBlOiAnTE9XRVJDQVNFJyxcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgICAgICBwb3NpdGlvbmFsQ29uc3RyYWludDogJ1NUQVJUU19XSVRIJyxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIHZpc2liaWxpdHlDb25maWc6IHtcbiAgICAgICAgc2FtcGxlZFJlcXVlc3RzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgY2xvdWRXYXRjaE1ldHJpY3NFbmFibGVkOiB0cnVlLFxuICAgICAgICBtZXRyaWNOYW1lOiBgUmF0ZUxpbWl0LSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBHZW9ncmFwaGljIGJsb2NraW5nIHJ1bGUgKGlmIGVuYWJsZWQpXG4gICAgaWYgKGVuYWJsZUdlb0Jsb2NraW5nICYmIGJsb2NrZWRDb3VudHJpZXMubGVuZ3RoID4gMCkge1xuICAgICAgcnVsZXMucHVzaCh7XG4gICAgICAgIG5hbWU6IGBHZW9CbG9ja1J1bGUtJHtlbnZpcm9ubWVudH1gLFxuICAgICAgICBwcmlvcml0eTogcHJpb3JpdHkrKyxcbiAgICAgICAgYWN0aW9uOiB7IGJsb2NrOiB7fSB9LFxuICAgICAgICBzdGF0ZW1lbnQ6IHtcbiAgICAgICAgICBnZW9NYXRjaFN0YXRlbWVudDoge1xuICAgICAgICAgICAgY291bnRyeUNvZGVzOiBibG9ja2VkQ291bnRyaWVzLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIHZpc2liaWxpdHlDb25maWc6IHtcbiAgICAgICAgICBzYW1wbGVkUmVxdWVzdHNFbmFibGVkOiB0cnVlLFxuICAgICAgICAgIGNsb3VkV2F0Y2hNZXRyaWNzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICBtZXRyaWNOYW1lOiBgR2VvQmxvY2stJHtlbnZpcm9ubWVudH1gLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gQ3VzdG9tIHJ1bGUgZm9yIEFQSSBhYnVzZSBwcm90ZWN0aW9uXG4gICAgaWYgKGVudmlyb25tZW50ID09PSAncHJvZHVjdGlvbicpIHtcbiAgICAgIHJ1bGVzLnB1c2goe1xuICAgICAgICBuYW1lOiBgQVBJQWJ1c2VQcm90ZWN0aW9uLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgICAgcHJpb3JpdHk6IHByaW9yaXR5KyssXG4gICAgICAgIGFjdGlvbjogeyBibG9jazoge30gfSxcbiAgICAgICAgc3RhdGVtZW50OiB7XG4gICAgICAgICAgYW5kU3RhdGVtZW50OiB7XG4gICAgICAgICAgICBzdGF0ZW1lbnRzOiBbXG4gICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBieXRlTWF0Y2hTdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgICAgICAgIHNlYXJjaFN0cmluZzogJy9hcGkvJyxcbiAgICAgICAgICAgICAgICAgIGZpZWxkVG9NYXRjaDogeyB1cmlQYXRoOiB7fSB9LFxuICAgICAgICAgICAgICAgICAgdGV4dFRyYW5zZm9ybWF0aW9uczogW1xuICAgICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICAgcHJpb3JpdHk6IDAsXG4gICAgICAgICAgICAgICAgICAgICAgdHlwZTogJ0xPV0VSQ0FTRScsXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICAgICAgcG9zaXRpb25hbENvbnN0cmFpbnQ6ICdTVEFSVFNfV0lUSCcsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHJhdGVCYXNlZFN0YXRlbWVudDoge1xuICAgICAgICAgICAgICAgICAgbGltaXQ6IDUwMCwgLy8gTW9yZSByZXN0cmljdGl2ZSBmb3IgQVBJIGVuZHBvaW50c1xuICAgICAgICAgICAgICAgICAgYWdncmVnYXRlS2V5VHlwZTogJ0lQJyxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgXSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICB2aXNpYmlsaXR5Q29uZmlnOiB7XG4gICAgICAgICAgc2FtcGxlZFJlcXVlc3RzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICBjbG91ZFdhdGNoTWV0cmljc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgbWV0cmljTmFtZTogYEFQSUFidXNlUHJvdGVjdGlvbi0ke2Vudmlyb25tZW50fWAsXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBDcmVhdGUgdGhlIFdlYiBBQ0xcbiAgICB0aGlzLndlYkFjbCA9IG5ldyB3YWZ2Mi5DZm5XZWJBQ0wodGhpcywgJ1dlYkFDTCcsIHtcbiAgICAgIHNjb3BlOiAnUkVHSU9OQUwnLFxuICAgICAgZGVmYXVsdEFjdGlvbjogeyBhbGxvdzoge30gfSxcbiAgICAgIG5hbWU6IGBCQ09TLSR7ZW52aXJvbm1lbnR9LVdlYkFDTGAsXG4gICAgICBkZXNjcmlwdGlvbjogYFdBRiBwcm90ZWN0aW9uIGZvciBCQ09TICR7ZW52aXJvbm1lbnR9IGVudmlyb25tZW50YCxcbiAgICAgIHJ1bGVzOiBydWxlcyxcbiAgICAgIHZpc2liaWxpdHlDb25maWc6IHtcbiAgICAgICAgc2FtcGxlZFJlcXVlc3RzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgY2xvdWRXYXRjaE1ldHJpY3NFbmFibGVkOiB0cnVlLFxuICAgICAgICBtZXRyaWNOYW1lOiBgQkNPUy0ke2Vudmlyb25tZW50fS1XZWJBQ0xgLFxuICAgICAgfSxcbiAgICAgIHRhZ3M6IFtcbiAgICAgICAge1xuICAgICAgICAgIGtleTogJ0Vudmlyb25tZW50JyxcbiAgICAgICAgICB2YWx1ZTogZW52aXJvbm1lbnQsXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBrZXk6ICdBcHBsaWNhdGlvbicsXG4gICAgICAgICAgdmFsdWU6ICdCQ09TJyxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIGtleTogJ01hbmFnZWRCeScsXG4gICAgICAgICAgdmFsdWU6ICdDREsnLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vIEVuYWJsZSBsb2dnaW5nXG4gICAgbmV3IHdhZnYyLkNmbkxvZ2dpbmdDb25maWd1cmF0aW9uKHRoaXMsICdXQUZMb2dnaW5nQ29uZmlndXJhdGlvbicsIHtcbiAgICAgIHJlc291cmNlQXJuOiB0aGlzLndlYkFjbC5hdHRyQXJuLFxuICAgICAgbG9nRGVzdGluYXRpb25Db25maWdzOiBbdGhpcy5sb2dHcm91cC5sb2dHcm91cEFybl0sXG4gICAgICByZWRhY3RlZEZpZWxkczogW1xuICAgICAgICB7XG4gICAgICAgICAgc2luZ2xlSGVhZGVyOiB7XG4gICAgICAgICAgICBuYW1lOiAnYXV0aG9yaXphdGlvbicsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIHNpbmdsZUhlYWRlcjoge1xuICAgICAgICAgICAgbmFtZTogJ2Nvb2tpZScsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyBPdXRwdXQgdGhlIFdlYiBBQ0wgQVJOXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1dlYkFDTEFybicsIHtcbiAgICAgIHZhbHVlOiB0aGlzLndlYkFjbC5hdHRyQXJuLFxuICAgICAgZGVzY3JpcHRpb246IGBXQUYgV2ViIEFDTCBBUk4gZm9yICR7ZW52aXJvbm1lbnR9YCxcbiAgICAgIGV4cG9ydE5hbWU6IGBCQ09TLSR7ZW52aXJvbm1lbnR9LVdlYkFDTC1Bcm5gLFxuICAgIH0pO1xuXG4gICAgLy8gT3V0cHV0IHRoZSBXZWIgQUNMIElEXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1dlYkFDTElkJywge1xuICAgICAgdmFsdWU6IHRoaXMud2ViQWNsLmF0dHJJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiBgV0FGIFdlYiBBQ0wgSUQgZm9yICR7ZW52aXJvbm1lbnR9YCxcbiAgICAgIGV4cG9ydE5hbWU6IGBCQ09TLSR7ZW52aXJvbm1lbnR9LVdlYkFDTC1JZGAsXG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogQXNzb2NpYXRlIHRoZSBXZWIgQUNMIHdpdGggYW4gQXBwbGljYXRpb24gTG9hZCBCYWxhbmNlclxuICAgKi9cbiAgcHVibGljIGFzc29jaWF0ZVdpdGhMb2FkQmFsYW5jZXIobG9hZEJhbGFuY2VyQXJuOiBzdHJpbmcpOiB3YWZ2Mi5DZm5XZWJBQ0xBc3NvY2lhdGlvbiB7XG4gICAgcmV0dXJuIG5ldyB3YWZ2Mi5DZm5XZWJBQ0xBc3NvY2lhdGlvbih0aGlzLCAnV2ViQUNMQXNzb2NpYXRpb24nLCB7XG4gICAgICByZXNvdXJjZUFybjogbG9hZEJhbGFuY2VyQXJuLFxuICAgICAgd2ViQWNsQXJuOiB0aGlzLndlYkFjbC5hdHRyQXJuLFxuICAgIH0pO1xuICB9XG59XG4iXX0=