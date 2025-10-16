#!/usr/bin/env tsx
/**
 * Type Safety Analysis Script
 * Analyzes `any` types and `as` assertions in the codebase
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface TypeIssue {
  file: string;
  line: number;
  content: string;
  type: 'any-type' | 'type-assertion';
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
}

const EXCLUDE_PATTERNS = [
  'node_modules',
  'infrastructure/node_modules',
  '.next',
  'dist',
  'build',
  '*.d.ts',
];

const ANY_TYPE_PATTERNS = [
  /:\s*any\b/,
  /<any>/,
  /any\[\]/,
  /Array<any>/,
  /Promise<any>/,
  /Record<\w+,\s*any>/,
];

function runGrepCommand(pattern: string): string {
  try {
    const excludeArgs = EXCLUDE_PATTERNS.map(p => `--glob '!${p}'`).join(' ');
    const cmd = `rg "${pattern}" ${excludeArgs} --type ts --type tsx -n`;
    return execSync(cmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
  } catch (error) {
    return '';
  }
}

function analyzeAnyTypes(): TypeIssue[] {
  const issues: TypeIssue[] = [];

  // Find any types
  const anyResults = runGrepCommand(':\\s*any\\b|<any>|any\\[\\]|Array<any>');
  const lines = anyResults.split('\n').filter(Boolean);

  for (const line of lines) {
    const match = line.match(/^([^:]+):(\d+):(.+)$/);
    if (!match) continue;

    const [, filePath, lineNum, content] = match;

    // Skip if any captured group is undefined or third-party code
    if (!filePath || !lineNum || !content) continue;
    if (filePath.includes('node_modules') || filePath.endsWith('.d.ts')) continue;

    const category = categorizeAnyType(filePath, content);
    const severity = categorizeSeverity(filePath, content);

    issues.push({
      file: filePath,
      line: parseInt(lineNum),
      content: content.trim(),
      type: 'any-type',
      severity,
      category,
    });
  }

  return issues;
}

function analyzeTypeAssertions(): TypeIssue[] {
  const issues: TypeIssue[] = [];

  // Find type assertions
  const assertionResults = runGrepCommand('\\sas\\s+');
  const lines = assertionResults.split('\n').filter(Boolean);

  for (const line of lines) {
    const match = line.match(/^([^:]+):(\d+):(.+)$/);
    if (!match) continue;

    const [, filePath, lineNum, content] = match;

    // Skip if any captured group is undefined or third-party code
    if (!filePath || !lineNum || !content) continue;
    if (filePath.includes('node_modules') || filePath.endsWith('.d.ts')) continue;
    if (content.includes('import ') && content.includes(' as ')) continue;

    const category = categorizeAssertion(filePath, content);
    const severity = categorizeSeverity(filePath, content);

    issues.push({
      file: filePath,
      line: parseInt(lineNum),
      content: content.trim(),
      type: 'type-assertion',
      severity,
      category,
    });
  }

  return issues;
}

function categorizeAnyType(filePath: string, content: string): string {
  if (filePath.includes('templates/')) return 'templates';
  if (filePath.includes('tests/')) return 'tests';
  if (content.includes('colorStyles')) return 'react-props';
  if (content.includes('any[]') || content.includes('Array<any>')) return 'arrays';
  if (content.includes('Promise<any>')) return 'promises';
  if (content.includes('Record')) return 'records';
  if (content.includes('fn:') || content.includes('(')) return 'functions';
  return 'other';
}

function categorizeAssertion(filePath: string, content: string): string {
  if (content.includes(' as any')) return 'as-any';
  if (content.includes(' as string')) return 'as-string';
  if (content.includes(' as number')) return 'as-number';
  if (content.includes(' as const')) return 'as-const';
  if (content.includes(' as unknown')) return 'as-unknown';
  if (filePath.includes('tests/')) return 'test-mocking';
  return 'type-coercion';
}

function categorizeSeverity(filePath: string, content: string): 'critical' | 'high' | 'medium' | 'low' {
  // Critical: any in production API or database layer
  if (filePath.includes('/api/') && content.includes(': any')) return 'critical';
  if (filePath.includes('/lib/db/') && content.includes(': any')) return 'critical';
  if (filePath.includes('/lib/services/') && content.includes(': any')) return 'critical';

  // High: any in core business logic
  if (filePath.includes('/lib/') && content.includes(': any')) return 'high';
  if (content.includes(' as any')) return 'high';

  // Medium: assertions in components or utilities
  if (filePath.includes('/components/') || filePath.includes('/hooks/')) return 'medium';

  // Low: tests and templates
  if (filePath.includes('/tests/') || filePath.includes('/templates/')) return 'low';

  return 'medium';
}

function generateReport(anyIssues: TypeIssue[], assertionIssues: TypeIssue[]) {
  const allIssues = [...anyIssues, ...assertionIssues];

  console.log('\n' + '='.repeat(80));
  console.log('TYPE SAFETY ANALYSIS REPORT');
  console.log('='.repeat(80) + '\n');

  // Summary
  console.log('## SUMMARY\n');
  console.log(`Total any types found: ${anyIssues.length}`);
  console.log(`Total type assertions found: ${assertionIssues.length}`);
  console.log(`Total type safety issues: ${allIssues.length}\n`);

  // Severity breakdown
  console.log('## SEVERITY BREAKDOWN\n');
  const severityCounts = {
    critical: allIssues.filter(i => i.severity === 'critical').length,
    high: allIssues.filter(i => i.severity === 'high').length,
    medium: allIssues.filter(i => i.severity === 'medium').length,
    low: allIssues.filter(i => i.severity === 'low').length,
  };
  console.log(`Critical: ${severityCounts.critical}`);
  console.log(`High:     ${severityCounts.high}`);
  console.log(`Medium:   ${severityCounts.medium}`);
  console.log(`Low:      ${severityCounts.low}\n`);

  // Any types by category
  console.log('## ANY TYPES BY CATEGORY\n');
  const anyCategories = groupBy(anyIssues, i => i.category);
  for (const [category, issues] of Object.entries(anyCategories).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`${category}: ${issues.length}`);
  }
  console.log('');

  // Type assertions by category
  console.log('## TYPE ASSERTIONS BY CATEGORY\n');
  const assertionCategories = groupBy(assertionIssues, i => i.category);
  for (const [category, issues] of Object.entries(assertionCategories).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`${category}: ${issues.length}`);
  }
  console.log('');

  // Critical issues
  const criticalIssues = allIssues.filter(i => i.severity === 'critical');
  if (criticalIssues.length > 0) {
    console.log('## CRITICAL ISSUES (Must Fix)\n');
    for (const issue of criticalIssues.slice(0, 20)) {
      console.log(`${issue.file}:${issue.line}`);
      console.log(`  Type: ${issue.type}, Category: ${issue.category}`);
      console.log(`  ${issue.content.substring(0, 100)}${issue.content.length > 100 ? '...' : ''}`);
      console.log('');
    }
  }

  // High priority issues
  const highIssues = allIssues.filter(i => i.severity === 'high');
  if (highIssues.length > 0) {
    console.log(`## HIGH PRIORITY ISSUES (${highIssues.length} total, showing first 20)\n`);
    for (const issue of highIssues.slice(0, 20)) {
      console.log(`${issue.file}:${issue.line}`);
      console.log(`  ${issue.content.substring(0, 120)}${issue.content.length > 120 ? '...' : ''}`);
      console.log('');
    }
  }

  // Files with most issues
  console.log('## FILES WITH MOST ISSUES\n');
  const fileGroups = groupBy(allIssues, i => i.file);
  const sortedFiles = Object.entries(fileGroups)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 20);

  for (const [file, issues] of sortedFiles) {
    console.log(`${file}: ${issues.length} issues`);
  }
  console.log('');

  console.log('='.repeat(80));
}

function groupBy<T>(array: T[], keyFn: (item: T) => string): Record<string, T[]> {
  return array.reduce(
    (acc, item) => {
      const key = keyFn(item);
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    },
    {} as Record<string, T[]>
  );
}

// Main execution
console.log('Analyzing type safety issues...');
console.log('This may take a minute...\n');

const anyIssues = analyzeAnyTypes();
const assertionIssues = analyzeTypeAssertions();

generateReport(anyIssues, assertionIssues);

// Write detailed results to file
const results = {
  summary: {
    totalAnyTypes: anyIssues.length,
    totalAssertions: assertionIssues.length,
    byCategory: {
      anyTypes: groupBy(anyIssues, i => i.category),
      assertions: groupBy(assertionIssues, i => i.category),
    },
    bySeverity: {
      critical: [...anyIssues, ...assertionIssues].filter(i => i.severity === 'critical').length,
      high: [...anyIssues, ...assertionIssues].filter(i => i.severity === 'high').length,
      medium: [...anyIssues, ...assertionIssues].filter(i => i.severity === 'medium').length,
      low: [...anyIssues, ...assertionIssues].filter(i => i.severity === 'low').length,
    },
  },
  issues: {
    anyTypes: anyIssues,
    assertions: assertionIssues,
  },
};

fs.writeFileSync(
  'type-safety-analysis.json',
  JSON.stringify(results, null, 2)
);

console.log('\nDetailed results written to: type-safety-analysis.json');
