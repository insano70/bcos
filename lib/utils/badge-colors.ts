import type { BadgeColor } from '@/components/ui/badge';

/**
 * Work item priority to badge color mapping.
 * Used by work items list, detail view, hierarchy section.
 */
export const PRIORITY_COLORS: Record<string, BadgeColor> = {
  critical: 'red',
  high: 'orange',
  medium: 'yellow',
  low: 'green',
};

/**
 * Get badge color for work item priority.
 */
export function getPriorityBadgeColor(priority: string): BadgeColor {
  return PRIORITY_COLORS[priority.toLowerCase()] ?? 'gray';
}

/**
 * Work item status category to badge color mapping.
 */
export const STATUS_CATEGORY_COLORS: Record<string, BadgeColor> = {
  backlog: 'gray',
  in_progress: 'blue',
  completed: 'green',
  cancelled: 'red',
};

/**
 * Get badge color for work item status category.
 */
export function getStatusBadgeColor(category: string): BadgeColor {
  return STATUS_CATEGORY_COLORS[category.toLowerCase()] ?? 'gray';
}

/**
 * Announcement priority to badge color mapping.
 */
export const ANNOUNCEMENT_PRIORITY_COLORS: Record<string, BadgeColor> = {
  urgent: 'red',
  high: 'orange',
  normal: 'blue',
  low: 'gray',
};

/**
 * Get badge color for announcement priority.
 */
export function getAnnouncementPriorityColor(priority: string): BadgeColor {
  return ANNOUNCEMENT_PRIORITY_COLORS[priority.toLowerCase()] ?? 'blue';
}

/**
 * Chart type to badge color mapping.
 */
export const CHART_TYPE_COLORS: Record<string, BadgeColor> = {
  line: 'blue',
  bar: 'green',
  pie: 'purple',
  doughnut: 'orange',
  area: 'teal',
  scatter: 'indigo',
  table: 'gray',
};

/**
 * Get badge color for chart type.
 */
export function getChartTypeBadgeColor(chartType: string): BadgeColor {
  return CHART_TYPE_COLORS[chartType.toLowerCase()] ?? 'gray';
}

/**
 * Boolean active/inactive status to badge color.
 */
export function getActiveStatusColor(isActive: boolean | null | undefined): BadgeColor {
  return isActive === true ? 'green' : 'gray';
}

/**
 * Practice status to badge color mapping.
 */
export const PRACTICE_STATUS_COLORS: Record<string, BadgeColor> = {
  active: 'green',
  inactive: 'red',
  pending: 'yellow',
};

/**
 * Get badge color for practice status.
 */
export function getPracticeStatusColor(status: string): BadgeColor {
  return PRACTICE_STATUS_COLORS[status.toLowerCase()] ?? 'gray';
}

/**
 * Feedback status to badge color mapping.
 */
export const FEEDBACK_STATUS_COLORS: Record<string, BadgeColor> = {
  pending: 'yellow',
  resolved: 'green',
  metadata_updated: 'blue',
  instruction_created: 'purple',
  relationship_added: 'indigo',
  wont_fix: 'gray',
};

/**
 * Get badge color for feedback status.
 */
export function getFeedbackStatusColor(status: string): BadgeColor {
  return FEEDBACK_STATUS_COLORS[status.toLowerCase()] ?? 'gray';
}

/**
 * Feedback severity to badge color mapping.
 */
export const FEEDBACK_SEVERITY_COLORS: Record<string, BadgeColor> = {
  high: 'red',
  medium: 'yellow',
  low: 'blue',
};

/**
 * Get badge color for feedback severity.
 */
export function getFeedbackSeverityColor(severity: string): BadgeColor {
  return FEEDBACK_SEVERITY_COLORS[severity.toLowerCase()] ?? 'gray';
}

/**
 * Warming job status to badge color mapping.
 */
export const WARMING_STATUS_COLORS: Record<string, BadgeColor> = {
  queued: 'gray',
  warming: 'blue',
  completed: 'green',
  failed: 'red',
};

