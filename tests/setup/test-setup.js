"use strict";
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
var vitest_1 = require("vitest");
var db_helper_1 = require("@/tests/helpers/db-helper");
var cleanup_1 = require("./cleanup");
var logger_1 = require("@/lib/logger");
// Ensure environment variables are set for tests
// Only set DATABASE_URL if it's not already set (to avoid overriding existing config)
if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = 'postgresql://bcos_d:oRMgpg2micRfQVXz7Bfbr@localhost:5432/bcos_d';
}
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-that-is-at-least-32-characters-long-for-security';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-that-is-at-least-32-characters-long';
/**
 * Initialize main transaction for the entire test session
 * This runs once before all tests in this file
 */
(0, vitest_1.beforeAll)(function () { return __awaiter(void 0, void 0, void 0, function () {
    var error_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                logger_1.logger.info('Initializing main test transaction', {
                    operation: 'testSetup',
                    phase: 'transaction'
                });
                return [4 /*yield*/, (0, db_helper_1.initializeMainTransaction)()];
            case 1:
                _a.sent();
                return [3 /*break*/, 3];
            case 2:
                error_1 = _a.sent();
                logger_1.logger.error('Failed to initialize main transaction', {
                    error: error_1 instanceof Error ? error_1.message : 'Unknown error',
                    stack: error_1 instanceof Error ? error_1.stack : undefined,
                    operation: 'testSetup'
                });
                throw error_1;
            case 3: return [2 /*return*/];
        }
    });
}); });
/**
 * Per-test setup - runs before each test
 * Sets up a savepoint for individual test isolation
 */
(0, vitest_1.beforeEach)(function () { return __awaiter(void 0, void 0, void 0, function () {
    var error_2;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                // Create a savepoint for this test
                return [4 /*yield*/, (0, db_helper_1.getTestTransaction)()];
            case 1:
                // Create a savepoint for this test
                _a.sent();
                return [3 /*break*/, 3];
            case 2:
                error_2 = _a.sent();
                logger_1.logger.error('Test setup failed', {
                    error: error_2 instanceof Error ? error_2.message : 'Unknown error',
                    stack: error_2 instanceof Error ? error_2.stack : undefined,
                    operation: 'testSetup'
                });
                throw error_2;
            case 3: return [2 /*return*/];
        }
    });
}); });
/**
 * Per-test teardown - runs after each test
 * Rolls back to the savepoint to ensure test isolation
 */
(0, vitest_1.afterEach)(function () { return __awaiter(void 0, void 0, void 0, function () {
    var error_3, emergencyError_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 7]);
                // Rollback to the savepoint (undoes all test changes)
                return [4 /*yield*/, (0, db_helper_1.rollbackTransaction)()];
            case 1:
                // Rollback to the savepoint (undoes all test changes)
                _a.sent();
                return [3 /*break*/, 7];
            case 2:
                error_3 = _a.sent();
                logger_1.logger.warn('Test cleanup failed', {
                    error: error_3 instanceof Error ? error_3.message : 'Unknown error',
                    operation: 'testCleanup'
                });
                _a.label = 3;
            case 3:
                _a.trys.push([3, 5, , 6]);
                return [4 /*yield*/, (0, cleanup_1.emergencyCleanup)()];
            case 4:
                _a.sent();
                return [3 /*break*/, 6];
            case 5:
                emergencyError_1 = _a.sent();
                logger_1.logger.error('Emergency cleanup failed', {
                    error: emergencyError_1 instanceof Error ? emergencyError_1.message : 'Unknown error',
                    operation: 'emergencyCleanup'
                });
                return [3 /*break*/, 6];
            case 6: return [3 /*break*/, 7];
            case 7: return [2 /*return*/];
        }
    });
}); });
/**
 * Global cleanup - runs after all tests complete
 * Rolls back main transaction and cleans up connections
 */
(0, vitest_1.afterAll)(function () { return __awaiter(void 0, void 0, void 0, function () {
    var error_4;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                // TEST: logger.info('🧹 Starting process cleanup...')
                logger_1.logger.info('Starting process cleanup', {
                    operation: 'processCleanup'
                });
                // This will rollback the main transaction and clean up connections
                return [4 /*yield*/, (0, db_helper_1.cleanupTestDb)()
                    // TEST: logger.info('✅ Process cleanup completed')
                ];
            case 1:
                // This will rollback the main transaction and clean up connections
                _a.sent();
                // TEST: logger.info('✅ Process cleanup completed')
                logger_1.logger.info('Process cleanup completed', {
                    operation: 'processCleanup'
                });
                return [3 /*break*/, 3];
            case 2:
                error_4 = _a.sent();
                logger_1.logger.error('Process cleanup failed', {
                    error: error_4 instanceof Error ? error_4.message : 'Unknown error',
                    operation: 'processCleanup'
                });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
