/**
 * Log Volume Management System
 * Handles log aggregation, retention policies, cost optimization, and compliance
 */

import { createAppLogger } from './factory';
import { productionOptimizer } from './production-optimizer';

interface VolumeMetrics {
  totalLogs: number;
  logsPerSecond: number;
  storageUsed: number; // MB
  estimatedCost: number; // USD per month
  retentionCompliance: boolean;
  lastAggregation: Date;
}

interface RetentionPolicy {
  component: string;
  retentionPeriod: number; // days
  compressionAfter: number; // days
  archiveAfter: number; // days
  deleteAfter: number; // days
  complianceFramework?: 'HIPAA' | 'SOX' | 'GDPR';
}

interface LogAggregation {
  timeWindow: '1m' | '5m' | '15m' | '1h' | '1d';
  metrics: {
    count: number;
    levels: Record<string, number>;
    components: Record<string, number>;
    errors: number;
    warnings: number;
  };
  timestamp: Date;
}

interface CostOptimization {
  // Log level costs (relative weights)
  levelCosts: Record<string, number>;
  
  // Storage tier costs (USD per GB per month)
  storageTiers: {
    hot: number;      // Immediate access
    warm: number;     // 1-hour access
    cold: number;     // 12-hour access
    archive: number;  // 24+ hour access
  };
  
  // Processing costs
  ingestionCost: number;   // USD per million logs
  searchCost: number;      // USD per search query
  alertingCost: number;    // USD per alert
}

class LogVolumeManager {
  private metrics: VolumeMetrics = {
    totalLogs: 0,
    logsPerSecond: 0,
    storageUsed: 0,
    estimatedCost: 0,
    retentionCompliance: true,
    lastAggregation: new Date()
  };

  private aggregationData: Map<string, LogAggregation> = new Map();
  private retentionPolicies: RetentionPolicy[] = [];
  
  private readonly volumeLogger = this.createSafeLogger();

  private readonly costOptimization: CostOptimization = {
    levelCosts: {
      debug: 0.5,  // Cheapest, high volume
      info: 1.0,   // Standard cost
      warn: 2.0,   // More expensive due to investigation
      error: 5.0   // Most expensive due to alerting and investigation
    },
    
    storageTiers: {
      hot: 0.25,      // $0.25/GB/month - immediate access
      warm: 0.125,    // $0.125/GB/month - 1-hour access
      cold: 0.05,     // $0.05/GB/month - 12-hour access  
      archive: 0.01   // $0.01/GB/month - 24+ hour access
    },
    
    ingestionCost: 5.00,    // $5 per million logs
    searchCost: 0.50,       // $0.50 per search query
    alertingCost: 0.10      // $0.10 per alert
  };

  /**
   * Create safe logger that doesn't cause initialization issues
   */
  private createSafeLogger() {
    try {
      return createAppLogger('volume-manager', {
        component: 'performance',
        feature: 'log-volume-management',
        module: 'volume-manager'
      });
    } catch (error) {
      // Fallback to simple console logger if universal logger fails
      return {
        info: (message: string, data?: Record<string, unknown>) => console.log(`[VOLUME] ${message}`, data),
        warn: (message: string, data?: Record<string, unknown>) => console.warn(`[VOLUME] ${message}`, data),
        error: (message: string, error?: Error, data?: Record<string, unknown>) => console.error(`[VOLUME] ${message}`, error, data),
        debug: (message: string, data?: Record<string, unknown>) => console.debug(`[VOLUME] ${message}`, data)
      };
    }
  }

  constructor() {
    this.initializeRetentionPolicies();
    this.startVolumeMonitoring();
    this.startAggregation();
  }

