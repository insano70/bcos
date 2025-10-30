# Schema-Level Instructions - Design Document

**Feature**: Global query instructions that apply across all tables  
**Use Case**: "Always use procedure_code to filter by drug/medication"  
**Status**: New feature (not in original Phase 1/2 design)

---

## Problem Statement

Users need to provide **schema-level or domain-specific query rules** that the AI should follow, such as:

- "Always use procedure_code to filter by drug or medication"
- "Revenue queries should use measure='revenue' and frequency='Monthly'"
- "Date ranges should use date_index, not individual date fields"
- "Patient counts require DISTINCT patient_uid to avoid duplicates"

These are **cross-table rules** that don't belong in individual table metadata.

---

## Proposed Solution

### 1. New Database Table

```sql
CREATE TABLE explorer_schema_instructions (
  instruction_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_name text NOT NULL DEFAULT 'ih',
  category text,  -- 'filtering', 'aggregation', 'joining', 'business_rule'
  title text NOT NULL,  -- "Drug Filtering Rule"
  instruction text NOT NULL,  -- "When filtering by drug or medication, always use procedure_code column"
  priority integer DEFAULT 2,  -- 1=critical, 2=important, 3=helpful
  applies_to_tables text[],  -- Specific tables or NULL for all
  example_query text,  -- "Show me all patients on Drug X"
  example_sql text,  -- "SELECT ... WHERE procedure_code = 'X'"
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  created_by text,
  updated_by text
);

CREATE INDEX idx_schema_instructions_schema ON explorer_schema_instructions(schema_name, is_active);
CREATE INDEX idx_schema_instructions_priority ON explorer_schema_instructions(priority, is_active);
```

### 2. Service Methods

Add to `ExplorerMetadataService`:

```typescript
async getSchemaInstructions(
  schemaName: string = 'ih'
): Promise<SchemaInstruction[]> {
  // Fetch active instructions ordered by priority
}

async createSchemaInstruction(
  data: CreateSchemaInstructionData
): Promise<SchemaInstruction> {
  // Super admin only
}

async updateSchemaInstruction(
  id: string,
  data: UpdateSchemaInstructionData
): Promise<SchemaInstruction> {
  // Super admin only
}

async deleteSchemaInstruction(id: string): Promise<void> {
  // Super admin only
}
```

### 3. BedrockService Integration

Update `buildPrompt` to include instructions:

```typescript
private async buildPrompt(...) {
  // Get schema instructions
  const instructions = await metadataService.getSchemaInstructions('ih');
  
  const instructionSection = instructions.length > 0
    ? `\nSCHEMA-SPECIFIC RULES (MUST FOLLOW):
${instructions
  .sort((a, b) => a.priority - b.priority)
  .map(i => `${i.priority === 1 ? '⚠️ CRITICAL' : i.priority === 2 ? '📌 IMPORTANT' : '💡'}: ${i.instruction}`)
  .join('\n')}`
    : '';

  return `You are an expert PostgreSQL SQL generator...
  
DATABASE CONTEXT:
...

${instructionSection}

AVAILABLE TABLES WITH COLUMNS:
...
`;
}
```

### 4. API Endpoints

```typescript
// GET /api/data/explorer/schema-instructions
// POST /api/data/explorer/schema-instructions
// PUT /api/data/explorer/schema-instructions/[id]
// DELETE /api/data/explorer/schema-instructions/[id]
```

### 5. UI Component

Settings page or dedicated instructions manager:
- List all instructions
- Add/edit/delete with modal
- Preview how instruction affects prompts
- Categorize by type

---

## Implementation Todos (15 items)

### Database (2 todos)
1. Create migration for explorer_schema_instructions table
2. Seed initial instructions (drug filtering, revenue queries, etc.)

### Service Layer (4 todos)
3. Add getSchemaInstructions to ExplorerMetadataService
4. Add createSchemaInstruction to ExplorerMetadataService
5. Add updateSchemaInstruction to ExplorerMetadataService
6. Add deleteSchemaInstruction to ExplorerMetadataService

### Integration (1 todo)
7. Update BedrockService.buildPrompt to fetch and include instructions

### API Layer (4 todos)
8. Create GET /api/data/explorer/schema-instructions route
9. Create POST /api/data/explorer/schema-instructions route
10. Create PUT /api/data/explorer/schema-instructions/[id] route
11. Create DELETE /api/data/explorer/schema-instructions/[id] route

### UI (3 todos)
12. Create SchemaInstructionsModal for managing instructions
13. Add "Schema Instructions" button to metadata page or settings
14. Display instruction count in UI

### Testing (1 todo)
15. Write integration tests for schema instructions CRUD

---

## Effort Estimate

**Total**: 6-8 hours

| Component | Hours |
|-----------|-------|
| Database schema + migration | 1h |
| Service methods (4 CRUD) | 2h |
| BedrockService integration | 1h |
| API endpoints (4 routes) | 2h |
| UI modal + integration | 2h |
| Testing | 1h |

---

## Priority

**HIGH** - This directly addresses SQL quality issues you're experiencing.

### Immediate Value

With schema instructions, you can add:
```
"When filtering by drug or medication, use procedure_code column"
"Revenue queries should filter by measure='revenue'"  
"Patient counts must use DISTINCT patient_uid"
```

And the AI will **automatically follow these rules** in all generated SQL.

---

## Standards Compliance Review

### Current Services vs STANDARDS.md

**✅ COMPLIANT**:
- All services < 500 lines (largest: 332 lines)
- All use BaseRBACService
- All have factory functions
- Proper import order
- No refactoring needed

**⚠️ Minor Issues**:
- BedrockService uses manual logging (should use logTemplates where applicable)
- Some APIs missing detailed logging context
- Import order could be more consistent

### Recommended Todos (Standards Compliance)

16. Add logTemplates to BedrockService for CRUD-like operations
17. Standardize import order across all services (per STANDARDS.md)
18. Add operation logging to all API handlers
19. Add calculateChanges to metadata update operations

---

## Complete Implementation Plan

**New Feature: Schema Instructions** (15 todos)  
**Standards Compliance** (4 todos)  
**Total**: 19 todos, 8-10 hours

Would you like me to implement:
1. Schema Instructions feature (addresses your immediate need)
2. Standards compliance improvements (code quality)
3. Both

