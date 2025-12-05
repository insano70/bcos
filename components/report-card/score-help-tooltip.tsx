'use client';

import { useState } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Score Help Tooltip Component
 * 
 * Displays an info icon that, when clicked, shows a modal explaining
 * how the report card grade is calculated.
 */
export default function ScoreHelpTooltip() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        aria-label="How is my grade calculated?"
        title="How is my grade calculated?"
      >
        <HelpCircle className="w-4 h-4" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/50 z-50"
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg z-50"
            >
              <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                  <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                    <HelpCircle className="w-5 h-5 text-violet-500" />
                    How Your Grade is Calculated
                  </h3>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
                  {/* Step 1: Peer Comparison */}
                  <div>
                    <h4 className="font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400 text-sm font-bold">
                        1
                      </span>
                      Peer Comparison
                    </h4>
                    <p className="text-sm text-slate-600 dark:text-slate-400 ml-8">
                      Your metrics are compared to similar-sized practices. Your percentile rank (0-100) 
                      is transformed to a grade-friendly scale:
                    </p>
                    <div className="ml-8 mt-2 grid grid-cols-3 gap-2 text-xs">
                      <div className="p-2 rounded bg-rose-50 dark:bg-rose-900/20 text-center">
                        <div className="font-medium text-rose-700 dark:text-rose-300">0th percentile</div>
                        <div className="text-rose-600 dark:text-rose-400">→ 70 (C-)</div>
                      </div>
                      <div className="p-2 rounded bg-amber-50 dark:bg-amber-900/20 text-center">
                        <div className="font-medium text-amber-700 dark:text-amber-300">50th percentile</div>
                        <div className="text-amber-600 dark:text-amber-400">→ 85 (B-)</div>
                      </div>
                      <div className="p-2 rounded bg-emerald-50 dark:bg-emerald-900/20 text-center">
                        <div className="font-medium text-emerald-700 dark:text-emerald-300">100th percentile</div>
                        <div className="text-emerald-600 dark:text-emerald-400">→ 100 (A+)</div>
                      </div>
                    </div>
                  </div>

                  {/* Step 2: Trend Adjustment */}
                  <div>
                    <h4 className="font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400 text-sm font-bold">
                        2
                      </span>
                      Trend Adjustment
                    </h4>
                    <p className="text-sm text-slate-600 dark:text-slate-400 ml-8">
                      Your score is adjusted based on your trend compared to previous months:
                    </p>
                    <div className="ml-8 mt-2 space-y-1 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-500">↑ Improving:</span>
                        <span className="text-slate-600 dark:text-slate-400">+3 points</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-rose-500">↓ Declining:</span>
                        <span className="text-slate-600 dark:text-slate-400">-3 points</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500">→ Stable:</span>
                        <span className="text-slate-600 dark:text-slate-400">No adjustment</span>
                      </div>
                    </div>
                  </div>

                  {/* Step 3: Weighted Average */}
                  <div>
                    <h4 className="font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400 text-sm font-bold">
                        3
                      </span>
                      Weighted Average
                    </h4>
                    <p className="text-sm text-slate-600 dark:text-slate-400 ml-8">
                      Each measure contributes to your overall score based on its configured weight. 
                      Some measures may have higher importance than others.
                    </p>
                  </div>

                  {/* Grade Scale */}
                  <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                    <h4 className="font-semibold text-slate-700 dark:text-slate-300 mb-3">
                      Grade Scale
                    </h4>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div className="flex items-center gap-2 p-2 rounded bg-emerald-50 dark:bg-emerald-900/20">
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">A</span>
                        <span className="text-slate-600 dark:text-slate-400">(90-100)</span>
                      </div>
                      <div className="flex items-center gap-2 p-2 rounded bg-teal-50 dark:bg-teal-900/20">
                        <span className="font-bold text-teal-600 dark:text-teal-400">B</span>
                        <span className="text-slate-600 dark:text-slate-400">(80-89)</span>
                      </div>
                      <div className="flex items-center gap-2 p-2 rounded bg-amber-50 dark:bg-amber-900/20">
                        <span className="font-bold text-amber-600 dark:text-amber-400">C</span>
                        <span className="text-slate-600 dark:text-slate-400">(70-79)</span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 italic">
                      The minimum grade is C- (70). We don&apos;t assign D or F grades.
                    </p>
                  </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                  <button
                    onClick={() => setIsOpen(false)}
                    className="w-full py-2 px-4 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-medium transition-colors"
                  >
                    Got it
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

