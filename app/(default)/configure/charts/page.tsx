'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChartDefinition } from '@/lib/types/analytics';
import ChartsTable, { ChartDefinitionListItem } from './charts-table';
import DeleteButton from '@/components/delete-button';
import DateSelect from '@/components/date-select';
import FilterButton from '@/components/dropdown-filter';
import PaginationClassic from '@/components/pagination-classic';
import { SelectedItemsProvider } from '@/app/selected-items-context';

export default function ChartBuilderPage() {
  const router = useRouter();
  const [savedCharts, setSavedCharts] = useState<ChartDefinitionListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true); // Start with loading true
  const [error, setError] = useState<string | null>(null);

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
      
    } catch (error) {
      console.error('❌ Failed to save chart:', error);
      // TODO: Show toast notification for save error
    } finally {
      setIsLoading(false);
    }
  };


  const loadCharts = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('🔍 Loading chart definitions from API...');
      
      const response = await fetch('/api/admin/analytics/charts');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      console.log('📊 Raw API Response:', result);
      
      if (!result.success) {
        throw new Error(result.message || 'API returned unsuccessful response');
      }
      
      const charts = result.data.charts || [];
      console.log('📋 Charts data structure:', {
        count: charts.length,
        sampleChart: charts[0]
      });
      
      // Transform joined API data to flat ChartDefinitionListItem structure
      const transformedCharts: ChartDefinitionListItem[] = charts.map((item: any, index: number) => {
        // Handle joined data structure from API (leftJoin returns nested objects)
        const chartDef = item.chart_definitions || item;
        const category = item.chart_categories;
        const user = item.users;
        
        console.log(`🔄 Transforming chart ${index}:`, {
          original: item,
          chartDef,
          category,
          user
        });
        
        return {
          chart_definition_id: chartDef.chart_definition_id || `temp-${index}`,
          chart_name: chartDef.chart_name || 'Unnamed Chart',
          chart_description: chartDef.chart_description || undefined,
          chart_type: chartDef.chart_type || 'bar',
          chart_category_id: chartDef.chart_category_id || undefined,
          category_name: category?.category_name || undefined,
          created_by: chartDef.created_by || 'unknown',
          creator_name: user?.first_name || undefined,
          creator_last_name: user?.last_name || undefined,
          created_at: chartDef.created_at || new Date().toISOString(),
          updated_at: chartDef.updated_at || new Date().toISOString(),
          is_active: chartDef.is_active ?? true,
        };
      });
      
      console.log('✅ Transformed charts:', {
        count: transformedCharts.length,
        sampleTransformed: transformedCharts[0]
      });
      
      setSavedCharts(transformedCharts);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load charts';
      console.error('❌ Failed to load charts:', error);
      setError(errorMessage);
      setSavedCharts([]); // Ensure we always have an array
    } finally {
      setIsLoading(false);
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
    router.push(`/configure/charts/${chart.chart_definition_id}/edit`);
  };

  const handleCreateChart = () => {
    router.push('/configure/charts/new');
  };

  // Load charts on component mount
  React.useEffect(() => {
    loadCharts();
  }, []);


  // Error state
  if (error) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6">
          <div className="flex items-center">
            <svg
              className="w-6 h-6 text-red-600 dark:text-red-400 mr-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
            <div>
              <h3 className="text-red-800 dark:text-red-200 font-medium">Error loading chart definitions</h3>
              <p className="text-red-600 dark:text-red-400 text-sm mt-1">
                {error}
              </p>
              <button
                type="button"
                onClick={() => loadCharts()}
                className="mt-3 btn-sm bg-red-600 hover:bg-red-700 text-white"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
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
              Charts
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
              onClick={handleCreateChart}
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

      </div>
    </SelectedItemsProvider>
  );
}
