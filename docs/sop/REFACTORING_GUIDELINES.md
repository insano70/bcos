# Refactoring Guidelines

## Overview

This document provides guidelines for identifying and executing refactoring opportunities in the codebase. Follow these guidelines to ensure refactoring adds value without introducing regressions.

## Core Principles

### 1. Value-First Approach

Before refactoring, answer:
- **What problem does this solve?** (duplication, complexity, maintainability)
- **What is the risk?** (regression potential, testing coverage)
- **What is the effort?** (time, files affected)

Only proceed when: `Value Added > Risk × Effort`

### 2. Don't Refactor for Refactoring's Sake

**DO refactor when:**
- Code is duplicated 3+ times
- A utility already exists but isn't being used
- Pattern inconsistency causes bugs or confusion
- You're already touching the code for a feature

**DON'T refactor when:**
- Code works and isn't being modified
- Consolidation adds complexity (e.g., too many props/options)
- Risk of regression is high with low test coverage
- It's purely cosmetic

## High-Value Refactoring Patterns

### Pattern 1: Duplicate Utility Consolidation

**Identify:** Same function implemented in multiple files

**Example - Before:**
```typescript
// analytics-bar-chart.tsx
function getTimeConfig(frequency) { /* ... */ }

// analytics-line-chart.tsx  
function getTimeConfig(frequency) { /* ... */ }

// analytics-stacked-bar-chart.tsx
function getTimeConfig(frequency) { /* ... */ }
```

**After:**
```typescript
// lib/utils/chart-fullscreen-config.ts
export function getTimeConfig(frequency) { /* ... */ }

// All chart components import from shared utility
import { getTimeConfig } from '@/lib/utils/chart-fullscreen-config';
```

**Checklist:**
- [ ] Shared utility covers all use cases from duplicated functions
- [ ] Import path is consistent with project conventions
- [ ] Original files updated to use shared utility
- [ ] Tests pass after consolidation

### Pattern 2: Modal Boilerplate Extraction

**Identify:** Same modal lifecycle code (mounting, scroll lock, escape key)

**Example - Before:**
```typescript
function MyModal({ isOpen, onClose }) {
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => { setMounted(true); }, []);
  
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [isOpen]);
  
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);
  // ...
}
```

**After:**
```typescript
import { useChartFullscreen } from '@/hooks/useChartFullscreen';

function MyModal({ isOpen, onClose }) {
  const { mounted } = useChartFullscreen(isOpen, onClose);
  // All lifecycle handled by hook
}
```

### Pattern 3: Console Logging Standardization

**Identify:** `console.error`, `console.log`, etc. in production code

**Action:** Replace with `clientErrorLog` or `clientDebugLog`

See: `docs/sop/CLIENT_LOGGING_STANDARDS.md`

### Pattern 4: Component Consolidation

**Identify:** Multiple components with 90%+ identical code

**Example:** Delete confirmation modals that only differ in title/item name

**Action:** Use generic component with props

**CAUTION:** Don't consolidate if components have different:
- Error handling patterns
- Toast/notification behavior
- Domain-specific validation
- Significantly different UI requirements

## Low-Value Refactoring (Avoid)

### 1. Large Service File Splitting

Files like `rbac-users-service.ts` (800+ lines) may look like candidates for splitting, but:
- They follow consistent patterns
- Splitting increases import complexity
- Risk of breaking existing functionality is high

**Better approach:** Only split when adding features that create natural boundaries.

### 2. Premature Abstraction

```typescript
// DON'T create abstractions for single-use code
const useGenericApiCall = (options) => { /* ... */ };

// DO use existing hooks directly
const { data } = useApiQuery('/api/users');
```

### 3. Config File Consolidation

Multiple config files with similar structure don't necessarily need consolidation if they serve different purposes or deployment environments.

## Refactoring Workflow

### Step 1: Identify Opportunity
```bash
# Find duplicated patterns
grep -rn "function getTimeConfig" --include="*.tsx"

# Find console.error usage
grep -rn "console\.error" --include="*.tsx" components/
```

### Step 2: Assess Value
- Count occurrences
- Measure lines that would be removed
- Identify potential risks

### Step 3: Create Tests (if missing)
Before refactoring, ensure existing behavior is tested.

### Step 4: Execute Incrementally
1. Create shared utility/hook
2. Update one consumer
3. Verify functionality
4. Update remaining consumers
5. Delete original duplicated code

### Step 5: Verify
```bash
pnpm tsc    # Type checking
pnpm lint   # Linting
pnpm test   # Run tests
```

## Code Quality Checks

### What to look for during review:

| Issue | Action |
|-------|--------|
| `console.error` in components | Replace with `clientErrorLog` |
| `any` type | Add proper typing |
| Duplicated modal lifecycle | Use `useChartFullscreen` hook |
| Duplicated delete confirmation | Use `DeleteConfirmationModal` |
| `TODO` comments | Convert to documentation or remove |
| Empty catch blocks | Add proper error handling |
| Backup/deprecated files | Delete if not needed |

### What NOT to change:

- Working code that isn't being touched for features
- Patterns that are intentionally different for domain reasons
- Code with low test coverage (add tests first)

## Metrics for Success

After refactoring:
- [ ] No increase in TypeScript errors
- [ ] No increase in lint errors  
- [ ] All existing tests pass
- [ ] Lines of code reduced OR complexity reduced
- [ ] Pattern consistency improved

## Related Documentation

- `CLAUDE.md` - Development standards
- `docs/sop/CLIENT_LOGGING_STANDARDS.md` - Logging patterns
- `docs/sop/MODAL_COMPONENT_PATTERNS.md` - Modal patterns
- `CODEBASE_AUDIT_REPORT.md` - Known issues and hidden defects

---
*Last updated: December 2024*
*Established during codebase refactoring initiative*









