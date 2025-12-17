'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { apiClient } from '@/lib/api/client';
import type { ResolvedCSVRow, UserCreationResult } from '@/lib/validations/bulk-import';
import { CSV_FILE_SIZE_LIMIT, parseCSVLine } from '@/lib/utils/csv-import';
import CSVPreviewTable from './csv-preview-table';
import ModalBlank from './modal-blank';
import { Button } from './ui/button';

type Step = 'upload' | 'preview' | 'results';

// Response types match what apiClient returns (unwrapped data)
interface ValidationResponseData {
  valid_count: number;
  invalid_count: number;
  total_count: number;
  rows: ResolvedCSVRow[];
}

interface CommitResponseData {
  created_count: number;
  failed_count: number;
  results: UserCreationResult[];
}

interface BulkUserImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

/**
 * Bulk User Import Modal
 *
 * Three-step flow:
 * 1. Upload - Select and upload CSV file
 * 2. Preview - Review validation results
 * 3. Results - View import results
 */
export default function BulkUserImportModal({
  isOpen,
  onClose,
  onSuccess,
}: BulkUserImportModalProps) {
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<ValidationResponseData | null>(null);
  const [importResult, setImportResult] = useState<CommitResponseData | null>(null);

  // Reset state when modal closes
  const handleClose = () => {
    setStep('upload');
    setFile(null);
    setIsUploading(false);
    setIsImporting(false);
    setError(null);
    setValidationResult(null);
    setImportResult(null);
    onClose();
  };

  // Download template
  const handleDownloadTemplate = async () => {
    try {
      const response = await fetch('/api/users/bulk-import/template', {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to download template');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'user-import-template.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download template');
    }
  };

  // File drop handler
  const onDrop = useCallback((acceptedFiles: File[]) => {
    setError(null);
    const droppedFile = acceptedFiles[0];
    if (droppedFile) {
      setFile(droppedFile);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    maxSize: CSV_FILE_SIZE_LIMIT,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.ms-excel': ['.csv'],
      'text/plain': ['.csv'],
    },
  });

  // Upload and validate
  const handleUpload = async () => {
    if (!file) return;

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      // Pass FormData directly (not wrapped in object) for multipart/form-data
      // apiClient returns the unwrapped data directly (not { success, data })
      const data = await apiClient.post<ValidationResponseData>(
        '/api/users/bulk-import/validate',
        formData
      );

      if (!data || !data.rows) {
        throw new Error('Validation failed - invalid response');
      }

      setValidationResult(data);
      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to validate CSV');
    } finally {
      setIsUploading(false);
    }
  };

  // Import valid rows
  const handleImport = async () => {
    if (!validationResult) return;

    const validRows = validationResult.rows.filter((r) => r.is_valid);
    if (validRows.length === 0) return;

    setIsImporting(true);
    setError(null);

    try {
      // Prepare commit data - we need to include passwords from the original CSV
      // Since we don't have passwords in the validation response (security),
      // we need to re-parse the file and match by row number
      const fileContent = await file?.text();
      if (!fileContent) {
        throw new Error('Failed to read file');
      }

      // Parse the CSV to get passwords (simple parse for password extraction)
      const lines = fileContent.split('\n');
      const headers = lines[0]?.toLowerCase().split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
      const passwordIndex = headers?.indexOf('password') ?? -1;

      if (passwordIndex === -1) {
        throw new Error('Password column not found');
      }

      // Build commit rows with passwords
      const commitRows = validRows.map((row) => {
        // Get the original CSV line for this row
        const csvLine = lines[row.row_number];
        if (!csvLine) {
          throw new Error(`Row ${row.row_number} not found in CSV`);
        }

        // Parse the line to get the password
        const values = parseCSVLine(csvLine);
        const password = values[passwordIndex] ?? '';

        // organization_id is guaranteed to be non-null for valid rows
        const orgId = row.data.organization_id;
        if (!orgId) {
          throw new Error(`Invalid row ${row.row_number}: missing organization_id`);
        }

        return {
          first_name: row.data.first_name,
          last_name: row.data.last_name,
          email: row.data.email,
          password,
          organization_id: orgId,
          role_ids: row.data.role_ids,
          provider_uid: row.data.provider_uid,
        };
      });

      // apiClient returns the unwrapped data directly (not { success, data })
      const data = await apiClient.post<CommitResponseData>('/api/users/bulk-import/commit', {
        rows: commitRows,
      });

      if (!data || !data.results) {
        throw new Error('Import failed - invalid response');
      }

      setImportResult(data);
      setStep('results');

      // Call success callback if any users were created
      if (data.created_count > 0) {
        onSuccess?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import users');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <ModalBlank isOpen={isOpen} setIsOpen={handleClose}>
      <div className="p-5">
        {/* Header */}
        <div className="mb-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
              {step === 'upload' && 'Import Users from CSV'}
              {step === 'preview' && 'Review Import Data'}
              {step === 'results' && 'Import Results'}
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClose}
              aria-label="Close"
              className="p-0"
            >
              <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </Button>
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {step === 'upload' && 'Upload a CSV file to create multiple users at once.'}
            {step === 'preview' && 'Review the parsed data and fix any errors before importing.'}
            {step === 'results' && 'Summary of the import operation.'}
          </p>
        </div>

        {/* Error display */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <div className="flex items-center">
              <svg
                className="w-5 h-5 text-red-600 dark:text-red-400 mr-2"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span className="text-sm text-red-600 dark:text-red-400">{error}</span>
            </div>
          </div>
        )}

        {/* Step: Upload */}
        {step === 'upload' && (
          <div className="space-y-4">
            {/* Template download */}
            <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <div className="flex items-center">
                <svg
                  className="w-5 h-5 text-blue-600 dark:text-blue-400 mr-2"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span className="text-sm text-blue-700 dark:text-blue-300">
                  Need a template? Download it to see the expected format.
                </span>
              </div>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                Download Template
              </button>
            </div>

            {/* Dropzone */}
            <div
              {...getRootProps()}
              className={`
                border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
                transition-colors duration-200
                ${
                  isDragActive
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                    : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                }
              `}
            >
              <input {...getInputProps()} />
              <svg
                className="mx-auto h-12 w-12 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                {isDragActive
                  ? 'Drop the CSV file here...'
                  : 'Drag and drop a CSV file, or click to browse'}
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
                CSV files only, max 5MB
              </p>
            </div>

            {/* Selected file */}
            {file && (
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="flex items-center">
                  <svg
                    className="w-5 h-5 text-gray-400 mr-2"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {file.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setFile(null)}
                  aria-label="Remove file"
                  className="p-0"
                >
                  <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </Button>
              </div>
            )}

            {/* Upload button */}
            <div className="flex justify-end gap-3">
              <Button
                variant="secondary"
                onClick={handleClose}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleUpload}
                disabled={!file}
                loading={isUploading}
                loadingText="Validating..."
              >
                Upload & Validate
              </Button>
            </div>
          </div>
        )}

        {/* Step: Preview */}
        {step === 'preview' && validationResult && (
          <div className="space-y-4">
            <div className="max-h-96 overflow-y-auto">
              <CSVPreviewTable
                rows={validationResult.rows}
                onImport={handleImport}
                isImporting={isImporting}
              />
            </div>

            <div className="flex justify-between">
              <Button
                variant="secondary"
                onClick={() => {
                  setStep('upload');
                  setValidationResult(null);
                }}
                disabled={isImporting}
              >
                Back
              </Button>
            </div>
          </div>
        )}

        {/* Step: Results */}
        {step === 'results' && importResult && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg text-center">
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {importResult.created_count}
                </p>
                <p className="text-sm text-green-700 dark:text-green-300">Users Created</p>
              </div>
              <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg text-center">
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {importResult.failed_count}
                </p>
                <p className="text-sm text-red-700 dark:text-red-300">Failed</p>
              </div>
            </div>

            {/* Failed rows details */}
            {importResult.failed_count > 0 && (
              <div className="border border-red-200 dark:border-red-800 rounded-lg overflow-hidden">
                <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
                  <h4 className="text-sm font-medium text-red-800 dark:text-red-200">
                    Failed Imports
                  </h4>
                </div>
                <ul className="divide-y divide-red-100 dark:divide-red-800/50">
                  {importResult.results
                    .filter((r) => !r.success)
                    .map((result) => (
                      <li
                        key={result.row_number}
                        className="px-4 py-2 text-sm"
                      >
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          Row {result.row_number} ({result.email}):
                        </span>{' '}
                        <span className="text-red-600 dark:text-red-400">{result.error}</span>
                      </li>
                    ))}
                </ul>
              </div>
            )}

            {/* Close button */}
            <div className="flex justify-end">
              <Button variant="primary" onClick={handleClose}>
                Close
              </Button>
            </div>
          </div>
        )}
      </div>
    </ModalBlank>
  );
}
