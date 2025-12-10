'use client';

import { motion, useSpring, useTransform } from 'framer-motion';
import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { CHARGE_BASED_THRESHOLDS, type SizeBucket } from '@/lib/constants/report-card';
import type { PreviousMonthSummary, MeasureScore } from '@/lib/types/report-card';
import { applyGradeFloor, getLetterGrade as getGrade, getGradeColor } from '@/lib/utils/format-value';
import ScoreHelpTooltip from './score-help-tooltip';

interface OverallScoreCardProps {
  score: number;
  sizeBucket: SizeBucket;
  percentileRank: number;
  reportCardMonth?: string; // e.g., "November 2025"
  previousMonth?: PreviousMonthSummary | null | undefined;
  measureScores?: Record<string, MeasureScore>;
  className?: string;
}

/**
 * Get letter grade with color from score (0-100)
 * Wraps the shared utility to return both letter and color
 */
function getLetterGradeWithColor(rawScore: number): { letter: string; color: string } {
  const grade = getGrade(rawScore);
  // Extract base letter (A, B, C)
  const baseLetter = grade.charAt(0);
  return { 
    letter: baseLetter, 
    color: getGradeColor(grade)
  };
}

/**
 * Get modifier for the grade (+/-)
 * Uses floored score
 */
function getGradeModifier(rawScore: number): string {
  const score = applyGradeFloor(rawScore);
  const remainder = score % 10;
  if (score >= 100) return '+';
  if (remainder >= 7) return '+';
  if (remainder < 3) return '-';
  return '';
}

/**
 * Get background gradient based on score
 * Uses floored score for consistent visuals
 */
function getScoreGradient(rawScore: number): string {
  const score = applyGradeFloor(rawScore);
  if (score >= 90) return 'from-emerald-500/10 to-emerald-600/5';
  if (score >= 80) return 'from-teal-500/10 to-teal-600/5';
  // C range gradient for 70-79 (minimum)
  return 'from-amber-500/10 to-amber-600/5';
}

/**
 * Get ring color based on score
 * Uses floored score
 */
function getRingColor(rawScore: number): string {
  const score = applyGradeFloor(rawScore);
  if (score >= 90) return 'stroke-emerald-500';
  if (score >= 80) return 'stroke-teal-500';
  // C range (minimum)
  return 'stroke-amber-500';
}

/**
 * Format size bucket for display
 */
function formatSizeBucket(bucket: SizeBucket): string {
  switch (bucket) {
    case 'small':
      return 'Small Practice';
    case 'medium':
      return 'Medium Practice';
    case 'large':
      return 'Large Practice';
    case 'xlarge':
      return 'Extra Large Practice';
    case 'xxlarge':
      return 'Enterprise Practice';
    default:
      return 'Practice';
  }
}

/**
 * Format currency value for bucket descriptions
 */
function formatBucketCurrency(value: number): string {
  if (value >= 1_000_000) {
    return `$${value / 1_000_000}M`;
  }
  return `$${(value / 1000).toFixed(0)}K`;
}

/**
 * Get size bucket threshold description
 * Uses CHARGE_BASED_THRESHOLDS to ensure consistency with sizing logic
 */
function getSizeBucketDescription(bucket: SizeBucket): string {
  const { small_max, medium_max, large_max, xlarge_max } = CHARGE_BASED_THRESHOLDS;
  
  switch (bucket) {
    case 'small':
      return `< ${formatBucketCurrency(small_max)} annual charges`;
    case 'medium':
      return `${formatBucketCurrency(small_max)} - ${formatBucketCurrency(medium_max)} annual charges`;
    case 'large':
      return `${formatBucketCurrency(medium_max)} - ${formatBucketCurrency(large_max)} annual charges`;
    case 'xlarge':
      return `${formatBucketCurrency(large_max)} - ${formatBucketCurrency(xlarge_max)} annual charges`;
    case 'xxlarge':
      return `> ${formatBucketCurrency(xlarge_max)} annual charges`;
    default:
      return '';
  }
}

/**
 * Animated counter for the score
 */
function AnimatedScore({ value, duration = 1.5 }: { value: number; duration?: number }) {
  const spring = useSpring(0, {
    mass: 0.8,
    stiffness: 75,
    damping: 15,
    duration: duration * 1000,
  });

  const display = useTransform(spring, (current) => Math.round(current));
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    spring.set(value);
  }, [spring, value]);

  if (!mounted) return <span>0</span>;

  return <motion.span>{display}</motion.span>;
}

/**
 * Circular progress ring SVG
 * Uses floored score for visual display
 */
