'use client';

import { useState, useEffect } from 'react';
import { 
  historicalComparisonService, 
  COMPARISON_PERIODS, 
  ComparisonResult, 
  ComparisonPeriod 
} from '@/lib/services/historical-comparison';
import { AggAppMeasure, MeasureType, FrequencyType } from '@/lib/types/analytics';
import { LoadingSpinner, Skeleton } from '@/components/ui/loading-skeleton';
import AnalyticsChart from './analytics-chart';

interface HistoricalComparisonProps {
  measure: MeasureType;
  frequency: FrequencyType;
  practiceUid?: string;
  providerName?: string;
  className?: string;
}

export default function HistoricalComparisonWidget({
  measure,
  frequency,
  practiceUid,
  providerName,
  className = ''
}: HistoricalComparisonProps) {
  const [selectedComparison, setSelectedComparison] = useState<ComparisonPeriod>(COMPARISON_PERIODS[0]!);
  const [comparisonResult, setComparisonResult] = useState<ComparisonResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (measure && frequency) {
      performComparison();
    }
  }, [measure, frequency, practiceUid, providerName, selectedComparison]);

  const performComparison = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Get period dates
      const periods = selectedComparison.getPeriods(new Date());
      
      // Fetch current period data
      const currentParams = new URLSearchParams();
      currentParams.append('measure', measure);
      currentParams.append('frequency', frequency);
      currentParams.append('start_date', periods.current.start.toISOString().split('T')[0]!);
      currentParams.append('end_date', periods.current.end.toISOString().split('T')[0]!);
      currentParams.append('limit', '1000');
      
      if (practiceUid) currentParams.append('practice_uid', practiceUid);
      if (providerName) currentParams.append('provider_name', providerName);

      // Fetch comparison period data
      const comparisonParams = new URLSearchParams();
      comparisonParams.append('measure', measure);
      comparisonParams.append('frequency', frequency);
      comparisonParams.append('start_date', periods.comparison.start.toISOString().split('T')[0]!);
      comparisonParams.append('end_date', periods.comparison.end.toISOString().split('T')[0]!);
      comparisonParams.append('limit', '1000');
      
      if (practiceUid) comparisonParams.append('practice_uid', practiceUid);
      if (providerName) comparisonParams.append('provider_name', providerName);

      // Execute both requests in parallel
      const [currentResponse, comparisonResponse] = await Promise.all([
        fetch(`/api/admin/analytics/measures?${currentParams.toString()}`),
        fetch(`/api/admin/analytics/measures?${comparisonParams.toString()}`)
      ]);

      if (!currentResponse.ok || !comparisonResponse.ok) {
        throw new Error('Failed to fetch comparison data');
      }

      const [currentData, comparisonData] = await Promise.all([
        currentResponse.json(),
        comparisonResponse.json()
      ]);

      // Perform comparison analysis
      const result = historicalComparisonService.comparePeriodsAnalysis(
        currentData.data.measures,
        comparisonData.data.measures,
        selectedComparison.id
      );

      setComparisonResult(result);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to perform comparison';
      setError(errorMessage);
      console.error('Historical comparison error:', err);
    } finally {
      setIsLoading(false);
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

  const formatPercentage = (value: number) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
  };

  const getTrendIcon = (trend: 'up' | 'down' | 'flat') => {
    switch (trend) {
      case 'up': return '📈';
      case 'down': return '📉';
      case 'flat': return '➡️';
      default: return '📊';
    }
  };

  const getTrendColor = (trend: 'up' | 'down' | 'flat') => {
    switch (trend) {
      case 'up': return 'text-green-600 dark:text-green-400';
      case 'down': return 'text-red-600 dark:text-red-400';
      case 'flat': return 'text-gray-600 dark:text-gray-400';
      default: return 'text-gray-600 dark:text-gray-400';
    }
  };

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 flex items-center">
          <span className="mr-2">📊</span>
          Historical Comparison
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Compare current performance with historical periods
        </p>
      </div>

      {/* Comparison Type Selector */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Comparison Type
        </label>
        <select
          value={selectedComparison.id}
          onChange={(e) => {
            const comparison = COMPARISON_PERIODS.find(p => p.id === e.target.value);
            if (comparison) setSelectedComparison(comparison);
          }}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
        >
          {COMPARISON_PERIODS.map((period) => (
            <option key={period.id} value={period.id}>
              {period.label} - {period.description}
            </option>
          ))}
        </select>
      </div>

      {/* Content */}
      <div className="p-6">
        {isLoading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-32" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-32" />
              </div>
            </div>
            <Skeleton className="h-64 w-full" />
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <div className="text-red-500 mb-2">⚠️ Comparison Error</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">{error}</div>
            <button
              onClick={performComparison}
              className="mt-4 px-4 py-2 bg-violet-500 text-white rounded-md hover:bg-violet-600 transition-colors"
            >
              Retry Comparison
            </button>
          </div>
        ) : comparisonResult ? (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Current Period */}
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                <div className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">
                  Current Period
                </div>
                <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                  {formatCurrency(comparisonResult.current.total)}
                </div>
                <div className="text-xs text-blue-700 dark:text-blue-300">
                  {comparisonResult.current.period}
                </div>
              </div>

              {/* Comparison Period */}
              <div className="bg-gray-50 dark:bg-gray-900/20 rounded-lg p-4">
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                  Comparison Period
                </div>
                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {formatCurrency(comparisonResult.comparison.total)}
                </div>
                <div className="text-xs text-gray-700 dark:text-gray-300">
                  {comparisonResult.comparison.period}
                </div>
              </div>

              {/* Change Analysis */}
              <div className={`rounded-lg p-4 ${
                comparisonResult.analysis.trend === 'up' 
                  ? 'bg-green-50 dark:bg-green-900/20' 
                  : comparisonResult.analysis.trend === 'down'
                  ? 'bg-red-50 dark:bg-red-900/20'
                  : 'bg-gray-50 dark:bg-gray-900/20'
              }`}>
                <div className={`text-sm font-medium mb-1 ${
                  comparisonResult.analysis.trend === 'up' 
                    ? 'text-green-900 dark:text-green-100' 
                    : comparisonResult.analysis.trend === 'down'
                    ? 'text-red-900 dark:text-red-100'
                    : 'text-gray-900 dark:text-gray-100'
                }`}>
                  Change Analysis
                </div>
                <div className={`text-2xl font-bold flex items-center ${getTrendColor(comparisonResult.analysis.trend)}`}>
                  <span className="mr-2">{getTrendIcon(comparisonResult.analysis.trend)}</span>
                  {formatPercentage(comparisonResult.analysis.percentChange)}
                </div>
                <div className={`text-xs ${getTrendColor(comparisonResult.analysis.trend)}`}>
                  {formatCurrency(comparisonResult.analysis.absoluteChange)} change
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Significance: {comparisonResult.analysis.significance}
                </div>
              </div>
            </div>

            {/* Comparison Chart */}
            <div className="bg-gray-50 dark:bg-gray-900/20 rounded-lg p-4">
              <h4 className="text-md font-medium text-gray-900 dark:text-gray-100 mb-4">
                Period Comparison Chart
              </h4>
              
              {/* Generate comparison chart data and render */}
              <div className="bg-white dark:bg-gray-700 rounded p-4">
                <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                  📊 Comparison Chart Visualization
                  <br />
                  <span className="text-xs">
                    {comparisonResult.current.period} vs {comparisonResult.comparison.period}
                  </span>
                </div>
              </div>
            </div>

            {/* Insights */}
            <div className="bg-violet-50 dark:bg-violet-900/20 rounded-lg p-4">
              <h4 className="text-md font-medium text-violet-900 dark:text-violet-100 mb-3 flex items-center">
                <span className="mr-2">💡</span>
                Key Insights
              </h4>
              
              <div className="space-y-2 text-sm">
                <div className="flex items-center text-violet-800 dark:text-violet-200">
                  <span className="mr-2">•</span>
                  <span>
                    {comparisonResult.analysis.trend === 'up' ? 'Performance improved' : 
                     comparisonResult.analysis.trend === 'down' ? 'Performance declined' : 
                     'Performance remained stable'} compared to {selectedComparison.label.toLowerCase()}
                  </span>
                </div>
                
                <div className="flex items-center text-violet-800 dark:text-violet-200">
                  <span className="mr-2">•</span>
                  <span>
                    Change magnitude is {comparisonResult.analysis.significance} 
                    ({Math.abs(comparisonResult.analysis.percentChange).toFixed(1)}% change)
                  </span>
                </div>

                <div className="flex items-center text-violet-800 dark:text-violet-200">
                  <span className="mr-2">•</span>
                  <span>
                    Current period average: {formatCurrency(comparisonResult.current.average)} per record
                  </span>
                </div>

                <div className="flex items-center text-violet-800 dark:text-violet-200">
                  <span className="mr-2">•</span>
                  <span>
                    Comparison period average: {formatCurrency(comparisonResult.comparison.average)} per record
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <div className="text-4xl mb-4">📊</div>
            <p className="text-lg font-medium mb-2">Ready for Comparison</p>
            <p className="text-sm">
              Configure your chart settings and select a comparison type to begin analysis
            </p>
          </div>
        )}
      </div>
    </div>
  );

}
