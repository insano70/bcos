# Data Explorer Permissions Deployment Guide

## Overview

This guide explains how to deploy Data Explorer RBAC permissions to local, staging, and production environments.

## Permission Overview

Data Explorer adds **17 new permissions** across 7 action types:

### Query Permissions (2)
- `data-explorer:query:organization` - Generate SQL for organization data
- `data-explorer:query:all` - Generate SQL for all data (super admin)

### Execute Permissions (3)
- `data-explorer:execute:own` - Execute with provider_uid filter
- `data-explorer:execute:organization` - Execute with practice_uid filter  
- `data-explorer:execute:all` - Execute without filtering (super admin)

### Metadata Permissions (3)
- `data-explorer:metadata:read:organization` - View metadata
- `data-explorer:metadata:read:all` - View all metadata
- `data-explorer:metadata:manage:all` - Manage metadata (admin only)

### History Permissions (3)
- `data-explorer:history:read:own` - View own query history
- `data-explorer:history:read:organization` - View org query history
- `data-explorer:history:read:all` - View all history

### Template Permissions (4)
- `data-explorer:templates:read:organization` - View templates
- `data-explorer:templates:read:all` - View all templates
- `data-explorer:templates:create:organization` - Create templates
- `data-explorer:templates:manage:own` - Manage own templates
- `data-explorer:templates:manage:all` - Manage all templates

### Discovery Permissions (1)
- `data-explorer:discovery:run:all` - Run schema auto-discovery (Phase 2)

### Wildcard Permission (1)
- `data-explorer:*:*` - Not used (super_admin gets ALL permissions automatically)

## Architecture

### Permission Storage

**Source of Truth**: `lib/db/rbac-seed-data.ts`

All permissions are defined in the `RBAC_PERMISSIONS` constant. The seeding system:
1. Reads from `getAllPermissions()` helper
2. Upserts to database with `onConflictDoUpdate`
3. **Idempotent**: Can run multiple times safely

**Key Benefits**:
- Single source of truth
- Type-safe (imported by `lib/types/rbac.ts`)
- Automatically synced to database on seed
- Updates existing permissions (not just insert)

## Local Development

### Step 1: Verify Permissions in Source

```bash
# Check that permissions are in rbac-seed-data.ts
grep "data-explorer:" lib/db/rbac-seed-data.ts
# Should show 17 matches
```

### Step 2: Run Seed Script

```bash
# This seeds ALL permissions (including Data Explorer)
pnpm db:seed
```

**What it does**:
1. Upserts all permissions from `rbac-seed-data.ts`
2. Creates/updates roles and assigns permissions
3. Creates sample organizations
4. Creates sample users and assigns roles
5. **Idempotent**: Safe to run multiple times

### Step 3: Verify Permissions Loaded

```bash
# Run verification script
pnpm exec tsx --env-file=.env.local scripts/verify-data-explorer-permissions.ts
```

Expected output:
```
✅ Found 17 Data Explorer permissions in database
✅ All 17 expected Data Explorer permissions are present!
```

### Step 4: Verify Super Admin Has Access

```bash
# The super_admin role gets ALL permissions automatically
# Log in as admin@bendcare.com to test Data Explorer access
```

## Staging Deployment

### Option 1: Run Seed Script Directly (Recommended)

**Prerequisites**:
- SSH access to ECS container or EC2 bastion host
- Staging DATABASE_URL available

**Steps**:

```bash
# 1. SSH into ECS container or bastion
aws ecs execute-command --cluster bendcare-staging \
  --task <task-id> \
  --container app \
  --interactive \
  --command "/bin/bash"

# 2. Inside container, run seed
cd /app
DATABASE_URL="postgresql://..." pnpm db:seed

# 3. Verify
DATABASE_URL="postgresql://..." tsx scripts/verify-data-explorer-permissions.ts
```

### Option 2: Via CI/CD Pipeline

**If you have automated deployments**, add seed step:

```yaml
# .github/workflows/deploy-staging.yml (or similar)
steps:
  - name: Run Database Migrations
    run: pnpm db:migrate

  - name: Seed RBAC Permissions
    run: pnpm db:seed
    env:
      DATABASE_URL: ${{ secrets.STAGING_DATABASE_URL }}
```

### Option 3: Direct Database Access

**From your local machine** with staging credentials:

