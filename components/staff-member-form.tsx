'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useCreateStaff, useUpdateStaff } from '@/lib/hooks/use-staff';
import type { StaffMember } from '@/lib/types/practice';
import { FormError } from '@/components/ui/form-error';
import { FormLabel } from '@/components/ui/form-label';
import { Spinner } from '@/components/ui/spinner';
import EducationInput from './education-input';
import ImageUpload from './image-upload';
import SpecialtiesInput from './specialties-input';
import Toast from './toast';

// Form validation schema
const staffFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255, 'Name too long'),
  title: z.string().max(255, 'Title too long').optional(),
  credentials: z.string().max(255, 'Credentials too long').optional(),
  bio: z.string().max(2000, 'Bio too long').optional(),
  photo_url: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (!val || val === '') return true; // Allow empty/undefined
        // Allow relative URLs (starting with /) or absolute URLs
        return val.startsWith('/') || z.string().url().safeParse(val).success;
      },
      {
        message: 'Invalid photo URL',
      }
    ),
  specialties: z.array(z.string().max(255)).optional(),
  education: z
    .array(
      z.object({
        degree: z.string().max(255),
        school: z.string().max(255),
        year: z.string().max(4),
      })
    )
    .optional(),
  is_active: z.boolean().optional(),
});

type StaffFormData = z.infer<typeof staffFormSchema>;

interface StaffMemberFormProps {
  practiceId: string;
  staffMember?: StaffMember; // If provided, we're editing; otherwise creating
  mode: 'add' | 'edit';
}

