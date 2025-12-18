'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import Toast from './toast';
import { clientErrorLog } from '@/lib/utils/debug-client';

interface ViewSQLModalProps {
  isOpen: boolean;
  onClose: () => void;
  sql: string;
  explanation?: string | null | undefined;
  naturalLanguageQuery?: string | undefined;
}

export default function ViewSQLModal({
  isOpen,
  onClose,
  sql,
  explanation,
  naturalLanguageQuery,
}: ViewSQLModalProps) {
  const [showCopyToast, setShowCopyToast] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(sql);
      setShowCopyToast(true);
      setTimeout(() => setShowCopyToast(false), 2000);
    } catch (err) {
      clientErrorLog('Failed to copy SQL:', err);
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        size="xl"
        title="Generated SQL"
        description={naturalLanguageQuery ? `Query: "${naturalLanguageQuery}"` : undefined}
      >
        {/* Modal body */}
        <div className="px-4 sm:px-6 py-4 overflow-y-auto max-h-[calc(90vh-200px)]">
                {explanation && (
                  <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <h4 className="text-sm font-medium text-blue-900 dark:text-blue-200 mb-1">
                      Explanation
                    </h4>
                    <p className="text-sm text-blue-700 dark:text-blue-300">{explanation}</p>
                  </div>
                )}

                <div className="relative">
                  <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm font-mono">
                    <code>{sql}</code>
                  </pre>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={handleCopy}
                    aria-label="Copy to clipboard"
                    className="absolute top-2 right-2 bg-gray-700 hover:bg-gray-600 text-white"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </Button>
                </div>
              </div>

              {/* Modal footer */}
              <div className="px-4 sm:px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={onClose}>
                    Close
                  </Button>
                  <Button
                    variant="violet"
                    onClick={handleCopy}
                    leftIcon={
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    }
                  >
                    Copy SQL
                  </Button>
                </div>
              </div>
      </Modal>

      {/* Copy success toast */}
      <Toast type="success" open={showCopyToast} setOpen={setShowCopyToast}>
        SQL copied to clipboard
      </Toast>
    </>
  );
}

