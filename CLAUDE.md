# Claude AI Assistant Rules and Guidelines

This document contains the rules, guidelines, and context for AI assistants working on this codebase.

## Git Operations

### Strict Prohibitions
- **NEVER** use `git reset`, `git reset --hard`, `git reset --soft`, or any destructive git operations under any circumstances
- **FORBIDDEN**: All forms of `git reset` are prohibited
- Do not interact with git unless explicitly instructed to do so
- Do not commit work without being told to do so
- Never run force push to main/master
- Never skip hooks (`--no-verify`, `--no-gpg-sign`, etc.) unless explicitly requested

## Code Quality Standards

### Type Safety
- **FORBIDDEN**: The `any` type is never to be used under any circumstance
- If you encounter the `any` type in existing code, address it and report it to the user
- Maintain strict TypeScript typing throughout the codebase

### Quality Over Speed
- Do not take shortcuts for speed
- Speed is not the priority; high quality code is the priority
- Always prioritize correctness and maintainability

### Post-Change Validation
- **ALWAYS** run `pnpm tsc` after any code changes are completed
- **ALWAYS** run `pnpm lint` after any code changes are completed
- Fix all errors before proceeding, even if they were unrelated to your changes

## Security

- Security is paramount
- Never make an infrastructure or code change that will negatively impact the security profile
- Always consider security implications of any changes

## File Naming Conventions

- Do not use adjectives or buzzwords in file naming
- Avoid: "enhanced", "optimized", "new", "updated", etc.
- Name files plainly and descriptively
- Focus on what the file does, not marketing language

## Testing Standards

### Test Quality
- Do not create "testing theater" where the test only tests itself
- Tests should always test real code and should add value
- Quality code is the priority, not 100% pass rate

### Test Failures
- When addressing testing failures, always analyze first and determine appropriate action
- Do not blindly modify tests to make them pass
- If a test is failing, determine if:
  - The code is wrong (fix the code)
  - The test is wrong (fix the test)
  - The requirement changed (discuss with user)
- Do it correctly, not just to make tests pass

## Development Workflow

1. Make code changes
2. Run `pnpm tsc` to check TypeScript compilation
3. Run `pnpm lint` to check linting rules
4. Fix any errors that you created
5. Only proceed when all checks pass
6. Do not create documents unless asked. Display your findings to the user.

## Project Context

- OS: macOS (darwin 24.6.0)
- Shell: zsh
- Package Manager: pnpm
- Workspace: `/Users/pstewart/bcos`
- Tech Stack: Next.js, TypeScript, React
- Infrastructure: AWS CDK

## Key Principles

1. **Security First**: Always prioritize security in all decisions
2. **Type Safety**: Strict TypeScript, no `any` types
3. **Quality Over Speed**: Take time to do things correctly
4. **Test Value**: Tests must provide real value, not just coverage
5. **Clean Git History**: No destructive git operations
6. **Explicit Actions**: Only commit or interact with git when explicitly instructed


