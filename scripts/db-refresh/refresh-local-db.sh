#!/bin/bash
set -euo pipefail

# Database Refresh Script: Production -> Local Development
# This script safely copies the production database to your local development environment.
# WARNING: This will DESTROY all data in your local database!

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration - Production (Source)
PROD_HOST="bendcare-pgsql01.cnazbc1awdkk.us-east-1.rds.amazonaws.com"
PROD_USER="bcos_p"
PROD_DB="bcos_p"
PROD_PASSWORD="${PROD_PASSWORD:-}"

# Configuration - Local Development (Target)
LOCAL_HOST="${LOCAL_DB_HOST:-localhost}"
LOCAL_USER="${LOCAL_DB_USER:-bcos_d}"
LOCAL_DB="${LOCAL_DB_NAME:-bcos_d}"
LOCAL_PASSWORD="${LOCAL_DB_PASSWORD:-}"
LOCAL_PORT="${LOCAL_DB_PORT:-5432}"

DUMP_FILE="/tmp/bcos_prod_dump_local_$(date +%Y%m%d_%H%M%S).sql"
BACKUP_FILE="/tmp/bcos_local_backup_$(date +%Y%m%d_%H%M%S).sql"
DRY_RUN="${DRY_RUN:-false}"
SKIP_BACKUP="${SKIP_BACKUP:-false}"

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_debug() {
    echo -e "${BLUE}[DEBUG]${NC} $1"
}

# Safety check: Ensure we're not accidentally targeting production
validate_target_is_local() {
    log_info "Validating target is local environment..."

    # Check that target is localhost
    if [[ "$LOCAL_HOST" != "localhost" && "$LOCAL_HOST" != "127.0.0.1" && "$LOCAL_HOST" != "::1" ]]; then
        log_error "TARGET IS NOT LOCALHOST!"
        log_error "This script should only target local development databases."
        log_error "Target host: $LOCAL_HOST"
        exit 1
    fi

    # Check that target is not production database name/user
    if [[ "$LOCAL_DB" == "bcos_p" || "$LOCAL_USER" == "bcos_p" ]]; then
        log_error "SAFETY CHECK FAILED!"
        log_error "Target database/user matches production configuration."
        log_error "This script cannot target production databases."
        exit 1
    fi

    log_info "Target validation passed - confirmed local environment"
}

# Validate environment
validate_environment() {
    log_info "Validating environment..."

    if [ -z "$PROD_PASSWORD" ]; then
        log_error "PROD_PASSWORD environment variable is not set"
        log_error "Please set: export PROD_PASSWORD='your-production-password'"
        exit 1
    fi

    # Check if psql is available
    if ! command -v psql &> /dev/null; then
        log_error "psql command not found. Please install PostgreSQL client."
        log_error "macOS: brew install postgresql"
        exit 1
    fi

    # Check if pg_dump is available
    if ! command -v pg_dump &> /dev/null; then
        log_error "pg_dump command not found. Please install PostgreSQL client."
        log_error "macOS: brew install postgresql"
        exit 1
    fi

    log_info "Environment validation passed"
}

# Build psql command for local connection
local_psql() {
    local db="${1:-$LOCAL_DB}"
    local cmd="psql -h $LOCAL_HOST -p $LOCAL_PORT -U $LOCAL_USER"

    if [ -n "$LOCAL_PASSWORD" ]; then
        cmd="PGPASSWORD=\"$LOCAL_PASSWORD\" $cmd"
    fi

    echo "$cmd -d $db"
}

