'use client';

import { useState, useEffect } from 'react';
import { 
  anomalyDetectionService, 
  AnomalyAlert, 
  AnomalyDetectionRule,
  DEFAULT_THRESHOLDS 
} from '@/lib/services/anomaly-detection';
import { MeasureType, FrequencyType } from '@/lib/types/analytics';
import { LoadingSpinner, CardSkeleton, TableSkeleton } from '@/components/ui/loading-skeleton';
import Toast from '@/components/toast';

interface AnomalyMonitoringProps {
  className?: string;
}

export default function AnomalyMonitoringDashboard({ className = '' }: AnomalyMonitoringProps) {
  const [alerts, setAlerts] = useState<AnomalyAlert[]>([]);
  const [rules, setRules] = useState<AnomalyDetectionRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunningDetection, setIsRunningDetection] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');

  useEffect(() => {
    loadAnomalyData();
  }, []);

  const loadAnomalyData = async () => {
    try {
      setIsLoading(true);
      // Load existing alerts and rules
      const unresolvedAlerts = anomalyDetectionService.getUnresolvedAlerts();
      const activeRules = anomalyDetectionService.getActiveRules();
      
      setAlerts(unresolvedAlerts);
      setRules(activeRules);
    } catch (error) {
      console.error('Failed to load anomaly data:', error);
      setToastMessage('Failed to load anomaly monitoring data');
      setToastType('error');
      setShowToast(true);
    } finally {
      setIsLoading(false);
    }
  };

  const runAnomalyDetection = async () => {
    try {
      setIsRunningDetection(true);
      const newAlerts = await anomalyDetectionService.runDetectionForAllRules();
      
      setAlerts(prev => [...prev, ...newAlerts]);
      
      setToastMessage(`Anomaly detection completed. ${newAlerts.length} new alerts detected.`);
      setToastType('success');
      setShowToast(true);
      
    } catch (error) {
      console.error('Failed to run anomaly detection:', error);
      setToastMessage('Failed to run anomaly detection');
      setToastType('error');
      setShowToast(true);
    } finally {
      setIsRunningDetection(false);
    }
  };

  const resolveAlert = async (alertId: string) => {
    try {
      const success = anomalyDetectionService.resolveAlert(alertId, 'current-user'); // Would use actual user ID
      
      if (success) {
        setAlerts(prev => prev.filter(alert => alert.id !== alertId));
        setToastMessage('Alert resolved successfully');
        setToastType('success');
        setShowToast(true);
      }
    } catch (error) {
      console.error('Failed to resolve alert:', error);
      setToastMessage('Failed to resolve alert');
      setToastType('error');
      setShowToast(true);
    }
  };

  const getSeverityColor = (severity: 'low' | 'medium' | 'high' | 'critical') => {
    switch (severity) {
      case 'low': return 'bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200 border-blue-200 dark:border-blue-800';
      case 'medium': return 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200 border-yellow-200 dark:border-yellow-800';
      case 'high': return 'bg-orange-100 dark:bg-orange-900/20 text-orange-800 dark:text-orange-200 border-orange-200 dark:border-orange-800';
      case 'critical': return 'bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-200 border-red-200 dark:border-red-800';
      default: return 'bg-gray-100 dark:bg-gray-900/20 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-800';
    }
  };

  const getSeverityIcon = (severity: 'low' | 'medium' | 'high' | 'critical') => {
    switch (severity) {
      case 'low': return '🔵';
      case 'medium': return '🟡';
      case 'high': return '🟠';
      case 'critical': return '🔴';
      default: return '⚪';
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  if (isLoading) {
    return (
      <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 ${className}`}>
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="animate-pulse">
            <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-48 mb-2"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-96"></div>
          </div>
        </div>
        <div className="p-6">
          <TableSkeleton rows={5} columns={4} />
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 flex items-center">
              <span className="mr-2">🚨</span>
              Anomaly Monitoring
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Monitor and manage data anomalies and alerts
            </p>
          </div>
          
          <button
            onClick={runAnomalyDetection}
            disabled={isRunningDetection}
            className="px-4 py-2 bg-violet-500 text-white rounded-md hover:bg-violet-600 transition-colors disabled:opacity-50 flex items-center"
          >
            {isRunningDetection ? (
              <>
                <LoadingSpinner size="sm" text="" />
                <span className="ml-2">Running...</span>
              </>
            ) : (
              <>
                <span className="mr-2">🔍</span>
                Run Detection
              </>
            )}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
            <div className="text-sm font-medium text-red-900 dark:text-red-100 mb-1">
              Active Alerts
            </div>
            <div className="text-2xl font-bold text-red-900 dark:text-red-100">
              {alerts.length}
            </div>
          </div>
          
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
            <div className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">
              Monitoring Rules
            </div>
            <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">
              {rules.length}
            </div>
          </div>
          
          <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4">
            <div className="text-sm font-medium text-orange-900 dark:text-orange-100 mb-1">
              Critical Alerts
            </div>
            <div className="text-2xl font-bold text-orange-900 dark:text-orange-100">
              {alerts.filter(a => a.severity === 'critical').length}
            </div>
          </div>
          
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
            <div className="text-sm font-medium text-green-900 dark:text-green-100 mb-1">
              Last Check
            </div>
            <div className="text-sm font-bold text-green-900 dark:text-green-100">
              {rules.length > 0 && rules[0]?.lastChecked 
                ? rules[0].lastChecked.toLocaleTimeString()
                : 'Never'
              }
            </div>
          </div>
        </div>
      </div>

      {/* Active Alerts */}
      <div className="p-6">
        <h4 className="text-md font-medium text-gray-900 dark:text-gray-100 mb-4 flex items-center">
          <span className="mr-2">⚠️</span>
          Active Alerts ({alerts.length})
        </h4>
        
        {alerts.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <div className="text-4xl mb-4">✅</div>
            <p className="text-lg font-medium mb-2">No Active Alerts</p>
            <p className="text-sm">
              Your data is within normal parameters
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={`rounded-lg border p-4 ${getSeverityColor(alert.severity)}`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center mb-2">
                      <span className="mr-2">{getSeverityIcon(alert.severity)}</span>
                      <span className="font-medium text-sm uppercase tracking-wide">
                        {alert.severity} Anomaly
                      </span>
                      <span className="ml-2 text-xs opacity-75">
                        {alert.detectedAt.toLocaleString()}
                      </span>
                    </div>
                    
                    <div className="text-sm mb-2">
                      <strong>{alert.measure}</strong>
                    </div>
                    
                    <div className="text-sm mb-3">
                      {alert.description}
                    </div>
                    
                    <div className="grid grid-cols-3 gap-4 text-xs">
                      <div>
                        <span className="opacity-75">Current:</span>
                        <div className="font-medium">{formatCurrency(alert.currentValue)}</div>
                      </div>
                      <div>
                        <span className="opacity-75">Expected:</span>
                        <div className="font-medium">{formatCurrency(alert.expectedValue)}</div>
                      </div>
                      <div>
                        <span className="opacity-75">Change:</span>
                        <div className="font-medium">{alert.percentageChange.toFixed(1)}%</div>
                      </div>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => resolveAlert(alert.id)}
                    className="ml-4 px-3 py-1 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-sm hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                  >
                    Resolve
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Monitoring Rules */}
      <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
        <h4 className="text-md font-medium text-gray-900 dark:text-gray-100 mb-4 flex items-center">
          <span className="mr-2">⚙️</span>
          Detection Rules ({rules.length})
        </h4>
        
        {rules.length === 0 ? (
          <div className="text-center py-6 text-gray-500 dark:text-gray-400">
            <div className="text-3xl mb-3">⚙️</div>
            <p className="text-md font-medium mb-1">No Detection Rules</p>
            <p className="text-sm">
              Create rules to automatically monitor your charts for anomalies
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-900/20"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center mb-2">
                      <div className={`w-3 h-3 rounded-full mr-2 ${
                        rule.isActive ? 'bg-green-500' : 'bg-gray-400'
                      }`}></div>
                      <span className="font-medium text-sm">
                        {rule.measure}
                      </span>
                      <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                        Chart: {rule.chartDefinitionId}
                      </span>
                    </div>
                    
                    <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                      Monitoring {rule.thresholds.length} threshold levels
                    </div>
                    
                    <div className="flex flex-wrap gap-1">
                      {rule.thresholds.map((threshold) => (
                        <span
                          key={threshold.id}
                          className={`px-2 py-1 rounded text-xs ${getSeverityColor(threshold.severity)}`}
                        >
                          {threshold.threshold}% ({threshold.severity})
                        </span>
                      ))}
                    </div>
                    
                    {rule.lastChecked && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                        Last checked: {rule.lastChecked.toLocaleString()}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => {
                        // Toggle rule active status
                        anomalyDetectionService.updateRule(rule.id, { isActive: !rule.isActive });
                        loadAnomalyData();
                      }}
                      className={`px-3 py-1 rounded text-sm transition-colors ${
                        rule.isActive
                          ? 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/40'
                          : 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/40'
                      }`}
                    >
                      {rule.isActive ? 'Disable' : 'Enable'}
                    </button>
                    
                    <button
                      onClick={() => {
                        anomalyDetectionService.deleteRule(rule.id);
                        loadAnomalyData();
                      }}
                      className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Default Thresholds Reference */}
      <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300 group-open:text-violet-600 dark:group-open:text-violet-400">
            📊 Default Threshold Levels ({DEFAULT_THRESHOLDS.length})
          </summary>
          
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {DEFAULT_THRESHOLDS.map((threshold) => (
              <div key={threshold.id} className={`p-3 rounded border ${getSeverityColor(threshold.severity)}`}>
                <div className="font-medium">{threshold.name}</div>
                <div className="opacity-75">{threshold.description}</div>
                <div className="mt-1 font-medium">
                  {threshold.threshold}% threshold
                </div>
              </div>
            ))}
          </div>
        </details>
      </div>

      {/* Toast Notification */}
      <Toast
        type={toastType}
        open={showToast}
        setOpen={setShowToast}
        className="fixed bottom-4 right-4 z-50"
      >
        {toastMessage}
      </Toast>
    </div>
  );
}
