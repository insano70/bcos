'use client';

import {
  AlertIcon,
  CloseIcon,
  ALERT_VARIANT_STYLES,
  normalizeAlertType,
  type AlertType,
  type AlertVariant,
} from '@/components/ui/alert-shared';

// ============================================
// TYPES
// ============================================

export type BannerType = AlertType;
export type BannerVariant = Exclude<AlertVariant, 'outlined'>;

export interface BannerProps {
  children: React.ReactNode;
  className?: string;
  /** Banner type - determines color scheme. Default: 'info' */
  type?: BannerType | '';
  /** Visual variant - solid (default) or light */
  variant?: BannerVariant;
  /** Whether the banner is visible */
  open: boolean;
  /** Callback to update visibility */
  setOpen: (open: boolean) => void;
}

// ============================================
// BANNER COMPONENT
// ============================================

/**
 * Full-width banner notification component with multiple visual variants.
 *
 * @example
 * // Basic usage (backward compatible)
 * <Banner type="warning" open={showBanner} setOpen={setShowBanner}>
 *   System maintenance scheduled for tonight.
 * </Banner>
 *
 * @example
 * // With light variant
 * <Banner type="info" variant="light" open={showBanner} setOpen={setShowBanner}>
 *   New features available!
 * </Banner>
 */
export default function Banner({
  children,
  className = '',
  type = '',
  variant = 'solid',
  open,
  setOpen,
}: BannerProps) {
  const normalizedType = normalizeAlertType(type);

  if (!open) return null;

  const styles = ALERT_VARIANT_STYLES[variant];
  const bgColorClass = styles.colors[normalizedType];

  return (
    <div className={className} role="alert" aria-live="polite">
      <div className={`px-4 py-2 rounded-lg text-sm ${bgColorClass} ${styles.containerBase}`}>
        <div className="flex w-full justify-between items-start">
          <div className="flex">
            <AlertIcon type={normalizedType} variant={variant} />
            <div className={styles.fontWeight}>{children}</div>
          </div>
          <button
            type="button"
            className="opacity-60 hover:opacity-70 ml-3 mt-[3px]"
            onClick={() => setOpen(false)}
            aria-label="Dismiss banner"
          >
            <CloseIcon />
          </button>
        </div>
      </div>
    </div>
  );
}
