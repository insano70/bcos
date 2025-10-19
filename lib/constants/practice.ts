import type { BusinessHours } from '@/lib/types/practice';

/**
 * Default business hours structure for practices
 * Used as fallback when business hours are not set
 */
export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  sunday: { closed: true },
  monday: { open: '09:00', close: '17:00', closed: false },
  tuesday: { open: '09:00', close: '17:00', closed: false },
  wednesday: { open: '09:00', close: '17:00', closed: false },
  thursday: { open: '09:00', close: '17:00', closed: false },
  friday: { open: '09:00', close: '17:00', closed: false },
  saturday: { closed: true },
};
