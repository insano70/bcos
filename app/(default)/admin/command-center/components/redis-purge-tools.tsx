'use client';

import { useState } from 'react';
import { apiClient } from '@/lib/api/client';
import { useToast } from './toast';
import ConfirmModal from './confirm-modal';

export default function RedisPurgeTools() {
  const [purgePattern, setPurgePattern] = useState('');
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const { showToast } = useToast();

  const handlePreview = async () => {
    if (!purgePattern.trim()) {
      showToast({ type: 'error', message: 'Pattern is required' });
      return;
    }

    setLoading(true);
    try {
      const response = await apiClient.post('/api/admin/redis/purge', {
        pattern: purgePattern,
        preview: true,
      }) as { keysDeleted: number };
      setPreviewCount(response.keysDeleted || 0);
      showToast({ type: 'info', message: `${response.keysDeleted || 0} keys match pattern` });
    } catch {
      showToast({ type: 'error', message: 'Preview failed' });
    } finally {
      setLoading(false);
    }
  };

  const handlePurge = async () => {
    setLoading(true);
    try {
      const response = await apiClient.post('/api/admin/redis/purge', {
        pattern: purgePattern,
        confirm: true,
      }) as { keysDeleted: number };
      showToast({ type: 'success', message: `${response.keysDeleted} keys deleted` });
      setPurgePattern('');
      setPreviewCount(null);
      setShowConfirm(false);
    } catch {
      showToast({ type: 'error', message: 'Purge failed' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
        <div className="flex items-center gap-2 text-red-800 dark:text-red-200 mb-2">
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <span className="font-semibold">Dangerous Operations</span>
        </div>
        <p className="text-sm text-red-700 dark:text-red-300">
          These operations cannot be undone. Always preview before executing.
        </p>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Purge Cache by Pattern</h4>
        <div className="space-y-3">
          <input
            type="text"
            value={purgePattern}
            onChange={(e) => setPurgePattern(e.target.value)}
            placeholder="e.g., chart:data:*"
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
          />
          <div className="flex gap-2">
            <button
              onClick={handlePreview}
              disabled={loading || !purgePattern.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              Preview
            </button>
            <button
              onClick={() => setShowConfirm(true)}
              disabled={loading || !purgePattern.trim() || previewCount === null}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              Purge {previewCount !== null && `(${previewCount} keys)`}
            </button>
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={showConfirm}
        title="Confirm Cache Purge"
        message={`Are you sure you want to delete ${previewCount} keys matching pattern: ${purgePattern}?`}
        confirmText="Purge Keys"
        confirmVariant="danger"
        requireReason={true}
        onConfirm={handlePurge}
        onCancel={() => setShowConfirm(false)}
      />
    </div>
  );
}

