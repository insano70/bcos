/**
 * Standardized Log Message Templates
 *
 * Provides rich, consistent log messages for common operations.
 * Addresses the "logs are light on detail" problem by including:
 * - Resource identifiers (IDs, names)
 * - Business context (why operation happened)
 * - Outcome details (what changed, how many affected)
 * - User context (who, from where)
 * - Performance metrics (duration, slow query detection)
 *
 * @example
 * ```typescript
 * import { logTemplates } from '@/lib/logger/message-templates';
 *
 * // List operation
 * const template = logTemplates.crud.list('work_items', {
 *   userId: userContext.user_id,
 *   organizationId: userContext.current_organization_id,
 *   filters: { status: 'open', assignee: 'user_123' },
 *   results: { returned: 25, total: 100, page: 1 },
 *   duration: 245
 * });
 * log.info(template.message, template.context);
 * ```
 */

/**
 * Template return type - message + context object
 */
interface LogTemplate {
  message: string;
  context: Record<string, unknown>;
}

/**
 * Change tracking for audit trail
 */
interface FieldChange {
  from: unknown;
  to: unknown;
}

/**
 * CRUD Operation Templates
 * Standard create/read/update/delete operations
 */
export const crudTemplates = {
  /**
   * Read/Get operation - retrieving a single resource
   */
  read: (
    resourceType: string,
    details: {
      resourceId: string;
      resourceName?: string;
      userId: string;
      organizationId?: string;
      duration: number;
      found: boolean;
      metadata?: Record<string, unknown>;
    }
  ): LogTemplate => ({
    message: `${resourceType} ${details.found ? 'retrieved successfully' : 'not found'}`,
    context: {
      operation: `read_${resourceType}`,
      resourceType,
      resourceId: details.resourceId,
      resourceName: details.resourceName,
      userId: details.userId,
      organizationId: details.organizationId,
      found: details.found,
      duration: details.duration,
      slow: details.duration > 1000,
      component: 'business-logic',
      ...details.metadata,
    },
  }),

  /**
   * List operation - querying multiple resources
   */
  list: (
    resourceType: string,
    details: {
      userId: string;
      organizationId?: string;
      filters: Record<string, unknown>;
      results: {
        returned: number;
        total: number;
        page: number;
        hasMore?: boolean;
      };
      duration: number;
      metadata?: Record<string, unknown>;
    }
  ): LogTemplate => ({
    message: `${resourceType} list query completed - returned ${details.results.returned} of ${details.results.total}`,
    context: {
      operation: `list_${resourceType}`,
      resourceType,
      userId: details.userId,
      organizationId: details.organizationId,

      // Filters applied
      filters: Object.fromEntries(
        Object.entries(details.filters).filter(([_, v]) => v !== undefined && v !== null)
      ),
      filterCount: Object.keys(details.filters).filter(
        (k) => details.filters[k] !== undefined && details.filters[k] !== null
      ).length,

      // Results summary
      results: details.results,
      empty: details.results.returned === 0,

      // Performance
      duration: details.duration,
      slow: details.duration > 1000,

      component: 'business-logic',
      ...details.metadata,
    },
  }),

  /**
   * Create operation - creating a new resource
   */
  create: (
    resourceType: string,
    details: {
      resourceId: string;
      resourceName?: string;
      userId: string;
      organizationId?: string;
      duration: number;
      metadata?: Record<string, unknown>;
    }
  ): LogTemplate => ({
    message: `${resourceType} created successfully`,
    context: {
      operation: `create_${resourceType}`,
      resourceType,
      resourceId: details.resourceId,
      resourceName: details.resourceName,
      userId: details.userId,
      organizationId: details.organizationId,
      duration: details.duration,
      slow: details.duration > 2000,
      component: 'business-logic',
      ...details.metadata,
    },
  }),

  /**
   * Update operation - modifying an existing resource
   * Includes change tracking for audit trail
   */
  update: (
    resourceType: string,
    details: {
      resourceId: string;
      resourceName?: string;
      userId: string;
      organizationId?: string;
      changes: Record<string, FieldChange>;
      duration: number;
      metadata?: Record<string, unknown>;
    }
  ): LogTemplate => {
    const changeCount = Object.keys(details.changes).length;
    const changedFields = Object.keys(details.changes).join(', ');

    return {
      message: `${resourceType} updated - ${changeCount} field${changeCount === 1 ? '' : 's'} changed: ${changedFields}`,
      context: {
        operation: `update_${resourceType}`,
        resourceType,
        resourceId: details.resourceId,
        resourceName: details.resourceName,
        userId: details.userId,
        organizationId: details.organizationId,

        // Audit trail
        changes: details.changes,
        changeCount,
        changedFields: Object.keys(details.changes),

        duration: details.duration,
        slow: details.duration > 2000,
        component: 'business-logic',
        ...details.metadata,
      },
    };
  },

  /**
   * Delete operation - removing a resource (soft or hard delete)
   */
  delete: (
    resourceType: string,
    details: {
      resourceId: string;
      resourceName?: string;
      userId: string;
      organizationId?: string;
      soft: boolean;
      duration: number;
      metadata?: Record<string, unknown>;
    }
  ): LogTemplate => ({
    message: `${resourceType} ${details.soft ? 'deactivated (soft delete)' : 'permanently deleted'}`,
    context: {
      operation: `delete_${resourceType}`,
      resourceType,
      resourceId: details.resourceId,
      resourceName: details.resourceName,
      userId: details.userId,
      organizationId: details.organizationId,
      deletionType: details.soft ? 'soft' : 'hard',
      permanent: !details.soft,
      duration: details.duration,
      component: 'business-logic',
      ...details.metadata,
    },
  }),
};

