'use client';

import { createContext, useContext } from 'react';

/**
 * CSP Nonce Context
 * Provides access to cryptographically secure nonces for inline scripts and styles
 * Used throughout the application to ensure CSP compliance
 */

export interface NonceContextValue {
  /** Nonce for inline script tags */
  scriptNonce: string;
  /** Nonce for inline style tags */
  styleNonce: string;
  /** Timestamp when nonces were generated (for debugging) */
  timestamp: number;
  /** Environment the nonces were generated for */
  environment: 'development' | 'staging' | 'production';
}

const NonceContext = createContext<NonceContextValue | null>(null);

/**
 * Nonce Provider Component
 * Should be used at the root of the application to provide nonces to all components
 */
export interface NonceProviderProps {
  scriptNonce: string;
  styleNonce: string;
  timestamp: number;
  environment: 'development' | 'staging' | 'production';
  children: React.ReactNode;
}

export function NonceProvider({
  scriptNonce,
  styleNonce,
  timestamp,
  environment,
  children,
}: NonceProviderProps) {
  const value: NonceContextValue = {
    scriptNonce,
    styleNonce,
    timestamp,
    environment,
  };

  return <NonceContext.Provider value={value}>{children}</NonceContext.Provider>;
}

/**
 * Hook to access nonce values in components
 * Throws an error if used outside of NonceProvider
 */
export function useNonce(): NonceContextValue {
  const context = useContext(NonceContext);

  if (!context) {
    throw new Error(
      'useNonce must be used within a NonceProvider. Ensure NonceProvider is rendered in your layout.'
    );
  }

  return context;
}

/**
 * Hook to get script nonce only
 * Convenience hook for components that only need script nonce
 */
export function useScriptNonce(): string {
  const { scriptNonce } = useNonce();
  return scriptNonce;
}

/**
 * Hook to get style nonce only
 * Convenience hook for components that only need style nonce
 */
export function useStyleNonce(): string {
  const { styleNonce } = useNonce();
  return styleNonce;
}

/**
 * Utility to create nonce attributes for JSX
 * Returns an object that can be spread into element props
 */
export function useNonceAttributes(): {
  scriptNonceAttr: { nonce: string };
  styleNonceAttr: { nonce: string };
} {
  const { scriptNonce, styleNonce } = useNonce();

  return {
    scriptNonceAttr: { nonce: scriptNonce },
    styleNonceAttr: { nonce: styleNonce },
  };
}

/**
 * Server-side utility to safely access nonces
 * Returns null if context is not available (for SSR safety)
 * Follows React hooks rules by calling useContext unconditionally
 */
export function useNonceSafe(): NonceContextValue | null {
  const context = useContext(NonceContext);

  // Return null if context is not available (e.g., during SSR or outside provider)
  if (!context) {
    return null;
  }

  return context;
}
