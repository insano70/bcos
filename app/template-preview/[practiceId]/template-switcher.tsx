'use client';

import type { ComponentType } from 'react';
import { useEffect, useState, useCallback } from 'react';
import type {
  Practice,
  PracticeAttributes,
  PracticeComment,
  StaffMember,
  TemplateProps,
} from '@/lib/types/practice';
import { getTemplateDefaultColors, getPracticeCSS } from '@/lib/utils/color-utils';
import { validateCSSColor } from '@/lib/validations/css-validation';
import { clientErrorLog } from '@/lib/utils/debug-client';

interface TemplateSwitcherProps {
  practice: Practice;
  attributes: PracticeAttributes;
  staff: StaffMember[];
  comments: PracticeComment[];
  clinectRatings?: import('@/lib/types/practice').ClinectRating | null | undefined;
  clinectReviews?: import('@/lib/types/practice').ClinectReview[] | null | undefined;
  initialTemplate: string;
}

export default function TemplateSwitcher({
  practice,
  attributes,
  staff,
  comments,
  clinectRatings,
  clinectReviews,
  initialTemplate,
}: TemplateSwitcherProps) {
  const [currentTemplate, setCurrentTemplate] = useState(initialTemplate);
  const [TemplateComponent, setTemplateComponent] =
    useState<ComponentType<TemplateProps> | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Load template component dynamically
  const loadTemplate = useCallback(async (templateSlug: string) => {
    setIsLoading(true);

    try {
      let templateModule: { default: ComponentType<TemplateProps> };

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

      // Update CSS custom properties for the new template
      const defaultColors = getTemplateDefaultColors(templateSlug);
      
      // SECURITY: Validate all CSS colors to prevent CSS injection attacks
      const primaryColor = attributes?.primary_color;
      const secondaryColor = attributes?.secondary_color;
      const accentColor = attributes?.accent_color;
      
      const brandColors = {
        primary: (primaryColor && validateCSSColor(primaryColor)) 
          ? primaryColor 
          : defaultColors.primary,
        secondary: (secondaryColor && validateCSSColor(secondaryColor)) 
          ? secondaryColor 
          : defaultColors.secondary,
        accent: (accentColor && validateCSSColor(accentColor)) 
          ? accentColor 
          : defaultColors.accent,
      };
      
      // Log security events for invalid colors (potential injection attempts)
      if (primaryColor && !validateCSSColor(primaryColor)) {
        clientErrorLog('[Security] Invalid primary color value blocked:', primaryColor.substring(0, 20));
      }
      if (secondaryColor && !validateCSSColor(secondaryColor)) {
        clientErrorLog('[Security] Invalid secondary color value blocked:', secondaryColor.substring(0, 20));
      }
      if (accentColor && !validateCSSColor(accentColor)) {
        clientErrorLog('[Security] Invalid accent color value blocked:', accentColor.substring(0, 20));
      }

      // Inject CSS variables dynamically for client-side template switching
      const css = getPracticeCSS(brandColors);
      const existingStyle = document.querySelector('[data-practice-id]');
      if (existingStyle) {
        existingStyle.innerHTML = css;  // Update existing style tag
      } else {
        const style = document.createElement('style');
        style.setAttribute('data-practice-id', practice.practice_id);
        style.innerHTML = css;
        document.head.appendChild(style);
      }

      setCurrentTemplate(templateSlug);
    } catch (error) {
      clientErrorLog('Error loading template:', error);
      // Fallback to classic-professional
      if (templateSlug !== 'classic-professional') {
        await loadTemplate('classic-professional');
      }
    } finally {
      setIsLoading(false);
    }
  }, [attributes, practice.practice_id]);

  // Load initial template on mount
  useEffect(() => {
    loadTemplate(initialTemplate);
  }, [initialTemplate, loadTemplate]);

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
  }, [currentTemplate, loadTemplate]);

  // Update loading state when template loading completes
  useEffect(() => {
    if (!isLoading) {
      // Notify toolbar that loading is complete
      const event = new CustomEvent('template-change', {
        detail: { templateSlug: currentTemplate, isLoading: false },
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
        comments={comments}
        clinectRatings={clinectRatings}
        clinectReviews={clinectReviews}
      />
    </div>
  );
}