  /**
   * Initialize default retention policies for different components
   */
  private initializeRetentionPolicies(): void {
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
      complianceFrameworks: Array.from(new Set(this.retentionPolicies.map(p => p.complianceFramework).filter(Boolean))),
      maxRetention: Math.max(...this.retentionPolicies.map(p => p.retentionPeriod))
    });
  }

  /**
   * Record a log entry for volume tracking
   */
  recordLog(level: string, component: string, size: number = 1): void {
    this.metrics.totalLogs++;
    
    // Update storage estimation (rough calculation)
    const avgLogSize = 0.5; // KB average
    this.metrics.storageUsed += avgLogSize / 1024; // Convert to MB

    // Update cost estimation
    const levelCost = this.costOptimization.levelCosts[level] || 1.0;
    const logCost = (levelCost * this.costOptimization.ingestionCost) / 1000000; // Per log
    this.metrics.estimatedCost += logCost;

    // Record for aggregation
    this.recordForAggregation(level, component);
  }

  /**
   * Record log for time-based aggregation
   */
  private recordForAggregation(level: string, component: string): void {
    const now = new Date();
    const windowKey = this.getAggregationWindowKey('5m', now);
    
    let aggregation = this.aggregationData.get(windowKey);
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
    
    if (level === 'error') aggregation.metrics.errors++;
    if (level === 'warn') aggregation.metrics.warnings++;
  }

  /**
   * Get aggregation window key for time-based grouping
   */
  private getAggregationWindowKey(window: '1m' | '5m' | '15m' | '1h' | '1d', timestamp: Date): string {
    const minutes = timestamp.getMinutes();
    const hours = timestamp.getHours();
    const day = timestamp.getDate();
    const month = timestamp.getMonth();
    const year = timestamp.getFullYear();

    switch (window) {
      case '1m':
        return `${year}-${month}-${day}-${hours}-${minutes}`;
      case '5m':
        return `${year}-${month}-${day}-${hours}-${Math.floor(minutes / 5) * 5}`;
      case '15m':
        return `${year}-${month}-${day}-${hours}-${Math.floor(minutes / 15) * 15}`;
      case '1h':
        return `${year}-${month}-${day}-${hours}`;
      case '1d':
        return `${year}-${month}-${day}`;
      default:
        return `${year}-${month}-${day}-${hours}-${minutes}`;
    }
  }

  /**
   * Calculate storage tier recommendations
   */
  getStorageTierRecommendations(component: string): {
    tier: 'hot' | 'warm' | 'cold' | 'archive';
    costSavings: number;
    accessTime: string;
  } {
    const policy = this.retentionPolicies.find(p => p.component === component);
    if (!policy) {
      return { tier: 'hot', costSavings: 0, accessTime: 'immediate' };
    }

    const daysOld = 30; // Example: assume 30 days old
    const currentCost = this.costOptimization.storageTiers.hot;

    if (daysOld > policy.archiveAfter) {
      return {
        tier: 'archive',
        costSavings: ((currentCost - this.costOptimization.storageTiers.archive) / currentCost) * 100,
        accessTime: '24+ hours'
      };
    } else if (daysOld > policy.compressionAfter) {
      return {
        tier: 'cold',
        costSavings: ((currentCost - this.costOptimization.storageTiers.cold) / currentCost) * 100,
        accessTime: '12 hours'
      };
    } else if (daysOld > 7) {
      return {
        tier: 'warm',
        costSavings: ((currentCost - this.costOptimization.storageTiers.warm) / currentCost) * 100,
        accessTime: '1 hour'
      };
    }

    return { tier: 'hot', costSavings: 0, accessTime: 'immediate' };
  }

  /**
   * Estimate monthly costs by component
   */
  getCostBreakdown(): {
    totalEstimated: number;
    byComponent: Record<string, number>;
    byLevel: Record<string, number>;
    storageCost: number;
    ingestionCost: number;
    optimizationSavings: number;
  } {
    const componentCosts: Record<string, number> = {};
    const levelCosts: Record<string, number> = {};
    
    // Calculate costs from aggregation data
    for (const aggregation of Array.from(this.aggregationData.values())) {
      for (const [level, count] of Object.entries(aggregation.metrics.levels)) {
        const levelCost = (this.costOptimization.levelCosts[level] || 1.0) * 
                         ((count as number) * this.costOptimization.ingestionCost / 1000000);
        levelCosts[level] = (levelCosts[level] || 0) + levelCost;
      }
      
      for (const [component, count] of Object.entries(aggregation.metrics.components)) {
        const componentCost = (count as number) * this.costOptimization.ingestionCost / 1000000;
        componentCosts[component] = (componentCosts[component] || 0) + componentCost;
      }
    }

    const storageCost = this.metrics.storageUsed * this.costOptimization.storageTiers.hot;
    const ingestionCost = this.metrics.totalLogs * this.costOptimization.ingestionCost / 1000000;
    
    // Calculate potential savings from optimization
    const optimizationSavings = this.calculateOptimizationSavings();

    return {
      totalEstimated: ingestionCost + storageCost,
      byComponent: componentCosts,
      byLevel: levelCosts,
      storageCost,
      ingestionCost,
      optimizationSavings
    };
  }

  /**
   * Calculate potential cost savings from optimization
   */
  private calculateOptimizationSavings(): number {
    const stats = productionOptimizer.getStats();
    
    // Estimate savings from sampling
    const debugSavings = (1 - (stats.samplingRates.debug || 0)) * 
                        ((this.costOptimization.levelCosts.debug || 1.0) * 0.5); // 50% of debug logs
    const infoSavings = (1 - (stats.samplingRates.info || 0)) * 
                       ((this.costOptimization.levelCosts.info || 1.0) * 0.3); // 30% of info logs
    
    // Estimate storage tier savings
    const tierSavings = this.metrics.storageUsed * 
                       (this.costOptimization.storageTiers.hot - this.costOptimization.storageTiers.warm) * 0.7;

    return debugSavings + infoSavings + tierSavings;
  }

  /**
   * Get compliance status for all retention policies
   */
  getComplianceStatus(): {
    overall: boolean;
    policies: Array<{
      component: string;
      compliant: boolean;
      framework?: 'HIPAA' | 'SOX' | 'GDPR';
      nextAction: string;
      dueDate: Date;
    }>;
    recommendations: string[];
  } {
    const policies = this.retentionPolicies.map(policy => {
      const compliant = this.checkPolicyCompliance(policy);
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30); // Example: 30 days to next review
      
      return {
        component: policy.component,
        compliant,
        ...(policy.complianceFramework && { framework: policy.complianceFramework }),
        nextAction: compliant ? 'maintain' : 'remediate',
        dueDate
      };
    });

    const overall = policies.every(p => p.compliant);
    const recommendations = this.generateComplianceRecommendations(policies);

    return { overall, policies, recommendations };
  }

  /**
   * Check if a retention policy is compliant
   */
  private checkPolicyCompliance(policy: RetentionPolicy): boolean {
    // In a real implementation, this would check actual log retention
    // For now, assume compliance based on policy configuration
    return policy.retentionPeriod >= this.getMinimumRetention(policy.complianceFramework);
  }

  /**
   * Get minimum retention period for compliance framework
   */
  private getMinimumRetention(framework?: string): number {
    switch (framework) {
      case 'HIPAA': return 2555; // 7 years
      case 'SOX': return 2555;   // 7 years
      case 'GDPR': return 2555;  // 7 years (for medical data)
      default: return 365;       // 1 year default
    }
  }

  /**
   * Generate compliance recommendations
   */
  private generateComplianceRecommendations(policies: any[]): string[] {
    const recommendations = [];
    
    const nonCompliant = policies.filter(p => !p.compliant);
    if (nonCompliant.length > 0) {
      recommendations.push(`Remediate ${nonCompliant.length} non-compliant retention policies`);
    }

    const hipaaComponents = policies.filter(p => p.framework === 'HIPAA');
    if (hipaaComponents.length > 0) {
      recommendations.push(`Ensure HIPAA audit trail for ${hipaaComponents.length} components`);
    }

    if (this.metrics.storageUsed > 1000) { // > 1GB
      recommendations.push('Consider implementing storage tiering for cost optimization');
    }

    return recommendations;
  }

  /**
   * Start volume monitoring
   */
  private startVolumeMonitoring(): void {
    setInterval(() => {
      this.updateVolumeMetrics();
    }, 60000); // Update every minute
  }

  /**
   * Start log aggregation processing
   */
  private startAggregation(): void {
    setInterval(() => {
      this.processAggregation();
    }, 300000); // Process every 5 minutes
  }

  /**
   * Update volume metrics
   */
  private updateVolumeMetrics(): void {
    const now = Date.now();
    const timeDiff = (now - this.metrics.lastAggregation.getTime()) / 1000; // seconds
    
    this.metrics.logsPerSecond = this.metrics.totalLogs / Math.max(timeDiff, 1);
    this.metrics.lastAggregation = new Date();

    // Log metrics periodically
    if (Math.random() < 0.1) { // 10% chance
      this.volumeLogger.info('Volume metrics updated', {
        totalLogs: this.metrics.totalLogs,
        logsPerSecond: this.metrics.logsPerSecond.toFixed(2),
        storageUsed: `${this.metrics.storageUsed.toFixed(2)} MB`,
        estimatedMonthlyCost: `$${this.metrics.estimatedCost.toFixed(2)}`
      });
    }
  }

  /**
   * Process and clean up aggregation data
   */
  private processAggregation(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    // Clean up old aggregation data
    for (const [key, aggregation] of Array.from(this.aggregationData.entries())) {
      if (now - aggregation.timestamp.getTime() > maxAge) {
        this.aggregationData.delete(key);
      }
    }

    this.volumeLogger.debug('Aggregation data processed', {
      activeWindows: this.aggregationData.size,
      totalLogs: this.metrics.totalLogs
    });
  }

  /**
   * Get current volume statistics
   */
  getVolumeStats(): VolumeMetrics & {
    aggregationWindows: number;
    complianceStatus: boolean;
    costBreakdown: {
      totalEstimated: number;
      byComponent: Record<string, number>;
      byLevel: Record<string, number>;
      storageCost: number;
      ingestionCost: number;
      optimizationSavings: number;
    };
  } {
    return {
      ...this.metrics,
      aggregationWindows: this.aggregationData.size,
      complianceStatus: this.getComplianceStatus().overall,
      costBreakdown: this.getCostBreakdown()
    };
  }

  /**
   * Export aggregated data for external analysis
   */
  exportAggregatedData(timeRange: { start: Date; end: Date }): LogAggregation[] {
    const results: LogAggregation[] = [];
    
    for (const aggregation of Array.from(this.aggregationData.values())) {
      if (aggregation.timestamp >= timeRange.start && aggregation.timestamp <= timeRange.end) {
        results.push(aggregation);
      }
    }

    return results.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }
}

// Global volume manager instance - lazy initialization to prevent startup issues
let logVolumeManagerInstance: LogVolumeManager | null = null

export const logVolumeManager = {
  get instance(): LogVolumeManager {
    if (!logVolumeManagerInstance) {
      logVolumeManagerInstance = new LogVolumeManager();
    }
    return logVolumeManagerInstance;
  },
  
  // Proxy methods for backward compatibility
  recordLog: (level: string, component: string, size?: number) => {
    return logVolumeManager.instance.recordLog(level, component, size);
  },
  
  getVolumeStats: () => {
    return logVolumeManager.instance.getVolumeStats();
  },
  
  getComplianceStatus: () => {
    return logVolumeManager.instance.getComplianceStatus();
  },
  
  getCostBreakdown: () => {
    return logVolumeManager.instance.getCostBreakdown();
  },
  
  exportAggregatedData: (timeRange: { start: Date; end: Date }) => {
    return logVolumeManager.instance.exportAggregatedData(timeRange);
  }
};

// Export types and classes
export { LogVolumeManager, type VolumeMetrics, type RetentionPolicy, type LogAggregation, type CostOptimization };