export default function StaffMemberForm({ practiceId, staffMember, mode }: StaffMemberFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const queryClient = useQueryClient();
  const router = useRouter();
  const uid = useId();
  const isEditing = mode === 'edit' && !!staffMember;

  const createStaff = useCreateStaff();
  const updateStaff = useUpdateStaff();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = useForm<StaffFormData>({
    resolver: zodResolver(staffFormSchema),
    defaultValues: {
      name: '',
      title: '',
      credentials: '',
      bio: '',
      photo_url: '',
      specialties: [],
      education: [],
      is_active: true,
    },
  });

  const photoUrl = watch('photo_url');
  const specialties = watch('specialties') || [];
  const education = watch('education') || [];

  const showToast = (message: string, type: 'success' | 'error') => {
    setToastMessage(message);
    setToastType(type);
    setToastOpen(true);
  };

  // Reset form when staff member changes
  useEffect(() => {
    if (staffMember) {
      reset({
        name: staffMember.name,
        title: staffMember.title || '',
        credentials: staffMember.credentials || '',
        bio: staffMember.bio || '',
        photo_url: staffMember.photo_url || '',
        specialties: staffMember.specialties || [],
        education: staffMember.education || [],
        is_active: staffMember.is_active,
      });
    } else {
      reset({
        name: '',
        title: '',
        credentials: '',
        bio: '',
        photo_url: '',
        specialties: [],
        education: [],
        is_active: true,
      });
    }
  }, [staffMember, reset]);

  const onSubmit = async (data: StaffFormData) => {
    setIsSubmitting(true);

    try {
      if (isEditing && staffMember) {
        const updateData = {
          name: data.name || undefined,
          title: data.title || undefined,
          credentials: data.credentials || undefined,
          bio: data.bio || undefined,
          photo_url: data.photo_url || undefined,
          specialties: data.specialties || undefined,
          education: data.education || undefined,
          is_active: data.is_active,
        };

        await updateStaff.mutateAsync({
          practiceId,
          staffId: staffMember.staff_id,
          data: updateData,
        });
        showToast('Staff member updated successfully', 'success');
      } else {
        await createStaff.mutateAsync({
          practice_id: practiceId,
          name: data.name,
          title: data.title || undefined,
          credentials: data.credentials || undefined,
          bio: data.bio || undefined,
          photo_url: data.photo_url || undefined,
          specialties: data.specialties || undefined,
          education: data.education || undefined,
          // display_order will be automatically assigned by the API
          is_active: data.is_active ?? true,
        });
        showToast('Staff member created successfully', 'success');
      }

      // Refresh staff data
      queryClient.invalidateQueries({ queryKey: ['staff', practiceId] });

      // Navigate back to practice configuration after a short delay to show the toast
      setTimeout(() => {
        router.push(`/configure/practices/${practiceId}`);
      }, 1500);
    } catch (error) {
      // Handle the error properly - avoid instanceof check that's failing
      let errorMessage = 'Unknown error occurred';
      if (error && typeof error === 'object' && 'message' in error) {
        errorMessage = String(error.message);
      } else if (typeof error === 'string') {
        errorMessage = error;
      }

      showToast(`Error saving staff member: ${errorMessage}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePhotoUploaded = (url: string) => {
    // Photo is automatically saved to database by upload service
    // Immediately update the form field to show the new image
    setValue('photo_url', url, { shouldDirty: true });

    // Also refresh staff data in the background
    queryClient.invalidateQueries({ queryKey: ['staff', practiceId] });
  };

  const handleCancel = () => {
    router.push(`/configure/practices/${practiceId}`);
  };

  return (
    <>
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl">
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6">
          {/* Basic Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <FormLabel htmlFor={`${uid}-name`} required className="mb-2">
                Full Name
              </FormLabel>
              <input
                id={`${uid}-name`}
                type="text"
                {...register('name')}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Dr. Jane Smith"
              />
              <FormError>{errors.name?.message}</FormError>
            </div>

            <div>
              <FormLabel htmlFor={`${uid}-title`} className="mb-2">
                Title/Position
              </FormLabel>
              <input
                id={`${uid}-title`}
                type="text"
                {...register('title')}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Rheumatologist"
              />
              <FormError>{errors.title?.message}</FormError>
            </div>

            <div>
              <FormLabel htmlFor={`${uid}-credentials`} className="mb-2">
                Credentials
              </FormLabel>
              <input
                id={`${uid}-credentials`}
                type="text"
                {...register('credentials')}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="MD, FACR"
              />
              <FormError>{errors.credentials?.message}</FormError>
            </div>

            <div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  {...register('is_active')}
                  className="form-checkbox h-4 w-4 text-blue-600 rounded"
                />
                <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">Active</span>
              </label>
            </div>
          </div>

          {/* Photo Upload */}
          <div>
            <ImageUpload
              {...(photoUrl && { currentImage: photoUrl })}
              onImageUploaded={handlePhotoUploaded}
              practiceId={practiceId}
              {...(staffMember?.staff_id && { staffId: staffMember.staff_id })}
              type="provider"
              label="Staff Photo"
            />
          </div>

          {/* Bio */}
          <div>
            <FormLabel htmlFor={`${uid}-bio`} className="mb-2">
              Biography
            </FormLabel>
            <textarea
              id={`${uid}-bio`}
              {...register('bio')}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Brief professional biography, experience, and approach to patient care..."
            />
            <FormError>{errors.bio?.message}</FormError>
          </div>

          {/* Specialties */}
          <SpecialtiesInput
            value={specialties}
            onChange={(newSpecialties) =>
              setValue('specialties', newSpecialties, { shouldDirty: true })
            }
            label="Medical Specialties"
            placeholder="Enter specialty (e.g., Lupus, Rheumatoid Arthritis)"
          />

          {/* Education */}
          <EducationInput
            value={education}
            onChange={(newEducation) => setValue('education', newEducation, { shouldDirty: true })}
            label="Education & Training"
          />

          {/* Actions */}
          <div className="flex justify-end gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={handleCancel}
              disabled={isSubmitting}
              className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || (!isDirty && isEditing)}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Spinner
                    sizeClassName="w-4 h-4"
                    borderClassName="border-2"
                    trackClassName="border-current opacity-25"
                    indicatorClassName="border-current opacity-75"
                    className="mr-2 inline"
                  />
                  {isEditing ? 'Updating...' : 'Creating...'}
                </>
              ) : isEditing ? (
                'Update Staff Member'
              ) : (
                'Add Staff Member'
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Toast Notifications */}
      <Toast
        type={toastType}
        open={toastOpen}
        setOpen={setToastOpen}
        className="fixed bottom-4 right-4 z-50"
      >
        {toastMessage}
      </Toast>
    </>
  );
}
