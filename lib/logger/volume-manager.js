"use strict";
/**
 * Log Volume Management System
 * Handles log aggregation, retention policies, cost optimization, and compliance
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
exports.LogVolumeManager = exports.logVolumeManager = void 0;
var factory_1 = require("./factory");
var production_optimizer_1 = require("./production-optimizer");
var LogVolumeManager = /** @class */ (function () {
    function LogVolumeManager() {
        this.metrics = {
            totalLogs: 0,
            logsPerSecond: 0,
            storageUsed: 0,
            estimatedCost: 0,
            retentionCompliance: true,
            lastAggregation: new Date()
        };
        this.aggregationData = new Map();
        this.retentionPolicies = [];
        this.volumeLogger = (0, factory_1.createAppLogger)('volume-manager', {
            component: 'performance',
            feature: 'log-volume-management',
            module: 'volume-manager'
        });
        this.costOptimization = {
            levelCosts: {
                debug: 0.5, // Cheapest, high volume
                info: 1.0, // Standard cost
                warn: 2.0, // More expensive due to investigation
                error: 5.0 // Most expensive due to alerting and investigation
            },
            storageTiers: {
                hot: 0.25, // $0.25/GB/month - immediate access
                warm: 0.125, // $0.125/GB/month - 1-hour access
                cold: 0.05, // $0.05/GB/month - 12-hour access  
                archive: 0.01 // $0.01/GB/month - 24+ hour access
            },
            ingestionCost: 5.00, // $5 per million logs
            searchCost: 0.50, // $0.50 per search query
            alertingCost: 0.10 // $0.10 per alert
        };
        this.initializeRetentionPolicies();
        this.startVolumeMonitoring();
        this.startAggregation();
    }
    /**
     * Initialize default retention policies for different components
     */
    LogVolumeManager.prototype.initializeRetentionPolicies = function () {
        this.retentionPolicies = [
            // HIPAA Compliance - 7 years
            {
                component: 'authentication',
                retentionPeriod: 2555, // 7 years
                compressionAfter: 30,
                archiveAfter: 365,
                deleteAfter: 2555,
                complianceFramework: 'HIPAA'
            },
            // Security Events - 7 years 
            {
                component: 'security',
                retentionPeriod: 2555,
                compressionAfter: 7,
                archiveAfter: 90,
                deleteAfter: 2555,
                complianceFramework: 'HIPAA'
            },
            // Business Logic - 7 years for audit
            {
                component: 'business-logic',
                retentionPeriod: 2555,
                compressionAfter: 90,
                archiveAfter: 730, // 2 years
                deleteAfter: 2555,
                complianceFramework: 'HIPAA'
            },
            // API Logs - 1 year
            {
                component: 'api',
                retentionPeriod: 365,
                compressionAfter: 7,
                archiveAfter: 30,
                deleteAfter: 365
            },
            // Performance Logs - 90 days
            {
                component: 'performance',
                retentionPeriod: 90,
                compressionAfter: 7,
                archiveAfter: 30,
                deleteAfter: 90
            },
            // Debug Logs - 30 days
            {
                component: 'debug',
                retentionPeriod: 30,
                compressionAfter: 1,
                archiveAfter: 7,
                deleteAfter: 30
            }
        ];
        this.volumeLogger.info('Retention policies initialized', {
            totalPolicies: this.retentionPolicies.length,
            complianceFrameworks: Array.from(new Set(this.retentionPolicies.map(function (p) { return p.complianceFramework; }).filter(Boolean))),
            maxRetention: Math.max.apply(Math, this.retentionPolicies.map(function (p) { return p.retentionPeriod; }))
        });
    };
    /**
     * Record a log entry for volume tracking
     */
    LogVolumeManager.prototype.recordLog = function (level, component, size) {
        if (size === void 0) { size = 1; }
        this.metrics.totalLogs++;
        // Update storage estimation (rough calculation)
        var avgLogSize = 0.5; // KB average
        this.metrics.storageUsed += avgLogSize / 1024; // Convert to MB
        // Update cost estimation
        var levelCost = this.costOptimization.levelCosts[level] || 1.0;
        var logCost = (levelCost * this.costOptimization.ingestionCost) / 1000000; // Per log
        this.metrics.estimatedCost += logCost;
        // Record for aggregation
        this.recordForAggregation(level, component);
    };
    /**
     * Record log for time-based aggregation
     */
    LogVolumeManager.prototype.recordForAggregation = function (level, component) {
        var now = new Date();
        var windowKey = this.getAggregationWindowKey('5m', now);
        var aggregation = this.aggregationData.get(windowKey);
        if (!aggregation) {
            aggregation = {
                timeWindow: '5m',
                metrics: {
                    count: 0,
                    levels: {},
                    components: {},
                    errors: 0,
                    warnings: 0
                },
                timestamp: now
            };
            this.aggregationData.set(windowKey, aggregation);
        }
        // Update metrics
        aggregation.metrics.count++;
        aggregation.metrics.levels[level] = (aggregation.metrics.levels[level] || 0) + 1;
        aggregation.metrics.components[component] = (aggregation.metrics.components[component] || 0) + 1;
        if (level === 'error')
            aggregation.metrics.errors++;
        if (level === 'warn')
            aggregation.metrics.warnings++;
    };
    /**
     * Get aggregation window key for time-based grouping
     */
    LogVolumeManager.prototype.getAggregationWindowKey = function (window, timestamp) {
        var minutes = timestamp.getMinutes();
        var hours = timestamp.getHours();
        var day = timestamp.getDate();
        var month = timestamp.getMonth();
        var year = timestamp.getFullYear();
        switch (window) {
            case '1m':
                return "".concat(year, "-").concat(month, "-").concat(day, "-").concat(hours, "-").concat(minutes);
            case '5m':
                return "".concat(year, "-").concat(month, "-").concat(day, "-").concat(hours, "-").concat(Math.floor(minutes / 5) * 5);
            case '15m':
                return "".concat(year, "-").concat(month, "-").concat(day, "-").concat(hours, "-").concat(Math.floor(minutes / 15) * 15);
            case '1h':
                return "".concat(year, "-").concat(month, "-").concat(day, "-").concat(hours);
            case '1d':
                return "".concat(year, "-").concat(month, "-").concat(day);
            default:
                return "".concat(year, "-").concat(month, "-").concat(day, "-").concat(hours, "-").concat(minutes);
        }
    };
    /**
     * Calculate storage tier recommendations
     */
    LogVolumeManager.prototype.getStorageTierRecommendations = function (component) {
        var policy = this.retentionPolicies.find(function (p) { return p.component === component; });
        if (!policy) {
            return { tier: 'hot', costSavings: 0, accessTime: 'immediate' };
        }
        var daysOld = 30; // Example: assume 30 days old
        var currentCost = this.costOptimization.storageTiers.hot;
        if (daysOld > policy.archiveAfter) {
            return {
                tier: 'archive',
                costSavings: ((currentCost - this.costOptimization.storageTiers.archive) / currentCost) * 100,
                accessTime: '24+ hours'
            };
        }
        else if (daysOld > policy.compressionAfter) {
            return {
                tier: 'cold',
                costSavings: ((currentCost - this.costOptimization.storageTiers.cold) / currentCost) * 100,
                accessTime: '12 hours'
            };
        }
        else if (daysOld > 7) {
            return {
                tier: 'warm',
                costSavings: ((currentCost - this.costOptimization.storageTiers.warm) / currentCost) * 100,
                accessTime: '1 hour'
            };
        }
        return { tier: 'hot', costSavings: 0, accessTime: 'immediate' };
    };
    /**
     * Estimate monthly costs by component
     */
    LogVolumeManager.prototype.getCostBreakdown = function () {
        var componentCosts = {};
        var levelCosts = {};
        // Calculate costs from aggregation data
        for (var _i = 0, _a = Array.from(this.aggregationData.values()); _i < _a.length; _i++) {
            var aggregation = _a[_i];
            for (var _b = 0, _c = Object.entries(aggregation.metrics.levels); _b < _c.length; _b++) {
                var _d = _c[_b], level = _d[0], count = _d[1];
                var levelCost = (this.costOptimization.levelCosts[level] || 1.0) *
                    (count * this.costOptimization.ingestionCost / 1000000);
                levelCosts[level] = (levelCosts[level] || 0) + levelCost;
            }
            for (var _e = 0, _f = Object.entries(aggregation.metrics.components); _e < _f.length; _e++) {
                var _g = _f[_e], component = _g[0], count = _g[1];
                var componentCost = count * this.costOptimization.ingestionCost / 1000000;
                componentCosts[component] = (componentCosts[component] || 0) + componentCost;
            }
        }
        var storageCost = this.metrics.storageUsed * this.costOptimization.storageTiers.hot;
        var ingestionCost = this.metrics.totalLogs * this.costOptimization.ingestionCost / 1000000;
        // Calculate potential savings from optimization
        var optimizationSavings = this.calculateOptimizationSavings();
        return {
            totalEstimated: ingestionCost + storageCost,
            byComponent: componentCosts,
            byLevel: levelCosts,
            storageCost: storageCost,
            ingestionCost: ingestionCost,
            optimizationSavings: optimizationSavings
        };
    };
    /**
     * Calculate potential cost savings from optimization
     */
    LogVolumeManager.prototype.calculateOptimizationSavings = function () {
        var stats = production_optimizer_1.productionOptimizer.getStats();
        // Estimate savings from sampling
        var debugSavings = (1 - (stats.samplingRates.debug || 0)) *
            ((this.costOptimization.levelCosts.debug || 1.0) * 0.5); // 50% of debug logs
        var infoSavings = (1 - (stats.samplingRates.info || 0)) *
            ((this.costOptimization.levelCosts.info || 1.0) * 0.3); // 30% of info logs
        // Estimate storage tier savings
        var tierSavings = this.metrics.storageUsed *
            (this.costOptimization.storageTiers.hot - this.costOptimization.storageTiers.warm) * 0.7;
        return debugSavings + infoSavings + tierSavings;
    };
    /**
     * Get compliance status for all retention policies
     */
    LogVolumeManager.prototype.getComplianceStatus = function () {
        var _this = this;
        var policies = this.retentionPolicies.map(function (policy) {
            var compliant = _this.checkPolicyCompliance(policy);
            var dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + 30); // Example: 30 days to next review
            return {
                component: policy.component,
                compliant: compliant,
                framework: policy.complianceFramework || undefined,
                nextAction: compliant ? 'maintain' : 'remediate',
                dueDate: dueDate
            };
        });
        var overall = policies.every(function (p) { return p.compliant; });
        var recommendations = this.generateComplianceRecommendations(policies);
        return { overall: overall, policies: policies, recommendations: recommendations };
    };
    /**
     * Check if a retention policy is compliant
     */
    LogVolumeManager.prototype.checkPolicyCompliance = function (policy) {
        // In a real implementation, this would check actual log retention
        // For now, assume compliance based on policy configuration
        return policy.retentionPeriod >= this.getMinimumRetention(policy.complianceFramework);
    };
    /**
     * Get minimum retention period for compliance framework
     */
    LogVolumeManager.prototype.getMinimumRetention = function (framework) {
        switch (framework) {
            case 'HIPAA': return 2555; // 7 years
            case 'SOX': return 2555; // 7 years
            case 'GDPR': return 2555; // 7 years (for medical data)
            default: return 365; // 1 year default
        }
    };
    /**
     * Generate compliance recommendations
     */
    LogVolumeManager.prototype.generateComplianceRecommendations = function (policies) {
        var recommendations = [];
        var nonCompliant = policies.filter(function (p) { return !p.compliant; });
        if (nonCompliant.length > 0) {
            recommendations.push("Remediate ".concat(nonCompliant.length, " non-compliant retention policies"));
        }
        var hipaaComponents = policies.filter(function (p) { return p.framework === 'HIPAA'; });
        if (hipaaComponents.length > 0) {
            recommendations.push("Ensure HIPAA audit trail for ".concat(hipaaComponents.length, " components"));
        }
        if (this.metrics.storageUsed > 1000) { // > 1GB
            recommendations.push('Consider implementing storage tiering for cost optimization');
        }
        return recommendations;
    };
    /**
     * Start volume monitoring
     */
    LogVolumeManager.prototype.startVolumeMonitoring = function () {
        var _this = this;
        setInterval(function () {
            _this.updateVolumeMetrics();
        }, 60000); // Update every minute
    };
    /**
     * Start log aggregation processing
     */
    LogVolumeManager.prototype.startAggregation = function () {
        var _this = this;
        setInterval(function () {
            _this.processAggregation();
        }, 300000); // Process every 5 minutes
    };
    /**
     * Update volume metrics
     */
    LogVolumeManager.prototype.updateVolumeMetrics = function () {
        var now = Date.now();
        var timeDiff = (now - this.metrics.lastAggregation.getTime()) / 1000; // seconds
        this.metrics.logsPerSecond = this.metrics.totalLogs / Math.max(timeDiff, 1);
        this.metrics.lastAggregation = new Date();
        // Log metrics periodically
        if (Math.random() < 0.1) { // 10% chance
            this.volumeLogger.info('Volume metrics updated', {
                totalLogs: this.metrics.totalLogs,
                logsPerSecond: this.metrics.logsPerSecond.toFixed(2),
                storageUsed: "".concat(this.metrics.storageUsed.toFixed(2), " MB"),
                estimatedMonthlyCost: "$".concat(this.metrics.estimatedCost.toFixed(2))
            });
        }
    };
    /**
     * Process and clean up aggregation data
     */
    LogVolumeManager.prototype.processAggregation = function () {
        var now = Date.now();
        var maxAge = 24 * 60 * 60 * 1000; // 24 hours
        // Clean up old aggregation data
        for (var _i = 0, _a = Array.from(this.aggregationData.entries()); _i < _a.length; _i++) {
            var _b = _a[_i], key = _b[0], aggregation = _b[1];
            if (now - aggregation.timestamp.getTime() > maxAge) {
                this.aggregationData.delete(key);
            }
        }
        this.volumeLogger.debug('Aggregation data processed', {
            activeWindows: this.aggregationData.size,
            totalLogs: this.metrics.totalLogs
        });
    };
    /**
     * Get current volume statistics
     */
    LogVolumeManager.prototype.getVolumeStats = function () {
        return __assign(__assign({}, this.metrics), { aggregationWindows: this.aggregationData.size, complianceStatus: this.getComplianceStatus().overall, costBreakdown: this.getCostBreakdown() });
    };
    /**
     * Export aggregated data for external analysis
     */
    LogVolumeManager.prototype.exportAggregatedData = function (timeRange) {
        var results = [];
        for (var _i = 0, _a = Array.from(this.aggregationData.values()); _i < _a.length; _i++) {
            var aggregation = _a[_i];
            if (aggregation.timestamp >= timeRange.start && aggregation.timestamp <= timeRange.end) {
                results.push(aggregation);
            }
        }
        return results.sort(function (a, b) { return a.timestamp.getTime() - b.timestamp.getTime(); });
    };
    return LogVolumeManager;
}());
exports.LogVolumeManager = LogVolumeManager;
// Global volume manager instance
exports.logVolumeManager = new LogVolumeManager();
