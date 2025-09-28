'use client';

import { useState, useEffect } from 'react';
import { historicalComparisonService } from '@/lib/services/historical-comparison';
import { AggAppMeasure, MeasureType, FrequencyType } from '@/lib/types/analytics';
import { LoadingSpinner, CardSkeleton } from '@/components/ui/loading-skeleton';
import { apiClient } from '@/lib/api/client';

interface TrendAnalysisProps {
  measure: MeasureType;
  frequency: FrequencyType;
  practiceUid?: string;
  providerName?: string;
  periods?: number;
  className?: string;
}

export default function TrendAnalysisDashboard({
  measure,
  frequency,
  practiceUid,
  providerName,
  periods = 12,
  className = ''
}: TrendAnalysisProps) {
  const [trendData, setTrendData] = useState<any>(null);
  const [rawData, setRawData] = useState<AggAppMeasure[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (measure && frequency) {
      analyzeTrend();
    }
  }, [measure, frequency, practiceUid, providerName, periods]);

  const analyzeTrend = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Calculate date range for trend analysis
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - periods);

      // Fetch historical data
      const params = new URLSearchParams();
      params.append('measure', measure);
      params.append('frequency', frequency);
      params.append('start_date', startDate.toISOString().split('T')[0]!);
      params.append('end_date', endDate.toISOString().split('T')[0]!);
      params.append('limit', '1000');
      
      if (practiceUid) params.append('practice_uid', practiceUid);
      if (providerName) params.append('provider_name', providerName);

      const data = await apiClient.get<any>(`/api/admin/analytics/measures?${params.toString()}`);
      const measures = data.measures;

      // Perform trend analysis
      const analysis = historicalComparisonService.analyzeTrend(measures, periods);
      
      setTrendData(analysis);
      setRawData(measures);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to analyze trend';
      setError(errorMessage);
      console.error('Trend analysis error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const getTrendDirectionLabel = (direction: string) => {
    switch (direction) {
      case 'increasing': return 'Upward Trend';
      case 'decreasing': return 'Downward Trend';
      case 'stable': return 'Stable Trend';
      case 'volatile': return 'Volatile Pattern';
      default: return 'Unknown Trend';
    }
  };

  const getTrendDirectionColor = (direction: string) => {
    switch (direction) {
      case 'increasing': return 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20';
      case 'decreasing': return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20';
      case 'stable': return 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20';
      case 'volatile': return 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20';
      default: return 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20';
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

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 flex items-center">
          <span className="mr-2">📈</span>
          Trend Analysis
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          {periods}-period trend analysis for {measure}
        </p>
      </div>

      {/* Content */}
      <div className="p-6">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <div className="text-red-500 mb-2">⚠️ Analysis Error</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">{error}</div>
            <button
              onClick={analyzeTrend}
              className="mt-4 px-4 py-2 bg-violet-500 text-white rounded-md hover:bg-violet-600 transition-colors"
            >
              Retry Analysis
            </button>
          </div>
        ) : trendData ? (
          <div className="space-y-6">
            {/* Trend Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Trend Direction */}
              <div className={`rounded-lg p-4 ${getTrendDirectionColor(trendData.trendDirection)}`}>
                <div className="text-sm font-medium mb-1">
                  Trend Direction
                </div>
                <div className="text-xl font-bold">
                  {getTrendDirectionLabel(trendData.trendDirection)}
                </div>
                <div className="text-xs mt-1">
                  Strength: {(trendData.trendStrength * 100).toFixed(1)}%
                </div>
              </div>

              {/* Volatility */}
              <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4">
                <div className="text-sm font-medium text-purple-900 dark:text-purple-100 mb-1">
                  Volatility
                </div>
                <div className="text-xl font-bold text-purple-900 dark:text-purple-100">
                  {(trendData.volatility * 100).toFixed(1)}%
                </div>
                <div className="text-xs text-purple-700 dark:text-purple-300">
                  {trendData.volatility < 0.1 ? 'Low' : trendData.volatility < 0.3 ? 'Medium' : 'High'} variation
                </div>
              </div>

              {/* Seasonality */}
              <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-4">
                <div className="text-sm font-medium text-indigo-900 dark:text-indigo-100 mb-1">
                  Seasonality
                </div>
                <div className="text-xl font-bold text-indigo-900 dark:text-indigo-100">
                  {trendData.seasonality ? 'Detected' : 'None'}
                </div>
                <div className="text-xs text-indigo-700 dark:text-indigo-300">
                  {trendData.seasonality ? 'Repeating patterns found' : 'No clear patterns'}
                </div>
              </div>

              {/* Forecast */}
              {trendData.forecast && (
                <div className="bg-teal-50 dark:bg-teal-900/20 rounded-lg p-4">
                  <div className="text-sm font-medium text-teal-900 dark:text-teal-100 mb-1">
                    Next Period Forecast
                  </div>
                  <div className="text-xl font-bold text-teal-900 dark:text-teal-100">
                    {formatCurrency(trendData.forecast)}
                  </div>
                  <div className="text-xs text-teal-700 dark:text-teal-300">
                    Based on linear trend
                  </div>
                </div>
              )}
            </div>

            {/* Data Summary */}
            <div className="bg-gray-50 dark:bg-gray-900/20 rounded-lg p-4">
              <h4 className="text-md font-medium text-gray-900 dark:text-gray-100 mb-3">
                Data Summary
              </h4>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <div className="text-gray-500 dark:text-gray-400">Total Records</div>
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    {rawData.length}
                  </div>
                </div>
                
                <div>
                  <div className="text-gray-500 dark:text-gray-400">Period Range</div>
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    {periods} {frequency.toLowerCase()}
                  </div>
                </div>
                
                <div>
                  <div className="text-gray-500 dark:text-gray-400">Total Value</div>
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    {formatCurrency(rawData.reduce((sum, record) => {
                      const value = typeof record.measure_value === 'string' 
                        ? parseFloat(record.measure_value) 
                        : record.measure_value;
                      return sum + (isNaN(value) ? 0 : value);
                    }, 0))}
                  </div>
                </div>
                
                <div>
                  <div className="text-gray-500 dark:text-gray-400">Average</div>
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    {formatCurrency(rawData.length > 0 ? rawData.reduce((sum, record) => {
                      const value = typeof record.measure_value === 'string' 
                        ? parseFloat(record.measure_value) 
                        : record.measure_value;
                      return sum + (isNaN(value) ? 0 : value);
                    }, 0) / rawData.length : 0)}
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-between items-center">
              <button
                onClick={analyzeTrend}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Refresh Analysis
              </button>
              
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Last updated: {new Date().toLocaleTimeString()}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <div className="text-4xl mb-4">📈</div>
            <p className="text-lg font-medium mb-2">Ready for Analysis</p>
            <p className="text-sm">
              Configure your chart settings to begin trend analysis
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
