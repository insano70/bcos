'use client';

import type { ChangeEvent } from 'react';

/**
 * DateTimeInput Component
 *
 * A datetime input that always emits and accepts ISO 8601 datetime format with timezone.
 * Internally converts between YYYY-MM-DDTHH:mm (HTML input) and YYYY-MM-DDTHH:mm:ss.sssZ (API format).
 *
 * Note: The HTML datetime-local input doesn't support timezones, so we assume the user's
 * local timezone and convert to UTC for storage.
 *
 * @param value - ISO datetime string (e.g., "2024-01-15T14:30:00.000Z") or null
 * @param onChange - Callback that receives ISO datetime string or null
 *
 * @example
 * <DateTimeInput
 *   value="2024-01-15T14:30:00.000Z"
 *   onChange={(value) => console.log(value)} // "2024-01-16T10:00:00.000Z"
 *   required
 *   error="DateTime is required"
 * />
 */

export interface DateTimeInputProps {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  required?: boolean;
  disabled?: boolean;
  error?: string | undefined;
  className?: string;
  id?: string;
  placeholder?: string;
  min?: string; // ISO datetime string
  max?: string; // ISO datetime string
}

export default function DateTimeInput({
  value,
  onChange,
  required = false,
  disabled = false,
  error,
  className = '',
  id,
  placeholder,
  min,
  max,
}: DateTimeInputProps) {
  // Convert ISO datetime to datetime-local format for display
  // ISO: "2024-01-15T14:30:00.000Z" → Display: "2024-01-15T14:30"
  const displayValue = value ? new Date(value).toISOString().slice(0, 16) : '';

  // Convert min/max if provided (datetime-local format doesn't include seconds)
  const displayMin = min ? new Date(min).toISOString().slice(0, 16) : undefined;
  const displayMax = max ? new Date(max).toISOString().slice(0, 16) : undefined;

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const localDateTime = e.target.value; // Format: YYYY-MM-DDTHH:mm

    if (!localDateTime) {
      // Empty input - emit null
      onChange(null);
      return;
    }

    // Convert datetime-local to ISO datetime with UTC timezone
    // The browser gives us local time, we need to convert to UTC
    try {
      const date = new Date(localDateTime);
      const isoDateTime = date.toISOString();
      onChange(isoDateTime);
    } catch (error) {
      // Invalid date - emit null
      console.error('Invalid datetime value:', localDateTime, error);
      onChange(null);
    }
  };

  // Build className with error state
  const inputClassName = `form-input w-full ${error ? 'border-red-500' : ''} ${className}`.trim();

  return (
    <input
      id={id}
      type="datetime-local"
      value={displayValue}
      onChange={handleChange}
      required={required}
      disabled={disabled}
      className={inputClassName}
      placeholder={placeholder}
      min={displayMin}
      max={displayMax}
    />
  );
}
