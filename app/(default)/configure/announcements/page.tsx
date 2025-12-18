'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SelectedItemsProvider } from '@/app/selected-items-context';
import AnnouncementModal from '@/components/announcements/announcement-modal';
import { getAnnouncementPriorityColor, getActiveStatusColor, getTargetTypeColor } from '@/lib/utils/badge-colors';
import RecipientsModal from '@/components/announcements/recipients-modal';
import DataTable, {
  type DataTableColumn,
  type DataTableDropdownAction,
} from '@/components/data-table-standard';
import DeleteButton from '@/components/delete-button';
import DeleteConfirmationModal from '@/components/delete-confirmation-modal';
import FilterButton, { type ActiveFilter, type FilterGroup } from '@/components/dropdown-filter';
import Toast from '@/components/toast';
import { ErrorDisplay } from '@/components/error-display';
import { apiClient } from '@/lib/api/client';
import { clientErrorLog } from '@/lib/utils/debug-client';

interface Announcement {
  id: string;
  announcement_id: string;
  subject: string;
  body: string;
  target_type: 'all' | 'specific';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  is_active: boolean;
  publish_at: string | null;
  expires_at: string | null;
  created_by: string;
  created_by_name?: string;
  recipient_count: number;
  read_count: number;
  created_at: string;
  updated_at: string;
}

