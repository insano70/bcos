"use strict";
var __makeTemplateObject = (this && this.__makeTemplateObject) || function (cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
};
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanupTestData = cleanupTestData;
exports.emergencyCleanup = emergencyCleanup;
exports.cleanupByTestPattern = cleanupByTestPattern;
var db_helper_1 = require("@/tests/helpers/db-helper");
var schema_1 = require("@/lib/db/schema");
var rbac_schema_1 = require("@/lib/db/rbac-schema");
var drizzle_orm_1 = require("drizzle-orm");
var debug_1 = require("@/lib/utils/debug");
/**
 * Enhanced Test Data Cleanup with Universal Logging
 * Removes test users, organizations, roles and related RBAC data
 * Should be used sparingly - transaction rollback is preferred for normal tests
 */
function cleanupTestData() {
    return __awaiter(this, void 0, void 0, function () {
        var db, startTime, rbacStart, practicesStart, rolesStart, orgsStart, usersStart, deletedUsers, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    db = (0, db_helper_1.getTestDb)();
                    startTime = Date.now();
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 9, , 10]);
                    debug_1.debugLog.database('🧹 Starting test data cleanup...', {
                        operation: 'cleanup_test_data',
                        cleanupType: 'comprehensive',
                        testEnvironment: process.env.NODE_ENV === 'test'
                    });
                    rbacStart = Date.now();
                    return [4 /*yield*/, db.delete(rbac_schema_1.user_roles).where((0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["1=1"], ["1=1"]))))];
                case 2:
                    _a.sent();
                    return [4 /*yield*/, db.delete(rbac_schema_1.user_organizations).where((0, drizzle_orm_1.sql)(templateObject_2 || (templateObject_2 = __makeTemplateObject(["1=1"], ["1=1"]))))];
                case 3:
                    _a.sent();
                    return [4 /*yield*/, db.delete(rbac_schema_1.role_permissions).where((0, drizzle_orm_1.sql)(templateObject_3 || (templateObject_3 = __makeTemplateObject(["1=1"], ["1=1"]))))];
                case 4:
                    _a.sent();
                    debug_1.debugLog.database('✅ Cleaned up RBAC junction tables', {
                        operation: 'rbac_cleanup',
                        duration: Date.now() - rbacStart,
                        tables: ['user_roles', 'user_organizations', 'role_permissions']
                    });
                    practicesStart = Date.now();
                    return [4 /*yield*/, db.delete(schema_1.practices).where((0, drizzle_orm_1.sql)(templateObject_4 || (templateObject_4 = __makeTemplateObject(["name LIKE 'test_%' OR name LIKE '%test%' OR domain LIKE '%.local'"], ["name LIKE 'test_%' OR name LIKE '%test%' OR domain LIKE '%.local'"]))))];
                case 5:
                    _a.sent();
                    debug_1.debugLog.database('✅ Cleaned up test practices', {
                        operation: 'practices_cleanup',
                        duration: Date.now() - practicesStart,
                        pattern: 'test_% OR %test% OR %.local'
                    });
                    rolesStart = Date.now();
                    return [4 /*yield*/, db.delete(rbac_schema_1.roles).where((0, drizzle_orm_1.sql)(templateObject_5 || (templateObject_5 = __makeTemplateObject(["name LIKE 'test_%' OR name LIKE 'role_%' OR name LIKE '%test%'"], ["name LIKE 'test_%' OR name LIKE 'role_%' OR name LIKE '%test%'"]))))];
                case 6:
                    _a.sent();
                    debug_1.debugLog.database('✅ Cleaned up test roles', {
                        operation: 'roles_cleanup',
                        duration: Date.now() - rolesStart,
                        pattern: 'test_% OR role_% OR %test%'
                    });
                    orgsStart = Date.now();
                    return [4 /*yield*/, db.delete(rbac_schema_1.organizations).where((0, drizzle_orm_1.sql)(templateObject_6 || (templateObject_6 = __makeTemplateObject(["name LIKE 'test_%' OR slug LIKE 'test_%' OR name LIKE '%test%' OR slug LIKE '%test%'"], ["name LIKE 'test_%' OR slug LIKE 'test_%' OR name LIKE '%test%' OR slug LIKE '%test%'"]))))];
                case 7:
                    _a.sent();
                    debug_1.debugLog.database('✅ Cleaned up test organizations', {
                        operation: 'organizations_cleanup',
                        duration: Date.now() - orgsStart,
                        pattern: 'test_% OR %test%'
                    });
                    usersStart = Date.now();
                    return [4 /*yield*/, db.delete(schema_1.users).where((0, drizzle_orm_1.sql)(templateObject_7 || (templateObject_7 = __makeTemplateObject(["email LIKE '%@test.local' OR email LIKE '%test%' OR (first_name = 'Test' AND last_name = 'User')"], ["email LIKE '%@test.local' OR email LIKE '%test%' OR (first_name = 'Test' AND last_name = 'User')"]))))];
                case 8:
                    deletedUsers = _a.sent();
                    debug_1.debugLog.database('✅ Cleaned up test users', {
                        operation: 'users_cleanup',
                        duration: Date.now() - usersStart,
                        pattern: '%@test.local OR %test% OR Test User'
                    });
                    (0, debug_1.debugTiming)('Test data cleanup completed', startTime);
                    debug_1.debugLog.database('✅ Test data cleanup completed successfully', {
                        operation: 'cleanup_complete',
                        totalDuration: Date.now() - startTime,
                        success: true,
                        testEnvironment: process.env.NODE_ENV === 'test'
                    });
                    return [3 /*break*/, 10];
                case 9:
                    error_1 = _a.sent();
                    debug_1.debugLog.database('❌ Test data cleanup failed', {
                        operation: 'cleanup_failed',
                        error: error_1 instanceof Error ? error_1.message : 'Unknown error',
                        duration: Date.now() - startTime,
                        testEnvironment: process.env.NODE_ENV === 'test'
                    });
                    throw error_1;
                case 10: return [2 /*return*/];
            }
        });
    });
}
/**
 * Enhanced Emergency Cleanup - removes all test data matching common patterns
 * Use with caution - this is more aggressive than normal cleanup
 */
