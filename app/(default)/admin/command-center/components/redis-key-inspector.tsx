'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api/client';
import type { RedisKeyDetails } from '@/lib/monitoring/types';
import { useToast } from './toast';

interface RedisKeyInspectorProps {
  keyName: string | null;
  isOpen: boolean;
  onClose: () => void;
  onKeyDeleted?: () => void;
}

export default function RedisKeyInspector({ keyName, isOpen, onClose, onKeyDeleted }: RedisKeyInspectorProps) {
  const [details, setDetails] = useState<RedisKeyDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (isOpen && keyName) {
      setLoading(true);
      apiClient
        .get(`/api/admin/redis/inspect?key=${encodeURIComponent(keyName)}`)
        .then((response) => setDetails(response as RedisKeyDetails))
        .catch(() => {
          showToast({ type: 'error', message: 'Failed to load key details' });
          setDetails(null);
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen, keyName]);

  const handleDelete = async () => {
    if (!keyName || !window.confirm(`Delete key: ${keyName}?`)) return;
    
    try {
      await apiClient.post('/api/admin/redis/purge', {
        pattern: keyName,
        confirm: true,
      });
      showToast({ type: 'success', message: 'Key deleted successfully' });
      if (onKeyDeleted) onKeyDeleted();
      onClose();
    } catch {
      showToast({ type: 'error', message: 'Failed to delete key' });
    }
  };

  const formatValue = (value: unknown, type: string): string => {
    if (value === null || value === undefined) return 'null';
    if (type === 'string') return String(value);
    return JSON.stringify(value, null, 2);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose}></div>
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-4xl w-full">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Redis Key Inspector</h2>
          </div>

          <div className="px-6 py-4 max-h-[70vh] overflow-y-auto">
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500 mx-auto"></div>
              </div>
            ) : details ? (
              <div className="space-y-4">
                <div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">Key</div>
                  <div className="text-sm font-mono text-gray-900 dark:text-gray-100 break-all">{details.key}</div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">Type</div>
                    <div className="text-sm font-medium">{details.type}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">TTL</div>
                    <div className="text-sm font-medium">{details.ttl === -1 ? 'No expiry' : `${details.ttl}s`}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">Size</div>
                    <div className="text-sm font-medium">{details.size} bytes</div>
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">Value</div>
                  <pre className="p-4 bg-gray-50 dark:bg-gray-900 rounded text-xs overflow-x-auto">
                    {formatValue(details.value, details.type)}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">Key not found</div>
            )}
          </div>

          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
            <button onClick={handleDelete} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">
              Delete Key
            </button>
            <button onClick={onClose} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

