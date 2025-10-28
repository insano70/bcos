# Data Explorer System
## Technical Design Document

**Document Version:** 1.0  
**Date:** October 27, 2025  
**Author:** Patrick @ Bendcare  
**Project:** Data Explorer - Natural Language Interface for Healthcare Data Warehouse  

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Project Overview](#project-overview)
3. [System Architecture](#system-architecture)
4. [Database Design](#database-design)
5. [Implementation Phases](#implementation-phases)
6. [Technical Components](#technical-components)
7. [Security & Compliance](#security-compliance)
8. [User Interface Design](#user-interface-design)
9. [Integration Strategy](#integration-strategy)
10. [Monitoring & Success Metrics](#monitoring-success-metrics)
11. [Risk Mitigation](#risk-mitigation)
12. [Appendices](#appendices)

---

## Executive Summary

This document outlines the design for the Data Explorer system within Bendcare's healthcare platform. Data Explorer enables data analysts to generate complex SQL queries using plain English questions, reducing query development time by an estimated 50% while maintaining HIPAA compliance and data security.

### Key Objectives
- Enable natural language querying of healthcare data warehouse
- Build intelligent metadata layer with auto-discovery capabilities
- Reduce analyst workload through query reuse and templates
- Maintain strict data security and HIPAA compliance
- Scale from internal analysts to external healthcare practices

### Technology Stack
- **AI Provider:** AWS Bedrock (Claude Sonnet 3.5/4)
- **Frontend:** Next.js (existing Bendcare application)
- **Database:** PostgreSQL on AWS RDS
- **Infrastructure:** AWS ECS (existing deployment)
- **Authentication:** Existing Bendcare RBAC system

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
5. Enforces organization-level data security automatically

### Constraints
- All PHI data must remain within Bendcare's private network
- Read-only access (no data modifications)
- Must integrate with existing authentication and authorization
- Single developer resource for initial implementation

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
└─────────────────────────────────────────────────────────────────────┘
                                    │
┌─────────────────────────────────────────────────────────────────────┐
│                        Data Layer                                    │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              PostgreSQL Data Warehouse (AWS RDS)              │   │
│  │  • ih schema (Tier 1 - 50 tables)                            │   │
│  │  • nl_query schema (Metadata & History)                      │   │
│  │  • Existing healthcare data                                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    AWS Bedrock API                           │   │
│  │  • Claude Sonnet 3.5/4 for SQL generation                   │   │
│  │  • Private endpoint configuration                            │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Key Features |
|-----------|---------------|--------------|
| **Query Interface** | Accept natural language input | Auto-complete, query suggestions, examples |
| **Bedrock Service** | Generate SQL from text | Prompt optimization, model selection, token management |
| **Metadata Service** | Manage table/column descriptions | CRUD operations, versioning, confidence scores |
| **Query Executor** | Run SQL safely | Timeouts, row limits, security injection |
| **Schema Discovery** | Auto-detect metadata | Pattern recognition, relationship detection |
| **History Service** | Track all queries | Analytics, pattern learning, audit trail |

---

## Database Design

### Drizzle ORM Integration

#### Migration Best Practices

When using Drizzle ORM with PostgreSQL, follow these steps for migrations:

1. **Define Schema in TypeScript**
   ```typescript
   // schema/explorer.ts
   import { pgTable, text, integer, boolean, timestamp, uuid, jsonb, decimal, pgEnum } from 'drizzle-orm/pg-core';
   ```

2. **Generate Migration**
   ```bash
   # Generate migration after schema changes
   npm run drizzle:generate
   
   # This runs: drizzle-kit generate:pg --schema=./src/schema/explorer.ts --out=./drizzle
   ```

3. **Review Generated SQL**
   ```bash
   # Always review the generated migration before applying
   cat drizzle/0001_data_explorer_tables.sql
   ```

4. **Apply Migration**
   ```bash
   # Apply migration to database
   npm run drizzle:migrate
   
   # This runs: drizzle-kit migrate:pg --config=./drizzle.config.ts
   ```

5. **Push for Development** (skips migration files)
   ```bash
   # For rapid development iteration
   npm run drizzle:push
   
   # This runs: drizzle-kit push:pg --config=./drizzle.config.ts
   ```

#### Drizzle Configuration

```typescript
// drizzle.config.ts
import type { Config } from 'drizzle-kit';

export default {
  schema: './src/schema/explorer.ts',
  out: './drizzle',
  driver: 'pg',
  dbCredentials: {
    connectionString: process.env.DATABASE_URL!,
  },
  tablesFilter: ['explorer_*'], // Only manage explorer tables
} satisfies Config;
```

### Database Schema

```sql
-- Tables for storing metadata and query history in public schema
-- All tables prefixed with 'explorer_' for Data Explorer product
-- All columns prefixed with 'exp_' for consistency
-- Using TEXT instead of VARCHAR per PostgreSQL best practices
-- All timestamps use TIMESTAMPTZ for proper timezone handling

-- Table-level metadata
CREATE TABLE explorer_table_metadata (
    table_metadata_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exp_schema_name TEXT NOT NULL DEFAULT 'ih',
    exp_table_name TEXT NOT NULL,
    exp_display_name TEXT,
    exp_description TEXT,
    exp_row_meaning TEXT, -- "One row represents..."
    exp_primary_entity TEXT, -- patient|encounter|claim|provider
    exp_common_filters TEXT[], -- Frequently used WHERE conditions
    exp_common_joins TEXT[], -- Typical JOIN patterns
    exp_tier INTEGER DEFAULT 3 CHECK (exp_tier IN (1,2,3)),
    exp_sample_questions TEXT[], -- Example questions this table can answer
    exp_tags TEXT[], -- Categories like 'financial', 'clinical', 'operational'
    exp_is_active BOOLEAN DEFAULT true,
    exp_is_auto_discovered BOOLEAN DEFAULT false,
    exp_confidence_score DECIMAL(3,2), -- 0.00 to 1.00 for auto-discovered
    exp_row_count_estimate BIGINT,
    exp_last_analyzed TIMESTAMPTZ,
    exp_created_at TIMESTAMPTZ DEFAULT NOW(),
    exp_updated_at TIMESTAMPTZ DEFAULT NOW(),
    exp_created_by TEXT,
    exp_updated_by TEXT,
    UNIQUE(exp_schema_name, exp_table_name)
);

-- Column-level metadata
CREATE TABLE explorer_column_metadata (
    column_metadata_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exp_table_id UUID REFERENCES explorer_table_metadata(table_metadata_id) ON DELETE CASCADE,
    exp_column_name TEXT NOT NULL,
    exp_display_name TEXT,
    exp_description TEXT,
    exp_data_type TEXT NOT NULL,
    exp_semantic_type TEXT, -- date|amount|identifier|code|text|boolean
    exp_is_nullable BOOLEAN DEFAULT true,
    exp_is_primary_key BOOLEAN DEFAULT false,
    exp_is_foreign_key BOOLEAN DEFAULT false,
    exp_foreign_key_table TEXT,
    exp_foreign_key_column TEXT,
    exp_is_org_filter BOOLEAN DEFAULT false, -- For security filtering
    exp_is_phi BOOLEAN DEFAULT false,
    exp_common_values JSONB, -- For enums/categories
    exp_value_format TEXT, -- 'YYYY-MM-DD', 'currency', 'percentage'
    exp_example_values TEXT[],
    exp_min_value TEXT,
    exp_max_value TEXT,
    exp_distinct_count INTEGER,
    exp_null_percentage DECIMAL(5,2),
    exp_created_at TIMESTAMPTZ DEFAULT NOW(),
    exp_updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(exp_table_id, exp_column_name)
);

-- Query execution history
CREATE TABLE explorer_query_history (
    query_history_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exp_natural_language_query TEXT NOT NULL,
    exp_generated_sql TEXT NOT NULL,
    exp_executed_sql TEXT, -- If user modified before execution
    exp_final_sql TEXT, -- What actually ran
    exp_status TEXT NOT NULL, -- generated|executing|success|failed|cancelled
    exp_execution_time_ms INTEGER,
    exp_row_count INTEGER,
    exp_error_message TEXT,
    exp_error_details JSONB,
    exp_user_id TEXT NOT NULL,
    exp_user_email TEXT,
    exp_organization_id TEXT,
    exp_model_used TEXT DEFAULT 'claude-3-5-sonnet',
    exp_model_temperature DECIMAL(2,1),
    exp_prompt_tokens INTEGER,
    exp_completion_tokens INTEGER,
    exp_total_cost_cents INTEGER, -- Track Bedrock costs
    exp_user_rating INTEGER CHECK (exp_user_rating BETWEEN 1 AND 5),
    exp_user_feedback TEXT,
    exp_was_helpful BOOLEAN,
    exp_tables_used TEXT[], -- Array of table names referenced
    exp_execution_plan JSONB, -- EXPLAIN output
    exp_result_sample JSONB, -- First few rows for quick preview
    exp_created_at TIMESTAMPTZ DEFAULT NOW(),
    exp_metadata JSONB -- Additional context
);

-- Saved queries and templates
CREATE TABLE explorer_saved_queries (
    saved_query_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exp_query_history_id UUID REFERENCES explorer_query_history(query_history_id),
    exp_name TEXT NOT NULL,
    exp_description TEXT,
    exp_category TEXT, -- financial|clinical|operational|regulatory
    exp_natural_language_template TEXT, -- With {{variables}}
    exp_sql_template TEXT,
    exp_template_variables JSONB, -- {"org": "string", "date_range": "daterange"}
    exp_tags TEXT[],
    exp_is_public BOOLEAN DEFAULT false, -- Shared across analysts
    exp_usage_count INTEGER DEFAULT 0,
    exp_last_used TIMESTAMPTZ,
    exp_created_by TEXT,
    exp_created_at TIMESTAMPTZ DEFAULT NOW(),
    exp_updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table relationships for JOIN suggestions
CREATE TABLE explorer_table_relationships (
    table_relationship_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exp_from_table_id UUID REFERENCES explorer_table_metadata(table_metadata_id),
    exp_to_table_id UUID REFERENCES explorer_table_metadata(table_metadata_id),
    exp_relationship_type TEXT, -- one-to-one|one-to-many|many-to-many
    exp_join_condition TEXT NOT NULL, -- "t1.patient_id = t2.patient_id"
    exp_is_common BOOLEAN DEFAULT false,
    exp_confidence_score DECIMAL(3,2),
    exp_discovered_from TEXT, -- foreign_key|naming_pattern|usage_analysis
    exp_created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Learning patterns from usage
CREATE TABLE explorer_query_patterns (
    query_pattern_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exp_pattern_type TEXT, -- term_mapping|filter_pattern|join_pattern
    exp_natural_language_pattern TEXT, -- "patients with diabetes"
    exp_sql_pattern TEXT, -- "WHERE diagnosis_code LIKE 'E11%'"
    exp_tables_involved TEXT[],
    exp_usage_count INTEGER DEFAULT 1,
    exp_success_rate DECIMAL(5,2),
    exp_last_seen TIMESTAMPTZ DEFAULT NOW(),
    exp_created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_explorer_query_history_user ON explorer_query_history(exp_user_id, exp_created_at DESC);
CREATE INDEX idx_explorer_query_history_status ON explorer_query_history(exp_status);
CREATE INDEX idx_explorer_query_history_tables ON explorer_query_history USING GIN(exp_tables_used);
CREATE INDEX idx_explorer_column_metadata_table ON explorer_column_metadata(exp_table_id);
CREATE INDEX idx_explorer_column_semantic ON explorer_column_metadata(exp_semantic_type);
CREATE INDEX idx_explorer_saved_queries_category ON explorer_saved_queries(exp_category, exp_is_public);
CREATE INDEX idx_explorer_patterns_type ON explorer_query_patterns(exp_pattern_type);
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
- [ ] Create explorer tables in public schema
- [ ] Set up AWS Bedrock credentials and IAM roles
- [ ] Configure environment variables (BEDROCK_ACCESS_KEY_ID, BEDROCK_SECRET_ACCESS_KEY)
- [ ] Create base service classes for Bedrock integration

##### 1.2 Metadata Management Interface
- [ ] **Page:** `/data/explorer/metadata`
- [ ] **Features:**
  - Table list with search and filtering
  - Table detail editor (description, row meaning, tier)
  - Column metadata editor
  - Bulk CSV import for initial data
  - Manual relationship definition

##### 1.3 Data Explorer Query Interface
- [ ] **Page:** `/data/explorer`
- [ ] **Features:**
  - Query input with examples dropdown
  - Model selection (Claude 3.5 Sonnet vs Claude 4)
  - Generated SQL display with syntax highlighting
  - SQL editor for modifications
  - Execute button with loading state
  - Results table with pagination
  - Export to CSV functionality

##### 1.4 Core Services Implementation
```typescript
// BedrockService
interface BedrockService {
  generateSQL(query: string, context: MetadataContext): Promise<SQLResult>
  validateSQL(sql: string): Promise<ValidationResult>
  explainSQL(sql: string): Promise<string>
}

// QueryExecutor
interface QueryExecutor {
  execute(sql: string, user: User): Promise<QueryResult>
  preview(sql: string, limit: number): Promise<QueryResult>
  explain(sql: string): Promise<ExplainResult>
}

// MetadataService  
interface MetadataService {
  getTableMetadata(schema: string): Promise<TableMetadata[]>
  updateTableMetadata(id: string, data: Partial<TableMetadata>): Promise<void>
  searchTables(query: string): Promise<TableMetadata[]>
}
```

#### Success Criteria
- Generate valid SQL for 10 test queries
- Successfully execute queries against `ih` schema
- Metadata created for 10 most-used tables

### Phase 2: Enhanced Metadata & Discovery (Weeks 3-4)

#### Objectives
- Implement automatic schema discovery
- Add relationship detection
- Create query learning system

#### Deliverables

##### 2.1 Auto-Discovery System
- [ ] Schema scanning service
- [ ] Data sampling for pattern detection
- [ ] Column type inference (dates, amounts, IDs)
- [ ] Foreign key relationship detection
- [ ] Statistical profiling (nulls, cardinality, distributions)

##### 2.2 Discovery Review Interface
- [ ] **Page:** `/data/explorer/metadata/discovery`
- [ ] **Features:**
  - Pending discoveries queue
  - Side-by-side comparison (discovered vs existing)
  - Bulk approve/reject actions
  - Confidence score display
  - Schedule for periodic scanning

##### 2.3 Intelligent Query Features
- [ ] Query pattern extraction from history
- [ ] Auto-suggestions based on partial input
- [ ] "Similar queries" recommendation
- [ ] Common terms glossary

#### Success Criteria
- Auto-discover metadata for all 50 tier-1 tables
- Correctly identify 80% of foreign key relationships
- Reduce average query generation time by 30%

### Phase 3: Production Optimization (Weeks 5-6)

#### Objectives
- Optimize performance and reliability
- Implement comprehensive feedback system
- Build query template library

#### Deliverables

##### 3.1 Performance Optimization
- [ ] Query result caching strategy
- [ ] Metadata caching in application memory
- [ ] Connection pool optimization
- [ ] Query timeout handling
- [ ] Async query execution for long-running queries

##### 3.2 Feedback and Learning
- [ ] **Page:** `/data/explorer/history`
- [ ] **Features:**
  - Query history with search and filters
  - Rating system (1-5 stars)
  - Feedback collection form
  - Query performance metrics
  - Usage analytics dashboard

##### 3.3 Template Library
- [ ] **Page:** `/data/explorer/templates`
- [ ] **Features:**
  - Categorized template browser
  - Template creation from successful queries
  - Variable substitution system
  - Template sharing among analysts
  - Version control for templates

#### Success Criteria
- 90% of queries execute in under 5 seconds
- 50+ saved templates covering common use cases
- 4+ star average rating on generated queries

### Phase 4: Organization Access (Weeks 7-8)

#### Objectives
- Enable practice-level users
- Implement automatic security filtering
- Create simplified interface

#### Deliverables

##### 4.1 Security Layer Enhancement
- [ ] Automatic organization filtering injection
- [ ] Query validation for data isolation
- [ ] Audit logging for compliance
- [ ] Row-level security verification

##### 4.2 Simplified User Interface
- [ ] **Page:** `/data/explorer/simple`
- [ ] **Features:**
  - Guided query builder
  - Pre-built question categories
  - Natural language only (hide SQL)
  - Visual result summaries
  - Scheduled report generation

##### 4.3 Organization Management
- [ ] Organization-specific metadata
- [ ] Custom saved queries per organization
- [ ] Usage limits and quotas
- [ ] Billing integration for API costs

#### Success Criteria
- Zero cross-organization data leaks
- 80% of practice queries self-served
- 5x increase in total system usage

---

## Technical Components

### AWS Bedrock Integration

#### Configuration
```typescript
// Environment Configuration
const config = {
  aws: {
    region: process.env.AWS_BEDROCK_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.BEDROCK_ACCESS_KEY_ID,
      secretAccessKey: process.env.BEDROCK_SECRET_ACCESS_KEY,
    }
  },
  bedrock: {
    models: {
      primary: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      fallback: 'anthropic.claude-3-opus-20240229-v1:0'
    },
    defaults: {
      maxTokens: 4096,
      temperature: 0.1, // Low for consistent SQL
      topP: 0.9,
      stopSequences: ['Human:', 'Assistant:']
    }
  },
  database: {
    version: 'PostgreSQL 17',
    schema: 'ih' // Primary schema for healthcare data
  }
};
```

#### Prompt Engineering Strategy

```typescript
class PromptBuilder {
  buildSQLGenerationPrompt(
    query: string,
    metadata: TableMetadata[],
    examples: QueryExample[]
  ): string {
    return `
You are an expert PostgreSQL SQL generator for a healthcare analytics database.

DATABASE CONTEXT:
- Schema: ih (healthcare data warehouse)
- Database: PostgreSQL 17
- All queries are READ-ONLY
- Tables contain healthcare data (patients, encounters, claims, etc.)

AVAILABLE TABLES:
${this.formatTableMetadata(metadata)}

RELATIONSHIPS:
${this.formatRelationships(metadata)}

IMPORTANT PATTERNS:
- Date columns usually end with '_date' or '_dt'
- Amount columns usually end with '_amount' or '_amt'
- Organization filtering uses 'organization_id'
- Patient identification uses 'patient_id'
- Most tables have created_at and updated_at timestamps

EXAMPLE QUERIES:
${this.formatExamples(examples)}

USER QUESTION: ${query}

Generate a PostgreSQL query that answers this question. 

REQUIREMENTS:
1. Use the 'ih' schema prefix for all tables
2. Include comments explaining complex logic
3. Add appropriate JOINs based on the relationships
4. Use efficient query patterns (avoid SELECT *)
5. Include appropriate date formatting
6. Add LIMIT 1000 for initial preview

OUTPUT FORMAT:
- SQL query with inline comments
- Brief explanation of the approach
- List of tables used
`;
  }
}
```

### Query Execution Pipeline

```typescript
class QueryExecutionPipeline {
  async execute(naturalLanguage: string, user: User): Promise<ExecutionResult> {
    // 1. Pre-processing
    const sanitized = this.sanitizeInput(naturalLanguage);
    
    // 2. Metadata retrieval
    const metadata = await this.metadataService.getRelevantMetadata(sanitized);
    
    // 3. SQL generation
    const generated = await this.bedrockService.generateSQL(sanitized, metadata);
    
    // 4. Validation
    const validation = await this.validateSQL(generated.sql);
    if (!validation.isValid) {
      throw new ValidationError(validation.errors);
    }
    
    // 5. Security injection
    const secured = await this.addSecurityFilters(generated.sql, user);
    
    // 6. Execution
    const result = await this.queryExecutor.execute(secured);
    
    // 7. Post-processing
    await this.saveHistory(naturalLanguage, generated, result, user);
    await this.extractPatterns(naturalLanguage, generated.sql);
    
    return result;
  }
  
  private async addSecurityFilters(sql: string, user: User): Promise<string> {
    // Add organization filtering if user is from a practice
    if (user.organizationId && user.role === 'practice_user') {
      // Parse and modify SQL AST to add WHERE conditions
      // This ensures data isolation
    }
    return sql;
  }
}
```

### Metadata Auto-Discovery

```typescript
class SchemaDiscoveryService {
  async discoverTableMetadata(schema: string, table: string): Promise<DiscoveredMetadata> {
    const discovery = {
      structure: await this.getTableStructure(schema, table),
      statistics: await this.getTableStatistics(schema, table),
      patterns: await this.detectPatterns(schema, table),
      relationships: await this.detectRelationships(schema, table),
      semantics: await this.inferSemantics(schema, table)
    };
    
    return this.buildMetadata(discovery);
  }
  
  private async detectPatterns(schema: string, table: string): Promise<Pattern[]> {
    // Sample data to detect patterns
    const sample = await this.db.query(`
      SELECT * FROM ${schema}.${table} 
      TABLESAMPLE SYSTEM (1) 
      LIMIT 1000
    `);
    
    const patterns = [];
    
    // Detect date columns
    patterns.push(...this.detectDatePatterns(sample));
    
    // Detect ID columns
    patterns.push(...this.detectIdentifierPatterns(sample));
    
    // Detect amount/currency columns
    patterns.push(...this.detectAmountPatterns(sample));
    
    // Detect code columns (ICD, CPT, etc.)
    patterns.push(...this.detectMedicalCodes(sample));
    
    return patterns;
  }
  
  private async inferSemantics(schema: string, table: string): Promise<Semantics> {
    // Use naming conventions to infer meaning
    const semantics: Semantics = {
      entity: this.inferEntityType(table), // patient, encounter, claim
      temporality: this.inferTemporality(table), // transaction, snapshot, dimension
      category: this.inferCategory(table) // clinical, financial, operational
    };
    
    return semantics;
  }
}
```

---

## Security & Compliance

### Data Protection Measures

1. **PHI Protection**
   - No actual data sent to AWS Bedrock
   - Only schema and metadata shared with AI
   - All execution happens within VPC

2. **Access Control**
   - Integration with existing RBAC
   - Query-level audit logging
   - Organization-level data isolation

3. **Query Validation**
   - Prevent destructive operations
   - Enforce read-only access
   - Validate organization filters

### Compliance Requirements

| Requirement | Implementation |
|-------------|---------------|
| HIPAA audit trail | All queries logged with user, timestamp, and results |
| Data isolation | Automatic WHERE clauses for organization filtering |
| PHI encryption | TLS in transit, encrypted at rest in RDS |
| Access logging | CloudTrail for AWS, application logs for queries |
| Data retention | 7-year retention for query history per HIPAA |

---

## User Interface Design

### Data Explorer Query Interface

```
┌──────────────────────────────────────────────────────────────┐
│  Data Explorer                                       [Help]  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ "How many patients were diagnosed with diabetes      │   │
│  │  in Q3 2024?"                                        │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  Model: [Claude 3.5 Sonnet ▼]  [Generate SQL]              │
│                                                              │
│  ─────────────── Generated SQL ───────────────────          │
│                                                              │
│  ```sql                                                      │
│  -- Query to find diabetes diagnoses in Q3 2024            │
│  SELECT                                                      │
│    COUNT(DISTINCT p.patient_id) as patient_count           │
│  FROM ih.encounters e                                       │
│  JOIN ih.diagnoses d ON e.encounter_id = d.encounter_id    │
│  JOIN ih.patients p ON e.patient_id = p.patient_id         │
│  WHERE                                                       │
│    d.diagnosis_code LIKE 'E11%'  -- Type 2 diabetes       │
│    AND e.encounter_date BETWEEN '2024-07-01'               │
│                          AND '2024-09-30'                   │
│  LIMIT 1000;                                                 │
│  ```                                                         │
│                                                              │
│  Tables Used: encounters, diagnoses, patients               │
│                                                              │
│  [Edit SQL] [Run Query] [Save as Template]                  │
│                                                              │
│  ─────────────── Results ───────────────────               │
│                                                              │
│  ┌─────────────────┐                                        │
│  │ patient_count   │                                        │
│  ├─────────────────┤                                        │
│  │ 1,247          │                                        │
│  └─────────────────┘                                        │
│                                                              │
│  1 row returned in 0.23s                                    │
│                                                              │
│  [Export CSV] [Create Chart] [Share Query]                  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Metadata Management Interface

```
┌──────────────────────────────────────────────────────────────┐
│  Metadata Management                                         │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Search: [_____________________] Filter: [Tier 1 ▼]         │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Table Name          │ Tier │ Completeness │ Actions  │   │
│  ├────────────────────┼──────┼──────────────┼──────────┤   │
│  │ patients           │  1   │ 100%         │ [Edit]   │   │
│  │ encounters         │  1   │ 95%          │ [Edit]   │   │
│  │ diagnoses          │  1   │ 85%          │ [Edit]   │   │
│  │ claims             │  1   │ 60%          │ [Edit]   │   │
│  │ providers          │  2   │ 40%          │ [Edit]   │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  [Bulk Import CSV] [Run Auto-Discovery] [Export All]        │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Integration Strategy

### Existing System Integration Points

| System Component | Integration Method | Purpose |
|-----------------|-------------------|----------|
| Authentication | Reuse existing JWT/sessions | User identification |
| Authorization | Apply existing RBAC | Permission checking |
| Database Connections | Use existing pool | Connection management |
| Audit Logging | Extend current system | Compliance tracking |
| Chart Builder | Future: Export queries | Visualization |

### API Endpoints

```typescript
// API Route Structure
/api/data/explorer/
  ├── generate-sql      POST   Generate SQL from natural language
  ├── execute-query     POST   Execute SQL query
  ├── preview-query     POST   Preview with LIMIT
  ├── metadata/
  │   ├── tables        GET    List all tables
  │   ├── tables/:id    PUT    Update table metadata
  │   ├── columns/:id   PUT    Update column metadata
  │   └── discover      POST   Run auto-discovery
  ├── history/
  │   ├── list          GET    Query history
  │   ├── save          POST   Save query
  │   └── rate          POST   Rate query quality
  └── templates/
      ├── list          GET    List templates
      ├── create        POST   Create template
      └── execute       POST   Execute template
```

---

## Monitoring & Success Metrics

### Key Performance Indicators

#### Usage Metrics
- Daily active users
- Queries generated per day
- Average time from question to results
- Percentage of queries modified before execution

#### Quality Metrics
- SQL generation success rate
- Average user rating (1-5 stars)
- Query execution error rate
- Percentage of queries reused as templates

#### Business Impact
- Analyst time saved (hours/week)
- Reduction in ad-hoc query requests
- Increase in self-service analytics
- Cost per query (Bedrock API costs)

### Monitoring Dashboard

```typescript
// Metrics to track
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
}
```

### Success Criteria by Phase

| Phase | Success Metric | Target |
|-------|---------------|---------|
| Phase 1 | Valid SQL generation rate | >70% |
| Phase 1 | Manual metadata coverage | 20 tables |
| Phase 2 | Auto-discovery accuracy | >80% |
| Phase 2 | Relationship detection | >75% |
| Phase 3 | Query execution time | <5 seconds |
| Phase 3 | User satisfaction rating | >4.0 stars |
| Phase 4 | Practice self-service rate | >80% |
| Phase 4 | Security validation | 100% pass |

---

## Risk Mitigation

### Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|---------|------------|
| Poor SQL generation quality | Medium | High | Iterative prompt improvement, user feedback loop |
| Bedrock API rate limits | Low | Medium | Implement caching, queue system |
| Query performance issues | Medium | Medium | Query optimization, execution limits |
| Metadata maintenance burden | High | Low | Auto-discovery, bulk import tools |
| Security breach via SQL injection | Low | Critical | Parameterized queries, validation layer |

### Operational Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|---------|------------|
| User adoption resistance | Medium | High | Training, clear value demonstration |
| Cost overruns from API usage | Low | Medium | Usage monitoring, cost alerts |
| Incorrect medical interpretations | Medium | High | Disclaimer, human review requirement |
| Compliance violations | Low | Critical | Audit logging, access controls |

### Contingency Plans

1. **If Bedrock fails**: Implement fallback to manual query writing
2. **If costs exceed budget**: Implement usage quotas, caching
3. **If adoption is low**: Simplified interface, more training
4. **If security concerns arise**: Disable practice access, audit review

---

## Appendices

### A. Sample Prompts for Common Queries

```typescript
const QUERY_EXAMPLES = [
  {
    natural: "How many new patients did we see last month?",
    sql: `SELECT COUNT(DISTINCT patient_id) 
          FROM ih.patients 
          WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
          AND created_at < DATE_TRUNC('month', CURRENT_DATE)`
  },
  {
    natural: "What's our average claim payment time?",
    sql: `SELECT AVG(payment_date - claim_date) as avg_days
          FROM ih.claims 
          WHERE payment_date IS NOT NULL`
  },
  {
    natural: "Show me the top 10 diagnosis codes by frequency",
    sql: `SELECT diagnosis_code, description, COUNT(*) as frequency
          FROM ih.diagnoses d
          JOIN ih.diagnosis_codes dc ON d.diagnosis_code = dc.code
          GROUP BY diagnosis_code, description
          ORDER BY frequency DESC
          LIMIT 10`
  }
];
```

### B. Metadata CSV Import Format

```csv
table_name,display_name,description,row_meaning,tier,tags
patients,Patients,Core patient demographics,One row per unique patient,1,"clinical,demographic"
encounters,Patient Encounters,All patient visits and encounters,One row per patient visit,1,"clinical,operational"
diagnoses,Diagnoses,Diagnosis codes for encounters,Multiple rows per encounter,1,"clinical,billing"
claims,Insurance Claims,Submitted insurance claims,One row per claim,1,"financial,billing"
providers,Healthcare Providers,Provider registry,One row per provider,2,"operational,demographic"
```

### C. Initial Table Metadata Priorities

Priority tables for Phase 1 metadata creation:

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

### D. Development Environment Setup

```bash
# Environment variables
AWS_REGION=us-east-1
BEDROCK_ACCESS_KEY_ID=your_bedrock_key
BEDROCK_SECRET_ACCESS_KEY=your_bedrock_secret
AWS_BEDROCK_REGION=us-east-1
BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0
DATABASE_URL=postgresql://user:pass@localhost/bendcare
NEXT_PUBLIC_API_URL=http://localhost:3000/api

# Local development commands
npm install @aws-sdk/client-bedrock-runtime
npm install @aws-sdk/client-bedrock
npm install pg @types/pg
npm install prismjs # For SQL syntax highlighting

# Database setup (creates tables in public schema)
psql -d bendcare -f schema/explorer_tables.sql
psql -d bendcare -f schema/sample_metadata.sql
```

### E. Testing Strategy

#### Unit Tests
- Prompt generation with various metadata configurations
- SQL validation logic
- Security filter injection
- Metadata CRUD operations

#### Integration Tests  
- End-to-end query generation and execution
- Bedrock API integration
- Database connection handling
- Authentication/authorization flow

#### User Acceptance Tests
- Generate SQL for 20 common analyst queries
- Verify organization data isolation
- Test query modification workflow
- Validate export functionality

---

## Document Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-10-27 | Patrick | Initial design document |

## Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Technical Lead | Patrick | | |
| Product Owner | | | |
| Security Officer | | | |

---

*End of Document*