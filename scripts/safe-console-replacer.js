#!/usr/bin/env tsx
"use strict";
/**
 * Safe Console Replacement Tool - Single File Processing
 * Processes ONE file at a time with proper backups and validation
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SafeConsoleReplacer = void 0;
var fs_1 = require("fs");
var path_1 = require("path");
var SafeConsoleReplacer = /** @class */ (function () {
    function SafeConsoleReplacer(backupDir) {
        if (backupDir === void 0) { backupDir = '.console-migration-backups'; }
        this.backupDir = (0, path_1.join)(process.cwd(), backupDir);
        this.ensureBackupDirectory();
        this.replacements = this.createSafeReplacementPatterns();
    }
    /**
     * Ensure backup directory exists
     */
    SafeConsoleReplacer.prototype.ensureBackupDirectory = function () {
        if (!(0, fs_1.existsSync)(this.backupDir)) {
            (0, fs_1.mkdirSync)(this.backupDir, { recursive: true });
            console.log("\u2705 Created backup directory: ".concat(this.backupDir));
        }
    };
    /**
     * Create SAFE replacement patterns (no aggressive type assertions)
     */
    SafeConsoleReplacer.prototype.createSafeReplacementPatterns = function () {
        return [
            // Error patterns - highest priority, most careful
            {
                pattern: /console\.error\(\s*(['"`])([^'"`]+)\1\s*,\s*([^)]+)\s*\)/g,
                replacement: function (match, quote, message, data) {
                    // Only replace if the data looks like a simple object literal
                    if (data.trim().startsWith('{') && !data.includes(' as ')) {
                        return "logger.error('".concat(message, "', ").concat(data, ")");
                    }
                    return match; // Don't replace complex expressions
                },
                category: 'error',
                description: 'Error logging with simple object data',
                requiresImport: true,
                importStatement: 'import { logger } from \'@/lib/logger\';'
            },
            {
                pattern: /console\.error\(\s*(['"`])([^'"`]+)\1\s*\)/g,
                replacement: 'logger.error(\'$2\')',
                category: 'error',
                description: 'Simple error logging',
                requiresImport: true,
                importStatement: 'import { logger } from \'@/lib/logger\';'
            },
            // Warning patterns
            {
                pattern: /console\.warn\(\s*(['"`])([^'"`]+)\1\s*,\s*([^)]+)\s*\)/g,
                replacement: function (match, quote, message, data) {
                    if (data.trim().startsWith('{') && !data.includes(' as ')) {
                        return "logger.warn('".concat(message, "', ").concat(data, ")");
                    }
                    return match;
                },
                category: 'warn',
                description: 'Warning logging with simple object data',
                requiresImport: true,
                importStatement: 'import { logger } from \'@/lib/logger\';'
            },
            {
                pattern: /console\.warn\(\s*(['"`])([^'"`]+)\1\s*\)/g,
                replacement: 'logger.warn(\'$2\')',
                category: 'warn',
                description: 'Simple warning logging',
                requiresImport: true,
                importStatement: 'import { logger } from \'@/lib/logger\';'
            },
            // Info patterns
            {
                pattern: /console\.info\(\s*(['"`])([^'"`]+)\1\s*\)/g,
                replacement: 'logger.info(\'$2\')',
                category: 'info',
                description: 'Simple info logging',
                requiresImport: true,
                importStatement: 'import { logger } from \'@/lib/logger\';'
            },
            // Log patterns (convert to info)
            {
                pattern: /console\.log\(\s*(['"`])([^'"`]+)\1\s*\)/g,
                replacement: 'logger.info(\'$2\')',
                category: 'log',
                description: 'Simple log to info conversion',
                requiresImport: true,
                importStatement: 'import { logger } from \'@/lib/logger\';'
            },
            // Debug patterns
            {
                pattern: /console\.debug\(\s*(['"`])([^'"`]+)\1\s*\)/g,
                replacement: 'logger.debug(\'$2\')',
                category: 'debug',
                description: 'Simple debug logging',
                requiresImport: true,
                importStatement: 'import { logger } from \'@/lib/logger\';'
            }
        ];
    };
    /**
     * Process a single file safely
     */
    SafeConsoleReplacer.prototype.processFile = function (filePath_1) {
        return __awaiter(this, arguments, void 0, function (filePath, dryRun) {
            var result, originalContent, modifiedContent, totalReplacements, hasLoggerImport, _i, _a, replacement, matches, replacementContent, _b, matches_1, match, originalText, replacementText, backupPath, errorMessage;
            if (dryRun === void 0) { dryRun = true; }
            return __generator(this, function (_c) {
                result = {
                    success: false,
                    originalFile: filePath,
                    backupFile: '',
                    replacements: 0,
                    errors: [],
                    requiresImport: false,
                    importAdded: false
                };
                try {
                    console.log("\n\uD83D\uDD0D Processing: ".concat(filePath));
                    console.log("\uD83D\uDCCB Mode: ".concat(dryRun ? 'DRY RUN' : 'EXECUTE'));
                    originalContent = (0, fs_1.readFileSync)(filePath, 'utf-8');
                    modifiedContent = originalContent;
                    totalReplacements = 0;
                    hasLoggerImport = /import.*logger.*from.*['"`]@\/lib\/logger['"`]/.test(originalContent);
                    console.log("\uD83D\uDCE6 Existing logger import: ".concat(hasLoggerImport ? 'YES' : 'NO'));
                    // Apply replacements
                    for (_i = 0, _a = this.replacements; _i < _a.length; _i++) {
                        replacement = _a[_i];
                        matches = Array.from(modifiedContent.matchAll(replacement.pattern));
                        if (matches.length > 0) {
                            console.log("  \uD83D\uDD04 Found ".concat(matches.length, " ").concat(replacement.category, " patterns"));
                            replacementContent = modifiedContent;
                            for (_b = 0, matches_1 = matches; _b < matches_1.length; _b++) {
                                match = matches_1[_b];
                                originalText = match[0];
                                replacementText = void 0;
                                if (typeof replacement.replacement === 'function') {
                                    replacementText = replacement.replacement.apply(replacement, __spreadArray([match[0]], match.slice(1), false));
                                }
                                else {
                                    replacementText = originalText.replace(replacement.pattern, replacement.replacement);
                                }
                                // Only replace if something actually changed
                                if (replacementText !== originalText) {
                                    replacementContent = replacementContent.replace(originalText, replacementText);
                                    totalReplacements++;
                                    console.log("    \u2705 ".concat(originalText.trim(), " \u2192 ").concat(replacementText.trim()));
                                }
                                else {
                                    console.log("    \u23ED\uFE0F  Skipped complex pattern: ".concat(originalText.trim()));
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
                        console.log("  \uD83D\uDCE5 Added logger import");
                    }
                    console.log("\uD83D\uDCCA Total replacements: ".concat(totalReplacements));
                    if (totalReplacements === 0) {
                        console.log("\u2705 No console calls found - file already clean");
                        result.success = true;
                        return [2 /*return*/, result];
                    }
                    if (dryRun) {
                        console.log("\uD83D\uDD0D DRY RUN: Would make ".concat(totalReplacements, " replacements"));
                        result.success = true;
                        return [2 /*return*/, result];
                    }
                    backupPath = this.createBackup(filePath, originalContent);
                    result.backupFile = backupPath;
                    // Write modified file
                    (0, fs_1.writeFileSync)(filePath, modifiedContent, 'utf-8');
                    console.log("\u2705 File processed successfully");
                    console.log("\uD83D\uDCBE Backup created: ".concat(backupPath));
                    result.success = true;
                }
                catch (error) {
                    errorMessage = error instanceof Error ? error.message : String(error);
                    result.errors.push(errorMessage);
                    console.log("\u274C Error processing file: ".concat(errorMessage));
                }
                return [2 /*return*/, result];
            });
        });
    };
    /**
     * Create backup in dedicated directory
     */
    SafeConsoleReplacer.prototype.createBackup = function (filePath, content) {
        var timestamp = Date.now();
        var fileName = (0, path_1.basename)(filePath);
        var relativePath = filePath.replace(process.cwd() + '/', '').replace(/\//g, '_');
        var backupFileName = "".concat(relativePath, ".").concat(timestamp, ".backup");
        var backupPath = (0, path_1.join)(this.backupDir, backupFileName);
        // Ensure backup subdirectories exist
        (0, fs_1.mkdirSync)((0, path_1.dirname)(backupPath), { recursive: true });
        (0, fs_1.writeFileSync)(backupPath, content, 'utf-8');
        return backupPath;
    };
    /**
     * Add logger import to file
     */
    SafeConsoleReplacer.prototype.addLoggerImport = function (content) {
        var lines = content.split('\n');
        // Find the best place to insert the import
        var insertIndex = 0;
        // Look for existing imports
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (line.startsWith('import ')) {
                insertIndex = i + 1;
            }
            else if (line && !line.startsWith('//') && !line.startsWith('/*') && !line.startsWith('*')) {
                break;
            }
        }
        lines.splice(insertIndex, 0, 'import { logger } from \'@/lib/logger\';');
        return lines.join('\n');
    };
    /**
     * Restore a file from backup
     */
    SafeConsoleReplacer.prototype.restoreFromBackup = function (backupPath, targetFile) {
        try {
            if (!(0, fs_1.existsSync)(backupPath)) {
                console.log("\u274C Backup file not found: ".concat(backupPath));
                return false;
            }
            var backupContent = (0, fs_1.readFileSync)(backupPath, 'utf-8');
            (0, fs_1.writeFileSync)(targetFile, backupContent, 'utf-8');
            console.log("\u2705 Restored ".concat(targetFile, " from backup"));
            return true;
        }
        catch (error) {
            console.log("\u274C Failed to restore from backup: ".concat(error));
            return false;
        }
    };
    /**
     * List available backups for a file
     */
    SafeConsoleReplacer.prototype.listBackupsForFile = function (filePath) {
        try {
            var relativePath = filePath.replace(process.cwd() + '/', '').replace(/\//g, '_');
            var backupPattern_1 = relativePath;
            if (!(0, fs_1.existsSync)(this.backupDir)) {
                return [];
            }
            var files = require('fs').readdirSync(this.backupDir);
            return files
                .filter(function (file) { return file.startsWith(backupPattern_1) && file.endsWith('.backup'); })
                .sort()
                .reverse(); // Most recent first
        }
        catch (error) {
            console.log("\u274C Error listing backups: ".concat(error));
            return [];
        }
    };
    return SafeConsoleReplacer;
}());
exports.SafeConsoleReplacer = SafeConsoleReplacer;
/**
 * CLI Interface
 */
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var args, targetFile, execute, listBackups, restoreIndex, backupFile, replacer, backups, success, result, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    args = process.argv.slice(2);
                    if (args.length === 0) {
                        console.log("\n\uD83D\uDD27 Safe Console Replacer - Single File Processing\n\nUSAGE:\n  npx tsx scripts/safe-console-replacer.ts <file> [--execute] [--restore <backup>]\n\nOPTIONS:\n  <file>                    Target file to process\n  --execute                 Actually make changes (default: dry run)\n  --restore <backup>        Restore file from specific backup\n  --list-backups           Show available backups for file\n\nEXAMPLES:\n  # Dry run on a file\n  npx tsx scripts/safe-console-replacer.ts lib/security/csrf-unified.ts\n\n  # Execute changes\n  npx tsx scripts/safe-console-replacer.ts lib/security/csrf-unified.ts --execute\n\n  # List backups\n  npx tsx scripts/safe-console-replacer.ts lib/security/csrf-unified.ts --list-backups\n\n  # Restore from backup\n  npx tsx scripts/safe-console-replacer.ts lib/security/csrf-unified.ts --restore .console-migration-backups/lib_security_csrf-unified.ts.1234567890.backup\n\nSAFETY FEATURES:\n  \u2022 Processes ONE file at a time\n  \u2022 Creates timestamped backups in dedicated directory  \n  \u2022 Dry run by default\n  \u2022 Safe replacement patterns (no aggressive type assertions)\n  \u2022 Easy restoration from backups\n");
                        process.exit(0);
                    }
                    targetFile = args[0];
                    execute = args.includes('--execute');
                    listBackups = args.includes('--list-backups');
                    restoreIndex = args.indexOf('--restore');
                    backupFile = restoreIndex >= 0 ? args[restoreIndex + 1] : null;
                    replacer = new SafeConsoleReplacer();
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    if (listBackups) {
                        console.log("\uD83D\uDCCB Available backups for ".concat(targetFile, ":"));
                        backups = replacer.listBackupsForFile(targetFile);
                        if (backups.length === 0) {
                            console.log('  No backups found');
                        }
                        else {
                            backups.forEach(function (backup, index) {
                                console.log("  ".concat(index + 1, ". ").concat(backup));
                            });
                        }
                        return [2 /*return*/];
                    }
                    if (backupFile) {
                        success = replacer.restoreFromBackup(backupFile, targetFile);
                        process.exit(success ? 0 : 1);
                        return [2 /*return*/];
                    }
                    if (!(0, fs_1.existsSync)(targetFile)) {
                        console.log("\u274C File not found: ".concat(targetFile));
                        process.exit(1);
                    }
                    return [4 /*yield*/, replacer.processFile(targetFile, !execute)];
                case 2:
                    result = _a.sent();
                    if (!result.success) {
                        console.log("\u274C Processing failed:", result.errors);
                        process.exit(1);
                    }
                    if (execute && result.replacements > 0) {
                        console.log("\n\uD83C\uDF89 Successfully processed ".concat(targetFile));
                        console.log("   Replacements: ".concat(result.replacements));
                        console.log("   Backup: ".concat(result.backupFile));
                        console.log("\n\uD83D\uDCA1 To restore if needed:");
                        console.log("   npx tsx scripts/safe-console-replacer.ts ".concat(targetFile, " --restore ").concat(result.backupFile));
                    }
                    return [3 /*break*/, 4];
                case 3:
                    error_1 = _a.sent();
                    console.log("\uD83D\uDCA5 Fatal error: ".concat(error_1));
                    process.exit(1);
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    });
}
// Run CLI if executed directly
if (require.main === module) {
    main();
}
