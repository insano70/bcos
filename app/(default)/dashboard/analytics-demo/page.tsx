'use client';

import { useState } from 'react';
import AnalyticsChart, { AnalyticsChartPresets } from '@/components/charts/analytics-chart';
import ChargesPaymentsChart from '@/components/charts/charges-payments-chart';
import { MeasureType, FrequencyType } from '@/lib/types/analytics';

export default function AnalyticsDemoPage() {
  const [selectedPreset, setSelectedPreset] = useState<string>('custom');
  const [chartConfig, setChartConfig] = useState({
    chartType: 'line' as 'line' | 'bar' | 'doughnut',
    measure: 'Charges by Practice' as MeasureType,
    frequency: 'Monthly' as FrequencyType,
    groupBy: 'practice_uid',
    startDate: '' as string | undefined,
    endDate: '' as string | undefined,
    practiceUid: '' as string | undefined,
    providerUid: '' as string | undefined
  });

  // Set default date range (last 12 months)
  const getDefaultEndDate = () => new Date().toISOString().split('T')[0];
  const getDefaultStartDate = () => {
    const date = new Date();
    date.setMonth(date.getMonth() - 12);
    return date.toISOString().split('T')[0];
  };
  
  const defaultEndDate = getDefaultEndDate();
  const defaultStartDateStr = getDefaultStartDate();

  const handleConfigChange = (key: string, value: any) => {
    setChartConfig(prev => ({ ...prev, [key]: value }));
  };

  const handlePresetChange = (preset: string) => {
    setSelectedPreset(preset);
    
    // Update config based on preset
    switch (preset) {
      case 'practice-revenue':
        setChartConfig({
          chartType: 'line',
          measure: 'Charges by Provider',
          frequency: 'Monthly',
          groupBy: 'practice_uid',
          startDate: getDefaultStartDate(),
          endDate: getDefaultEndDate(),
          practiceUid: '',
          providerUid: ''
        });
        break;
      case 'provider-performance':
        setChartConfig({
          chartType: 'bar',
          measure: 'Charges by Provider',
          frequency: 'Monthly',
          groupBy: 'provider_uid',
          startDate: getDefaultStartDate(),
          endDate: getDefaultEndDate(),
          practiceUid: '',
          providerUid: ''
        });
        break;
      case 'revenue-distribution':
        setChartConfig({
          chartType: 'doughnut',
          measure: 'Charges by Provider',
          frequency: 'Monthly',
          groupBy: 'practice_uid',
          startDate: getDefaultStartDate(),
          endDate: getDefaultEndDate(),
          practiceUid: '',
          providerUid: ''
        });
        break;
    }
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-9xl mx-auto">
      {/* Page Header */}
      <div className="sm:flex sm:justify-between sm:items-center mb-8">
        <div className="mb-4 sm:mb-0">
          <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">
            Analytics Dashboard Demo
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Interactive charts powered by the ih.gr_app_measures analytics database
          </p>
        </div>
      </div>

      {/* Configuration Panel */}
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">
          Chart Configuration
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* Preset Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Chart Preset
            </label>
            <select
              value={selectedPreset}
              onChange={(e) => handlePresetChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value="custom">Custom Configuration</option>
              <option value="practice-revenue">Practice Revenue Trend</option>
              <option value="provider-performance">Provider Performance</option>
              <option value="revenue-distribution">Revenue Distribution</option>
            </select>
          </div>

          {/* Chart Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Chart Type
            </label>
            <select
              value={chartConfig.chartType}
              onChange={(e) => handleConfigChange('chartType', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value="line">Line Chart</option>
              <option value="bar">Bar Chart</option>
              <option value="doughnut">Doughnut Chart</option>
            </select>
          </div>

          {/* Measure */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Measure
            </label>
            <select
              value={chartConfig.measure}
              onChange={(e) => handleConfigChange('measure', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value="Charges by Practice">Charges by Practice</option>
              <option value="Payments by Practice">Payments by Practice</option>
              <option value="Charges by Provider">Charges by Provider</option>
              <option value="Payments by Provider">Payments by Provider</option>
            </select>
          </div>

          {/* Frequency */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Frequency
            </label>
            <select
              value={chartConfig.frequency}
              onChange={(e) => handleConfigChange('frequency', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value="Monthly">Monthly</option>
              <option value="Weekly">Weekly</option>
              <option value="Quarterly">Quarterly</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Start Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Start Date
            </label>
            <input
              type="date"
              value={chartConfig.startDate || getDefaultStartDate()}
              onChange={(e) => handleConfigChange('startDate', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>

          {/* End Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              End Date
            </label>
            <input
              type="date"
              value={chartConfig.endDate || getDefaultEndDate()}
              onChange={(e) => handleConfigChange('endDate', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>

          {/* Practice UID */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Practice UID (Optional)
            </label>
            <input
              type="text"
              value={chartConfig.practiceUid}
              onChange={(e) => handleConfigChange('practiceUid', e.target.value)}
              placeholder="Filter by practice"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>

          {/* Provider UID */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Provider UID (Optional)
            </label>
            <input
              type="text"
              value={chartConfig.providerUid}
              onChange={(e) => handleConfigChange('providerUid', e.target.value)}
              placeholder="Filter by provider"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>
        </div>
      </div>

      {/* Charges vs Payments Chart (Step-by-step implementation) */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">
          Step-by-Step Chart: Charges vs Payments
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChargesPaymentsChart practiceUid="114" />
        </div>
      </div>

      {/* Chart Display */}
      <div className="grid grid-cols-1 gap-6">
        <AnalyticsChart
          chartType={chartConfig.chartType}
          measure={chartConfig.measure}
          frequency={chartConfig.frequency}
          practiceUid={chartConfig.practiceUid || undefined}
          providerUid={chartConfig.providerUid || undefined}
          startDate={chartConfig.startDate || getDefaultStartDate()}
          endDate={chartConfig.endDate || getDefaultEndDate()}
          groupBy={chartConfig.groupBy}
          width={800}
          height={400}
          title={`${chartConfig.measure} - ${chartConfig.frequency}`}
        />
      </div>

      {/* Preset Examples */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">
          Chart Examples
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Practice Revenue Trend */}
          <AnalyticsChartPresets.PracticeRevenueTrend
            width={400}
            height={250}
            startDate={getDefaultStartDate()}
            endDate={getDefaultEndDate()}
          />

          {/* Provider Performance */}
          <AnalyticsChartPresets.ProviderPerformance
            width={400}
            height={250}
            startDate={getDefaultStartDate()}
            endDate={getDefaultEndDate()}
          />
        </div>
      </div>

      {/* Documentation */}
      <div className="mt-8 bg-gray-50 dark:bg-gray-800/50 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">
          About This Demo
        </h2>
        <div className="text-gray-600 dark:text-gray-400 space-y-2">
          <p>
            This analytics dashboard demonstrates the integration with the external analytics database 
            containing the <code className="bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded">ih.gr_app_measures</code> table.
          </p>
          <p>
            <strong>Features:</strong>
          </p>
          <ul className="list-disc list-inside ml-4 space-y-1">
            <li>Secure, parameterized queries with field whitelisting</li>
            <li>Real-time data fetching from analytics database</li>
            <li>Multiple chart types (line, bar, doughnut)</li>
            <li>Configurable filters and grouping options</li>
            <li>Performance metrics and caching indicators</li>
            <li>Responsive design with dark mode support</li>
          </ul>
          <p className="mt-4">
            <strong>Data Source:</strong> The charts display practice and provider performance metrics 
            including charges and payments data across different time frequencies.
          </p>
        </div>
      </div>
    </div>
  );
}
