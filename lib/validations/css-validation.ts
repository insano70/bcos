/**
 * CSS Validation Utilities
 * Provides strict validation for user-provided CSS values
 * Prevents CSS injection attacks via color properties and other CSS values
 */

/**
 * Validate a CSS hex color value
 * Only allows standard 6-digit hex colors (#RRGGBB)
 * 
 * @param color - Color value to validate
 * @returns true if valid hex color, false otherwise
 * 
 * @example
 * validateCSSColor('#00AEEF') // true
 * validateCSSColor('#FFF')    // false (3-digit not allowed)
 * validateCSSColor('red')     // false (named colors not allowed)
 * validateCSSColor('#00A url(https://evil.com)') // false (injection attempt)
 */
export function validateCSSColor(color: string): boolean {
  if (!color || typeof color !== 'string') {
    return false;
  }

  // Only allow 6-digit hex colors (most restrictive)
  const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;
  if (!hexColorRegex.test(color)) {
    return false;
  }

  // Block potential CSS injection patterns
  // Even though hex regex should catch these, defense in depth
  const dangerousPatterns = [
    /url\s*\(/i,           // url() for data exfiltration
    /@import/i,            // @import for loading external CSS
    /@font-face/i,         // @font-face for loading external fonts  
    /expression\s*\(/i,    // IE CSS expressions (legacy but still dangerous)
    /behavior\s*:/i,       // IE behaviors
    /binding\s*:/i,        // Mozilla XBL bindings
    /-moz-binding/i,       // Mozilla XBL
    /javascript:/i,        // javascript: protocol
    /vbscript:/i,          // vbscript: protocol
    /data:/i,              // data: URLs
    /<script/i,            // Script tag injection attempts
    /on\w+\s*=/i,          // Event handler attributes
  ];

  return !dangerousPatterns.some((pattern) => pattern.test(color));
}

/**
 * Validate multiple CSS color values at once
 * Useful for validating brand color palettes
 * 
 * @param colors - Object containing color values to validate
 * @returns Object with validation results for each color
 * 
 * @example
 * validateCSSColors({
 *   primary: '#00AEEF',
 *   secondary: '#FFFFFF',
 *   accent: 'red' // Invalid
 * })
 * // Returns: { 
 *   primary: true, 
 *   secondary: true, 
 *   accent: false 
 * }
 */
export function validateCSSColors(
  colors: Record<string, string>
): Record<string, boolean> {
  const results: Record<string, boolean> = {};

  for (const [key, value] of Object.entries(colors)) {
    results[key] = validateCSSColor(value);
  }

  return results;
}

/**
 * Sanitize a CSS color value (returns valid color or null)
 * Use this to clean user input before storing/using
 * 
 * @param color - Color value to sanitize
 * @returns Validated color or null if invalid
 * 
 * @example
 * sanitizeCSSColor('#00AEEF') // '#00AEEF'
 * sanitizeCSSColor('red')     // null
 * sanitizeCSSColor('#00A')    // null
 */
export function sanitizeCSSColor(color: string): string | null {
  return validateCSSColor(color) ? color : null;
}

/**
 * Validate CSS opacity value (0.0 to 1.0)
 * 
 * @param opacity - Opacity value to validate
 * @returns true if valid opacity, false otherwise
 */
export function validateCSSOpacity(opacity: number | string): boolean {
  const num = typeof opacity === 'string' ? parseFloat(opacity) : opacity;
  
  if (Number.isNaN(num)) {
    return false;
  }

  return num >= 0 && num <= 1;
}

/**
 * Validate CSS dimension value (px, %, em, rem)
 * Blocks negative values and dangerous patterns
 * 
 * @param dimension - Dimension value to validate (e.g., '100px', '50%')
 * @returns true if valid dimension, false otherwise
 */
export function validateCSSDimension(dimension: string): boolean {
  if (!dimension || typeof dimension !== 'string') {
    return false;
  }

  // Allow positive numbers with common units
  const dimensionRegex = /^(\d+(\.\d+)?)(px|%|em|rem|vh|vw)$/;
  
  if (!dimensionRegex.test(dimension)) {
    return false;
  }

  // Block dangerous patterns
  const dangerousPatterns = [
    /url\s*\(/i,
    /calc\s*\(/i,       // calc() can be abused
    /expression\s*\(/i,
    /javascript:/i,
  ];

  return !dangerousPatterns.some((pattern) => pattern.test(dimension));
}
