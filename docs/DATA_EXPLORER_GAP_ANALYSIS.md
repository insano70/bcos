# Data Explorer - Gap Analysis

**Date**: October 29, 2025  
**Analysis**: Design Document v5 vs Actual Implementation  
**Purpose**: Identify missing functionality, TODOs, and incomplete features

---

## Executive Summary

### Current Implementation Status: 70% Complete

**Phase 1 (MVP)**: 85% Complete  
**Phase 2 (Enhanced)**: 0% Complete (Not started - as planned)  
**Phase 3 (Production Optimization)**: 0% Complete (Not started - as planned)  
**Phase 4 (Organization Access)**: 0% Complete (Not started - as planned)

### Critical Gaps in Phase 1 MVP: 6 Items

1. ❌ Column detail view/edit functionality
2. ❌ Query rating system (history/[id]/rate endpoint)
3. ❌ Results modal for viewing past query results
4. ❌ SQL view modal (currently uses alert)
5. ❌ Metadata discovery endpoint integration
6. ❌ POST endpoint for creating new table metadata

---

## Detailed Gap Analysis

### 1. API Endpoints

#### ✅ Implemented (7 endpoints)

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/data/explorer/generate-sql` | POST | ✅ Complete | Working |
| `/api/data/explorer/execute-query` | POST | ✅ Complete | Working |
| `/api/data/explorer/metadata/tables` | GET | ✅ Complete | Pagination working |
| `/api/data/explorer/metadata/tables/[id]` | GET | ✅ Complete | Working |
| `/api/data/explorer/metadata/tables/[id]` | PUT | ✅ Complete | Working |
| `/api/data/explorer/metadata/tables/[id]/columns` | GET | ✅ Complete | Working |
| `/api/data/explorer/health` | GET | ✅ Complete | Public endpoint |
| `/api/data/explorer/history/list` | GET | ✅ Complete | Working |

#### ❌ Missing from Design (Phase 1 MVP)

| Endpoint | Method | Priority | Complexity | Notes |
|----------|--------|----------|------------|-------|
| `/api/data/explorer/metadata/tables` | POST | LOW | Low | Create table metadata (currently via script) |
| `/api/data/explorer/metadata/tables/[id]` | DELETE | LOW | Low | Delete table metadata |
| `/api/data/explorer/metadata/discover` | POST | MEDIUM | Medium | Schema auto-discovery |
| `/api/data/explorer/history/[id]` | GET | MEDIUM | Low | Single query details |
| `/api/data/explorer/history/[id]/rate` | POST | LOW | Low | Rate query quality (1-5 stars) |

#### ❌ Missing from Design (Phase 2/3 - Templates)

| Endpoint | Method | Priority | Complexity | Notes |
|----------|--------|----------|------------|-------|
| `/api/data/explorer/templates` | GET | Phase 3 | Low | List saved queries |
| `/api/data/explorer/templates` | POST | Phase 3 | Low | Create template |
| `/api/data/explorer/templates/[id]` | GET | Phase 3 | Low | Get template |
| `/api/data/explorer/templates/[id]` | PUT | Phase 3 | Low | Update template |
| `/api/data/explorer/templates/[id]` | DELETE | Phase 3 | Low | Delete template |
| `/api/data/explorer/templates/[id]/execute` | POST | Phase 3 | Medium | Execute with variables |

---

### 2. Services

#### ✅ Implemented (5 services)

| Service | Status | Notes |
|---------|--------|-------|
| `BedrockService` | ✅ Complete | SQL generation working |
| `QueryExecutorService` | ✅ Complete | Execution with security |
| `ExplorerMetadataService` | ✅ Complete | CRUD operations |
| `QuerySecurityService` | ✅ Complete | Practice UID filtering |
| `ExplorerHistoryService` | ✅ Complete | Basic history tracking |

#### ❌ Missing from Design

| Service | Priority | Phase | Complexity | Notes |
|---------|----------|-------|------------|-------|
| `SchemaDiscoveryService` | MEDIUM | Phase 2 | Medium | Auto-discover tables/columns from information_schema |
| `ExplorerTemplateService` | LOW | Phase 3 | Low | CRUD for saved queries/templates |
| `ExplorerPatternService` | LOW | Phase 2 | Medium | Learn from query patterns |

---

### 3. Frontend Pages & Components

#### ✅ Implemented (3 pages)

| Page | Route | Status | Notes |
|------|-------|--------|-------|
| Query Interface | `/data/explorer` | ✅ Complete | Generate & execute working |
| Metadata Management | `/data/explorer/metadata` | ⚠️ Partial | Edit modal working, view columns missing |
| Query History | `/data/explorer/history` | ⚠️ Partial | View SQL uses alert, results viewing missing |

#### ❌ Missing from Design

| Page | Route | Priority | Phase | Notes |
|------|-------|----------|-------|-------|
| Templates Library | `/data/explorer/templates` | LOW | Phase 3 | Browse/create/use templates |
| Settings | `/data/explorer/settings` | LOW | Phase 3 | User preferences, defaults |
| Metadata Discovery | `/data/explorer/metadata/discovery` | MEDIUM | Phase 2 | UI for schema discovery |

---

### 4. UI Components & Modals

#### ✅ Implemented

| Component | Status | Notes |
|-----------|--------|-------|
| `EditTableMetadataModal` | ✅ Complete | Just fixed - HeadlessUI Dialog |
| Query input form | ✅ Complete | Textarea with generate button |
| Results table | ✅ Complete | Shows first 100 rows |
| Error display | ✅ Complete | React Query error states |

#### ❌ Missing / Incomplete

| Component | Priority | Complexity | Notes |
|-----------|----------|------------|-------|
| **Column Detail View** | HIGH | Low | Click "View Columns" → Show column metadata table |
| **View SQL Modal** | HIGH | Low | Replace alert() with proper modal |
| **View Results Modal** | MEDIUM | Medium | Show past query results from history |
| **Create Table Metadata Modal** | LOW | Low | Add new table manually |
| **Query Rating Widget** | LOW | Low | 1-5 star rating in history |
| **Template Create Modal** | LOW | Phase 3 | Create/save query template |
| **Template Execute Modal** | LOW | Phase 3 | Fill in template variables |

---

### 5. Specific TODOs Found in Code

#### High Priority (Breaks UX)

**File**: `app/(default)/data/explorer/metadata/metadata-content.tsx`  
**Line**: 45-46  
**Issue**: 
```typescript
onClick: (item) => {
  // TODO: Navigate to columns detail page
  alert(`Column details for ${item.exp_table_name} - Coming in Phase 2`);
}
```
**Priority**: **HIGH**  
**Fix Required**: Create column detail page or modal showing all columns for the table  
**Complexity**: Low (simple DataTable with column metadata)

---

**File**: `app/(default)/data/explorer/history/history-content.tsx`  
**Line**: 37  
**Issue**: 
```typescript
onClick: () => {
  alert(`Generated SQL:\n\n${row.exp_generated_sql}`);
}
```
**Priority**: **HIGH**  
**Fix Required**: Replace with proper modal component  
**Complexity**: Low (Dialog with syntax-highlighted SQL)

---

**File**: `app/(default)/data/explorer/history/history-content.tsx`  
**Line**: 44-47  
**Issue**: 
```typescript
label: 'View Results',
onClick: () => {
  // TODO: Show results modal
},
```
**Priority**: **MEDIUM**  
**Fix Required**: Create modal to display cached result_sample from history  
**Complexity**: Medium (need to fetch and display tabular data)

---

### 6. Missing Core Functionality (Phase 1 Scope)

#### Database Schema Discovery

**Design Doc Reference**: Lines 2740-2767  
**Status**: ❌ Not Implemented  
**Priority**: MEDIUM  
**What's Missing**:
- SchemaDiscoveryService
- POST /api/data/explorer/metadata/discover endpoint
- UI button to trigger discovery
- Progress/results modal

**Current Workaround**: Manual script `scripts/discover-real-ih-tables.ts`  
**Impact**: Admins must run script manually to populate metadata

---

#### Column Metadata Management

**Design Doc Reference**: Lines 260-294 (explorer_column_metadata table)  
**Status**: ⚠️ Partial  
**Priority**: HIGH  
**What's Implemented**:
- ✅ Database table exists
- ✅ GET endpoint exists
- ✅ Service method exists

**What's Missing**:
- ❌ UI to view columns for a table
- ❌ UI to edit column metadata
- ❌ Endpoint to update column metadata (PUT)

**Impact**: Users can't see what columns are in each table  
**Fix Complexity**: Low

---

#### Query Rating System

**Design Doc Reference**: Lines 1354-1357  
**Status**: ❌ Not Implemented  
**Priority**: LOW  
**What's Missing**:
- POST /api/data/explorer/history/[id]/rate endpoint
- UI rating widget (1-5 stars)
- exp_user_rating column tracking (exists in DB)

**Impact**: Can't collect feedback on query quality  
**Fix Complexity**: Low

---

#### Saved Query Details

**Design Doc Reference**: Lines 1354  
**Status**: ❌ Not Implemented  
**Priority**: MEDIUM  
**What's Missing**:
- GET /api/data/explorer/history/[id] endpoint
- Service method to get single query
- UI to view full query details

**Impact**: Can only view SQL via alert, can't see execution plan, full results  
**Fix Complexity**: Low

---

### 7. Phase 2/3 Features (Intentionally Not Implemented)

**These are out of scope for Phase 1 MVP** but listed in design:

#### Phase 2: Enhanced Metadata & Discovery
- ❌ Schema Discovery Service
- ❌ Pattern Learning Service  
- ❌ Relationship Detection
- ❌ Auto-discovery UI

#### Phase 3: Production Optimization
- ❌ Template Library (full CRUD)
- ❌ Template Variables & Execution
- ❌ Query Feedback System
- ❌ Advanced Caching

#### Phase 4: Organization Access
- ❌ Simplified User Interface
- ❌ Usage Quotas
- ❌ Organization Admin Dashboard

---

## Gap Categories

### Category A: Critical for MVP (Must Fix)

| Item | Priority | Effort | Status |
|------|----------|--------|--------|
| Column detail view | HIGH | 2 hours | ❌ Not started |
| View SQL modal (replace alert) | HIGH | 1 hour | ❌ Not started |
| View results modal | MEDIUM | 2 hours | ❌ Not started |

**Total Effort**: 5 hours  
**Blocks MVP**: Yes (poor UX without these)

### Category B: Important for Phase 1 (Should Add)

| Item | Priority | Effort | Status |
|------|----------|--------|--------|
| Metadata discovery endpoint | MEDIUM | 3 hours | ❌ Not started |
| Discovery UI button | MEDIUM | 1 hour | ❌ Not started |
| Query detail endpoint | MEDIUM | 1 hour | ❌ Not started |
| Create table metadata endpoint | LOW | 1 hour | ❌ Not started |
| Query rating endpoint | LOW | 1 hour | ❌ Not started |
| Query rating UI widget | LOW | 2 hours | ❌ Not started |

**Total Effort**: 9 hours  
**Blocks MVP**: No (nice-to-have improvements)

### Category C: Phase 2/3 Features (Future)

**Template System** (Phase 3): 16 hours  
**Schema Discovery** (Phase 2): 12 hours  
**Pattern Learning** (Phase 2): 16 hours  
**Settings Page** (Phase 3): 4 hours  

**Total Effort**: 48 hours  
**Blocks MVP**: No (future enhancements)

---

## Recommendations

### Option 1: Ship MVP As-Is (Quick Win)

**Timeline**: Ready now  
**Effort**: 0 hours  
**Pros**: 
- Core functionality works (generate SQL, execute, view history, edit metadata)
- Users can start using immediately
- Iterate based on feedback

**Cons**:
- Alerts instead of modals (poor UX)
- No column details (users must guess column names)
- Manual metadata population

**Recommendation**: ⚠️ Not ideal - UX issues will frustrate users

---

### Option 2: Fix Critical UX Issues (Recommended)

**Timeline**: +5 hours  
**Effort**: 5 hours focused work  

**Must-Fix Items**:
1. ✅ Column detail view/modal (2 hours)
2. ✅ View SQL modal (1 hour)  
3. ✅ View results modal (2 hours)

**After fixes**:
- ✅ Professional UX
- ✅ No alert() dialogs
- ✅ Users can explore table structures
- ✅ Can review past query results

**Recommendation**: ✅ **DO THIS** - Small effort, big UX improvement

---

### Option 3: Complete Phase 1 Fully (Ideal)

**Timeline**: +14 hours  
**Effort**: 14 hours  

**Includes**:
- All Category A fixes (5 hours)
- All Category B features (9 hours)

**After completion**:
- ✅ Full Phase 1 feature set
- ✅ Professional UX throughout
- ✅ Metadata auto-discovery
- ✅ Query quality tracking
- ✅ Complete CRUD operations

**Recommendation**: ⚠️ Overkill for initial launch - iterate based on usage

---

## Specific Gaps Detailed

### Gap #1: Column Detail View ❌ HIGH PRIORITY

**Design Doc**: Lines 260-294, 1347-1349  
**Current**: Alert message "Coming in Phase 2"  
**Expected**: 
- Click "View Columns" → Opens modal or navigates to detail page
- Shows DataTable with all columns for that table
- Columns: name, data_type, nullable, semantic_type, description
- Allows editing column descriptions

**Implementation Needed**:
1. Create `ViewColumnsModal` component
2. Fetch from existing `GET /api/data/explorer/metadata/tables/[id]/columns`
3. Display in DataTable
4. Optional: Add edit inline or separate modal

**Files to Create**:
- `components/view-columns-modal.tsx`
- Wire into `metadata-content.tsx` line 45

---

### Gap #2: View SQL Modal ❌ HIGH PRIORITY

**Current**: `alert(Generated SQL:\n\n${row.exp_generated_sql})`  
**Expected**: Modal with syntax-highlighted SQL  
**Location**: `app/(default)/data/explorer/history/history-content.tsx` line 37

**Implementation Needed**:
1. Create `ViewSQLModal` component
2. Add syntax highlighting (optional - or just use `<pre>` tag)
3. Copy to clipboard button
4. Re-execute button

**Files to Create**:
- `components/view-sql-modal.tsx`
- Wire into `history-content.tsx`

---

### Gap #3: View Results Modal ❌ MEDIUM PRIORITY

**Current**: TODO comment  
**Expected**: Modal showing cached results from `exp_result_sample`  
**Location**: `app/(default)/data/explorer/history/history-content.tsx` line 44-47

**Implementation Needed**:
1. Create `ViewResultsModal` component
2. Fetch result_sample from history record
3. Display in table format (like execute results)
4. Show metadata (row count, execution time)

**Files to Create**:
- `components/view-results-modal.tsx`
- Enhance `ExplorerHistoryService` to return result_sample
- Wire into `history-content.tsx`

---

### Gap #4: Metadata Discovery Integration ❌ MEDIUM PRIORITY

**Design Doc**: Lines 1349-1350, 2740-2767  
**Current**: Standalone script only  
**Expected**: 
- Button in `/data/explorer/metadata` page: "Discover New Tables"
- POST /api/data/explorer/metadata/discover endpoint
- Progress modal during discovery
- Results table showing new tables found

**Implementation Needed**:
1. Create `SchemaDiscoveryService`
2. Create POST endpoint
3. Add "Discover Tables" button to metadata page
4. Create discovery results modal

**Files to Create**:
- `lib/services/data-explorer/schema-discovery-service.ts`
- `app/api/data/explorer/metadata/discover/route.ts`
- `components/discovery-results-modal.tsx`

---

### Gap #5: Query Rating System ❌ LOW PRIORITY

**Design Doc**: Lines 318-320, 1356-1357  
**Current**: Database column exists (`exp_user_rating`), no UI/API  
**Expected**:
- Star rating widget in history table
- POST /api/data/explorer/history/[id]/rate endpoint
- Tracks 1-5 star ratings
- Shows average rating per query

**Implementation Needed**:
1. Add rating endpoint
2. Add star rating UI component
3. Update history service

---

### Gap #6: Create Table Metadata ❌ LOW PRIORITY

**Design Doc**: Line 1343  
**Current**: Can only edit existing tables  
**Expected**: POST /api/data/explorer/metadata/tables to manually add tables

**Impact**: Low - discovery script handles this  
**Workaround**: Edit `scripts/discover-real-ih-tables.ts` and re-run

---

## Navigation Gaps

### Missing Navigation Items

**Design Doc**: Lines 96-107

**Expected Navigation**:
```
Data (New Section)
└── Explorer
    ├── Query        (/data/explorer)           ✅ Implemented
    ├── History      (/data/explorer/history)   ✅ Implemented  
    ├── Templates    (/data/explorer/templates) ❌ Missing (Phase 3)
    ├── Metadata     (/data/explorer/metadata)  ✅ Implemented
    │   └── Discovery (/data/explorer/metadata/discovery) ❌ Missing (Phase 2)
    └── Settings     (/data/explorer/settings)  ❌ Missing (Phase 3)
