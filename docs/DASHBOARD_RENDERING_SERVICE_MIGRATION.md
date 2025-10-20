# Dashboard Rendering Service Migration Guide

## Overview

The `DashboardRenderer` service has been refactored from a monolithic 694-line class into a modular service architecture for improved maintainability, testability, and extensibility.

**Timeline**: The old service will be removed in 2-3 sprints (target: mid-2025).

---

## Quick Migration

### Before (Old)
```typescript
import { DashboardRenderer } from '@/lib/services/dashboard-renderer';

const renderer = new DashboardRenderer();
const result = await renderer.renderDashboard(dashboardId, filters, userContext);
```

### After (New)
```typescript
import { createDashboardRenderingService } from '@/lib/services/dashboard-rendering';

const service = createDashboardRenderingService(userContext);
const result = await service.renderDashboard(dashboardId, filters);
```

### Key Differences

1. **Factory Function**: Use `createDashboardRenderingService(userContext)` instead of `new DashboardRenderer()`
2. **UserContext Binding**: Pass `userContext` once at instantiation, not on every method call
3. **Same Response**: No changes to response format or types

---

## Detailed Changes

### Import Statements

```typescript
// ❌ Old
import {
  DashboardRenderer,
  type DashboardUniversalFilters,
  type DashboardRenderResponse,
} from '@/lib/services/dashboard-renderer';

// ✅ New
import {
  createDashboardRenderingService,
  type DashboardUniversalFilters,
  type DashboardRenderResponse,
} from '@/lib/services/dashboard-rendering';
```

### Service Instantiation

```typescript
// ❌ Old
const renderer = new DashboardRenderer();

// ✅ New
const service = createDashboardRenderingService(userContext);
```

### Method Calls

```typescript
// ❌ Old
await renderer.renderDashboard(dashboardId, filters, userContext);

// ✅ New
await service.renderDashboard(dashboardId, filters);
```

---

## Migration Checklist

- [ ] Update import statements
- [ ] Replace `new DashboardRenderer()` with `createDashboardRenderingService(userContext)`
- [ ] Remove `userContext` parameter from `renderDashboard()` calls
- [ ] Update tests
- [ ] Verify functionality

---

## Benefits of New Architecture

### 1. **Modular Design**
The monolithic 694-line file is now split into 8 focused services:

```
/lib/services/dashboard-rendering/
├── dashboard-rendering-service.ts   (~120 lines) - Facade orchestrator
├── dashboard-loader.ts              (~95 lines)  - Load dashboard + charts
├── filter-service.ts                (~230 lines) - Filter validation
├── chart-config-builder.ts          (~296 lines) - Config normalization
├── batch-executor.ts                (~207 lines) - Parallel execution
├── mappers.ts                       (~113 lines) - Result transformation
├── base-service.ts                  (~61 lines)  - RBAC helpers
└── types.ts                         (~132 lines) - Shared types
```

### 2. **Single Responsibility Principle**
Each service has one clear purpose:
- `DashboardLoaderService` - Loading only
- `FilterService` - Filtering only
- `ChartConfigBuilderService` - Config building only
- `BatchExecutorService` - Execution only

### 3. **Easier Testing**
- Small, focused units easy to test in isolation
- Mock dependencies, test specific logic
- Higher test coverage achievable

### 4. **Better Maintainability**
- Clear boundaries between concerns
- Easy to debug (follow service chain)
- Easier onboarding for new developers

### 5. **Extensibility**
- Add new filter types → only modify `filter-service.ts`
- Add new chart config → only modify `chart-config-builder.ts`
- Add new execution strategies → only modify `batch-executor.ts`

---

## Unchanged Behavior

The following remain **identical**:

✅ Request/response contracts
✅ RBAC enforcement
✅ Parallel execution
✅ Query deduplication
✅ Error handling
✅ Performance metrics
✅ Filter merging logic
✅ Organization hierarchy resolution

This is a **refactor**, not a rewrite. All functionality is preserved.

---

## Example Migrations

