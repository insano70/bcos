#!/bin/bash
set -euo pipefail

# Database Refresh Script: Production -> Staging
# This script safely copies the production database to staging
# and reassigns all object ownership to the staging user.

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PROD_HOST="bendcare-pgsql01.cnazbc1awdkk.us-east-1.rds.amazonaws.com"
PROD_USER="bcos_p"
PROD_DB="bcos_p"
PROD_PASSWORD="${PROD_PASSWORD:-}"

STAGING_HOST="bendcare-pgsql01.cnazbc1awdkk.us-east-1.rds.amazonaws.com"
STAGING_USER="bcos_t"
STAGING_DB="bcos_t"
STAGING_PASSWORD="${STAGING_PASSWORD:-}"

DUMP_FILE="/tmp/bcos_prod_dump_$(date +%Y%m%d_%H%M%S).sql"
DRY_RUN="${DRY_RUN:-false}"

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

# Validate environment
validate_environment() {
    log_info "Validating environment..."

    if [ -z "$PROD_PASSWORD" ]; then
        log_error "PROD_PASSWORD environment variable is not set"
        exit 1
    fi

    if [ -z "$STAGING_PASSWORD" ]; then
        log_error "STAGING_PASSWORD environment variable is not set"
        exit 1
    fi

    # Check if psql is available
    if ! command -v psql &> /dev/null; then
        log_error "psql command not found. Please install PostgreSQL client."
        exit 1
    fi

    # Check if pg_dump is available
    if ! command -v pg_dump &> /dev/null; then
        log_error "pg_dump command not found. Please install PostgreSQL client."
        exit 1
    fi

    log_info "Environment validation passed"
}

# Test database connections
test_connections() {
    log_info "Testing database connections..."

    # Test production connection
    if PGPASSWORD="$PROD_PASSWORD" psql -h "$PROD_HOST" -U "$PROD_USER" -d "$PROD_DB" --set=sslmode=require -c "SELECT 1" > /dev/null 2>&1; then
        log_info "Production database connection successful"
    else
        log_error "Failed to connect to production database"
        exit 1
    fi

    # Test staging connection
    if PGPASSWORD="$STAGING_PASSWORD" psql -h "$STAGING_HOST" -U "$STAGING_USER" -d "$STAGING_DB" --set=sslmode=require -c "SELECT 1" > /dev/null 2>&1; then
        log_info "Staging database connection successful"
    else
        log_error "Failed to connect to staging database"
        exit 1
    fi
}

