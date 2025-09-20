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
const staging_stage_1 = require("../lib/stages/staging-stage");
const production_stage_1 = require("../lib/stages/production-stage");
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
// Staging Stage - Complete staging environment
const stagingStage = new staging_stage_1.StagingStage(app, 'BCOS-StagingStage', {
    env,
    securityStack,
    networkStack,
});
// Production Stage - Complete production environment
const productionStage = new production_stage_1.ProductionStage(app, 'BCOS-ProductionStage', {
    env,
    securityStack,
    networkStack,
});
// Apply tags to stages
cdk.Tags.of(stagingStage).add('Environment', 'Staging');
cdk.Tags.of(stagingStage).add('StackType', 'Application');
cdk.Tags.of(productionStage).add('Environment', 'Production');
cdk.Tags.of(productionStage).add('StackType', 'Application');
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
// Synthesis configuration
app.synth();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmNvcy1hcHAuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJiY29zLWFwcC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFDQSx1Q0FBcUM7QUFDckMsaURBQW1DO0FBQ25DLGlFQUE2RDtBQUM3RCwrREFBMkQ7QUFDM0QsK0RBQTJEO0FBQzNELHFFQUFpRTtBQUVqRSw0QkFBNEI7QUFDNUIsTUFBTSxPQUFPLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQztBQUM5RSxNQUFNLE1BQU0sR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsSUFBSSxPQUFPLENBQUMsR0FBRyxDQUFDLGtCQUFrQixJQUFJLFdBQVcsQ0FBQztBQUV2RixJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDYixNQUFNLElBQUksS0FBSyxDQUFDLDRCQUE0QixDQUFDLENBQUM7QUFDaEQsQ0FBQztBQUVELE1BQU0sR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDO0FBRTFCLDRCQUE0QjtBQUM1QixNQUFNLEdBQUcsR0FBRyxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUUsQ0FBQztBQUVoQyx1Q0FBdUM7QUFDdkMsTUFBTSxVQUFVLEdBQUc7SUFDakIsT0FBTyxFQUFFLE1BQU07SUFDZixXQUFXLEVBQUUsT0FBTztJQUNwQixTQUFTLEVBQUUsS0FBSztJQUNoQixLQUFLLEVBQUUsUUFBUTtJQUNmLFVBQVUsRUFBRSxhQUFhO0NBQzFCLENBQUM7QUFFRiw2REFBNkQ7QUFDN0QsTUFBTSxhQUFhLEdBQUcsSUFBSSw4QkFBYSxDQUFDLEdBQUcsRUFBRSxvQkFBb0IsRUFBRTtJQUNqRSxHQUFHO0lBQ0gsV0FBVyxFQUFFLDRFQUE0RTtJQUN6RixJQUFJLEVBQUU7UUFDSixHQUFHLFVBQVU7UUFDYixTQUFTLEVBQUUsVUFBVTtLQUN0QjtDQUNGLENBQUMsQ0FBQztBQUVILDBFQUEwRTtBQUMxRSxNQUFNLFlBQVksR0FBRyxJQUFJLDRCQUFZLENBQUMsR0FBRyxFQUFFLG1CQUFtQixFQUFFO0lBQzlELEdBQUc7SUFDSCxXQUFXLEVBQUUsdUVBQXVFO0lBQ3BGLE1BQU0sRUFBRSxhQUFhLENBQUMsTUFBTTtJQUM1QixJQUFJLEVBQUU7UUFDSixHQUFHLFVBQVU7UUFDYixTQUFTLEVBQUUsU0FBUztLQUNyQjtDQUNGLENBQUMsQ0FBQztBQUVILHdEQUF3RDtBQUN4RCxZQUFZLENBQUMsYUFBYSxDQUFDLGFBQWEsQ0FBQyxDQUFDO0FBRTFDLCtDQUErQztBQUMvQyxNQUFNLFlBQVksR0FBRyxJQUFJLDRCQUFZLENBQUMsR0FBRyxFQUFFLG1CQUFtQixFQUFFO0lBQzlELEdBQUc7SUFDSCxhQUFhO0lBQ2IsWUFBWTtDQUNiLENBQUMsQ0FBQztBQUVILHFEQUFxRDtBQUNyRCxNQUFNLGVBQWUsR0FBRyxJQUFJLGtDQUFlLENBQUMsR0FBRyxFQUFFLHNCQUFzQixFQUFFO0lBQ3ZFLEdBQUc7SUFDSCxhQUFhO0lBQ2IsWUFBWTtDQUNiLENBQUMsQ0FBQztBQUVILHVCQUF1QjtBQUN2QixHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxZQUFZLENBQUMsQ0FBQyxHQUFHLENBQUMsYUFBYSxFQUFFLFNBQVMsQ0FBQyxDQUFDO0FBQ3hELEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLFlBQVksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxXQUFXLEVBQUUsYUFBYSxDQUFDLENBQUM7QUFDMUQsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsZUFBZSxDQUFDLENBQUMsR0FBRyxDQUFDLGFBQWEsRUFBRSxZQUFZLENBQUMsQ0FBQztBQUM5RCxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxlQUFlLENBQUMsQ0FBQyxHQUFHLENBQUMsV0FBVyxFQUFFLGFBQWEsQ0FBQyxDQUFDO0FBRTdELDZDQUE2QztBQUM3QyxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsYUFBYSxFQUFFLHNCQUFzQixFQUFFO0lBQ3ZELEtBQUssRUFBRSxhQUFhLENBQUMsaUJBQWlCLENBQUMsT0FBTztJQUM5QyxXQUFXLEVBQUUsdURBQXVEO0lBQ3BFLFVBQVUsRUFBRSwyQkFBMkI7Q0FDeEMsQ0FBQyxDQUFDO0FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLFlBQVksRUFBRSxpQkFBaUIsRUFBRTtJQUNqRCxLQUFLLEVBQUUsWUFBWSxDQUFDLFlBQVksQ0FBQyxtQkFBbUI7SUFDcEQsV0FBVyxFQUFFLG9DQUFvQztJQUNqRCxVQUFVLEVBQUUsc0JBQXNCO0NBQ25DLENBQUMsQ0FBQztBQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxhQUFhLEVBQUUsa0JBQWtCLEVBQUU7SUFDbkQsS0FBSyxFQUFFLGFBQWEsQ0FBQyxhQUFhLENBQUMsYUFBYTtJQUNoRCxXQUFXLEVBQUUseUNBQXlDO0lBQ3RELFVBQVUsRUFBRSx1QkFBdUI7Q0FDcEMsQ0FBQyxDQUFDO0FBRUgsMEJBQTBCO0FBQzFCLEdBQUcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIiMhL3Vzci9iaW4vZW52IG5vZGVcbmltcG9ydCAnc291cmNlLW1hcC1zdXBwb3J0L3JlZ2lzdGVyJztcbmltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBTZWN1cml0eVN0YWNrIH0gZnJvbSAnLi4vbGliL3N0YWNrcy9zZWN1cml0eS1zdGFjayc7XG5pbXBvcnQgeyBOZXR3b3JrU3RhY2sgfSBmcm9tICcuLi9saWIvc3RhY2tzL25ldHdvcmstc3RhY2snO1xuaW1wb3J0IHsgU3RhZ2luZ1N0YWdlIH0gZnJvbSAnLi4vbGliL3N0YWdlcy9zdGFnaW5nLXN0YWdlJztcbmltcG9ydCB7IFByb2R1Y3Rpb25TdGFnZSB9IGZyb20gJy4uL2xpYi9zdGFnZXMvcHJvZHVjdGlvbi1zdGFnZSc7XG5cbi8vIEVudmlyb25tZW50IGNvbmZpZ3VyYXRpb25cbmNvbnN0IGFjY291bnQgPSBwcm9jZXNzLmVudi5BV1NfQUNDT1VOVF9JRCB8fCBwcm9jZXNzLmVudi5DREtfREVGQVVMVF9BQ0NPVU5UO1xuY29uc3QgcmVnaW9uID0gcHJvY2Vzcy5lbnYuQVdTX1JFR0lPTiB8fCBwcm9jZXNzLmVudi5DREtfREVGQVVMVF9SRUdJT04gfHwgJ3VzLWVhc3QtMSc7XG5cbmlmICghYWNjb3VudCkge1xuICB0aHJvdyBuZXcgRXJyb3IoJ0FXU19BQ0NPVU5UX0lEIG11c3QgYmUgc2V0Jyk7XG59XG5cbmNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKCk7XG5cbi8vIENvbW1vbiBlbnZpcm9ubWVudCBjb25maWdcbmNvbnN0IGVudiA9IHsgYWNjb3VudCwgcmVnaW9uIH07XG5cbi8vIENvbW1vbiB0YWdzIGFwcGxpZWQgdG8gYWxsIHJlc291cmNlc1xuY29uc3QgY29tbW9uVGFncyA9IHtcbiAgUHJvamVjdDogJ0JDT1MnLFxuICBFbnZpcm9ubWVudDogJ011bHRpJyxcbiAgTWFuYWdlZEJ5OiAnQ0RLJyxcbiAgT3duZXI6ICdEZXZPcHMnLFxuICBDb3N0Q2VudGVyOiAnRW5naW5lZXJpbmcnXG59O1xuXG4vLyBTZWN1cml0eSBTdGFjayAtIENvbnRhaW5zIElBTSByb2xlcywgS01TIGtleXMsIGFuZCBzZWNyZXRzXG5jb25zdCBzZWN1cml0eVN0YWNrID0gbmV3IFNlY3VyaXR5U3RhY2soYXBwLCAnQkNPUy1TZWN1cml0eVN0YWNrJywge1xuICBlbnYsXG4gIGRlc2NyaXB0aW9uOiAnQkNPUyBTZWN1cml0eSBpbmZyYXN0cnVjdHVyZSAtIElBTSByb2xlcywgS01TIGtleXMsIGFuZCBzZWNyZXRzIG1hbmFnZW1lbnQnLFxuICB0YWdzOiB7XG4gICAgLi4uY29tbW9uVGFncyxcbiAgICBTdGFja1R5cGU6ICdTZWN1cml0eSdcbiAgfVxufSk7XG5cbi8vIE5ldHdvcmsgU3RhY2sgLSBDb250YWlucyBWUEMgbG9va3VwLCBzZWN1cml0eSBncm91cHMsIGFuZCBsb2FkIGJhbGFuY2VyXG5jb25zdCBuZXR3b3JrU3RhY2sgPSBuZXcgTmV0d29ya1N0YWNrKGFwcCwgJ0JDT1MtTmV0d29ya1N0YWNrJywge1xuICBlbnYsXG4gIGRlc2NyaXB0aW9uOiAnQkNPUyBOZXR3b3JrIGluZnJhc3RydWN0dXJlIC0gVlBDLCBzZWN1cml0eSBncm91cHMsIGFuZCBsb2FkIGJhbGFuY2VyJyxcbiAga21zS2V5OiBzZWN1cml0eVN0YWNrLmttc0tleSxcbiAgdGFnczoge1xuICAgIC4uLmNvbW1vblRhZ3MsXG4gICAgU3RhY2tUeXBlOiAnTmV0d29yaydcbiAgfVxufSk7XG5cbi8vIEFkZCBkZXBlbmRlbmN5IHRvIGVuc3VyZSBzZWN1cml0eSBzdGFjayBkZXBsb3lzIGZpcnN0XG5uZXR3b3JrU3RhY2suYWRkRGVwZW5kZW5jeShzZWN1cml0eVN0YWNrKTtcblxuLy8gU3RhZ2luZyBTdGFnZSAtIENvbXBsZXRlIHN0YWdpbmcgZW52aXJvbm1lbnRcbmNvbnN0IHN0YWdpbmdTdGFnZSA9IG5ldyBTdGFnaW5nU3RhZ2UoYXBwLCAnQkNPUy1TdGFnaW5nU3RhZ2UnLCB7XG4gIGVudixcbiAgc2VjdXJpdHlTdGFjayxcbiAgbmV0d29ya1N0YWNrLFxufSk7XG5cbi8vIFByb2R1Y3Rpb24gU3RhZ2UgLSBDb21wbGV0ZSBwcm9kdWN0aW9uIGVudmlyb25tZW50XG5jb25zdCBwcm9kdWN0aW9uU3RhZ2UgPSBuZXcgUHJvZHVjdGlvblN0YWdlKGFwcCwgJ0JDT1MtUHJvZHVjdGlvblN0YWdlJywge1xuICBlbnYsXG4gIHNlY3VyaXR5U3RhY2ssXG4gIG5ldHdvcmtTdGFjayxcbn0pO1xuXG4vLyBBcHBseSB0YWdzIHRvIHN0YWdlc1xuY2RrLlRhZ3Mub2Yoc3RhZ2luZ1N0YWdlKS5hZGQoJ0Vudmlyb25tZW50JywgJ1N0YWdpbmcnKTtcbmNkay5UYWdzLm9mKHN0YWdpbmdTdGFnZSkuYWRkKCdTdGFja1R5cGUnLCAnQXBwbGljYXRpb24nKTtcbmNkay5UYWdzLm9mKHByb2R1Y3Rpb25TdGFnZSkuYWRkKCdFbnZpcm9ubWVudCcsICdQcm9kdWN0aW9uJyk7ICBcbmNkay5UYWdzLm9mKHByb2R1Y3Rpb25TdGFnZSkuYWRkKCdTdGFja1R5cGUnLCAnQXBwbGljYXRpb24nKTtcblxuLy8gT3V0cHV0IGltcG9ydGFudCB2YWx1ZXMgZm9yIEdpdEh1YiBBY3Rpb25zXG5uZXcgY2RrLkNmbk91dHB1dChzZWN1cml0eVN0YWNrLCAnR2l0SHViQWN0aW9uc1JvbGVBcm4nLCB7XG4gIHZhbHVlOiBzZWN1cml0eVN0YWNrLmdpdGh1YkFjdGlvbnNSb2xlLnJvbGVBcm4sXG4gIGRlc2NyaXB0aW9uOiAnR2l0SHViIEFjdGlvbnMgT0lEQyBSb2xlIEFSTiBmb3IgQ0kvQ0QgYXV0aGVudGljYXRpb24nLFxuICBleHBvcnROYW1lOiAnQkNPUy1HaXRIdWJBY3Rpb25zUm9sZUFybidcbn0pO1xuXG5uZXcgY2RrLkNmbk91dHB1dChuZXR3b3JrU3RhY2ssICdMb2FkQmFsYW5jZXJETlMnLCB7XG4gIHZhbHVlOiBuZXR3b3JrU3RhY2subG9hZEJhbGFuY2VyLmxvYWRCYWxhbmNlckRuc05hbWUsXG4gIGRlc2NyaXB0aW9uOiAnQXBwbGljYXRpb24gTG9hZCBCYWxhbmNlciBETlMgbmFtZScsXG4gIGV4cG9ydE5hbWU6ICdCQ09TLUxvYWRCYWxhbmNlckROUydcbn0pO1xuXG5uZXcgY2RrLkNmbk91dHB1dChzZWN1cml0eVN0YWNrLCAnRUNSUmVwb3NpdG9yeVVyaScsIHtcbiAgdmFsdWU6IHNlY3VyaXR5U3RhY2suZWNyUmVwb3NpdG9yeS5yZXBvc2l0b3J5VXJpLFxuICBkZXNjcmlwdGlvbjogJ0VDUiByZXBvc2l0b3J5IFVSSSBmb3IgY29udGFpbmVyIGltYWdlcycsXG4gIGV4cG9ydE5hbWU6ICdCQ09TLUVDUlJlcG9zaXRvcnlVcmknXG59KTtcblxuLy8gU3ludGhlc2lzIGNvbmZpZ3VyYXRpb25cbmFwcC5zeW50aCgpO1xuIl19