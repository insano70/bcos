'use client';

import { useId } from 'react';
import type { BusinessHours, DaySchedule } from '@/lib/types/practice';

interface BusinessHoursEditorProps {
  businessHours: BusinessHours;
  onChange: (hours: BusinessHours) => void;
  label?: string;
  className?: string;
}

export default function BusinessHoursEditor({
  businessHours,
  onChange,
  label = 'Business Hours',
  className = '',
}: BusinessHoursEditorProps) {
  const uid = useId();

  // Days in order: Sunday through Saturday
  const daysOfWeek = [
    { key: 'sunday', label: 'Sunday' },
    { key: 'monday', label: 'Monday' },
    { key: 'tuesday', label: 'Tuesday' },
    { key: 'wednesday', label: 'Wednesday' },
    { key: 'thursday', label: 'Thursday' },
    { key: 'friday', label: 'Friday' },
    { key: 'saturday', label: 'Saturday' },
  ] as const;

  const updateDay = (day: keyof BusinessHours, schedule: Partial<DaySchedule>) => {
    const updatedHours = {
      ...businessHours,
      [day]: {
        ...businessHours[day],
        ...schedule,
      },
    };
    onChange(updatedHours);
  };

  const toggleClosed = (day: keyof BusinessHours) => {
    const currentDay = businessHours[day];
    updateDay(day, {
      closed: !currentDay.closed,
      // If reopening, provide default hours
      ...(currentDay.closed ? { open: '09:00', close: '17:00' } : {}),
    });
  };

  return (
    <div className={className}>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
        {label}
      </label>

      <div className="space-y-4">
        {daysOfWeek.map(({ key, label: dayLabel }) => {
          const daySchedule = businessHours[key] || { closed: true };

          return (
            <div
              key={key}
              className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
            >
              {/* Day name */}
              <div className="w-24 flex-shrink-0">
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {dayLabel}
                </span>
              </div>

              {/* Closed checkbox */}
              <div className="flex items-center">
                <input
                  id={`${uid}-${key}-closed`}
                  type="checkbox"
                  checked={daySchedule.closed || false}
                  onChange={() => toggleClosed(key)}
                  className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                />
                <label
                  htmlFor={`${uid}-${key}-closed`}
                  className="ml-2 text-sm text-gray-700 dark:text-gray-300"
                >
                  Closed
                </label>
              </div>

              {/* Time inputs (only show if not closed) */}
              {!daySchedule.closed && (
                <div className="flex items-center gap-2 flex-1">
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor={`${uid}-${key}-open`}
                      className="text-sm text-gray-600 dark:text-gray-400"
                    >
                      Open:
                    </label>
                    <input
                      id={`${uid}-${key}-open`}
                      type="time"
                      value={daySchedule.open || '09:00'}
                      onChange={(e) => updateDay(key, { open: e.target.value })}
                      className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <span className="text-gray-500">to</span>

                  <div className="flex items-center gap-2">
                    <label
                      htmlFor={`${uid}-${key}-close`}
                      className="text-sm text-gray-600 dark:text-gray-400"
                    >
                      Close:
                    </label>
                    <input
                      id={`${uid}-${key}-close`}
                      type="time"
                      value={daySchedule.close || '17:00'}
                      onChange={(e) => updateDay(key, { close: e.target.value })}
                      className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              )}

              {/* Show "Closed" text when closed */}
              {daySchedule.closed && (
                <div className="flex-1">
                  <span className="text-sm text-gray-500 italic">Closed all day</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Quick actions */}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => {
            const standardHours = { open: '09:00', close: '17:00', closed: false };
            const weekdayHours = {
              sunday: { closed: true },
              monday: standardHours,
              tuesday: standardHours,
              wednesday: standardHours,
              thursday: standardHours,
              friday: standardHours,
              saturday: { closed: true },
            };
            onChange(weekdayHours);
          }}
          className="px-3 py-1.5 text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
        >
          Standard Hours (M-F 9am-5pm)
        </button>

        <button
          type="button"
          onClick={() => {
            const allClosed = daysOfWeek.reduce(
              (acc, { key }) => {
                acc[key] = { closed: true };
                return acc;
              },
              {} as BusinessHours
            );
            onChange(allClosed);
          }}
          className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
        >
          All Closed
        </button>
      </div>
    </div>
  );
}
