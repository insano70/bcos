// Table metadata (matches database schema)
export interface TableMetadata {
  table_metadata_id: string;
  schema_name: string;
  table_name: string;
  display_name: string | null;
  description: string | null;
  row_meaning: string | null;
  primary_entity: string | null;
  common_filters: string[] | null;
  common_joins: string[] | null;
  tier: 1 | 2 | 3;
  sample_questions: string[] | null;
  tags: string[] | null;
  is_active: boolean;
  is_auto_discovered: boolean;
  confidence_score: number | null;
  row_count_estimate: number | null;
  last_analyzed: Date | null;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

// Column metadata
export interface ColumnMetadata {
  column_metadata_id: string;
  table_id: string;
  column_name: string;
  display_name: string | null;
  description: string | null;
  data_type: string;
  semantic_type: 'date' | 'amount' | 'identifier' | 'code' | 'text' | 'boolean' | null;
  is_nullable: boolean;
  is_primary_key: boolean;
  is_foreign_key: boolean;
  foreign_key_table: string | null;
  foreign_key_column: string | null;
  is_org_filter: boolean;
  is_phi: boolean;
  common_values: unknown;
  value_format: string | null;
  example_values: string[] | null;
  min_value: string | null;
  max_value: string | null;
  distinct_count: number | null;
  null_percentage: number | null;
  created_at: Date;
  updated_at: Date;
}

// Query history
export interface QueryHistory {
  query_history_id: string;
  natural_language_query: string;
  generated_sql: string;
  executed_sql: string | null;
  final_sql: string | null;
  status: 'generated' | 'executing' | 'success' | 'failed' | 'cancelled';
  execution_time_ms: number | null;
  row_count: number | null;
  error_message: string | null;
  error_details: unknown;
  user_id: string;
  user_email: string | null;
  organization_id: string | null;
  model_used: string;
  model_temperature: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_cost_cents: number | null;
  user_rating: 1 | 2 | 3 | 4 | 5 | null;
  user_feedback: string | null;
  was_helpful: boolean | null;
  tables_used: string[] | null;
  execution_plan: unknown;
  result_sample: unknown;
  created_at: Date;
  metadata: unknown;
}

// Saved query template
export interface QueryTemplate {
  saved_query_id: string;
  query_history_id: string | null;
  name: string;
  description: string | null;
  category: string | null;
  natural_language_template: string | null;
  sql_template: string | null;
  template_variables: unknown;
  tags: string[] | null;
  is_public: boolean;
  usage_count: number;
  last_used: Date | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

// API request/response types
export interface GenerateSQLParams {
  natural_language_query: string;
  model?: 'anthropic.claude-3-5-sonnet-20241022-v2:0';
  temperature?: number;
  include_explanation?: boolean;
}

export interface GenerateSQLResult {
  sql: string;
  explanation?: string | undefined;
  tables_used: string[];
  estimated_complexity: 'simple' | 'moderate' | 'complex';
  warnings?: string[];
  query_history_id?: string; // populated by API layer after history insert
  model_used: string;
  prompt_tokens: number;
  completion_tokens: number;
}

export interface ExecuteQueryParams {
  sql: string;
  limit?: number;
  timeout_ms?: number;
  dry_run?: boolean;
  query_history_id?: string;
}

export interface ExecuteQueryResult {
  rows: unknown[];
  row_count: number;
  execution_time_ms: number;
  columns: Array<{ name: string; type: string }>;
  cache_hit?: boolean;
  query_hash?: string;
}

// Service option types
export interface MetadataQueryOptions {
  schema_name?: string;
  tier?: 1 | 2 | 3;
  is_active?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface ExecuteQueryOptions {
  limit?: number;
  timeout_ms?: number;
  dry_run?: boolean;
}

export interface BedrockOptions {
  model?: string;
  temperature?: number;
  include_explanation?: boolean;
}

// Query security context
export interface QuerySecurityContext {
  user_id: string;
  accessible_practices: number[];
  accessible_providers: number[];
  is_super_admin: boolean;
  has_full_access: boolean;
}

// Schema discovery result (Phase 2 placeholder to type ahead)
export interface SchemaDiscoveryResult {
  tables_discovered: number;
  columns_analyzed: number;
  relationships_detected: number;
  confidence_scores: Record<string, number>;
  execution_time_ms: number;
}


