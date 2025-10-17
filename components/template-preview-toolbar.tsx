'use client';

import { useEffect, useState } from 'react';
import { getAllTemplateOptions } from '@/lib/template-loader';

interface TemplatePreviewToolbarProps {
  currentTemplate: string;
  onTemplateChange?: (templateSlug: string) => void;
  isLoading?: boolean;
}

export default function TemplatePreviewToolbar({
  currentTemplate: serverTemplate,
  onTemplateChange,
  isLoading: serverLoading = false,
}: TemplatePreviewToolbarProps) {
  const [currentTemplate, setCurrentTemplate] = useState(serverTemplate);
  const [isLoading, setIsLoading] = useState(serverLoading);
  const templates = getAllTemplateOptions();

  // Listen for template change events to update local state
  useEffect(() => {
    const handleTemplateChange = (event: CustomEvent) => {
      setCurrentTemplate(event.detail.templateSlug);
      setIsLoading(event.detail.isLoading);
    };

    window.addEventListener('template-change', handleTemplateChange as EventListener);

    return () => {
      window.removeEventListener('template-change', handleTemplateChange as EventListener);
    };
  }, []);

  const handleTemplateClick = (templateSlug: string) => {
    if (templateSlug === currentTemplate) return;

    setIsLoading(true);

    // Dispatch custom event for the template switcher
    const event = new CustomEvent('template-change', {
      detail: { templateSlug, isLoading: true },
    });
    window.dispatchEvent(event);

    // Call the original onTemplateChange if provided
    onTemplateChange?.(templateSlug);
  };

  return (
    <div className="bg-gray-50 border-b border-gray-200 px-4 py-3">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium text-gray-700">Preview Templates:</span>
            {isLoading && (
              <div className="flex items-center space-x-1">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                <span className="text-sm text-gray-500">Loading...</span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {templates.map((template) => (
              <button
                key={template.slug}
                onClick={() => handleTemplateClick(template.slug)}
                disabled={isLoading}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  currentTemplate === template.slug
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 hover:border-gray-400'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                title={template.description}
              >
                {template.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
