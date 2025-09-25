'use client'

import type React from 'react'
import { useNonce, useScriptNonce, useStyleNonce } from './nonce-context'

/**
 * Component utilities for CSP nonce integration
 * Provides easy-to-use components for inline scripts and styles with proper nonce handling
 */

/**
 * Safe inline script component with automatic nonce integration
 */
export interface NonceScriptProps {
  children: string
  type?: 'application/json' | 'text/javascript' | 'application/ld+json'
  id?: string
  className?: string
}

export function NonceScript({ children, type = 'application/json', id, className }: NonceScriptProps) {
  const scriptNonce = useScriptNonce()
  
  return (
    <script
      type={type}
      nonce={scriptNonce}
      id={id}
      className={className}
      dangerouslySetInnerHTML={{ __html: children }}
    />
  )
}

/**
 * Safe inline style component with automatic nonce integration
 */
export interface NonceStyleProps {
  children: string
  id?: string
  className?: string
}

export function NonceStyle({ children, id, className }: NonceStyleProps) {
  const styleNonce = useStyleNonce()
  
  return (
    <style
      nonce={styleNonce}
      id={id}
      className={className}
      dangerouslySetInnerHTML={{ __html: children }}
    />
  )
}

/**
 * JSON-LD structured data component with automatic script nonce
 */
export interface JSONLDProps {
  data: object
  id?: string
}

export function JSONLD({ data, id }: JSONLDProps) {
  const scriptNonce = useScriptNonce()
  
  return (
    <script
      type="application/ld+json"
      nonce={scriptNonce}
      id={id}
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}

/**
 * Higher-order component that provides nonce attributes to any element
 */
export interface WithNonceProps {
  element: React.ElementType
  nonceType: 'script' | 'style' | 'both'
  children?: React.ReactNode
  [key: string]: unknown
}

export function WithNonce({ element: Element, nonceType, children, ...props }: WithNonceProps) {
  const nonces = useNonce()
  
  const nonceProps = {
    ...(nonceType === 'script' || nonceType === 'both' ? { 'data-script-nonce': nonces.scriptNonce } : {}),
    ...(nonceType === 'style' || nonceType === 'both' ? { 'data-style-nonce': nonces.styleNonce } : {}),
  }
  
  return (
    <Element {...props} {...nonceProps}>
      {children}
    </Element>
  )
}

/**
 * Hook for getting nonce attributes as data attributes (for debugging)
 */
export function useNonceDataAttributes() {
  const { scriptNonce, styleNonce, timestamp, environment } = useNonce()
  
  return {
    'data-script-nonce': scriptNonce,
    'data-style-nonce': styleNonce, 
    'data-nonce-timestamp': timestamp,
    'data-nonce-environment': environment
  }
}

/**
 * Debug component to display current nonce information
 * Only renders in development mode
 */
export function NonceDebugInfo() {
  const nonces = useNonce()
  
  if (process.env.NODE_ENV !== 'development') {
    return null
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
        zIndex: 9999
      }}
    >
      <div><strong>CSP Nonces Debug</strong></div>
      <div>Script: {nonces.scriptNonce.substring(0, 8)}...</div>
      <div>Style: {nonces.styleNonce.substring(0, 8)}...</div>
      <div>Env: {nonces.environment}</div>
      <div>Time: {new Date(nonces.timestamp).toLocaleTimeString()}</div>
    </div>
  )
}
