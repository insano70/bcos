'use client';

import { useState } from 'react';
import DataTable, {
  type DataTableColumn,
  type DataTableDropdownAction,
} from '@/components/data-table-standard';
import EditTableMetadataModal from '@/components/edit-table-metadata-modal';
import ViewColumnsModal from '@/components/view-columns-modal';
import DiscoveryProgressModal from '@/components/discovery-progress-modal';
import CreateTableMetadataModal from '@/components/create-table-metadata-modal';
import { ProtectedComponent } from '@/components/rbac/protected-component';
import { apiClient } from '@/lib/api/client';
import { useTableMetadata } from '@/lib/hooks/use-data-explorer';
import type { TableMetadata } from '@/lib/types/data-explorer';

export default function MetadataManagementContent() {
  const { data: tables = [], isLoading, refetch } = useTableMetadata({ 
    is_active: true,
    limit: 1000,  // Get all tables, not just first 50
  });
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isColumnsModalOpen, setIsColumnsModalOpen] = useState(false);
  const [isDiscoveryModalOpen, setIsDiscoveryModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryResult, setDiscoveryResult] = useState<{
    tables_discovered: number;
    tables_new: number;
    tables_updated: number;
    columns_analyzed: number;
  } | null>(null);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<TableMetadata | null>(null);

  const tablesWithId = tables.map((item) => ({
    ...item,
    id: item.table_metadata_id,
    completeness: calculateCompleteness(item),
  }));

  const columns: DataTableColumn<TableMetadata & { id: string; completeness: number }>[] = [
    { key: 'table_name', header: 'Table Name', sortable: true, width: 200 },
    { key: 'tier', header: 'Tier', sortable: true, width: 80 },
    { 
      key: 'description', 
      header: 'Description',
      render: (item) => (
        <div className="max-w-md truncate" title={item.description || ''}>
          {item.description || <span className="italic text-gray-400">No description</span>}
        </div>
      ),
    },
    { 
      key: 'completeness', 
      header: 'Quality', 
      sortable: true, 
      width: 120,
      render: (item) => {
        const quality = item.completeness;
        const badge = quality >= 80 ? 'Excellent' : quality >= 60 ? 'Good' : quality >= 40 ? 'Fair' : 'Poor';
        const color = quality >= 80 ? 'bg-green-100 text-green-800' : quality >= 60 ? 'bg-blue-100 text-blue-800' : quality >= 40 ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800';
        return (
          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${color}`}>
            {badge} {quality}%
          </span>
        );
      },
    },
    { key: 'is_active', header: 'Active', sortable: true, width: 80 },
    { key: 'actions', header: 'Actions', width: 100 },
  ];

  const handleDiscoverTables = async () => {
    setIsDiscovering(true);
    setDiscoveryResult(null);
    setDiscoveryError(null);
    setIsDiscoveryModalOpen(true);

    try {
      const result = await apiClient.post<{
        tables_discovered: number;
        tables_new: number;
        tables_updated: number;
        columns_analyzed: number;
      }>('/api/data/explorer/metadata/discover', {
        schema_name: 'ih',
        limit: 1000, // Discover all tables
      });

      setDiscoveryResult(result);
      refetch(); // Refresh table list
    } catch (err) {
      setDiscoveryError(err instanceof Error ? err.message : 'Discovery failed');
    } finally {
      setIsDiscovering(false);
    }
  };

  const getDropdownActions = (
    _row: TableMetadata & { id: string; completeness: number }
  ): DataTableDropdownAction<TableMetadata & { id: string; completeness: number }>[] => [
    {
      label: 'Edit Metadata',
      onClick: (item) => {
        setSelectedTable(item);
        setIsEditModalOpen(true);
      },
    },
    {
      label: 'View Columns',
      onClick: (item) => {
        setSelectedTable(item);
        setIsColumnsModalOpen(true);
      },
    },
    {
      label: 'Delete',
      variant: 'danger',
      onClick: async (item) => {
        await apiClient.delete(`/api/data/explorer/metadata/tables/${item.table_metadata_id}`);
        refetch();
      },
      confirmModal: {
        title: (item) => 'Delete Table Metadata',
        message: (item) => `This will remove metadata for ${item.schema_name}.${item.table_name}. This action cannot be undone.`,
        confirmText: 'Delete Metadata',
      },
    },
  ];

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-9xl mx-auto">
      <div className="sm:flex sm:justify-between sm:items-center mb-8">
        <div className="mb-4 sm:mb-0">
          <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">
            Data Explorer Metadata
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Manage table and column metadata for improved query generation
          </p>
        </div>

        {/* Actions */}
        <div className="grid grid-flow-col sm:auto-cols-max justify-start sm:justify-end gap-2">
          <ProtectedComponent permission="data-explorer:metadata:manage:all">
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="btn border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 text-gray-800 dark:text-gray-300"
            >
              <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 16 16">
                <path d="M15 7H9V1c0-.6-.4-1-1-1S7 .4 7 1v6H1c-.6 0-1 .4-1 1s.4 1 1 1h6v6c0 .6.4 1 1 1s1-.4 1-1V9h6c.6 0 1-.4 1-1s-.4-1-1-1z" />
              </svg>
              <span className="ml-2 max-xs:sr-only">Add Table</span>
            </button>
          </ProtectedComponent>

          <ProtectedComponent permission="data-explorer:discovery:run:all">
            <button
              type="button"
              onClick={handleDiscoverTables}
              disabled={isDiscovering}
              className="btn bg-violet-500 hover:bg-violet-600 text-white disabled:opacity-50"
            >
              <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 16 16">
                <path d="M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zm1 12H7V7h2v5zM8 6c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1z" />
              </svg>
              <span className="ml-2">Discover Tables</span>
            </button>
          </ProtectedComponent>
        </div>
      </div>

      <DataTable
        title="Table Metadata"
        data={tablesWithId}
        columns={columns}
        dropdownActions={getDropdownActions}
        pagination={{ itemsPerPage: 20 }}
        selectionMode="none"
        isLoading={isLoading}
        searchable={true}
        searchPlaceholder="Search tables..."
        exportable={false}
      />

      {/* Edit Modal */}
      <EditTableMetadataModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setSelectedTable(null);
        }}
        onSuccess={() => {
          refetch();
        }}
        tableMetadata={selectedTable}
      />

      {/* View Columns Modal */}
      <ViewColumnsModal
        isOpen={isColumnsModalOpen}
        onClose={() => {
          setIsColumnsModalOpen(false);
          setSelectedTable(null);
        }}
        tableId={selectedTable?.table_metadata_id || null}
        tableName={selectedTable ? `${selectedTable.schema_name}.${selectedTable.table_name}` : ''}
      />

      {/* Discovery Progress Modal */}
      <DiscoveryProgressModal
        isOpen={isDiscoveryModalOpen}
        onClose={() => {
          setIsDiscoveryModalOpen(false);
          setDiscoveryResult(null);
          setDiscoveryError(null);
        }}
        isDiscovering={isDiscovering}
        result={discoveryResult}
        error={discoveryError}
      />

      {/* Create Table Modal */}
      <CreateTableMetadataModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => refetch()}
      />

    </div>
  );
}

function calculateCompleteness(metadata: TableMetadata): number {
  const fields = [
    metadata.display_name,
    metadata.description,
    metadata.row_meaning,
    metadata.primary_entity,
    metadata.common_filters?.length,
    metadata.sample_questions?.length,
  ];

  const filled = fields.filter(Boolean).length;
  return Math.round((filled / fields.length) * 100);
}

