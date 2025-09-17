import { AggAppMeasure } from '@/lib/types/analytics';
import { logger } from '@/lib/logger';

/**
 * Anomaly Detection Service
 * Implements automated anomaly detection and alert system for significant data changes
 */

export interface AnomalyThreshold {
  id: string;
  name: string;
  description: string;
  threshold: number; // percentage change threshold
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface AnomalyDetectionRule {
  id: string;
  chartDefinitionId: string;
  measure: string;
  thresholds: AnomalyThreshold[];
  isActive: boolean;
  alertEmails: string[];
  lastChecked?: Date;
  createdBy: string;
}

export interface AnomalyAlert {
  id: string;
  ruleId: string;
  chartDefinitionId: string;
  measure: string;
  detectedAt: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
  currentValue: number;
  expectedValue: number;
  percentageChange: number;
  description: string;
  isResolved: boolean;
  resolvedAt?: Date;
  resolvedBy?: string;
}

export const DEFAULT_THRESHOLDS: AnomalyThreshold[] = [
  {
    id: 'minor_change',
    name: 'Minor Change',
    description: '10-25% change from expected value',
    threshold: 10,
    severity: 'low'
  },
  {
    id: 'significant_change',
    name: 'Significant Change',
    description: '25-50% change from expected value',
    threshold: 25,
    severity: 'medium'
  },
  {
    id: 'major_change',
    name: 'Major Change',
    description: '50-100% change from expected value',
    threshold: 50,
    severity: 'high'
  },
  {
    id: 'critical_change',
    name: 'Critical Change',
    description: 'Over 100% change from expected value',
    threshold: 100,
    severity: 'critical'
  }
];

export class AnomalyDetectionService {
  private rules = new Map<string, AnomalyDetectionRule>();
  private alerts = new Map<string, AnomalyAlert>();