export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [announcementToDelete, setAnnouncementToDelete] = useState<Announcement | null>(null);

  const [recipientsModalOpen, setRecipientsModalOpen] = useState(false);
  const [recipientsAnnouncement, setRecipientsAnnouncement] = useState<Announcement | null>(null);

  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');

  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);

  const filterGroups: FilterGroup[] = [
    {
      group: 'Status',
      options: [
        { label: 'All', value: 'all', field: 'is_active' },
        { label: 'Active', value: 'active', field: 'is_active', comparator: true },
        { label: 'Inactive', value: 'inactive', field: 'is_active', comparator: false },
      ],
    },
    {
      group: 'Target',
      options: [
        { label: 'All', value: 'all', field: 'target_type' },
        { label: 'All Users', value: 'all_users', field: 'target_type', comparator: 'all' },
        { label: 'Specific Users', value: 'specific', field: 'target_type', comparator: 'specific' },
      ],
    },
    {
      group: 'Priority',
      options: [
        { label: 'All', value: 'all', field: 'priority' },
        { label: 'Urgent', value: 'urgent', field: 'priority', comparator: 'urgent' },
        { label: 'High', value: 'high', field: 'priority', comparator: 'high' },
        { label: 'Normal', value: 'normal', field: 'priority', comparator: 'normal' },
        { label: 'Low', value: 'low', field: 'priority', comparator: 'low' },
      ],
    },
  ];

  const filteredAnnouncements = useMemo(() => {
    if (!announcements) return [];

    return announcements.filter((announcement) => {
      if (activeFilters.length === 0) return true;

      const filtersByField = activeFilters.reduce(
        (acc, filter) => {
          if (!acc[filter.field]) {
            acc[filter.field] = [];
          }
          acc[filter.field]?.push(filter);
          return acc;
        },
        {} as Record<string, ActiveFilter[]>
      );

      return Object.entries(filtersByField).every(([, filters]) => {
        return filters.some((filter) => {
          const value = announcement[filter.field as keyof Announcement];
          return value === filter.comparator;
        });
      });
    });
  }, [announcements, activeFilters]);

  const loadAnnouncements = useCallback(async () => {
    setError(null);
    setIsLoading(true);

    try {
      // apiClient unwraps the standardized response and returns data directly
      const items = await apiClient.get<Announcement[]>(
        '/api/configure/announcements?limit=1000&include_expired=true'
      );

      setAnnouncements(
        (items || []).map((item) => ({
          ...item,
          id: item.announcement_id,
        }))
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load announcements';
      clientErrorLog('Failed to load announcements', err);
      setError(errorMessage);
      setAnnouncements([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleCreateClick = () => {
    setSelectedAnnouncement(null);
    setModalMode('create');
    setModalOpen(true);
  };

  const handleEditClick = (announcement: Announcement) => {
    setSelectedAnnouncement(announcement);
    setModalMode('edit');
    setModalOpen(true);
  };

  const handleDeleteClick = (announcement: Announcement) => {
    setAnnouncementToDelete(announcement);
    setDeleteModalOpen(true);
  };

  const handleViewRecipients = (announcement: Announcement) => {
    setRecipientsAnnouncement(announcement);
    setRecipientsModalOpen(true);
  };

  const handleDeleteConfirm = async (announcementId: string) => {
    try {
      await apiClient.delete(`/api/configure/announcements/${announcementId}`);
      setToastMessage(`Announcement "${announcementToDelete?.subject}" deleted successfully`);
      setToastType('success');
      setToastOpen(true);
      await loadAnnouncements();
    } catch (err) {
      clientErrorLog('Failed to delete announcement', err);
      setToastMessage(
        `Failed to delete announcement: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
      setToastType('error');
      setToastOpen(true);
    }
  };

  const handleRepublish = async (announcement: Announcement) => {
    try {
      await apiClient.post(`/api/configure/announcements/${announcement.announcement_id}/republish`, {});
      setToastMessage(`Announcement "${announcement.subject}" republished. All users will see it again.`);
      setToastType('success');
      setToastOpen(true);
      await loadAnnouncements();
    } catch (err) {
      clientErrorLog('Failed to republish announcement', err);
      setToastMessage(
        `Failed to republish: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
      setToastType('error');
      setToastOpen(true);
    }
  };

  const handleToggleActive = async (announcement: Announcement) => {
    try {
      await apiClient.patch(`/api/configure/announcements/${announcement.announcement_id}`, {
        is_active: !announcement.is_active,
      });
      setToastMessage(
        `Announcement ${announcement.is_active ? 'deactivated' : 'activated'} successfully`
      );
      setToastType('success');
      setToastOpen(true);
      await loadAnnouncements();
    } catch (err) {
      clientErrorLog('Failed to update announcement', err);
      setToastMessage(
        `Failed to update: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
      setToastType('error');
      setToastOpen(true);
    }
  };

  const handleModalSuccess = () => {
    loadAnnouncements();
  };

  const columns: DataTableColumn<Announcement>[] = [
    { key: 'checkbox' },
    {
      key: 'subject',
      header: 'Subject',
      sortable: true,
      render: (announcement) => (
        <div>
          <div className="font-medium text-gray-800 dark:text-gray-100">
            {announcement.subject}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-xs">
            {announcement.body.substring(0, 60)}...
          </div>
        </div>
      ),
    },
    {
      key: 'priority',
      header: 'Priority',
      sortable: true,
      align: 'center',
      render: (announcement) => (
        <Badge color={getAnnouncementPriorityColor(announcement.priority)} className="capitalize">
          {announcement.priority}
        </Badge>
      ),
    },
    {
      key: 'target_type',
      header: 'Target',
      sortable: true,
      align: 'center',
      render: (announcement) => (
        <Badge color={getTargetTypeColor(announcement.target_type)}>
          {announcement.target_type === 'all' ? 'All Users' : `${announcement.recipient_count} Users`}
        </Badge>
      ),
    },
    {
      key: 'read_count',
      header: 'Read',
      sortable: true,
      align: 'center',
      render: (announcement) => (
        <span className="text-gray-800 dark:text-gray-100">
          {announcement.read_count}
        </span>
      ),
    },
    {
      key: 'is_active',
      header: 'Status',
      sortable: true,
      align: 'center',
      render: (announcement) => (
        <Badge
          color={getActiveStatusColor(announcement.is_active)}
          icon={
            <svg className="w-1.5 h-1.5" fill="currentColor" viewBox="0 0 8 8">
              <circle cx={4} cy={4} r={3} />
            </svg>
          }
        >
          {announcement.is_active ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'created_by_name',
      header: 'Created By',
      sortable: true,
      render: (announcement) => (
        <div className="text-gray-800 dark:text-gray-100">
          {announcement.created_by_name || 'Unknown'}
        </div>
      ),
    },
    {
      key: 'created_at',
      header: 'Created',
      sortable: true,
      render: (announcement) => (
        <div>
          <div className="text-gray-800 dark:text-gray-100">
            {new Date(announcement.created_at).toLocaleDateString()}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {new Date(announcement.created_at).toLocaleTimeString()}
          </div>
        </div>
      ),
    },
    { key: 'actions' },
  ];

  const getDropdownActions = (
    announcement: Announcement
  ): DataTableDropdownAction<Announcement>[] => {
    const actions: DataTableDropdownAction<Announcement>[] = [
      {
        label: 'Edit',
        onClick: handleEditClick,
      },
    ];

    // Only show View Recipients for targeted announcements
    if (announcement.target_type === 'specific') {
      actions.push({
        label: 'View Recipients',
        onClick: handleViewRecipients,
      });
    }

    actions.push(
      {
        label: announcement.is_active ? 'Deactivate' : 'Activate',
        onClick: handleToggleActive,
      },
      {
        label: 'Republish',
        onClick: handleRepublish,
      },
      {
        label: 'Delete',
        onClick: handleDeleteClick,
        variant: 'danger',
      }
    );

    return actions;
  };

  React.useEffect(() => {
    loadAnnouncements();
  }, [loadAnnouncements]);

  if (error) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
        <ErrorDisplay
          variant="inline"
          error={error}
          title="Announcements"
          onRetry={() => loadAnnouncements()}
        />
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
              Announcements
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Broadcast messages to all users or specific groups
            </p>
          </div>

          <div className="grid grid-flow-col sm:auto-cols-max justify-start sm:justify-end gap-2">
            <DeleteButton />
            <FilterButton
              align="right"
              filters={filterGroups}
              onFilterChange={setActiveFilters}
            />
            <Button
              variant="violet"
              onClick={handleCreateClick}
              leftIcon={
                <svg className="fill-current shrink-0 xs:hidden" width="16" height="16" viewBox="0 0 16 16">
                  <path d="m7 7V3c0-.6.4-1 1-1s1 .4 1 1v4h4c.6 0 1 .4 1 1s-.4 1-1 1H9v4c0 .6-.4 1-1 1s-1-.4-1-1V9H3c-.6 0-1-.4-1-1s.4-1 1-1h4Z" />
                </svg>
              }
            >
              <span className="max-xs:sr-only">Create Announcement</span>
            </Button>
          </div>
        </div>

        {/* Announcements Table */}
        <DataTable
          title="All Announcements"
          data={filteredAnnouncements}
          columns={columns}
          dropdownActions={getDropdownActions}
          pagination={{ itemsPerPage: 10 }}
          selectionMode="multi"
          isLoading={isLoading}
          searchable={true}
          searchPlaceholder="Search announcements..."
          exportable={true}
          exportFileName="announcements"
        />

        {/* Create/Edit Modal */}
        <AnnouncementModal
          mode={modalMode}
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          onSuccess={handleModalSuccess}
          announcement={selectedAnnouncement}
        />

        {/* Delete Confirmation Modal */}
        {announcementToDelete && (
          <DeleteConfirmationModal
            isOpen={deleteModalOpen}
            setIsOpen={setDeleteModalOpen}
            title="Delete Announcement"
            itemName={announcementToDelete.subject}
            message="This action cannot be undone. Users who haven't read it will no longer see it."
            confirmButtonText="Delete Announcement"
            onConfirm={async () => await handleDeleteConfirm(announcementToDelete.announcement_id)}
          />
        )}

        {/* Recipients Modal */}
        {recipientsAnnouncement && (
          <RecipientsModal
            isOpen={recipientsModalOpen}
            onClose={() => setRecipientsModalOpen(false)}
            announcementId={recipientsAnnouncement.announcement_id}
            announcementSubject={recipientsAnnouncement.subject}
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
