'use client';

import { useState, useMemo } from 'react';
import { Settings, Plus, Pencil, Trash2, Database, RefreshCcw, CheckCircle, XCircle, Filter } from 'lucide-react';
import {
  useMeasures,
  useCreateMeasure,
  useUpdateMeasure,
  useDeleteMeasure,
  useDiscoverMeasures,
  useGenerateReportCards,
  type MeasureCombination,
} from '@/lib/hooks/use-report-card';
import { Play } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { FormLabel } from '@/components/ui/form-label';
import type { MeasureConfig, FilterCriteria } from '@/lib/types/report-card';
import { useQueryClient } from '@tanstack/react-query';
import DeleteConfirmationModal from '@/components/delete-confirmation-modal';
import { clientErrorLog } from '@/lib/utils/debug-client';

/**
 * Report Card Admin Component
 *
 * Admin interface for configuring report card measures and settings.
 * Features:
 * - View/Edit/Create measure configurations
 * - Configure filter criteria for dynamic SQL generation
 * - Discover available measures from analytics DB
 * - Seed measures from discovered combinations
 */

// =============================================================================
// Types
// =============================================================================

interface MeasureFormData {
  measure_name: string;
  display_name: string;
  weight: number;
  higher_is_better: boolean;
  format_type: 'number' | 'currency' | 'percentage';
  is_active: boolean;
  value_column: string;
  filter_criteria: FilterCriteria;
}

const DEFAULT_FORM_DATA: MeasureFormData = {
  measure_name: '',
  display_name: '',
  weight: 5,
  higher_is_better: true,
  format_type: 'number',
  is_active: true,
  value_column: 'numeric_value',
  filter_criteria: {},
};

// =============================================================================
// Main Component
// =============================================================================