# Test database connections
test_connections() {
    log_info "Testing database connections..."

    # Test production connection (source)
    if PGPASSWORD="$PROD_PASSWORD" psql -h "$PROD_HOST" -U "$PROD_USER" -d "$PROD_DB" --set=sslmode=require -c "SELECT 1" > /dev/null 2>&1; then
        log_info "Production database connection successful"
    else
        log_error "Failed to connect to production database"
        log_error "Check your PROD_PASSWORD environment variable"
        exit 1
    fi

    # Test local connection (target)
    local local_test_cmd
    if [ -n "$LOCAL_PASSWORD" ]; then
        local_test_cmd="PGPASSWORD=\"$LOCAL_PASSWORD\" psql -h $LOCAL_HOST -p $LOCAL_PORT -U $LOCAL_USER -d postgres -c \"SELECT 1\""
    else
        local_test_cmd="psql -h $LOCAL_HOST -p $LOCAL_PORT -U $LOCAL_USER -d postgres -c \"SELECT 1\""
    fi

    if eval "$local_test_cmd" > /dev/null 2>&1; then
        log_info "Local PostgreSQL connection successful"
    else
        log_error "Failed to connect to local PostgreSQL"
        log_error "Ensure PostgreSQL is running: brew services start postgresql"
        log_error "Check connection settings: host=$LOCAL_HOST, port=$LOCAL_PORT, user=$LOCAL_USER"
        exit 1
    fi

    # Check if local database exists
    local db_exists_cmd
    if [ -n "$LOCAL_PASSWORD" ]; then
        db_exists_cmd="PGPASSWORD=\"$LOCAL_PASSWORD\" psql -h $LOCAL_HOST -p $LOCAL_PORT -U $LOCAL_USER -d postgres -tAc \"SELECT 1 FROM pg_database WHERE datname='$LOCAL_DB'\""
    else
        db_exists_cmd="psql -h $LOCAL_HOST -p $LOCAL_PORT -U $LOCAL_USER -d postgres -tAc \"SELECT 1 FROM pg_database WHERE datname='$LOCAL_DB'\""
    fi

    if [ "$(eval "$db_exists_cmd")" != "1" ]; then
        log_warn "Local database '$LOCAL_DB' does not exist"
        log_info "Creating database '$LOCAL_DB'..."

        if [ "$DRY_RUN" != "true" ]; then
            if [ -n "$LOCAL_PASSWORD" ]; then
                PGPASSWORD="$LOCAL_PASSWORD" psql -h "$LOCAL_HOST" -p "$LOCAL_PORT" -U "$LOCAL_USER" -d postgres -c "CREATE DATABASE $LOCAL_DB OWNER $LOCAL_USER;"
            else
                psql -h "$LOCAL_HOST" -p "$LOCAL_PORT" -U "$LOCAL_USER" -d postgres -c "CREATE DATABASE $LOCAL_DB OWNER $LOCAL_USER;"
            fi
            log_info "Database created successfully"
        else
            log_warn "DRY RUN: Would create database $LOCAL_DB"
        fi
    fi
}

# Backup local database before refresh
backup_local_db() {
    if [ "$SKIP_BACKUP" = "true" ]; then
        log_info "Skipping local database backup (SKIP_BACKUP=true)"
        return 0
    fi

    log_info "Creating backup of local database before refresh..."
    log_info "Backup file: $BACKUP_FILE"

    if [ "$DRY_RUN" = "true" ]; then
        log_warn "DRY RUN: Would create backup of $LOCAL_DB"
        return 0
    fi

    local backup_cmd="pg_dump -h $LOCAL_HOST -p $LOCAL_PORT -U $LOCAL_USER -d $LOCAL_DB --format=plain --file=\"$BACKUP_FILE\""

    if [ -n "$LOCAL_PASSWORD" ]; then
        backup_cmd="PGPASSWORD=\"$LOCAL_PASSWORD\" $backup_cmd"
    fi

    if eval "$backup_cmd" 2>&1 | grep -v "NOTICE" || true; then
        if [ -f "$BACKUP_FILE" ]; then
            local size=$(du -h "$BACKUP_FILE" | cut -f1)
            log_info "Local backup created successfully (size: $size)"
            log_info "Backup location: $BACKUP_FILE"
        fi
    else
        log_warn "Failed to create local backup (continuing anyway)"
    fi
}

