# CLAUDE.md - Operational Rules & Protocols

---

# TIER 0: NON-NEGOTIABLE SAFETY PROTOCOLS

## Git Safety Protocol

**ABSOLUTE PROHIBITIONS - NO EXCEPTIONS:**

- **NEVER** use `git commit --no-verify` or `git commit -n`
- **NEVER** bypass pre-commit hooks under any circumstances
- **NEVER** suggest bypassing hooks to users
- **Violation = Critical Safety Failure**

**Hook Failure Response (MANDATORY):**

1. Read error messages thoroughly
2. Fix all reported issues (linting, formatting, types)
3. Stage fixes: `git add <fixed-files>`
4. Commit again (hooks run automatically)
5. **NEVER use `--no-verify`** - non-compliance is unacceptable

**Rationale**: Pre-commit hooks enforce code quality and are mandatory. No workarounds permitted.

---

## No Deviation Protocol

**ABSOLUTE PROHIBITIONS - NO EXCEPTIONS:**

- **NEVER** switch to alternative solutions when encountering issues
- **NEVER** take "the easy way out" by choosing different technologies/approaches
- **NEVER** substitute requested components without explicit user approval
- **MUST** fix the EXACT issue encountered, not work around it
- **Violation = Critical Task Failure**

**When Encountering Issues (MANDATORY):**

1. **STOP** - Do not proceed with alternatives
2. **DIAGNOSE** - Read error messages thoroughly, identify root cause
3. **FIX** - Resolve the specific issue with the requested technology/approach
4. **VERIFY** - Confirm the original request now works
5. **NEVER** suggest alternatives unless fixing is genuinely impossible

**Examples of PROHIBITED behavior:**

- ❌ "Let me switch to ChromaDB instead of fixing Pinecone"
- ❌ "Let me use SQLite instead of fixing PostgreSQL"
- ❌ "Let me use REST instead of fixing GraphQL"
- ❌ "Let me use a different library instead of fixing this one"

**Required behavior:**

- ✅ "Pinecone installation failed due to [X]. Fixing by [Y]"
- ✅ "PostgreSQL connection issue: [X]. Resolving with [Y]"
- ✅ "GraphQL error: [X]. Debugging and fixing [Y]"

**Rationale**: Users request specific technologies/approaches for a reason. Switching undermines their intent and avoids learning/fixing real issues.

---

# TIER 1: CRITICAL PROTOCOLS (ALWAYS REQUIRED)

## Protocol 1: Root Cause Analysis

**BEFORE implementing ANY fix:**

- **MUST** apply "5 Whys" methodology - trace to root cause, not symptoms
- **MUST** search entire codebase for similar patterns
- **MUST** fix ALL affected locations, not just discovery point
- **MUST** document: "Root cause: [X], affects: [Y], fixing: [Z]"

**NEVER:**

- Fix symptoms without understanding root cause
- Declare "Fixed!" without codebase-wide search
- Use try-catch to mask errors without fixing underlying problem

---

## Protocol 2: Scope Completeness

**BEFORE any batch operation:**

- **MUST** use comprehensive glob patterns to find ALL matching items
- **MUST** list all items explicitly: "Found N items: [list]"
- **MUST** check multiple locations (root, subdirectories, dot-directories)
- **MUST** verify completeness: "Processed N/N items"

**NEVER:**

- Process only obvious items
- Assume first search captured everything
- Declare complete without explicit count verification

---

## Protocol 3: Verification Loop

**MANDATORY iteration pattern:**

```
1. Make change
2. Run tests/verification IMMEDIATELY
3. Analyze failures
4. IF failures exist: fix and GOTO step 1
5. ONLY declare complete when ALL tests pass
```

**Completion criteria (ALL must be true):**

- ✅ All tests passing
- ✅ All linters passing
- ✅ Verified in running environment
- ✅ No errors in logs

**ABSOLUTE PROHIBITIONS:**

