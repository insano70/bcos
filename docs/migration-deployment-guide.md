# Database Migration Deployment Guide

## ⚠️ CRITICAL: First-Time Setup Required

**Before using automated migrations**, you **MUST** run the one-time seeding script on staging and production databases. See [Migration Seeding Guide](./migration-seeding-guide.md) for detailed instructions.

**Why?** Your databases have migrations that were run manually before Drizzle tracking existed. Without seeding the migrations table, automated deployments will fail when trying to re-run existing migrations.

**Quick Start:**
1. Read [Migration Seeding Guide](./migration-seeding-guide.md)
2. Run seeding script on staging: `pnpm db:migrate:seed`
3. Run seeding script on production: `pnpm db:migrate:seed`
4. Then proceed with automated deployments

---

## Overview

Automated Drizzle database migrations are now integrated into the CI/CD pipeline. Migrations run automatically during each deployment, before the application is updated.

## How It Works

### Deployment Flow

```
1. Code pushed to staging/main branch
2. Docker image built and pushed to ECR
3. ✨ Migration task created and executed ✨
   - Runs in isolated ECS task
   - Uses same database credentials from Secrets Manager
   - Exits after completion
4. If migrations succeed → Application deployment continues
5. If migrations fail → Deployment stops (application unchanged)
```

### Migration Task Details

**Task Configuration:**
- **Family**: `bcos-migration-staging` or `bcos-migration-production`
- **CPU**: 256 units (0.25 vCPU)
- **Memory**: 512 MB
- **Network**: Private subnets, no public IP
- **Duration**: Typically <1 minute for most migrations

**Execution:**
- Runs: `node --import tsx/esm scripts/run-migrations.ts`
- Uses Drizzle's `migrate()` function
- Automatically tracks applied migrations in `__drizzle_migrations` table
- Idempotent: Safe to run multiple times

**Logging:**
- CloudWatch Log Group: `/ecs/bcos-migrations-{environment}`
- Retention: 30 days
- Contains detailed migration output and error messages

## Environments

### Staging
- **Trigger**: Push to `staging` branch
- **Cluster**: `bcos-staging-cluster`
- **Secret**: `staging/bcos-secrets`
- **Database**: Staging database (from DATABASE_URL in secret)

### Production
- **Trigger**: Push to `main` branch
- **Cluster**: `bcos-production-cluster`
- **Secret**: `production/bcos-secrets`
- **Database**: Production database (from DATABASE_URL in secret)

## Creating New Migrations

### 1. Generate Migration

```bash
# Make schema changes in lib/db/schema.ts
pnpm db:generate
```

This creates a new SQL migration file in `lib/db/migrations/`

### 2. Test Locally

```bash
# Set your local DATABASE_URL in .env.local
pnpm db:migrate
```

### 3. Review Migration

Check the generated SQL file in `lib/db/migrations/` to ensure it's correct.

### 4. Deploy

```bash
# For staging
git push origin staging

# For production (after testing in staging)
git push origin main
```

## Monitoring

### GitHub Actions

Watch the deployment workflow for migration status:
- Step: "Run database migrations"
- Shows real-time migration progress
- Displays exit code and error details if failed

### CloudWatch Logs

**Staging:**
```
https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#logsV2:log-groups/log-group/$252Fecs$252Fbcos-migrations-staging
```

**Production:**
```
https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#logsV2:log-groups/log-group/$252Fecs$252Fbcos-migrations-production
```

### ECS Tasks

Check migration task history in ECS console:
- Navigate to cluster → Tasks tab
- Filter by task definition: `bcos-migration-{environment}`
- View stopped tasks for historical runs

## Rollback Procedures

### Scenario 1: Migration Failed, Deployment Stopped

**What Happened:**
- Migration task exited with non-zero code
- Application deployment was prevented
- Old application version still running

**Action:**
1. Check CloudWatch logs for error details
2. Fix the migration issue in code
3. Push fix to trigger new deployment
4. Migration will retry automatically

**No rollback needed** - application was never updated.

### Scenario 2: Migration Succeeded, Application Has Issues

**What Happened:**
- Migration completed successfully
- Application deployed but has bugs/issues
- Need to revert to previous version

**Action:**

#### Option A: Deploy Hotfix (Recommended)
```bash
# Create fix branch
git checkout -b hotfix/issue-name

# Make fixes
# Commit and push

git push origin staging  # Test in staging first
git push origin main     # Deploy to production
```

#### Option B: Revert Deployment
```bash
# Find previous working commit
git log --oneline

# Revert to that commit
git revert <bad-commit-sha>
git push origin main
```

**⚠️ Important**: If the migration made schema changes, reverting the app might cause compatibility issues.

#### Option C: Manual Rollback with Database Revert

**WARNING**: Only use for critical production issues. Requires database expertise.

1. **Identify the migration to rollback:**
```sql
SELECT * FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 5;
```

2. **Create rollback script:**
- Manually write SQL to undo the migration changes
- Example: If migration added column, write DROP COLUMN
- Test in staging first!

3. **Execute rollback:**
```bash
# Connect to database
pnpm db:psql

# Run rollback SQL manually
# Remove migration entry from __drizzle_migrations
DELETE FROM __drizzle_migrations WHERE hash = '<migration-hash>';
```

4. **Deploy previous application version:**
```bash
git revert <commit-with-migration>
git push origin main
```

### Scenario 3: Migration Partially Applied

**What Happened:**
- Migration started but didn't complete
- Task was stopped mid-execution
- Database in unknown state

