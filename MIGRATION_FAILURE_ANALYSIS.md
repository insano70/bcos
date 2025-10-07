# Migration Failure Analysis Report

**Date**: 2025-10-06
**Status**: 🔴 **CRITICAL - Migrations not executing in staging/production**

---

## Executive Summary

**Root Cause Identified**: The migration runner is successfully executing, but **3 recent migrations are being skipped** because they are not registered in the Drizzle migration journal (`lib/db/migrations/meta/_journal.json`).

**Impact**:
- **0019_webauthn_mfa.sql** - WebAuthn/MFA tables not created
- **0020_add_icon_columns.sql** - Icon columns missing
- **0021_add_dashboard_default.sql** - Dashboard default not set

---

## Investigation Findings

### 1. Migration Execution is Working

The CI/CD pipeline is successfully:
- ✅ Creating migration task definitions
- ✅ Running ECS Fargate tasks
- ✅ Executing `npx tsx scripts/run-migrations.ts`
- ✅ Connecting to the database
- ✅ Completing with exit code 0

**Evidence from logs** (`/ecs/bcos-migrations-staging`):
```
2025-10-06T23:41:44 🔄 Starting database migrations...
2025-10-06T23:41:44 📊 Environment: production
2025-10-06T23:41:44 ⏰ Timestamp: 2025-10-06T23:41:44.388Z
2025-10-06T23:41:44 {
  severity_local: 'NOTICE',
  message: 'schema "drizzle" already exists, skipping',
}
2025-10-06T23:41:44 {
  severity_local: 'NOTICE',
  message: 'relation "__drizzle_migrations" already exists, skipping',
}
2025-10-06T23:41:44 ✅ Migrations completed successfully
```

**Interpretation**: The migration runner starts, finds the drizzle schema and migrations table already exist, and completes successfully. However, it's **not finding any NEW migrations to apply**.

---

### 2. The Missing Migrations Problem

#### Files on Disk (19 total):
```
lib/db/migrations/0000_plain_toad.sql
lib/db/migrations/0001_superb_magik.sql
lib/db/migrations/0002_stale_madripoor.sql
lib/db/migrations/0003_misty_sabretooth.sql
lib/db/migrations/0007_overjoyed_vivisector.sql
lib/db/migrations/0008_drop_chart_component_configs.sql
lib/db/migrations/0009_rename_chart_display_configs_to_configurations.sql
lib/db/migrations/0010_melodic_albert_cleary.sql
lib/db/migrations/0011_unique_mandrill.sql
lib/db/migrations/0012_test_dummy_table.sql
lib/db/migrations/0013_drop_dummy_table.sql
lib/db/migrations/0014_add_chart_columns_baseline.sql
lib/db/migrations/0015_saml_support.sql
lib/db/migrations/0016_saml_replay_prevention.sql
lib/db/migrations/0017_csrf_failure_events.sql
lib/db/migrations/0018_oidc_state_management.sql
lib/db/migrations/0019_webauthn_mfa.sql          ⚠️ NOT IN JOURNAL
lib/db/migrations/0020_add_icon_columns.sql      ⚠️ NOT IN JOURNAL
lib/db/migrations/0021_add_dashboard_default.sql ⚠️ NOT IN JOURNAL
```

#### Entries in _journal.json (16 total):
```json
{
  "version": "7",
  "dialect": "postgresql",
  "entries": [
    { "idx": 0,  "tag": "0000_plain_toad" },
    { "idx": 1,  "tag": "0001_superb_magik" },
    { "idx": 2,  "tag": "0002_stale_madripoor" },
    { "idx": 3,  "tag": "0003_misty_sabretooth" },
    { "idx": 4,  "tag": "0007_overjoyed_vivisector" },
    { "idx": 5,  "tag": "0008_drop_chart_component_configs" },
    { "idx": 6,  "tag": "0009_rename_chart_display_configs_to_configurations" },
    { "idx": 7,  "tag": "0010_melodic_albert_cleary" },
    { "idx": 8,  "tag": "0011_unique_mandrill" },
    { "idx": 9,  "tag": "0012_test_dummy_table" },
    { "idx": 10, "tag": "0013_drop_dummy_table" },
    { "idx": 11, "tag": "0014_add_chart_columns_baseline" },
    { "idx": 12, "tag": "0015_saml_support" },
    { "idx": 13, "tag": "0016_saml_replay_prevention" },
    { "idx": 14, "tag": "0017_csrf_failure_events" },
    { "idx": 15, "tag": "0018_oidc_state_management" }
    // ⚠️ MISSING: 0019, 0020, 0021
  ]
}
```

