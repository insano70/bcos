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
exports.WafLoggingConfig = void 0;
const cr = __importStar(require("aws-cdk-lib/custom-resources"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const logs = __importStar(require("aws-cdk-lib/aws-logs"));
const constructs_1 = require("constructs");
/**
 * Custom Resource for WAF Logging Configuration
 *
 * This handles the AWS limitation where only one logging config per WebACL is allowed.
 * Instead of failing when a config exists, it updates the existing one.
 */
class WafLoggingConfig extends constructs_1.Construct {
    constructor(scope, id, props) {
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
exports.WafLoggingConfig = WafLoggingConfig;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2FmLWxvZ2dpbmctY29uZmlnLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsid2FmLWxvZ2dpbmctY29uZmlnLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUNBLGlFQUFtRDtBQUNuRCx5REFBMkM7QUFDM0MsMkRBQTZDO0FBQzdDLDJDQUF1QztBQVd2Qzs7Ozs7R0FLRztBQUNILE1BQWEsZ0JBQWlCLFNBQVEsc0JBQVM7SUFDN0MsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUE0QjtRQUNwRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRWpCLGdFQUFnRTtRQUNoRSxNQUFNLGNBQWMsR0FBRyxJQUFJLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLEVBQUUsVUFBVSxFQUFFO1lBQ2hFLFFBQVEsRUFBRTtnQkFDUixPQUFPLEVBQUUsT0FBTztnQkFDaEIsTUFBTSxFQUFFLHlCQUF5QjtnQkFDakMsVUFBVSxFQUFFO29CQUNWLG9CQUFvQixFQUFFO3dCQUNwQixXQUFXLEVBQUUsS0FBSyxDQUFDLFNBQVM7d0JBQzVCLHFCQUFxQixFQUFFLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQzt3QkFDMUMsY0FBYyxFQUFFLEtBQUssQ0FBQyxjQUFjLElBQUksRUFBRTtxQkFDM0M7aUJBQ0Y7Z0JBQ0Qsa0JBQWtCLEVBQUUsRUFBRSxDQUFDLGtCQUFrQixDQUFDLEVBQUUsQ0FBQyxlQUFlLEtBQUssQ0FBQyxTQUFTLEVBQUUsQ0FBQzthQUMvRTtZQUNELFFBQVEsRUFBRTtnQkFDUixPQUFPLEVBQUUsT0FBTztnQkFDaEIsTUFBTSxFQUFFLHlCQUF5QjtnQkFDakMsVUFBVSxFQUFFO29CQUNWLG9CQUFvQixFQUFFO3dCQUNwQixXQUFXLEVBQUUsS0FBSyxDQUFDLFNBQVM7d0JBQzVCLHFCQUFxQixFQUFFLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQzt3QkFDMUMsY0FBYyxFQUFFLEtBQUssQ0FBQyxjQUFjLElBQUksRUFBRTtxQkFDM0M7aUJBQ0Y7Z0JBQ0Qsa0JBQWtCLEVBQUUsRUFBRSxDQUFDLGtCQUFrQixDQUFDLEVBQUUsQ0FBQyxlQUFlLEtBQUssQ0FBQyxTQUFTLEVBQUUsQ0FBQzthQUMvRTtZQUNELFFBQVEsRUFBRTtnQkFDUixPQUFPLEVBQUUsT0FBTztnQkFDaEIsTUFBTSxFQUFFLDRCQUE0QjtnQkFDcEMsVUFBVSxFQUFFO29CQUNWLFdBQVcsRUFBRSxLQUFLLENBQUMsU0FBUztpQkFDN0I7Z0JBQ0Qsa0RBQWtEO2dCQUNsRCx3QkFBd0IsRUFBRSw2QkFBNkI7YUFDeEQ7WUFDRCxNQUFNLEVBQUUsRUFBRSxDQUFDLHVCQUF1QixDQUFDLGNBQWMsQ0FBQztnQkFDaEQsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDO29CQUN0QixPQUFPLEVBQUU7d0JBQ1AsK0JBQStCO3dCQUMvQixrQ0FBa0M7d0JBQ2xDLCtCQUErQjtxQkFDaEM7b0JBQ0QsU0FBUyxFQUFFLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQztpQkFDN0IsQ0FBQztnQkFDRixJQUFJLEdBQUcsQ0FBQyxlQUFlLENBQUM7b0JBQ3RCLE9BQU8sRUFBRSxDQUFDLHdCQUF3QixFQUFFLHdCQUF3QixDQUFDO29CQUM3RCxTQUFTLEVBQUUsQ0FBQyxHQUFHLENBQUM7aUJBQ2pCLENBQUM7YUFDSCxDQUFDO1lBQ0YsWUFBWSxFQUFFLElBQUksQ0FBQyxhQUFhLENBQUMsUUFBUTtTQUMxQyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUF4REQsNENBd0RDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIGNyIGZyb20gJ2F3cy1jZGstbGliL2N1c3RvbS1yZXNvdXJjZXMnO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuaW1wb3J0ICogYXMgbG9ncyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbG9ncyc7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcblxuZXhwb3J0IGludGVyZmFjZSBXYWZMb2dnaW5nQ29uZmlnUHJvcHMge1xuICB3ZWJBY2xBcm46IHN0cmluZztcbiAgbG9nR3JvdXBBcm46IHN0cmluZztcbiAgcmVkYWN0ZWRGaWVsZHM/OiBBcnJheTx7XG4gICAgcXVlcnlTdHJpbmc/OiBSZWNvcmQ8c3RyaW5nLCBuZXZlcj47XG4gICAgc2luZ2xlSGVhZGVyPzogeyBOYW1lOiBzdHJpbmcgfTtcbiAgfT47XG59XG5cbi8qKlxuICogQ3VzdG9tIFJlc291cmNlIGZvciBXQUYgTG9nZ2luZyBDb25maWd1cmF0aW9uXG4gKlxuICogVGhpcyBoYW5kbGVzIHRoZSBBV1MgbGltaXRhdGlvbiB3aGVyZSBvbmx5IG9uZSBsb2dnaW5nIGNvbmZpZyBwZXIgV2ViQUNMIGlzIGFsbG93ZWQuXG4gKiBJbnN0ZWFkIG9mIGZhaWxpbmcgd2hlbiBhIGNvbmZpZyBleGlzdHMsIGl0IHVwZGF0ZXMgdGhlIGV4aXN0aW5nIG9uZS5cbiAqL1xuZXhwb3J0IGNsYXNzIFdhZkxvZ2dpbmdDb25maWcgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogV2FmTG9nZ2luZ0NvbmZpZ1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcblxuICAgIC8vIEN1c3RvbSByZXNvdXJjZSB0byBjcmVhdGUgb3IgdXBkYXRlIFdBRiBsb2dnaW5nIGNvbmZpZ3VyYXRpb25cbiAgICBjb25zdCBjdXN0b21SZXNvdXJjZSA9IG5ldyBjci5Bd3NDdXN0b21SZXNvdXJjZSh0aGlzLCAnUmVzb3VyY2UnLCB7XG4gICAgICBvbkNyZWF0ZToge1xuICAgICAgICBzZXJ2aWNlOiAnV0FGVjInLFxuICAgICAgICBhY3Rpb246ICdwdXRMb2dnaW5nQ29uZmlndXJhdGlvbicsXG4gICAgICAgIHBhcmFtZXRlcnM6IHtcbiAgICAgICAgICBMb2dnaW5nQ29uZmlndXJhdGlvbjoge1xuICAgICAgICAgICAgUmVzb3VyY2VBcm46IHByb3BzLndlYkFjbEFybixcbiAgICAgICAgICAgIExvZ0Rlc3RpbmF0aW9uQ29uZmlnczogW3Byb3BzLmxvZ0dyb3VwQXJuXSxcbiAgICAgICAgICAgIFJlZGFjdGVkRmllbGRzOiBwcm9wcy5yZWRhY3RlZEZpZWxkcyB8fCBbXSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICBwaHlzaWNhbFJlc291cmNlSWQ6IGNyLlBoeXNpY2FsUmVzb3VyY2VJZC5vZihgd2FmLWxvZ2dpbmctJHtwcm9wcy53ZWJBY2xBcm59YCksXG4gICAgICB9LFxuICAgICAgb25VcGRhdGU6IHtcbiAgICAgICAgc2VydmljZTogJ1dBRlYyJyxcbiAgICAgICAgYWN0aW9uOiAncHV0TG9nZ2luZ0NvbmZpZ3VyYXRpb24nLFxuICAgICAgICBwYXJhbWV0ZXJzOiB7XG4gICAgICAgICAgTG9nZ2luZ0NvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgICAgIFJlc291cmNlQXJuOiBwcm9wcy53ZWJBY2xBcm4sXG4gICAgICAgICAgICBMb2dEZXN0aW5hdGlvbkNvbmZpZ3M6IFtwcm9wcy5sb2dHcm91cEFybl0sXG4gICAgICAgICAgICBSZWRhY3RlZEZpZWxkczogcHJvcHMucmVkYWN0ZWRGaWVsZHMgfHwgW10sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgcGh5c2ljYWxSZXNvdXJjZUlkOiBjci5QaHlzaWNhbFJlc291cmNlSWQub2YoYHdhZi1sb2dnaW5nLSR7cHJvcHMud2ViQWNsQXJufWApLFxuICAgICAgfSxcbiAgICAgIG9uRGVsZXRlOiB7XG4gICAgICAgIHNlcnZpY2U6ICdXQUZWMicsXG4gICAgICAgIGFjdGlvbjogJ2RlbGV0ZUxvZ2dpbmdDb25maWd1cmF0aW9uJyxcbiAgICAgICAgcGFyYW1ldGVyczoge1xuICAgICAgICAgIFJlc291cmNlQXJuOiBwcm9wcy53ZWJBY2xBcm4sXG4gICAgICAgIH0sXG4gICAgICAgIC8vIElnbm9yZSBlcnJvcnMgb24gZGVsZXRlIGlmIGNvbmZpZyBkb2Vzbid0IGV4aXN0XG4gICAgICAgIGlnbm9yZUVycm9yQ29kZXNNYXRjaGluZzogJ1dBRk5vbmV4aXN0ZW50SXRlbUV4Y2VwdGlvbicsXG4gICAgICB9LFxuICAgICAgcG9saWN5OiBjci5Bd3NDdXN0b21SZXNvdXJjZVBvbGljeS5mcm9tU3RhdGVtZW50cyhbXG4gICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAnd2FmdjI6UHV0TG9nZ2luZ0NvbmZpZ3VyYXRpb24nLFxuICAgICAgICAgICAgJ3dhZnYyOkRlbGV0ZUxvZ2dpbmdDb25maWd1cmF0aW9uJyxcbiAgICAgICAgICAgICd3YWZ2MjpHZXRMb2dnaW5nQ29uZmlndXJhdGlvbicsXG4gICAgICAgICAgXSxcbiAgICAgICAgICByZXNvdXJjZXM6IFtwcm9wcy53ZWJBY2xBcm5dLFxuICAgICAgICB9KSxcbiAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgIGFjdGlvbnM6IFsnbG9nczpDcmVhdGVMb2dEZWxpdmVyeScsICdsb2dzOkRlbGV0ZUxvZ0RlbGl2ZXJ5J10sXG4gICAgICAgICAgcmVzb3VyY2VzOiBbJyonXSxcbiAgICAgICAgfSksXG4gICAgICBdKSxcbiAgICAgIGxvZ1JldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxuICAgIH0pO1xuICB9XG59XG4iXX0=