# Bug Fix Plan - Phase 1 Issues

**Date:** November 20, 2025  
**Total Bugs:** 15 identified  
**Critical:** 3 (all fixed)  
**High:** 4 (need fixes)  
**Medium:** 8  

---

## Immediate Fixes (Before Commit)

### Fix #1: Remove All Console.log Statements
**Priority:** CRITICAL (Security - Data Leakage)  
**Files:** 
- components/charts/chart-fullscreen-modal.tsx
- components/charts/dual-axis-fullscreen-modal.tsx  
- components/charts/progress-bar-fullscreen-modal.tsx

**Action:** Remove all console.log statements

---

### Fix #2: Add Error Handling to Filter Resolution
**Priority:** HIGH (Prevents Crashes)  
**File:** lib/services/analytics/dimension-expansion-renderer.ts

**Action:** Wrap filter resolution in try-catch

---

### Fix #3: Fix Null Checks on Optional Props
**Priority:** HIGH (Prevents Runtime Errors)  
**File:** components/charts/batch-chart-renderer.tsx

**Action:** Add optional chaining (?.) to all metadata accesses

---

### Fix #4: Remove Type Assertion or Validate
**Priority:** HIGH (Type Safety)  
**File:** app/api/admin/analytics/charts/[chartId]/expand/route.ts

**Action:** Trust Zod validation, remove cast

---

### Fix #5: Reduce Logging Levels
**Priority:** MEDIUM (Log Bloat)  
**Files:** Multiple

**Action:** Change implementation detail logs from info → debug

---

### Fix #6: Extract Magic Numbers
**Priority:** MEDIUM (Maintainability)  
**Files:** Multiple

**Action:** Create constants file

---

### Fix #7: Add Config Cache Size Limit
**Priority:** MEDIUM (Memory Leak)  
**File:** lib/services/dashboard-rendering/chart-config-builder.ts

**Action:** Add max size check and cleanup

---

## Fixes for Later

### Fix #8-15: Enhancements (See audit document)

---

## Implementation Order

1. Remove console.logs (security)
2. Add error handling (functionality)
3. Fix null checks (functionality)
4. Remove type casts (type safety)
5. Reduce logging (performance)
6. Extract constants (maintainability)
7. Add cache limits (memory)

