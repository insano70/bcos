'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { apiClient } from '@/lib/api/client';
import type { RedisKeyDetails } from '@/lib/monitoring/types';
import { useToast } from './toast';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';

interface RedisKeyInspectorProps {
  keyName: string | null;
  isOpen: boolean;
  onClose: () => void;
  onKeyDeleted?: () => void;
}

export default function RedisKeyInspector({
  keyName,
  isOpen,
  onClose,
  onKeyDeleted,
}: RedisKeyInspectorProps) {
  const [details, setDetails] = useState<RedisKeyDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
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
  }, [isOpen, keyName, showToast]);

  const handleDeleteClick = () => {
    if (!keyName) return;
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!keyName) return;

    setDeleteModalOpen(false);

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
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Redis Key Inspector
            </h2>
          </div>

          <div className="px-6 py-4 max-h-[70vh] overflow-y-auto">
            {loading ? (
              <div className="text-center py-8">
                <Spinner size="md" className="mx-auto" />
              </div>
            ) : details ? (
              <div className="space-y-4">
                <div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">Key</div>
                  <div className="text-sm font-mono text-gray-900 dark:text-gray-100 break-all">
                    {details.key}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">Type</div>
                    <div className="text-sm font-medium">{details.type}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">TTL</div>
                    <div className="text-sm font-medium">
                      {details.ttl === -1 ? 'No expiry' : `${details.ttl}s`}
                    </div>
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
            <Button variant="danger" onClick={handleDeleteClick}>
              Delete Key
            </Button>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} size="sm">
        <div className="p-5 space-y-4">
          <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Delete Redis Key
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Are you sure you want to delete this key? This action cannot be undone.
          </p>
          <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700">
            <p className="text-xs font-mono text-gray-700 dark:text-gray-300 break-all">
              {keyName}
            </p>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="secondary" onClick={() => setDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDeleteConfirm}>
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
