'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api/client';
import type { RedisKeysResponse, RedisKeyInfo } from '@/lib/monitoring/types';

interface RedisKeyBrowserProps {
  onInspectKey?: (key: string) => void;
}

export default function RedisKeyBrowser({ onInspectKey }: RedisKeyBrowserProps) {
  const [data, setData] = useState<RedisKeysResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [pattern, setPattern] = useState('*');
  const [page, setPage] = useState(1);

  const fetchKeys = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get(`/api/admin/redis/keys?pattern=${pattern}&page=${page}&limit=50`);
      setData(response as RedisKeysResponse);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, [pattern, page]);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const formatTTL = (ttl: number): string => {
    if (ttl === -1) return 'No expiry';
    if (ttl === -2) return 'Expired';
    const minutes = Math.floor(ttl / 60);
    const seconds = ttl % 60;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          placeholder="Search pattern (e.g., chart:*)"
          className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
        />
        <button
          onClick={() => { setPage(1); fetchKeys(); }}
          className="px-4 py-2 bg-violet-500 text-white rounded-lg hover:bg-violet-600"
        >
          Search
        </button>
      </div>

      {loading ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500 mx-auto"></div>
        </div>
      ) : data && data.keys.length > 0 ? (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Key</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">TTL</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Size</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {data.keys.map((key) => (
                  <tr key={key.key} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3 text-sm font-mono text-gray-900 dark:text-gray-100 max-w-md truncate">{key.key}</td>
                    <td className="px-4 py-3 text-sm"><span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 rounded text-xs">{key.type}</span></td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{formatTTL(key.ttl)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{formatBytes(key.size)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => onInspectKey?.(key.key)}
                        className="text-sm text-violet-600 dark:text-violet-400 hover:text-violet-700"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {data.totalCount} keys found
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 border rounded disabled:opacity-50"
              >
                Previous
              </button>
              <span className="px-3 py-1">Page {page}</span>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={data.keys.length < 50}
                className="px-3 py-1 border rounded disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">No keys found</div>
      )}
    </div>
  );
}

