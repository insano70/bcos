'use client';

import React, { useState } from 'react';
import ChartBuilder from '@/components/charts/chart-builder';
import { ChartDefinition } from '@/lib/types/analytics';

export default function ChartBuilderPage() {
  const [showBuilder, setShowBuilder] = useState(false);
  const [savedCharts, setSavedCharts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSaveChart = async (chartDefinition: Partial<ChartDefinition>) => {
    setIsLoading(true);
    
    try {
      console.log('💾 Saving chart definition:', chartDefinition);
      
      const response = await fetch('/api/admin/analytics/charts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(chartDefinition),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save chart');
      }

      const result = await response.json();
      console.log('✅ Chart saved successfully:', result);
      
      // Refresh the charts list
      await loadCharts();
      setShowBuilder(false);
      
    } catch (error) {
      console.error('❌ Failed to save chart:', error);
      // TODO: Show toast notification for save error
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelBuilder = () => {
    setShowBuilder(false);
  };

  const loadCharts = async () => {
    try {
      const response = await fetch('/api/admin/analytics/charts');
      if (response.ok) {
        const result = await response.json();
        const charts = result.data.charts || [];
        // Ensure each chart has a unique ID for React keys
        const chartsWithIds = charts.map((chart: any, index: number) => ({
          ...chart,
          chart_definition_id: chart.chart_definition_id || `temp-${index}`
        }));
        setSavedCharts(chartsWithIds);
      }
    } catch (error) {
      console.error('Failed to load charts:', error);
      setSavedCharts([]); // Ensure we always have an array
    }
  };

  const deleteChart = async (chartId: string) => {
    if (!confirm('Are you sure you want to delete this chart?')) return;
    
    try {
      const response = await fetch(`/api/admin/analytics/charts/${chartId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await loadCharts(); // Refresh list
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete chart');
      }
    } catch (error) {
      // TODO: Show toast notification for delete error
    }
  };

  // Load charts on component mount
  React.useEffect(() => {
    loadCharts();
  }, []);

  if (showBuilder) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-9xl mx-auto">
        <ChartBuilder
          
          
        />
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-9xl mx-auto">
      {/* Page Header */}
      <div className="sm:flex sm:justify-between sm:items-center mb-8">
        <div className="mb-4 sm:mb-0">
          <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">
            Chart Builder
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Create and manage configurable chart definitions
          </p>
        </div>
        
        <button
          onClick={() => setShowBuilder(true)}
          className="px-6 py-2 bg-violet-500 text-white rounded-md hover:bg-violet-600 transition-colors"
        >
          Create New Chart
        </button>
      </div>

      {/* Saved Charts List */}
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Saved Chart Definitions
          </h2>
          <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">
            Manage your stored chart configurations
          </p>
        </div>

        <div className="p-6">
          {savedCharts.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-gray-500 dark:text-gray-400 mb-4">
                📊 No chart definitions found
              </div>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Create your first chart definition to get started
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {savedCharts.map((chart, index) => (
                <div
                  key={chart.chart_definition_id || `chart-${index}`}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-medium text-gray-900 dark:text-gray-100">
                        {chart.chart_name}
                      </h3>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {chart.chart_type} chart
                      </div>
                    </div>
                    
                    <button
                      onClick={() => deleteChart(chart.chart_definition_id)}
                      className="text-red-500 hover:text-red-700 text-sm"
                    >
                      Delete
                    </button>
                  </div>
                  
                  {chart.chart_description && (
                    <p className="text-gray-600 dark:text-gray-400 text-sm mb-3">
                      {chart.chart_description}
                    </p>
                  )}
                  
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Created: {new Date(chart.created_at).toLocaleDateString()}
                    <br />
                    By: {chart.creator_name} {chart.creator_last_name}
                    {chart.category_name && (
                      <React.Fragment key="category">
                        <br />
                        Category: {chart.category_name}
                      </React.Fragment>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
