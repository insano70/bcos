"use strict";
/**
 * Winston Logger Implementation
 * Production-grade logging with Next.js compatibility
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
exports.loggers = exports.logger = exports.StructuredLogger = exports.LOG_LEVELS = void 0;
exports.createAppLogger = createAppLogger;
var winston_1 = require("winston");
var nanoid_1 = require("nanoid");
// Log levels configuration
exports.LOG_LEVELS = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3
};
// Environment detection
var isDevelopment = process.env.NODE_ENV === 'development';
var isTest = process.env.NODE_ENV === 'test';
/**
 * Create Winston logger with proper configuration
 */
function createWinstonLogger() {
    var logLevel = isTest ? 'error' :
        isDevelopment ? 'debug' :
            (process.env.LOG_LEVEL || 'info');
    var logger = winston_1.default.createLogger({
        level: logLevel,
        levels: exports.LOG_LEVELS,
        format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.errors({ stack: true }), winston_1.default.format.json(), winston_1.default.format.printf(function (info) {
            var _a;
            // Sanitize sensitive data
            var sanitized = sanitizeLogData(__assign({}, info));
            if (isDevelopment) {
                // Pretty format for development
                var emoji = info.level === 'error' ? '❌' :
                    info.level === 'warn' ? '⚠️' :
                        info.level === 'info' ? 'ℹ️' : '🔍';
                var module_1 = sanitized.module ? "[".concat(sanitized.module, "]") : '';
                var context = sanitized.userId ? " user:".concat(sanitized.userId) : '';
                var duration = sanitized.duration ? " (".concat(sanitized.duration, "ms)") : '';
                return "".concat(emoji, " ").concat(module_1, " ").concat(sanitized.message).concat(context).concat(duration);
            }
            else {
                // JSON format for production
                return JSON.stringify(__assign({ timestamp: sanitized.timestamp, level: ((_a = sanitized.level) === null || _a === void 0 ? void 0 : _a.toUpperCase()) || 'INFO', message: sanitized.message, service: 'bendcare-os', environment: process.env.NODE_ENV || 'unknown' }, sanitized));
            }
        })),
        transports: [
            new winston_1.default.transports.Console({
                silent: isTest
            })
        ]
    });
    return logger;
}
/**
 * Sanitize sensitive data from log objects
 */
function sanitizeLogData(obj) {
    if (!obj || typeof obj !== 'object')
        return obj;
    var sanitized = __assign({}, obj);
    var sensitiveKeys = [
        'password', 'token', 'secret', 'key', 'auth', 'authorization', 'cookie',
        // Healthcare-specific PII
        'ssn', 'social_security_number', 'date_of_birth', 'dob', 'phone',
        'phone_number', 'email', 'address', 'medical_record_number',
        'patient_id', 'insurance_number'
    ];
    var _loop_1 = function (key) {
        if (sensitiveKeys.some(function (sk) { return key.toLowerCase().includes(sk); })) {
            sanitized[key] = '[REDACTED]';
        }
        else if (typeof sanitized[key] === 'string') {
            sanitized[key] = sanitized[key]
                .replace(/Bearer\s+[^\s]+/gi, 'Bearer [REDACTED]')
                .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '[UUID]')
                .replace(/\b[\w.-]+@[\w.-]+\.\w+\b/gi, '[EMAIL]');
        }
        else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
            sanitized[key] = sanitizeLogData(sanitized[key]);
        }
    };
    for (var _i = 0, _a = Object.keys(sanitized); _i < _a.length; _i++) {
        var key = _a[_i];
        _loop_1(key);
    }
    return sanitized;
}
// Singleton logger instance
var baseLogger = null;
function getBaseLogger() {
    if (!baseLogger) {
        baseLogger = createWinstonLogger();
    }
    return baseLogger;
}
/**
 * Enhanced Logger with Context Support
 */
var StructuredLogger = /** @class */ (function () {
    function StructuredLogger(module, context) {
        if (context === void 0) { context = {}; }
        this.context = {};
        this.module = module;
        this.context = __assign({}, context);
    }
    /**
     * Create a child logger with additional context
     */
    StructuredLogger.prototype.child = function (context, module) {
        return new StructuredLogger(module || this.module, __assign(__assign({}, this.context), context));
    };
    /**
     * Add request context to logger
     */
    StructuredLogger.prototype.withRequest = function (request) {
        try {
            var url = new URL(request.url);
            var requestContext = {
                requestId: (0, nanoid_1.nanoid)(10),
                method: request.method,
                path: url.pathname,
                ipAddress: request.headers.get('x-forwarded-for') ||
                    request.headers.get('x-real-ip') ||
                    'unknown',
                userAgent: request.headers.get('user-agent') || 'unknown'
            };
            return this.child(requestContext);
        }
        catch (_a) {
            return this.child({ requestId: (0, nanoid_1.nanoid)(10) });
        }
    };
    /**
     * Add user context to logger
     */
    StructuredLogger.prototype.withUser = function (userId, organizationId) {
        return this.child(__assign({ userId: userId }, (organizationId && { organizationId: organizationId })));
    };
    /**
     * Debug level logging
     */
    StructuredLogger.prototype.debug = function (message, data) {
        this.log('debug', message, data);
    };
    /**
     * Info level logging
     */
    StructuredLogger.prototype.info = function (message, data) {
        this.log('info', message, data);
    };
    /**
     * Warning level logging
     */
    StructuredLogger.prototype.warn = function (message, data) {
        this.log('warn', message, data);
    };
    /**
     * Error level logging
     */
    StructuredLogger.prototype.error = function (message, error, data) {
        var errorData = error instanceof Error ? __assign({ name: error.name, message: error.message, stack: isDevelopment ? error.stack : undefined }, data) : __assign({ error: error }, data);
        this.log('error', message, errorData);
    };
    /**
     * Performance timing logging
     */
    StructuredLogger.prototype.timing = function (message, startTime, data) {
        var duration = Date.now() - startTime;
        this.info(message, __assign({ duration: duration }, data));
    };
    /**
     * HTTP request/response logging
     */
    StructuredLogger.prototype.http = function (message, statusCode, duration, data) {
        var level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
        this.log(level, message, __assign({ statusCode: statusCode, duration: duration }, data));
    };
    /**
     * Database operation logging
     */
    StructuredLogger.prototype.db = function (operation, table, duration, data) {
        this.debug("DB ".concat(operation), __assign({ table: table, duration: duration }, data));
    };
    /**
     * Authentication/authorization logging
     */
    StructuredLogger.prototype.auth = function (action, success, data) {
        var level = success ? 'info' : 'warn';
        this.log(level, "Auth: ".concat(action), __assign({ success: success }, data));
    };
    /**
     * Security event logging
     */
    StructuredLogger.prototype.security = function (event, severity, data) {
        var level = severity === 'critical' || severity === 'high' ? 'error' :
            severity === 'medium' ? 'warn' : 'info';
        this.log(level, "Security: ".concat(event), __assign({ severity: severity }, data));
    };
    /**
     * Core logging method
     */
    StructuredLogger.prototype.log = function (level, message, data) {
        var logger = getBaseLogger();
        var logData = __assign(__assign({ module: this.module }, this.context), data);
        logger.log(level, message, logData);
    };
    return StructuredLogger;
}());
exports.StructuredLogger = StructuredLogger;
/**
 * Factory function to create module-specific loggers
 */
function createAppLogger(module, context) {
    return new StructuredLogger(module, context);
}
/**
 * Default application logger
 */
exports.logger = createAppLogger('app');
/**
 * Pre-configured domain loggers
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
exports.default = exports.logger;
