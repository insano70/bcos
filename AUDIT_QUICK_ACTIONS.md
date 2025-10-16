# BendCare OS - Quick Action Items from Code Quality Audit

## 🚨 Critical Issues to Fix Immediately

### 1. TypeScript Violations (Week 1)
```bash
# Fix compilation errors
pnpm tsc --noEmit

# Find and fix 'any' types (41 found)
grep -r ": any\|<any>" lib/ app/ components/ --include="*.ts" --include="*.tsx"

# Add to .eslintrc.js
{
  "rules": {
    "@typescript-eslint/no-explicit-any": "error",
    "no-console": "error"
  }
}
```

### 2. Logging Issues (Week 1)
```bash
# Replace all console.* with log.*
# Find all instances (192 found):
grep -r "console\." lib/ app/ --include="*.ts" --include="*.tsx"

# Quick fix:
# console.log(...) → log.info(...)
# console.error(...) → log.error(...)
# console.warn(...) → log.warn(...)
```

### 3. Unprotected Routes (Week 1)
Review these 8 routes for proper protection:
- `app/api/security/csp-report/route.ts`
- `app/api/auth/refresh/route.ts`
- `app/api/auth/logout/route.ts`
- `app/api/auth/mfa/credentials/route.ts`
- `app/api/auth/me/route.ts`

## 🔧 Quick Wins (< 1 hour each)

### 1. Accessibility Fixes
```bash
# Find 3 images without alt text
grep -r "<img" app/ components/ | grep -v "alt="

# Find 4 <img> tags to convert to next/image
grep -r "<img" app/ components/ | grep -v "next/image"
```

### 2. Add Pre-commit Hooks
```json
// package.json
{
  "scripts": {
    "pre-commit": "pnpm tsc --noEmit && pnpm lint"
  }
}
```

### 3. Create Templates
```typescript
// app/loading-template.tsx
export default function Loading() {
  return <div>Loading...</div>;
}

// app/error-template.tsx
'use client';
export default function Error({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div>
      <h2>Something went wrong!</h2>
      <button onClick={reset}>Try again</button>
    </div>
  );
}
```

## 📊 Key Metrics to Track

| Metric | Current | Target | Command |
|--------|---------|--------|---------|
| Any types | 41 | 0 | `grep -r ": any" lib/ app/ components/ \| wc -l` |
| Console usage | 192 | 0 | `grep -r "console\." lib/ app/ \| wc -l` |
| Type assertions | 1135 | <100 | `grep -r " as " lib/ app/ \| wc -l` |
| Client components | 61% | <30% | See report |
| Files >1000 lines | 7 | 0 | `find . -name "*.ts" -o -name "*.tsx" \| xargs wc -l \| sort -rn` |

## 🎯 Priority Order

1. **Day 1**: Fix TypeScript errors, set up pre-commit hooks
2. **Day 2-3**: Replace all console.* usage
3. **Day 4-5**: Eliminate 'any' types
4. **Week 2**: Refactor large files
5. **Week 3**: Add missing loading/error boundaries
6. **Week 4**: Convert client to server components

## 📝 Automation Scripts

### Find All Issues
```bash
#!/bin/bash
echo "=== Code Quality Check ==="
echo "Any types: $(grep -r ": any" lib/ app/ components/ | wc -l)"
echo "Console usage: $(grep -r "console\." lib/ app/ | wc -l)"
echo "Type assertions: $(grep -r " as " lib/ app/ | wc -l)"
echo "TS errors: $(pnpm tsc --noEmit 2>&1 | grep error | wc -l)"
echo "Large files: $(find . -name "*.ts" -o -name "*.tsx" | xargs wc -l | awk '$1 > 500' | wc -l)"
```

### Monitor Progress
```bash
# Add to package.json scripts
"quality:check": "node scripts/quality-check.js",
"quality:report": "node scripts/quality-check.js --report"
```

## 🚀 Expected Impact

After completing these actions:
- **Type Safety**: 100% type-safe code
- **Debugging**: Structured logs with correlation IDs
- **Performance**: 2x faster initial page loads
- **Maintainability**: No files over 500 lines
- **Reliability**: Proper error handling everywhere

---

**Remember**: Fix critical issues first, then move to high priority items. Each fix improves overall code quality and reduces technical debt.
