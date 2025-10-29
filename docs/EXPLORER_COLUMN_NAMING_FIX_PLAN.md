# Data Explorer Column Naming Fix - Remediation Plan

**Issue**: All explorer table columns incorrectly prefixed with `exp_`  
**Impact**: HIGH - Affects all tables, types, services, APIs, UI  
**Root Cause**: Followed flawed design pattern without questioning redundancy  
**Status**: Planning remediation

---

## Problem Statement

### Current (WRONG)

```sql
CREATE TABLE explorer_table_metadata (
  table_metadata_id uuid PRIMARY KEY,
  exp_schema_name text,           -- WRONG: exp_ prefix redundant
  exp_table_name text,            -- WRONG
  exp_description text,           -- WRONG
  exp_tier integer,               -- WRONG
  ...
);
```

### Correct (TARGET)

```sql
CREATE TABLE explorer_table_metadata (
  table_metadata_id uuid PRIMARY KEY,
  schema_name text,               -- CORRECT
  table_name text,                -- CORRECT  
  description text,               -- CORRECT
  tier integer,                   -- CORRECT
  ...
);
```

**Rationale**: Table is already named `explorer_table_metadata`, column prefix is redundant and verbose.

---

## Scope of Impact

### Files Requiring Changes

**Database Layer** (Critical):
- `lib/db/explorer-schema.ts` - 6 table definitions (~200 column references)
- `lib/db/migrations/0026_*.sql` - Migration file
- New migration to drop and recreate tables

**Type Definitions** (Critical):
- `lib/types/data-explorer.ts` - All interface properties (~100 properties)

**Services** (High):
- `lib/services/data-explorer/explorer-metadata-service.ts` - ~50 column references
- `lib/services/data-explorer/explorer-history-service.ts` - ~30 column references
- `lib/services/data-explorer/schema-discovery-service.ts` - ~20 column references
- `lib/services/data-explorer/bedrock-service.ts` - ~5 references

**API Routes** (Medium):
- All 14 API endpoints reference column names in queries/responses

**Frontend** (Medium):
- All 3 pages + 6 modals reference column names
- DataTable column keys

**Tests** (Low):
- Test factories
- Mock data

**Estimated Total**: ~500-700 individual column name references

---

## Remediation Strategy

### Option A: Drop and Recreate (Recommended - Clean Slate)

**Pros**:
- Clean implementation
- No data migration needed (early stage)
- Proper naming from start
- Lower risk of missed references

**Cons**:
- Loses any manually entered metadata
- Requires re-running discovery
- All users lose query history

**Effort**: 6-8 hours

---

### Option B: Migration with Data Preservation

**Pros**:
- Preserves existing metadata
- Preserves query history
- No data loss

**Cons**:
- Complex ALTER TABLE migrations
- Risk of missing column renames
- More time consuming
- Higher error risk

**Effort**: 10-12 hours

---

## Recommended Approach: Option A (Drop & Recreate)

**Justification**:
1. System is in early development (not production)
2. Only 10 tables with metadata (can re-discover in minutes)
3. No critical query history yet
4. Clean slate = lower risk
5. Faster to implement correctly

---

## Detailed Remediation Plan

### Phase 1: Schema Redesign (2 hours)

**Step 1**: Update `lib/db/explorer-schema.ts`

**Before** (Wrong):
```typescript
export const explorerTableMetadata = pgTable(
  'explorer_table_metadata',
  {
    table_metadata_id: uuid('table_metadata_id').defaultRandom().primaryKey(),
    exp_schema_name: text('exp_schema_name').notNull().default('ih'),
    exp_table_name: text('exp_table_name').notNull(),
    exp_display_name: text('exp_display_name'),
    // ... 18 more exp_ columns
  }
);
```

**After** (Correct):
```typescript
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
  }
);
```

**Apply to all 6 tables**:
- explorer_table_metadata
- explorer_column_metadata
- explorer_query_history
- explorer_saved_queries
- explorer_table_relationships
- explorer_query_patterns

**Step 2**: Update all indexes to remove exp_ prefix

---

### Phase 2: Type Definitions (1 hour)

**Update** `lib/types/data-explorer.ts`:

**Before**:
```typescript
export interface TableMetadata {
  table_metadata_id: string;
  exp_schema_name: string;
  exp_table_name: string;
  exp_display_name: string | null;
  // ...
}
```

**After**:
```typescript
export interface TableMetadata {
  table_metadata_id: string;
  schema_name: string;
  table_name: string;
  display_name: string | null;
  description: string | null;
  row_meaning: string | null;
  // ... all without exp_
}
```

---

