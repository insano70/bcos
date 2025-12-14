/**
 * SQL AST Parser Utilities
 * Provides secure SQL parsing, validation, and modification using node-sql-parser
 *
 * SECURITY: This module is critical for Data Explorer query security.
 * All user-submitted SQL must pass through these utilities before execution.
 */

import { Parser, type AST } from 'node-sql-parser';
import { log } from '@/lib/logger';

// Initialize parser with PostgreSQL dialect
const parser = new Parser();
const PARSER_OPTIONS = { database: 'Postgresql' } as const;

/**
 * Internal AST type for manipulation
 * We use a more permissive type internally since node-sql-parser's
 * exact types are complex and we only need to modify specific fields
 */
type InternalAST = AST & {
  where?: unknown;
  from?: unknown[];
  _next?: InternalAST;
};

/**
 * Parsed table reference from SQL AST
 */
export interface ParsedTableRef {
  schema: string | null;
  table: string;
  alias: string | null;
}

/**
 * Result of SQL parsing and validation
 */
export interface SQLParseResult {
  isValid: boolean;
  errors: string[];
  ast: InternalAST | null;
  tables: ParsedTableRef[];
  hasUnion: boolean;
  hasSubquery: boolean;
  statementType: string | null;
}

/**
 * Result of security filter injection
 */
export interface SecurityFilterResult {
  success: boolean;
  sql: string;
  error?: string;
}

/**
 * Internal table reference structure from node-sql-parser AST
 */
interface SQLTableRef {
  db: string | null;
  table: string;
  as: string | null;
  expr?: {
    type: string;
    ast?: InternalAST;
  };
  join?: string;
  on?: SQLWhereClause;
}

/**
 * Internal WHERE clause structure
 */
interface SQLWhereClause {
  type: string;
  operator?: string;
  left?: SQLWhereClause | SQLColumnRef | SQLValue;
  right?: SQLWhereClause | SQLColumnRef | SQLValue;
  value?: unknown;
  args?: { value: unknown[] };
}

interface SQLColumnRef {
  type: 'column_ref';
  table: string | null;
  column: string;
}

interface SQLValue {
  type: 'number' | 'string' | 'bool';
  value: number | string | boolean;
}

/**
 * Parse SQL and extract structural information
 * Returns detailed parse result with tables, unions, subqueries detected
 */
export function parseSQL(sql: string): SQLParseResult {
  const result: SQLParseResult = {
    isValid: false,
    errors: [],
    ast: null,
    tables: [],
    hasUnion: false,
    hasSubquery: false,
    statementType: null,
  };

  try {
    const ast = parser.astify(sql, PARSER_OPTIONS);

    // Handle array of statements (multiple queries)
    if (Array.isArray(ast)) {
      if (ast.length > 1) {
        result.errors.push('Multiple SQL statements not allowed');
        return result;
      }
      result.ast = ast[0] as InternalAST;
    } else {
      result.ast = ast as InternalAST;
    }

    if (!result.ast) {
      result.errors.push('Failed to parse SQL');
      return result;
    }

    result.statementType = result.ast.type;

    // Only SELECT statements allowed
    if (result.ast.type !== 'select') {
      result.errors.push(`Only SELECT statements are allowed, got: ${result.ast.type}`);
      return result;
    }

    // Check for UNION (linked via _next)
    if (result.ast._next) {
      result.hasUnion = true;
      result.errors.push('UNION queries are not allowed for security reasons');
    }

    // Extract all table references and check for subqueries
    extractTablesFromAST(result.ast, result.tables, result);

    result.isValid = result.errors.length === 0;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown parse error';
    result.errors.push(`SQL parse error: ${errorMessage}`);

    log.error('SQL parsing failed', error instanceof Error ? error : new Error(errorMessage), {
      operation: 'sql_parse',
      sqlPreview: sql.substring(0, 200),
      component: 'sql-ast-parser',
    });
  }

  return result;
}

/**
 * Recursively extract table references from AST
 * Also detects subqueries in FROM clause or WHERE clause
 */
