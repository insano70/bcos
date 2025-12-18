'use client';

import { useState } from 'react';
import { apiClient } from '@/lib/api/client';
import ConfirmModal from './confirm-modal';
import { useToast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { InlineAlert } from '@/components/ui/inline-alert';

export default function RedisPurgeTools() {
  const [purgePattern, setPurgePattern] = useState('');
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showFlushAllConfirm, setShowFlushAllConfirm] = useState(false);
  const { showToast } = useToast();

  const handlePreview = async () => {
    if (!purgePattern.trim()) {
      showToast({ type: 'error', message: 'Pattern is required' });
      return;
    }

    setLoading(true);
    try {
      const response = (await apiClient.post('/api/admin/redis/purge', {
        pattern: purgePattern,
        preview: true,
      })) as { keysDeleted: number };
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
      const response = (await apiClient.post('/api/admin/redis/purge', {
        pattern: purgePattern,
        confirm: true,
      })) as { keysDeleted: number };
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

  const handleFlushAll = async () => {
    setLoading(true);
    try {
      await apiClient.post('/api/admin/redis/flushall', { confirm: true });
      showToast({ type: 'success', message: 'All Redis keys deleted' });
      setShowFlushAllConfirm(false);
    } catch {
      showToast({ type: 'error', message: 'FLUSHALL failed' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <InlineAlert type="warning" title="Dangerous Operations">
        These operations cannot be undone. Always preview before executing.
      </InlineAlert>

      <div>
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Flush All Keys
        </h4>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
          Nuclear option: Delete ALL keys from Redis instantly. Use during development when you need a clean slate.
        </p>
        <Button
          variant="danger"
          onClick={() => setShowFlushAllConfirm(true)}
          disabled={loading}
        >
          FLUSH ALL KEYS
        </Button>
      </div>

      <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Purge Cache by Pattern
        </h4>
        <div className="space-y-3">
          <input
            type="text"
            value={purgePattern}
            onChange={(e) => setPurgePattern(e.target.value)}
            placeholder="e.g., cache:*, idx:*, session:*"
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
          />
          <div className="flex gap-2">
            <Button
              variant="blue"
              onClick={handlePreview}
              disabled={loading || !purgePattern.trim()}
            >
              Preview
            </Button>
            <Button
              variant="danger"
              onClick={() => setShowConfirm(true)}
              disabled={loading || !purgePattern.trim() || previewCount === null}
            >
              Purge {previewCount !== null && `(${previewCount} keys)`}
            </Button>
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

      <ConfirmModal
        isOpen={showFlushAllConfirm}
        title="FLUSH ALL REDIS KEYS"
        message="This will delete EVERY key in Redis: sessions, cache, rate limits, everything. This cannot be undone. Are you absolutely sure?"
        confirmText="FLUSH ALL"
        confirmVariant="danger"
        requireReason={true}
        onConfirm={handleFlushAll}
        onCancel={() => setShowFlushAllConfirm(false)}
      />
    </div>
  );
}