```

**Current Navigation**:
```
Data
└── Explorer
    ├── Query     ✅
    ├── History   ✅
    └── Metadata  ✅
```

---

## Quality Issues (TODOs in Code)

### Using alert() Instead of Modals

**Files with alert()**:
1. `app/(default)/data/explorer/metadata/metadata-content.tsx:46`
2. `app/(default)/data/explorer/history/history-content.tsx:37`

**Issue**: Unprofessional UX, doesn't match app design  
**Priority**: HIGH  
**Fix**: Replace with HeadlessUI modals

---

## Implementation Plan - Recommended Fixes

### Immediate (Must-Fix for Professional MVP)

**Total Time**: 5 hours

#### 1. View Columns Modal (2 hours)

```typescript
// components/view-columns-modal.tsx
interface ViewColumnsModalProps {
  isOpen: boolean;
  onClose: () => void;
  tableId: string;
  tableName: string;
}

// Fetches from GET /api/data/explorer/metadata/tables/[id]/columns
// Displays in DataTable or simple table
```

**Updates**:
- Create `components/view-columns-modal.tsx`
- Update `metadata-content.tsx` line 45
- Add state for modal open/close

---

#### 2. View SQL Modal (1 hour)

```typescript
// components/view-sql-modal.tsx
interface ViewSQLModalProps {
  isOpen: boolean;
  onClose: () => void;
  sql: string;
  explanation?: string;
}

