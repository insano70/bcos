'use client';

import { useEffect, useState } from 'react';
import { getCssVariable } from '@/components/utils/utils';
import { apiClient } from '@/lib/api/client';
import BarChart01 from './bar-chart-01';
import ResponsiveChartContainer from './responsive-chart-container';

interface ChargesPaymentsData {
  practice: string;
  practice_primary: string;
  provider_name: string;
  measure: string;
  frequency: string;
  date_index: string;
  display_date: string;
  measure_value: number;
  measure_type: string;
}

interface ChargesPaymentsChartProps {
  practiceUid?: string;
  width?: number;
  height?: number;
  responsive?: boolean; // Enable responsive behavior
  minHeight?: number; // Minimum height for responsive mode
  maxHeight?: number; // Maximum height for responsive mode
  aspectRatio?: number; // Fixed aspect ratio for responsive mode
}

export default function ChargesPaymentsChart({
  practiceUid = '114',
  width = 595,
  height = 248,
  responsive = false,
  minHeight = 200,
  maxHeight = 600,
  aspectRatio,
}: ChargesPaymentsChartProps) {
  const [chartData, setChartData] = useState<{
    labels: string[];
    datasets: Array<{
      label: string;
      data: number[];
      backgroundColor?: string;
      borderColor?: string;
      borderWidth?: number;
      [key: string]: unknown;
    }>;
  }>({
    labels: [],
    datasets: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchChargesPaymentsData();
  }, [practiceUid]);

  const fetchChargesPaymentsData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      console.log('🔍 Fetching Charges & Payments data for practice:', practiceUid);

      const result = await apiClient.get<{
        data: ChargesPaymentsData[];
      }>(`/api/admin/analytics/charges-payments?practice_uid=${practiceUid}`);
      const data: ChargesPaymentsData[] = result.data;

      console.log('✅ Received Charges & Payments data:', {
        rowCount: data.length,
        sampleData: data.slice(0, 2),
      });

      // Use simplified pre-aggregated data structure
      const uniqueDates = Array.from(new Set(data.map((row) => row.display_date))).sort((a, b) => {
        const dateA = data.find((row) => row.display_date === a)?.date_index;
        const dateB = data.find((row) => row.display_date === b)?.date_index;
        return new Date(dateA || 0).getTime() - new Date(dateB || 0).getTime();
      });

      // Separate charges and payments data - values are already numeric
      const chargesData = uniqueDates.map((displayDate) => {
        const chargesRow = data.find(
          (row) => row.display_date === displayDate && row.measure === 'Charges'
        );
        return chargesRow ? chargesRow.measure_value : 0;
      });

      const paymentsData = uniqueDates.map((displayDate) => {
        const paymentsRow = data.find(
          (row) => row.display_date === displayDate && row.measure === 'Payments'
        );
        return paymentsRow ? paymentsRow.measure_value : 0;
      });

      const transformedData = {
        labels: uniqueDates,
        datasets: [
          // Charges (Sky blue bars like "Direct")
          {
            label: 'Charges',
            data: chargesData,
            backgroundColor: getCssVariable('--color-sky-500'),
            hoverBackgroundColor: getCssVariable('--color-sky-600'),
            barPercentage: 0.7,
            categoryPercentage: 0.7,
            borderRadius: 4,
          },
          // Payments (Violet bars like "Indirect")
          {
            label: 'Payments',
            data: paymentsData,
            backgroundColor: getCssVariable('--color-violet-500'),
            hoverBackgroundColor: getCssVariable('--color-violet-600'),
            barPercentage: 0.7,
            categoryPercentage: 0.7,
            borderRadius: 4,
          },
        ],
      };

      console.log('📊 Chart data transformed:', {
        labels: transformedData.labels,
        chargesDataPoints: chargesData.length,
        paymentsDataPoints: paymentsData.length,
        chargesValues: chargesData,
        paymentsValues: paymentsData,
        sampleChargesValue: chargesData[0],
        samplePaymentsValue: paymentsData[0],
      });

      setChartData(transformedData);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to fetch charges and payments data';
      setError(errorMessage);
      console.error('Charges & Payments chart error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col col-span-full sm:col-span-6 bg-white dark:bg-gray-800 shadow-sm rounded-xl">
        <header className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/60">
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">Charges VS Payments</h2>
        </header>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500"></div>
          <span className="ml-2 text-gray-600 dark:text-gray-400">Loading chart data...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col col-span-full sm:col-span-6 bg-white dark:bg-gray-800 shadow-sm rounded-xl">
        <header className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/60">
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">Charges VS Payments</h2>
        </header>
        <div className="flex flex-col items-center justify-center h-64">
          <div className="text-red-500 mb-2">⚠️ Chart Error</div>
          <div className="text-sm text-gray-600 dark:text-gray-400 text-center px-4">{error}</div>
          <button type="button" onClick={fetchChargesPaymentsData}
            className="mt-3 px-4 py-2 bg-violet-500 text-white rounded-md text-sm hover:bg-violet-600 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col col-span-full sm:col-span-6 bg-white dark:bg-gray-800 shadow-sm rounded-xl">
      <header className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/60">
        <h2 className="font-semibold text-gray-800 dark:text-gray-100">Charges VS Payments</h2>
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Practice {practiceUid} • Monthly Data
        </div>
      </header>
      {/* Chart built with Chart.js 3 */}
      {/* Chart with responsive or fixed sizing */}
      <div className={responsive ? 'flex-1 w-full' : ''}>
        {responsive ? (
          <ResponsiveChartContainer
            minHeight={minHeight}
            maxHeight={maxHeight}
            {...(aspectRatio && { aspectRatio })}
            className="w-full h-full"
          >
            <BarChart01 data={chartData} width={width} height={height} />
          </ResponsiveChartContainer>
        ) : (
          <BarChart01 data={chartData} width={width} height={height} />
        )}
      </div>
    </div>
  );
}
