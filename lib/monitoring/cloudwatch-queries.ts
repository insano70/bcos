/**
 * CloudWatch Logs Insights Query Helper
 *
 * Provides simplified interface to query CloudWatch Logs.
 * For now, returns mock data until AWS SDK is fully configured.
 *
 * TODO: Install @aws-sdk/client-cloudwatch-logs for production use
 *
 * USAGE:
 * ```typescript
 * const results = await querySecurityEvents('1h', ['high', 'critical']);
 * ```
 */

import { log } from '@/lib/logger';
import type { SecurityEvent } from './types';
import type {
  CloudWatchLogsClient as CWLClient,
  StartQueryCommand as SQCommand,
  GetQueryResultsCommand as GQRCommand,
  ResultField,
} from '@aws-sdk/client-cloudwatch-logs';

/**
 * Query security events from CloudWatch Logs
 *
 * NOTE: Requires AWS SDK and credentials to be configured.
 * Returns empty array if CloudWatch is not available (graceful degradation).
 * Does NOT run in development mode (local machines).
 *
 * To enable CloudWatch integration:
 * 1. pnpm add @aws-sdk/client-cloudwatch-logs
 * 2. Set AWS_REGION environment variable
 * 3. Configure AWS credentials (IAM role or access keys)
 *
 * @param timeRange - Time range ('1h', '6h', '24h', '7d')
 * @param severities - Filter by severity levels
 * @param limit - Maximum number of results
 * @returns Array of security events
 */
export async function querySecurityEvents(
  timeRange: string = '1h',
  severities?: string[],
  limit: number = 50
): Promise<SecurityEvent[]> {
  try {
    // Skip CloudWatch queries in development mode (local machines)
    if (process.env.NODE_ENV === 'development') {
      log.debug('CloudWatch queries disabled in development mode', {
        operation: 'query_security_events',
        component: 'monitoring',
      });
      return [];
    }

    log.info('Querying security events', {
      operation: 'query_security_events',
      timeRange,
      severities,
      limit,
      component: 'monitoring',
    });

    // Check if CloudWatch SDK is available
    let CloudWatchLogsClient: typeof CWLClient | undefined;
    let StartQueryCommand: typeof SQCommand | undefined;
    let GetQueryResultsCommand: typeof GQRCommand | undefined;

    try {
      const sdk = await import('@aws-sdk/client-cloudwatch-logs');
      CloudWatchLogsClient = sdk.CloudWatchLogsClient;
      StartQueryCommand = sdk.StartQueryCommand;
      GetQueryResultsCommand = sdk.GetQueryResultsCommand;
    } catch {
      // CloudWatch SDK not installed - return empty array
      log.info('CloudWatch SDK not available, returning empty security events', {
        operation: 'query_security_events',
        component: 'monitoring',
      });
      return [];
    }

    // Build CloudWatch query
    const query = buildSecurityEventsQuery(timeRange, severities, undefined, limit);
    const logGroupName = getLogGroupName();
    const { startTime, endTime } = parseTimeRange(timeRange);

    // Initialize CloudWatch client
    const client = new CloudWatchLogsClient({
      region: process.env.AWS_REGION || 'us-east-1',
    });

    // Start query
    const startCommand = new StartQueryCommand({
      logGroupName,
      startTime,
      endTime,
      queryString: query,
    });

    const startResult = await client.send(startCommand);
    const queryId = startResult.queryId;

    if (!queryId) {
      throw new Error('Failed to start CloudWatch query');
    }

    // Poll for results (max 30 seconds)
    let attempts = 0;
    const maxAttempts = 30;

    while (attempts < maxAttempts) {
      const getCommand = new GetQueryResultsCommand({ queryId });
      const result = await client.send(getCommand);

      if (result.status === 'Complete') {
        // Parse results into SecurityEvent array
        const events = parseSecurityEventResults(result.results || []);
        return events.slice(0, limit);
      }

      if (result.status === 'Failed' || result.status === 'Cancelled') {
        throw new Error(`CloudWatch query ${result.status.toLowerCase()}`);
      }

      // Wait 1 second before polling again
      await new Promise((resolve) => setTimeout(resolve, 1000));
      attempts++;
    }

    throw new Error('CloudWatch query timeout');
  } catch (error) {
    log.error(
      'Failed to query security events',
      error instanceof Error ? error : new Error(String(error)),
      {
        operation: 'query_security_events',
        timeRange,
        component: 'monitoring',
      }
    );
    // Return empty array on error (graceful degradation)
    return [];
  }
}