// Simple modal with:
// - Syntax-highlighted SQL (or <pre> tag)
// - Copy to clipboard button
// - Re-execute button (optional)
```

**Updates**:
- Create `components/view-sql-modal.tsx`
- Update `history-content.tsx` line 37
- Remove alert()

---

#### 3. View Results Modal (2 hours)

```typescript
// components/view-results-modal.tsx
interface ViewResultsModalProps {
  isOpen: boolean;
  onClose: () => void;
  results: unknown[];
  rowCount: number;
  executionTime: number;
}

// Displays cached results from exp_result_sample
// Same table format as execute results
```

**Updates**:
- Create `components/view-results-modal.tsx`
- Update `history-content.tsx` line 46
- Ensure history service returns result_sample

---

### Short-Term (Nice-to-Have)

**Total Time**: 3 hours

#### 4. Query Detail Endpoint (1 hour)

```typescript
// app/api/data/explorer/history/[id]/route.ts
export const GET = rbacRoute(getQueryDetailHandler, {
  permission: ['data-explorer:history:read:own', ...],
});
```

**Purpose**: Get full query details including result_sample  
**Complexity**: Low (simple service method + endpoint)

---

#### 5. Metadata Discovery Endpoint (2 hours)

```typescript
// app/api/data/explorer/metadata/discover/route.ts
export const POST = rbacRoute(discoverSchemaHandler, {
  permission: 'data-explorer:discovery:run:all',
});

