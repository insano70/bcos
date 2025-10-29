'use client';

import { useState } from 'react';
import DataTable, {
  type DataTableColumn,
  type DataTableDropdownAction,
} from '@/components/data-table-standard';
import ViewSQLModal from '@/components/view-sql-modal';
import ViewResultsModal from '@/components/view-results-modal';
import QueryRatingWidget from '@/components/query-rating-widget';
import { useQueryHistory } from '@/lib/hooks/use-data-explorer';
import type { QueryHistory } from '@/lib/types/data-explorer';

export default function QueryHistoryContent() {
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [isSQLModalOpen, setIsSQLModalOpen] = useState(false);
  const [isResultsModalOpen, setIsResultsModalOpen] = useState(false);
  const [selectedQuery, setSelectedQuery] = useState<(QueryHistory & { id: string }) | null>(null);

  const { data: history = [], isLoading, refetch } = useQueryHistory({
    limit: 100,
    ...(statusFilter && { status: statusFilter }),
  });

  const historyWithId = history.map((item) => ({ ...item, id: item.query_history_id }));

  const columns: DataTableColumn<QueryHistory & { id: string }>[] = [
    { key: 'created_at', header: 'Date', sortable: true },
    { key: 'natural_language_query', header: 'Query', sortable: false },
    { key: 'status', header: 'Status', sortable: true },
    { key: 'row_count', header: 'Rows', sortable: true },
    { key: 'execution_time_ms', header: 'Time (ms)', sortable: true },
    { key: 'user_email', header: 'User', sortable: true },
    {
      key: 'user_rating',
      header: 'Rating',
      render: (item) => (
        <QueryRatingWidget
          queryId={item.query_history_id}
          currentRating={item.user_rating}
          onRatingChange={() => refetch()}
        />
      ),
    },
    { key: 'actions', header: 'Actions' },
  ];

  const getDropdownActions = (
    row: QueryHistory & { id: string }
  ): DataTableDropdownAction<QueryHistory & { id: string }>[] => {
    const actions: DataTableDropdownAction<QueryHistory & { id: string }>[] = [
      {
        label: 'View SQL',
        onClick: (item) => {
          setSelectedQuery(item);
          setIsSQLModalOpen(true);
        },
      },
    ];

    if (row.status === 'success' && row.result_sample) {
      actions.push({
        label: 'View Results',
        onClick: (item) => {
          setSelectedQuery(item);
          setIsResultsModalOpen(true);
        },
      });
    }

    return actions;
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-9xl mx-auto">
      <div className="sm:flex sm:justify-between sm:items-center mb-8">
        <div className="mb-4 sm:mb-0">
          <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">
            Query History
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            View and analyze past queries
          </p>
        </div>

        <div className="grid grid-flow-col sm:auto-cols-max justify-start sm:justify-end gap-2">
          <select
            value={statusFilter || ''}
            onChange={(e) => setStatusFilter(e.target.value || undefined)}
            className="form-select"
          >
            <option value="">All Statuses</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
            <option value="generated">Generated</option>
          </select>
        </div>
      </div>

      <DataTable
        title="Query History"
        data={historyWithId}
        columns={columns}
        dropdownActions={getDropdownActions}
        pagination={{ itemsPerPage: 20 }}
        selectionMode="none"
        isLoading={isLoading}
        searchable={true}
        searchPlaceholder="Search queries..."
        exportable={true}
        exportFileName="query-history"
      />

      {/* View SQL Modal */}
      <ViewSQLModal
        isOpen={isSQLModalOpen}
        onClose={() => {
          setIsSQLModalOpen(false);
          setSelectedQuery(null);
        }}
        sql={selectedQuery?.generated_sql || ''}
        explanation={selectedQuery?.final_sql || null}
        naturalLanguageQuery={selectedQuery?.natural_language_query}
      />

      {/* View Results Modal */}
      <ViewResultsModal
        isOpen={isResultsModalOpen}
        onClose={() => {
          setIsResultsModalOpen(false);
          setSelectedQuery(null);
        }}
        results={selectedQuery?.result_sample && Array.isArray(selectedQuery.result_sample) ? selectedQuery.result_sample : []}
        rowCount={selectedQuery?.row_count || 0}
        executionTime={selectedQuery?.execution_time_ms || 0}
        sql={selectedQuery?.final_sql || selectedQuery?.generated_sql || ''}
      />
    </div>
  );
}

