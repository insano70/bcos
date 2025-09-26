/**
 * Utility functions for handling dynamic colors in templates
 */

export interface BrandColors {
  primary: string;
  secondary: string;
  accent: string;
}

/**
 * Get default colors for a template
 */
export function getTemplateDefaultColors(templateSlug: string): BrandColors {
  const defaults: Record<string, BrandColors> = {
    'classic-professional': {
      primary: '#00AEEF', // bright blue
      secondary: '#FFFFFF', // white
      accent: '#44C0AE', // teal
    },
    'modern-minimalist': {
      primary: '#00AEEF', // bright blue
      secondary: '#FFFFFF', // white
      accent: '#44C0AE', // teal
    },
    'warm-welcoming': {
      primary: '#00AEEF', // bright blue
      secondary: '#FFFFFF', // white
      accent: '#44C0AE', // teal
    },
    'clinical-focus': {
      primary: '#00AEEF', // bright blue
      secondary: '#FFFFFF', // white
      accent: '#44C0AE', // teal
    },
    'community-practice': {
      primary: '#00AEEF', // bright blue
      secondary: '#FFFFFF', // white
      accent: '#44C0AE', // teal
    },
    'tidy-professional': {
      primary: '#2174EA', // tidy blue
      secondary: '#F8FAFC', // slate-50
      accent: '#5696FF', // lighter blue
    },
  };
  
  return defaults[templateSlug] || defaults['classic-professional'] || {
    primary: '#3B82F6',
    secondary: '#1E40AF', 
    accent: '#F59E0B'
  };
}

/**
 * Convert hex color to RGB values
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1] || '0', 16),
    g: parseInt(result[2] || '0', 16),
    b: parseInt(result[3] || '0', 16)
  } : null;
}

/**
 * Convert hex color to rgba with opacity
 */
export function hexToRgba(hex: string, opacity: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
}

/**
 * Darken a hex color by a percentage
 */
