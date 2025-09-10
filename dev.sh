#!/bin/bash

# BCOS Development Helper Script
# Usage: ./dev.sh [command]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${BLUE}================================${NC}"
    echo -e "${BLUE}  BCOS Development Helper${NC}"
    echo -e "${BLUE}================================${NC}"
}

# Function to kill processes on port 4001
kill_port() {
    print_status "Killing processes on port 4001..."
    
    # Find and kill processes using port 4001
    PIDS=$(lsof -ti:4001 2>/dev/null || echo "")
    
    if [ -z "$PIDS" ]; then
        print_status "No processes found on port 4001"
    else
        echo "$PIDS" | xargs kill -9 2>/dev/null || true
        print_status "Killed processes: $PIDS"
        sleep 2
    fi
}

# Function to start the development server
start_dev() {
    print_status "Starting development server on port 4001..."
    export PORT=4001
    pnpm dev
}

# Function to restart the application
restart_app() {
    print_header
    print_status "Restarting BCOS application..."
    
    kill_port
    
    print_status "Starting fresh development server..."
    start_dev
}

# Function to run database operations
db_operations() {
    case $2 in
        "push")
            print_status "Pushing database schema..."
            pnpm db:push
            ;;
        "seed")
            print_status "Seeding database..."
            pnpm db:seed
            ;;
        "reset")
            print_status "Resetting database (push + seed)..."
            pnpm db:push
            pnpm db:seed
            ;;
        *)
            print_error "Unknown database command: $2"
            echo "Available commands: push, seed, reset"
            exit 1
            ;;
    esac
}

# Function to run code quality checks
quality_checks() {
    case $2 in
        "lint")
            print_status "Running linter..."
            pnpm lint
            ;;
        "format")
            print_status "Formatting code..."
            pnpm format
            ;;
        "check")
            print_status "Running full Biome check..."
            pnpm check
            ;;
        "all")
            print_status "Running all quality checks..."
            pnpm check
            pnpm test:run
            ;;
        *)
            print_error "Unknown quality command: $2"
            echo "Available commands: lint, format, check, all"
            exit 1
            ;;
    esac
}

# Function to run tests
run_tests() {
    case $2 in
        "watch")
            print_status "Running tests in watch mode..."
            pnpm test
            ;;
        "run")
            print_status "Running tests once..."
            pnpm test:run
            ;;
        "ui")
            print_status "Opening test UI..."
            pnpm test:ui
            ;;
        *)
            print_status "Running tests in watch mode (default)..."
            pnpm test
            ;;
    esac
}

# Function to show system status
show_status() {
    print_header
    print_status "BCOS System Status"
    echo ""
    
    # Check if app is running
    if curl -s http://localhost:4001 >/dev/null 2>&1; then
        echo -e "🟢 App Status: ${GREEN}Running${NC} (http://localhost:4001)"
    else
        echo -e "🔴 App Status: ${RED}Not Running${NC}"
    fi
    
    # Check database connection
    if pnpm db:push --dry-run >/dev/null 2>&1; then
        echo -e "🟢 Database: ${GREEN}Connected${NC}"
    else
        echo -e "🔴 Database: ${RED}Connection Issue${NC}"
    fi
    
    # Show recent git status
    echo ""
    print_status "Git Status:"
    git status --porcelain | head -5
    
    # Show package info
    echo ""
    print_status "Package Manager: $(pnpm --version)"
    print_status "Node Version: $(node --version)"
}

# Function to open useful URLs
open_urls() {
    print_status "Opening development URLs..."
    
    # macOS
    if [[ "$OSTYPE" == "darwin"* ]]; then
        open "http://localhost:4001" 2>/dev/null || true
        open "http://localhost:4001/configure" 2>/dev/null || true
        open "http://localhost:4001/configure/practices" 2>/dev/null || true
    # Linux
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        xdg-open "http://localhost:4001" 2>/dev/null || true
    fi
}

# Main command handler
case $1 in
    "start")
        print_header
        start_dev
        ;;
    "restart")
        restart_app
        ;;
    "stop")
        print_header
        kill_port
        ;;
    "db")
        db_operations "$@"
        ;;
    "test")
        run_tests "$@"
        ;;
    "lint" | "format" | "check")
        quality_checks "$1" "$1"
        ;;
    "quality")
        quality_checks "$@"
        ;;
    "status")
        show_status
        ;;
    "open")
        open_urls
        ;;
    "help" | "--help" | "-h")
        print_header
        echo ""
        echo "Available commands:"
        echo ""
        echo -e "${GREEN}App Management:${NC}"
        echo "  start          Start development server"
        echo "  restart        Kill port 4001 processes and restart app"
        echo "  stop           Stop all processes on port 4001"
        echo "  status         Show system status"
        echo "  open           Open app URLs in browser"
        echo ""
        echo -e "${GREEN}Database:${NC}"
        echo "  db push        Push schema to database"
        echo "  db seed        Seed database with sample data"
        echo "  db reset       Push schema + seed data"
        echo ""
        echo -e "${GREEN}Code Quality:${NC}"
        echo "  lint           Run linter"
        echo "  format         Format code"
        echo "  check          Run full Biome check"
        echo "  quality all    Run all quality checks + tests"
        echo ""
        echo -e "${GREEN}Testing:${NC}"
        echo "  test           Run tests in watch mode"
        echo "  test run       Run tests once"
        echo "  test ui        Open test UI"
        echo ""
        echo -e "${GREEN}Examples:${NC}"
        echo "  ./dev.sh restart"
        echo "  ./dev.sh db reset"
        echo "  ./dev.sh quality all"
        echo ""
        ;;
    "")
        print_header
        print_warning "No command specified. Use './dev.sh help' for available commands."
        echo ""
        show_status
        ;;
    *)
        print_error "Unknown command: $1"
        echo "Use './dev.sh help' for available commands."
        exit 1
        ;;
esac
