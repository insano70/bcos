'use client';

import { useCallback, useEffect, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { z } from 'zod';

import CrudModal from '@/components/crud-modal';
import type { CustomFieldProps, FieldConfig, SelectOption } from '@/components/crud-modal/types';
import { apiClient } from '@/lib/api/client';
import { createSafeTextSchema } from '@/lib/validations/sanitization';

import MultiUserPicker from './multi-user-picker';

// Maximum body length (matches backend validation)
const MAX_BODY_LENGTH = 10000;

// Zod schemas for validation
const createAnnouncementSchema = z
  .object({
    subject: createSafeTextSchema(1, 255, 'Subject'),
    body: z
      .string()
      .min(1, 'Body is required')
      .max(MAX_BODY_LENGTH, `Body must be ${MAX_BODY_LENGTH.toLocaleString()} characters or less`),
    target_type: z.enum(['all', 'specific']),
    recipient_user_ids: z.array(z.string().uuid()).optional(),
    priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
    is_active: z.boolean().default(true),
    publish_at: z.string().optional(),
    expires_at: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.target_type === 'specific') {
        return data.recipient_user_ids && data.recipient_user_ids.length > 0;
      }
      return true;
    },
    {
      message: 'Please select at least one recipient',
      path: ['recipient_user_ids'],
    }
  );

const editAnnouncementSchema = createAnnouncementSchema;

type AnnouncementFormData = z.infer<typeof createAnnouncementSchema>;

interface Announcement {
  announcement_id: string;
  subject: string;
  body: string;
  target_type: 'all' | 'specific';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  is_active: boolean;
  publish_at: string | null;
  expires_at: string | null;
}

interface AnnouncementModalProps {
  mode: 'create' | 'edit';
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  announcement?: Announcement | null;
}

// Priority select component
function PrioritySelect({ value, onChange, error }: CustomFieldProps<AnnouncementFormData>) {
  const options: SelectOption[] = [
    { value: 'low', label: 'Low - Informational' },
    { value: 'normal', label: 'Normal - Standard' },
    { value: 'high', label: 'High - Important' },
    { value: 'urgent', label: 'Urgent - Critical' },
  ];

  return (
    <div>
      <select
        value={value as string}
        onChange={(e) => onChange(e.target.value)}
        className={`form-select w-full ${error ? 'border-red-500' : ''}`}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
    </div>
  );
}

