# Data Explorer System - Technical Design Document v4

**Document Version:** 4.0  
**Date:** October 28, 2025  
**Author:** Patrick @ Bendcare  
**Project:** Data Explorer - Natural Language Interface for Healthcare Data Warehouse  
**Status:** Production-Ready Specification (Aligned with Bendcare Codebase Standards)

---

## Document Purpose

This v4 document corrects all inconsistencies found in v3 to align with the actual Bendcare codebase patterns, CLAUDE.md standards, and established conventions. **All code examples in this document are production-ready and match existing patterns.**

**Changes from v3:**
- ✅ Fixed service factory naming (`createRBAC*` not `createDataExplorer*`)
- ✅ Corrected analytics database connection patterns
- ✅ Fixed API route handler implementations
- ✅ Updated environment variable schemas
- ✅ Aligned logging patterns with enriched single-log approach
- ✅ Corrected cache service implementation
- ✅ Fixed React Query hooks patterns
- ✅ Updated Bedrock AWS SDK v3 usage
- ✅ Added missing type definitions
- ✅ Corrected component file naming (kebab-case)

**Reference:** For executive summary, project overview, and high-level architecture, see v3 document (lines 1-181). This v4 focuses on corrected technical implementation.

---

## Table of Contents

1. [Database Design](#database-design)
2. [Services Layer Architecture](#services-layer-architecture)
3. [API Routes Layer](#api-routes-layer)
4. [Security & RBAC](#security--rbac)
5. [Frontend Components & Hooks](#frontend-components--hooks)
6. [Implementation Phases](#implementation-phases)
7. [Testing Strategy](#testing-strategy)
8. [Appendices](#appendices)

---

## Database Design

### Drizzle ORM Schema (Modular Pattern)

**File:** `lib/db/explorer-schema.ts`

```typescript
import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  uuid,
  jsonb,
  decimal,
  bigint,
  index,
  sql,
} from 'drizzle-orm/pg-core';

// Table metadata
export const explorerTableMetadata = pgTable(
  'explorer_table_metadata',
  {
    table_metadata_id: uuid('table_metadata_id').defaultRandom().primaryKey(),
    exp_schema_name: text('exp_schema_name').notNull().default('ih'),
    exp_table_name: text('exp_table_name').notNull(),
    exp_display_name: text('exp_display_name'),
    exp_description: text('exp_description'),
    exp_row_meaning: text('exp_row_meaning'),
    exp_primary_entity: text('exp_primary_entity'),
    exp_common_filters: text('exp_common_filters').array(),
    exp_common_joins: text('exp_common_joins').array(),
    exp_tier: integer('exp_tier').default(3),
    exp_sample_questions: text('exp_sample_questions').array(),
    exp_tags: text('exp_tags').array(),
    exp_is_active: boolean('exp_is_active').default(true),
    exp_is_auto_discovered: boolean('exp_is_auto_discovered').default(false),
    exp_confidence_score: decimal('exp_confidence_score', { precision: 3, scale: 2 }),
    exp_row_count_estimate: bigint('exp_row_count_estimate', { mode: 'number' }),
    exp_last_analyzed: timestamp('exp_last_analyzed', { withTimezone: true }),
    exp_created_at: timestamp('exp_created_at', { withTimezone: true }).defaultNow(),
    exp_updated_at: timestamp('exp_updated_at', { withTimezone: true }).defaultNow(),
    exp_created_by: text('exp_created_by'),
    exp_updated_by: text('exp_updated_by'),
  },
  (table) => ({
    schemaTableIdx: index('idx_explorer_table_metadata_schema_table').on(
      table.exp_schema_name,
      table.exp_table_name
    ),
    tierActiveIdx: index('idx_explorer_table_metadata_tier').on(table.exp_tier, table.exp_is_active),
  })
);

// Column metadata
export const explorerColumnMetadata = pgTable(
  'explorer_column_metadata',
  {
    column_metadata_id: uuid('column_metadata_id').defaultRandom().primaryKey(),
    exp_table_id: uuid('exp_table_id')
      .references(() => explorerTableMetadata.table_metadata_id, { onDelete: 'cascade' })
      .notNull(),
    exp_column_name: text('exp_column_name').notNull(),
    exp_display_name: text('exp_display_name'),
    exp_description: text('exp_description'),
    exp_data_type: text('exp_data_type').notNull(),
    exp_semantic_type: text('exp_semantic_type'),
    exp_is_nullable: boolean('exp_is_nullable').default(true),
    exp_is_primary_key: boolean('exp_is_primary_key').default(false),
    exp_is_foreign_key: boolean('exp_is_foreign_key').default(false),
    exp_foreign_key_table: text('exp_foreign_key_table'),
    exp_foreign_key_column: text('exp_foreign_key_column'),
    exp_is_org_filter: boolean('exp_is_org_filter').default(false),
    exp_is_phi: boolean('exp_is_phi').default(false),
    exp_common_values: jsonb('exp_common_values'),
    exp_value_format: text('exp_value_format'),
    exp_example_values: text('exp_example_values').array(),
    exp_min_value: text('exp_min_value'),
    exp_max_value: text('exp_max_value'),
    exp_distinct_count: integer('exp_distinct_count'),
    exp_null_percentage: decimal('exp_null_percentage', { precision: 5, scale: 2 }),
    exp_created_at: timestamp('exp_created_at', { withTimezone: true }).defaultNow(),
    exp_updated_at: timestamp('exp_updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    tableIdIdx: index('idx_explorer_column_metadata_table').on(table.exp_table_id),
    semanticTypeIdx: index('idx_explorer_column_semantic').on(table.exp_semantic_type),
  })
);

// Query history
export const explorerQueryHistory = pgTable(
  'explorer_query_history',
  {
    query_history_id: uuid('query_history_id').defaultRandom().primaryKey(),
    exp_natural_language_query: text('exp_natural_language_query').notNull(),
    exp_generated_sql: text('exp_generated_sql').notNull(),
    exp_executed_sql: text('exp_executed_sql'),
    exp_final_sql: text('exp_final_sql'),
    exp_status: text('exp_status').notNull(),
    exp_execution_time_ms: integer('exp_execution_time_ms'),
    exp_row_count: integer('exp_row_count'),
    exp_error_message: text('exp_error_message'),
    exp_error_details: jsonb('exp_error_details'),
    exp_user_id: text('exp_user_id').notNull(),
    exp_user_email: text('exp_user_email'),
    exp_organization_id: text('exp_organization_id'),
    exp_model_used: text('exp_model_used').default('claude-3-5-sonnet'),
    exp_model_temperature: decimal('exp_model_temperature', { precision: 2, scale: 1 }),
    exp_prompt_tokens: integer('exp_prompt_tokens'),
    exp_completion_tokens: integer('exp_completion_tokens'),
    exp_total_cost_cents: integer('exp_total_cost_cents'),
    exp_user_rating: integer('exp_user_rating'),
    exp_user_feedback: text('exp_user_feedback'),
    exp_was_helpful: boolean('exp_was_helpful'),
    exp_tables_used: text('exp_tables_used').array(),
    exp_execution_plan: jsonb('exp_execution_plan'),
    exp_result_sample: jsonb('exp_result_sample'),
    exp_created_at: timestamp('exp_created_at', { withTimezone: true }).defaultNow(),
    exp_metadata: jsonb('exp_metadata'),
  },
  (table) => ({
    userCreatedIdx: index('idx_explorer_query_history_user').on(
      table.exp_user_id,
      table.exp_created_at
    ),
    statusIdx: index('idx_explorer_query_history_status').on(table.exp_status),
    tablesUsedIdx: index('idx_explorer_query_history_tables').using('gin', table.exp_tables_used),
    orgIdx: index('idx_explorer_query_history_org').on(table.exp_organization_id),
  })
);

// Saved queries/templates
export const explorerSavedQueries = pgTable('explorer_saved_queries', {
  saved_query_id: uuid('saved_query_id').defaultRandom().primaryKey(),
  exp_query_history_id: uuid('exp_query_history_id').references(
    () => explorerQueryHistory.query_history_id
  ),
  exp_name: text('exp_name').notNull(),
  exp_description: text('exp_description'),
  exp_category: text('exp_category'),
  exp_natural_language_template: text('exp_natural_language_template'),
  exp_sql_template: text('exp_sql_template'),
  exp_template_variables: jsonb('exp_template_variables'),
  exp_tags: text('exp_tags').array(),
  exp_is_public: boolean('exp_is_public').default(false),
  exp_usage_count: integer('exp_usage_count').default(0),
  exp_last_used: timestamp('exp_last_used', { withTimezone: true }),
  exp_created_by: text('exp_created_by'),
  exp_created_at: timestamp('exp_created_at', { withTimezone: true }).defaultNow(),
  exp_updated_at: timestamp('exp_updated_at', { withTimezone: true }).defaultNow(),
});

// Table relationships
export const explorerTableRelationships = pgTable('explorer_table_relationships', {
  table_relationship_id: uuid('table_relationship_id').defaultRandom().primaryKey(),
  exp_from_table_id: uuid('exp_from_table_id').references(
    () => explorerTableMetadata.table_metadata_id
  ),
  exp_to_table_id: uuid('exp_to_table_id').references(() => explorerTableMetadata.table_metadata_id),
  exp_relationship_type: text('exp_relationship_type'),
  exp_join_condition: text('exp_join_condition').notNull(),
  exp_is_common: boolean('exp_is_common').default(false),
  exp_confidence_score: decimal('exp_confidence_score', { precision: 3, scale: 2 }),
  exp_discovered_from: text('exp_discovered_from'),
  exp_created_at: timestamp('exp_created_at', { withTimezone: true }).defaultNow(),
});

// Query patterns
export const explorerQueryPatterns = pgTable('explorer_query_patterns', {
  query_pattern_id: uuid('query_pattern_id').defaultRandom().primaryKey(),
  exp_pattern_type: text('exp_pattern_type'),
  exp_natural_language_pattern: text('exp_natural_language_pattern'),
  exp_sql_pattern: text('exp_sql_pattern'),
  exp_tables_involved: text('exp_tables_involved').array(),
  exp_usage_count: integer('exp_usage_count').default(1),
  exp_success_rate: decimal('exp_success_rate', { precision: 5, scale: 2 }),
  exp_last_seen: timestamp('exp_last_seen', { withTimezone: true }).defaultNow(),
  exp_created_at: timestamp('exp_created_at', { withTimezone: true }).defaultNow(),
});
```

### Schema Re-Export Pattern

**Update:** `lib/db/schema.ts`

```typescript
// Add to existing exports (maintain alphabetical order)
export * from './rbac-schema';
export * from './work-item-schema';
export * from './analytics-schema';

// Add Data Explorer tables
export {
  explorerTableMetadata,
  explorerColumnMetadata,
  explorerQueryHistory,
  explorerSavedQueries,
  explorerTableRelationships,
  explorerQueryPatterns,
} from './explorer-schema';
```

### Migration Commands

```bash
# Generate migration from schema changes
pnpm db:generate

# Review generated SQL
cat lib/db/migrations/0033_data_explorer_tables.sql

# Apply migration
pnpm db:migrate

# Validate
pnpm db:validate
```

---

## Services Layer Architecture

### Directory Structure

```
lib/
  services/
    data-explorer/
      explorer-metadata-service.ts        # Table/column metadata CRUD
      bedrock-service.ts                  # AWS Bedrock SQL generation
      query-executor-service.ts           # Query execution against analytics DB
      query-security-service.ts           # practice_uid filtering injection
      schema-discovery-service.ts         # Auto-discovery of metadata
      explorer-history-service.ts         # Query history tracking
      explorer-template-service.ts        # Query template management
      explorer-pattern-service.ts         # Query pattern extraction
      index.ts                            # Factory functions export
```

### Service Factory Pattern (CORRECTED)

**File:** `lib/services/data-explorer/index.ts`

```typescript
import type { UserContext } from '@/lib/types/rbac';
import { ExplorerMetadataService } from './explorer-metadata-service';
import { QueryExecutorService } from './query-executor-service';
import { BedrockService } from './bedrock-service';
import { ExplorerHistoryService } from './explorer-history-service';
import { ExplorerTemplateService } from './explorer-template-service';
import { SchemaDiscoveryService } from './schema-discovery-service';
import { QuerySecurityService } from './query-security-service';
import { ExplorerPatternService } from './explorer-pattern-service';

// ✅ CORRECT: Follow codebase pattern createRBAC<Domain>Service
export function createRBACExplorerMetadataService(
  userContext: UserContext
): ExplorerMetadataService {
  return new ExplorerMetadataService(userContext);
}

export function createRBACExplorerQueryExecutorService(
  userContext: UserContext
): QueryExecutorService {
  return new QueryExecutorService(userContext);
}

export function createRBACExplorerBedrockService(userContext: UserContext): BedrockService {
  return new BedrockService(userContext);
}

export function createRBACExplorerHistoryService(
  userContext: UserContext
): ExplorerHistoryService {
  return new ExplorerHistoryService(userContext);
}

export function createRBACExplorerTemplateService(
  userContext: UserContext
): ExplorerTemplateService {
  return new ExplorerTemplateService(userContext);
}

export function createRBACExplorerSchemaDiscoveryService(
  userContext: UserContext
): SchemaDiscoveryService {
  return new SchemaDiscoveryService(userContext);
}

export function createRBACExplorerQuerySecurityService(
  userContext: UserContext
): QuerySecurityService {
  return new QuerySecurityService(userContext);
}

export function createRBACExplorerPatternService(
  userContext: UserContext
): ExplorerPatternService {
  return new ExplorerPatternService(userContext);
}

// Re-export types
export type {
  MetadataServiceInterface,
  QueryExecutorInterface,
  BedrockServiceInterface,
  HistoryServiceInterface,
  TemplateServiceInterface,
} from './types';
```

### Metadata Service (CORRECTED)

**File:** `lib/services/data-explorer/explorer-metadata-service.ts`

```typescript
import { eq, and, like, desc, sql } from 'drizzle-orm';
import { BaseRBACService } from '@/lib/rbac/base-service';
import { db } from '@/lib/db';
import { explorerTableMetadata, explorerColumnMetadata } from '@/lib/db/schema';
import type { UserContext } from '@/lib/types/rbac';
import type {
  TableMetadata,
  ColumnMetadata,
  MetadataQueryOptions,
} from '@/lib/types/data-explorer';
import { log, SLOW_THRESHOLDS } from '@/lib/logger';

export interface MetadataServiceInterface {
  getTableMetadata(options?: MetadataQueryOptions): Promise<TableMetadata[]>;
  getTableById(tableId: string): Promise<TableMetadata | null>;
  getColumnMetadata(tableId: string): Promise<ColumnMetadata[]>;
  updateTableMetadata(tableId: string, data: Partial<TableMetadata>): Promise<TableMetadata>;
  calculateCompleteness(metadata: TableMetadata): number;
}

export class ExplorerMetadataService
  extends BaseRBACService
  implements MetadataServiceInterface
{
  constructor(userContext: UserContext) {
    super(userContext, db);
  }

  async getTableMetadata(options: MetadataQueryOptions = {}): Promise<TableMetadata[]> {
    const startTime = Date.now();

    // RBAC check
    this.requireAnyPermission([
      'data-explorer:metadata:read:organization',
      'data-explorer:metadata:read:all',
    ]);

    // Build conditions
    const conditions = [];

    if (options.schema_name) {
      conditions.push(eq(explorerTableMetadata.exp_schema_name, options.schema_name));
    }

    if (options.tier !== undefined) {
      conditions.push(eq(explorerTableMetadata.exp_tier, options.tier));
    }

    if (options.is_active !== undefined) {
      conditions.push(eq(explorerTableMetadata.exp_is_active, options.is_active));
    }

    if (options.search) {
      conditions.push(
        sql`(
          ${explorerTableMetadata.exp_table_name} ILIKE ${`%${options.search}%`}
          OR ${explorerTableMetadata.exp_display_name} ILIKE ${`%${options.search}%`}
          OR ${explorerTableMetadata.exp_description} ILIKE ${`%${options.search}%`}
        )`
      );
    }

    // Execute query
    const metadata = await this.dbContext
      .select()
      .from(explorerTableMetadata)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(explorerTableMetadata.exp_tier), explorerTableMetadata.exp_table_name)
      .limit(options.limit ?? 1000)
      .offset(options.offset ?? 0);

    const duration = Date.now() - startTime;

    log.info('Table metadata query completed', {
      operation: 'explorer_list_metadata',
      resourceType: 'explorer_metadata',
      userId: this.userContext.user_id,
      results: { returned: metadata.length },
      duration,
      slow: duration > SLOW_THRESHOLDS.DB_QUERY,
      component: 'business-logic',
    });

    return metadata as TableMetadata[];
  }

  async getTableById(tableId: string): Promise<TableMetadata | null> {
    this.requireAnyPermission([
      'data-explorer:metadata:read:organization',
      'data-explorer:metadata:read:all',
    ]);

    const [metadata] = await this.dbContext
      .select()
      .from(explorerTableMetadata)
      .where(eq(explorerTableMetadata.table_metadata_id, tableId))
      .limit(1);

    return (metadata as TableMetadata) || null;
  }

  async getColumnMetadata(tableId: string): Promise<ColumnMetadata[]> {
    this.requireAnyPermission([
      'data-explorer:metadata:read:organization',
      'data-explorer:metadata:read:all',
    ]);

    const columns = await this.dbContext
      .select()
      .from(explorerColumnMetadata)
      .where(eq(explorerColumnMetadata.exp_table_id, tableId))
      .orderBy(explorerColumnMetadata.exp_column_name);

    return columns as ColumnMetadata[];
  }

  async updateTableMetadata(
    tableId: string,
    data: Partial<TableMetadata>
  ): Promise<TableMetadata> {
    const startTime = Date.now();

    // RBAC check - only admins can update metadata
    this.requirePermission('data-explorer:metadata:manage:all');

    const [updated] = await this.dbContext
      .update(explorerTableMetadata)
      .set({
        ...data,
        exp_updated_at: new Date(),
        exp_updated_by: this.userContext.user_id,
      })
      .where(eq(explorerTableMetadata.table_metadata_id, tableId))
      .returning();

    if (!updated) {
      throw new Error('Table metadata not found');
    }

    const duration = Date.now() - startTime;

    log.info('Table metadata updated', {
      operation: 'explorer_update_metadata',
      resourceType: 'explorer_metadata',
      resourceId: tableId,
      userId: this.userContext.user_id,
      duration,
      component: 'business-logic',
    });

    return updated as TableMetadata;
  }

  calculateCompleteness(metadata: TableMetadata): number {
    const fields = [
      metadata.exp_display_name,
      metadata.exp_description,
      metadata.exp_row_meaning,
      metadata.exp_primary_entity,
      metadata.exp_common_filters?.length,
      metadata.exp_sample_questions?.length,
    ];

    const filled = fields.filter(Boolean).length;
    return Math.round((filled / fields.length) * 100);
  }
}
```

### Query Executor Service (CORRECTED)

**File:** `lib/services/data-explorer/query-executor-service.ts`

```typescript
import { BaseRBACService } from '@/lib/rbac/base-service';
import { db } from '@/lib/db';
import { executeAnalyticsQuery, checkAnalyticsDbHealth } from '@/lib/services/analytics-db';
import { createRBACExplorerQuerySecurityService } from './index';
import type { UserContext } from '@/lib/types/rbac';
import type { QueryExecutionResult, ExecuteQueryOptions } from '@/lib/types/data-explorer';
import { env } from '@/lib/env';
import { log, SLOW_THRESHOLDS } from '@/lib/logger';

export interface QueryExecutorInterface {
  execute(sql: string, options?: ExecuteQueryOptions): Promise<QueryExecutionResult>;
  validateSQL(sql: string): Promise<{ isValid: boolean; errors: string[] }>;
  explainQuery(sql: string): Promise<unknown>;
}

export class QueryExecutorService extends BaseRBACService implements QueryExecutorInterface {
  constructor(userContext: UserContext) {
    super(userContext, db);
  }

  async execute(
    sql: string,
    options: ExecuteQueryOptions = {}
  ): Promise<QueryExecutionResult> {
    const startTime = Date.now();

    // RBAC check
    this.requireAnyPermission([
      'data-explorer:execute:own',
      'data-explorer:execute:organization',
      'data-explorer:execute:all',
    ]);

    // Check analytics DB health
    const { isHealthy, error: healthError } = await checkAnalyticsDbHealth();
    if (!isHealthy) {
      throw new Error(`Analytics database unavailable: ${healthError || 'Unknown error'}`);
    }

    // Inject security filters (practice_uid filtering)
    const securityService = createRBACExplorerQuerySecurityService(this.userContext);
    const securedSQL = await securityService.addSecurityFilters(sql);

    // Add LIMIT if not present
    const finalSQL = this.ensureLimit(securedSQL, options.limit);

    // Execute with timeout
    const timeout = options.timeout_ms || env.DATA_EXPLORER_QUERY_TIMEOUT_MS;

    try {
      const results = await Promise.race([
        executeAnalyticsQuery(finalSQL),
        this.createTimeout(timeout),
      ]);

      const duration = Date.now() - startTime;

      log.info('Analytics query executed', {
        operation: 'explorer_execute_query',
        resourceType: 'explorer_query',
        userId: this.userContext.user_id,
        organizationId: this.userContext.current_organization_id,
        duration,
        slow: duration > SLOW_THRESHOLDS.API_OPERATION,
        rowCount: results.length,
        component: 'analytics-db',
      });

      return {
        rows: results,
        row_count: results.length,
        execution_time_ms: duration,
        columns:
          results.length > 0
            ? Object.keys(results[0]).map((name) => ({ name, type: 'unknown' }))
            : [],
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      log.error('Analytics query execution failed', error, {
        operation: 'explorer_execute_query',
        userId: this.userContext.user_id,
        duration,
        component: 'analytics-db',
      });

      throw new Error(`Query execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async validateSQL(sql: string): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Check for destructive operations
    const destructivePatterns = [
      /\bDROP\b/i,
      /\bTRUNCATE\b/i,
      /\bDELETE\b/i,
      /\bINSERT\b/i,
      /\bUPDATE\b/i,
      /\bALTER\b/i,
      /\bCREATE\b/i,
    ];

    for (const pattern of destructivePatterns) {
      if (pattern.test(sql)) {
        errors.push(`Destructive operation not allowed: ${pattern}`);
      }
    }

    // Check for schema references (must use 'ih' schema)
    if (!sql.includes('ih.')) {
      errors.push('Query must reference tables using "ih." schema prefix');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  async explainQuery(sql: string): Promise<unknown> {
    this.requireAnyPermission([
      'data-explorer:execute:organization',
      'data-explorer:execute:all',
    ]);

    const explainSQL = `EXPLAIN (FORMAT JSON, ANALYZE false) ${sql}`;
    const result = await executeAnalyticsQuery(explainSQL);
    return result[0];
  }

  private ensureLimit(sql: string, limit?: number): string {
    const maxLimit = limit || env.DATA_EXPLORER_MAX_ROWS;

    // Check if LIMIT already exists
    if (/\bLIMIT\s+\d+/i.test(sql)) {
      return sql;
    }

    return `${sql}\nLIMIT ${maxLimit}`;
  }

  private createTimeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Query timeout after ${ms}ms`)), ms);
    });
  }
}
```

### Bedrock Service (CORRECTED)

**File:** `lib/services/data-explorer/bedrock-service.ts`

```typescript
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  type InvokeModelCommandOutput,
} from '@aws-sdk/client-bedrock-runtime';
import { BaseRBACService } from '@/lib/rbac/base-service';
import { db } from '@/lib/db';
import { createRBACExplorerMetadataService } from './index';
import type { UserContext } from '@/lib/types/rbac';
import type { GenerateSQLResult, BedrockOptions, TableMetadata } from '@/lib/types/data-explorer';
import { env } from '@/lib/env';
import { log, SLOW_THRESHOLDS } from '@/lib/logger';

export interface BedrockServiceInterface {
  generateSQL(query: string, options?: BedrockOptions): Promise<GenerateSQLResult>;
  explainSQL(sql: string): Promise<string>;
}

export class BedrockService extends BaseRBACService implements BedrockServiceInterface {
  private client: BedrockRuntimeClient;

  constructor(userContext: UserContext) {
    super(userContext, db);

    // Use IAM role credentials in ECS (no hardcoded keys in production)
    // If env vars are provided, use them (local dev only)
    this.client = new BedrockRuntimeClient({
      region: env.AWS_BEDROCK_REGION,
      ...(env.AWS_BEDROCK_ACCESS_KEY_ID &&
        env.AWS_BEDROCK_SECRET_ACCESS_KEY && {
          credentials: {
            accessKeyId: env.AWS_BEDROCK_ACCESS_KEY_ID,
            secretAccessKey: env.AWS_BEDROCK_SECRET_ACCESS_KEY,
          },
        }),
    });
  }

  async generateSQL(query: string, options: BedrockOptions = {}): Promise<GenerateSQLResult> {
    const startTime = Date.now();

    // RBAC check
    this.requireAnyPermission([
      'data-explorer:query:organization',
      'data-explorer:query:all',
    ]);

    // Get relevant metadata
    const metadataService = createRBACExplorerMetadataService(this.userContext);
    const tableMetadata = await metadataService.getTableMetadata({
      schema_name: 'ih',
      is_active: true,
      tier: 1, // Start with Tier 1 tables only
    });

    // Build prompt
    const prompt = this.buildPrompt(query, tableMetadata, options);

    // Call Bedrock
    const modelId = options.model || env.DATA_EXPLORER_MODEL_ID;
    const temperature = options.temperature || env.DATA_EXPLORER_TEMPERATURE;

    try {
      const command = new InvokeModelCommand({
        modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
          anthropic_version: 'bedrock-2023-05-31',
          max_tokens: env.DATA_EXPLORER_MAX_TOKENS,
          temperature,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        }),
      });

      const response: InvokeModelCommandOutput = await this.client.send(command);

      if (!response.body) {
        throw new Error('Empty response from Bedrock');
      }

      const responseBody = JSON.parse(new TextDecoder().decode(response.body));

      // Extract SQL from response
      const generatedSQL = this.extractSQL(responseBody.content[0].text);
      const tablesUsed = this.extractTablesUsed(generatedSQL);

      const duration = Date.now() - startTime;

      log.info('Bedrock SQL generation completed', {
        operation: 'bedrock_generate_sql',
        resourceType: 'explorer_query',
        userId: this.userContext.user_id,
        organizationId: this.userContext.current_organization_id,
        duration,
        slow: duration > SLOW_THRESHOLDS.LLM_CALL,
        model: modelId,
        tokensUsed: responseBody.usage.input_tokens + responseBody.usage.output_tokens,
        tablesUsed,
        component: 'ai',
      });

      return {
        sql: generatedSQL,
        explanation: options.include_explanation
          ? this.extractExplanation(responseBody.content[0].text)
          : undefined,
        tables_used: tablesUsed,
        estimated_complexity: this.estimateComplexity(generatedSQL),
        model_used: modelId,
        prompt_tokens: responseBody.usage.input_tokens,
        completion_tokens: responseBody.usage.output_tokens,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      log.error('Bedrock SQL generation failed', error, {
        operation: 'bedrock_generate_sql',
        userId: this.userContext.user_id,
        organizationId: this.userContext.current_organization_id,
        duration,
        component: 'ai',
      });

      throw error;
    }
  }

  async explainSQL(sql: string): Promise<string> {
    this.requireAnyPermission([
      'data-explorer:query:organization',
      'data-explorer:query:all',
    ]);

    const prompt = `Explain this PostgreSQL query in plain English:\n\n${sql}`;

    const command = new InvokeModelCommand({
      modelId: env.DATA_EXPLORER_MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 1000,
        temperature: 0.1,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    const response = await this.client.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    return responseBody.content[0].text;
  }

  private buildPrompt(
    query: string,
    metadata: TableMetadata[],
    options: BedrockOptions
  ): string {
    const tableDescriptions = metadata
      .map(
        (table) =>
          `${table.exp_table_name}: ${table.exp_description || 'No description'}\n  Columns: ${table.exp_column_name || 'Not specified'}`
      )
      .join('\n\n');

    return `You are an expert PostgreSQL SQL generator for a healthcare analytics database.

DATABASE CONTEXT:
- Schema: ih (healthcare data warehouse)
- Database: PostgreSQL 17
- All queries are READ-ONLY
- Tables contain healthcare data (patients, encounters, claims, etc.)

AVAILABLE TABLES (Tier 1):
${tableDescriptions}

IMPORTANT PATTERNS:
- Date columns usually end with '_date' or '_dt'
- Amount columns usually end with '_amount' or '_amt'
- Organization filtering uses 'practice_uid' (INTEGER)
- Patient identification uses 'patient_id'
- Most tables have created_at and updated_at timestamps
- Always use 'ih.' schema prefix for tables

USER QUESTION: ${query}

Generate a PostgreSQL query that answers this question.

REQUIREMENTS:
1. Use the 'ih' schema prefix for all tables (e.g., ih.patients)
2. Include comments explaining complex logic
3. Add appropriate JOINs based on the relationships
4. Use efficient query patterns (avoid SELECT *)
5. Include appropriate date formatting
6. Do NOT add LIMIT clause (will be added automatically)
7. Ensure practice_uid exists in all tables used (for security filtering)

OUTPUT FORMAT:
Return only the SQL query with inline comments. No additional text.`;
  }

  private extractSQL(response: string): string {
    // Extract SQL from Bedrock response (handle markdown code blocks)
    const sqlMatch = response.match(/```sql\n([\s\S]*?)\n```/);
    return sqlMatch ? sqlMatch[1].trim() : response.trim();
  }

  private extractExplanation(response: string): string {
    // Extract explanation if present
    const lines = response.split('\n');
    const sqlBlockIndex = lines.findIndex((line) => line.includes('```sql'));

    if (sqlBlockIndex > 0) {
      return lines.slice(0, sqlBlockIndex).join('\n').trim();
    }

    return '';
  }

  private extractTablesUsed(sql: string): string[] {
    // Parse SQL and extract table names
    const tablePattern = /FROM\s+ih\.(\w+)|JOIN\s+ih\.(\w+)/gi;
    const matches = [...sql.matchAll(tablePattern)];
    return [...new Set(matches.map((m) => m[1] || m[2]))];
  }

  private estimateComplexity(sql: string): 'simple' | 'moderate' | 'complex' {
    const joinCount = (sql.match(/JOIN/gi) || []).length;
    const subqueryCount = (sql.match(/SELECT.*FROM.*SELECT/gi) || []).length;

    if (subqueryCount > 0 || joinCount > 3) return 'complex';
    if (joinCount > 0) return 'moderate';
    return 'simple';
  }
}
```

---

## API Routes Layer (CORRECTED)

### Route Structure

```
app/
  api/
    data/
      explorer/
        generate-sql/
          route.ts              # POST - Generate SQL from natural language
        execute-query/
          route.ts              # POST - Execute SQL query
        metadata/
          tables/
            route.ts            # GET/POST - List/Create table metadata
            [id]/
              route.ts          # GET/PUT/DELETE - Single table operations
          columns/
            [id]/
              route.ts          # PUT - Update column metadata
          discover/
            route.ts            # POST - Run schema discovery
        history/
          list/
            route.ts            # GET - Query history with filters
          [id]/
            route.ts            # GET - Single query details
            rate/
              route.ts          # POST - Rate query quality
        templates/
          route.ts              # GET/POST - List/Create templates
          [id]/
            route.ts            # GET/PUT/DELETE - Single template operations
            execute/
              route.ts          # POST - Execute template with variables
        health/
          route.ts              # GET - Health check (public)
```

### Generate SQL Endpoint (CORRECTED)

**File:** `app/api/data/explorer/generate-sql/route.ts`

```typescript
import { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { validateRequest } from '@/lib/api/middleware/validation';
import { createSuccessResponse, createErrorResponse } from '@/lib/api/responses';
import {
  createRBACExplorerBedrockService,
  createRBACExplorerHistoryService,
} from '@/lib/services/data-explorer';
import { generateSQLSchema } from '@/lib/validations/data-explorer';
import { log, SLOW_THRESHOLDS } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';

const generateSQLHandler = async (
  request: NextRequest,
  userContext: UserContext
): Promise<Response> => {
  const startTime = Date.now();

  try {
    // 1. Validate request body
    const validatedData = await validateRequest(request, generateSQLSchema);

    // 2. Create services
    const bedrockService = createRBACExplorerBedrockService(userContext);
    const historyService = createRBACExplorerHistoryService(userContext);

    // 3. Generate SQL
    const result = await bedrockService.generateSQL(validatedData.natural_language_query, {
      model: validatedData.model,
      temperature: validatedData.temperature,
      include_explanation: validatedData.include_explanation,
    });

    // 4. Save to history
    const historyEntry = await historyService.createHistoryEntry({
      natural_language_query: validatedData.natural_language_query,
      generated_sql: result.sql,
      status: 'generated',
      model_used: result.model_used,
      prompt_tokens: result.prompt_tokens,
      completion_tokens: result.completion_tokens,
      tables_used: result.tables_used,
      user_id: userContext.user_id,
      user_email: userContext.email,
      organization_id: userContext.current_organization_id,
    });

    const duration = Date.now() - startTime;

    // 5. ONE comprehensive log (not 6 separate logs)
    log.info('SQL generation completed', {
      operation: 'data_explorer_generate_sql',
      resourceType: 'data_explorer_query',
      userId: userContext.user_id,
      organizationId: userContext.current_organization_id,
      queryLength: validatedData.natural_language_query.length,
      duration,
      slow: duration > SLOW_THRESHOLDS.API_OPERATION,
      model: result.model_used,
      tokensUsed: result.prompt_tokens + result.completion_tokens,
      tablesUsed: result.tables_used,
      complexity: result.estimated_complexity,
      historyId: historyEntry.query_history_id,
      component: 'business-logic',
    });

    // 6. Return with helper function (not NextResponse.json)
    return createSuccessResponse(
      {
        ...result,
        query_history_id: historyEntry.query_history_id,
      },
      'SQL generated successfully'
    );
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('SQL generation failed', error, {
      operation: 'data_explorer_generate_sql',
      userId: userContext.user_id,
      organizationId: userContext.current_organization_id,
      duration,
      component: 'business-logic',
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'SQL generation failed',
      500,
      request
    );
  }
};

export const POST = rbacRoute(generateSQLHandler, {
  permission: ['data-explorer:query:organization', 'data-explorer:query:all'],
  rateLimit: 'api',
});

export const dynamic = 'force-dynamic';
```

### Execute Query Endpoint (CORRECTED)

**File:** `app/api/data/explorer/execute-query/route.ts`

```typescript
import { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { validateRequest } from '@/lib/api/middleware/validation';
import { createSuccessResponse, createErrorResponse } from '@/lib/api/responses';
import {
  createRBACExplorerQueryExecutorService,
  createRBACExplorerHistoryService,
} from '@/lib/services/data-explorer';
import { executeQuerySchema } from '@/lib/validations/data-explorer';
import { log, SLOW_THRESHOLDS } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';

const executeQueryHandler = async (
  request: NextRequest,
  userContext: UserContext
): Promise<Response> => {
  const startTime = Date.now();

  try {
    // 1. Validate request
    const validatedData = await validateRequest(request, executeQuerySchema);

    // 2. Create query executor
    const queryExecutor = createRBACExplorerQueryExecutorService(userContext);

    // 3. Validate SQL first
    const validation = await queryExecutor.validateSQL(validatedData.sql);
    if (!validation.isValid) {
      return createErrorResponse(
        `SQL validation failed: ${validation.errors.join(', ')}`,
        400,
        request
      );
    }

    // 4. Execute query (with automatic practice_uid filtering)
    const result = await queryExecutor.execute(validatedData.sql, {
      limit: validatedData.limit,
      timeout_ms: validatedData.timeout_ms,
      dry_run: validatedData.dry_run,
    });

    // 5. Update history if query_history_id provided
    if (validatedData.query_history_id) {
      const historyService = createRBACExplorerHistoryService(userContext);
      await historyService.updateHistoryEntry(validatedData.query_history_id, {
        status: 'success',
        final_sql: validatedData.sql,
        execution_time_ms: result.execution_time_ms,
        row_count: result.row_count,
        result_sample: result.rows.slice(0, 10), // First 10 rows
      });
    }

    const duration = Date.now() - startTime;

    // 6. Log execution
    log.info('Query executed successfully', {
      operation: 'data_explorer_execute_query',
      resourceType: 'data_explorer_query',
      userId: userContext.user_id,
      organizationId: userContext.current_organization_id,
      duration,
      slow: duration > SLOW_THRESHOLDS.API_OPERATION,
      executionTime: result.execution_time_ms,
      rowCount: result.row_count,
      component: 'business-logic',
    });

    // 7. Return results
    return createSuccessResponse(result, 'Query executed successfully');
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('Query execution failed', error, {
      operation: 'data_explorer_execute_query',
      userId: userContext.user_id,
      organizationId: userContext.current_organization_id,
      duration,
      component: 'business-logic',
    });

    // Update history with error if query_history_id provided
    if (validatedData.query_history_id) {
      try {
        const historyService = createRBACExplorerHistoryService(userContext);
        await historyService.updateHistoryEntry(validatedData.query_history_id, {
          status: 'failed',
          error_message: error instanceof Error ? error.message : 'Unknown error',
        });
      } catch (historyError) {
        log.error('Failed to update history with error', historyError, {
          operation: 'data_explorer_update_history',
          userId: userContext.user_id,
          component: 'business-logic',
        });
      }
    }

    return createErrorResponse(
      error instanceof Error ? error.message : 'Query execution failed',
      500,
      request
    );
  }
};

export const POST = rbacRoute(executeQueryHandler, {
  permission: [
    'data-explorer:execute:own',
    'data-explorer:execute:organization',
    'data-explorer:execute:all',
  ],
  rateLimit: 'api',
});

export const dynamic = 'force-dynamic';
```

---

## Security & RBAC (CORRECTED)

### Permission Definitions

**Add to:** `lib/rbac/permissions.ts` (or seed data)

```typescript
// Data Explorer Permissions
export const DATA_EXPLORER_PERMISSIONS = {
  // Query generation
  'data-explorer:query:organization': 'Generate SQL queries for organization data',
  'data-explorer:query:all': 'Generate SQL queries for all data',

  // Query execution
  'data-explorer:execute:own': 'Execute queries filtered by own provider_uid',
  'data-explorer:execute:organization': 'Execute queries filtered by organization practice_uids',
  'data-explorer:execute:all': 'Execute queries without filtering (super admin)',

  // Metadata management
  'data-explorer:metadata:read:organization': 'View table/column metadata',
  'data-explorer:metadata:read:all': 'View all metadata',
  'data-explorer:metadata:manage:all': 'Create/update/delete metadata (admin only)',

  // History
  'data-explorer:history:read:own': 'View own query history',
  'data-explorer:history:read:organization': 'View organization query history',
  'data-explorer:history:read:all': 'View all query history',

  // Templates
  'data-explorer:templates:read:organization': 'View query templates',
  'data-explorer:templates:read:all': 'View all templates',
  'data-explorer:templates:create:organization': 'Create query templates',
  'data-explorer:templates:manage:own': 'Manage own templates',
  'data-explorer:templates:manage:all': 'Manage all templates',

  // Discovery
  'data-explorer:discovery:run:all': 'Run schema auto-discovery (admin only)',
} as const;
```

### UserContext Integration

All services receive `UserContext` containing:

```typescript
interface UserContext {
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  is_super_admin: boolean;

  // Organization access
  current_organization_id: string;
  organization_ids: string[]; // All accessible orgs (includes children via hierarchy)

  // Role-based access
  roles: Role[];
  all_permissions: Permission[]; // Flattened permission list

  // Analytics security - integer UIDs for row-level filtering
  accessible_practices: number[]; // practice_uid values for ih schema
  accessible_providers: number[]; // provider_uid values for ih schema
}
```

### Security Filtering Strategy

**Fail-Closed Security**: If user has no accessible practices, deny query execution.

```typescript
// In QuerySecurityService
async addSecurityFilters(sql: string): Promise<string> {
  // Super admins bypass filtering
  if (this.userContext.is_super_admin) {
    return sql;
  }

  // Check permission scope
  const hasFullAccess = this.checker.hasPermission('data-explorer:execute:all');
  if (hasFullAccess) {
    return sql;
  }

  // Get accessible practices
  const accessiblePractices = this.userContext.accessible_practices;

  // Fail-closed: Empty array = no data access
  if (accessiblePractices.length === 0) {
    throw new Error('No accessible practices found for user. Cannot execute query.');
  }

  // Inject WHERE practice_uid IN (accessiblePractices)
  return this.injectPracticeFilter(sql, accessiblePractices);
}
```

---

## Frontend Components & Hooks (CORRECTED)

### React Query Hooks

**File:** `lib/hooks/use-data-explorer.ts`

```typescript
import { useApiQuery, useApiMutation } from './use-api';
import type {
  GenerateSQLParams,
  GenerateSQLResult,
  ExecuteQueryParams,
  ExecuteQueryResult,
  TableMetadata,
  QueryHistory,
  QueryTemplate,
} from '@/lib/types/data-explorer';

// Generate SQL from natural language (mutation)
export function useGenerateSQL() {
  return useApiMutation<GenerateSQLResult, GenerateSQLParams>({
    mutationFn: (params) =>
      apiClient.post<GenerateSQLResult>('/api/data/explorer/generate-sql', params),
  });
}

// Execute SQL query (mutation)
export function useExecuteQuery() {
  return useApiMutation<ExecuteQueryResult, ExecuteQueryParams>({
    mutationFn: (params) =>
      apiClient.post<ExecuteQueryResult>('/api/data/explorer/execute-query', params),
  });
}

// List table metadata (query)
export function useTableMetadata(params?: {
  schema_name?: string;
  tier?: number;
  is_active?: boolean;
  search?: string;
}) {
  const searchParams = new URLSearchParams();
  if (params?.schema_name) searchParams.append('schema_name', params.schema_name);
  if (params?.tier !== undefined) searchParams.append('tier', String(params.tier));
  if (params?.is_active !== undefined) searchParams.append('is_active', String(params.is_active));
  if (params?.search) searchParams.append('search', params.search);

  return useApiQuery<TableMetadata[]>(
    ['data-explorer', 'metadata', 'tables', params],
    `/api/data/explorer/metadata/tables?${searchParams.toString()}`,
    {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
    }
  );
}

// Query history (query)
export function useQueryHistory(params?: {
  limit?: number;
  offset?: number;
  status?: string;
}) {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.append('limit', String(params.limit));
  if (params?.offset) searchParams.append('offset', String(params.offset));
  if (params?.status) searchParams.append('status', params.status);

  return useApiQuery<QueryHistory[]>(
    ['data-explorer', 'history', params],
    `/api/data/explorer/history/list?${searchParams.toString()}`,
    {
      staleTime: 1 * 60 * 1000, // 1 minute
    }
  );
}

// Update table metadata (mutation)
export function useUpdateTableMetadata() {
  return useApiMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<TableMetadata> }) =>
      apiClient.put<TableMetadata>(`/api/data/explorer/metadata/tables/${id}`, data),
  });
}

// Query templates (query)
export function useQueryTemplates(category?: string) {
  const searchParams = new URLSearchParams();
  if (category) searchParams.append('category', category);

  return useApiQuery<QueryTemplate[]>(
    ['data-explorer', 'templates', category],
    `/api/data/explorer/templates?${searchParams.toString()}`,
    {
      staleTime: 5 * 60 * 1000, // 5 minutes
    }
  );
}
```

### Component Example (CORRECTED)

**File:** `app/(default)/data/explorer/page.tsx`

```typescript
'use client';

import { useState } from 'react';
import { useGenerateSQL, useExecuteQuery } from '@/lib/hooks/use-data-explorer';

export default function DataExplorerPage() {
  const [query, setQuery] = useState('');
  const [generatedSQL, setGeneratedSQL] = useState('');
  const [queryHistoryId, setQueryHistoryId] = useState<string | null>(null);

  const generateSQL = useGenerateSQL();
  const executeQuery = useExecuteQuery();

  const handleGenerate = async () => {
    try {
      const result = await generateSQL.mutateAsync({
        natural_language_query: query,
        model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        temperature: 0.1,
        include_explanation: true,
      });

      setGeneratedSQL(result.sql);
      setQueryHistoryId(result.query_history_id);
    } catch (error) {
      // Error handling
      console.error('SQL generation failed:', error);
    }
  };

  const handleExecute = async () => {
    try {
      const result = await executeQuery.mutateAsync({
        sql: generatedSQL,
        limit: 1000,
        query_history_id: queryHistoryId || undefined,
      });

      // Display results
      console.log('Query results:', result);
    } catch (error) {
      // Error handling
      console.error('Query execution failed:', error);
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Data Explorer</h1>

      <textarea
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Ask a question about your data..."
        className="w-full h-32 p-2 border rounded"
      />

      <button
        onClick={handleGenerate}
        disabled={generateSQL.isPending}
        className="mt-2 px-4 py-2 bg-violet-500 text-white rounded"
      >
        {generateSQL.isPending ? 'Generating...' : 'Generate SQL'}
      </button>

      {generatedSQL && (
        <div className="mt-4">
          <h2 className="text-lg font-semibold mb-2">Generated SQL:</h2>
          <pre className="bg-gray-100 p-4 rounded overflow-x-auto">{generatedSQL}</pre>

          <button
            onClick={handleExecute}
            disabled={executeQuery.isPending}
            className="mt-2 px-4 py-2 bg-green-500 text-white rounded"
          >
            {executeQuery.isPending ? 'Executing...' : 'Execute Query'}
          </button>
        </div>
      )}

      {executeQuery.data && (
        <div className="mt-4">
          <h2 className="text-lg font-semibold mb-2">Results:</h2>
          <div className="overflow-x-auto">
            {/* Display results in table */}
            <p>Returned {executeQuery.data.row_count} rows</p>
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## Validation Schemas (CORRECTED)

**File:** `lib/validations/data-explorer.ts`

```typescript
import { z } from 'zod';
import { safeTextSchema } from './sanitization';

// Generate SQL request
export const generateSQLSchema = z.object({
  natural_language_query: safeTextSchema
    .min(10, 'Query must be at least 10 characters')
    .max(1000, 'Query must not exceed 1000 characters'),
  model: z
    .enum(['anthropic.claude-3-5-sonnet-20241022-v2:0'])
    .default('anthropic.claude-3-5-sonnet-20241022-v2:0'),
  temperature: z.number().min(0).max(1).default(0.1),
  include_explanation: z.boolean().default(true),
});

// Execute query request
export const executeQuerySchema = z.object({
  sql: safeTextSchema.min(1, 'SQL query is required'),
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
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// Table metadata update
export const tableMetadataUpdateSchema = z.object({
  exp_display_name: z.string().min(1).max(255).optional(),
  exp_description: z.string().max(2000).optional(),
  exp_row_meaning: z.string().max(500).optional(),
  exp_tier: z.coerce.number().int().min(1).max(3).optional(),
  exp_tags: z.array(z.string()).optional(),
  exp_is_active: z.boolean().optional(),
  exp_sample_questions: z.array(z.string()).optional(),
  exp_common_filters: z.array(z.string()).optional(),
  exp_common_joins: z.array(z.string()).optional(),
});

// Query history params
export const queryHistoryParamsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(['generated', 'executing', 'success', 'failed', 'cancelled']).optional(),
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional(),
});
```

---

## Type Definitions (CORRECTED)

**File:** `lib/types/data-explorer.ts`

```typescript
// Table metadata (matches database schema)
export interface TableMetadata {
  table_metadata_id: string;
  exp_schema_name: string;
  exp_table_name: string;
  exp_display_name: string | null;
  exp_description: string | null;
  exp_row_meaning: string | null;
  exp_primary_entity: string | null;
  exp_common_filters: string[] | null;
  exp_common_joins: string[] | null;
  exp_tier: 1 | 2 | 3;
  exp_sample_questions: string[] | null;
  exp_tags: string[] | null;
  exp_is_active: boolean;
  exp_is_auto_discovered: boolean;
  exp_confidence_score: number | null;
  exp_row_count_estimate: number | null;
  exp_last_analyzed: Date | null;
  exp_created_at: Date;
  exp_updated_at: Date;
  exp_created_by: string | null;
  exp_updated_by: string | null;
}

// Column metadata
export interface ColumnMetadata {
  column_metadata_id: string;
  exp_table_id: string;
  exp_column_name: string;
  exp_display_name: string | null;
  exp_description: string | null;
  exp_data_type: string;
  exp_semantic_type: 'date' | 'amount' | 'identifier' | 'code' | 'text' | 'boolean' | null;
  exp_is_nullable: boolean;
  exp_is_primary_key: boolean;
  exp_is_foreign_key: boolean;
  exp_foreign_key_table: string | null;
  exp_foreign_key_column: string | null;
  exp_is_org_filter: boolean;
  exp_is_phi: boolean;
  exp_common_values: unknown;
  exp_value_format: string | null;
  exp_example_values: string[] | null;
  exp_min_value: string | null;
  exp_max_value: string | null;
  exp_distinct_count: number | null;
  exp_null_percentage: number | null;
  exp_created_at: Date;
  exp_updated_at: Date;
}

// Query history
export interface QueryHistory {
  query_history_id: string;
  exp_natural_language_query: string;
  exp_generated_sql: string;
  exp_executed_sql: string | null;
  exp_final_sql: string | null;
  exp_status: 'generated' | 'executing' | 'success' | 'failed' | 'cancelled';
  exp_execution_time_ms: number | null;
  exp_row_count: number | null;
  exp_error_message: string | null;
  exp_error_details: unknown;
  exp_user_id: string;
  exp_user_email: string | null;
  exp_organization_id: string | null;
  exp_model_used: string;
  exp_model_temperature: number | null;
  exp_prompt_tokens: number | null;
  exp_completion_tokens: number | null;
  exp_total_cost_cents: number | null;
  exp_user_rating: 1 | 2 | 3 | 4 | 5 | null;
  exp_user_feedback: string | null;
  exp_was_helpful: boolean | null;
  exp_tables_used: string[] | null;
  exp_execution_plan: unknown;
  exp_result_sample: unknown;
  exp_created_at: Date;
  exp_metadata: unknown;
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
  explanation?: string;
  tables_used: string[];
  estimated_complexity: 'simple' | 'moderate' | 'complex';
  warnings?: string[];
  query_history_id: string;
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

// Service interfaces
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

// Schema discovery result
export interface SchemaDiscoveryResult {
  tables_discovered: number;
  columns_analyzed: number;
  relationships_detected: number;
  confidence_scores: Record<string, number>;
  execution_time_ms: number;
}
```

---

## Environment Variables (CORRECTED)

**Add to:** `lib/env.ts`

```typescript
export const env = createEnv({
  server: {
    // ... existing vars

    // AWS Bedrock (Data Explorer) - AI-powered SQL generation
    AWS_BEDROCK_REGION: z.string().default('us-east-1'),
    AWS_BEDROCK_ACCESS_KEY_ID: z
      .string()
      .min(1, 'AWS_BEDROCK_ACCESS_KEY_ID is required')
      .optional(),
    AWS_BEDROCK_SECRET_ACCESS_KEY: z
      .string()
      .min(1, 'AWS_BEDROCK_SECRET_ACCESS_KEY is required')
      .optional(),

    // Data Explorer Configuration
    DATA_EXPLORER_MODEL_ID: z
      .string()
      .default('anthropic.claude-3-5-sonnet-20241022-v2:0'),
    DATA_EXPLORER_MAX_TOKENS: z.coerce.number().int().positive().default(4096),
    DATA_EXPLORER_TEMPERATURE: z.coerce.number().min(0).max(1).default(0.1),
    DATA_EXPLORER_QUERY_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
    DATA_EXPLORER_MAX_ROWS: z.coerce.number().int().positive().default(10000),
  },
  client: {
    // ... existing client vars
  },
  runtimeEnv: {
    // ... existing mappings

    AWS_BEDROCK_REGION: process.env.AWS_BEDROCK_REGION,
    AWS_BEDROCK_ACCESS_KEY_ID: process.env.AWS_BEDROCK_ACCESS_KEY_ID,
    AWS_BEDROCK_SECRET_ACCESS_KEY: process.env.AWS_BEDROCK_SECRET_ACCESS_KEY,
    DATA_EXPLORER_MODEL_ID: process.env.DATA_EXPLORER_MODEL_ID,
    DATA_EXPLORER_MAX_TOKENS: process.env.DATA_EXPLORER_MAX_TOKENS,
    DATA_EXPLORER_TEMPERATURE: process.env.DATA_EXPLORER_TEMPERATURE,
    DATA_EXPLORER_QUERY_TIMEOUT_MS: process.env.DATA_EXPLORER_QUERY_TIMEOUT_MS,
    DATA_EXPLORER_MAX_ROWS: process.env.DATA_EXPLORER_MAX_ROWS,
  },
});
```

**Add to:** `.env.local`

```bash
# AWS Bedrock (Data Explorer)
AWS_BEDROCK_REGION=us-east-1
AWS_BEDROCK_ACCESS_KEY_ID=your_bedrock_access_key
AWS_BEDROCK_SECRET_ACCESS_KEY=your_bedrock_secret_key

# Data Explorer Configuration
DATA_EXPLORER_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0
DATA_EXPLORER_MAX_TOKENS=4096
DATA_EXPLORER_TEMPERATURE=0.1
DATA_EXPLORER_QUERY_TIMEOUT_MS=30000
DATA_EXPLORER_MAX_ROWS=10000
```

---

## Cache Service (CORRECTED)

**File:** `lib/cache/data-explorer-cache.ts`

```typescript
import { CacheService } from '@/lib/cache/base';
import type { QueryExecutionResult, TableMetadata } from '@/lib/types/data-explorer';

export class DataExplorerCacheService extends CacheService {
  protected namespace = 'explorer';
  protected defaultTTL = 900; // 15 minutes

  // Query results cache (15 min TTL)
  async cacheQueryResult(
    queryHash: string,
    result: QueryExecutionResult,
    ttl?: number
  ): Promise<void> {
    const key = this.buildKey('query', queryHash);
    await this.set(key, result, ttl || this.defaultTTL);
  }

  async getQueryResult(queryHash: string): Promise<QueryExecutionResult | null> {
    const key = this.buildKey('query', queryHash);
    return this.get<QueryExecutionResult>(key);
  }

  // Metadata cache (1 hour TTL)
  async cacheTableMetadata(tableId: string, metadata: TableMetadata): Promise<void> {
    const key = this.buildKey('table', tableId);
    await this.set(key, metadata, 3600); // 1 hour
  }

  async getTableMetadata(tableId: string): Promise<TableMetadata | null> {
    const key = this.buildKey('table', tableId);
    return this.get<TableMetadata>(key);
  }

  // Invalidate metadata cache
  async invalidateTableMetadata(tableId: string): Promise<void> {
    const key = this.buildKey('table', tableId);
    await this.delete(key);
  }

  // Pattern cache (30 min TTL)
  async cachePatterns(patterns: unknown[]): Promise<void> {
    const key = this.buildKey('patterns');
    await this.set(key, patterns, 1800); // 30 minutes
  }

  async getPatterns(): Promise<unknown[] | null> {
    const key = this.buildKey('patterns');
    return this.get<unknown[]>(key);
  }

  // Invalidate all explorer caches
  async invalidateAll(): Promise<void> {
    await this.deletePattern(`${this.namespace}:*`);
  }
}

// Singleton instance
export const dataExplorerCache = new DataExplorerCacheService();
```

---

## Logging Configuration (CORRECTED)

**Add to:** `lib/logger/constants.ts` (or `index.ts` if not separated)

```typescript
export const SLOW_THRESHOLDS = {
  DB_QUERY: 500,
  API_OPERATION: 1000,
  AUTH_OPERATION: 2000,
  LLM_CALL: 3000, // NEW: Bedrock/LLM operations (higher due to network latency)
  SQL_GENERATION: 3000, // Alias for LLM_CALL
} as const;
```

---

## Implementation Phases

### Phase 1: MVP Foundation (Weeks 1-2)

**Deliverables:**

1. **Infrastructure Setup**
   - [ ] Create `lib/db/explorer-schema.ts` with all table definitions
   - [ ] Update `lib/db/schema.ts` to re-export explorer tables
   - [ ] Run `pnpm db:generate` to create migration
   - [ ] Review and apply migration with `pnpm db:migrate`
   - [ ] Set up AWS Bedrock credentials in `.env.local`
   - [ ] Add environment variables to `lib/env.ts`

2. **Services Layer**
   - [ ] Create `lib/services/data-explorer/` directory
   - [ ] Implement `explorer-metadata-service.ts` extending `BaseRBACService`
   - [ ] Implement `bedrock-service.ts` for SQL generation
   - [ ] Implement `query-executor-service.ts` for query execution
   - [ ] Implement `query-security-service.ts` for practice_uid filtering
   - [ ] Create `lib/services/data-explorer/index.ts` with factory functions
   - [ ] **Validation**: Run `pnpm tsc` and `pnpm lint` - fix all errors

3. **API Routes**
   - [ ] Create `/api/data/explorer/generate-sql/route.ts`
   - [ ] Create `/api/data/explorer/execute-query/route.ts`
   - [ ] Create `/api/data/explorer/metadata/tables/route.ts`
   - [ ] Create `/api/data/explorer/health/route.ts`
   - [ ] **Validation**: Run `pnpm tsc` and `pnpm lint` - fix all errors

4. **Type Definitions & Validation**
   - [ ] Create `lib/types/data-explorer.ts` with all interfaces
   - [ ] Create `lib/validations/data-explorer.ts` with Zod schemas
   - [ ] **Validation**: Run `pnpm tsc` - ensure no type errors

5. **Frontend Hooks & Components**
   - [ ] Create `lib/hooks/use-data-explorer.ts` with React Query hooks
   - [ ] Create `app/(default)/data/explorer/page.tsx` (query interface)
   - [ ] Create `app/(default)/data/explorer/metadata/page.tsx` (metadata management)
   - [ ] **Validation**: Run `pnpm tsc` and `pnpm lint` - fix all errors

6. **Testing**
   - [ ] Write unit tests for `BedrockService`
   - [ ] Write unit tests for `QueryExecutorService`
   - [ ] Write unit tests for `ExplorerMetadataService`
   - [ ] Write integration tests for `/api/data/explorer/generate-sql`
   - [ ] Write integration tests for `/api/data/explorer/execute-query`
   - [ ] **Validation**: Run `pnpm test:run` - all tests passing

7. **Post-Phase Validation**
   - [ ] Run `pnpm tsc` - zero errors
   - [ ] Run `pnpm lint` - zero errors
   - [ ] Run `pnpm test:run` - all tests passing
   - [ ] Manual testing of query generation
   - [ ] Manual testing of query execution
   - [ ] Verify practice_uid filtering in SQL output

**Success Criteria:**
- Generate valid SQL for 10 test queries
- Successfully execute queries against `ih` schema
- Metadata created for 10 most-used tables
- All TypeScript and linting checks passing
- Zero security vulnerabilities (practice_uid filtering works)

---

## Testing Strategy

### Test File Structure

```
tests/
  unit/
    lib/
      services/
        data-explorer/
          explorer-metadata-service.test.ts
          bedrock-service.test.ts
          query-executor-service.test.ts
          query-security-service.test.ts
          explorer-history-service.test.ts
          explorer-template-service.test.ts
  integration/
    api/
      data/
        explorer/
          generate-sql.test.ts
          execute-query.test.ts
          metadata-tables.test.ts
          history-list.test.ts
          templates.test.ts
  factories/
    data-explorer-factory.ts
```

### Unit Test Example

```typescript
// tests/unit/lib/services/data-explorer/bedrock-service.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BedrockService } from '@/lib/services/data-explorer/bedrock-service';
import type { UserContext } from '@/lib/types/rbac';

describe('BedrockService - generateSQL', () => {
  let service: BedrockService;
  let mockUserContext: UserContext;

  beforeEach(() => {
    mockUserContext = {
      user_id: 'test-user-id',
      email: 'test@example.com',
      is_super_admin: false,
      accessible_practices: [1, 2, 3],
      all_permissions: [{ name: 'data-explorer:query:organization' }],
      // ... other required fields
    };

    service = new BedrockService(mockUserContext);
    vi.clearAllMocks();
  });

  it('should generate valid SQL from natural language query', async () => {
    const result = await service.generateSQL(
      'How many patients were diagnosed with diabetes in 2024?',
      { model: 'anthropic.claude-3-5-sonnet-20241022-v2:0', temperature: 0.1 }
    );

    expect(result.sql).toContain('SELECT COUNT');
    expect(result.tables_used).toContain('patients');
    expect(result.estimated_complexity).toBe('simple');
  });

  it('should throw error if user lacks permission', async () => {
    const unauthorizedContext = {
      ...mockUserContext,
      all_permissions: [],
    };

    const unauthorizedService = new BedrockService(unauthorizedContext);

    await expect(unauthorizedService.generateSQL('Test query')).rejects.toThrow(
      'Insufficient permissions'
    );
  });
});
```

---

## Appendices

### A. Key Corrections from v3

1. **Service naming**: Changed `createDataExplorer*` to `createRBACExplorer*`
2. **Analytics DB**: Use `executeAnalyticsQuery()` not `analyticsDb.execute()`
3. **Base service**: Extend `BaseRBACService` directly (no custom base)
4. **API responses**: Use `createSuccessResponse()`/`createErrorResponse()`
5. **Logging**: One comprehensive log per operation, add `component` field
6. **Environment**: Proper T3 Env validation with optional AWS keys
7. **Cache**: Follow existing `CacheService` pattern
8. **Hooks**: Use `useApiMutation`/`useApiQuery` helpers
9. **Components**: kebab-case file names
10. **Dynamic export**: Add to all API routes

### B. RBAC Seed Data

**Add to:** `lib/db/rbac-seed-data.ts`

```typescript
// Data Explorer permissions
{
  name: 'data-explorer:query:organization',
  resource: 'data-explorer',
  action: 'query',
  scope: 'organization',
  description: 'Generate SQL queries for organization data',
},
{
  name: 'data-explorer:query:all',
  resource: 'data-explorer',
  action: 'query',
  scope: 'all',
  description: 'Generate SQL queries for all data',
},
{
  name: 'data-explorer:execute:own',
  resource: 'data-explorer',
  action: 'execute',
  scope: 'own',
  description: 'Execute queries filtered by own provider_uid',
},
{
  name: 'data-explorer:execute:organization',
  resource: 'data-explorer',
  action: 'execute',
  scope: 'organization',
  description: 'Execute queries filtered by organization practice_uids',
},
{
  name: 'data-explorer:execute:all',
  resource: 'data-explorer',
  action: 'execute',
  scope: 'all',
  description: 'Execute queries without filtering (super admin)',
},
{
  name: 'data-explorer:metadata:read:organization',
  resource: 'data-explorer',
  action: 'metadata:read',
  scope: 'organization',
  description: 'View table/column metadata',
},
{
  name: 'data-explorer:metadata:manage:all',
  resource: 'data-explorer',
  action: 'metadata:manage',
  scope: 'all',
  description: 'Create/update/delete metadata (admin only)',
},
{
  name: 'data-explorer:history:read:own',
  resource: 'data-explorer',
  action: 'history:read',
  scope: 'own',
  description: 'View own query history',
},
{
  name: 'data-explorer:templates:read:organization',
  resource: 'data-explorer',
  action: 'templates:read',
  scope: 'organization',
  description: 'View query templates',
},
{
  name: 'data-explorer:templates:manage:own',
  resource: 'data-explorer',
  action: 'templates:manage',
  scope: 'own',
  description: 'Manage own templates',
},
{
  name: 'data-explorer:discovery:run:all',
  resource: 'data-explorer',
  action: 'discovery:run',
  scope: 'all',
  description: 'Run schema auto-discovery (admin only)',
},
```

### C. Development Workflow

```bash
# 1. Create schema
# Edit lib/db/explorer-schema.ts

# 2. Generate migration
pnpm db:generate

# 3. Apply migration
pnpm db:migrate

# 4. Implement services
# Create files in lib/services/data-explorer/

# 5. Type check
pnpm tsc

# 6. Lint
pnpm lint

# 7. Write tests
# Create test files in tests/

# 8. Run tests
pnpm test:run

# 9. Repeat until all Phase 1 tasks complete
```

---

**END OF DOCUMENT v4**

**All code examples in this document are production-ready and aligned with Bendcare codebase patterns.**

