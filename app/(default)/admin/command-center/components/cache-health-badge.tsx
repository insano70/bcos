/**
 * Cache Health Badge Component
 *
 * Visual indicator for cache health status with color coding and emojis
 */

'use client';

import type { CacheHealthStatus } from '@/lib/monitoring/types';
import {
  getHealthBadgeClasses,
  getHealthLabel,
  getHealthEmoji,
} from '@/lib/monitoring/analytics-cache-health';

interface CacheHealthBadgeProps {
  health: CacheHealthStatus;
  score: number;
  size?: 'sm' | 'md' | 'lg';
  showScore?: boolean;
  className?: string;
}

export default function CacheHealthBadge({
  health,
  score,
  size = 'md',
  showScore = false,
  className = '',
}: CacheHealthBadgeProps) {
  const classes = getHealthBadgeClasses(health);
  const label = getHealthLabel(health);
  const emoji = getHealthEmoji(health);

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm',
    lg: 'px-4 py-1.5 text-base',
  };

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full border ${classes.container} ${sizeClasses[size]} font-medium ${className}`}
      title={`Health Score: ${score}/100`}
    >
      <span className={classes.icon} aria-label={`Health status: ${label}`}>
        {emoji}
      </span>
      <span className={classes.text}>{label}</span>
      {showScore && <span className={`${classes.text} text-xs opacity-70`}>({score})</span>}
    </div>
  );
}

