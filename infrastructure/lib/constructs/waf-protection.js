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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2FmLXByb3RlY3Rpb24uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ3YWYtcHJvdGVjdGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMsNkRBQStDO0FBQy9DLDJEQUE2QztBQUU3QywyQ0FBdUM7QUFtQ3ZDOzs7R0FHRztBQUNILE1BQWEsYUFBYyxTQUFRLHNCQUFTO0lBQzFCLE1BQU0sQ0FBa0I7SUFDeEIsUUFBUSxDQUFnQjtJQUV4QyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQXlCO1FBQ2pFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsTUFBTSxFQUNKLFdBQVcsRUFDWCxNQUFNLEVBQ04sY0FBYyxHQUFHLFdBQVcsS0FBSyxZQUFZLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUMzRCxpQkFBaUIsR0FBRyxLQUFLLEVBQ3pCLGdCQUFnQixHQUFHLEVBQUUsRUFDckIsa0JBQWtCLEdBQUcsV0FBVyxLQUFLLFlBQVksR0FDbEQsR0FBRyxLQUFLLENBQUM7UUFFViwwRUFBMEU7UUFDMUUsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLGFBQWEsRUFBRTtZQUNyRCxZQUFZLEVBQUUsaUJBQWlCLFdBQVcsRUFBRTtZQUM1QyxTQUFTLEVBQUUsV0FBVyxLQUFLLFlBQVksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsU0FBUztZQUN4RyxhQUFhLEVBQUUsR0FBRyxDQUFDLGFBQWEsQ0FBQyxNQUFNO1NBQ3hDLENBQUMsQ0FBQztRQUVILHdCQUF3QjtRQUN4QixNQUFNLEtBQUssR0FBbUMsRUFBRSxDQUFDO1FBQ2pELElBQUksUUFBUSxHQUFH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RTtZQUNqRCxVQUFVLEVBQUUsUUFBUSxXQUFXLGFBQWE7U0FDN0MsQ0FBQyxDQUFDO1FBRUgsd0JBQXdCO1FBQ3hCLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsVUFBVSxFQUFFO1lBQ2xDLEtBQUssRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU07WUFDekIsV0FBVyxFQUFFLHNCQUFzQixXQUFXLEVBQUU7WUFDaEQsVUFBVSxFQUFFLFFBQVEsV0FBVyxZQUFZO1NBQzVDLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFRDs7T0FFRztJQUNJLHlCQUF5QixDQUFDLGVBQXVCO1FBQ3RELE9BQU8sSUFBSSxLQUFLLENBQUMsb0JBQW9CLENBQUMsSUFBSSxFQUFFLG1CQUFtQixFQUFFO1lBQy9ELFdBQVcsRUFBRSxlQUFlO1lBQzVCLFNBQVMsRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU87U0FDL0IsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBL09ELHNDQStPQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgKiBhcyB3YWZ2MiBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtd2FmdjInO1xuaW1wb3J0ICogYXMgbG9ncyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbG9ncyc7XG5pbXBvcnQgKiBhcyBrbXMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWttcyc7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcblxuZXhwb3J0IGludGVyZmFjZSBXYWZQcm90ZWN0aW9uUHJvcHMge1xuICAvKipcbiAgICogRW52aXJvbm1lbnQgbmFtZSAoc3RhZ2luZyBvciBwcm9kdWN0aW9uKVxuICAgKi9cbiAgZW52aXJvbm1lbnQ6IHN0cmluZztcblxuICAvKipcbiAgICogS01TIGtleSBmb3IgbG9nIGVuY3J5cHRpb25cbiAgICovXG4gIGttc0tleToga21zLklLZXk7XG5cbiAgLyoqXG4gICAqIFJhdGUgbGltaXQgcGVyIElQIGFkZHJlc3MgKHJlcXVlc3RzIHBlciA1IG1pbnV0ZXMpXG4gICAqIERlZmF1bHQ6IDEwMDAgZm9yIHByb2R1Y3Rpb24sIDIwMDAgZm9yIHN0YWdpbmdcbiAgICovXG4gIHJhdGVMaW1pdFBlcklQPzogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBFbmFibGUgZ2VvLWJsb2NraW5nIChkZWZhdWx0OiBmYWxzZSlcbiAgICovXG4gIGVuYWJsZUdlb0Jsb2NraW5nPzogYm9vbGVhbjtcblxuICAvKipcbiAgICogTGlzdCBvZiBjb3VudHJ5IGNvZGVzIHRvIGJsb2NrIChpZiBnZW8tYmxvY2tpbmcgZW5hYmxlZClcbiAgICovXG4gIGJsb2NrZWRDb3VudHJpZXM/OiBzdHJpbmdbXTtcblxuICAvKipcbiAgICogRW5hYmxlIGFkZGl0aW9uYWwgbWFuYWdlZCBydWxlcyAoZGVmYXVsdDogdHJ1ZSBmb3IgcHJvZHVjdGlvbilcbiAgICovXG4gIGVuYWJsZU1hbmFnZWRSdWxlcz86IGJvb2xlYW47XG59XG5cbi8qKlxuICogV0FGIHByb3RlY3Rpb24gY29uc3RydWN0IHRoYXQgY3JlYXRlcyBhIFdlYiBBQ0wgd2l0aCBzZWN1cml0eSBydWxlc1xuICogdG8gcHJvdGVjdCB0aGUgYXBwbGljYXRpb24gZnJvbSBjb21tb24gd2ViIGF0dGFja3NcbiAqL1xuZXhwb3J0IGNsYXNzIFdhZlByb3RlY3Rpb24gZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICBwdWJsaWMgcmVhZG9ubHkgd2ViQWNsOiB3YWZ2Mi5DZm5XZWJBQ0w7XG4gIHB1YmxpYyByZWFkb25seSBsb2dHcm91cDogbG9ncy5Mb2dHcm91cDtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogV2FmUHJvdGVjdGlvblByb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcblxuICAgIGNvbnN0IHtcbiAgICAgIGVudmlyb25tZW50LFxuICAgICAga21zS2V5LFxuICAgICAgcmF0ZUxpbWl0UGVySVAgPSBlbnZpcm9ubWVudCA9PT0gJ3Byb2R1Y3Rpb24nID8gMTAwMCA6IDIwMDAsXG4gICAgICBlbmFibGVHZW9CbG9ja2luZyA9IGZhbHNlLFxuICAgICAgYmxvY2tlZENvdW50cmllcyA9IFtdLFxuICAgICAgZW5hYmxlTWFuYWdlZFJ1bGVzID0gZW52aXJvbm1lbnQgPT09ICdwcm9kdWN0aW9uJyxcbiAgICB9ID0gcHJvcHM7XG5cbiAgICAvLyBDcmVhdGUgQ2xvdWRXYXRjaCBsb2cgZ3JvdXAgZm9yIFdBRiBsb2dzICh1c2luZyBBV1MgbWFuYWdlZCBlbmNyeXB0aW9uKVxuICAgIHRoaXMubG9nR3JvdXAgPSBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnV0FGTG9nR3JvdXAnLCB7XG4gICAgICBsb2dHcm91cE5hbWU6IGAvYXdzL3dhZi9iY29zLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgIHJldGVudGlvbjogZW52aXJvbm1lbnQgPT09ICdwcm9kdWN0aW9uJyA/IGxvZ3MuUmV0ZW50aW9uRGF5cy5USFJFRV9NT05USFMgOiBsb2dzLlJldGVudGlvbkRheXMuT05FX01PTlRILFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxuICAgIH0pO1xuXG4gICAgLy8gQnVpbGQgV0FGIHJ1bGVzIGFycmF5XG4gICAgY29uc3QgcnVsZXM6IHdhZnYyLkNmbldlYkFDTC5SdWxlUHJvcGVydHlbXSA9IFtdO1xuICAgIGxldCBwcmlvcml0eSA9IDE7XG5cbiAgICAvLyBBV1MgTWFuYWdlZCBDb3JlIFJ1bGUgU2V0IChPV0FTUCBUb3AgMTApXG4gICAgaWYgKGVuYWJsZU1hbmFnZWRSdWxlcykge1xuICAgICAgcnVsZXMucHVzaCh7XG4gICAgICAgIG5hbWU6ICdBV1MtQVdTTWFuYWdlZFJ1bGVzQ29tbW9uUnVsZVNldCcsXG4gICAgICAgIHByaW9yaXR5OiBwcmlvcml0eSsrLFxuICAgICAgICBvdmVycmlkZUFjdGlvbjogeyBub25lOiB7fSB9LFxuICAgICAgICBzdGF0ZW1lbnQ6IHtcbiAgICAgICAgICBtYW5hZ2VkUnVsZUdyb3VwU3RhdGVtZW50OiB7XG4gICAgICAgICAgICB2ZW5kb3JOYW1lOiAnQVdTJyxcbiAgICAgICAgICAgIG5hbWU6ICdBV1NNYW5hZ2VkUnVsZXNDb21tb25SdWxlU2V0JyxcbiAgICAgICAgICAgIC8vIEV4Y2x1ZGUgc3BlY2lmaWMgcnVsZXMgaWYgbmVlZGVkXG4gICAgICAgICAgICBleGNsdWRlZFJ1bGVzOiBbXSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICB2aXNpYmlsaXR5Q29uZmlnOiB7XG4gICAgICAgICAgc2FtcGxlZFJlcXVlc3RzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICBjbG91ZFdhdGNoTWV0cmljc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgbWV0cmljTmFtZTogYENvbW1vblJ1bGVTZXQtJHtlbnZpcm9ubWVudH1gLFxuICAgICAgICB9LFxuICAgICAgfSk7XG5cbiAgICAgIC8vIEFXUyBNYW5hZ2VkIEtub3duIEJhZCBJbnB1dHMgUnVsZSBTZXRcbiAgICAgIHJ1bGVzLnB1c2goe1xuICAgICAgICBuYW1lOiAnQVdTLUFXU01hbmFnZWRSdWxlc0tub3duQmFkSW5wdXRzUnVsZVNldCcsXG4gICAgICAgIHByaW9yaXR5OiBwcmlvcml0eSsrLFxuICAgICAgICBvdmVycmlkZUFjdGlvbjogeyBub25lOiB7fSB9LFxuICAgICAgICBzdGF0ZW1lbnQ6IHtcbiAgICAgICAgICBtYW5hZ2VkUnVsZUdyb3VwU3RhdGVtZW50OiB7XG4gICAgICAgICAgICB2ZW5kb3JOYW1lOiAnQVdTJyxcbiAgICAgICAgICAgIG5hbWU6ICdBV1NNYW5hZ2VkUnVsZXNLbm93bkJhZElucHV0c1J1bGVTZXQnLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIHZpc2liaWxpdHlDb25maWc6IHtcbiAgICAgICAgICBzYW1wbGVkUmVxdWVzdHNFbmFibGVkOiB0cnVlLFxuICAgICAgICAgIGNsb3VkV2F0Y2hNZXRyaWNzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICBtZXRyaWNOYW1lOiBgS25vd25CYWRJbnB1dHMtJHtlbnZpcm9ubWVudH1gLFxuICAgICAgICB9LFxuICAgICAgfSk7XG5cbiAgICAgIC8vIEFXUyBNYW5hZ2VkIE9XQVNQIFRvcCAxMCBSdWxlIFNldCAocHJvZHVjdGlvbiBvbmx5KVxuICAgICAgaWYgKGVudmlyb25tZW50ID09PSAncHJvZHVjdGlvbicpIHtcbiAgICAgICAgcnVsZXMucHVzaCh7XG4gICAgICAgICAgbmFtZTogJ0FXUy1BV1NNYW5hZ2VkUnVsZXNPV0FTUFRvcFRlblJ1bGVTZXQnLFxuICAgICAgICAgIHByaW9yaXR5OiBwcmlvcml0eSsrLFxuICAgICAgICAgIG92ZXJyaWRlQWN0aW9uOiB7IG5vbmU6IHt9IH0sXG4gICAgICAgICAgc3RhdGVtZW50OiB7XG4gICAgICAgICAgICBtYW5hZ2VkUnVsZUdyb3VwU3RhdGVtZW50OiB7XG4gICAgICAgICAgICAgIHZlbmRvck5hbWU6ICdBV1MnLFxuICAgICAgICAgICAgICBuYW1lOiAnQVdTTWFuYWdlZFJ1bGVzT1dBU1BUb3BUZW5SdWxlU2V0JyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgICB2aXNpYmlsaXR5Q29uZmlnOiB7XG4gICAgICAgICAgICBzYW1wbGVkUmVxdWVzdHNFbmFibGVkOiB0cnVlLFxuICAgICAgICAgICAgY2xvdWRXYXRjaE1ldHJpY3NFbmFibGVkOiB0cnVlLFxuICAgICAgICAgICAgbWV0cmljTmFtZTogYE9XQVNQVG9wVGVuLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBSYXRlIGxpbWl0aW5nIHJ1bGVcbiAgICBydWxlcy5wdXNoKHtcbiAgICAgIG5hbWU6IGBSYXRlTGltaXRSdWxlLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgIHByaW9yaXR5OiBwcmlvcml0eSsrLFxuICAgICAgYWN0aW9uOiB7IGJsb2NrOiB7fSB9LFxuICAgICAgc3RhdGVtZW50OiB7XG4gICAgICAgIHJhdGVCYXNlZFN0YXRlbWVudDoge1xuICAgICAgICAgIGxpbWl0OiByYXRlTGltaXRQZXJJUCxcbiAgICAgICAgICBhZ2dyZWdhdGVLZXlUeXBlOiAnSVAnLFxuICAgICAgICAgIHNjb3BlRG93blN0YXRlbWVudDoge1xuICAgICAgICAgICAgbm90U3RhdGVtZW50OiB7XG4gICAgICAgICAgICAgIHN0YXRlbWVudDoge1xuICAgICAgICAgICAgICAgIGJ5dGVNYXRjaFN0YXRlbWVudDoge1xuICAgICAgICAgICAgICAgICAgc2VhcmNoU3RyaW5nOiAnL2hlYWx0aCcsXG4gICAgICAgICAgICAgICAgICBmaWVsZFRvTWF0Y2g6IHsgdXJpUGF0aDoge30gfSxcbiAgICAgICAgICAgICAgICAgIHRleHRUcmFuc2Zvcm1hdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgIHByaW9yaXR5OiAwLFxuICAgICAgICAgICAgICAgICAgICAgIHR5cGU6ICdMT1dFUkNBU0UnLFxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgICAgIHBvc2l0aW9uYWxDb25zdHJhaW50OiAnU1RBUlRTX1dJVEgnLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgdmlzaWJpbGl0eUNvbmZpZzoge1xuICAgICAgICBzYW1wbGVkUmVxdWVzdHNFbmFibGVkOiB0cnVlLFxuICAgICAgICBjbG91ZFdhdGNoTWV0cmljc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgIG1ldHJpY05hbWU6IGBSYXRlTGltaXQtJHtlbnZpcm9ubWVudH1gLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIEdlb2dyYXBoaWMgYmxvY2tpbmcgcnVsZSAoaWYgZW5hYmxlZClcbiAgICBpZiAoZW5hYmxlR2VvQmxvY2tpbmcgJiYgYmxvY2tlZENvdW50cmllcy5sZW5ndGggPiAwKSB7XG4gICAgICBydWxlcy5wdXNoKHtcbiAgICAgICAgbmFtZTogYEdlb0Jsb2NrUnVsZS0ke2Vudmlyb25tZW50fWAsXG4gICAgICAgIHByaW9yaXR5OiBwcmlvcml0eSsrLFxuICAgICAgICBhY3Rpb246IHsgYmxvY2s6IHt9IH0sXG4gICAgICAgIHN0YXRlbWVudDoge1xuICAgICAgICAgIGdlb01hdGNoU3RhdGVtZW50OiB7XG4gICAgICAgICAgICBjb3VudHJ5Q29kZXM6IGJsb2NrZWRDb3VudHJpZXMsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgdmlzaWJpbGl0eUNvbmZpZzoge1xuICAgICAgICAgIHNhbXBsZWRSZXF1ZXN0c0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgY2xvdWRXYXRjaE1ldHJpY3NFbmFibGVkOiB0cnVlLFxuICAgICAgICAgIG1ldHJpY05hbWU6IGBHZW9CbG9jay0ke2Vudmlyb25tZW50fWAsXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBDdXN0b20gcnVsZSBmb3IgQVBJIGFidXNlIHByb3RlY3Rpb25cbiAgICBpZiAoZW52aXJvbm1lbnQgPT09ICdwcm9kdWN0aW9uJykge1xuICAgICAgcnVsZXMucHVzaCh7XG4gICAgICAgIG5hbWU6IGBBUElBYnVzZVByb3RlY3Rpb24tJHtlbnZpcm9ubWVudH1gLFxuICAgICAgICBwcmlvcml0eTogcHJpb3JpdHkrKyxcbiAgICAgICAgYWN0aW9uOiB7IGJsb2NrOiB7fSB9LFxuICAgICAgICBzdGF0ZW1lbnQ6IHtcbiAgICAgICAgICBhbmRTdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgIHN0YXRlbWVudHM6IFtcbiAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGJ5dGVNYXRjaFN0YXRlbWVudDoge1xuICAgICAgICAgICAgICAgICAgc2VhcmNoU3RyaW5nOiAnL2FwaS8nLFxuICAgICAgICAgICAgICAgICAgZmllbGRUb01hdGNoOiB7IHVyaVBhdGg6IHt9IH0sXG4gICAgICAgICAgICAgICAgICB0ZXh0VHJhbnNmb3JtYXRpb25zOiBbXG4gICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICBwcmlvcml0eTogMCxcbiAgICAgICAgICAgICAgICAgICAgICB0eXBlOiAnTE9XRVJDQVNFJyxcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgICAgICBwb3NpdGlvbmFsQ29uc3RyYWludDogJ1NUQVJUU19XSVRIJyxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgcmF0ZUJhc2VkU3RhdGVtZW50OiB7XG4gICAgICAgICAgICAgICAgICBsaW1pdDogNTAwLCAvLyBNb3JlIHJlc3RyaWN0aXZlIGZvciBBUEkgZW5kcG9pbnRzXG4gICAgICAgICAgICAgICAgICBhZ2dyZWdhdGVLZXlUeXBlOiAnSVAnLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBdLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIHZpc2liaWxpdHlDb25maWc6IHtcbiAgICAgICAgICBzYW1wbGVkUmVxdWVzdHNFbmFibGVkOiB0cnVlLFxuICAgICAgICAgIGNsb3VkV2F0Y2hNZXRyaWNzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICBtZXRyaWNOYW1lOiBgQVBJQWJ1c2VQcm90ZWN0aW9uLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIENyZWF0ZSB0aGUgV2ViIEFDTFxuICAgIHRoaXMud2ViQWNsID0gbmV3IHdhZnYyLkNmbldlYkFDTCh0aGlzLCAnV2ViQUNMJywge1xuICAgICAgc2NvcGU6ICdSRUdJT05BTCcsXG4gICAgICBkZWZhdWx0QWN0aW9uOiB7IGFsbG93OiB7fSB9LFxuICAgICAgbmFtZTogYEJDT1MtJHtlbnZpcm9ubWVudH0tV2ViQUNMYCxcbiAgICAgIGRlc2NyaXB0aW9uOiBgV0FGIHByb3RlY3Rpb24gZm9yIEJDT1MgJHtlbnZpcm9ubWVudH0gZW52aXJvbm1lbnRgLFxuICAgICAgcnVsZXM6IHJ1bGVzLFxuICAgICAgdmlzaWJpbGl0eUNvbmZpZzoge1xuICAgICAgICBzYW1wbGVkUmVxdWVzdHNFbmFibGVkOiB0cnVlLFxuICAgICAgICBjbG91ZFdhdGNoTWV0cmljc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgIG1ldHJpY05hbWU6IGBCQ09TLSR7ZW52aXJvbm1lbnR9LVdlYkFDTGAsXG4gICAgICB9LFxuICAgICAgdGFnczogW1xuICAgICAgICB7XG4gICAgICAgICAga2V5OiAnRW52aXJvbm1lbnQnLFxuICAgICAgICAgIHZhbHVlOiBlbnZpcm9ubWVudCxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIGtleTogJ0FwcGxpY2F0aW9uJyxcbiAgICAgICAgICB2YWx1ZTogJ0JDT1MnLFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAga2V5OiAnTWFuYWdlZEJ5JyxcbiAgICAgICAgICB2YWx1ZTogJ0NESycsXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gV0FGIGxvZ2dpbmcgZGlzYWJsZWQgdGVtcG9yYXJpbHkgZHVlIHRvIEFQSSBmb3JtYXQgaXNzdWVzXG4gICAgLy8gVE9ETzogUmUtZW5hYmxlIGFmdGVyIGZpeGluZyByZWRhY3RlZEZpZWxkcyBmb3JtYXRcbiAgICAvLyBuZXcgd2FmdjIuQ2ZuTG9nZ2luZ0NvbmZpZ3VyYXRpb24odGhpcywgJ1dBRkxvZ2dpbmdDb25maWd1cmF0aW9uJywge1xuICAgIC8vICAgcmVzb3VyY2VBcm46IHRoaXMud2ViQWNsLmF0dHJBcm4sXG4gICAgLy8gICBsb2dEZXN0aW5hdGlvbkNvbmZpZ3M6IFt0aGlzLmxvZ0dyb3VwLmxvZ0dyb3VwQXJuXSxcbiAgICAvLyB9KTtcblxuICAgIC8vIE91dHB1dCB0aGUgV2ViIEFDTCBBUk5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnV2ViQUNMQXJuJywge1xuICAgICAgdmFsdWU6IHRoaXMud2ViQWNsLmF0dHJBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogYFdBRiBXZWIgQUNMIEFSTiBmb3IgJHtlbnZpcm9ubWVudH1gLFxuICAgICAgZXhwb3J0TmFtZTogYEJDT1MtJHtlbnZpcm9ubWVudH0tV2ViQUNMLUFybmAsXG4gICAgfSk7XG5cbiAgICAvLyBPdXRwdXQgdGhlIFdlYiBBQ0wgSURcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnV2ViQUNMSWQnLCB7XG4gICAgICB2YWx1ZTogdGhpcy53ZWJBY2wuYXR0cklkLFxuICAgICAgZGVzY3JpcHRpb246IGBXQUYgV2ViIEFDTCBJRCBmb3IgJHtlbnZpcm9ubWVudH1gLFxuICAgICAgZXhwb3J0TmFtZTogYEJDT1MtJHtlbnZpcm9ubWVudH0tV2ViQUNMLUlkYCxcbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBBc3NvY2lhdGUgdGhlIFdlYiBBQ0wgd2l0aCBhbiBBcHBsaWNhdGlvbiBMb2FkIEJhbGFuY2VyXG4gICAqL1xuICBwdWJsaWMgYXNzb2NpYXRlV2l0aExvYWRCYWxhbmNlcihsb2FkQmFsYW5jZXJBcm46IHN0cmluZyk6IHdhZnYyLkNmbldlYkFDTEFzc29jaWF0aW9uIHtcbiAgICByZXR1cm4gbmV3IHdhZnYyLkNmbldlYkFDTEFzc29jaWF0aW9uKHRoaXMsICdXZWJBQ0xBc3NvY2lhdGlvbicsIHtcbiAgICAgIHJlc291cmNlQXJuOiBsb2FkQmFsYW5jZXJBcm4sXG4gICAgICB3ZWJBY2xBcm46IHRoaXMud2ViQWNsLmF0dHJBcm4sXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==