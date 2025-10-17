# Custom Lint Rule: No Server Logger in Client Code

## Overview

This custom lint rule prevents client-side code from importing the server-only logger from `@/lib/logger`.

## Problem Statement

The logger implementation in `lib/logger/` uses Node.js-only dependencies (file system access, environment variables, CloudWatch integration, etc.). When client-side code (files with `'use client'` directive) attempts to import this logger, it causes build failures because these Node.js APIs are not available in the browser.

## Rule Implementation

### Script Location
```
scripts/lint-no-server-logger-in-client.ts
```

### How It Works

The linter:
1. Scans all TypeScript/TSX files in `app/`, `components/`, `hooks/`, `lib/`, and `templates/`
2. Identifies client-side files by detecting the `'use client'` directive
3. Checks for any imports from `@/lib/logger`
4. Reports violations with file path and line number

### Detected Import Patterns

The rule detects all common import patterns:

```typescript
// Named imports
import { log } from '@/lib/logger';
import { log, correlation } from '@/lib/logger';

// Namespace imports
import * as logger from '@/lib/logger';

// Any import from @/lib/logger
from '@/lib/logger'
```

## Usage

### Running the Linter

```bash
# Run only the logger lint check
pnpm lint:logger

# Run all linters (Biome + logger check)
pnpm lint
```

### Exit Codes

- **0**: No violations found
- **1**: Violations detected (fails CI/CD pipeline)

### Example Output

#### Success
```
🔍 Scanning for server logger imports in client-side code...

✅ No violations found. All client files are using appropriate logging methods.
```

#### Failure
```
🔍 Scanning for server logger imports in client-side code...

❌ Found server logger imports in client-side code:

────────────────────────────────────────────────────────────────────────────────

📁 components/auth/login-form.tsx:5
   import { log } from '@/lib/logger';

📁 hooks/use-chart-data.ts:12
   import { log, correlation } from '@/lib/logger';

────────────────────────────────────────────────────────────────────────────────

❌ Total violations: 2

💡 Client-side files (with 'use client') cannot import @/lib/logger
   Use console.* for client-side logging or create a client-safe logger.

   See CLAUDE.md for logging standards.
```

## Client-Side Logging Alternatives

Since client-side code cannot use the server logger, use these alternatives:

### Option 1: Standard Console (Recommended)

Use standard `console` methods with a consistent pattern:

```typescript
'use client';

// Development-only logging
if (process.env.NODE_ENV === 'development') {
  console.log('[ComponentName]', 'operation', { context });
}

// Error logging (always show)
console.error('[ComponentName] operation failed', error, { context });
```

### Option 2: Client-Safe Logger Wrapper

Create a client-safe logging utility:

```typescript
// lib/logger/client.ts
export const clientLog = {
  debug: (component: string, message: string, context?: Record<string, unknown>) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[${component}]`, message, context);
    }
  },

  error: (component: string, message: string, error?: Error, context?: Record<string, unknown>) => {
    console.error(`[${component}]`, message, error, context);
    // Optional: Send to remote logging service (Sentry, LogRocket, etc.)
  },
};
```

Usage:
```typescript
'use client';

import { clientLog } from '@/lib/logger/client';

clientLog.debug('UserForm', 'form submitted', { values });
clientLog.error('UserForm', 'submission failed', error, { userId });
```

### Option 3: Conditional Import (Advanced)

For isomorphic code that runs on both server and client:

```typescript
// This works but adds complexity
const logger = typeof window === 'undefined'
  ? await import('@/lib/logger').then(m => m.log)
  : console;
```

**Not recommended** - prefer separating server and client code.

## Integration with CI/CD

The linter is automatically run as part of the standard `pnpm lint` command, which means:

- ✅ Pre-commit hooks will catch violations
- ✅ CI/CD pipelines will fail on violations
- ✅ Developers get immediate feedback

## Rationale

### Why This Rule Exists

1. **Build Safety**: Prevents build failures from Node.js dependency issues
2. **Performance**: Server logger is heavier than needed for client use
3. **Security**: Server logger may expose sensitive configuration
4. **Clarity**: Enforces clear separation between server and client logging

### Design Decision: Custom Script vs ESLint

We chose a custom TypeScript script instead of ESLint because:

1. **Biome Usage**: The project uses Biome for linting, not ESLint
2. **Simplicity**: Biome doesn't support custom rules yet
3. **Lightweight**: Single-purpose script is faster than adding ESLint
4. **Maintainability**: TypeScript script is easier to modify than ESLint plugin

If Biome adds custom rule support in the future, we can migrate this rule to native Biome configuration.

## Troubleshooting

### False Positives

If the linter incorrectly flags a file:

1. Verify the file actually has `'use client'` directive
2. Check if the file is in a scanned directory (`app/`, `components/`, etc.)
3. Report the issue with the file path

### False Negatives

If a violation isn't detected:

1. Verify the import uses `@/lib/logger` (not relative path)
2. Check if the file is in a scanned directory
3. Run `pnpm lint:logger` directly to verify

### Bypassing the Rule (Not Recommended)

If you absolutely must bypass this rule temporarily:

```bash
# Run Biome only, skip logger check
pnpm lint:biome
```

**Do not** commit code that fails the logger check without addressing the root cause.

## Related Documentation

- [Logging Strategy](../logging_strategy.md) - Overall logging architecture
- [API Standards](../api/STANDARDS.md) - Server-side logging patterns
- [CLAUDE.md](../../CLAUDE.md#logging-standards) - Logging rules and guidelines

## Maintenance

### Updating the Rule

To modify the linter behavior, edit:
```
scripts/lint-no-server-logger-in-client.ts
```

Key areas to modify:
- `SCAN_DIRS`: Directories to scan
- `LOGGER_IMPORT_PATTERNS`: Import patterns to detect
- `isClientFile()`: Logic to identify client files

### Testing Changes

After modifying the linter:

```bash
# Test against current codebase
pnpm lint:logger

# Create a test file with violations to verify detection
echo "'use client';\nimport { log } from '@/lib/logger';" > /tmp/test-client.tsx
# Move to components and run linter
```

## Future Enhancements

Potential improvements to consider:

1. **Whitelist**: Allow specific files to bypass the rule with comments
2. **Auto-fix**: Suggest alternative imports
3. **Performance**: Cache file analysis results
4. **Reporting**: Generate detailed violation reports for CI
5. **Native Biome**: Migrate to native Biome rule when available

---

**Version**: 1.0
**Last Updated**: 2025-01-16
**Maintainer**: Engineering Team
