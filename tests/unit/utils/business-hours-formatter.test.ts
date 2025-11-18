import { afterEach, beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import type { BusinessHours } from '@/lib/types/practice';
import {
  formatBusinessHours,
  formatDaySchedule,
  formatTime,
  getBusinessHoursSummary,
  isCurrentlyOpen,
} from '@/lib/utils/business-hours-formatter';

describe('business-hours-formatter', () => {
  describe('formatTime', () => {
    it('should format morning times correctly', () => {
      expect(formatTime('09:00')).toBe('9 AM');
      expect(formatTime('09:30')).toBe('9:30 AM');
      expect(formatTime('11:45')).toBe('11:45 AM');
    });

    it('should format afternoon times correctly', () => {
      expect(formatTime('12:00')).toBe('12 PM');
      expect(formatTime('13:00')).toBe('1 PM');
      expect(formatTime('17:30')).toBe('5:30 PM');
      expect(formatTime('23:45')).toBe('11:45 PM');
    });

    it('should format midnight and noon correctly', () => {
      expect(formatTime('00:00')).toBe('12 AM');
      expect(formatTime('12:00')).toBe('12 PM');
    });

    it('should hide minutes when they are :00', () => {
      expect(formatTime('09:00')).toBe('9 AM');
      expect(formatTime('14:00')).toBe('2 PM');
      expect(formatTime('16:00')).toBe('4 PM');
    });

    it('should show minutes when not :00', () => {
      expect(formatTime('09:15')).toBe('9:15 AM');
      expect(formatTime('14:30')).toBe('2:30 PM');
      expect(formatTime('23:45')).toBe('11:45 PM');
    });

    it('should handle edge cases', () => {
      expect(formatTime('')).toBe('');
      expect(formatTime('invalid')).toBe('');
      expect(formatTime('25:00')).toBe('13 PM'); // Function doesn't normalize 24-hour time
    });

    it('should pad single digit minutes', () => {
      expect(formatTime('09:05')).toBe('9:05 AM');
      expect(formatTime('14:07')).toBe('2:07 PM');
    });
  });

  describe('formatDaySchedule', () => {
    it('should format open schedule correctly', () => {
      const schedule = {
        closed: false,
        open: '09:00',
        close: '17:00',
      };

      expect(formatDaySchedule(schedule)).toBe('9 AM to 5 PM');
    });

    it('should format schedule with minutes correctly', () => {
      const schedule = {
        closed: false,
        open: '09:30',
        close: '17:45',
      };

      expect(formatDaySchedule(schedule)).toBe('9:30 AM to 5:45 PM');
    });

    it('should return "Closed" for closed days', () => {
      const closedSchedule = {
        closed: true,
        open: '09:00',
        close: '17:00',
      };

      expect(formatDaySchedule(closedSchedule)).toBe('Closed');
    });

    it('should return "Closed" when open time is missing', () => {
      const schedule = {
        closed: false,
        open: '',
        close: '17:00',
      };

      expect(formatDaySchedule(schedule)).toBe('Closed');
    });

    it('should return "Closed" when close time is missing', () => {
      const schedule = {
        closed: false,
        open: '09:00',
        close: '',
      };

      expect(formatDaySchedule(schedule)).toBe('Closed');
    });

    it('should handle undefined times', () => {
      const schedule = {
        closed: false,
        open: undefined as unknown as string,
        close: '17:00',
      };

      expect(formatDaySchedule(schedule)).toBe('Closed');
    });
  });

  describe('formatBusinessHours', () => {
    const standardHours: BusinessHours = {
      sunday: { closed: true, open: '', close: '' },
      monday: { closed: false, open: '09:00', close: '17:00' },
      tuesday: { closed: false, open: '09:00', close: '17:00' },
      wednesday: { closed: false, open: '09:00', close: '17:00' },
      thursday: { closed: false, open: '09:00', close: '17:00' },
      friday: { closed: false, open: '09:00', close: '17:00' },
      saturday: { closed: true, open: '', close: '' },
    };

    it('should format all days in correct order', () => {
      const result = formatBusinessHours(standardHours);

      expect(result).toHaveLength(7);
      expect(result[0]?.day).toBe('Sunday');
      expect(result[1]?.day).toBe('Monday');
      expect(result[6]?.day).toBe('Saturday');
    });

    it('should mark closed days correctly', () => {
      const result = formatBusinessHours(standardHours);

      expect(result[0]?.isClosed).toBe(true); // Sunday
      expect(result[6]?.isClosed).toBe(true); // Saturday
      expect(result[1]?.isClosed).toBe(false); // Monday
    });

    it('should format hours correctly', () => {
      const result = formatBusinessHours(standardHours);

      expect(result[1]?.hours).toBe('9 AM to 5 PM'); // Monday
      expect(result[0]?.hours).toBe('Closed'); // Sunday
    });

    it('should handle all closed business', () => {
      const allClosed: BusinessHours = {
        sunday: { closed: true, open: '', close: '' },
        monday: { closed: true, open: '', close: '' },
        tuesday: { closed: true, open: '', close: '' },
        wednesday: { closed: true, open: '', close: '' },
        thursday: { closed: true, open: '', close: '' },
        friday: { closed: true, open: '', close: '' },
        saturday: { closed: true, open: '', close: '' },
      };

      const result = formatBusinessHours(allClosed);
      result.forEach((day) => {
        expect(day.isClosed).toBe(true);
        expect(day.hours).toBe('Closed');
      });
    });

    it('should handle varied schedules', () => {
      const variedHours: BusinessHours = {
        sunday: { closed: true, open: '', close: '' },
        monday: { closed: false, open: '08:00', close: '16:00' },
        tuesday: { closed: false, open: '09:00', close: '17:00' },
        wednesday: { closed: false, open: '09:00', close: '17:00' },
        thursday: { closed: false, open: '09:00', close: '17:00' },
        friday: { closed: false, open: '10:00', close: '18:00' },
        saturday: { closed: false, open: '10:00', close: '14:00' },
      };

      const result = formatBusinessHours(variedHours);

      expect(result[1]?.hours).toBe('8 AM to 4 PM'); // Monday
      expect(result[5]?.hours).toBe('10 AM to 6 PM'); // Friday
      expect(result[6]?.hours).toBe('10 AM to 2 PM'); // Saturday
    });
  });

  describe('getBusinessHoursSummary', () => {
    it('should return "Closed" for all closed business', () => {
      const allClosed: BusinessHours = {
        sunday: { closed: true, open: '', close: '' },
        monday: { closed: true, open: '', close: '' },
        tuesday: { closed: true, open: '', close: '' },
        wednesday: { closed: true, open: '', close: '' },
        thursday: { closed: true, open: '', close: '' },
        friday: { closed: true, open: '', close: '' },
        saturday: { closed: true, open: '', close: '' },
      };

      expect(getBusinessHoursSummary(allClosed)).toBe('Closed');
    });

    it('should create standard weekday summary', () => {
      const standardHours: BusinessHours = {
        sunday: { closed: true, open: '', close: '' },
        monday: { closed: false, open: '09:00', close: '17:00' },
        tuesday: { closed: false, open: '09:00', close: '17:00' },
        wednesday: { closed: false, open: '09:00', close: '17:00' },
        thursday: { closed: false, open: '09:00', close: '17:00' },
        friday: { closed: false, open: '09:00', close: '17:00' },
        saturday: { closed: true, open: '', close: '' },
      };

      expect(getBusinessHoursSummary(standardHours)).toBe('Mon-Fri 9 AM to 5 PM');
    });

    it('should handle different weekday hours', () => {
      const variedWeekdays: BusinessHours = {
        sunday: { closed: true, open: '', close: '' },
        monday: { closed: false, open: '08:00', close: '16:00' },
        tuesday: { closed: false, open: '09:00', close: '17:00' },
        wednesday: { closed: false, open: '09:00', close: '17:00' },
        thursday: { closed: false, open: '09:00', close: '17:00' },
        friday: { closed: false, open: '10:00', close: '18:00' },
        saturday: { closed: true, open: '', close: '' },
      };

      const summary = getBusinessHoursSummary(variedWeekdays);
      expect(summary).toContain('Mon');
      expect(summary).toContain('Tue');
      expect(summary).toContain('Wed');
      expect(summary).toContain('Thu');
      expect(summary).toContain('Fri');
    });

    it('should include weekend hours when different', () => {
      const withWeekend: BusinessHours = {
        sunday: { closed: true, open: '', close: '' },
        monday: { closed: false, open: '09:00', close: '17:00' },
        tuesday: { closed: false, open: '09:00', close: '17:00' },
        wednesday: { closed: false, open: '09:00', close: '17:00' },
        thursday: { closed: false, open: '09:00', close: '17:00' },
        friday: { closed: false, open: '09:00', close: '17:00' },
        saturday: { closed: false, open: '10:00', close: '14:00' },
      };

      const summary = getBusinessHoursSummary(withWeekend);
      expect(summary).not.toContain('Mon-Fri');
      expect(summary).toContain('Sat');
    });

    it('should handle 24/7 operations', () => {
      const twentyFourSeven: BusinessHours = {
        sunday: { closed: false, open: '00:00', close: '23:59' },
        monday: { closed: false, open: '00:00', close: '23:59' },
        tuesday: { closed: false, open: '00:00', close: '23:59' },
        wednesday: { closed: false, open: '00:00', close: '23:59' },
        thursday: { closed: false, open: '00:00', close: '23:59' },
        friday: { closed: false, open: '00:00', close: '23:59' },
        saturday: { closed: false, open: '00:00', close: '23:59' },
      };

      const summary = getBusinessHoursSummary(twentyFourSeven);
      // Should list all days since it's not a standard Mon-Fri pattern
      expect(summary).toContain('12 AM to 11:59 PM');
    });
  });

  describe('isCurrentlyOpen', () => {
    let mockDate: Mocked<Date>;

    beforeEach(() => {
      // Mock Date constructor
      const MockDate = vi.fn();
      MockDate.prototype.getDay = vi.fn();
      MockDate.prototype.toTimeString = vi.fn();

      mockDate = new MockDate();
      vi.stubGlobal('Date', MockDate);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('should return false for closed days', () => {
      const businessHours: BusinessHours = {
        sunday: { closed: true, open: '', close: '' },
        monday: { closed: false, open: '09:00', close: '17:00' },
        tuesday: { closed: false, open: '09:00', close: '17:00' },
        wednesday: { closed: false, open: '09:00', close: '17:00' },
        thursday: { closed: false, open: '09:00', close: '17:00' },
        friday: { closed: false, open: '09:00', close: '17:00' },
        saturday: { closed: true, open: '', close: '' },
      };

      // Mock Sunday (day 0)
      mockDate.getDay.mockReturnValue(0);
      mockDate.toTimeString.mockReturnValue('12:00:00');

      expect(isCurrentlyOpen(businessHours)).toBe(false);
    });

    it('should return true during business hours', () => {
      const businessHours: BusinessHours = {
        sunday: { closed: true, open: '', close: '' },
        monday: { closed: false, open: '09:00', close: '17:00' },
        tuesday: { closed: false, open: '09:00', close: '17:00' },
        wednesday: { closed: false, open: '09:00', close: '17:00' },
        thursday: { closed: false, open: '09:00', close: '17:00' },
        friday: { closed: false, open: '09:00', close: '17:00' },
        saturday: { closed: true, open: '', close: '' },
      };

      // Mock Monday (day 1) at 2:00 PM
      mockDate.getDay.mockReturnValue(1);
      mockDate.toTimeString.mockReturnValue('14:00:00');

      expect(isCurrentlyOpen(businessHours)).toBe(true);
    });

    it('should return false before opening time', () => {
      const businessHours: BusinessHours = {
        sunday: { closed: true, open: '', close: '' },
        monday: { closed: false, open: '09:00', close: '17:00' },
        tuesday: { closed: false, open: '09:00', close: '17:00' },
        wednesday: { closed: false, open: '09:00', close: '17:00' },
        thursday: { closed: false, open: '09:00', close: '17:00' },
        friday: { closed: false, open: '09:00', close: '17:00' },
        saturday: { closed: true, open: '', close: '' },
      };

      // Mock Monday (day 1) at 8:00 AM (before opening)
      mockDate.getDay.mockReturnValue(1);
      mockDate.toTimeString.mockReturnValue('08:00:00');

      expect(isCurrentlyOpen(businessHours)).toBe(false);
    });

    it('should return false after closing time', () => {
      const businessHours: BusinessHours = {
        sunday: { closed: true, open: '', close: '' },
        monday: { closed: false, open: '09:00', close: '17:00' },
        tuesday: { closed: false, open: '09:00', close: '17:00' },
        wednesday: { closed: false, open: '09:00', close: '17:00' },
        thursday: { closed: false, open: '09:00', close: '17:00' },
        friday: { closed: false, open: '09:00', close: '17:00' },
        saturday: { closed: true, open: '', close: '' },
      };

      // Mock Monday (day 1) at 6:00 PM (after closing)
      mockDate.getDay.mockReturnValue(1);
      mockDate.toTimeString.mockReturnValue('18:00:00');

      expect(isCurrentlyOpen(businessHours)).toBe(false);
    });

    it('should handle opening and closing at exact times', () => {
      const businessHours: BusinessHours = {
        sunday: { closed: true, open: '', close: '' },
        monday: { closed: false, open: '09:00', close: '17:00' },
        tuesday: { closed: false, open: '09:00', close: '17:00' },
        wednesday: { closed: false, open: '09:00', close: '17:00' },
        thursday: { closed: false, open: '09:00', close: '17:00' },
        friday: { closed: false, open: '09:00', close: '17:00' },
        saturday: { closed: true, open: '', close: '' },
      };

      // Mock Monday (day 1) at exact opening time
      mockDate.getDay.mockReturnValue(1);
      mockDate.toTimeString.mockReturnValue('09:00:00');
      expect(isCurrentlyOpen(businessHours)).toBe(true);

      // Mock Monday (day 1) at exact closing time
      mockDate.toTimeString.mockReturnValue('17:00:00');
      expect(isCurrentlyOpen(businessHours)).toBe(true);
    });

    it('should handle all days of the week', () => {
      const businessHours: BusinessHours = {
        sunday: { closed: false, open: '10:00', close: '16:00' },
        monday: { closed: false, open: '09:00', close: '17:00' },
        tuesday: { closed: false, open: '09:00', close: '17:00' },
        wednesday: { closed: false, open: '09:00', close: '17:00' },
        thursday: { closed: false, open: '09:00', close: '17:00' },
        friday: { closed: false, open: '09:00', close: '17:00' },
        saturday: { closed: false, open: '10:00', close: '16:00' },
      };

      // Test each day at a time when it should be open
      const testCases = [
        { day: 0, time: '12:00:00' }, // Sunday
        { day: 1, time: '12:00:00' }, // Monday
        { day: 2, time: '12:00:00' }, // Tuesday
        { day: 3, time: '12:00:00' }, // Wednesday
        { day: 4, time: '12:00:00' }, // Thursday
        { day: 5, time: '12:00:00' }, // Friday
        { day: 6, time: '12:00:00' }, // Saturday
      ];

      testCases.forEach(({ day, time }) => {
        mockDate.getDay.mockReturnValue(day);
        mockDate.toTimeString.mockReturnValue(time);
        expect(isCurrentlyOpen(businessHours)).toBe(true);
      });
    });
  });
});
