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
import { useTableMetadata, useAnalyzeTableColumns, useAnalyzeSchema } from '@/lib/hooks/use-data-explorer';
import type { TableMetadata } from '@/lib/types/data-explorer';
import ModalBlank from '@/components/modal-blank';

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
  const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<{
    analyzed: number;
    skipped: number;
    failed: number;
    duration_ms: number;
  } | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  
  const analyzeTableColumns = useAnalyzeTableColumns();
  const analyzeSchema = useAnalyzeSchema();

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

  const handleAnalyzeTable = async (tableId: string) => {
    setAnalysisResult(null);
    setAnalysisError(null);
    setIsAnalysisModalOpen(true);

    try {
      const result = await analyzeTableColumns.mutateAsync({ tableId, resume: true });
      setAnalysisResult(result);
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : 'Analysis failed');
    }
  };

  const handleAnalyzeAllTables = async () => {
    setAnalysisResult(null);
    setAnalysisError(null);
    setIsAnalysisModalOpen(true);

    try {
      const result = await analyzeSchema.mutateAsync({ resume: true });
      setAnalysisResult(result);
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : 'Analysis failed');
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
      label: 'Analyze Statistics',
      onClick: (item) => {
        handleAnalyzeTable(item.table_metadata_id);
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
        title: (_item) => 'Delete Table Metadata',
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
          <ProtectedComponent permission="data-explorer:manage:all">
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

          <ProtectedComponent permission="data-explorer:manage:all">
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

          <ProtectedComponent permission="data-explorer:manage:all">
            <button
              type="button"
              onClick={handleAnalyzeAllTables}
              disabled={analyzeSchema.isPending}
              className="btn bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-50"
            >
              <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 16 16">
                <path d="M15 2h-2V0h-2v2H9V0H7v2H5V0H3v2H1a1 1 0 00-1 1v12a1 1 0 001 1h14a1 1 0 001-1V3a1 1 0 00-1-1zM2 14V5h12v9H2z" />
              </svg>
              <span className="ml-2">Analyze Statistics</span>
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

      {/* Statistics Analysis Modal */}
      <ModalBlank
        isOpen={isAnalysisModalOpen}
        setIsOpen={(open) => {
          if (!open) {
            setIsAnalysisModalOpen(false);
            setAnalysisResult(null);
            setAnalysisError(null);
          }
        }}
      >
        <div className="px-5 py-4">
          {analyzeTableColumns.isPending || analyzeSchema.isPending ? (
            <div className="text-center py-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-violet-100 dark:bg-violet-500/30 mb-4">
                <svg
                  className="w-8 h-8 fill-current text-violet-500 animate-spin"
                  viewBox="0 0 16 16"
                >
                  <path d="M8 0a8 8 0 00-8 8h2a6 6 0 116 6v2a8 8 0 008-8z" />
                </svg>
              </div>
              <div className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-1">
                Analyzing Column Statistics...
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                This may take a few moments depending on table size
              </div>
            </div>
          ) : analysisError ? (
            <div className="text-center py-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 dark:bg-red-500/30 mb-4">
                <svg className="w-8 h-8 fill-current text-red-500" viewBox="0 0 16 16">
                  <path d="M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zm3.5 10.1l-1.4 1.4L8 9.4l-2.1 2.1-1.4-1.4L6.6 8 4.5 5.9l1.4-1.4L8 6.6l2.1-2.1 1.4 1.4L9.4 8l2.1 2.1z" />
                </svg>
              </div>
              <div className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-1">
                Analysis Failed
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">{analysisError}</div>
            </div>
          ) : analysisResult ? (
            <div className="space-y-4">
              <div className="text-center py-4">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-500/30 mb-4">
                  <svg className="w-8 h-8 fill-current text-emerald-500" viewBox="0 0 16 16">
                    <path d="M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zM7 11.4L3.6 8 5 6.6l2 2 4-4L12.4 6 7 11.4z" />
                  </svg>
                </div>
                <div className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-1">
                  Analysis Complete
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                    {analysisResult.analyzed}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Analyzed</div>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-gray-600 dark:text-gray-400">
                    {analysisResult.skipped}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Skipped</div>
                </div>
                <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                    {analysisResult.failed}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Failed</div>
                </div>
              </div>

              <div className="text-sm text-gray-600 dark:text-gray-400 text-center">
                Completed in {(analysisResult.duration_ms / 1000).toFixed(2)}s
              </div>
            </div>
          ) : null}
        </div>

        <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700/60">
          <div className="flex flex-wrap justify-end space-x-2">
            <button
              className="btn border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 text-gray-800 dark:text-gray-300"
              onClick={() => {
                setIsAnalysisModalOpen(false);
                setAnalysisResult(null);
                setAnalysisError(null);
              }}
            >
              Close
            </button>
          </div>
        </div>
      </ModalBlank>

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