export default function ReportCardAdmin() {
  const queryClient = useQueryClient();
  const { data: measuresData, isLoading, error, refetch } = useMeasures(false);
  const { data: discoverData, isLoading: isDiscovering } = useDiscoverMeasures();

  const createMeasure = useCreateMeasure();
  const deleteMeasure = useDeleteMeasure();
  const generateReportCards = useGenerateReportCards();

  const [editingMeasure, setEditingMeasure] = useState<MeasureConfig | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [showDiscoverModal, setShowDiscoverModal] = useState(false);
  const [selectedCombinations, setSelectedCombinations] = useState<MeasureCombination[]>([]);
  const [isSeedingMeasures, setIsSeedingMeasures] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationResult, setGenerationResult] = useState<{
    success: boolean;
    summary?: {
      statisticsCollected: number;
      trendsCalculated: number;
      sizingAssigned: number;
      cardsGenerated: number;
      errors: number;
      duration: number;
    };
    error?: string;
  } | null>(null);

  // Delete confirmation modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [pendingDeleteMeasureId, setPendingDeleteMeasureId] = useState<number | null>(null);

  const measures = measuresData?.measures || [];

  // Find the measure pending deletion for the modal
  const pendingDeleteMeasure = pendingDeleteMeasureId
    ? measures.find((m) => m.measure_id === pendingDeleteMeasureId)
    : null;

  /**
   * Handle report card generation with full reset
   */
  const handleGenerateReportCards = async () => {
    setIsGenerating(true);
    setGenerationResult(null);

    try {
      const result = await generateReportCards.mutateAsync({ reset: true });
      setGenerationResult({
        success: result.success,
        summary: result.summary,
      });
      // Invalidate all report card related queries
      await queryClient.invalidateQueries({ queryKey: ['report-card'] });
    } catch (err) {
      setGenerationResult({
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // Filter combinations not already configured
  const unconfiguredCombinations = useMemo(() => {
    if (!discoverData?.combinations) return [];
    const configuredNames = new Set(measures.map((m) => m.measure_name.toLowerCase()));
    return discoverData.combinations.filter((c) => {
      // Build a unique name based on measure and entity_name
      const name = c.entity_name ? `${c.measure}_${c.entity_name}`.toLowerCase() : c.measure.toLowerCase();
      return !configuredNames.has(name) && !configuredNames.has(c.measure.toLowerCase());
    });
  }, [discoverData?.combinations, measures]);

  const handleCreateMeasure = async (data: MeasureFormData) => {
    try {
      await createMeasure.mutateAsync({
        ...data,
        data_source_id: null,
      });
      setIsCreating(false);
      await queryClient.invalidateQueries({ queryKey: ['report-card-measures'] });
    } catch (err) {
      clientErrorLog('Failed to create measure:', err);
    }
  };

  /**
   * Open delete confirmation modal for a measure
   */
  const handleDeleteMeasureClick = (measureId: number) => {
    setPendingDeleteMeasureId(measureId);
    setDeleteModalOpen(true);
  };

  /**
   * Confirm and execute measure deletion
   */
  const handleConfirmDelete = async () => {
    if (!pendingDeleteMeasureId) return;
    
    await deleteMeasure.mutateAsync(pendingDeleteMeasureId);
    await queryClient.invalidateQueries({ queryKey: ['report-card-measures'] });
    setPendingDeleteMeasureId(null);
  };

  const handleSeedMeasures = async () => {
    if (selectedCombinations.length === 0) return;
    setIsSeedingMeasures(true);

    try {
      for (const combo of selectedCombinations) {
        const measureName = combo.entity_name
          ? `${combo.measure.toLowerCase().replace(/\s+/g, '_')}_${combo.entity_name.toLowerCase().replace(/\s+/g, '_')}`
          : combo.measure.toLowerCase().replace(/\s+/g, '_');

        const displayName = combo.entity_name
          ? `${combo.measure} - ${combo.entity_name}`
          : combo.measure;

        const filterCriteria: FilterCriteria = { measure: combo.measure };
        if (combo.entity_name) {
          filterCriteria.entity_name = combo.entity_name;
        }
        if (combo.entity_type) {
          filterCriteria.entity_type = combo.entity_type;
        }

        // Determine format type and higher_is_better based on measure name
        let formatType: 'number' | 'currency' | 'percentage' = 'number';
        let higherIsBetter = true;

        const measureLower = combo.measure.toLowerCase();
        if (measureLower.includes('charge') || measureLower.includes('payment') || measureLower.includes('cash')) {
          formatType = 'currency';
        } else if (measureLower.includes('rate')) {
          formatType = 'percentage';
          // Most rates should be "lower is better" (denial rate, cancellation rate)
          higherIsBetter = measureLower.includes('collection');
        } else if (measureLower.includes('denial') || measureLower.includes('cancel')) {
          higherIsBetter = false;
        }

        await createMeasure.mutateAsync({
          measure_name: measureName,
          display_name: displayName,
          weight: 5,
          higher_is_better: higherIsBetter,
          format_type: formatType,
          value_column: 'numeric_value',
          filter_criteria: filterCriteria,
        });
      }

      setSelectedCombinations([]);
      setShowDiscoverModal(false);
      await queryClient.invalidateQueries({ queryKey: ['report-card-measures'] });
    } catch (err) {
      clientErrorLog('Failed to seed measures:', err);
    } finally {
      setIsSeedingMeasures(false);
    }
  };

  if (isLoading) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-9xl mx-auto">
        <div className="flex items-center justify-center py-12">
          <Spinner size="md" />
          <span className="ml-3 text-slate-600 dark:text-slate-400">Loading measures...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-9xl mx-auto">
        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-lg">
          Failed to load measures. Please try again later.
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-9xl mx-auto">
      {/* Header */}
      <div className="sm:flex sm:justify-between sm:items-center mb-8">
        <div className="mb-4 sm:mb-0">
          <h1 className="text-2xl md:text-3xl text-slate-800 dark:text-slate-100 font-bold flex items-center gap-3">
            <Settings className="w-8 h-8" />
            Report Card Configuration
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            Configure measures with filter criteria to define how data is collected from analytics
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="success"
            onClick={handleGenerateReportCards}
            loading={isGenerating}
            loadingText="Generating..."
            leftIcon={<Play className="w-4 h-4" />}
          >
            Generate Report Cards
          </Button>
          <Button
            variant="secondary"
            onClick={() => setShowDiscoverModal(true)}
            leftIcon={<Database className="w-4 h-4" />}
          >
            Discover Measures
          </Button>
          <Button
            variant="primary"
            onClick={() => setIsCreating(true)}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Add Measure
          </Button>
        </div>
      </div>

      {/* Generation Result Alert */}
      {generationResult && (
        <div
          className={`mb-6 p-4 rounded-lg border ${
            generationResult.success
              ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
              : 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800'
          }`}
        >
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <h3
                className={`font-medium ${
                  generationResult.success
                    ? 'text-emerald-800 dark:text-emerald-300'
                    : 'text-rose-800 dark:text-rose-300'
                }`}
              >
                {generationResult.success
                  ? generationResult.summary && generationResult.summary.errors > 0
                    ? `Generated ${generationResult.summary.cardsGenerated} Report Cards (${generationResult.summary.errors} skipped)`
                    : 'Report Cards Generated Successfully'
                  : 'Generation Failed'}
              </h3>
              {generationResult.summary && (
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-5 gap-4 text-sm">
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block">Statistics</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">
                      {generationResult.summary.statisticsCollected.toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block">Trends</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">
                      {generationResult.summary.trendsCalculated.toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block">Sized</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">
                      {generationResult.summary.sizingAssigned.toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block">Report Cards</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">
                      {generationResult.summary.cardsGenerated.toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block">Duration</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">
                      {(generationResult.summary.duration / 1000).toFixed(1)}s
                    </span>
                  </div>
                </div>
              )}
              {generationResult.summary && generationResult.summary.errors > 0 && (
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                  {generationResult.summary.errors} practices were skipped (insufficient data or not sized)
                </p>
              )}
              {generationResult.error && (
                <p className="mt-2 text-sm text-rose-700 dark:text-rose-400">
                  {generationResult.error}
                </p>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setGenerationResult(null)}
              className="ml-4"
              aria-label="Close alert"
            >
              ×
            </Button>
          </div>
        </div>
      )}

      {/* Info Box */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
        <div className="flex gap-3">
          <Filter className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-blue-800 dark:text-blue-300">Filter Criteria</h3>
            <p className="text-sm text-blue-700 dark:text-blue-400 mt-1">
              Each measure can have filter criteria that defines which data to collect from <code className="bg-blue-100 dark:bg-blue-900/50 px-1 rounded">ih.agg_chart_data</code>.
              For example, to track &quot;New Patients&quot;, set filter criteria to <code className="bg-blue-100 dark:bg-blue-900/50 px-1 rounded">{`{"measure": "Visits", "entity_name": "New Patient"}`}</code>.
            </p>
          </div>
        </div>
      </div>

      {/* Measures Table */}
      <div className="bg-white dark:bg-slate-800 shadow-lg rounded-lg border border-slate-200 dark:border-slate-700">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            Configured Measures ({measures.length})
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            aria-label="Refresh measures"
          >
            <RefreshCcw className="w-4 h-4" />
          </Button>
        </div>

        {measures.length === 0 ? (
          <div className="text-center py-12">
            <Database className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
            <p className="text-slate-500 dark:text-slate-400 mb-4">
              No measures configured yet. Add measures to enable report card generation.
            </p>
            <Button
              variant="primary"
              onClick={() => setShowDiscoverModal(true)}
            >
              Discover from Analytics DB
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-auto w-full">
              <thead className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-700/50">
                <tr>
                  <th className="p-3 whitespace-nowrap text-left">Name</th>
                  <th className="p-3 whitespace-nowrap text-left">Display Name</th>
                  <th className="p-3 whitespace-nowrap text-left">Filter Criteria</th>
                  <th className="p-3 whitespace-nowrap text-center">Weight</th>
                  <th className="p-3 whitespace-nowrap text-center">Higher=Better</th>
                  <th className="p-3 whitespace-nowrap text-center">Format</th>
                  <th className="p-3 whitespace-nowrap text-center">Status</th>
                  <th className="p-3 whitespace-nowrap text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-slate-200 dark:divide-slate-700">
                {measures.map((measure) => (
                  <tr key={measure.measure_id} className={!measure.is_active ? 'opacity-50' : ''}>
                    <td className="p-3 whitespace-nowrap">
                      <div className="font-medium text-slate-800 dark:text-slate-100">
                        {measure.measure_name}
                      </div>
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <div className="text-slate-600 dark:text-slate-300">{measure.display_name}</div>
                    </td>
                    <td className="p-3">
                      {Object.keys(measure.filter_criteria || {}).length > 0 ? (
                        <code className="text-xs bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded">
                          {JSON.stringify(measure.filter_criteria)}
                        </code>
                      ) : (
                        <span className="text-xs px-2 py-1 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300">
                          ⚠️ No filters - won&apos;t collect data
                        </span>
                      )}
                    </td>
                    <td className="p-3 whitespace-nowrap text-center">
                      <span className="font-medium">{measure.weight}</span>
                    </td>
                    <td className="p-3 whitespace-nowrap text-center">
                      {measure.higher_is_better ? (
                        <CheckCircle className="w-5 h-5 text-green-500 inline" />
                      ) : (
                        <XCircle className="w-5 h-5 text-amber-500 inline" />
                      )}
                    </td>
                    <td className="p-3 whitespace-nowrap text-center">
                      <span className="text-xs px-2 py-1 rounded bg-slate-100 dark:bg-slate-700">
                        {measure.format_type}
                      </span>
                    </td>
                    <td className="p-3 whitespace-nowrap text-center">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          measure.is_active
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-400'
                        }`}
                      >
                        {measure.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="p-3 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => setEditingMeasure(measure)}
                          className="text-slate-400 hover:text-indigo-500 dark:text-slate-500 dark:hover:text-indigo-400"
                          title="Edit measure"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteMeasureClick(measure.measure_id)}
                          className="text-slate-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400"
                          title="Deactivate measure"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {(isCreating || editingMeasure) && (
        <MeasureFormModal
          measure={editingMeasure}
          onClose={() => {
            setIsCreating(false);
            setEditingMeasure(null);
          }}
          onSave={handleCreateMeasure}
          filterableColumns={discoverData?.filterable_columns || []}
        />
      )}

      {/* Discover Modal */}
      {showDiscoverModal && (
        <DiscoverMeasuresModal
          combinations={unconfiguredCombinations}
          isLoading={isDiscovering}
          selectedCombinations={selectedCombinations}
          onSelectionChange={setSelectedCombinations}
          onSeed={handleSeedMeasures}
          isSeedingMeasures={isSeedingMeasures}
          onClose={() => {
            setShowDiscoverModal(false);
            setSelectedCombinations([]);
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={deleteModalOpen}
        setIsOpen={(open) => {
          setDeleteModalOpen(open);
          if (!open) {
            setPendingDeleteMeasureId(null);
          }
        }}
        title="Deactivate Measure"
        itemName={pendingDeleteMeasure?.display_name || 'this measure'}
        message="This will deactivate the measure and remove it from future report card calculations. Existing report card data will not be affected."
        confirmButtonText="Deactivate"
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}

// =============================================================================
// Measure Form Modal
// =============================================================================

interface MeasureFormModalProps {
  measure: MeasureConfig | null;
  onClose: () => void;
  onSave: (data: MeasureFormData) => Promise<void>;
  filterableColumns: string[];
}

function MeasureFormModal({ measure, onClose, onSave, filterableColumns }: MeasureFormModalProps) {
  const updateMeasure = useUpdateMeasure(measure?.measure_id);
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState<MeasureFormData>(() => {
    if (measure) {
      return {
        measure_name: measure.measure_name,
        display_name: measure.display_name,
        weight: measure.weight,
        higher_is_better: measure.higher_is_better,
        format_type: measure.format_type,
        is_active: measure.is_active,
        value_column: measure.value_column || 'numeric_value',
        filter_criteria: measure.filter_criteria || {},
      };
    }
    return DEFAULT_FORM_DATA;
  });

  const [filterKey, setFilterKey] = useState('');
  const [filterValue, setFilterValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      if (measure) {
        await updateMeasure.mutateAsync({
          display_name: formData.display_name,
          weight: formData.weight,
          higher_is_better: formData.higher_is_better,
          format_type: formData.format_type,
          is_active: formData.is_active,
          value_column: formData.value_column,
          filter_criteria: formData.filter_criteria,
        });
        await queryClient.invalidateQueries({ queryKey: ['report-card-measures'] });
        onClose();
      } else {
        await onSave(formData);
      }
    } catch (err) {
      clientErrorLog('Failed to save measure:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const addFilter = () => {
    if (filterKey && filterValue) {
      setFormData((prev) => ({
        ...prev,
        filter_criteria: { ...prev.filter_criteria, [filterKey]: filterValue },
      }));
      setFilterKey('');
      setFilterValue('');
    }
  };

  const removeFilter = (key: string) => {
    setFormData((prev) => {
      const newFilters = { ...prev.filter_criteria };
      delete newFilters[key];
      return { ...prev, filter_criteria: newFilters };
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {measure ? 'Edit Measure' : 'Create Measure'}
          </h3>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Internal ID
              </label>
              <input
                type="text"
                value={formData.measure_name}
                onChange={(e) => setFormData((prev) => ({ ...prev, measure_name: e.target.value }))}
                disabled={!!measure}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="e.g., new_patients"
                required
              />
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Used for storage, not SQL queries
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Display Name
              </label>
              <input
                type="text"
                value={formData.display_name}
                onChange={(e) => setFormData((prev) => ({ ...prev, display_name: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                placeholder="e.g., New Patients"
                required
              />
            </div>
          </div>

          {/* Filter Criteria */}
          <div>
            <FormLabel required className="mb-2">
              Filter Criteria
            </FormLabel>
            <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4">
              {/* Warning if no filters */}
              {Object.entries(formData.filter_criteria).length === 0 && (
                <div className="mb-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <p className="text-sm text-amber-800 dark:text-amber-300">
                    <strong>Required:</strong> Add at least one filter (e.g., <code className="bg-amber-100 dark:bg-amber-900/50 px-1 rounded">measure = Charges</code>) to define which data to collect from the analytics database.
                  </p>
                </div>
              )}
              {/* Current Filters */}
              {Object.entries(formData.filter_criteria).length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {Object.entries(formData.filter_criteria).map(([key, value]) => (
                    <span
                      key={key}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-300 rounded text-sm"
                    >
                      {key}={value}
                      <button type="button" onClick={() => removeFilter(key)} className="hover:text-red-500">
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Add Filter */}
              <div className="flex gap-2">
                <select
                  value={filterKey}
                  onChange={(e) => setFilterKey(e.target.value)}
                  className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                >
                  <option value="">Select column...</option>
                  {filterableColumns.map((col) => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={filterValue}
                  onChange={(e) => setFilterValue(e.target.value)}
                  placeholder="Value"
                  className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                />
                <Button
                  variant="primary"
                  onClick={addFilter}
                  disabled={!filterKey || !filterValue}
                >
                  Add
                </Button>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                These filters define which rows to collect from ih.agg_chart_data
              </p>
            </div>
          </div>

          {/* Options Grid */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Weight (1-10)
              </label>
              <input
                type="number"
                min="1"
                max="10"
                value={formData.weight}
                onChange={(e) => setFormData((prev) => ({ ...prev, weight: Number(e.target.value) }))}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Format Type
              </label>
              <select
                value={formData.format_type}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    format_type: e.target.value as 'number' | 'currency' | 'percentage',
                  }))
                }
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
              >
                <option value="number">Number</option>
                <option value="currency">Currency</option>
                <option value="percentage">Percentage</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Value Column
              </label>
              <input
                type="text"
                value={formData.value_column}
                onChange={(e) => setFormData((prev) => ({ ...prev, value_column: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          {/* Checkboxes */}
          <div className="flex gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.higher_is_better}
                onChange={(e) => setFormData((prev) => ({ ...prev, higher_is_better: e.target.checked }))}
                className="rounded border-slate-300 text-indigo-500 focus:ring-indigo-500"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">Higher is Better</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => setFormData((prev) => ({ ...prev, is_active: e.target.checked }))}
                className="rounded border-slate-300 text-indigo-500 focus:ring-indigo-500"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">Active</span>
            </label>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
            <Button
              variant="secondary"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              loading={isSaving}
              loadingText="Saving..."
            >
              {measure ? 'Update Measure' : 'Create Measure'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// =============================================================================
// Discover Measures Modal
// =============================================================================

interface DiscoverMeasuresModalProps {
  combinations: MeasureCombination[];
  isLoading: boolean;
  selectedCombinations: MeasureCombination[];
  onSelectionChange: (selected: MeasureCombination[]) => void;
  onSeed: () => Promise<void>;
  isSeedingMeasures: boolean;
  onClose: () => void;
}

function DiscoverMeasuresModal({
  combinations,
  isLoading,
  selectedCombinations,
  onSelectionChange,
  onSeed,
  isSeedingMeasures,
  onClose,
}: DiscoverMeasuresModalProps) {
  const toggleSelection = (combo: MeasureCombination) => {
    const key = `${combo.measure}_${combo.entity_name || ''}`;
    const exists = selectedCombinations.some(
      (c) => `${c.measure}_${c.entity_name || ''}` === key
    );

    if (exists) {
      onSelectionChange(
        selectedCombinations.filter(
          (c) => `${c.measure}_${c.entity_name || ''}` !== key
        )
      );
    } else {
      onSelectionChange([...selectedCombinations, combo]);
    }
  };

  const selectAll = () => {
    onSelectionChange(combinations);
  };

  const clearAll = () => {
    onSelectionChange([]);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Discover Measures from Analytics
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Select measure combinations to import as report card measures
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner size="md" />
              <span className="ml-3 text-slate-600 dark:text-slate-400">Discovering measures...</span>
            </div>
          ) : combinations.length === 0 ? (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400">
              All available measures are already configured.
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center mb-4">
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  {selectedCombinations.length} of {combinations.length} selected
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={selectAll}
                    className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    Select All
                  </button>
                  <button
                    onClick={clearAll}
                    className="text-sm text-slate-500 dark:text-slate-400 hover:underline"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {combinations.map((combo) => {
                  const key = `${combo.measure}_${combo.entity_name || ''}`;
                  const isSelected = selectedCombinations.some(
                    (c) => `${c.measure}_${c.entity_name || ''}` === key
                  );

                  return (
                    <label
                      key={key}
                      className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer border transition-colors ${
                        isSelected
                          ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-300 dark:border-indigo-700'
                          : 'bg-white dark:bg-slate-700/50 border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelection(combo)}
                        className="rounded border-slate-300 text-indigo-500 focus:ring-indigo-500"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-slate-800 dark:text-slate-100">
                          {combo.entity_name ? `${combo.measure} - ${combo.entity_name}` : combo.measure}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {combo.row_count.toLocaleString()} rows
                          {combo.entity_type && ` • Type: ${combo.entity_type}`}
                        </div>
                      </div>
                      <code className="text-xs bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded">
                        {JSON.stringify({ measure: combo.measure, ...(combo.entity_name && { entity_name: combo.entity_name }) })}
                      </code>
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3">
          <Button
            variant="secondary"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={onSeed}
            disabled={selectedCombinations.length === 0}
            loading={isSeedingMeasures}
            loadingText="Creating..."
          >
            Create {selectedCombinations.length} Measure(s)
          </Button>
        </div>
      </div>
    </div>
  );
}