/**
 * Authentication Operation Templates
 * Login, logout, token refresh, MFA operations
 */
export const authTemplates = {
  /**
   * Login attempt (success or failure)
   */
  loginAttempt: (
    success: boolean,
    details: {
      email?: string;
      userId?: string;
      method: 'password' | 'saml' | 'oidc' | 'mfa' | 'refresh_token';
      provider?: string;
      reason?: string;
      ipAddress?: string;
      userAgent?: string;
      sessionDuration?: number;
      metadata?: Record<string, unknown>;
    }
  ): LogTemplate => ({
    message: `Login ${success ? 'successful' : 'failed'} via ${details.method}${details.provider ? ` (${details.provider})` : ''}`,
    context: {
      operation: 'login',
      success,
      method: details.method,
      provider: details.provider,

      // User context (email will be auto-sanitized by logger)
      email: details.email,
      userId: details.userId,

      // Security context
      ipAddress: details.ipAddress,
      userAgent: details.userAgent,

      // Failure details
      reason: success ? undefined : details.reason,

      // Session info
      sessionDuration: details.sessionDuration,

      component: 'auth',
      severity: success ? 'info' : 'medium',
      ...details.metadata,
    },
  }),

  /**
   * Token refresh operation
   */
  tokenRefresh: (
    success: boolean,
    details: {
      userId?: string;
      email?: string;
      reason?: string;
      sessionAge?: number;
      lastActivity?: string;
      ipAddress?: string;
      userAgent?: string;
      metadata?: Record<string, unknown>;
    }
  ): LogTemplate => ({
    message: `Token refresh ${success ? 'successful' : 'failed'}${details.reason ? `: ${details.reason}` : ''}`,
    context: {
      operation: 'token_refresh',
      success,

      // User context
      userId: details.userId,
      email: details.email,

      // Session context
      sessionAge: details.sessionAge,
      lastActivity: details.lastActivity,

      // Security context
      ipAddress: details.ipAddress,
      userAgent: details.userAgent,

      // Failure details
      reason: success ? undefined : details.reason,

      component: 'auth',
      severity: success ? 'low' : 'medium',
      ...details.metadata,
    },
  }),

  /**
   * MFA verification attempt
   */
  mfaVerification: (
    success: boolean,
    details: {
      userId: string;
      email?: string;
      method: 'totp' | 'webauthn' | 'sms' | 'email';
      credentialId?: string;
      reason?: string;
      ipAddress?: string;
      userAgent?: string;
      metadata?: Record<string, unknown>;
    }
  ): LogTemplate => ({
    message: `MFA verification ${success ? 'successful' : 'failed'} (${details.method})`,
    context: {
      operation: 'mfa_verification',
      success,
      method: details.method,

      // User context
      userId: details.userId,
      email: details.email,

      // Credential info
      credentialId: details.credentialId,

      // Security context
      ipAddress: details.ipAddress,
      userAgent: details.userAgent,

      // Failure details
      reason: success ? undefined : details.reason,

      component: 'auth',
      severity: success ? 'info' : 'high',
      ...details.metadata,
    },
  }),
};

/**
 * Database Operation Templates
 * Query completion, performance tracking
 */
export const databaseTemplates = {
  /**
   * Database query completion
   */
  queryComplete: (
    operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE',
    table: string,
    details: {
      duration: number;
      rowCount: number;
      filters?: Record<string, unknown>;
      slow?: boolean;
      metadata?: Record<string, unknown>;
    }
  ): LogTemplate => {
    const slowThreshold = operation === 'SELECT' ? 500 : 1000;
    const isSlow = details.slow ?? details.duration > slowThreshold;

    return {
      message: `Database ${operation} on ${table} completed - ${details.rowCount} row${details.rowCount === 1 ? '' : 's'}${isSlow ? ' (SLOW)' : ''}`,
      context: {
        operation: operation.toLowerCase(),
        table,
        duration: details.duration,
        rowCount: details.rowCount,
        filters: details.filters,
        slow: isSlow,
        slowThreshold,
        component: 'database',
        ...details.metadata,
      },
    };
  },
};

