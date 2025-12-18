'use client';

import { useState, useId } from 'react';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import ProtectedComponent from '@/components/rbac/protected-component';
import { usePendingFeedback, useResolveFeedback } from '@/lib/hooks/use-data-explorer';
import type { QueryFeedback, ResolveFeedbackParams } from '@/lib/types/data-explorer';
import { getFeedbackSeverityColor, getFeedbackStatusColor } from '@/lib/utils/badge-colors';
import { clientErrorLog } from '@/lib/utils/debug-client';

export default function FeedbackDashboardPage() {
  const [selectedStatus, setSelectedStatus] = useState<QueryFeedback['resolution_status'] | 'all'>('pending');
  const [selectedSeverity, setSelectedSeverity] = useState<QueryFeedback['severity'] | 'all'>('all');
  const [expandedFeedback, setExpandedFeedback] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolutionStatus, setResolutionStatus] = useState<ResolveFeedbackParams['resolution_status']>('resolved');

  const statusFilterId = useId();
  const severityFilterId = useId();

  const { data: feedback, isLoading, refetch } = usePendingFeedback({
    status: selectedStatus === 'all' ? undefined : selectedStatus,
    severity: selectedSeverity === 'all' ? undefined : selectedSeverity,
    limit: 100,
  });

  const resolveFeedback = useResolveFeedback();

  const handleResolve = async (feedbackId: string) => {
    try {
      await resolveFeedback.mutateAsync({
        feedbackId,
        data: { resolution_status: resolutionStatus },
      });
      setResolvingId(null);
      refetch();
    } catch (error) {
      clientErrorLog('Failed to resolve feedback:', error);
    }
  };

  return (
    <ProtectedComponent permission="data-explorer:manage:all">
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-9xl mx-auto">
        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">
            Query Feedback Dashboard
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Review and resolve user-reported issues with Data Explorer queries
          </p>
        </div>

        {/* Filters */}
        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-lg p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor={statusFilterId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Status
              </label>
              <select
                id={statusFilterId}
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value as typeof selectedStatus)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-violet-500 focus:border-violet-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="resolved">Resolved</option>
                <option value="metadata_updated">Metadata Updated</option>
                <option value="instruction_created">Instruction Created</option>
                <option value="relationship_added">Relationship Added</option>
                <option value="wont_fix">Won't Fix</option>
              </select>
            </div>

            <div>
              <label htmlFor={severityFilterId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Severity
              </label>
              <select
                id={severityFilterId}
                value={selectedSeverity}
                onChange={(e) => setSelectedSeverity(e.target.value as typeof selectedSeverity)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-violet-500 focus:border-violet-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                <option value="all">All Severities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>
        </div>

        {/* Feedback List */}
        {isLoading ? (
          <div className="text-center py-12">
            <Spinner size="md" />
            <p className="text-gray-600 dark:text-gray-400 mt-4">Loading feedback...</p>
          </div>
        ) : !feedback || feedback.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 shadow-sm rounded-lg p-8 text-center">
            <svg className="w-16 h-16 text-gray-400 dark:text-gray-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              No feedback found
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              No feedback matches your current filters.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {feedback.map((item) => (
              <div
                key={item.feedback_id}
                className="bg-white dark:bg-gray-800 shadow-sm rounded-lg overflow-hidden"
              >
                <div className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge color={getFeedbackSeverityColor(item.severity)}>
                          {item.severity.toUpperCase()}
                        </Badge>
                        <Badge color={getFeedbackStatusColor(item.resolution_status)}>
                          {item.resolution_status.replace('_', ' ').toUpperCase()}
                        </Badge>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {new Date(item.created_at).toLocaleDateString()}
                        </span>
                      </div>

                      <div className="mb-2">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Type: </span>
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {item.feedback_type.replace('_', ' ')}
                        </span>
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 ml-4">Category: </span>
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {item.feedback_category.replace('_', ' ')}
                        </span>
                      </div>

                      {item.user_explanation && (
                        <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                          {item.user_explanation}
                        </p>
                      )}

                      <button
                        type="button"
                        onClick={() => setExpandedFeedback(expandedFeedback === item.feedback_id ? null : item.feedback_id)}
                        className="text-sm text-violet-600 dark:text-violet-400 hover:underline"
                      >
                        {expandedFeedback === item.feedback_id ? 'Hide details' : 'Show details'}
                      </button>
                    </div>

                    {item.resolution_status === 'pending' && (
                      <div className="ml-4">
                        {resolvingId === item.feedback_id ? (
                          <div className="flex items-center gap-2">
                            <select
                              value={resolutionStatus}
                              onChange={(e) => setResolutionStatus(e.target.value as ResolveFeedbackParams['resolution_status'])}
                              className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                            >
                              <option value="resolved">Resolved</option>
                              <option value="metadata_updated">Metadata Updated</option>
                              <option value="instruction_created">Instruction Created</option>
                              <option value="relationship_added">Relationship Added</option>
                              <option value="wont_fix">Won't Fix</option>
                            </select>
                            <button
                              type="button"
                              onClick={() => handleResolve(item.feedback_id)}
                              disabled={resolveFeedback.isPending}
                              className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setResolvingId(null)}
                              className="px-3 py-1 text-sm bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-400 dark:hover:bg-gray-500"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setResolvingId(item.feedback_id)}
                            className="px-4 py-2 text-sm bg-violet-600 text-white rounded hover:bg-violet-700"
                          >
                            Resolve
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {expandedFeedback === item.feedback_id && (
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
                      {/* AI Analysis */}
                      {item.detected_issue && (
                        <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                          <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">
                            🤖 AI Analysis:
                          </h4>
                          <p className="text-sm text-blue-700 dark:text-blue-300">{item.detected_issue}</p>
                        </div>
                      )}

                      {/* Affected Resources */}
                      {(item.affected_tables && item.affected_tables.length > 0) || (item.affected_columns && item.affected_columns.length > 0) ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {item.affected_tables && item.affected_tables.length > 0 && (
                            <div>
                              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Affected Tables:
                              </h4>
                              <div className="flex flex-wrap gap-1">
                                {item.affected_tables.map((table) => (
                                  <Badge key={table} color="purple" size="sm" shape="rounded">
                                    {table}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}

                          {item.affected_columns && item.affected_columns.length > 0 && (
                            <div>
                              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Affected Columns:
                              </h4>
                              <div className="flex flex-wrap gap-1">
                                {item.affected_columns.map((column) => (
                                  <Badge key={column} color="indigo" size="sm" shape="rounded">
                                    {column}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : null}

                      {/* Pattern Indicators */}
                      {(item.similar_query_count > 0 || item.recurrence_score) && (
                        <div className="flex items-center gap-4 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded">
                          {item.similar_query_count > 0 && (
                            <div className="flex items-center gap-1">
                              <svg className="w-4 h-4 text-yellow-600 dark:text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                              </svg>
                              <span className="text-xs text-yellow-800 dark:text-yellow-200">
                                {item.similar_query_count} similar {item.similar_query_count === 1 ? 'issue' : 'issues'}
                              </span>
                            </div>
                          )}
                          {item.recurrence_score && (
                            <div className="flex items-center gap-1">
                              <svg className="w-4 h-4 text-yellow-600 dark:text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                              </svg>
                              <span className="text-xs text-yellow-800 dark:text-yellow-200">
                                Recurrence score: {Number.parseFloat(item.recurrence_score).toFixed(1)}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* SQL Comparison */}
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Original SQL:</h4>
                        <pre className="text-xs bg-gray-50 dark:bg-gray-900 p-3 rounded overflow-x-auto">
                          <code className="text-gray-800 dark:text-gray-200">{item.original_sql}</code>
                        </pre>
                      </div>

                      {item.corrected_sql && (
                        <div>
                          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Corrected SQL:</h4>
                          <pre className="text-xs bg-green-50 dark:bg-green-900/20 p-3 rounded overflow-x-auto">
                            <code className="text-gray-800 dark:text-gray-200">{item.corrected_sql}</code>
                          </pre>
                        </div>
                      )}

                      {/* Resolution Info */}
                      {item.resolved_at && (
                        <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Resolution:</h4>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            Resolved on {new Date(item.resolved_at).toLocaleString()}
                            {item.resolved_by && ` by ${item.resolved_by}`}
                          </p>
                          {item.resolution_action !== null && item.resolution_action !== undefined && (
                            <div className="mt-2">
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                Action taken:{' '}
                                {typeof item.resolution_action === 'string'
                                  ? item.resolution_action
                                  : JSON.stringify(item.resolution_action)}
                              </p>
                            </div>
                          )}
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

