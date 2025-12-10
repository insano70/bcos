# Toast Unification Plan

## Executive Summary

Unify toast functionality into a single enhanced `toast.tsx` file that:
1. Maintains backward compatibility with existing 10+ usages
2. Adds context-based `useToast()` hook for simpler usage
3. Supports visual variants (solid, light, outlined)
4. Includes auto-dismiss and animation features

**Result:** Reduce boilerplate from ~15 lines per component to 1 line, while keeping existing code working.

---

## Current Pain Points

### Boilerplate in Every Component (10+ files)

```tsx
// 1. State declarations (3 lines)
const [showToast, setShowToast] = useState(false);
const [toastMessage, setToastMessage] = useState('');
const [toastType, setToastType] = useState<'success' | 'error'>('success');

// 2. Manual auto-dismiss in handlers (2 lines)
setShowToast(true);
setTimeout(() => setShowToast(false), 2000);

// 3. Toast rendering with manual positioning (6 lines)
<Toast
  type={toastType}
  open={showToast}
  setOpen={setShowToast}
  className="fixed bottom-4 right-4 z-50"
>
  {toastMessage}
</Toast>
```

**Total: ~15 lines repeated in every component**

### After Unification

```tsx
// Just use the hook
const { showToast } = useToast();

// Show toast with one line
showToast({ message: 'Success!', type: 'success' });

// No JSX needed - ToastProvider handles rendering
```

---

## Unified API Design

### Exported from `components/toast.tsx`

```typescript
// ============================================
// TYPES
// ============================================

export type ToastType = 'warning' | 'error' | 'success' | 'info';
export type ToastVariant = 'solid' | 'light' | 'outlined';

export interface ToastProps {
  children: React.ReactNode;
  className?: string;
  type?: ToastType;
  variant?: ToastVariant;
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Auto-dismiss after duration (ms). 0 = no auto-dismiss. Default: 0 */
  duration?: number;
}

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  variant?: ToastVariant;
  duration?: number;
}

export interface ToastContextType {
  toasts: Toast[];
  showToast: (toast: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;
}

// ============================================
// EXPORTS
// ============================================

// Component (backward compatible)
export default function Toast(props: ToastProps): JSX.Element;

// Context-based system
export function ToastProvider({ children }: { children: React.ReactNode }): JSX.Element;
export function useToast(): ToastContextType;

// Container for rendering stacked toasts (used by ToastProvider internally)
export function ToastContainer({ toasts, onDismiss }: ToastContainerProps): JSX.Element;
```

---

## Visual Variants

### Variant: `solid` (default - current toast.tsx behavior)
- Background: `bg-{color}-500`
- Text: `text-white`
- Icon: `opacity-80`
- Use case: High visibility notifications

### Variant: `light` (from toast-02.tsx)
- Background: `bg-{color}-100`
- Text: `text-gray-700`
- Icon: `text-{color}-500`
- Use case: Subtle, less intrusive notifications

### Variant: `outlined` (from toast-03.tsx)
- Background: `bg-white dark:bg-gray-800`
- Border: `border border-gray-200 dark:border-gray-700/60`
- Shadow: `shadow-sm`
- Icon: `text-{color}-500`
- Use case: Modern, dark-mode friendly

---

## Implementation Structure