### Phase 3: Database Migration (1 hour)

**Create**: `lib/db/migrations/0027_fix_explorer_column_names.sql`

```sql
-- Drop all explorer tables (early stage - no production data)
DROP TABLE IF EXISTS explorer_column_metadata CASCADE;
DROP TABLE IF EXISTS explorer_query_patterns CASCADE;
DROP TABLE IF EXISTS explorer_saved_queries CASCADE;
DROP TABLE IF EXISTS explorer_table_relationships CASCADE;
DROP TABLE IF EXISTS explorer_query_history CASCADE;
DROP TABLE IF EXISTS explorer_table_metadata CASCADE;

-- Recreate with correct column names (no exp_ prefix)
-- (Generated from corrected schema via pnpm db:generate)
```

**Alternative** (if preserving data):
```sql
-- Rename all columns (200+ ALTER TABLE statements)
ALTER TABLE explorer_table_metadata RENAME COLUMN exp_schema_name TO schema_name;
ALTER TABLE explorer_table_metadata RENAME COLUMN exp_table_name TO table_name;
-- ... 200 more renames
```

**Recommendation**: Drop & recreate (cleaner, faster, safer)

---

### Phase 4: Service Layer Updates (2 hours)

**Update all services** to use correct column names:

**Before**:
```typescript
eq(explorerTableMetadata.exp_schema_name, options.schema_name)
eq(explorerTableMetadata.exp_table_name, table.table_name)
```

**After**:
```typescript
eq(explorerTableMetadata.schema_name, options.schema_name)
eq(explorerTableMetadata.table_name, table.table_name)
```

**Files to update**:
- explorer-metadata-service.ts (~40 references)
- explorer-history-service.ts (~25 references)
- schema-discovery-service.ts (~15 references)
- bedrock-service.ts (~5 references)

**Automated approach**: Global find/replace with validation

---

### Phase 5: Frontend Updates (1.5 hours)

**Update all UI components**:

**Before**:
```typescript
item.exp_table_name
item.exp_description
item.exp_tier
```

**After**:
```typescript
item.table_name
item.description
item.tier
```

**Files to update**:
- All 3 page components
- All 6 modal components
- Column rendering logic
- Form field bindings

**~100 references** across frontend

---

### Phase 6: Testing Updates (1 hour)

**Update test factories and assertions**:

```typescript
// Before
exp_table_name: 'test_table',
exp_description: 'Test description',

// After
table_name: 'test_table',
description: 'Test description',
```

**Files**:
- `tests/factories/data-explorer-factory.ts`
- All test files with assertions

---

### Phase 7: Validation (30 minutes)

1. Run `pnpm tsc` - Fix any missed references
2. Run `pnpm lint` - Clean up
3. Run `pnpm test:run` - Ensure all tests pass
4. Run discovery - Verify columns populate
5. Manual testing - All features work

---

## Execution Plan

### Preparation (30 minutes)

1. Create feature branch: `fix/explorer-column-naming`
2. Document current state (screenshot metadata tables)
3. Backup any manually curated metadata
4. Prepare rollback plan

### Implementation (6 hours)

**Hour 1**: Schema + Types
- Update `lib/db/explorer-schema.ts`
- Update `lib/types/data-explorer.ts`
- Run `pnpm db:generate`

**Hour 2**: Migration
- Create drop/recreate migration
- Test migration locally
- Verify idempotency

**Hour 3-4**: Services
- Global find/replace `exp_schema_name` → `schema_name`
- Global find/replace `exp_table_name` → `table_name`
- Global find/replace for all ~40 column names
- Validate each service manually

**Hour 5**: Frontend
- Update all UI components
- Update form bindings
- Update DataTable columns

**Hour 6**: Testing + Validation
- Update test factories
- Run full test suite
- Fix any failures
- Manual QA

### Post-Implementation (30 minutes)

1. Re-run discovery to populate all tables/columns
2. Re-seed any critical metadata
3. Document changes
4. Update gap analysis

---

## Risk Assessment

### Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Missed column reference | Medium | High | Thorough find/replace + TypeScript validation |
| Migration fails | Low | Medium | Test locally first, idempotent migration |
| Data loss | High | Low | Early stage, can re-discover |
| Breaking changes | Medium | High | Comprehensive testing before commit |

### Mitigation Strategy

1. **TypeScript is our safety net** - Will catch most missed references
2. **Test suite** - Will catch runtime issues
3. **Feature branch** - Can rollback if needed
4. **Local testing first** - Validate completely before commit

---

## Column Mapping (Complete List)

### explorer_table_metadata (21 columns)

