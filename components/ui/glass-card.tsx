import { cn } from '@/lib/utils';

/**
 * GlassCard Component
 *
 * Modern glassmorphism card with backdrop blur effect
 * Works beautifully in both light and dark modes
 *
 * Usage:
 * ```tsx
 * <GlassCard className="p-6">
 *   <h2>Chart Title</h2>
 *   <Chart data={data} />
 * </GlassCard>
 * ```
 */

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
}

export function GlassCard({ children, className }: GlassCardProps) {
  return (
    <div
      className={cn(
        // Base glassmorphism effect with stronger blur
        'relative backdrop-blur-2xl backdrop-saturate-150',
        'bg-white/80 dark:bg-gray-800/80',

        // Enhanced borders and shadows for more depth
        'border border-white/30 dark:border-gray-600/30',
        'rounded-2xl shadow-2xl shadow-slate-900/10 dark:shadow-black/40',

        // Stronger gradient overlay for depth
        'before:absolute before:inset-0 before:rounded-2xl',
        'before:bg-gradient-to-br before:from-white/60 before:via-white/20 before:to-transparent',
        'dark:before:from-white/10 dark:before:via-white/5 dark:before:to-transparent',
        'before:pointer-events-none',

        // Subtle inner glow
        'after:absolute after:inset-[1px] after:rounded-2xl',
        'after:bg-gradient-to-b after:from-white/20 after:to-transparent',
        'dark:after:from-white/5 dark:after:to-transparent',
        'after:pointer-events-none',

        // Ensure content is above the overlays
        '[&>*]:relative [&>*]:z-10',

        className
      )}
    >
      {children}
    </div>
  );
}