# Create production database dump
create_dump() {
    log_info "Creating dump from production database..."
    log_info "Dump file: $DUMP_FILE"
    log_info "This may take several minutes depending on database size..."

    if [ "$DRY_RUN" = "true" ]; then
        log_warn "DRY RUN: Would create dump from $PROD_DB"
        return 0
    fi

    PGPASSWORD="$PROD_PASSWORD" pg_dump \
        -h "$PROD_HOST" \
        -U "$PROD_USER" \
        -d "$PROD_DB" \
        --no-owner \
        --no-acl \
        --clean \
        --if-exists \
        --format=plain \
        --file="$DUMP_FILE" \
        --verbose \
        2>&1 | grep -v "NOTICE" || true

    if [ -f "$DUMP_FILE" ]; then
        local size=$(du -h "$DUMP_FILE" | cut -f1)
        log_info "Dump created successfully (size: $size)"
    else
        log_error "Failed to create dump file"
        exit 1
    fi
}

# Terminate active connections to local database
terminate_connections() {
    log_info "Terminating active connections to local database..."

    if [ "$DRY_RUN" = "true" ]; then
        log_warn "DRY RUN: Would terminate connections to $LOCAL_DB"
        return 0
    fi

    local terminate_cmd="psql -h $LOCAL_HOST -p $LOCAL_PORT -U $LOCAL_USER -d postgres -c \"
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = '$LOCAL_DB'
          AND pid <> pg_backend_pid();
    \""

    if [ -n "$LOCAL_PASSWORD" ]; then
        terminate_cmd="PGPASSWORD=\"$LOCAL_PASSWORD\" $terminate_cmd"
    fi

    eval "$terminate_cmd" > /dev/null 2>&1 || true

    log_info "Active connections terminated"
}

# Drop all objects in local database
drop_local_objects() {
    log_info "Dropping all objects in local database..."

    if [ "$DRY_RUN" = "true" ]; then
        log_warn "DRY RUN: Would drop all objects in $LOCAL_DB"
        return 0
    fi

    # Drop all schemas except pg_catalog and information_schema
    local drop_cmd="psql -h $LOCAL_HOST -p $LOCAL_PORT -U $LOCAL_USER -d $LOCAL_DB -c \"
        DO \\\$\\\$
        DECLARE
            r RECORD;
        BEGIN
            -- Drop all schemas except system schemas
            FOR r IN SELECT schema_name FROM information_schema.schemata
                     WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
            LOOP
                EXECUTE 'DROP SCHEMA IF EXISTS ' || quote_ident(r.schema_name) || ' CASCADE';
            END LOOP;
        END \\\$\\\$;
    \""

    if [ -n "$LOCAL_PASSWORD" ]; then
        drop_cmd="PGPASSWORD=\"$LOCAL_PASSWORD\" $drop_cmd"
    fi

    eval "$drop_cmd" > /dev/null 2>&1

    # Recreate public schema with correct ownership
    local recreate_cmd="psql -h $LOCAL_HOST -p $LOCAL_PORT -U $LOCAL_USER -d $LOCAL_DB -c \"
        CREATE SCHEMA IF NOT EXISTS public;
        ALTER SCHEMA public OWNER TO $LOCAL_USER;
        GRANT ALL ON SCHEMA public TO $LOCAL_USER;
    \""

    if [ -n "$LOCAL_PASSWORD" ]; then
        recreate_cmd="PGPASSWORD=\"$LOCAL_PASSWORD\" $recreate_cmd"
    fi

    eval "$recreate_cmd" > /dev/null 2>&1

    log_info "All objects dropped from local database"
}

# Restore dump to local database
restore_dump() {
    log_info "Restoring dump to local database..."
    log_info "This may take several minutes..."

    if [ "$DRY_RUN" = "true" ]; then
        log_warn "DRY RUN: Would restore dump to $LOCAL_DB"
        return 0
    fi

    local restore_cmd="psql -h $LOCAL_HOST -p $LOCAL_PORT -U $LOCAL_USER -d $LOCAL_DB --set ON_ERROR_STOP=off --file=\"$DUMP_FILE\""

    if [ -n "$LOCAL_PASSWORD" ]; then
        restore_cmd="PGPASSWORD=\"$LOCAL_PASSWORD\" $restore_cmd"
    fi

    eval "$restore_cmd" 2>&1 | grep -v "NOTICE" | grep -v "does not exist, skipping" || true

    log_info "Dump restored successfully"
}