/**
 * Security Event Templates
 * Suspicious activity, permission denials, security violations
 */
export const securityTemplates = {
  /**
   * Permission denied event
   */
  permissionDenied: (details: {
    userId: string;
    email?: string;
    requiredPermission: string | string[];
    resource?: string;
    resourceId?: string;
    organizationId?: string;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
  }): LogTemplate => {
    const permissions = Array.isArray(details.requiredPermission)
      ? details.requiredPermission
      : [details.requiredPermission];

    return {
      message: `Permission denied - user lacks required permission${permissions.length > 1 ? 's' : ''}: ${permissions.join(', ')}`,
      context: {
        operation: 'permission_check',
        success: false,

        // User context
        userId: details.userId,
        email: details.email,

        // Permission details
        requiredPermissions: permissions,
        permissionCount: permissions.length,

        // Resource context
        resource: details.resource,
        resourceId: details.resourceId,
        organizationId: details.organizationId,

        // Security context
        ipAddress: details.ipAddress,
        userAgent: details.userAgent,

        component: 'security',
        severity: 'medium',
        ...details.metadata,
      },
    };
  },

  /**
   * Suspicious activity detected
   */
  suspiciousActivity: (
    activityType: string,
    details: {
      userId?: string;
      email?: string;
      reason: string;
      blocked: boolean;
      ipAddress?: string;
      userAgent?: string;
      metadata?: Record<string, unknown>;
    }
  ): LogTemplate => ({
    message: `Suspicious activity detected: ${activityType} - ${details.blocked ? 'BLOCKED' : 'ALLOWED'}`,
    context: {
      operation: 'suspicious_activity',
      activityType,

      // User context
      userId: details.userId,
      email: details.email,

      // Activity details
      reason: details.reason,
      blocked: details.blocked,

      // Security context
      ipAddress: details.ipAddress,
      userAgent: details.userAgent,

      component: 'security',
      severity: 'high',
      alert: true,
      ...details.metadata,
    },
  }),
};

/**
 * Performance Tracking Templates
 * Slow operations, bottlenecks
 */
export const performanceTemplates = {
  /**
   * Slow operation detected
   */
  slowOperation: (
    operationType: string,
    details: {
      duration: number;
      threshold: number;
      userId?: string;
      organizationId?: string;
      resourceType?: string;
      resourceId?: string;
      breakdown?: Record<string, number>;
      metadata?: Record<string, unknown>;
    }
  ): LogTemplate => ({
    message: `Slow ${operationType} detected - ${details.duration}ms (threshold: ${details.threshold}ms)`,
    context: {
      operation: operationType,

      // Performance metrics
      duration: details.duration,
      threshold: details.threshold,
      slowBy: details.duration - details.threshold,
      slowPercent: Math.round(((details.duration - details.threshold) / details.threshold) * 100),
      breakdown: details.breakdown,

      // Context
      userId: details.userId,
      organizationId: details.organizationId,
      resourceType: details.resourceType,
      resourceId: details.resourceId,

      component: 'performance',
      severity: 'medium',
      alert: details.duration > details.threshold * 2, // Alert if 2x slower than threshold
      ...details.metadata,
    },
  }),
};

/**
 * Export all templates as a single object
 */
export const logTemplates = {
  crud: crudTemplates,
  auth: authTemplates,
  database: databaseTemplates,
  security: securityTemplates,
  performance: performanceTemplates,
};

/**
 * Helper: Calculate field changes between two objects
 * Useful for update operations to build change tracking
 *
 * @example
 * ```typescript
 * const before = { name: 'Old', status: 'active' };
 * const after = { name: 'New', status: 'active' };
 * const changes = calculateChanges(before, after);
 * // Result: { name: { from: 'Old', to: 'New' } }
 * ```
 */
export function calculateChanges<T extends Record<string, unknown>>(
  before: T,
  after: T,
  fieldsToTrack?: (keyof T)[]
): Record<string, FieldChange> {
  const changes: Record<string, FieldChange> = {};

  const fields = fieldsToTrack || (Object.keys(after) as (keyof T)[]);

  for (const field of fields) {
    if (before[field] !== after[field]) {
      changes[field as string] = {
        from: before[field],
        to: after[field],
      };
    }
  }

  return changes;
}

/**
 * Helper: Sanitize filter values for logging
 * Removes undefined/null values and truncates long strings
 */
export function sanitizeFilters(filters: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null) {
      continue;
    }

    if (typeof value === 'string' && value.length > 100) {
      sanitized[key] = `${value.substring(0, 100)}...`;
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}
