/**
 * JSONB Field Types
 *
 * Specific types for JSONB columns in the database, replacing generic `unknown` types.
 * These types provide type safety for data explorer and analytics JSONB fields.
 */

// =============================================================================
// Column Statistics (ColumnMetadata.common_values)
// =============================================================================

/**
 * Common value entry for column statistics
 * Represents a frequently occurring value in a column
 */
export interface CommonValueEntry {
  /** The actual value (string representation) */
  value: string;
  /** Number of occurrences */
  count: number;
  /** Percentage of total rows */
  percentage?: number;
}

/**
 * Column common values structure
 * Used in ColumnMetadata.common_values
 */
export type ColumnCommonValues = CommonValueEntry[];

// =============================================================================
// Query Execution Plan (QueryHistory.execution_plan)
// =============================================================================

/**
 * Query execution plan node
 */
export interface ExecutionPlanNode {
  /** Node type (e.g., "Seq Scan", "Index Scan", "Hash Join") */
  node_type: string;
  /** Relation/table name if applicable */
  relation_name?: string;
  /** Index name if using index scan */
  index_name?: string;
  /** Estimated startup cost */
  startup_cost: number;
  /** Estimated total cost */
  total_cost: number;
  /** Estimated rows */
  plan_rows: number;
  /** Estimated row width in bytes */
  plan_width: number;
  /** Actual startup time (if ANALYZE was used) */
  actual_startup_time?: number;
  /** Actual total time (if ANALYZE was used) */
  actual_total_time?: number;
  /** Actual rows returned (if ANALYZE was used) */
  actual_rows?: number;
  /** Number of loops (if ANALYZE was used) */
  actual_loops?: number;
  /** Filter condition if applicable */
  filter?: string;
  /** Join condition if applicable */
  join_filter?: string;
  /** Child plan nodes */
  plans?: ExecutionPlanNode[];
}

/**
 * Complete execution plan structure
 * Used in QueryHistory.execution_plan
 */
export interface ExecutionPlan {
  /** Root plan node */
  plan: ExecutionPlanNode;
  /** Planning time in milliseconds */
  planning_time?: number;
  /** Execution time in milliseconds (if ANALYZE was used) */
  execution_time?: number;
  /** Triggers executed */
  triggers?: Array<{
    trigger_name: string;
    relation: string;
    time: number;
    calls: number;
  }>;
}

// =============================================================================
// Query Result Sample (QueryHistory.result_sample)
// =============================================================================

/**
 * Sample row from query results
 * Contains first N rows for preview purposes
 */
export interface ResultSampleRow {
  [columnName: string]: string | number | boolean | null;
}

/**
 * Query result sample structure
 * Used in QueryHistory.result_sample
 */
export interface ResultSample {
  /** Sample rows (typically first 5-10 rows) */
  rows: ResultSampleRow[];
  /** Column names in order */
  columns: string[];
  /** Whether more rows exist beyond the sample */
  has_more: boolean;
  /** Total row count if known */
  total_count?: number;
}

// =============================================================================
// Query Metadata (QueryHistory.metadata)
// =============================================================================

/**
 * Query execution metadata
 * Used in QueryHistory.metadata
 */
export interface QueryMetadata {
  /** Client IP address */
  client_ip?: string;
  /** User agent string */
  user_agent?: string;
  /** Session ID */
  session_id?: string;
  /** Request ID for correlation */
  request_id?: string;
  /** Source of the query (ui, api, scheduled) */
  source?: 'ui' | 'api' | 'scheduled' | 'internal';
  /** Query complexity score */
  complexity_score?: number;
  /** Cache key if query was cached */
  cache_key?: string;
  /** Whether result came from cache */
  cache_hit?: boolean;
  /** Retry attempt number (if retried) */
  retry_attempt?: number;
  /** Additional context data */
  context?: Record<string, string | number | boolean>;
}

// =============================================================================
// Error Details (QueryHistory.error_details)
// =============================================================================

/**
 * Query error details structure
 * Used in QueryHistory.error_details
 */
export interface QueryErrorDetails {
  /** PostgreSQL error code (e.g., "42P01" for undefined table) */
  code?: string;
  /** Error severity (ERROR, FATAL, PANIC) */
  severity?: string;
  /** Primary error message */
  message: string;
  /** Detailed error message */
  detail?: string;
  /** Hint for resolving the error */
  hint?: string;
  /** Error position in the query */
  position?: number;
  /** Internal query position */
  internal_position?: number;
  /** Internal query that caused the error */
  internal_query?: string;
  /** Error context/location */
  where?: string;
  /** Schema name if applicable */
  schema_name?: string;
  /** Table name if applicable */
  table_name?: string;
  /** Column name if applicable */
  column_name?: string;
  /** Constraint name if applicable */
  constraint_name?: string;
  /** Data type name if applicable */
  data_type_name?: string;
  /** Stack trace (internal use only) */
  stack?: string;
}