- **NEVER** dismiss test failures as "pre-existing issues unrelated to changes"
- **NEVER** dismiss linting errors as "pre-existing issues unrelated to changes"
- **NEVER** ignore ANY failing test or linting issue, regardless of origin
- **MUST** fix ALL failures before declaring complete, even if they existed before your changes
- **Rationale**: Code quality is a collective responsibility. All failures block completion.

**NEVER:**

- Declare complete with failing tests
- Skip running tests after changes
- Stop after first failure
- Use "pre-existing" as justification to skip fixes

---

# TIER 2: IMPORTANT PROTOCOLS (HIGHLY RECOMMENDED)

## Protocol 4: Design Consistency

**BEFORE implementing any UI:**

- **MUST** study 3-5 existing similar pages/components
- **MUST** extract patterns: colors, typography, components, layouts
- **MUST** reuse existing components (create new ONLY if no alternative)
- **MUST** compare against mockups if provided
- **MUST** document: "Based on [pages], using pattern: [X]"

**NEVER:**

- Use generic defaults or placeholder colors
- Deviate from mockups without explicit approval
- Create new components without checking existing ones

---

## Protocol 5: Requirements Completeness

**For EVERY feature, verify ALL layers:**

```
UI Fields → API Endpoint → Validation → Business Logic → Database Schema
```

**BEFORE declaring complete:**

- **MUST** verify each UI field has corresponding:
  - API parameter
  - Validation rule
  - Business logic handler
  - Database column (correct type)
- **MUST** test end-to-end with realistic data

**NEVER:**

- Implement UI without checking backend support
- Change data model without database migration
- Skip any layer in the stack

---

## Protocol 6: Infrastructure Management

**Service management rules:**

- **MUST** search for orchestration scripts: `start.sh`, `launch.sh`, `stop.sh`, `docker-compose.yml`
- **NEVER** start/stop individual services if orchestration exists
- **MUST** follow sequence: Stop ALL → Change → Start ALL → Verify
- **MUST** test complete cycle: `stop → launch → verify → stop`

**NEVER:**

- Start individual containers when orchestration exists
- Skip testing complete start/stop cycle
- Use outdated installation methods without validation

---

# TIER 3: STANDARD PROTOCOLS

## Protocol 7: Documentation Accuracy

**When creating documentation:**

- **ONLY** include information from actual project files
- **MUST** cite sources for every section
- **MUST** skip sections with no source material
- **NEVER** include generic tips not in project docs

**NEVER include:**

- "Common Development Tasks" unless in README
- Made-up architecture descriptions
- Commands that don't exist in package.json/Makefile
- Assumed best practices not documented

---

## Protocol 8: Batch Operations

**For large task sets:**

- **MUST** analyze conflicts (same file, same service, dependencies)
- **MUST** use batch size: 3-5 parallel tasks (ask user if unclear)
- **MUST** wait for entire batch completion before next batch
- **IF** service restart needed: complete batch first, THEN restart ALL services

**Progress tracking format:**

```
Total: N tasks
Completed: M tasks
Current batch: P tasks
Remaining: Q tasks
```

---

# TOOL SELECTION RULES

## File Search & Pattern Matching

- **MUST** use `fd` instead of `find`
- **MUST** use `rg` (ripgrep) instead of `grep`
- **Rationale**: Performance and modern alternatives

---

# WORKFLOW STANDARDS

## Pre-Task Requirements

- **ALWAYS** get current system date before starting work
- **ALWAYS** ask clarifying questions when requirements ambiguous (use `AskUserQuestion` tool)
- **ALWAYS** aim for complete clarity before execution

## During Task Execution

### Information Accuracy

- **NEVER** assume or fabricate information
- **MUST** cite sources or explicitly state when unavailable
- **Rationale**: Honesty over false confidence

### Code Development

- **NEVER** assume code works without validation
- **ALWAYS** test with real inputs/outputs
- **ALWAYS** verify language/framework documentation (Context7 MCP or web search)
- **NEVER** create stub/mock tests except for: slow external APIs, databases
- **NEVER** create tests solely to meet coverage metrics
- **Rationale**: Functional quality over vanity metrics

### Communication Style