/**
 * Get badge color for warming job status.
 */
export function getWarmingStatusColor(status: string): BadgeColor {
  return WARMING_STATUS_COLORS[status.toLowerCase()] ?? 'gray';
}

/**
 * Data type to badge color mapping (for data source columns).
 */
export const DATA_TYPE_COLORS: Record<string, BadgeColor> = {
  string: 'indigo',
  text: 'indigo',
  varchar: 'indigo',
  integer: 'teal',
  int: 'teal',
  bigint: 'teal',
  number: 'teal',
  numeric: 'teal',
  decimal: 'amber',
  float: 'amber',
  double: 'amber',
  boolean: 'red',
  bool: 'red',
  date: 'purple',
  datetime: 'purple',
  timestamp: 'purple',
  time: 'violet',
  uuid: 'blue',
  json: 'orange',
  jsonb: 'orange',
  array: 'green',
};

/**
 * Get badge color for data type.
 */
export function getDataTypeBadgeColor(dataType: string): BadgeColor {
  const normalizedType = dataType.toLowerCase().replace(/\(.*\)/, '').trim();
  return DATA_TYPE_COLORS[normalizedType] ?? 'gray';
}

/**
 * Connection status to badge color mapping.
 */
export function getConnectionStatusColor(isConnected: boolean): BadgeColor {
  return isConnected ? 'green' : 'red';
}

/**
 * MFA status to badge color mapping.
 */
export function getMfaStatusColor(mfaEnabled: boolean): BadgeColor {
  return mfaEnabled ? 'green' : 'yellow';
}

/**
 * User account status to badge color mapping.
 */
export const USER_STATUS_COLORS: Record<string, BadgeColor> = {
  active: 'green',
  inactive: 'gray',
  locked: 'red',
  pending: 'yellow',
};

/**
 * Get badge color for user account status.
 */
export function getUserStatusColor(status: string): BadgeColor {
  return USER_STATUS_COLORS[status.toLowerCase()] ?? 'gray';
}

/**
 * Target type to badge color mapping (announcements).
 */
export function getTargetTypeColor(targetType: string): BadgeColor {
  return targetType === 'all' ? 'green' : 'purple';
}

/**
 * Test case priority to badge color mapping.
 */
export const TEST_PRIORITY_COLORS: Record<string, BadgeColor> = {
  high: 'red',
  medium: 'yellow',
  low: 'blue',
};

/**
 * Get badge color for test case priority.
 */
export function getTestPriorityColor(priority: string): BadgeColor {
  return TEST_PRIORITY_COLORS[priority.toLowerCase()] ?? 'gray';
}

/**
 * Security event severity to badge color mapping.
 */
export const SECURITY_SEVERITY_COLORS: Record<string, BadgeColor> = {
  critical: 'red',
  high: 'red',
  medium: 'orange',
  low: 'yellow',
  info: 'blue',
};

/**
 * Get badge color for security event severity.
 */
export function getSecuritySeverityColor(severity: string): BadgeColor {
  return SECURITY_SEVERITY_COLORS[severity.toLowerCase()] ?? 'gray';
}

/**
 * Get badge color for chart count (dashboards).
 */
export function getChartCountBadgeColor(count: number): BadgeColor {
  if (count === 0) return 'gray';
  if (count <= 3) return 'blue';
  if (count <= 6) return 'green';
  return 'purple';
}

/**
 * Get badge color for publication status.
 */
export function getPublishedStatusColor(isPublished: boolean | undefined): BadgeColor {
  return isPublished === true ? 'green' : 'yellow';
}

/**
 * Get badge color for confidence score.
 */
export function getConfidenceColor(confidence: string | null): BadgeColor {
  if (!confidence) return 'gray';
  const score = Number.parseFloat(confidence);
  if (score >= 0.8) return 'green';
  if (score >= 0.6) return 'blue';
  if (score >= 0.4) return 'yellow';
  return 'red';
}
