'use client';

import { Menu, MenuButton, MenuItem, MenuItems, Transition } from '@headlessui/react';
import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api/client';
import { clientErrorLog } from '@/lib/utils/debug-client';

interface DataSource {
  id: number;
  name: string;
  description: string | null;
  tableName: string;
  schemaName: string;
}

interface DataSourceSelectorProps {
  selectedDataSource: DataSource | null;
  onDataSourceChange: (dataSource: DataSource) => void;
  className?: string;
}

export default function DataSourceSelector({
  selectedDataSource,
  onDataSourceChange,
  className = '',
}: DataSourceSelectorProps) {
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDataSources();
  }, []);

  const loadDataSources = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await apiClient.get<{ dataSources: DataSource[] }>(
        '/api/admin/analytics/data-sources'
      );
      setDataSources(response.dataSources || []);

      // Auto-select first data source if none is selected
      if (!selectedDataSource && response.dataSources.length > 0 && response.dataSources[0]) {
        onDataSourceChange(response.dataSources[0]);
      }
    } catch (err) {
      clientErrorLog('Failed to load data sources:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data sources');
      setDataSources([]);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className={`${className}`}>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Data Source *
        </label>
        <div className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-100 dark:bg-gray-800">
          <div className="h-5 bg-gradient-to-r from-slate-200 via-slate-300 to-slate-200 dark:from-slate-700 dark:via-slate-600 dark:to-slate-700 rounded animate-shimmer bg-[length:200%_100%]" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${className}`}>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Data Source *
        </label>
        <div className="w-full px-3 py-2 border border-red-300 dark:border-red-600 rounded-md bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      </div>
    );
  }

  if (dataSources.length === 0) {
    return (
      <div className={`${className}`}>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Data Source *
        </label>
        <div className="w-full px-3 py-2 border border-yellow-300 dark:border-yellow-600 rounded-md bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400 text-sm">
          No data sources available
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        Data Source *
      </label>
      <Menu as="div" className="relative inline-flex w-full">
        {({ open: _open }) => (
          <>
            <MenuButton
              className="btn w-full justify-between min-w-[11rem] bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 text-gray-600 hover:text-gray-800 dark:text-gray-300 dark:hover:text-gray-100"
              aria-label="Select data source"
            >
              <div className="flex flex-col items-start text-left min-w-0 flex-1">
                <span className="font-medium truncate w-full">
                  {selectedDataSource?.name || 'Select data source...'}
                </span>
                {selectedDataSource?.description && (
                  <span className="text-sm text-gray-500 dark:text-gray-400 truncate w-full">
                    {selectedDataSource.description}
                  </span>
                )}
              </div>
              <svg
                className="shrink-0 ml-1 fill-current text-gray-400 dark:text-gray-500"
                width="11"
                height="7"
                viewBox="0 0 11 7"
              >
                <path d="M5.4 6.8L0 1.4 1.4 0l4 4 4-4 1.4 1.4z" />
              </svg>
            </MenuButton>
            <Transition
              as="div"
              className="z-50 absolute top-full left-0 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 py-1.5 rounded-lg shadow-lg overflow-hidden mt-1"
              enter="transition ease-out duration-100 transform"
              enterFrom="opacity-0 -translate-y-2"
              enterTo="opacity-100 translate-y-0"
              leave="transition ease-out duration-100"
              leaveFrom="opacity-100"
              leaveTo="opacity-0"
            >
              <MenuItems className="font-medium text-sm text-gray-600 dark:text-gray-300 divide-y divide-gray-200 dark:divide-gray-700/60 focus:outline-hidden max-h-64 overflow-auto">
                {dataSources.map((dataSource) => (
                  <MenuItem key={dataSource.id}>
                    {({ active }) => (
                      <button type="button" className={`flex flex-col items-start w-full py-3 px-3 cursor-pointer text-left ${active ? 'bg-gray-50 dark:bg-gray-700/20' : ''} ${dataSource.id === selectedDataSource?.id && 'bg-violet-50 dark:bg-violet-900/20'}`}
                        onClick={() => {
                          onDataSourceChange(dataSource);
                        }}
                      >
                        <div className="flex items-center justify-between w-full">
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-gray-900 dark:text-gray-100 truncate">
                              {dataSource.name}
                            </div>
                            {dataSource.description && (
                              <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                                {dataSource.description}
                              </div>
                            )}
                          </div>
                          <svg
                            className={`shrink-0 ml-2 fill-current text-violet-500 ${dataSource.id !== selectedDataSource?.id && 'invisible'}`}
                            width="12"
                            height="9"
                            viewBox="0 0 12 9"
                          >
                            <path d="M10.28.28L3.989 6.575 1.695 4.28A1 1 0 00.28 5.695l3 3a1 1 0 001.414 0l7-7A1 1 0 0010.28.28z" />
                          </svg>
                        </div>
                      </button>
                    )}
                  </MenuItem>
                ))}
              </MenuItems>
            </Transition>
          </>
        )}
      </Menu>
    </div>
  );
}
