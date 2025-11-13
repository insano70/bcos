#!/usr/bin/env tsx
/**
 * Migration Conflict Resolution Script
 *
 * Fixes duplicate migration numbers by renumbering conflicting migrations
 * and updating the journal file accordingly.
 *
 * This script:
 * 1. Identifies migrations with duplicate number prefixes
 * 2. Renumbers the LATER occurrences (based on journal idx order)
 * 3. Updates the _journal.json file
 * 4. Renames snapshot files if they exist
 */

import fs from 'node:fs';
import path from 'node:path';

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

const MIGRATIONS_DIR = './lib/db/migrations';
const JOURNAL_PATH = './lib/db/migrations/meta/_journal.json';
const SNAPSHOTS_DIR = './lib/db/migrations/meta';

function fixMigrationConflicts(): void {
  console.log('🔍 Scanning for migration conflicts...\n');

  // Read journal
  const journal: Journal = JSON.parse(fs.readFileSync(JOURNAL_PATH, 'utf8'));

  // Read all SQL migration files
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.match(/^\d{4}_.*\.sql$/))
    .sort();

  console.log(`📊 Found ${files.length} migration files`);
  console.log(`📊 Found ${journal.entries.length} journal entries\n`);

  // Build a map of migration numbers to files and their journal entries
  const migrationMap = new Map<number, Array<{ file: string; entry?: JournalEntry }>>();

  files.forEach(file => {
    const migrationNum = parseInt(file.split('_')[0]);
    const tag = file.replace('.sql', '');
    const entry = journal.entries.find(e => e.tag === tag);

    if (!migrationMap.has(migrationNum)) {
      migrationMap.set(migrationNum, []);
    }

    migrationMap.get(migrationNum)!.push({ file, entry });
  });

  // Find duplicates
  const duplicates: Array<{
    migrationNum: number;
    files: Array<{ file: string; entry?: JournalEntry }>;
  }> = [];

  migrationMap.forEach((items, migrationNum) => {
    if (items.length > 1) {
      duplicates.push({ migrationNum, files: items });
    }
  });

  if (duplicates.length === 0) {
    console.log('✅ No migration conflicts found!\n');
    return;
  }

  console.log(`⚠️  Found ${duplicates.length} migration number conflicts:\n`);
  duplicates.forEach(({ migrationNum, files }) => {
    console.log(`  Migration ${String(migrationNum).padStart(4, '0')}:`);
    files.forEach(({ file, entry }) => {
      console.log(`    - ${file} (idx: ${entry?.idx ?? 'not in journal'})`);
    });
    console.log('');
  });

  // Determine next available migration number
  const existingNumbers = Array.from(migrationMap.keys()).sort((a, b) => a - b);
  let nextMigrationNum = Math.max(...existingNumbers) + 1;

  // For each conflict, keep the EARLIEST (by journal idx) and renumber the rest
  const renameOps: Array<{
    oldFile: string;
    newFile: string;
    oldTag: string;
    newTag: string;
    entry?: JournalEntry;
  }> = [];

  duplicates.forEach(({ migrationNum, files }) => {
    // Sort by journal idx (undefined idx goes last)
    const sorted = files.sort((a, b) => {
      if (!a.entry) return 1;
      if (!b.entry) return -1;
      return a.entry.idx - b.entry.idx;
    });

    // Keep first, renumber rest
    const [keep, ...toRename] = sorted;
    console.log(`✓ Keeping ${keep.file} (idx: ${keep.entry?.idx})`);

    toRename.forEach(({ file, entry }) => {
      const newMigrationNum = String(nextMigrationNum).padStart(4, '0');
      const oldTag = file.replace('.sql', '');
      const newFileName = file.replace(/^\d{4}/, newMigrationNum);
      const newTag = newFileName.replace('.sql', '');

      renameOps.push({
        oldFile: file,
        newFile: newFileName,
        oldTag,
        newTag,
        entry,
      });

      console.log(`→ Renaming ${file} to ${newFileName}`);
      nextMigrationNum++;
    });
    console.log('');
  });

  if (renameOps.length === 0) {
    console.log('✅ No renames needed\n');
    return;
  }

  // Confirm before proceeding
  console.log(`\n📋 Summary: ${renameOps.length} migrations will be renumbered\n`);
  console.log('⚠️  This will modify files and the journal. Ensure git is clean!\n');

  // Execute renames
  console.log('🔄 Executing renames...\n');

  renameOps.forEach(({ oldFile, newFile, oldTag, newTag, entry }) => {
    // Rename SQL file
    const oldPath = path.join(MIGRATIONS_DIR, oldFile);
    const newPath = path.join(MIGRATIONS_DIR, newFile);

    if (fs.existsSync(oldPath)) {
      fs.renameSync(oldPath, newPath);
      console.log(`  ✓ Renamed SQL: ${oldFile} → ${newFile}`);
    }

    // Rename snapshot file if exists
    const oldSnapshotPath = path.join(SNAPSHOTS_DIR, `${oldTag.split('_')[0]}_snapshot.json`);
    const newSnapshotPath = path.join(SNAPSHOTS_DIR, `${newTag.split('_')[0]}_snapshot.json`);

    if (fs.existsSync(oldSnapshotPath)) {
      // Check if target snapshot already exists
      if (!fs.existsSync(newSnapshotPath)) {
        fs.renameSync(oldSnapshotPath, newSnapshotPath);
        console.log(`  ✓ Renamed snapshot: ${path.basename(oldSnapshotPath)} → ${path.basename(newSnapshotPath)}`);
      } else {
        console.log(`  ⚠️  Snapshot ${path.basename(newSnapshotPath)} already exists, skipping rename`);
      }
    }

    // Update journal entry
    if (entry) {
      const journalEntry = journal.entries.find(e => e.idx === entry.idx);
      if (journalEntry) {
        journalEntry.tag = newTag;
        console.log(`  ✓ Updated journal entry idx ${entry.idx}: ${oldTag} → ${newTag}`);
      }
    }
  });

  // Write updated journal
  fs.writeFileSync(JOURNAL_PATH, JSON.stringify(journal, null, 2) + '\n');
  console.log(`\n✅ Updated ${JOURNAL_PATH}\n`);

  console.log('✅ Migration conflicts resolved!\n');
  console.log('📝 Next steps:');
  console.log('   1. Review the changes with: git diff');
  console.log('   2. Run: pnpm db:validate (if available)');
  console.log('   3. Commit the changes');
  console.log('   4. Deploy to production\n');
}

// Run the script
try {
  fixMigrationConflicts();
} catch (error) {
  console.error('❌ Error fixing migration conflicts:');
  if (error instanceof Error) {
    console.error(`   ${error.message}`);
    console.error(`   ${error.stack}`);
  } else {
    console.error(`   ${String(error)}`);
  }
  process.exit(1);
}