**Key Finding**: Drizzle ORM's migration runner **only executes migrations that are listed in `_journal.json`**. The 3 missing migrations exist as SQL files but are invisible to the migration runner.

---

### 3. How Drizzle Migrations Work

From `scripts/run-migrations.ts` (Lines 38-41):
```typescript
await migrate(db, {
  migrationsFolder: './lib/db/migrations'
});
```

The `migrate()` function:
1. Reads `./lib/db/migrations/meta/_journal.json`
2. Compares journal entries with `drizzle.__drizzle_migrations` table in database
3. Applies any migrations from the journal that haven't been applied yet
4. **Ignores any .sql files not in the journal**

**Source**: [drizzle-orm migrator.ts](https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/migrator.ts)

---

### 4. Why the Journal is Out of Sync

#### Normal Migration Generation Process:
```bash
# Developer runs this locally:
pnpm drizzle-kit generate

# This command:
# 1. Reads lib/db/schema.ts
# 2. Compares with current migrations
# 3. Generates new SQL file (e.g., 0019_webauthn_mfa.sql)
# 4. Updates meta/_journal.json with new entry
# 5. Creates snapshot in meta/ directory
```

#### What Likely Happened:
The 3 missing migrations were created **manually or through a broken generation process** that:
- ✅ Created the .sql files
- ❌ Did NOT update _journal.json
- ❌ Did NOT create corresponding snapshots in meta/ directory

**Evidence**:
```bash
$ ls -lh lib/db/migrations/0019_webauthn_mfa.sql
-rw-r--r--  1 pstewart  staff   4.0K Oct  6 18:13 lib/db/migrations/0019_webauthn_mfa.sql

$ ls -lh lib/db/migrations/0020_add_icon_columns.sql
-rw-r--r--  1 pstewart  staff   642B Oct  7 04:27 lib/db/migrations/0020_add_icon_columns.sql

$ ls -lh lib/db/migrations/0021_add_dashboard_default.sql
-rw-r--r--  1 pstewart  staff   734B Oct  6 18:13 lib/db/migrations/0021_add_dashboard_default.sql
```

These files were created on October 6-7, 2025, but the journal was last updated for migration 0018.

---

### 5. Historical Error from Sep 30

From logs (`/ecs/bcos-migrations-staging` on 2025-09-30):
```
Error: No file ./lib/db/migrations/0004_magical_bucky.sql found in ./lib/db/migrations folder
```

**This confirms**:
- The journal referenced migration `0004_magical_bucky`
- The SQL file didn't exist
- This caused migration failures

**Analysis**: There's a pattern of journal/SQL file mismatches. Likely causes:
1. Migrations generated on different branches
2. Partial commits (journal committed, SQL files not, or vice versa)
3. Manual SQL file creation without running `drizzle-kit generate`

---

### 6. Docker Container Analysis

From `Dockerfile` (Lines 59-62):
```dockerfile
# Copy migration files and scripts for database migrations
COPY --from=builder --chown=bcos:nodejs /app/lib/db/migrations ./lib/db/migrations
COPY --from=builder --chown=bcos:nodejs /app/scripts/run-migrations.ts ./scripts/run-migrations.ts
COPY --from=builder --chown=bcos:nodejs /app/drizzle.config.ts ./drizzle.config.ts
```

**Analysis**: The Dockerfile correctly copies the **entire** `lib/db/migrations` directory, including:
- ✅ All .sql files (including 0019, 0020, 0021)
- ✅ The `meta/` subdirectory
- ✅ The `meta/_journal.json` file

