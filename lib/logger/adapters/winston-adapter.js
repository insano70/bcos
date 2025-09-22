"use strict";
/**
 * Winston Logger Adapter
 * Wraps existing Winston-based StructuredLogger as UniversalLogger
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WinstonLoggerAdapter = void 0;
var winston_logger_1 = require("../winston-logger");
/**
 * Winston-based implementation of UniversalLogger
 */
var WinstonUniversalLogger = /** @class */ (function () {
    function WinstonUniversalLogger(winstonLogger) {
        this.winstonLogger = winstonLogger;
    }
    // Basic logging methods - delegate to winston logger
    WinstonUniversalLogger.prototype.info = function (message, data) {
        this.winstonLogger.info(message, data);
    };
    WinstonUniversalLogger.prototype.warn = function (message, data) {
        this.winstonLogger.warn(message, data);
    };
    WinstonUniversalLogger.prototype.error = function (message, error, data) {
        this.winstonLogger.error(message, error, data);
    };
    WinstonUniversalLogger.prototype.debug = function (message, data) {
        this.winstonLogger.debug(message, data);
    };
    // Context management
    WinstonUniversalLogger.prototype.child = function (context, module) {
        var childLogger = this.winstonLogger.child(context, module);
        return new WinstonUniversalLogger(childLogger);
    };
    WinstonUniversalLogger.prototype.withRequest = function (request) {
        var requestLogger = this.winstonLogger.withRequest(request);
        return new WinstonUniversalLogger(requestLogger);
    };
    WinstonUniversalLogger.prototype.withUser = function (userId, organizationId) {
        var userLogger = this.winstonLogger.withUser(userId, organizationId);
        return new WinstonUniversalLogger(userLogger);
    };
    // Specialized logging methods - delegate to existing methods
    WinstonUniversalLogger.prototype.timing = function (message, startTime, data) {
        this.winstonLogger.timing(message, startTime, data);
    };
    WinstonUniversalLogger.prototype.http = function (message, statusCode, duration, data) {
        this.winstonLogger.http(message, statusCode, duration, data);
    };
    WinstonUniversalLogger.prototype.db = function (operation, table, duration, data) {
        this.winstonLogger.db(operation, table, duration, data);
    };
    WinstonUniversalLogger.prototype.auth = function (action, success, data) {
        this.winstonLogger.auth(action, success, data);
    };
    WinstonUniversalLogger.prototype.security = function (event, severity, data) {
        this.winstonLogger.security(event, severity, data);
    };
    return WinstonUniversalLogger;
}());
/**
 * Winston Logger Adapter
 * Creates UniversalLogger instances backed by Winston
 */
var WinstonLoggerAdapter = /** @class */ (function () {
    function WinstonLoggerAdapter(config) {
        this.config = config;
    }
    WinstonLoggerAdapter.prototype.createLogger = function (module, context) {
        var winstonLogger = (0, winston_logger_1.createAppLogger)(module, context);
        return new WinstonUniversalLogger(winstonLogger);
    };
    WinstonLoggerAdapter.prototype.isAvailable = function () {
        try {
            // Check if winston and Node.js APIs are available
            return typeof process !== 'undefined' &&
                typeof process.env !== 'undefined' &&
                typeof require !== 'undefined';
        }
        catch (_a) {
            return false;
        }
    };
    return WinstonLoggerAdapter;
}());
exports.WinstonLoggerAdapter = WinstonLoggerAdapter;
