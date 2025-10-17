#!/usr/bin/env tsx
/**
 * Custom Lint Rule: Prevent Server Logger in Client Code
 *
 * This script enforces the rule that client-side code ('use client' files)
 * cannot import the server-only logger from @/lib/logger.
 *
 * Rationale:
 * - The logger in lib/logger uses Node.js-only dependencies
 * - Importing it in client code causes build failures
 * - Client code must use console.* or a client-safe alternative
 *
 * Usage:
 *   pnpm tsx scripts/lint-no-server-logger-in-client.ts
 *   pnpm lint:logger
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

interface Violation {
  file: string;
  line: number;
  importStatement: string;
}

const violations: Violation[] = [];
const ROOT_DIR = process.cwd();

// Directories to scan
const SCAN_DIRS = ['app', 'components', 'hooks', 'lib', 'templates'];

// Logger import patterns to detect
const LOGGER_IMPORT_PATTERNS = [
  /import\s+{[^}]*log[^}]*}\s+from\s+['"]@\/lib\/logger['"]/,
  /import\s+{\s*log\s*}\s+from\s+['"]@\/lib\/logger['"]/,
  /import\s*\*\s*as\s+\w+\s+from\s+['"]@\/lib\/logger['"]/,
  /from\s+['"]@\/lib\/logger['"]/,
];

/**
 * Check if a file has the 'use client' directive
 */
function isClientFile(content: string): boolean {
  const lines = content.split('\n');
  // Check first few lines for 'use client' directive
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const line = lines[i];
    if (!line) continue;
    const trimmed = line.trim();
    if (
      trimmed === "'use client';" ||
      trimmed === '"use client";' ||
      trimmed === "'use client'" ||
      trimmed === '"use client"'
    ) {
      return true;
    }
    // Skip empty lines and comments
    if (trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('/*')) {
      break;
    }
  }
  return false;
}

/**
 * Check if a file imports the server logger
 */
function detectLoggerImports(filePath: string, content: string): Violation[] {
  const fileViolations: Violation[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const trimmedLine = line.trim();
    for (const pattern of LOGGER_IMPORT_PATTERNS) {
      if (pattern.test(line)) {
        fileViolations.push({
          file: relative(ROOT_DIR, filePath),
          line: i + 1,
          importStatement: trimmedLine,
        });
        break; // Only report once per line
      }
    }
  }

  return fileViolations;
}

/**
 * Recursively scan directories for violations
 */
function scanDirectory(dir: string): void {
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      // Skip node_modules, .next, etc.
      if (
        entry === 'node_modules' ||
        entry === '.next' ||
        entry === 'dist' ||
        entry === 'build' ||
        entry.startsWith('.')
      ) {
        continue;
      }
      scanDirectory(fullPath);
    } else if (stat.isFile()) {
      // Only check .ts and .tsx files
      if (!entry.endsWith('.ts') && !entry.endsWith('.tsx')) {
        continue;
      }

      try {
        const content = readFileSync(fullPath, 'utf-8');

        // Only check client-side files
        if (!isClientFile(content)) {
          continue;
        }

        // Check for logger imports
        const fileViolations = detectLoggerImports(fullPath, content);
        if (fileViolations.length > 0) {
          violations.push(...fileViolations);
        }
      } catch (error) {
        console.error(`Error reading file ${fullPath}:`, error);
      }
    }
  }
}

/**
 * Main execution
 */
function main(): void {
  console.log('🔍 Scanning for server logger imports in client-side code...\n');

  for (const dir of SCAN_DIRS) {
    const fullPath = join(ROOT_DIR, dir);
    try {
      if (statSync(fullPath).isDirectory()) {
        scanDirectory(fullPath);
      }
    } catch {}
  }

  if (violations.length === 0) {
    console.log(
      '✅ No violations found. All client files are using appropriate logging methods.\n'
    );
    process.exit(0);
  }

  // Report violations
  console.error('❌ Found server logger imports in client-side code:\n');
  console.error('━'.repeat(80));

  for (const violation of violations) {
    console.error(`\n📁 ${violation.file}:${violation.line}`);
    console.error(`   ${violation.importStatement}`);
  }

  console.error(`\n${'━'.repeat(80)}`);
  console.error(`\n❌ Total violations: ${violations.length}\n`);
  console.error("💡 Client-side files (with 'use client') cannot import @/lib/logger");
  console.error('   Use console.* for client-side logging or create a client-safe logger.\n');
  console.error('   See CLAUDE.md for logging standards.\n');

  process.exit(1);
}

main();
