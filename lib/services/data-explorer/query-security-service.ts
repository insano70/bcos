/**
 * Query Security Service
 * Provides secure SQL validation and practice_uid filtering for Data Explorer
 *
 * SECURITY: This service is critical for preventing:
 * - SQL injection attacks
 * - Unauthorized data access (RBAC bypass)
 * - Access to tables outside the allow-list
 * - UNION/subquery-based data exfiltration
 *
 * All queries are parsed into AST, validated, and modified before execution.
 */

import { BaseRBACService } from '@/lib/rbac/base-service';
import { db } from '@/lib/db';
import type { UserContext } from '@/lib/types/rbac';
import { log } from '@/lib/logger';
import {
  parseSQL,
  injectSecurityFilter,
  validateSQL as validateSQLAST,
  checkDestructiveOperations,
  type ParsedTableRef,
} from './sql-ast-parser';
import { getAllowedTables } from './table-allowlist-service';

/**
 * Result of comprehensive SQL security validation
 */
export interface SecurityValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  tables: ParsedTableRef[];
  requiresPracticeFilter: boolean;
}

/**
 * Result of security filter application
 */
export interface SecuredSQLResult {
  sql: string;
  filtered: boolean;
  practiceCount: number;
}

export class QuerySecurityService extends BaseRBACService {
  constructor(userContext: UserContext) {
    super(userContext, db);
  }

  /**
   * Validate SQL query for security issues
   * Performs comprehensive checks including:
   * - Destructive operation detection
   * - AST parsing and structure validation
   * - Table allow-list enforcement
   * - UNION/subquery detection
   *
   * @param sql - Raw SQL query to validate
   * @returns Validation result with errors and warnings
   */
  async validateQuery(sql: string): Promise<SecurityValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let tables: ParsedTableRef[] = [];
    let requiresPracticeFilter = true;

    // Step 1: Check for destructive operations (before parsing)
    const destructive = checkDestructiveOperations(sql);
    if (destructive.length > 0) {
      errors.push(`Destructive operations not allowed: ${destructive.join(', ')}`);
    }

    // Step 2: Parse SQL into AST
    const parseResult = parseSQL(sql);
    if (!parseResult.isValid) {
      errors.push(...parseResult.errors);
    }
    tables = parseResult.tables;

    // Step 3: Validate tables against allow-list
    if (parseResult.ast && tables.length > 0) {
      const allowedTables = await getAllowedTables();
      const validation = validateSQLAST(sql, allowedTables);

      if (!validation.isValid) {
        errors.push(...validation.errors);
      }
    }

    // Step 4: Check if tables reference 'ih' schema (requires practice filter)
    const hasIhTables = tables.some(
      (t) => t.schema === 'ih' || t.schema === null
    );
    if (!hasIhTables && tables.length > 0) {
      warnings.push('Query does not reference ih schema tables');
    }

    // Step 5: Super admin bypass check
    if (this.userContext.is_super_admin) {
      requiresPracticeFilter = false;
      warnings.push('Super admin - practice_uid filter bypassed');
    }

    // Step 6: Full access permission check
    const hasFullAccess = this.checker.hasPermission('data-explorer:execute:all');
    if (hasFullAccess) {
      requiresPracticeFilter = false;
      warnings.push('Full access permission - practice_uid filter bypassed');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      tables,
      requiresPracticeFilter,
    };
  }

  /**
   * Add security filters to SQL query using AST manipulation
   *
   * SECURITY: This method:
   * 1. Parses SQL into AST (validates structure)
   * 2. Injects practice_uid filter at correct position
   * 3. Returns modified SQL
   *
   * Unlike string concatenation, this properly handles:
   * - GROUP BY, ORDER BY, LIMIT clauses
   * - Existing WHERE conditions
   * - Complex query structures
   *
   * @param sql - Raw SQL query
   * @returns Secured SQL with practice_uid filter
   * @throws Error if SQL is invalid or filtering fails
   */
  async addSecurityFilters(sql: string): Promise<string> {
    // Super admin bypass
    if (this.userContext.is_super_admin) {
      log.info('Super admin bypassing practice_uid filtering', {
        operation: 'explorer_security_filter',
        userId: this.userContext.user_id,
        bypassed: true,
        reason: 'super_admin',
        component: 'security',
      });
      return sql;
    }

    // Full access permission bypass
    const hasFullAccess = this.checker.hasPermission('data-explorer:execute:all');
    if (hasFullAccess) {
      log.info('User has full access, bypassing practice_uid filtering', {
        operation: 'explorer_security_filter',
        userId: this.userContext.user_id,
        bypassed: true,
        reason: 'full_access_permission',
        component: 'security',
      });
      return sql;
    }

    // Get accessible practices
    const accessiblePractices = this.userContext.accessible_practices ?? [];

    if (accessiblePractices.length === 0) {
      log.security('data_explorer_access_denied', 'high', {
        reason: 'No accessible practices found',
        userId: this.userContext.user_id,
        organizationId: this.userContext.current_organization_id,
        blocked: true,
      });
      throw new Error('No accessible practices found for user. Cannot execute query.');
    }

    // Parse SQL into AST
    const parseResult = parseSQL(sql);

    if (!parseResult.isValid || !parseResult.ast) {
      log.security('data_explorer_invalid_sql', 'high', {
        userId: this.userContext.user_id,
        errors: parseResult.errors,
        blocked: true,
      });
      throw new Error(`SQL validation failed: ${parseResult.errors.join(', ')}`);
    }

    // Validate tables against allow-list
    const allowedTables = await getAllowedTables();
    const validation = validateSQLAST(sql, allowedTables);

    if (!validation.isValid) {
      log.security('data_explorer_table_not_allowed', 'high', {
        userId: this.userContext.user_id,
        tables: parseResult.tables.map((t) => `${t.schema || ''}.${t.table}`),
        errors: validation.errors,
        blocked: true,
      });
      throw new Error(`Table access denied: ${validation.errors.join(', ')}`);
    }

    // Inject security filter using AST manipulation
    const filterResult = injectSecurityFilter(parseResult.ast, accessiblePractices);

    if (!filterResult.success) {
      log.error('Failed to inject security filter', new Error(filterResult.error || 'Unknown error'), {
        operation: 'explorer_security_filter',
        userId: this.userContext.user_id,
        component: 'security',
      });
      throw new Error(filterResult.error || 'Failed to apply security filters');
    }

    log.info('Security filters applied via AST', {
      operation: 'explorer_security_filter',
      userId: this.userContext.user_id,
      organizationId: this.userContext.current_organization_id,
      practiceCount: accessiblePractices.length,
      tables: parseResult.tables.map((t) => `${t.schema || ''}.${t.table}`),
      method: 'ast_injection',
      component: 'security',
    });

    return filterResult.sql;
  }

  /**
   * Legacy method for backwards compatibility
   * Combines validation and filtering in one call
   *
   * @deprecated Use validateQuery() + addSecurityFilters() separately
   */
  async secureQuery(sql: string): Promise<SecuredSQLResult> {
    const validation = await this.validateQuery(sql);

    if (!validation.isValid) {
      throw new Error(`Query validation failed: ${validation.errors.join(', ')}`);
    }

    if (!validation.requiresPracticeFilter) {
      return {
        sql,
        filtered: false,
        practiceCount: 0,
      };
    }

    const securedSQL = await this.addSecurityFilters(sql);
    const practiceCount = this.userContext.accessible_practices?.length ?? 0;

    return {
      sql: securedSQL,
      filtered: true,
      practiceCount,
    };
  }
}
