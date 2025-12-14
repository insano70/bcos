'use client';

import type React from 'react';
import { useNonce, useScriptNonce, useStyleNonce } from './nonce-context';

/**
 * Component utilities for CSP nonce integration
 * Provides easy-to-use components for inline scripts and styles with proper nonce handling
 */

/**
 * Safe inline script component with automatic nonce integration
 * SECURITY NOTE: Only use for trusted content like JSON data.
 * For JavaScript code, consider external files with CSP instead.
 */
export interface NonceScriptProps {
  children: string;
  /** Only JSON types are supported for security - executable JavaScript is not allowed */
  type?: 'application/json' | 'application/ld+json';
  id?: string;
  className?: string;
  /**
   * Skip content validation (USE WITH EXTREME CAUTION)
   * Only set to true if you are absolutely certain the content is safe
   */
  skipValidation?: boolean;
}

/**
 * Validates that script content is safe
 * Only allows valid JSON content - executable JavaScript is not supported
 */
function validateScriptContent(content: string, type: string, skipValidation?: boolean): boolean {
  if (skipValidation) {
    return true; // Caller takes responsibility
  }

  if (!content || typeof content !== 'string') {
    return false;
  }

  // Only JSON types are allowed - executable JavaScript is not supported for security
  if (type !== 'application/json' && type !== 'application/ld+json') {
    return false;
  }

  // Validate it's actually valid JSON
  try {
    JSON.parse(content);
    // Additional check for dangerous patterns in JSON values
    const dangerousPatterns = [/<script/i, /javascript:/i, /data:text\/html/i, /vbscript:/i];
    return !dangerousPatterns.some((pattern) => pattern.test(content));
  } catch {
    return false;
  }
}

export function NonceScript({
  children,
  type = 'application/json',
  id,
  className,
  skipValidation,
}: NonceScriptProps) {
  const scriptNonce = useScriptNonce();

  // Validate content safety
  if (!validateScriptContent(children, type, skipValidation)) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('NonceScript: Content failed security validation', {
        type,
        content: children.substring(0, 100),
      });
    }
    return null;
  }

  return (
    <script
      type={type}
      nonce={scriptNonce}
      id={id}
      className={className}
      // SECURITY: This component safely injects inline content protected by CSP nonces.
      // The content is validated by validateScriptContent() above and the nonce is
      // generated per-request in middleware.ts. The browser's CSP engine validates
      // the nonce before executing. See lib/security/headers.ts for CSP configuration.
      // biome-ignore lint/security/noDangerouslySetInnerHtml: CSP nonce protection with content validation
      dangerouslySetInnerHTML={{ __html: children }}
    />
  );
}

/**
 * Safe inline style component with automatic nonce integration
 * Validates CSS content for security risks
 */
export interface NonceStyleProps {
  children: string;
  id?: string;
  className?: string;
  /**
   * Skip CSS validation (USE WITH CAUTION)
   * Only set to true if you are certain the CSS is safe
   */
  skipValidation?: boolean;
}

/**
 * Validates that CSS content is safe from injection attacks
 */