/**
 * Parse CloudWatch query results into SecurityEvent objects
 */
function parseSecurityEventResults(results: ResultField[][]): SecurityEvent[] {
  return results.map((result, index) => {
    const fields: Record<string, string> = {};

    // CloudWatch returns array of field objects
    if (Array.isArray(result)) {
      for (const field of result) {
        if (field.field && field.value !== null && field.value !== undefined) {
          fields[field.field] = String(field.value);
        }
      }
    }

    return {
      id: `evt_${index}_${Date.now()}`,
      timestamp: fields['@timestamp'] || new Date().toISOString(),
      event: fields.event || 'unknown',
      severity: (fields.severity as 'critical' | 'high' | 'medium' | 'low') || 'medium',
      action: fields.action || '',
      threat: fields.threat,
      blocked: fields.blocked === 'true',
      details: {
        ipAddress: fields.ipAddress,
        userId: fields.userId,
        userAgent: fields.userAgent,
        pathname: fields.pathname,
        reason: fields.reason,
      },
      message: fields.message || fields.event || 'Security event',
    };
  });
}

/**
 * Parse time range to Unix timestamps
 *
 * @param timeRange - Time range string
 * @returns Start and end Unix timestamps (seconds)
 */
export function parseTimeRange(timeRange: string): { startTime: number; endTime: number } {
  const endTime = Math.floor(Date.now() / 1000);
  let startTime: number;

  switch (timeRange) {
    case '5m':
      startTime = endTime - 5 * 60;
      break;
    case '15m':
      startTime = endTime - 15 * 60;
      break;
    case '1h':
      startTime = endTime - 60 * 60;
      break;
    case '6h':
      startTime = endTime - 6 * 60 * 60;
      break;
    case '24h':
      startTime = endTime - 24 * 60 * 60;
      break;
    case '7d':
      startTime = endTime - 7 * 24 * 60 * 60;
      break;
    default:
      startTime = endTime - 60 * 60; // Default: 1 hour
  }

  return { startTime, endTime };
}

/**
 * Get CloudWatch log group name based on environment
 *
 * @returns Log group name
 */
export function getLogGroupName(): string {
  const environment = process.env.ENVIRONMENT || process.env.NODE_ENV || 'development';
  return `/aws/ecs/bcos-${environment}`;
}

/**
 * Generate CloudWatch Logs Insights URL for correlation ID trace
 *
 * @param correlationId - Correlation ID to trace
 * @param region - AWS region (default: from env or us-east-1)
 * @returns CloudWatch Logs Insights URL
 */
export function generateCorrelationTraceURL(correlationId: string, region?: string): string {
  const awsRegion = region || process.env.AWS_REGION || 'us-east-1';
  const logGroupName = getLogGroupName();
  const encodedLogGroup = encodeURIComponent(logGroupName);
  
  // Build the query
  const query = `fields @timestamp, level, message, operation, duration\n| filter correlationId = "${correlationId}"\n| sort @timestamp asc`;
  const encodedQuery = encodeURIComponent(query);
  
  // CloudWatch Logs Insights URL format
  const baseURL = `https://${awsRegion}.console.aws.amazon.com/cloudwatch/home`;
  const queryParams = `?region=${awsRegion}#logsV2:logs-insights$3FqueryDetail$3D~(end~0~start~-3600~timeType~'RELATIVE~unit~'seconds~editorString~'${encodedQuery}~source~(~'${encodedLogGroup}))`;
  
  return baseURL + queryParams;
}

/**
 * Build CloudWatch Logs Insights query for security events
 *
 * @param timeRange - Time range
 * @param severities - Optional severity filter
 * @param eventTypes - Optional event type filter
 * @param limit - Result limit
 * @returns CloudWatch query string
 */
export function buildSecurityEventsQuery(
  timeRange: string,
  severities?: string[],
  eventTypes?: string[],
  limit: number = 50
): string {
  let query = `
    fields @timestamp, event, severity, action, threat, blocked, message, ipAddress, userId, userAgent, pathname, reason
    | filter component = "security" OR severity in ["high", "critical"]
    | filter @timestamp > ago(${timeRange})
  `;

  if (severities && severities.length > 0) {
    const severityFilter = severities.map((s) => `"${s}"`).join(', ');
    query += `\n    | filter severity in [${severityFilter}]`;
  }

  if (eventTypes && eventTypes.length > 0) {
    const eventFilter = eventTypes.map((e) => `"${e}"`).join(', ');
    query += `\n    | filter event in [${eventFilter}]`;
  }

  query += `
    | sort @timestamp desc
    | limit ${limit}
  `;

  return query.trim();
}

