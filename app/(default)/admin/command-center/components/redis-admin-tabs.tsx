'use client';

import { useState } from 'react';
import RedisCacheStats from './redis-cache-stats';
import RedisKeyBrowser from './redis-key-browser';
import RedisPurgeTools from './redis-purge-tools';
import RedisKeyInspector from './redis-key-inspector';
import AnalyticsCacheDashboard from './analytics-cache-dashboard';

interface RedisAdminTabsProps {
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export default function RedisAdminTabs({ autoRefresh = true, refreshInterval = 30000 }: RedisAdminTabsProps) {
  const [activeTab, setActiveTab] = useState<'analytics' | 'overview' | 'keys' | 'admin'>('analytics');
  const [inspectingKey, setInspectingKey] = useState<string | null>(null);

  const tabs = [
    { id: 'analytics' as const, label: 'Analytics Cache', icon: '⚡' },
    { id: 'overview' as const, label: 'Redis Overview', icon: '📊' },
    { id: 'keys' as const, label: 'Key Browser', icon: '🔍' },
    { id: 'admin' as const, label: 'Admin Tools', icon: '⚙️' },
  ];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Redis Cache Management</h3>
      </div>

      <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
        <nav className="flex gap-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-violet-500 text-violet-600 dark:text-violet-400 font-medium'
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div>
        {activeTab === 'analytics' && (
          <AnalyticsCacheDashboard autoRefresh={autoRefresh} refreshInterval={refreshInterval} />
        )}
        {activeTab === 'overview' && (
          <RedisCacheStats autoRefresh={autoRefresh} refreshInterval={refreshInterval} />
        )}
        {activeTab === 'keys' && (
          <RedisKeyBrowser onInspectKey={setInspectingKey} />
        )}
        {activeTab === 'admin' && (
          <RedisPurgeTools />
        )}
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
    </div>
  );
}

