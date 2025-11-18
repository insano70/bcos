'use client';

import { z } from 'zod';
import { apiClient } from '@/lib/api/client';
import type { SchemaInstruction } from '@/lib/types/data-explorer';
import CrudModal from './crud-modal';
import type { FieldConfig } from './crud-modal/types';

const schemaInstructionSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  instruction: z.string().min(1, 'Instruction is required'),
  category: z.string(),
  priority: z.number(),
  example_query: z.string().optional(),
  example_sql: z.string().optional(),
});

type SchemaInstructionFormData = z.infer<typeof schemaInstructionSchema>;

interface SchemaInstructionModalProps {
  mode: 'create' | 'edit';
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  instruction?: SchemaInstruction | null;
}

export default function SchemaInstructionModal({
  mode,
  isOpen,
  onClose,
  onSuccess,
  instruction,
}: SchemaInstructionModalProps) {
  // No transformation needed for this entity
  const entity = instruction || null;

  const fields: FieldConfig<SchemaInstructionFormData>[] = [
    {
      type: 'text',
      name: 'title',
      label: 'Title',
      placeholder: 'e.g., Drug Filtering Rule',
      required: true,
    },
    {
      type: 'textarea',
      name: 'instruction',
      label: 'Instruction',
      placeholder: 'e.g., When filtering by drug names, always use procedure_code column',
      rows: 3,
      required: true,
    },
    {
      type: 'select',
      name: 'category',
      label: 'Category',
      column: 'left',
      options: [
        { value: 'filtering', label: 'Filtering' },
        { value: 'aggregation', label: 'Aggregation' },
        { value: 'joining', label: 'Joining' },
        { value: 'business_rule', label: 'Business Rule' },
      ],
    },
    {
      type: 'select',
      name: 'priority',
      label: 'Priority',
      column: 'right',
      options: [
        { value: 1, label: 'Critical' },
        { value: 2, label: 'Important' },
        { value: 3, label: 'Helpful' },
      ],
    },
    {
      type: 'text',
      name: 'example_query',
      label: 'Example Question (Optional)',
      placeholder: 'e.g., Show me all patients on Drug X',
    },
    {
      type: 'textarea',
      name: 'example_sql',
      label: 'Example SQL (Optional)',
      placeholder: "e.g., SELECT * FROM ih.procedures WHERE procedure_code = 'X'",
      rows: 2,
    },
  ];

  const handleSubmit = async (data: SchemaInstructionFormData) => {
    const payload = {
      title: data.title,
      instruction: data.instruction,
      category: data.category,
      priority: data.priority,
      example_query: data.example_query || undefined,
      example_sql: data.example_sql || undefined,
    };

    if (mode === 'create') {
      await apiClient.post('/api/data/explorer/schema-instructions', payload);
    } else if (instruction) {
      await apiClient.put(`/api/data/explorer/schema-instructions/${instruction.instruction_id}`, payload);
    }
  };

  return (
    <CrudModal
      mode={mode}
      entity={entity}
      title={mode === 'create' ? 'Add Schema Instruction' : 'Edit Schema Instruction'}
      resourceName="instruction"
      isOpen={isOpen}
      onClose={onClose}
      onSuccess={onSuccess}
      schema={schemaInstructionSchema as never}
      defaultValues={{
        title: '',
        instruction: '',
        category: 'filtering',
        priority: 2,
        example_query: '',
        example_sql: '',
      }}
      fields={fields}
      onSubmit={handleSubmit}
      size="2xl"
      successMessage={
        mode === 'create'
          ? 'Instruction created successfully'
          : 'Instruction updated successfully'
      }
    />
  );
}