function emergencyCleanup() {
    return __awaiter(this, void 0, void 0, function () {
        var db, startTime, rbacStart, practicesStart, rolesStart, orgsStart, usersStart, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    db = (0, db_helper_1.getTestDb)();
                    startTime = Date.now();
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 9, , 10]);
                    debug_1.debugLog.database('🚨 Starting emergency cleanup...', {
                        operation: 'emergency_cleanup',
                        cleanupType: 'aggressive_patterns',
                        warning: 'aggressive_test_data_removal',
                        testEnvironment: process.env.NODE_ENV === 'test'
                    });
                    rbacStart = Date.now();
                    return [4 /*yield*/, db.delete(rbac_schema_1.user_roles).where((0, drizzle_orm_1.sql)(templateObject_8 || (templateObject_8 = __makeTemplateObject(["1=1"], ["1=1"]))))];
                case 2:
                    _a.sent();
                    return [4 /*yield*/, db.delete(rbac_schema_1.user_organizations).where((0, drizzle_orm_1.sql)(templateObject_9 || (templateObject_9 = __makeTemplateObject(["1=1"], ["1=1"]))))];
                case 3:
                    _a.sent();
                    return [4 /*yield*/, db.delete(rbac_schema_1.role_permissions).where((0, drizzle_orm_1.sql)(templateObject_10 || (templateObject_10 = __makeTemplateObject(["1=1"], ["1=1"]))))];
                case 4:
                    _a.sent();
                    debug_1.debugLog.database('✅ Emergency cleanup of RBAC junction tables', {
                        operation: 'emergency_rbac_cleanup',
                        duration: Date.now() - rbacStart,
                        tables: ['user_roles', 'user_organizations', 'role_permissions']
                    });
                    practicesStart = Date.now();
                    return [4 /*yield*/, db.delete(schema_1.practices).where((0, drizzle_orm_1.sql)(templateObject_11 || (templateObject_11 = __makeTemplateObject(["name LIKE '%test%' OR domain LIKE '%.local' OR domain LIKE '%test%'"], ["name LIKE '%test%' OR domain LIKE '%.local' OR domain LIKE '%test%'"]))))];
                case 5:
                    _a.sent();
                    debug_1.debugLog.database('✅ Emergency cleanup of practices', {
                        operation: 'emergency_practices_cleanup',
                        duration: Date.now() - practicesStart,
                        pattern: '%test% OR %.local OR %test%'
                    });
                    rolesStart = Date.now();
                    return [4 /*yield*/, db.delete(rbac_schema_1.roles).where((0, drizzle_orm_1.sql)(templateObject_12 || (templateObject_12 = __makeTemplateObject(["name LIKE '%test%' OR name LIKE '%role%' OR name LIKE 'user_%' OR name LIKE 'org_%' OR name LIKE 'practice_%'"], ["name LIKE '%test%' OR name LIKE '%role%' OR name LIKE 'user_%' OR name LIKE 'org_%' OR name LIKE 'practice_%'"]))))];
                case 6:
                    _a.sent();
                    debug_1.debugLog.database('✅ Emergency cleanup of test roles', {
                        operation: 'emergency_roles_cleanup',
                        duration: Date.now() - rolesStart,
                        pattern: '%test% OR %role% OR user_% OR org_% OR practice_%'
                    });
                    orgsStart = Date.now();
                    return [4 /*yield*/, db.delete(rbac_schema_1.organizations).where((0, drizzle_orm_1.sql)(templateObject_13 || (templateObject_13 = __makeTemplateObject(["name LIKE '%test%' OR slug LIKE '%test%' OR name LIKE '%org%'"], ["name LIKE '%test%' OR slug LIKE '%test%' OR name LIKE '%org%'"]))))];
                case 7:
                    _a.sent();
                    debug_1.debugLog.database('✅ Emergency cleanup of test organizations', {
                        operation: 'emergency_orgs_cleanup',
                        duration: Date.now() - orgsStart,
                        pattern: '%test% OR %org%'
                    });
                    usersStart = Date.now();
                    return [4 /*yield*/, db.delete(schema_1.users).where((0, drizzle_orm_1.sql)(templateObject_14 || (templateObject_14 = __makeTemplateObject(["email LIKE '%test%' OR email LIKE '%@test.local' OR (first_name = 'Test' AND last_name = 'User') OR first_name LIKE 'Test%'"], ["email LIKE '%test%' OR email LIKE '%@test.local' OR (first_name = 'Test' AND last_name = 'User') OR first_name LIKE 'Test%'"]))))];
                case 8:
                    _a.sent();
                    debug_1.debugLog.database('✅ Emergency cleanup of test users', {
                        operation: 'emergency_users_cleanup',
                        duration: Date.now() - usersStart,
                        pattern: '%test% OR %@test.local OR Test User OR Test%'
                    });
                    (0, debug_1.debugTiming)('Emergency cleanup completed', startTime);
                    debug_1.debugLog.database('✅ Emergency cleanup completed successfully', {
                        operation: 'emergency_cleanup_complete',
                        totalDuration: Date.now() - startTime,
                        success: true,
                        testEnvironment: process.env.NODE_ENV === 'test'
                    });
                    return [3 /*break*/, 10];
                case 9:
                    error_2 = _a.sent();
                    debug_1.debugLog.database('❌ Emergency cleanup failed', {
                        operation: 'emergency_cleanup_failed',
                        error: error_2 instanceof Error ? error_2.message : 'Unknown error',
                        duration: Date.now() - startTime,
                        bestEffort: true
                    });
                    // Don't throw - emergency cleanup should be best-effort
                    debug_1.debugLog.database('⚠️  Continuing despite emergency cleanup failure...', {
                        operation: 'emergency_cleanup_recovery',
                        bestEffort: true
                    });
                    return [3 /*break*/, 10];
                case 10: return [2 /*return*/];
            }
        });
    });
}
/**
 * Enhanced Pattern-based Cleanup - removes data created by specific test pattern
 * Useful for cleaning up after specific test failures
 */
