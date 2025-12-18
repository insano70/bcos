'use client';

/**
 * Format-Specific Field Components
 * Specialized input components for URL, email, phone, currency, and percentage fields
 */

import { FormError } from '@/components/ui/form-error';
import { FormHelp } from '@/components/ui/form-help';
import { FormLabel } from '@/components/ui/form-label';

interface FieldProps {
  value: string | number;
  onChange: (value: string | number) => void;
  label?: string;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
}

/**
 * URL Field Component
 */
export function URLField({
  value,
  onChange,
  label,
  placeholder = 'https://example.com',
  error,
  disabled = false,
  required = false,
}: FieldProps) {
  return (
    <div className="space-y-2">
      {label && (
        <FormLabel required={required}>
          {label}
        </FormLabel>
      )}
      <input
        type="url"
        value={value as string}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        className={`form-input w-full ${error ? 'border-red-500' : ''}`}
      />
      <FormError>{error}</FormError>
    </div>
  );
}

/**
 * Email Field Component
 */
export function EmailField({
  value,
  onChange,
  label,
  placeholder = 'email@example.com',
  error,
  disabled = false,
  required = false,
}: FieldProps) {
  return (
    <div className="space-y-2">
      {label && (
        <FormLabel required={required}>
          {label}
        </FormLabel>
      )}
      <input
        type="email"
        value={value as string}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        className={`form-input w-full ${error ? 'border-red-500' : ''}`}
      />
      <FormError>{error}</FormError>
    </div>
  );
}

/**
 * Phone Field Component
 */
export function PhoneField({
  value,
  onChange,
  label,
  placeholder = '+1 (555) 123-4567',
  error,
  disabled = false,
  required = false,
}: FieldProps) {
  const handleChange = (inputValue: string): void => {
    // Allow only valid phone characters
    const cleaned = inputValue.replace(/[^\d\s()+.-]/g, '');
    onChange(cleaned);
  };

  return (
    <div className="space-y-2">
      {label && (
        <FormLabel required={required}>
          {label}
        </FormLabel>
      )}
      <input
        type="tel"
        value={value as string}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        className={`form-input w-full ${error ? 'border-red-500' : ''}`}
      />
      <FormError>{error}</FormError>
    </div>
  );
}

/**
 * Currency Field Component
 */
export function CurrencyField({
  value,
  onChange,
  label,
  placeholder = '0.00',
  error,
  disabled = false,
  required = false,
}: FieldProps) {
  const handleChange = (inputValue: string): void => {
    // Remove non-numeric characters except decimal point
    const cleaned = inputValue.replace(/[^\d.]/g, '');

    // Ensure only one decimal point
    const parts = cleaned.split('.');
    if (parts.length > 2) {
      return;
    }

    // Limit to 2 decimal places
    if (parts.length === 2 && parts[1] && parts[1].length > 2) {
      return;
    }

    const numValue = parseFloat(cleaned || '0');
    onChange(numValue);
  };

  return (
    <div className="space-y-2">
      {label && (
        <FormLabel required={required}>
          {label}
        </FormLabel>
      )}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">
          $
        </span>
        <input
          type="text"
          inputMode="decimal"
          value={value === 0 ? '' : value.toString()}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          className={`form-input w-full pl-7 ${error ? 'border-red-500' : ''}`}
        />
      </div>
      <FormError>{error}</FormError>
    </div>
  );
}

/**
 * Percentage Field Component
 */
export function PercentageField({
  value,
  onChange,
  label,
  placeholder = '0',
  error,
  disabled = false,
  required = false,
}: FieldProps) {
  const handleChange = (inputValue: string): void => {
    // Remove non-numeric characters except decimal point
    const cleaned = inputValue.replace(/[^\d.]/g, '');

    // Ensure only one decimal point
    const parts = cleaned.split('.');
    if (parts.length > 2) {
      return;
    }

    // Limit to 2 decimal places
    if (parts.length === 2 && parts[1] && parts[1].length > 2) {
      return;
    }

    let numValue = parseFloat(cleaned || '0');

    // Clamp between 0 and 100
    if (numValue < 0) numValue = 0;
    if (numValue > 100) numValue = 100;

    onChange(numValue);
  };

  return (
    <div className="space-y-2">
      {label && (
        <FormLabel required={required}>
          {label}
        </FormLabel>
      )}
      <div className="relative">
        <input
          type="text"
          inputMode="decimal"
          value={value === 0 ? '' : value.toString()}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          className={`form-input w-full pr-7 ${error ? 'border-red-500' : ''}`}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">
          %
        </span>
      </div>
      <FormError>{error}</FormError>
      {!error && value !== 0 && (
        <FormHelp>Value: {value}% (0-100)</FormHelp>
      )}
    </div>
  );
}
