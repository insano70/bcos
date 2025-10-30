/**
 * SQL Diff Analyzer
 * Compares original vs corrected SQL to identify specific changes
 * Extracts patterns for learning and improvement
 */

export interface SQLDiffResult {
  hasChanges: boolean;
  changeTypes: SQLChangeType[];
  addedTables: string[];
  removedTables: string[];
  addedJoins: JoinChange[];
  removedJoins: JoinChange[];
  modifiedJoins: JoinChange[];
  addedFilters: FilterChange[];
  removedFilters: FilterChange[];
  modifiedFilters: FilterChange[];
  addedColumns: string[];
  removedColumns: string[];
  structuralChanges: StructuralChange[];
  confidence: number; // 0-1 score of analysis confidence
}

export type SQLChangeType =
  | 'table_added'
  | 'table_removed'
  | 'join_added'
  | 'join_removed'
  | 'join_modified'
  | 'filter_added'
  | 'filter_removed'
  | 'filter_modified'
  | 'column_added'
  | 'column_removed'
  | 'aggregation_changed'
  | 'grouping_changed'
  | 'ordering_changed'
  | 'limit_changed';

export interface JoinChange {
  table: string;
  type: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL' | 'CROSS';
  condition: string;
  leftTable?: string;
  rightTable?: string;
}

export interface FilterChange {
  column: string;
  operator: string;
  value: string;
  table?: string;
}

export interface StructuralChange {
  type: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
}

/**
 * Analyze differences between original and corrected SQL
 */
export function analyzeSQLDiff(
  originalSQL: string,
  correctedSQL: string
): SQLDiffResult {
  const result: SQLDiffResult = {
    hasChanges: false,
    changeTypes: [],
    addedTables: [],
    removedTables: [],
    addedJoins: [],
    removedJoins: [],
    modifiedJoins: [],
    addedFilters: [],
    removedFilters: [],
    modifiedFilters: [],
    addedColumns: [],
    removedColumns: [],
    structuralChanges: [],
    confidence: 0.8, // Default confidence
  };

  // Normalize SQL for comparison
  const normalizedOriginal = normalizeSQL(originalSQL);
  const normalizedCorrected = normalizeSQL(correctedSQL);

  // Quick check if there are any changes
  if (normalizedOriginal === normalizedCorrected) {
    result.confidence = 1.0;
    return result;
  }

  result.hasChanges = true;

  // Extract components from both queries
  const originalComponents = extractSQLComponents(originalSQL);
  const correctedComponents = extractSQLComponents(correctedSQL);

  // Analyze table changes
  const tableDiff = compareSets(originalComponents.tables, correctedComponents.tables);
  result.addedTables = tableDiff.added;
  result.removedTables = tableDiff.removed;
  if (tableDiff.added.length > 0) result.changeTypes.push('table_added');
  if (tableDiff.removed.length > 0) result.changeTypes.push('table_removed');

  // Analyze join changes
  const joinDiff = compareJoins(originalComponents.joins, correctedComponents.joins);
  result.addedJoins = joinDiff.added;
  result.removedJoins = joinDiff.removed;
  result.modifiedJoins = joinDiff.modified;
  if (joinDiff.added.length > 0) result.changeTypes.push('join_added');
  if (joinDiff.removed.length > 0) result.changeTypes.push('join_removed');
  if (joinDiff.modified.length > 0) result.changeTypes.push('join_modified');

  // Analyze filter changes
  const filterDiff = compareFilters(
    originalComponents.filters,
    correctedComponents.filters
  );
  result.addedFilters = filterDiff.added;
  result.removedFilters = filterDiff.removed;
  result.modifiedFilters = filterDiff.modified;
  if (filterDiff.added.length > 0) result.changeTypes.push('filter_added');
  if (filterDiff.removed.length > 0) result.changeTypes.push('filter_removed');
  if (filterDiff.modified.length > 0) result.changeTypes.push('filter_modified');

  // Analyze column changes
  const columnDiff = compareSets(originalComponents.columns, correctedComponents.columns);
  result.addedColumns = columnDiff.added;
  result.removedColumns = columnDiff.removed;
  if (columnDiff.added.length > 0) result.changeTypes.push('column_added');
  if (columnDiff.removed.length > 0) result.changeTypes.push('column_removed');

  // Identify structural changes
  result.structuralChanges = identifyStructuralChanges(
    originalComponents,
    correctedComponents
  );

  return result;
}

/**
 * Normalize SQL for comparison
 */
function normalizeSQL(sql: string): string {
  return sql
    .trim()
    .replace(/\s+/g, ' ') // Collapse whitespace
    .replace(/\(\s+/g, '(') // Remove space after (
    .replace(/\s+\)/g, ')') // Remove space before )
    .replace(/,\s+/g, ',') // Normalize commas
    .toLowerCase();
}

/**
 * Extract SQL components for analysis
 */
