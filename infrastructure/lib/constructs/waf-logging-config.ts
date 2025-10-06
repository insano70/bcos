import * as cdk from 'aws-cdk-lib';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface WafLoggingConfigProps {
  webAclArn: string;
  logGroupArn: string;
  redactedFields?: Array<{
    queryString?: Record<string, never>;
    singleHeader?: { Name: string };
  }>;
}

/**
 * Custom Resource for WAF Logging Configuration
 *
 * This handles the AWS limitation where only one logging config per WebACL is allowed.
 * Instead of failing when a config exists, it updates the existing one.
 */
export class WafLoggingConfig extends Construct {
  constructor(scope: Construct, id: string, props: WafLoggingConfigProps) {
    super(scope, id);

    // Custom resource to create or update WAF logging configuration
    const customResource = new cr.AwsCustomResource(this, 'Resource', {
      onCreate: {
        service: 'WAFV2',
        action: 'putLoggingConfiguration',
        parameters: {
          LoggingConfiguration: {
            ResourceArn: props.webAclArn,
            LogDestinationConfigs: [props.logGroupArn],
            RedactedFields: props.redactedFields || [],
          },
        },
        physicalResourceId: cr.PhysicalResourceId.of(`waf-logging-${props.webAclArn}`),
      },
      onUpdate: {
        service: 'WAFV2',
        action: 'putLoggingConfiguration',
        parameters: {
          LoggingConfiguration: {
            ResourceArn: props.webAclArn,
            LogDestinationConfigs: [props.logGroupArn],
            RedactedFields: props.redactedFields || [],
          },
        },
        physicalResourceId: cr.PhysicalResourceId.of(`waf-logging-${props.webAclArn}`),
      },
      onDelete: {
        service: 'WAFV2',
        action: 'deleteLoggingConfiguration',
        parameters: {
          ResourceArn: props.webAclArn,
        },
        // Ignore errors on delete if config doesn't exist
        ignoreErrorCodesMatching: 'WAFNonexistentItemException',
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: [
            'wafv2:PutLoggingConfiguration',
            'wafv2:DeleteLoggingConfiguration',
            'wafv2:GetLoggingConfiguration',
          ],
          resources: [props.webAclArn],
        }),
        new iam.PolicyStatement({
          actions: ['logs:CreateLogDelivery', 'logs:DeleteLogDelivery'],
          resources: ['*'],
        }),
      ]),
      logRetention: logs.RetentionDays.ONE_WEEK,
    });
  }
}
