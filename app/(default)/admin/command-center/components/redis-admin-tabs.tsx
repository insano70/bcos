'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Tabs } from '@/components/ui/tabs';
import AnalyticsCacheDashboard from './analytics-cache-dashboard';
import RedisCacheStats from './redis-cache-stats';
import RedisKeyBrowser from './redis-key-browser';
import RedisKeyInspector from './redis-key-inspector';
import RedisPurgeTools from './redis-purge-tools';

interface RedisAdminTabsProps {
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export default function RedisAdminTabs({
  autoRefresh = true,
  refreshInterval = 30000,
}: RedisAdminTabsProps) {
  const [activeTab, setActiveTab] = useState<'analytics' | 'overview' | 'keys' | 'admin'>(
    'analytics'
  );
  const [inspectingKey, setInspectingKey] = useState<string | null>(null);

  const tabs = [
    { id: 'analytics', label: 'Analytics Cache', icon: <span>⚡</span> },
    { id: 'overview', label: 'Redis Overview', icon: <span>📊</span> },
    { id: 'keys', label: 'Key Browser', icon: <span>🔍</span> },
    { id: 'admin', label: 'Admin Tools', icon: <span>⚙️</span> },
  ];

  return (
    <Card>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
          Redis Cache Management
        </h3>
      </div>

      <Tabs
        tabs={tabs}
        activeTab={activeTab}
        onChange={(tabId) => setActiveTab(tabId as typeof activeTab)}
        className="mb-6"
        ariaLabel="Redis cache management"
      />

      <div>
        {activeTab === 'analytics' && (
          <AnalyticsCacheDashboard autoRefresh={autoRefresh} refreshInterval={refreshInterval} />
        )}
        {activeTab === 'overview' && (
          <RedisCacheStats autoRefresh={autoRefresh} refreshInterval={refreshInterval} />
        )}
        {activeTab === 'keys' && <RedisKeyBrowser onInspectKey={setInspectingKey} />}
        {activeTab === 'admin' && <RedisPurgeTools />}
      </div>

      <RedisKeyInspector
        keyName={inspectingKey}
        isOpen={inspectingKey !== null}
        onClose={() => setInspectingKey(null)}
        onKeyDeleted={() => {
          setInspectingKey(null);
          if (activeTab === 'keys') {
            window.location.reload();
          }
        }}
      />
    </Card>
  );
}
