'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useAuth } from '@/components/auth/rbac-auth-provider';
import BusinessHoursEditor from '@/components/business-hours-editor';
import ColorPicker from '@/components/color-picker';
import ConditionsEditor from '@/components/conditions-editor';
import GalleryManager from '@/components/gallery-manager';
import ImageUpload from '@/components/image-upload';
import ServicesEditor from '@/components/services-editor';
import StaffListEmbedded from '@/components/staff-list-embedded';
import Toast from '@/components/toast';
import { apiClient } from '@/lib/api/client';
import type { SuccessResponse } from '@/lib/api/responses/success';
import type { Template } from '@/lib/hooks/use-templates';
import type {
  BusinessHours,
  Practice,
  PracticeAttributes,
  StaffMember,
} from '@/lib/types/practice';

interface PracticeFormData {
  // Practice Settings
  name: string;
  template_id: string;

  // Contact Information
  phone: string;
  email: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  zip_code: string;

  // Content
  about_text: string;
  mission_statement: string;
  welcome_message: string;

  // Services & Conditions
  services: string[];
  conditions_treated: string[];

  // Business Hours
  business_hours: BusinessHours;

  // Images
  logo_url: string;
  hero_image_url: string;
  gallery_images: string[];

  // SEO
  meta_title: string;
  meta_description: string;

  // Brand Colors
  primary_color: string;
  secondary_color: string;
  accent_color: string;
}

async function fetchPracticeAttributes(practiceId: string): Promise<PracticeAttributes> {
  const response = await apiClient.get<SuccessResponse<PracticeAttributes>>(
    `/api/practices/${practiceId}/attributes`
  );
  return response.data;
}

async function updatePracticeAttributes(
  practiceId: string,
  data: Omit<PracticeFormData, 'template_id' | 'name'>,
  _csrfToken?: string
): Promise<SuccessResponse<PracticeAttributes>> {
  console.log('🔄 updatePracticeAttributes called with practiceId:', practiceId);
  console.log('🔄 Raw data:', JSON.stringify(data, null, 2));

  // Clean the data - convert empty strings to undefined for optional fields
  const cleanedData = Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, value === '' ? undefined : value])
  );

  // Remove undefined values to avoid sending them
  const filteredData = Object.fromEntries(
    Object.entries(cleanedData).filter(([_, value]) => value !== undefined)
  );

  console.log('🔄 Cleaned data being sent:', JSON.stringify(filteredData, null, 2));

  const result = await apiClient.put<SuccessResponse<PracticeAttributes>>(
    `/api/practices/${practiceId}/attributes`,
    filteredData
  );
  console.log('✅ Update successful:', result);
  return result;
}

interface PracticeConfigFormProps {
  practice: Practice;
  attributes: PracticeAttributes;
  staff: StaffMember[];
  allTemplates: Template[];
}

