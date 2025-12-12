-- Migration: CSRF Security Monitoring
-- Description: Create table to track CSRF validation failures for security monitoring and alerting
-- Author: AI Assistant
-- Date: 2025-10-02
-- Security: CRITICAL - Enables threat detection and security monitoring for CSRF attacks

-- Create CSRF failure events table for security monitoring
CREATE TABLE IF NOT EXISTS csrf_failure_events (
  -- Primary key
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Event details
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address VARCHAR(45) NOT NULL,  -- IPv4 or IPv6
  user_agent TEXT NOT NULL,          -- Full user agent string
  pathname VARCHAR(500) NOT NULL,    -- Request path
  reason VARCHAR(200) NOT NULL,      -- Failure reason code
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),

  -- Optional user association
  user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance indexes
-- Primary lookup: Get recent failures by IP (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_csrf_failures_ip_timestamp
  ON csrf_failure_events(ip_address, timestamp DESC);

-- Time-based cleanup: Delete old events efficiently
CREATE INDEX IF NOT EXISTS idx_csrf_failures_timestamp
  ON csrf_failure_events(timestamp DESC);

-- Endpoint analysis: Pattern detection by path
CREATE INDEX IF NOT EXISTS idx_csrf_failures_pathname_timestamp
  ON csrf_failure_events(pathname, timestamp DESC);

-- High-severity filtering: For critical events
CREATE INDEX IF NOT EXISTS idx_csrf_failures_severity_timestamp
  ON csrf_failure_events(severity, timestamp DESC);

-- User tracking: For authenticated failure patterns
CREATE INDEX IF NOT EXISTS idx_csrf_failures_user_id
  ON csrf_failure_events(user_id, timestamp DESC)
  WHERE user_id IS NOT NULL;

-- Alert detection: Composite index for threat detection queries
CREATE INDEX IF NOT EXISTS idx_csrf_failures_alert_detection
  ON csrf_failure_events(ip_address, severity, timestamp DESC);

-- Add comments for documentation
COMMENT ON TABLE csrf_failure_events IS
  'CSRF validation failure events for security monitoring, alerting, and threat detection. Enables pattern analysis and automated alerting for potential attacks.';

COMMENT ON COLUMN csrf_failure_events.ip_address IS
  'Client IP address (normalized for localhost variations). Used for rate limiting and attack pattern detection.';

COMMENT ON COLUMN csrf_failure_events.user_agent IS
  'Complete user agent string for device fingerprinting and threat analysis.';

COMMENT ON COLUMN csrf_failure_events.reason IS
  'Failure reason code (e.g., missing_header_token, anonymous_token_validation_failed, double_submit_validation_failed).';

COMMENT ON COLUMN csrf_failure_events.severity IS
  'Security severity level: low (minor issues), medium (suspicious), high (likely attack), critical (active attack detected).';