// Triggers schema discovery, returns table count
```

**Purpose**: Allow admins to discover tables via UI  
**Complexity**: Medium (move script logic to service)

---

### Future Phases (Out of Scope for Now)

- Templates System (Phase 3) - 16 hours
- Pattern Learning (Phase 2) - 16 hours  
- Settings Page (Phase 3) - 4 hours
- Query Rating UI (Phase 3) - 2 hours

---

## Severity Assessment

### Blockers (Must Fix): 0

None - system is functional

### Critical UX Issues (Should Fix): 3

1. ❌ View Columns uses alert
2. ❌ View SQL uses alert
3. ❌ View Results is placeholder

**Impact**: Users encounter unprofessional alerts and can't explore data structure

### Nice-to-Have (Can Wait): 6

1. Create table metadata endpoint
2. Delete table metadata endpoint
3. Query rating system
4. Query detail endpoint
5. Discovery endpoint
6. Discovery UI

---

## Completeness Score by Component

| Component | Design Coverage | Implementation Quality | Overall |
|-----------|----------------|----------------------|---------|
| **Database Layer** | 100% | A+ | ✅ 100% |
| **Service Layer** | 63% (5/8 services) | A+ | ⚠️ 63% |
| **API Layer** | 58% (8/14 endpoints) | A+ | ⚠️ 58% |
| **Frontend Pages** | 60% (3/5 pages) | B+ | ⚠️ 70% |
| **UI Components** | 50% (4/8 modals) | B | ⚠️ 60% |
| **Testing** | 100% (for what exists) | A+ | ✅ 100% |
| **Documentation** | 100% | A+ | ✅ 100% |

**Overall Phase 1 Completion**: **70%**

---

## Recommended Action Plan

### Priority 1: Fix UX Issues (5 hours)

1. ✅ Create ViewColumnsModal
2. ✅ Create ViewSQLModal  
3. ✅ Create ViewResultsModal
4. ✅ Remove all alert() calls
5. ✅ Test end-to-end

**Outcome**: Professional, polished MVP ready for users

### Priority 2: Add Discovery (3 hours)

1. ✅ Create SchemaDiscoveryService
2. ✅ Create POST /metadata/discover endpoint
3. ✅ Add "Discover Tables" button
4. ✅ Show discovery progress/results

**Outcome**: Self-service metadata population

### Priority 3: Future Enhancements (Later)

- Query rating system
- Template library
- Settings page
- Pattern learning

**Outcome**: Enhanced user experience over time

---

## Conclusion

**Current State**: Functional but incomplete UX  
**Critical Gaps**: 3 high-priority UX issues (alerts, missing modals)  
**Recommended**: Invest 5 hours to fix UX before wider rollout  
**Phase 1 Target**: 8 hours more work to reach 90% completion

**The system works** but needs polish to be user-ready. The core functionality (SQL generation, execution, security) is solid. The gaps are primarily UI/UX and Phase 2/3 features that can be added iteratively.

---

**Gap Analysis Version**: 1.0  
**Total Gaps Identified**: 15  
**Critical Gaps**: 3  
**Recommended Fixes**: 5 hours of work  
**Phase 1 Completion**: 70% → 90% (after fixes)

