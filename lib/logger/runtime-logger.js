"use strict";
/**
 * Runtime-Adaptive Logger
 * Automatically chooses the appropriate logger based on runtime environment
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
exports.RuntimeAdaptiveLogger = void 0;
exports.createUniversalLogger = createUniversalLogger;
exports.createTrackedLogger = createTrackedLogger;
exports.getLoggerDiagnostics = getLoggerDiagnostics;
exports.clearLoggerCache = clearLoggerCache;
exports.createLoggerWithAdapter = createLoggerWithAdapter;
var runtime_detector_1 = require("./runtime-detector");
var edge_adapter_1 = require("./adapters/edge-adapter");
var winston_adapter_1 = require("./adapters/winston-adapter");
/**
 * Runtime-specific logger cache to avoid repeated adapter creation
 */
var AdapterManager = /** @class */ (function () {
    function AdapterManager() {
        this.nodeAdapter = null;
        this.edgeAdapter = null;
        this.adapterCache = new Map();
    }
    /**
     * Get the appropriate adapter for current runtime
     */
    AdapterManager.prototype.getAdapter = function (config) {
        var runtime = (0, runtime_detector_1.detectRuntime)();
        var cacheKey = "".concat(runtime, "-").concat(JSON.stringify(config || {}));
        // Return cached adapter if available
        if (this.adapterCache.has(cacheKey)) {
            return this.adapterCache.get(cacheKey);
        }
        var adapter;
        if (runtime === 'nodejs') {
            adapter = this.getNodeAdapter(config);
        }
        else {
            adapter = this.getEdgeAdapter(config);
        }
        // Cache the adapter for reuse
        this.adapterCache.set(cacheKey, adapter);
        return adapter;
    };
    /**
     * Get Node.js winston adapter with fallback
     */
    AdapterManager.prototype.getNodeAdapter = function (config) {
        if (!this.nodeAdapter || config) {
            try {
                var adapter = new winston_adapter_1.WinstonLoggerAdapter(config);
                if (adapter.isAvailable()) {
                    if (!config)
                        this.nodeAdapter = adapter; // Only cache default config
                    return adapter;
                }
                else {
                    throw new Error('Winston adapter not available');
                }
            }
            catch (error) {
                // Fallback to edge adapter if winston fails
                console.warn('Winston adapter failed, falling back to edge adapter:', error);
                return this.getEdgeAdapter(config);
            }
        }
        return this.nodeAdapter;
    };
    /**
     * Get Edge runtime adapter
     */
    AdapterManager.prototype.getEdgeAdapter = function (config) {
        if (!this.edgeAdapter || config) {
            var adapter = new edge_adapter_1.EdgeLoggerAdapter(config);
            if (!config)
                this.edgeAdapter = adapter; // Only cache default config
            return adapter;
        }
        return this.edgeAdapter;
    };
    /**
     * Clear adapter cache (useful for testing)
     */
    AdapterManager.prototype.clearCache = function () {
        this.adapterCache.clear();
        this.nodeAdapter = null;
        this.edgeAdapter = null;
    };
    /**
     * Get runtime diagnostics
     */
    AdapterManager.prototype.getDiagnostics = function () {
        return {
            currentRuntime: (0, runtime_detector_1.detectRuntime)(),
            runtimeInfo: (0, runtime_detector_1.getRuntimeInfo)(),
            nodeAdapterAvailable: (0, runtime_detector_1.isNodeRuntime)() && this.getNodeAdapter().isAvailable(),
            edgeAdapterAvailable: this.getEdgeAdapter().isAvailable(),
            cacheSize: this.adapterCache.size
        };
    };
    return AdapterManager;
}());
// Global adapter manager instance
var adapterManager = new AdapterManager();
/**
 * Runtime-Adaptive Logger Implementation
 * Wraps the appropriate adapter based on runtime environment
 */
