'use client';

import { useState, useId } from 'react';
import { Button } from '@/components/ui/button';
import { FormLabel } from '@/components/ui/form-label';
import { useSubmitFeedback } from '@/lib/hooks/use-data-explorer';
import type { SubmitFeedbackParams } from '@/lib/types/data-explorer';
import { clientErrorLog } from '@/lib/utils/debug-client';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  queryHistoryId: string;
  originalSql: string;
  naturalLanguageQuery: string;
}

export default function FeedbackModal({
  isOpen,
  onClose,
  queryHistoryId,
  originalSql,
  naturalLanguageQuery,
}: FeedbackModalProps) {
  const [feedbackType, setFeedbackType] = useState<SubmitFeedbackParams['feedback_type']>('incorrect_sql');
  const [feedbackCategory, setFeedbackCategory] = useState<SubmitFeedbackParams['feedback_category']>('metadata_gap');
  const [severity, setSeverity] = useState<SubmitFeedbackParams['severity']>('medium');
  const [correctedSql, setCorrectedSql] = useState('');
  const [explanation, setExplanation] = useState('');

  const modalTitleId = useId();
  const feedbackTypeId = useId();
  const feedbackCategoryId = useId();
  const severityId = useId();
  const correctedSqlId = useId();
  const explanationId = useId();

  const submitFeedback = useSubmitFeedback();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await submitFeedback.mutateAsync({
        query_history_id: queryHistoryId,
        feedback_type: feedbackType,
        feedback_category: feedbackCategory,
        severity,
        original_sql: originalSql,
        corrected_sql: correctedSql || null,
        user_explanation: explanation || null,
      });

      // Reset form and close
      setCorrectedSql('');
      setExplanation('');
      onClose();
    } catch (error) {
      clientErrorLog('Failed to submit feedback:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div 
          className="fixed inset-0 bg-gray-500 dark:bg-gray-900 bg-opacity-75 dark:bg-opacity-75 transition-opacity" 
          aria-hidden="true"
          onClick={onClose}
        />

        {/* Center modal */}
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-3xl sm:w-full">
          <form onSubmit={handleSubmit}>
            <div className="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
              <div className="sm:flex sm:items-start">
                <div className="mt-3 text-center sm:mt-0 sm:text-left w-full">
                  <h3 className="text-lg leading-6 font-semibold text-gray-900 dark:text-gray-100" id={modalTitleId}>
                    Report Query Issue
                  </h3>
                  <div className="mt-4 space-y-4">
                    {/* Original Query Display */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Your Question
                      </label>
                      <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded text-sm text-gray-600 dark:text-gray-400">
                        {naturalLanguageQuery}
                      </div>
                    </div>

                    {/* Feedback Type */}
                    <div>
                      <FormLabel htmlFor={feedbackTypeId} required className="mb-1">
                        What went wrong?
                      </FormLabel>
                      <select
                        id={feedbackTypeId}
                        value={feedbackType}
                        onChange={(e) => setFeedbackType(e.target.value as SubmitFeedbackParams['feedback_type'])}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-violet-500 focus:border-violet-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        required
                      >
                        <option value="incorrect_sql">Generated incorrect SQL</option>
                        <option value="wrong_tables">Used wrong tables</option>
                        <option value="missing_join">Missing table joins</option>
                        <option value="wrong_filters">Wrong filters applied</option>
                        <option value="incorrect_columns">Incorrect columns selected</option>
                        <option value="performance_issue">Query too slow</option>
                        <option value="security_concern">Security concern</option>
                        <option value="other">Other issue</option>
                      </select>
                    </div>

                    {/* Feedback Category */}
                    <div>
                      <FormLabel htmlFor={feedbackCategoryId} required className="mb-1">
                        Root cause
                      </FormLabel>
                      <select
                        id={feedbackCategoryId}
                        value={feedbackCategory}
                        onChange={(e) => setFeedbackCategory(e.target.value as SubmitFeedbackParams['feedback_category'])}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-violet-500 focus:border-violet-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        required
                      >
                        <option value="metadata_gap">Missing table/column descriptions</option>
                        <option value="instruction_needed">Need query guidance/instruction</option>
                        <option value="relationship_missing">Missing table relationships</option>
                        <option value="semantic_misunderstanding">AI misunderstood the question</option>
                        <option value="prompt_issue">System prompt needs improvement</option>
                      </select>
                    </div>

                    {/* Severity */}
                    <div>
                      <FormLabel htmlFor={severityId} required className="mb-1">
                        Severity
                      </FormLabel>
                      <select
                        id={severityId}
                        value={severity}
                        onChange={(e) => setSeverity(e.target.value as SubmitFeedbackParams['severity'])}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-violet-500 focus:border-violet-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        required
                      >
                        <option value="low">Low - Minor inconvenience</option>
                        <option value="medium">Medium - Requires workaround</option>
                        <option value="high">High - Blocks important task</option>
                        <option value="critical">Critical - Security or data issue</option>
                      </select>
                    </div>

                    {/* Corrected SQL (Optional) */}
                    <div>
                      <label htmlFor={correctedSqlId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Corrected SQL (optional)
                      </label>
                      <textarea
                        id={correctedSqlId}
                        value={correctedSql}
                        onChange={(e) => setCorrectedSql(e.target.value)}
                        rows={6}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-violet-500 focus:border-violet-500 font-mono text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        placeholder="If you know the correct SQL, paste it here..."
                      />
                    </div>

                    {/* Explanation */}
                    <div>
                      <label htmlFor={explanationId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Additional details (optional)
                      </label>
                      <textarea
                        id={explanationId}
                        value={explanation}
                        onChange={(e) => setExplanation(e.target.value)}
                        rows={4}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-violet-500 focus:border-violet-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        placeholder="Describe what you expected vs what happened..."
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="bg-gray-50 dark:bg-gray-900 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse gap-3">
              <Button
                type="submit"
                variant="violet"
                size="md"
                disabled={submitFeedback.isPending}
                loading={submitFeedback.isPending}
                loadingText="Submitting..."
              >
                Submit Feedback
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={onClose}
                disabled={submitFeedback.isPending}
                className="mt-3 sm:mt-0"
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}


