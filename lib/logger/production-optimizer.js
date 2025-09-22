"use strict";
/**
 * Production Log Optimizer
 * Intelligent log level management, sampling, and performance optimization for production environments
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
exports.ProductionOptimizer = exports.productionOptimizer = void 0;
var factory_1 = require("./factory");
var ProductionOptimizer = /** @class */ (function () {
    function ProductionOptimizer(config) {
        this.logCounts = new Map();
        this.lastFlush = Date.now();
        this.logBuffer = [];
        this.optimizerLogger = (0, factory_1.createAppLogger)('production-optimizer', {
            component: 'performance',
            feature: 'log-optimization',
            module: 'production-optimizer'
        });
        this.config = __assign({ environment: process.env.NODE_ENV || 'development', logLevel: process.env.LOG_LEVEL || 'info', sampling: {
                debug: process.env.NODE_ENV === 'production' ? 0.01 : 1.0, // 1% in prod
                info: process.env.NODE_ENV === 'production' ? 0.1 : 1.0, // 10% in prod
                warn: process.env.NODE_ENV === 'production' ? 0.5 : 1.0, // 50% in prod
                error: 1.0, // Always log errors
                security: 1.0, // Always log security events
                performance: process.env.NODE_ENV === 'production' ? 0.05 : 1.0, // 5% in prod
                business: process.env.NODE_ENV === 'production' ? 0.2 : 1.0, // 20% in prod
                authentication: 1.0, // Always log auth events
                adaptive: {
                    enabled: true,
                    maxLogsPerSecond: 1000,
                    emergencyReduction: 0.1 // Reduce to 10% when overwhelmed
                },
                highFrequency: {
                    enabled: true,
                    operations: {
                        'database_query': 0.01, // 1% of DB queries
                        'cache_hit': 0.001, // 0.1% of cache hits
                        'api_request': 0.05, // 5% of API requests
                        'validation_check': 0.01, // 1% of validations
                        'permission_check': 0.02 // 2% of permission checks
                    }
                }
            }, performance: {
                asyncLogging: true,
                bufferSize: 1000,
                flushInterval: 5000, // 5 seconds
                maxMemoryUsage: 100 // 100 MB
            }, volume: {
                maxLogsPerSecond: 1000,
                rateLimitingEnabled: true,
                compressionEnabled: true
            }, compliance: {
                hipaaMode: true,
                auditTrailRequired: true,
                retentionPeriod: 2555 // 7 years for HIPAA
            } }, config);
        // Start flush timer if async logging is enabled
        if (this.config.performance.asyncLogging) {
            this.startFlushTimer();
        }
    }
    /**
     * Determine if a log should be sampled based on level and context
     */
    ProductionOptimizer.prototype.shouldSample = function (level, context) {
        // Always sample if not in production
        if (this.config.environment !== 'production') {
            return true;
        }
        // Check log level hierarchy
        if (!this.meetsLogLevel(level)) {
            return false;
        }
        // Always sample critical events
        if (level === 'error' || (context === null || context === void 0 ? void 0 : context.component) === 'security') {
            return true;
        }
        // Check adaptive sampling if enabled
        if (this.config.sampling.adaptive.enabled && this.isLogVolumeHigh()) {
            return this.applyAdaptiveSampling(level, context);
        }
        // Apply feature-specific sampling
        if (context === null || context === void 0 ? void 0 : context.component) {
            var featureRate = this.getFeatureSamplingRate(context.component);
            if (featureRate < 1.0 && Math.random() > featureRate) {
                return false;
            }
        }
        // Apply operation-specific sampling for high-frequency operations
        if ((context === null || context === void 0 ? void 0 : context.operation) && this.config.sampling.highFrequency.enabled) {
            var operationRate = this.config.sampling.highFrequency.operations[context.operation];
            if (operationRate && Math.random() > operationRate) {
                return false;
            }
        }
        // Apply level-based sampling
        var levelRate = this.getLevelSamplingRate(level);
        return Math.random() <= levelRate;
    };
    /**
     * Check if log level meets minimum threshold
     */
    ProductionOptimizer.prototype.meetsLogLevel = function (level) {
        var levelPriority = { debug: 0, info: 1, warn: 2, error: 3 };
        var configPriority = levelPriority[this.config.logLevel] || 1;
        var logPriority = levelPriority[level] || 1;
        return logPriority >= configPriority;
    };
    /**
     * Get sampling rate for log level
     */
    ProductionOptimizer.prototype.getLevelSamplingRate = function (level) {
        switch (level) {
            case 'debug': return this.config.sampling.debug;
            case 'info': return this.config.sampling.info;
            case 'warn': return this.config.sampling.warn;
            case 'error': return this.config.sampling.error;
            default: return 1.0;
        }
    };
    /**
     * Get sampling rate for feature/component
     */
    ProductionOptimizer.prototype.getFeatureSamplingRate = function (component) {
        switch (component) {
            case 'security': return this.config.sampling.security;
            case 'performance': return this.config.sampling.performance;
            case 'business-logic': return this.config.sampling.business;
            case 'authentication': return this.config.sampling.authentication;
            default: return 1.0;
        }
    };
    /**
     * Check if log volume is high and adaptive sampling should kick in
     */
    ProductionOptimizer.prototype.isLogVolumeHigh = function () {
        var now = Date.now();
        var windowStart = now - 1000; // 1 second window
        // Clean old entries
        for (var _i = 0, _a = Array.from(this.logCounts.entries()); _i < _a.length; _i++) {
            var _b = _a[_i], key = _b[0], data = _b[1];
            if (data.timestamp < windowStart) {
                this.logCounts.delete(key);
            }
        }
        // Count logs in current window
        var totalLogs = Array.from(this.logCounts.values())
            .reduce(function (sum, data) { return sum + data.count; }, 0);
        return totalLogs > this.config.sampling.adaptive.maxLogsPerSecond;
    };
    /**
     * Apply adaptive sampling during high-volume periods
     */
    ProductionOptimizer.prototype.applyAdaptiveSampling = function (level, context) {
        var baseRate = this.getLevelSamplingRate(level);
        var adaptiveRate = baseRate * this.config.sampling.adaptive.emergencyReduction;
        // Log that adaptive sampling is active
        if (Math.random() < 0.001) { // Sample 0.1% of these messages
            this.optimizerLogger.warn('Adaptive sampling active due to high log volume', {
                currentRate: adaptiveRate,
                baseRate: baseRate,
                level: level,
                component: context === null || context === void 0 ? void 0 : context.component
            });
        }
        return Math.random() <= adaptiveRate;
    };
    /**
     * Record log for volume tracking
     */
    ProductionOptimizer.prototype.recordLog = function (level, component) {
        var key = "".concat(level, ":").concat(component || 'default');
        var now = Date.now();
        var existing = this.logCounts.get(key);
        if (existing && now - existing.timestamp < 1000) {
            existing.count++;
        }
        else {
            this.logCounts.set(key, { count: 1, timestamp: now });
        }
    };
    /**
     * Optimize log data for performance and compliance
     */
    ProductionOptimizer.prototype.optimizeLogData = function (level, message, meta) {
        var optimizedMeta = __assign({}, meta);
        // Add optimization metadata
        optimizedMeta._optimization = {
            sampled: true,
            timestamp: new Date().toISOString(),
            environment: this.config.environment,
            optimizerVersion: '1.0.0'
        };
        // Add compliance metadata if required
        if (this.config.compliance.hipaaMode) {
            optimizedMeta._compliance = {
                framework: 'HIPAA',
                retentionRequired: this.config.compliance.auditTrailRequired,
                retentionPeriod: "".concat(this.config.compliance.retentionPeriod, "_days"),
                dataClassification: this.classifyData(meta)
            };
        }
        // Compress large metadata if enabled
        if (this.config.volume.compressionEnabled) {
            return this.compressLogData(message, optimizedMeta);
        }
        return { message: message, meta: optimizedMeta };
    };
    /**
     * Classify data for compliance purposes
     */
    ProductionOptimizer.prototype.classifyData = function (meta) {
        // Check for sensitive data patterns
        var sensitiveFields = ['userId', 'email', 'password', 'ssn', 'phone'];
        var hasSensitiveData = Object.keys(meta).some(function (key) {
            return sensitiveFields.some(function (field) { return key.toLowerCase().includes(field); });
        });
        if (hasSensitiveData)
            return 'SENSITIVE';
        if (meta.component === 'security' || meta.component === 'authentication')
            return 'SECURITY';
        if (meta.component === 'business-logic')
            return 'BUSINESS';
        return 'OPERATIONAL';
    };
    /**
     * Compress log data for storage efficiency
     */
    ProductionOptimizer.prototype.compressLogData = function (message, meta) {
        // Truncate very long messages
        var truncatedMessage = message.length > 500
            ? message.substring(0, 497) + '...'
            : message;
        // Compress large metadata objects
        var compressedMeta = this.compressMetadata(meta);
        return { message: truncatedMessage, meta: compressedMeta };
    };
    /**
     * Compress metadata object
     */
    ProductionOptimizer.prototype.compressMetadata = function (meta) {
        var compressed = {};
        for (var _i = 0, _a = Object.entries(meta); _i < _a.length; _i++) {
            var _b = _a[_i], key = _b[0], value = _b[1];
            if (typeof value === 'string' && value.length > 200) {
                compressed[key] = value.substring(0, 197) + '...';
            }
            else if (Array.isArray(value) && value.length > 10) {
                compressed[key] = __spreadArray(__spreadArray([], value.slice(0, 10), true), ["... +".concat(value.length - 10, " more")], false);
            }
            else {
                compressed[key] = value;
            }
        }
        return compressed;
    };
    /**
     * Start automatic buffer flushing for async logging
     */
    ProductionOptimizer.prototype.startFlushTimer = function () {
        var _this = this;
        setInterval(function () {
            _this.flushBuffer();
        }, this.config.performance.flushInterval);
    };
    /**
     * Flush log buffer (placeholder for actual implementation)
     */
    ProductionOptimizer.prototype.flushBuffer = function () {
        if (this.logBuffer.length === 0)
            return;
        var bufferSize = this.logBuffer.length;
        this.logBuffer = [];
        // In a real implementation, this would write to the actual log transport
        if (bufferSize > 0) {
            this.optimizerLogger.debug('Flushed log buffer', {
                bufferSize: bufferSize,
                memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024, // MB
                interval: this.config.performance.flushInterval
            });
        }
    };
    /**
     * Get current optimization statistics
     */
    ProductionOptimizer.prototype.getStats = function () {
        return {
            environment: this.config.environment,
            logLevel: this.config.logLevel,
            samplingRates: {
                debug: this.config.sampling.debug,
                info: this.config.sampling.info,
                warn: this.config.sampling.warn,
                error: this.config.sampling.error
            },
            currentVolume: Array.from(this.logCounts.values())
                .reduce(function (sum, data) { return sum + data.count; }, 0),
            bufferSize: this.logBuffer.length,
            adaptiveSamplingActive: this.isLogVolumeHigh()
        };
    };
    /**
     * Update configuration at runtime
     */
    ProductionOptimizer.prototype.updateConfig = function (updates) {
        this.config = __assign(__assign({}, this.config), updates);
        this.optimizerLogger.info('Production optimizer configuration updated', {
            updates: Object.keys(updates),
            newConfig: {
                logLevel: this.config.logLevel,
                environment: this.config.environment,
                asyncLogging: this.config.performance.asyncLogging
            }
        });
    };
    return ProductionOptimizer;
}());
exports.ProductionOptimizer = ProductionOptimizer;
// Global production optimizer instance
exports.productionOptimizer = new ProductionOptimizer();