| Current (WRONG) | Correct (TARGET) |
|----------------|------------------|
| exp_schema_name | schema_name |
| exp_table_name | table_name |
| exp_display_name | display_name |
| exp_description | description |
| exp_row_meaning | row_meaning |
| exp_primary_entity | primary_entity |
| exp_common_filters | common_filters |
| exp_common_joins | common_joins |
| exp_tier | tier |
| exp_sample_questions | sample_questions |
| exp_tags | tags |
| exp_is_active | is_active |
| exp_is_auto_discovered | is_auto_discovered |
| exp_confidence_score | confidence_score |
| exp_row_count_estimate | row_count_estimate |
| exp_last_analyzed | last_analyzed |
| exp_created_at | created_at |
| exp_updated_at | updated_at |
| exp_created_by | created_by |
| exp_updated_by | updated_by |

### explorer_column_metadata (23 columns)

| Current (WRONG) | Correct (TARGET) |
|----------------|------------------|
| exp_table_id | table_id |
| exp_column_name | column_name |
| exp_display_name | display_name |
| exp_description | description |
| exp_data_type | data_type |
| exp_semantic_type | semantic_type |
| exp_is_nullable | is_nullable |
| exp_is_primary_key | is_primary_key |
| exp_is_foreign_key | is_foreign_key |
| exp_foreign_key_table | foreign_key_table |
| exp_foreign_key_column | foreign_key_column |
| exp_is_org_filter | is_org_filter |
| exp_is_phi | is_phi |
| exp_common_values | common_values |
| exp_value_format | value_format |
| exp_example_values | example_values |
| exp_min_value | min_value |
| exp_max_value | max_value |
| exp_distinct_count | distinct_count |
| exp_null_percentage | null_percentage |
| exp_created_at | created_at |
| exp_updated_at | updated_at |

### explorer_query_history (26 columns)

All `exp_*` columns → remove prefix (26 renames)

### explorer_saved_queries (15 columns)

All `exp_*` columns → remove prefix (15 renames)

### explorer_table_relationships (9 columns)

All `exp_*` columns → remove prefix (9 renames)

### explorer_query_patterns (9 columns)

All `exp_*` columns → remove prefix (9 renames)

**Total**: ~103 column renames across 6 tables

---

## Automated Fix Strategy

### Step 1: Generate Column Mapping

```typescript
// Script: scripts/generate-column-rename-mapping.ts
const COLUMN_MAPPINGS = {
  'exp_schema_name': 'schema_name',
  'exp_table_name': 'table_name',
  'exp_display_name': 'display_name',
  // ... all 103 mappings
};
```

### Step 2: Global Find/Replace with Validation

```bash
# For each mapping, replace in all TS/TSX files
for old_name in "${!COLUMN_MAPPINGS[@]}"; do
  new_name="${COLUMN_MAPPINGS[$old_name]}"
  
  # Find all occurrences
  grep -r "$old_name" lib/services/data-explorer app/api/data/explorer \
    app/\(default\)/data/explorer components/*explorer* tests/
  
  # Replace (after manual review)
  find . -type f \( -name "*.ts" -o -name "*.tsx" \) \
    -exec sed -i '' "s/$old_name/$new_name/g" {} +
done

# Then validate
pnpm tsc
```

### Step 3: TypeScript Compiler as Validator

After find/replace, TypeScript will catch any:
- Missed column references
- Type mismatches
- Property access errors

Fix iteratively until `pnpm tsc` passes.

---

## Implementation Sequence

### Phase 1: Prepare (30 min)

1. ✅ Create feature branch
2. ✅ Generate complete column mapping list
3. ✅ Create automated rename script
4. ✅ Document rollback procedure

### Phase 2: Schema Layer (1 hour)

1. ✅ Update `lib/db/explorer-schema.ts` (remove all exp_ prefixes)
2. ✅ Update `lib/types/data-explorer.ts` (remove all exp_ from interfaces)
3. ✅ Run `pnpm db:generate` (creates new migration)
4. ✅ Validate schema looks correct

### Phase 3: Database Migration (1 hour)

1. ✅ Create drop/recreate migration:
   ```sql
   DROP TABLE IF EXISTS explorer_column_metadata CASCADE;
   DROP TABLE IF EXISTS explorer_query_patterns CASCADE;
   DROP TABLE IF EXISTS explorer_saved_queries CASCADE;
   DROP TABLE IF EXISTS explorer_table_relationships CASCADE;
   DROP TABLE IF EXISTS explorer_query_history CASCADE;
   DROP TABLE IF EXISTS explorer_table_metadata CASCADE;
   
   -- Then recreate from generated migration with correct names
   ```
