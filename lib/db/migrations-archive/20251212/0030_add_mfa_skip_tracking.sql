-- Migration: Add MFA Skip Tracking
-- Description: Implements graceful MFA onboarding with skip tracking
-- Author: Claude
-- Date: 2025-01-13
--
-- Purpose: Allow users to skip MFA setup up to 5 times before enforcement.
-- Security: Maintains fail-closed security posture when skips are exhausted.

-- Add MFA skip tracking columns to account_security table (idempotent)
ALTER TABLE account_security
  ADD COLUMN IF NOT EXISTS mfa_skips_remaining INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS mfa_skip_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mfa_first_skipped_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mfa_last_skipped_at TIMESTAMPTZ;

-- Add index for efficient MFA enforcement queries (idempotent)
-- Only indexes users without MFA who have exhausted skips
CREATE INDEX IF NOT EXISTS idx_account_security_mfa_skips
  ON account_security(mfa_skips_remaining)
  WHERE mfa_enabled = false AND mfa_skips_remaining <= 0;

-- Update existing records to give them 5 skips
-- This maintains backward compatibility for existing users without MFA
UPDATE account_security
SET mfa_skips_remaining = 5
WHERE mfa_enabled = false;

-- Add comments for documentation
COMMENT ON COLUMN account_security.mfa_skips_remaining IS
  'Number of remaining times user can skip MFA setup. Starts at 5, decrements to 0. When 0, MFA setup is mandatory. Fail-closed security.';

COMMENT ON COLUMN account_security.mfa_skip_count IS
  'Total number of times user has skipped MFA setup. Audit trail for security compliance and monitoring.';

COMMENT ON COLUMN account_security.mfa_first_skipped_at IS
  'Timestamp of first MFA skip. Used for tracking onboarding duration and user journey analytics.';

COMMENT ON COLUMN account_security.mfa_last_skipped_at IS
  'Timestamp of most recent MFA skip. Used for security monitoring and re-engagement campaigns.';
