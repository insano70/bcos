"use strict";
/**
 * Enhanced Debug Logging Utility
 * Uses universal logger with development-only behavior and enhanced debugging features
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
exports.enhancedErrorLog = exports.enhancedDebugLog = exports.debugAssert = exports.debugTiming = exports.createDebugLogger = exports.performanceErrorLog = exports.businessErrorLog = exports.errorLog = exports.debugLog = void 0;
var factory_1 = require("@/lib/logger/factory");
var isDevelopment = process.env.NODE_ENV === 'development';
// Create universal debug loggers with component context
var debugLoggers = {
    auth: (0, factory_1.createAppLogger)('debug-auth', {
        component: 'security',
        feature: 'authentication-debug',
        module: 'debug-utility'
    }),
    middleware: (0, factory_1.createAppLogger)('debug-middleware', {
        component: 'middleware',
        feature: 'middleware-debug',
        module: 'debug-utility'
    }),
    rbac: (0, factory_1.createAppLogger)('debug-rbac', {
        component: 'security',
        feature: 'rbac-debug',
        module: 'debug-utility'
    }),
    security: (0, factory_1.createAppLogger)('debug-security', {
        component: 'security',
        feature: 'security-debug',
        module: 'debug-utility',
        securityLevel: 'critical'
    }),
    session: (0, factory_1.createAppLogger)('debug-session', {
        component: 'authentication',
        feature: 'session-debug',
        module: 'debug-utility'
    }),
    database: (0, factory_1.createAppLogger)('debug-database', {
        component: 'database',
        feature: 'database-debug',
        module: 'debug-utility'
    }),
    api: (0, factory_1.createAppLogger)('debug-api', {
        component: 'api',
        feature: 'api-debug',
        module: 'debug-utility'
    }),
    business: (0, factory_1.createAppLogger)('debug-business', {
        component: 'business-logic',
        feature: 'business-debug',
        module: 'debug-utility'
    })
};
exports.debugLog = {
    auth: function (message, data) {
        if (isDevelopment) {
            debugLoggers.auth.debug("\uD83D\uDD10 AUTH: ".concat(message), data);
        }
    },
    middleware: function (message, data) {
        if (isDevelopment) {
            debugLoggers.middleware.debug("\uD83C\uDF10 MIDDLEWARE: ".concat(message), data);
        }
    },
    rbac: function (message, data) {
        if (isDevelopment) {
            debugLoggers.rbac.debug("\uD83C\uDFAF RBAC: ".concat(message), data);
        }
    },
    security: function (message, data) {
        if (isDevelopment) {
            debugLoggers.security.debug("\uD83D\uDEE1\uFE0F SECURITY: ".concat(message), data);
            // Enhanced security debugging with security event logging
            debugLoggers.security.security('debug_security_event', 'low', {
                action: 'security_debug_log',
                debugMessage: message,
                debugData: data
            });
        }
    },
    session: function (message, data) {
        if (isDevelopment) {
            debugLoggers.session.debug("\uD83D\uDD04 SESSION: ".concat(message), data);
        }
    },
    // Enhanced debug categories
    database: function (message, data) {
        if (isDevelopment) {
            debugLoggers.database.debug("\uD83D\uDDC4\uFE0F DATABASE: ".concat(message), data);
        }
    },
    api: function (message, data) {
        if (isDevelopment) {
            debugLoggers.api.debug("\uD83C\uDF10 API: ".concat(message), data);
        }
    },
    business: function (message, data) {
        if (isDevelopment) {
            debugLoggers.business.debug("\uD83D\uDCBC BUSINESS: ".concat(message), data);
        }
    },
    // Performance debugging
    performance: function (message, startTime, data) {
        if (isDevelopment && startTime) {
            var duration = Date.now() - startTime;
            debugLoggers.api.timing("\u26A1 PERFORMANCE: ".concat(message), startTime, __assign({ duration: duration, performanceOptimized: duration < 100 }, data));
        }
        else if (isDevelopment) {
            debugLoggers.api.debug("\u26A1 PERFORMANCE: ".concat(message), data);
        }
    },
    // Context correlation debugging
    correlation: function (message, correlationId, data) {
        if (isDevelopment) {
            debugLoggers.api.debug("\uD83D\uDD17 CORRELATION: ".concat(message), __assign({ correlationId: correlationId, timestamp: new Date().toISOString() }, data));
        }
    }
};
exports.enhancedDebugLog = exports.debugLog;
/**
 * Enhanced Production-safe Error Logging
 * Uses universal logger with automatic sanitization and enhanced error tracking
 */
