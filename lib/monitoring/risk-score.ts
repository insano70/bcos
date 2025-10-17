/**
 * Risk Score Calculation
 *
 * Calculates a 0-100 risk score for users based on security factors.
 * Used to identify at-risk users who may have compromised accounts.
 *
 * ALGORITHM:
 * - Failed Login Attempts: 30 points max
 * - Account Locked: 25 points
 * - Suspicious Activity Flag: 20 points
 * - Multiple IP Addresses: 15 points max
 * - High Attempt Frequency: 10 points max
 *
 * CATEGORIES:
 * - 80-100: Critical (immediate review required)
 * - 50-79: High (review within 24 hours)
 * - 20-49: Medium (watch list)
 * - 0-19: Low (logging only)
 */

/**
 * Input data for risk score calculation
 */
export interface AtRiskUserData {
  failedAttempts: number;
  lockedUntil: string | null;
  suspiciousActivity: boolean;
  uniqueIPs7d: number;
  recentAttempts24h: number;
}

/**
 * Risk category classification
 */
export type RiskCategory = 'critical' | 'high' | 'medium' | 'low';

/**
 * Calculate risk score for a user
 *
 * @param user - User security data
 * @returns Risk score (0-100)
 */
export function calculateRiskScore(user: AtRiskUserData): number {
  let score = 0;

  // Failed Login Attempts (30 points max)
  // More attempts = higher risk of credential attack
  if (user.failedAttempts >= 10) {
    score += 30;
  } else if (user.failedAttempts >= 5) {
    score += 20;
  } else if (user.failedAttempts >= 3) {
    score += 10;
  }

  // Account Currently Locked (25 points)
  // Locked accounts are high priority for review
  if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
    score += 25;
  }

  // Suspicious Activity Flag (20 points)
  // Set automatically by system at 3+ failed attempts
  if (user.suspiciousActivity) {
    score += 20;
  }

  // Multiple IP Addresses (15 points max)
  // Indicates potential account sharing or compromise
  if (user.uniqueIPs7d >= 10) {
    score += 15;
  } else if (user.uniqueIPs7d >= 5) {
    score += 10;
  } else if (user.uniqueIPs7d >= 3) {
    score += 5;
  }

  // Recent Attempt Frequency (10 points max)
  // High frequency indicates brute force or credential stuffing
  if (user.recentAttempts24h >= 20) {
    score += 10;
  } else if (user.recentAttempts24h >= 10) {
    score += 7;
  } else if (user.recentAttempts24h >= 5) {
    score += 5;
  }

  return Math.min(100, score);
}

/**
 * Get risk category from score
 *
 * @param score - Risk score (0-100)
 * @returns Risk category
 */
export function getRiskCategory(score: number): RiskCategory {
  if (score >= 80) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 20) return 'medium';
  return 'low';
}

/**
 * Get human-readable risk factors for a user
 *
 * @param user - User security data
 * @returns Array of risk factor descriptions
 */
export function getRiskFactors(user: AtRiskUserData): string[] {
  const factors: string[] = [];

  // Failed attempts
  if (user.failedAttempts >= 10) {
    factors.push(`Critical: ${user.failedAttempts} failed login attempts`);
  } else if (user.failedAttempts >= 5) {
    factors.push(`Multiple failed login attempts (${user.failedAttempts})`);
  } else if (user.failedAttempts >= 3) {
    factors.push(`${user.failedAttempts} failed login attempts`);
  }

  // Locked account
  if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
    const lockedUntilDate = new Date(user.lockedUntil);
    const hoursRemaining = Math.ceil((lockedUntilDate.getTime() - Date.now()) / (1000 * 60 * 60));
    factors.push(`Account currently locked (${hoursRemaining}h remaining)`);
  }

  // Suspicious flag
  if (user.suspiciousActivity) {
    factors.push('Flagged for suspicious activity');
  }

  // Multiple IPs
  if (user.uniqueIPs7d >= 10) {
    factors.push(`Critical: ${user.uniqueIPs7d} different IP addresses in 7 days`);
  } else if (user.uniqueIPs7d >= 5) {
    factors.push(`Unusual IP addresses (${user.uniqueIPs7d} different IPs in 7 days)`);
  } else if (user.uniqueIPs7d >= 3) {
    factors.push(`${user.uniqueIPs7d} different IP addresses in 7 days`);
  }

  // High frequency
  if (user.recentAttempts24h >= 20) {
    factors.push(`Critical: ${user.recentAttempts24h} attempts in 24 hours (potential attack)`);
  } else if (user.recentAttempts24h >= 10) {
    factors.push(`High frequency attempts (${user.recentAttempts24h} attempts in 24 hours)`);
  } else if (user.recentAttempts24h >= 5) {
    factors.push(`${user.recentAttempts24h} attempts in 24 hours`);
  }

  return factors;
}

/**
 * Get color class for risk score badge (Tailwind CSS)
 *
 * @param score - Risk score (0-100)
 * @returns Tailwind color class
 */
export function getRiskScoreColor(score: number): string {
  if (score >= 80) return 'text-red-600 dark:text-red-400';
  if (score >= 50) return 'text-amber-600 dark:text-amber-400';
  if (score >= 20) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-gray-600 dark:text-gray-400';
}

/**
 * Get background color class for risk score badge (Tailwind CSS)
 *
 * @param score - Risk score (0-100)
 * @returns Tailwind background color class
 */
export function getRiskScoreBgColor(score: number): string {
  if (score >= 80) return 'bg-red-100 dark:bg-red-900';
  if (score >= 50) return 'bg-amber-100 dark:bg-amber-900';
  if (score >= 20) return 'bg-yellow-100 dark:bg-yellow-900';
  return 'bg-gray-100 dark:bg-gray-700';
}

/**
 * Get emoji indicator for risk category
 *
 * @param category - Risk category
 * @returns Emoji indicator
 */
export function getRiskIndicator(category: RiskCategory): string {
  switch (category) {
    case 'critical':
      return '🔴';
    case 'high':
      return '🟡';
    case 'medium':
      return '🟠';
    case 'low':
      return '⚪';
  }
}