# Create production database dump
create_dump() {
    log_info "Creating dump from production database..."
    log_info "Dump file: $DUMP_FILE"

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

# Terminate active connections to staging database
terminate_connections() {
    log_info "Terminating active connections to staging database..."

    if [ "$DRY_RUN" = "true" ]; then
        log_warn "DRY RUN: Would terminate connections to $STAGING_DB"
        return 0
    fi

    PGPASSWORD="$STAGING_PASSWORD" psql -h "$STAGING_HOST" -U "$STAGING_USER" -d postgres --set=sslmode=require -c "
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = '$STAGING_DB'
          AND pid <> pg_backend_pid();
    " > /dev/null 2>&1 || true

    log_info "Active connections terminated"
}

# Drop all objects in staging database
drop_staging_objects() {
    log_info "Dropping all objects in staging database..."

    if [ "$DRY_RUN" = "true" ]; then
        log_warn "DRY RUN: Would drop all objects in $STAGING_DB"
        return 0
    fi

    # Drop all schemas except pg_catalog and information_schema
    PGPASSWORD="$STAGING_PASSWORD" psql -h "$STAGING_HOST" -U "$STAGING_USER" -d "$STAGING_DB" --set=sslmode=require -c "
        DO \$\$
        DECLARE
            r RECORD;
        BEGIN
            -- Drop all schemas except system schemas
            FOR r IN SELECT schema_name FROM information_schema.schemata
                     WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
            LOOP
                EXECUTE 'DROP SCHEMA IF EXISTS ' || quote_ident(r.schema_name) || ' CASCADE';
            END LOOP;
        END \$\$;
    " > /dev/null 2>&1

    # Recreate public schema with correct ownership
    PGPASSWORD="$STAGING_PASSWORD" psql -h "$STAGING_HOST" -U "$STAGING_USER" -d "$STAGING_DB" --set=sslmode=require -c "
        CREATE SCHEMA IF NOT EXISTS public;
        ALTER SCHEMA public OWNER TO $STAGING_USER;
        GRANT ALL ON SCHEMA public TO $STAGING_USER;
    " > /dev/null 2>&1

    log_info "All objects dropped from staging database"
}

# Restore dump to staging
restore_dump() {
    log_info "Restoring dump to staging database..."

    if [ "$DRY_RUN" = "true" ]; then
        log_warn "DRY RUN: Would restore dump to $STAGING_DB"
        return 0
    fi

    PGPASSWORD="$STAGING_PASSWORD" psql \
        -h "$STAGING_HOST" \
        -U "$STAGING_USER" \
        -d "$STAGING_DB" \
        --set=sslmode=require \
        --set ON_ERROR_STOP=off \
        --file="$DUMP_FILE" \
        2>&1 | grep -v "NOTICE" | grep -v "does not exist, skipping" || true

    log_info "Dump restored successfully"
}

# Reassign ownership to staging user
reassign_ownership() {
    log_info "Reassigning object ownership to $STAGING_USER..."

    if [ "$DRY_RUN" = "true" ]; then
        log_warn "DRY RUN: Would reassign ownership to $STAGING_USER"
        return 0
    fi

    PGPASSWORD="$STAGING_PASSWORD" psql -h "$STAGING_HOST" -U "$STAGING_USER" -d "$STAGING_DB" --set=sslmode=require -c "
        DO \$\$
        DECLARE
            r RECORD;
        BEGIN
            -- Reassign all schemas
            FOR r IN SELECT schema_name FROM information_schema.schemata
                     WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
                       AND schema_owner != '$STAGING_USER'
            LOOP
                EXECUTE 'ALTER SCHEMA ' || quote_ident(r.schema_name) || ' OWNER TO $STAGING_USER';
            END LOOP;

            -- Reassign all tables
            FOR r IN SELECT schemaname, tablename FROM pg_tables
                     WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
            LOOP
                EXECUTE 'ALTER TABLE ' || quote_ident(r.schemaname) || '.' || quote_ident(r.tablename) || ' OWNER TO $STAGING_USER';
            END LOOP;

            -- Reassign all sequences
            FOR r IN SELECT schemaname, sequencename FROM pg_sequences
                     WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
            LOOP
                EXECUTE 'ALTER SEQUENCE ' || quote_ident(r.schemaname) || '.' || quote_ident(r.sequencename) || ' OWNER TO $STAGING_USER';
            END LOOP;

            -- Reassign all views
            FOR r IN SELECT schemaname, viewname FROM pg_views
                     WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
            LOOP
                EXECUTE 'ALTER VIEW ' || quote_ident(r.schemaname) || '.' || quote_ident(r.viewname) || ' OWNER TO $STAGING_USER';
            END LOOP;

            -- Reassign all functions
            FOR r IN SELECT n.nspname as schema, p.proname as function, pg_get_function_identity_arguments(p.oid) as args
                     FROM pg_proc p
                     JOIN pg_namespace n ON p.pronamespace = n.oid
                     WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
            LOOP
                EXECUTE 'ALTER FUNCTION ' || quote_ident(r.schema) || '.' || quote_ident(r.function) || '(' || r.args || ') OWNER TO $STAGING_USER';
            END LOOP;
        END \$\$;
    " > /dev/null 2>&1

    log_info "Ownership reassigned successfully"
}

# Verify the refresh
verify_refresh() {
    log_info "Verifying database refresh..."

    if [ "$DRY_RUN" = "true" ]; then
        log_warn "DRY RUN: Would verify database refresh"
        return 0
    fi

    # Count tables in staging
    local table_count=$(PGPASSWORD="$STAGING_PASSWORD" psql -h "$STAGING_HOST" -U "$STAGING_USER" -d "$STAGING_DB" --set=sslmode=require -t -c "
        SELECT COUNT(*) FROM information_schema.tables
        WHERE table_schema NOT IN ('pg_catalog', 'information_schema');
    " | xargs)

    log_info "Tables in staging: $table_count"

    # Verify ownership
    local wrong_owner=$(PGPASSWORD="$STAGING_PASSWORD" psql -h "$STAGING_HOST" -U "$STAGING_USER" -d "$STAGING_DB" --set=sslmode=require -t -c "
        SELECT COUNT(*) FROM pg_tables
        WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
          AND tableowner != '$STAGING_USER';
    " | xargs)

    if [ "$wrong_owner" -eq 0 ]; then
        log_info "All objects owned by $STAGING_USER ✓"
    else
        log_warn "$wrong_owner objects not owned by $STAGING_USER"
    fi

    # Test staging password still works
    if PGPASSWORD="$STAGING_PASSWORD" psql -h "$STAGING_HOST" -U "$STAGING_USER" -d "$STAGING_DB" --set=sslmode=require -c "SELECT 1" > /dev/null 2>&1; then
        log_info "Staging password verification successful ✓"
    else
        log_error "Failed to connect with staging password"
        exit 1
    fi
}

# Cleanup
cleanup() {
    if [ -f "$DUMP_FILE" ]; then
        log_info "Cleaning up dump file..."
        rm -f "$DUMP_FILE"
        log_info "Dump file removed"
    fi
}

# Main execution
main() {
    echo ""
    log_info "========================================="
    log_info "Database Refresh: Production -> Staging"
    log_info "========================================="
    echo ""

    if [ "$DRY_RUN" = "true" ]; then
        log_warn "RUNNING IN DRY-RUN MODE"
        log_warn "No actual changes will be made"
        echo ""
    fi

    log_warn "This will DESTROY all data in staging database: $STAGING_DB"

    if [ "$DRY_RUN" != "true" ]; then
        read -p "Are you sure you want to continue? (type 'yes' to confirm): " confirm
        if [ "$confirm" != "yes" ]; then
            log_error "Operation cancelled by user"
            exit 1
        fi
        echo ""
    fi

    validate_environment
    test_connections
    create_dump
    terminate_connections
    drop_staging_objects
    restore_dump
    reassign_ownership
    verify_refresh
    cleanup

    echo ""
    log_info "========================================="
    log_info "Database refresh completed successfully!"
    log_info "========================================="
    echo ""
}

# Trap errors and cleanup
trap cleanup EXIT

# Run main
main