var errorLogger = (0, factory_1.createAppLogger)('error-utility', {
    component: 'error-handling',
    feature: 'production-safe-errors',
    module: 'debug-utility'
});
var errorLog = function (message, error, context) {
    var sanitizedError = sanitizeErrorForProduction(error);
    var sanitizedContext = sanitizeContextForProduction(context);
    if (isDevelopment) {
        // Development: Full error details with universal logger
        errorLogger.error("\u274C ".concat(message), error instanceof Error ? error : new Error(String(error)), {
            originalContext: context,
            sanitizedError: sanitizedError,
            sanitizedContext: sanitizedContext,
            developmentMode: true,
            timestamp: new Date().toISOString()
        });
    }
    else {
        // Production: Sanitized error logging with enhanced metadata
        errorLogger.error("\u274C ".concat(message), new Error(String(sanitizedError)), {
            sanitizedContext: sanitizedContext,
            productionMode: true,
            errorClassification: 'application_error',
            sensitivityLevel: 'sanitized',
            timestamp: new Date().toISOString(),
            complianceFramework: 'HIPAA',
            retentionPeriod: '7_years'
        });
        // Enhanced security logging for production errors
        errorLogger.security('production_error_logged', 'medium', {
            action: 'error_handling',
            errorType: typeof error,
            messageSanitized: true,
            contextSanitized: true,
            threat: 'potential_data_exposure_prevented'
        });
    }
};
exports.errorLog = errorLog;
exports.enhancedErrorLog = exports.errorLog;
/**
 * Enhanced Business Logic Error Logging
 * Specialized error logging for business operations with analytics
 */
var businessErrorLog = function (operation, error, context) {
    var sanitizedError = sanitizeErrorForProduction(error);
    var sanitizedContext = sanitizeContextForProduction(context);
    errorLogger.error("\uD83D\uDCBC Business Error: ".concat(operation), error instanceof Error ? error : new Error(String(error)), {
        operation: operation,
        sanitizedContext: sanitizedContext,
        businessProcess: true,
        errorImpact: 'business_operation',
        requiresReview: true
    });
    // Business intelligence logging
    errorLogger.info('Business error analytics', {
        operation: operation,
        errorOccurred: true,
        impactLevel: 'business_operation',
        userContext: sanitizedContext,
        requiresBusinessReview: true,
        dataClassification: 'business_critical'
    });
};
exports.businessErrorLog = businessErrorLog;
/**
 * Performance Error Logging
 * Specialized logging for performance-related issues
 */
var performanceErrorLog = function (operation, duration, threshold, error, context) {
    var performanceIssue = duration > threshold;
    var sanitizedContext = sanitizeContextForProduction(context);
    if (error) {
        errorLogger.error("\u26A1 Performance Error: ".concat(operation), error instanceof Error ? error : new Error(String(error)), {
            operation: operation,
            duration: duration,
            threshold: threshold,
            performanceIssue: performanceIssue,
            sanitizedContext: sanitizedContext,
            performanceOptimizationNeeded: true
        });
    }
    // Performance monitoring
    errorLogger.timing("Performance issue detected: ".concat(operation), Date.now() - duration, {
        operation: operation,
        duration: duration,
        threshold: threshold,
        performanceIssue: performanceIssue,
        exceededBy: duration - threshold,
        requiresOptimization: performanceIssue
    });
};
exports.performanceErrorLog = performanceErrorLog;
/**
 * Sanitize error information for production logging
 * Removes sensitive data while preserving diagnostic value
 */
