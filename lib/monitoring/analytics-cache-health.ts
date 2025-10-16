/**
 * Analytics Cache Health Scoring
 * 
 * Calculates health scores and status for analytics cache datasources
 */

import type { CacheHealthStatus, DatasourceCacheMetrics } from './types';
import type { CacheStats } from '@/lib/cache/indexed-analytics-cache';

interface HealthScore {
  health: CacheHealthStatus;
  score: number;
  warnings: string[];
}

/**
 * Calculate cache health score and status for a datasource
 * 
 * Scoring Algorithm (0-100):
 * - Age Score (0-40): How recently the cache was warmed
 * - Hit Rate Score (0-40): Cache effectiveness
 * - Coverage Score (0-20): Data availability
 * 
 * Health Status Thresholds:
 * - Excellent: ≥90 (green)
 * - Good: ≥75 (blue)
 * - Degraded: ≥50 (yellow)
 * - Stale: ≥25 (orange)
 * - Cold: <25 (red)
 */
export function calculateCacheHealth(
  ageMinutes: number,
  cacheHitRate: number,
  isWarm: boolean,
  totalEntries: number
): HealthScore {
  const warnings: string[] = [];
  
  // If cache is not warm, automatic cold status
  if (!isWarm) {
    return {
      health: 'cold',
      score: 0,
      warnings: ['Cache has never been warmed'],
    };
  }
  
  // Age scoring (0-40 points)
  // Target: < 1 hour = excellent, < 2 hours = good, < 4 hours = ok, > 6 hours = stale
  let ageScore = 0;
  if (ageMinutes < 60) {
    ageScore = 40;
  } else if (ageMinutes < 120) {
    ageScore = 35;
  } else if (ageMinutes < 240) {
    ageScore = 30; // TTL threshold
    warnings.push('Cache approaching TTL expiration');
  } else if (ageMinutes < 360) {
    ageScore = 20;
    warnings.push('Cache is stale (>4 hours old)');
  } else if (ageMinutes < 720) {
    ageScore = 10;
    warnings.push('Cache is very stale (>6 hours old)');
  } else {
    ageScore = 0;
    warnings.push('Cache is critically stale (>12 hours old)');
  }
  
  // Hit rate scoring (0-40 points)
  let hitRateScore = 0;
  if (cacheHitRate >= 95) {
    hitRateScore = 40;
  } else if (cacheHitRate >= 90) {
    hitRateScore = 35;
  } else if (cacheHitRate >= 80) {
    hitRateScore = 30;
  } else if (cacheHitRate >= 70) {
    hitRateScore = 20;
    warnings.push('Cache hit rate below 70%');
  } else if (cacheHitRate >= 50) {
    hitRateScore = 10;
    warnings.push('Cache hit rate below 50%');
  } else {
    hitRateScore = 0;
    warnings.push('Cache hit rate critically low');
  }
  
  // Coverage scoring (0-20 points)
  const hasCoverage = totalEntries > 0 ? 20 : 0;
  if (totalEntries === 0) {
    warnings.push('Cache has no entries');
  }
  
  const totalScore = ageScore + hitRateScore + hasCoverage;
  
  let health: CacheHealthStatus;
  if (totalScore >= 90) {
    health = 'excellent';
  } else if (totalScore >= 75) {
    health = 'good';
  } else if (totalScore >= 50) {
    health = 'degraded';
  } else if (totalScore >= 25) {
    health = 'stale';
  } else {
    health = 'cold';
  }
  
  return {
    health,
    score: totalScore,
    warnings,
  };
}

/**
 * Enrich cache stats with health metrics
 */
export function enrichWithHealthMetrics(
  cacheStats: CacheStats,
  datasourceName: string,
  performanceMetrics: {
    avgQueryTimeMs: number;
    cacheHitRate: number;
    totalQueries: number;
  },
  uniqueCounts: {
    measures: number;
    practices: number;
    providers: number;
    frequencies: string[];
  }
): DatasourceCacheMetrics {
  // Calculate age
  const ageMinutes = cacheStats.lastWarmed 
    ? Math.floor((Date.now() - new Date(cacheStats.lastWarmed).getTime()) / 60000)
    : Infinity;
  
  // Calculate health
  const healthResult = calculateCacheHealth(
    ageMinutes,
    performanceMetrics.cacheHitRate,
    cacheStats.isWarm,
    cacheStats.totalEntries
  );
  
  return {
    datasourceId: cacheStats.datasourceId,
    datasourceName,
    isWarm: cacheStats.isWarm,
    lastWarmed: cacheStats.lastWarmed,
    ageMinutes,
    totalEntries: cacheStats.totalEntries,
    indexCount: cacheStats.indexCount,
    estimatedMemoryMB: cacheStats.estimatedMemoryMB,
    uniqueMeasures: uniqueCounts.measures,
    uniquePractices: uniqueCounts.practices,
    uniqueProviders: uniqueCounts.providers,
    uniqueFrequencies: uniqueCounts.frequencies,
    avgQueryTimeMs: performanceMetrics.avgQueryTimeMs,
    cacheHitRate: performanceMetrics.cacheHitRate,
    totalQueries: performanceMetrics.totalQueries,
    health: healthResult.health,
    healthScore: healthResult.score,
    warnings: healthResult.warnings,
  };
}

/**
 * Get health badge color classes for UI components
 */
export function getHealthBadgeClasses(health: CacheHealthStatus): {
  container: string;
  text: string;
  bg: string;
  border: string;
  icon: string;
} {
  switch (health) {
    case 'excellent':
      return {
        container: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
        text: 'text-green-800 dark:text-green-200',
        bg: 'bg-green-100 dark:bg-green-900',
        border: 'border-green-300 dark:border-green-700',
        icon: 'text-green-600 dark:text-green-400',
      };
    case 'good':
      return {
        container: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
        text: 'text-blue-800 dark:text-blue-200',
        bg: 'bg-blue-100 dark:bg-blue-900',
        border: 'border-blue-300 dark:border-blue-700',
        icon: 'text-blue-600 dark:text-blue-400',
      };
    case 'degraded':
      return {
        container: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
        text: 'text-yellow-800 dark:text-yellow-200',
        bg: 'bg-yellow-100 dark:bg-yellow-900',
        border: 'border-yellow-300 dark:border-yellow-700',
        icon: 'text-yellow-600 dark:text-yellow-400',
      };
    case 'stale':
      return {
        container: 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800',
        text: 'text-orange-800 dark:text-orange-200',
        bg: 'bg-orange-100 dark:bg-orange-900',
        border: 'border-orange-300 dark:border-orange-700',
        icon: 'text-orange-600 dark:text-orange-400',
      };
    case 'cold':
      return {
        container: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
        text: 'text-red-800 dark:text-red-200',
        bg: 'bg-red-100 dark:bg-red-900',
        border: 'border-red-300 dark:border-red-700',
        icon: 'text-red-600 dark:text-red-400',
      };
  }
}

/**
 * Get health badge label text
 */
export function getHealthLabel(health: CacheHealthStatus): string {
  switch (health) {
    case 'excellent':
      return 'Excellent';
    case 'good':
      return 'Good';
    case 'degraded':
      return 'Degraded';
    case 'stale':
      return 'Stale';
    case 'cold':
      return 'Cold';
  }
}

/**
 * Get health badge emoji
 */
export function getHealthEmoji(health: CacheHealthStatus): string {
  switch (health) {
    case 'excellent':
      return '🟢';
    case 'good':
      return '🔵';
    case 'degraded':
      return '🟡';
    case 'stale':
      return '🟠';
    case 'cold':
      return '🔴';
  }
}

