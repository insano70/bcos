'use client';

import { useState, useEffect } from 'react';
import { ChartDefinition } from '@/lib/types/analytics';
import { CHART_TEMPLATES, createChartFromTemplate } from '@/lib/services/chart-templates';
import Toast from '@/components/toast';
import { apiClient } from '@/lib/api/client';

/**
 * Chart Template Management UI
 * Industry-specific presets and template management as specified in design document
 */

interface TemplateCategory {
  id: string;
  name: string;
  description: string;
  templates: string[];
}

const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  {
    id: 'financial',
    name: 'Financial Analytics',
    description: 'Revenue, payments, and financial performance templates',
    templates: ['CHARGES_VS_PAYMENTS', 'PRACTICE_REVENUE_TREND']
  },
  {
    id: 'operational',
    name: 'Operational Metrics',
    description: 'Practice operations and efficiency templates',
    templates: ['PROVIDER_PERFORMANCE']
  },
  {
    id: 'comparative',
    name: 'Comparative Analysis',
    description: 'Period-over-period and benchmarking templates',
    templates: ['CHARGES_VS_PAYMENTS'] // Would have more in real implementation
  }
];

export default function ChartTemplateManager() {
  const [selectedCategory, setSelectedCategory] = useState<string>('financial');
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [customTemplates, setCustomTemplates] = useState<ChartDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');

  useEffect(() => {
    loadCustomTemplates();
  }, []);

  const loadCustomTemplates = async () => {
    try {
      // Load user-created templates
      const result = await apiClient.get<{
        charts: ChartDefinition[];
      }>('/api/admin/analytics/charts?template=true');
      setCustomTemplates(result.charts || []);
    } catch (error) {
      console.error('Failed to load custom templates:', error);
    }
  };

  const createChartFromSelectedTemplate = async () => {
    if (!selectedTemplate) return;

    setIsLoading(true);

    try {
      // Get current user ID (this would typically come from auth context)
      const currentUserId = 'current-user-id'; // Placeholder

      const chartDefinition = createChartFromTemplate(
        selectedTemplate as keyof typeof CHART_TEMPLATES,
        currentUserId
      );

      const result = await apiClient.post('/api/admin/analytics/charts', chartDefinition);
      
      setToastMessage(`Chart created successfully from template!`);
      setToastType('success');
      setShowToast(true);

      console.log('✅ Chart created from template:', result);

    } catch (error) {
      setToastMessage(`Failed to create chart: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setToastType('error');
      setShowToast(true);
    } finally {
      setIsLoading(false);
    }
  };

  const saveAsTemplate = async (chartDefinitionId: string, templateName: string) => {
    try {
      // This would typically mark a chart as a template
      await apiClient.put(`/api/admin/analytics/charts/${chartDefinitionId}`, { 
        is_template: true,
        template_name: templateName 
      });

      setToastMessage('Chart saved as template successfully!');
      setToastType('success');
      setShowToast(true);
      loadCustomTemplates(); // Refresh the list
    } catch (error) {
      setToastMessage('Failed to save template');
      setToastType('error');
      setShowToast(true);
    }
  };

  const deleteCustomTemplate = async (templateId: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return;

    try {
      await apiClient.delete(`/api/admin/analytics/charts/${templateId}`);

      setToastMessage('Template deleted successfully');
      setToastType('success');
      setShowToast(true);
      loadCustomTemplates(); // Refresh the list
    } catch (error) {
      setToastMessage('Failed to delete template');
      setToastType('error');
      setShowToast(true);
    }
  };

  const selectedCategoryData = TEMPLATE_CATEGORIES.find(cat => cat.id === selectedCategory);

  return (
    <div className="max-w-6xl mx-auto bg-white dark:bg-gray-800 shadow-sm rounded-xl">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Chart Template Library
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Create charts from industry-specific templates or manage your custom templates
        </p>
      </div>

      <div className="flex">
        {/* Category Sidebar */}
        <div className="w-1/3 border-r border-gray-200 dark:border-gray-700 p-4">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
            Template Categories
          </h3>
          
          <div className="space-y-2">
            {TEMPLATE_CATEGORIES.map((category) => (
              <button
                key={category.id}
                onClick={() => setSelectedCategory(category.id)}
                className={`w-full text-left p-3 rounded-lg transition-colors ${
                  selectedCategory === category.id
                    ? 'bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-700'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                <div className="font-medium">{category.name}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {category.description}
                </div>
                <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  {category.templates.length} template(s)
                </div>
              </button>
            ))}

            {/* Custom Templates Section */}
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">
                Custom Templates
              </h4>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {customTemplates.length} custom template(s)
              </div>
            </div>
          </div>
        </div>

        {/* Template Content */}
        <div className="flex-1 p-6">
          {selectedCategoryData && (
            <>
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                {selectedCategoryData.name}
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                {selectedCategoryData.description}
              </p>

              {/* System Templates */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                {selectedCategoryData.templates.map((templateKey) => {
                  const template = CHART_TEMPLATES[templateKey as keyof typeof CHART_TEMPLATES];
                  if (!template) return null;

                  return (
                    <div
                      key={templateKey}
                      className={`border rounded-lg p-4 cursor-pointer transition-all ${
                        selectedTemplate === templateKey
                          ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                      onClick={() => setSelectedTemplate(templateKey)}
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h4 className="font-medium text-gray-900 dark:text-gray-100">
                            {template.chart_name}
                          </h4>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {template.chart_type} chart
                          </div>
                        </div>
                        <div className="text-xs bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 px-2 py-1 rounded">
                          System
                        </div>
                      </div>
                      
                      <p className="text-gray-600 dark:text-gray-400 text-sm mb-3">
                        {template.chart_description}
                      </p>

                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        Data Source: {template.data_source.table}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Custom Templates */}
              {customTemplates.length > 0 && (
                <>
                  <h4 className="text-md font-medium text-gray-900 dark:text-gray-100 mb-4">
                    Your Custom Templates
                  </h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {customTemplates.map((template) => (
                      <div
                        key={template.chart_definition_id}
                        className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                      >
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <h4 className="font-medium text-gray-900 dark:text-gray-100">
                              {template.chart_name}
                            </h4>
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                              {template.chart_type} chart
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <div className="text-xs bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300 px-2 py-1 rounded">
                              Custom
                            </div>
                            <button
                              onClick={() => deleteCustomTemplate(template.chart_definition_id)}
                              className="text-red-500 hover:text-red-700 text-xs"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                        
                        <p className="text-gray-600 dark:text-gray-400 text-sm">
                          {template.chart_description}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Template Actions */}
              {selectedTemplate && (
                <div className="mt-8 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">
                    Create Chart from Template
                  </h4>
                  
                  <div className="flex gap-3">
                    <button
                      onClick={createChartFromSelectedTemplate}
                      disabled={isLoading}
                      className="px-4 py-2 bg-violet-500 text-white rounded-md hover:bg-violet-600 transition-colors disabled:opacity-50"
                    >
                      {isLoading ? 'Creating...' : 'Create Chart'}
                    </button>
                    
                    <button
                      onClick={() => setSelectedTemplate(null)}
                      className="px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Toast Notification */}
      <Toast
        type={toastType}
        open={showToast}
        setOpen={setShowToast}
        className="fixed bottom-4 right-4 z-50"
      >
        {toastMessage}
      </Toast>
    </div>
  );
}