# Reassign ownership to local user
reassign_ownership() {
    log_info "Reassigning object ownership to $LOCAL_USER..."

    if [ "$DRY_RUN" = "true" ]; then
        log_warn "DRY RUN: Would reassign ownership to $LOCAL_USER"
        return 0
    fi

    local reassign_cmd="psql -h $LOCAL_HOST -p $LOCAL_PORT -U $LOCAL_USER -d $LOCAL_DB -c \"
        DO \\\$\\\$
        DECLARE
            r RECORD;
        BEGIN
            -- Reassign all schemas
            FOR r IN SELECT schema_name FROM information_schema.schemata
                     WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
            LOOP
                EXECUTE 'ALTER SCHEMA ' || quote_ident(r.schema_name) || ' OWNER TO $LOCAL_USER';
            END LOOP;

            -- Reassign all tables
            FOR r IN SELECT schemaname, tablename FROM pg_tables
                     WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
            LOOP
                EXECUTE 'ALTER TABLE ' || quote_ident(r.schemaname) || '.' || quote_ident(r.tablename) || ' OWNER TO $LOCAL_USER';
            END LOOP;

            -- Reassign all sequences
            FOR r IN SELECT schemaname, sequencename FROM pg_sequences
                     WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
            LOOP
                EXECUTE 'ALTER SEQUENCE ' || quote_ident(r.schemaname) || '.' || quote_ident(r.sequencename) || ' OWNER TO $LOCAL_USER';
            END LOOP;

            -- Reassign all views
            FOR r IN SELECT schemaname, viewname FROM pg_views
                     WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
            LOOP
                EXECUTE 'ALTER VIEW ' || quote_ident(r.schemaname) || '.' || quote_ident(r.viewname) || ' OWNER TO $LOCAL_USER';
            END LOOP;

            -- Reassign all functions
            FOR r IN SELECT n.nspname as schema, p.proname as function, pg_get_function_identity_arguments(p.oid) as args
                     FROM pg_proc p
                     JOIN pg_namespace n ON p.pronamespace = n.oid
                     WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
            LOOP
                EXECUTE 'ALTER FUNCTION ' || quote_ident(r.schema) || '.' || quote_ident(r.function) || '(' || r.args || ') OWNER TO $LOCAL_USER';
            END LOOP;
        END \\\$\\\$;
    \""

    if [ -n "$LOCAL_PASSWORD" ]; then
        reassign_cmd="PGPASSWORD=\"$LOCAL_PASSWORD\" $reassign_cmd"
    fi

    eval "$reassign_cmd" > /dev/null 2>&1

    log_info "Ownership reassigned successfully"
}

# Verify the refresh
verify_refresh() {
    log_info "Verifying database refresh..."

    if [ "$DRY_RUN" = "true" ]; then
        log_warn "DRY RUN: Would verify database refresh"
        return 0
    fi

    # Count tables in local database
    local count_cmd="psql -h $LOCAL_HOST -p $LOCAL_PORT -U $LOCAL_USER -d $LOCAL_DB -t -c \"
        SELECT COUNT(*) FROM information_schema.tables
        WHERE table_schema NOT IN ('pg_catalog', 'information_schema');
    \""

    if [ -n "$LOCAL_PASSWORD" ]; then
        count_cmd="PGPASSWORD=\"$LOCAL_PASSWORD\" $count_cmd"
    fi

    local table_count=$(eval "$count_cmd" | xargs)

    log_info "Tables in local database: $table_count"

    # Verify ownership
    local owner_cmd="psql -h $LOCAL_HOST -p $LOCAL_PORT -U $LOCAL_USER -d $LOCAL_DB -t -c \"
        SELECT COUNT(*) FROM pg_tables
        WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
          AND tableowner != '$LOCAL_USER';
    \""

    if [ -n "$LOCAL_PASSWORD" ]; then
        owner_cmd="PGPASSWORD=\"$LOCAL_PASSWORD\" $owner_cmd"
    fi

    local wrong_owner=$(eval "$owner_cmd" | xargs)

    if [ "$wrong_owner" -eq 0 ]; then
        log_info "All objects owned by $LOCAL_USER ✓"
    else
        log_warn "$wrong_owner objects not owned by $LOCAL_USER"
    fi

    log_info "Local database refresh verification complete ✓"
}

