'use client';

import { useState } from 'react';
import DataTable, {
  type DataTableColumn,
  type DataTableDropdownAction,
} from '@/components/data-table-standard';
import { ProtectedComponent } from '@/components/rbac/protected-component';
import CreateSchemaInstructionModal from '@/components/create-schema-instruction-modal';
import EditSchemaInstructionModal from '@/components/edit-schema-instruction-modal';
import { apiClient } from '@/lib/api/client';
import { useSchemaInstructions } from '@/lib/hooks/use-data-explorer';
import type { SchemaInstruction } from '@/lib/types/data-explorer';

export default function SchemaInstructionsContent() {
  const { data: instructions = [], isLoading, refetch } = useSchemaInstructions();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedInstruction, setSelectedInstruction] = useState<SchemaInstruction | null>(null);

  const instructionsWithId = instructions.map((item) => ({
    ...item,
    id: item.instruction_id,
  }));

  const getPriorityBadge = (priority: number) => {
    if (priority === 1)
      return <span className="px-2 py-1 text-xs font-semibold rounded bg-red-100 text-red-800">Critical</span>;
    if (priority === 2)
      return <span className="px-2 py-1 text-xs font-semibold rounded bg-blue-100 text-blue-800">Important</span>;
    return <span className="px-2 py-1 text-xs font-semibold rounded bg-gray-100 text-gray-800">Helpful</span>;
  };

  const getCategoryBadge = (category: string | null) => {
    if (!category) return <span className="text-gray-400">—</span>;
    return <span className="px-2 py-1 text-xs rounded bg-violet-100 text-violet-800">{category}</span>;
  };

  const columns: DataTableColumn<SchemaInstruction & { id: string }>[] = [
    { key: 'title', header: 'Title', sortable: true, width: 200 },
    {
      key: 'instruction',
      header: 'Instruction',
      render: (item) => (
        <div className="max-w-2xl truncate" title={item.instruction}>
          {item.instruction}
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      sortable: true,
      width: 120,
      render: (item) => getCategoryBadge(item.category),
    },
    {
      key: 'priority',
      header: 'Priority',
      sortable: true,
      width: 100,
      render: (item) => getPriorityBadge(item.priority),
    },
    {
      key: 'is_active',
      header: 'Status',
      sortable: true,
      width: 100,
      render: (item) => (
        <span
          className={`px-2 py-1 text-xs font-semibold rounded ${
            item.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
          }`}
        >
          {item.is_active ? 'Active' : 'Disabled'}
        </span>
      ),
    },
    { key: 'actions', header: 'Actions', width: 120 },
  ];

  const getDropdownActions = (
    _item: SchemaInstruction & { id: string }
  ): DataTableDropdownAction<SchemaInstruction & { id: string }>[] => [
    {
      label: 'Edit',
      onClick: (item) => {
        setSelectedInstruction(item);
        setIsEditModalOpen(true);
      },
    },
    {
      label: (item) => (item.is_active ? 'Disable' : 'Enable'),
      onClick: async (item) => {
        await apiClient.put(`/api/data/explorer/schema-instructions/${item.instruction_id}`, {
          is_active: !item.is_active,
        });
        refetch();
      },
    },
    {
      label: 'Delete',
      variant: 'danger',
      onClick: async (item) => {
        await apiClient.delete(`/api/data/explorer/schema-instructions/${item.instruction_id}`);
        refetch();
      },
      confirmModal: {
        title: (_item) => 'Delete Schema Instruction',
        message: (item) => `Delete "${item.title}"? The AI will stop following this rule.`,
        confirmText: 'Delete Instruction',
      },
    },
  ];

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-9xl mx-auto">
      <div className="sm:flex sm:justify-between sm:items-center mb-8">
        <div className="mb-4 sm:mb-0">
          <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">
            Schema Instructions
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Global rules that guide AI SQL generation across all tables
          </p>
        </div>

        <div className="grid grid-flow-col sm:auto-cols-max justify-start sm:justify-end gap-2">
          <ProtectedComponent permission="data-explorer:metadata:manage:all">
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="btn bg-violet-500 hover:bg-violet-600 text-white"
            >
              <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 16 16">
                <path d="M15 7H9V1c0-.6-.4-1-1-1S7 .4 7 1v6H1c-.6 0-1 .4-1 1s.4 1 1 1h6v6c0 .6.4 1 1 1s1-.4 1-1V9h6c.6 0 1-.4 1-1s-.4-1-1-1z" />
              </svg>
              <span className="ml-2">Add Instruction</span>
            </button>
          </ProtectedComponent>
        </div>
      </div>

      <DataTable
        title="Schema Instructions"
        data={instructionsWithId}
        columns={columns}
        dropdownActions={getDropdownActions}
        pagination={{ itemsPerPage: 20 }}
        selectionMode="none"
        isLoading={isLoading}
        searchable={true}
        searchPlaceholder="Search instructions..."
        exportable={false}
      />

      {/* Create Modal */}
      <CreateSchemaInstructionModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => refetch()}
      />

      {/* Edit Modal */}
      <EditSchemaInstructionModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setSelectedInstruction(null);
        }}
        onSuccess={() => refetch()}
        instruction={selectedInstruction}
      />
    </div>
  );
}

