import { useStyleNonce } from '@/lib/security/nonce-context';
import { type BrandColors, getPracticeCSS } from '@/lib/utils/color-utils';
import { validateCSSColor } from '@/lib/validations/css-validation';

/**
 * Practice CSS Injector Component
 * Injects practice-specific CSS custom properties for CSP-compliant theming
 * Replaces inline style attributes with CSS custom properties
 *
 * SECURITY: Validates all color inputs to prevent CSS injection attacks
 */

interface PracticeCSSInjectorProps {
  colors: BrandColors;
  practiceId: string;
}

export function PracticeCSSInjector({ colors, practiceId }: PracticeCSSInjectorProps) {
  const styleNonce = useStyleNonce();

  // ✅ SECURITY: Validate all colors before injection
  const invalidColors: string[] = [];

  if (colors.primary && !validateCSSColor(colors.primary)) {
    invalidColors.push(`primary: ${colors.primary}`);
  }
  if (colors.secondary && !validateCSSColor(colors.secondary)) {
    invalidColors.push(`secondary: ${colors.secondary}`);
  }
  if (colors.accent && !validateCSSColor(colors.accent)) {
    invalidColors.push(`accent: ${colors.accent}`);
  }

  // Block injection if any color is invalid
  if (invalidColors.length > 0) {
    // Client-side logging for security events
    console.error('[SECURITY] Invalid CSS colors detected - blocking injection', {
      operation: 'practice_css_injection',
      practiceId,
      invalidColors,
      colors,
      threat: 'css_injection_attempt',
    });
    return null; // Block injection entirely
  }

  const practiceCSS = getPracticeCSS(colors);

  return (
    <style
      nonce={styleNonce}
      data-practice-id={practiceId}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: CSS custom properties generated from validated hex color inputs
      dangerouslySetInnerHTML={{ __html: practiceCSS }}
    />
  );
}

/**
 * Server-side CSS injection for practice theming
 * For use in SSR contexts where nonce context might not be available
 *
 * SECURITY: Validates all color inputs to prevent CSS injection attacks
 */
export function ServerPracticeCSSInjector({
  colors,
  practiceId,
  nonce,
}: PracticeCSSInjectorProps & { nonce: string }) {
  // ✅ SECURITY: Validate all colors before injection
  const invalidColors: string[] = [];

  if (colors.primary && !validateCSSColor(colors.primary)) {
    invalidColors.push(`primary: ${colors.primary}`);
  }
  if (colors.secondary && !validateCSSColor(colors.secondary)) {
    invalidColors.push(`secondary: ${colors.secondary}`);
  }
  if (colors.accent && !validateCSSColor(colors.accent)) {
    invalidColors.push(`accent: ${colors.accent}`);
  }

  // Block injection if any color is invalid
  if (invalidColors.length > 0) {
    // Server-side logging for security events
    console.error('[SECURITY] Invalid CSS colors detected - blocking SSR injection', {
      operation: 'practice_css_injection_ssr',
      practiceId,
      invalidColors,
      colors,
      threat: 'css_injection_attempt',
    });
    return null; // Block injection entirely
  }

  const practiceCSS = getPracticeCSS(colors);

  return (
    <style
      nonce={nonce}
      data-practice-id={practiceId}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: CSS custom properties generated from validated hex color inputs
      dangerouslySetInnerHTML={{ __html: practiceCSS }}
    />
  );
}
