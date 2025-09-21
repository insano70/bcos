import * as cdk from 'aws-cdk-lib';
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
export class WafProtection extends Construct {
  public readonly webAcl: wafv2.CfnWebACL;
  public readonly logGroup: logs.LogGroup;

  constructor(scope: Construct, id: string, props: WafProtectionProps) {
    super(scope, id);

    const {
      environment,
      kmsKey,
      rateLimitPerIP = environment === 'production' ? 1000 : 2000,
      enableGeoBlocking = false,
      blockedCountries = [],
      enableManagedRules = environment === 'production',
    } = props;

    // Create CloudWatch log group for WAF logs (using AWS managed encryption)
    this.logGroup = new logs.LogGroup(this, 'WAFLogGroup', {
      logGroupName: `/aws/waf/bcos-${environment}-${Date.now()}`,
      retention: environment === 'production' ? logs.RetentionDays.THREE_MONTHS : logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Build WAF rules array
    const rules: wafv2.CfnWebACL.RuleProperty[] = [];
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
  public associateWithLoadBalancer(loadBalancerArn: string): wafv2.CfnWebACLAssociation {
    return new wafv2.CfnWebACLAssociation(this, 'WebACLAssociation', {
      resourceArn: loadBalancerArn,
      webAclArn: this.webAcl.attrArn,
    });
  }
}
