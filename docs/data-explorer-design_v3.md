# Data Explorer System
## Technical Design Document v3

**Document Version:** 3.0
**Date:** January 27, 2025
**Author:** Patrick @ Bendcare
**Project:** Data Explorer - Natural Language Interface for Healthcare Data Warehouse
**Status:** Aligned with Bendcare Infrastructure & Architecture Patterns

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Project Overview](#project-overview)
3. [System Architecture](#system-architecture)
4. [Database Design](#database-design)
5. [Services Layer Architecture](#services-layer-architecture)
6. [API Routes Layer](#api-routes-layer)
7. [Security & RBAC](#security-rbac)
8. [Frontend Components & Hooks](#frontend-components-hooks)
9. [Implementation Phases](#implementation-phases)
10. [Testing Strategy](#testing-strategy)
11. [Monitoring & Success Metrics](#monitoring-success-metrics)
12. [Risk Mitigation](#risk-mitigation)
13. [Appendices](#appendices)

---

## Executive Summary

This document outlines the design for the Data Explorer system within Bendcare's healthcare platform. Data Explorer enables data analysts to generate complex SQL queries using plain English questions, reducing query development time by an estimated 50% while maintaining HIPAA compliance and data security.

### Key Objectives
- Enable natural language querying of healthcare data warehouse
- Build intelligent metadata layer with auto-discovery capabilities
- Reduce analyst workload through query reuse and templates
- Maintain strict data security and HIPAA compliance
- Scale from internal analysts to external healthcare practices

### Technology Stack (Bendcare-Specific)
- **AI Provider:** AWS Bedrock (Claude Sonnet 3.5 v2)
- **Frontend:** Next.js 15, React 19, TypeScript 5.9 (strict mode)
- **Database:** PostgreSQL 17 (AWS RDS)
  - Application DB: Main Bendcare database
  - Analytics DB: Separate read-only database (`ih` schema)
- **ORM:** Drizzle ORM 0.44 with modular schema architecture
- **Infrastructure:** AWS ECS Fargate
- **Caching:** AWS Elasticache (Valkey/Redis)
- **Authentication:** Existing Bendcare RBAC system
- **Package Manager:** pnpm
- **Testing:** Vitest 3.2 with React Testing Library
- **Linting:** Biome 2.2

---

## Project Overview

### Background

Bendcare's data warehouse contains critical healthcare data across three tiers of tables:
- **Tier 1:** 50 core tables (primary focus)
- **Tier 2:** 100 secondary tables
- **Tier 3:** 5000+ auxiliary tables

Currently, data analysts manually write SQL queries for each request, leading to:
- Repetitive work for similar queries
- Inconsistent query patterns
- Long turnaround times for data requests
- Limited self-service capabilities for healthcare practices

### Solution Approach

Implement an AI-powered natural language interface that:
1. Translates English questions to SQL using AWS Bedrock
2. Maintains rich metadata about database structure and meaning
3. Learns from usage patterns to improve over time
4. Provides transparent SQL generation with editing capabilities
5. Enforces organization-level data security automatically via `practice_uid` filtering

### Constraints
- All PHI data must remain within Bendcare's private network (AWS VPC)
- Read-only access to analytics database (no data modifications)
- Must integrate with existing authentication and authorization (RBAC)
- Single developer resource for initial implementation
- Must follow established Bendcare code patterns and architecture

---

## System Architecture

### Navigation Structure

```
Bendcare Application
├── [Existing Sections]
└── Data (New Section)
    └── Explorer
        ├── Query        (/data/explorer)
        ├── History      (/data/explorer/history)
        ├── Templates    (/data/explorer/templates)
        ├── Metadata     (/data/explorer/metadata)
        │   └── Discovery (/data/explorer/metadata/discovery)
        └── Settings     (/data/explorer/settings)
```

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        User Layer                                    │
│  ┌─────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │  Data Analysts  │  │  Practice Users   │  │  Administrators  │  │
│  └─────────────────┘  └──────────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                    │
┌─────────────────────────────────────────────────────────────────────┐
│                    Bendcare Next.js Application                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                  Data Explorer UI Components                  │   │
│  │  • Natural Language Query Interface (/data/explorer)         │   │
│  │  • Query History & Analytics (/data/explorer/history)       │   │
│  │  • Template Library (/data/explorer/templates)              │   │
│  │  • Metadata Management (/data/explorer/metadata)            │   │
│  │  • Explorer Settings (/data/explorer/settings)              │   │
│  └─────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    API Routes Layer                          │   │
│  │  • /api/data/explorer/generate-sql                          │   │
│  │  • /api/data/explorer/execute-query                         │   │
│  │  • /api/data/explorer/metadata/*                            │   │
│  │  • /api/data/explorer/discover-schema                       │   │
│  │  • /api/data/explorer/history/*                             │   │
│  │  • /api/data/explorer/templates/*                           │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                    │
┌─────────────────────────────────────────────────────────────────────┐
│                        Service Layer                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │
│  │   Bedrock    │  │   Metadata   │  │    Query     │            │
│  │   Service    │  │   Service    │  │   Executor   │            │
│  └──────────────┘  └──────────────┘  └──────────────┘            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │
│  │   Schema     │  │   Security   │  │   History    │            │
│  │  Discovery   │  │   Service    │  │   Service    │            │
│  └──────────────┘  └──────────────┘  └──────────────┘            │
│  ┌──────────────┐  ┌──────────────┐                              │
│  │   Template   │  │   Cache      │                              │
│  │   Service    │  │   Service    │                              │
│  └──────────────┘  └──────────────┘                              │
└─────────────────────────────────────────────────────────────────────┘
                                    │
┌─────────────────────────────────────────────────────────────────────┐
│                        Data Layer                                    │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              PostgreSQL - Application DB (AWS RDS)           │   │
│  │  • explorer_* schema (Metadata & History)                   │   │
│  │  • Existing Bendcare tables (users, organizations, etc.)    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              PostgreSQL - Analytics DB (AWS RDS)             │   │
│  │  • ih schema (Tier 1 - 50 tables)                           │   │
│  │  • Read-only access for queries                             │   │
│  │  • Existing healthcare data                                 │   │
│  └─────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    AWS Elasticache (Redis)                   │   │
│  │  • Query result caching (15 min TTL)                        │   │
│  │  • Metadata caching (1 hour TTL)                            │   │
│  │  • Pattern caching (30 min TTL)                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    AWS Bedrock API                           │   │
│  │  • Claude Sonnet 3.5 v2 for SQL generation                  │   │
│  │  • VPC endpoint configuration (no public internet)          │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Key Features |
|-----------|---------------|--------------|
| **Query Interface** | Accept natural language input | Auto-complete, query suggestions, examples |
| **Bedrock Service** | Generate SQL from text | Prompt optimization, model selection, token management |
| **Metadata Service** | Manage table/column descriptions | CRUD operations, versioning, confidence scores |
| **Query Executor** | Run SQL safely against analytics DB | Timeouts, row limits, security injection |
| **Schema Discovery** | Auto-detect metadata | Pattern recognition, relationship detection |
| **History Service** | Track all queries | Analytics, pattern learning, audit trail |
| **Security Service** | Inject practice_uid filters | Organization isolation, fail-closed security |
| **Template Service** | Manage query templates | CRUD operations, variable substitution |
| **Cache Service** | Cache queries and metadata | Redis integration, TTL management, invalidation |

---

## Database Design

### Drizzle ORM Integration

#### Modular Schema Pattern

**CRITICAL**: Data Explorer tables must follow Bendcare's modular schema architecture.

**Create schema file**: `lib/db/explorer-schema.ts`
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
  bigint
} from 'drizzle-orm/pg-core';

// Table metadata
export const explorerTableMetadata = pgTable('explorer_table_metadata', {
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
});

// Column metadata
export const explorerColumnMetadata = pgTable('explorer_column_metadata', {
  column_metadata_id: uuid('column_metadata_id').defaultRandom().primaryKey(),
  exp_table_id: uuid('exp_table_id').references(() => explorerTableMetadata.table_metadata_id, {
    onDelete: 'cascade'
  }),
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
});

// Query history
export const explorerQueryHistory = pgTable('explorer_query_history', {
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
});

// Saved queries/templates
export const explorerSavedQueries = pgTable('explorer_saved_queries', {
  saved_query_id: uuid('saved_query_id').defaultRandom().primaryKey(),
  exp_query_history_id: uuid('exp_query_history_id').references(() => explorerQueryHistory.query_history_id),
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
  exp_from_table_id: uuid('exp_from_table_id').references(() => explorerTableMetadata.table_metadata_id),
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

**Update `lib/db/schema.ts`** to re-export:
```typescript
// Existing exports...
export * from './rbac-schema';
export * from './work-item-schema';
export * from './analytics-schema';
// Add data explorer
export * from './explorer-schema';
```

**Import pattern** (always from central schema):
```typescript
// ✅ CORRECT
import {
  explorerTableMetadata,
  explorerColumnMetadata,
  explorerQueryHistory
} from '@/lib/db/schema';

// ❌ WRONG - Never import from individual schema files
import { explorerTableMetadata } from '@/lib/db/explorer-schema';
```

#### Database Migration Commands

```bash
# Generate migration from schema changes
pnpm db:generate

# Review generated SQL before applying
cat lib/db/migrations/0026_data_explorer_tables.sql

# Apply migration to database
pnpm db:migrate

# Validate migration integrity
pnpm db:validate

# Development only: Push schema directly (skips migration files)
pnpm db:push
```

#### Indexes for Performance

```sql
-- Create indexes for common queries
CREATE INDEX idx_explorer_query_history_user ON explorer_query_history(exp_user_id, exp_created_at DESC);
CREATE INDEX idx_explorer_query_history_status ON explorer_query_history(exp_status);
CREATE INDEX idx_explorer_query_history_tables ON explorer_query_history USING GIN(exp_tables_used);
CREATE INDEX idx_explorer_query_history_org ON explorer_query_history(exp_organization_id);
CREATE INDEX idx_explorer_column_metadata_table ON explorer_column_metadata(exp_table_id);
CREATE INDEX idx_explorer_column_semantic ON explorer_column_metadata(exp_semantic_type);
CREATE INDEX idx_explorer_saved_queries_category ON explorer_saved_queries(exp_category, exp_is_public);
CREATE INDEX idx_explorer_saved_queries_created_by ON explorer_saved_queries(exp_created_by);
CREATE INDEX idx_explorer_patterns_type ON explorer_query_patterns(exp_pattern_type);
CREATE INDEX idx_explorer_table_metadata_schema_table ON explorer_table_metadata(exp_schema_name, exp_table_name);
CREATE INDEX idx_explorer_table_metadata_tier ON explorer_table_metadata(exp_tier, exp_is_active);
```

---

## Services Layer Architecture

### Service Organization Pattern

**CRITICAL**: No "god files" - services must be modular and focused.

**Directory structure**:
```
lib/
  services/
    data-explorer/
      bedrock-service.ts              # AWS Bedrock SQL generation
      metadata-service.ts             # Table/column metadata CRUD
      query-executor-service.ts       # Query execution against analytics DB
      query-security-service.ts       # practice_uid filtering injection
      schema-discovery-service.ts     # Auto-discovery of metadata
      history-service.ts              # Query history tracking
      template-service.ts             # Query template management
      pattern-service.ts              # Query pattern extraction
      index.ts                        # Factory functions export
```

### Base RBAC Service Pattern

All services extend `BaseRBACService` for automatic permission checking:

```typescript
// lib/services/data-explorer/base-explorer-service.ts
import { BaseRBACService } from '@/lib/rbac/base-service';
import type { UserContext } from '@/lib/types/rbac';
import { db } from '@/lib/db';

export abstract class BaseExplorerService extends BaseRBACService {
  constructor(userContext: UserContext) {
    super(userContext, db);
  }

  // Common helper methods for data explorer services
  protected getAccessiblePractices(): number[] {
    return this.userContext.accessible_practices;
  }

  protected hasFullAccess(): boolean {
    return this.userContext.is_super_admin ||
           this.checker.hasPermission('data-explorer:execute:all');
  }

  protected validateOrganizationAccess(organizationId: string): void {
    if (!this.canAccessOrganization(organizationId)) {
      throw new Error('Insufficient permissions to access this organization');
    }
  }
}
```

### Service Factory Pattern

**CRITICAL**: Always use factory functions to create services (never instantiate directly).

```typescript
// lib/services/data-explorer/index.ts
import type { UserContext } from '@/lib/types/rbac';
import { MetadataService } from './metadata-service';
import { QueryExecutorService } from './query-executor-service';
import { BedrockService } from './bedrock-service';
import { HistoryService } from './history-service';
import { TemplateService } from './template-service';
import { SchemaDiscoveryService } from './schema-discovery-service';
import { QuerySecurityService } from './query-security-service';
import { PatternService } from './pattern-service';

// Factory functions (following createRBAC<Domain>Service pattern)
export function createDataExplorerMetadataService(userContext: UserContext): MetadataService {
  return new MetadataService(userContext);
}

export function createDataExplorerQueryExecutor(userContext: UserContext): QueryExecutorService {
  return new QueryExecutorService(userContext);
}

export function createDataExplorerBedrockService(userContext: UserContext): BedrockService {
  return new BedrockService(userContext);
}

export function createDataExplorerHistoryService(userContext: UserContext): HistoryService {
  return new HistoryService(userContext);
}

export function createDataExplorerTemplateService(userContext: UserContext): TemplateService {
  return new TemplateService(userContext);
}

export function createDataExplorerSchemaDiscovery(userContext: UserContext): SchemaDiscoveryService {
  return new SchemaDiscoveryService(userContext);
}

export function createDataExplorerQuerySecurity(userContext: UserContext): QuerySecurityService {
  return new QuerySecurityService(userContext);
}

export function createDataExplorerPatternService(userContext: UserContext): PatternService {
  return new PatternService(userContext);
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

### Service Implementation Examples

#### Metadata Service

```typescript
// lib/services/data-explorer/metadata-service.ts
import { eq, and, like, desc, sql } from 'drizzle-orm';
import { BaseExplorerService } from './base-explorer-service';
import {
  explorerTableMetadata,
  explorerColumnMetadata
} from '@/lib/db/schema';
import type { UserContext } from '@/lib/types/rbac';
import type {
  TableMetadata,
  ColumnMetadata,
  MetadataQueryOptions
} from '@/lib/types/data-explorer';

export interface MetadataServiceInterface {
  getTableMetadata(options?: MetadataQueryOptions): Promise<TableMetadata[]>;
  getTableById(tableId: string): Promise<TableMetadata | null>;
  getColumnMetadata(tableId: string): Promise<ColumnMetadata[]>;
  updateTableMetadata(tableId: string, data: Partial<TableMetadata>): Promise<TableMetadata>;
  calculateCompleteness(metadata: TableMetadata): number;
}

export class MetadataService extends BaseExplorerService implements MetadataServiceInterface {
  constructor(userContext: UserContext) {
    super(userContext);
  }

  async getTableMetadata(options: MetadataQueryOptions = {}): Promise<TableMetadata[]> {
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
      .orderBy(
        desc(explorerTableMetadata.exp_tier),
        explorerTableMetadata.exp_table_name
      )
      .limit(options.limit ?? 1000)
      .offset(options.offset ?? 0);

    return metadata;
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

    return metadata || null;
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

    return columns;
  }

  async updateTableMetadata(
    tableId: string,
    data: Partial<TableMetadata>
  ): Promise<TableMetadata> {
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

    return updated;
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

#### Query Executor Service

```typescript
// lib/services/data-explorer/query-executor-service.ts
import { BaseExplorerService } from './base-explorer-service';
import { analyticsDb, checkAnalyticsDbHealth } from '@/lib/services/analytics-db';
import { createDataExplorerQuerySecurity } from './index';
import type { UserContext } from '@/lib/types/rbac';
import type { QueryExecutionResult, ExecuteQueryOptions } from '@/lib/types/data-explorer';
import { env } from '@/lib/env';

export interface QueryExecutorInterface {
  execute(sql: string, options?: ExecuteQueryOptions): Promise<QueryExecutionResult>;
  validateSQL(sql: string): Promise<{ isValid: boolean; errors: string[] }>;
  explainQuery(sql: string): Promise<unknown>;
}

export class QueryExecutorService extends BaseExplorerService implements QueryExecutorInterface {
  constructor(userContext: UserContext) {
    super(userContext);
  }

  async execute(
    sql: string,
    options: ExecuteQueryOptions = {}
  ): Promise<QueryExecutionResult> {
    // RBAC check
    this.requireAnyPermission([
      'data-explorer:execute:own',
      'data-explorer:execute:organization',
      'data-explorer:execute:all',
    ]);

    const startTime = Date.now();

    // Check analytics DB health
    const isHealthy = await checkAnalyticsDbHealth();
    if (!isHealthy) {
      throw new Error('Analytics database is unavailable');
    }

    // Inject security filters (practice_uid filtering)
    const securityService = createDataExplorerQuerySecurity(this.userContext);
    const securedSQL = await securityService.addSecurityFilters(sql);

    // Add LIMIT if not present
    const finalSQL = this.ensureLimit(securedSQL, options.limit);

    // Execute with timeout
    const timeout = options.timeout_ms || env.DATA_EXPLORER_QUERY_TIMEOUT_MS;

    try {
      // Use raw query for analytics DB
      const results = await Promise.race([
        analyticsDb.execute(sql`${finalSQL}`),
        this.createTimeout(timeout),
      ]);

      const executionTime = Date.now() - startTime;

      return {
        rows: results.rows,
        row_count: results.rowCount || 0,
        execution_time_ms: executionTime,
        columns: results.fields?.map((field) => ({
          name: field.name,
          type: field.dataTypeID?.toString() || 'unknown',
        })) || [],
      };
    } catch (error) {
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
    const result = await analyticsDb.execute(sql`${explainSQL}`);
    return result.rows[0];
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

#### Query Security Service

```typescript
// lib/services/data-explorer/query-security-service.ts
import { BaseExplorerService } from './base-explorer-service';
import type { UserContext } from '@/lib/types/rbac';
import { Parser } from 'node-sql-parser';

export class QuerySecurityService extends BaseExplorerService {
  private parser: Parser;

  constructor(userContext: UserContext) {
    super(userContext);
    this.parser = new Parser();
  }

  async addSecurityFilters(sql: string): Promise<string> {
    // Super admins and users with 'all' scope bypass filtering
    if (this.hasFullAccess()) {
      return sql;
    }

    const accessiblePractices = this.getAccessiblePractices();

    // Fail-closed: If no accessible practices, deny query
    if (accessiblePractices.length === 0) {
      throw new Error('No accessible practices found for user. Cannot execute query.');
    }

    try {
      // Parse SQL to AST
      const ast = this.parser.astify(sql, { database: 'postgresql' });

      // Inject practice_uid filtering
      const modifiedAST = this.injectPracticeFilter(ast, accessiblePractices);

      // Generate SQL from modified AST
      const securedSQL = this.parser.sqlify(modifiedAST, { database: 'postgresql' });

      return securedSQL;
    } catch (error) {
      throw new Error(`Failed to inject security filters: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private injectPracticeFilter(ast: unknown, practiceUids: number[]): unknown {
    // Implementation: Traverse AST and add WHERE clause
    // WHERE practice_uid IN (practiceUids)
    // This is a simplified example - actual implementation would be more robust

    if (Array.isArray(ast)) {
      return ast.map((node) => this.injectPracticeFilter(node, practiceUids));
    }

    if (typeof ast === 'object' && ast !== null) {
      const node = ast as Record<string, unknown>;

      // Add practice_uid filter to WHERE clause
      if (node.type === 'select' && node.where) {
        node.where = {
          type: 'binary_expr',
          operator: 'AND',
          left: node.where,
          right: {
            type: 'binary_expr',
            operator: 'IN',
            left: { type: 'column_ref', table: null, column: 'practice_uid' },
            right: {
              type: 'expr_list',
              value: practiceUids.map((uid) => ({
                type: 'number',
                value: uid,
              })),
            },
          },
        };
      }

      return node;
    }

    return ast;
  }
}
```

#### Bedrock Service

```typescript
// lib/services/data-explorer/bedrock-service.ts
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { BaseExplorerService } from './base-explorer-service';
import { createDataExplorerMetadataService } from './index';
import type { UserContext } from '@/lib/types/rbac';
import type { GenerateSQLResult, BedrockOptions } from '@/lib/types/data-explorer';
import { env } from '@/lib/env';

export interface BedrockServiceInterface {
  generateSQL(query: string, options?: BedrockOptions): Promise<GenerateSQLResult>;
  explainSQL(sql: string): Promise<string>;
}

export class BedrockService extends BaseExplorerService implements BedrockServiceInterface {
  private client: BedrockRuntimeClient;

  constructor(userContext: UserContext) {
    super(userContext);

    this.client = new BedrockRuntimeClient({
      region: env.AWS_BEDROCK_REGION,
      credentials: {
        accessKeyId: env.AWS_BEDROCK_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_BEDROCK_SECRET_ACCESS_KEY,
      },
    });
  }

  async generateSQL(
    query: string,
    options: BedrockOptions = {}
  ): Promise<GenerateSQLResult> {
    // RBAC check
    this.requireAnyPermission([
      'data-explorer:query:organization',
      'data-explorer:query:all',
    ]);

    // Get relevant metadata
    const metadataService = createDataExplorerMetadataService(this.userContext);
    const tableMetadata = await metadataService.getTableMetadata({
      schema_name: 'ih',
      is_active: true,
    });

    // Build prompt
    const prompt = this.buildPrompt(query, tableMetadata, options);

    // Call Bedrock
    const modelId = options.model || env.DATA_EXPLORER_MODEL_ID;
    const temperature = options.temperature || env.DATA_EXPLORER_TEMPERATURE;

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

    const response = await this.client.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    // Extract SQL from response
    const generatedSQL = this.extractSQL(responseBody.content[0].text);

    return {
      sql: generatedSQL,
      explanation: options.include_explanation ? this.extractExplanation(responseBody.content[0].text) : undefined,
      tables_used: this.extractTablesUsed(generatedSQL),
      estimated_complexity: this.estimateComplexity(generatedSQL),
      model_used: modelId,
      prompt_tokens: responseBody.usage.input_tokens,
      completion_tokens: responseBody.usage.output_tokens,
    };
  }

  async explainSQL(sql: string): Promise<string> {
    // Implementation for SQL explanation
    // Similar to generateSQL but with different prompt
    throw new Error('Not implemented');
  }

  private buildPrompt(
    query: string,
    metadata: unknown[],
    options: BedrockOptions
  ): string {
    return `You are an expert PostgreSQL SQL generator for a healthcare analytics database.

DATABASE CONTEXT:
- Schema: ih (healthcare data warehouse)
- Database: PostgreSQL 17
- All queries are READ-ONLY
- Tables contain healthcare data (patients, encounters, claims, etc.)

AVAILABLE TABLES:
${this.formatTableMetadata(metadata)}

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

  private formatTableMetadata(metadata: unknown[]): string {
    // Format metadata for prompt
    return 'Metadata formatting implementation';
  }

  private extractSQL(response: string): string {
    // Extract SQL from Bedrock response
    const sqlMatch = response.match(/```sql\n([\s\S]*?)\n```/);
    return sqlMatch ? sqlMatch[1].trim() : response.trim();
  }

  private extractExplanation(response: string): string {
    // Extract explanation from response
    return 'Explanation extraction implementation';
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

## API Routes Layer

### Route Structure (Next.js 15 App Router)

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
            route.ts            # GET - List tables, POST - Create table metadata
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

### RBAC Permission Matrix

| Resource | Actions | Scopes |
|----------|---------|--------|
| `data-explorer` | `query` | `organization`, `all` |
| `data-explorer` | `execute` | `own`, `organization`, `all` |
| `data-explorer` | `metadata:read` | `organization`, `all` |
| `data-explorer` | `metadata:manage` | `all` |
| `data-explorer` | `history:read` | `own`, `organization`, `all` |
| `data-explorer` | `templates:read` | `organization`, `all` |
| `data-explorer` | `templates:create` | `organization`, `all` |
| `data-explorer` | `templates:manage` | `own`, `organization`, `all` |
| `data-explorer` | `discovery:run` | `all` |

### API Route Implementation Examples

#### Generate SQL Endpoint

```typescript
// app/api/data/explorer/generate-sql/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { validateRequest } from '@/lib/api/middleware/validation';
import { createSuccessResponse, createErrorResponse } from '@/lib/api/responses';
import { createDataExplorerBedrockService, createDataExplorerHistoryService } from '@/lib/services/data-explorer';
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

    // 2. Create Bedrock service
    const bedrockService = createDataExplorerBedrockService(userContext);

    // 3. Generate SQL
    const result = await bedrockService.generateSQL(
      validatedData.natural_language_query,
      {
        model: validatedData.model,
        temperature: validatedData.temperature,
        include_explanation: validatedData.include_explanation,
      }
    );

    // 4. Save to history
    const historyService = createDataExplorerHistoryService(userContext);
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

    // 5. Log with enriched context
    log.info('SQL generation completed', {
      operation: 'data_explorer_generate_sql',
      resourceType: 'data_explorer_query',
      userId: userContext.user_id,
      organizationId: userContext.current_organization_id,
      queryLength: validatedData.natural_language_query.length,
      duration,
      slow: duration > SLOW_THRESHOLDS.SQL_GENERATION,
      model: result.model_used,
      tokensUsed: result.prompt_tokens + result.completion_tokens,
      tablesUsed: result.tables_used,
      complexity: result.estimated_complexity,
      component: 'data-explorer',
    });

    // 6. Return response
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
      component: 'data-explorer',
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

#### Execute Query Endpoint

```typescript
// app/api/data/explorer/execute-query/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { validateRequest } from '@/lib/api/middleware/validation';
import { createSuccessResponse, createErrorResponse } from '@/lib/api/responses';
import {
  createDataExplorerQueryExecutor,
  createDataExplorerHistoryService
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
    const queryExecutor = createDataExplorerQueryExecutor(userContext);

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
      const historyService = createDataExplorerHistoryService(userContext);
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
      component: 'data-explorer',
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
      component: 'data-explorer',
    });

    // Update history with error if query_history_id provided
    if ('query_history_id' in validatedData && validatedData.query_history_id) {
      try {
        const historyService = createDataExplorerHistoryService(userContext);
        await historyService.updateHistoryEntry(validatedData.query_history_id, {
          status: 'failed',
          error_message: error instanceof Error ? error.message : 'Unknown error',
        });
      } catch (historyError) {
        log.error('Failed to update history with error', historyError, {
          operation: 'data_explorer_update_history',
          userId: userContext.user_id,
          component: 'data-explorer',
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

#### Metadata Tables Endpoint

```typescript
// app/api/data/explorer/metadata/tables/route.ts
import { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { validateQuery } from '@/lib/api/middleware/validation';
import { createPaginatedResponse, createErrorResponse } from '@/lib/api/responses';
import { createDataExplorerMetadataService } from '@/lib/services/data-explorer';
import { metadataTablesQuerySchema } from '@/lib/validations/data-explorer';
import { log } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';

const getTablesHandler = async (
  request: NextRequest,
  userContext: UserContext
): Promise<Response> => {
  const startTime = Date.now();

  try {
    // 1. Validate query params
    const { searchParams } = new URL(request.url);
    const query = validateQuery(searchParams, metadataTablesQuerySchema);

    // 2. Create metadata service
    const metadataService = createDataExplorerMetadataService(userContext);

    // 3. Get table metadata
    const tables = await metadataService.getTableMetadata({
      schema_name: query.schema_name,
      tier: query.tier,
      is_active: query.is_active,
      search: query.search,
      limit: query.limit,
      offset: query.offset,
    });

    // 4. Get total count
    const totalCount = await metadataService.getTableMetadataCount({
      schema_name: query.schema_name,
      tier: query.tier,
      is_active: query.is_active,
      search: query.search,
    });

    // 5. Calculate completeness for each table
    const tablesWithCompleteness = tables.map((table) => ({
      ...table,
      completeness: metadataService.calculateCompleteness(table),
    }));

    const duration = Date.now() - startTime;

    log.info('Table metadata list query completed', {
      operation: 'data_explorer_list_metadata',
      resourceType: 'data_explorer_metadata',
      userId: userContext.user_id,
      results: { returned: tables.length, total: totalCount },
      duration,
      component: 'data-explorer',
    });

    // 6. Return paginated response
    return createPaginatedResponse(tablesWithCompleteness, {
      page: Math.floor((query.offset || 0) / (query.limit || 50)) + 1,
      limit: query.limit || 50,
      total: totalCount,
    });
  } catch (error) {
    log.error('Table metadata list query failed', error, {
      operation: 'data_explorer_list_metadata',
      userId: userContext.user_id,
      duration: Date.now() - startTime,
      component: 'data-explorer',
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Failed to fetch table metadata',
      500,
      request
    );
  }
};

export const GET = rbacRoute(getTablesHandler, {
  permission: ['data-explorer:metadata:read:organization', 'data-explorer:metadata:read:all'],
  rateLimit: 'api',
});

export const dynamic = 'force-dynamic';
```

#### Health Check Endpoint

```typescript
// app/api/data/explorer/health/route.ts
import { NextRequest } from 'next/server';
import { publicRoute } from '@/lib/api/route-handlers';
import { createSuccessResponse } from '@/lib/api/responses';
import { checkAnalyticsDbHealth } from '@/lib/services/analytics-db';

const healthCheckHandler = async (request: NextRequest): Promise<Response> => {
  const analyticsDbHealthy = await checkAnalyticsDbHealth();

  return createSuccessResponse({
    status: analyticsDbHealthy ? 'healthy' : 'degraded',
    analytics_db: analyticsDbHealthy,
    timestamp: new Date().toISOString(),
  });
};

export const GET = publicRoute(
  healthCheckHandler,
  'Data Explorer health check endpoint for monitoring',
  { rateLimit: 'api' }
);

export const dynamic = 'force-dynamic';
```

---

## Security & RBAC

### Permission Definitions

Add to existing permission system:

```typescript
// lib/rbac/permissions.ts (add to existing permissions)
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

### AWS Bedrock VPC Configuration

**CRITICAL**: Bedrock must be accessed via VPC endpoint (no public internet).

- PHI data (table/column names, sample values) sent to Bedrock for context
- Actual PHI data (patient records) never sent to Bedrock
- VPC endpoint ensures traffic stays within AWS private network
- IAM role for ECS task with minimal Bedrock permissions

```typescript
// IAM Policy (minimal permissions)
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel"
      ],
      "Resource": [
        "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-5-sonnet-*"
      ]
    }
  ]
}
```

---

## Frontend Components & Hooks

### React Query Hooks

**File**: `lib/hooks/use-data-explorer.ts`

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import type {
  GenerateSQLParams,
  GenerateSQLResult,
  ExecuteQueryParams,
  ExecuteQueryResult,
  TableMetadata,
  QueryHistory,
  QueryTemplate,
} from '@/lib/types/data-explorer';

// Generate SQL from natural language
export function useGenerateSQL() {
  return useMutation<GenerateSQLResult, Error, GenerateSQLParams>({
    mutationFn: (params) =>
      apiClient.post<GenerateSQLResult>('/api/data/explorer/generate-sql', params),
  });
}

// Execute SQL query
export function useExecuteQuery() {
  return useMutation<ExecuteQueryResult, Error, ExecuteQueryParams>({
    mutationFn: (params) =>
      apiClient.post<ExecuteQueryResult>('/api/data/explorer/execute-query', params),
  });
}

// List table metadata
export function useTableMetadata(params?: {
  schema_name?: string;
  tier?: number;
  is_active?: boolean;
  search?: string;
}) {
  return useQuery<TableMetadata[], Error>({
    queryKey: ['data-explorer', 'metadata', 'tables', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params?.schema_name) searchParams.append('schema_name', params.schema_name);
      if (params?.tier !== undefined) searchParams.append('tier', String(params.tier));
      if (params?.is_active !== undefined) searchParams.append('is_active', String(params.is_active));
      if (params?.search) searchParams.append('search', params.search);

      return apiClient.get<TableMetadata[]>(
        `/api/data/explorer/metadata/tables?${searchParams.toString()}`
      );
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

// Query history
export function useQueryHistory(params?: {
  limit?: number;
  offset?: number;
  status?: string;
}) {
  return useQuery<QueryHistory[], Error>({
    queryKey: ['data-explorer', 'history', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params?.limit) searchParams.append('limit', String(params.limit));
      if (params?.offset) searchParams.append('offset', String(params.offset));
      if (params?.status) searchParams.append('status', params.status);

      return apiClient.get<QueryHistory[]>(
        `/api/data/explorer/history/list?${searchParams.toString()}`
      );
    },
    staleTime: 1 * 60 * 1000, // 1 minute
  });
}

// Update table metadata with optimistic update
export function useUpdateTableMetadata() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<TableMetadata> }) =>
      apiClient.put<TableMetadata>(`/api/data/explorer/metadata/tables/${id}`, data),

    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({
        queryKey: ['data-explorer', 'metadata', 'tables'],
      });

      const previous = queryClient.getQueryData<TableMetadata[]>([
        'data-explorer',
        'metadata',
        'tables',
      ]);

      if (previous) {
        const updated = previous.map((table) =>
          table.table_metadata_id === id ? { ...table, ...data } : table
        );
        queryClient.setQueryData(['data-explorer', 'metadata', 'tables'], updated);
      }

      return { previous };
    },

    onError: (_err, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          ['data-explorer', 'metadata', 'tables'],
          context.previous
        );
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ['data-explorer', 'metadata', 'tables'],
      });
    },
  });
}

// Query templates
export function useQueryTemplates(category?: string) {
  return useQuery<QueryTemplate[], Error>({
    queryKey: ['data-explorer', 'templates', category],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (category) searchParams.append('category', category);

      return apiClient.get<QueryTemplate[]>(
        `/api/data/explorer/templates?${searchParams.toString()}`
      );
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
```

### Component Patterns

#### Query Interface Component

```typescript
// app/data/explorer/page.tsx
'use client';

import { useState } from 'react';
import { useGenerateSQL, useExecuteQuery } from '@/lib/hooks/use-data-explorer';
import DeleteConfirmationModal from '@/components/delete-confirmation-modal';

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
        model: 'claude-3-5-sonnet',
        temperature: 0.1,
        include_explanation: true,
      });

      setGeneratedSQL(result.sql);
      setQueryHistoryId(result.query_history_id);
    } catch (error) {
      // Error handling
    }
  };

  const handleExecute = async () => {
    try {
      const result = await executeQuery.mutateAsync({
        sql: generatedSQL,
        limit: 1000,
        query_history_id: queryHistoryId,
      });

      // Display results
    } catch (error) {
      // Error handling
    }
  };

  return (
    <div>
      <h1>Data Explorer</h1>

      <textarea
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Ask a question about your data..."
      />

      <button onClick={handleGenerate} disabled={generateSQL.isPending}>
        {generateSQL.isPending ? 'Generating...' : 'Generate SQL'}
      </button>

      {generatedSQL && (
        <>
          <pre>{generatedSQL}</pre>
          <button onClick={handleExecute} disabled={executeQuery.isPending}>
            {executeQuery.isPending ? 'Executing...' : 'Execute Query'}
          </button>
        </>
      )}

      {executeQuery.data && (
        <div>
          {/* Display results in table */}
        </div>
      )}
    </div>
  );
}
```

#### Metadata Management Component

```typescript
// app/data/explorer/metadata/page.tsx
'use client';

import { useState } from 'react';
import DataTable from '@/components/data-table';
import type { DataTableColumn } from '@/components/data-table';
import DeleteConfirmationModal from '@/components/delete-confirmation-modal';
import { useTableMetadata, useUpdateTableMetadata } from '@/lib/hooks/use-data-explorer';
import type { TableMetadata } from '@/lib/types/data-explorer';

export default function MetadataManagementPage() {
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<TableMetadata | null>(null);

  const { data: tables = [], isLoading } = useTableMetadata({ is_active: true });
  const updateMetadata = useUpdateTableMetadata();

  const columns: DataTableColumn<TableMetadata>[] = [
    { key: 'exp_table_name', header: 'Table Name', sortable: true },
    { key: 'exp_tier', header: 'Tier', sortable: true },
    { key: 'exp_description', header: 'Description' },
    { key: 'actions', header: 'Actions' },
  ];

  const handleDelete = async (id: string) => {
    // Delete implementation
  };

  return (
    <div>
      <h1>Metadata Management</h1>

      <DataTable
        data={tables}
        columns={columns}
        isLoading={isLoading}
        actions={(row) => [
          {
            label: 'Edit',
            onClick: () => {
              // Edit implementation
            },
          },
          {
            label: 'Delete',
            variant: 'danger',
            onClick: handleDelete,
            confirmModal: {
              title: 'Delete Table Metadata',
              message: `This will remove all metadata for ${row.exp_schema_name}.${row.exp_table_name}. This action cannot be undone.`,
              confirmText: 'Delete Metadata',
            },
          },
        ]}
      />

      {itemToDelete && (
        <DeleteConfirmationModal
          isOpen={deleteModalOpen}
          setIsOpen={setDeleteModalOpen}
          title="Delete Table Metadata"
          itemName={`${itemToDelete.exp_schema_name}.${itemToDelete.exp_table_name}`}
          message="This will remove all metadata for this table. This action cannot be undone."
          confirmButtonText="Delete Metadata"
          onConfirm={async () => {
            await handleDelete(itemToDelete.table_metadata_id);
            setDeleteModalOpen(false);
            setItemToDelete(null);
          }}
        />
      )}
    </div>
  );
}
```

### Validation Schemas

**File**: `lib/validations/data-explorer.ts`

```typescript
import { z } from 'zod';

// Generate SQL request
export const generateSQLSchema = z.object({
  natural_language_query: z
    .string()
    .min(10, 'Query must be at least 10 characters')
    .max(1000, 'Query must not exceed 1000 characters')
    .trim(),
  model: z.enum(['claude-3-5-sonnet', 'claude-3-opus']).default('claude-3-5-sonnet'),
  temperature: z.number().min(0).max(1).default(0.1),
  include_explanation: z.boolean().default(true),
});

// Execute query request
export const executeQuerySchema = z.object({
  sql: z.string().min(1, 'SQL query is required'),
  limit: z.coerce.number().min(1).max(1000).default(1000),
  timeout_ms: z.coerce.number().min(1000).max(60000).default(30000),
  dry_run: z.boolean().default(false),
  query_history_id: z.string().uuid().optional(),
});

// Table metadata query params
export const metadataTablesQuerySchema = z.object({
  schema_name: z.string().default('ih'),
  tier: z.coerce.number().min(1).max(3).optional(),
  is_active: z
    .string()
    .optional()
    .transform((val) => (val === 'true' ? true : val === 'false' ? false : undefined)),
  search: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

// Table metadata update
export const tableMetadataUpdateSchema = z.object({
  exp_display_name: z.string().min(1).max(255).optional(),
  exp_description: z.string().max(2000).optional(),
  exp_row_meaning: z.string().max(500).optional(),
  exp_tier: z.coerce.number().min(1).max(3).optional(),
  exp_tags: z.array(z.string()).optional(),
  exp_is_active: z.boolean().optional(),
  exp_sample_questions: z.array(z.string()).optional(),
  exp_common_filters: z.array(z.string()).optional(),
  exp_common_joins: z.array(z.string()).optional(),
});

// Query history params
export const queryHistoryParamsSchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
  status: z
    .enum(['generated', 'executing', 'success', 'failed', 'cancelled'])
    .optional(),
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional(),
});
```

### Type Definitions

**File**: `lib/types/data-explorer.ts`

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
  model?: 'claude-3-5-sonnet' | 'claude-3-opus';
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
```

### Cache Service

**File**: `lib/cache/data-explorer-cache.ts`

```typescript
import { CacheService } from '@/lib/cache/base';
import type { QueryExecutionResult, TableMetadata } from '@/lib/types/data-explorer';

export class DataExplorerCacheService extends CacheService {
  protected namespace = 'data-explorer';
  protected defaultTTL = 900; // 15 minutes

  // Query results cache
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

  // Metadata cache (longer TTL)
  async cacheMetadata(tableId: string, metadata: TableMetadata): Promise<void> {
    const key = this.buildKey('metadata', 'table', tableId);
    await this.set(key, metadata, 3600); // 1 hour
  }

  async getMetadata(tableId: string): Promise<TableMetadata | null> {
    const key = this.buildKey('metadata', 'table', tableId);
    return this.get<TableMetadata>(key);
  }

  // Invalidate metadata cache
  async invalidateMetadata(tableId: string): Promise<void> {
    const key = this.buildKey('metadata', 'table', tableId);
    await this.delete(key);
  }

  // Pattern cache
  async cachePatterns(patterns: unknown[]): Promise<void> {
    const key = this.buildKey('patterns');
    await this.set(key, patterns, 1800); // 30 minutes
  }

  async getPatterns(): Promise<unknown[] | null> {
    const key = this.buildKey('patterns');
    return this.get<unknown[]>(key);
  }
}

// Singleton instance
export const dataExplorerCache = new DataExplorerCacheService();
```

### Environment Variables

**Add to `lib/env.ts`**:

```typescript
import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
  server: {
    // Existing variables...

    // AWS Bedrock (Data Explorer)
    AWS_BEDROCK_REGION: z.string().default('us-east-1'),
    AWS_BEDROCK_ACCESS_KEY_ID: z.string().min(1),
    AWS_BEDROCK_SECRET_ACCESS_KEY: z.string().min(1),

    // Data Explorer Configuration
    DATA_EXPLORER_MODEL_ID: z
      .string()
      .default('anthropic.claude-3-5-sonnet-20241022-v2:0'),
    DATA_EXPLORER_MAX_TOKENS: z.coerce.number().default(4096),
    DATA_EXPLORER_TEMPERATURE: z.coerce.number().min(0).max(1).default(0.1),
    DATA_EXPLORER_QUERY_TIMEOUT_MS: z.coerce.number().default(30000),
    DATA_EXPLORER_MAX_ROWS: z.coerce.number().default(1000),
  },
  client: {
    // Existing client variables...
  },
  runtimeEnv: {
    // Map to process.env...
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

**Add to `.env.local`**:

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
DATA_EXPLORER_MAX_ROWS=1000
```

### Logging Configuration

**Add to `lib/logger/index.ts`**:

```typescript
// Add slow threshold for SQL generation
export const SLOW_THRESHOLDS = {
  DB_QUERY: 500,
  API_OPERATION: 1000,
  AUTH_OPERATION: 2000,
  SQL_GENERATION: 2000, // NEW: LLM call threshold
} as const;
```

---

## Implementation Phases

### Phase 1: MVP Foundation (Weeks 1-2)

#### Objectives
- Establish basic natural language to SQL pipeline
- Create manual metadata management interface
- Enable query execution with results display

#### Deliverables

##### 1.1 Infrastructure Setup
- [ ] Create `lib/db/explorer-schema.ts` with all table definitions
- [ ] Update `lib/db/schema.ts` to re-export explorer schema
- [ ] Run `pnpm db:generate` to create migration
- [ ] Review and apply migration with `pnpm db:migrate`
- [ ] Set up AWS Bedrock credentials in `.env.local`
- [ ] Add environment variables to `lib/env.ts` with validation
- [ ] Configure VPC endpoint for Bedrock (infrastructure team)

##### 1.2 Services Layer
- [ ] Create `lib/services/data-explorer/` directory
- [ ] Implement `base-explorer-service.ts` extending `BaseRBACService`
- [ ] Implement `bedrock-service.ts` for SQL generation
- [ ] Implement `metadata-service.ts` for CRUD operations
- [ ] Implement `query-executor-service.ts` for query execution
- [ ] Implement `query-security-service.ts` for practice_uid filtering
- [ ] Create `lib/services/data-explorer/index.ts` with factory functions
- [ ] **Validation**: Run `pnpm tsc` and `pnpm lint` - fix all errors

##### 1.3 API Routes
- [ ] Create `/api/data/explorer/generate-sql/route.ts` with `rbacRoute`
- [ ] Create `/api/data/explorer/execute-query/route.ts` with `rbacRoute`
- [ ] Create `/api/data/explorer/metadata/tables/route.ts` with `rbacRoute`
- [ ] Create `/api/data/explorer/metadata/tables/[id]/route.ts` with `rbacRoute`
- [ ] Create `/api/data/explorer/health/route.ts` with `publicRoute`
- [ ] **Validation**: Run `pnpm tsc` and `pnpm lint` - fix all errors

##### 1.4 Type Definitions & Validation
- [ ] Create `lib/types/data-explorer.ts` with all interfaces
- [ ] Create `lib/validations/data-explorer.ts` with Zod schemas
- [ ] **Validation**: Run `pnpm tsc` - ensure no type errors

##### 1.5 Frontend Hooks & Components
- [ ] Create `lib/hooks/use-data-explorer.ts` with React Query hooks
- [ ] Create `/app/data/explorer/page.tsx` (query interface)
- [ ] Create `/app/data/explorer/metadata/page.tsx` (metadata management)
- [ ] **Validation**: Run `pnpm tsc` and `pnpm lint` - fix all errors

##### 1.6 Testing
- [ ] Write unit tests for `BedrockService`
- [ ] Write unit tests for `QueryExecutorService`
- [ ] Write unit tests for `MetadataService`
- [ ] Write integration tests for `/api/data/explorer/generate-sql`
- [ ] Write integration tests for `/api/data/explorer/execute-query`
- [ ] **Validation**: Run `pnpm test:run` - all tests passing

##### 1.7 Post-Phase Validation
- [ ] Run `pnpm tsc` - zero errors
- [ ] Run `pnpm lint` - zero errors
- [ ] Run `pnpm test:run` - all tests passing
- [ ] Manual testing of query generation
- [ ] Manual testing of query execution
- [ ] Verify practice_uid filtering in SQL output

#### Success Criteria
- Generate valid SQL for 10 test queries
- Successfully execute queries against `ih` schema
- Metadata created for 10 most-used tables
- All TypeScript and linting checks passing
- Zero security vulnerabilities (practice_uid filtering works)

---

### Phase 2: Enhanced Metadata & Discovery (Weeks 3-4)

#### Objectives
- Implement automatic schema discovery
- Add relationship detection
- Create query learning system

#### Deliverables

##### 2.1 Schema Discovery Services
- [ ] Implement `schema-discovery-service.ts`
- [ ] Create `/api/data/explorer/discover-schema/route.ts` with `rbacRoute`
- [ ] Create `/app/data/explorer/metadata/discovery/page.tsx`
- [ ] **Validation**: Run `pnpm tsc` and `pnpm lint` - fix all errors

##### 2.2 Pattern Learning
- [ ] Implement `pattern-service.ts` for query pattern extraction
- [ ] Create background job for pattern analysis
- [ ] Add pattern caching with `DataExplorerCacheService`
- [ ] **Validation**: Run `pnpm tsc` and `pnpm lint` - fix all errors

##### 2.3 Testing
- [ ] Write unit tests for `SchemaDiscoveryService`
- [ ] Write unit tests for `PatternService`
- [ ] Write integration tests for discovery API
- [ ] **Validation**: Run `pnpm test:run` - all tests passing

##### 2.4 Post-Phase Validation
- [ ] Run `pnpm tsc` - zero errors
- [ ] Run `pnpm lint` - zero errors
- [ ] Run `pnpm test:run` - all tests passing

#### Success Criteria
- Auto-discover metadata for all 50 tier-1 tables
- Correctly identify 80% of foreign key relationships
- Reduce average query generation time by 30%

---

### Phase 3: Production Optimization (Weeks 5-6)

#### Objectives
- Optimize performance and reliability
- Implement comprehensive feedback system
- Build query template library

#### Deliverables

##### 3.1 Performance Optimization
- [ ] Implement `DataExplorerCacheService` extending `CacheService`
- [ ] Add Redis caching for query results (15 min TTL)
- [ ] Add Redis caching for metadata (1 hour TTL)
- [ ] Optimize Drizzle queries with proper indexes
- [ ] Add query timeout handling
- [ ] **Validation**: Run `pnpm tsc` and `pnpm lint` - fix all errors

##### 3.2 History & Feedback
- [ ] Implement `history-service.ts`
- [ ] Create `/app/data/explorer/history/page.tsx`
- [ ] Create `/api/data/explorer/history/list/route.ts` with `rbacRoute`
- [ ] Create `/api/data/explorer/history/[id]/rate/route.ts` with `rbacRoute`
- [ ] **Validation**: Run `pnpm tsc` and `pnpm lint` - fix all errors

##### 3.3 Template Library
- [ ] Implement `template-service.ts`
- [ ] Create `/app/data/explorer/templates/page.tsx`
- [ ] Create `/api/data/explorer/templates/route.ts` with `rbacRoute`
- [ ] Create `/api/data/explorer/templates/[id]/route.ts` with `rbacRoute`
- [ ] Create `/api/data/explorer/templates/[id]/execute/route.ts` with `rbacRoute`
- [ ] **Validation**: Run `pnpm tsc` and `pnpm lint` - fix all errors

##### 3.4 Testing
- [ ] Write unit tests for `HistoryService`
- [ ] Write unit tests for `TemplateService`
- [ ] Write integration tests for history and template APIs
- [ ] Write performance tests for cached queries
- [ ] **Validation**: Run `pnpm test:run` - all tests passing

##### 3.5 Post-Phase Validation
- [ ] Run `pnpm tsc` - zero errors
- [ ] Run `pnpm lint` - zero errors
- [ ] Run `pnpm test:run` - all tests passing
- [ ] Load testing with 100 concurrent queries

#### Success Criteria
- 90% of queries execute in under 5 seconds
- 50+ saved templates covering common use cases
- 4+ star average rating on generated queries
- Cache hit rate >70% for repeated queries

---

### Phase 4: Organization Access (Weeks 7-8)

#### Objectives
- Enable practice-level users
- Implement automatic security filtering
- Create simplified interface

#### Deliverables

##### 4.1 Security Layer Enhancement
- [ ] Audit `QuerySecurityService` for practice_uid injection
- [ ] Add comprehensive logging for security events
- [ ] Create security tests for cross-organization isolation
- [ ] **Validation**: Run `pnpm tsc` and `pnpm lint` - fix all errors

##### 4.2 Simplified User Interface
- [ ] Create `/app/data/explorer/simple/page.tsx` (guided builder)
- [ ] Hide SQL generation details for non-technical users
- [ ] Add pre-built question categories
- [ ] **Validation**: Run `pnpm tsc` and `pnpm lint` - fix all errors

##### 4.3 Organization Management
- [ ] Add organization-specific metadata support
- [ ] Add usage quotas per organization
- [ ] Create organization admin dashboard
- [ ] **Validation**: Run `pnpm tsc` and `pnpm lint` - fix all errors

##### 4.4 Testing
- [ ] Write security tests for data isolation
- [ ] Write e2e tests for practice user workflows
- [ ] Penetration testing for cross-organization access
- [ ] **Validation**: Run `pnpm test:run` - all tests passing

##### 4.5 Post-Phase Validation
- [ ] Run `pnpm tsc` - zero errors
- [ ] Run `pnpm lint` - zero errors
- [ ] Run `pnpm test:run` - all tests passing
- [ ] Security audit by external team

#### Success Criteria
- Zero cross-organization data leaks
- 80% of practice queries self-served
- 5x increase in total system usage
- 100% pass rate on security validation tests

---

## Testing Strategy

### Test File Structure

```
__tests__/
  unit/
    lib/
      services/
        data-explorer/
          bedrock-service.test.ts
          query-executor-service.test.ts
          metadata-service.test.ts
          schema-discovery-service.test.ts
          query-security-service.test.ts
          history-service.test.ts
          template-service.test.ts
  integration/
    api/
      data/
        explorer/
          generate-sql.test.ts
          execute-query.test.ts
          metadata.test.ts
          history.test.ts
          templates.test.ts
  e2e/
    data-explorer/
      query-workflow.test.ts
      security-isolation.test.ts
```

### Unit Test Example

```typescript
// __tests__/unit/lib/services/data-explorer/bedrock-service.test.ts
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
      all_permissions: ['data-explorer:query:organization'],
      // ... other required fields
    };

    service = new BedrockService(mockUserContext);
    vi.clearAllMocks();
  });

  it('should generate valid SQL from natural language query', async () => {
    const result = await service.generateSQL(
      'How many patients were diagnosed with diabetes in 2024?',
      { model: 'claude-3-5-sonnet', temperature: 0.1 }
    );

    expect(result.sql).toContain('SELECT COUNT');
    expect(result.tables_used).toContain('patients');
    expect(result.estimated_complexity).toBe('simple');
  });

  it('should include practice_uid in tables_used check', async () => {
    const result = await service.generateSQL(
      'Show me all claims from last month'
    );

    // Verify generated SQL references ih schema
    expect(result.sql).toContain('ih.');

    // Verify tables have practice_uid column
    for (const table of result.tables_used) {
      expect(result.sql).toContain(table);
    }
  });

  it('should throw error if user lacks permission', async () => {
    const unauthorizedContext = {
      ...mockUserContext,
      all_permissions: [],
    };

    const unauthorizedService = new BedrockService(unauthorizedContext);

    await expect(
      unauthorizedService.generateSQL('Test query')
    ).rejects.toThrow('Insufficient permissions');
  });
});
```

### Integration Test Example

```typescript
// __tests__/integration/api/data/explorer/execute-query.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { POST } from '@/app/api/data/explorer/execute-query/route';
import { createMockRequest, createMockUserContext } from '@/test/helpers';

describe('POST /api/data/explorer/execute-query', () => {
  let mockUserContext: UserContext;

  beforeEach(() => {
    mockUserContext = createMockUserContext({
      accessible_practices: [1, 2, 3],
      all_permissions: ['data-explorer:execute:organization'],
    });
  });

  it('should execute query with practice_uid filtering', async () => {
    const request = createMockRequest({
      body: {
        sql: 'SELECT * FROM ih.patients LIMIT 10',
        limit: 10,
      },
    });

    const response = await POST(request, mockUserContext);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.rows).toBeDefined();
    expect(data.data.row_count).toBeLessThanOrEqual(10);
  });

  it('should reject queries without ih schema prefix', async () => {
    const request = createMockRequest({
      body: {
        sql: 'SELECT * FROM patients LIMIT 10',
      },
    });

    const response = await POST(request, mockUserContext);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('must reference tables using "ih."');
  });

  it('should reject destructive operations', async () => {
    const request = createMockRequest({
      body: {
        sql: 'DELETE FROM ih.patients WHERE patient_id = 123',
      },
    });

    const response = await POST(request, mockUserContext);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('Destructive operation not allowed');
  });

  it('should enforce practice_uid filtering for organization-scoped users', async () => {
    const request = createMockRequest({
      body: {
        sql: 'SELECT * FROM ih.patients LIMIT 10',
      },
    });

    const response = await POST(request, mockUserContext);
    const data = await response.json();

    // Verify response doesn't contain data from other practices
    // (Implementation depends on test data setup)
    expect(response.status).toBe(200);
  });
});
```

### Test Commands

```bash
# Run all tests
pnpm test:run

# Run specific test suite
pnpm test:run __tests__/unit/lib/services/data-explorer

# Run with coverage
pnpm test:coverage

# Run in watch mode (development)
pnpm test:watch

# Run integration tests only
pnpm test:integration

# Run unit tests only
pnpm test:unit
```

---

## Monitoring & Success Metrics

### Key Performance Indicators

#### Usage Metrics
- Daily active users
- Queries generated per day
- Average time from question to results
- Percentage of queries modified before execution
- Cache hit rate

#### Quality Metrics
- SQL generation success rate
- Average user rating (1-5 stars)
- Query execution error rate
- Percentage of queries reused as templates
- Practice_uid filtering accuracy (100% required)

#### Business Impact
- Analyst time saved (hours/week)
- Reduction in ad-hoc query requests
- Increase in self-service analytics
- Cost per query (Bedrock API costs)

### CloudWatch Logs Integration

**Log Queries**:
```
fields @timestamp, operation, userId, organizationId, duration, component
| filter component = "data-explorer"
| filter operation = "data_explorer_generate_sql"
| stats avg(duration), count() by bin(5m)
```

**Slow Query Detection**:
```
fields @timestamp, operation, sql, duration
| filter component = "data-explorer"
| filter slow = true
| sort duration desc
```

**Security Events**:
```
fields @timestamp, userId, organizationId, operation, error
| filter component = "data-explorer"
| filter error like /permission|access|security/
```

### Monitoring Dashboard Metrics

```typescript
// Metrics tracked via logging
interface SystemMetrics {
  // Real-time metrics
  activeUsers: number;
  queriesInProgress: number;
  avgResponseTime: number;
  errorRate: number;

  // Daily aggregates
  totalQueries: number;
  uniqueUsers: number;
  successRate: number;
  avgUserRating: number;

  // Cost tracking
  bedrockTokensUsed: number;
  estimatedCost: number;
  costPerQuery: number;

  // Learning metrics
  newPatternsDiscovered: number;
  metadataCompleteness: number;
  autoDiscoveryAccuracy: number;

  // Security metrics
  practiceUidFilteringSuccessRate: number;
  crossOrganizationAttempts: number;
}
```

### Success Criteria by Phase

| Phase | Success Metric | Target |
|-------|---------------|---------|
| Phase 1 | Valid SQL generation rate | >70% |
| Phase 1 | Manual metadata coverage | 20 tables |
| Phase 1 | TypeScript/lint errors | 0 |
| Phase 2 | Auto-discovery accuracy | >80% |
| Phase 2 | Relationship detection | >75% |
| Phase 3 | Query execution time | <5 seconds |
| Phase 3 | User satisfaction rating | >4.0 stars |
| Phase 3 | Cache hit rate | >70% |
| Phase 4 | Practice self-service rate | >80% |
| Phase 4 | Security validation | 100% pass |
| Phase 4 | Cross-organization leaks | 0 |

---

## Risk Mitigation

### Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|---------|------------|
| Poor SQL generation quality | Medium | High | Iterative prompt improvement, user feedback loop, template library |
| Bedrock API rate limits | Low | Medium | Implement caching, request queuing, model fallback |
| Query performance issues | Medium | Medium | Query optimization, execution limits, timeout handling |
| Metadata maintenance burden | High | Low | Auto-discovery, bulk import tools, community contributions |
| Security breach via SQL injection | Low | Critical | Parameterized queries, validation layer, practice_uid filtering, fail-closed security |
| Analytics DB unavailable | Medium | High | Health checks, graceful degradation, retry logic |

### Operational Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|---------|------------|
| User adoption resistance | Medium | High | Training, clear value demonstration, simplified interface |
| Cost overruns from API usage | Low | Medium | Usage monitoring, cost alerts, caching strategy, per-org quotas |
| Incorrect medical interpretations | Medium | High | Disclaimer, human review requirement, query explanation |
| Compliance violations | Low | Critical | Audit logging, access controls, VPC endpoints, regular security audits |
| Type errors in production | Low | High | Strict TypeScript, comprehensive testing, `pnpm tsc` in CI/CD |

### Contingency Plans

1. **If Bedrock fails**: Implement fallback to previous model version, graceful degradation to manual query writing
2. **If costs exceed budget**: Implement usage quotas per user/org, increase caching TTL, reduce token limits
3. **If adoption is low**: Simplified interface, more training, expand template library, user feedback sessions
4. **If security concerns arise**: Disable practice access immediately, conduct security audit, add additional filtering layers
5. **If performance degrades**: Scale analytics DB read replicas, optimize slow queries, increase cache TTL

---

## Appendices

### A. Development Commands

```bash
# Development
pnpm dev              # Start dev server on port 4001
pnpm dev:turbo        # Start dev with Turbopack (faster)

# Type Checking & Linting (REQUIRED after code changes)
pnpm tsc              # Type check entire codebase
pnpm lint             # Run Biome + custom logger lint
pnpm lint:fix         # Auto-fix Biome issues

# Testing
pnpm test:run         # Run all tests once
pnpm test:watch       # Watch mode for development
pnpm test:coverage    # Generate coverage report
pnpm test:unit        # Unit tests only
pnpm test:integration # Integration tests only

# Database
pnpm db:generate      # Generate migration from schema changes
pnpm db:migrate       # Apply pending migrations
pnpm db:validate      # Validate migration integrity
pnpm db:push          # Push schema directly (dev only)

# Build & Deploy
pnpm build            # Production build (validates env first)
pnpm start            # Start production server
```

### B. File Naming Conventions

**Services** (no buzzwords):
- ✅ `bedrock-service.ts`
- ✅ `query-executor-service.ts`
- ✅ `metadata-service.ts`
- ❌ `enhanced-bedrock-service.ts`
- ❌ `optimized-query-executor.ts`

**Components** (kebab-case):
- ✅ `query-interface.tsx`
- ✅ `metadata-management.tsx`
- ✅ `data-explorer-history.tsx`
- ❌ `QueryInterface.tsx`
- ❌ `MetadataManagement.tsx`

### C. Code Quality Checklist

**Before committing any code**:
- [ ] Run `pnpm tsc` - zero TypeScript errors
- [ ] Run `pnpm lint` - zero linting errors
- [ ] Run `pnpm test:run` - all tests passing
- [ ] Review changes for security implications
- [ ] Add/update tests for new functionality
- [ ] Update type definitions if needed
- [ ] No `any` types in code
- [ ] No `console.log()` statements (use `@/lib/logger`)
- [ ] All imports use absolute paths (`@/lib/...`)
- [ ] File names follow conventions (kebab-case, no buzzwords)

### D. Initial Metadata Priorities

Priority tables for Phase 1 metadata creation (Tier 1):

1. **patients** - Core patient demographics
2. **encounters** - Visit/admission records
3. **diagnoses** - ICD-10 diagnosis codes
4. **procedures** - CPT procedure codes
5. **claims** - Insurance claims
6. **payments** - Payment transactions
7. **providers** - Healthcare providers
8. **organizations** - Healthcare organizations
9. **medications** - Prescribed medications
10. **lab_results** - Laboratory test results

### E. Example Prompts for Testing

```typescript
const EXAMPLE_QUERIES = [
  'How many new patients did we see last month?',
  'What is our average claim payment time?',
  'Show me the top 10 diagnosis codes by frequency',
  'List all patients diagnosed with diabetes in Q3 2024',
  'What is the average age of patients in our system?',
  'Show me all encounters in the last 7 days',
  'Which providers have the highest patient load?',
  'What percentage of claims are paid within 30 days?',
  'List all active medications for patients over 65',
  'Show me lab results for abnormal glucose levels',
];
```

### F. Security Audit Checklist

**Before enabling for practice users**:
- [ ] Verify practice_uid filtering in all generated queries
- [ ] Test cross-organization data isolation
- [ ] Verify fail-closed behavior (empty practice list = no data)
- [ ] Audit logging captures all queries
- [ ] VPC endpoint configured for Bedrock
- [ ] IAM roles follow least-privilege principle
- [ ] SQL injection prevention validated
- [ ] Destructive operation prevention validated
- [ ] Rate limiting tested under load
- [ ] RBAC permissions tested for all user roles

### G. Performance Benchmarks

**Target Performance**:
- SQL Generation: <2 seconds (Bedrock call)
- Query Execution: <5 seconds (analytics DB)
- Metadata Load: <500ms (with caching)
- Cache Hit Rate: >70% for repeated queries
- Concurrent Users: 100+ simultaneous queries

**Optimization Strategies**:
- Redis caching with hierarchical keys
- Drizzle query optimization with indexes
- Connection pooling for analytics DB
- Lazy loading for metadata
- Debounced auto-complete searches

---

## Document Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-10-27 | Patrick | Initial design document |
| 2.0 | 2025-01-27 | Patrick | Generic infrastructure alignment |
| 3.0 | 2025-01-27 | Patrick | Full Bendcare infrastructure alignment with CLAUDE.md |

## Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Technical Lead | Patrick | | |
| Product Owner | | | |
| Security Officer | | | |

---

*End of Document*
