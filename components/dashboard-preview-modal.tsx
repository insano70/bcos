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
      <div className="max-w-7xl w-full mx-auto max-h-[90vh] overflow-auto">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl">
          {/* Modal Header */}
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              {title || 'Dashboard Preview'}
            </h2>
            <button
              type="button"
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <span className="sr-only">Close</span>
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Modal Content */}
          <div className="p-6">
            <DashboardPreview
              {...(dashboard && { dashboard })}
              {...(dashboardCharts && { dashboardCharts })}
              {...(dashboardConfig && { dashboardConfig })}
              onClose={handleClose}
              {...(title && { title })}
            />
          </div>
        </div>
      </div>
    </ModalBlank>
  );
}
