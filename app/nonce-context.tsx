'use client';

import { createContext, useContext } from 'react';

// Extend Window interface to include CSP nonce
declare global {
  interface Window {
    __CSP_NONCE__?: string;
  }
}

const NonceContext = createContext<string>('');

export function NonceProvider({ children, nonce }: { children: React.ReactNode; nonce: string }) {
  return <NonceContext.Provider value={nonce}>{children}</NonceContext.Provider>;
}

/**
 * Hook to access the CSP nonce in client components
 * @returns The CSP nonce string for use in inline styles and scripts
 */
export const useNonce = () => {
  const nonce = useContext(NonceContext);

  // Fallback for client-side access when context isn't available
  if (!nonce && typeof window !== 'undefined') {
    return window.__CSP_NONCE__ || '';
  }

  return nonce;
};

/**
 * Higher-order component to automatically add nonce to style props
 * Use this for components that need inline styles with CSP compliance
 */
export function withNonce<P extends { style?: React.CSSProperties }>(
  Component: React.ComponentType<P>
) {
  return function NonceWrappedComponent(props: P) {
    const nonce = useNonce();

    // Add nonce to any element that has inline styles
    const enhancedProps = {
      ...props,
      ...(props.style && nonce ? { nonce } : {}),
    } as P & { nonce?: string };

    return <Component {...enhancedProps} />;
  };
}
