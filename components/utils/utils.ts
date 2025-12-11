import { formatCompactValue } from '@/lib/utils/format-value';

/**
 * Format currency value with compact notation (K/M/B)
 * Uses canonical formatCompactValue from @/lib/utils/format-value
 */
export const formatValue = (value: number): string =>
  formatCompactValue(value, { style: 'currency' });

/**
 * Format number value with compact notation (K/M/B)
 * Uses canonical formatCompactValue from @/lib/utils/format-value
 */
export const formatThousands = (value: number): string =>
  formatCompactValue(value, { style: 'number' });

export const getCssVariable = (variable: string): string => {
  if (typeof window === 'undefined') {
    return '';
  }
  return getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
};

const adjustHexOpacity = (hexColor: string, opacity: number): string => {
  // Remove the '#' if it exists
  hexColor = hexColor.replace('#', '');

  // Convert hex to RGB
  const r = parseInt(hexColor.substring(0, 2), 16);
  const g = parseInt(hexColor.substring(2, 4), 16);
  const b = parseInt(hexColor.substring(4, 6), 16);

  // Return RGBA string
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

const adjustHSLOpacity = (hslColor: string, opacity: number): string => {
  // Convert HSL to HSLA
  return hslColor.replace('hsl(', 'hsla(').replace(')', `, ${opacity})`);
};

const adjustOKLCHOpacity = (oklchColor: string, opacity: number): string => {
  // Add alpha value to OKLCH color
  return oklchColor.replace(/oklch\((.*?)\)/, (_match, p1) => `oklch(${p1} / ${opacity})`);
};

export const adjustColorOpacity = (color: string, opacity: number): string => {
  if (!color || color.trim() === '') {
    // Fallback to a neutral transparent color to avoid runtime errors in canvas gradients
    return `rgba(0, 0, 0, ${opacity})`;
  }
  if (color.startsWith('#')) {
    return adjustHexOpacity(color, opacity);
  } else if (color.startsWith('hsl')) {
    return adjustHSLOpacity(color, opacity);
  } else if (color.startsWith('oklch')) {
    return adjustOKLCHOpacity(color, opacity);
  } else {
    // Unknown format: return a safe RGBA fallback
    return `rgba(0, 0, 0, ${opacity})`;
  }
};

export const oklchToRGBA = (oklchColor: string): string => {
  // Create a temporary div to use for color conversion
  const tempDiv = document.createElement('div');
  tempDiv.style.color = oklchColor;
  document.body.appendChild(tempDiv);

  // Get the computed style and convert to RGB
  const computedColor = window.getComputedStyle(tempDiv).color;
  document.body.removeChild(tempDiv);

  return computedColor;
};
