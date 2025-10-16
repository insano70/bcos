'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useUpdateUser, type User } from '@/lib/hooks/use-users';
import { passwordSchema } from '@/lib/config/password-policy';
import { safeEmailSchema, createNameSchema } from '@/lib/validations/sanitization';
import RoleSelector from './role-selector';
import Toast from './toast';

// Form validation schema with optional password reset
const editUserSchema = z.object({
  first_name: createNameSchema('First name'),
  last_name: createNameSchema('Last name'),
  email: safeEmailSchema,
  password: z.string().optional(),
  confirm_password: z.string().optional(),
  role_ids: z.array(z.string()).min(1, 'Please select at least one role'),
  email_verified: z.boolean().optional(),
  is_active: z.boolean().optional(),
  provider_uid_input: z.string().optional(), // String input for provider_uid
}).refine((data) => {
  // If password is provided, it must meet requirements and match confirmation
  if (data.password && data.password.length > 0) {
    const passwordValidation = passwordSchema.safeParse(data.password);
    if (!passwordValidation.success) {
      return false;
    }
    return data.password === data.confirm_password;
  }
  // If no password provided, that's fine (no password change)
  return true;
}, {
  message: "Password must meet requirements and passwords must match",
  path: ["confirm_password"],
});

type EditUserForm = z.infer<typeof editUserSchema>;

interface EditUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  user: User | null;
}