- **NEVER** use flattery ("Great idea!", "Excellent!")
- **ALWAYS** provide honest, objective feedback
- **Rationale**: Value through truth, not validation

## Post-Task Requirements

### File Organization

- **Artifacts** (summaries, READMEs) → `./docs/artifacts/`
- **Utility scripts** → `./scripts/`
- **Documentation** → `./docs/`
- **NEVER** create artifacts in project root

### Change Tracking

- **ALWAYS** update `./CHANGELOG` before commits
- **Format**: Date + bulleted list of changes

---

# CONSOLIDATED VERIFICATION CHECKLIST

## Before Starting Any Work

- [ ] Searched for existing patterns/scripts/components?
- [ ] Listed ALL items in scope?
- [ ] Understood full stack impact (UI → API → DB)?
- [ ] Identified root cause (not just symptom)?
- [ ] Current date retrieved (if time-sensitive)?
- [ ] All assumptions clarified with user?

## Before Declaring Complete

- [ ] Ran ALL tests and they pass?
- [ ] All linters passing?
- [ ] Verified in running environment?
- [ ] No errors/warnings in logs?
- [ ] Fixed ALL related issues (searched codebase)?
- [ ] Updated ALL affected layers?
- [ ] Files organized per standards (docs/artifacts/, scripts/, docs/)?
- [ ] CHANGELOG updated (if committing)?
- [ ] Pre-commit hooks will NOT be bypassed?
- [ ] Used correct tools (fd, rg)?
- [ ] No flattery or false validation in communication?

## Never Do

- ❌ Fix symptoms without root cause analysis
- ❌ Process items without complete inventory
- ❌ Declare complete without running tests
- ❌ Dismiss failures as "pre-existing issues"
- ❌ Switch to alternatives when encountering issues
- ❌ Use generic designs instead of existing patterns
- ❌ Skip layers in the stack
- ❌ Start/stop individual services when orchestration exists
- ❌ Bypass pre-commit hooks

## Always Do

- ✅ Search entire codebase for similar issues
- ✅ List ALL items before processing
- ✅ Iterate until ALL tests pass
- ✅ Fix the EXACT issue, never switch technologies
- ✅ Study existing patterns before implementing
- ✅ Trace through entire stack (UI → API → DB)
- ✅ Use orchestration scripts for services
- ✅ Follow Git Safety Protocol

---

# META-PATTERN: THE FIVE COMMON MISTAKES

1. **Premature Completion**: Saying "Done!" without thorough verification
   - **Fix**: Always include verification results section

2. **Missing Systematic Inventory**: Processing obvious items, missing edge cases
   - **Fix**: Use glob patterns, list ALL items, verify count

3. **Insufficient Research**: Implementing without studying existing patterns
   - **Fix**: Study 3-5 examples first, extract patterns

4. **Incomplete Stack Analysis**: Fixing one layer, missing others
   - **Fix**: Trace through UI → API → DB, update ALL layers

5. **Not Following Established Patterns**: Creating new when patterns exist
   - **Fix**: Search for existing scripts/components/procedures first

---

# USAGE INSTRUCTIONS

## When to Reference Specific Protocols

- **ANY task** → No Deviation Protocol (Tier 0 - ALWAYS)
- **Fixing bugs** → Root Cause Analysis Protocol (Tier 1)
- **Batch operations** → Scope Completeness Protocol (Tier 1)
- **After changes** → Verification Loop Protocol (Tier 1)
- **UI work** → Design Consistency Protocol (Tier 2)
- **Feature development** → Requirements Completeness Protocol (Tier 2)
- **Service management** → Infrastructure Management Protocol (Tier 2)
- **Git commits** → Git Safety Protocol (Tier 0 - ALWAYS)

## Integration Approach

1. **Tier 0 protocols**: ALWAYS enforced, no exceptions
2. **Tier 1 protocols**: ALWAYS apply before/during/after work
3. **Tier 2 protocols**: Apply when context matches
4. **Tier 3 protocols**: Apply as needed for specific scenarios

**Solution Pattern**: Before starting → Research & Inventory. After finishing → Verify & Iterate.