function sanitizeErrorForProduction(error) {
    if (!error)
        return 'No error details';
    if (error instanceof Error) {
        return {
            name: error.name,
            message: sanitizeErrorMessage(error.message),
            // Don't include stack traces in production logs
        };
    }
    if (typeof error === 'string') {
        return sanitizeErrorMessage(error);
    }
    return 'Unknown error type';
}
/**
 * Sanitize error messages to remove sensitive information
 */
function sanitizeErrorMessage(message) {
    // Remove common sensitive patterns
    return message
        .replace(/password[=:\s]+[^\s]+/gi, 'password=***')
        .replace(/token[=:\s]+[^\s]+/gi, 'token=***')
        .replace(/key[=:\s]+[^\s]+/gi, 'key=***')
        .replace(/secret[=:\s]+[^\s]+/gi, 'secret=***')
        .replace(/Bearer\s+[^\s]+/gi, 'Bearer ***')
        .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '[UUID]')
        .replace(/\b[\w.-]+@[\w.-]+\.\w+\b/gi, '[EMAIL]')
        .replace(/\d{3,}/g, '[NUMBER]'); // Hide potentially sensitive numeric data
}
/**
 * Sanitize context information for production logging
 */
function sanitizeContextForProduction(context) {
    if (!context)
        return undefined;
    if (typeof context === 'string') {
        return sanitizeErrorMessage(context);
    }
    if (typeof context === 'object' && context !== null) {
        var sanitized = {};
        var _loop_1 = function (key, value) {
            // Skip potentially sensitive keys
            var sensitiveKeys = ['password', 'token', 'secret', 'key', 'auth', 'session'];
            if (sensitiveKeys.some(function (sk) { return key.toLowerCase().includes(sk); })) {
                sanitized[key] = '***';
                return "continue";
            }
            // Sanitize string values
            if (typeof value === 'string') {
                sanitized[key] = sanitizeErrorMessage(value);
            }
            else if (typeof value === 'number' || typeof value === 'boolean') {
                sanitized[key] = value;
            }
            else {
                sanitized[key] = '[OBJECT]';
            }
        };
        for (var _i = 0, _a = Object.entries(context); _i < _a.length; _i++) {
            var _b = _a[_i], key = _b[0], value = _b[1];
            _loop_1(key, value);
        }
        return sanitized;
    }
    return '[UNKNOWN_TYPE]';
}
/**
 * Enhanced Development Utility Functions
 */
/**
 * Create a scoped debug logger for specific components
 */
var createDebugLogger = function (component, feature) {
    return (0, factory_1.createAppLogger)("debug-".concat(component), {
        component: component,
        feature: feature || "".concat(component, "-debug"),
        module: 'debug-utility'
    });
};
exports.createDebugLogger = createDebugLogger;
/**
 * Conditional performance timing with debug output
 */
var debugTiming = function (label, startTime, threshold) {
    if (threshold === void 0) { threshold = 100; }
    if (isDevelopment) {
        var duration = Date.now() - startTime;
        var isSlowOperation = duration > threshold;
        debugLoggers.api.timing("\u23F1\uFE0F ".concat(label), startTime, {
            duration: duration,
            threshold: threshold,
            isSlowOperation: isSlowOperation,
            performanceOptimized: !isSlowOperation
        });
        if (isSlowOperation) {
            debugLoggers.api.warn("Slow operation detected: ".concat(label), {
                duration: duration,
                threshold: threshold,
                exceededBy: duration - threshold
            });
        }
    }
};
exports.debugTiming = debugTiming;
/**
 * Debug assertion with enhanced logging
 */
var debugAssert = function (condition, message, context) {
    if (isDevelopment && !condition) {
        var assertionError = new Error("Assertion failed: ".concat(message));
        errorLogger.error('Debug assertion failed', assertionError, {
            assertion: message,
            context: context,
            developmentAssertion: true,
            requiresInvestigation: true
        });
        // In development, also throw to halt execution
        throw assertionError;
    }
};
exports.debugAssert = debugAssert;
// Add deprecation notice in development
if (isDevelopment) {
    console.warn('💡 MIGRATION NOTICE: debug.ts has been enhanced with universal logger. ' +
        'Consider using the new enhanced functions for better observability.');
}