```bash
# Set staging DATABASE_URL
export DATABASE_URL="postgresql://bcos_t:password@staging-db:5432/bcos_t"

# Run seed
pnpm db:seed

# Verify
pnpm exec tsx scripts/verify-data-explorer-permissions.ts
```

## Production Deployment

### ⚠️ CRITICAL: Production Safety

**Before running in production**:
1. ✅ Test in staging first
2. ✅ Verify idempotency (run twice in staging, ensure no duplicates)
3. ✅ Create database backup
4. ✅ Schedule during low-traffic window
5. ✅ Have rollback plan ready

### Deployment Steps

```bash
# 1. CREATE BACKUP FIRST
pg_dump -h production-db -U bcos_p bcos_p > backup_before_seed_$(date +%Y%m%d).sql

# 2. Run seed (idempotent - safe to run)
DATABASE_URL="postgresql://bcos_p:password@production-db:5432/bcos_p" pnpm db:seed

# 3. Verify permissions loaded
DATABASE_URL="postgresql://bcos_p:password@production-db:5432/bcos_p" \
  tsx scripts/verify-data-explorer-permissions.ts

# 4. Verify super admin can access
# Log in to production as super admin
# Navigate to /data/explorer
# Should see "Data" section in sidebar
```

### Via AWS ECS Task

**Most secure approach** - run as one-off ECS task:

```bash
# 1. Create one-off task with seed command
aws ecs run-task \
  --cluster bendcare-production \
  --task-definition bendcare-app:latest \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx],securityGroups=[sg-xxx],assignPublicIp=DISABLED}" \
  --overrides '{
    "containerOverrides": [{
      "name": "app",
      "command": ["sh", "-c", "pnpm db:seed"]
    }]
  }'

# 2. Monitor task logs in CloudWatch
# 3. Verify completion
```

## Rollback Plan

**If something goes wrong:**

### Scenario 1: Seed Failed Midway

```bash
# The seed is idempotent, just run again
pnpm db:seed
```

### Scenario 2: Wrong Permissions Created

```bash
# Delete all Data Explorer permissions
psql $DATABASE_URL -c "DELETE FROM permissions WHERE name LIKE 'data-explorer:%';"

# Re-run seed
pnpm db:seed
```

### Scenario 3: Need to Restore Backup

```bash
# Drop database and restore from backup
psql $DATABASE_URL < backup_before_seed_20251029.sql
```

## Post-Deployment Verification

### Check Permission Count

```sql
-- Should return 17
SELECT COUNT(*) FROM permissions WHERE name LIKE 'data-explorer:%';
```

### Check Super Admin Has Permissions

```sql
-- Super admin role gets ALL permissions dynamically
-- Verify role exists
SELECT * FROM roles WHERE name = 'super_admin';

-- Verify users with super_admin role can access
SELECT u.email, r.name 
FROM users u
JOIN user_roles ur ON u.user_id = ur.user_id
JOIN roles r ON ur.role_id = r.role_id
WHERE r.name = 'super_admin';
```

### Test in Application

1. Log in as super admin
2. Navigate to application
3. Should see "Data" section in sidebar (if has any data-explorer permission)
4. Click Data > Explorer
5. Should load query interface
6. Try generating SQL: "How many patients?"
7. Verify works without permission errors

## Troubleshooting

### Issue: Permissions Not Showing

**Symptom**: Data Explorer section not in sidebar

**Diagnosis**:
```bash
# Check permissions in DB
DATABASE_URL="..." tsx scripts/verify-data-explorer-permissions.ts

# Check user's permissions
psql $DATABASE_URL -c "
SELECT p.name 
FROM permissions p
JOIN role_permissions rp ON p.permission_id = rp.permission_id
JOIN roles r ON rp.role_id = r.role_id
JOIN user_roles ur ON r.role_id = ur.role_id
WHERE ur.user_id = '<user-id>'
AND p.name LIKE 'data-explorer:%';
"
```

**Fix**:
```bash
# Re-run seed
pnpm db:seed

# Clear user's RBAC cache
# Logout and login again to refresh session
```

### Issue: Permission Denied on API Calls

**Symptom**: 403 errors on `/api/data/explorer/*`

