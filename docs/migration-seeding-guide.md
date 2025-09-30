# Migration Seeding Guide - One-Time Setup

## ⚠️ CRITICAL: Read This Before Deploying

Your staging and production databases have migrations that were run manually **before** Drizzle migration tracking was implemented. This means:

1. ❌ All migrations are already applied to the database schema
2. ❌ But Drizzle doesn't know they've been applied
3. ❌ On first automated deployment, Drizzle will try to re-run ALL migrations
4. ❌ This will cause deployment to **FAIL** immediately

## The Problem

Drizzle tracks applied migrations in a table called `__drizzle_migrations`. When you run migrations, Drizzle:
1. Checks which migrations are in this tracking table
2. Runs only the migrations that aren't tracked yet
3. Marks them as applied

Since your migrations were run manually, this table either:
- Doesn't exist, OR
- Exists but is empty

Result: Drizzle thinks NO migrations have been applied and will try to run them all.

## Migration Analysis

### Migrations That Will Fail If Re-Run:

| Migration | Issue | Will Fail Because |
|-----------|-------|-------------------|
| `0000_plain_toad.sql` | CREATE TABLE | Tables already exist |
| `0001_superb_magik.sql` | ALTER TABLE ADD COLUMN | Columns already exist |
| `0002_stale_madripoor.sql` | CREATE TABLE | Tables already exist |
| `0003_misty_sabretooth.sql` | CREATE TABLE | Tables already exist |
| `0007_overjoyed_vivisector.sql` | DROP CONSTRAINT | Constraints already dropped |
| `0008_drop_chart_component_configs.sql` | DROP TABLE, RENAME | Already done |
| `0009_rename_chart_display_configs_to_configurations.sql` | RENAME, DROP | Already done |
| `0010_melodic_albert_cleary.sql` | CREATE TABLE | Table already exists |
| `0011_unique_mandrill.sql` | ALTER TABLE ADD COLUMN | Column already exists |

**None of these migrations are safe to re-run.**

## The Solution: Seed the Migrations Table

We've created a script that tells Drizzle "these migrations have already been applied."

The script:
1. Creates the `__drizzle_migrations` table if it doesn't exist
2. Reads each migration SQL file
3. Generates a hash for each migration (matching Drizzle's process)
4. Inserts records marking them as already applied
5. Uses the original migration timestamps from the journal

After running this script, Drizzle will skip all existing migrations and only run NEW ones going forward.

## How to Run the Seeding Script

### Prerequisites

✅ Direct database access (RDS endpoint or bastion host)  
✅ DATABASE_URL environment variable set  
✅ All migrations already applied to the database manually

### Step-by-Step Process

#### 1. Test Locally First (Recommended)

```bash
# Make sure your local db matches staging/production
# (i.e., all migrations already applied)

# Set your database URL
export DATABASE_URL="postgresql://user:pass@localhost:5432/bcos_d"

# Run the seeding script
pnpm db:migrate:seed
```

Expected output:
```
🔄 Seeding Drizzle migrations table...
📊 Environment: development
⏰ Timestamp: 2025-09-30T...

📋 Found 12 migrations in journal

📦 Creating __drizzle_migrations table...
✅ Created __drizzle_migrations table

📊 Found 0 already applied migrations

✅ Seeded 0000_plain_toad (1757494035694)
✅ Seeded 0001_superb_magik (1757497122270)
✅ Seeded 0002_stale_madripoor (1757506130944)
✅ Seeded 0003_misty_sabretooth (1757601596512)
⚠️  Warning: Migration file not found: 0004_magical_bucky.sql
   This migration is in the journal but SQL file is missing.
   Skipping...
⚠️  Warning: Migration file not found: 0005_famous_the_leader.sql
   Skipping...
⚠️  Warning: Migration file not found: 0006_married_ultron.sql
   Skipping...
✅ Seeded 0007_overjoyed_vivisector (1758119005111)
✅ Seeded 0008_drop_chart_component_configs (1758198999383)
✅ Seeded 0009_rename_chart_display_configs_to_configurations (1758200673228)
✅ Seeded 0010_melodic_albert_cleary (1758639850414)
✅ Seeded 0011_unique_mandrill (1758737685203)

═══════════════════════════════════════════════════════════
  SEEDING COMPLETE
═══════════════════════════════════════════════════════════
✅ Successfully seeded: 9 migrations
⏭️  Skipped (already applied): 3 migrations
📊 Total migrations tracked: 9

✨ Drizzle will now only apply NEW migrations going forward
═══════════════════════════════════════════════════════════
```

#### 2. Verify Locally

```bash
# Test that migration runner works
pnpm db:migrate
```

Expected output (if no new migrations):
```
🔄 Starting database migrations...
📊 Environment: development
⏰ Timestamp: 2025-09-30T...
✅ Migrations completed successfully
```

#### 3. Run on Staging

**Option A: Using AWS ECS Exec (Recommended)**

```bash
# Get a running staging task ARN
TASK_ARN=$(aws ecs list-tasks \
  --cluster bcos-staging-cluster \
  --service-name bcos-staging-service \
  --desired-status RUNNING \
  --query 'taskArns[0]' \
  --output text)

# Execute seeding script on the running container
aws ecs execute-command \
  --cluster bcos-staging-cluster \
  --task ${TASK_ARN} \
  --container bcos \
  --interactive \
  --command "node --import tsx/esm scripts/seed-drizzle-migrations.ts"
```

**Option B: Run as One-Off ECS Task**

```bash
# Get network configuration
PRIVATE_SUBNETS=$(aws cloudformation describe-stacks \
  --stack-name BCOS-NetworkStack \
  --query 'Stacks[0].Outputs[?OutputKey==`PrivateSubnetIds`].OutputValue' \
  --output text)

ECS_SECURITY_GROUP=$(aws cloudformation describe-stacks \
  --stack-name BCOS-NetworkStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ECSSecurityGroupId`].OutputValue' \
  --output text)

