'use client';

import { useState } from 'react';
import {
  usePendingSuggestions,
  useApproveSuggestion,
  useRejectSuggestion,
  useSuggestionStatistics,
} from '@/lib/hooks/use-data-explorer';
import ProtectedComponent from '@/components/rbac/protected-component';

export default function SuggestionsPage() {
  const [expandedSuggestion, setExpandedSuggestion] = useState<string | null>(null);

  const { data: suggestions, isLoading, refetch } = usePendingSuggestions();
  const { data: statistics } = useSuggestionStatistics();
  const approveSuggestion = useApproveSuggestion();
  const rejectSuggestion = useRejectSuggestion();

  const handleApprove = async (suggestionId: string) => {
    try {
      await approveSuggestion.mutateAsync({ suggestionId });
      refetch();
    } catch (error) {
      console.error('Failed to approve suggestion:', error);
    }
  };

  const handleReject = async (suggestionId: string) => {
    try {
      await rejectSuggestion.mutateAsync({ suggestionId });
      refetch();
    } catch (error) {
      console.error('Failed to reject suggestion:', error);
    }
  };

  const getConfidenceColor = (confidence: string | null) => {
    if (!confidence) return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
    const score = Number.parseFloat(confidence);
    if (score >= 0.8) return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
    if (score >= 0.6) return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400';
    if (score >= 0.4)
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400';
    return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400';
  };

  const getSuggestionTypeLabel = (type: string) => {
    return type.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  };

  return (
    <ProtectedComponent permission="data-explorer:manage:all">
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-9xl mx-auto">
        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">
            AI Improvement Suggestions
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Review and approve AI-generated suggestions to improve Data Explorer quality
          </p>
        </div>

        {/* Statistics Cards */}
        {statistics && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">Pending</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                {statistics.pendingSuggestions}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">Approved</p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
                {statistics.approvedSuggestions}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">Auto-Applied</p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">
                {statistics.autoAppliedSuggestions}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">Avg Confidence</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                {(statistics.averageConfidence * 100).toFixed(0)}%
              </p>
            </div>
          </div>
        )}

        {/* Suggestions List */}
        {isLoading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500" />
            <p className="text-gray-600 dark:text-gray-400 mt-4">Loading suggestions...</p>
          </div>
        ) : !suggestions || suggestions.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 shadow-sm rounded-lg p-8 text-center">
            <svg
              className="w-16 h-16 text-gray-400 dark:text-gray-600 mx-auto mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
              No pending suggestions
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              All suggestions have been reviewed. Check back later for new AI-generated improvements.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {suggestions.map((suggestion) => (
              <div
                key={suggestion.suggestion_id}
                className="bg-white dark:bg-gray-800 shadow-sm rounded-lg overflow-hidden"
              >
                <div className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-violet-100 text-violet-800 dark:bg-violet-900/20 dark:text-violet-400">
                          {getSuggestionTypeLabel(suggestion.suggestion_type)}
                        </span>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getConfidenceColor(suggestion.confidence_score)}`}
                        >
                          {suggestion.confidence_score
                            ? `${(Number.parseFloat(suggestion.confidence_score) * 100).toFixed(0)}% confidence`
                            : 'Unknown confidence'}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {new Date(suggestion.created_at).toLocaleDateString()}
                        </span>
                      </div>

                      <div className="mb-2">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Target:{' '}
                        </span>
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {suggestion.target_type} {suggestion.target_id ? `(${suggestion.target_id})` : ''}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setExpandedSuggestion(
                            expandedSuggestion === suggestion.suggestion_id
                              ? null
                              : suggestion.suggestion_id
                          )
                        }
                        className="text-sm text-violet-600 dark:text-violet-400 hover:underline"
                      >
                        {expandedSuggestion === suggestion.suggestion_id
                          ? 'Hide details'
                          : 'Show details'}
                      </button>
                    </div>

                    <div className="ml-4 flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleApprove(suggestion.suggestion_id)}
                        disabled={approveSuggestion.isPending}
                        className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReject(suggestion.suggestion_id)}
                        disabled={rejectSuggestion.isPending}
                        className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  </div>

                  {expandedSuggestion === suggestion.suggestion_id && (
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Suggested Change:
                      </h4>
                      <pre className="text-xs bg-gray-50 dark:bg-gray-900 p-3 rounded overflow-x-auto">
                        <code className="text-gray-800 dark:text-gray-200">
                          {JSON.stringify(suggestion.suggested_change, null, 2)}
                        </code>
                      </pre>

                      {suggestion.feedback_id && (
                        <div className="mt-3">
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            Generated from feedback: {suggestion.feedback_id}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </ProtectedComponent>
  );
}