So the container HAS all the files, but Drizzle ignores the .sql files not in the journal.

---

### 7. CI/CD Migration Task Configuration

From `.github/workflows/deploy-staging.yml` (Lines 162-187):
```yaml
containerDefinitions: [{
  "name": "migration-runner",
  "image": "${{ steps.login-ecr.outputs.registry }}/${{ env.ECR_REPOSITORY }}:${{ steps.vars.outputs.IMAGE_TAG }}",
  "command": ["npx", "tsx", "scripts/run-migrations.ts"],
  "secrets": [
    {
      "name": "DATABASE_URL",
      "valueFrom": "${SECRET_ARN}:DATABASE_URL::"
    }
  ],
  "environment": [
    {
      "name": "NODE_ENV",
      "value": "production"
    }
  ]
}]
```

**Analysis**:
- ✅ Correctly uses the same Docker image as the application
- ✅ Has DATABASE_URL secret
- ✅ Runs the migration script

**Issue**: The migration script uses whatever _journal.json is in the image, which is out of date.

---

## Root Cause Summary

```
┌─────────────────────────────────────────────────────────────────┐
│  ROOT CAUSE: _journal.json is missing 3 migrations              │
│                                                                   │
│  SQL Files:    19 migrations (0000-0021, skip 0004-0006)        │
│  Journal:      16 migrations (0000-0018, skip 0004-0006)        │
│  Missing:      0019, 0020, 0021                                  │
│                                                                   │
│  Impact:       Drizzle ORM ignores .sql files not in journal    │
│  Result:       Migrations appear successful but skip new SQL    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Why It Appears to Work

The migration runner completes successfully because:

1. **It doesn't fail** - Drizzle successfully processes all 16 migrations in the journal
2. **Most are already applied** - Database has all 16 from previous runs
3. **Exit code is 0** - No errors occurred (journal is valid, DB is accessible)
4. **Logs show "✅ Migrations completed successfully"** - Technically true for journal entries

From Drizzle's perspective, there are **no pending migrations** because it only knows about what's in the journal.

---

## Missing Migration Details

### Migration 0019: webauthn_mfa.sql (4.0KB)
**Purpose**: Create WebAuthn/MFA tables
**Created**: Oct 6, 2025 18:13
**Impact if not applied**:
- `webauthn_credentials` table missing
- `webauthn_challenges` table missing
- `account_security` table missing
- **MFA functionality will fail** (can't store passkeys)

### Migration 0020: add_icon_columns.sql (642B)
**Purpose**: Add icon-related columns
**Created**: Oct 7, 2025 04:27
**Impact if not applied**:
- Missing icon columns in relevant tables
- UI may have issues displaying icons

### Migration 0021: add_dashboard_default.sql (734B)
**Purpose**: Set default dashboard configurations
**Created**: Oct 6, 2025 18:13
**Impact if not applied**:
- Missing default dashboard settings
- Users may experience missing/incorrect defaults

---

## Verification Commands

### Check what's in the journal:
```bash
cat lib/db/migrations/meta/_journal.json | jq '.entries | length'
# Output: 16
```

### Check SQL files on disk:
```bash
ls -1 lib/db/migrations/*.sql | wc -l
# Output: 19
```

### Check which are missing:
```bash
diff <(ls -1 lib/db/migrations/*.sql | xargs -n1 basename | sed 's/\.sql$//') \
     <(cat lib/db/migrations/meta/_journal.json | jq -r '.entries[].tag')
# Output:
# > 0019_webauthn_mfa
# > 0020_add_icon_columns
# > 0021_add_dashboard_default
```

### Check recent migration task logs:
```bash
aws logs tail /ecs/bcos-migrations-staging --since 1h --format short
aws logs tail /ecs/bcos-migrations-production --since 1h --format short
```

---

## Why CI/CD Reports Success

From `.github/workflows/deploy-staging.yml` (Lines 232-241):
```yaml
if [ "${EXIT_CODE}" != "0" ]; then
  echo "❌ Migration failed with exit code: ${EXIT_CODE}"
  exit 1
fi

echo "✅ Database migrations completed successfully"
```

The check only validates that:
- ✅ The migration task didn't crash
- ✅ Exit code was 0
- ✅ No exceptions thrown

It does **NOT** verify:
- ❌ That ALL .sql files were applied
- ❌ That the journal is complete
- ❌ That the database schema matches the application's expectations

---

## Comparison with Working vs Broken State

### Working State (Expected):
```
lib/db/migrations/
├── 0000_plain_toad.sql
├── 0001_superb_magik.sql
├── ...
├── 0018_oidc_state_management.sql
├── 0019_webauthn_mfa.sql
├── 0020_add_icon_columns.sql
├── 0021_add_dashboard_default.sql
└── meta/
    ├── _journal.json              ← Contains 19 entries (0-18, skip 4-6, include 19-21)
    ├── 0000_snapshot.json
    ├── ...
    ├── 0018_snapshot.json
    ├── 0019_snapshot.json         ← Should exist
    ├── 0020_snapshot.json         ← Should exist
    └── 0021_snapshot.json         ← Should exist
```

### Current State (Broken):
```
lib/db/migrations/
├── 0000_plain_toad.sql
├── 0001_superb_magik.sql
├── ...
├── 0018_oidc_state_management.sql
├── 0019_webauthn_mfa.sql          ✅ File exists
├── 0020_add_icon_columns.sql      ✅ File exists
├── 0021_add_dashboard_default.sql ✅ File exists
└── meta/
    ├── _journal.json              ❌ Only has 16 entries (stops at 0018)
    ├── 0000_snapshot.json
    ├── ...
    └── 0018_snapshot.json
    ├── (0019_snapshot.json)       ❌ Missing
    ├── (0020_snapshot.json)       ❌ Missing
    └── (0021_snapshot.json)       ❌ Missing
```

---

## Additional Evidence

### Check if snapshots exist:
```bash
ls -1 lib/db/migrations/meta/*.json | grep -E '001[89]|002[01]'
# Expected to find: 0018, 0019, 0020, 0021
# Actual: Only 0018 exists
```

### Journal entry structure:
Each entry in `_journal.json` should have:
```json
{
  "idx": 19,
  "version": "7",
  "when": 1759655100000,  // Unix timestamp
  "tag": "0019_webauthn_mfa",
  "breakpoints": true
}
```

These entries are NOT present for migrations 0019-0021.

---

## Related Issues

### Issue 1: Missing migrations 0004-0006
The numbering jumps from 0003 to 0007, suggesting migrations 0004, 0005, and 0006 were either:
- Deleted
- Never generated properly
- Generated on a branch that wasn't merged

### Issue 2: Sep 30 error about 0004_magical_bucky
This migration was in the journal but the SQL file didn't exist, causing failures. This suggests:
- Someone removed the SQL file without updating the journal, OR
- The journal was corrupted/manually edited

---

## Recommended Solution (Preview - Not Implemented)

The solution involves updating `_journal.json` to include the missing migrations. However, this requires:

1. **Determining the correct timestamps** for "when" field
2. **Creating corresponding snapshot files** in meta/ directory
3. **Ensuring idx sequencing** is correct
4. **Testing locally** before deploying
5. **Committing all files together** (SQL, journal, snapshots)

This is a delicate operation that should be done carefully to avoid breaking the migration history.

---

## Conclusion

**The migration runner is working correctly** - it's executing the migrations listed in the journal. The problem is that the journal is incomplete.

**Impact Assessment**:
- 🔴 **CRITICAL**: WebAuthn/MFA tables not created in staging/production
- 🟡 **HIGH**: Icon columns missing
- 🟡 **HIGH**: Dashboard defaults not set

**Next Steps**: User needs to decide on remediation approach (detailed plan would be provided upon request).

---

**Report Generated**: 2025-10-06
**Analysis Type**: Read-only investigation
**Analyst**: Claude Code
