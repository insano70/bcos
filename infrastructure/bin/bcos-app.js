#!/usr/bin/env node
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
require("source-map-support/register");
const cdk = __importStar(require("aws-cdk-lib"));
const security_stack_1 = require("../lib/stacks/security-stack");
const network_stack_1 = require("../lib/stacks/network-stack");
const staging_stack_1 = require("../lib/stacks/staging-stack");
const production_stack_1 = require("../lib/stacks/production-stack");
// Environment configuration
const account = process.env.AWS_ACCOUNT_ID || process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.AWS_REGION || process.env.CDK_DEFAULT_REGION || 'us-east-1';
if (!account) {
    throw new Error('AWS_ACCOUNT_ID must be set');
}
const app = new cdk.App();
// Common environment config
const env = { account, region };
// Common tags applied to all resources
const commonTags = {
    Project: 'BCOS',
    Environment: 'Multi',
    ManagedBy: 'CDK',
    Owner: 'DevOps',
    CostCenter: 'Engineering'
};
// Security Stack - Contains IAM roles, KMS keys, and secrets
const securityStack = new security_stack_1.SecurityStack(app, 'BCOS-SecurityStack', {
    env,
    description: 'BCOS Security infrastructure - IAM roles, KMS keys, and secrets management',
    tags: {
        ...commonTags,
        StackType: 'Security'
    }
});
// Network Stack - Contains VPC lookup, security groups, and load balancer
const networkStack = new network_stack_1.NetworkStack(app, 'BCOS-NetworkStack', {
    env,
    description: 'BCOS Network infrastructure - VPC, security groups, and load balancer',
    kmsKey: securityStack.kmsKey,
    tags: {
        ...commonTags,
        StackType: 'Network'
    }
});
// Add dependency to ensure security stack deploys first
networkStack.addDependency(securityStack);
// Application stacks (using CDK imports/exports to avoid circular dependencies)
const stagingStack = new staging_stack_1.StagingStack(app, 'BCOS-StagingStack', {
    env,
    description: 'BCOS Staging environment - Complete staging deployment',
    tags: {
        ...commonTags,
        Environment: 'Staging',
        StackType: 'Application'
    }
});
const productionStack = new production_stack_1.ProductionStack(app, 'BCOS-ProductionStack', {
    env,
    description: 'BCOS Production environment - Complete production deployment',
    tags: {
        ...commonTags,
        Environment: 'Production',
        StackType: 'Application'
    }
});
// Stack dependencies managed via CloudFormation imports (no direct dependencies)
// Deploy order: SecurityStack -> NetworkStack -> StagingStack -> ProductionStack
// Output important values for GitHub Actions
new cdk.CfnOutput(securityStack, 'GitHubActionsRoleArn', {
    value: securityStack.githubActionsRole.roleArn,
    description: 'GitHub Actions OIDC Role ARN for CI/CD authentication',
    exportName: 'BCOS-GitHubActionsRoleArn'
});
new cdk.CfnOutput(networkStack, 'LoadBalancerDNS', {
    value: networkStack.loadBalancer.loadBalancerDnsName,
    description: 'Application Load Balancer DNS name',
    exportName: 'BCOS-LoadBalancerDNS'
});
new cdk.CfnOutput(securityStack, 'ECRRepositoryUri', {
    value: securityStack.ecrRepository.repositoryUri,
    description: 'ECR repository URI for container images',
    exportName: 'BCOS-ECRRepositoryUri'
});
// Stack-specific outputs
new cdk.CfnOutput(stagingStack, 'StagingStackArn', {
    value: stagingStack.stackId,
    description: 'Staging Stack ARN',
    exportName: 'BCOS-StagingStackArn'
});
new cdk.CfnOutput(productionStack, 'ProductionStackArn', {
    value: productionStack.stackId,
    description: 'Production Stack ARN',
    exportName: 'BCOS-ProductionStackArn'
});
// Synthesis configuration
app.synth();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmNvcy1hcHAuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJiY29zLWFwcC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFDQSx1Q0FBcUM7QUFDckMsaURBQW1DO0FBQ25DLGlFQUE2RDtBQUM3RCwrREFBMkQ7QUFDM0QsK0RBQTJEO0FBQzNELHFFQUFpRTtBQUVqRSw0QkFBNEI7QUFDNUIsTUFBTSxPQUFPLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQztBQUM5RSxNQUFNLE1BQU0sR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsSUFBSSxPQUFPLENBQUMsR0FBRyxDQUFDLGtCQUFrQixJQUFJLFdBQVcsQ0FBQztBQUV2RixJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDYixNQUFNLElBQUksS0FBSyxDQUFDLDRCQUE0QixDQUFDLENBQUM7QUFDaEQsQ0FBQztBQUVELE1BQU0sR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDO0FBRTFCLDRCQUE0QjtBQUM1QixNQUFNLEdBQUcsR0FBRyxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUUsQ0FBQztBQUVoQyx1Q0FBdUM7QUFDdkMsTUFBTSxVQUFVLEdBQUc7SUFDakIsT0FBTyxFQUFFLE1BQU07SUFDZixXQUFXLEVBQUUsT0FBTztJQUNwQixTQUFTLEVBQUUsS0FBSztJQUNoQixLQUFLLEVBQUUsUUFBUTtJQUNmLFVBQVUsRUFBRSxhQUFhO0NBQzFCLENBQUM7QUFFRiw2REFBNkQ7QUFDN0QsTUFBTSxhQUFhLEdBQUcsSUFBSSw4QkFBYSxDQUFDLEdBQUcsRUFBRSxvQkFBb0IsRUFBRTtJQUNqRSxHQUFHO0lBQ0gsV0FBVyxFQUFFLDRFQUE0RTtJQUN6RixJQUFJLEVBQUU7UUFDSixHQUFHLFVBQVU7UUFDYixTQUFTLEVBQUUsVUFBVTtLQUN0QjtDQUNGLENBQUMsQ0FBQztBQUVILDBFQUEwRTtBQUMxRSxNQUFNLFlBQVksR0FBRyxJQUFJLDRCQUFZLENBQUMsR0FBRyxFQUFFLG1CQUFtQixFQUFFO0lBQzlELEdBQUc7SUFDSCxXQUFXLEVBQUUsdUVBQXVFO0lBQ3BGLE1BQU0sRUFBRSxhQUFhLENBQUMsTUFBTTtJQUM1QixJQUFJLEVBQUU7UUFDSixHQUFHLFVBQVU7UUFDYixTQUFTLEVBQUUsU0FBUztLQUNyQjtDQUNGLENBQUMsQ0FBQztBQUVILHdEQUF3RDtBQUN4RCxZQUFZLENBQUMsYUFBYSxDQUFDLGFBQWEsQ0FBQyxDQUFDO0FBRTFDLGdGQUFnRjtBQUNoRixNQUFNLFlBQVksR0FBRyxJQUFJLDRCQUFZLENBQUMsR0FBRyxFQUFFLG1CQUFtQixFQUFFO0lBQzlELEdBQUc7SUFDSCxXQUFXLEVBQUUsd0RBQXdEO0lBQ3JFLElBQUksRUFBRTtRQUNKLEdBQUcsVUFBVTtRQUNiLFdBQVcsRUFBRSxTQUFTO1FBQ3RCLFNBQVMsRUFBRSxhQUFhO0tBQ3pCO0NBQ0YsQ0FBQyxDQUFDO0FBRUgsTUFBTSxlQUFlLEdBQUcsSUFBSSxrQ0FBZSxDQUFDLEdBQUcsRUFBRSxzQkFBc0IsRUFBRTtJQUN2RSxHQUFHO0lBQ0gsV0FBVyxFQUFFLDhEQUE4RDtJQUMzRSxJQUFJLEVBQUU7UUFDSixHQUFHLFVBQVU7UUFDYixXQUFXLEVBQUUsWUFBWTtRQUN6QixTQUFTLEVBQUUsYUFBYTtLQUN6QjtDQUNGLENBQUMsQ0FBQztBQUVILGlGQUFpRjtBQUNqRixpRkFBaUY7QUFFakYsNkNBQTZDO0FBQzdDLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxhQUFhLEVBQUUsc0JBQXNCLEVBQUU7SUFDdkQsS0FBSyxFQUFFLGFBQWEsQ0FBQyxpQkFBaUIsQ0FBQyxPQUFPO0lBQzlDLFdBQVcsRUFBRSx1REFBdUQ7SUFDcEUsVUFBVSxFQUFFLDJCQUEyQjtDQUN4QyxDQUFDLENBQUM7QUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsWUFBWSxFQUFFLGlCQUFpQixFQUFFO0lBQ2pELEtBQUssRUFBRSxZQUFZLENBQUMsWUFBWSxDQUFDLG1CQUFtQjtJQUNwRCxXQUFXLEVBQUUsb0NBQW9DO0lBQ2pELFVBQVUsRUFBRSxzQkFBc0I7Q0FDbkMsQ0FBQyxDQUFDO0FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLGFBQWEsRUFBRSxrQkFBa0IsRUFBRTtJQUNuRCxLQUFLLEVBQUUsYUFBYSxDQUFDLGFBQWEsQ0FBQyxhQUFhO0lBQ2hELFdBQVcsRUFBRSx5Q0FBeUM7SUFDdEQsVUFBVSxFQUFFLHVCQUF1QjtDQUNwQyxDQUFDLENBQUM7QUFFSCx5QkFBeUI7QUFDekIsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLFlBQVksRUFBRSxpQkFBaUIsRUFBRTtJQUNqRCxLQUFLLEVBQUUsWUFBWSxDQUFDLE9BQU87SUFDM0IsV0FBVyxFQUFFLG1CQUFtQjtJQUNoQyxVQUFVLEVBQUUsc0JBQXNCO0NBQ25DLENBQUMsQ0FBQztBQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxlQUFlLEVBQUUsb0JBQW9CLEVBQUU7SUFDdkQsS0FBSyxFQUFFLGVBQWUsQ0FBQyxPQUFPO0lBQzlCLFdBQVcsRUFBRSxzQkFBc0I7SUFDbkMsVUFBVSxFQUFFLHlCQUF5QjtDQUN0QyxDQUFDLENBQUM7QUFFSCwwQkFBMEI7QUFDMUIsR0FBRyxDQUFDLEtBQUssRUFBRSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiIyEvdXNyL2Jpbi9lbnYgbm9kZVxuaW1wb3J0ICdzb3VyY2UtbWFwLXN1cHBvcnQvcmVnaXN0ZXInO1xuaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IFNlY3VyaXR5U3RhY2sgfSBmcm9tICcuLi9saWIvc3RhY2tzL3NlY3VyaXR5LXN0YWNrJztcbmltcG9ydCB7IE5ldHdvcmtTdGFjayB9IGZyb20gJy4uL2xpYi9zdGFja3MvbmV0d29yay1zdGFjayc7XG5pbXBvcnQgeyBTdGFnaW5nU3RhY2sgfSBmcm9tICcuLi9saWIvc3RhY2tzL3N0YWdpbmctc3RhY2snO1xuaW1wb3J0IHsgUHJvZHVjdGlvblN0YWNrIH0gZnJvbSAnLi4vbGliL3N0YWNrcy9wcm9kdWN0aW9uLXN0YWNrJztcblxuLy8gRW52aXJvbm1lbnQgY29uZmlndXJhdGlvblxuY29uc3QgYWNjb3VudCA9IHByb2Nlc3MuZW52LkFXU19BQ0NPVU5UX0lEIHx8IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX0FDQ09VTlQ7XG5jb25zdCByZWdpb24gPSBwcm9jZXNzLmVudi5BV1NfUkVHSU9OIHx8IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX1JFR0lPTiB8fCAndXMtZWFzdC0xJztcblxuaWYgKCFhY2NvdW50KSB7XG4gIHRocm93IG5ldyBFcnJvcignQVdTX0FDQ09VTlRfSUQgbXVzdCBiZSBzZXQnKTtcbn1cblxuY29uc3QgYXBwID0gbmV3IGNkay5BcHAoKTtcblxuLy8gQ29tbW9uIGVudmlyb25tZW50IGNvbmZpZ1xuY29uc3QgZW52ID0geyBhY2NvdW50LCByZWdpb24gfTtcblxuLy8gQ29tbW9uIHRhZ3MgYXBwbGllZCB0byBhbGwgcmVzb3VyY2VzXG5jb25zdCBjb21tb25UYWdzID0ge1xuICBQcm9qZWN0OiAnQkNPUycsXG4gIEVudmlyb25tZW50OiAnTXVsdGknLFxuICBNYW5hZ2VkQnk6ICdDREsnLFxuICBPd25lcjogJ0Rldk9wcycsXG4gIENvc3RDZW50ZXI6ICdFbmdpbmVlcmluZydcbn07XG5cbi8vIFNlY3VyaXR5IFN0YWNrIC0gQ29udGFpbnMgSUFNIHJvbGVzLCBLTVMga2V5cywgYW5kIHNlY3JldHNcbmNvbnN0IHNlY3VyaXR5U3RhY2sgPSBuZXcgU2VjdXJpdHlTdGFjayhhcHAsICdCQ09TLVNlY3VyaXR5U3RhY2snLCB7XG4gIGVudixcbiAgZGVzY3JpcHRpb246ICdCQ09TIFNlY3VyaXR5IGluZnJhc3RydWN0dXJlIC0gSUFNIHJvbGVzLCBLTVMga2V5cywgYW5kIHNlY3JldHMgbWFuYWdlbWVudCcsXG4gIHRhZ3M6IHtcbiAgICAuLi5jb21tb25UYWdzLFxuICAgIFN0YWNrVHlwZTogJ1NlY3VyaXR5J1xuICB9XG59KTtcblxuLy8gTmV0d29yayBTdGFjayAtIENvbnRhaW5zIFZQQyBsb29rdXAsIHNlY3VyaXR5IGdyb3VwcywgYW5kIGxvYWQgYmFsYW5jZXJcbmNvbnN0IG5ldHdvcmtTdGFjayA9IG5ldyBOZXR3b3JrU3RhY2soYXBwLCAnQkNPUy1OZXR3b3JrU3RhY2snLCB7XG4gIGVudixcbiAgZGVzY3JpcHRpb246ICdCQ09TIE5ldHdvcmsgaW5mcmFzdHJ1Y3R1cmUgLSBWUEMsIHNlY3VyaXR5IGdyb3VwcywgYW5kIGxvYWQgYmFsYW5jZXInLFxuICBrbXNLZXk6IHNlY3VyaXR5U3RhY2sua21zS2V5LFxuICB0YWdzOiB7XG4gICAgLi4uY29tbW9uVGFncyxcbiAgICBTdGFja1R5cGU6ICdOZXR3b3JrJ1xuICB9XG59KTtcblxuLy8gQWRkIGRlcGVuZGVuY3kgdG8gZW5zdXJlIHNlY3VyaXR5IHN0YWNrIGRlcGxveXMgZmlyc3Rcbm5ldHdvcmtTdGFjay5hZGREZXBlbmRlbmN5KHNlY3VyaXR5U3RhY2spO1xuXG4vLyBBcHBsaWNhdGlvbiBzdGFja3MgKHVzaW5nIENESyBpbXBvcnRzL2V4cG9ydHMgdG8gYXZvaWQgY2lyY3VsYXIgZGVwZW5kZW5jaWVzKVxuY29uc3Qgc3RhZ2luZ1N0YWNrID0gbmV3IFN0YWdpbmdTdGFjayhhcHAsICdCQ09TLVN0YWdpbmdTdGFjaycsIHtcbiAgZW52LFxuICBkZXNjcmlwdGlvbjogJ0JDT1MgU3RhZ2luZyBlbnZpcm9ubWVudCAtIENvbXBsZXRlIHN0YWdpbmcgZGVwbG95bWVudCcsXG4gIHRhZ3M6IHtcbiAgICAuLi5jb21tb25UYWdzLFxuICAgIEVudmlyb25tZW50OiAnU3RhZ2luZycsXG4gICAgU3RhY2tUeXBlOiAnQXBwbGljYXRpb24nXG4gIH1cbn0pO1xuXG5jb25zdCBwcm9kdWN0aW9uU3RhY2sgPSBuZXcgUHJvZHVjdGlvblN0YWNrKGFwcCwgJ0JDT1MtUHJvZHVjdGlvblN0YWNrJywge1xuICBlbnYsXG4gIGRlc2NyaXB0aW9uOiAnQkNPUyBQcm9kdWN0aW9uIGVudmlyb25tZW50IC0gQ29tcGxldGUgcHJvZHVjdGlvbiBkZXBsb3ltZW50JyxcbiAgdGFnczoge1xuICAgIC4uLmNvbW1vblRhZ3MsXG4gICAgRW52aXJvbm1lbnQ6ICdQcm9kdWN0aW9uJyxcbiAgICBTdGFja1R5cGU6ICdBcHBsaWNhdGlvbidcbiAgfVxufSk7XG5cbi8vIFN0YWNrIGRlcGVuZGVuY2llcyBtYW5hZ2VkIHZpYSBDbG91ZEZvcm1hdGlvbiBpbXBvcnRzIChubyBkaXJlY3QgZGVwZW5kZW5jaWVzKVxuLy8gRGVwbG95IG9yZGVyOiBTZWN1cml0eVN0YWNrIC0+IE5ldHdvcmtTdGFjayAtPiBTdGFnaW5nU3RhY2sgLT4gUHJvZHVjdGlvblN0YWNrXG5cbi8vIE91dHB1dCBpbXBvcnRhbnQgdmFsdWVzIGZvciBHaXRIdWIgQWN0aW9uc1xubmV3IGNkay5DZm5PdXRwdXQoc2VjdXJpdHlTdGFjaywgJ0dpdEh1YkFjdGlvbnNSb2xlQXJuJywge1xuICB2YWx1ZTogc2VjdXJpdHlTdGFjay5naXRodWJBY3Rpb25zUm9sZS5yb2xlQXJuLFxuICBkZXNjcmlwdGlvbjogJ0dpdEh1YiBBY3Rpb25zIE9JREMgUm9sZSBBUk4gZm9yIENJL0NEIGF1dGhlbnRpY2F0aW9uJyxcbiAgZXhwb3J0TmFtZTogJ0JDT1MtR2l0SHViQWN0aW9uc1JvbGVBcm4nXG59KTtcblxubmV3IGNkay5DZm5PdXRwdXQobmV0d29ya1N0YWNrLCAnTG9hZEJhbGFuY2VyRE5TJywge1xuICB2YWx1ZTogbmV0d29ya1N0YWNrLmxvYWRCYWxhbmNlci5sb2FkQmFsYW5jZXJEbnNOYW1lLFxuICBkZXNjcmlwdGlvbjogJ0FwcGxpY2F0aW9uIExvYWQgQmFsYW5jZXIgRE5TIG5hbWUnLFxuICBleHBvcnROYW1lOiAnQkNPUy1Mb2FkQmFsYW5jZXJETlMnXG59KTtcblxubmV3IGNkay5DZm5PdXRwdXQoc2VjdXJpdHlTdGFjaywgJ0VDUlJlcG9zaXRvcnlVcmknLCB7XG4gIHZhbHVlOiBzZWN1cml0eVN0YWNrLmVjclJlcG9zaXRvcnkucmVwb3NpdG9yeVVyaSxcbiAgZGVzY3JpcHRpb246ICdFQ1IgcmVwb3NpdG9yeSBVUkkgZm9yIGNvbnRhaW5lciBpbWFnZXMnLFxuICBleHBvcnROYW1lOiAnQkNPUy1FQ1JSZXBvc2l0b3J5VXJpJ1xufSk7XG5cbi8vIFN0YWNrLXNwZWNpZmljIG91dHB1dHNcbm5ldyBjZGsuQ2ZuT3V0cHV0KHN0YWdpbmdTdGFjaywgJ1N0YWdpbmdTdGFja0FybicsIHtcbiAgdmFsdWU6IHN0YWdpbmdTdGFjay5zdGFja0lkLFxuICBkZXNjcmlwdGlvbjogJ1N0YWdpbmcgU3RhY2sgQVJOJyxcbiAgZXhwb3J0TmFtZTogJ0JDT1MtU3RhZ2luZ1N0YWNrQXJuJ1xufSk7XG5cbm5ldyBjZGsuQ2ZuT3V0cHV0KHByb2R1Y3Rpb25TdGFjaywgJ1Byb2R1Y3Rpb25TdGFja0FybicsIHtcbiAgdmFsdWU6IHByb2R1Y3Rpb25TdGFjay5zdGFja0lkLFxuICBkZXNjcmlwdGlvbjogJ1Byb2R1Y3Rpb24gU3RhY2sgQVJOJyxcbiAgZXhwb3J0TmFtZTogJ0JDT1MtUHJvZHVjdGlvblN0YWNrQXJuJ1xufSk7XG5cbi8vIFN5bnRoZXNpcyBjb25maWd1cmF0aW9uXG5hcHAuc3ludGgoKTtcbiJdfQ==