function cleanupByTestPattern(testId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, startTime, pattern, rbacStart, practicesStart, rolesStart, orgsStart, usersStart, error_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    db = (0, db_helper_1.getTestDb)();
                    startTime = Date.now();
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 9, , 10]);
                    debug_1.debugLog.database("\uD83E\uDDF9 Starting cleanup for test pattern: ".concat(testId), {
                        operation: 'pattern_cleanup',
                        testId: testId,
                        cleanupType: 'pattern_specific',
                        testEnvironment: process.env.NODE_ENV === 'test'
                    });
                    pattern = "%".concat(testId, "%");
                    rbacStart = Date.now();
                    return [4 /*yield*/, db.delete(rbac_schema_1.user_roles).where((0, drizzle_orm_1.sql)(templateObject_15 || (templateObject_15 = __makeTemplateObject(["1=1"], ["1=1"]))))]; // Clear all for safety with specific test
                case 2:
                    _a.sent(); // Clear all for safety with specific test
                    return [4 /*yield*/, db.delete(rbac_schema_1.user_organizations).where((0, drizzle_orm_1.sql)(templateObject_16 || (templateObject_16 = __makeTemplateObject(["1=1"], ["1=1"]))))];
                case 3:
                    _a.sent();
                    return [4 /*yield*/, db.delete(rbac_schema_1.role_permissions).where((0, drizzle_orm_1.sql)(templateObject_17 || (templateObject_17 = __makeTemplateObject(["1=1"], ["1=1"]))))];
                case 4:
                    _a.sent();
                    debug_1.debugLog.database('✅ Pattern cleanup of RBAC junction tables', {
                        operation: 'pattern_rbac_cleanup',
                        testId: testId,
                        duration: Date.now() - rbacStart,
                        safetyApproach: 'clear_all_for_pattern_safety'
                    });
                    practicesStart = Date.now();
                    return [4 /*yield*/, db.delete(schema_1.practices).where((0, drizzle_orm_1.sql)(templateObject_18 || (templateObject_18 = __makeTemplateObject(["name LIKE ", " OR domain LIKE ", ""], ["name LIKE ", " OR domain LIKE ", ""])), pattern, pattern))];
                case 5:
                    _a.sent();
                    debug_1.debugLog.database('✅ Pattern cleanup of practices', {
                        operation: 'pattern_practices_cleanup',
                        testId: testId,
                        pattern: pattern,
                        duration: Date.now() - practicesStart
                    });
                    rolesStart = Date.now();
                    return [4 /*yield*/, db.delete(rbac_schema_1.roles).where((0, drizzle_orm_1.sql)(templateObject_19 || (templateObject_19 = __makeTemplateObject(["name LIKE ", ""], ["name LIKE ", ""])), pattern))];
                case 6:
                    _a.sent();
                    debug_1.debugLog.database('✅ Pattern cleanup of roles', {
                        operation: 'pattern_roles_cleanup',
                        testId: testId,
                        pattern: pattern,
                        duration: Date.now() - rolesStart
                    });
                    orgsStart = Date.now();
                    return [4 /*yield*/, db.delete(rbac_schema_1.organizations).where((0, drizzle_orm_1.sql)(templateObject_20 || (templateObject_20 = __makeTemplateObject(["name LIKE ", " OR slug LIKE ", ""], ["name LIKE ", " OR slug LIKE ", ""])), pattern, pattern))];
                case 7:
                    _a.sent();
                    debug_1.debugLog.database('✅ Pattern cleanup of organizations', {
                        operation: 'pattern_orgs_cleanup',
                        testId: testId,
                        pattern: pattern,
                        duration: Date.now() - orgsStart
                    });
                    usersStart = Date.now();
                    return [4 /*yield*/, db.delete(schema_1.users).where((0, drizzle_orm_1.sql)(templateObject_21 || (templateObject_21 = __makeTemplateObject(["email LIKE ", " OR first_name LIKE ", " OR last_name LIKE ", ""], ["email LIKE ", " OR first_name LIKE ", " OR last_name LIKE ", ""])), pattern, pattern, pattern))];
                case 8:
                    _a.sent();
                    debug_1.debugLog.database('✅ Pattern cleanup of users', {
                        operation: 'pattern_users_cleanup',
                        testId: testId,
                        pattern: pattern,
                        duration: Date.now() - usersStart
                    });
                    (0, debug_1.debugTiming)("Pattern cleanup completed for ".concat(testId), startTime);
                    debug_1.debugLog.database("\u2705 Cleanup completed for test pattern: ".concat(testId), {
                        operation: 'pattern_cleanup_complete',
                        testId: testId,
                        totalDuration: Date.now() - startTime,
                        success: true,
                        testEnvironment: process.env.NODE_ENV === 'test'
                    });
                    return [3 /*break*/, 10];
                case 9:
                    error_3 = _a.sent();
                    debug_1.debugLog.database("\u274C Cleanup failed for test pattern ".concat(testId), {
                        operation: 'pattern_cleanup_failed',
                        testId: testId,
                        error: error_3 instanceof Error ? error_3.message : 'Unknown error',
                        duration: Date.now() - startTime,
                        testEnvironment: process.env.NODE_ENV === 'test'
                    });
                    throw error_3;
                case 10: return [2 /*return*/];
            }
        });
    });
}
var templateObject_1, templateObject_2, templateObject_3, templateObject_4, templateObject_5, templateObject_6, templateObject_7, templateObject_8, templateObject_9, templateObject_10, templateObject_11, templateObject_12, templateObject_13, templateObject_14, templateObject_15, templateObject_16, templateObject_17, templateObject_18, templateObject_19, templateObject_20, templateObject_21;
