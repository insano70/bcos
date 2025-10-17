'use client';

import type { MonitoringMetrics } from '@/lib/monitoring/types';

interface EndpointPerformanceTableProps {
  metrics: MonitoringMetrics;
}

export default function EndpointPerformanceTable({ metrics }: EndpointPerformanceTableProps) {
  const endpoints = Object.entries(metrics.performance.requests.byEndpoint)
    .map(([endpoint, count]) => ({
      endpoint,
      requests: count,
      errors: metrics.performance.errors.byEndpoint[endpoint] || 0,
      errorRate:
        count > 0 ? ((metrics.performance.errors.byEndpoint[endpoint] || 0) / count) * 100 : 0,
    }))
    .sort((a, b) => b.requests - a.requests)
    .slice(0, 10);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">
        Top Endpoints (Standard API)
      </h3>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                Endpoint
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                Requests
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                Errors
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                Error Rate
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {endpoints.map((ep) => (
              <tr key={ep.endpoint} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                <td className="px-4 py-3 text-sm font-mono text-gray-900 dark:text-gray-100">
                  {ep.endpoint}
                </td>
                <td className="px-4 py-3 text-sm text-right text-gray-600 dark:text-gray-400">
                  {ep.requests}
                </td>
                <td className="px-4 py-3 text-sm text-right text-gray-600 dark:text-gray-400">
                  {ep.errors}
                </td>
                <td className="px-4 py-3 text-sm text-right">
                  <span
                    className={`${ep.errorRate > 5 ? 'text-red-600' : ep.errorRate > 1 ? 'text-amber-600' : 'text-green-600'}`}
                  >
                    {ep.errorRate.toFixed(1)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
