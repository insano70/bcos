'use client';

import ModalBlank from './modal-blank';
import DashboardPreview from './charts/dashboard-preview';
import type { Dashboard, DashboardChart, ChartDefinition } from '@/lib/types/analytics';

interface DashboardConfig {
  dashboardName: string;
  dashboardDescription: string;
  charts: Array<{
    id: string;
    chartDefinitionId: string;
    position: { x: number; y: number; w: number; h: number };
    chartDefinition?: ChartDefinition;
  }>;
  layout: {
    columns: number;
    rowHeight: number;
    margin: number;
  };
}

interface DashboardPreviewModalProps {
  isOpen: boolean;
  setIsOpen: (value: boolean) => void;
  
  // For previewing saved dashboards (from list)
  dashboard?: Dashboard;
  dashboardCharts?: DashboardChart[];
  
  // For previewing unsaved configurations (from builder)
  dashboardConfig?: DashboardConfig;
  
  title?: string;
}

export default function DashboardPreviewModal({
  isOpen,
  setIsOpen,
  dashboard,
  dashboardCharts,
  dashboardConfig,
  title
}: DashboardPreviewModalProps) {
  const handleClose = () => {
    setIsOpen(false);
  };

  return (
    <ModalBlank isOpen={isOpen} setIsOpen={setIsOpen}>
      <div className="w-full h-full min-h-screen bg-white dark:bg-gray-900">
        {/* Full Screen Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-white dark:bg-gray-800 sticky top-0 z-10">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {title || 'Dashboard Preview'}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors flex items-center"
          >
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Close Preview
          </button>
        </div>

        {/* Full Screen Content */}
        <div className="p-6 min-h-[calc(100vh-80px)]">
          <DashboardPreview
            {...(dashboard && { dashboard })}
            {...(dashboardCharts && { dashboardCharts })}
            {...(dashboardConfig && { dashboardConfig })}
            onClose={handleClose}
            {...(title && { title })}
          />
        </div>
      </div>
    </ModalBlank>
  );
}