// =============================================================================
// Template Variables (QueryTemplate.template_variables)
// =============================================================================

/**
 * Template variable definition
 */
export interface TemplateVariable {
  /** Variable name (used in template as {{name}}) */
  name: string;
  /** Display label for UI */
  label: string;
  /** Variable type */
  type: 'string' | 'number' | 'date' | 'boolean' | 'select' | 'multi_select';
  /** Default value */
  default_value?: string | number | boolean;
  /** Description/help text */
  description?: string;
  /** Required flag */
  required?: boolean;
  /** Options for select/multi_select types */
  options?: Array<{ value: string; label: string }>;
  /** Validation pattern (regex) for string type */
  validation_pattern?: string;
  /** Min value for number type */
  min?: number;
  /** Max value for number type */
  max?: number;
}

/**
 * Template variables collection
 * Used in QueryTemplate.template_variables
 */
export type TemplateVariables = TemplateVariable[];

// =============================================================================
// Resolution Action (QueryFeedback.resolution_action)
// =============================================================================

/**
 * Resolution action for metadata update
 */
export interface MetadataUpdateAction {
  type: 'metadata_update';
  target_type: 'table' | 'column';
  target_id: string;
  field_updated: string;
  old_value: string | null;
  new_value: string;
}

/**
 * Resolution action for instruction creation
 */
export interface InstructionCreateAction {
  type: 'instruction_create';
  instruction_id: string;
  title: string;
  applies_to_tables: string[];
}

/**
 * Resolution action for relationship addition
 */
export interface RelationshipAddAction {
  type: 'relationship_add';
  source_table: string;
  source_column: string;
  target_table: string;
  target_column: string;
  relationship_type: 'one_to_one' | 'one_to_many' | 'many_to_many';
}

/**
 * Union type for all resolution actions
 * Used in QueryFeedback.resolution_action
 */
export type ResolutionAction =
  | MetadataUpdateAction
  | InstructionCreateAction
  | RelationshipAddAction
  | { type: 'manual'; description: string };

// =============================================================================
// Suggested Change (ImprovementSuggestion.suggested_change)
// =============================================================================

/**
 * Suggested metadata change
 */
export interface MetadataSuggestedChange {
  field: string;
  current_value: string | null;
  suggested_value: string;
  confidence: number;
  reasoning: string;
}

/**
 * Suggested instruction
 */
export interface InstructionSuggestedChange {
  title: string;
  instruction: string;
  category: string;
  applies_to_tables: string[];
  priority: number;
}

/**
 * Suggested relationship
 */
export interface RelationshipSuggestedChange {
  source_table: string;
  source_column: string;
  target_table: string;
  target_column: string;
  relationship_type: 'one_to_one' | 'one_to_many' | 'many_to_many';
  confidence: number;
}

/**
 * Runtime suggested change format (used during feedback processing)
 * This is the actual format stored in the database
 */
export interface RuntimeSuggestedChange {
  type: string;
  target: string;
  action: string;
  description: string;
  detectedIssue?: string;
  rootCause?: string;
}

/**
 * Union type for all suggested changes
 * Used in ImprovementSuggestion.suggested_change
 */
export type SuggestedChange =
  | RuntimeSuggestedChange
  | { type: 'metadata'; changes: MetadataSuggestedChange[] }
  | { type: 'instruction'; instruction: InstructionSuggestedChange }
  | { type: 'relationship'; relationship: RelationshipSuggestedChange }
  | { type: 'semantic_type'; column_id: string; suggested_type: string; confidence: number }
  | { type: 'example_values'; column_id: string; values: string[] };

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Type guard for ExecutionPlan
 */
export function isExecutionPlan(value: unknown): value is ExecutionPlan {
  return (
    typeof value === 'object' &&
    value !== null &&
    'plan' in value &&
    typeof (value as ExecutionPlan).plan === 'object'
  );
}

/**
 * Type guard for ResultSample
 */
export function isResultSample(value: unknown): value is ResultSample {
  return (
    typeof value === 'object' &&
    value !== null &&
    'rows' in value &&
    'columns' in value &&
    Array.isArray((value as ResultSample).rows) &&
    Array.isArray((value as ResultSample).columns)
  );
}

/**
 * Type guard for QueryErrorDetails
 */
export function isQueryErrorDetails(value: unknown): value is QueryErrorDetails {
  return (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    typeof (value as QueryErrorDetails).message === 'string'
  );
}

/**
 * Type guard for TemplateVariables
 */
export function isTemplateVariables(value: unknown): value is TemplateVariables {
  return (
    Array.isArray(value) &&
    value.every(
      (v) =>
        typeof v === 'object' &&
        v !== null &&
        'name' in v &&
        'label' in v &&
        'type' in v
    )
  );
}

