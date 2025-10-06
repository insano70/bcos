#!/usr/bin/env tsx

/**
 * Migration Validation Script
 *
 * Validates that migration files match the journal entries to prevent
 * deployment failures due to missing or mismatched migrations.
 *
 * Run this before committing migrations:
 * pnpm run db:validate
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

interface Journal {
  version: string;
  dialect: string;
  entries: JournalEntry[];
}

const MIGRATIONS_DIR = join(process.cwd(), 'lib/db/migrations');
const JOURNAL_PATH = join(MIGRATIONS_DIR, 'meta/_journal.json');

function validateMigrations(): void {
  console.log('🔍 Validating database migrations...\n');

  // Read journal
  const journal: Journal = JSON.parse(readFileSync(JOURNAL_PATH, 'utf-8'));

  // Get all SQL migration files
  const sqlFiles = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  console.log(`📄 Found ${sqlFiles.length} migration SQL files`);
  console.log(`📋 Found ${journal.entries.length} journal entries\n`);

  const errors: string[] = [];
  const warnings: string[] = [];

  // Check each journal entry has corresponding SQL file
  for (const entry of journal.entries) {
    const expectedFile = `${entry.tag}.sql`;
    if (!sqlFiles.includes(expectedFile)) {
      errors.push(`❌ Journal entry "${entry.tag}" missing SQL file: ${expectedFile}`);
    }
  }

  // Check each SQL file has corresponding journal entry
  for (const sqlFile of sqlFiles) {
    const tag = sqlFile.replace('.sql', '');
    const hasEntry = journal.entries.some((e) => e.tag === tag);
    if (!hasEntry) {
      warnings.push(`⚠️  SQL file "${sqlFile}" missing journal entry`);
    }
  }

  // Check for duplicate tags
  const tags = journal.entries.map((e) => e.tag);
  const duplicates = tags.filter((tag, idx) => tags.indexOf(tag) !== idx);
  if (duplicates.length > 0) {
    errors.push(`❌ Duplicate journal entries: ${duplicates.join(', ')}`);
  }

  // Check for sequential numbering
  const numbers = sqlFiles.map((f) => {
    const match = f.match(/^(\d+)_/);
    return match?.[1] ? Number.parseInt(match[1], 10) : -1;
  });

  for (let i = 0; i < numbers.length - 1; i++) {
    const currentNum = numbers[i];
    const nextNum = numbers[i + 1];
    if (currentNum !== undefined && nextNum !== undefined && currentNum >= 0 && nextNum >= 0 && nextNum !== currentNum + 1) {
      warnings.push(
        `⚠️  Non-sequential migration numbers: ${String(currentNum).padStart(4, '0')} -> ${String(nextNum).padStart(4, '0')}`
      );
    }
  }

  // Print results
  if (errors.length > 0) {
    console.log('🚨 ERRORS FOUND:\n');
    for (const error of errors) {
      console.log(error);
    }
    console.log('');
  }

  if (warnings.length > 0) {
    console.log('⚠️  WARNINGS:\n');
    for (const warning of warnings) {
      console.log(warning);
    }
    console.log('');
  }

  if (errors.length === 0 && warnings.length === 0) {
    console.log('✅ All migrations valid!\n');
    console.log('Migration files:');
    for (const file of sqlFiles.slice(-5)) {
      console.log(`  📄 ${file}`);
    }
    console.log('');
    process.exit(0);
  }

  if (errors.length > 0) {
    console.log('❌ Migration validation FAILED\n');
    console.log('To fix:');
    console.log('1. Run: pnpm run db:generate');
    console.log('2. Review generated migrations');
    console.log('3. Update journal manually if needed');
    console.log('4. Commit all migration files together\n');
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.log('⚠️  Migration validation completed with warnings\n');
    process.exit(0);
  }
}

validateMigrations();
