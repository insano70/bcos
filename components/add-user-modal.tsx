'use client';

import { useState } from 'react';
import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react';
// Inline SVG for X mark icon
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCreateUser } from '@/lib/hooks/use-users';
import RoleSelector from './role-selector';
import Toast from './toast';

// Form validation schema
const createUserSchema = z.object({
  first_name: z.string().min(1, 'First name is required').max(100, 'First name must be less than 100 characters'),
  last_name: z.string().min(1, 'Last name is required').max(100, 'Last name must be less than 100 characters'),
  email: z.string().email('Please enter a valid email address'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/^(?=.*[a-z])/, 'Must contain at least one lowercase letter')
    .regex(/^(?=.*[A-Z])/, 'Must contain at least one uppercase letter')
    .regex(/^(?=.*\d)/, 'Must contain at least one number')
    .regex(/^(?=.*[@$!%*?&])/, 'Must contain at least one special character'),
  confirm_password: z.string(),
  role_ids: z.array(z.string()).min(1, 'Please select at least one role'),
  email_verified: z.boolean().optional(),
  is_active: z.boolean().optional(),
}).refine((data) => data.password === data.confirm_password, {
  message: "Passwords don't match",
  path: ["confirm_password"],
});

type CreateUserForm = z.infer<typeof createUserSchema>;

interface AddUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function AddUserModal({ isOpen, onClose, onSuccess }: AddUserModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const createUser = useCreateUser();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch
  } = useForm<CreateUserForm>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      email_verified: false,
      is_active: true,
      role_ids: []
    }
  });

  const selectedRoleIds = watch('role_ids');

  const handleRoleChange = (roleIds: string[]) => {
    setValue('role_ids', roleIds, { shouldValidate: true });
  };

  const onSubmit = async (data: CreateUserForm) => {
    setIsSubmitting(true);

    try {
      const userData = {
        email: data.email,
        password: data.password,
        first_name: data.first_name,
        last_name: data.last_name,
        email_verified: data.email_verified || false,
        is_active: data.is_active || true,
        role_ids: data.role_ids
      };

      await createUser.mutateAsync(userData);

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
      console.error('Error creating user:', error);
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
                  Add New User
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
                  <label htmlFor="first_name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    First Name *
                  </label>
                  <input
                    type="text"
                    id="first_name"
                    {...register('first_name')}
                    className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                      errors.first_name ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : 'border-gray-300'
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
                  <label htmlFor="last_name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Last Name *
                  </label>
                  <input
                    type="text"
                    id="last_name"
                    {...register('last_name')}
                    className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                      errors.last_name ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : 'border-gray-300'
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
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    id="email"
                    {...register('email')}
                    className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                      errors.email ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="Enter email address"
                    disabled={isSubmitting}
                  />
                  {errors.email && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.email.message}</p>
                  )}
                </div>

                {/* Password */}
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Password *
                  </label>
                  <input
                    type="password"
                    id="password"
                    {...register('password')}
                    className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                      errors.password ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="Enter password"
                    disabled={isSubmitting}
                  />
                  {errors.password && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.password.message}</p>
                  )}
                </div>

                {/* Confirm Password */}
                <div>
                  <label htmlFor="confirm_password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Confirm Password *
                  </label>
                  <input
                    type="password"
                    id="confirm_password"
                    {...register('confirm_password')}
                    className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                      errors.confirm_password ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="Confirm password"
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

                {/* Email Verified */}
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="email_verified"
                    {...register('email_verified')}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    disabled={isSubmitting}
                  />
                  <label htmlFor="email_verified" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                    Email Verified
                  </label>
                </div>

                {/* Is Active */}
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="is_active"
                    {...register('is_active')}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    disabled={isSubmitting}
                  />
                  <label htmlFor="is_active" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                    Active User
                  </label>
                </div>

                {/* Error display */}
                {createUser.error && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                    <p className="text-sm text-red-600 dark:text-red-400">
                      {createUser.error instanceof Error ? createUser.error.message : 'An error occurred while creating the user'}
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
                  {isSubmitting ? 'Creating User...' : 'Create User'}
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
        className="fixed top-4 right-4 z-50"
      >
        User created successfully!
      </Toast>
    </Transition>
  );
}
