/**
 * CloudWatch Client-Safe Utilities
 *
 * Client-side utilities for CloudWatch (no Node.js dependencies).
 * Can be safely imported in React client components.
 */

/**
 * Generate CloudWatch Logs Insights URL for correlation ID trace
 *
 * @param correlationId - Correlation ID to trace
 * @param region - AWS region (default: us-east-1)
 * @returns CloudWatch Logs Insights URL
 */
export function generateCorrelationTraceURL(correlationId: string, region: string = 'us-east-1'): string {
  const environment = process.env.NEXT_PUBLIC_ENVIRONMENT || 'development';
  const logGroupName = `/aws/ecs/bcos-${environment}`;
  const encodedLogGroup = encodeURIComponent(logGroupName);
  
  // Build the query
  const query = `fields @timestamp, level, message, operation, duration\n| filter correlationId = "${correlationId}"\n| sort @timestamp asc`;
  const encodedQuery = encodeURIComponent(query);
  
  // CloudWatch Logs Insights URL format
  const baseURL = `https://${region}.console.aws.amazon.com/cloudwatch/home`;
  const queryParams = `?region=${region}#logsV2:logs-insights$3FqueryDetail$3D~(end~0~start~-3600~timeType~'RELATIVE~unit~'seconds~editorString~'${encodedQuery}~source~(~'${encodedLogGroup}))`;
  
  return baseURL + queryParams;
}

