'use client';

import { useState, useEffect } from 'react';
import { ChartDefinition } from '@/lib/types/analytics';
import { TableSkeleton, LoadingSpinner, Skeleton } from '@/components/ui/loading-skeleton';
// Client-side API service for bulk operations
const bulkOperationsAPI = {
  async getOperationProgress(operationId: string) {
    const response = await fetch(`/api/admin/analytics/bulk-operations/${operationId}`);
    if (!response.ok) throw new Error('Failed to get operation progress');
    return response.json();
  },
  
  async bulkUpdateCharts(chartIds: string[], updates: any) {
    const response = await fetch('/api/admin/analytics/bulk-operations/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chartIds, updates })
    });
    if (!response.ok) throw new Error('Failed to start bulk update');
    const result = await response.json();
    return result.operationId;
  },
  
  async bulkDeleteCharts(chartIds: string[]) {
    const response = await fetch('/api/admin/analytics/bulk-operations/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chartIds })
    });
    if (!response.ok) throw new Error('Failed to start bulk delete');
    const result = await response.json();
    return result.operationId;
  },
  
  async bulkExportCharts(chartIds: string[], format: string) {
    const response = await fetch('/api/admin/analytics/bulk-operations/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chartIds, format })
    });
    if (!response.ok) throw new Error('Failed to start bulk export');
    const result = await response.json();
    return result.operationId;
  },
  
  async bulkCloneCharts(chartIds: string[], targetCategoryId?: string) {
    const response = await fetch('/api/admin/analytics/bulk-operations/clone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chartIds, targetCategoryId })
    });
    if (!response.ok) throw new Error('Failed to start bulk clone');
    const result = await response.json();
    return result.operationId;
  }
};
import Toast from '@/components/toast';

/**
 * Bulk Operations Manager
 * Mass updates, exports, and organization tools for charts
 */

