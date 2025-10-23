/**
 * Color contrast validation utilities following WCAG AA/AAA standards
 * Based on Web Content Accessibility Guidelines (WCAG) 2.1
 */

import { hexToRgb } from './color-utils';

/**
 * Calculate relative luminance of a color
 * Formula from WCAG 2.1: https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
function getRelativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;

  // Convert RGB to sRGB
  const rsRGB = rgb.r / 255;
  const gsRGB = rgb.g / 255;
  const bsRGB = rgb.b / 255;

  // Apply gamma correction
  const r = rsRGB <= 0.03928 ? rsRGB / 12.92 : ((rsRGB + 0.055) / 1.055) ** 2.4;
  const g = gsRGB <= 0.03928 ? gsRGB / 12.92 : ((gsRGB + 0.055) / 1.055) ** 2.4;
  const b = bsRGB <= 0.03928 ? bsRGB / 12.92 : ((bsRGB + 0.055) / 1.055) ** 2.4;

  // Calculate relative luminance
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Calculate contrast ratio between two colors
 * Formula from WCAG 2.1: https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 */
export function getContrastRatio(color1: string, color2: string): number {
  const L1 = getRelativeLuminance(color1);
  const L2 = getRelativeLuminance(color2);

  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * WCAG contrast ratio requirements
 */
export const WCAG_STANDARDS = {
  AA_NORMAL: 4.5, // Normal text (< 18pt or < 14pt bold)
  AA_LARGE: 3.0, // Large text (≥ 18pt or ≥ 14pt bold)
  AAA_NORMAL: 7.0, // Enhanced normal text
  AAA_LARGE: 4.5, // Enhanced large text
} as const;

export type ContrastLevel = 'AAA' | 'AA' | 'AA_LARGE' | 'FAIL';

/**
 * Check if contrast ratio meets WCAG standards
 */
export function checkContrast(
  foreground: string,
  background: string,
  isLargeText = false
): {
  ratio: number;
  level: ContrastLevel;
  passAA: boolean;
  passAAA: boolean;
} {
  const ratio = getContrastRatio(foreground, background);
  const minAA = isLargeText ? WCAG_STANDARDS.AA_LARGE : WCAG_STANDARDS.AA_NORMAL;
  const minAAA = isLargeText ? WCAG_STANDARDS.AAA_LARGE : WCAG_STANDARDS.AAA_NORMAL;

  const passAA = ratio >= minAA;
  const passAAA = ratio >= minAAA;

  let level: ContrastLevel;
  if (passAAA) {
    level = 'AAA';
  } else if (passAA) {
    level = isLargeText ? 'AA_LARGE' : 'AA';
  } else {
    level = 'FAIL';
  }

  return {
    ratio: Math.round(ratio * 100) / 100, // Round to 2 decimal places
    level,
    passAA,
    passAAA,
  };
}

/**
 * Check if a color is considered "light" (useful for determining text color)
 */
export function isLightColor(hex: string): boolean {
  const luminance = getRelativeLuminance(hex);
  return luminance > 0.5;
}

/**
 * Suggest accessible text color (black or white) for a given background
 */
export function suggestTextColor(backgroundColor: string): '#000000' | '#FFFFFF' {
  return isLightColor(backgroundColor) ? '#000000' : '#FFFFFF';
}

/**
 * Validate brand colors for common use cases
 */
export interface BrandColorValidation {
  primaryOnWhite: ReturnType<typeof checkContrast>;
  primaryOnSecondary: ReturnType<typeof checkContrast>;
  accentOnWhite: ReturnType<typeof checkContrast>;
  accentOnSecondary: ReturnType<typeof checkContrast>;
  whiteOnPrimary: ReturnType<typeof checkContrast>;
  whiteOnAccent: ReturnType<typeof checkContrast>;
  hasIssues: boolean;
}

/**
 * Validate a complete brand color palette
 */
export function validateBrandColors(
  primary: string,
  secondary: string,
  accent: string
): BrandColorValidation {
  const primaryOnWhite = checkContrast(primary, '#FFFFFF');
  const primaryOnSecondary = checkContrast(primary, secondary);
  const accentOnWhite = checkContrast(accent, '#FFFFFF');
  const accentOnSecondary = checkContrast(accent, secondary);
  const whiteOnPrimary = checkContrast('#FFFFFF', primary);
  const whiteOnAccent = checkContrast('#FFFFFF', accent);

  const hasIssues =
    !primaryOnWhite.passAA ||
    !accentOnWhite.passAA ||
    !whiteOnPrimary.passAA ||
    !whiteOnAccent.passAA;

  return {
    primaryOnWhite,
    primaryOnSecondary,
    accentOnWhite,
    accentOnSecondary,
    whiteOnPrimary,
    whiteOnAccent,
    hasIssues,
  };
}

/**
 * Generate accessible color suggestions by adjusting lightness
 */
export function suggestAccessibleColor(
  color: string,
  backgroundColor: string,
  targetRatio = WCAG_STANDARDS.AA_NORMAL
): string | null {
  const rgb = hexToRgb(color);
  if (!rgb) return null;

  // Try darkening and lightening the color
  const adjustments = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90];

  // Try darkening first
  for (const amount of adjustments) {
    const factor = 1 - amount / 100;
    const darkened = `#${Math.round(rgb.r * factor)
      .toString(16)
      .padStart(2, '0')}${Math.round(rgb.g * factor)
      .toString(16)
      .padStart(2, '0')}${Math.round(rgb.b * factor)
      .toString(16)
      .padStart(2, '0')}`;

    const ratio = getContrastRatio(darkened, backgroundColor);
    if (ratio >= targetRatio) {
      return darkened.toUpperCase();
    }
  }

  // Try lightening
  for (const amount of adjustments) {
    const factor = amount / 100;
    const lightened = `#${Math.min(255, Math.round(rgb.r + (255 - rgb.r) * factor))
      .toString(16)
      .padStart(2, '0')}${Math.min(255, Math.round(rgb.g + (255 - rgb.g) * factor))
      .toString(16)
      .padStart(2, '0')}${Math.min(255, Math.round(rgb.b + (255 - rgb.b) * factor))
      .toString(16)
      .padStart(2, '0')}`;

    const ratio = getContrastRatio(lightened, backgroundColor);
    if (ratio >= targetRatio) {
      return lightened.toUpperCase();
    }
  }

  return null;
}
