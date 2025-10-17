#!/usr/bin/env tsx

/**
 * Safe Console Replacement Tool - Single File Processing
 * Processes ONE file at a time with proper backups and validation
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

interface ConsoleReplacement {
  pattern: RegExp;
  replacement: string | ((match: string, ...groups: string[]) => string);
  category: 'error' | 'warn' | 'info' | 'debug' | 'log';
  description: string;
  requiresImport: boolean;
  importStatement?: string;
}

interface FileProcessResult {
  success: boolean;
  originalFile: string;
  backupFile: string;
  replacements: number;
  errors: string[];
  requiresImport: boolean;
  importAdded: boolean;
}

class SafeConsoleReplacer {
  private backupDir: string;
  private replacements: ConsoleReplacement[];

  constructor(backupDir = '.console-migration-backups') {
    this.backupDir = join(process.cwd(), backupDir);
    this.ensureBackupDirectory();
    this.replacements = this.createSafeReplacementPatterns();
  }

  /**
   * Ensure backup directory exists
   */
  private ensureBackupDirectory(): void {
    if (!existsSync(this.backupDir)) {
      mkdirSync(this.backupDir, { recursive: true });
      console.log(`✅ Created backup directory: ${this.backupDir}`);
    }
  }

  /**
   * Create SAFE replacement patterns (no aggressive type assertions)
   */
  private createSafeReplacementPatterns(): ConsoleReplacement[] {
    return [
      // Error patterns - highest priority, most careful
      {
        pattern: /console\.error\(\s*(['"`])([^'"`]+)\1\s*,\s*([^)]+)\s*\)/g,
        replacement: (match, _quote, message, data) => {
          // Only replace if the data looks like a simple object literal
          if (data.trim().startsWith('{') && !data.includes(' as ')) {
            return `logger.error('${message}', ${data})`;
          }
          return match; // Don't replace complex expressions
        },
        category: 'error',
        description: 'Error logging with simple object data',
        requiresImport: true,
        importStatement: "import { logger } from '@/lib/logger';",
      },

      {
        pattern: /console\.error\(\s*(['"`])([^'"`]+)\1\s*\)/g,
        replacement: "logger.error('$2')",
        category: 'error',
        description: 'Simple error logging',
        requiresImport: true,
        importStatement: "import { logger } from '@/lib/logger';",
      },

      // Warning patterns
      {
        pattern: /console\.warn\(\s*(['"`])([^'"`]+)\1\s*,\s*([^)]+)\s*\)/g,
        replacement: (match, _quote, message, data) => {
          if (data.trim().startsWith('{') && !data.includes(' as ')) {
            return `logger.warn('${message}', ${data})`;
          }
          return match;
        },
        category: 'warn',
        description: 'Warning logging with simple object data',
        requiresImport: true,
        importStatement: "import { logger } from '@/lib/logger';",
      },

      {
        pattern: /console\.warn\(\s*(['"`])([^'"`]+)\1\s*\)/g,
        replacement: "logger.warn('$2')",
        category: 'warn',
        description: 'Simple warning logging',
        requiresImport: true,
        importStatement: "import { logger } from '@/lib/logger';",
      },

      // Info patterns
      {
        pattern: /console\.info\(\s*(['"`])([^'"`]+)\1\s*\)/g,
        replacement: "logger.info('$2')",
        category: 'info',
        description: 'Simple info logging',
        requiresImport: true,
        importStatement: "import { logger } from '@/lib/logger';",
      },

      // Log patterns (convert to info)
      {
        pattern: /console\.log\(\s*(['"`])([^'"`]+)\1\s*\)/g,
        replacement: "logger.info('$2')",
        category: 'log',
        description: 'Simple log to info conversion',
        requiresImport: true,
        importStatement: "import { logger } from '@/lib/logger';",
      },

      // Debug patterns
      {
        pattern: /console\.debug\(\s*(['"`])([^'"`]+)\1\s*\)/g,
        replacement: "logger.debug('$2')",
        category: 'debug',
        description: 'Simple debug logging',
        requiresImport: true,
        importStatement: "import { logger } from '@/lib/logger';",
      },
    ];
  }

  /**
   * Process a single file safely
   */
  async processFile(filePath: string, dryRun = true): Promise<FileProcessResult> {
    const result: FileProcessResult = {
      success: false,
      originalFile: filePath,
      backupFile: '',
      replacements: 0,
      errors: [],
      requiresImport: false,
      importAdded: false,
    };

    try {
      console.log(`\n🔍 Processing: ${filePath}`);
      console.log(`📋 Mode: ${dryRun ? 'DRY RUN' : 'EXECUTE'}`);

      // Read original file
      const originalContent = readFileSync(filePath, 'utf-8');
      let modifiedContent = originalContent;
      let totalReplacements = 0;

      // Check for existing logger import
      const hasLoggerImport = /import.*logger.*from.*['"`]@\/lib\/logger['"`]/.test(
        originalContent
      );

      console.log(`📦 Existing logger import: ${hasLoggerImport ? 'YES' : 'NO'}`);

      // Apply replacements
      for (const replacement of this.replacements) {
        const matches = Array.from(modifiedContent.matchAll(replacement.pattern));

        if (matches.length > 0) {
          console.log(`  🔄 Found ${matches.length} ${replacement.category} patterns`);

          let replacementContent = modifiedContent;

          for (const match of matches) {
            const originalText = match[0];

            let replacementText: string;
            if (typeof replacement.replacement === 'function') {
              replacementText = replacement.replacement(match[0], ...match.slice(1));
            } else {
              replacementText = originalText.replace(replacement.pattern, replacement.replacement);
            }

            // Only replace if something actually changed
            if (replacementText !== originalText) {
              replacementContent = replacementContent.replace(originalText, replacementText);
              totalReplacements++;
              console.log(`    ✅ ${originalText.trim()} → ${replacementText.trim()}`);
            } else {
              console.log(`    ⏭️  Skipped complex pattern: ${originalText.trim()}`);
            }
          }

          modifiedContent = replacementContent;

          if (replacement.requiresImport && !hasLoggerImport && totalReplacements > 0) {
            result.requiresImport = true;
          }
        }
      }

      result.replacements = totalReplacements;

      // Add import if needed
      if (result.requiresImport && totalReplacements > 0) {
        modifiedContent = this.addLoggerImport(modifiedContent);
        result.importAdded = true;
        console.log(`  📥 Added logger import`);
      }

      console.log(`📊 Total replacements: ${totalReplacements}`);

      if (totalReplacements === 0) {
        console.log(`✅ No console calls found - file already clean`);
        result.success = true;
        return result;
      }

      if (dryRun) {
        console.log(`🔍 DRY RUN: Would make ${totalReplacements} replacements`);
        result.success = true;
        return result;
      }

      // Create backup before making changes
      const backupPath = this.createBackup(filePath, originalContent);
      result.backupFile = backupPath;

      // Write modified file
      writeFileSync(filePath, modifiedContent, 'utf-8');

      console.log(`✅ File processed successfully`);
      console.log(`💾 Backup created: ${backupPath}`);
      result.success = true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.errors.push(errorMessage);
      console.log(`❌ Error processing file: ${errorMessage}`);
    }

    return result;
  }

  /**
   * Create backup in dedicated directory
   */
  private createBackup(filePath: string, content: string): string {
    const timestamp = Date.now();
    const _fileName = basename(filePath);
    const relativePath = filePath.replace(`${process.cwd()}/`, '').replace(/\//g, '_');
    const backupFileName = `${relativePath}.${timestamp}.backup`;
    const backupPath = join(this.backupDir, backupFileName);

    // Ensure backup subdirectories exist
    mkdirSync(dirname(backupPath), { recursive: true });

    writeFileSync(backupPath, content, 'utf-8');
    return backupPath;
  }

  /**
   * Add logger import to file
   */
  private addLoggerImport(content: string): string {
    const lines = content.split('\n');

    // Find the best place to insert the import
    let insertIndex = 0;

    // Look for existing imports
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]?.trim();
      if (line?.startsWith('import ')) {
        insertIndex = i + 1;
      } else if (
        line &&
        !line.startsWith('//') &&
        !line.startsWith('/*') &&
        !line.startsWith('*')
      ) {
        break;
      }
    }

    lines.splice(insertIndex, 0, "import { logger } from '@/lib/logger';");
    return lines.join('\n');
  }

  /**
   * Restore a file from backup
   */
  restoreFromBackup(backupPath: string, targetFile: string): boolean {
    try {
      if (!existsSync(backupPath)) {
        console.log(`❌ Backup file not found: ${backupPath}`);
        return false;
      }

      const backupContent = readFileSync(backupPath, 'utf-8');
      writeFileSync(targetFile, backupContent, 'utf-8');

      console.log(`✅ Restored ${targetFile} from backup`);
      return true;
    } catch (error) {
      console.log(`❌ Failed to restore from backup: ${error}`);
      return false;
    }
  }

  /**
   * List available backups for a file
   */
  listBackupsForFile(filePath: string): string[] {
    try {
      const relativePath = filePath.replace(`${process.cwd()}/`, '').replace(/\//g, '_');
      const backupPattern = relativePath;

      if (!existsSync(this.backupDir)) {
        return [];
      }

      const files = require('node:fs').readdirSync(this.backupDir);
      return files
        .filter((file: string) => file.startsWith(backupPattern) && file.endsWith('.backup'))
        .sort()
        .reverse(); // Most recent first
    } catch (error) {
      console.log(`❌ Error listing backups: ${error}`);
      return [];
    }
  }
}

/**
 * CLI Interface
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
🔧 Safe Console Replacer - Single File Processing

USAGE:
  npx tsx scripts/safe-console-replacer.ts <file> [--execute] [--restore <backup>]

OPTIONS:
  <file>                    Target file to process
  --execute                 Actually make changes (default: dry run)
  --restore <backup>        Restore file from specific backup
  --list-backups           Show available backups for file

EXAMPLES:
  # Dry run on a file
  npx tsx scripts/safe-console-replacer.ts lib/security/csrf-unified.ts

  # Execute changes
  npx tsx scripts/safe-console-replacer.ts lib/security/csrf-unified.ts --execute

  # List backups
  npx tsx scripts/safe-console-replacer.ts lib/security/csrf-unified.ts --list-backups

  # Restore from backup
  npx tsx scripts/safe-console-replacer.ts lib/security/csrf-unified.ts --restore .console-migration-backups/lib_security_csrf-unified.ts.1234567890.backup

SAFETY FEATURES:
  • Processes ONE file at a time
  • Creates timestamped backups in dedicated directory  
  • Dry run by default
  • Safe replacement patterns (no aggressive type assertions)
  • Easy restoration from backups
`);
    process.exit(0);
  }

  const targetFile = args[0];

  if (!targetFile) {
    console.log('❌ Target file required');
    process.exit(1);
  }

  const execute = args.includes('--execute');
  const listBackups = args.includes('--list-backups');
  const restoreIndex = args.indexOf('--restore');
  const backupFile =
    restoreIndex >= 0 && restoreIndex + 1 < args.length ? args[restoreIndex + 1] : null;

  const replacer = new SafeConsoleReplacer();

  try {
    if (listBackups) {
      console.log(`📋 Available backups for ${targetFile}:`);
      const backups = replacer.listBackupsForFile(targetFile);
      if (backups.length === 0) {
        console.log('  No backups found');
      } else {
        backups.forEach((backup, index) => {
          console.log(`  ${index + 1}. ${backup}`);
        });
      }
      return;
    }

    if (backupFile) {
      if (typeof backupFile !== 'string') {
        console.log('❌ Invalid backup file path');
        process.exit(1);
      }
      const success = replacer.restoreFromBackup(backupFile, targetFile);
      process.exit(success ? 0 : 1);
      return;
    }

    if (!existsSync(targetFile)) {
      console.log(`❌ File not found: ${targetFile}`);
      process.exit(1);
    }

    const result = await replacer.processFile(targetFile, !execute);

    if (!result.success) {
      console.log(`❌ Processing failed:`, result.errors);
      process.exit(1);
    }

    if (execute && result.replacements > 0) {
      console.log(`\n🎉 Successfully processed ${targetFile}`);
      console.log(`   Replacements: ${result.replacements}`);
      console.log(`   Backup: ${result.backupFile}`);
      console.log(`\n💡 To restore if needed:`);
      console.log(
        `   npx tsx scripts/safe-console-replacer.ts ${targetFile} --restore ${result.backupFile}`
      );
    }
  } catch (error) {
    console.log(`💥 Fatal error: ${error}`);
    process.exit(1);
  }
}

// Export for programmatic use
export { SafeConsoleReplacer };

// Run CLI if executed directly
if (require.main === module) {
  main().catch(console.error);
}
