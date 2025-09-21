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
        // WAF logging disabled temporarily due to API format issues
        // TODO: Re-enable after fixing redactedFields format
        // new wafv2.CfnLoggingConfiguration(this, 'WAFLoggingConfiguration', {
        //   resourceArn: this.webAcl.attrArn,
        //   logDestinationConfigs: [this.logGroup.logGroupArn],
        // });
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2FmLXByb3RlY3Rpb24uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ3YWYtcHJvdGVjdGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMsNkRBQStDO0FBQy9DLDJEQUE2QztBQUU3QywyQ0FBdUM7QUFtQ3ZDOzs7R0FHRztBQUNILE1BQWEsYUFBYyxTQUFRLHNCQUFTO0lBQzFCLE1BQU0sQ0FBa0I7SUFDeEIsUUFBUSxDQUFnQjtJQUV4QyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQXlCO1FBQ2pFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsTUFBTSxFQUNKLFdBQVcsRUFDWCxNQUFNLEVBQ04sY0FBYyxHQUFHLFdBQVcsS0FBSyxZQUFZLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUMzRCxpQkFBaUIsR0FBRyxLQUFLLEVBQ3pCLGdCQUFnQixHQUFHLEVBQUUsRUFDckIsa0JBQWtCLEdBQUcsV0FBVyxLQUFLLFlBQVksR0FDbEQsR0FBRyxLQUFLLENBQUM7UUFFViwwRUFBMEU7UUFDMUUsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLGFBQWEsRUFBRTtZQUNyRCxZQUFZLEVBQUUsaUJBQWlCLFdBQVcsSUFBSSxJQUFJLENBQUMsR0FBRyxFQUFFLEVBQUU7WUFDMUQsU0FBUyxFQUFFLFdBQVcsS0FBSyxZQUFZLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLFNBQVM7WUFDeEcsYUFBYSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsTUFBTTtTQUN4QyxDQUFDLENBQUM7UUFFSCx3QkFBd0I7UUFDeEIsTUFBTSxLQUFLLEdBQW1DLEVBQUUs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V0FBVyxFQUFFLHVCQUF1QixXQUFXLEVBQUU7WUFDakQsVUFBVSxFQUFFLFFBQVEsV0FBVyxhQUFhO1NBQzdDLENBQUMsQ0FBQztRQUVILHdCQUF3QjtRQUN4QixJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLFVBQVUsRUFBRTtZQUNsQyxLQUFLLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNO1lBQ3pCLFdBQVcsRUFBRSxzQkFBc0IsV0FBVyxFQUFFO1lBQ2hELFVBQVUsRUFBRSxRQUFRLFdBQVcsWUFBWTtTQUM1QyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQ7O09BRUc7SUFDSSx5QkFBeUIsQ0FBQyxlQUF1QjtRQUN0RCxPQUFPLElBQUksS0FBSyxDQUFDLG9CQUFvQixDQUFDLElBQUksRUFBRSxtQkFBbUIsRUFBRTtZQUMvRCxXQUFXLEVBQUUsZUFBZTtZQUM1QixTQUFTLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPO1NBQy9CLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQS9PRCxzQ0ErT0MiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0ICogYXMgd2FmdjIgZnJvbSAnYXdzLWNkay1saWIvYXdzLXdhZnYyJztcbmltcG9ydCAqIGFzIGxvZ3MgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxvZ3MnO1xuaW1wb3J0ICogYXMga21zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1rbXMnO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgV2FmUHJvdGVjdGlvblByb3BzIHtcbiAgLyoqXG4gICAqIEVudmlyb25tZW50IG5hbWUgKHN0YWdpbmcgb3IgcHJvZHVjdGlvbilcbiAgICovXG4gIGVudmlyb25tZW50OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEtNUyBrZXkgZm9yIGxvZyBlbmNyeXB0aW9uXG4gICAqL1xuICBrbXNLZXk6IGttcy5JS2V5O1xuXG4gIC8qKlxuICAgKiBSYXRlIGxpbWl0IHBlciBJUCBhZGRyZXNzIChyZXF1ZXN0cyBwZXIgNSBtaW51dGVzKVxuICAgKiBEZWZhdWx0OiAxMDAwIGZvciBwcm9kdWN0aW9uLCAyMDAwIGZvciBzdGFnaW5nXG4gICAqL1xuICByYXRlTGltaXRQZXJJUD86IG51bWJlcjtcblxuICAvKipcbiAgICogRW5hYmxlIGdlby1ibG9ja2luZyAoZGVmYXVsdDogZmFsc2UpXG4gICAqL1xuICBlbmFibGVHZW9CbG9ja2luZz86IGJvb2xlYW47XG5cbiAgLyoqXG4gICAqIExpc3Qgb2YgY291bnRyeSBjb2RlcyB0byBibG9jayAoaWYgZ2VvLWJsb2NraW5nIGVuYWJsZWQpXG4gICAqL1xuICBibG9ja2VkQ291bnRyaWVzPzogc3RyaW5nW107XG5cbiAgLyoqXG4gICAqIEVuYWJsZSBhZGRpdGlvbmFsIG1hbmFnZWQgcnVsZXMgKGRlZmF1bHQ6IHRydWUgZm9yIHByb2R1Y3Rpb24pXG4gICAqL1xuICBlbmFibGVNYW5hZ2VkUnVsZXM/OiBib29sZWFuO1xufVxuXG4vKipcbiAqIFdBRiBwcm90ZWN0aW9uIGNvbnN0cnVjdCB0aGF0IGNyZWF0ZXMgYSBXZWIgQUNMIHdpdGggc2VjdXJpdHkgcnVsZXNcbiAqIHRvIHByb3RlY3QgdGhlIGFwcGxpY2F0aW9uIGZyb20gY29tbW9uIHdlYiBhdHRhY2tzXG4gKi9cbmV4cG9ydCBjbGFzcyBXYWZQcm90ZWN0aW9uIGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgcHVibGljIHJlYWRvbmx5IHdlYkFjbDogd2FmdjIuQ2ZuV2ViQUNMO1xuICBwdWJsaWMgcmVhZG9ubHkgbG9nR3JvdXA6IGxvZ3MuTG9nR3JvdXA7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IFdhZlByb3RlY3Rpb25Qcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICBjb25zdCB7XG4gICAgICBlbnZpcm9ubWVudCxcbiAgICAgIGttc0tleSxcbiAgICAgIHJhdGVMaW1pdFBlcklQID0gZW52aXJvbm1lbnQgPT09ICdwcm9kdWN0aW9uJyA/IDEwMDAgOiAyMDAwLFxuICAgICAgZW5hYmxlR2VvQmxvY2tpbmcgPSBmYWxzZSxcbiAgICAgIGJsb2NrZWRDb3VudHJpZXMgPSBbXSxcbiAgICAgIGVuYWJsZU1hbmFnZWRSdWxlcyA9IGVudmlyb25tZW50ID09PSAncHJvZHVjdGlvbicsXG4gICAgfSA9IHByb3BzO1xuXG4gICAgLy8gQ3JlYXRlIENsb3VkV2F0Y2ggbG9nIGdyb3VwIGZvciBXQUYgbG9ncyAodXNpbmcgQVdTIG1hbmFnZWQgZW5jcnlwdGlvbilcbiAgICB0aGlzLmxvZ0dyb3VwID0gbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ1dBRkxvZ0dyb3VwJywge1xuICAgICAgbG9nR3JvdXBOYW1lOiBgL2F3cy93YWYvYmNvcy0ke2Vudmlyb25tZW50fS0ke0RhdGUubm93KCl9YCxcbiAgICAgIHJldGVudGlvbjogZW52aXJvbm1lbnQgPT09ICdwcm9kdWN0aW9uJyA/IGxvZ3MuUmV0ZW50aW9uRGF5cy5USFJFRV9NT05USFMgOiBsb2dzLlJldGVudGlvbkRheXMuT05FX01PTlRILFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxuICAgIH0pO1xuXG4gICAgLy8gQnVpbGQgV0FGIHJ1bGVzIGFycmF5XG4gICAgY29uc3QgcnVsZXM6IHdhZnYyLkNmbldlYkFDTC5SdWxlUHJvcGVydHlbXSA9IFtdO1xuICAgIGxldCBwcmlvcml0eSA9IDE7XG5cbiAgICAvLyBBV1MgTWFuYWdlZCBDb3JlIFJ1bGUgU2V0IChPV0FTUCBUb3AgMTApXG4gICAgaWYgKGVuYWJsZU1hbmFnZWRSdWxlcykge1xuICAgICAgcnVsZXMucHVzaCh7XG4gICAgICAgIG5hbWU6ICdBV1MtQVdTTWFuYWdlZFJ1bGVzQ29tbW9uUnVsZVNldCcsXG4gICAgICAgIHByaW9yaXR5OiBwcmlvcml0eSsrLFxuICAgICAgICBvdmVycmlkZUFjdGlvbjogeyBub25lOiB7fSB9LFxuICAgICAgICBzdGF0ZW1lbnQ6IHtcbiAgICAgICAgICBtYW5hZ2VkUnVsZUdyb3VwU3RhdGVtZW50OiB7XG4gICAgICAgICAgICB2ZW5kb3JOYW1lOiAnQVdTJyxcbiAgICAgICAgICAgIG5hbWU6ICdBV1NNYW5hZ2VkUnVsZXNDb21tb25SdWxlU2V0JyxcbiAgICAgICAgICAgIC8vIEV4Y2x1ZGUgc3BlY2lmaWMgcnVsZXMgaWYgbmVlZGVkXG4gICAgICAgICAgICBleGNsdWRlZFJ1bGVzOiBbXSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICB2aXNpYmlsaXR5Q29uZmlnOiB7XG4gICAgICAgICAgc2FtcGxlZFJlcXVlc3RzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICBjbG91ZFdhdGNoTWV0cmljc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgbWV0cmljTmFtZTogYENvbW1vblJ1bGVTZXQtJHtlbnZpcm9ubWVudH1gLFxuICAgICAgICB9LFxuICAgICAgfSk7XG5cbiAgICAgIC8vIEFXUyBNYW5hZ2VkIEtub3duIEJhZCBJbnB1dHMgUnVsZSBTZXRcbiAgICAgIHJ1bGVzLnB1c2goe1xuICAgICAgICBuYW1lOiAnQVdTLUFXU01hbmFnZWRSdWxlc0tub3duQmFkSW5wdXRzUnVsZVNldCcsXG4gICAgICAgIHByaW9yaXR5OiBwcmlvcml0eSsrLFxuICAgICAgICBvdmVycmlkZUFjdGlvbjogeyBub25lOiB7fSB9LFxuICAgICAgICBzdGF0ZW1lbnQ6IHtcbiAgICAgICAgICBtYW5hZ2VkUnVsZUdyb3VwU3RhdGVtZW50OiB7XG4gICAgICAgICAgICB2ZW5kb3JOYW1lOiAnQVdTJyxcbiAgICAgICAgICAgIG5hbWU6ICdBV1NNYW5hZ2VkUnVsZXNLbm93bkJhZElucHV0c1J1bGVTZXQnLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIHZpc2liaWxpdHlDb25maWc6IHtcbiAgICAgICAgICBzYW1wbGVkUmVxdWVzdHNFbmFibGVkOiB0cnVlLFxuICAgICAgICAgIGNsb3VkV2F0Y2hNZXRyaWNzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICBtZXRyaWNOYW1lOiBgS25vd25CYWRJbnB1dHMtJHtlbnZpcm9ubWVudH1gLFxuICAgICAgICB9LFxuICAgICAgfSk7XG5cbiAgICAgIC8vIEFXUyBNYW5hZ2VkIE9XQVNQIFRvcCAxMCBSdWxlIFNldCAocHJvZHVjdGlvbiBvbmx5KVxuICAgICAgaWYgKGVudmlyb25tZW50ID09PSAncHJvZHVjdGlvbicpIHtcbiAgICAgICAgcnVsZXMucHVzaCh7XG4gICAgICAgICAgbmFtZTogJ0FXUy1BV1NNYW5hZ2VkUnVsZXNPV0FTUFRvcFRlblJ1bGVTZXQnLFxuICAgICAgICAgIHByaW9yaXR5OiBwcmlvcml0eSsrLFxuICAgICAgICAgIG92ZXJyaWRlQWN0aW9uOiB7IG5vbmU6IHt9IH0sXG4gICAgICAgICAgc3RhdGVtZW50OiB7XG4gICAgICAgICAgICBtYW5hZ2VkUnVsZUdyb3VwU3RhdGVtZW50OiB7XG4gICAgICAgICAgICAgIHZlbmRvck5hbWU6ICdBV1MnLFxuICAgICAgICAgICAgICBuYW1lOiAnQVdTTWFuYWdlZFJ1bGVzT1dBU1BUb3BUZW5SdWxlU2V0JyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgICB2aXNpYmlsaXR5Q29uZmlnOiB7XG4gICAgICAgICAgICBzYW1wbGVkUmVxdWVzdHNFbmFibGVkOiB0cnVlLFxuICAgICAgICAgICAgY2xvdWRXYXRjaE1ldHJpY3NFbmFibGVkOiB0cnVlLFxuICAgICAgICAgICAgbWV0cmljTmFtZTogYE9XQVNQVG9wVGVuLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBSYXRlIGxpbWl0aW5nIHJ1bGVcbiAgICBydWxlcy5wdXNoKHtcbiAgICAgIG5hbWU6IGBSYXRlTGltaXRSdWxlLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgIHByaW9yaXR5OiBwcmlvcml0eSsrLFxuICAgICAgYWN0aW9uOiB7IGJsb2NrOiB7fSB9LFxuICAgICAgc3RhdGVtZW50OiB7XG4gICAgICAgIHJhdGVCYXNlZFN0YXRlbWVudDoge1xuICAgICAgICAgIGxpbWl0OiByYXRlTGltaXRQZXJJUCxcbiAgICAgICAgICBhZ2dyZWdhdGVLZXlUeXBlOiAnSVAnLFxuICAgICAgICAgIHNjb3BlRG93blN0YXRlbWVudDoge1xuICAgICAgICAgICAgbm90U3RhdGVtZW50OiB7XG4gICAgICAgICAgICAgIHN0YXRlbWVudDoge1xuICAgICAgICAgICAgICAgIGJ5dGVNYXRjaFN0YXRlbWVudDoge1xuICAgICAgICAgICAgICAgICAgc2VhcmNoU3RyaW5nOiAnL2hlYWx0aCcsXG4gICAgICAgICAgICAgICAgICBmaWVsZFRvTWF0Y2g6IHsgdXJpUGF0aDoge30gfSxcbiAgICAgICAgICAgICAgICAgIHRleHRUcmFuc2Zvcm1hdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgIHByaW9yaXR5OiAwLFxuICAgICAgICAgICAgICAgICAgICAgIHR5cGU6ICdMT1dFUkNBU0UnLFxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgICAgIHBvc2l0aW9uYWxDb25zdHJhaW50OiAnU1RBUlRTX1dJVEgnLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgdmlzaWJpbGl0eUNvbmZpZzoge1xuICAgICAgICBzYW1wbGVkUmVxdWVzdHNFbmFibGVkOiB0cnVlLFxuICAgICAgICBjbG91ZFdhdGNoTWV0cmljc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgIG1ldHJpY05hbWU6IGBSYXRlTGltaXQtJHtlbnZpcm9ubWVudH1gLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIEdlb2dyYXBoaWMgYmxvY2tpbmcgcnVsZSAoaWYgZW5hYmxlZClcbiAgICBpZiAoZW5hYmxlR2VvQmxvY2tpbmcgJiYgYmxvY2tlZENvdW50cmllcy5sZW5ndGggPiAwKSB7XG4gICAgICBydWxlcy5wdXNoKHtcbiAgICAgICAgbmFtZTogYEdlb0Jsb2NrUnVsZS0ke2Vudmlyb25tZW50fWAsXG4gICAgICAgIHByaW9yaXR5OiBwcmlvcml0eSsrLFxuICAgICAgICBhY3Rpb246IHsgYmxvY2s6IHt9IH0sXG4gICAgICAgIHN0YXRlbWVudDoge1xuICAgICAgICAgIGdlb01hdGNoU3RhdGVtZW50OiB7XG4gICAgICAgICAgICBjb3VudHJ5Q29kZXM6IGJsb2NrZWRDb3VudHJpZXMsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgdmlzaWJpbGl0eUNvbmZpZzoge1xuICAgICAgICAgIHNhbXBsZWRSZXF1ZXN0c0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgY2xvdWRXYXRjaE1ldHJpY3NFbmFibGVkOiB0cnVlLFxuICAgICAgICAgIG1ldHJpY05hbWU6IGBHZW9CbG9jay0ke2Vudmlyb25tZW50fWAsXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBDdXN0b20gcnVsZSBmb3IgQVBJIGFidXNlIHByb3RlY3Rpb25cbiAgICBpZiAoZW52aXJvbm1lbnQgPT09ICdwcm9kdWN0aW9uJykge1xuICAgICAgcnVsZXMucHVzaCh7XG4gICAgICAgIG5hbWU6IGBBUElBYnVzZVByb3RlY3Rpb24tJHtlbnZpcm9ubWVudH1gLFxuICAgICAgICBwcmlvcml0eTogcHJpb3JpdHkrKyxcbiAgICAgICAgYWN0aW9uOiB7IGJsb2NrOiB7fSB9LFxuICAgICAgICBzdGF0ZW1lbnQ6IHtcbiAgICAgICAgICBhbmRTdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgIHN0YXRlbWVudHM6IFtcbiAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGJ5dGVNYXRjaFN0YXRlbWVudDoge1xuICAgICAgICAgICAgICAgICAgc2VhcmNoU3RyaW5nOiAnL2FwaS8nLFxuICAgICAgICAgICAgICAgICAgZmllbGRUb01hdGNoOiB7IHVyaVBhdGg6IHt9IH0sXG4gICAgICAgICAgICAgICAgICB0ZXh0VHJhbnNmb3JtYXRpb25zOiBbXG4gICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICBwcmlvcml0eTogMCxcbiAgICAgICAgICAgICAgICAgICAgICB0eXBlOiAnTE9XRVJDQVNFJyxcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgICAgICBwb3NpdGlvbmFsQ29uc3RyYWludDogJ1NUQVJUU19XSVRIJyxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgcmF0ZUJhc2VkU3RhdGVtZW50OiB7XG4gICAgICAgICAgICAgICAgICBsaW1pdDogNTAwLCAvLyBNb3JlIHJlc3RyaWN0aXZlIGZvciBBUEkgZW5kcG9pbnRzXG4gICAgICAgICAgICAgICAgICBhZ2dyZWdhdGVLZXlUeXBlOiAnSVAnLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBdLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIHZpc2liaWxpdHlDb25maWc6IHtcbiAgICAgICAgICBzYW1wbGVkUmVxdWVzdHNFbmFibGVkOiB0cnVlLFxuICAgICAgICAgIGNsb3VkV2F0Y2hNZXRyaWNzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICBtZXRyaWNOYW1lOiBgQVBJQWJ1c2VQcm90ZWN0aW9uLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIENyZWF0ZSB0aGUgV2ViIEFDTFxuICAgIHRoaXMud2ViQWNsID0gbmV3IHdhZnYyLkNmbldlYkFDTCh0aGlzLCAnV2ViQUNMJywge1xuICAgICAgc2NvcGU6ICdSRUdJT05BTCcsXG4gICAgICBkZWZhdWx0QWN0aW9uOiB7IGFsbG93OiB7fSB9LFxuICAgICAgbmFtZTogYEJDT1MtJHtlbnZpcm9ubWVudH0tV2ViQUNMYCxcbiAgICAgIGRlc2NyaXB0aW9uOiBgV0FGIHByb3RlY3Rpb24gZm9yIEJDT1MgJHtlbnZpcm9ubWVudH0gZW52aXJvbm1lbnRgLFxuICAgICAgcnVsZXM6IHJ1bGVzLFxuICAgICAgdmlzaWJpbGl0eUNvbmZpZzoge1xuICAgICAgICBzYW1wbGVkUmVxdWVzdHNFbmFibGVkOiB0cnVlLFxuICAgICAgICBjbG91ZFdhdGNoTWV0cmljc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgIG1ldHJpY05hbWU6IGBCQ09TLSR7ZW52aXJvbm1lbnR9LVdlYkFDTGAsXG4gICAgICB9LFxuICAgICAgdGFnczogW1xuICAgICAgICB7XG4gICAgICAgICAga2V5OiAnRW52aXJvbm1lbnQnLFxuICAgICAgICAgIHZhbHVlOiBlbnZpcm9ubWVudCxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIGtleTogJ0FwcGxpY2F0aW9uJyxcbiAgICAgICAgICB2YWx1ZTogJ0JDT1MnLFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAga2V5OiAnTWFuYWdlZEJ5JyxcbiAgICAgICAgICB2YWx1ZTogJ0NESycsXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gV0FGIGxvZ2dpbmcgZGlzYWJsZWQgdGVtcG9yYXJpbHkgZHVlIHRvIEFQSSBmb3JtYXQgaXNzdWVzXG4gICAgLy8gVE9ETzogUmUtZW5hYmxlIGFmdGVyIGZpeGluZyByZWRhY3RlZEZpZWxkcyBmb3JtYXRcbiAgICAvLyBuZXcgd2FmdjIuQ2ZuTG9nZ2luZ0NvbmZpZ3VyYXRpb24odGhpcywgJ1dBRkxvZ2dpbmdDb25maWd1cmF0aW9uJywge1xuICAgIC8vICAgcmVzb3VyY2VBcm46IHRoaXMud2ViQWNsLmF0dHJBcm4sXG4gICAgLy8gICBsb2dEZXN0aW5hdGlvbkNvbmZpZ3M6IFt0aGlzLmxvZ0dyb3VwLmxvZ0dyb3VwQXJuXSxcbiAgICAvLyB9KTtcblxuICAgIC8vIE91dHB1dCB0aGUgV2ViIEFDTCBBUk5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnV2ViQUNMQXJuJywge1xuICAgICAgdmFsdWU6IHRoaXMud2ViQWNsLmF0dHJBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogYFdBRiBXZWIgQUNMIEFSTiBmb3IgJHtlbnZpcm9ubWVudH1gLFxuICAgICAgZXhwb3J0TmFtZTogYEJDT1MtJHtlbnZpcm9ubWVudH0tV2ViQUNMLUFybmAsXG4gICAgfSk7XG5cbiAgICAvLyBPdXRwdXQgdGhlIFdlYiBBQ0wgSURcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnV2ViQUNMSWQnLCB7XG4gICAgICB2YWx1ZTogdGhpcy53ZWJBY2wuYXR0cklkLFxuICAgICAgZGVzY3JpcHRpb246IGBXQUYgV2ViIEFDTCBJRCBmb3IgJHtlbnZpcm9ubWVudH1gLFxuICAgICAgZXhwb3J0TmFtZTogYEJDT1MtJHtlbnZpcm9ubWVudH0tV2ViQUNMLUlkYCxcbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBBc3NvY2lhdGUgdGhlIFdlYiBBQ0wgd2l0aCBhbiBBcHBsaWNhdGlvbiBMb2FkIEJhbGFuY2VyXG4gICAqL1xuICBwdWJsaWMgYXNzb2NpYXRlV2l0aExvYWRCYWxhbmNlcihsb2FkQmFsYW5jZXJBcm46IHN0cmluZyk6IHdhZnYyLkNmbldlYkFDTEFzc29jaWF0aW9uIHtcbiAgICByZXR1cm4gbmV3IHdhZnYyLkNmbldlYkFDTEFzc29jaWF0aW9uKHRoaXMsICdXZWJBQ0xBc3NvY2lhdGlvbicsIHtcbiAgICAgIHJlc291cmNlQXJuOiBsb2FkQmFsYW5jZXJBcm4sXG4gICAgICB3ZWJBY2xBcm46IHRoaXMud2ViQWNsLmF0dHJBcm4sXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==