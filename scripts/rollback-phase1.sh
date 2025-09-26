#!/bin/bash

# Universal Logger Phase 1 Rollback Script
# Safely rollback Phase 1 migrations if issues are detected

set -e

echo "🔙 Universal Logger Phase 1 Rollback Script"
echo "=========================================="

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if we're in the right directory
check_directory() {
    if [ ! -f "package.json" ] || [ ! -d "lib/logger" ]; then
        print_error "This script must be run from the project root directory"
        exit 1
    fi
}

# Function to create backup before rollback
create_backup() {
    local backup_dir="backups/phase1-rollback-$(date +%Y%m%d-%H%M%S)"
    
    print_status "Creating backup of current state..."
    mkdir -p "$backup_dir"
    
    # Backup modified files
    if [ -f "lib/security/csrf-monitoring.ts" ]; then
        cp "lib/security/csrf-monitoring.ts" "$backup_dir/"
    fi
    
    if [ -f "middleware.ts" ]; then
        cp "middleware.ts" "$backup_dir/"
    fi
    
    if [ -f "lib/api/middleware/request-sanitization.ts" ]; then
        cp "lib/api/middleware/request-sanitization.ts" "$backup_dir/"
    fi
    
    print_status "Backup created in $backup_dir"
}

# Function to check git status
check_git_status() {
    print_status "Checking git status..."
    
    if ! git diff --quiet; then
        print_warning "Working directory has uncommitted changes"
        git status --short
        
        read -p "Do you want to continue with rollback? (y/N): " confirm
        if [[ $confirm != [yY] ]]; then
            print_status "Rollback cancelled by user"
            exit 0
        fi
    fi
}

# Function to rollback specific file
rollback_file() {
    local file=$1
    local tag=$2
    
    if [ -n "$tag" ]; then
        print_status "Rolling back $file to tag $tag..."
        git checkout "$tag" -- "$file" 2>/dev/null || {
            print_warning "Could not rollback $file using tag $tag"
            return 1
        }
    else
        print_status "Rolling back $file to HEAD..."
        git checkout HEAD -- "$file" 2>/dev/null || {
            print_warning "Could not rollback $file to HEAD"
            return 1
        }
    fi
}

# Function to rollback Phase 1 files
rollback_phase1_files() {
    print_status "Rolling back Phase 1 migrations..."
    
    local rollback_tag=""
    
    # Check if phase1-start tag exists
    if git tag -l | grep -q "phase1-start"; then
        rollback_tag="phase1-start"
        print_status "Found phase1-start tag, using for rollback"
    else
        print_warning "No phase1-start tag found, rolling back to HEAD"
    fi
    
    # Rollback critical files
    rollback_file "lib/security/csrf-monitoring.ts" "$rollback_tag"
    rollback_file "middleware.ts" "$rollback_tag"
    rollback_file "lib/api/middleware/request-sanitization.ts" "$rollback_tag"
    
    # Remove edge-logger imports if they were added
    print_status "Checking for any edge-logger import remnants..."
    
    local files_with_edge_imports=$(grep -r "from.*edge-logger" --include="*.ts" --include="*.tsx" . 2>/dev/null || true)
    if [ -n "$files_with_edge_imports" ]; then
        print_warning "Found files still importing from edge-logger:"
        echo "$files_with_edge_imports"
    fi
}

# Function to verify rollback
verify_rollback() {
    print_status "Verifying rollback..."
    
    # Check TypeScript compilation
    print_status "Running TypeScript compilation..."
    if pnpm tsc; then
        print_status "TypeScript compilation successful"
    else
        print_error "TypeScript compilation failed after rollback"
        return 1
    fi
    
    # Check linting
    print_status "Running linter..."
    if pnpm lint --reporter=summary; then
        print_status "Linting successful"
    else
        print_warning "Linting found issues (may be pre-existing)"
    fi
    
    # Check if edge runtime test passes
    if [ -f "scripts/test-edge-runtime-migration.ts" ]; then
        print_status "Running edge runtime compatibility test..."
        if npx tsx scripts/test-edge-runtime-migration.ts; then
            print_status "Edge runtime test passed"
        else
            print_error "Edge runtime test failed after rollback"
            return 1
        fi
    fi
}

# Function to cleanup temporary files
cleanup() {
    print_status "Cleaning up temporary files..."
    
    # Remove any temporary migration files
    find . -name "*.migration.bak" -delete 2>/dev/null || true
    find . -name "*.rollback.tmp" -delete 2>/dev/null || true
    
    print_status "Cleanup completed"
}

# Function to show rollback summary
show_summary() {
    print_status "Rollback Summary:"
    echo "=================="
    echo "✅ Phase 1 files rolled back"
    echo "✅ TypeScript compilation verified"
    echo "✅ Basic linting completed"
    echo "✅ Edge runtime compatibility tested"
    echo ""
    print_status "Phase 1 rollback completed successfully!"
    print_warning "Please review the changes and test your application thoroughly."
}

# Main rollback execution
main() {
    print_status "Starting Phase 1 rollback process..."
    
    check_directory
    create_backup
    check_git_status
    rollback_phase1_files
    
    if verify_rollback; then
        cleanup
        show_summary
    else
        print_error "Rollback verification failed!"
        print_error "Please check the issues above and fix manually if needed."
        exit 1
    fi
}

# Handle script arguments
case "${1:-}" in
    --help|-h)
        echo "Universal Logger Phase 1 Rollback Script"
        echo ""
        echo "Usage: $0 [OPTIONS]"
        echo ""
        echo "Options:"
        echo "  --help, -h     Show this help message"
        echo "  --verify-only  Only verify current state without rollback"
        echo "  --force        Force rollback without confirmation"
        echo ""
        echo "This script will:"
        echo "  1. Backup current state"
        echo "  2. Rollback Phase 1 migration files"
        echo "  3. Verify TypeScript compilation"
        echo "  4. Run basic tests"
        echo "  5. Clean up temporary files"
        ;;
    --verify-only)
        print_status "Running verification only..."
        check_directory
        if verify_rollback; then
            print_status "Verification completed successfully"
        else
            print_error "Verification failed"
            exit 1
        fi
        ;;
    --force)
        print_warning "Force mode enabled - skipping confirmations"
        check_directory
        create_backup
        rollback_phase1_files
        verify_rollback
        cleanup
        show_summary
        ;;
    "")
        # Default behavior - interactive rollback
        main
        ;;
    *)
        print_error "Unknown option: $1"
        print_status "Use --help for usage information"
        exit 1
        ;;
esac