# Run seeding task
aws ecs run-task \
  --cluster bcos-staging-cluster \
  --task-definition bcos-staging \
  --network-configuration "awsvpcConfiguration={subnets=[${PRIVATE_SUBNETS}],securityGroups=[${ECS_SECURITY_GROUP}],assignPublicIp=DISABLED}" \
  --launch-type FARGATE \
  --overrides '{
    "containerOverrides": [{
      "name": "bcos",
      "command": ["node", "--import", "tsx/esm", "scripts/seed-drizzle-migrations.ts"]
    }]
  }'
```

**Option C: Via Bastion Host (if available)**

```bash
# SSH to bastion
ssh bastion-host

# Set environment
export DATABASE_URL="postgresql://user:pass@staging-rds.xxx.rds.amazonaws.com:5432/bcos"

# Run seeding
tsx scripts/seed-drizzle-migrations.ts
```

#### 4. Verify on Staging

Check the database:
```sql
-- Connect to staging database
SELECT * FROM drizzle.__drizzle_migrations ORDER BY id;
```

You should see 9 rows with hashes and timestamps.

#### 5. Repeat for Production

```bash
# Same process as staging, but use:
# - bcos-production-cluster
# - bcos-production-service
# - bcos-production task definition
# - Production DATABASE_URL
```

## After Seeding

### What Changes?

✅ **Automated deployments will work**  
- First deployment will check migrations table
- Find all existing migrations already marked as applied
- Skip them and only run NEW migrations

✅ **Future migrations are safe**  
- Generate new migration: `pnpm db:generate`
- Commit and push to staging
- GitHub Actions will run migration automatically
- Only the NEW migration will be applied

✅ **No manual steps required**  
- All future migrations run through CI/CD
- Drizzle properly tracks everything

### Verification After First Deployment

After your first automated deployment to staging:

```bash
# Check GitHub Actions logs
# Look for "Run database migrations" step
# Should show: "✅ Migrations completed successfully"
# Should NOT show any SQL execution (no new migrations)
```

## Important Notes

### Run This BEFORE First Automated Deployment

**Critical Timeline:**

1. ✅ Seed migrations table on staging
2. ✅ Seed migrations table on production  
3. ✅ THEN push code with CI/CD changes

If you deploy first, the deployment will fail when trying to run migrations.

### This is a ONE-TIME Operation

- Run once per environment
- Never needs to be run again
- Future migrations handled automatically by Drizzle

### Safety Checks

The script is safe to run multiple times:
- Checks if migrations already seeded
- Skips already-applied migrations
- Only seeds new entries

### Missing Migrations (0004-0006)

The journal references migrations 0004-0006, but the SQL files don't exist. This is normal if:
- They were generated during development then deleted
- They were squashed into other migrations
- They were experimental and abandoned

The script handles this gracefully by skipping them with a warning.

## Troubleshooting

### "Permission denied" on database

Make sure the DATABASE_URL user has permissions:
```sql
GRANT CREATE ON SCHEMA drizzle TO your_user;
GRANT ALL ON ALL TABLES IN SCHEMA drizzle TO your_user;
```

### "Table already exists" error

If `__drizzle_migrations` already exists:
- Check if it has records: `SELECT * FROM drizzle.__drizzle_migrations;`
- If it has records, migrations might already be seeded
- If empty, the script will populate it

### Script fails mid-way

Safe to re-run:
- Already seeded migrations will be skipped
- Only missing entries will be added

## Alternative: Rewrite Migrations (NOT RECOMMENDED)

Instead of seeding, you could rewrite all migrations to be idempotent:
- Add `IF NOT EXISTS` to all `CREATE TABLE`
- Add column existence checks to all `ALTER TABLE ADD COLUMN`
- Add existence checks to all `DROP` statements
- Handle all `RENAME` operations conditionally

**Why this is NOT recommended:**
- Time-consuming and error-prone
- Drizzle-generated migrations would need manual editing
- Future Drizzle updates might conflict
- Seeding is the proper Drizzle-supported approach

## Summary

1. **Before first automated deployment:**
   - Run seeding script on staging database
   - Run seeding script on production database
   - Verify migrations table populated

2. **Deploy with confidence:**
   - Push to staging branch
   - Watch migrations step succeed with no SQL execution
   - Verify application deployed successfully

3. **Future migrations:**
   - `pnpm db:generate` to create migration
   - Commit and push
   - Automatic deployment runs migration
   - Everything tracked properly

This one-time seeding bridges the gap between manual migrations and automated Drizzle tracking. After this, your CI/CD pipeline will handle everything automatically! 🎉