interface SQLComponents {
  tables: Set<string>;
  joins: JoinChange[];
  filters: FilterChange[];
  columns: Set<string>;
  hasAggregation: boolean;
  hasGroupBy: boolean;
  hasOrderBy: boolean;
  hasLimit: boolean;
}

function extractSQLComponents(sql: string): SQLComponents {
  const normalized = sql.toLowerCase();

  return {
    tables: extractTables(sql),
    joins: extractJoins(sql),
    filters: extractFilters(sql),
    columns: extractColumns(sql),
    hasAggregation: /\b(count|sum|avg|min|max|group_concat)\s*\(/i.test(normalized),
    hasGroupBy: /\bgroup\s+by\b/i.test(normalized),
    hasOrderBy: /\border\s+by\b/i.test(normalized),
    hasLimit: /\blimit\b/i.test(normalized),
  };
}

/**
 * Extract table names from SQL
 */
function extractTables(sql: string): Set<string> {
  const tables = new Set<string>();

  // Match FROM clause
  const fromMatch = sql.match(/\bFROM\s+([a-z_]+\.[a-z_]+)/i);
  if (fromMatch?.[1]) {
    tables.add(fromMatch[1].toLowerCase());
  }

  // Match JOIN clauses
  const joinMatches = Array.from(sql.matchAll(/\bJOIN\s+([a-z_]+\.[a-z_]+)/gi));
  for (const match of joinMatches) {
    if (match[1]) {
      tables.add(match[1].toLowerCase());
    }
  }

  return tables;
}

/**
 * Extract JOIN information
 */
function extractJoins(sql: string): JoinChange[] {
  const joins: JoinChange[] = [];
  const joinRegex =
    /\b(INNER|LEFT|RIGHT|FULL|CROSS)?\s*JOIN\s+([a-z_]+\.[a-z_]+)\s+(?:AS\s+)?([a-z_]+)?\s+ON\s+([^WHERE^GROUP^ORDER^LIMIT]+)/gi;

  const matches = Array.from(sql.matchAll(joinRegex));
  for (const match of matches) {
    if (match[2] && match[4]) {
      const joinType = (match[1] || 'INNER').toUpperCase() as JoinChange['type'];
      const table = match[2].toLowerCase();
      const condition = match[4].trim().toLowerCase();

      joins.push({
        table,
        type: joinType,
        condition,
      });
    }
  }

  return joins;
}

/**
 * Extract WHERE clause filters
 */
function extractFilters(sql: string): FilterChange[] {
  const filters: FilterChange[] = [];

  // Extract WHERE clause
  const whereMatch = sql.match(/\bWHERE\s+(.+?)(?:\bGROUP\s+BY|\bORDER\s+BY|\bLIMIT|$)/i);
  if (!whereMatch?.[1]) return filters;

  const whereClause = whereMatch[1];

  // Simple filter extraction (column operator value)
  const filterRegex = /([a-z_]+\.[a-z_]+)\s*(=|!=|<>|>|<|>=|<=|LIKE|IN|IS)\s*([^AND^OR]+)/gi;
  const matches = Array.from(whereClause.matchAll(filterRegex));

  for (const match of matches) {
    if (match[1] && match[2] && match[3]) {
      const column = match[1].trim().toLowerCase();
      const operator = match[2].trim().toUpperCase();
      const value = match[3].trim();

      filters.push({
        column,
        operator,
        value,
      });
    }
  }

  return filters;
}

/**
 * Extract column names from SELECT
 */
function extractColumns(sql: string): Set<string> {
  const columns = new Set<string>();

  // Extract SELECT clause
  const selectMatch = sql.match(/\bSELECT\s+(.+?)\s+FROM/i);
  if (!selectMatch?.[1]) return columns;

  const selectClause = selectMatch[1];

  // Handle SELECT *
  if (selectClause.trim() === '*') {
    columns.add('*');
    return columns;
  }

  // Split by comma and extract column names
  const columnList = selectClause.split(',');
  for (const col of columnList) {
    const cleaned = col
      .trim()
      .replace(/\s+AS\s+.+$/i, '') // Remove alias
      .replace(/^.+\(/i, '') // Remove function
      .replace(/\).*$/i, '') // Remove closing paren
      .toLowerCase();

    if (cleaned) {
      columns.add(cleaned);
    }
  }

  return columns;
}

/**
 * Compare two sets and return added/removed items
 */
function compareSets<T>(original: Set<T>, corrected: Set<T>): {
  added: T[];
  removed: T[];
  common: T[];
} {
  const added: T[] = [];
  const removed: T[] = [];
  const common: T[] = [];

  for (const item of Array.from(corrected)) {
    if (!original.has(item)) {
      added.push(item);
    } else {
      common.push(item);
    }
  }

  for (const item of Array.from(original)) {
    if (!corrected.has(item)) {
      removed.push(item);
    }
  }

  return { added, removed, common };
}

/**
 * Compare joins
 */
function compareJoins(
  original: JoinChange[],
  corrected: JoinChange[]
): {
  added: JoinChange[];
  removed: JoinChange[];
  modified: JoinChange[];
} {
  const added: JoinChange[] = [];
  const removed: JoinChange[] = [];
  const modified: JoinChange[] = [];

  // Find added joins
  for (const correctedJoin of corrected) {
    const matchingOriginal = original.find((j) => j.table === correctedJoin.table);
    if (!matchingOriginal) {
      added.push(correctedJoin);
    } else if (
      matchingOriginal.type !== correctedJoin.type ||
      matchingOriginal.condition !== correctedJoin.condition
    ) {
      modified.push(correctedJoin);
    }
  }

  // Find removed joins
  for (const originalJoin of original) {
    const matchingCorrected = corrected.find((j) => j.table === originalJoin.table);
    if (!matchingCorrected) {
      removed.push(originalJoin);
    }
  }

  return { added, removed, modified };
}

/**
 * Compare filters
 */
function compareFilters(
  original: FilterChange[],
  corrected: FilterChange[]
): {
  added: FilterChange[];
  removed: FilterChange[];
  modified: FilterChange[];
} {
  const added: FilterChange[] = [];
  const removed: FilterChange[] = [];
  const modified: FilterChange[] = [];

  // Find added filters
  for (const correctedFilter of corrected) {
    const matchingOriginal = original.find((f) => f.column === correctedFilter.column);
    if (!matchingOriginal) {
      added.push(correctedFilter);
    } else if (
      matchingOriginal.operator !== correctedFilter.operator ||
      matchingOriginal.value !== correctedFilter.value
    ) {
      modified.push(correctedFilter);
    }
  }

  // Find removed filters
  for (const originalFilter of original) {
    const matchingCorrected = corrected.find((f) => f.column === originalFilter.column);
    if (!matchingCorrected) {
      removed.push(originalFilter);
    }
  }

  return { added, removed, modified };
}

/**
 * Identify high-level structural changes
 */
function identifyStructuralChanges(
  original: SQLComponents,
  corrected: SQLComponents
): StructuralChange[] {
  const changes: StructuralChange[] = [];

  // Check for aggregation changes
  if (!original.hasAggregation && corrected.hasAggregation) {
    changes.push({
      type: 'aggregation_added',
      description: 'Query was changed from detail to aggregate',
      impact: 'high',
    });
  } else if (original.hasAggregation && !corrected.hasAggregation) {
    changes.push({
      type: 'aggregation_removed',
      description: 'Query was changed from aggregate to detail',
      impact: 'high',
    });
  }

  // Check for GROUP BY changes
  if (!original.hasGroupBy && corrected.hasGroupBy) {
    changes.push({
      type: 'grouping_added',
      description: 'GROUP BY clause was added',
      impact: 'medium',
    });
  } else if (original.hasGroupBy && !corrected.hasGroupBy) {
    changes.push({
      type: 'grouping_removed',
      description: 'GROUP BY clause was removed',
      impact: 'medium',
    });
  }

  // Check for ORDER BY changes
  if (!original.hasOrderBy && corrected.hasOrderBy) {
    changes.push({
      type: 'ordering_added',
      description: 'ORDER BY clause was added',
      impact: 'low',
    });
  }

  // Check for LIMIT changes
  if (!original.hasLimit && corrected.hasLimit) {
    changes.push({
      type: 'limit_added',
      description: 'LIMIT clause was added',
      impact: 'low',
    });
  }

  return changes;
}

/**
 * Generate human-readable summary of SQL differences
 */
export function generateDiffSummary(diff: SQLDiffResult): string {
  if (!diff.hasChanges) {
    return 'No significant changes detected';
  }

  const parts: string[] = [];

  if (diff.addedTables.length > 0) {
    parts.push(`Added tables: ${diff.addedTables.join(', ')}`);
  }

  if (diff.removedTables.length > 0) {
    parts.push(`Removed tables: ${diff.removedTables.join(', ')}`);
  }

  if (diff.addedJoins.length > 0) {
    parts.push(
      `Added joins: ${diff.addedJoins.map((j) => `${j.type} ${j.table}`).join(', ')}`
    );
  }

  if (diff.removedJoins.length > 0) {
    parts.push(
      `Removed joins: ${diff.removedJoins.map((j) => `${j.type} ${j.table}`).join(', ')}`
    );
  }

  if (diff.addedFilters.length > 0) {
    parts.push(
      `Added filters: ${diff.addedFilters.map((f) => `${f.column} ${f.operator}`).join(', ')}`
    );
  }

  if (diff.removedFilters.length > 0) {
    parts.push(
      `Removed filters: ${diff.removedFilters.map((f) => `${f.column} ${f.operator}`).join(', ')}`
    );
  }

  if (diff.structuralChanges.length > 0) {
    parts.push(
      `Structural changes: ${diff.structuralChanges.map((c) => c.description).join('; ')}`
    );
  }

  return parts.join('. ');
}

