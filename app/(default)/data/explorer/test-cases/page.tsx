'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import ProtectedComponent from '@/components/rbac/protected-component';
import {
  useTestCases,
  useRunTestCase,
  useGenerateTestCases,
} from '@/lib/hooks/use-data-explorer';
import { getTestPriorityColor } from '@/lib/utils/badge-colors';
import { clientErrorLog } from '@/lib/utils/debug-client';

export default function TestCasesPage() {
  const [expandedTestCase, setExpandedTestCase] = useState<string | null>(null);
  const [runningTestId, setRunningTestId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { passed: boolean; differences: string[] }>>({});

  const { data: testCases, isLoading, refetch } = useTestCases();
  const runTestCase = useRunTestCase();
  const generateTestCases = useGenerateTestCases();

  const handleRunTest = async (testCaseId: string) => {
    setRunningTestId(testCaseId);
    try {
      const result = await runTestCase.mutateAsync({ testCaseId });
      setTestResults((prev) => ({
        ...prev,
        [testCaseId]: { passed: result.passed, differences: result.differences },
      }));
    } catch (error) {
      clientErrorLog('Failed to run test case:', error);
    } finally {
      setRunningTestId(null);
    }
  };

  const handleGenerateTestCases = async () => {
    try {
      await generateTestCases.mutateAsync({ limit: 50 });
      refetch();
    } catch (error) {
      clientErrorLog('Failed to generate test cases:', error);
    }
  };

  return (
    <ProtectedComponent permission="data-explorer:manage:all">
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-9xl mx-auto">
        {/* Page header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">
              Regression Test Cases
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              Test cases generated from resolved feedback to prevent regressions
            </p>
          </div>

          <button
            type="button"
            onClick={handleGenerateTestCases}
            disabled={generateTestCases.isPending}
            className="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50"
          >
            {generateTestCases.isPending ? 'Generating...' : 'Generate Test Cases'}
          </button>
        </div>

        {/* Test Cases List */}
        {isLoading ? (
          <div className="text-center py-12">
            <Spinner size="md" />
            <p className="text-gray-600 dark:text-gray-400 mt-4">Loading test cases...</p>
          </div>
        ) : !testCases || testCases.length === 0 ? (
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
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
              />
            </svg>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              No test cases yet
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Generate test cases from resolved feedback to start building your regression test suite.
            </p>
            <button
              type="button"
              onClick={handleGenerateTestCases}
              disabled={generateTestCases.isPending}
              className="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50"
            >
              {generateTestCases.isPending ? 'Generating...' : 'Generate Test Cases'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {testCases.map((testCase) => {
              const result = testResults[testCase.testCaseId];
              return (
                <div
                  key={testCase.testCaseId}
                  className="bg-white dark:bg-gray-800 shadow-sm rounded-lg overflow-hidden"
                >
                  <div className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge color={getTestPriorityColor(testCase.priority)}>
                            {testCase.priority.toUpperCase()}
                          </Badge>
                          {testCase.tags.map((tag) => (
                            <Badge key={tag} color="gray">
                              {tag}
                            </Badge>
                          ))}
                          {result && (
                            <Badge color={result.passed ? 'green' : 'red'}>
                              {result.passed ? '✓ PASSED' : '✗ FAILED'}
                            </Badge>
                          )}
                        </div>

                        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">
                          {testCase.name}
                        </h3>

                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                          {testCase.description}
                        </p>

                        <button
                          type="button"
                          onClick={() =>
                            setExpandedTestCase(
                              expandedTestCase === testCase.testCaseId ? null : testCase.testCaseId
                            )
                          }
                          className="text-sm text-violet-600 dark:text-violet-400 hover:underline"
                        >
                          {expandedTestCase === testCase.testCaseId ? 'Hide details' : 'Show details'}
                        </button>
                      </div>

                      <div className="ml-4">
                        <button
                          type="button"
                          onClick={() => handleRunTest(testCase.testCaseId)}
                          disabled={runningTestId === testCase.testCaseId}
                          className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                        >
                          {runningTestId === testCase.testCaseId ? 'Running...' : 'Run Test'}
                        </button>
                      </div>
                    </div>

                    {expandedTestCase === testCase.testCaseId && (
                      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
                        <div>
                          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Natural Language Query:
                          </h4>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {testCase.naturalLanguageQuery}
                          </p>
                        </div>

                        <div>
                          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Expected SQL:
                          </h4>
                          <pre className="text-xs bg-gray-50 dark:bg-gray-900 p-3 rounded overflow-x-auto">
                            <code className="text-gray-800 dark:text-gray-200">
                              {testCase.expectedSQL}
                            </code>
                          </pre>
                        </div>

                        {result && !result.passed && result.differences.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium text-red-700 dark:text-red-300 mb-1">
                              Differences Found:
                            </h4>
                            <ul className="list-disc list-inside text-sm text-red-600 dark:text-red-400 space-y-1">
                              {result.differences.map((diff) => (
                                <li key={diff}>{diff}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          Created: {new Date(testCase.createdAt).toLocaleString()} • Category:{' '}
                          {testCase.category} • Source: {testCase.createdFrom}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ProtectedComponent>
  );
}


