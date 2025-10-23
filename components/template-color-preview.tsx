'use client';

import { hexToRgb, hexToRgba } from '@/lib/utils/color-utils';

interface TemplateColorPreviewProps {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  templateName?: string;
}

/**
 * Live preview component showing how colors look in template context
 * Updates instantly as user changes colors without saving
 */
export default function TemplateColorPreview({
  primaryColor,
  secondaryColor,
  accentColor,
  templateName = 'Your Practice',
}: TemplateColorPreviewProps) {
  // Use inline CSS custom properties scoped to this component only
  const primary = primaryColor || '#00AEEF';
  const secondary = secondaryColor || '#FFFFFF';
  const accent = accentColor || '#44C0AE';

  const primaryRgb = hexToRgb(primary);
  const primaryRgbString = primaryRgb ? `${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}` : '0, 174, 239';

  const previewStyles = {
    '--preview-primary': primary,
    '--preview-primary-rgb': primaryRgbString,
    '--preview-primary-50': hexToRgba(primary, 0.05),
    '--preview-primary-100': hexToRgba(primary, 0.1),
    '--preview-secondary': secondary,
    '--preview-accent': accent,
  } as React.CSSProperties;

  return (
    <div className="space-y-4" style={previewStyles}>
      <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
        Live Preview
      </div>

      {/* Simplified template preview */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden shadow-sm">
        {/* Header Preview */}
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div
              className="w-8 h-8 rounded flex items-center justify-center"
              style={{ backgroundColor: `var(--preview-primary)` }}
            >
              <span className="text-white text-xs font-bold">🏥</span>
            </div>
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {templateName}
            </span>
          </div>
          <div className="flex space-x-2 text-xs">
            <button
              type="button"
              className="px-3 py-1.5 rounded transition-colors text-white"
              style={{ backgroundColor: `var(--preview-primary)` }}
            >
              Book Now
            </button>
          </div>
        </div>

        {/* Hero Section Preview */}
        <div
          className="px-4 py-6"
          style={{ backgroundColor: `var(--preview-primary-50)` }}
        >
          <div className="space-y-2">
            <h2
              className="text-lg font-bold"
              style={{ color: `var(--preview-primary)` }}
            >
              Expert Rheumatology Care
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Compassionate treatment for arthritis and autoimmune conditions
            </p>
            <div className="flex space-x-2 pt-2">
              <button
                type="button"
                className="px-3 py-1.5 text-xs rounded font-medium transition-colors text-white"
                style={{ backgroundColor: `var(--preview-primary)` }}
              >
                Schedule Visit
              </button>
              <button
                type="button"
                className="px-3 py-1.5 text-xs rounded font-medium transition-colors bg-white dark:bg-gray-800 border"
                style={{ borderColor: `var(--preview-primary)`, color: `var(--preview-primary)` }}
              >
                Learn More
              </button>
            </div>
          </div>
        </div>

        {/* Content Section Preview */}
        <div
          className="px-4 py-4 space-y-3"
          style={{ backgroundColor: `var(--preview-secondary)` }}
        >
          {/* Service Card */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
            <h3
              className="text-sm font-semibold mb-1"
              style={{ color: `var(--preview-primary)` }}
            >
              Our Services
            </h3>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Comprehensive care for all rheumatic conditions
            </p>
          </div>

          {/* Info with Accent */}
          <div
            className="flex items-center space-x-2 rounded p-2"
            style={{ backgroundColor: hexToRgba(accent, 0.05) }}
          >
            <div
              className="w-6 h-6 rounded flex-shrink-0 flex items-center justify-center"
              style={{ backgroundColor: `var(--preview-accent)` }}
            >
              <span className="text-white text-xs">✓</span>
            </div>
            <span
              className="text-xs font-medium"
              style={{ color: `var(--preview-accent)` }}
            >
              Accepting new patients
            </span>
          </div>
        </div>

        {/* Footer Preview */}
        <div
          className="px-4 py-3"
          style={{ backgroundColor: `var(--preview-primary)` }}
        >
          <p className="text-xs text-white text-center">
            © 2024 {templateName} • Quality Care
          </p>
        </div>
      </div>

      {/* Color Swatches */}
      <div className="grid grid-cols-3 gap-2 pt-2">
        <div className="space-y-1">
          <div
            className="w-full h-8 rounded border border-gray-300 dark:border-gray-600"
            style={{ backgroundColor: `var(--preview-primary)` }}
          />
          <span className="text-xs text-gray-500 dark:text-gray-400 block text-center">
            Primary
          </span>
        </div>
        <div className="space-y-1">
          <div
            className="w-full h-8 rounded border border-gray-300 dark:border-gray-600"
            style={{ backgroundColor: `var(--preview-secondary)` }}
          />
          <span className="text-xs text-gray-500 dark:text-gray-400 block text-center">
            Secondary
          </span>
        </div>
        <div className="space-y-1">
          <div
            className="w-full h-8 rounded border border-gray-300 dark:border-gray-600"
            style={{ backgroundColor: `var(--preview-accent)` }}
          />
          <span className="text-xs text-gray-500 dark:text-gray-400 block text-center">
            Accent
          </span>
        </div>
      </div>
    </div>
  );
}