/**
 * Query slow database queries from CloudWatch Logs
 * Does NOT run in development mode (local machines).
 */
export async function querySlowQueries(
  timeRange: string = '1h',
  threshold: number = 500,
  limit: number = 50
): Promise<Record<string, string>[]> {
  try {
    // Skip CloudWatch queries in development mode (local machines)
    if (process.env.NODE_ENV === 'development') {
      return [];
    }

    // Check if CloudWatch SDK is available
    let CloudWatchLogsClient: typeof CWLClient | undefined;
    let StartQueryCommand: typeof SQCommand | undefined;
    let GetQueryResultsCommand: typeof GQRCommand | undefined;

    try {
      const sdk = await import('@aws-sdk/client-cloudwatch-logs');
      CloudWatchLogsClient = sdk.CloudWatchLogsClient;
      StartQueryCommand = sdk.StartQueryCommand;
      GetQueryResultsCommand = sdk.GetQueryResultsCommand;
    } catch {
      return [];
    }

    const query = `
      fields @timestamp, operation, \`table\`, duration, recordCount, correlationId, userId
      | filter component = "database"
      | filter duration > ${threshold}
      | filter @timestamp > ago(${timeRange})
      | sort duration desc
      | limit ${limit}
    `;

    const client = new CloudWatchLogsClient({ region: process.env.AWS_REGION || 'us-east-1' });
    const { startTime, endTime } = parseTimeRange(timeRange);

    const startResult = await client.send(new StartQueryCommand({
      logGroupName: getLogGroupName(),
      startTime,
      endTime,
      queryString: query,
    }));

    if (!startResult.queryId) return [];

    let attempts = 0;
    while (attempts < 30) {
      const result = await client.send(new GetQueryResultsCommand({ queryId: startResult.queryId }));

      if (result.status === 'Complete') {
        return (result.results || []).map((r: ResultField[]) => {
          const fields: Record<string, string> = {};
          if (Array.isArray(r)) {
            for (const field of r) {
              if (field.field && field.value) fields[field.field] = String(field.value);
            }
          }
          return fields;
        });
      }

      if (result.status === 'Failed' || result.status === 'Cancelled') return [];

      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
    }

    return [];
  } catch {
    return [];
  }
}

/**
 * Query application errors from CloudWatch Logs
 * Does NOT run in development mode (local machines).
 */
export async function queryErrors(
  timeRange: string = '1h',
  limit: number = 50
): Promise<Record<string, string>[]> {
  try {
    // Skip CloudWatch queries in development mode (local machines)
    if (process.env.NODE_ENV === 'development') {
      return [];
    }

    let CloudWatchLogsClient: typeof CWLClient | undefined;
    let StartQueryCommand: typeof SQCommand | undefined;
    let GetQueryResultsCommand: typeof GQRCommand | undefined;

    try {
      const sdk = await import('@aws-sdk/client-cloudwatch-logs');
      CloudWatchLogsClient = sdk.CloudWatchLogsClient;
      StartQueryCommand = sdk.StartQueryCommand;
      GetQueryResultsCommand = sdk.GetQueryResultsCommand;
    } catch {
      return [];
    }

    const query = `
      fields @timestamp, level, message, operation, endpoint, statusCode, correlationId, userId
      | filter level = "ERROR"
      | filter component = "api"
      | filter @timestamp > ago(${timeRange})
      | sort @timestamp desc
      | limit ${limit}
    `;

    const client = new CloudWatchLogsClient({ region: process.env.AWS_REGION || 'us-east-1' });
    const { startTime, endTime } = parseTimeRange(timeRange);

    const startResult = await client.send(new StartQueryCommand({
      logGroupName: getLogGroupName(),
      startTime,
      endTime,
      queryString: query,
    }));

    if (!startResult.queryId) return [];

    let attempts = 0;
    while (attempts < 30) {
      const result = await client.send(new GetQueryResultsCommand({ queryId: startResult.queryId }));

      if (result.status === 'Complete') {
        return (result.results || []).map((r: ResultField[]) => {
          const fields: Record<string, string> = {};
          if (Array.isArray(r)) {
            for (const field of r) {
              if (field.field && field.value) fields[field.field] = String(field.value);
            }
          }
          return fields;
        });
      }

      if (result.status === 'Failed' || result.status === 'Cancelled') return [];

      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
    }

    return [];
  } catch {
    return [];
  }
}