export default function BulkOperationsManager() {
  const [availableCharts, setAvailableCharts] = useState<ChartDefinition[]>([]);
  const [selectedCharts, setSelectedCharts] = useState<Set<string>>(new Set());
  const [currentOperation, setCurrentOperation] = useState<string | null>(null);
  const [operationProgress, setOperationProgress] = useState<any>(null);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const [isLoading, setIsLoading] = useState(true);
  const [isPerformingOperation, setIsPerformingOperation] = useState(false);

  useEffect(() => {
    loadCharts();
  }, []);

  useEffect(() => {
    if (currentOperation) {
      const interval = setInterval(async () => {
        try {
          const progress = await bulkOperationsAPI.getOperationProgress(currentOperation);
          setOperationProgress(progress);
          
          if (progress && (progress.status === 'completed' || progress.status === 'failed')) {
            setCurrentOperation(null);
            clearInterval(interval);
            
            if (progress.status === 'completed') {
              setToastMessage(`Operation completed! ${progress.completed} successful, ${progress.failed} failed`);
              setToastType('success');
            } else {
              setToastMessage('Operation failed');
              setToastType('error');
            }
            setShowToast(true);
          }
        } catch (error) {
          console.error('Failed to get operation progress:', error);
          setCurrentOperation(null);
          clearInterval(interval);
          setToastMessage('Failed to get operation progress');
          setToastType('error');
          setShowToast(true);
        }
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [currentOperation]);

  const loadCharts = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/admin/analytics/charts');
      if (response.ok) {
        const result = await response.json();
        setAvailableCharts(result.data.charts || []);
      }
    } catch (error) {
      console.error('Failed to load charts:', error);
      setToastMessage('Failed to load charts');
      setToastType('error');
      setShowToast(true);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleChartSelection = (chartId: string) => {
    const newSelection = new Set(selectedCharts);
    if (newSelection.has(chartId)) {
      newSelection.delete(chartId);
    } else {
      newSelection.add(chartId);
    }
    setSelectedCharts(newSelection);
  };

  const selectAllCharts = () => {
    setSelectedCharts(new Set(availableCharts.map(chart => chart.chart_definition_id)));
  };

  const clearSelection = () => {
    setSelectedCharts(new Set());
  };

  const handleBulkUpdate = async () => {
    if (selectedCharts.size === 0) return;

    const categoryId = prompt('Enter new category ID (optional):');
    const isActive = confirm('Set charts as active?');

    try {
      setIsPerformingOperation(true);
      const operationId = await bulkOperationsAPI.bulkUpdateCharts(
        Array.from(selectedCharts),
        {
          updates: {
            ...(categoryId && { chart_category_id: parseInt(categoryId) }),
            is_active: isActive
          }
        }
      );

      setCurrentOperation(operationId);
    } catch (error) {
      console.error('Failed to start bulk update:', error);
      setToastMessage('Failed to start bulk update operation');
      setToastType('error');
      setShowToast(true);
    } finally {
      setIsPerformingOperation(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedCharts.size === 0) return;
    
    if (!confirm(`Are you sure you want to delete ${selectedCharts.size} chart(s)?`)) return;

    try {
      setIsPerformingOperation(true);
      const operationId = await bulkOperationsAPI.bulkDeleteCharts(
        Array.from(selectedCharts)
      );
      setCurrentOperation(operationId);
    } catch (error) {
      console.error('Failed to start bulk delete:', error);
      setToastMessage('Failed to start bulk delete operation');
      setToastType('error');
      setShowToast(true);
    } finally {
      setIsPerformingOperation(false);
    }
  };

  const handleBulkExport = async (format: 'png' | 'pdf' | 'csv') => {
    if (selectedCharts.size === 0) return;

    try {
      setIsPerformingOperation(true);
      const operationId = await bulkOperationsAPI.bulkExportCharts(
        Array.from(selectedCharts),
        format
      );
      setCurrentOperation(operationId);
    } catch (error) {
      console.error('Failed to start bulk export:', error);
      setToastMessage('Failed to start bulk export operation');
      setToastType('error');
      setShowToast(true);
    } finally {
      setIsPerformingOperation(false);
    }
  };

  const handleBulkClone = async () => {
    if (selectedCharts.size === 0) return;

    const suffix = prompt('Enter suffix for cloned charts:', ' (Copy)');
    if (suffix === null) return;

    try {
      setIsPerformingOperation(true);
      const operationId = await bulkOperationsAPI.bulkCloneCharts(
        Array.from(selectedCharts),
        suffix // targetCategoryId parameter
      );
      setCurrentOperation(operationId);
    } catch (error) {
      console.error('Failed to start bulk clone:', error);
      setToastMessage('Failed to start bulk clone operation');
      setToastType('error');
      setShowToast(true);
    } finally {
      setIsPerformingOperation(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto bg-white dark:bg-gray-800 shadow-sm rounded-xl">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-96 mt-1" />
        </div>
        <div className="p-6">
          <TableSkeleton rows={8} columns={3} />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto bg-white dark:bg-gray-800 shadow-sm rounded-xl">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Bulk Chart Operations
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Manage multiple charts simultaneously with bulk operations
        </p>
      </div>

      {/* Selection Controls */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {selectedCharts.size} of {availableCharts.length} charts selected
            </span>
            <div className="flex gap-2">
              <button
                onClick={selectAllCharts}
                className="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Select All
              </button>
              <button
                onClick={clearSelection}
                className="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Bulk Actions */}
          {selectedCharts.size > 0 && (
            <div className="flex gap-2">
              <button
                onClick={handleBulkUpdate}
                disabled={!!currentOperation || isPerformingOperation}
                className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors disabled:opacity-50 flex items-center gap-1"
              >
                {isPerformingOperation ? <LoadingSpinner size="sm" text="" /> : null}
                Update
              </button>
              <button
                onClick={handleBulkClone}
                disabled={!!currentOperation || isPerformingOperation}
                className="px-3 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600 transition-colors disabled:opacity-50 flex items-center gap-1"
              >
                {isPerformingOperation ? <LoadingSpinner size="sm" text="" /> : null}
                Clone
              </button>
              <button
                onClick={() => handleBulkExport('csv')}
                disabled={!!currentOperation || isPerformingOperation}
                className="px-3 py-1 text-sm bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors disabled:opacity-50 flex items-center gap-1"
              >
                {isPerformingOperation ? <LoadingSpinner size="sm" text="" /> : null}
                Export
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={!!currentOperation || isPerformingOperation}
                className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center gap-1"
              >
                {isPerformingOperation ? <LoadingSpinner size="sm" text="" /> : null}
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Operation Progress */}
      {currentOperation && operationProgress && (
        <div className="px-6 py-4 bg-blue-50 dark:bg-blue-900/20 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-blue-900 dark:text-blue-100">
                Operation in Progress: {operationProgress.status}
              </div>
              <div className="text-sm text-blue-700 dark:text-blue-300">
                {operationProgress.completed} completed, {operationProgress.failed} failed of {operationProgress.total}
              </div>
            </div>
            <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">
              {operationProgress.progress}%
            </div>
          </div>
          <div className="mt-2 w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${operationProgress.progress}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Charts List */}
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {availableCharts.map((chart) => (
            <div
              key={chart.chart_definition_id}
              className={`border rounded-lg p-4 cursor-pointer transition-all ${
                selectedCharts.has(chart.chart_definition_id)
                  ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
              onClick={() => toggleChartSelection(chart.chart_definition_id)}
            >
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h4 className="font-medium text-gray-900 dark:text-gray-100">
                    {chart.chart_name}
                  </h4>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {chart.chart_type} chart
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={selectedCharts.has(chart.chart_definition_id)}
                  onChange={() => toggleChartSelection(chart.chart_definition_id)}
                  className="text-violet-500"
                />
              </div>
              
              {chart.chart_description && (
                <p className="text-gray-600 dark:text-gray-400 text-sm mb-3">
                  {chart.chart_description}
                </p>
              )}
              
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Created: {new Date(chart.created_at).toLocaleDateString()}
                <br />
                Status: {chart.is_active ? 'Active' : 'Inactive'}
              </div>
            </div>
          ))}
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
