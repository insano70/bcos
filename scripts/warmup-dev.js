#!/usr/bin/env tsx
"use strict";
/**
 * Enhanced Development Server Warmup Script
 * Pre-compiles common routes to eliminate compilation delays
 * Now with enhanced debugging and performance monitoring
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
Object.defineProperty(exports, "__esModule", { value: true });
var debug_1 = require("@/lib/utils/debug");
var warmupLogger = (0, debug_1.createDebugLogger)('warmup-script', 'development-warmup');
var routes = [
    'http://localhost:4001/',
    'http://localhost:4001/signin',
    'http://localhost:4001/dashboard',
    'http://localhost:4001/configure/users',
    'http://localhost:4001/configure/practices',
    'http://localhost:4001/configure/charts',
    'http://localhost:4001/configure/dashboards',
    'http://localhost:4001/api/health',
    'http://localhost:4001/api/csrf',
    'http://localhost:4001/api/auth/me'
];
function warmupRoute(url) {
    return __awaiter(this, void 0, void 0, function () {
        var startTime, response, duration, result, error_1, duration, errorMessage;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    startTime = Date.now();
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    debug_1.debugLog.api("Warming up route: ".concat(url), {
                        operation: 'route_warmup',
                        url: url,
                        startTime: startTime
                    });
                    return [4 /*yield*/, fetch(url, {
                            headers: {
                                'User-Agent': 'enhanced-warmup-script/1.0'
                            }
                        })];
                case 2:
                    response = _a.sent();
                    duration = Date.now() - startTime;
                    result = {
                        url: url,
                        status: response.status,
                        statusText: response.statusText,
                        duration: duration,
                        success: response.ok
                    };
                    if (response.ok) {
                        debug_1.debugLog.performance("\u2705 ".concat(url), startTime, {
                            status: response.status,
                            statusText: response.statusText,
                            responseTime: duration,
                            performanceOptimized: duration < 1000
                        });
                    }
                    else {
                        debug_1.debugLog.api("\u26A0\uFE0F ".concat(url, " - Non-OK status"), {
                            status: response.status,
                            statusText: response.statusText,
                            duration: duration,
                            warning: 'non_ok_status'
                        });
                    }
                    return [2 /*return*/, result];
                case 3:
                    error_1 = _a.sent();
                    duration = Date.now() - startTime;
                    errorMessage = error_1 instanceof Error ? error_1.message : 'Unknown error';
                    debug_1.debugLog.api("\u274C ".concat(url, " - Error: ").concat(errorMessage), {
                        operation: 'route_warmup_failed',
                        url: url,
                        error: errorMessage,
                        duration: duration,
                        failed: true
                    });
                    return [2 /*return*/, {
                            url: url,
                            status: 0,
                            statusText: 'ERROR',
                            duration: duration,
                            success: false,
                            error: errorMessage
                        }];
                case 4: return [2 /*return*/];
            }
        });
    });
}
function warmupServer() {
    return __awaiter(this, void 0, void 0, function () {
        var startTime, results, duration, successCount, failureCount, averageResponseTime, failures, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    startTime = Date.now();
                    debug_1.debugLog.api('🔥 Warming up development server...', {
                        operation: 'development_warmup_start',
                        routeCount: routes.length,
                        serverUrl: 'localhost:4001'
                    });
                    warmupLogger.info('📍 Development warmup initiated', {
                        routes: routes.length,
                        warmupType: 'parallel',
                        developmentOptimization: true
                    });
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, Promise.all(routes.map(warmupRoute))];
                case 2:
                    results = _a.sent();
                    duration = Date.now() - startTime;
                    successCount = results.filter(function (r) { return r.success; }).length;
                    failureCount = results.length - successCount;
                    averageResponseTime = results.reduce(function (sum, r) { return sum + r.duration; }, 0) / results.length;
                    (0, debug_1.debugTiming)('Development server warmup completed', startTime);
                    debug_1.debugLog.api('🎉 Warmup completed', {
                        operation: 'development_warmup_complete',
                        totalDuration: duration,
                        routeCount: routes.length,
                        successCount: successCount,
                        failureCount: failureCount,
                        averageResponseTime: averageResponseTime,
                        performanceOptimized: averageResponseTime < 500
                    });
                    // Enhanced warmup analytics
                    warmupLogger.info('Development warmup analytics', {
                        totalRoutes: routes.length,
                        successRate: (successCount / routes.length) * 100,
                        averageResponseTime: averageResponseTime,
                        fastestRoute: Math.min.apply(Math, results.map(function (r) { return r.duration; })),
                        slowestRoute: Math.max.apply(Math, results.map(function (r) { return r.duration; })),
                        developmentReady: failureCount === 0,
                        warmupEffective: duration < 10000
                    });
                    if (failureCount > 0) {
                        failures = results.filter(function (r) { return !r.success; });
                        debug_1.debugLog.api('⚠️ Some routes failed during warmup', {
                            failureCount: failureCount,
                            failures: failures.map(function (f) { return ({ url: f.url, error: f.error }); })
                        });
                    }
                    warmupLogger.info('🚀 Development server is ready for fast responses!', {
                        serverStatus: 'warmed_up',
                        developmentReady: true,
                        totalWarmupTime: duration
                    });
                    return [3 /*break*/, 4];
                case 3:
                    error_2 = _a.sent();
                    debug_1.debugLog.api('❌ Development server warmup failed', {
                        operation: 'development_warmup_failed',
                        error: error_2 instanceof Error ? error_2.message : 'Unknown error',
                        duration: Date.now() - startTime
                    });
                    throw error_2;
                case 4: return [2 /*return*/];
            }
        });
    });
}
// Enhanced warmup execution with error handling
if (require.main === module) {
    warmupServer()
        .then(function () {
        debug_1.debugLog.api('✅ Warmup script completed successfully', {
            operation: 'warmup_script_complete',
            success: true
        });
        process.exit(0);
    })
        .catch(function (error) {
        debug_1.debugLog.api('💥 Warmup script failed', {
            operation: 'warmup_script_failed',
            error: error instanceof Error ? error.message : 'Unknown error',
            fatal: true
        });
        process.exit(1);
    });
}