**Action:**

1. **Check database state:**
```sql
-- Check which migrations are recorded
SELECT * FROM __drizzle_migrations ORDER BY created_at DESC;

-- Verify actual schema matches expectations
\d+ table_name  -- In psql
```

2. **If migration is recorded but incomplete:**
```sql
-- Manually remove the entry
DELETE FROM __drizzle_migrations WHERE hash = '<partial-migration-hash>';
```

3. **Redeploy to retry:**
```bash
# Trigger new deployment
git commit --allow-empty -m "Retry migration"
git push origin staging
```

## Safety Features

✅ **Fail-Safe Deployment**
- If migrations fail, application deployment is blocked
- Old version keeps running

✅ **Idempotent Migrations**
- Drizzle tracks applied migrations
- Re-running deployment won't duplicate migrations

✅ **Isolated Execution**
- Migrations run in separate task from application
- Failures don't crash running application

✅ **Complete Audit Trail**
- All migrations logged to CloudWatch
- Task history preserved in ECS

✅ **Environment Isolation**
- Staging and production completely separate
- Different clusters, secrets, databases

## Troubleshooting

### Migration Task Won't Start

**Check:**
1. CloudFormation stack outputs exist (BCOS-NetworkStack, BCOS-SecurityStack)
2. ECS cluster exists and is active
3. Subnets and security groups are correct
4. IAM roles have proper permissions

### Migration Times Out

**Possible Causes:**
1. Migration is too complex (large data transformation)
2. Database connection issues
3. Lock contention with running application

**Solutions:**
1. Increase timeout in workflow (currently 10 minutes)
2. Check database connectivity from ECS tasks
3. Consider maintenance window for large migrations

### Database Connection Failed

**Check:**
1. DATABASE_URL in Secrets Manager is correct
2. Security group allows ECS → RDS connection
3. RDS instance is available
4. VPC endpoints are working (if using private subnets)

### Migration Succeeded But Not Applied

**Check:**
1. Migration file exists in `lib/db/migrations/`
2. Migration file was included in Docker image
3. Check `__drizzle_migrations` table in database
4. Review CloudWatch logs for actual execution

## IAM Permissions Required

The GitHub Actions deployment role needs these permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecs:RunTask",
        "ecs:DescribeTasks"
      ],
      "Resource": [
        "arn:aws:ecs:us-east-1:854428944440:task-definition/bcos-migration-*",
        "arn:aws:ecs:us-east-1:854428944440:task/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "ecs:RegisterTaskDefinition"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:DescribeLogGroups",
        "logs:PutRetentionPolicy"
      ],
      "Resource": [
        "arn:aws:logs:us-east-1:854428944440:log-group:/ecs/bcos-migrations-*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "iam:PassRole"
      ],
      "Resource": [
        "arn:aws:iam::854428944440:role/ecsTaskExecutionRole",
        "arn:aws:iam::854428944440:role/bcos-task-role"
      ],
      "Condition": {
        "StringEquals": {
          "iam:PassedToService": "ecs-tasks.amazonaws.com"
        }
      }
    }
  ]
}
```

**Note**: These permissions should already exist in `BCOS-GitHubActionsDeploymentRole` IAM role. Verify in IAM console.

## Best Practices

### 1. Test in Staging First
Always push to `staging` branch first, verify migrations work, then merge to `main`.

### 2. Keep Migrations Small
- One logical change per migration
- Avoid mixing schema and data changes when possible
- Break large migrations into smaller steps

### 3. Write Backward-Compatible Migrations
When possible, make migrations that work with both old and new application code:
- Add columns as nullable first, then populate, then make NOT NULL
- Don't drop columns immediately after removing from code

### 4. Review Generated SQL
Always check the generated migration files before deploying:
```bash
cat lib/db/migrations/0XXX_*.sql
```

### 5. Monitor After Deployment
- Check CloudWatch logs immediately after deployment
- Verify application health
- Watch for database performance issues

### 6. Document Complex Migrations
Add comments to migration files explaining non-obvious changes:
```sql
-- Migration: Add user preferences table
-- Why: Support customizable dashboard layouts
-- Impact: No data migration needed, new feature only
```

## Migration Workflow Example

```bash
# 1. Make schema changes
vim lib/db/schema.ts

# 2. Generate migration
pnpm db:generate
# Creates: lib/db/migrations/0012_new_feature.sql

# 3. Review migration
cat lib/db/migrations/0012_new_feature.sql

# 4. Test locally
pnpm db:migrate
# Verify: psql and check tables

# 5. Commit and push to staging
git add lib/db/
git commit -m "feat: add user preferences table"
git push origin staging

# 6. Monitor deployment
# Watch GitHub Actions workflow
# Check CloudWatch logs

# 7. Test in staging
# Verify new feature works

# 8. Deploy to production
git checkout main
git merge staging
git push origin main

# 9. Monitor production deployment
# Watch for any issues
```

## Related Documentation

- [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) - Full deployment process
- [drizzle.config.ts](../drizzle.config.ts) - Drizzle configuration
- [scripts/run-migrations.ts](../scripts/run-migrations.ts) - Migration runner script
- [Drizzle ORM Documentation](https://orm.drizzle.team/docs/migrations) - Official migration docs

## Support

If you encounter issues not covered here:

1. Check CloudWatch logs for detailed error messages
2. Review recent migrations in `__drizzle_migrations` table
3. Consult with DevOps team for infrastructure issues
4. Review Drizzle documentation for migration-specific questions
