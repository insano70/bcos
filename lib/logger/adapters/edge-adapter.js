"use strict";
/**
 * Edge Runtime Logger Adapter
 * Console-based logging for Edge Runtime environments
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
exports.EdgeLoggerAdapter = void 0;
/**
 * Edge Runtime implementation of UniversalLogger
 * Uses console logging with structured data formatting
 */
var EdgeUniversalLogger = /** @class */ (function () {
    function EdgeUniversalLogger(module, context, config) {
        if (context === void 0) { context = {}; }
        if (config === void 0) { config = {}; }
        this.module = module;
        this.sanitizer = function (key, value) {
            var sensitiveKeys = [
                'password', 'token', 'secret', 'key', 'auth', 'authorization', 'cookie',
                'ssn', 'social_security_number', 'date_of_birth', 'dob', 'phone',
                'phone_number', 'email', 'address', 'medical_record_number',
                'patient_id', 'insurance_number'
            ];
            if (sensitiveKeys.some(function (sk) { return key.toLowerCase().includes(sk); })) {
                return '[REDACTED]';
            }
            if (typeof value === 'string') {
                return value
                    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [REDACTED]')
                    .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '[UUID]')
                    .replace(/\b[\w.-]+@[\w.-]+\.\w+\b/gi, '[EMAIL]');
            }
            return value;
        };
        this.context = __assign({}, context);
        this.config = __assign({ level: 'info', format: 'json', sanitizeData: true, silent: false }, config);
    }
    // Basic logging methods
    EdgeUniversalLogger.prototype.info = function (message, data) {
        this.log('info', message, data);
    };
    EdgeUniversalLogger.prototype.warn = function (message, data) {
        this.log('warn', message, data);
    };
    EdgeUniversalLogger.prototype.error = function (message, error, data) {
        var errorData = data || {};
        if (error instanceof Error) {
            errorData = __assign({ error: {
                    name: error.name,
                    message: error.message,
                    stack: error.stack
                } }, errorData);
        }
        else if (error) {
            errorData = __assign({ error: error }, errorData);
        }
        this.log('error', message, errorData);
    };
    EdgeUniversalLogger.prototype.debug = function (message, data) {
        this.log('debug', message, data);
    };
    // Context management
    EdgeUniversalLogger.prototype.child = function (context, module) {
        return new EdgeUniversalLogger(module || this.module, __assign(__assign({}, this.context), context), this.config);
    };
    EdgeUniversalLogger.prototype.withRequest = function (request) {
        try {
            var url = new URL(request.url);
            var requestContext = {
                requestId: this.generateRequestId(),
                method: request.method,
                path: url.pathname,
                userAgent: request.headers.get('user-agent') || 'unknown',
                ipAddress: request.headers.get('x-forwarded-for') ||
                    request.headers.get('x-real-ip') ||
                    'unknown'
            };
            return this.child(requestContext);
        }
        catch (_a) {
            return this.child({ requestId: this.generateRequestId() });
        }
    };
    EdgeUniversalLogger.prototype.withUser = function (userId, organizationId) {
        var userContext = { userId: userId };
        if (organizationId) {
            userContext.organizationId = organizationId;
        }
        return this.child(userContext);
    };
    // Specialized logging methods
    EdgeUniversalLogger.prototype.timing = function (message, startTime, data) {
        var duration = Date.now() - startTime;
        this.info(message, __assign({ duration: duration }, data));
    };
    EdgeUniversalLogger.prototype.http = function (message, statusCode, duration, data) {
        var level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
        this.log(level, message, __assign({ statusCode: statusCode, duration: duration }, data));
    };
    EdgeUniversalLogger.prototype.db = function (operation, table, duration, data) {
        this.debug("DB ".concat(operation), __assign({ table: table, duration: duration }, data));
    };
    EdgeUniversalLogger.prototype.auth = function (action, success, data) {
        var level = success ? 'info' : 'warn';
        this.log(level, "Auth: ".concat(action), __assign({ success: success }, data));
    };
    EdgeUniversalLogger.prototype.security = function (event, severity, data) {
        var level = severity === 'critical' || severity === 'high' ? 'error' :
            severity === 'medium' ? 'warn' : 'info';
        this.log(level, "Security: ".concat(event), __assign({ severity: severity }, data));
    };
    /**
     * Core logging implementation
     */
    EdgeUniversalLogger.prototype.log = function (level, message, data) {
        if (this.config.silent)
            return;
        // Check if log level should be output
        if (!this.shouldLog(level))
            return;
        var logEntry = {
            timestamp: new Date().toISOString(),
            level: level.toUpperCase(),
            message: message,
            module: this.module,
            service: 'bendcare-os',
            environment: this.getEnvironment(),
            runtime: 'edge',
            metadata: this.buildMetadata(data)
        };
        var sanitizedEntry = this.config.sanitizeData ?
            this.sanitizeLogEntry(logEntry) : logEntry;
        // Use appropriate console method
        var consoleMethod = this.getConsoleMethod(level);
        if (this.config.format === 'pretty') {
            this.logPretty(level, message, sanitizedEntry.metadata);
        }
        else {
            consoleMethod(JSON.stringify(sanitizedEntry));
        }
    };
    EdgeUniversalLogger.prototype.shouldLog = function (level) {
        var levels = { debug: 3, info: 2, warn: 1, error: 0 };
        var configLevel = this.config.level || 'info';
        var levelValue = levels[level];
        var configLevelValue = levels[configLevel];
        return levelValue !== undefined && configLevelValue !== undefined && levelValue <= configLevelValue;
    };
    EdgeUniversalLogger.prototype.buildMetadata = function (data) {
        return __assign(__assign({}, this.context), data);
    };
    EdgeUniversalLogger.prototype.getConsoleMethod = function (level) {
        switch (level) {
            case 'error': return console.error;
            case 'warn': return console.warn;
            case 'debug': return console.debug;
            default: return console.info;
        }
    };
    EdgeUniversalLogger.prototype.logPretty = function (level, message, metadata) {
        var emoji = level === 'error' ? '❌' :
            level === 'warn' ? '⚠️' :
                level === 'info' ? 'ℹ️' : '🔍';
        var module = this.module ? "[".concat(this.module, "]") : '';
        var userId = (metadata === null || metadata === void 0 ? void 0 : metadata.userId) ? " user:".concat(metadata.userId) : '';
        var duration = (metadata === null || metadata === void 0 ? void 0 : metadata.duration) ? " (".concat(metadata.duration, "ms)") : '';
        console.info("".concat(emoji, " ").concat(module, " ").concat(message).concat(userId).concat(duration));
        if (metadata && Object.keys(metadata).length > 0) {
            console.info('  └─', metadata);
        }
    };
    EdgeUniversalLogger.prototype.sanitizeLogEntry = function (entry) {
        return JSON.parse(JSON.stringify(entry, this.sanitizer));
    };
    EdgeUniversalLogger.prototype.generateRequestId = function () {
        return "req_".concat(Date.now(), "_").concat(Math.random().toString(36).substr(2, 9));
    };
    EdgeUniversalLogger.prototype.getEnvironment = function () {
        var _a;
        try {
            return ((_a = process === null || process === void 0 ? void 0 : process.env) === null || _a === void 0 ? void 0 : _a.NODE_ENV) || 'unknown';
        }
        catch (_b) {
            return 'edge';
        }
    };
    return EdgeUniversalLogger;
}());
/**
 * Edge Runtime Logger Adapter
 * Creates UniversalLogger instances for Edge Runtime
 */
var EdgeLoggerAdapter = /** @class */ (function () {
    function EdgeLoggerAdapter(config) {
        this.config = config;
    }
    EdgeLoggerAdapter.prototype.createLogger = function (module, context) {
        return new EdgeUniversalLogger(module, context, this.config);
    };
    EdgeLoggerAdapter.prototype.isAvailable = function () {
        // Edge adapter is always available as it only uses console
        return typeof console !== 'undefined';
    };
    return EdgeLoggerAdapter;
}());
exports.EdgeLoggerAdapter = EdgeLoggerAdapter;