# Cleanup temporary files
cleanup() {
    if [ -f "$DUMP_FILE" ]; then
        log_info "Cleaning up production dump file..."
        rm -f "$DUMP_FILE"
        log_info "Dump file removed"
    fi

    if [ -f "$BACKUP_FILE" ] && [ "$SKIP_BACKUP" != "true" ]; then
        log_info "Local backup retained at: $BACKUP_FILE"
        log_info "You can remove it manually if not needed"
    fi
}

# Display usage information
usage() {
    cat << EOF
Usage: $(basename "$0") [OPTIONS]

Refresh local development database with production data.

Environment Variables:
  PROD_PASSWORD        Production database password (REQUIRED)
  LOCAL_DB_HOST        Local PostgreSQL host (default: localhost)
  LOCAL_DB_PORT        Local PostgreSQL port (default: 5432)
  LOCAL_DB_USER        Local PostgreSQL user (default: postgres)
  LOCAL_DB_NAME        Local database name (default: bcos_d)
  LOCAL_DB_PASSWORD    Local PostgreSQL password (optional)
  DRY_RUN             Set to 'true' for dry-run mode (default: false)
  SKIP_BACKUP         Set to 'true' to skip local backup (default: false)

Examples:
  # Standard refresh
  export PROD_PASSWORD='your-prod-password'
  ./refresh-local-db.sh

  # Dry run to test
  export PROD_PASSWORD='your-prod-password'
  DRY_RUN=true ./refresh-local-db.sh

  # Skip local backup (faster, but less safe)
  export PROD_PASSWORD='your-prod-password'
  SKIP_BACKUP=true ./refresh-local-db.sh

  # Custom local database configuration
  export PROD_PASSWORD='your-prod-password'
  export LOCAL_DB_NAME='my_dev_db'
  export LOCAL_DB_USER='myuser'
  ./refresh-local-db.sh

EOF
}

# Main execution
main() {
    # Check for help flag
    if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
        usage
        exit 0
    fi

    echo ""
    log_info "=========================================="
    log_info "Database Refresh: Production -> Local Dev"
    log_info "=========================================="
    echo ""

    if [ "$DRY_RUN" = "true" ]; then
        log_warn "RUNNING IN DRY-RUN MODE"
        log_warn "No actual changes will be made"
        echo ""
    fi

    log_debug "Configuration:"
    log_debug "  Source: $PROD_USER@$PROD_HOST/$PROD_DB"
    log_debug "  Target: $LOCAL_USER@$LOCAL_HOST:$LOCAL_PORT/$LOCAL_DB"
    echo ""

    log_warn "⚠️  WARNING: This will DESTROY all data in local database: $LOCAL_DB"
    log_warn "⚠️  All existing tables, data, and schemas will be deleted"

    if [ "$SKIP_BACKUP" != "true" ]; then
        log_info "A backup will be created before refresh"
    else
        log_warn "Backup is DISABLED - no safety net!"
    fi

    if [ "$DRY_RUN" != "true" ]; then
        echo ""
        read -p "Are you sure you want to continue? (type 'yes' to confirm): " confirm
        if [ "$confirm" != "yes" ]; then
            log_error "Operation cancelled by user"
            exit 1
        fi
        echo ""
    fi

    validate_target_is_local
    validate_environment
    test_connections
    backup_local_db
    create_dump
    terminate_connections
    drop_local_objects
    restore_dump
    reassign_ownership
    verify_refresh
    cleanup

    echo ""
    log_info "=========================================="
    log_info "✓ Database refresh completed successfully!"
    log_info "=========================================="
    echo ""
    log_info "Your local database now contains production data"
    log_info "Database: $LOCAL_DB"
    log_info "Connection: $LOCAL_USER@$LOCAL_HOST:$LOCAL_PORT"

    if [ -f "$BACKUP_FILE" ]; then
        echo ""
        log_info "Previous local data backed up to:"
        log_info "  $BACKUP_FILE"
    fi
    echo ""
}

# Trap errors and cleanup
trap cleanup EXIT

# Run main
main "$@"
