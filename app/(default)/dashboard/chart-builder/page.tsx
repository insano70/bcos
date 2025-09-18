'use client';

import React, { useState } from 'react';
import ChartBuilder from '@/components/charts/chart-builder';
import { ChartDefinition } from '@/lib/types/analytics';
import ChartsTable, { ChartDefinitionListItem } from './charts-table';
import DeleteButton from '@/components/delete-button';
import DateSelect from '@/components/date-select';
import FilterButton from '@/components/dropdown-filter';
import PaginationClassic from '@/components/pagination-classic';
import { SelectedItemsProvider } from '@/app/selected-items-context';

export default function ChartBuilderPage() {
  const [showBuilder, setShowBuilder] = useState(false);
  const [savedCharts, setSavedCharts] = useState<ChartDefinitionListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedChart, setSelectedChart] = useState<ChartDefinitionListItem | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

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
      console.error('Failed to delete chart:', error);
      // TODO: Show toast notification for delete error
    }
  };

  const handleEditChart = (chart: ChartDefinitionListItem) => {
    setSelectedChart(chart);
    setIsEditModalOpen(true);
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
    <SelectedItemsProvider>
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
        {/* Page Header */}
        <div className="sm:flex sm:justify-between sm:items-center mb-8">
          <div className="mb-4 sm:mb-0">
            <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">
              Chart Definitions
              {isLoading && (
                <span className="ml-3 inline-flex items-center">
                  <svg className="animate-spin h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span className="ml-2 text-sm text-gray-500">Loading...</span>
                </span>
              )}
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Create and manage configurable chart definitions
            </p>
          </div>

          {/* Right: Actions */}
          <div className="grid grid-flow-col sm:auto-cols-max justify-start sm:justify-end gap-2">
            {/* Delete button */}
            <DeleteButton />

            {/* Date filter */}
            <DateSelect />

            {/* Filter button */}
            <FilterButton align="right" />

            {/* Create chart button */}
            <button
              type="button"
              disabled={isLoading}
              onClick={() => setShowBuilder(true)}
              className="btn bg-violet-500 hover:bg-violet-600 text-white disabled:opacity-50"
            >
              <svg className="fill-current shrink-0 xs:hidden" width="16" height="16" viewBox="0 0 16 16">
                <path d="m7 7V3c0-.6.4-1 1-1s1 .4 1 1v4h4c.6 0 1 .4 1 1s-.4 1-1 1H9v4c0 .6-.4 1-1 1s-1-.4-1-1V9H3c-.6 0-1-.4-1-1s.4-1 1-1h4Z" />
              </svg>
              <span className="max-xs:sr-only">Create Chart</span>
            </button>
          </div>
        </div>

        {/* Charts Table */}
        <ChartsTable
          charts={savedCharts}
          onEdit={handleEditChart}
          onDelete={deleteChart}
          isLoading={isLoading}
        />

        {/* Pagination */}
        {savedCharts.length > 0 && (
          <div className="mt-8">
            <PaginationClassic />
          </div>
        )}

        {/* Edit Chart Modal */}
        {selectedChart && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
                Edit Chart: {selectedChart.chart_name}
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Chart editing functionality will be implemented here
              </p>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setSelectedChart(null);
                    setIsEditModalOpen(false);
                  }}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    // TODO: Implement save changes
                    setSelectedChart(null);
                    setIsEditModalOpen(false);
                  }}
                  className="px-4 py-2 bg-violet-500 text-white rounded-md hover:bg-violet-600 transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </SelectedItemsProvider>
  );
}
