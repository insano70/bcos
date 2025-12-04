'use client';

import { motion, useSpring, useTransform } from 'framer-motion';
import { useEffect, useState } from 'react';
import type { SizeBucket } from '@/lib/constants/report-card';
import { GRADE_THRESHOLDS } from '@/lib/constants/report-card';

interface OverallScoreCardProps {
  score: number;
  sizeBucket: SizeBucket;
  percentileRank: number;
  reportCardMonth?: string; // e.g., "November 2025"
  className?: string;
}

/**
 * Apply grade floor - ensures minimum C- grade
 * Raw scores below 70 are displayed as 70 (C-)
 */
function applyFloor(rawScore: number): number {
  return Math.max(GRADE_THRESHOLDS.FLOOR, rawScore);
}

/**
 * Get letter grade from score (0-100)
 * Uses floored score - no D's or F's
 */
function getLetterGrade(rawScore: number): { letter: string; color: string } {
  const score = applyFloor(rawScore);
  if (score >= 90) return { letter: 'A', color: 'text-emerald-500' };
  if (score >= 80) return { letter: 'B', color: 'text-teal-500' };
  // C range (70-79) - this is now the minimum
  return { letter: 'C', color: 'text-amber-500' };
}

/**
 * Get modifier for the grade (+/-)
 * Uses floored score
 */
function getGradeModifier(rawScore: number): string {
  const score = applyFloor(rawScore);
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
  const score = applyFloor(rawScore);
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
  const score = applyFloor(rawScore);
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
    default:
      return 'Practice';
  }
}

/**
 * Get size bucket threshold description
 */
function getSizeBucketDescription(bucket: SizeBucket): string {
  switch (bucket) {
    case 'small':
      return '< $15M annual charges';
    case 'medium':
      return '$15M - $40M annual charges';
    case 'large':
      return '$40M - $100M annual charges';
    case 'xlarge':
      return '> $100M annual charges';
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
  const displayScore = applyFloor(score);
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
 */
export default function OverallScoreCard({
  score,
  sizeBucket,
  percentileRank,
  reportCardMonth,
  className = '',
}: OverallScoreCardProps) {
  const displayScore = applyFloor(score);
  const { letter, color } = getLetterGrade(score);
  const modifier = getGradeModifier(score);
  const gradient = getScoreGradient(score);

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
        <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-1">
          {reportCardMonth ? `${reportCardMonth} Report Card` : 'Practice Report Card'}
        </h3>
        {reportCardMonth && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Performance snapshot for {reportCardMonth}
          </p>
        )}

        <div className="flex flex-col sm:flex-row items-center gap-8">
          {/* Score Ring with Grade */}
          <div className="relative">
            <ScoreRing score={score} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-6xl font-bold ${color}`}>
                {letter}
                <span className="text-4xl">{modifier}</span>
              </span>
              <span className="text-2xl font-semibold text-slate-600 dark:text-slate-400">
                <AnimatedScore value={displayScore} />
              </span>
            </div>
          </div>

          {/* Details */}
          <div className="flex-1 text-center sm:text-left">
            <div className="space-y-4">
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
      </div>
    </motion.div>
  );
}
