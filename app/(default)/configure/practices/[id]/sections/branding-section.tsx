'use client';

import type { QueryClient } from '@tanstack/react-query';
import type { UseFormWatch, UseFormSetValue } from 'react-hook-form';
import ColorPicker from '@/components/color-picker';
import ImageUpload from '@/components/image-upload';
import GalleryManager from '@/components/gallery-manager';
import type { PracticeFormData } from '../types';

interface BrandingSectionProps {
  practiceId: string;
  watch: UseFormWatch<PracticeFormData>;
  setValue: UseFormSetValue<PracticeFormData>;
  queryClient: QueryClient;
}

export function BrandingSection({
  practiceId,
  watch,
  setValue,
  queryClient,
}: BrandingSectionProps) {
  const logoUrl = watch('logo_url');
  const heroImageUrl = watch('hero_image_url');

  return (
    <>
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
                className="w-8 h-8 rounded border border-gray-300 dark:border-gray-600"
                style={{ backgroundColor: watch('primary_color') || '#00AEEF' }}
              />
              <div
                className="w-8 h-8 rounded border border-gray-300 dark:border-gray-600"
                style={{ backgroundColor: watch('secondary_color') || '#FFFFFF' }}
              />
              <div
                className="w-8 h-8 rounded border border-gray-300 dark:border-gray-600"
                style={{ backgroundColor: watch('accent_color') || '#44C0AE' }}
              />
            </div>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Color preview - see how they work together
            </span>
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
            {...(logoUrl ? { currentImage: logoUrl } : {})}
            onImageUploaded={() => {
              // Service layer has already updated the database
              // Standard pattern: invalidate and let React Query handle the rest
              queryClient.invalidateQueries({ queryKey: ['practice-attributes', practiceId] });
            }}
            practiceId={practiceId}
            type="logo"
            label="Practice Logo"
          />

          <ImageUpload
            {...(heroImageUrl ? { currentImage: heroImageUrl } : {})}
            onImageUploaded={() => {
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
    </>
  );
}
