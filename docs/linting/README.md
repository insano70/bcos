# Linting Documentation

This directory contains documentation for custom lint rules and linting practices for the BendCare OS codebase.

## Overview

The project uses **Biome** as the primary linter for code quality, formatting, and style enforcement. In addition to Biome's built-in rules, we have custom lint checks for project-specific requirements.

## Linting Tools

### Biome (Primary)
- **Purpose**: Code quality, formatting, style enforcement
- **Config**: [biome.json](../../biome.json)
- **Run**: `pnpm lint:biome`
- **Auto-fix**: `pnpm lint:fix`

### Custom Lint Rules

#### 1. No Server Logger in Client Code
- **Purpose**: Prevent build failures from importing Node-only logger in client code
- **Script**: [scripts/lint-no-server-logger-in-client.ts](../../scripts/lint-no-server-logger-in-client.ts)
- **Run**: `pnpm lint:logger`
- **Docs**: [NO_SERVER_LOGGER_IN_CLIENT.md](./NO_SERVER_LOGGER_IN_CLIENT.md)

## Running Linters

```bash
# Run all linters (Biome + custom rules)
pnpm lint

# Run Biome only
pnpm lint:biome

# Run Biome with auto-fix
pnpm lint:fix

# Run logger import checker only
pnpm lint:logger

# Format code
pnpm format

# Run full check (lint + format)
pnpm check
```

## CI/CD Integration

All linters run automatically in:
- Pre-commit hooks (if configured)
- CI/CD pipelines
- Pull request checks

**Exit Code Behavior**:
- `0` = All checks pass
- `1` = Violations found (fails build/deployment)

## Custom Rules

### Current Rules

1. **No Server Logger in Client** - [Documentation](./NO_SERVER_LOGGER_IN_CLIENT.md)
   - Prevents `import { log } from '@/lib/logger'` in client-side files
   - Client files are identified by `'use client'` directive
   - Ensures build compatibility and prevents Node.js dependency issues

### Adding New Rules

To add a new custom lint rule:

1. Create the rule script in `scripts/lint-*.ts`
2. Add npm script to `package.json`:
   ```json
   "lint:your-rule": "tsx scripts/lint-your-rule.ts"
   ```
3. Update main `lint` command to include new rule:
   ```json
   "lint": "pnpm lint:biome && pnpm lint:logger && pnpm lint:your-rule"
   ```
4. Document the rule in `docs/linting/YOUR_RULE.md`
5. Update this README with rule description

## Configuration Files

- **Biome**: [biome.json](../../biome.json)
- **Package Scripts**: [package.json](../../package.json) (scripts section)
- **Type Checking**: [tsconfig.json](../../tsconfig.json)

## Biome Rules

### Enabled Rules

See [biome.json](../../biome.json) for current configuration. Key rules:

- **Suspicious**: `noExplicitAny` = error (no `any` types allowed)
- **Style**: `useImportType` = warn (prefer type imports)
- **A11y**: Various accessibility rules
- **Security**: `noDangerouslySetInnerHtml` = warn

### Overrides

Certain directories have relaxed rules:

- **templates/**: `noExplicitAny` = warn (instead of error)
- **tests/**: `noExplicitAny` = warn (instead of error)
- **lib/api/templates/**: Linting disabled
- **lib/api/testing/**: Linting disabled

## Best Practices

### 1. Fix Lint Errors Before Committing
Always run `pnpm lint` before committing code. Fix all errors and warnings.

### 2. Use Auto-fix When Possible
Many Biome errors can be auto-fixed:
```bash
pnpm lint:fix
```

### 3. Don't Bypass Linters
Avoid bypassing linters with:
- `// biome-ignore` comments (use sparingly)
- Committing with `--no-verify` (never do this)
- Modifying lint config to allow violations

If a rule is problematic, discuss with the team before changing it.

### 4. Understand Warnings vs Errors
- **Errors**: Must be fixed, block deployment
- **Warnings**: Should be fixed, may be addressed in separate PR

### 5. Keep Rules Consistent
When adding new code, follow existing patterns detected by linters.

## Troubleshooting

### Biome Shows Too Many Errors

The codebase may have pre-existing lint violations. Focus on:
1. Fix violations in files you're modifying
2. Don't introduce new violations
3. Consider cleanup PRs for unrelated files

### Custom Rule False Positive

If a custom lint rule incorrectly flags code:
1. Review the rule documentation
2. Check if the code truly violates the intent
3. If it's a bug, file an issue with example
4. Do not bypass the rule without team approval

### Performance Issues

If linting is slow:
- Biome is generally very fast
- Custom rules scan filesystem, may be slower
- Consider caching results in custom rules
- Run specific linters instead of `pnpm lint` during development

## Related Documentation

- [Logging Strategy](../logging_strategy.md)
- [Code Quality Standards](../CLAUDE.md)
- [TypeScript Configuration](../typescript/README.md)
- [API Standards](../api/STANDARDS.md)

## Maintenance

### Updating Biome

```bash
pnpm update @biomejs/biome
```

Review [Biome changelog](https://biomejs.dev/blog/) for breaking changes.

### Updating Custom Rules

Custom rules are TypeScript scripts. Update them directly in `scripts/` and test with:
```bash
pnpm lint:logger  # or specific rule
```

---

**Last Updated**: 2025-01-16
**Maintainer**: Engineering Team