function extractTablesFromAST(
  ast: InternalAST,
  tables: ParsedTableRef[],
  result: SQLParseResult
): void {
  const fromClause = ast.from as SQLTableRef[] | null | undefined;
  if (!fromClause) return;

  for (const fromItem of fromClause) {
    // Check if this is a subquery (node-sql-parser puts it in expr.ast)
    const fromItemAny = fromItem as unknown as Record<string, unknown>;
    if (fromItemAny.expr && typeof fromItemAny.expr === 'object') {
      const exprObj = fromItemAny.expr as Record<string, unknown>;
      if (exprObj.ast && typeof exprObj.ast === 'object') {
        const astObj = exprObj.ast as Record<string, unknown>;
        if (astObj.type === 'select') {
          result.hasSubquery = true;
          result.errors.push('Subqueries in FROM clause are not allowed for security reasons');
          // Still extract tables from subquery for reporting
          extractTablesFromAST(astObj as unknown as InternalAST, tables, result);
        }
      }
    }
    if (fromItem.table) {
      tables.push({
        schema: fromItem.db,
        table: fromItem.table,
        alias: fromItem.as,
      });
    }

    // Check JOIN conditions for subqueries
    if (fromItem.on) {
      checkWhereForSubqueries(fromItem.on, result);
    }
  }

  // Check WHERE clause for subqueries
  const whereClause = ast.where as SQLWhereClause | null | undefined;
  if (whereClause) {
    checkWhereForSubqueries(whereClause, result);
  }
}

/**
 * Check WHERE/ON clause for subqueries (IN (SELECT ...), EXISTS, etc.)
 */
function checkWhereForSubqueries(clause: SQLWhereClause, result: SQLParseResult): void {
  if (!clause) return;

  // Check for subquery types
  if (clause.type === 'select') {
    result.hasSubquery = true;
    result.errors.push('Subqueries in WHERE clause are not allowed for security reasons');
    return;
  }

  // Recursively check left and right operands
  if (clause.left && typeof clause.left === 'object' && 'type' in clause.left) {
    checkWhereForSubqueries(clause.left as SQLWhereClause, result);
  }
  if (clause.right && typeof clause.right === 'object' && 'type' in clause.right) {
    checkWhereForSubqueries(clause.right as SQLWhereClause, result);
  }

  // Check for expr_list with subqueries (IN (SELECT ...))
  // node-sql-parser puts subqueries in expr_list.value[].ast
  const clauseAny = clause as unknown as Record<string, unknown>;
  if (clauseAny.type === 'expr_list' && Array.isArray(clauseAny.value)) {
    for (const item of clauseAny.value) {
      if (item && typeof item === 'object') {
        const itemObj = item as Record<string, unknown>;
        // Check for nested ast with type 'select'
        if (itemObj.ast && typeof itemObj.ast === 'object') {
          const astObj = itemObj.ast as Record<string, unknown>;
          if (astObj.type === 'select') {
            result.hasSubquery = true;
            result.errors.push('Subqueries in IN clause are not allowed for security reasons');
          }
        }
      }
    }
  }

  // Check args for IN clauses with subqueries (alternative structure)
  if (clause.args?.value) {
    for (const arg of clause.args.value) {
      if (arg && typeof arg === 'object' && 'type' in arg && (arg as SQLWhereClause).type === 'select') {
        result.hasSubquery = true;
        result.errors.push('Subqueries in IN clause are not allowed for security reasons');
      }
    }
  }
}

/**
 * Validate tables against allow-list
 * Returns list of tables that are NOT in the allow-list
 */
export function validateTablesAgainstAllowList(
  tables: ParsedTableRef[],
  allowedTables: Set<string>
): string[] {
  const disallowedTables: string[] = [];

  for (const tableRef of tables) {
    // Build fully qualified name (schema.table or just table)
    const fullName = tableRef.schema
      ? `${tableRef.schema}.${tableRef.table}`
      : tableRef.table;

    // Also check without schema prefix for ih. tables
    const tableOnly = tableRef.table;

    if (!allowedTables.has(fullName) && !allowedTables.has(tableOnly)) {
      disallowedTables.push(fullName);
    }
  }

  return disallowedTables;
}

/**
 * Build a WHERE clause AST node for practice_uid filtering
 */
