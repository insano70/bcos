import type { BusinessHours, DaySchedule } from '@/lib/types/practice';

/**
 * Format business hours for display in templates
 */

// Days in display order: Sunday through Saturday
const DAYS_ORDER = [
  { key: 'sunday', label: 'Sunday' },
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
  { key: 'saturday', label: 'Saturday' }
] as const;

/**
 * Format a time string from 24-hour to 12-hour format
 * @param time - Time in HH:MM format (e.g., "09:00", "17:30")
 * @returns Formatted time (e.g., "9:00 AM", "5:30 PM")
 */
export function formatTime(time: string): string {
  if (!time) return '';
  
  const timeParts = time.split(':').map(Number);
  const hours = timeParts[0];
  const minutes = timeParts[1];
  
  if (hours === undefined || minutes === undefined) return '';
  
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  
  // Only show minutes if they're not :00
  if (minutes === 0) {
    return `${displayHours} ${period}`;
  }
  
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
}

/**
 * Format a single day's schedule
 * @param schedule - Day schedule object
 * @returns Formatted string (e.g., "9:00 AM to 5:00 PM", "Closed")
 */
export function formatDaySchedule(schedule: DaySchedule): string {
  if (schedule.closed || !schedule.open || !schedule.close) {
    return 'Closed';
  }
  
  return `${formatTime(schedule.open)} to ${formatTime(schedule.close)}`;
}

/**
 * Format complete business hours for template display
 * @param businessHours - Complete business hours object
 * @returns Array of formatted day entries
 */
export function formatBusinessHours(businessHours: BusinessHours): Array<{
  day: string;
  hours: string;
  isClosed: boolean;
}> {
  return DAYS_ORDER.map(({ key, label }) => {
    const schedule = businessHours[key];
    const hours = formatDaySchedule(schedule);
    
    return {
      day: label,
      hours,
      isClosed: schedule.closed || false
    };
  });
}

/**
 * Get a summary of business hours (e.g., "Mon-Fri 9 AM - 5 PM")
 * @param businessHours - Complete business hours object
 * @returns Condensed summary string
 */
export function getBusinessHoursSummary(businessHours: BusinessHours): string {
  const formattedHours = formatBusinessHours(businessHours);
  const openDays = formattedHours.filter(day => !day.isClosed);
  
  if (openDays.length === 0) {
    return 'Closed';
  }
  
  // Check if weekdays have the same hours
  const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const weekdayHours = formattedHours.filter(day => weekdays.includes(day.day) && !day.isClosed);
  
  if (weekdayHours.length === 5 && weekdayHours[0]) {
    const firstWeekdayHours = weekdayHours[0].hours;
    const allWeekdaysSame = weekdayHours.every(day => day.hours === firstWeekdayHours);
    
    if (allWeekdaysSame) {
      const weekend = formattedHours.filter(day => ['Saturday', 'Sunday'].includes(day.day));
      const weekendClosed = weekend.every(day => day.isClosed);
      
      if (weekendClosed) {
        return `Mon-Fri ${firstWeekdayHours}`;
      }
    }
  }
  
  // If not a standard pattern, just show open days
  return openDays.map(day => `${day.day.slice(0, 3)} ${day.hours}`).join(', ');
}

/**
 * Check if practice is currently open
 * @param businessHours - Complete business hours object
 * @returns Boolean indicating if currently open
 */
export function isCurrentlyOpen(businessHours: BusinessHours): boolean {
  const now = new Date();
  const dayIndex = now.getDay();
  const currentDayInfo = DAYS_ORDER[dayIndex];
  
  if (!currentDayInfo) return false;
  
  const currentDay = currentDayInfo.key;
  const currentTime = now.toTimeString().slice(0, 5); // HH:MM format
  
  const todaySchedule = businessHours[currentDay];
  
  if (todaySchedule.closed || !todaySchedule.open || !todaySchedule.close) {
    return false;
  }
  
  return currentTime >= todaySchedule.open && currentTime <= todaySchedule.close;
}