export function darkenColor(hex: string, percent: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  
  const factor = 1 - (percent / 100);
  const r = Math.round(rgb.r * factor);
  const g = Math.round(rgb.g * factor);
  const b = Math.round(rgb.b * factor);
  
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Generate CSS custom properties for SSR
 */
export function generateSSRColorStyles(colors: BrandColors): React.CSSProperties {
  return {
    '--color-primary': colors.primary,
    '--color-secondary': colors.secondary,
    '--color-accent': colors.accent,
    '--color-primary-50': hexToRgba(colors.primary, 0.05),
    '--color-primary-100': hexToRgba(colors.primary, 0.1),
    '--color-primary-200': hexToRgba(colors.primary, 0.2),
    '--color-primary-600': colors.primary,
    '--color-primary-700': darkenColor(colors.primary, 10),
    '--color-primary-800': darkenColor(colors.primary, 20),
    '--color-secondary-50': hexToRgba(colors.secondary, 0.05),
    '--color-secondary-100': colors.secondary,
    '--color-secondary-200': hexToRgba(colors.secondary, 0.8),
    '--color-accent-50': hexToRgba(colors.accent, 0.05),
    '--color-accent-100': hexToRgba(colors.accent, 0.1),
    '--color-accent-600': colors.accent,
    '--color-accent-700': darkenColor(colors.accent, 10),
  } as React.CSSProperties;
}

/**
 * Generate CSS custom properties for the colors
 */
export function generateColorCSS(colors: BrandColors): string {
  const primaryRgb = hexToRgb(colors.primary);
  const secondaryRgb = hexToRgb(colors.secondary);
  const accentRgb = hexToRgb(colors.accent);
  
  return `
    :root {
      --color-primary: ${colors.primary};
      --color-primary-rgb: ${primaryRgb ? `${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}` : '37, 99, 235'};
      --color-secondary: ${colors.secondary};
      --color-secondary-rgb: ${secondaryRgb ? `${secondaryRgb.r}, ${secondaryRgb.g}, ${secondaryRgb.b}` : '243, 244, 246'};
      --color-accent: ${colors.accent};
      --color-accent-rgb: ${accentRgb ? `${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}` : '5, 150, 105'};
      
      /* Derived colors with opacity */
      --color-primary-50: rgba(var(--color-primary-rgb), 0.05);
      --color-primary-100: rgba(var(--color-primary-rgb), 0.1);
      --color-primary-200: rgba(var(--color-primary-rgb), 0.2);
      --color-primary-600: var(--color-primary);
      --color-primary-700: rgba(var(--color-primary-rgb), 0.9);
      --color-primary-800: rgba(var(--color-primary-rgb), 0.8);
      
      --color-secondary-50: rgba(var(--color-secondary-rgb), 0.05);
      --color-secondary-100: var(--color-secondary);
      --color-secondary-200: rgba(var(--color-secondary-rgb), 0.8);
      
      --color-accent-50: rgba(var(--color-accent-rgb), 0.05);
      --color-accent-100: rgba(var(--color-accent-rgb), 0.1);
      --color-accent-600: var(--color-accent);
      --color-accent-700: rgba(var(--color-accent-rgb), 0.9);
    }
  `.trim();
}

/**
 * Get CSS custom properties for practice theming (CSP-compliant)
 */
export function getPracticeCSS(colors: BrandColors): string {
  const primaryRgb = hexToRgb(colors.primary);
  const secondaryRgb = hexToRgb(colors.secondary);
  const accentRgb = hexToRgb(colors.accent);
  
  return `
    :root {
      --practice-primary: ${colors.primary};
      --practice-primary-rgb: ${primaryRgb ? `${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}` : '0, 174, 239'};
      --practice-primary-50: ${hexToRgba(colors.primary, 0.05)};
      --practice-primary-100: ${hexToRgba(colors.primary, 0.1)};
      --practice-primary-text: ${colors.primary};
      --practice-primary-border: ${colors.primary};
      
      --practice-secondary: ${colors.secondary};
      --practice-secondary-rgb: ${secondaryRgb ? `${secondaryRgb.r}, ${secondaryRgb.g}, ${secondaryRgb.b}` : '255, 255, 255'};
      --practice-secondary-text: ${colors.secondary};
      
      --practice-accent: ${colors.accent};
      --practice-accent-rgb: ${accentRgb ? `${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}` : '68, 192, 174'};
      --practice-accent-text: ${colors.accent};
      --practice-accent-border: ${colors.accent};
      
      --practice-gradient: linear-gradient(to right, ${colors.primary}, ${colors.accent});
    }
  `.trim();
}

/**
 * Get direct style objects for SSR-compatible rendering (legacy)
 * @deprecated Use getPracticeCSS and CSS classes instead for CSP compliance
 */
export function getColorStyles(colors: BrandColors): import('@/lib/types/practice').ColorStyles {
  return {
    // Primary styles
    primary: {
      backgroundColor: colors.primary,
      color: 'white',
    },
    primaryText: {
      color: colors.primary,
    },
    primaryBorder: {
      borderColor: colors.primary,
      color: colors.primary,
    },
    primaryBg50: {
      backgroundColor: hexToRgba(colors.primary, 0.05),
    },
    primaryBg100: {
      backgroundColor: hexToRgba(colors.primary, 0.1),
    },
    primaryGradient: {
      background: `linear-gradient(to right, ${hexToRgba(colors.primary, 0.05)}, ${hexToRgba(colors.primary, 0.1)})`,
    },
    
    // Secondary styles
    secondary: {
      backgroundColor: colors.secondary,
    },
    secondaryText: {
      color: colors.secondary,
    },
    
    // Accent styles
    accent: {
      backgroundColor: colors.accent,
      color: 'white',
    },
    accentText: {
      color: colors.accent,
    },
    accentBorder: {
      borderColor: colors.accent,
      color: colors.accent,
    },
  };
}
