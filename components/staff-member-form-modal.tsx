'use client';

import { useState, useEffect, useId } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCreateStaff, useUpdateStaff } from '@/lib/hooks/use-staff';
import { useQueryClient } from '@tanstack/react-query';
import ImageUpload from './image-upload';
import SpecialtiesInput from './specialties-input';
import EducationInput from './education-input';
import type { StaffMember, Education } from '@/lib/types/practice';

// Form validation schema
const staffFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255, 'Name too long'),
  title: z.string().max(255, 'Title too long').optional(),
  credentials: z.string().max(255, 'Credentials too long').optional(),
  bio: z.string().max(2000, 'Bio too long').optional(),
  photo_url: z.string().url('Invalid photo URL').max(500, 'Photo URL too long').optional().or(z.literal('')),
  specialties: z.array(z.string().max(255)).optional(),
  education: z.array(z.object({
    degree: z.string().max(255),
    school: z.string().max(255),
    year: z.string().max(4)
  })).optional(),
  is_active: z.boolean().optional()
});

type StaffFormData = z.infer<typeof staffFormSchema>;

interface StaffMemberFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  practiceId: string;
  onSuccess?: () => void;
}

export default function StaffMemberFormModal({
  isOpen,
  onClose,
  practiceId,
  onSuccess
}: StaffMemberFormModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const queryClient = useQueryClient();
  const uid = useId();
  const isEditing = false; // Modal is only for adding, not editing

  const createStaff = useCreateStaff();
  const updateStaff = useUpdateStaff();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isDirty }
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
      is_active: true
    }
  });

  const photoUrl = watch('photo_url');
  const specialties = watch('specialties') || [];
  const education = watch('education') || [];

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      reset({
        name: '',
        title: '',
        credentials: '',
        bio: '',
        photo_url: '',
        specialties: [],
        education: [],
        is_active: true
      });
    }
  }, [isOpen, reset]);

  const onSubmit = async (data: StaffFormData) => {
    setIsSubmitting(true);
    
    try {
      // Modal is only for adding new staff
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
        is_active: data.is_active ?? true
      });

      // Refresh staff data
      queryClient.invalidateQueries({ queryKey: ['staff', practiceId] });
      
      onSuccess?.();
      onClose();
      
    } catch (error) {
      console.error('Error creating staff member:', error);
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Add Staff Member
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Basic Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor={`${uid}-name`} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Full Name *
              </label>
              <input
                id={`${uid}-name`}
                type="text"
                {...register('name')}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Dr. Jane Smith"
              />
              {errors.name && (
                <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
              )}
            </div>

            <div>
              <label htmlFor={`${uid}-title`} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Title/Position
              </label>
              <input
                id={`${uid}-title`}
                type="text"
                {...register('title')}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Rheumatologist"
              />
              {errors.title && (
                <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>
              )}
            </div>

            <div>
              <label htmlFor={`${uid}-credentials`} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Credentials
              </label>
              <input
                id={`${uid}-credentials`}
                type="text"
                {...register('credentials')}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="MD, FACR"
              />
              {errors.credentials && (
                <p className="mt-1 text-sm text-red-600">{errors.credentials.message}</p>
              )}
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
              currentImage={photoUrl}
              onImageUploaded={handlePhotoUploaded}
              practiceId={practiceId}
              type="provider"
              label="Staff Photo"
            />
          </div>

          {/* Bio */}
          <div>
            <label htmlFor={`${uid}-bio`} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Biography
            </label>
            <textarea
              id={`${uid}-bio`}
              {...register('bio')}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Brief professional biography, experience, and approach to patient care..."
            />
            {errors.bio && (
              <p className="mt-1 text-sm text-red-600">{errors.bio.message}</p>
            )}
          </div>

          {/* Specialties */}
          <SpecialtiesInput
            value={specialties}
            onChange={(newSpecialties) => setValue('specialties', newSpecialties, { shouldDirty: true })}
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
              onClick={onClose}
              disabled={isSubmitting}
              className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit(onSubmit)}
              disabled={isSubmitting}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin h-4 w-4 mr-2 inline" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Creating...
                </>
              ) : (
                'Add Staff Member'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
