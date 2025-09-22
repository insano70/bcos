"use strict";
/**
 * CSRF Security Monitoring and Alerting
 * Tracks CSRF validation failures and triggers alerts for suspicious activity
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
exports.CSRFSecurityMonitor = void 0;
var factory_1 = require("@/lib/logger/factory");
var migration_flags_1 = require("@/lib/logger/migration-flags");
// Create CSRF security logger with enhanced features
var csrfLogger = (0, factory_1.createAppLogger)('csrf-monitoring', {
    component: 'security',
    feature: 'csrf-protection',
    module: 'csrf-monitor'
});
var migrationLogger = migration_flags_1.MigrationLogger.getInstance();
/**
 * CSRF Security Monitor
 * Tracks patterns and anomalies in CSRF validation failures
 */
var CSRFSecurityMonitor = /** @class */ (function () {
    function CSRFSecurityMonitor() {
    }
    /**
     * Record a CSRF validation failure
     */
    CSRFSecurityMonitor.recordFailure = function (request, reason, severity, userId) {
        if (severity === void 0) { severity = 'medium'; }
        var ip = CSRFSecurityMonitor.extractIP(request);
        var userAgent = request.headers.get('user-agent') || 'unknown';
        var pathname = request.nextUrl.pathname;
        var event = {
            timestamp: Date.now(),
            ip: ip,
            userAgent: userAgent.substring(0, 200), // Limit length
            pathname: pathname,
            reason: reason,
            severity: severity,
            userId: userId
        };
        // Store event by IP
        if (!CSRFSecurityMonitor.failures.has(ip)) {
            CSRFSecurityMonitor.failures.set(ip, []);
        }
        var ipEvents = CSRFSecurityMonitor.failures.get(ip);
        if (!ipEvents) {
            // This should never happen since we just set it above, but TypeScript safety
            return;
        }
        ipEvents.push(event);
        // Limit events per IP to prevent memory exhaustion
        if (ipEvents.length > CSRFSecurityMonitor.MAX_EVENTS_PER_IP) {
            ipEvents.shift(); // Remove oldest event
        }
        // Log the failure
        CSRFSecurityMonitor.logFailure(event);
        // Check for alert conditions
        CSRFSecurityMonitor.checkAlertConditions(ip, ipEvents);
        // Periodic cleanup
        CSRFSecurityMonitor.cleanupOldEvents();
    };
    /**
     * Extract IP address from request
     */
    CSRFSecurityMonitor.extractIP = function (request) {
        var forwardedFor = request.headers.get('x-forwarded-for');
        if (forwardedFor) {
            var firstIP = forwardedFor.split(',')[0];
            return firstIP ? firstIP.trim() : 'unknown';
        }
        return request.headers.get('x-real-ip') ||
            request.headers.get('cf-connecting-ip') ||
            'unknown';
    };
    /**
     * Log CSRF failure with appropriate severity
     */
    CSRFSecurityMonitor.logFailure = function (event) {
        var logData = {
            event_type: 'csrf_validation_failure',
            ip: event.ip,
            pathname: event.pathname,
            reason: event.reason,
            severity: event.severity,
            user_agent: event.userAgent.substring(0, 100),
            user_id: event.userId,
            timestamp: new Date(event.timestamp).toISOString()
        };
        // Log migration event for monitoring
        migrationLogger.logMigration('phase1', 'csrf-monitoring', 'enhanced_security_logging', {
            severity: event.severity,
            reason: event.reason
        });
        // Use enhanced security logging method
        csrfLogger.security('csrf_validation_failure', event.severity, {
            ip: event.ip,
            pathname: event.pathname,
            reason: event.reason,
            userAgent: event.userAgent.substring(0, 100),
            userId: event.userId,
            timestamp: new Date(event.timestamp).toISOString()
        });
    };
    /**
     * Check for alert conditions and trigger alerts if necessary
     */
    CSRFSecurityMonitor.checkAlertConditions = function (ip, events) {
        var now = Date.now();
        var oneHour = 60 * 60 * 1000;
        var fiveMinutes = 5 * 60 * 1000;
        var oneMinute = 60 * 1000;
        // Recent events within time windows
        var eventsLastHour = events.filter(function (e) { return now - e.timestamp <= oneHour; });
        var eventsLast5Minutes = events.filter(function (e) { return now - e.timestamp <= fiveMinutes; });
        var eventsLastMinute = events.filter(function (e) { return now - e.timestamp <= oneMinute; });
        // Alert Condition 1: High frequency of failures from single IP
        if (eventsLastMinute.length >= 10) {
            CSRFSecurityMonitor.sendAlert({
                type: 'csrf_attack_pattern',
                severity: 'critical',
                message: "".concat(eventsLastMinute.length, " CSRF failures from IP ").concat(ip, " in the last minute - possible attack"),
                events: eventsLastMinute,
                metadata: { ip: ip, window: '1minute', count: eventsLastMinute.length },
                timestamp: now
            });
        }
        else if (eventsLast5Minutes.length >= 20) {
            CSRFSecurityMonitor.sendAlert({
                type: 'csrf_failure_threshold',
                severity: 'high',
                message: "".concat(eventsLast5Minutes.length, " CSRF failures from IP ").concat(ip, " in 5 minutes - investigate"),
                events: eventsLast5Minutes,
                metadata: { ip: ip, window: '5minutes', count: eventsLast5Minutes.length },
                timestamp: now
            });
        }
        else if (eventsLastHour.length >= 50) {
            CSRFSecurityMonitor.sendAlert({
                type: 'csrf_failure_threshold',
                severity: 'medium',
                message: "".concat(eventsLastHour.length, " CSRF failures from IP ").concat(ip, " in the last hour"),
                events: eventsLastHour,
                metadata: { ip: ip, window: '1hour', count: eventsLastHour.length },
                timestamp: now
            });
        }
        // Alert Condition 2: Multiple endpoints from same IP
        var uniqueEndpoints = new Set(eventsLast5Minutes.map(function (e) { return e.pathname; }));
        if (uniqueEndpoints.size >= 5 && eventsLast5Minutes.length >= 10) {
            CSRFSecurityMonitor.sendAlert({
                type: 'csrf_attack_pattern',
                severity: 'high',
                message: "CSRF failures across ".concat(uniqueEndpoints.size, " endpoints from IP ").concat(ip, " - possible scanning"),
                events: eventsLast5Minutes,
                metadata: {
                    ip: ip,
                    endpoints: Array.from(uniqueEndpoints),
                    endpointCount: uniqueEndpoints.size,
                    totalFailures: eventsLast5Minutes.length
                },
                timestamp: now
            });
        }
        // Alert Condition 3: Anomalous patterns
        var anonymousFailures = eventsLast5Minutes.filter(function (e) { return e.reason.includes('anonymous'); });
        var authenticatedFailures = eventsLast5Minutes.filter(function (e) { return e.reason.includes('authenticated'); });
        if (anonymousFailures.length >= 5 && authenticatedFailures.length >= 5) {
            CSRFSecurityMonitor.sendAlert({
                type: 'csrf_anomaly',
                severity: 'medium',
                message: "Mixed anonymous and authenticated CSRF failures from IP ".concat(ip, " - unusual pattern"),
                events: eventsLast5Minutes,
                metadata: {
                    ip: ip,
                    anonymousCount: anonymousFailures.length,
                    authenticatedCount: authenticatedFailures.length
                },
                timestamp: now
            });
        }
    };
    /**
     * Send security alert
     */
    CSRFSecurityMonitor.sendAlert = function (alert) {
        return __awaiter(this, void 0, void 0, function () {
            var isDevelopment, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        isDevelopment = process.env.NODE_ENV === 'development';
                        // Log migration event for monitoring
                        migrationLogger.logMigration('phase1', 'csrf-monitoring', 'security_alert_triggered', {
                            alertType: alert.type,
                            severity: alert.severity,
                            eventCount: alert.events.length
                        });
                        // Use enhanced security logging
                        csrfLogger.security('csrf_security_alert', alert.severity, {
                            alertType: alert.type,
                            message: alert.message,
                            eventCount: alert.events.length,
                            metadata: alert.metadata,
                            timestamp: new Date(alert.timestamp).toISOString()
                        });
                        // In development, also log to console for immediate visibility
                        if (isDevelopment) {
                            console.error('🚨 CSRF Security Alert:', {
                                type: alert.type,
                                severity: alert.severity,
                                message: alert.message,
                                eventCount: alert.events.length,
                                metadata: alert.metadata
                            });
                        }
                        if (!!isDevelopment) return [3 /*break*/, 4];
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, CSRFSecurityMonitor.sendToMonitoringService(alert)];
                    case 2:
                        _a.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        error_1 = _a.sent();
                        csrfLogger.error('Failed to send CSRF alert to monitoring service', error_1 instanceof Error ? error_1 : new Error(String(error_1)), {
                            alertType: alert.type,
                            severity: alert.severity
                        });
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Send alert to external monitoring service
     */
    CSRFSecurityMonitor.sendToMonitoringService = function (alert) {
        return __awaiter(this, void 0, void 0, function () {
            var webhookUrl, payload, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        webhookUrl = process.env.SECURITY_ALERT_WEBHOOK_URL;
                        if (!webhookUrl) {
                            return [2 /*return*/]; // No monitoring webhook configured
                        }
                        payload = {
                            source: 'csrf-monitor',
                            alert_type: alert.type,
                            severity: alert.severity,
                            message: alert.message,
                            event_count: alert.events.length,
                            metadata: alert.metadata,
                            timestamp: alert.timestamp,
                            environment: process.env.NODE_ENV || 'unknown',
                            service: 'bcos-api'
                        };
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, fetch(webhookUrl, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'User-Agent': 'BCOS-CSRF-Monitor/1.0'
                                },
                                body: JSON.stringify(payload)
                            })];
                    case 2:
                        _a.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        error_2 = _a.sent();
                        // Don't throw - monitoring failures shouldn't break the app
                        console.error('Failed to send security alert to webhook:', error_2);
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Clean up old events to prevent memory leaks
     */
    CSRFSecurityMonitor.cleanupOldEvents = function () {
        var now = Date.now();
        // Only cleanup every hour
        if (now - CSRFSecurityMonitor.lastCleanup < CSRFSecurityMonitor.CLEANUP_INTERVAL) {
            return;
        }
        var maxAge = 24 * 60 * 60 * 1000; // 24 hours
        var cutoff = now - maxAge;
        for (var _i = 0, _a = Array.from(CSRFSecurityMonitor.failures); _i < _a.length; _i++) {
            var _b = _a[_i], ip = _b[0], events = _b[1];
            // Remove events older than 24 hours
            var recentEvents = events.filter(function (e) { return e.timestamp > cutoff; });
            if (recentEvents.length === 0) {
                CSRFSecurityMonitor.failures.delete(ip);
            }
            else {
                CSRFSecurityMonitor.failures.set(ip, recentEvents);
            }
        }
        CSRFSecurityMonitor.lastCleanup = now;
    };
    /**
     * Get current failure statistics
     */
    CSRFSecurityMonitor.getFailureStats = function () {
        var now = Date.now();
        var oneHour = 60 * 60 * 1000;
        var totalEvents = 0;
        var recentEvents = 0;
        var ipStats = [];
        for (var _i = 0, _a = Array.from(CSRFSecurityMonitor.failures); _i < _a.length; _i++) {
            var _b = _a[_i], ip = _b[0], events = _b[1];
            totalEvents += events.length;
            var recentEventCount = events.filter(function (e) { return now - e.timestamp <= oneHour; }).length;
            recentEvents += recentEventCount;
            var latestEvent = Math.max.apply(Math, events.map(function (e) { return e.timestamp; }));
            ipStats.push({ ip: ip, count: events.length, latestFailure: latestEvent });
        }
        // Sort by event count descending
        ipStats.sort(function (a, b) { return b.count - a.count; });
        return {
            totalIPs: CSRFSecurityMonitor.failures.size,
            totalEvents: totalEvents,
            recentEvents: recentEvents,
            topIPs: ipStats.slice(0, 10) // Top 10 IPs by failure count
        };
    };
    /**
     * Clear all failure data (for testing or reset)
     */
    CSRFSecurityMonitor.clearFailureData = function () {
        CSRFSecurityMonitor.failures.clear();
        CSRFSecurityMonitor.lastCleanup = 0;
    };
    CSRFSecurityMonitor.failures = new Map();
    CSRFSecurityMonitor.MAX_EVENTS_PER_IP = 100;
    CSRFSecurityMonitor.CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour
    CSRFSecurityMonitor.lastCleanup = 0;
    return CSRFSecurityMonitor;
}());
exports.CSRFSecurityMonitor = CSRFSecurityMonitor;