// Target type select component - just the dropdown
function TargetTypeSelect({ value, onChange, error }: CustomFieldProps<AnnouncementFormData>) {
  return (
    <div>
      <select
        value={value as string}
        onChange={(e) => onChange(e.target.value)}
        className={`form-select w-full ${error ? 'border-red-500' : ''}`}
      >
        <option value="all">All Users</option>
        <option value="specific">Specific Users</option>
      </select>
      {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
    </div>
  );
}

// Conditional recipients picker - shows only when target_type is 'specific'
function ConditionalRecipientsPicker({
  name,
  value,
  onChange,
  error,
  disabled,
}: CustomFieldProps<AnnouncementFormData>) {
  const formContext = useFormContext<AnnouncementFormData>();

  // Guard against null context during initial render
  if (!formContext) {
    return null;
  }

  const targetType = formContext.watch('target_type');

  if (targetType !== 'specific') {
    return null;
  }

  return (
    <MultiUserPicker
      name={name}
      value={value as string[] | undefined}
      onChange={onChange}
      error={error}
      disabled={disabled}
    />
  );
}

export default function AnnouncementModal({
  mode,
  isOpen,
  onClose,
  onSuccess,
  announcement,
}: AnnouncementModalProps) {
  const [initialRecipients, setInitialRecipients] = useState<string[]>([]);
  const [loadingRecipients, setLoadingRecipients] = useState(false);

  // Fetch existing recipients when editing a 'specific' announcement
  const fetchRecipients = useCallback(async (announcementId: string) => {
    try {
      setLoadingRecipients(true);
      const response = await apiClient.get<{
        recipients: { user_id: string }[];
      }>(`/api/configure/announcements/${announcementId}/recipients`);
      setInitialRecipients(response.recipients.map((r) => r.user_id));
    } catch {
      // Silently fail - recipients will just be empty
      setInitialRecipients([]);
    } finally {
      setLoadingRecipients(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && mode === 'edit' && announcement?.target_type === 'specific') {
      fetchRecipients(announcement.announcement_id);
    } else if (!isOpen) {
      setInitialRecipients([]);
    }
  }, [isOpen, mode, announcement, fetchRecipients]);

  // Transform entity for edit mode
  const transformedEntity = announcement
    ? {
        ...announcement,
        recipient_user_ids: initialRecipients,
        publish_at: announcement.publish_at
          ? new Date(announcement.publish_at).toISOString().slice(0, 16)
          : '',
        expires_at: announcement.expires_at
          ? new Date(announcement.expires_at).toISOString().slice(0, 16)
          : '',
      }
    : null;

  const fields: FieldConfig<AnnouncementFormData>[] = [
    {
      type: 'text',
      name: 'subject' as never,
      label: 'Subject',
      placeholder: 'Enter announcement subject',
      required: true,
      column: 'full',
      maxLength: 255,
    },
    {
      type: 'textarea',
      name: 'body' as never,
      label: 'Message Body',
      placeholder: 'Enter the announcement message (supports Markdown)...',
      required: true,
      column: 'full',
      rows: 5,
      helpText: 'Supports Markdown: **bold**, *italic*, [links](url), lists, etc.',
    },
    {
      type: 'custom',
      name: 'priority' as never,
      label: 'Priority',
      required: true,
      column: 'left',
      component: PrioritySelect,
      props: {},
    },
    {
      type: 'custom',
      name: 'target_type' as never,
      label: 'Target Audience',
      required: true,
      column: 'right',
      component: TargetTypeSelect,
      props: {},
    },
    {
      type: 'custom',
      name: 'recipient_user_ids' as never,
      label: 'Select Recipients',
      column: 'full',
      component: ConditionalRecipientsPicker,
      props: {},
    },
    {
      type: 'text',
      name: 'publish_at' as never,
      label: 'Publish At (Optional)',
      placeholder: '',
      helpText: 'Leave blank to publish immediately',
      column: 'left',
    },
    {
      type: 'text',
      name: 'expires_at' as never,
      label: 'Expires At (Optional)',
      placeholder: '',
      helpText: 'Leave blank for no expiration',
      column: 'right',
    },
    {
      type: 'checkbox',
      name: 'is_active' as never,
      label: 'Active',
      description: 'Inactive announcements will not be shown to users',
      column: 'left',
    },
  ];

  const handleSubmit = async (data: AnnouncementFormData) => {
    const payload = {
      subject: data.subject,
      body: data.body,
      target_type: data.target_type,
      recipient_user_ids: data.target_type === 'specific' ? data.recipient_user_ids : undefined,
      priority: data.priority,
      is_active: data.is_active,
      publish_at: data.publish_at ? new Date(data.publish_at).toISOString() : null,
      expires_at: data.expires_at ? new Date(data.expires_at).toISOString() : null,
    };

    if (mode === 'create') {
      await apiClient.post('/api/configure/announcements', payload);
    } else if (announcement) {
      await apiClient.patch(`/api/configure/announcements/${announcement.announcement_id}`, payload);
    }
  };

  // Don't render if still loading recipients in edit mode
  if (mode === 'edit' && loadingRecipients) {
    return null;
  }

  return (
    <CrudModal
      mode={mode}
      entity={transformedEntity as never}
      title={mode === 'create' ? 'Create Announcement' : 'Edit Announcement'}
      resourceName="announcement"
      isOpen={isOpen}
      onClose={onClose}
      {...(onSuccess && { onSuccess })}
      schema={(mode === 'create' ? createAnnouncementSchema : editAnnouncementSchema) as never}
      defaultValues={{
        subject: '',
        body: '',
        target_type: 'all',
        recipient_user_ids: [],
        priority: 'normal',
        is_active: true,
        publish_at: '',
        expires_at: '',
      } as never}
      fields={fields}
      onSubmit={handleSubmit}
      size="3xl"
      successMessage={
        mode === 'create'
          ? 'Announcement created successfully!'
          : 'Announcement updated successfully!'
      }
    />
  );
}
