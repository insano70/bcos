'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Format-Specific Field Components
 * Specialized input components for URL, email, phone, currency, and percentage fields
 */

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
        <Label>
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </Label>
      )}
      <Input
        type="url"
        value={value as string}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        className={error ? 'border-destructive' : ''}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
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
        <Label>
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </Label>
      )}
      <Input
        type="email"
        value={value as string}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        className={error ? 'border-destructive' : ''}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
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
        <Label>
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </Label>
      )}
      <Input
        type="tel"
        value={value as string}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        className={error ? 'border-destructive' : ''}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
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
    if (parts.length === 2 && parts[1]?.length > 2) {
      return;
    }

    const numValue = parseFloat(cleaned || '0');
    onChange(numValue);
  };

  return (
    <div className="space-y-2">
      {label && (
        <Label>
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </Label>
      )}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          $
        </span>
        <Input
          type="text"
          inputMode="decimal"
          value={value === 0 ? '' : value.toString()}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          className={`pl-7 ${error ? 'border-destructive' : ''}`}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
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
    if (parts.length === 2 && parts[1]?.length > 2) {
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
        <Label>
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </Label>
      )}
      <div className="relative">
        <Input
          type="text"
          inputMode="decimal"
          value={value === 0 ? '' : value.toString()}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          className={`pr-7 ${error ? 'border-destructive' : ''}`}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          %
        </span>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!error && value !== 0 && (
        <p className="text-xs text-muted-foreground">
          Value: {value}% (0-100)
        </p>
      )}
    </div>
  );
}
