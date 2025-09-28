'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api/client';
import type { DashboardListItem } from '@/lib/types/analytics';
import type { DashboardWithCharts } from '@/lib/services/rbac-dashboards-service';
import DashboardsTable from './dashboards-table';

import DeleteButton from '@/components/delete-button';
import DateSelect from '@/components/date-select';
import FilterButton from '@/components/dropdown-filter';
import PaginationClassic from '@/components/pagination-classic';
import { SelectedItemsProvider } from '@/app/selected-items-context';
import DeleteDashboardModal from '@/components/delete-dashboard-modal';
import DashboardPreviewModal from '@/components/dashboard-preview-modal';
import Toast from '@/components/toast';
import type { Dashboard, DashboardChart } from '@/lib/types/analytics';
import { usePagination } from '@/lib/hooks/use-pagination';

export default function DashboardsPage() {
  const router = useRouter();
  const [savedDashboards, setSavedDashboards] = useState<DashboardListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [dashboardToDelete, setDashboardToDelete] = useState<DashboardListItem | null>(null);
  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [dashboardToPreview, setDashboardToPreview] = useState<{
    dashboard: Dashboard;
    charts: DashboardChart[];
  } | null>(null);

  // Pagination
  const pagination = usePagination(savedDashboards, { itemsPerPage: 10 });

  const loadDashboards = useCallback(async () => {
    setError(null);
    
    try {
      console.log('🔍 Loading dashboard definitions from API...');
      
      const response = await fetch('/api/admin/analytics/dashboards');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      console.log('📊 Raw Dashboard API Response:', result);
      
      if (!result.success) {
        throw new Error(result.message || 'API returned unsuccessful response');
      }
      
      const dashboards = result.data.dashboards || [];
      console.log('📋 Dashboards data structure:', {
        count: dashboards.length,
        sampleDashboard: dashboards[0]
      });
      
      // Transform flattened API data to DashboardListItem structure
      const transformedDashboards: DashboardListItem[] = (dashboards as DashboardWithCharts[])
        .map((item: DashboardWithCharts, index: number): DashboardListItem | null => {
        // Handle flattened data structure from new API service
        console.log(`🔄 Transforming dashboard ${index}:`, item);

        // Validate required fields
        if (!item.dashboard_id || !item.dashboard_name) {
          console.warn(`⚠️ Skipping dashboard ${index}: missing required fields`);
          return null;
        }

        return {
          dashboard_id: item.dashboard_id,
          dashboard_name: item.dashboard_name,
          dashboard_description: item.dashboard_description,
          dashboard_category_id: item.dashboard_category_id,
          category_name: item.category?.category_name,
          chart_count: item.chart_count || 0,
          created_by: item.created_by,
          creator_name: item.creator?.first_name,
          creator_last_name: item.creator?.last_name,
          created_at: item.created_at,
          updated_at: item.updated_at,
          is_active: item.is_active,
          is_published: item.is_published,
        };
      }).filter((item): item is DashboardListItem => item !== null);
      
      console.log('✅ Transformed dashboards:', {
        count: transformedDashboards.length,
        sampleTransformed: transformedDashboards[0]
      });
      
      setSavedDashboards(transformedDashboards);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load dashboards';
      console.error('❌ Failed to load dashboards:', error);
      setError(errorMessage);
      setSavedDashboards([]); // Ensure we always have an array
    }
  }, []);

  const handleDeleteClick = (dashboard: DashboardListItem) => {
    setDashboardToDelete(dashboard);
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async (dashboardId: string) => {
    try {
      const response = await fetch(`/api/admin/analytics/dashboards/${dashboardId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete dashboard');
      }

      // Show success toast
      setToastMessage(`Dashboard "${dashboardToDelete?.dashboard_name}" deleted successfully`);
      setToastType('success');
      setToastOpen(true);
      
      // Refresh the dashboards list
      await loadDashboards();
      
    } catch (error) {
      console.error('Failed to delete dashboard:', error);
      setToastMessage(`Failed to delete dashboard: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setToastType('error');
      setToastOpen(true);
    }
  };

  const handleEditDashboard = (dashboard: DashboardListItem) => {
    router.push(`/configure/dashboards/${dashboard.dashboard_id}/edit`);
  };

  const handlePublishDashboard = async (dashboard: DashboardListItem) => {
    try {
      // Use apiClient which automatically handles CSRF tokens and auth
      await apiClient.request(`/api/admin/analytics/dashboards/${dashboard.dashboard_id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          is_published: true
        })
      });

      // Show success toast
      setToastMessage(`Dashboard "${dashboard.dashboard_name}" published successfully`);
      setToastType('success');
      setToastOpen(true);
      
      // Refresh the dashboards list
      await loadDashboards();
      
    } catch (error) {
      console.error('Failed to publish dashboard:', error);
      setToastMessage(`Failed to publish dashboard: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setToastType('error');
      setToastOpen(true);
    }
  };

  const handleUnpublishDashboard = async (dashboard: DashboardListItem) => {
    try {
      // Use apiClient which automatically handles CSRF tokens and auth
      await apiClient.request(`/api/admin/analytics/dashboards/${dashboard.dashboard_id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          is_published: false
        })
      });

      // Show success toast
      setToastMessage(`Dashboard "${dashboard.dashboard_name}" unpublished successfully`);
      setToastType('success');
      setToastOpen(true);
      
      // Refresh the dashboards list
      await loadDashboards();
      
    } catch (error) {
      console.error('Failed to unpublish dashboard:', error);
      setToastMessage(`Failed to unpublish dashboard: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setToastType('error');
      setToastOpen(true);
    }
  };

  const handlePreviewDashboard = async (dashboard: DashboardListItem) => {
    try {
      console.log('🔍 Loading dashboard for preview:', dashboard.dashboard_id);
      
      const response = await fetch(`/api/admin/analytics/dashboards/${dashboard.dashboard_id}`);
      if (!response.ok) {
        throw new Error(`Failed to load dashboard: ${response.status}`);
      }

      const result = await response.json();
      const dashboardResponse = result.data;

      // Extract dashboard and charts from API response
      const fullDashboard = dashboardResponse.dashboard.dashboards || dashboardResponse.dashboard;
      const charts = dashboardResponse.charts || [];

      setDashboardToPreview({
        dashboard: fullDashboard,
        charts
      });
      setPreviewModalOpen(true);
      
    } catch (error) {
      console.error('❌ Failed to load dashboard for preview:', error);
      setToastMessage(`Failed to load dashboard preview: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setToastType('error');
      setToastOpen(true);
    }
  };

  const handleCreateDashboard = () => {
    router.push('/configure/dashboard-builder');
  };

  // Load dashboards on component mount
  React.useEffect(() => {
    loadDashboards();
  }, [loadDashboards]);

  // Error state
  if (error) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6">
          <div className="flex items-center">
            <svg
              className="w-6 h-6 text-red-600 dark:text-red-400 mr-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
            <div>
              <h3 className="text-red-800 dark:text-red-200 font-medium">Error loading dashboard definitions</h3>
              <p className="text-red-600 dark:text-red-400 text-sm mt-1">
                {error}
              </p>
              <button
                type="button"
                onClick={() => loadDashboards()}
                className="mt-3 btn-sm bg-red-600 hover:bg-red-700 text-white"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <SelectedItemsProvider>
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
        {/* Page Header */}
        <div className="sm:flex sm:justify-between sm:items-center mb-8">
          <div className="mb-4 sm:mb-0">
            <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">
              Dashboards
            </h1>
          </div>

          {/* Right: Actions */}
          <div className="grid grid-flow-col sm:auto-cols-max justify-start sm:justify-end gap-2">
            {/* Delete button */}
            <DeleteButton />

            {/* Date filter */}
            <DateSelect />

            {/* Filter button */}
            <FilterButton align="right" />

            {/* Create dashboard button */}
            <button
              type="button"
              onClick={handleCreateDashboard}
              className="btn bg-violet-500 hover:bg-violet-600 text-white"
            >
              <svg className="fill-current shrink-0 xs:hidden" width="16" height="16" viewBox="0 0 16 16">
                <path d="m7 7V3c0-.6.4-1 1-1s1 .4 1 1v4h4c.6 0 1 .4 1 1s-.4 1-1 1H9v4c0 .6-.4 1-1 1s-1-.4-1-1V9H3c-.6 0-1-.4-1-1s.4-1 1-1h4Z" />
              </svg>
              <span className="max-xs:sr-only">Create Dashboard</span>
            </button>
          </div>
        </div>

        {/* Dashboards Table */}
        <DashboardsTable
          dashboards={pagination.currentItems}
          onEdit={handleEditDashboard}
          onDelete={handleDeleteClick}
          onPreview={handlePreviewDashboard}
          onPublish={handlePublishDashboard}
          onUnpublish={handleUnpublishDashboard}
        />

        {/* Pagination */}
        {savedDashboards.length > 0 && (
          <div className="mt-8">
            <PaginationClassic 
              currentPage={pagination.currentPage}
              totalItems={pagination.totalItems}
              itemsPerPage={pagination.itemsPerPage}
              startItem={pagination.startItem}
              endItem={pagination.endItem}
              hasPrevious={pagination.hasPrevious}
              hasNext={pagination.hasNext}
              onPrevious={pagination.goToPrevious}
              onNext={pagination.goToNext}
            />
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {dashboardToDelete && (
          <DeleteDashboardModal
            isOpen={deleteModalOpen}
            setIsOpen={setDeleteModalOpen}
            dashboardName={dashboardToDelete.dashboard_name}
            dashboardId={dashboardToDelete.dashboard_id}
            onConfirm={handleDeleteConfirm}
          />
        )}

        {/* Dashboard Preview Modal */}
        {dashboardToPreview && (
          <DashboardPreviewModal
            isOpen={previewModalOpen}
            setIsOpen={setPreviewModalOpen}
            dashboard={dashboardToPreview.dashboard}
            dashboardCharts={dashboardToPreview.charts}
            title={`Preview: ${dashboardToPreview.dashboard.dashboard_name}`}
          />
        )}

        {/* Toast Notifications */}
        <Toast 
          type={toastType} 
          open={toastOpen} 
          setOpen={setToastOpen}
          className="fixed bottom-4 right-4 z-50"
        >
          {toastMessage}
        </Toast>

      </div>
    </SelectedItemsProvider>
  );
}
