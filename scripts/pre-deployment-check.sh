#!/bin/bash

# Pre-Deployment Migration Safety Check
# Run this script before EVERY deployment to staging or production
# 
# This script is IDEMPOTENT and safe to run multiple times

set -e  # Exit on any error

echo "🚀 Pre-Deployment Migration Safety Check"
echo "========================================"
echo ""

# Check 1: Validate migration system integrity
echo "✓ Check 1: Validating migration system..."
npx tsx scripts/validate-migration-integrity.ts
if [ $? -ne 0 ]; then
  echo ""
  echo "❌ Migration validation failed!"
  echo "   Fix migration issues before deploying."
  exit 1
fi

# Check 2: Verify schema matches database
echo ""
echo "✓ Check 2: Verifying schema matches database..."
npx drizzle-kit check
if [ $? -ne 0 ]; then
  echo ""
  echo "❌ Schema drift detected!"
  echo "   Generate migrations before deploying."
  exit 1
fi

# Check 3: Check for uncommitted schema changes
echo ""
echo "✓ Check 3: Checking for uncommitted changes..."
if git diff --quiet lib/db/ && git diff --cached --quiet lib/db/; then
  echo "   ✅ No uncommitted schema changes"
else
  echo "   ⚠️  Uncommitted changes detected in lib/db/"
  echo ""
  git status lib/db/
  echo ""
  read -p "   Continue anyway? (y/N) " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

# Check 4: TypeScript compilation
echo ""
echo "✓ Check 4: Running TypeScript check..."
pnpm tsc --noEmit
if [ $? -ne 0 ]; then
  echo ""
  echo "❌ TypeScript errors detected!"
  echo "   Fix TypeScript errors before deploying."
  exit 1
fi

# Summary
echo ""
echo "========================================"
echo "✅ ALL PRE-DEPLOYMENT CHECKS PASSED"
echo "========================================"
echo ""
echo "Safe to deploy to staging/production!"
echo ""

