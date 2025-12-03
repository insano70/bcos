'use client';

import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react';
import { useState } from 'react';
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
      <Transition appear show={isOpen}>
        <Dialog as="div" onClose={onClose}>
          <TransitionChild
            as="div"
            className="fixed inset-0 bg-gray-900/30 z-50 transition-opacity"
            enter="transition ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="transition ease-out duration-100"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
            aria-hidden="true"
          />
          <TransitionChild
            as="div"
            className="fixed inset-0 z-50 overflow-hidden flex items-center my-4 justify-center px-4 sm:px-6"
            enter="transition ease-in-out duration-200"
            enterFrom="opacity-0 translate-y-4"
            enterTo="opacity-100 translate-y-0"
            leave="transition ease-in-out duration-200"
            leaveFrom="opacity-100 translate-y-0"
            leaveTo="opacity-0 translate-y-4"
          >
            <DialogPanel className="bg-white dark:bg-gray-800 rounded-lg shadow-xl overflow-hidden max-w-4xl w-full max-h-[90vh]">
              {/* Modal header */}
              <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-start justify-between">
                  <div>
                    <Dialog.Title className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                      Generated SQL
                    </Dialog.Title>
                    {naturalLanguageQuery && (
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        Query: "{naturalLanguageQuery}"
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
                    onClick={onClose}
                  >
                    <span className="sr-only">Close</span>
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

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
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="absolute top-2 right-2 btn-sm bg-gray-700 hover:bg-gray-600 text-white"
                    title="Copy to clipboard"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Modal footer */}
              <div className="px-4 sm:px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="btn border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 text-gray-800 dark:text-gray-300"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="btn bg-violet-500 hover:bg-violet-600 text-white"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Copy SQL
                  </button>
                </div>
              </div>
            </DialogPanel>
          </TransitionChild>
        </Dialog>
      </Transition>

      {/* Copy success toast */}
      <Toast type="success" open={showCopyToast} setOpen={setShowCopyToast}>
        SQL copied to clipboard
      </Toast>
    </>
  );
}

