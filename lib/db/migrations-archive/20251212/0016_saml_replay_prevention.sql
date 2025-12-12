-- Migration: SAML Replay Attack Prevention
-- Description: Create table to track used SAML assertions and prevent replay attacks
-- Author: AI Assistant
-- Date: 2025-10-01
-- Security: CRITICAL - Prevents attackers from reusing intercepted SAML responses

-- Create table to track used SAML assertions
-- This table stores assertion IDs to ensure each SAML response can only be used once
-- Replay attacks occur when an attacker intercepts a valid SAML response and tries to reuse it
CREATE TABLE IF NOT EXISTS saml_replay_prevention (
  -- Primary key: assertion_id from SAML response (guaranteed unique by IdP)
  replay_id TEXT PRIMARY KEY,
  
  -- InResponseTo: Links SAML response back to original AuthnRequest
  -- Provides additional validation that response matches our request
  in_response_to TEXT NOT NULL,
  
  -- User context for security monitoring
  user_email TEXT NOT NULL,
  
  -- Timestamp tracking
  used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Expiry for automatic cleanup (set to assertion NotOnOrAfter + safety margin)
  expires_at TIMESTAMPTZ NOT NULL,
  
  -- Security context for audit trail
  ip_address TEXT NOT NULL,
  user_agent TEXT,
  
  -- Session ID for correlation (nullable as assertion might fail before session creation)
  session_id TEXT
);

-- Index for efficient cleanup of expired entries
-- Used by background job to DELETE WHERE expires_at < NOW()
CREATE INDEX IF NOT EXISTS idx_saml_replay_expires_at 
  ON saml_replay_prevention(expires_at);

-- Index for InResponseTo lookups (request/response correlation)
CREATE INDEX IF NOT EXISTS idx_saml_replay_in_response_to 
  ON saml_replay_prevention(in_response_to);

-- Index for user email lookups (security monitoring)
CREATE INDEX IF NOT EXISTS idx_saml_replay_user_email 
  ON saml_replay_prevention(user_email);

-- Add comment to table for documentation
COMMENT ON TABLE saml_replay_prevention IS 'Tracks used SAML assertion IDs to prevent replay attacks. Each SAML response can only be used once. Entries automatically expire based on assertion validity period.';

COMMENT ON COLUMN saml_replay_prevention.replay_id IS 'SAML Assertion ID (unique identifier from IdP). Primary key ensures each assertion can only be used once via database constraint.';

COMMENT ON COLUMN saml_replay_prevention.in_response_to IS 'SAML InResponseTo field - links response to original AuthnRequest for additional validation.';

COMMENT ON COLUMN saml_replay_prevention.expires_at IS 'Expiry timestamp for automatic cleanup. Set to assertion NotOnOrAfter + 1 hour safety margin. Background job periodically deletes expired entries.';

