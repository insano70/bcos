import {
  bigint,
  boolean,
  decimal,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

// Table metadata
export const explorerTableMetadata = pgTable(
  'explorer_table_metadata',
  {
    table_metadata_id: uuid('table_metadata_id').defaultRandom().primaryKey(),
    schema_name: text('schema_name').notNull().default('ih'),
    table_name: text('table_name').notNull(),
    display_name: text('display_name'),
    description: text('description'),
    row_meaning: text('row_meaning'),
    primary_entity: text('primary_entity'),
    common_filters: text('common_filters').array(),
    common_joins: text('common_joins').array(),
    tier: integer('tier').default(3),
    sample_questions: text('sample_questions').array(),
    tags: text('tags').array(),
    is_active: boolean('is_active').default(true),
    is_auto_discovered: boolean('is_auto_discovered').default(false),
    confidence_score: decimal('confidence_score', { precision: 3, scale: 2 }),
    row_count_estimate: bigint('row_count_estimate', { mode: 'number' }),
    last_analyzed: timestamp('last_analyzed', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    created_by: text('created_by'),
    updated_by: text('updated_by'),
  },
  (table) => ({
    schemaTableIdx: index('idx_explorer_table_metadata_schema_table').on(
      table.schema_name,
      table.table_name
    ),
    tierActiveIdx: index('idx_explorer_table_metadata_tier').on(table.tier, table.is_active),
  })
);

// Column metadata
export const explorerColumnMetadata = pgTable(
  'explorer_column_metadata',
  {
    column_metadata_id: uuid('column_metadata_id').defaultRandom().primaryKey(),
    table_id: uuid('table_id')
      .references(() => explorerTableMetadata.table_metadata_id, { onDelete: 'cascade' })
      .notNull(),
    column_name: text('column_name').notNull(),
    display_name: text('display_name'),
    description: text('description'),
    data_type: text('data_type').notNull(),
    semantic_type: text('semantic_type'),
    is_nullable: boolean('is_nullable').default(true),
    is_primary_key: boolean('is_primary_key').default(false),
    is_foreign_key: boolean('is_foreign_key').default(false),
    foreign_key_table: text('foreign_key_table'),
    foreign_key_column: text('foreign_key_column'),
    is_org_filter: boolean('is_org_filter').default(false),
    is_phi: boolean('is_phi').default(false),
    common_values: jsonb('common_values'),
    value_format: text('value_format'),
    example_values: text('example_values').array(),
    min_value: text('min_value'),
    max_value: text('max_value'),
    distinct_count: integer('distinct_count'),
    null_percentage: decimal('null_percentage', { precision: 5, scale: 2 }),
    // Statistics analysis tracking
    statistics_last_analyzed: timestamp('statistics_last_analyzed', { withTimezone: true }),
    statistics_analysis_status: text('statistics_analysis_status'), // 'pending', 'analyzing', 'completed', 'failed', 'skipped'
    statistics_analysis_error: text('statistics_analysis_error'),
    statistics_analysis_duration_ms: integer('statistics_analysis_duration_ms'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    tableIdIdx: index('idx_explorer_column_metadata_table').on(table.table_id),
    semanticTypeIdx: index('idx_explorer_column_semantic').on(table.semantic_type),
  })
);

// Query history
export const explorerQueryHistory = pgTable(
  'explorer_query_history',
  {
    query_history_id: uuid('query_history_id').defaultRandom().primaryKey(),
    natural_language_query: text('natural_language_query').notNull(),
    generated_sql: text('generated_sql').notNull(),
    executed_sql: text('executed_sql'),
    final_sql: text('final_sql'),
    status: text('status').notNull(),
    execution_time_ms: integer('execution_time_ms'),
    row_count: integer('row_count'),
    error_message: text('error_message'),
    error_details: jsonb('error_details'),
    user_id: text('user_id').notNull(),
    user_email: text('user_email'),
    organization_id: text('organization_id'),
    model_used: text('model_used').default('claude-3-5-sonnet'),
    model_temperature: decimal('model_temperature', { precision: 2, scale: 1 }),
    prompt_tokens: integer('prompt_tokens'),
    completion_tokens: integer('completion_tokens'),
    total_cost_cents: integer('total_cost_cents'),
    user_rating: integer('user_rating'),
    user_feedback: text('user_feedback'),
    was_helpful: boolean('was_helpful'),
    tables_used: text('tables_used').array(),
    execution_plan: jsonb('execution_plan'),
    result_sample: jsonb('result_sample'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
    metadata: jsonb('metadata'),
    
    // SQL editing tracking
    was_sql_edited: boolean('was_sql_edited').default(false),
    original_generated_sql: text('original_generated_sql'), // Store original AI-generated SQL
    sql_edit_count: integer('sql_edit_count').default(0), // Track number of edits
  },
  (table) => ({
    userCreatedIdx: index('idx_explorer_query_history_user').on(table.user_id, table.created_at),
    statusIdx: index('idx_explorer_query_history_status').on(table.status),
    tablesUsedIdx: index('idx_explorer_query_history_tables').using('gin', table.tables_used),
    orgIdx: index('idx_explorer_query_history_org').on(table.organization_id),
  })
);

// Saved queries/templates
export const explorerSavedQueries = pgTable(
  'explorer_saved_queries',
  {
    saved_query_id: uuid('saved_query_id').defaultRandom().primaryKey(),
    query_history_id: uuid('query_history_id').references(() => explorerQueryHistory.query_history_id),
    name: text('name').notNull(),
    description: text('description'),
    category: text('category'),
    natural_language_template: text('natural_language_template'),
    sql_template: text('sql_template'),
    template_variables: jsonb('template_variables'),
    tags: text('tags').array(),
    is_public: boolean('is_public').default(false),
    usage_count: integer('usage_count').default(0),
    last_used: timestamp('last_used', { withTimezone: true }),
    created_by: text('created_by'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    categoryPublicIdx: index('idx_explorer_saved_queries_category').on(
      table.category,
      table.is_public
    ),
    createdByIdx: index('idx_explorer_saved_queries_created_by').on(table.created_by),
  })
);

// Table relationships
export const explorerTableRelationships = pgTable('explorer_table_relationships', {
  table_relationship_id: uuid('table_relationship_id').defaultRandom().primaryKey(),
  from_table_id: uuid('from_table_id').references(() => explorerTableMetadata.table_metadata_id),
  to_table_id: uuid('to_table_id').references(() => explorerTableMetadata.table_metadata_id),
  relationship_type: text('relationship_type'),
  join_condition: text('join_condition').notNull(),
  is_common: boolean('is_common').default(false),
  confidence_score: decimal('confidence_score', { precision: 3, scale: 2 }),
  discovered_from: text('discovered_from'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// Query patterns
export const explorerQueryPatterns = pgTable(
  'explorer_query_patterns',
  {
    query_pattern_id: uuid('query_pattern_id').defaultRandom().primaryKey(),
    pattern_type: text('pattern_type'),
    natural_language_pattern: text('natural_language_pattern'),
    sql_pattern: text('sql_pattern'),
    tables_involved: text('tables_involved').array(),
    usage_count: integer('usage_count').default(1),
    success_rate: decimal('success_rate', { precision: 5, scale: 2 }),
    last_seen: timestamp('last_seen', { withTimezone: true }).defaultNow(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    patternTypeIdx: index('idx_explorer_patterns_type').on(table.pattern_type),
  })
);

// Schema instructions - global query rules
export const explorerSchemaInstructions = pgTable(
  'explorer_schema_instructions',
  {
    instruction_id: uuid('instruction_id').defaultRandom().primaryKey(),
    schema_name: text('schema_name').notNull().default('ih'),
    category: text('category'), // 'filtering', 'aggregation', 'joining', 'business_rule'
    title: text('title').notNull(),
    instruction: text('instruction').notNull(),
    priority: integer('priority').default(2), // 1=critical, 2=important, 3=helpful
    applies_to_tables: text('applies_to_tables').array(), // NULL = all tables
    example_query: text('example_query'),
    example_sql: text('example_sql'),
    is_active: boolean('is_active').default(true),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    created_by: text('created_by'),
    updated_by: text('updated_by'),
  },
  (table) => ({
    schemaActiveIdx: index('idx_schema_instructions_schema').on(table.schema_name, table.is_active),
    priorityIdx: index('idx_schema_instructions_priority').on(table.priority, table.is_active),
  })
);

// Query feedback
export const explorerQueryFeedback = pgTable(
  'explorer_query_feedback',
  {
    feedback_id: uuid('feedback_id').defaultRandom().primaryKey(),
    query_history_id: uuid('query_history_id')
      .references(() => explorerQueryHistory.query_history_id, { onDelete: 'cascade' })
      .notNull(),
    
    // Feedback classification
    feedback_type: text('feedback_type').notNull(), 
    // 'incorrect_sql', 'wrong_tables', 'missing_join', 'wrong_filters', 
    // 'incorrect_columns', 'performance_issue', 'security_concern', 'other'
    
    feedback_category: text('feedback_category').notNull(),
    // 'metadata_gap', 'instruction_needed', 'relationship_missing', 
    // 'semantic_misunderstanding', 'prompt_issue'
    
    severity: text('severity').notNull(), // 'low', 'medium', 'high', 'critical'
    
    // What was wrong
    original_sql: text('original_sql').notNull(),
    corrected_sql: text('corrected_sql'), // User's fixed version
    user_explanation: text('user_explanation'),
    
    // AI analysis of the issue
    detected_issue: text('detected_issue'),
    affected_tables: text('affected_tables').array(),
    affected_columns: text('affected_columns').array(),
    
    // Resolution tracking
    resolution_status: text('resolution_status').default('pending'),
    // 'pending', 'metadata_updated', 'instruction_created', 
    // 'relationship_added', 'resolved', 'wont_fix'
    
    resolution_action: jsonb('resolution_action'), // What was done to fix
    resolved_at: timestamp('resolved_at', { withTimezone: true }),
    resolved_by: text('resolved_by'),
    
    // Learning metadata
    similar_query_count: integer('similar_query_count').default(0),
    recurrence_score: decimal('recurrence_score', { precision: 5, scale: 2 }),
    
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
    created_by: text('created_by').notNull(),
  },
  (table) => ({
    queryHistoryIdx: index('idx_feedback_query_history').on(table.query_history_id),
    statusIdx: index('idx_feedback_status').on(table.resolution_status),
    typeIdx: index('idx_feedback_type').on(table.feedback_type, table.feedback_category),
    severityIdx: index('idx_feedback_severity').on(table.severity),
  })
);

// Improvement suggestions
export const explorerImprovementSuggestions = pgTable(
  'explorer_improvement_suggestions',
  {
    suggestion_id: uuid('suggestion_id').defaultRandom().primaryKey(),
    feedback_id: uuid('feedback_id')
      .references(() => explorerQueryFeedback.feedback_id, { onDelete: 'cascade' }),
    
    suggestion_type: text('suggestion_type').notNull(),
    // 'add_metadata', 'add_instruction', 'add_relationship', 
    // 'update_semantic_type', 'add_example_values'
    
    target_type: text('target_type').notNull(), // 'table', 'column', 'relationship', 'instruction'
    target_id: uuid('target_id'), // ID of the table/column/etc
    
    suggested_change: jsonb('suggested_change').notNull(),
    confidence_score: decimal('confidence_score', { precision: 3, scale: 2 }),
    
    status: text('status').default('pending'),
    // 'pending', 'approved', 'rejected', 'auto_applied'
    
    applied_at: timestamp('applied_at', { withTimezone: true }),
    applied_by: text('applied_by'),
    
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    feedbackIdx: index('idx_suggestions_feedback').on(table.feedback_id),
    statusIdx: index('idx_suggestions_status').on(table.status),
    typeIdx: index('idx_suggestions_type').on(table.suggestion_type),
  })
);