export default function PracticeConfigForm({
  practice,
  attributes: initialAttributes,
  allTemplates,
}: PracticeConfigFormProps) {
  const practiceId = practice.practice_id;
  const queryClient = useQueryClient();
  const uid = useId();
  const { ensureCsrfToken } = useAuth();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [currentPractice, setCurrentPractice] = useState(practice);

  const { data: attributes, isLoading } = useQuery({
    queryKey: ['practice-attributes', practiceId],
    queryFn: () => fetchPracticeAttributes(practiceId),
    enabled: !!practiceId,
    initialData: initialAttributes,
  });

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = useForm<PracticeFormData>();

  const logoUrl = watch('logo_url');
  const heroImageUrl = watch('hero_image_url');

  // Reset form when fresh data loads - but only when data actually changes, not when form becomes dirty
  useEffect(() => {
    console.log('🔄 useEffect triggered - attributes changed');
    console.log('Attributes:', attributes);
    console.log('Practice:', practice);

    if (attributes) {
      const resetData = {
        name: currentPractice?.name || '',
        template_id: currentPractice?.template_id || '',
        phone: attributes.phone || '',
        email: attributes.email || '',
        address_line1: attributes.address_line1 || '',
        address_line2: attributes.address_line2 || '',
        city: attributes.city || '',
        state: attributes.state || '',
        zip_code: attributes.zip_code || '',
        about_text: attributes.about_text || '',
        mission_statement: attributes.mission_statement || '',
        welcome_message: attributes.welcome_message || '',
        services: attributes.services || [],
        conditions_treated: attributes.conditions_treated || [],
        business_hours: attributes.business_hours || {
          sunday: { closed: true },
          monday: { open: '09:00', close: '17:00', closed: false },
          tuesday: { open: '09:00', close: '17:00', closed: false },
          wednesday: { open: '09:00', close: '17:00', closed: false },
          thursday: { open: '09:00', close: '17:00', closed: false },
          friday: { open: '09:00', close: '17:00', closed: false },
          saturday: { closed: true },
        },
        logo_url: attributes.logo_url || '',
        hero_image_url: attributes.hero_image_url || '',
        gallery_images: attributes.gallery_images || [],
        meta_title: attributes.meta_title || '',
        meta_description: attributes.meta_description || '',
        primary_color: attributes.primary_color || '#00AEEF',
        secondary_color: attributes.secondary_color || '#FFFFFF',
        accent_color: attributes.accent_color || '#44C0AE',
      };

      console.log('📝 Resetting form with data:', resetData);
      reset(resetData);
    }
  }, [attributes, currentPractice, reset, practice]);

  const onSubmit = async (data: PracticeFormData) => {
    console.log('💾 Form submit started with data:', data);
    setIsSubmitting(true);

    // Track practice changes for later use
    const practiceChanges: Partial<Pick<PracticeFormData, 'name' | 'template_id'>> = {};
    if (data.name !== practice?.name) {
      practiceChanges.name = data.name;
    }
    if (data.template_id !== practice?.template_id) {
      practiceChanges.template_id = data.template_id;
    }

    try {
      // Get CSRF token once for all API calls
      const csrfToken = await ensureCsrfToken();

      // Update practice info (name, template) if changed
      if (Object.keys(practiceChanges).length > 0) {
        await apiClient.put(`/api/practices/${practiceId}`, practiceChanges);

        // Update local practice state to reflect changes
        setCurrentPractice((prev) => ({ ...prev, ...practiceChanges }));

        // Invalidate the practices list
        queryClient.invalidateQueries({ queryKey: ['practices'] });
      }

      // Update attributes (exclude name and template_id which are handled separately)
      const { name: _name, template_id: _template_id, ...attributesData } = data;

      // Make the API call (no optimistic update to avoid cache corruption)
      const result = await updatePracticeAttributes(
        practiceId,
        attributesData,
        csrfToken || undefined
      );

      // Extract actual data from API response
      const actualData = result.data || result;

      // Update cache with the actual data structure
      queryClient.setQueryData(['practice-attributes', practiceId], actualData);
      queryClient.invalidateQueries({ queryKey: ['practices'] });

      // Show success message
      setShowSuccessToast(true);
      setTimeout(() => setShowSuccessToast(false), 3000);
    } catch (error) {
      console.error('Error updating practice:', error);
      // Revert optimistic update on failure
      queryClient.invalidateQueries({ queryKey: ['practice-attributes', practiceId] });
      // Show error to user
      // TODO: Show toast notification for practice update error
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePreview = () => {
    // Open preview in new tab
    window.open(`/template-preview/${practiceId}`, '_blank');
  };

  if (isLoading) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
        <div className="flex items-center justify-center py-12">
          <svg className="animate-spin h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span className="ml-3 text-gray-600">Loading practice configuration...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">
          Practice Configuration
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Configure your practice information and website content
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        {/* Practice Name */}
        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
            Practice Information
          </h2>

          <div>
            <label
              htmlFor={`${uid}-name`}
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
            >
              Practice Name *
            </label>
            <input
              id={`${uid}-name`}
              type="text"
              {...register('name', { required: 'Practice name is required' })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter practice name"
            />
            {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>}
          </div>
        </div>

        {/* Template Selection */}
        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
            Website Template
          </h2>

          <div className="space-y-4">
            <div>
              <label
                htmlFor={`${uid}-template_id`}
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                Choose Template Design
              </label>
              <select
                id={`${uid}-template_id`}
                {...register('template_id', { required: 'Please select a template' })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select a template...</option>
                {allTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} - {template.description}
                  </option>
                ))}
              </select>
              {errors.template_id && (
                <p className="mt-1 text-sm text-red-600">{errors.template_id.message}</p>
              )}
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
              <p className="text-sm text-blue-700 dark:text-blue-300">
                💡 <strong>Tip:</strong> After saving, use the "Preview" button to see how your
                website looks with the new template.
              </p>
            </div>
          </div>
        </div>

        {/* Brand Colors */}
        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
            Brand Colors
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
            Customize your website colors to match your practice's brand identity.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <ColorPicker
              label="Primary Color"
              value={watch('primary_color')}
              onChange={(color) => setValue('primary_color', color, { shouldDirty: true })}
              defaultColor="#00AEEF"
              description="Main brand color for buttons and key elements"
            />
            <ColorPicker
              label="Secondary Color"
              value={watch('secondary_color')}
              onChange={(color) => setValue('secondary_color', color, { shouldDirty: true })}
              defaultColor="#FFFFFF"
              description="Background and supporting elements"
            />
            <ColorPicker
              label="Accent Color"
              value={watch('accent_color')}
              onChange={(color) => setValue('accent_color', color, { shouldDirty: true })}
              defaultColor="#44C0AE"
              description="Highlights and call-to-action elements"
            />
          </div>

          <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <div className="flex items-center space-x-3">
              <div className="flex space-x-2">
                <div
                  className="w-8 h-8 rounded color-preview-swatch"
                  data-color={watch('primary_color') || '#00AEEF'}
                />
                <div
                  className="w-8 h-8 rounded color-preview-swatch"
                  data-color={watch('secondary_color') || '#FFFFFF'}
                />
                <div
                  className="w-8 h-8 rounded color-preview-swatch"
                  data-color={watch('accent_color') || '#44C0AE'}
                />
              </div>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Color preview - see how they work together
              </span>
            </div>
          </div>
        </div>

        {/* Contact Information */}
        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
            Contact Information
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label
                htmlFor={`${uid}-phone`}
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                Phone Number
              </label>
              <input
                type="tel"
                id={`${uid}-phone`}
                {...register('phone')}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="(555) 123-4567"
              />
            </div>

            <div>
              <label
                htmlFor={`${uid}-email`}
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                Email Address
              </label>
              <input
                type="email"
                id={`${uid}-email`}
                {...register('email')}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="info@practice.com"
              />
            </div>

            <div>
              <label
                htmlFor={`${uid}-address_line1`}
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                Address Line 1
              </label>
              <input
                type="text"
                id={`${uid}-address_line1`}
                {...register('address_line1')}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="123 Medical Center Drive"
              />
            </div>

            <div>
              <label
                htmlFor={`${uid}-address_line2`}
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                Address Line 2
              </label>
              <input
                type="text"
                id={`${uid}-address_line2`}
                {...register('address_line2')}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Suite 200"
              />
            </div>

            <div>
              <label
                htmlFor={`${uid}-city`}
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                City
              </label>
              <input
                type="text"
                id={`${uid}-city`}
                {...register('city')}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Denver"
              />
            </div>

            <div>
              <label
                htmlFor={`${uid}-state`}
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                State
              </label>
              <input
                type="text"
                id={`${uid}-state`}
                {...register('state')}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="CO"
              />
            </div>

            <div>
              <label
                htmlFor={`${uid}-zip_code`}
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                ZIP Code
              </label>
              <input
                type="text"
                id={`${uid}-zip_code`}
                {...register('zip_code')}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="80202"
              />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
            Website Content
          </h2>

          <div className="space-y-6">
            <div>
              <label
                htmlFor={`${uid}-welcome_message`}
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                Welcome Message
              </label>
              <input
                type="text"
                id={`${uid}-welcome_message`}
                {...register('welcome_message')}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Welcome to our rheumatology practice"
              />
            </div>

            <div>
              <label
                htmlFor={`${uid}-about_text`}
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                About Text
              </label>
              <textarea
                id={`${uid}-about_text`}
                {...register('about_text')}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Describe your practice, experience, and approach to care..."
              />
            </div>

            <div>
              <label
                htmlFor={`${uid}-mission_statement`}
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                Mission Statement
              </label>
              <textarea
                id={`${uid}-mission_statement`}
                {...register('mission_statement')}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Your practice's mission and values..."
              />
            </div>
          </div>
        </div>

        {/* Services & Conditions */}
        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
            Services & Conditions
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <ServicesEditor
              services={watch('services') || []}
              onChange={(services) => setValue('services', services, { shouldDirty: true })}
              label="Services Offered"
              placeholder="Enter service (e.g., Rheumatoid Arthritis Treatment)"
            />

            <ConditionsEditor
              conditions={watch('conditions_treated') || []}
              onChange={(conditions) =>
                setValue('conditions_treated', conditions, { shouldDirty: true })
              }
              label="Conditions Treated"
              placeholder="Enter condition (e.g., Lupus)"
            />
          </div>
        </div>

        {/* Business Hours */}
        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
            Business Hours
          </h2>

          <BusinessHoursEditor
            businessHours={
              watch('business_hours') || {
                sunday: { closed: true },
                monday: { open: '09:00', close: '17:00', closed: false },
                tuesday: { open: '09:00', close: '17:00', closed: false },
                wednesday: { open: '09:00', close: '17:00', closed: false },
                thursday: { open: '09:00', close: '17:00', closed: false },
                friday: { open: '09:00', close: '17:00', closed: false },
                saturday: { closed: true },
              }
            }
            onChange={(hours) => setValue('business_hours', hours, { shouldDirty: true })}
            label="Practice Hours"
          />
        </div>

        {/* Images */}
        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
            Images & Branding
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <ImageUpload
              currentImage={logoUrl}
              onImageUploaded={(_url) => {
                // Service layer has already updated the database
                // Standard pattern: invalidate and let React Query handle the rest
                queryClient.invalidateQueries({ queryKey: ['practice-attributes', practiceId] });
              }}
              practiceId={practiceId}
              type="logo"
              label="Practice Logo"
            />

            <ImageUpload
              currentImage={heroImageUrl}
              onImageUploaded={(_url) => {
                // Service layer has already updated the database
                // Standard pattern: invalidate and let React Query handle the rest
                queryClient.invalidateQueries({ queryKey: ['practice-attributes', practiceId] });
              }}
              practiceId={practiceId}
              type="hero"
              label="Hero/Banner Image"
            />
          </div>

          {/* Gallery Images */}
          <div className="mt-8">
            <GalleryManager
              images={watch('gallery_images') || []}
              onImagesUpdated={(images) => {
                // Update form field immediately for responsive UI
                setValue('gallery_images', images, { shouldDirty: true });

                // Standard pattern: invalidate cache to keep data in sync
                queryClient.invalidateQueries({ queryKey: ['practice-attributes', practiceId] });
              }}
              practiceId={practiceId}
              label="Practice Gallery"
            />
          </div>
        </div>

        {/* Staff Management */}
        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6">
          <StaffListEmbedded practiceId={practiceId} />
        </div>

        {/* SEO */}
        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
            SEO Settings
          </h2>

          <div className="space-y-6">
            <div>
              <label
                htmlFor={`${uid}-meta_title`}
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                Meta Title
              </label>
              <input
                type="text"
                id={`${uid}-meta_title`}
                {...register('meta_title')}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Practice Name - Expert Rheumatology Care"
              />
            </div>

            <div>
              <label
                htmlFor={`${uid}-meta_description`}
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                Meta Description
              </label>
              <textarea
                id={`${uid}-meta_description`}
                {...register('meta_description')}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Brief description for search engines (160 characters max)..."
                maxLength={160}
              />
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-between">
          <button
            type="button"
            onClick={handlePreview}
            className="px-6 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center space-x-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
            <span>Preview Website</span>
          </button>

          <div className="flex space-x-4">
            <button
              type="button"
              className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isDirty || isSubmitting}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </form>

      {/* Success Toast */}
      <Toast
        type="success"
        open={showSuccessToast}
        setOpen={setShowSuccessToast}
        className="fixed bottom-4 right-4 z-50"
      >
        Practice configuration saved successfully!
      </Toast>
    </div>
  );
}
