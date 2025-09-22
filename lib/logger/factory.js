"use strict";
/**
 * Universal Logger Factory
 * Provides backward-compatible factory functions for creating loggers
 */
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLoggerWithAdapter = exports.clearLoggerCache = exports.getLoggerDiagnostics = exports.logger = exports.loggers = void 0;
exports.createAppLogger = createAppLogger;
exports.createAPILogger = createAPILogger;
exports.createTrackedAppLogger = createTrackedAppLogger;
var runtime_logger_1 = require("./runtime-logger");
/**
 * Create application logger with module-specific context
 * Drop-in replacement for the existing createAppLogger function
 */
function createAppLogger(module, context, config) {
    return (0, runtime_logger_1.createUniversalLogger)(module, context, config);
}
/**
 * Create API logger with request context
 * Drop-in replacement for the existing createAPILogger function
 */
function createAPILogger(request, config) {
    var url = new URL(request.url);
    var searchParams = Object.fromEntries(url.searchParams);
    var context = __assign({ requestId: generateRequestId(), method: request.method, path: url.pathname, query: Object.keys(searchParams).length > 0 ? searchParams : {}, ipAddress: extractIPAddress(request) }, (request.headers.get('user-agent') && { userAgent: request.headers.get('user-agent') || 'unknown' }));
    return (0, runtime_logger_1.createUniversalLogger)('api', context, config);
}
/**
 * Create logger with development runtime tracking
 * Useful for monitoring which adapter is being used in different contexts
 */
function createTrackedAppLogger(module, context, config) {
    return (0, runtime_logger_1.createTrackedLogger)(module, context, config);
}
/**
 * Create pre-configured domain-specific loggers
 * Maintains compatibility with existing logger exports
 */
exports.loggers = {
    auth: createAppLogger('auth'),
    db: createAppLogger('database'),
    api: createAppLogger('api'),
    rbac: createAppLogger('rbac'),
    security: createAppLogger('security'),
    email: createAppLogger('email'),
    webhooks: createAppLogger('webhooks'),
    upload: createAppLogger('upload'),
    system: createAppLogger('system')
};
/**
 * Default application logger
 * Maintains compatibility with existing default export
 */
exports.logger = createAppLogger('app');
/**
 * Helper functions (replicated from existing api-logger.ts)
 */
function generateRequestId() {
    return "req_".concat(Date.now(), "_").concat(Math.random().toString(36).substr(2, 9));
}
function extractIPAddress(request) {
    return request.headers.get('x-forwarded-for') ||
        request.headers.get('x-real-ip') ||
        'unknown';
}
// Re-export runtime utilities
var runtime_logger_2 = require("./runtime-logger");
Object.defineProperty(exports, "getLoggerDiagnostics", { enumerable: true, get: function () { return runtime_logger_2.getLoggerDiagnostics; } });
Object.defineProperty(exports, "clearLoggerCache", { enumerable: true, get: function () { return runtime_logger_2.clearLoggerCache; } });
Object.defineProperty(exports, "createLoggerWithAdapter", { enumerable: true, get: function () { return runtime_logger_2.createLoggerWithAdapter; } });
exports.default = exports.logger;
