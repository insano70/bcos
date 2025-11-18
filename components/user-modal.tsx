'use client';

import { useState } from 'react';
import { z } from 'zod';
import { passwordSchema } from '@/lib/config/password-policy';
import { useOrganizations } from '@/lib/hooks/use-organizations';
import { type User, useCreateUser, useUpdateUser } from '@/lib/hooks/use-users';
import { createNameSchema, safeEmailSchema } from '@/lib/validations/sanitization';
import { apiClient } from '@/lib/api/client';
import CrudModal from './crud-modal';
import type { FieldConfig } from './crud-modal/types';
import type { CustomFieldProps } from './crud-modal/types';
import HierarchySelect from './hierarchy-select';
import RoleSelector from './role-selector';
import ResetMFAConfirmationModal from './reset-mfa-confirmation-modal';
import Toast from './toast';

// Wrapper components to adapt to CustomFieldProps interface
function OrganizationSelectAdapter({ value, onChange, error, disabled }: CustomFieldProps<UserFormData>) {
  const { data: organizations = [] } = useOrganizations();

  return (
    <HierarchySelect
      items={organizations}
      value={value as string}
      onChange={(id) => onChange(id as string || '')}
      idField="id"
      nameField="name"
      parentField="parent_organization_id"
      activeField="is_active"
      label="Organization"
      placeholder="Select an organization"
      required
      {...(disabled !== undefined && { disabled })}
      showSearch
      allowClear={false}
      rootLabel="None (Root Organization)"
      {...(error && { error })}
    />
  );
}

function RoleSelectorAdapter({ value, onChange, error, disabled }: CustomFieldProps<UserFormData>) {
  return (
    <RoleSelector
      selectedRoleIds={value as string[]}
      onChange={(roleIds) => onChange(roleIds)}
      {...(error && { error })}
      {...(disabled !== undefined && { disabled })}
      required
    />
  );
}

// Create schema with required password
const createUserSchema = z
  .object({
    first_name: createNameSchema('First name'),
    last_name: createNameSchema('Last name'),
    email: safeEmailSchema,
    password: passwordSchema,
    confirm_password: z.string(),
    organization_id: z.string().min(1, 'Please select an organization'),
    role_ids: z.array(z.string()).min(1, 'Please select at least one role'),
    email_verified: z.boolean().optional(),
    is_active: z.boolean().optional(),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: "Passwords don't match",
    path: ['confirm_password'],
  });

// Edit schema with optional password
const editUserSchema = z
  .object({
    first_name: createNameSchema('First name'),
    last_name: createNameSchema('Last name'),
    email: safeEmailSchema,
    password: z.string().optional(),
    confirm_password: z.string().optional(),
    organization_id: z.string().min(1, 'Please select an organization'),
    role_ids: z.array(z.string()).min(1, 'Please select at least one role'),
    email_verified: z.boolean().optional(),
    is_active: z.boolean().optional(),
    provider_uid_input: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.password && data.password.length > 0) {
        const passwordValidation = passwordSchema.safeParse(data.password);
        if (!passwordValidation.success) {
          return false;
        }
        return data.password === data.confirm_password;
      }
      return true;
    },
    {
      message: 'Password must meet requirements and passwords must match',
      path: ['confirm_password'],
    }
  );

type CreateUserFormData = z.infer<typeof createUserSchema>;
type EditUserFormData = z.infer<typeof editUserSchema>;
type UserFormData = CreateUserFormData | EditUserFormData;

interface UserModalProps {
  mode: 'create' | 'edit';
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  user?: User | null;
}

