'use client';

import { useState, useMemo } from 'react';
import { HelpCircle, X, Calculator, Users, TrendingUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { SCORE_TRANSFORMATION, SCORE_WEIGHTS } from '@/lib/constants/report-card';
import type { MeasureScore } from '@/lib/types/report-card';

interface ScoreHelpTooltipProps {
  /** Overall score from report card */
  overallScore?: number | undefined;
  /** Percentile rank (0-100) */
  percentileRank?: number | undefined;
  /** Measure scores for calculating average trend */
  measureScores?: Record<string, MeasureScore> | undefined;
  /** Report card month for display */
  reportCardMonth?: string | undefined;
}

/**
 * Calculate peer score from percentile rank
 * Formula: FLOOR + (percentile / 100) * RANGE
 */
function calculatePeerScore(percentileRank: number): number {
  const { FLOOR, RANGE } = SCORE_TRANSFORMATION;
  return FLOOR + (percentileRank / 100) * RANGE;
}

/**
 * Calculate trend score from trend percentage
 * Maps -50% to +50% trend → 70 to 100 score
 */
function calculateTrendScore(trendPercentage: number): number {
  const { FLOOR, RANGE } = SCORE_TRANSFORMATION;
  const { MAX_TREND_PERCENT } = SCORE_WEIGHTS;
  
  // Clamp trend to -50% to +50%
  const clampedTrend = Math.max(-MAX_TREND_PERCENT, Math.min(MAX_TREND_PERCENT, trendPercentage));
  // Normalize to 0-100 scale: -50% → 0, 0% → 50, +50% → 100
  const normalizedTrend = (clampedTrend + MAX_TREND_PERCENT) / (2 * MAX_TREND_PERCENT) * 100;
  
  return FLOOR + (normalizedTrend / 100) * RANGE;
}

/**
 * Calculate average trend percentage from measure scores
 */
function calculateAverageTrend(measureScores: Record<string, MeasureScore>): number {
  const scores = Object.values(measureScores);
  if (scores.length === 0) return 0;
  
  const totalTrend = scores.reduce((sum, s) => sum + (s.trend_percentage || 0), 0);
  return totalTrend / scores.length;
}

/**
 * Get letter grade from score
 */
function getGradeFromScore(score: number): string {
  if (score >= 97) return 'A+';
  if (score >= 93) return 'A';
  if (score >= 90) return 'A-';
  if (score >= 87) return 'B+';
  if (score >= 83) return 'B';
  if (score >= 80) return 'B-';
  if (score >= 77) return 'C+';
  if (score >= 73) return 'C';
  return 'C-';
}

/**
 * Score Help Tooltip Component
 * 
 * Displays an info icon that, when clicked, shows a modal explaining
 * how the report card grade is calculated with actual values.
 */
export default function ScoreHelpTooltip({
  overallScore,
  percentileRank,
  measureScores,
  reportCardMonth,
}: ScoreHelpTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Calculate actual values if data is provided
  const calculations = useMemo(() => {
    if (percentileRank === undefined || !measureScores) {
      return null;
    }

    const peerScore = calculatePeerScore(percentileRank);
    const avgTrend = calculateAverageTrend(measureScores);
    const trendScore = calculateTrendScore(avgTrend);
    const { PEER_WEIGHT, TREND_WEIGHT } = SCORE_WEIGHTS;
    const calculatedFinal = (peerScore * PEER_WEIGHT) + (trendScore * TREND_WEIGHT);

    return {
      percentileRank,
      peerScore: Math.round(peerScore * 10) / 10,
      avgTrend: Math.round(avgTrend * 10) / 10,
      trendScore: Math.round(trendScore * 10) / 10,
      calculatedFinal: Math.round(calculatedFinal * 10) / 10,
      actualScore: overallScore,
      grade: overallScore ? getGradeFromScore(overallScore) : undefined,
      peerWeight: PEER_WEIGHT * 100,
      trendWeight: TREND_WEIGHT * 100,
    };
  }, [percentileRank, measureScores, overallScore]);

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
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg z-50 mx-4"
            >
              <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                  <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                    <Calculator className="w-5 h-5 text-violet-500" />
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
                <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
                  
                  {/* Your Calculation - Personalized Section */}
                  {calculations && (
                    <div className="p-4 rounded-xl bg-gradient-to-br from-violet-50 to-indigo-50 dark:from-violet-900/20 dark:to-indigo-900/20 border border-violet-200 dark:border-violet-800">
                      <h4 className="font-semibold text-violet-700 dark:text-violet-300 mb-3 text-sm uppercase tracking-wide">
                        {reportCardMonth ? `Your ${reportCardMonth} Calculation` : 'Your Calculation'}
                      </h4>
                      
                      {/* Score Boxes */}
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <div className="bg-white dark:bg-slate-800 rounded-lg p-3 text-center shadow-sm">
                          <div className="flex items-center justify-center gap-1 text-xs text-slate-500 dark:text-slate-400 mb-1">
                            <Users className="w-3 h-3" />
                            Peer Score ({calculations.peerWeight}%)
                          </div>
                          <div className="text-2xl font-bold text-slate-800 dark:text-slate-200">
                            {calculations.peerScore}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {calculations.percentileRank}th percentile
                          </div>
                        </div>
                        <div className="bg-white dark:bg-slate-800 rounded-lg p-3 text-center shadow-sm">
                          <div className="flex items-center justify-center gap-1 text-xs text-slate-500 dark:text-slate-400 mb-1">
                            <TrendingUp className="w-3 h-3" />
                            Trend Score ({calculations.trendWeight}%)
                          </div>
                          <div className="text-2xl font-bold text-slate-800 dark:text-slate-200">
                            {calculations.trendScore}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {calculations.avgTrend >= 0 ? '+' : ''}{calculations.avgTrend}% avg
                          </div>
                        </div>
                      </div>

                      {/* Formula */}
                      <div className="bg-white/60 dark:bg-slate-800/60 rounded-lg p-3 text-center">
                        <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Final Score</div>
                        <div className="font-mono text-sm text-slate-600 dark:text-slate-400 mb-1">
                          ({calculations.peerScore} × 0.5) + ({calculations.trendScore} × 0.5)
                        </div>
                        <div className="flex items-center justify-center gap-2">
                          <span className="text-2xl font-bold text-violet-600 dark:text-violet-400">
                            {calculations.actualScore ?? calculations.calculatedFinal}
                          </span>
                          {calculations.grade && (
                            <span className="px-2 py-0.5 rounded bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300 font-semibold">
                              {calculations.grade}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Step 1: Peer Comparison */}
                  <div>
                    <h4 className="font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400 text-sm font-bold">
                        1
                      </span>
                      Peer Comparison (50%)
                    </h4>
                    <p className="text-sm text-slate-600 dark:text-slate-400 ml-8 mb-2">
                      Your metrics are compared to similar-sized practices. Your percentile rank is 
                      transformed to a 70-100 scale:
                    </p>
                    <div className="ml-8 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 font-mono text-sm text-slate-600 dark:text-slate-400">
                      Peer Score = 70 + (percentile ÷ 100) × 30
                    </div>
                    <div className="ml-8 mt-2 grid grid-cols-3 gap-2 text-xs">
                      <div className="p-2 rounded bg-rose-50 dark:bg-rose-900/20 text-center">
                        <div className="font-medium text-rose-700 dark:text-white">0th %</div>
                        <div className="text-rose-600 dark:text-white/80">→ 70</div>
                      </div>
                      <div className="p-2 rounded bg-amber-50 dark:bg-amber-900/20 text-center">
                        <div className="font-medium text-amber-700 dark:text-amber-300">50th %</div>
                        <div className="text-amber-600 dark:text-amber-400">→ 85</div>
                      </div>
                      <div className="p-2 rounded bg-emerald-50 dark:bg-emerald-900/20 text-center">
                        <div className="font-medium text-emerald-700 dark:text-emerald-300">100th %</div>
                        <div className="text-emerald-600 dark:text-emerald-400">→ 100</div>
                      </div>
                    </div>
                  </div>

                  {/* Step 2: Trend Score */}
                  <div>
                    <h4 className="font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400 text-sm font-bold">
                        2
                      </span>
                      Trend Performance (50%)
                    </h4>
                    <p className="text-sm text-slate-600 dark:text-slate-400 ml-8 mb-2">
                      Your trend score is based on improvement vs prior 3 months. Trends are 
                      capped at ±50% and transformed to the same 70-100 scale:
                    </p>
                    <div className="ml-8 mt-2 grid grid-cols-3 gap-2 text-xs">
                      <div className="p-2 rounded bg-rose-50 dark:bg-rose-900/20 text-center">
                        <div className="font-medium text-rose-700 dark:text-white">-50%</div>
                        <div className="text-rose-600 dark:text-white/80">→ 70</div>
                      </div>
                      <div className="p-2 rounded bg-amber-50 dark:bg-amber-900/20 text-center">
                        <div className="font-medium text-amber-700 dark:text-amber-300">0%</div>
                        <div className="text-amber-600 dark:text-amber-400">→ 85</div>
                      </div>
                      <div className="p-2 rounded bg-emerald-50 dark:bg-emerald-900/20 text-center">
                        <div className="font-medium text-emerald-700 dark:text-emerald-300">+50%</div>
                        <div className="text-emerald-600 dark:text-emerald-400">→ 100</div>
                      </div>
                    </div>
                  </div>

                  {/* Step 3: Final Score */}
                  <div>
                    <h4 className="font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400 text-sm font-bold">
                        3
                      </span>
                      Final Score
                    </h4>
                    <p className="text-sm text-slate-600 dark:text-slate-400 ml-8">
                      Your final score is a 50/50 weighted average:
                    </p>
                    <div className="ml-8 mt-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 font-mono text-sm text-slate-600 dark:text-slate-400">
                      Final = (Peer Score × 0.5) + (Trend Score × 0.5)
                    </div>
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