export default function EditUserModal({ isOpen, onClose, onSuccess, user }: EditUserModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const updateUser = useUpdateUser();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch
  } = useForm<EditUserForm>({
    resolver: zodResolver(editUserSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
      email: '',
      role_ids: [],
      email_verified: false,
      is_active: true,
    }
  });

  const selectedRoleIds = watch('role_ids');

  const handleRoleChange = (roleIds: string[]) => {
    setValue('role_ids', roleIds, { shouldValidate: true });
  };

  // Populate form when user data changes
  useEffect(() => {
    if (user && isOpen) {
      setValue('first_name', user.first_name);
      setValue('last_name', user.last_name);
      setValue('email', user.email);
      setValue('role_ids', user.roles?.map(role => role.id) || []);
      setValue('email_verified', user.email_verified || false);
      setValue('is_active', user.is_active !== false); // Handle null as true
      // Convert provider_uid to string for input (empty string if null/undefined)
      const providerUidStr = user.provider_uid?.toString() || '';
      setValue('provider_uid_input', providerUidStr);
    }
  }, [user, isOpen, setValue]);

  const onSubmit = async (data: EditUserForm) => {
    if (!user) return;
    
    setIsSubmitting(true);

    try {
      // Parse provider_uid from string input to integer or null
      let provider_uid: number | null = null;
      if (data.provider_uid_input && data.provider_uid_input.trim()) {
        const parsed = parseInt(data.provider_uid_input.trim(), 10);
        if (!Number.isNaN(parsed) && parsed > 0) {
          provider_uid = parsed;
        }
      }

      const updateData: {
        first_name: string;
        last_name: string;
        email: string;
        role_ids: string[];
        email_verified?: boolean | undefined;
        is_active?: boolean | undefined;
        provider_uid?: number | null | undefined;
        password?: string | undefined;
      } = {
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email,
        role_ids: data.role_ids,
        email_verified: data.email_verified,
        is_active: data.is_active,
        ...(provider_uid !== null && { provider_uid }), // Only include if not null
      };

      // Only include password if it was provided
      if (data.password && data.password.length > 0) {
        updateData.password = data.password;
      }

      await updateUser.mutateAsync({
        id: user.id,
        data: updateData
      });

      // Show success toast
      setShowToast(true);

      // Reset form and close modal after a brief delay to show toast
      setTimeout(() => {
        reset();
        onClose();
        onSuccess?.();
        setShowToast(false);
      }, 2000);

    } catch (error) {
      console.error('Error updating user:', error);
      // Error handling is done by the mutation
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      reset();
      onClose();
    }
  };

  return (
    <Transition appear show={isOpen}>
      <Dialog as="div" onClose={handleClose}>
        <TransitionChild
          as="div"
          className="fixed inset-0 bg-gray-900/30 z-50 transition-opacity"
          enter="transition ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="transition ease-out duration-100"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
          aria-hidden="true"
        />
        <TransitionChild
          as="div"
          className="fixed inset-0 z-50 overflow-hidden flex items-center my-4 justify-center px-4 sm:px-6"
          enter="transition ease-in-out duration-200"
          enterFrom="opacity-0 translate-y-4"
          enterTo="opacity-100 translate-y-0"
          leave="transition ease-in-out duration-200"
          leaveFrom="opacity-100 translate-y-0"
          leaveTo="opacity-0 translate-y-4"
        >
          <DialogPanel className="bg-white dark:bg-gray-800 rounded-lg shadow-xl overflow-hidden max-w-md w-full max-h-full">
            {/* Modal header */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700/60">
              <div className="flex justify-between items-center">
                <Dialog.Title className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                  Edit User
                </Dialog.Title>
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isSubmitting}
                  className="text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400 disabled:opacity-50"
                >
                  <div className="sr-only">Close</div>
                  <svg className="fill-current" width="16" height="16" viewBox="0 0 16 16">
                    <path d="M7.95 6.536l4.242-4.243a1 1 0 111.415 1.414L9.364 7.95l4.243 4.242a1 1 0 11-1.415 1.415L7.95 9.364l-4.243 4.243a1 1 0 01-1.414-1.415L6.536 7.95 2.293 3.707a1 1 0 011.414-1.414L7.95 6.536z" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal content */}
            <div className="px-6 py-6">
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                {/* First Name */}
                <div>
                  <label htmlFor="edit_first_name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    First Name *
                  </label>
                  <input
                    type="text"
                    id="edit_first_name"
                    {...register('first_name')}
                    className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 ${
                      errors.first_name 
                        ? 'border-red-300 focus:ring-red-500 focus:border-red-500 dark:border-red-600' 
                        : 'border-gray-300 dark:border-gray-600'
                    }`}
                    placeholder="Enter first name"
                    disabled={isSubmitting}
                  />
                  {errors.first_name && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.first_name.message}</p>
                  )}
                </div>

                {/* Last Name */}
                <div>
                  <label htmlFor="edit_last_name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Last Name *
                  </label>
                  <input
                    type="text"
                    id="edit_last_name"
                    {...register('last_name')}
                    className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 ${
                      errors.last_name 
                        ? 'border-red-300 focus:ring-red-500 focus:border-red-500 dark:border-red-600' 
                        : 'border-gray-300 dark:border-gray-600'
                    }`}
                    placeholder="Enter last name"
                    disabled={isSubmitting}
                  />
                  {errors.last_name && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.last_name.message}</p>
                  )}
                </div>

                {/* Email */}
                <div>
                  <label htmlFor="edit_email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    id="edit_email"
                    {...register('email')}
                    className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 ${
                      errors.email 
                        ? 'border-red-300 focus:ring-red-500 focus:border-red-500 dark:border-red-600' 
                        : 'border-gray-300 dark:border-gray-600'
                    }`}
                    placeholder="Enter email address"
                    disabled={isSubmitting}
                  />
                  {errors.email && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.email.message}</p>
                  )}
                </div>

                {/* Password Reset */}
                <div>
                  <label htmlFor="edit_password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    New Password (leave blank to keep current)
                  </label>
                  <input
                    type="password"
                    id="edit_password"
                    {...register('password')}
                    className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 ${
                      errors.password 
                        ? 'border-red-300 focus:ring-red-500 focus:border-red-500 dark:border-red-600' 
                        : 'border-gray-300 dark:border-gray-600'
                    }`}
                    placeholder="Enter new password (optional)"
                    disabled={isSubmitting}
                  />
                  {errors.password && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.password.message}</p>
                  )}
                </div>

                {/* Confirm Password */}
                <div>
                  <label htmlFor="edit_confirm_password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    id="edit_confirm_password"
                    {...register('confirm_password')}
                    className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 ${
                      errors.confirm_password 
                        ? 'border-red-300 focus:ring-red-500 focus:border-red-500 dark:border-red-600' 
                        : 'border-gray-300 dark:border-gray-600'
                    }`}
                    placeholder="Confirm new password"
                    disabled={isSubmitting}
                  />
                  {errors.confirm_password && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.confirm_password.message}</p>
                  )}
                </div>

                {/* Roles */}
                <RoleSelector
                  selectedRoleIds={selectedRoleIds}
                  onChange={handleRoleChange}
                  error={errors.role_ids?.message}
                  disabled={isSubmitting}
                  required
                />

                {/* Provider UID - Analytics Security */}
                <div>
                  <label htmlFor="edit_provider_uid" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Provider UID
                    <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
                      (For Analytics Data Filtering)
                    </span>
                  </label>
                  <input
                    type="number"
                    id="edit_provider_uid"
                    {...register('provider_uid_input')}
                    className="w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
                    placeholder="Enter provider_uid (e.g., 42)"
                    disabled={isSubmitting}
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Optional. Only required for users with analytics:read:own permission.
                    Must match provider_uid from ih.agg_app_measures table in analytics database.
                    Leave empty if user does not need provider-level analytics access.
                  </p>
                  <details className="mt-2">
                    <summary className="text-xs text-violet-600 dark:text-violet-400 cursor-pointer hover:text-violet-700 dark:hover:text-violet-300">
                      💡 How to find provider_uid values
                    </summary>
                    <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-800 rounded text-xs font-mono">
                      <code className="text-gray-700 dark:text-gray-300">
                        SELECT DISTINCT provider_uid, provider_name<br />
                        FROM ih.agg_app_measures<br />
                        WHERE provider_uid IS NOT NULL<br />
                        ORDER BY provider_uid;
                      </code>
                    </div>
                  </details>
                  {errors.provider_uid_input && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.provider_uid_input.message}</p>
                  )}
                </div>

                {/* Email Verified */}
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="edit_email_verified"
                    {...register('email_verified')}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    disabled={isSubmitting}
                  />
                  <label htmlFor="edit_email_verified" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                    Email Verified
                  </label>
                </div>

                {/* Is Active */}
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="edit_is_active"
                    {...register('is_active')}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    disabled={isSubmitting}
                  />
                  <label htmlFor="edit_is_active" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                    Active User
                  </label>
                </div>

                {/* Error display */}
                {updateUser.error && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                    <p className="text-sm text-red-600 dark:text-red-400">
                      {updateUser.error instanceof Error ? updateUser.error.message : 'An error occurred while updating the user'}
                    </p>
                  </div>
                )}
              </form>
            </div>

            {/* Modal footer */}
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-gray-800/50">
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  onClick={handleSubmit(onSubmit)}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Updating User...' : 'Update User'}
                </button>
              </div>
            </div>
          </DialogPanel>
        </TransitionChild>
      </Dialog>

      {/* Success Toast */}
      <Toast
        type="success"
        open={showToast}
        setOpen={setShowToast}
        className="fixed bottom-4 right-4 z-50"
      >
        User updated successfully!
      </Toast>
    </Transition>
  );
}
