'use client';

import { motion } from 'framer-motion';
import {
  Lightbulb,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Info,
  Sparkles,
} from 'lucide-react';

interface InsightsPanelProps {
  insights: string[];
  className?: string;
}

/**
 * Categorize insight by keywords
 */
function categorizeInsight(insight: string): {
  icon: React.ReactNode;
  color: string;
  bgColor: string;
} {
  const lowerInsight = insight.toLowerCase();

  if (lowerInsight.includes('excellent') || lowerInsight.includes('outstanding') || lowerInsight.includes('top')) {
    return {
      icon: <Sparkles className="w-5 h-5" />,
      color: 'text-amber-500',
      bgColor: 'bg-amber-50 dark:bg-amber-900/20',
    };
  }

  if (lowerInsight.includes('improving') || lowerInsight.includes('growth') || lowerInsight.includes('increase')) {
    return {
      icon: <TrendingUp className="w-5 h-5" />,
      color: 'text-emerald-500',
      bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
    };
  }

  if (lowerInsight.includes('declining') || lowerInsight.includes('decrease') || lowerInsight.includes('down')) {
    return {
      icon: <TrendingDown className="w-5 h-5" />,
      color: 'text-rose-500',
      bgColor: 'bg-rose-50 dark:bg-rose-900/20',
    };
  }

  if (lowerInsight.includes('attention') || lowerInsight.includes('concern') || lowerInsight.includes('below')) {
    return {
      icon: <AlertTriangle className="w-5 h-5" />,
      color: 'text-amber-500',
      bgColor: 'bg-amber-50 dark:bg-amber-900/20',
    };
  }

  if (lowerInsight.includes('strong') || lowerInsight.includes('above') || lowerInsight.includes('good')) {
    return {
      icon: <CheckCircle className="w-5 h-5" />,
      color: 'text-teal-500',
      bgColor: 'bg-teal-50 dark:bg-teal-900/20',
    };
  }

  if (lowerInsight.includes('tip') || lowerInsight.includes('consider') || lowerInsight.includes('suggest')) {
    return {
      icon: <Lightbulb className="w-5 h-5" />,
      color: 'text-violet-500',
      bgColor: 'bg-violet-50 dark:bg-violet-900/20',
    };
  }

  return {
    icon: <Info className="w-5 h-5" />,
    color: 'text-slate-500',
    bgColor: 'bg-slate-50 dark:bg-slate-800',
  };
}

/**
 * Single insight card
 */
function InsightCard({ insight, index }: { insight: string; index: number }) {
  const category = categorizeInsight(insight);

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.1 }}
      className={`flex items-start gap-4 p-4 rounded-xl ${category.bgColor}`}
    >
      <div className={`flex-shrink-0 ${category.color}`}>{category.icon}</div>
      <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
        {insight}
      </p>
    </motion.div>
  );
}

/**
 * Insights Panel Component
 * Displays human-readable insights and recommendations
 */
export default function InsightsPanel({
  insights,
  className = '',
}: InsightsPanelProps) {
  // Deduplicate insights
  const uniqueInsights = Array.from(new Set(insights));

  // Prioritize insights (warnings/concerns first, then positive, then neutral)
  const sortedInsights = [...uniqueInsights].sort((a, b) => {
    const getPriority = (insight: string): number => {
      const lower = insight.toLowerCase();
      if (lower.includes('attention') || lower.includes('concern') || lower.includes('declining')) return 0;
      if (lower.includes('excellent') || lower.includes('outstanding') || lower.includes('top')) return 1;
      if (lower.includes('improving') || lower.includes('growth')) return 2;
      return 3;
    };
    return getPriority(a) - getPriority(b);
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.6 }}
      className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 ${className}`}
    >
      <div className="p-6 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900/30">
            <Lightbulb className="w-5 h-5 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300">
              Key Insights
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              AI-generated observations and recommendations
            </p>
          </div>
        </div>
      </div>

      <div className="p-6">
        {sortedInsights.length === 0 ? (
          <div className="text-center py-8">
            <Lightbulb className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-slate-500 dark:text-slate-400">
              No insights available yet. Generate your report card to see insights.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedInsights.map((insight, index) => (
              <InsightCard key={`insight-${index}-${insight.slice(0, 20)}`} insight={insight} index={index} />
            ))}
          </div>
        )}
      </div>

      {/* Legend */}
      {sortedInsights.length > 0 && (
        <div className="px-6 pb-6">
          <div className="flex flex-wrap gap-4 text-xs text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span>Excellence / Attention</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Growth</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span>Decline</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-violet-500" />
              <span>Tips</span>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