var RuntimeAdaptiveLogger = /** @class */ (function () {
    function RuntimeAdaptiveLogger(module, context, config) {
        if (context === void 0) { context = {}; }
        this.module = module;
        this.context = context;
        this.adapter = adapterManager.getAdapter(config);
        this.underlyingLogger = this.adapter.createLogger(module, context);
    }
    // Forward all methods to the underlying logger
    RuntimeAdaptiveLogger.prototype.info = function (message, data) {
        this.underlyingLogger.info(message, data);
    };
    RuntimeAdaptiveLogger.prototype.warn = function (message, data) {
        this.underlyingLogger.warn(message, data);
    };
    RuntimeAdaptiveLogger.prototype.error = function (message, error, data) {
        this.underlyingLogger.error(message, error, data);
    };
    RuntimeAdaptiveLogger.prototype.debug = function (message, data) {
        this.underlyingLogger.debug(message, data);
    };
    RuntimeAdaptiveLogger.prototype.child = function (context, module) {
        // Create new adaptive logger with combined context
        return new RuntimeAdaptiveLogger(module || this.module, __assign(__assign({}, this.context), context));
    };
    RuntimeAdaptiveLogger.prototype.withRequest = function (request) {
        return this.underlyingLogger.withRequest(request);
    };
    RuntimeAdaptiveLogger.prototype.withUser = function (userId, organizationId) {
        return this.underlyingLogger.withUser(userId, organizationId);
    };
    RuntimeAdaptiveLogger.prototype.timing = function (message, startTime, data) {
        this.underlyingLogger.timing(message, startTime, data);
    };
    RuntimeAdaptiveLogger.prototype.http = function (message, statusCode, duration, data) {
        this.underlyingLogger.http(message, statusCode, duration, data);
    };
    RuntimeAdaptiveLogger.prototype.db = function (operation, table, duration, data) {
        this.underlyingLogger.db(operation, table, duration, data);
    };
    RuntimeAdaptiveLogger.prototype.auth = function (action, success, data) {
        this.underlyingLogger.auth(action, success, data);
    };
    RuntimeAdaptiveLogger.prototype.security = function (event, severity, data) {
        this.underlyingLogger.security(event, severity, data);
    };
    return RuntimeAdaptiveLogger;
}());
exports.RuntimeAdaptiveLogger = RuntimeAdaptiveLogger;
/**
 * Create a runtime-adaptive logger for the specified module
 */
function createUniversalLogger(module, context, config) {
    return new RuntimeAdaptiveLogger(module, context, config);
}
/**
 * Create logger with automatic runtime behavior tracking
 */
function createTrackedLogger(module, context, config) {
    var logger = createUniversalLogger(module, context, config);
    // Log which runtime adapter is being used (only in development)
    if (process.env.NODE_ENV === 'development') {
        var diagnostics = adapterManager.getDiagnostics();
        logger.debug('Logger adapter selected', {
            runtime: diagnostics.currentRuntime,
            nodeAvailable: diagnostics.nodeAdapterAvailable,
            edgeAvailable: diagnostics.edgeAdapterAvailable,
            module: module
        });
    }
    return logger;
}
/**
 * Get runtime diagnostics for monitoring and debugging
 */
function getLoggerDiagnostics() {
    return adapterManager.getDiagnostics();
}
/**
 * Clear adapter cache (useful for testing)
 */
function clearLoggerCache() {
    adapterManager.clearCache();
}
/**
 * Force adapter selection for testing
 */
function createLoggerWithAdapter(adapter, module, context, config) {
    var loggerAdapter;
    if (adapter === 'winston') {
        loggerAdapter = new winston_adapter_1.WinstonLoggerAdapter(config);
        if (!loggerAdapter.isAvailable()) {
            throw new Error('Winston adapter is not available in this environment');
        }
    }
    else {
        loggerAdapter = new edge_adapter_1.EdgeLoggerAdapter(config);
    }
    return loggerAdapter.createLogger(module, context);
}
exports.default = createUniversalLogger;