function ScoreRing({ score, size = 200 }: { score: number; size?: number }) {
  const displayScore = applyGradeFloor(score);
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (displayScore / 100) * circumference;

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      {/* Background ring */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={strokeWidth}
        className="stroke-slate-200 dark:stroke-slate-700"
      />
      {/* Progress ring */}
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        className={getRingColor(displayScore)}
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 1.5, ease: 'easeOut' }}
        style={{
          strokeDasharray: circumference,
        }}
      />
    </svg>
  );
}

/**
 * Overall Score Card Component
 * Displays the practice's overall score with a letter grade and percentile rank
 * Score is floored at C- (70) - no practice gets D or F
 * Optionally shows previous month's grade for comparison
 */
export default function OverallScoreCard({
  score,
  sizeBucket,
  percentileRank,
  reportCardMonth,
  previousMonth,
  measureScores,
  className = '',
}: OverallScoreCardProps) {
  const displayScore = applyGradeFloor(score);
  const { letter, color } = getLetterGradeWithColor(score);
  const modifier = getGradeModifier(score);
  const gradient = getScoreGradient(score);

  // Calculate change indicator
  const getChangeIndicator = () => {
    if (!previousMonth) return null;
    
    const change = previousMonth.scoreChange;
    if (Math.abs(change) < 0.5) {
      return { icon: <Minus className="w-4 h-4" />, color: 'text-slate-500', text: 'Same as' };
    }
    if (change > 0) {
      return { icon: <TrendingUp className="w-4 h-4" />, color: 'text-emerald-500', text: `+${change.toFixed(1)} from` };
    }
    return { icon: <TrendingDown className="w-4 h-4" />, color: 'text-rose-500', text: `${change.toFixed(1)} from` };
  };

  const changeIndicator = getChangeIndicator();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${gradient} p-6 ${className}`}
    >
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,_var(--tw-gradient-from),_transparent_70%)]" />
      </div>

      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300">
            {reportCardMonth ? `${reportCardMonth} Report Card` : 'Practice Report Card'}
          </h3>
          <ScoreHelpTooltip
            overallScore={score}
            percentileRank={percentileRank}
            measureScores={measureScores}
            reportCardMonth={reportCardMonth}
          />
        </div>
        {reportCardMonth && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Performance snapshot for {reportCardMonth}
          </p>
        )}

        {/* Main content - responsive grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left: Score Ring with Grade and Change Indicator */}
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <ScoreRing score={score} size={180} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-5xl font-bold ${color}`}>
                  {letter}
                  <span className="text-3xl">{modifier}</span>
                </span>
                <span className="text-xl font-semibold text-slate-600 dark:text-slate-400">
                  <AnimatedScore value={displayScore} />
                </span>
              </div>
            </div>

            {/* Previous Month Comparison - below score on all sizes */}
            {previousMonth && changeIndicator && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.4 }}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/50 dark:bg-slate-800/50 border border-slate-200/50 dark:border-slate-700/50"
              >
                <span className={changeIndicator.color}>{changeIndicator.icon}</span>
                <div className="text-sm">
                  <span className={`font-medium ${changeIndicator.color}`}>
                    {changeIndicator.text}
                  </span>
                  <span className="text-slate-600 dark:text-slate-400 ml-1">
                    {previousMonth.month} ({previousMonth.grade})
                  </span>
                </div>
              </motion.div>
            )}
          </div>

          {/* Right: Practice Size and Peer Ranking */}
          <div className="flex flex-col justify-center space-y-4">
            <div>
              <span className="text-sm text-slate-500 dark:text-slate-400 block">
                Practice Size
              </span>
              <span className="text-lg font-medium text-slate-700 dark:text-slate-300">
                {formatSizeBucket(sizeBucket)}
              </span>
              <span className="text-xs text-slate-400 dark:text-slate-500 block">
                {getSizeBucketDescription(sizeBucket)}
              </span>
            </div>

            <div>
              <span className="text-sm text-slate-500 dark:text-slate-400 block">
                Peer Ranking
              </span>
              <span className="text-lg font-medium text-slate-700 dark:text-slate-300">
                Top{' '}
                <span className={color}>
                  {Math.round(100 - percentileRank)}%
                </span>{' '}
                of {formatSizeBucket(sizeBucket)}s
              </span>
            </div>

            <div className="pt-2">
              <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <motion.div
                  className={`h-full ${color.replace('text-', 'bg-')}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${percentileRank}%` }}
                  transition={{ duration: 1, delay: 0.5 }}
                />
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400 mt-1 block">
                {Math.round(percentileRank)}th percentile
              </span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