### API Route
```typescript
// ❌ Before
import { DashboardRenderer } from '@/lib/services/dashboard-renderer';

const handler = async (request: NextRequest, userContext: UserContext) => {
  const renderer = new DashboardRenderer();
  const result = await renderer.renderDashboard(dashboardId, filters, userContext);
  return createSuccessResponse(result);
};

// ✅ After
import { createDashboardRenderingService } from '@/lib/services/dashboard-rendering';

const handler = async (request: NextRequest, userContext: UserContext) => {
  const service = createDashboardRenderingService(userContext);
  const result = await service.renderDashboard(dashboardId, filters);
  return createSuccessResponse(result);
};
```

### Integration Test
```typescript
// ❌ Before
import { DashboardRenderer } from '@/lib/services/dashboard-renderer';

it('should render dashboard', async () => {
  const renderer = new DashboardRenderer();
  const result = await renderer.renderDashboard(dashboardId, {}, userContext);
  expect(result.charts).toBeDefined();
});

// ✅ After
import { createDashboardRenderingService } from '@/lib/services/dashboard-rendering';

it('should render dashboard', async () => {
  const service = createDashboardRenderingService(userContext);
  const result = await service.renderDashboard(dashboardId, {});
  expect(result.charts).toBeDefined();
});
```

---

## Known Issues

### Test Files Using Internal Methods

The security test file `/tests/security/test-dashboard-security.ts` uses reflection to access internal methods:

```typescript
// This pattern will break
const testRenderer = new (dashboardRenderer.constructor as any)();
await testRenderer.validateOrganizationFilterAccess(orgId, userContext);
```

**Solution**: These internal methods are now in `FilterService`. Update tests to use the service directly:

```typescript
import { FilterService } from '@/lib/services/dashboard-rendering';

const filterService = new FilterService(userContext);
// Note: validateOrganizationAccess is now private
// Tests should use public API or be refactored
```

---

## Troubleshooting

### Issue: TypeScript Error "Cannot find module"

**Cause**: Still importing from old path

**Fix**: Update import path from `@/lib/services/dashboard-renderer` to `@/lib/services/dashboard-rendering`

### Issue: "Too many arguments" error

**Cause**: Still passing `userContext` to `renderDashboard()`

**Fix**: Remove the third parameter - `userContext` is bound at instantiation

### Issue: Tests failing with "renderer is not defined"

**Cause**: Variable name changed from `renderer` to `service`

**Fix**: Update variable names consistently

---

## Timeline

| Phase | Date | Status |
|-------|------|--------|
| Phase 1: Create new service | 2025-01-19 | ✅ Complete |
| Phase 2: Migrate API routes | 2025-01-19 | ✅ Complete |
| Phase 3: Add deprecation notices | 2025-01-19 | ✅ Complete |
| Phase 4: Validation period | 2025-01-20 - 2025-03-01 | 🟡 In Progress |
| Phase 5: Remove old service | 2025-03-01 | 🔴 Planned |

---

## Support

If you encounter issues during migration:

1. Check this guide for common patterns
2. Review the refactor PR for examples
3. Ask in #engineering Slack channel
4. Review `/lib/services/dashboard-rendering/README.md` (if exists)

---

## Appendix: Service Architecture

### Service Dependency Graph

```
DashboardRenderingService (Facade)
├─→ DashboardLoaderService
│   ├─→ createRBACDashboardsService()
│   └─→ createRBACChartsService()
├─→ FilterService
│   ├─→ createOrganizationAccessService()
│   └─→ organizationHierarchyService
├─→ ChartConfigBuilderService (pure logic)
└─→ BatchExecutorService
    └─→ chartDataOrchestrator
```

### Public API

```typescript
// Main factory function
export function createDashboardRenderingService(
  userContext: UserContext
): DashboardRenderingService;

// Specialized services (for advanced usage)
export { DashboardLoaderService } from './dashboard-loader';
export { FilterService } from './filter-service';
export { ChartConfigBuilderService } from './chart-config-builder';
export { BatchExecutorService } from './batch-executor';

// Helper functions
export {
  mapDashboardRenderResponse,
  buildEmptyDashboardResponse,
  getAppliedFilterNames,
} from './mappers';

// Types
export type {
  DashboardUniversalFilters,
  ChartRenderResult,
  DashboardRenderResponse,
  ResolvedFilters,
  ChartExecutionConfig,
  ExecutionResult,
};
```

---

**Last Updated**: 2025-01-19
**Migration Status**: Recommended - old service will be removed in 2-3 sprints