```typescript
// components/toast.tsx (~200 lines)

'use client';

import { createContext, useCallback, useContext, useState, useEffect } from 'react';
import type { ReactElement } from 'react';

// ============================================
// TYPES
// ============================================

export type ToastType = 'warning' | 'error' | 'success' | 'info';
export type ToastVariant = 'solid' | 'light' | 'outlined';

// ... (type definitions as shown above)

// ============================================
// STYLE CONFIGURATION
// ============================================

const ICONS: Record<ToastType, { path: string }> = {
  warning: { path: 'M8 0C3.6 0 0 3.6...' },
  error: { path: 'M8 0C3.6 0 0 3.6...' },
  success: { path: 'M8 0C3.6 0 0 3.6...' },
  info: { path: 'M8 0C3.6 0 0 3.6...' },
};

const VARIANT_STYLES: Record<ToastVariant, {
  container: string;
  iconClass: string;
  colors: Record<ToastType, string>;
}> = {
  solid: {
    container: 'text-white',
    iconClass: 'opacity-80',
    colors: {
      warning: 'bg-yellow-500',
      error: 'bg-red-500',
      success: 'bg-green-500',
      info: 'bg-violet-500',
    },
  },
  light: {
    container: 'text-gray-700',
    iconClass: '',
    colors: {
      warning: 'bg-yellow-100 text-yellow-500',
      error: 'bg-red-100 text-red-500',
      success: 'bg-green-100 text-green-500',
      info: 'bg-violet-100 text-violet-500',
    },
  },
  outlined: {
    container: 'bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-100',
    iconClass: '',
    colors: {
      warning: 'text-yellow-500',
      error: 'text-red-500',
      success: 'text-green-500',
      info: 'text-violet-500',
    },
  },
};

// ============================================
// ICON COMPONENT
// ============================================

function ToastIcon({ type, variant }: { type: ToastType; variant: ToastVariant }) {
  const styles = VARIANT_STYLES[variant];
  const iconColorClass = variant === 'solid'
    ? styles.iconClass
    : styles.colors[type].split(' ').find(c => c.startsWith('text-')) || '';

  return (
    <svg
      className={`shrink-0 fill-current ${iconColorClass} mt-[3px] mr-3`}
      width="16"
      height="16"
      viewBox="0 0 16 16"
    >
      <path d={ICONS[type].path} />
    </svg>
  );
}

// ============================================
// CLOSE ICON COMPONENT
// ============================================

function CloseIcon() {
  return (
    <svg className="fill-current" width="16" height="16" viewBox="0 0 16 16">
      <path d="M7.95 6.536l4.242-4.243a1 1 0 111.415 1.414L9.364 7.95l4.243 4.242a1 1 0 11-1.415 1.415L7.95 9.364l-4.243 4.243a1 1 0 01-1.414-1.415L6.536 7.95 2.293 3.707a1 1 0 011.414-1.414L7.95 6.536z" />
    </svg>
  );
}

// ============================================
// TOAST COMPONENT (Controlled - Backward Compatible)
// ============================================

export interface ToastProps {
  children: React.ReactNode;
  className?: string;
  type?: ToastType;
  variant?: ToastVariant;
  open: boolean;
  setOpen: (open: boolean) => void;
  duration?: number;
}

export default function Toast({
  children,
  className = '',
  type = 'info',
  variant = 'solid',
  open,
  setOpen,
  duration = 0,
}: ToastProps) {
  // Auto-dismiss effect
  useEffect(() => {
    if (open && duration > 0) {
      const timer = setTimeout(() => setOpen(false), duration);
      return () => clearTimeout(timer);
    }
  }, [open, duration, setOpen]);

  if (!open) return null;

  const styles = VARIANT_STYLES[variant];
  const bgColorClass = variant === 'outlined'
    ? ''
    : styles.colors[type].split(' ').find(c => c.startsWith('bg-')) || '';

  return (
    <div className={className} role="alert">
      <div className={`inline-flex min-w-[20rem] px-4 py-2 rounded-lg text-sm ${bgColorClass} ${styles.container}`}>
        <div className="flex w-full justify-between items-start">
          <div className="flex">
            <ToastIcon type={type} variant={variant} />
            <div className={variant === 'solid' ? 'font-medium' : ''}>{children}</div>
          </div>
          <button
            type="button"
            className="opacity-60 hover:opacity-70 ml-3 mt-[3px]"
            onClick={() => setOpen(false)}
          >
            <span className="sr-only">Close</span>
            <CloseIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// TOAST CONTEXT (New - Programmatic Usage)
// ============================================

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const newToast: Toast = {
        id,
        duration: 5000, // Default 5 seconds
        variant: 'solid', // Default variant
        ...toast,
      };

      setToasts((prev) => [...prev, newToast]);

      // Auto-dismiss
      if (newToast.duration && newToast.duration > 0) {
        setTimeout(() => dismissToast(id), newToast.duration);
      }
    },
    [dismissToast]
  );

  return (
    <ToastContext.Provider value={{ toasts, showToast, dismissToast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}

// ============================================
// TOAST CONTAINER (Stacking & Positioning)
// ============================================

interface ToastContainerProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 space-y-3 max-w-md"
      role="region"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const [isExiting, setIsExiting] = useState(false);
  const variant = toast.variant || 'solid';
  const styles = VARIANT_STYLES[variant];
  const bgColorClass = variant === 'outlined'
    ? ''
    : styles.colors[toast.type].split(' ').find(c => c.startsWith('bg-')) || '';

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(() => onDismiss(toast.id), 300);
  };

  const animationClass = isExiting
    ? 'translate-x-full opacity-0'
    : 'translate-x-0 opacity-100';

  return (
    <div
      className={`inline-flex min-w-[20rem] px-4 py-2 rounded-lg text-sm transform transition-all duration-300 ${animationClass} ${bgColorClass} ${styles.container}`}
      role="alert"
    >
      <div className="flex w-full justify-between items-start">
        <div className="flex">
          <ToastIcon type={toast.type} variant={variant} />
          <div className={variant === 'solid' ? 'font-medium' : ''}>{toast.message}</div>
        </div>
        <button
          type="button"
          className="opacity-60 hover:opacity-70 ml-3 mt-[3px]"
          onClick={handleDismiss}
        >
          <span className="sr-only">Close</span>
          <CloseIcon />
        </button>
      </div>
    </div>
  );
}
```

