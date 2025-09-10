'use client';

import { useForm } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import ImageUpload from '@/components/image-upload';
import type { Practice, PracticeAttributes, StaffMember, Template } from '@/lib/types/practice';

interface PracticeFormData {
  // Practice Settings
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
  
  // Images
  logo_url: string;
  hero_image_url: string;
  
  // SEO
  meta_title: string;
  meta_description: string;
}

async function fetchPracticeAttributes(practiceId: string) {
  const response = await fetch(`/api/practices/${practiceId}/attributes`);
  if (!response.ok) {
    throw new Error('Failed to fetch practice attributes');
  }
  return response.json();
}

async function updatePracticeAttributes(practiceId: string, data: Omit<PracticeFormData, 'template_id'>) {
  const response = await fetch(`/api/practices/${practiceId}/attributes`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    throw new Error('Failed to update practice attributes');
  }
  
  return response.json();
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
  staff, 
  allTemplates 
}: PracticeConfigFormProps) {
  const practiceId = practice.practice_id;
  const queryClient = useQueryClient();

  const { data: attributes, isLoading } = useQuery({
    queryKey: ['practice-attributes', practiceId],
    queryFn: () => fetchPracticeAttributes(practiceId),
    enabled: !!practiceId,
    initialData: initialAttributes,
  });

  const updateAttributes = useMutation({
    mutationFn: (data: Omit<PracticeFormData, 'template_id'>) => updatePracticeAttributes(practiceId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['practice-attributes', practiceId] });
      queryClient.invalidateQueries({ queryKey: ['practices'] });
    },
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

  // Reset form when data loads
  useEffect(() => {
    if (attributes) {
      reset({
        template_id: practice?.template_id || '',
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
        logo_url: attributes.logo_url || '',
        hero_image_url: attributes.hero_image_url || '',
        meta_title: attributes.meta_title || '',
        meta_description: attributes.meta_description || '',
      });
    }
  }, [attributes, practice, reset]);

  const onSubmit = async (data: PracticeFormData) => {
    // Update practice template if changed
    if (data.template_id !== practice?.template_id) {
      try {
        const response = await fetch(`/api/practices/${practiceId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ template_id: data.template_id }),
        });
        if (!response.ok) throw new Error('Failed to update practice');
      } catch (error) {
        console.error('Error updating practice:', error);
        return;
      }
    }

    // Update attributes
    const { template_id, ...attributesData } = data;
    updateAttributes.mutate(attributesData);
  };

  if (isLoading) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
        <div className="flex items-center justify-center py-12">
          <svg className="animate-spin h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
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
        {/* Template Selection */}
        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
            Website Template
          </h2>
          
          <div className="space-y-4">
            <div>
              <label htmlFor="template_id" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Choose Template Design
              </label>
              <select
                {...register('template_id', { required: 'Please select a template' })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select a template...</option>
                {allTemplates.map((template) => (
                  <option key={template.template_id} value={template.template_id}>
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
                💡 <strong>Tip:</strong> After saving, use the "Preview" button to see how your website looks with the new template.
              </p>
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
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Phone Number
              </label>
              <input
                type="tel"
                {...register('phone')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="(555) 123-4567"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Email Address
              </label>
              <input
                type="email"
                {...register('email')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="info@practice.com"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Address Line 1
              </label>
              <input
                type="text"
                {...register('address_line1')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="123 Medical Center Drive"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Address Line 2
              </label>
              <input
                type="text"
                {...register('address_line2')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Suite 200"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                City
              </label>
              <input
                type="text"
                {...register('city')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Denver"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                State
              </label>
              <input
                type="text"
                {...register('state')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="CO"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                ZIP Code
              </label>
              <input
                type="text"
                {...register('zip_code')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Welcome Message
              </label>
              <input
                type="text"
                {...register('welcome_message')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Welcome to our rheumatology practice"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                About Text
              </label>
              <textarea
                {...register('about_text')}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Describe your practice, experience, and approach to care..."
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Mission Statement
              </label>
              <textarea
                {...register('mission_statement')}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Your practice's mission and values..."
              />
            </div>
          </div>
        </div>

        {/* Images */}
        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
            Images & Branding
          </h2>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <ImageUpload
              currentImage={logoUrl}
              onImageUploaded={(url) => setValue('logo_url', url, { shouldDirty: true })}
              practiceId={practiceId}
              type="logo"
              label="Practice Logo"
            />
            
            <ImageUpload
              currentImage={heroImageUrl}
              onImageUploaded={(url) => setValue('hero_image_url', url, { shouldDirty: true })}
              practiceId={practiceId}
              type="hero"
              label="Hero/Banner Image"
            />
          </div>
        </div>

        {/* SEO */}
        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
            SEO Settings
          </h2>
          
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Meta Title
              </label>
              <input
                type="text"
                {...register('meta_title')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Practice Name - Expert Rheumatology Care"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Meta Description
              </label>
              <textarea
                {...register('meta_description')}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Brief description for search engines (160 characters max)..."
                maxLength={160}
              />
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end space-x-4">
          <button
            type="button"
            className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            disabled={updateAttributes.isPending}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!isDirty || updateAttributes.isPending}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {updateAttributes.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>

      {/* Success/Error Messages */}
      {updateAttributes.isSuccess && (
        <div className="fixed bottom-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg">
          Practice configuration saved successfully!
        </div>
      )}
      
      {updateAttributes.isError && (
        <div className="fixed bottom-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg">
          Error saving configuration. Please try again.
        </div>
      )}
    </div>
  );
}