  /**
   * Detect anomalies in chart data
   */
  detectAnomalies(
    measures: AggAppMeasure[],
    ruleId?: string
  ): AnomalyAlert[] {
    if (measures.length < 3) {
      return []; // Need at least 3 data points for anomaly detection
    }

    const alerts: AnomalyAlert[] = [];
    const rule = ruleId ? this.rules.get(ruleId) : null;
    const thresholds = rule?.thresholds || DEFAULT_THRESHOLDS;

    // Sort by date to analyze trends
    const sortedMeasures = measures.sort((a, b) => 
      new Date(a.date_index).getTime() - new Date(b.date_index).getTime()
    );

    const latestMeasure = sortedMeasures[sortedMeasures.length - 1];
    if (!latestMeasure) return [];
    
    const expectedValue = this.calculateExpectedValue(sortedMeasures);
    const currentValue = latestMeasure.measure_value;
    
    const percentageChange = expectedValue !== 0 
      ? Math.abs((currentValue - expectedValue) / expectedValue) * 100
      : 0;

    // Check against thresholds
    for (const threshold of thresholds.sort((a, b) => b.threshold - a.threshold)) {
      if (percentageChange >= threshold.threshold) {
        const alert: AnomalyAlert = {
          id: `anomaly_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          ruleId: ruleId || 'default',
          chartDefinitionId: rule?.chartDefinitionId || 'unknown',
          measure: latestMeasure.measure,
          detectedAt: new Date(),
          severity: threshold.severity,
          currentValue,
          expectedValue,
          percentageChange,
          description: `${threshold.name}: ${latestMeasure.measure} changed by ${percentageChange.toFixed(1)}% (${currentValue.toLocaleString()} vs expected ${expectedValue.toLocaleString()})`,
          isResolved: false
        };

        alerts.push(alert);
        this.alerts.set(alert.id, alert);
        
        logger.warn('Anomaly detected', {
          alertId: alert.id,
          measure: alert.measure,
          severity: alert.severity,
          percentageChange: alert.percentageChange,
          currentValue: alert.currentValue,
          expectedValue: alert.expectedValue
        });

        break; // Only trigger the highest severity threshold
      }
    }

    return alerts;
  }

  /**
   * Create anomaly detection rule
   */
  createRule(rule: Omit<AnomalyDetectionRule, 'id' | 'lastChecked'>): string {
    const ruleId = `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const fullRule: AnomalyDetectionRule = {
      ...rule,
      id: ruleId
    };

    this.rules.set(ruleId, fullRule);
    
    logger.info('Anomaly detection rule created', {
      ruleId,
      chartDefinitionId: rule.chartDefinitionId,
      measure: rule.measure,
      thresholdCount: rule.thresholds.length
    });

    return ruleId;
  }

  /**
   * Update anomaly detection rule
   */
  updateRule(ruleId: string, updates: Partial<AnomalyDetectionRule>): boolean {
    const rule = this.rules.get(ruleId);
    if (!rule) return false;

    const updatedRule = { ...rule, ...updates };
    this.rules.set(ruleId, updatedRule);

    logger.info('Anomaly detection rule updated', { ruleId });
    return true;
  }

  /**
   * Delete anomaly detection rule
   */
  deleteRule(ruleId: string): boolean {
    const deleted = this.rules.delete(ruleId);
    
    if (deleted) {
      logger.info('Anomaly detection rule deleted', { ruleId });
    }
    
    return deleted;
  }

  /**
   * Get all active rules
   */
  getActiveRules(): AnomalyDetectionRule[] {
    return Array.from(this.rules.values()).filter(rule => rule.isActive);
  }

  /**
   * Get unresolved alerts
   */
  getUnresolvedAlerts(): AnomalyAlert[] {
    return Array.from(this.alerts.values()).filter(alert => !alert.isResolved);
  }

  /**
   * Resolve an alert
   */
  resolveAlert(alertId: string, resolvedBy: string): boolean {
    const alert = this.alerts.get(alertId);
    if (!alert) return false;

    alert.isResolved = true;
    alert.resolvedAt = new Date();
    alert.resolvedBy = resolvedBy;
    
    this.alerts.set(alertId, alert);
    
    logger.info('Anomaly alert resolved', { alertId, resolvedBy });
    return true;
  }

  /**
   * Send alert notifications
   */
  async sendAlertNotifications(alerts: AnomalyAlert[]): Promise<void> {
    for (const alert of alerts) {
      const rule = this.rules.get(alert.ruleId);
      if (!rule || rule.alertEmails.length === 0) continue;

      try {
        // Dynamic import to avoid circular dependencies
        const { EmailService } = await import('../api/services/email');
        
        await EmailService.sendSystemNotification(
          `Anomaly Detected: ${alert.measure}`,
          alert.description,
          {
            severity: alert.severity,
            chartDefinitionId: alert.chartDefinitionId,
            measure: alert.measure,
            percentageChange: alert.percentageChange,
            currentValue: alert.currentValue,
            expectedValue: alert.expectedValue
          }
        );

        logger.info('Anomaly alert sent', {
          alertId: alert.id,
          emailCount: rule.alertEmails.length,
          severity: alert.severity
        });

      } catch (error) {
        logger.error('Failed to send anomaly alert', {
          alertId: alert.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  }

  /**
   * Run anomaly detection for all active rules
   */
  async runDetectionForAllRules(): Promise<AnomalyAlert[]> {
    const activeRules = this.getActiveRules();
    const allAlerts: AnomalyAlert[] = [];

    for (const rule of activeRules) {
      try {
        // This would typically fetch data for the specific chart/measure
        // For now, we'll skip the actual data fetching since it requires chart context
        
        rule.lastChecked = new Date();
        this.rules.set(rule.id, rule);
        
      } catch (error) {
        logger.error('Anomaly detection failed for rule', {
          ruleId: rule.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Send notifications for new alerts
    if (allAlerts.length > 0) {
      await this.sendAlertNotifications(allAlerts);
    }

    return allAlerts;
  }

  private calculateExpectedValue(measures: AggAppMeasure[]): number {
    // Simple moving average of the last 3 periods (excluding current)
    const historicalValues = measures.slice(0, -1).slice(-3);
    
    if (historicalValues.length === 0) return 0;
    
    return historicalValues.reduce((sum, measure) => sum + measure.measure_value, 0) / historicalValues.length;
  }

  private simpleForecast(values: number[]): number {
    if (values.length < 2) return values[0] || 0;
    
    // Simple linear trend extrapolation
    const recent = values.slice(-2);
    const trend = (recent[1] ?? 0) - (recent[0] ?? 0);
    
    return (recent[1] ?? 0) + trend;
  }
}

// Export singleton instance
export const anomalyDetectionService = new AnomalyDetectionService();
