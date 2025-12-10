'use client';

import { memo, type ChangeEvent } from 'react';

/**
 * DateInput Component
 *
 * A date input that always emits and accepts ISO 8601 datetime format.
 * Internally converts between YYYY-MM-DD (HTML input) and YYYY-MM-DDTHH:mm:ss.sssZ (API format).
 *
 * @param value - ISO datetime string (e.g., "2024-01-15T00:00:00.000Z") or null
 * @param onChange - Callback that receives ISO datetime string or null
 *
 * @example
 * <DateInput
 *   value="2024-01-15T00:00:00.000Z"
 *   onChange={(value) => console.log(value)} // "2024-01-16T00:00:00.000Z"
 *   required
 *   error="Date is required"
 * />
 */

export interface DateInputProps {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  required?: boolean;
  disabled?: boolean;
  error?: string | undefined;
  className?: string;
  id?: string;
  placeholder?: string;
  min?: string; // ISO date string (YYYY-MM-DD)
  max?: string; // ISO date string (YYYY-MM-DD)
}

function DateInputInner({
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
}: DateInputProps) {
  // Extract date portion from ISO datetime for display
  // If value is "2024-01-15T00:00:00.000Z", display "2024-01-15"
  const displayValue = value ? String(value).split('T')[0] : '';

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const dateStr = e.target.value;

    if (!dateStr) {
      // Empty input - emit null
      onChange(null);
      return;
    }

    // Convert YYYY-MM-DD to ISO datetime format (midnight UTC)
    const isoDateTime = `${dateStr}T00:00:00.000Z`;
    onChange(isoDateTime);
  };

  // Build className with error state
  const inputClassName = `form-input w-full ${error ? 'border-red-500' : ''} ${className}`.trim();

  return (
    <input
      id={id}
      type="date"
      value={displayValue}
      onChange={handleChange}
      required={required}
      disabled={disabled}
      className={inputClassName}
      placeholder={placeholder}
      min={min}
      max={max}
    />
  );
}

const DateInput = memo(DateInputInner);
export default DateInput;
