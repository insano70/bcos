'use client';

import type { QueryClient } from '@tanstack/react-query';
import type { UseFormWatch, UseFormSetValue, UseFormRegister } from 'react-hook-form';
import { Card } from '@/components/ui/card';
import ColorPicker from '@/components/color-picker';
import ImageUpload from '@/components/image-upload';
import GalleryManager from '@/components/gallery-manager';
import TemplateColorPreview from '@/components/template-color-preview';
import ColorContrastBadge from '@/components/color-contrast-badge';
import ColorPaletteSelector from '@/components/color-palette-selector';
import { validateBrandColors, suggestAccessibleColor } from '@/lib/utils/color-contrast';
import type { PracticeFormData } from '../types';

interface BrandingSectionProps {
  practiceId: string;
  practiceName: string;
  watch: UseFormWatch<PracticeFormData>;
  setValue: UseFormSetValue<PracticeFormData>;
  queryClient: QueryClient;
  register: UseFormRegister<PracticeFormData>;
}

export function BrandingSection({
  practiceId,
  practiceName,
  watch,
  setValue,
  queryClient,
  register,
}: BrandingSectionProps) {
  const logoUrl = watch('logo_url');
  const heroImageUrl = watch('hero_image_url');
  const primaryColor = watch('primary_color') || '#00AEEF';
  const secondaryColor = watch('secondary_color') || '#FFFFFF';
  const accentColor = watch('accent_color') || '#44C0AE';

  // Validate color contrast
  const validation = validateBrandColors(primaryColor, secondaryColor, accentColor);

  return (
    <>
      {/* Brand Colors */}
      <Card>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
          Brand Colors
        </h2>

        {/* Color Palette Selector - Collapsible */}
        <div className="mb-6">
          <ColorPaletteSelector
            onSelectPalette={(colors) => {
              setValue('primary_color', colors.primary, { shouldDirty: true });
              setValue('secondary_color', colors.secondary, { shouldDirty: true });
              setValue('accent_color', colors.accent, { shouldDirty: true });
            }}
            currentColors={{
              primary: primaryColor,
              secondary: secondaryColor,
              accent: accentColor,
            }}
          />
        </div>

        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2 mt-6">
          Custom Colors
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Fine-tune individual colors or use a palette template above.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Color Pickers */}
          <div className="space-y-6">
            <ColorPicker
              label="Primary Color"
              value={primaryColor}
              onChange={(color) => setValue('primary_color', color, { shouldDirty: true })}
              defaultColor="#00AEEF"
              description="Main brand color for buttons and key elements"
            />
            <ColorPicker
              label="Secondary Color"
              value={secondaryColor}
              onChange={(color) => setValue('secondary_color', color, { shouldDirty: true })}
              defaultColor="#FFFFFF"
              description="Background and supporting elements"
            />
            <ColorPicker
              label="Accent Color"
              value={accentColor}
              onChange={(color) => setValue('accent_color', color, { shouldDirty: true })}
              defaultColor="#44C0AE"
              description="Highlights and call-to-action elements"
            />

            {/* Accessibility Warning */}
            {validation.hasIssues && (
              <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                <div className="flex items-start gap-3">
                  <span className="text-xl">⚠️</span>
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-200 mb-2">
                      Accessibility Warning
                    </h4>
                    <p className="text-xs text-amber-800 dark:text-amber-300 mb-3">
                      Some color combinations may be difficult to read. Consider adjusting for better
                      accessibility.
                    </p>
                    <div className="space-y-2">
                      {!validation.whiteOnPrimary.passAA && (
                        <button
                          type="button"
                          onClick={() => {
                            const suggestion = suggestAccessibleColor(primaryColor, '#FFFFFF');
                            if (suggestion) {
                              setValue('primary_color', suggestion, { shouldDirty: true });
                            }
                          }}
                          className="text-xs text-amber-900 dark:text-amber-200 hover:underline"
                        >
                          → Fix primary color contrast
                        </button>
                      )}
                      {!validation.whiteOnAccent.passAA && (
                        <button
                          type="button"
                          onClick={() => {
                            const suggestion = suggestAccessibleColor(accentColor, '#FFFFFF');
                            if (suggestion) {
                              setValue('accent_color', suggestion, { shouldDirty: true });
                            }
                          }}
                          className="block text-xs text-amber-900 dark:text-amber-200 hover:underline"
                        >
                          → Fix accent color contrast
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Live Preview */}
          <div>
            <TemplateColorPreview
              primaryColor={primaryColor}
              secondaryColor={secondaryColor}
              accentColor={accentColor}
              templateName={practiceName}
            />
          </div>
        </div>

        {/* Contrast Validation Details */}
        <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Color Contrast (WCAG AA Standard)
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                White text on Primary
              </p>
              <ColorContrastBadge
                level={validation.whiteOnPrimary.level}
                ratio={validation.whiteOnPrimary.ratio}
                compact
              />
            </div>
            <div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                White text on Accent
              </p>
              <ColorContrastBadge
                level={validation.whiteOnAccent.level}
                ratio={validation.whiteOnAccent.ratio}
                compact
              />
            </div>
            <div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                Primary on White
              </p>
              <ColorContrastBadge
                level={validation.primaryOnWhite.level}
                ratio={validation.primaryOnWhite.ratio}
                compact
              />
            </div>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
            WCAG AA requires 4.5:1 contrast for normal text, 3:1 for large text. AAA is 7:1 / 4.5:1.
          </p>
        </div>
      </Card>

      {/* Images */}
      <Card>
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

        {/* Hero Overlay Opacity Control */}
        {heroImageUrl && (
          <div className="mt-6 p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Hero Image White Overlay
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              Control how much white overlay is applied to the hero background image. Higher values
              fade the image to white, making text easier to read. Lower values show more of the image.
            </p>
            <input
              type="hidden"
              {...register('hero_overlay_opacity', { valueAsNumber: true })}
            />
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={Math.round((watch('hero_overlay_opacity') ?? 0.9) * 100)}
              onChange={(e) =>
                setValue('hero_overlay_opacity', Number(e.target.value) / 100, {
                  shouldDirty: true,
                })
              }
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
            />
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-2">
              <span>0% (Image Visible)</span>
              <span className="font-semibold text-gray-700 dark:text-gray-300">
                {Math.round((watch('hero_overlay_opacity') ?? 0.9) * 100)}%
              </span>
              <span>100% (White)</span>
            </div>
          </div>
        )}

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
      </Card>
    </>
  );
}
