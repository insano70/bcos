import { z } from 'zod';
import { createSafeTextSchema } from './sanitization';

// Generate SQL request
export const generateSQLSchema = z.object({
  natural_language_query: createSafeTextSchema(10, 1000, 'Query'),
  model: z.string().optional(), // Optional - backend uses DATA_EXPLORER_MODEL_ID env var if not provided
  temperature: z.number().min(0).max(1).default(0.1),
  include_explanation: z.boolean().default(true),
  tiers: z.array(z.union([z.literal(1), z.literal(2), z.literal(3)])).optional(),
});

// Execute query request
export const executeQuerySchema = z.object({
  sql: z.string().min(1, 'SQL query is required').max(100000, 'SQL query too long'),
  limit: z.coerce.number().int().min(1).max(10000).default(1000),
  timeout_ms: z.coerce.number().int().min(1000).max(300000).default(30000),
  dry_run: z.boolean().default(false),
  query_history_id: z.string().uuid().optional(),
});

// Table metadata query params
export const metadataTablesQuerySchema = z.object({
  schema_name: z.string().default('ih'),
  tier: z.coerce.number().int().min(1).max(3).optional(),
  is_active: z
    .string()
    .optional()
    .transform((val) => (val === 'true' ? true : val === 'false' ? false : undefined)),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(10000).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

// Table metadata update
export const tableMetadataUpdateSchema = z.object({
  display_name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  row_meaning: z.string().max(500).optional(),
  tier: z.coerce.number().int().min(1).max(3).optional(),
  tags: z.array(z.string()).optional(),
  is_active: z.boolean().optional(),
  sample_questions: z.array(z.string()).optional(),
  common_filters: z.array(z.string()).optional(),
  common_joins: z.array(z.string()).optional(),
});

// Query history params
export const queryHistoryParamsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: z
    .enum(['generated', 'executing', 'success', 'failed', 'cancelled'])
    .optional(),
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional(),
});