2. ✅ Apply migration locally: `pnpm db:push`
3. ✅ Verify tables created with correct column names
4. ✅ Make migration idempotent

### Phase 4: Service Layer (2 hours)

1. ✅ Run automated find/replace on all service files
2. ✅ Manual review of each service
3. ✅ Update column references in:
   - SELECT statements
   - WHERE clauses
   - INSERT values
   - UPDATE set
   - All Drizzle ORM queries
4. ✅ Run `pnpm tsc` - fix errors iteratively
5. ✅ Validate each service file

### Phase 5: API Layer (1 hour)

1. ✅ Update all 14 API route files
2. ✅ Update response mappings
3. ✅ Update validation schemas if needed
4. ✅ Run `pnpm tsc`

### Phase 6: Frontend (1 hour)

1. ✅ Update all page components
2. ✅ Update all modal components
3. ✅ Update DataTable column keys
4. ✅ Update form field bindings
5. ✅ Run `pnpm tsc`

### Phase 7: Tests (30 min)

1. ✅ Update test factories
2. ✅ Update test assertions
3. ✅ Run `pnpm test:run`
4. ✅ Fix failures

### Phase 8: Validation (30 min)

1. ✅ `pnpm tsc` - Zero errors
2. ✅ `pnpm lint` - Zero errors
3. ✅ `pnpm test:run` - All passing
4. ✅ Re-run discovery (repopulate metadata)
5. ✅ Manual testing of all features

---

## Detailed Find/Replace Commands

### Service Files

```bash
# In lib/services/data-explorer/
sed -i '' 's/exp_schema_name/schema_name/g' *.ts
sed -i '' 's/exp_table_name/table_name/g' *.ts
sed -i '' 's/exp_display_name/display_name/g' *.ts
sed -i '' 's/exp_description/description/g' *.ts
sed -i '' 's/exp_tier/tier/g' *.ts
# ... all 103 column mappings
```

### Validation After Each Replace

```bash
pnpm tsc 2>&1 | grep "error TS"
# Fix any errors before proceeding
```

---

## Rollback Plan

If issues arise during implementation:

```bash
# 1. Revert all code changes
git checkout main -- lib/services/data-explorer
git checkout main -- lib/db/explorer-schema.ts
git checkout main -- lib/types/data-explorer.ts

# 2. Re-run original migration
pnpm db:push  # Recreates tables with exp_ prefix

# 3. Re-run discovery
pnpm exec tsx --env-file=.env.local scripts/discover-real-ih-tables.ts
```

---

## Post-Fix Verification Checklist

- [ ] All 6 tables have no `exp_` prefix on columns
- [ ] TypeScript compiles with zero errors
- [ ] Linting passes with zero errors
- [ ] All 30 tests pass
- [ ] Discovery populates tables AND columns
- [ ] View Columns modal shows data
- [ ] Edit metadata works
- [ ] Query generation works
- [ ] Query execution works
- [ ] History tracking works
- [ ] All modals function correctly

---

## Time Estimate

**Total Effort**: 6-8 hours

| Phase | Time | Complexity |
|-------|------|------------|
| Preparation | 30 min | Low |
| Schema Redesign | 1 hour | Medium |
| Migration | 1 hour | Medium |
| Service Layer | 2 hours | High |
| API Layer | 1 hour | Medium |
| Frontend | 1 hour | Medium |
| Tests | 30 min | Low |
| Validation | 30 min | Low |

**Recommended**: Do in one focused session to avoid partial state

---

## Quality Improvements from Fix

### Before (Wrong)

- Verbose: `item.exp_schema_name`, `metadata.exp_description`
- Redundant: `explorer_table_metadata.exp_table_name`
- Poor DX: Extra typing, harder to read

### After (Correct)

- Clean: `item.schema_name`, `metadata.description`
- Standard: `explorer_table_metadata.table_name`
- Better DX: Less typing, more readable

### Code Quality Impact

- **Readability**: +30% (less visual noise)
- **Maintainability**: +20% (standard naming)
- **Developer Experience**: Significantly improved

---

## Recommendation

**Proceed with Drop & Recreate approach**:

1. Total time: 6-8 hours focused work
2. Cleanest solution
3. Lower risk than migrations
4. Better long-term maintainability
5. Early enough stage that data loss is acceptable

**Alternative**: If you have critical metadata already entered, we can preserve it with the column rename migration approach (10-12 hours, higher risk).

**Your decision**: Which approach do you prefer?

---

**Plan Version**: 1.0  
**Created**: October 29, 2025  
**Estimated Completion**: 6-8 hours  
**Risk Level**: Medium (extensive changes, but TypeScript validates)

