'use client';

import { useState, useEffect } from 'react';
import type { ComponentType } from 'react';
import type { Practice, PracticeAttributes, StaffMember, ColorStyles } from '@/lib/types/practice';
import { getTemplateDefaultColors, getColorStyles } from '@/lib/utils/color-utils';

interface TemplateSwitcherProps {
  practice: Practice;
  attributes: PracticeAttributes;
  staff: StaffMember[];
  initialTemplate: string;
  initialColorStyles: ColorStyles;
}

export default function TemplateSwitcher({
  practice,
  attributes,
  staff,
  initialTemplate,
  initialColorStyles
}: TemplateSwitcherProps) {
  const [currentTemplate, setCurrentTemplate] = useState(initialTemplate);
  const [TemplateComponent, setTemplateComponent] = useState<ComponentType<any> | null>(null);
  const [colorStyles, setColorStyles] = useState<ColorStyles>(initialColorStyles);
  const [isLoading, setIsLoading] = useState(false);

  // Load template component dynamically
  const loadTemplate = async (templateSlug: string) => {
    setIsLoading(true);

    try {
      let templateModule;

      // Dynamic import based on template slug
      switch (templateSlug) {
        case 'classic-professional':
          templateModule = await import('@/templates/classic-professional');
          break;
        case 'modern-minimalist':
          templateModule = await import('@/templates/modern-minimalist');
          break;
        case 'warm-welcoming':
          templateModule = await import('@/templates/warm-welcoming');
          break;
        case 'clinical-focus':
          templateModule = await import('@/templates/clinical-focus');
          break;
        case 'community-practice':
          templateModule = await import('@/templates/community-practice');
          break;
        case 'tidy-professional':
          templateModule = await import('@/templates/tidy-professional');
          break;
        default:
          throw new Error(`Unknown template: ${templateSlug}`);
      }

      setTemplateComponent(() => templateModule.default);

      // Update color styles for the new template
      const defaultColors = getTemplateDefaultColors(templateSlug);
      const brandColors = {
        primary: attributes?.primary_color || defaultColors.primary,
        secondary: attributes?.secondary_color || defaultColors.secondary,
        accent: attributes?.accent_color || defaultColors.accent,
      };
      setColorStyles(getColorStyles(brandColors));

      setCurrentTemplate(templateSlug);
    } catch (error) {
      console.error('Error loading template:', error);
      // Fallback to classic-professional
      if (templateSlug !== 'classic-professional') {
        await loadTemplate('classic-professional');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Load initial template on mount
  useEffect(() => {
    loadTemplate(initialTemplate);
  }, [initialTemplate]);

  // Handle template switching from the toolbar
  useEffect(() => {
    const handleTemplateChange = (event: CustomEvent) => {
      const newTemplate = event.detail.templateSlug;
      if (newTemplate !== currentTemplate) {
        loadTemplate(newTemplate);
      }
    };

    // Listen for template change events from the toolbar
    window.addEventListener('template-change', handleTemplateChange as EventListener);

    return () => {
      window.removeEventListener('template-change', handleTemplateChange as EventListener);
    };
  }, [currentTemplate]); // Remove dependency to avoid re-creating listener

  // Update loading state when template loading completes
  useEffect(() => {
    if (!isLoading) {
      // Notify toolbar that loading is complete
      const event = new CustomEvent('template-change', {
        detail: { templateSlug: currentTemplate, isLoading: false }
      });
      window.dispatchEvent(event);
    }
  }, [isLoading, currentTemplate]);

  if (!TemplateComponent) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          {isLoading ? (
            <>
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading template...</p>
            </>
          ) : (
            <p className="text-gray-600">Template not available</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`transition-opacity duration-300 ${isLoading ? 'opacity-50' : 'opacity-100'}`}>
      <TemplateComponent
        practice={practice}
        attributes={attributes}
        staff={staff}
        colorStyles={colorStyles}
      />
    </div>
  );
}