function validateCSSContent(css: string, skipValidation?: boolean): boolean {
  if (skipValidation) {
    return true; // Caller takes responsibility
  }

  if (!css || typeof css !== 'string') {
    return false;
  }

  // Check for dangerous patterns in CSS
  const dangerousCSSPatterns = [
    /javascript:/i,
    /data:text\/html/i,
    /vbscript:/i,
    /@import\s*url\s*\(/i,
    /expression\s*\(/i, // IE CSS expressions
    /behavior\s*:/i, // IE behaviors
    /binding\s*:/i, // Mozilla XBL bindings
    /-moz-binding/i,
    /content\s*:\s*url\s*\(/i, // Dangerous url() in content
    /background.*url\s*\(\s*["']?javascript:/i,
    /list-style.*url\s*\(\s*["']?javascript:/i,
  ];

  // Check for script tag attempts within CSS
  const scriptPatterns = [/<script/i, /<\/script>/i];

  const allDangerousPatterns = [...dangerousCSSPatterns, ...scriptPatterns];

  return !allDangerousPatterns.some((pattern) => pattern.test(css));
}

export function NonceStyle({ children, id, className, skipValidation }: NonceStyleProps) {
  const styleNonce = useStyleNonce();

  // Validate CSS content safety
  if (!validateCSSContent(children, skipValidation)) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('NonceStyle: CSS content failed security validation', {
        content: children.substring(0, 100),
      });
    }
    return null;
  }

  return (
    <style
      nonce={styleNonce}
      id={id}
      className={className}
      // SECURITY: This component safely injects inline CSS protected by CSP nonces.
      // The CSS is validated by validateCSSContent() above and the nonce is generated
      // per-request in middleware.ts. The browser's CSP engine validates the nonce.
      // See lib/security/headers.ts for CSP configuration.
      // biome-ignore lint/security/noDangerouslySetInnerHtml: CSP nonce protection with CSS validation
      dangerouslySetInnerHTML={{ __html: children }}
    />
  );
}

/**
 * JSON-LD structured data component with automatic script nonce
 * Safely handles structured data with input validation
 */
export interface JSONLDProps {
  data: object;
  id?: string;
}

/**
 * Validates that the data object is safe for JSON-LD structured data
 */
function validateJSONLDData(data: unknown): data is Record<string, unknown> {
  if (!data || typeof data !== 'object') {
    return false;
  }

  // Ensure it's a plain object, not a function, Date, etc.
  if (Object.prototype.toString.call(data) !== '[object Object]') {
    return false;
  }

  try {
    // Test that it can be safely stringified
    const jsonString = JSON.stringify(data);
    // Ensure the result doesn't contain script-like patterns
    const dangerousPatterns = [
      /<script/i,
      /javascript:/i,
      /data:text\/html/i,
      /vbscript:/i,
      /onload/i,
      /onerror/i,
    ];

    return !dangerousPatterns.some((pattern) => pattern.test(jsonString));
  } catch {
    return false;
  }
}

export function JSONLD({ data, id }: JSONLDProps) {
  const scriptNonce = useScriptNonce();

  // Validate the data before rendering
  if (!validateJSONLDData(data)) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('JSONLD: Invalid or potentially unsafe data provided', data);
    }
    return null;
  }

  // Safe to stringify validated data
  const jsonContent = JSON.stringify(data, null, 0);

  return (
    <script
      type="application/ld+json"
      nonce={scriptNonce}
      id={id}
      // SECURITY: This component safely injects JSON-LD structured data protected by CSP nonces.
      // The data is validated by validateJSONLDData() above and serialized through JSON.stringify.
      // The nonce is generated per-request in middleware.ts and validated by the browser's CSP.
      // See lib/security/headers.ts for CSP configuration.
      // biome-ignore lint/security/noDangerouslySetInnerHtml: CSP nonce protection with JSON-LD validation
      dangerouslySetInnerHTML={{ __html: jsonContent }}
    />
  );
}

/**
 * Higher-order component that provides nonce attributes to any element
 */
export interface WithNonceProps {
  element: React.ElementType;
  nonceType: 'script' | 'style' | 'both';
  children?: React.ReactNode;
  [key: string]: unknown;
}

export function WithNonce({ element: Element, nonceType, children, ...props }: WithNonceProps) {
  const nonces = useNonce();

  const nonceProps = {
    ...(nonceType === 'script' || nonceType === 'both'
      ? { 'data-script-nonce': nonces.scriptNonce }
      : {}),
    ...(nonceType === 'style' || nonceType === 'both'
      ? { 'data-style-nonce': nonces.styleNonce }
      : {}),
  };

  return (
    <Element {...props} {...nonceProps}>
      {children}
    </Element>
  );
}

/**
 * Hook for getting nonce attributes as data attributes (for debugging)
 */
export function useNonceDataAttributes() {
  const { scriptNonce, styleNonce, timestamp, environment } = useNonce();

  return {
    'data-script-nonce': scriptNonce,
    'data-style-nonce': styleNonce,
    'data-nonce-timestamp': timestamp,
    'data-nonce-environment': environment,
  };
}

/**
 * Debug component to display current nonce information
 * Only renders in development mode
 */
export function NonceDebugInfo() {
  const nonces = useNonce();

  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '10px',
        right: '10px',
        background: 'rgba(0,0,0,0.8)',
        color: 'white',
        padding: '10px',
        fontSize: '12px',
        fontFamily: 'monospace',
        borderRadius: '4px',
        zIndex: 9999,
      }}
    >
      <div>
        <strong>CSP Nonces Debug</strong>
      </div>
      <div>Script: {nonces.scriptNonce.substring(0, 8)}...</div>
      <div>Style: {nonces.styleNonce.substring(0, 8)}...</div>
      <div>Env: {nonces.environment}</div>
      <div>Time: {new Date(nonces.timestamp).toLocaleTimeString()}</div>
    </div>
  );
}