function buildPracticeFilter(practiceUids: number[]): SQLWhereClause {
  if (practiceUids.length === 1) {
    // Single value: practice_uid = X
    return {
      type: 'binary_expr',
      operator: '=',
      left: {
        type: 'column_ref',
        table: null,
        column: 'practice_uid',
      } as SQLColumnRef,
      right: {
        type: 'number',
        value: practiceUids[0],
      } as SQLValue,
    };
  }

  // Multiple values: practice_uid IN (X, Y, Z)
  return {
    type: 'binary_expr',
    operator: 'IN',
    left: {
      type: 'column_ref',
      table: null,
      column: 'practice_uid',
    } as SQLColumnRef,
    right: {
      type: 'expr_list',
      value: practiceUids.map((uid) => ({
        type: 'number',
        value: uid,
      })),
    } as unknown as SQLValue,
  };
}

/**
 * Inject security filter (practice_uid) into parsed AST
 * Returns modified SQL string
 *
 * SECURITY: This properly injects WHERE clause at correct position in AST,
 * avoiding the string concatenation issues of the previous implementation.
 */
export function injectSecurityFilter(
  ast: InternalAST,
  practiceUids: number[]
): SecurityFilterResult {
  try {
    // Build the practice_uid filter clause
    const practiceFilter = buildPracticeFilter(practiceUids);

    // If there's an existing WHERE clause, AND it with our filter
    if (ast.where) {
      ast.where = {
        type: 'binary_expr',
        operator: 'AND',
        left: ast.where,
        right: practiceFilter,
      };
    } else {
      // No existing WHERE, just set our filter
      ast.where = practiceFilter;
    }

    // Convert AST back to SQL
    const securedSQL = parser.sqlify(ast, PARSER_OPTIONS);

    return {
      success: true,
      sql: securedSQL,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    log.error('Failed to inject security filter', error instanceof Error ? error : new Error(errorMessage), {
      operation: 'inject_security_filter',
      practiceCount: practiceUids.length,
      component: 'sql-ast-parser',
    });

    return {
      success: false,
      sql: '',
      error: `Failed to inject security filter: ${errorMessage}`,
    };
  }
}

/**
 * Check if SQL contains destructive operations
 * Returns list of detected destructive patterns
 */
export function checkDestructiveOperations(sql: string): string[] {
  const destructivePatterns = [
    { pattern: /\bDROP\b/i, name: 'DROP' },
    { pattern: /\bTRUNCATE\b/i, name: 'TRUNCATE' },
    { pattern: /\bDELETE\b/i, name: 'DELETE' },
    { pattern: /\bINSERT\b/i, name: 'INSERT' },
    { pattern: /\bUPDATE\b/i, name: 'UPDATE' },
    { pattern: /\bALTER\b/i, name: 'ALTER' },
    { pattern: /\bCREATE\b/i, name: 'CREATE' },
    { pattern: /\bGRANT\b/i, name: 'GRANT' },
    { pattern: /\bREVOKE\b/i, name: 'REVOKE' },
  ];

  const detected: string[] = [];
  for (const { pattern, name } of destructivePatterns) {
    if (pattern.test(sql)) {
      detected.push(name);
    }
  }

  return detected;
}

/**
 * Validate SQL completely and return comprehensive result
 * Combines parsing, structure validation, and table validation
 */
export function validateSQL(
  sql: string,
  allowedTables: Set<string>
): {
  isValid: boolean;
  errors: string[];
  tables: ParsedTableRef[];
} {
  const errors: string[] = [];

  // Check for destructive operations first (before parsing)
  const destructive = checkDestructiveOperations(sql);
  if (destructive.length > 0) {
    errors.push(`Destructive operations not allowed: ${destructive.join(', ')}`);
  }

  // Parse the SQL
  const parseResult = parseSQL(sql);
  errors.push(...parseResult.errors);

  // If parsing succeeded, validate tables
  if (parseResult.ast && parseResult.tables.length > 0) {
    const disallowed = validateTablesAgainstAllowList(parseResult.tables, allowedTables);
    if (disallowed.length > 0) {
      errors.push(`Tables not in allow-list: ${disallowed.join(', ')}`);
    }
  }

  // Require at least one table reference
  if (parseResult.ast && parseResult.tables.length === 0) {
    errors.push('Query must reference at least one table');
  }

  return {
    isValid: errors.length === 0,
    errors,
    tables: parseResult.tables,
  };
}
