# Database Migration Procedures

**Quick reference for creating and deploying database migrations**

## Creating a New Migration

### 1. Make Schema Changes
Edit the appropriate schema file in `lib/db/`:
- `lib/db/schema.ts` - Main tables
- `lib/db/analytics-schema.ts` - Analytics tables
- `lib/db/webauthn-schema.ts` - WebAuthn tables
- `lib/db/refresh-token-schema.ts` - Auth tables
- etc.

### 2. Generate Migration
```bash
pnpm drizzle-kit generate
```

This will:
- ✅ Create a new SQL file in `lib/db/migrations/`
- ✅ Create a snapshot in `lib/db/migrations/meta/`
- ✅ Update `lib/db/migrations/meta/_journal.json`

### 3. Review Generated SQL
- Open the new `.sql` file in `lib/db/migrations/`
- Verify the changes match your intent
- Check for any unexpected ALTER statements
- Ensure idempotency if needed (see below)

### 4. Test Locally
```bash
# Set your local DATABASE_URL
DATABASE_URL="postgresql://user:pass@localhost:5432/dbname" npx tsx scripts/run-migrations.ts
```

### 5. Commit Changes
```bash
git add lib/db/migrations/
git add lib/db/schema*.ts
git commit -m "Add migration for [feature]"
```

### 6. Deploy
```bash
# Push to staging first
git push origin staging

# After testing, merge to main
git checkout main
git merge staging
git push origin main
```

## When to Make Migrations Idempotent

### Standard Migrations (Default)
Use Drizzle's generated SQL as-is when:
- ✅ Fresh tables/columns being added
- ✅ First-time deployment of a feature
- ✅ Normal incremental schema changes

### Idempotent Migrations (Special Cases)
Add idempotency checks when:
- ⚠️ Migration might be partially applied
- ⚠️ Rolling back and reapplying
- ⚠️ Multiple environments with different states

Example idempotent patterns:
```sql
-- Tables
CREATE TABLE IF NOT EXISTS "table_name" (...);

-- Columns (use DO block)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'my_table'
                   AND column_name = 'my_column') THEN
        ALTER TABLE "my_table" ADD COLUMN "my_column" text;
    END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS "idx_name" ON "table" ("column");

-- Constraints
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                   WHERE constraint_name = 'my_constraint') THEN
        ALTER TABLE "my_table" ADD CONSTRAINT "my_constraint" ...;
    END IF;
END $$;
```

## Common Mistakes to Avoid

### ❌ DON'T: Use drizzle-kit push
```bash
# NEVER do this in production!
pnpm drizzle-kit push
```
**Why:** Bypasses migration tracking, causes environment inconsistencies.

### ❌ DON'T: Manually edit _journal.json
The journal is managed by drizzle-kit. Manual edits cause corruption.

### ❌ DON'T: Delete deployed migrations
Migrations are immutable once deployed. Create a new migration to reverse changes.

### ❌ DON'T: Create test migrations in production code
Test migrations in a separate database, not in the main migrations folder.

### ❌ DON'T: Skip testing in staging
Always deploy to staging first to catch issues before production.

## CI/CD Integration

Our GitHub Actions workflow automatically:
1. Builds Docker image with latest code
2. Runs migration task in ECS Fargate
3. Executes `scripts/run-migrations.ts`
4. Deploys application if migrations succeed

**No manual intervention needed** - just push to the branch!

## Troubleshooting

### Migration fails with "table already exists"
- Migration is not idempotent
- Add `IF NOT EXISTS` or DO blocks (see above)

### Migration fails with "column already exists"
- Use DO blocks with information_schema checks
- See idempotent patterns above

### Journal out of sync with files
```bash
# Check sync status
cat lib/db/migrations/meta/_journal.json | jq -r '.entries[].tag' | sort > /tmp/journal.txt
ls lib/db/migrations/*.sql | xargs -n1 basename | sed 's/.sql$//' | sort > /tmp/files.txt
diff /tmp/journal.txt /tmp/files.txt
```
**Fix:** Don't manually fix. Contact team lead.

### Missing snapshot files
Not critical - snapshots are only needed for generating new migrations.
Next `drizzle-kit generate` will create missing snapshots.

## Emergency Rollback

If a migration causes production issues:

### Option 1: Forward Fix (Preferred)
Create a new migration that reverses the change:
```bash
# Edit schema to reverse the change
pnpm drizzle-kit generate
# Review, test, deploy
```

### Option 2: Manual SQL (Last Resort)
```sql
-- Connect to production database
-- Manually reverse the migration SQL
-- Add entry to __drizzle_migrations to mark as rolled back
```
**⚠️ Only use if absolutely necessary and with team approval**

## Support

Questions? Check:
1. This document
2. `/Users/pstewart/bcos/MIGRATION_VALIDATION_REPORT.md`
3. `/Users/pstewart/bcos/MIGRATION_FAILURE_ANALYSIS.md`
4. `/Users/pstewart/bcos/CLAUDE.md` - Project rules
5. Ask team lead

## References

- [Drizzle Kit Documentation](https://orm.drizzle.team/kit-docs/overview)
- [Drizzle Migrations](https://orm.drizzle.team/docs/migrations)
- Project: `/Users/pstewart/bcos`