export default function UserModal({ mode, isOpen, onClose, onSuccess, user }: UserModalProps) {
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const [showMFAResetModal, setShowMFAResetModal] = useState(false);
  const [showMFAResetSuccess, setShowMFAResetSuccess] = useState(false);

  // Transform entity for edit mode
  const transformedEntity = user
    ? {
        ...user,
        organization_id: user.organization_id || '',
        provider_uid_input: user.provider_uid?.toString() || '',
        role_ids: user.roles?.map((role) => role.id) || [],
      }
    : null;

  const fields: FieldConfig<UserFormData>[] = [
    {
      type: 'text',
      name: 'first_name' as never,
      label: 'First Name',
      placeholder: 'Enter first name',
      required: true,
      column: 'left',
    },
    {
      type: 'text',
      name: 'last_name' as never,
      label: 'Last Name',
      placeholder: 'Enter last name',
      required: true,
      column: 'right',
    },
    {
      type: 'email',
      name: 'email' as never,
      label: 'Email Address',
      placeholder: 'Enter email address',
      required: true,
      column: 'left',
    },
    {
      type: 'custom',
      name: 'organization_id' as never,
      label: 'Organization',
      required: true,
      column: 'right',
      component: OrganizationSelectAdapter,
      props: {},
    },
    {
      type: 'password',
      name: 'password' as never,
      label: mode === 'create' ? 'Password' : 'New Password (leave blank to keep current)',
      placeholder: mode === 'create' ? 'Enter password' : 'Enter new password (optional)',
      required: mode === 'create',
      column: 'left',
    },
    {
      type: 'password',
      name: 'confirm_password' as never,
      label: mode === 'create' ? 'Confirm Password' : 'Confirm New Password',
      placeholder: mode === 'create' ? 'Confirm password' : 'Confirm new password',
      required: mode === 'create',
      column: 'right',
    },
    {
      type: 'custom',
      name: 'role_ids' as never,
      label: 'Roles',
      required: true,
      column: 'left',
      component: RoleSelectorAdapter,
      props: {},
    },
    {
      type: 'number',
      name: 'provider_uid_input' as never,
      label: 'Provider UID',
      placeholder: 'Enter provider_uid (e.g., 42)',
      helpText: 'For Analytics Data Filtering',
      column: 'right',
      visible: (_formData) => mode === 'edit',
    },
    {
      type: 'checkbox',
      name: 'email_verified' as never,
      label: 'Email Verified',
      column: 'left',
    },
    {
      type: 'checkbox',
      name: 'is_active' as never,
      label: 'Active User',
      column: 'right',
    },
  ];

  const handleSubmit = async (data: UserFormData) => {
    if (mode === 'create') {
      const createData = data as CreateUserFormData;
      await createUser.mutateAsync({
        email: createData.email,
        password: createData.password,
        first_name: createData.first_name,
        last_name: createData.last_name,
        organization_id: createData.organization_id,
        email_verified: createData.email_verified || false,
        is_active: createData.is_active !== false,
        role_ids: createData.role_ids,
      } as never);
    } else if (user) {
      const editData = data as EditUserFormData;

      // Parse provider_uid from string input
      let provider_uid: number | null = null;
      if (editData.provider_uid_input?.trim()) {
        const parsed = parseInt(editData.provider_uid_input.trim(), 10);
        if (!Number.isNaN(parsed) && parsed > 0) {
          provider_uid = parsed;
        }
      }

      const updateData: {
        first_name: string;
        last_name: string;
        email: string;
        organization_id: string;
        role_ids: string[];
        email_verified?: boolean | undefined;
        is_active?: boolean | undefined;
        provider_uid?: number | null | undefined;
        password?: string | undefined;
      } = {
        first_name: editData.first_name,
        last_name: editData.last_name,
        email: editData.email,
        organization_id: editData.organization_id,
        role_ids: editData.role_ids,
        email_verified: editData.email_verified,
        is_active: editData.is_active,
        ...(provider_uid !== null && { provider_uid }),
      };

      // Only include password if provided
      if (editData.password && editData.password.length > 0) {
        updateData.password = editData.password;
      }

      await updateUser.mutateAsync({
        id: user.id,
        data: updateData,
      });
    }
  };

  const handleResetMFA = async () => {
    if (!user) return;

    try {
      await apiClient.post(`/api/admin/users/${user.id}/mfa/reset`, {});
      setShowMFAResetSuccess(true);
      onSuccess?.();
      setTimeout(() => {
        setShowMFAResetSuccess(false);
      }, 3000);
    } catch (error) {
      console.error('Error resetting MFA:', error);
    }
  };

  return (
    <>
      <CrudModal
        mode={mode}
        entity={transformedEntity as never}
        title={mode === 'create' ? 'Add New User' : 'Edit User'}
        resourceName="user"
        isOpen={isOpen}
        onClose={onClose}
        {...(onSuccess && { onSuccess })}
        schema={(mode === 'create' ? createUserSchema : editUserSchema) as never}
        defaultValues={{
          first_name: '',
          last_name: '',
          email: '',
          password: '',
          confirm_password: '',
          organization_id: '',
          role_ids: [],
          email_verified: false,
          is_active: true,
          provider_uid_input: '',
        } as never}
        fields={fields}
        onSubmit={handleSubmit}
        size="4xl"
        successMessage={mode === 'create' ? 'User created successfully!' : 'User updated successfully!'}
      />

      {/* MFA Reset Success Toast */}
      <Toast
        type="success"
        open={showMFAResetSuccess}
        setOpen={setShowMFAResetSuccess}
        className="fixed bottom-4 right-4 z-50"
      >
        MFA has been reset successfully. User can now set up MFA again.
      </Toast>

      {/* MFA Reset Confirmation Modal */}
      {user && (
        <ResetMFAConfirmationModal
          isOpen={showMFAResetModal}
          setIsOpen={setShowMFAResetModal}
          userName={`${user.first_name} ${user.last_name}`}
          userEmail={user.email}
          credentialCount={user.mfa_credentials_count || 0}
          onConfirm={handleResetMFA}
        />
      )}
    </>
  );
}
