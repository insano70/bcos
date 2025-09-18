'use client';

import { useState } from 'react';
import { 
  anomalyDetectionService, 
  AnomalyDetectionRule, 
  AnomalyThreshold,
  DEFAULT_THRESHOLDS 
} from '@/lib/services/anomaly-detection';
import { MeasureType } from '@/lib/types/analytics';
import Toast from '@/components/toast';

interface AnomalyRuleConfiguratorProps {
  chartDefinitionId?: string;
  measure?: MeasureType;
  onRuleCreated?: (ruleId: string) => void;
  className?: string;
}

export default function AnomalyRuleConfigurator({
  chartDefinitionId = '',
  measure = 'Charges by Provider',
  onRuleCreated,
  className = ''
}: AnomalyRuleConfiguratorProps) {
  const [ruleConfig, setRuleConfig] = useState({
    chartDefinitionId,
    measure,
    alertEmails: [''],
    selectedThresholds: new Set<string>(['significant_change']),
    customThresholds: [] as AnomalyThreshold[],
    isActive: true
  });
  
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const [isSaving, setIsSaving] = useState(false);

  const updateConfig = (key: string, value: any) => {
    setRuleConfig(prev => ({ ...prev, [key]: value }));
  };

  const addEmailField = () => {
    setRuleConfig(prev => ({
      ...prev,
      alertEmails: [...prev.alertEmails, '']
    }));
  };

  const updateEmail = (index: number, email: string) => {
    setRuleConfig(prev => ({
      ...prev,
      alertEmails: prev.alertEmails.map((e, i) => i === index ? email : e)
    }));
  };

  const removeEmail = (index: number) => {
    setRuleConfig(prev => ({
      ...prev,
      alertEmails: prev.alertEmails.filter((_, i) => i !== index)
    }));
  };

  const toggleThreshold = (thresholdId: string) => {
    setRuleConfig(prev => {
      const newSelected = new Set(prev.selectedThresholds);
      if (newSelected.has(thresholdId)) {
        newSelected.delete(thresholdId);
      } else {
        newSelected.add(thresholdId);
      }
      return { ...prev, selectedThresholds: newSelected };
    });
  };

  const createRule = async () => {
    try {
      setIsSaving(true);

      // Validate required fields
      if (!ruleConfig.chartDefinitionId.trim()) {
        throw new Error('Chart Definition ID is required');
      }

      if (!ruleConfig.measure.trim()) {
        throw new Error('Measure is required');
      }

      if (ruleConfig.selectedThresholds.size === 0) {
        throw new Error('At least one threshold must be selected');
      }

      // Filter valid email addresses
      const validEmails = ruleConfig.alertEmails
        .filter(email => email.trim() && email.includes('@'))
        .map(email => email.trim());

      if (validEmails.length === 0) {
        throw new Error('At least one valid email address is required');
      }

      // Get selected thresholds
      const selectedThresholds = DEFAULT_THRESHOLDS.filter(t => 
        ruleConfig.selectedThresholds.has(t.id)
      );

      // Create the rule
      const ruleId = anomalyDetectionService.createRule({
        chartDefinitionId: ruleConfig.chartDefinitionId,
        measure: ruleConfig.measure,
        thresholds: [...selectedThresholds, ...ruleConfig.customThresholds],
        isActive: ruleConfig.isActive,
        alertEmails: validEmails,
        createdBy: 'current-user' // Would use actual user ID
      });

      setToastMessage('Anomaly detection rule created successfully!');
      setToastType('success');
      setShowToast(true);

      // Reset form
      setRuleConfig({
        chartDefinitionId: '',
        measure: 'Charges by Provider',
        alertEmails: [''],
        selectedThresholds: new Set(['significant_change']),
        customThresholds: [],
        isActive: true
      });

      if (onRuleCreated) {
        onRuleCreated(ruleId);
      }

    } catch (error) {
      console.error('Failed to create anomaly rule:', error);
      setToastMessage(`Failed to create rule: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setToastType('error');
      setShowToast(true);
    } finally {
      setIsSaving(false);
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

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 flex items-center">
          <span className="mr-2">⚙️</span>
          Create Anomaly Detection Rule
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Set up automated monitoring and alerts for data anomalies
        </p>
      </div>

      {/* Configuration Form */}
      <div className="p-6 space-y-6">
        {/* Basic Configuration */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Chart Definition ID *
            </label>
            <input
              type="text"
              value={ruleConfig.chartDefinitionId}
              onChange={(e) => updateConfig('chartDefinitionId', e.target.value)}
              placeholder="Enter chart definition ID"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Measure *
            </label>
            <select
              value={ruleConfig.measure}
              onChange={(e) => updateConfig('measure', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value="Charges by Provider">Charges by Provider</option>
              <option value="Payments by Provider">Payments by Provider</option>
            </select>
          </div>
        </div>

        {/* Threshold Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Detection Thresholds *
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {DEFAULT_THRESHOLDS.map((threshold) => (
              <div
                key={threshold.id}
                className={`border rounded-lg p-3 cursor-pointer transition-all ${
                  ruleConfig.selectedThresholds.has(threshold.id)
                    ? `${getSeverityColor(threshold.severity)} border-2`
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
                onClick={() => toggleThreshold(threshold.id)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-sm">{threshold.name}</div>
                    <div className="text-xs opacity-75">{threshold.description}</div>
                    <div className="text-xs font-medium mt-1">
                      {threshold.threshold}% threshold
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={ruleConfig.selectedThresholds.has(threshold.id)}
                    onChange={() => toggleThreshold(threshold.id)}
                    className="text-violet-500"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Alert Email Configuration */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Alert Email Addresses *
          </label>
          <div className="space-y-2">
            {ruleConfig.alertEmails.map((email, index) => (
              <div key={index} className="flex items-center space-x-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => updateEmail(index, e.target.value)}
                  placeholder="Enter email address"
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
                {ruleConfig.alertEmails.length > 1 && (
                  <button
                    onClick={() => removeEmail(index)}
                    className="px-2 py-2 text-red-500 hover:text-red-700 transition-colors"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={addEmailField}
              className="text-sm text-violet-600 dark:text-violet-400 hover:text-violet-800 dark:hover:text-violet-200 transition-colors"
            >
              + Add another email
            </button>
          </div>
        </div>

        {/* Rule Status */}
        <div>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={ruleConfig.isActive}
              onChange={(e) => updateConfig('isActive', e.target.checked)}
              className="mr-2 text-violet-500"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Activate rule immediately
            </span>
          </label>
        </div>

        {/* Actions */}
        <div className="flex justify-end space-x-3">
          <button
            onClick={() => {
              setRuleConfig({
                chartDefinitionId: '',
                measure: 'Charges by Provider',
                alertEmails: [''],
                selectedThresholds: new Set(['significant_change']),
                customThresholds: [],
                isActive: true
              });
            }}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            Reset
          </button>
          
          <button
            onClick={createRule}
            disabled={isSaving || !ruleConfig.chartDefinitionId.trim() || ruleConfig.selectedThresholds.size === 0}
            className="px-6 py-2 bg-violet-500 text-white rounded-md hover:bg-violet-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            {isSaving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Creating Rule...
              </>
            ) : (
              <>
                <span className="mr-2">⚙️</span>
                Create Rule
              </>
            )}
          </button>
        </div>
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
