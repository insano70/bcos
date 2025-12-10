# Standard Operating Procedures: Drizzle ORM Database Migrations

**Application Stack:** Next.js 15 / Node 24 / React 19 / PostgreSQL  
**Last Updated:** December 2025  
**Version:** 1.0

---

## Table of Contents

1. [Overview and Core Concepts](#1-overview-and-core-concepts)
2. [Architecture Components](#2-architecture-components)
3. [The Golden Rule](#3-the-golden-rule)
4. [DDL Migrations (Schema Changes)](#4-ddl-migrations-schema-changes)
5. [Data Migrations](#5-data-migrations)
6. [Verification Process](#6-verification-process)
7. [Team Workflow and Branch Management](#7-team-workflow-and-branch-management)
8. [Failure Recovery](#8-failure-recovery)
9. [Command Reference](#9-command-reference)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Overview and Core Concepts

Drizzle uses a **code-first** migration approach. Your TypeScript schema files are the source of truth, and Drizzle Kit generates SQL migration files by comparing your current schema against previous snapshots.

### How It Works

1. You modify your TypeScript schema (`schema.ts`)
2. Run `drizzle-kit generate` to create a migration
3. Drizzle compares the current schema to the most recent snapshot
4. A new migration folder is created with SQL and a new snapshot
5. Run `drizzle-kit migrate` to apply pending migrations to the database

### Key Principle

**Generate → Review → Test → Apply → Commit**

Never skip the review step. Never commit migrations you haven't tested locally.

---

## 2. Architecture Components

### 2.1 Migrations Folder Structure

```
📦 project-root
├── 📂 drizzle/                          # Output folder (configurable)
│   ├── 📂 0000_initial_setup/           # First migration folder
│   │   ├── 📜 migration.sql             # The actual SQL statements
│   │   └── 📜 snapshot.json             # Schema state after this migration
│   ├── 📂 0001_add_users_table/
│   │   ├── 📜 migration.sql
│   │   └── 📜 snapshot.json
│   └── 📂 meta/                         # Drizzle metadata
│       └── 📜 _journal.json             # Migration history/ordering
├── 📂 src/
│   └── 📜 schema.ts                     # Your TypeScript schema (source of truth)
└── 📜 drizzle.config.ts                 # Drizzle Kit configuration
```

### 2.2 Component Definitions

| Component | Purpose | Can Be Edited? |
|-----------|---------|----------------|
| `schema.ts` | TypeScript schema definitions—your source of truth | Yes, this is where you make changes |
| `migration.sql` | SQL statements to transform the database | Only before first application |
| `snapshot.json` | JSON representation of schema state at that point | Never manually edit |
| `_journal.json` | Tracks migration order and which have been generated | Never manually edit |
| `__drizzle_migrations` | Database table tracking applied migrations | Never manually edit |

### 2.3 The Journal (`_journal.json`)

The journal is critical. It maintains the sequential ordering of migrations and contains:

- Migration index/version number
- Timestamp when generated
- Migration folder name
- Hash for integrity checking

**Warning:** If the journal becomes corrupted or out of sync with your migration folders, you will encounter errors. This commonly happens during merge conflicts.

### 2.4 Snapshots

Each migration folder contains a `snapshot.json` that represents the complete database schema state after that migration would be applied. Drizzle uses the most recent snapshot to calculate the diff when you run `generate`.

**Why this matters:** If snapshots are missing, corrupted, or out of order, Drizzle cannot accurately determine what changed. This leads to incorrect or duplicate migrations.

### 2.5 Database Migrations Table

When migrations run, Drizzle creates a `__drizzle_migrations` table (configurable name) that stores:

- Hash of each applied migration
- Timestamp of when it was applied

This table is how Drizzle knows which migrations have already been applied and which are pending.

---

## 3. The Golden Rule

> **Never edit a migration file after it has been applied to any shared environment.**

Once a migration exists in `main`/`develop` or has been run on staging/production, it is immutable. If you need to change something, create a new migration.

### Why?

- Other developers may have already applied the migration locally
- CI/CD may have applied it to staging
- The migration hash is recorded in the database
- Editing will cause hash mismatches and failures

---

## 4. DDL Migrations (Schema Changes)

DDL (Data Definition Language) migrations modify database structure: tables, columns, indexes, constraints, enums, etc.

### 4.1 Process for DDL Changes

**Step 1: Modify Your Schema**

Edit your TypeScript schema file(s) to reflect the desired changes.

**Step 2: Generate the Migration**

```bash
npx drizzle-kit generate --name descriptive_name
```

Always use `--name` to give your migration a meaningful name. This helps with:
- Code review
- Understanding migration history
- Debugging issues

**Step 3: Review the Generated SQL**

Open the generated `migration.sql` and verify:

- The SQL does what you expect
- No unintended changes are included
- Column types are correct
- Constraints are as intended
- No data will be lost unexpectedly

**Step 4: Make the Migration Idempotent**

Drizzle generates strict SQL without safety guards. You **must** manually edit the generated SQL to make it idempotent before testing or committing. This ensures the migration can be safely re-run if it partially fails or if there's any ambiguity about whether it was applied.

**Required edits by operation type:**

| Operation | Drizzle Generates | Change To |
|-----------|-------------------|-----------|
| Create table | `CREATE TABLE` | `CREATE TABLE IF NOT EXISTS` |
| Drop table | `DROP TABLE` | `DROP TABLE IF EXISTS` |
| Add column | `ALTER TABLE ADD COLUMN` | `ALTER TABLE ADD COLUMN IF NOT EXISTS` |
| Drop column | `ALTER TABLE DROP COLUMN` | `ALTER TABLE DROP COLUMN IF EXISTS` |
| Create index | `CREATE INDEX` | `CREATE INDEX IF NOT EXISTS` |
| Drop index | `DROP INDEX` | `DROP INDEX IF EXISTS` |
| Create enum | `CREATE TYPE` | `DO $ BEGIN CREATE TYPE ... EXCEPTION WHEN duplicate_object THEN NULL; END $;` |
| Add enum value | `ALTER TYPE ADD VALUE` | `ALTER TYPE ADD VALUE IF NOT EXISTS` |

**Example transformation:**

*Drizzle generates:*
```sql
CREATE TABLE "users" (
  "id" SERIAL PRIMARY KEY,
  "email" TEXT NOT NULL UNIQUE
);

CREATE INDEX "users_email_idx" ON "users" ("email");

ALTER TABLE "posts" ADD COLUMN "author_id" INTEGER;
```

*You edit to:*
```sql
CREATE TABLE IF NOT EXISTS "users" (
  "id" SERIAL PRIMARY KEY,
  "email" TEXT NOT NULL UNIQUE
);

CREATE INDEX IF NOT EXISTS "users_email_idx" ON "users" ("email");

ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "author_id" INTEGER;
```

**For enum types (special handling required):**

*Drizzle generates:*
```sql
CREATE TYPE "status" AS ENUM ('pending', 'active', 'archived');
```

*You edit to:*
```sql
DO $ BEGIN
  CREATE TYPE "status" AS ENUM ('pending', 'active', 'archived');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $;
```

**Why this matters:**
- If a migration fails mid-execution, re-running it won't error on already-completed statements
- Provides safety during incident recovery
- Protects against edge cases where database state is uncertain
- Makes debugging production issues significantly easier

**Important:** Only edit the SQL file, never the snapshot.json. The snapshot must remain an accurate representation of the intended final state.

**Step 5: Test Locally**

Apply the migration to your local database:

```bash
npx drizzle-kit migrate
```

**Step 5: Verify Application State**

- Start your application
- Test affected functionality
- Check Drizzle Studio if needed: `npx drizzle-kit studio`

**Step 6: Commit All Migration Artifacts**

Commit together:
- Your schema changes
- The migration folder (SQL + snapshot)
- Any journal updates

### 4.2 Handling Renames

When you rename a column or table, Drizzle will prompt you during generation:

```
Is X a renamed column of Y? (y/n)
```

**Pay attention to these prompts.** If you answer incorrectly:
- Answering "no" to a rename creates a DROP + CREATE (data loss)
- Answering "yes" to something that isn't a rename causes errors

### 4.3 Destructive Operations

Drizzle will generate destructive SQL (DROP statements) when you:
- Remove columns from your schema
- Remove tables from your schema
- Change column types in incompatible ways

**Before committing destructive migrations:**

1. Confirm the data loss is acceptable
2. Consider whether you need a data migration first
3. Document why the change is being made

---

## 5. Data Migrations

Data migrations modify the content of your database without changing the schema structure. Examples:

- Backfilling a new column
- Transforming existing data
- Seeding reference data
- Copying data between tables

### 5.1 Creating a Data Migration

Drizzle supports custom/empty migrations for data operations:

```bash
npx drizzle-kit generate --name seed_initial_data --custom
```

This creates an empty `migration.sql` that you write manually.

### 5.2 Data Migration Best Practices

**Keep data migrations separate from DDL migrations.** A single migration should not both add a column AND backfill it. Why?

1. If the backfill fails, the DDL change is also rolled back
2. Harder to debug which part failed
3. May cause timeout issues on large tables

**Correct approach:**
1. Migration 1: Add the column (nullable or with default)
2. Migration 2: Backfill the data
3. Migration 3: Add NOT NULL constraint if needed

**Write idempotent data migrations when possible.** If the migration runs twice, it shouldn't cause errors or duplicate data.

**Test data migrations against realistic data volumes.** A migration that works on 100 rows may timeout on 1 million rows.

### 5.3 Example: Backfilling Data

```sql
-- migration.sql
-- Backfill user display_name from first_name + last_name
UPDATE users 
SET display_name = CONCAT(first_name, ' ', last_name)
WHERE display_name IS NULL;
```

### 5.4 Large Data Migrations

For tables with millions of rows, consider:

1. Running the data migration outside of Drizzle (manual script)
2. Batching updates to avoid locking
3. Running during maintenance windows
4. Using background jobs for non-blocking updates

---

## 6. Verification Process

### 6.1 Before Committing a Migration

Run through this checklist:

| Check | Command/Action |
|-------|----------------|
| Migration generates without errors | `npx drizzle-kit generate` |
| SQL looks correct | Manual review of `migration.sql` |
| Migration applies locally | `npx drizzle-kit migrate` |
| Application starts | `npm run dev` |
| Affected features work | Manual testing |
| Check command passes | `npx drizzle-kit check` |

### 6.2 The Check Command

```bash
npx drizzle-kit check
```

This validates:
- Journal consistency
- Snapshot integrity
- Migration file existence
- No corruption in metadata

**Run this before every PR that includes migrations.**

### 6.3 Testing Against a Fresh Database

Periodically (and before major releases), test that all migrations can run in sequence on an empty database:

1. Create a fresh PostgreSQL database
2. Update your connection string temporarily
3. Run `npx drizzle-kit migrate`
4. Verify all migrations complete successfully

This catches issues where migrations work incrementally but fail on fresh instances.

### 6.4 The Up Command

```bash
npx drizzle-kit up
```

Use this when Drizzle has updated its internal snapshot format. If you see errors about snapshot versions, run this command to upgrade them.

---

## 7. Team Workflow and Branch Management

### 7.1 The Core Problem

Drizzle requires a **linear migration history**. When multiple developers create migrations in parallel on different branches, conflicts occur in:
- `_journal.json`
- Snapshot files
- Migration numbering

### 7.2 Recommended Team Workflow

**Option A: Sequential Migration Numbers (Recommended for smaller teams)**

Use numeric prefixes. When conflicts occur, the developer who merges second must:

1. Abort/stash their changes
2. Pull the latest from main
3. Delete their generated migration folder
4. Re-run `npx drizzle-kit generate --name their_feature`
5. Test the new migration
6. Proceed with their PR

**Option B: Timestamp Prefixes (Better for larger teams)**

Configure Drizzle to use timestamps:

```typescript
// drizzle.config.ts
export default defineConfig({
  migrations: {
    prefix: "timestamp"  // Uses YYYYMMDDHHMMSS format
  }
});
```

This reduces filename collisions but **does not eliminate journal conflicts**.

### 7.3 Resolving Migration Conflicts

When you encounter migration conflicts after a merge:

**Step 1:** Identify what happened
- Did both branches create migrations with the same index?
- Is the journal corrupted?

**Step 2:** Choose your approach

*If your branch's migration hasn't been deployed anywhere:*
1. Delete your migration folder
2. Accept the incoming migrations (theirs)
3. Re-run `drizzle-kit generate` to recreate your migration

*If both migrations have been deployed to different environments:*
This is a serious situation. You'll need to manually reconcile the database states. Involve your tech lead.

### 7.4 Preventing Conflicts

1. **Communicate:** Before starting work that requires migrations, check if others are also making schema changes
2. **Small PRs:** Merge schema changes quickly; don't let migration PRs sit
3. **Rebase often:** If your PR is waiting for review, keep it rebased on main
4. **CI checks:** Add `drizzle-kit check` to your CI pipeline

### 7.5 Pull Request Checklist for Migrations

- [ ] Schema changes and migrations are in the same PR
- [ ] Migration has a descriptive name
- [ ] **Migration SQL has been edited for idempotency**
- [ ] `drizzle-kit check` passes
- [ ] Migration has been tested locally
- [ ] No manual edits to snapshots or journal
- [ ] PR description explains what the migration does

---

## 8. Failure Recovery

### 8.1 Migration Failed Mid-Execution

**Symptoms:**
- Migration command exited with an error
- Database is in an inconsistent state
- Some tables/columns exist, others don't

**Recovery:**

1. **Check what was applied:** Look at the `__drizzle_migrations` table to see what's recorded

2. **Assess the damage:** Connect to the database and inspect the schema state

3. **Manual cleanup:** You may need to:
   - Manually run remaining statements from the migration
   - Or manually roll back partial changes
   
4. **Fix and re-run:** Once the database is in a known state, you can proceed

**Prevention:** Test migrations locally first, always.

### 8.2 Snapshot Corruption

**Symptoms:**
- `drizzle-kit generate` produces unexpected output
- Errors about snapshot versions or format

**Recovery:**

1. Run `npx drizzle-kit up` to upgrade snapshot format
2. If that fails, you may need to regenerate from scratch:
   - Pull the schema from your database: `npx drizzle-kit pull`
   - Compare with your TypeScript schema
   - Carefully rebuild the migration history

### 8.3 Journal Corruption

**Symptoms:**
- Errors mentioning `_journal.json`
- Migration ordering issues

**Recovery:**

1. Run `npx drizzle-kit check` to identify issues
2. If the journal references missing migrations, you'll need to either:
   - Restore the missing migration files from git history
   - Or carefully edit the journal to match existing files (last resort)

### 8.4 Database and Code Out of Sync

**Symptoms:**
- Application errors about missing columns/tables
- Migrations that "should have run" showing as pending

**Recovery:**

1. Check `__drizzle_migrations` table for applied migrations
2. Compare with your migration folder
3. Either:
   - Manually run missing migrations
   - Or if the schema is actually correct, manually insert the migration record

### 8.5 Drizzle Does Not Support Automatic Rollbacks

**Important:** Drizzle does not generate "down" migrations. If you need to revert a migration:

1. Create a new migration that reverses the changes
2. The new migration should be the opposite operation (e.g., if you added a column, create a migration that drops it)

---

## 9. Command Reference

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `drizzle-kit generate` | Create migration from schema diff | After modifying schema.ts |
| `drizzle-kit generate --name xyz` | Create named migration | Always use --name |
| `drizzle-kit generate --custom` | Create empty migration for data changes | For data migrations |
| `drizzle-kit migrate` | Apply pending migrations | After generating, for deployment |
| `drizzle-kit check` | Validate migration consistency | Before PRs, in CI |
| `drizzle-kit up` | Upgrade snapshot versions | When prompted by Drizzle |
| `drizzle-kit push` | Sync schema directly (no migrations) | Local development only, never production |
| `drizzle-kit pull` | Generate schema from database | Reverse engineering, troubleshooting |
| `drizzle-kit studio` | Visual database browser | Development, debugging |

### 9.1 Push vs. Generate/Migrate

**`drizzle-kit push`**: Directly synchronizes your schema to the database without creating migration files. 

- Use for: Rapid local development, throwaway databases
- Never use for: Staging, production, any shared environment
- Why: No migration history, not reproducible, can't be reviewed

**`drizzle-kit generate` + `drizzle-kit migrate`**: Creates versioned, reviewable migration files.

- Use for: All shared environments, any database that matters
- Why: Audit trail, code review, reproducible, team-friendly

---

## 10. Troubleshooting

### "No schema changes detected"

**Cause:** Your TypeScript schema matches the most recent snapshot.

**Check:**
- Did you save your schema file?
- Are you pointing to the correct schema path in `drizzle.config.ts`?
- Did someone else already generate the same migration?

### "Snapshot is not of the latest version"

**Cause:** Drizzle updated its internal format.

**Fix:** Run `npx drizzle-kit up`

### Duplicate Table/Column Errors

**Cause:** Migration trying to create something that exists.

**Possible reasons:**
- Migration was partially applied before
- Someone manually created the object
- Another migration already created it

**Fix:** Inspect the database, determine correct state, and either manually complete the migration or adjust the database.

### Migration Hangs

**Cause:** Usually a lock contention issue.

**Check:**
- Is another process holding locks on affected tables?
- Are there long-running transactions?
- Is the table very large and the migration doing a full table scan?

### "Migration has already been applied"

**Cause:** The migration hash exists in `__drizzle_migrations`.

**If legitimate:** Migration ran; nothing to do.

**If incorrect:** Someone may have manually inserted the record, or there's a hash collision (rare). Investigate the actual database state.

---

## Appendix: drizzle.config.ts Template

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  // Required
  dialect: "postgresql",
  schema: "./src/db/schema.ts",  // Adjust to your schema location
  
  // Connection
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  
  // Output configuration
  out: "./drizzle",
  
  // Migration settings
  migrations: {
    prefix: "index",  // or "timestamp" for larger teams
    table: "__drizzle_migrations",
    schema: "public",
  },
  
  // Useful options
  strict: true,   // Fail on warnings
  verbose: true,  // Detailed output
});
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | Dec 2025 | [Team] | Initial release |

---

*Questions about this SOP? Consult your tech lead or open a discussion in the team channel.*