---

## Migration Path

### Phase 1: Enhance toast.tsx (Non-breaking)

1. Add `variant` prop with default `'solid'` (backward compatible)
2. Add `duration` prop with default `0` (backward compatible)
3. Add `ToastProvider`, `useToast()`, `ToastContainer` exports
4. Update type from `''` to `'info'` internally (map `''` to `'info'` for compatibility)

### Phase 2: Add ToastProvider to App Root

```tsx
// app/layout.tsx or app/(default)/layout.tsx
import { ToastProvider } from '@/components/toast';

export default function Layout({ children }) {
  return (
    <html>
      <body>
        <ToastProvider>
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
```

### Phase 3: Gradual Migration of Existing Components (Optional)

Existing components can be migrated one at a time from:

```tsx
// Before (still works)
const [showToast, setShowToast] = useState(false);
<Toast type="success" open={showToast} setOpen={setShowToast}>
  Success!
</Toast>
```

To:

```tsx
// After (much simpler)
const { showToast } = useToast();
showToast({ message: 'Success!', type: 'success' });
```

**No rush - existing code continues to work.**

### Phase 4: Delete Deprecated Files

After confirming everything works:
- Delete `components/toast-02.tsx`
- Delete `components/toast-03.tsx`
- Delete `components/banner-02.tsx`
- Update component library demos to use variants

---

## Usage Examples

### Controlled Mode (Backward Compatible)

```tsx
// Existing code - no changes needed
<Toast type="success" open={showToast} setOpen={setShowToast}>
  Practice created!
</Toast>

// With new features
<Toast
  type="success"
  variant="light"      // NEW: visual variant
  duration={3000}      // NEW: auto-dismiss
  open={showToast}
  setOpen={setShowToast}
>
  Practice created!
</Toast>
```

### Context Mode (New)

```tsx
// In component
const { showToast } = useToast();

const handleSave = async () => {
  try {
    await save();
    showToast({ message: 'Saved successfully!', type: 'success' });
  } catch (error) {
    showToast({ message: 'Failed to save', type: 'error' });
  }
};

// With variants
showToast({
  message: 'Processing...',
  type: 'info',
  variant: 'outlined',
  duration: 0  // Don't auto-dismiss
});
```

---

## Files Changed

| Action | File |
|--------|------|
| **Modify** | `components/toast.tsx` |
| **Modify** | `app/(default)/layout.tsx` (add ToastProvider) |
| **Delete** | `components/toast-02.tsx` |
| **Delete** | `components/toast-03.tsx` |
| **Delete** | `components/banner-02.tsx` |
| **Modify** | Component library demos (use variants) |
| **Keep** | `app/(default)/admin/command-center/components/toast.tsx` (command center specific) |

---

## Banner Consideration

The `banner.tsx` component is similar but serves a different purpose (full-width page alerts vs popup toasts). Options:

1. **Keep separate**: Banner stays as `banner.tsx`, add `variant` prop
2. **Merge into toast**: Add `fullWidth` prop to Toast

**Recommendation**: Keep banner separate. They're conceptually different:
- Toast = temporary popup notification
- Banner = persistent page-level alert

Add `variant` prop to banner.tsx separately if needed.

---

## Success Criteria

1. All existing Toast usages work without changes
2. `useToast()` hook available for new/migrated code
3. Three visual variants available (solid, light, outlined)
4. Auto-dismiss works in both controlled and context modes
5. `pnpm tsc && pnpm lint` pass
6. Deprecated files deleted
