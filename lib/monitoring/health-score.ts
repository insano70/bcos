/**
 * System Health Score Calculator
 *
 * Calculates a 0-100 health score based on multiple system factors.
 * Score interpretation:
 * - 90-100: Healthy (Green)
 * - 70-89: Degraded (Yellow)
 * - <70: Unhealthy (Red)
 *
 * ALGORITHM:
 * Starts at 100 and deducts points based on:
 * - Error Rate (25 points max)
 * - Response Time p95 (25 points max)
 * - Cache Hit Rate (20 points max)
 * - Database Latency p95 (15 points max)
 * - Security Incidents (15 points max)
 */

import type { HealthFactors, SystemHealth } from './types';

/**
 * Input metrics for health score calculation
 */
export interface HealthScoreInput {
  errorRate: number; // Percentage (0-100)
  responseTimeP95: number; // Milliseconds
  cacheHitRate: number; // Percentage (0-100)
  dbLatencyP95: number; // Milliseconds
  securityIncidents: number; // Count in current period
}

/**
 * Calculate system health score from metrics
 *
 * @param metrics - Current system metrics
 * @returns System health with score (0-100) and factor breakdown
 */
export function calculateHealthScore(metrics: HealthScoreInput): SystemHealth {
  let score = 100;
  const factors: HealthFactors = {
    uptime: 'healthy',
    errorRate: 'healthy',
    responseTime: 'healthy',
    cachePerformance: 'healthy',
    databaseLatency: 'healthy',
  };

  // Error Rate (25 points max deduction)
  if (metrics.errorRate > 5) {
    score -= 25;
    factors.errorRate = 'unhealthy';
  } else if (metrics.errorRate > 2) {
    score -= 15;
    factors.errorRate = 'degraded';
  } else if (metrics.errorRate > 1) {
    score -= 10;
    factors.errorRate = 'degraded';
  } else if (metrics.errorRate > 0.5) {
    score -= 5;
    factors.errorRate = 'degraded';
  }

  // Response Time p95 (25 points max deduction)
  if (metrics.responseTimeP95 > 2000) {
    score -= 25;
    factors.responseTime = 'unhealthy';
  } else if (metrics.responseTimeP95 > 1000) {
    score -= 15;
    factors.responseTime = 'degraded';
  } else if (metrics.responseTimeP95 > 500) {
    score -= 10;
    factors.responseTime = 'degraded';
  } else if (metrics.responseTimeP95 > 300) {
    score -= 5;
    factors.responseTime = 'degraded';
  }

  // Cache Hit Rate (20 points max deduction)
  if (metrics.cacheHitRate < 70) {
    score -= 20;
    factors.cachePerformance = 'unhealthy';
  } else if (metrics.cacheHitRate < 80) {
    score -= 10;
    factors.cachePerformance = 'degraded';
  } else if (metrics.cacheHitRate < 90) {
    score -= 5;
    factors.cachePerformance = 'degraded';
  }

  // Database Latency p95 (15 points max deduction)
  if (metrics.dbLatencyP95 > 1000) {
    score -= 15;
    factors.databaseLatency = 'unhealthy';
  } else if (metrics.dbLatencyP95 > 500) {
    score -= 10;
    factors.databaseLatency = 'degraded';
  } else if (metrics.dbLatencyP95 > 300) {
    score -= 5;
    factors.databaseLatency = 'degraded';
  }

  // Security Incidents (15 points max deduction)
  // This is a count in the current collection period (typically 5 minutes)
  if (metrics.securityIncidents > 10) {
    score -= 15;
    factors.uptime = 'unhealthy'; // Map security to uptime factor
  } else if (metrics.securityIncidents > 5) {
    score -= 10;
    factors.uptime = 'degraded';
  } else if (metrics.securityIncidents > 0) {
    score -= 5;
    factors.uptime = 'degraded';
  }

  // Ensure score stays within 0-100 range
  score = Math.max(0, Math.min(100, score));

  // Determine overall status
  let status: 'healthy' | 'degraded' | 'unhealthy';
  if (score >= 90) {
    status = 'healthy';
  } else if (score >= 70) {
    status = 'degraded';
  } else {
    status = 'unhealthy';
  }

  return {
    status,
    score,
    factors,
  };
}

/**
 * Get color class for health score (Tailwind CSS)
 *
 * @param score - Health score (0-100)
 * @returns Tailwind color class
 */
export function getHealthScoreColor(score: number): string {
  if (score >= 90) return 'text-green-600 dark:text-green-400';
  if (score >= 70) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

/**
 * Get background color class for health score (Tailwind CSS)
 *
 * @param score - Health score (0-100)
 * @returns Tailwind background color class
 */
export function getHealthScoreBgColor(score: number): string {
  if (score >= 90) return 'bg-green-100 dark:bg-green-900';
  if (score >= 70) return 'bg-amber-100 dark:bg-amber-900';
  return 'bg-red-100 dark:bg-red-900';
}

/**
 * Get status indicator for health factor
 *
 * @param status - Health factor status
 * @returns Emoji indicator
 */
export function getFactorIndicator(status: 'healthy' | 'degraded' | 'unhealthy'): string {
  switch (status) {
    case 'healthy':
      return '●●'; // Green circles
    case 'degraded':
      return '●○'; // Yellow circle + outline
    case 'unhealthy':
      return '○○'; // Red outlines
  }
}

/**
 * Get status text color class
 *
 * @param status - Health factor status
 * @returns Tailwind color class
 */
export function getFactorColor(status: 'healthy' | 'degraded' | 'unhealthy'): string {
  switch (status) {
    case 'healthy':
      return 'text-green-600 dark:text-green-400';
    case 'degraded':
      return 'text-amber-600 dark:text-amber-400';
    case 'unhealthy':
      return 'text-red-600 dark:text-red-400';
  }
}
