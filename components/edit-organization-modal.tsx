'use client';

import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  type Organization,
  useOrganizations,
  useUpdateOrganization,
} from '@/lib/hooks/use-organizations';
import { createSafeTextSchema } from '@/lib/validations/sanitization';
import Toast from './toast';

const editOrganizationSchema = z.object({
  name: createSafeTextSchema(1, 255, 'Organization name'),
  slug: z
    .string()
    .min(1, 'Slug is required')
    .max(100, 'Slug must not exceed 100 characters')
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens')
    .transform((val) => val.toLowerCase()),
  parent_organization_id: z.string().uuid().optional().nullable(),
  practice_uids_input: z.string().optional(), // Comma-separated string input
  is_active: z.boolean().optional(),
});

type EditOrganizationForm = z.infer<typeof editOrganizationSchema>;

interface EditOrganizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  organization: Organization | null;
}

interface HierarchicalOrg {
  id: string;
  name: string;
  level: number;
  parent_organization_id?: string | null | undefined;
}

export default function EditOrganizationModal({
  isOpen,
  onClose,
  onSuccess,
  organization,
}: EditOrganizationModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const updateOrganization = useUpdateOrganization();
  const { data: organizations = [] } = useOrganizations();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm<EditOrganizationForm>({
    resolver: zodResolver(editOrganizationSchema),
    defaultValues: {
      name: '',
      slug: '',
      parent_organization_id: null,
      is_active: true,
    },
  });

  // Build hierarchical organization list
  const hierarchicalOrgs = useMemo(() => {
    // Filter active organizations and exclude current org being edited
    const activeOrgs = organizations.filter((org) => {
      if (!org.is_active) return false;
      if (organization && org.id === organization.id) return false;
      return true;
    });

    // Check if an org is a descendant of the current org being edited
    const isDescendantOfCurrent = (orgId: string): boolean => {
      if (!organization) return false;
      const org = activeOrgs.find((o) => o.id === orgId);
      if (!org) return false;
      if (!org.parent_organization_id) return false;
      if (org.parent_organization_id === organization.id) return true;
      return isDescendantOfCurrent(org.parent_organization_id);
    };

    // Build hierarchy recursively
    const buildHierarchy = (
      orgs: Organization[],
      parentId: string | null | undefined = null,
      level = 0
    ): HierarchicalOrg[] => {
      const children = orgs.filter((org) => {
        // Match parent - handle null/undefined comparison properly
        const matchesParent =
          parentId === null || parentId === undefined
            ? org.parent_organization_id === null || org.parent_organization_id === undefined
            : org.parent_organization_id === parentId;
        const notDescendant = !isDescendantOfCurrent(org.id);
        return matchesParent && notDescendant;
      });

      return children.flatMap((org) => {
        const item: HierarchicalOrg = {
          id: org.id,
          name: org.name,
          level,
          parent_organization_id: org.parent_organization_id,
        };

        const descendants = buildHierarchy(orgs, org.id, level + 1);
        return [item, ...descendants];
      });
    };

    return buildHierarchy(activeOrgs);
  }, [organizations, organization]);

  useEffect(() => {
    if (organization && isOpen) {
      setValue('name', organization.name);
      setValue('slug', organization.slug);
      setValue('parent_organization_id', organization.parent_organization_id ?? null);
      // Convert practice_uids array to comma-separated string for input
      const practiceUidsStr = organization.practice_uids?.join(', ') || '';
      setValue('practice_uids_input', practiceUidsStr);
      setValue('is_active', organization.is_active !== false);
    }
  }, [organization, isOpen, setValue]);

  const onSubmit = async (data: EditOrganizationForm) => {
    if (!organization) return;

    setIsSubmitting(true);

    try {
      // Parse practice_uids from comma-separated string to integer array
      let practice_uids: number[] = [];
      if (data.practice_uids_input?.trim()) {
        practice_uids = data.practice_uids_input
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
          .map((s) => parseInt(s, 10))
          .filter((n) => !Number.isNaN(n) && n > 0);
      }

      await updateOrganization.mutateAsync({
        id: organization.id,
        data: {
          name: data.name,
          slug: data.slug,
          parent_organization_id: data.parent_organization_id ?? null,
          practice_uids,
          is_active: data.is_active ?? true,
        },
      });

      setShowToast(true);

      setTimeout(() => {
        reset();
        onClose();
        onSuccess?.();
        setShowToast(false);
      }, 2000);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error updating organization:', error);
      }
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
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700/60">
              <div className="flex justify-between items-center">
                <Dialog.Title className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                  Edit Organization
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

            <form onSubmit={handleSubmit(onSubmit)}>
              <div className="px-6 py-4 space-y-4">
                <div>
                  <label
                    htmlFor="edit-name"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >
                    Organization Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="edit-name"
                    type="text"
                    {...register('name')}
                    disabled={isSubmitting}
                    className="form-input w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 disabled:opacity-50"
                  />
                  {errors.name && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                      {errors.name.message}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="edit-slug"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >
                    Slug <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="edit-slug"
                    type="text"
                    {...register('slug')}
                    disabled={isSubmitting}
                    className="form-input w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 disabled:opacity-50"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    URL-friendly identifier (lowercase, numbers, hyphens only)
                  </p>
                  {errors.slug && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                      {errors.slug.message}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="edit-parent_organization_id"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >
                    Parent Organization
                  </label>
                  <select
                    id="edit-parent_organization_id"
                    {...register('parent_organization_id')}
                    disabled={isSubmitting}
                    className="form-select w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 disabled:opacity-50"
                  >
                    <option value="">None (Root Organization)</option>
                    {hierarchicalOrgs.map((org) => (
                      <option key={org.id} value={org.id}>
                        {'\u00A0'.repeat(org.level * 4)}
                        {org.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Optional: Select a parent organization to create a hierarchy
                  </p>
                  {errors.parent_organization_id && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                      {errors.parent_organization_id.message}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="edit-practice_uids"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >
                    Practice UIDs
                    <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
                      (For Analytics Data Filtering)
                    </span>
                  </label>
                  <input
                    id="edit-practice_uids"
                    type="text"
                    {...register('practice_uids_input')}
                    disabled={isSubmitting}
                    placeholder="100, 101, 102"
                    className="form-input w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 disabled:opacity-50"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Comma-separated list of practice_uid values from analytics database
                    (ih.agg_app_measures). Users in this organization can only see data where
                    practice_uid matches these values. Leave empty to restrict all analytics access
                    (fail-closed security).
                  </p>
                  <details className="mt-2">
                    <summary className="text-xs text-violet-600 dark:text-violet-400 cursor-pointer hover:text-violet-700 dark:hover:text-violet-300">
                      💡 How to find practice_uid values
                    </summary>
                    <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-800 rounded text-xs font-mono">
                      <code className="text-gray-700 dark:text-gray-300">
                        SELECT DISTINCT practice_uid, practice
                        <br />
                        FROM ih.agg_app_measures
                        <br />
                        ORDER BY practice_uid;
                      </code>
                    </div>
                  </details>
                  {errors.practice_uids_input && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                      {errors.practice_uids_input.message}
                    </p>
                  )}
                </div>

                <div className="flex items-center">
                  <input
                    id="edit-is_active"
                    type="checkbox"
                    {...register('is_active')}
                    disabled={isSubmitting}
                    className="form-checkbox h-4 w-4 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 rounded disabled:opacity-50"
                  />
                  <label
                    htmlFor="edit-is_active"
                    className="ml-2 text-sm text-gray-700 dark:text-gray-300"
                  >
                    Active
                  </label>
                </div>
              </div>

              <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700/60 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isSubmitting}
                  className="btn border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 text-gray-600 dark:text-gray-300 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </DialogPanel>
        </TransitionChild>
      </Dialog>

      <Toast type="success" open={showToast} setOpen={setShowToast}>
        Organization updated successfully!
      </Toast>
    </Transition>
  );
}
