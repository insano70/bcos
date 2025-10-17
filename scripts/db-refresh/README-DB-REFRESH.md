# Database Refresh Script

## Overview

The `refresh-staging-db.sh` script safely copies the production database to staging, ensuring all object ownership is correctly reassigned to the staging user while preserving the staging password.

## Prerequisites

- PostgreSQL client tools (`psql`, `pg_dump`) installed
- Access credentials for both production and staging databases
- Network access to the RDS instance

## Usage

### Dry Run (Recommended First)

Always test with a dry run first to verify connectivity and see what would happen:

```bash
DRY_RUN=true \
PROD_PASSWORD="<production-password>" \
STAGING_PASSWORD="<staging-password>" \
./scripts/refresh-staging-db.sh
```

### Actual Refresh

Once you've verified the dry run, execute the actual refresh:

```bash
PROD_PASSWORD="<production-password>" \
STAGING_PASSWORD="<staging-password>" \
./scripts/refresh-staging-db.sh
```

You will be prompted to confirm with `yes` before any destructive operations occur.

## What the Script Does

1. **Validates Environment**
   - Checks for required environment variables
   - Verifies `psql` and `pg_dump` are available

2. **Tests Connections**
   - Verifies connectivity to both production and staging databases
   - Fails early if connections cannot be established

3. **Creates Production Dump**
   - Dumps the production database using `pg_dump`
   - Uses `--no-owner` and `--no-acl` flags for clean restoration
   - Creates timestamped dump file in `/tmp/`

4. **Terminates Active Connections**
   - Safely terminates all active connections to staging database
   - Required to drop objects cleanly

5. **Drops Staging Objects**
   - Drops all schemas and objects in staging (except system schemas)
   - Ensures clean slate for restoration

6. **Restores Dump**
   - Restores production dump to staging database
   - Uses `ON_ERROR_STOP=off` to continue through minor errors

7. **Reassigns Ownership**
   - Changes ownership of all database objects to `bcos_t` user:
     - Schemas
     - Tables
     - Sequences
     - Views
     - Functions

8. **Verifies Refresh**
   - Counts tables in staging
   - Verifies all objects are owned by staging user
   - Tests staging password still works

9. **Cleanup**
   - Removes temporary dump file

## Configuration

The script uses these hardcoded values (modify in script if needed):

```bash
PROD_HOST="bendcare-pgsql01.cnazbc1awdkk.us-east-1.rds.amazonaws.com"
PROD_USER="bcos_p"
PROD_DB="bcos_p"

STAGING_HOST="bendcare-pgsql01.cnazbc1awdkk.us-east-1.rds.amazonaws.com"
STAGING_USER="bcos_t"
STAGING_DB="bcos_t"
```

## Environment Variables

- `PROD_PASSWORD` (required): Production database password
- `STAGING_PASSWORD` (required): Staging database password
- `DRY_RUN` (optional): Set to `true` for dry-run mode

## Safety Features

- **Dry-run mode**: Test without making changes
- **Explicit confirmation**: Requires typing `yes` to proceed
- **Connection validation**: Fails early if databases are unreachable
- **Error handling**: Uses `set -euo pipefail` for strict error handling
- **Automatic cleanup**: Removes dump file on success or failure
- **Colored output**: Clear visual feedback on operations

## Expected Output

Successful refresh will show:

```
[INFO] Database Refresh: Production -> Staging
[WARN] This will DESTROY all data in staging database: bcos_t
Are you sure you want to continue? (type 'yes' to confirm): yes

[INFO] Validating environment...
[INFO] Environment validation passed
[INFO] Testing database connections...
[INFO] Production database connection successful
[INFO] Staging database connection successful
[INFO] Creating dump from production database...
[INFO] Dump created successfully (size: 45M)
[INFO] Terminating active connections to staging database...
[INFO] Active connections terminated
[INFO] Dropping all objects in staging database...
[INFO] All objects dropped from staging database
[INFO] Restoring dump to staging database...
[INFO] Dump restored successfully
[INFO] Reassigning object ownership to bcos_t...
[INFO] Ownership reassigned successfully
[INFO] Verifying database refresh...
[INFO] Tables in staging: 127
[INFO] All objects owned by bcos_t ✓
[INFO] Staging password verification successful ✓
[INFO] Cleaning up dump file...
[INFO] Dump file removed
[INFO] Database refresh completed successfully!
```

## Troubleshooting

### Connection Failures

If you see connection errors:
- Verify credentials are correct
- Check network access to RDS instance
- Ensure security groups allow your IP
- Verify SSL mode is supported

### Permission Errors

If ownership reassignment fails:
- Ensure staging user has sufficient privileges
- Check that staging user can ALTER schemas, tables, sequences, etc.

### Dump File Too Large

If disk space is an issue:
- Clean up old dump files in `/tmp/`
- Consider using compressed dumps (modify script to use `--format=custom`)

## Scheduling

To run this as a scheduled job (e.g., nightly refresh):

```bash
# Add to crontab
0 2 * * * PROD_PASSWORD="xxx" STAGING_PASSWORD="yyy" /path/to/scripts/refresh-staging-db.sh >> /var/log/db-refresh.log 2>&1
```

**Note**: Storing passwords in cron is not secure. Consider using AWS Secrets Manager or environment files with restricted permissions.

## Security Considerations

- Never commit passwords to version control
- Use environment variables or secure secret management
- Restrict script access with appropriate file permissions (`chmod 700`)
- Audit who has access to run this script
- Monitor execution logs for unauthorized runs

## Related Files

- [scripts/refresh-staging-db.sh](./refresh-staging-db.sh) - The actual script
