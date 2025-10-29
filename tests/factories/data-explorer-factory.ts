import type { TableMetadata, QueryHistory } from '@/lib/types/data-explorer';

export function createTableMetadataFactory(overrides?: Partial<TableMetadata>): TableMetadata {
  return {
    table_metadata_id: crypto.randomUUID(),
    schema_name: 'ih',
    table_name: 'test_table',
    display_name: 'Test Table',
    description: 'A test table for unit testing',
    row_meaning: 'Each row represents a test entity',
    primary_entity: 'test_entity',
    common_filters: ['practice_uid', 'created_at'],
    common_joins: [],
    tier: 1,
    sample_questions: ['How many test entities?'],
    tags: ['test'],
    is_active: true,
    is_auto_discovered: false,
    confidence_score: null,
    row_count_estimate: null,
    last_analyzed: null,
    created_at: new Date(),
    updated_at: new Date(),
    created_by: null,
    updated_by: null,
    ...overrides,
  };
}

export function createQueryHistoryFactory(overrides?: Partial<QueryHistory>): QueryHistory {
  return {
    query_history_id: crypto.randomUUID(),
    natural_language_query: 'How many patients?',
    generated_sql: 'SELECT COUNT(*) FROM ih.patients',
    executed_sql: null,
    final_sql: null,
    status: 'generated',
    execution_time_ms: null,
    row_count: null,
    error_message: null,
    error_details: null,
    user_id: 'test-user-id',
    user_email: 'test@example.com',
    organization_id: 'test-org-id',
    model_used: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    model_temperature: null,
    prompt_tokens: null,
    completion_tokens: null,
    total_cost_cents: null,
    user_rating: null,
    user_feedback: null,
    was_helpful: null,
    tables_used: ['patients'],
    execution_plan: null,
    result_sample: null,
    created_at: new Date(),
    metadata: null,
    ...overrides,
  };
}