**Diagnosis**:
```bash
# Check if permissions exist in DB
SELECT * FROM permissions WHERE name = 'data-explorer:query:organization';

# Check if user has role with permissions
SELECT ur.user_id, r.name as role, p.name as permission
FROM user_roles ur
JOIN roles r ON ur.role_id = r.role_id
JOIN role_permissions rp ON r.role_id = rp.role_id
JOIN permissions p ON rp.permission_id = p.permission_id
WHERE ur.user_id = '<user-id>'
AND p.name LIKE 'data-explorer:%';
```

**Fix**:
```bash
# Assign appropriate role with Data Explorer permissions
# OR add permission to existing role
```

## Environment-Specific Notes

### Local Development
- **Command**: `pnpm db:seed`
- **DATABASE_URL**: From `.env.local`
- **Safe to run**: Yes (idempotent)
- **Frequency**: After git pull with schema changes

### Staging
- **Command**: Same (`pnpm db:seed`)
- **DATABASE_URL**: From ECS task or set manually
- **Safe to run**: Yes (idempotent)
- **Frequency**: After each deployment
- **Method**: SSH to ECS container OR run as one-off task

### Production
- **Command**: Same (`pnpm db:seed`)  
- **DATABASE_URL**: From ECS task environment
- **Safe to run**: Yes (idempotent, but backup first)
- **Frequency**: After deployment OR on-demand
- **Method**: One-off ECS task (most secure)
- **Backup**: REQUIRED before running

## Integration with Deployment Process

### Recommended: Add to Deployment Pipeline

**For automated deployments**, add post-deploy seed step:

```yaml
# Example GitHub Actions workflow
- name: Run Database Migrations
  run: pnpm db:migrate
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}

- name: Seed RBAC Permissions (Idempotent)
  run: pnpm db:seed
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}

- name: Verify Data Explorer Permissions
  run: tsx scripts/verify-data-explorer-permissions.ts
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

### Manual Deployment

If deploying manually:

```bash
# 1. Deploy code
git pull origin main
pnpm install
pnpm build

# 2. Run migrations
pnpm db:migrate

# 3. Seed permissions (includes Data Explorer)
pnpm db:seed

# 4. Verify
tsx scripts/verify-data-explorer-permissions.ts

# 5. Restart application
pm2 restart app  # or ECS service update
```

## Permission Assignment Strategy

### For New Installations

Super admin automatically gets all permissions (including Data Explorer).

### For Existing Users

**Grant Data Explorer access to analytics users**:

```sql
-- Find role with analytics permissions
SELECT role_id, name FROM roles WHERE name LIKE '%analytics%';

-- Add Data Explorer permissions to that role
INSERT INTO role_permissions (role_id, permission_id)
SELECT 
  '<analytics-role-id>',
  permission_id
FROM permissions
WHERE name IN (
  'data-explorer:query:organization',
  'data-explorer:execute:organization',
  'data-explorer:metadata:read:organization',
  'data-explorer:history:read:own'
)
ON CONFLICT DO NOTHING;
```

**Or create new role**:

```sql
-- Create "Data Analyst" role with Data Explorer access
INSERT INTO roles (name, description, is_system_role, is_active)
VALUES ('data_analyst', 'Data Analyst with Explorer access', false, true)
RETURNING role_id;

-- Assign Data Explorer permissions to role
-- (Done automatically if added to RBAC_ROLES in rbac-seed-data.ts)
```

## Validation Checklist

After deploying to any environment:

- [ ] Run `tsx scripts/verify-data-explorer-permissions.ts`
- [ ] Verify 17 permissions found
- [ ] Log in as super admin
- [ ] See "Data" section in sidebar
- [ ] Navigate to /data/explorer
- [ ] Generate test SQL query
- [ ] Execute query successfully
- [ ] View query in history (/data/explorer/history)
- [ ] View metadata (/data/explorer/metadata)

## Summary

**The Good News**: 
✅ Permissions are **already in** `lib/db/rbac-seed-data.ts`  
✅ Seed script is **idempotent** (safe to run multiple times)  
✅ Works across **all environments** (local/staging/production)  
✅ **No code changes needed** - just run `pnpm db:seed`

**Deployment Commands**:

| Environment | Command |
|-------------|---------|
| **Local** | `pnpm db:seed` |
| **Staging** | SSH to ECS → `pnpm db:seed` |
| **Production** | One-off ECS task OR backup first → `pnpm db:seed` |
| **Verify** | `tsx scripts/verify-data-explorer-permissions.ts` |

---

**Document Version**: 1.0  
**Last Updated**: October 29, 2025  
**Author**: Patrick @ Bendcare

