import { useStyleNonce } from '@/lib/security/nonce-context';
import { type BrandColors, getPracticeCSS } from '@/lib/utils/color-utils';

/**
 * Practice CSS Injector Component
 * Injects practice-specific CSS custom properties for CSP-compliant theming
 * Replaces inline style attributes with CSS custom properties
 */

interface PracticeCSSInjectorProps {
  colors: BrandColors;
  practiceId: string;
}

export function PracticeCSSInjector({ colors, practiceId }: PracticeCSSInjectorProps) {
  const styleNonce = useStyleNonce();
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
 */
export function ServerPracticeCSSInjector({
  colors,
  practiceId,
  nonce,
}: PracticeCSSInjectorProps & { nonce: string }) {
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
